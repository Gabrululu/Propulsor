/**
 * monitor.ts — Autonomous agent for Propulsor
 *
 * Watches Stellar Testnet for incoming USDC payments to *any* Propulsor
 * user's account, and when one arrives, asks the agent server to split it for
 * users who authorized the agent, and logs the on-chain vault breakdown.
 *
 * This is a single process that serves every user: it opens one global
 * Horizon payment stream (not scoped to one account) and filters incoming
 * payments against a watchlist of Stellar public keys fetched from Supabase
 * (via the agent-watchlist Edge Function) and refreshed on an interval, so
 * a newly onboarded user is picked up automatically without redeploying.
 *
 * Usage:
 *   INTERNAL_API_KEY=... AGENT_SERVER_URL=... SUPABASE_URL=... AGENT_WEBHOOK_SECRET=... pnpm run monitor
 */

import { EventSource } from 'eventsource';
// Stellar SDK streaming requires EventSource in the global scope (Node.js polyfill)
(global as unknown as Record<string, unknown>).EventSource = EventSource;

import 'dotenv/config';
import { Account, Address, BASE_FEE, Contract, Horizon, Networks, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk';
import { SPLIT_CONTRACT_ID } from './config.js';
import { notifyAgentWebhook } from './supabase.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL ?? 'http://localhost:3001';
const USDC_CODE = 'USDC';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const RPC_URL = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = SPLIT_CONTRACT_ID;
const RECONNECT_DELAY_MS = 5_000;
const WATCHLIST_REFRESH_MS = 60_000;

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const AGENT_WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET ?? '';

if (!INTERNAL_API_KEY) {
  console.error('[monitor] ERROR: INTERNAL_API_KEY is required, the same value as the agent server.');
  process.exit(1);
}
if (!SUPABASE_URL || !AGENT_WEBHOOK_SECRET) {
  console.error(
    '[monitor] ERROR: SUPABASE_URL and AGENT_WEBHOOK_SECRET are required — the monitor has no ' +
    'other way to know which accounts to watch (see agent-watchlist Edge Function) or to report ' +
    'activity back to the dashboard.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logSection(title: string) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ---------------------------------------------------------------------------
// Watchlist — the set of Stellar accounts to react to, refreshed from
// Supabase on an interval so new users are picked up without a redeploy.
// ---------------------------------------------------------------------------

const watchedAccounts = new Set<string>();

async function refreshWatchlist(): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-watchlist`, {
      headers: { Authorization: `Bearer ${AGENT_WEBHOOK_SECRET}` },
    });

    if (!res.ok) {
      log(`[watchlist] Refresh failed: HTTP ${res.status}`);
      return;
    }

    const { accounts } = (await res.json()) as { accounts: string[] };

    const added = accounts.filter((a) => !watchedAccounts.has(a));
    const removed = [...watchedAccounts].filter((a) => !accounts.includes(a));

    for (const a of added) {
      watchedAccounts.add(a);
      log(`[watchlist] + now watching ${a.slice(0, 8)}...`);
      // Lets that user's dashboard flip to "Activo" immediately, without
      // waiting for their first payment.
      void notifyAgentWebhook({ watchedAccount: a, eventType: 'agent_started' });
    }
    for (const a of removed) {
      watchedAccounts.delete(a);
      log(`[watchlist] - stopped watching ${a.slice(0, 8)}...`);
    }

    if (added.length || removed.length) {
      log(`[watchlist] Now watching ${watchedAccounts.size} account(s)`);
    }
  } catch (err) {
    log(`[watchlist] Refresh error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Authorization check — most users on the watchlist may not have authorized the
// agent, and those aren't errors worth reporting to their dashboard.
// ---------------------------------------------------------------------------

async function isServerAuthorizedBy(user: string): Promise<boolean> {
  const health = await fetch(`${AGENT_SERVER_URL}/health`);
  if (!health.ok) throw new Error(`Agent server /health returned ${health.status}`);
  const { serverAddress } = (await health.json()) as { serverAddress: string };

  const tx = new TransactionBuilder(new Account(user, '0'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(CONTRACT_ID).call('get_agent', new Address(user).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await new rpc.Server(RPC_URL).simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) {
    throw new Error('Could not read the user authorization from the contract');
  }
  return scValToNative(sim.result.retval) === serverAddress;
}

// ---------------------------------------------------------------------------
// Ask the agent server to split a payment. It re-checks the payment on the
// network, so this can't be used to record money that never arrived.
// ---------------------------------------------------------------------------

async function requestSplit(
  userPublicKey: string,
  paymentId: string,
): Promise<{ txHash: string; vaultBreakdown: Array<{ vaultId: number; balance: string }> }> {
  const response = await fetch(`${AGENT_SERVER_URL}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INTERNAL_API_KEY}` },
    body: JSON.stringify({ userPublicKey, paymentId }),
  });
  if (!response.ok) {
    throw new Error(`Agent server returned ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<{ txHash: string; vaultBreakdown: Array<{ vaultId: number; balance: string }> }>;
}

// ---------------------------------------------------------------------------
// Horizon payment stream — global, filtered against the dynamic watchlist
// ---------------------------------------------------------------------------

type HorizonPayment = {
  id: string;
  type: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  amount: string;
  from: string;
  to: string;
  transaction_hash: string;
};

function isUsdcPayment(payment: HorizonPayment): boolean {
  return (
    payment.type === 'payment' &&
    payment.asset_type !== 'native' &&
    payment.asset_code === USDC_CODE &&
    payment.asset_issuer === USDC_ISSUER &&
    watchedAccounts.has(payment.to)
  );
}

function startStream(): () => void {
  const server = new Horizon.Server(HORIZON_URL);

  log('[stream] Watching all Stellar Testnet USDC payments, filtered against the live watchlist');

  const stopStream = server
    .payments()
    .cursor('now')
    .stream({
      onmessage: async (payment: unknown) => {
        const p = payment as HorizonPayment;

        if (!isUsdcPayment(p)) return; // ignore non-USDC, outgoing, or unwatched accounts

        logSection('USDC PAYMENT DETECTED');
        log(`  From:    ${p.from}`);
        log(`  To:      ${p.to}`);
        log(`  Amount:  ${p.amount} USDC`);
        log(`  TxHash:  ${p.transaction_hash}`);

        // Convert USDC amount string (7 decimal places) to stroops without float precision loss
        const [whole, frac = ''] = p.amount.split('.');
        const incomeAmount = Number(
          BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, '0').slice(0, 7))
        );

        try {
          if (!(await isServerAuthorizedBy(p.to))) {
            log('  Recipient has not authorized the agent — skipping');
            return;
          }

          logSection('Requesting split from the agent server');
          const result = await requestSplit(p.to, p.id);

          logSection('SPLIT EXECUTED SUCCESSFULLY');
          log(`  Contract txHash:  ${result.txHash}`);
          log('  Vault Breakdown:');
          for (const vault of result.vaultBreakdown) {
            const usdcAmount = (Number(vault.balance) / 10_000_000).toFixed(7);
            log(`    Vault ${vault.vaultId}: ${vault.balance} stroops  (${usdcAmount} USDC)`);
          }
          // ── Notify agent-webhook so the dashboard status card updates ────
          // watchedAccount is the actual recipient of this payment (p.to), not
          // a fixed account — agent-webhook resolves it to the right user.
          await notifyAgentWebhook({
            watchedAccount: p.to,
            eventType: 'split_executed',
            amountUsdc: incomeAmount / 10_000_000,
            txHash: result.txHash,
            vaultBreakdown: Object.fromEntries(
              result.vaultBreakdown.map((v) => [`vault_${v.vaultId}`, Number(v.balance) / 10_000_000]),
            ),
          });

          log('');

          // Yield is the user's choice: they deposit from their own account in the
          // app (src/components/YieldPanel.tsx). The agent never moves those funds.
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logSection('SPLIT FAILED');
          log(`  Error: ${message}`);
          log('  (Not retrying to avoid infinite loops)');
          log('');

          await notifyAgentWebhook({
            watchedAccount: p.to,
            eventType: 'agent_error',
            errorMessage: message,
          });
        }
      },

      onerror: (err: unknown) => {
        log(`[stream] Connection error: ${err instanceof Error ? err.message : String(err)}`);
        log(`[stream] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
        stopStream();
        setTimeout(() => startStream(), RECONNECT_DELAY_MS);
      },
    });

  return stopStream as () => void;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  logSection('PROPULSOR AUTONOMOUS AGENT — STARTING');
  log(`  Agent server:      ${AGENT_SERVER_URL}`);
  log(`  USDC issuer:       ${USDC_ISSUER.slice(0, 8)}...`);
  log(`  Network:           Stellar Testnet`);
  log('');

  await refreshWatchlist();
  log(`  Watching:          ${watchedAccounts.size} account(s) (refreshed every ${WATCHLIST_REFRESH_MS / 1000}s)`);
  log('');
  log('Waiting for incoming USDC payments...');
  log('');

  setInterval(refreshWatchlist, WATCHLIST_REFRESH_MS);
  startStream();
}

void main();

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('[monitor] Shutting down...');
  process.exit(0);
});
