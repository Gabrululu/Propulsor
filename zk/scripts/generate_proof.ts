/**
 * generate_proof.ts — CLI proof generator for ProofOfVault
 *
 * Generates a Groth16/BLS12-381 proof that vault_2 balance >= threshold.
 * Runs entirely off-chain; secrets never leave this process.
 *
 * Usage:
 *   npx tsx scripts/generate_proof.ts \
 *     --balance 1000000000 \
 *     --threshold 500000000
 *
 * Output:
 *   proof_output.json  — { proof, publicSignals, negA, stellarProof }
 *
 * Prerequisites:
 *   cd zk && npm install
 *   cd circuits/proof_of_vault && make all  (compile + setup)
 */

import * as snarkjs from "snarkjs";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── BLS12-381 Fp prime (for negating A.y) ──────────────────────────────────
// p = 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab
const BLS_FP_PRIME =
  4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;

// ── Parse CLI args ──────────────────────────────────────────────────────────
function parseArgs(): { balance: bigint; threshold: bigint } {
  const args = process.argv.slice(2);
  let balance: bigint | undefined;
  let threshold: bigint | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--balance" && args[i + 1]) balance = BigInt(args[++i]);
    if (args[i] === "--threshold" && args[i + 1]) threshold = BigInt(args[++i]);
  }

  if (balance === undefined || threshold === undefined) {
    console.error("Usage: generate_proof.ts --balance <stroops> --threshold <stroops>");
    console.error("  Amounts in USDC base units (7 decimals): $1 = 10000000");
    process.exit(1);
  }
  return { balance, threshold };
}

// ── Hex helpers ─────────────────────────────────────────────────────────────
function bigintToBytes32Hex(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Negate a G1 point (negate y-coordinate mod Fp) ─────────────────────────
// snarkjs returns G1 as [x_decimal, y_decimal] strings
// BLS12-381 uncompressed encoding: x (48 bytes big-endian) || y (48 bytes big-endian)
function negateG1(point: [string, string]): string {
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  const neg_y = BLS_FP_PRIME - y;

  const xHex = x.toString(16).padStart(96, "0");  // 48 bytes = 96 hex chars
  const yHex = neg_y.toString(16).padStart(96, "0");
  return xHex + yHex;  // 96 bytes total
}

// ── Convert G1 point to 96-byte hex string ──────────────────────────────────
function g1ToHex(point: [string, string]): string {
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  const xHex = x.toString(16).padStart(96, "0");
  const yHex = y.toString(16).padStart(96, "0");
  return xHex + yHex;
}

// ── Convert G2 point to 192-byte hex string ─────────────────────────────────
// snarkjs G2 (ffjavascript Fp2): [[x_c0, x_c1], [y_c0, y_c1]] — c0 at index 0
// IETF/blst BLS12-381 serialization: x_c1 || x_c0 || y_c1 || y_c0 (c1 first)
function g2ToHex(point: [[string, string], [string, string]]): string {
  const xc0 = BigInt(point[0][0]).toString(16).padStart(96, "0"); // index 0 = c0 (real)
  const xc1 = BigInt(point[0][1]).toString(16).padStart(96, "0"); // index 1 = c1 (imag)
  const yc0 = BigInt(point[1][0]).toString(16).padStart(96, "0"); // index 0 = c0 (real)
  const yc1 = BigInt(point[1][1]).toString(16).padStart(96, "0"); // index 1 = c1 (imag)
  return xc1 + xc0 + yc1 + yc0;  // 192 bytes: c1 first (IETF standard)
}

// ── Convert public signal (threshold) to 32-byte Fr ──────────────────────────
function publicSignalToFr(signal: string): string {
  return BigInt(signal).toString(16).padStart(64, "0");
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { balance, threshold } = parseArgs();

  const circuitDir = join(__dirname, "../circuits/proof_of_vault");
  const wasmPath = join(circuitDir, "build/circuit_js/circuit.wasm");
  const zkeyPath = join(circuitDir, "circuit.zkey");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Propulsor ZK — Generating Proof of Vault");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` Balance   : ${balance} stroops  ($${(Number(balance) / 1e7).toFixed(2)} USDC)`);
  console.log(` Threshold : ${threshold} stroops  ($${(Number(threshold) / 1e7).toFixed(2)} USDC)`);

  if (balance < threshold) {
    console.error("✗ Cannot generate proof: balance < threshold");
    process.exit(1);
  }

  // 1. Compute witness
  console.log("\n→ Computing witness...");
  const input = {
    actual_balance: balance.toString(),
    threshold: threshold.toString(),
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  console.log("✓ Proof generated");
  console.log("  Public signals:", publicSignals);  // [threshold]

  // 2. Verify locally (sanity check)
  const vkPath = join(circuitDir, "verification_key.json");
  const vk = JSON.parse(readFileSync(vkPath, "utf-8"));
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  if (!valid) {
    console.error("✗ Local verification failed — circuit constraint violated");
    process.exit(1);
  }
  console.log("✓ Off-chain verification passed");

  // 3. Convert to Stellar-compatible byte encoding
  // proof.pi_a = [x, y, "1"]  (G1)
  // proof.pi_b = [[xc0, xc1], [yc0, yc1], ["1","0"]]  (G2, snarkjs Fp2 = [c0, c1])
  // proof.pi_c = [x, y, "1"]  (G1)
  // Client pre-negates A (neg_y = p - y) — contract uses it directly in pairing

  const negA = negateG1([proof.pi_a[0], proof.pi_a[1]]);
  const bHex = g2ToHex([
    [proof.pi_b[0][0], proof.pi_b[0][1]],
    [proof.pi_b[1][0], proof.pi_b[1][1]],
  ]);
  const cHex        = g1ToHex([proof.pi_c[0], proof.pi_c[1]]);
  const thresholdFr = publicSignalToFr(publicSignals[0]);

  const stellarProof = {
    neg_a:        negA,         // 96 bytes hex  — pre-negated G1 point
    b:            bHex,         // 192 bytes hex — G2 point
    c:            cHex,         // 96 bytes hex  — G1 point
    threshold_fr: thresholdFr,  // 32 bytes hex  — Fr scalar
  };

  // 4. Write output
  const output = {
    proof,
    publicSignals,
    stellarProof,
    meta: {
      balance_usdc:   (Number(balance) / 1e7).toFixed(7),
      threshold_usdc: (Number(threshold) / 1e7).toFixed(7),
      timestamp:      new Date().toISOString(),
    },
  };

  const outPath = join(__dirname, "proof_output.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("\n✓ Stellar-compatible proof written to proof_output.json");
  console.log("  neg_a     :", negA.slice(0, 20) + "...");
  console.log("  b         :", bHex.slice(0, 20) + "...");
  console.log("  c         :", cHex.slice(0, 20) + "...");
  console.log("  threshold_fr:", thresholdFr);
  console.log("\n→ Run verify_onchain.ts to submit to Stellar");
}

main().catch(console.error);
