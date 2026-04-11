import 'dotenv/config';
import express, { Request, Response } from 'express';
import { paymentMiddlewareFromConfig } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { ExactStellarScheme } from '@x402/stellar/exact/server';
import {
  Keypair,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ?? '3001';
const NETWORK = 'stellar:testnet';
const STELLAR_PASSPHRASE = Networks.TESTNET;
const RPC_URL = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://www.x402.org/facilitator';
const CONTRACT_ID =
  process.env.CONTRACT_ID ?? 'CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY';
// Token used by the Supabase Edge Function proxy — set INTERNAL_API_KEY in env
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';

if (!process.env.SERVER_STELLAR_SECRET) {
  console.error('ERROR: SERVER_STELLAR_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const serverKeypair = Keypair.fromSecret(process.env.SERVER_STELLAR_SECRET);
const serverAddress = serverKeypair.publicKey();
const soroban = new SorobanRpc.Server(RPC_URL);

console.log('[propulsor-agent] Server address:', serverAddress);
console.log('[propulsor-agent] Contract:       ', CONTRACT_ID);
console.log('[propulsor-agent] Network:        ', NETWORK);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// CORS — allows the Supabase Edge Function and browser /health checks
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

// ---------------------------------------------------------------------------
// x402 payment middleware
// Protects POST /execute-split: requires 0.01 USDC on Stellar Testnet.
// ExactStellarScheme must be registered so the middleware knows how to
// parse/verify "exact" payments on stellar:testnet.
// ---------------------------------------------------------------------------

app.use(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (paymentMiddlewareFromConfig as any)(
    {
      'POST /execute-split': {
        accepts: {
          scheme: 'exact',
          price: '$0.01',        // 0.01 USDC
          network: NETWORK,
          payTo: serverAddress,  // payments received by the server wallet
        },
      },
    },
    new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
    [{ network: NETWORK, server: new ExactStellarScheme() }],
  ),
);

// ---------------------------------------------------------------------------
// Helper: poll until Soroban transaction is confirmed
// ---------------------------------------------------------------------------

async function waitForTransaction(
  hash: string,
  attempts = 20,
  delayMs = 1500,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < attempts; i++) {
    const tx = await soroban.getTransaction(hash);
    if (tx.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      return tx;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Transaction ${hash} timed out after ${(attempts * delayMs) / 1000}s`);
}

// ---------------------------------------------------------------------------
// Core split logic — shared by /execute-split (x402) and /split (bearer)
// ---------------------------------------------------------------------------

async function runSplit(userPublicKey: string, incomeAmount: number) {
  const account = await soroban.getAccount(serverAddress);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'execute_split',
        Address.fromString(serverAddress).toScVal(),
        nativeToScVal(BigInt(Math.floor(incomeAmount)), { type: 'i128' }),
      ),
    )
    .setTimeout(30)
    .build();

  const preparedTx = await soroban.prepareTransaction(tx);
  preparedTx.sign(serverKeypair);

  const sendResult = await soroban.sendTransaction(preparedTx);

  if (sendResult.status === 'ERROR') {
    throw new Error(
      `Transaction rejected by network: ${JSON.stringify(sendResult.errorResult ?? sendResult)}`,
    );
  }

  const confirmed = await waitForTransaction(sendResult.hash);

  if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed (status: ${confirmed.status})`);
  }

  const raw = scValToNative(confirmed.returnValue!) as Array<{
    vault_id: number;
    balance: bigint;
  }>;

  const vaultBreakdown = raw.map(vb => ({
    vaultId: Number(vb.vault_id),
    balance: vb.balance.toString(),
  }));

  return { txHash: sendResult.hash, vaultBreakdown };
}

// ---------------------------------------------------------------------------
// POST /execute-split  (x402-protected — costs 0.01 USDC)
// ---------------------------------------------------------------------------

app.post('/execute-split', async (req: Request, res: Response) => {
  const { userPublicKey, incomeAmount } = req.body as {
    userPublicKey?: string;
    incomeAmount?: number;
  };

  if (!userPublicKey || typeof incomeAmount !== 'number' || incomeAmount <= 0) {
    res.status(400).json({
      success: false,
      error: 'Request body must include userPublicKey (string) and incomeAmount (number > 0)',
    });
    return;
  }

  try {
    const { txHash, vaultBreakdown } = await runSplit(userPublicKey, incomeAmount);
    console.log(`[execute-split] OK  txHash=${txHash}  user=${userPublicKey}`);
    res.json({
      success: true,
      txHash,
      vaultBreakdown,
      meta: { userPublicKey, incomeAmount, serverAddress, network: NETWORK },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[execute-split] Error:', message);
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /split  (bearer-token auth — for Supabase Edge Function proxy)
//
// Requires: Authorization: Bearer <INTERNAL_API_KEY>
// Same split logic as /execute-split but no x402 fee required.
// ---------------------------------------------------------------------------

app.post('/split', async (req: Request, res: Response) => {
  if (!INTERNAL_API_KEY) {
    res.status(503).json({ success: false, error: 'Internal API not configured (INTERNAL_API_KEY not set)' });
    return;
  }

  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader !== `Bearer ${INTERNAL_API_KEY}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const { userPublicKey, incomeAmount } = req.body as {
    userPublicKey?: string;
    incomeAmount?: number;
  };

  if (!userPublicKey || typeof incomeAmount !== 'number' || incomeAmount <= 0) {
    res.status(400).json({
      success: false,
      error: 'Request body must include userPublicKey (string) and incomeAmount (number > 0)',
    });
    return;
  }

  try {
    const { txHash, vaultBreakdown } = await runSplit(userPublicKey, incomeAmount);
    console.log(`[split] OK  txHash=${txHash}  user=${userPublicKey}`);
    res.json({
      success: true,
      txHash,
      vaultBreakdown,
      meta: { userPublicKey, incomeAmount, serverAddress, network: NETWORK },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[split] Error:', message);
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /health — liveness check (no payment required)
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    serverAddress,
    contractId: CONTRACT_ID,
    network: NETWORK,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(Number(PORT), () => {
  console.log(`[propulsor-agent] Listening on http://localhost:${PORT}`);
  console.log('[propulsor-agent] POST /execute-split  — protected by x402 (0.01 USDC)');
  console.log('[propulsor-agent] GET  /health          — liveness check');
});
