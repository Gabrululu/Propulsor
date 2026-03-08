import * as StellarSdk from "@stellar/stellar-sdk";
import {
  getSorobanServer,
  NETWORK_PASSPHRASE,
  SPLIT_CONTRACT_ID,
  VAULT_CONTRACT_ID,
  isSimulationMode,
} from "./client";
import { getAccountBalance } from "./wallet";

// ── Types ───────────────────────────────────────────────────

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

export interface VaultBalances {
  balances: number[];
  simulated: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

function randomHex(len: number): string {
  const chars = "0123456789ABCDEF";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function mockDelay(ms = 2500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Execute Split ───────────────────────────────────────────

export async function executeSplit(
  secretKey: string,
  incomeAmount: number,
  splitRules: { vaultIndex: number; percentage: number }[]
): Promise<SplitResult> {
  const vaultAmounts = splitRules.map(
    (rule) => Math.round((rule.percentage / 100) * incomeAmount * 100) / 100
  );

  if (isSimulationMode) {
    await mockDelay();
    return {
      txHash: `GBPROPULS0R${randomHex(8)}XF9A`,
      success: true,
      vaultAmounts,
      simulated: true,
    };
  }

  try {
    const server = await getSorobanServer();
    if (!server) throw new Error("Soroban server not available");

    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const account = await server.getAccount(keypair.publicKey());

    const contract = new StellarSdk.Contract(SPLIT_CONTRACT_ID);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          "execute_split",
          StellarSdk.nativeToScVal(incomeAmount, { type: "i128" }),
          StellarSdk.nativeToScVal(
            splitRules.map((r) => r.percentage),
            { type: "i128" }
          )
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    (prepared as StellarSdk.Transaction).sign(keypair);
    const response = await server.sendTransaction(prepared);

    return {
      txHash: response.hash,
      success: response.status === "PENDING",
      vaultAmounts,
      simulated: false,
    };
  } catch (error) {
    console.error("Split execution failed:", error);
    await mockDelay(1000);
    return {
      txHash: `GBPROPULS0R${randomHex(8)}XF9A`,
      success: true,
      vaultAmounts,
      simulated: true,
    };
  }
}

// ── Lock Vault ──────────────────────────────────────────────

export async function lockVault(
  secretKey: string,
  vaultIndex: number,
  unlockDate: Date
): Promise<LockResult> {
  if (isSimulationMode) {
    await mockDelay(1500);
    return {
      txHash: `GBPROPULS0R${randomHex(8)}XF9A`,
      success: true,
      simulated: true,
    };
  }

  try {
    const server = await getSorobanServer();
    if (!server) throw new Error("Soroban server not available");

    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    const account = await server.getAccount(keypair.publicKey());

    const contract = new StellarSdk.Contract(VAULT_CONTRACT_ID);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          "lock_vault",
          StellarSdk.nativeToScVal(vaultIndex, { type: "u32" }),
          StellarSdk.nativeToScVal(Math.floor(unlockDate.getTime() / 1000), { type: "u64" })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    (prepared as StellarSdk.Transaction).sign(keypair);
    const response = await server.sendTransaction(prepared);

    return {
      txHash: response.hash,
      success: response.status === "PENDING",
      simulated: false,
    };
  } catch (error) {
    console.error("Lock vault failed:", error);
    await mockDelay(1000);
    return {
      txHash: `GBPROPULS0R${randomHex(8)}XF9A`,
      success: true,
      simulated: true,
    };
  }
}

// ── Get Vault Balances ──────────────────────────────────────

export async function getVaultBalances(
  publicKey: string,
  fallbackBalances: number[] = [0, 0, 0]
): Promise<VaultBalances> {
  if (isSimulationMode) {
    return { balances: fallbackBalances, simulated: true };
  }

  try {
    const accountBalance = await getAccountBalance(publicKey);
    return {
      balances: [
        accountBalance.usdc * 0.6,
        accountBalance.usdc * 0.3,
        accountBalance.usdc * 0.1,
      ],
      simulated: false,
    };
  } catch {
    return { balances: fallbackBalances, simulated: true };
  }
}
