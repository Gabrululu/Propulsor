/**
 * encode_vk.ts — Convert snarkjs verification_key.json to Soroban contract args
 *
 * After running `make setup` in circuits/proof_of_vault/, run this to get
 * the encoded VK ready for ProofOfVaultVerifier.initialize().
 *
 * Usage:
 *   npx tsx scripts/encode_vk.ts
 *
 * Output: vk_encoded.json  — ready to paste into stellar contract invoke
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── snarkjs BLS12-381 G1 → 96-byte hex (uncompressed big-endian x || y) ─────
function g1ToHex(point: [string, string]): string {
  const x = BigInt(point[0]).toString(16).padStart(96, "0");
  const y = BigInt(point[1]).toString(16).padStart(96, "0");
  return x + y;
}

// ── snarkjs BLS12-381 G2 → 192-byte hex (x_c1||x_c0||y_c1||y_c0) ────────────
// snarkjs Fp2 stores as [c0, c1] (index 0 = real); IETF/blst expects c1 first
function g2ToHex(point: [[string, string], [string, string]]): string {
  const xc0 = BigInt(point[0][0]).toString(16).padStart(96, "0"); // index 0 = c0
  const xc1 = BigInt(point[0][1]).toString(16).padStart(96, "0"); // index 1 = c1
  const yc0 = BigInt(point[1][0]).toString(16).padStart(96, "0"); // index 0 = c0
  const yc1 = BigInt(point[1][1]).toString(16).padStart(96, "0"); // index 1 = c1
  return xc1 + xc0 + yc1 + yc0;
}

const vkPath = join(__dirname, "../circuits/proof_of_vault/verification_key.json");
const vk = JSON.parse(readFileSync(vkPath, "utf-8"));

const encoded = {
  alpha: g1ToHex([vk.vk_alpha_1[0], vk.vk_alpha_1[1]]),
  beta:  g2ToHex([[vk.vk_beta_2[0][0], vk.vk_beta_2[0][1]], [vk.vk_beta_2[1][0], vk.vk_beta_2[1][1]]]),
  gamma: g2ToHex([[vk.vk_gamma_2[0][0], vk.vk_gamma_2[0][1]], [vk.vk_gamma_2[1][0], vk.vk_gamma_2[1][1]]]),
  delta: g2ToHex([[vk.vk_delta_2[0][0], vk.vk_delta_2[0][1]], [vk.vk_delta_2[1][0], vk.vk_delta_2[1][1]]]),
  ic_0:  g1ToHex([vk.IC[0][0], vk.IC[0][1]]),
  ic_1:  g1ToHex([vk.IC[1][0], vk.IC[1][1]]),
};

const outPath = join(__dirname, "vk_encoded.json");
writeFileSync(outPath, JSON.stringify(encoded, null, 2));

console.log("✓ VK encoded and written to vk_encoded.json");
console.log("\nTo initialize the contract:");
console.log("  stellar contract invoke \\");
console.log("    --id <CONTRACT_ID> --source deployer --network testnet \\");
console.log("    -- initialize --admin <ADMIN_ADDRESS> --vk '{...}'");
