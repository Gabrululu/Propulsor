export { getHorizonServer, getSorobanServer, NETWORK_PASSPHRASE, HORIZON_URL, SOROBAN_RPC_URL, STELLAR_EXPLORER_BASE, isSimulationMode, SPLIT_CONTRACT_ID, VAULT_CONTRACT_ID } from "./client";
export { generateKeypair, fundTestnetAccount, getAccountBalance, encryptSecretKey, decryptSecretKey, truncateAddress } from "./wallet";
export type { AccountBalances } from "./wallet";
export { executeSplit, lockVault, getVaultBalances } from "./contracts";
export type { SplitResult, LockResult, VaultBalances } from "./contracts";
