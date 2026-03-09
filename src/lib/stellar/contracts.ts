/**
 * Propulsor — Soroban contract client
 *
 * Two call patterns:
 *   invoke()   → build / simulate / assemble / sign / submit / poll
 *   simulate() → read-only: build + simulate only, no signing
 *
 * State-changing functions accept a `SignFn` callback so they work with
 * both custodial (PIN-based) and external (Freighter/xBull) wallets.
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

export interface SplitRule {
  vault_id: number;   // 0 | 1 | 2
  percentage: number; // 1-100, all rules sum to 100
}

export interface VaultBalance {
  vault_id: number;
  balance: bigint;  // in stroops
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

function rpcServer(): S.rpc.Server {
  return new S.rpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
}
...
async function simulate(
  contractId: string,
  method: string,
  args: S.xdr.ScVal[],
  publicKey: string
): Promise<S.xdr.ScVal | null> {
  try {
    const server = rpcServer();
    const account = await server.getAccount(publicKey);
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

// ── SPLIT PROTOCOL ───────────────────────────────────────────

/**
 * Set the split rules for a user on-chain.
 * Must be called during onboarding before any execute_split.
 */
export async function setRules(
  publicKey: string,
  rules: SplitRule[],
  signFn: SignFn,
  onProgress?: ProgressFn
): Promise<string> {
  const rulesVal = S.xdr.ScVal.scvVec(rules.map(encodeSplitRule));
  const { txHash } = await invoke(
    SPLIT_CONTRACT_ID,
    "set_rules",
    [addressVal(publicKey), rulesVal],
    publicKey,
    signFn,
    onProgress
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
  onProgress?: ProgressFn
): Promise<{ txHash: string; balances: VaultBalance[] }> {
  const { returnValue, txHash } = await invoke(
    SPLIT_CONTRACT_ID,
    "execute_split",
    [addressVal(publicKey), S.nativeToScVal(income, { type: "i128" })],
    publicKey,
    signFn,
    onProgress
  );

  const raw = S.scValToNative(returnValue) as Array<{ balance: bigint; vault_id: number }>;
  const balances: VaultBalance[] = raw.map((v) => ({
    vault_id: v.vault_id,
    balance: BigInt(v.balance),
  }));

  return { txHash, balances };
}

/** Get on-chain vault balances (read-only). Returns [] on any error. */
export async function getBalances(publicKey: string): Promise<VaultBalance[]> {
  const retval = await simulate(SPLIT_CONTRACT_ID, "get_balances", [addressVal(publicKey)], publicKey);
  if (!retval) return [];
  try {
    const raw = S.scValToNative(retval) as Array<{ balance: bigint; vault_id: number }>;
    return raw.map((v) => ({ vault_id: v.vault_id, balance: BigInt(v.balance) }));
  } catch {
    return [];
  }
}

/** Get configured split rules for a user (read-only). Returns [] on any error. */
export async function getRules(publicKey: string): Promise<SplitRule[]> {
  const retval = await simulate(SPLIT_CONTRACT_ID, "get_rules", [addressVal(publicKey)], publicKey);
  if (!retval) return [];
  try {
    const raw = S.scValToNative(retval) as Array<{ percentage: number; vault_id: number }>;
    return raw.map((r) => ({ vault_id: r.vault_id, percentage: r.percentage }));
  } catch {
    return [];
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
  onProgress?: ProgressFn
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
    onProgress
  );
  return txHash;
}

/**
 * Returns true if the vault's lock conditions are met (read-only).
 * A vault with no lock returns true.
 */
export async function checkRelease(publicKey: string, vaultId: number): Promise<boolean> {
  const retval = await simulate(
    VAULT_CONTRACT_ID,
    "check_release",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey
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
  onProgress?: ProgressFn
): Promise<{ txHash: string; amount: bigint }> {
  const { returnValue, txHash } = await invoke(
    VAULT_CONTRACT_ID,
    "release_vault",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey,
    signFn,
    onProgress
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
  onProgress?: ProgressFn
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
    onProgress
  );
  return txHash;
}

/** Get the full lock state for a vault (read-only). Returns null if no lock. */
export async function getLock(publicKey: string, vaultId: number): Promise<VaultLock | null> {
  const retval = await simulate(
    VAULT_CONTRACT_ID,
    "get_lock",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey
  );
  if (!retval) return null;
  try {
    const raw = S.scValToNative(retval);
    if (!raw) return null;
    const r = raw as Record<string, unknown>;
    return {
      vault_id: r.vault_id as number,
      locked_amount: BigInt(r.locked_amount as bigint),
      unlock_timestamp: r.unlock_timestamp != null ? BigInt(r.unlock_timestamp as bigint) : null,
      goal_amount: r.goal_amount != null ? BigInt(r.goal_amount as bigint) : null,
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
export async function getTimeRemaining(publicKey: string, vaultId: number): Promise<number> {
  const retval = await simulate(
    VAULT_CONTRACT_ID,
    "get_time_remaining",
    [addressVal(publicKey), S.nativeToScVal(vaultId, { type: "u32" })],
    publicKey
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
