/**
 * monitor.ts — Autonomous agent for Propulsor
 *
 * Watches a Stellar account for incoming USDC payments via Horizon streaming.
 * When a payment arrives, it autonomously calls the x402-protected
 * /execute-split endpoint — paying the 0.01 USDC fee itself — and logs
 * the on-chain vault breakdown.
 *
 * Usage:
 *   WATCHED_ACCOUNT=G... AGENT_SECRET=S... npm run monitor
 */

import { EventSource } from 'eventsource';
// Stellar SDK streaming requires EventSource in the global scope (Node.js polyfill)
(global as unknown as Record<string, unknown>).EventSource = EventSource;

import 'dotenv/config';
import { Horizon, Keypair } from '@stellar/stellar-sdk';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { createEd25519Signer } from '@x402/stellar';
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http';
import { depositToBlend } from './blend.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL ?? 'http://localhost:3001';
const USDC_CODE = 'USDC';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const RECONNECT_DELAY_MS = 5_000;

const WATCHED_ACCOUNT = process.env.WATCHED_ACCOUNT ?? '';
const AGENT_SECRET = process.env.AGENT_SECRET ?? process.env.SERVER_STELLAR_SECRET ?? '';

// vault_2 (savings) Blend integration — optional.
// If set, vault_2's USDC allocation is deposited into Blend after every split.
const VAULT2_PUBLIC_KEY = process.env.VAULT2_PUBLIC_KEY ?? '';
const VAULT2_SECRET = process.env.VAULT2_SECRET ?? '';

if (!WATCHED_ACCOUNT) {
  console.error('[monitor] ERROR: WATCHED_ACCOUNT env variable is required.');
  process.exit(1);
}
if (!AGENT_SECRET) {
  console.error('[monitor] ERROR: AGENT_SECRET (or SERVER_STELLAR_SECRET) env variable is required.');
  process.exit(1);
}

const agentKeypair = Keypair.fromSecret(AGENT_SECRET);
const agentAddress = agentKeypair.publicKey();

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
// x402 payment flow
//
// 1. POST /execute-split  → 402 + PAYMENT-REQUIRED header
// 2. Decode requirements, build & sign Stellar payment transaction
// 3. POST /execute-split again with X-PAYMENT header
// 4. Return { txHash, vaultBreakdown }
// ---------------------------------------------------------------------------

async function callExecuteSplitWithPayment(
  userPublicKey: string,
  incomeAmount: number,
): Promise<{ txHash: string; vaultBreakdown: Array<{ vaultId: number; balance: string }> }> {
  const url = `${AGENT_SERVER_URL}/execute-split`;
  const body = JSON.stringify({ userPublicKey, incomeAmount });
  const headers = { 'Content-Type': 'application/json' };

  // ── Step 1: Initial request (expect 402) ──────────────────────────────────
  log(`[x402] → POST ${url}`);
  const firstResponse = await fetch(url, { method: 'POST', headers, body });

  if (firstResponse.ok) {
    // Payment was somehow already satisfied (e.g. dev mode)
    return firstResponse.json() as Promise<{ txHash: string; vaultBreakdown: Array<{ vaultId: number; balance: string }> }>;
  }

  if (firstResponse.status !== 402) {
    const text = await firstResponse.text();
    throw new Error(`Unexpected status ${firstResponse.status}: ${text}`);
  }

  // ── Step 2: Decode payment requirements ───────────────────────────────────
  const paymentRequiredHeader = firstResponse.headers.get('payment-required');
  if (!paymentRequiredHeader) {
    throw new Error('Server returned 402 but no PAYMENT-REQUIRED header found');
  }

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const { x402Version, accepts } = paymentRequired;

  // Pick the first Stellar "exact" requirement
  const requirement = accepts.find(
    (a: { scheme: string; network: string }) =>
      a.scheme === 'exact' && a.network.startsWith('stellar'),
  );
  if (!requirement) {
    throw new Error(`No compatible payment requirement found. Got: ${JSON.stringify(accepts)}`);
  }

  log(`[x402] ← 402  amount=${requirement.amount}  asset=USDC  payTo=${requirement.payTo}`);

  // ── Step 3: Build and sign the payment payload ────────────────────────────
  const signer = createEd25519Signer(AGENT_SECRET, requirement.network);
  const scheme = new ExactStellarScheme(signer);

  log(`[x402] Signing payment with agent keypair ${agentAddress.slice(0, 8)}...`);
  const paymentPayload = await scheme.createPaymentPayload(x402Version, requirement);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encodedPayment = encodePaymentSignatureHeader(paymentPayload as any);

  // ── Step 4: Retry with payment header ─────────────────────────────────────
  log('[x402] → Retrying with X-PAYMENT header...');
  const paidResponse = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'X-PAYMENT': encodedPayment },
    body,
  });

  if (!paidResponse.ok) {
    const text = await paidResponse.text();
    throw new Error(`Paid request failed (${paidResponse.status}): ${text}`);
  }

  return paidResponse.json() as Promise<{ txHash: string; vaultBreakdown: Array<{ vaultId: number; balance: string }> }>;
}

