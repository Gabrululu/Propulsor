/**
 * agent-proxy — Supabase Edge Function
 *
 * Proxies split requests from the React frontend to the Propulsor agent server.
 * Keeps AGENT_SERVER_URL and INTERNAL_API_KEY server-side.
 *
 * After a successful split, writes the result to the `transactions` table
 * so the frontend realtime subscription picks it up immediately.
 *
 * Required Supabase secrets (set via `supabase secrets set`):
 *   AGENT_SERVER_URL       — deployed agent URL (e.g. https://propulsor-agent.railway.app)
 *   INTERNAL_API_KEY       — shared secret matching server INTERNAL_API_KEY
 *   SUPABASE_SERVICE_ROLE_KEY — for writing to transactions without RLS
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
    // ── Verify Supabase user auth ──────────────────────────────────────────
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request body ─────────────────────────────────────────────────
    const { userPublicKey, incomeAmount } = await req.json() as {
      userPublicKey?: string;
      incomeAmount?: number;
    };

    if (!userPublicKey || typeof incomeAmount !== "number" || incomeAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "userPublicKey and incomeAmount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Forward to agent server ────────────────────────────────────────────
    const AGENT_SERVER_URL = Deno.env.get("AGENT_SERVER_URL") ?? "";
    const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") ?? "";

    if (!AGENT_SERVER_URL || !INTERNAL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Agent server not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const agentRes = await fetch(`${AGENT_SERVER_URL}/split`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INTERNAL_API_KEY}`,
      },
      body: JSON.stringify({ userPublicKey, incomeAmount }),
    });

    const result = await agentRes.json() as {
      success: boolean;
      txHash?: string;
      vaultBreakdown?: Array<{ vaultId: number; balance: string }>;
      error?: string;
    };

    // ── Write to transactions table on success ─────────────────────────────
    if (result.success && result.txHash && result.vaultBreakdown) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const vaultDesc = result.vaultBreakdown
        .map((v) => `vault_${v.vaultId}: $${(Number(v.balance) / 10_000_000).toFixed(2)}`)
        .join(" · ");

      await adminSupabase.from("transactions").insert({
        user_id: user.id,
        type: "split",
        amount_usdc: incomeAmount / 10_000_000,
        stellar_tx_hash: result.txHash,
        status: "confirmed",
        description: `🤖 Agent split · ${vaultDesc}`,
      });
    }

    return new Response(JSON.stringify(result), {
      status: agentRes.ok ? 200 : agentRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-proxy] Error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
