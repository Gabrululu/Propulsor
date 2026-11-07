import { rpc, Address, xdr } from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
const config = Object.fromEntries(
  readFileSync(new URL("../.env.example", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("VITE_"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const server = new rpc.Server(
  process.env.VITE_SOROBAN_RPC_URL || config.VITE_SOROBAN_RPC_URL,
  { timeout: 15000 },
);
const names = ["SPLIT", "VAULT", "ZK_VERIFIER", "CONSISTENT_SAVING_VERIFIER"];
const network = await server.getNetwork();
const ledger = await server.getLatestLedger();
console.log(
  JSON.stringify({
    network,
    ledger: {
      sequence: ledger.sequence,
      protocolVersion: ledger.protocolVersion,
      closeTime: ledger.closeTime,
    },
  }),
);
let missing = false;
for (const name of names) {
  const id =
    process.env[`VITE_${name}_CONTRACT_ID`] ||
    config[`VITE_${name}_CONTRACT_ID`];
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(id).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
  const result = await server.getLedgerEntries(key);
  const exists = result.entries.length === 1;
  console.log(JSON.stringify({ contract: name, id, available: exists }));
  if (!exists) missing = true;
}
if (missing) process.exitCode = 1;

// Optional integration check uses a fresh, disposable Testnet account only.
// It never loads application/user secrets or touches an existing user's rules.
if (process.argv.includes("--smoke")) {
  const {
    Keypair,
    Networks,
    Contract,
    TransactionBuilder,
    BASE_FEE,
    nativeToScVal,
    scValToNative,
  } = await import("@stellar/stellar-sdk");
  if (network.passphrase !== Networks.TESTNET || missing)
    throw new Error("Smoke check requires Testnet and all contracts available");
  const signer = Keypair.random();
  const publicKey = signer.publicKey();
  let funded = false;
  for (let attempt = 0; attempt < 3 && !funded; attempt++) {
    try {
      const funding = await fetch(
        `https://friendbot.stellar.org/?addr=${publicKey}`,
        { signal: AbortSignal.timeout(20000) },
      );
      funded = funding.ok;
    } catch {}
    if (!funded) {
      try {
        await server.getAccount(publicKey);
        funded = true;
      } catch {}
    }
    if (!funded && attempt < 2)
      await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!funded)
    throw new Error(
      "Friendbot unavailable after 3 attempts; no transaction submitted",
    );
  const address = new Address(publicKey).toScVal();
  async function transaction(contractName, method, args) {
    const account = await server.getAccount(publicKey);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        new Contract(config[`VITE_${contractName}_CONTRACT_ID`]).call(
          method,
          ...args,
        ),
      )
      .setTimeout(30)
      .build();
  }
  const rules = [60, 30, 10].map(
    (percentage, vault_id) =>
      new Map([
        ["percentage", nativeToScVal(percentage, { type: "u32" })],
        ["vault_id", nativeToScVal(vault_id, { type: "u32" })],
      ]),
  );
  const encodedRules = xdr.ScVal.scvVec(
    rules.map((rule) =>
      xdr.ScVal.scvMap(
        [...rule].map(
          ([key, val]) =>
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val }),
        ),
      ),
    ),
  );
  const tx = await transaction("SPLIT", "set_rules", [address, encodedRules]);
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER")
    throw new Error(`Test submission ${sent.status}`);
  let confirmed;
  for (let attempt = 0; attempt < 20; attempt++) {
    confirmed = await server.getTransaction(sent.hash);
    if (confirmed.status !== "NOT_FOUND") break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (confirmed?.status !== "SUCCESS")
    throw new Error(`Test transaction ${confirmed?.status}`);
  console.log(
    JSON.stringify({
      check: "set_rules",
      status: confirmed.status,
      transaction: sent.hash,
      account: publicKey,
    }),
  );
  for (const [name, method, args] of [
    ["SPLIT", "get_rules", [address]],
    ["VAULT", "check_release", [address, nativeToScVal(0, { type: "u32" })]],
    ["ZK_VERIFIER", "is_used", [xdr.ScVal.scvBytes(new Uint8Array(32))]],
    [
      "CONSISTENT_SAVING_VERIFIER",
      "is_used",
      [xdr.ScVal.scvBytes(new Uint8Array(32))],
    ],
  ]) {
    const response = await server.simulateTransaction(
      await transaction(name, method, args),
    );
    if (rpc.Api.isSimulationError(response) || !response.result)
      throw new Error(`${name}.${method}: simulation failed`);
    console.log(
      JSON.stringify({
        check: `${name}.${method}`,
        result: scValToNative(response.result.retval),
      }),
    );
  }
}
