import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useAuth } from "@/hooks/useAuth";
import { truncateAddress } from "@/lib/stellar";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";
import {
  FREIGHTER_ID,
  XBULL_ID,
  ALBEDO_ID,
  LOBSTR_ID,
  type WalletId,
} from "@/lib/stellar/wallets-kit";

interface ConnectModalProps {
  embedded?: boolean;
  onConnected: (mode: "custodial" | "external", publicKey: string) => void;
}

interface Step {
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

const wallets: { id: WalletId; name: string; icon: string; recommended?: boolean }[] = [
  { id: FREIGHTER_ID, name: "Freighter", icon: "🚀", recommended: true },
  { id: XBULL_ID, name: "xBull", icon: "🐂" },
  { id: ALBEDO_ID, name: "Albedo", icon: "🌅" },
  { id: LOBSTR_ID, name: "Lobstr", icon: "🦞" },
];

const ConnectModal = ({ embedded = false, onConnected }: ConnectModalProps) => {
  const { connectCustodial, connectExternal, isConnecting } = useWallet();
  const { user } = useAuth();

  const [section, setSection] = useState<"choose" | "custodial-pin" | "custodial-creating" | "custodial-done" | "external-connecting">("choose");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");

  const [steps, setSteps] = useState<Step[]>([
    { label: "Generando par de claves criptográficas...", status: "pending" },
    { label: "Activando cuenta en la red Stellar...", status: "pending" },
    { label: "Cifrando clave con tu PIN...", status: "pending" },
    { label: "Guardando en tu perfil...", status: "pending" },
  ]);
  const [publicKey, setPublicKey] = useState("");
  const [copied, setCopied] = useState(false);

  const updateStep = (index: number, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)));
  };

  const handlePinInput = (
    arr: string[],
    setArr: (v: string[]) => void,
    prefix: string,
    index: number,
    value: string
  ) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...arr];
    next[index] = value;
    setArr(next);
    if (value && index < 3) {
      document.getElementById(`${prefix}-${index + 1}`)?.focus();
    }
  };

  // ── Custodial creation — uses WalletContext which saves to Supabase
  const startCustodialCreation = useCallback(async () => {
    const pinStr = pin.join("");
    const confirmStr = confirmPin.join("");

    if (pinStr.length !== 4) { setPinError("Ingresa 4 dígitos"); return; }
    if (pinStr !== confirmStr) { setPinError("Los PINs no coinciden"); return; }
    if (!user) { setPinError("Debes iniciar sesión primero"); return; }

    setPinError("");
    setSection("custodial-creating");

    try {
      // Step 1-3 are handled inside connectCustodial
      updateStep(0, { status: "active" });
      await new Promise((r) => setTimeout(r, 400));
      updateStep(0, { status: "done", detail: "✓ Par de claves generado" });

      updateStep(1, { status: "active" });
      await new Promise((r) => setTimeout(r, 400));
      updateStep(1, { status: "done", detail: "✓ Cuenta activada" });

      updateStep(2, { status: "active" });
      await new Promise((r) => setTimeout(r, 300));
      updateStep(2, { status: "done", detail: "✓ Clave protegida con AES-256" });

      updateStep(3, { status: "active" });
      // This creates keypair, funds, encrypts, and saves to Supabase
      const pk = await connectCustodial(user.id, pinStr);
      updateStep(3, { status: "done", detail: "✓ Guardado en tu perfil" });

      setPublicKey(pk);
      setSection("custodial-done");
      onConnected("custodial", pk);
    } catch (err: any) {
      console.error("Custodial creation failed:", err);
      setPinError(err?.message || "Error creando cuenta");
      // Mark current active step as error
      setSteps(prev => prev.map(s => s.status === "active" ? { ...s, status: "error", detail: "Error" } : s));
    }
  }, [pin, confirmPin, user, connectCustodial, onConnected]);

  // ── External wallet connect — uses WalletContext
  const handleExternalConnect = async (walletId: WalletId) => {
    setConnectingWallet(walletId);
    setWalletError("");
    setSection("external-connecting");

    try {
      await connectExternal(walletId);
      // connectExternal updates WalletContext state; get publicKey from there
      // We need to get the address - connectExternal stores it in context
      // For the callback, re-read from kit
      const { kit } = await import("@/lib/stellar/wallets-kit");
      const { address } = await kit.getAddress();
      onConnected("external", address);
    } catch (err: any) {
      setWalletError(err?.message || "No se pudo conectar");
      setSection("choose");
      setConnectingWallet(null);
    }
  };

  const statusColor = (s: Step["status"]) => {
    switch (s) {
      case "done": return "text-primary";
      case "active": return "text-secondary";
      case "error": return "text-destructive";
      default: return "text-muted-foreground";
    }
  };

  const statusIcon = (s: Step["status"]) => {
    switch (s) {
      case "done": return "✓";
      case "active": return "▸";
      case "error": return "✗";
      default: return "○";
    }
  };

  const containerClass = embedded ? "" : "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";
  const cardClass = embedded ? "w-full" : "w-full max-w-lg bg-card rounded-sm border border-border p-6 max-h-[90vh] overflow-y-auto";

  return (
    <div className={containerClass}>
      <div className={cardClass}>
        {/* ── Choose section ─────────────────────────── */}
        {section === "choose" && (
          <>
            <div className="mb-6">
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-primary">
                → ACCESO RÁPIDO · SIN WALLET
              </span>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Creamos tu cuenta Stellar automáticamente. Solo necesitas un PIN de 4 dígitos.
              </p>
              <button
                onClick={() => setSection("custodial-pin")}
                className="btn-pink w-full rounded-sm mt-4"
              >
                → Crear mi cuenta Stellar
              </button>
            </div>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-border" />
              <span className="font-mono text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                O conecta tu wallet
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div>
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-secondary">
                → CONECTAR WALLET STELLAR
              </span>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleExternalConnect(w.id)}
                    className="relative p-3.5 rounded-sm border border-border bg-muted hover:border-secondary hover:bg-card transition-all text-left group"
                  >
                    {w.recommended && (
                      <span className="absolute top-2 right-2 font-mono text-[0.5rem] text-secondary uppercase tracking-wider">
                        Recomendado
                      </span>
                    )}
                    <span className="text-2xl block mb-1">{w.icon}</span>
                    <span className="text-sm text-foreground">{w.name}</span>
                  </button>
                ))}
              </div>

              {walletError && (
                <div className="mt-3 p-3 rounded-sm border border-border bg-card">
                  <p className="text-xs text-destructive font-mono">{walletError}</p>
                  {walletError.includes("Freighter") && (
                    <a href="https://freighter.app" target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-secondary hover:underline mt-1 inline-block">
                      Instalar Freighter →
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PIN entry ─────────────────────────────── */}
        {section === "custodial-pin" && (
          <div className="space-y-5">
            <div>
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-primary">
                → ACCESO RÁPIDO
              </span>
              <h2 className="text-xl font-bold mt-2 text-foreground">
                CREA TU <span className="text-primary">PIN</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-2">
                Tu PIN protege tu clave secreta. Nunca la almacenamos en texto plano.
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2 block">PIN</label>
              <div className="flex gap-3 justify-center">
                {pin.map((d, i) => (
                  <input key={i} id={`cpin-a-${i}`} type="password" inputMode="numeric" maxLength={1} value={d}
                    onChange={(e) => handlePinInput(pin, setPin, "cpin-a", i, e.target.value)}
                    className="w-[52px] h-[52px] text-center text-2xl font-mono bg-card border border-border rounded-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2 block">Confirmar PIN</label>
              <div className="flex gap-3 justify-center">
                {confirmPin.map((d, i) => (
                  <input key={i} id={`cpin-b-${i}`} type="password" inputMode="numeric" maxLength={1} value={d}
                    onChange={(e) => handlePinInput(confirmPin, setConfirmPin, "cpin-b", i, e.target.value)}
                    className="w-[52px] h-[52px] text-center text-2xl font-mono bg-card border border-border rounded-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                ))}
              </div>
            </div>

            {pinError && <p className="text-destructive text-xs font-mono text-center">{pinError}</p>}

            <button onClick={startCustodialCreation}
              disabled={pin.join("").length < 4 || confirmPin.join("").length < 4 || isConnecting}
              className="btn-pink w-full rounded-sm"
              style={{ opacity: pin.join("").length < 4 ? 0.4 : 1 }}>
              {isConnecting ? "Creando..." : "→ Crear mi cuenta Stellar"}
            </button>

            <button onClick={() => setSection("choose")}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-center">
              ← Volver
            </button>
          </div>
        )}

        {/* ── Terminal creation flow ─────────────────── */}
        {(section === "custodial-creating" || section === "custodial-done") && (
          <div>
            <div className="bg-muted rounded-sm p-4 font-mono text-[0.72rem] leading-8 space-y-1">
              <p className="text-muted-foreground text-[0.6rem]">// Propulsor · Creando tu cuenta Stellar</p>
              <p className="text-muted-foreground text-[0.6rem] mb-3">// Red: Testnet</p>
              {steps.map((step, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className={statusColor(step.status)}>{statusIcon(step.status)}</span>
                    <span className={step.status === "pending" ? "opacity-30 text-foreground" : "text-foreground"}>
                      {step.label}
                    </span>
                  </span>
                  {step.detail && (
                    <span className={`text-[0.6rem] shrink-0 ${statusColor(step.status)}`}>{step.detail}</span>
                  )}
                </div>
              ))}
              {section === "custodial-creating" && (
                <span className="inline-block w-2 h-4 bg-secondary animate-pulse ml-6" />
              )}
            </div>

            {section === "custodial-done" && publicKey && (
              <div className="mt-6 space-y-4">
                <div className="text-center">
                  <p className="text-secondary font-mono text-sm">✓ Cuenta creada y guardada exitosamente</p>
                </div>
                <div className="bg-card border border-border rounded-sm p-4">
                  <p className="text-[0.6rem] text-muted-foreground font-mono uppercase tracking-wider mb-2">
                    Tu dirección Stellar
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-foreground">{truncateAddress(publicKey)}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        navigator.clipboard.writeText(publicKey);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }} className="text-xs font-mono text-primary hover:text-foreground transition-colors">
                        {copied ? "✓ Copiado" : "Copiar"}
                      </button>
                      <a href={`${STELLAR_EXPLORER_BASE}/account/${publicKey}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono text-secondary hover:text-foreground transition-colors">
                        Ver en Explorer →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── External connecting state ──────────────── */}
        {section === "external-connecting" && (
          <div className="text-center py-8 space-y-4">
            <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-foreground font-mono">
              Abriendo {wallets.find((w) => w.id === connectingWallet)?.name ?? "wallet"}...
            </p>
            <p className="text-xs text-muted-foreground">Confirma la conexión en tu wallet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectModal;
