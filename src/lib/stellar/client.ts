// Network configuration — Stellar Testnet
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";
export const STELLAR_EXPLORER_BASE = "https://stellar.expert/explorer/testnet";
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

// Testnet USDC issuer (Circle testnet)
export const USDC_ASSET_CODE = "USDC";
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// Contract IDs from env (empty = simulation mode)
export const SPLIT_CONTRACT_ID = import.meta.env.VITE_SPLIT_CONTRACT_ID || "";
export const VAULT_CONTRACT_ID = import.meta.env.VITE_VAULT_CONTRACT_ID || "";
export const isSimulationMode = !SPLIT_CONTRACT_ID;

// Lazy-loaded server instances to avoid top-level SDK access issues
let _horizonServer: any = null;
let _sorobanServer: any = null;

export async function getHorizonServer() {
  if (!_horizonServer) {
    const sdk = await import("@stellar/stellar-sdk");
    const HorizonModule = sdk.Horizon ?? (sdk as any).default?.Horizon ?? (sdk as any);
    if (HorizonModule?.Server) {
      _horizonServer = new HorizonModule.Server(HORIZON_URL);
    } else {
      // Fallback: use raw fetch against Horizon REST API
      _horizonServer = createFallbackHorizonClient();
    }
  }
  return _horizonServer;
}

export async function getSorobanServer() {
  if (!_sorobanServer) {
    try {
      const sdk = await import("@stellar/stellar-sdk");
      const SorobanModule = (sdk as any).SorobanRpc ?? (sdk as any).Soroban ?? (sdk as any).default?.SorobanRpc;
      if (SorobanModule?.Server) {
        _sorobanServer = new SorobanModule.Server(SOROBAN_RPC_URL);
      }
    } catch {
      // Soroban server not available
    }
  }
  return _sorobanServer;
}

// Fallback Horizon client using raw fetch (works regardless of SDK version)
function createFallbackHorizonClient() {
  return {
    async loadAccount(publicKey: string) {
      const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
      if (!res.ok) throw new Error("Account not found");
      return res.json();
    },
    async feeStats() {
      const res = await fetch(`${HORIZON_URL}/fee_stats`);
      return res.json();
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
                    async call() {
                      const res = await fetch(
                        `${HORIZON_URL}/accounts/${publicKey}/transactions?limit=${n}&order=${dir}`
                      );
                      if (!res.ok) return { records: [] };
                      const data = await res.json();
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
            stream(opts: { onmessage: (msg: any) => void }) {
              // EventSource streaming
              try {
                const es = new EventSource(
                  `${HORIZON_URL}/accounts/${publicKey}/payments?cursor=now`
                );
                es.onmessage = (event) => {
                  try {
                    const data = JSON.parse(event.data);
                    opts.onmessage(data);
                  } catch {}
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
