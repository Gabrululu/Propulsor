/**
 * request-consistent-saving-proof — Supabase Edge Function
 *
 * Called by the frontend to kick off Proof-of-Consistent-Saving generation.
 * Generation can't run in the browser or on Railway (RISC Zero's Groth16
 * step needs Docker, which Railway blocks) — so this creates a `zk_proof_jobs`
 * row and dispatches a GitHub Actions workflow to do the actual work on a
 * `ubuntu-latest` runner (which has Docker). The workflow reports back via
 * the zk-proof-webhook function.
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
    // ── Verify the caller's Supabase session ────────────────────────────
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
    const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? ""; // "owner/repo"
    const GITHUB_WORKFLOW_FILE =
      Deno.env.get("GITHUB_WORKFLOW_FILE") ?? "generate-consistent-saving-proof.yml";

    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return new Response(
        JSON.stringify({ error: "GITHUB_TOKEN and GITHUB_REPO must be configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Create the job row first — the workflow needs its id to report back ──
    const { data: job, error: insertError } = await adminSupabase
      .from("zk_proof_jobs")
      .insert({ user_id: user.id, proof_type: "consistent_saving", status: "queued" })
      .select("id")
      .single();

    if (insertError || !job) {
      return new Response(JSON.stringify({ error: insertError?.message ?? "Failed to create job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Dispatch the GitHub Actions workflow ─────────────────────────────
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { user_id: user.id, job_id: job.id },
        }),
      },
    );

    if (!dispatchRes.ok) {
      const body = await dispatchRes.text().catch(() => "");
      await adminSupabase
        .from("zk_proof_jobs")
        .update({ status: "error", error_message: `GitHub dispatch failed (HTTP ${dispatchRes.status}): ${body}` })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ error: `No se pudo iniciar la generación de la prueba (HTTP ${dispatchRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ job_id: job.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[request-consistent-saving-proof] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
