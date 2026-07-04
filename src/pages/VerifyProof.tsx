import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Account,
  Contract,
  xdr,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  Keypair,
} from "@stellar/stellar-sdk";
import {
  SOROBAN_RPC_URL,
  NETWORK_PASSPHRASE,
  STELLAR_EXPLORER_BASE,
} from "@/lib/stellar/client";

// ── Types ─────────────────────────────────────────────────────────────────

interface ProofRecord {
  user: string;
  threshold_usdc: bigint;
  ledger: number;
  ledgerDate?: string;
}

type PageState =
  | { status: "loading" }
  | { status: "valid"; record: ProofRecord }
  | { status: "not-found" }
  | { status: "error"; message: string };

// ── Constants ──────────────────────────────────────────────────────────────

const VERIFIER_CONTRACT_ID =
  import.meta.env.VITE_ZK_VERIFIER_CONTRACT_ID ||
  "CAGUCQUMNSOJALPFM3A2T2TBDIDCFUDY3UQA6JIWAN4ZP3COPQ7HP7BU";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

// ── Helpers ───────────────────────────────────────────────────────────────

function hexToBytes32(hex: string): xdr.ScVal {
  if (hex.length !== 64) {
    throw new Error("proof hash must be 32 bytes (64 hex chars)");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return xdr.ScVal.scvBytes(bytes as unknown as Buffer);
}

function formatThreshold(stroops: bigint): string {
  return `$${(Number(stroops) / 1e7).toFixed(2)} USDC`;
}

async function fetchLedgerDate(ledger: number): Promise<string> {
  try {
    const resp = await fetch(`${HORIZON_TESTNET}/ledgers/${ledger}`);
    if (!resp.ok) return "Fecha no disponible";
    const data = await resp.json() as { closed_at: string };
    return new Date(data.closed_at).toLocaleDateString("es-PE", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return "Fecha no disponible";
  }
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Component ─────────────────────────────────────────────────────────────

const VerifyProof = () => {
  const { proofHash } = useParams<{ proofHash: string }>();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!proofHash) {
      setState({ status: "not-found" });
      return;
    }

    let cancelled = false;

    async function fetchRecord() {
      try {
        if (VERIFIER_CONTRACT_ID === "TBD_AFTER_DEPLOY") {
          setState({
            status: "error",
            message: "Contrato verificador no desplegado aún. Actualiza VITE_ZK_VERIFIER_CONTRACT_ID.",
          });
          return;
        }

        const soroban  = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
        const contract = new Contract(VERIFIER_CONTRACT_ID);

        // Read-only simulation: call get_proof(nullifier)
        // Use a throwaway keypair — no signing needed for read-only
        const ephemeral = Keypair.random();
        const account   = await soroban.getAccount(ephemeral.publicKey()).catch(() => null);

        if (!account) {
          const fakeAccount = new Account(ephemeral.publicKey(), "0");
          const tx = new TransactionBuilder(
            fakeAccount,
            { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }
          )
            .addOperation(contract.call("get_proof", hexToBytes32(proofHash!)))
            .setTimeout(30)
            .build();

          const sim = await soroban.simulateTransaction(tx);
          if (SorobanRpc.Api.isSimulationError(sim)) {
            if (!cancelled) setState({ status: "not-found" });
            return;
          }

          const result = sim as SorobanRpc.Api.SimulateTransactionSuccessResponse;
          if (!result.result?.retval) {
            if (!cancelled) setState({ status: "not-found" });
            return;
          }

          const native = scValToNative(result.result.retval);
          if (!native || native === null) {
            if (!cancelled) setState({ status: "not-found" });
            return;
          }

          const rec = native as { user: string; threshold_usdc: bigint; ledger: number };
          const ledgerDate = await fetchLedgerDate(rec.ledger);
          if (!cancelled) setState({ status: "valid", record: { ...rec, ledgerDate } });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          // Distinguish "not found" from network error
          if (msg.includes("not found") || msg.includes("null") || msg.includes("None")) {
            setState({ status: "not-found" });
          } else {
            setState({ status: "error", message: msg });
          }
        }
      }
    }

    fetchRecord();
    return () => { cancelled = true; };
  }, [proofHash]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        {/* Brand */}
        <div>
          <Link to="/" className="font-mono text-xs text-muted-foreground tracking-widest hover:text-foreground transition-colors">
            ← PROPULSOR
          </Link>
          <h1 className="text-2xl font-bold mt-3">
            <span className="text-foreground">VERIFICAR </span>
            <span className="text-primary">PRUEBA ZK</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Verificación pública · Sin autenticación requerida
          </p>
        </div>

        {/* Proof hash display */}
        {proofHash && (
          <div className="bg-muted rounded-sm px-3 py-2">
            <p className="text-[0.6rem] text-muted-foreground font-mono uppercase tracking-wider mb-1">
              Hash de la prueba
            </p>
            <p className="font-mono text-xs text-foreground break-all">{proofHash}</p>
          </div>
        )}

        {/* States */}
        {state.status === "loading" && (
          <div className="flex items-center gap-3 p-4 bg-card rounded-sm border border-border">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm font-mono text-muted-foreground">
              Consultando contrato en Stellar...
            </span>
          </div>
        )}

        {state.status === "valid" && (
          <div className="space-y-4">
            <div className="p-4 bg-card rounded-sm border border-secondary/50">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-foreground">Prueba válida</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Verificada on-chain en Stellar Testnet
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-sm p-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Cuenta</span>
                <a
                  href={`${STELLAR_EXPLORER_BASE}/account/${state.record.user}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary hover:underline"
                >
                  {truncateAddress(state.record.user)}
                </a>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Umbral probado</span>
                <span className="text-primary font-bold">
                  ≥ {formatThreshold(state.record.threshold_usdc)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Fecha aprox.</span>
                <span className="text-foreground">{state.record.ledgerDate ?? "..."}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Ledger</span>
                <span className="text-foreground">#{state.record.ledger.toLocaleString()}</span>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-sm">
              <p className="text-[0.65rem] text-muted-foreground font-mono leading-relaxed">
                Esta prueba criptográfica garantiza que la cuenta indicada tenía un balance
                de vault_2 ≥ {formatThreshold(state.record.threshold_usdc)} en el ledger #{state.record.ledger.toLocaleString()}.
                El balance exacto nunca fue revelado (Groth16 / BLS12-381).
              </p>
            </div>
          </div>
        )}

        {state.status === "not-found" && (
          <div className="space-y-4">
            <div className="p-4 bg-card rounded-sm border border-destructive/30">
              <div className="flex items-start gap-3">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="font-bold text-foreground">Prueba no encontrada</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    El hash no corresponde a ninguna prueba verificada en este contrato.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Posibles causas: hash incorrecto, prueba expirada (TTL), o contrato incorrecto.
            </p>
          </div>
        )}

        {state.status === "error" && (
          <div className="p-4 bg-card rounded-sm border border-border">
            <p className="text-sm text-destructive font-mono">{state.message}</p>
          </div>
        )}

        {/* ZK explanation */}
        <div className="pt-2 border-t border-border">
          <p className="text-[0.6rem] text-muted-foreground font-mono leading-relaxed">
            Verificado con <span className="text-foreground">Groth16 / BLS12-381</span> (Soroban Protocol 22).
            El contrato ProofOfVaultVerifier realiza el pairing check
            <span className="text-foreground"> e(-A,B)·e(α,β)·e(vk_x,γ)·e(C,δ) = 1</span>
            enteramente on-chain. Código abierto en el repositorio de Propulsor.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyProof;
