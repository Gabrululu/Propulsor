/**
 * setup.ts — One-time script to configure SplitProtocol split rules
 * for the server's Stellar address.
 *
 * Run once before starting the server:
 *   npm run setup
 *
 * Default rules (edit RULES below to change, must sum to 100):
 *   Vault 0 → 60%  (e.g. Hogar / essential expenses)
 *   Vault 1 → 30%  (e.g. Ahorro / savings)
 *   Vault 2 → 10%  (e.g. Inversión / investments)
 */

import 'dotenv/config';
import {
  Keypair,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  Contract,
  Address,
  nativeToScVal,
  xdr,
  BASE_FEE,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Edit these to change the split percentages (must sum to 100)
// ---------------------------------------------------------------------------
const RULES: Array<{ vault_id: number; percentage: number }> = [
  { vault_id: 0, percentage: 60 },
  { vault_id: 1, percentage: 30 },
  { vault_id: 2, percentage: 10 },
];

// ---------------------------------------------------------------------------
// Config (mirrors server.ts)
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
const CONTRACT_ID =
  process.env.CONTRACT_ID ?? 'CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY';

if (!process.env.SERVER_STELLAR_SECRET) {
  console.error('ERROR: SERVER_STELLAR_SECRET not set. Copy .env.example → .env and fill it in.');
  process.exit(1);
}

const keypair = Keypair.fromSecret(process.env.SERVER_STELLAR_SECRET);
const address = keypair.publicKey();
const soroban = new SorobanRpc.Server(RPC_URL);

// ---------------------------------------------------------------------------
// Encode a SplitRule as an XDR scvMap
//
// Soroban #[contracttype] structs are serialized as scvMap with Symbol keys
// sorted alphabetically. For SplitRule { vault_id, percentage }:
//   "percentage" < "vault_id" → percentage comes first in the map
// ---------------------------------------------------------------------------

function encodeSplitRule(vaultId: number, percentage: number): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('percentage'),
      val: nativeToScVal(percentage, { type: 'u32' }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('vault_id'),
      val: nativeToScVal(vaultId, { type: 'u32' }),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Poll for transaction confirmation
// ---------------------------------------------------------------------------

async function waitForTransaction(hash: string, attempts = 20, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    const tx = await soroban.getTransaction(hash);
    if (tx.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) return tx;
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for ${hash}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const total = RULES.reduce((s, r) => s + r.percentage, 0);
  if (total !== 100) {
    throw new Error(`Rules must sum to 100, got ${total}`);
  }

  console.log('Setting split rules for:', address);
  console.log('Rules:', RULES);

  const account = await soroban.getAccount(address);
  const contract = new Contract(CONTRACT_ID);

  // Vec<SplitRule>
  const rulesVec = xdr.ScVal.scvVec(
    RULES.map(r => encodeSplitRule(r.vault_id, r.percentage)),
  );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call(
        'set_rules',
        Address.fromString(address).toScVal(), // user: Address
        rulesVec,                              // rules: Vec<SplitRule>
      ),
    )
    .setTimeout(30)
    .build();

  const prepared = await soroban.prepareTransaction(tx);
  prepared.sign(keypair);

  const send = await soroban.sendTransaction(prepared);
  if (send.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(send.errorResult ?? send)}`);
  }

  console.log('Transaction submitted:', send.hash);
  console.log('Waiting for confirmation...');

  const confirmed = await waitForTransaction(send.hash);

  if (confirmed.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    console.log('Split rules set successfully!');
    console.log('  txHash:', send.hash);
    console.log('  You can now start the server: npm run dev');
  } else {
    throw new Error(`Transaction failed with status: ${confirmed.status}`);
  }
}

main().catch(err => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
