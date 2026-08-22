/**
 * zk-fetch-user-data — Supabase Edge Function
 *
 * Returns one user's split history (from agent_activity) for the RISC Zero
 * host to consume when generating a Proof-of-Consistent-Saving.
 *
 * The GitHub Actions runner has no service_role access (Lovable Cloud only
 * injects that key inside Edge Functions, never exposes it for external
 * secrets) — same constraint the Railway agent already works around via
 * agent-webhook/agent-watchlist. This function is that same pattern applied
 * to the one read the RISC Zero host needs, scoped to exactly the fields the
 * guest circuit consumes (created_at, amount_usdc) — nothing else about the
 * user is exposed.
 *
 * Authenticated with the same shared secret as agent-webhook/agent-watchlist
 * would use for this purpose — here, ZK_WEBHOOK_SECRET.
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const secret = Deno.env.get("ZK_WEBHOOK_SECRET") ?? "";

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = new URL(req.url).searchParams.get("user_id");
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id query param is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await adminSupabase
      .from("agent_activity")
      .select("created_at, amount_usdc")
      .eq("user_id", userId)
      .eq("event_type", "split_executed")
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[zk-fetch-user-data] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
