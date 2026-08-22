/**
 * agent-watchlist — Supabase Edge Function
 *
 * Returns every Stellar public key the Railway monitor should watch for
 * incoming USDC payments — one per user who has finished wallet setup.
 * The monitor polls this on an interval instead of being pinned to a single
 * WATCHED_ACCOUNT, so one deployed process covers every Propulsor user.
 *
 * Authenticated with the same shared secret as agent-webhook
 * (AGENT_WEBHOOK_SECRET) — no need for a second secret.
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
    // ── Verify shared secret ────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const secret = Deno.env.get("AGENT_WEBHOOK_SECRET") ?? "";

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await adminSupabase
      .from("users_profile")
      .select("stellar_public_key")
      .not("stellar_public_key", "is", null);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accounts = (data ?? [])
      .map((row) => row.stellar_public_key as string | null)
      .filter((key): key is string => Boolean(key));

    return new Response(JSON.stringify({ accounts }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-watchlist] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
