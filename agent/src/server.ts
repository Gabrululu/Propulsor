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
// POST /execute-split  (x402-protected — costs 0.01 USDC)
//
// Body:
//   userPublicKey  – caller's Stellar address (logged in response metadata)
//   incomeAmount   – income in raw units (stroops or your app's denomination)
//
// The server invokes SplitProtocol::execute_split() signed with its own
// keypair. Balances are tracked on-chain under the server's demo address.
// Run `npm run setup` once first to configure split rules.
//
// Response: { success, txHash, vaultBreakdown, meta }
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
    const account = await soroban.getAccount(serverAddress);
    const contract = new Contract(CONTRACT_ID);

    // execute_split(user: Address, income: i128)
    // user.require_auth() is satisfied because we sign with serverKeypair
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'execute_split',
          Address.fromString(serverAddress).toScVal(),            // user: Address
          nativeToScVal(BigInt(Math.floor(incomeAmount)), { type: 'i128' }), // income: i128
        ),
      )
      .setTimeout(30)
      .build();

    // Simulate and attach resource footprint
    const preparedTx = await soroban.prepareTransaction(tx);

    // Sign with server keypair
    preparedTx.sign(serverKeypair);

    // Submit to the network
    const sendResult = await soroban.sendTransaction(preparedTx);

    if (sendResult.status === 'ERROR') {
      throw new Error(
        `Transaction rejected by network: ${JSON.stringify(sendResult.errorResult ?? sendResult)}`,
      );
    }

    // Wait for ledger confirmation
    const confirmed = await waitForTransaction(sendResult.hash);

    if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`Transaction failed (status: ${confirmed.status})`);
    }

    // Parse Vec<VaultBalance> — scValToNative maps: vec→array, map→obj, i128→bigint, u32→number
    const raw = scValToNative(confirmed.returnValue!) as Array<{
      vault_id: number;
      balance: bigint;
    }>;

    const vaultBreakdown = raw.map(vb => ({
      vaultId: Number(vb.vault_id),
      balance: vb.balance.toString(), // i128 as decimal string
    }));

    console.log(`[execute-split] OK  txHash=${sendResult.hash}  user=${userPublicKey}`);

    res.json({
      success: true,
      txHash: sendResult.hash,
      vaultBreakdown,
      meta: {
        userPublicKey,
        incomeAmount,
        serverAddress,
        network: NETWORK,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[execute-split] Error:', message);
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
