/**
 * zk-fetch-user-data — Supabase Edge Function
 *
 * Returns one user's Stellar account and split history (from the SplitProtocol
 * contract) for the RISC Zero host to consume when generating a Proof-of-Consistent-Saving.
 *
 * The GitHub Actions runner has no service_role access (Lovable Cloud only
 * injects that key inside Edge Functions, never exposes it for external
 * secrets) — same constraint the Railway agent already works around via
 * agent-webhook/agent-watchlist. This function is that same pattern applied
 * to the one read the RISC Zero host needs.
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
  hash,
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
const SPLIT_CONTRACT_ID = "CDGPRA63HQC75LNH6KRUSQPLRZPERTNSBVY3I4UEAKCPHEXHDYEMKEPT";

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * What the RISC Zero guest needs about an account, read from SplitProtocol. The
 * verifier contract recomputes both hashes from the chain, so this function
 * can't make a false proof pass. Throws if the contract can't be read, so a
 * network failure can't be mistaken for "this user never saved".
 */
async function readUserData(publicKey: string) {
  const address = new Address(publicKey).toScVal();
  const tx = new TransactionBuilder(new Account(publicKey, "0"), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(SPLIT_CONTRACT_ID).call("get_split_history", address))
    .setTimeout(30)
    .build();

  const sim = await new rpc.Server(RPC_URL).simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) {
    throw new Error("Could not read split history from the contract");
  }

  const records = scValToNative(sim.result.retval) as Array<{ timestamp: bigint; income: bigint }>;
  const history = records
    .map(({ timestamp, income }) =>
      timestamp.toString(16).padStart(16, "0") + income.toString(16).padStart(32, "0")
    )
    .join("");

  return {
    public_key: publicKey,
    user_hash: toHex(hash(address.toXDR())),
    history,
  };
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

    if (!profile?.stellar_public_key) {
      return new Response(JSON.stringify({ error: "No Stellar account for this user" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(await readUserData(profile.stellar_public_key)), {
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
