/**
 * zk-fetch-user-data — Supabase Edge Function
 *
 * Returns one user's split history (from the SplitProtocol contract) for the RISC Zero
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
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "npm:@stellar/stellar-sdk@17.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RPC_URL = Deno.env.get("SOROBAN_RPC_URL") ?? "https://soroban-testnet.stellar.org";
const SPLIT_CONTRACT_ID = "CAZGYZEJJJ2GQMVEX4MKJ633JNCMGC5WH4P2P6PEXQBMH2VYX5Q2G3BI";
const STROOPS_PER_USDC = 10_000_000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The last 12 months of the account's splits, read from the SplitProtocol
 * contract: only the account or an agent it authorized can add to this record,
 * and anyone can check it by calling get_split_history. Throws if unreadable,
 * so a network failure can't be mistaken for "this user never saved".
 */
async function readSplitHistory(publicKey: string) {
  const tx = new TransactionBuilder(new Account(publicKey, "0"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(SPLIT_CONTRACT_ID).call("get_split_history", new Address(publicKey).toScVal()),
    )
    .setTimeout(30)
    .build();

  const sim = await new rpc.Server(RPC_URL).simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) {
    throw new Error("Could not read split history from the contract");
  }

  const history = scValToNative(sim.result.retval) as Array<{ timestamp: bigint; income: bigint }>;
  const cutoff = Date.now() - ONE_YEAR_MS;
  return history
    .map((split) => ({
      created_at: new Date(Number(split.timestamp) * 1000).toISOString(),
      amount_usdc: Number(split.income) / STROOPS_PER_USDC,
    }))
    .filter((split) => new Date(split.created_at).getTime() >= cutoff);
}

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

    const { data: profile, error } = await adminSupabase
      .from("users_profile")
      .select("stellar_public_key")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const splits = profile?.stellar_public_key
      ? await readSplitHistory(profile.stellar_public_key)
      : [];

    return new Response(JSON.stringify(splits), {
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
