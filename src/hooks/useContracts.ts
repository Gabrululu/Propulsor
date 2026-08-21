/**
 * useContracts — binds Soroban contract functions to the active wallet.
 *
 * Handles the two signing paths transparently:
 *   • custodial  → decrypts secret with PIN via loadEncryptedSecret + signCustodial
 *   • external   → delegates to wallet-kit (Freighter, xBull, etc.)
 *
 * Usage:
 *   const { getBalances, executeSplit, lockVault, releaseVault } = useContracts();
 */

import { useSigner } from "./useSigner";
import type { ProgressFn, SplitRule } from "@/lib/stellar/contracts";
import {
  setRules,
  executeSplit,
  getBalances,
  getRules,
  lockVault,
  checkRelease,
  releaseVault,
  addToLock,
  getLock,
  getTimeRemaining,
} from "@/lib/stellar/contracts";

export function useContracts() {
  const { publicKey, makeSign } = useSigner();

  return {
    publicKey,

    // ── read-only (no PIN) ──────────────────────────────────
    getBalances: () => {
      if (!publicKey) return Promise.resolve([]);
      return getBalances(publicKey);
    },
    getRules: () => {
      if (!publicKey) return Promise.resolve([]);
      return getRules(publicKey);
    },
    checkRelease: (vaultId: number) => {
      if (!publicKey) return Promise.resolve(false);
      return checkRelease(publicKey, vaultId);
    },
    getLock: (vaultId: number) => {
      if (!publicKey) return Promise.resolve(null);
      return getLock(publicKey, vaultId);
    },
    getTimeRemaining: (vaultId: number) => {
      if (!publicKey) return Promise.resolve(0);
      return getTimeRemaining(publicKey, vaultId);
    },

    // ── state-changing (PIN for custodial) ─────────────────
    setRules: (rules: SplitRule[], pin?: string, onProgress?: ProgressFn) => {
      if (!publicKey) throw new Error("Wallet no conectada");
      return setRules(publicKey, rules, makeSign(pin), onProgress);
    },
    executeSplit: (income: bigint, pin?: string, onProgress?: ProgressFn) => {
      if (!publicKey) throw new Error("Wallet no conectada");
      return executeSplit(publicKey, income, makeSign(pin), onProgress);
    },
    lockVault: (
      vaultId: number,
      amount: bigint,
      unlockTimestamp: number | null,
      goalAmount: bigint | null,
      pin?: string,
      onProgress?: ProgressFn
    ) => {
      if (!publicKey) throw new Error("Wallet no conectada");
      return lockVault(publicKey, vaultId, amount, unlockTimestamp, goalAmount, makeSign(pin), onProgress);
    },
    releaseVault: (vaultId: number, pin?: string, onProgress?: ProgressFn) => {
      if (!publicKey) throw new Error("Wallet no conectada");
      return releaseVault(publicKey, vaultId, makeSign(pin), onProgress);
    },
    addToLock: (vaultId: number, amount: bigint, pin?: string, onProgress?: ProgressFn) => {
      if (!publicKey) throw new Error("Wallet no conectada");
      return addToLock(publicKey, vaultId, amount, makeSign(pin), onProgress);
    },
  };
}
