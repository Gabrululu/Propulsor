/**
 * supabase.ts — Supabase client for the Propulsor agent (Node.js)
 *
 * Uses the service role key so the agent can write to the transactions
 * table without RLS interference. Optional — only active if both
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in the environment.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/**
 * Supabase admin client.
 * `null` when env vars are not configured — callers must check before use.
 */
export const agentSupabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

/**
 * Writes a completed auto-split to the Supabase transactions table.
 * Looks up the user by their Stellar public key (stellar_public_key column).
 * Silently skips if Supabase is not configured or the user is not found.
 */
export async function recordAgentSplit(params: {
  watchedAccount: string;
  incomeAmount: number;   // stroops
  txHash: string;
  vaultBreakdown: Array<{ vaultId: number; balance: string }>;
}): Promise<void> {
  if (!agentSupabase) return;

  try {
    // Resolve stellar public key → user_id
    const { data: profile } = await agentSupabase
      .from('users_profile')
      .select('id')
      .eq('stellar_public_key', params.watchedAccount)
      .single();

    if (!profile) return; // user not found — skip

    const vaultDesc = params.vaultBreakdown
      .map(v => `vault_${v.vaultId}: $${(Number(v.balance) / 10_000_000).toFixed(2)}`)
      .join(' · ');

    await agentSupabase.from('transactions').insert({
      user_id: profile.id,
      type: 'split',
      amount_usdc: params.incomeAmount / 10_000_000,
      stellar_tx_hash: params.txHash,
      status: 'confirmed',
      description: `🤖 Auto-split · ${vaultDesc}`,
    });
  } catch (err) {
    // Non-critical — log and continue
    console.error(
      '[supabase] Error recording split:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
