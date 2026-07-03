import { useState, useCallback } from "react";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useContracts } from "@/hooks/useContracts";
import {
  SOROBAN_RPC_URL,
  NETWORK_PASSPHRASE,
  STELLAR_EXPLORER_BASE,
} from "@/lib/stellar/client";
import {
  Contract,
  Address,
  xdr,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
} from "@stellar/stellar-sdk";

// ── Types ─────────────────────────────────────────────────────────────────

type ProofState =
  | { status: "idle" }
  | { status: "fetching-balance" }
  | { status: "generating" }
  | { status: "submitting" }
  | { status: "done"; proofHash: string; txHash: string; thresholdUsdc: number }
  | { status: "error"; message: string };

// ── Constants ──────────────────────────────────────────────────────────────

// Deployed ProofOfVaultVerifier contract on Stellar Testnet
// Update after deploying with: stellar contract deploy ...
const VERIFIER_CONTRACT_ID =
  import.meta.env.VITE_ZK_VERIFIER_CONTRACT_ID ||
  "CAGUCQUMNSOJALPFM3A2T2TBDIDCFUDY3UQA6JIWAN4ZP3COPQ7HP7BU";

// ── Helpers ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bigintToHex96(n: bigint): string {
  return n.toString(16).padStart(96, "0");
}

