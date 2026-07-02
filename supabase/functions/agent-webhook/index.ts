/**
 * agent-webhook — Supabase Edge Function
 *
 * Receives POST events from the Railway agent monitor.
 * Authenticated with a shared secret (AGENT_WEBHOOK_SECRET).
 *
 * Inserts into agent_activity and updates agent_status.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Verify webhook secret ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const secret = Deno.env.get("AGENT_WEBHOOK_SECRET") ?? "";

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ─────────────────────────────────────────────
    // user_id is resolved server-side from watched_account when omitted —
    // the Railway agent has no service_role access and can't query it itself.
    const body = await req.json() as {
      user_id?: string;
      watched_account?: string;
      event_type: string;
      amount_usdc?: number;
      tx_hash?: string;
      vault_breakdown?: Record<string, number>;
      blend_tx_hash?: string;
      blend_success?: boolean;
      error_message?: string;
    };

    const VALID_EVENT_TYPES = ["split_executed", "agent_error", "agent_started", "blend_deposited"];

    if ((!body.user_id && !body.watched_account) || !body.event_type) {
      return new Response(
        JSON.stringify({ error: "user_id or watched_account, and event_type, are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!VALID_EVENT_TYPES.includes(body.event_type)) {
      return new Response(
        JSON.stringify({ error: `Unknown event_type: ${body.event_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Resolve user_id from watched_account if not given directly ──
    let userId = body.user_id ?? null;
    if (!userId && body.watched_account) {
      const { data: profile } = await adminSupabase
        .from("users_profile")
        .select("id")
        .eq("stellar_public_key", body.watched_account)
        .single();
      userId = profile?.id ?? null;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve user_id from watched_account" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Insert activity ────────────────────────────────────────
    await adminSupabase.from("agent_activity").insert({
      user_id: userId,
      event_type: body.event_type,
      amount_usdc: body.amount_usdc ?? null,
      tx_hash: body.tx_hash ?? null,
      vault_breakdown: body.vault_breakdown ?? null,
      blend_tx_hash: body.blend_tx_hash ?? null,
      blend_success: body.blend_success ?? false,
      error_message: body.error_message ?? null,
    });

    // ── Record the split in the user's transaction history ──────
    if (body.event_type === "split_executed" && body.tx_hash) {
      const vaultDesc = Object.entries(body.vault_breakdown ?? {})
        .map(([vaultKey, amount]) => `${vaultKey}: $${Number(amount).toFixed(2)}`)
        .join(" · ");

      await adminSupabase.from("transactions").insert({
        user_id: userId,
        type: "split",
        amount_usdc: body.amount_usdc ?? null,
        stellar_tx_hash: body.tx_hash,
        status: "confirmed",
        description: `🤖 Auto-split · ${vaultDesc}`,
      });
    }

    // ── Upsert agent_status ────────────────────────────────────
    const statusUpdate: Record<string, unknown> = {
      user_id: userId,
      is_active: true,
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (body.watched_account) {
      statusUpdate.watched_account = body.watched_account;
    }

    if (body.event_type === "split_executed") {
      statusUpdate.last_split_at = new Date().toISOString();
    }

    if (body.event_type === "agent_error") {
      statusUpdate.is_active = false;
    }

    // Upsert: insert or update on conflict
    const { error: upsertError } = await adminSupabase
      .from("agent_status")
      .upsert(statusUpdate, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[agent-webhook] Upsert error:", upsertError.message);
    }

    // Increment total_splits (on split_executed) and/or total_yield_usdc
    // (on a successful blend_deposited — the amount deposited to vault_2).
    if (body.event_type === "split_executed" || (body.event_type === "blend_deposited" && body.blend_success)) {
      const { data: current } = await adminSupabase
        .from("agent_status")
        .select("total_splits, total_yield_usdc")
        .eq("user_id", userId)
        .single();

      if (current) {
        const updates: Record<string, unknown> = {};
        if (body.event_type === "split_executed") {
          updates.total_splits = (current.total_splits ?? 0) + 1;
        }
        if (body.event_type === "blend_deposited" && body.amount_usdc) {
          updates.total_yield_usdc = (Number(current.total_yield_usdc) ?? 0) + body.amount_usdc;
        }
        await adminSupabase
          .from("agent_status")
          .update(updates)
          .eq("user_id", userId);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-webhook] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
