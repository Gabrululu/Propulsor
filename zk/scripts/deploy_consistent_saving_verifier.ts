/**
 * deploy_consistent_saving_verifier.ts — Deploy ConsistentSavingVerifier with
 * __constructor (Protocol 22)
 *
 * Uploads WASM then deploys atomically with constructor args
 * (admin, vk, image_id) — mirrors deploy_contract.ts's pattern for
 * ProofOfVaultVerifier, generalized to ConsistentSavingVerifier's extra
 * image_id constructor arg and 10-field VK (vs. 6 for the BLS12-381 circuit).
 *
 * Usage:
 *   npx tsx scripts/deploy_consistent_saving_verifier.ts --secret S...
 *
 * Environment variables:
 *   STELLAR_SECRET — deployer account (becomes the contract's admin)
 *
 * Prerequisites:
 *   - contracts/consistent_saving_verifier built for wasm32v1-none:
 *       cd zk/contracts/consistent_saving_verifier && cargo build --target wasm32v1-none --release
 *   - zk/scripts/vk_risc0_encoded.json generated (npm run encode-risc0-vk)
 *   - zk/risc0/consistent_saving/fixture.json present (for image_id_hex) —
 *     produced by `cargo run --release --example crosscheck_fixture` in
 *     zk/risc0/consistent_saving/host/. image_id is a build-time constant of
 *     the guest ELF, not per-proof, so any fixture.json from the currently
 *     deployed guest source works — but if the guest changes, regenerate the
 *     fixture (or pass --image-id explicitly) before redeploying.
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Address,
  xdr,
  rpc as SorobanRpc,
  BASE_FEE,
  Operation,
  hash,
} from "@stellar/stellar-sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL    = "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;

function getConfig() {
  const args = process.argv.slice(2);
  let secret = process.env.STELLAR_SECRET ?? "";
  let wasmPath = join(
    __dirname,
    "../contracts/consistent_saving_verifier/target/wasm32v1-none/release/consistent_saving_verifier.wasm",
  );
  let imageId = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--secret"    && args[i + 1]) secret  = args[++i];
    if (args[i] === "--wasm"      && args[i + 1]) wasmPath = args[++i];
    if (args[i] === "--image-id"  && args[i + 1]) imageId = args[++i];
  }
  if (!secret) { console.error("Missing --secret or STELLAR_SECRET"); process.exit(1); }
  return { secret, wasmPath, imageId };
}

function hexToScBytesN(hexStr: string): xdr.ScVal {
  return xdr.ScVal.scvBytes(Buffer.from(hexStr, "hex"));
}

async function waitForTx(
  soroban: SorobanRpc.Server,
  txHash: string,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < 30; i++) {
    const tx = await soroban.getTransaction(txHash);
    if (tx.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) return tx;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Transaction ${txHash} timed out`);
}

async function submitTx(
  soroban: SorobanRpc.Server,
  keypair: Keypair,
  tx: ReturnType<TransactionBuilder["build"]>,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  const sim = await soroban.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(`Sim failed: ${sim.error}`);
  const assembled = SorobanRpc.assembleTransaction(tx, sim).build();
  assembled.sign(keypair);
  const send = await soroban.sendTransaction(assembled);
  if (send.status === "ERROR") throw new Error(`Send failed: ${JSON.stringify(send.errorResult)}`);
  const confirmed = await waitForTx(soroban, send.hash);
  if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS)
    throw new Error(`Tx failed: ${confirmed.status}`);
  return confirmed;
}

async function main() {
  const { secret, wasmPath, imageId: imageIdArg } = getConfig();
  const keypair = Keypair.fromSecret(secret);
  const soroban = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

  const wasmBytes = readFileSync(wasmPath);
  const vk = JSON.parse(readFileSync(join(__dirname, "vk_risc0_encoded.json"), "utf-8"));

  const imageIdHex = imageIdArg || JSON.parse(
    readFileSync(join(__dirname, "../risc0/consistent_saving/fixture.json"), "utf-8"),
  ).image_id_hex;
  if (!imageIdHex) { console.error("Missing image_id — pass --image-id or generate fixture.json"); process.exit(1); }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Propulsor ZK — Deploy ConsistentSavingVerifier");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` Deployer : ${keypair.publicKey()}`);
  console.log(` Image ID : ${imageIdHex}`);

  // Step 1: Upload WASM
  console.log("\n→ Uploading WASM...");
  const account1 = await soroban.getAccount(keypair.publicKey());
  const installTx = new TransactionBuilder(account1, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.uploadContractWasm({ wasm: wasmBytes }))
    .setTimeout(30)
    .build();
  await submitTx(soroban, keypair, installTx);
  const wasmHash = Buffer.from(hash(wasmBytes));
  console.log(`✓ WASM hash: ${wasmHash.toString("hex")}`);

  // Step 2: Build constructor args — (admin, vk, image_id), matching
  // ConsistentSavingVerifier::__constructor's parameter order exactly.
  // Soroban map keys must be in sorted order for canonical XDR — alpha,
  // beta, delta, gamma, ic_0..ic_5 (delta sorts before gamma).
  const adminScVal = new Address(keypair.publicKey()).toScVal();
  const vkScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("alpha"), val: hexToScBytesN(vk.alpha) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("beta"),  val: hexToScBytesN(vk.beta)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("delta"), val: hexToScBytesN(vk.delta) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("gamma"), val: hexToScBytesN(vk.gamma) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_0"),  val: hexToScBytesN(vk.ic_0)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_1"),  val: hexToScBytesN(vk.ic_1)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_2"),  val: hexToScBytesN(vk.ic_2)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_3"),  val: hexToScBytesN(vk.ic_3)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_4"),  val: hexToScBytesN(vk.ic_4)  }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("ic_5"),  val: hexToScBytesN(vk.ic_5)  }),
  ]);
  const imageIdScVal = hexToScBytesN(imageIdHex);

  // Step 3: Deploy with Protocol 22 createContractV2 (constructor args included)
  console.log("→ Deploying contract with __constructor...");
  const createArgs = new xdr.CreateContractArgsV2({
    contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
      new xdr.ContractIdPreimageFromAddress({
        address: new Address(keypair.publicKey()).toScAddress(),
        salt: Buffer.alloc(32),
      })
    ),
    executable: xdr.ContractExecutable.contractExecutableWasm(wasmHash),
    constructorArgs: [adminScVal, vkScVal, imageIdScVal],
  });

  const hostFn = xdr.HostFunction.hostFunctionTypeCreateContractV2(createArgs);

  const account2 = await soroban.getAccount(keypair.publicKey());
  const deployTx = new TransactionBuilder(account2, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.invokeHostFunction({ func: hostFn, auth: [] }))
    .setTimeout(30)
    .build();

  const confirmed = await submitTx(soroban, keypair, deployTx);

  // Extract contract ID from return value
  const retVal = (confirmed as SorobanRpc.Api.GetSuccessfulTransactionResponse).returnValue;
  const contractAddr = retVal ? xdr.ScVal.fromXDR(retVal.toXDR()) : null;
  let contractId = "unknown";
  try {
    contractId = Address.fromScVal(contractAddr!).toString();
  } catch {
    contractId = retVal?.toXDR("hex") ?? "unknown";
  }

  console.log("\n✓ Contract deployed and initialized!");
  console.log(`  Contract ID : ${contractId}`);
  console.log(`\n→ Update .env: VITE_CONSISTENT_SAVING_VERIFIER_CONTRACT_ID=${contractId}`);
}

main().catch(err => { console.error("✗", err.message); process.exit(1); });
