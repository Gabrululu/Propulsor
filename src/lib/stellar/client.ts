// Network configuration — Stellar (defaults to Testnet, overridable via env)
export const STELLAR_NETWORK = import.meta.env.VITE_STELLAR_NETWORK || "TESTNET";
export const HORIZON_URL =
  import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org";
export const SOROBAN_RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";
export const STELLAR_EXPLORER_BASE = "https://stellar.expert/explorer/testnet";
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

// Testnet USDC issuer (Circle testnet)
export const USDC_ASSET_CODE = "USDC";
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// SEP-24 fiat on-ramp anchor. This is Stellar Development Foundation's public
// reference anchor for testing the SEP-24 interactive deposit/withdraw flow —
// its USDC happens to share Propulsor's own testnet USDC issuer above, so a
// completed deposit lands as spendable balance in the app immediately. Swap
// for a licensed anchor's home domain (KYC/banking coordination required)
// before using this in production.
export const SEP24_HOME_DOMAIN = "testanchor.stellar.org";

// Contract IDs — Soroban Testnet deployments
// Fallback to env vars for local override, but default to deployed contract IDs
export const SPLIT_CONTRACT_ID =
  import.meta.env.VITE_SPLIT_CONTRACT_ID || "CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY";
export const VAULT_CONTRACT_ID =
  import.meta.env.VITE_VAULT_CONTRACT_ID || "CC73UGT72A2MOZOSK6WFWMMIL32OJPJSPKEBFNBLK2GZJYNORERTSSWX";
export const isSimulationMode = !SPLIT_CONTRACT_ID;

export interface HorizonTxRecord {
  id: string;
  hash: string;
  created_at: string;
  operation_count: number;
  successful: boolean;
  memo?: string;
}

interface HorizonFeeStats {
  fee_charged: { mode: string };
}

interface HorizonClient {
  loadAccount(publicKey: string): Promise<unknown>;
  feeStats(): Promise<HorizonFeeStats>;
  ledgers(): { limit(n: number): { call(): Promise<unknown> } };
  transactions(): {
    forAccount(publicKey: string): {
      order(dir: string): {
        limit(n: number): { call(): Promise<{ records: HorizonTxRecord[] }> };
      };
    };
  };
  payments(): {
    forAccount(publicKey: string): {
      stream(opts: { onmessage: (msg: unknown) => void }): () => void;
    };
  };
}

interface SdkModuleShape {
  Horizon?: { Server?: new (url: string) => HorizonClient };
  SorobanRpc?: { Server?: new (url: string) => unknown };
  Soroban?: { Server?: new (url: string) => unknown };
  default?: {
    Horizon?: { Server?: new (url: string) => HorizonClient };
    SorobanRpc?: { Server?: new (url: string) => unknown };
  };
}

// Lazy-loaded server instances to avoid top-level SDK access issues
let _horizonServer: HorizonClient | null = null;
let _sorobanServer: unknown = null;

export async function getHorizonServer(): Promise<HorizonClient> {
  if (!_horizonServer) {
    const sdk = await import("@stellar/stellar-sdk") as unknown as SdkModuleShape;
    const HorizonModule = sdk.Horizon ?? sdk.default?.Horizon;
    if (HorizonModule?.Server) {
      _horizonServer = new HorizonModule.Server(HORIZON_URL);
    } else {
      // Fallback: use raw fetch against Horizon REST API
      _horizonServer = createFallbackHorizonClient();
    }
  }
  return _horizonServer;
}

export async function getSorobanServer(): Promise<unknown> {
  if (!_sorobanServer) {
    try {
      const sdk = await import("@stellar/stellar-sdk") as unknown as SdkModuleShape;
      const SorobanModule = sdk.SorobanRpc ?? sdk.Soroban ?? sdk.default?.SorobanRpc;
      if (SorobanModule?.Server) {
        _sorobanServer = new SorobanModule.Server(SOROBAN_RPC_URL);
      }
    } catch { /* Soroban server not available */ }
  }
  return _sorobanServer;
}

// Fallback Horizon client using raw fetch (works regardless of SDK version)
function createFallbackHorizonClient(): HorizonClient {
  return {
    async loadAccount(publicKey: string) {
      const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
      if (!res.ok) throw new Error("Account not found");
      return res.json();
    },
    async feeStats() {
      const res = await fetch(`${HORIZON_URL}/fee_stats`);
      return res.json() as Promise<HorizonFeeStats>;
    },
    ledgers() {
      return {
        limit(n: number) {
          return {
            async call() {
              const res = await fetch(`${HORIZON_URL}/ledgers?limit=${n}&order=desc`);
              return res.json();
            }
          };
        }
      };
    },
    transactions() {
      return {
        forAccount(publicKey: string) {
          return {
            order(dir: string) {
              return {
                limit(n: number) {
                  return {
                    async call(): Promise<{ records: HorizonTxRecord[] }> {
                      const res = await fetch(
                        `${HORIZON_URL}/accounts/${publicKey}/transactions?limit=${n}&order=${dir}`
                      );
                      if (!res.ok) return { records: [] };
                      const data = await res.json() as { _embedded?: { records?: HorizonTxRecord[] } };
                      return { records: data._embedded?.records ?? [] };
                    }
                  };
                }
              };
            }
          };
        }
      };
    },
    payments() {
      return {
        forAccount(publicKey: string) {
          return {
            stream(opts: { onmessage: (msg: unknown) => void }) {
              // EventSource streaming
              try {
                const es = new EventSource(
                  `${HORIZON_URL}/accounts/${publicKey}/payments?cursor=now`
                );
                es.onmessage = (event) => {
                  try {
                    const data: unknown = JSON.parse(event.data as string);
                    opts.onmessage(data);
                  } catch { /* JSON parse failed */ }
                };
                return () => es.close();
              } catch {
                return () => {};
              }
            }
          };
        }
      };
    },
  };
}
