/**
 * supabase.ts — Notifies the `agent-webhook` Supabase Edge Function.
 *
 * The Railway agent process has no service_role key (Lovable Cloud does not
 * expose it outside its own Edge Functions), so it never talks to the
 * database directly. It only calls `agent-webhook` over HTTPS with a shared
 * secret; the Edge Function resolves the user and does the actual writes
 * (agent_activity, agent_status, transactions) using its auto-injected
 * SUPABASE_SERVICE_ROLE_KEY.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const AGENT_WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET ?? '';

export type AgentWebhookEventType =
  | 'agent_started'
  | 'split_executed'
  | 'blend_deposited'
  | 'agent_error';

export interface AgentWebhookEvent {
  /** Stellar public key the monitor watches — resolved to a users_profile.id server-side */
  watchedAccount: string;
  eventType: AgentWebhookEventType;
  amountUsdc?: number;
  txHash?: string;
  /** Per-vault USDC amounts, keyed as "vault_0" / "vault_1" / "vault_2" */
  vaultBreakdown?: Record<string, number>;
  blendTxHash?: string;
  blendSuccess?: boolean;
  errorMessage?: string;
}

/**
 * Notifies the `agent-webhook` Supabase Edge Function so the dashboard's
 * Agent status card (agent_status / agent_activity tables) and transaction
 * history reflect live activity. Best-effort — never throws; silently skips
 * if SUPABASE_URL or AGENT_WEBHOOK_SECRET are not configured.
 */
export async function notifyAgentWebhook(event: AgentWebhookEvent): Promise<void> {
  if (!SUPABASE_URL || !AGENT_WEBHOOK_SECRET) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AGENT_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        watched_account: event.watchedAccount,
        event_type: event.eventType,
        amount_usdc: event.amountUsdc,
        tx_hash: event.txHash,
        vault_breakdown: event.vaultBreakdown,
        blend_tx_hash: event.blendTxHash,
        blend_success: event.blendSuccess,
        error_message: event.errorMessage,
      }),
    });

    if (!res.ok) {
      console.error('[agent-webhook] Notify failed:', res.status, await res.text());
    }
  } catch (err) {
    // Non-critical — log and continue
    console.error(
      '[agent-webhook] Notify error:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
