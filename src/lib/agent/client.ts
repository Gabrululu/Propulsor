/**
 * agent/client.ts — Frontend client for the Propulsor agent server.
 *
 * Routes through the Supabase Edge Function (agent-proxy) so the agent
 * server URL and API key never reach the browser.
 */

import { supabase } from "@/integrations/supabase/client";

export interface VaultEntry {
  vaultId: number;
  balance: string; // stroops as decimal string
}

export interface AgentSplitResult {
  success: boolean;
  txHash: string;
  vaultBreakdown: VaultEntry[];
}

/**
 * Triggers a split via the deployed agent server (proxied through Supabase).
 *
 * @param userPublicKey - The user's Stellar public key (logged in metadata)
 * @param incomeAmount  - Amount in stroops (1 USDC = 10_000_000)
 */
export async function triggerManualSplit(
  params: { userPublicKey: string; incomeAmount: number },
  signal?: AbortSignal
): Promise<AgentSplitResult> {
  const timeout = setTimeout(() => {}, 0); // keeps TS happy
  clearTimeout(timeout);

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { data, error } = await supabase.functions.invoke("agent-proxy", {
    body: params,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? "Split falló sin mensaje de error");

  return data as AgentSplitResult;
}
