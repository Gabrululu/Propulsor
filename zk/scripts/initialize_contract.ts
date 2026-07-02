/**
 * initialize_contract.ts — Initialize ProofOfVaultVerifier with the circuit's VK
 *
 * Usage:
 *   npx tsx scripts/initialize_contract.ts \
 *     --secret S... \
 *     --contract C...
 *
 * Environment variables (alternative to flags):
 *   STELLAR_SECRET         — admin account that deploys/signs
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
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL    = "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;

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

function hexToScBytesN(hex: string): xdr.ScVal {
  return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
}

async function waitForTx(
  soroban: SorobanRpc.Server,
  hash: string,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < 30; i++) {
    const tx = await soroban.getTransaction(hash);
    if (tx.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) return tx;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Transaction ${hash} timed out`);
}

async function main() {
  const { secret, contract: contractId } = getConfig();
  const keypair  = Keypair.fromSecret(secret);
  const soroban  = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  const contract = new Contract(contractId);

  const vk = JSON.parse(readFileSync(join(__dirname, "vk_encoded.json"), "utf-8"));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Propulsor ZK — Initializing Verifier Contract");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` Admin    : ${keypair.publicKey()}`);
  console.log(` Contract : ${contractId}`);

  const vkScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("alpha"), val: hexToScBytesN(vk.alpha) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("beta"),  val: hexToScBytesN(vk.beta)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("delta"), val: hexToScBytesN(vk.delta) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("gamma"), val: hexToScBytesN(vk.gamma) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_0"),  val: hexToScBytesN(vk.ic_0)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_1"),  val: hexToScBytesN(vk.ic_1)  }),
  ]);

  console.log("\n→ Fetching account...");
  const account = await soroban.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call(
      "initialize",
      new Address(keypair.publicKey()).toScVal(),
      vkScVal,
    ))
    .setTimeout(30)
    .build();

  console.log("→ Simulating...");
  const sim = await soroban.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    console.error("✗ Simulation failed:", sim.error);
    process.exit(1);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, sim).build();
  assembled.sign(keypair);

  console.log("→ Submitting...");
  const sendResult = await soroban.sendTransaction(assembled);
  if (sendResult.status === "ERROR") {
    console.error("✗ Submission failed:", sendResult.errorResult);
    process.exit(1);
  }

  const confirmed = await waitForTx(soroban, sendResult.hash);
  if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    console.error("✗ Transaction failed:", confirmed.status);
    process.exit(1);
  }

  console.log("\n✓ Contract initialized!");
  console.log(`  txHash: ${sendResult.hash}`);
}

main().catch(console.error);
