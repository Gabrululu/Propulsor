/**
 * wallet-key — Supabase Edge Function
 *
 * Returns the passphrase that encrypts the signed-in user's social-login
 * Stellar key: HMAC-SHA256(WALLET_KEY_SECRET, user id). The encrypted key lives
 * in users_profile, so without this secret a copy of the database can't decrypt
 * it, as it could when the passphrase was the user id alone.
 *
 * Required Supabase secret (changing it makes existing social keys unreadable):
 *   WALLET_KEY_SECRET — e.g. `openssl rand -base64 48`
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const secret = Deno.env.get("WALLET_KEY_SECRET");
    if (!secret) return json({ error: "WALLET_KEY_SECRET is not configured" }, 503);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(user.id));
    const passphrase = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return json({ passphrase }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[wallet-key] Error:", message);
    return json({ error: message }, 500);
  }
});
