/**
 * blend-faucet — Supabase Edge Function
 *
 * Relays Blend's testnet faucet, which only answers browsers on
 * testnet.blend.capital. It returns a transaction signed by Blend's issuer that
 * adds trustlines and sends test USDC, BLND, wETH and wBTC to `address`. The
 * user co-signs it in the app, which first checks what it does
 * (assertSafeFaucetTransaction in src/lib/stellar/yield.ts).
 *
 * Requires a signed-in user, so it can't be used as an open relay. No secrets.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FAUCET_URL = "https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets";
const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const address = typeof body?.address === "string" ? body.address : "";
    if (!STELLAR_ACCOUNT.test(address)) return json({ error: "Invalid address" }, 400);

    const response = await fetch(`${FAUCET_URL}?userId=${address}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return json({ error: "Faucet unavailable" }, 502);
    // The faucet answers with a JSON string holding the transaction envelope
    const text = await response.text();
    let xdr: unknown = text;
    try {
      xdr = JSON.parse(text);
    } catch {
      // Plain text body
    }
    if (typeof xdr !== "string" || !/^[A-Za-z0-9+/=]+$/.test(xdr)) {
      return json({ error: "Faucet unavailable" }, 502);
    }
    return json({ xdr }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blend-faucet] Error:", message);
    return json({ error: "Faucet unavailable" }, 502);
  }
});
