/**
 * Propulsor — Soroban contract client
 *
 * Two call patterns:
 *   invoke()   → build / simulate / assemble / sign / submit / poll
 *   simulate() → read-only: build + simulate only, no signing
 *
 * State-changing functions accept a `SignFn` callback so they work with
 * both custodial (PIN-based) and external (Varial/xBull) wallets.
 */

import * as S from "@stellar/stellar-sdk";
import {
  SOROBAN_RPC_URL,
  NETWORK_PASSPHRASE,
  SPLIT_CONTRACT_ID,
  VAULT_CONTRACT_ID,
} from "./client";

// ── Types ────────────────────────────────────────────────────

export type SignFn = (txXdr: string) => Promise<string>;

export type ProgressFn = (msg: string) => void;
export type BeforeSubmitFn = (transaction: {
  hash: string;
  expiresAt: number;
}) => Promise<void>;

export interface SplitRule {
  vault_id: number; // 0 | 1 | 2
  percentage: number; // 1-100, all rules sum to 100
}

export interface VaultBalance {
  vault_id: number;
  balance: bigint; // in stroops
}

export interface VaultLock {
  vault_id: number;
  locked_amount: bigint;
  unlock_timestamp: bigint | null; // unix seconds or null
  goal_amount: bigint | null;
  created_at: bigint;
}

// Legacy compat — pages that existed before this rewrite
export interface SplitResult {
  txHash: string;
  success: boolean;
  vaultAmounts: number[];
  simulated: boolean;
}

export interface LockResult {
  txHash: string;
  success: boolean;
  simulated: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

let _rpcServer: S.rpc.Server | null = null;
function rpcServer(): S.rpc.Server {
  if (!_rpcServer) {
    _rpcServer = new S.rpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
  }
  return _rpcServer;
}

function addressVal(pk: string): S.xdr.ScVal {
  return new S.Address(pk).toScVal();
}

/** Encode a SplitRule struct → ScMap (keys sorted alphabetically). */
function encodeSplitRule(r: SplitRule): S.xdr.ScVal {
  return S.xdr.ScVal.scvMap([
    new S.xdr.ScMapEntry({
      key: S.xdr.ScVal.scvSymbol("percentage"),
      val: S.nativeToScVal(r.percentage, { type: "u32" }),
    }),
    new S.xdr.ScMapEntry({
      key: S.xdr.ScVal.scvSymbol("vault_id"),
      val: S.nativeToScVal(r.vault_id, { type: "u32" }),
    }),
  ]);
}

/** Encode Option<u64>: None → ScVoid, Some(n) → U64 */
function optU64(v: number | null): S.xdr.ScVal {
  return v !== null
    ? S.nativeToScVal(BigInt(v), { type: "u64" })
    : S.xdr.ScVal.scvVoid();
}

/** Encode Option<i128>: None → ScVoid, Some(n) → I128 */
function optI128(v: bigint | null): S.xdr.ScVal {
  return v !== null
    ? S.nativeToScVal(v, { type: "i128" })
    : S.xdr.ScVal.scvVoid();
}

// ── Core: invoke (state-changing) ────────────────────────────

export interface InvokeResult {
  returnValue: S.xdr.ScVal;
  txHash: string;
}

const WALLET_SIGNING_WINDOW_S = 300;
const SEND_RETRIES = 5;
const SEND_RETRY_DELAY_MS = 2000;

/** TRY_AGAIN_LATER means "not queued": usually the account has a transaction in flight. */
async function sendWithRetry(server: S.rpc.Server, tx: S.Transaction) {
  let response = await server.sendTransaction(tx);
  for (let i = 0; response.status === "TRY_AGAIN_LATER" && i < SEND_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, SEND_RETRY_DELAY_MS));
    response = await server.sendTransaction(tx);
  }
  if (response.status === "ERROR") {
    throw new Error(`Envío fallido: ${JSON.stringify(response.errorResult)}`);
  }
  if (response.status === "TRY_AGAIN_LATER") {
    throw new Error("La red está ocupada. Vuelve a intentarlo en unos segundos.");
  }
  return response;
}

