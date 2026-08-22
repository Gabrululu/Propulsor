/**
 * zk-proof-webhook — Supabase Edge Function
 *
 * Receives the result of a Proof-of-Consistent-Saving generation run from
 * the GitHub Actions workflow (.github/workflows/generate-consistent-saving-proof.yml)
 * and updates the corresponding zk_proof_jobs row so the dashboard updates live.
 *
 * Authenticated with a shared secret (ZK_WEBHOOK_SECRET) — separate from
 * AGENT_WEBHOOK_SECRET so revoking one doesn't affect the other integration.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_STATUSES = ["done", "not_qualified", "error"];

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

    const body = await req.json() as {
      job_id?: string;
      status?: string;
      months_with_saving?: number;
      threshold_months?: number;
      proof_hash?: string;
      tx_hash?: string;
      error_message?: string;
    };

    if (!body.job_id || !body.status || !VALID_STATUSES.includes(body.status)) {
      return new Response(
        JSON.stringify({ error: "job_id and a valid status (done|not_qualified|error) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await adminSupabase
      .from("zk_proof_jobs")
      .update({
        status: body.status,
        months_with_saving: body.months_with_saving ?? null,
        threshold_months: body.threshold_months ?? null,
        proof_hash: body.proof_hash ?? null,
        tx_hash: body.tx_hash ?? null,
        error_message: body.error_message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.job_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[zk-proof-webhook] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
