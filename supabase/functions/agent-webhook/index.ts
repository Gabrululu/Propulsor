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
    const body = await req.json() as {
      user_id: string;
      event_type: string;
      amount_usdc?: number;
      tx_hash?: string;
      vault_breakdown?: Record<string, number>;
      blend_tx_hash?: string;
      blend_success?: boolean;
      error_message?: string;
      watched_account?: string;
    };

    if (!body.user_id || !body.event_type) {
      return new Response(
        JSON.stringify({ error: "user_id and event_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Insert activity ────────────────────────────────────────
    await adminSupabase.from("agent_activity").insert({
      user_id: body.user_id,
      event_type: body.event_type,
      amount_usdc: body.amount_usdc ?? null,
      tx_hash: body.tx_hash ?? null,
      vault_breakdown: body.vault_breakdown ?? null,
      blend_tx_hash: body.blend_tx_hash ?? null,
      blend_success: body.blend_success ?? false,
      error_message: body.error_message ?? null,
    });

    // ── Upsert agent_status ────────────────────────────────────
    const statusUpdate: Record<string, unknown> = {
      user_id: body.user_id,
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

    // Upsert: insert or update on conflict
    const { error: upsertError } = await adminSupabase
      .from("agent_status")
      .upsert(statusUpdate, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[agent-webhook] Upsert error:", upsertError.message);
    }

    // Increment total_splits if split event
    if (body.event_type === "split_executed") {
      // Read current, increment, write
      const { data: current } = await adminSupabase
        .from("agent_status")
        .select("total_splits, total_yield_usdc")
        .eq("user_id", body.user_id)
        .single();

      if (current) {
        const updates: Record<string, unknown> = {
          total_splits: (current.total_splits ?? 0) + 1,
        };
        if (body.blend_success && body.amount_usdc) {
          // vault_2 is typically 10% of split
          const vaultBreakdown = body.vault_breakdown as Record<string, number> | undefined;
          const yieldAmount = vaultBreakdown?.vault_2 ?? (body.amount_usdc * 0.1);
          updates.total_yield_usdc = (Number(current.total_yield_usdc) ?? 0) + yieldAmount;
        }
        await adminSupabase
          .from("agent_status")
          .update(updates)
          .eq("user_id", body.user_id);
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
