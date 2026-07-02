/**
 * verify_onchain.ts — Submit a ProofOfVault proof to Stellar Testnet
 *
 * Reads proof_output.json (from generate_proof.ts), encodes it for Soroban,
 * calls ProofOfVaultVerifier.verify_proof(), and prints the proof hash.
 *
 * Usage:
 *   npx tsx scripts/verify_onchain.ts \
 *     --secret S... \
 *     --contract C...
 *
 * Environment variables (alternative to flags):
 *   STELLAR_SECRET         — account that owns the proof (signs the tx)
 *   VERIFIER_CONTRACT_ID   — deployed ProofOfVaultVerifier contract address
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
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL  = "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;

// ── Arg parsing ─────────────────────────────────────────────────────────────
function getConfig() {
  const args = process.argv.slice(2);
  let secret   = process.env.STELLAR_SECRET   ?? "";
  let contract = process.env.VERIFIER_CONTRACT_ID ?? "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--secret"   && args[i + 1]) secret   = args[++i];
    if (args[i] === "--contract" && args[i + 1]) contract = args[++i];
  }

  if (!secret)   { console.error("Missing --secret or STELLAR_SECRET"); process.exit(1); }
  if (!contract) { console.error("Missing --contract or VERIFIER_CONTRACT_ID"); process.exit(1); }
  return { secret, contract };
}

// ── Hex string → Soroban BytesN ScVal ───────────────────────────────────────
function hexToScBytesN(hex: string): xdr.ScVal {
  const bytes = Buffer.from(hex, "hex");
  return xdr.ScVal.scvBytes(bytes);
}

// ── Poll for transaction confirmation ───────────────────────────────────────
async function waitForTx(
  soroban: SorobanRpc.Server,
  hash: string,
  attempts = 30,
  delayMs = 1000,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < attempts; i++) {
    const tx = await soroban.getTransaction(hash);
    if (tx.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) return tx;
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Transaction ${hash} timed out`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { secret, contract: contractId } = getConfig();

  const keypair  = Keypair.fromSecret(secret);
  const soroban  = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  const contract = new Contract(contractId);

  // Load proof from file
  const proofPath = join(__dirname, "proof_output.json");
  const { stellarProof, meta } = JSON.parse(readFileSync(proofPath, "utf-8"));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Propulsor ZK — Submitting Proof to Stellar");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` Account  : ${keypair.publicKey()}`);
  console.log(` Contract : ${contractId}`);
  console.log(` Threshold: $${meta.threshold_usdc} USDC`);

  // Build proof ScMap
  const proofScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("a"),
      val: hexToScBytesN(stellarProof.neg_a),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("b"),
      val: hexToScBytesN(stellarProof.b),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("c"),
      val: hexToScBytesN(stellarProof.c),
    }),
  ]);

  const thresholdScVal = hexToScBytesN(stellarProof.threshold_fr);

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
      thresholdScVal,
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

  // Extract proof hash (nullifier) returned by verify_proof
  const proofHash = scValToNative(confirmed.returnValue!) as string;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✓ Proof verified on-chain!");
  console.log(`  Stellar txHash : ${sendResult.hash}`);
  console.log(`  Proof hash     : ${Buffer.from(proofHash).toString("hex")}`);
  console.log(`  Verify URL     : /verify/${Buffer.from(proofHash).toString("hex")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error);