function bigintToHex32(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

// G1 point [x, y] decimal strings → 96-byte hex (uncompressed big-endian)
function g1ToHex(x: string, y: string): string {
  return bigintToHex96(BigInt(x)) + bigintToHex96(BigInt(y));
}

// Pre-negate G1 y-coordinate (neg_y = p - y) for the pairing check
const BLS_FP_PRIME = 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
function negateG1(x: string, y: string): string {
  return bigintToHex96(BigInt(x)) + bigintToHex96(BLS_FP_PRIME - BigInt(y));
}

// G2 point: snarkjs Fp2 = [c0, c1] (index 0 = real); IETF/blst = c1 || c0
function g2ToHex(c0x: string, c1x: string, c0y: string, c1y: string): string {
  return bigintToHex96(BigInt(c1x)) + bigintToHex96(BigInt(c0x)) +
         bigintToHex96(BigInt(c1y)) + bigintToHex96(BigInt(c0y));
}

// Public signal (threshold) → 32-byte Fr hex
function signalToFr32(signal: string): string {
  return bigintToHex32(BigInt(signal));
}

function hexToScBytesN(hex: string): xdr.ScVal {
  return xdr.ScVal.scvBytes(hexToBytes(hex));
}

// ── Component ─────────────────────────────────────────────────────────────

const ZKProofPanel = () => {
  const { publicKey, signTransaction, mode } = useWallet();
  const contracts = useContracts();

  const [thresholdInput, setThresholdInput] = useState("50");
  const [state, setState] = useState<ProofState>({ status: "idle" });

  const stepMsg = (s: ProofState): string => {
    switch (s.status) {
      case "fetching-balance": return "Leyendo balance de vault_2...";
      case "generating":       return "Generando prueba ZK en tu dispositivo...";
      case "submitting":       return "Enviando prueba a Stellar Testnet...";
      default: return "";
    }
  };

  const generate = useCallback(async () => {
    if (!publicKey) return;

    const thresholdUsdc = parseFloat(thresholdInput);
    if (isNaN(thresholdUsdc) || thresholdUsdc <= 0) {
      setState({ status: "error", message: "Ingresa un umbral válido mayor a 0" });
      return;
    }
    const thresholdStroops = BigInt(Math.round(thresholdUsdc * 1e7));

    try {
      // 1. Fetch vault_2 balance from Soroban (stays in browser, never sent anywhere)
      setState({ status: "fetching-balance" });
      const balances = await contracts.getBalances(publicKey);
      const vault2 = balances.find(b => b.vault_id === 2);
      const balanceStroops = vault2?.balance ?? 0n;

      if (balanceStroops < thresholdStroops) {
        setState({
          status: "error",
          message: `Balance de vault_2 ($${(Number(balanceStroops) / 1e7).toFixed(2)} USDC) es menor al umbral ($${thresholdUsdc} USDC). No se puede generar la prueba.`,
        });
        return;
      }

      // 2. Load circuit artifacts (compiled .wasm + .zkey served from /zk/)
      setState({ status: "generating" });

      // Dynamic import of snarkjs (WASM-based, runs entirely in browser)
      const snarkjs = await import("snarkjs");

      const wasmResp = await fetch("/zk/circuit.wasm");
      const zkeyResp = await fetch("/zk/circuit.zkey");

      if (!wasmResp.ok || !zkeyResp.ok) {
        throw new Error(
          "Archivos del circuito no encontrados. Ejecuta `make setup` en zk/circuits/proof_of_vault/ y copia los artefactos a public/zk/"
        );
      }

      const wasmBuffer = new Uint8Array(await wasmResp.arrayBuffer());
      const zkeyBuffer = new Uint8Array(await zkeyResp.arrayBuffer());

      const input = {
        actual_balance: balanceStroops.toString(),
        threshold:      thresholdStroops.toString(),
      };

      // Proof generation happens entirely off-chain in the browser
      const { proof, publicSignals } = await (snarkjs as unknown as {
        groth16: { fullProve: (input: Record<string, string>, wasm: Uint8Array, zkey: Uint8Array) => Promise<{ proof: unknown; publicSignals: string[] }> }
      }).groth16.fullProve(input, wasmBuffer, zkeyBuffer);

      const p = proof as {
        pi_a: [string, string, string];
        pi_b: [[string, string], [string, string], [string, string]];
        pi_c: [string, string, string];
      };

      // Encode for Soroban — client pre-negates A
      const negAHex       = negateG1(p.pi_a[0], p.pi_a[1]);
      const bHex          = g2ToHex(p.pi_b[0][0], p.pi_b[0][1], p.pi_b[1][0], p.pi_b[1][1]);
      const cHex          = g1ToHex(p.pi_c[0], p.pi_c[1]);
      const thresholdFr32 = signalToFr32(publicSignals[0]);

      // 3. Submit to ProofOfVaultVerifier on Stellar
      setState({ status: "submitting" });

      const soroban  = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
      const contract = new Contract(VERIFIER_CONTRACT_ID);
      const account  = await soroban.getAccount(publicKey);

      const proofScVal = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("a"), val: hexToScBytesN(negAHex) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("b"), val: hexToScBytesN(bHex) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("c"), val: hexToScBytesN(cHex) }),
      ]);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call(
          "verify_proof",
          new Address(publicKey).toScVal(),
          proofScVal,
          hexToScBytesN(thresholdFr32),
        ))
        .setTimeout(30)
        .build();

      const sim = await soroban.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(sim)) {
        throw new Error(`Simulación falló: ${sim.error}`);
      }

      const assembled = SorobanRpc.assembleTransaction(tx, sim).build();
      const signedXdr = await signTransaction(assembled.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await soroban.sendTransaction(signedTx);
      if (sendResult.status === "ERROR") {
        throw new Error(`Envío fallido: ${JSON.stringify(sendResult.errorResult)}`);
      }

      // Poll for confirmation
      let confirmed = await soroban.getTransaction(sendResult.hash);
      let attempts = 0;
      while (confirmed.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND && attempts++ < 30) {
        await new Promise(r => setTimeout(r, 1000));
        confirmed = await soroban.getTransaction(sendResult.hash);
      }

      if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transacción fallida (estado: ${confirmed.status})`);
      }

      // Extract proof_hash (nullifier) returned by the contract
      const nullifierRaw = scValToNative(confirmed.returnValue!) as Uint8Array;
      const proofHash = bytesToHex(nullifierRaw);

      setState({
        status: "done",
        proofHash,
        txHash: sendResult.hash,
        thresholdUsdc,
      });

    } catch (err: unknown) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }, [publicKey, thresholdInput, contracts, signTransaction]);

  if (!publicKey) return null;

  return (
    <div className="rounded-sm border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div>
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-primary">
          → PRUEBA ZK · PRIVACIDAD
        </span>
        <h3 className="text-lg font-bold text-foreground mt-1">
          Proof of Vault
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Demuestra que tu vault de ahorro supera un umbral <span className="text-foreground font-semibold">sin revelar el balance exacto</span>.
          La prueba se genera en tu dispositivo con Groth16/BLS12-381 y se verifica on-chain en Stellar.
        </p>
      </div>

      {/* Input */}
      {(state.status === "idle" || state.status === "error") && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">
              Umbral mínimo (USDC)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-sm">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={thresholdInput}
                onChange={e => setThresholdInput(e.target.value)}
                className="flex-1 bg-muted border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="50.00"
              />
              <span className="text-muted-foreground font-mono text-xs">USDC</span>
            </div>
            <p className="text-[0.6rem] text-muted-foreground mt-1">
              Probarás que tienes al menos ${thresholdInput} USDC en vault_2
            </p>
          </div>

          {state.status === "error" && (
            <div className="p-3 rounded-sm border border-destructive/30 bg-destructive/10">
              <p className="text-xs text-destructive font-mono">{state.message}</p>
            </div>
          )}

          <button
            onClick={generate}
            className="btn-pink w-full rounded-sm text-sm"
          >
            → Generar prueba ZK
          </button>
        </div>
      )}

      {/* Loading states */}
      {(state.status === "fetching-balance" || state.status === "generating" || state.status === "submitting") && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sm text-foreground font-mono">{stepMsg(state)}</span>
          </div>
          <div className="bg-muted rounded-sm p-3 font-mono text-[0.65rem] text-muted-foreground leading-6 space-y-1">
            <p className={state.status !== "idle" ? "text-secondary" : "opacity-40"}>
              {state.status === "fetching-balance" ? "▸" : "✓"} Leyendo balance de vault_2...
            </p>
            <p className={
              state.status === "generating" ? "text-secondary" :
              state.status === "submitting" ? "text-primary" :
              "opacity-40"
            }>
              {state.status === "generating" ? "▸" : state.status === "submitting" ? "✓" : "○"} Generando prueba off-chain (WASM)...
            </p>
            <p className={state.status === "submitting" ? "text-secondary" : "opacity-40"}>
              {state.status === "submitting" ? "▸" : "○"} Verificando on-chain en Stellar...
            </p>
          </div>
          {state.status === "generating" && (
            <p className="text-[0.6rem] text-muted-foreground font-mono">
              Tu balance real nunca sale de tu dispositivo.
            </p>
          )}
        </div>
      )}

      {/* Success */}
      {state.status === "done" && (
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-secondary font-mono text-sm">
              ✓ Prueba verificada on-chain
            </p>
          </div>

          <div className="bg-muted rounded-sm p-4 space-y-2 font-mono text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Umbral probado</span>
              <span className="text-foreground font-semibold">${state.thresholdUsdc} USDC</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Proof hash</span>
              <span className="text-primary truncate max-w-[140px]" title={state.proofHash}>
                {state.proofHash.slice(0, 8)}...{state.proofHash.slice(-8)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Stellar tx</span>
              <a
                href={`${STELLAR_EXPLORER_BASE}/tx/${state.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary hover:underline truncate max-w-[140px]"
              >
                {state.txHash.slice(0, 8)}... →
              </a>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/verify/${state.proofHash}`);
              }}
              className="flex-1 text-xs font-mono text-primary hover:text-foreground border border-border rounded-sm py-2 transition-colors"
            >
              Copiar link
            </button>
            <a
              href={`/verify/${state.proofHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-xs font-mono text-center text-secondary hover:text-foreground border border-border rounded-sm py-2 transition-colors"
            >
              Ver prueba →
            </a>
          </div>

          <button
            onClick={() => setState({ status: "idle" })}
            className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            ← Nueva prueba
          </button>
        </div>
      )}
    </div>
  );
};

export default ZKProofPanel;
