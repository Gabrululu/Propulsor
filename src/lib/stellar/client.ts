import * as StellarSdk from "@stellar/stellar-sdk";

// Network configuration — Stellar Testnet
export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";
export const STELLAR_EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

// Testnet USDC issuer (Circle testnet)
export const USDC_ASSET_CODE = "USDC";
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// Horizon server instance
export const horizonServer = new StellarSdk.Horizon.Server(HORIZON_URL);

// Soroban RPC server instance
export const sorobanServer = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC_URL);

// Contract IDs from env (empty = simulation mode)
export const SPLIT_CONTRACT_ID = import.meta.env.VITE_SPLIT_CONTRACT_ID || "";
export const VAULT_CONTRACT_ID = import.meta.env.VITE_VAULT_CONTRACT_ID || "";

export const isSimulationMode = !SPLIT_CONTRACT_ID;