// ---------------------------------------------------------------------------
// Horizon payment stream
// ---------------------------------------------------------------------------

type HorizonPayment = {
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
    payment.to === WATCHED_ACCOUNT
  );
}

function startStream(): () => void {
  const server = new Horizon.Server(HORIZON_URL);

  log(`[stream] Watching ${WATCHED_ACCOUNT.slice(0, 8)}... for incoming USDC on Stellar Testnet`);

  const stopStream = server
    .payments()
    .forAccount(WATCHED_ACCOUNT)
    .cursor('now')
    .stream({
      onmessage: async (payment: unknown) => {
        const p = payment as HorizonPayment;

        if (!isUsdcPayment(p)) return; // ignore non-USDC or outgoing

        logSection('USDC PAYMENT DETECTED');
        log(`  From:    ${p.from}`);
        log(`  To:      ${p.to}`);
        log(`  Amount:  ${p.amount} USDC`);
        log(`  TxHash:  ${p.transaction_hash}`);

        // Convert USDC amount (7 decimal places) to stroops-equivalent integer
        const incomeAmount = Math.round(parseFloat(p.amount) * 10_000_000);

        try {
          logSection('x402 PAYMENT FLOW — calling /execute-split');
          const result = await callExecuteSplitWithPayment(p.from, incomeAmount);

          logSection('SPLIT EXECUTED SUCCESSFULLY');
          log(`  Contract txHash:  ${result.txHash}`);
          log('  Vault Breakdown:');
          for (const vault of result.vaultBreakdown) {
            const usdcAmount = (Number(vault.balance) / 10_000_000).toFixed(7);
            log(`    Vault ${vault.vaultId}: ${vault.balance} stroops  (${usdcAmount} USDC)`);
          }
          log('');

          // ── Blend deposit: vault_2 (savings) earns yield ─────────────────
          if (VAULT2_SECRET && VAULT2_PUBLIC_KEY) {
            const vault2 = result.vaultBreakdown.find((v) => v.vaultId === 2);
            const vault2Stroops = vault2 ? Number(vault2.balance) : 0;

            if (vault2Stroops > 0) {
              logSection('BLEND DEPOSIT — vault_2 savings');
              const vault2Usdc = (vault2Stroops / 10_000_000).toFixed(7);
              log(`  Depositing ${vault2Usdc} USDC from vault_2 into Blend lending pool...`);
              try {
                const blendResult = await depositToBlend({
                  userPublicKey: VAULT2_PUBLIC_KEY,
                  userSecret: VAULT2_SECRET,
                  amount: vault2Stroops,
                });
                log(`  💰 vault_2: ${vault2Usdc} USDC deposited to Blend → earning yield`);
                log(`  Blend txHash:       ${blendResult.txHash}`);
                log(`  bTokens received:   ${blendResult.blendTokensReceived}`);
              } catch (blendErr) {
                log('  ⚠️  Blend unavailable, vault_2 held in Stellar account');
                log(`  (${blendErr instanceof Error ? blendErr.message : String(blendErr)})`);
              }
              log('');
            }
          }
        } catch (err) {
          logSection('SPLIT FAILED');
          log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
          log('  (Not retrying to avoid infinite loops)');
          log('');
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

logSection('PROPULSOR AUTONOMOUS AGENT — STARTING');
log(`  Watching account:  ${WATCHED_ACCOUNT}`);
log(`  Agent address:     ${agentAddress}`);
log(`  x402 server:       ${AGENT_SERVER_URL}`);
log(`  USDC issuer:       ${USDC_ISSUER.slice(0, 8)}...`);
log(`  Network:           Stellar Testnet`);
log(`  Blend deposit:     ${VAULT2_SECRET && VAULT2_PUBLIC_KEY ? `enabled (vault_2 = ${VAULT2_PUBLIC_KEY.slice(0, 8)}...)` : 'disabled (set VAULT2_PUBLIC_KEY + VAULT2_SECRET to enable)'}`);
log('');
log('Waiting for incoming USDC payments...');
log('');

startStream();

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('[monitor] Shutting down...');
  process.exit(0);
});