export async function invoke(
  contractId: string,
  method: string,
  args: S.xdr.ScVal[],
  publicKey: string,
  signFn: SignFn,
  onProgress?: ProgressFn,
  beforeSubmit?: BeforeSubmitFn,
): Promise<InvokeResult> {
  const server = rpcServer();

  onProgress?.("Simulando transacción en Soroban...");
  const account = await server.getAccount(publicKey);
  const contract = new S.Contract(contractId);

  const tx = new S.TransactionBuilder(account, {
    fee: S.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    // beforeSubmit flows recover an interrupted attempt only once it expires, so
    // keep that wait short. Everything else leaves time to confirm in a wallet.
    .setTimeout(beforeSubmit ? 30 : WALLET_SIGNING_WINDOW_S)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (S.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulación fallida: ${sim.error}`);
  }

  const assembled = S.rpc.assembleTransaction(tx, sim).build();

  onProgress?.("Firmando con tu clave...");
  const signedXdr = await signFn(assembled.toXDR());

  onProgress?.("Enviando a Stellar Testnet...");
  const signedTx = S.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  // Persist the hash BEFORE broadcasting. If persistence fails, nothing is sent.
  const timeBounds =
    "innerTransaction" in signedTx
      ? signedTx.innerTransaction.timeBounds
      : signedTx.timeBounds;
  const hash = Array.from(signedTx.hash(), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  await beforeSubmit?.({ hash, expiresAt: Number(timeBounds?.maxTime ?? 0) });
  const response = await sendWithRetry(server, signedTx as S.Transaction);

  onProgress?.("Confirmando en el ledger...");
  const getResponse = await server.pollTransaction(response.hash, {
    attempts: 30,
  });

  if (getResponse.status !== S.rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transacción fallida con estado: ${getResponse.status}`);
  }

  const shortHash = `${response.hash.slice(0, 8)}...${response.hash.slice(-4)}`;
  onProgress?.(`✓ Ejecutado · ${shortHash}`);

  return {
    returnValue: getResponse.returnValue ?? S.xdr.ScVal.scvVoid(),
    txHash: response.hash,
  };
}

// ── Core: simulate (read-only) ────────────────────────────────

async function simulate(
  contractId: string,
  method: string,
  args: S.xdr.ScVal[],
  publicKey: string,
): Promise<S.xdr.ScVal | null> {
  try {
    const server = rpcServer();
    // Reads are never submitted, so the sequence number is irrelevant and
    // fetching the account would only add an RPC round trip per read.
    const account = new S.Account(publicKey, "0");
    const contract = new S.Contract(contractId);

    const tx = new S.TransactionBuilder(account, {
      fee: S.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (S.rpc.Api.isSimulationError(sim) || !sim.result) return null;
    return sim.result.retval;
  } catch {
    return null;
  }
}

/** Read-only contract call. Returns null if the simulation fails. */
export const readContract = simulate;

/** Submit a transaction that is already signed (e.g. one built by a third party). */
export async function submitSigned(
  signedXdr: string,
  onProgress?: ProgressFn,
): Promise<string> {
  const server = rpcServer();
  const tx = S.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  onProgress?.("Enviando a Stellar Testnet...");
  const response = await sendWithRetry(server, tx as S.Transaction);
  onProgress?.("Confirmando en el ledger...");
  const result = await server.pollTransaction(response.hash, { attempts: 30 });
  if (result.status !== S.rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transacción fallida con estado: ${result.status}`);
  }
  return response.hash;
}

// ── SPLIT PROTOCOL ───────────────────────────────────────────

/**
 * Set the split rules for a user on-chain.
 * Must be called during onboarding before any execute_split.
 */
export async function setRules(
  publicKey: string,
  rules: SplitRule[],
  signFn: SignFn,
  onProgress?: ProgressFn,
  beforeSubmit?: BeforeSubmitFn,
): Promise<string> {
  const rulesVal = S.xdr.ScVal.scvVec(rules.map(encodeSplitRule));
  const { txHash } = await invoke(
    SPLIT_CONTRACT_ID,
    "set_rules",
    [addressVal(publicKey), rulesVal],
    publicKey,
    signFn,
    onProgress,
    beforeSubmit,
  );
  return txHash;
}

/**
 * Distribute income across vaults according to stored rules.
 * income is in stroops (1 USDC = 10_000_000).
 */
export async function executeSplit(
  publicKey: string,
  income: bigint,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<{ txHash: string; balances: VaultBalance[] }> {
  const { returnValue, txHash } = await invoke(
    SPLIT_CONTRACT_ID,
    "execute_split",
    [addressVal(publicKey), S.nativeToScVal(income, { type: "i128" })],
    publicKey,
    signFn,
    onProgress,
  );

  let balances: VaultBalance[] = [];
  try {
    const raw = S.scValToNative(returnValue);
    if (Array.isArray(raw)) {
      balances = raw.map((v) => ({
        vault_id: Number(v.vault_id),
        balance: BigInt(v.balance),
      }));
    }
  } catch {
    // Contract returned unexpected value — balances will be refreshed on next poll
  }

  return { txHash, balances };
}

const lastBalances = new Map<string, VaultBalance[]>();

/** Get on-chain vault balances (read-only). Returns [] on any error. */
export async function getBalances(publicKey: string): Promise<VaultBalance[]> {
  const retval = await simulate(
    SPLIT_CONTRACT_ID,
    "get_balances",
    [addressVal(publicKey)],
    publicKey,
  );
  if (!retval) return [];
  try {
    const raw = S.scValToNative(retval) as Array<{
      balance: bigint;
      vault_id: number;
    }>;
    const balances = raw.map((v) => ({
      vault_id: v.vault_id,
      balance: BigInt(v.balance),
    }));
    lastBalances.set(publicKey, balances);
    return balances;
  } catch {
    return [];
  }
}

/** Last balances read in this session, to paint instantly while revalidating. */
export function getCachedBalances(publicKey: string): VaultBalance[] | undefined {
  return lastBalances.get(publicKey);
}

/** Get configured split rules for a user (read-only). Returns [] on any error. */
export async function getRules(publicKey: string): Promise<SplitRule[]> {
  const retval = await simulate(
    SPLIT_CONTRACT_ID,
    "get_rules",
    [addressVal(publicKey)],
    publicKey,
  );
  if (!retval) return [];
  try {
    const raw = S.scValToNative(retval) as Array<{
      percentage: number;
      vault_id: number;
    }>;
    return raw.map((r) => ({ vault_id: r.vault_id, percentage: r.percentage }));
  } catch {
    return [];
  }
}

/** Let an agent run splits for this user until revoked. */
export async function authorizeAgent(
  publicKey: string,
  agent: string,
  signFn: SignFn,
): Promise<string> {
  const { txHash } = await invoke(
    SPLIT_CONTRACT_ID,
    "authorize_agent",
    [addressVal(publicKey), addressVal(agent)],
    publicKey,
    signFn,
  );
  return txHash;
}

export async function revokeAgent(publicKey: string, signFn: SignFn): Promise<string> {
  const { txHash } = await invoke(
    SPLIT_CONTRACT_ID,
    "revoke_agent",
    [addressVal(publicKey)],
    publicKey,
    signFn,
  );
  return txHash;
}

/** The agent this user authorized. Returns null if none or on any error. */
export async function getAgent(publicKey: string): Promise<string | null> {
  const retval = await simulate(
    SPLIT_CONTRACT_ID,
    "get_agent",
    [addressVal(publicKey)],
    publicKey,
  );
  if (!retval) return null;
  try {
    return S.scValToNative(retval) as string | null;
  } catch {
    return null;
  }
}

// ── TIME VAULT ───────────────────────────────────────────────

/**
 * Lock a vault with a time condition, a goal condition, or both.
 * vault_id: 0 | 1 | 2
 * amount: in stroops
 * unlockTimestamp: unix seconds or null
 * goalAmount: in stroops or null
 */
export async function lockVault(
  publicKey: string,
  vaultId: number,
  amount: bigint,
  unlockTimestamp: number | null,
  goalAmount: bigint | null,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<string> {
  const { txHash } = await invoke(
    VAULT_CONTRACT_ID,
    "lock_vault",
    [
      addressVal(publicKey),
      S.nativeToScVal(vaultId, { type: "u32" }),
      S.nativeToScVal(amount, { type: "i128" }),
      optU64(unlockTimestamp),
      optI128(goalAmount),
    ],
    publicKey,
    signFn,
    onProgress,
  );
  return txHash;
}

/**
 * Returns true if the vault's lock conditions are met (read-only).
 * A vault with no lock returns true.
 */
export async function checkRelease(
  publicKey: string,
  vaultId: number,
): Promise<boolean> {
  const retval = await simulate(
    VAULT_CONTRACT_ID,
    "check_release",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey,
  );
  if (!retval) return false;
  try {
    return S.scValToNative(retval) as boolean;
  } catch {
    return false;
  }
}

/** Release a vault whose conditions are met. Returns the liberated amount in stroops. */
export async function releaseVault(
  publicKey: string,
  vaultId: number,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<{ txHash: string; amount: bigint }> {
  const { returnValue, txHash } = await invoke(
    VAULT_CONTRACT_ID,
    "release_vault",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey,
    signFn,
    onProgress,
  );
  const amount = BigInt(S.scValToNative(returnValue) as bigint);
  return { txHash, amount };
}

/** Add more funds to an existing lock (periodic savings). */
export async function addToLock(
  publicKey: string,
  vaultId: number,
  amount: bigint,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<string> {
  const { txHash } = await invoke(
    VAULT_CONTRACT_ID,
    "add_to_lock",
    [
      addressVal(publicKey),
      S.nativeToScVal(vaultId, { type: "u32" }),
      S.nativeToScVal(amount, { type: "i128" }),
    ],
    publicKey,
    signFn,
    onProgress,
  );
  return txHash;
}

/** Get the full lock state for a vault (read-only). Returns null if no lock. */
export async function getLock(
  publicKey: string,
  vaultId: number,
): Promise<VaultLock | null> {
  const retval = await simulate(
    VAULT_CONTRACT_ID,
    "get_lock",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey,
  );
  if (!retval) return null;
  try {
    const raw = S.scValToNative(retval);
    if (!raw) return null;
    const r = raw as Record<string, unknown>;
    return {
      vault_id: r.vault_id as number,
      locked_amount: BigInt(r.locked_amount as bigint),
      unlock_timestamp:
        r.unlock_timestamp != null
          ? BigInt(r.unlock_timestamp as bigint)
          : null,
      goal_amount:
        r.goal_amount != null ? BigInt(r.goal_amount as bigint) : null,
      created_at: BigInt(r.created_at as bigint),
    };
  } catch {
    return null;
  }
}

/**
 * Seconds remaining until the time lock expires.
 * Negative = already past. 0 = no lock or no time condition.
 */
export async function getTimeRemaining(
  publicKey: string,
  vaultId: number,
): Promise<number> {
  const retval = await simulate(
    VAULT_CONTRACT_ID,
    "get_time_remaining",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey,
  );
  if (!retval) return 0;
  try {
    return Number(S.scValToNative(retval) as bigint);
  } catch {
    return 0;
  }
}

// ── UI Helpers ───────────────────────────────────────────────

const STROOPS_PER_USDC = 10_000_000n;

export function stroopsToUsdc(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_USDC);
}

export function usdcToStroops(usdc: number): bigint {
  return BigInt(Math.round(usdc * Number(STROOPS_PER_USDC)));
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Desbloqueada";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days} días restantes`;
  if (hours > 0) return `${hours} horas restantes`;
  return `${Math.floor(seconds / 60)} minutos restantes`;
}

/** Strict read for recovery: a network failure must never look like missing rules. */
export async function getRulesStrict(publicKey: string): Promise<SplitRule[]> {
  const server = rpcServer();
  const tx = new S.TransactionBuilder(new S.Account(publicKey, "0"), {
    fee: S.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      new S.Contract(SPLIT_CONTRACT_ID).call(
        "get_rules",
        addressVal(publicKey),
      ),
    )
    .setTimeout(30)
    .build();
  const result = await server.simulateTransaction(tx);
  if (S.rpc.Api.isSimulationError(result))
    throw new Error(`Simulation failed: ${result.error}`);
  if (!result.result) throw new Error("Simulation returned no result");
  const rules: unknown = S.scValToNative(result.result.retval);
  if (
    !Array.isArray(rules) ||
    rules.some(
      (r) =>
        !r || !Number.isInteger(r.vault_id) || !Number.isInteger(r.percentage),
    )
  ) {
    throw new Error("Invalid rules response");
  }
  return rules;
}

export async function getSetupTransactionStatus(
  hash: string,
  expiresAt: number,
): Promise<"confirmed" | "failed" | "expired" | "pending"> {
  const result = await rpcServer().getTransaction(hash);
  if (result.status === S.rpc.Api.GetTransactionStatus.SUCCESS)
    return "confirmed";
  if (result.status === S.rpc.Api.GetTransactionStatus.FAILED) return "failed";
  // Use the ledger's clock, not the phone clock. A delayed RPC must not permit a duplicate.
  return expiresAt > 0 && result.latestLedgerCloseTime > expiresAt
    ? "expired"
    : "pending";
}
