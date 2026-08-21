/**
 * verify_onchain_consistent_saving.ts — Submit a ConsistentSaving Groth16
 * proof to Stellar Testnet
 *
 * Reads zk/risc0/consistent_saving/fixture.json (seal + journal, produced by
 * `cargo run --release --example crosscheck_fixture` — see SPEC.md), encodes
 * it for Soroban, calls ConsistentSavingVerifier.verify_proof(), and prints
 * the nullifier. Mirrors verify_onchain.ts's pattern for ProofOfVaultVerifier,
 * with two BN254-specific differences:
 *   - No client-side A-negation: unlike proof_of_vault_verifier (which has no
 *     g1_neg host function workaround and pre-negates A off-chain),
 *     ConsistentSavingVerifier negates A on-chain itself (SPEC.md §6) — the
 *     raw seal's `a` is submitted as-is.
 *   - `journal` (raw bytes) is submitted instead of a single scalar; the
 *     contract reconstructs the claim digest and derives (c0, c1) itself
 *     (SPEC.md §3d).
 *
 * Usage:
 *   npx tsx scripts/verify_onchain_consistent_saving.ts \
 *     --secret S... \
 *     --contract C...
 *
 * Environment variables (alternative to flags):
 *   STELLAR_SECRET                          — account making the claim (signs the tx)
 *   CONSISTENT_SAVING_VERIFIER_CONTRACT_ID  — deployed ConsistentSavingVerifier address
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Contract,
  Address,
  xdr,
  rpc as SorobanRpc,
  BASE_FEE,
  scValToNative,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL    = "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;

// ── Arg parsing ─────────────────────────────────────────────────────────────
function getConfig() {
  const args = process.argv.slice(2);
  let secret   = process.env.STELLAR_SECRET ?? "";
  let contract = process.env.CONSISTENT_SAVING_VERIFIER_CONTRACT_ID ?? "";
  let fixturePath = join(__dirname, "../risc0/consistent_saving/fixture.json");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--secret"   && args[i + 1]) secret      = args[++i];
    if (args[i] === "--contract" && args[i + 1]) contract    = args[++i];
    if (args[i] === "--fixture"  && args[i + 1]) fixturePath = args[++i];
  }

  if (!secret)   { console.error("Missing --secret or STELLAR_SECRET"); process.exit(1); }
  if (!contract) { console.error("Missing --contract or CONSISTENT_SAVING_VERIFIER_CONTRACT_ID"); process.exit(1); }
  return { secret, contract, fixturePath };
}

// ── Hex string → Soroban BytesN/Bytes ScVal ─────────────────────────────────
function hexToScBytes(hexStr: string): xdr.ScVal {
  return xdr.ScVal.scvBytes(Buffer.from(hexStr, "hex"));
}

// ── Poll for transaction confirmation ───────────────────────────────────────
async function waitForTx(
  soroban: SorobanRpc.Server,
  txHash: string,
  attempts = 30,
  delayMs = 1000,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < attempts; i++) {
    const tx = await soroban.getTransaction(txHash);
    if (tx.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) return tx;
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Transaction ${txHash} timed out`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { secret, contract: contractId, fixturePath } = getConfig();

  const keypair  = Keypair.fromSecret(secret);
  const soroban  = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  const contract = new Contract(contractId);

  // Load the real Groth16 receipt fixture (SPEC.md / Phase 1)
  const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
  const sealBytes = Buffer.from(fixture.seal_hex, "hex");
  if (sealBytes.length !== 256) {
    throw new Error(`Unexpected seal length: ${sealBytes.length} (expected 256 — a[64] || b[128] || c[64])`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Propulsor ZK — Submitting Consistent-Saving Proof");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` Account  : ${keypair.publicKey()}`);
  console.log(` Contract : ${contractId}`);

  // Build Groth16Proof ScMap — fields sorted alphabetically (a, b, c),
  // sliced directly from the seal with no reordering (SPEC.md §4).
  const proofScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: hexToScBytes(fixture.seal_hex.slice(0, 128)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: hexToScBytes(fixture.seal_hex.slice(128, 384)) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: hexToScBytes(fixture.seal_hex.slice(384, 512)) }),
  ]);

  const journalScVal = hexToScBytes(fixture.journal_hex);

  // Build transaction
  console.log("\n→ Fetching account...");
  const account = await soroban.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(
      "verify_proof",
      new Address(keypair.publicKey()).toScVal(),
      proofScVal,
      journalScVal,
    ))
    .setTimeout(30)
    .build();

  // Simulate
  console.log("→ Simulating...");
  const sim = await soroban.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    console.error("✗ Simulation failed:", sim.error);
    process.exit(1);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, sim).build();
  assembled.sign(keypair);

  // Submit
  console.log("→ Submitting to Stellar Testnet...");
  const sendResult = await soroban.sendTransaction(assembled);
  if (sendResult.status === "ERROR") {
    console.error("✗ Submission failed:", sendResult.errorResult);
    process.exit(1);
  }

  // Poll
  console.log(`→ Confirming (txHash: ${sendResult.hash})...`);
  const confirmed = await waitForTx(soroban, sendResult.hash);

  if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    console.error("✗ Transaction failed:", confirmed.status);
    process.exit(1);
  }

  // Extract nullifier (BytesN<32>) returned by verify_proof
  const nullifier = scValToNative(
    (confirmed as SorobanRpc.Api.GetSuccessfulTransactionResponse).returnValue!,
  ) as Buffer;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✓ Proof verified on-chain!");
  console.log(`  Stellar txHash : ${sendResult.hash}`);
  console.log(`  Nullifier      : ${Buffer.from(nullifier).toString("hex")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(err => { console.error("✗", err.message); process.exit(1); });
