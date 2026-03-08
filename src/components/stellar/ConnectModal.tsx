import { useState, useEffect, useCallback } from "react";
import { generateKeypair, fundTestnetAccount, truncateAddress, encryptSecretKey } from "@/lib/stellar";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";
import {
  kit,
  FREIGHTER_ID,
  XBULL_ID,
  ALBEDO_ID,
  LOBSTR_ID,
  type WalletId,
} from "@/lib/stellar/wallets-kit";

interface ConnectModalProps {
  embedded?: boolean;
  userEmail?: string;
  userId?: string;
  onConnected: (mode: "custodial" | "external", publicKey: string, encryptedSecret?: string) => void;
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

const ConnectModal = ({ embedded = false, userEmail = "", userId, onConnected }: ConnectModalProps) => {
  // ── State ─────────────────────────────────────────────
  const [section, setSection] = useState<"choose" | "custodial-pin" | "custodial-creating" | "custodial-done" | "external-connecting">("choose");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");

  // Custodial creation state
  const [steps, setSteps] = useState<Step[]>([
    { label: "Generando par de claves criptográficas...", status: "pending" },
    { label: "Activando cuenta en la red Stellar...", status: "pending" },
    { label: "Cifrando clave con tu PIN...", status: "pending" },
    { label: "Guardando configuración...", status: "pending" },
  ]);
  const [publicKey, setPublicKey] = useState("");
  const [copied, setCopied] = useState(false);

  const updateStep = (index: number, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)));
  };

  // ── PIN input handler ─────────────────────────────────
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

  // ── Custodial creation flow ───────────────────────────
  const startCustodialCreation = useCallback(async () => {
    const pinStr = pin.join("");
    const confirmStr = confirmPin.join("");

    if (pinStr.length !== 4) { setPinError("Ingresa 4 dígitos"); return; }
    if (pinStr !== confirmStr) { setPinError("Los PINs no coinciden"); return; }

    setPinError("");
    setSection("custodial-creating");

    // Step 1: Generate keypair
    updateStep(0, { status: "active" });
    await new Promise((r) => setTimeout(r, 600));
    const { publicKey: pub, secretKey: sec } = generateKeypair();
    setPublicKey(pub);
    updateStep(0, { status: "done", detail: "✓ Par de claves generado" });

    // Step 2: Fund via Friendbot
    updateStep(1, { status: "active" });
    const funded = await fundTestnetAccount(pub);
    updateStep(1, {
      status: funded ? "done" : "error",
      detail: funded ? "✓ Cuenta activada · 10,000 XLM de prueba recibidos" : "⚠ Error activando cuenta",
    });

    // Step 3: Encrypt
    updateStep(2, { status: "active" });
    await new Promise((r) => setTimeout(r, 500));
    const encrypted = await encryptSecretKey(sec, pinStr);
    updateStep(2, { status: "done", detail: "✓ Clave protegida con AES-256" });

    // Step 4: Save
    updateStep(3, { status: "active" });
    await new Promise((r) => setTimeout(r, 300));
    updateStep(3, { status: "done", detail: "✓ Todo listo" });

    setSection("custodial-done");
    onConnected("custodial", pub, encrypted);
  }, [pin, confirmPin, onConnected]);

  // ── External wallet connect ───────────────────────────
  const handleExternalConnect = async (walletId: WalletId) => {
    setConnectingWallet(walletId);
    setWalletError("");
    setSection("external-connecting");

    try {
      // Check availability for Freighter
      if (walletId === FREIGHTER_ID) {
        const available = await kit.isAvailable(FREIGHTER_ID);
        if (!available) {
          setWalletError("Freighter no está instalado");
          setSection("choose");
          setConnectingWallet(null);
          return;
        }
      }

      kit.setWallet(walletId);
      const { address } = await kit.getAddress();
      onConnected("external", address);
    } catch (err: any) {
      setWalletError(err?.message || "No se pudo conectar");
      setSection("choose");
      setConnectingWallet(null);
    }
  };

  // ── Status colors ─────────────────────────────────────
  const statusColor = (s: Step["status"]) => {
    switch (s) {
      case "done": return "text-pink";
      case "active": return "text-mint";
      case "error": return "text-pink-soft";
      default: return "text-dimmed";
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

  // ── Render ────────────────────────────────────────────
  const containerClass = embedded
    ? ""
    : "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";

  const cardClass = embedded
    ? "w-full"
    : "w-full max-w-lg bg-card-dark rounded-sm border border-pink-subtle p-6 max-h-[90vh] overflow-y-auto";

  return (
    <div className={containerClass}>
      <div className={cardClass}>
        {/* ── Choose section ─────────────────────────── */}
        {section === "choose" && (
          <>
            {/* TOP: Custodial path */}
            <div className="mb-6">
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-pink">
                → ACCESO RÁPIDO · SIN WALLET
              </span>
              <p className="text-sm text-body-muted mt-2 leading-relaxed">
                Creamos tu cuenta Stellar automáticamente. Solo necesitas tu correo y un PIN de 4 dígitos.
              </p>

              <button
                onClick={() => setSection("custodial-pin")}
                className="btn-pink w-full rounded-sm mt-4"
              >
                → Crear mi cuenta Stellar
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-pink-subtle" />
              <span className="font-mono text-[0.6rem] text-body-muted uppercase tracking-wider">
                O conecta tu wallet
              </span>
              <div className="flex-1 h-px bg-pink-subtle" />
            </div>

            {/* BOTTOM: External wallets */}
            <div>
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mint">
                → CONECTAR WALLET STELLAR
              </span>

              <div className="grid grid-cols-2 gap-3 mt-4">
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleExternalConnect(w.id)}
                    className="relative p-3.5 rounded-sm border border-pink-subtle bg-hover-dark hover:border-mint-visible hover:bg-card-dark transition-all text-left group"
                  >
                    {w.recommended && (
                      <span className="absolute top-2 right-2 font-mono text-[0.5rem] text-mint uppercase tracking-wider">
                        Recomendado
                      </span>
                    )}
                    <span className="text-2xl block mb-1">{w.icon}</span>
                    <span className="text-sm text-foreground">{w.name}</span>
                  </button>
                ))}
              </div>

              {walletError && (
                <div className="mt-3 p-3 rounded-sm border border-pink-subtle bg-card-dark">
                  <p className="text-xs text-pink font-mono">{walletError}</p>
                  {walletError.includes("Freighter") && (
                    <a
                      href="https://freighter.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-mint hover:underline mt-1 inline-block"
                    >
                      Instalar Freighter →
                    </a>
                  )}
                </div>
              )}

              <p className="font-mono text-[0.58rem] text-dimmed mt-4 text-center">
                ¿No tienes wallet? Usa el acceso rápido de arriba.
              </p>
            </div>
          </>
        )}

        {/* ── PIN entry ─────────────────────────────── */}
        {section === "custodial-pin" && (
          <div className="space-y-5">
            <div>
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-pink">
                → ACCESO RÁPIDO
              </span>
              <h2 className="text-xl font-bold mt-2 text-foreground">
                CREA TU <span className="text-pink">PIN</span>
              </h2>
              <p className="text-xs text-body-muted mt-2">
                Tu PIN protege tu clave secreta. Nunca la almacenamos en texto plano.
              </p>
            </div>

            {/* Email display */}
            {userEmail && (
              <div className="bg-card-dark border border-pink-subtle rounded-sm px-4 py-3">
                <label className="text-[0.6rem] font-mono text-dimmed uppercase tracking-wider block mb-1">Correo</label>
                <span className="text-sm text-foreground font-mono">{userEmail}</span>
              </div>
            )}

            {/* PIN */}
            <div>
              <label className="text-xs text-dimmed font-mono uppercase tracking-wider mb-2 block">PIN</label>
              <div className="flex gap-3 justify-center">
                {pin.map((d, i) => (
                  <input
                    key={i}
                    id={`cpin-a-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handlePinInput(pin, setPin, "cpin-a", i, e.target.value)}
                    className="w-[52px] h-[52px] text-center text-2xl font-mono bg-card-dark border border-pink-subtle rounded-sm text-foreground focus:outline-none focus:border-pink-visible transition-colors"
                  />
                ))}
              </div>
            </div>

            {/* Confirm PIN */}
            <div>
              <label className="text-xs text-dimmed font-mono uppercase tracking-wider mb-2 block">Confirmar PIN</label>
              <div className="flex gap-3 justify-center">
                {confirmPin.map((d, i) => (
                  <input
                    key={i}
                    id={`cpin-b-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handlePinInput(confirmPin, setConfirmPin, "cpin-b", i, e.target.value)}
                    className="w-[52px] h-[52px] text-center text-2xl font-mono bg-card-dark border border-pink-subtle rounded-sm text-foreground focus:outline-none focus:border-pink-visible transition-colors"
                  />
                ))}
              </div>
            </div>

            {pinError && <p className="text-pink text-xs font-mono text-center">{pinError}</p>}

            <button
              onClick={startCustodialCreation}
              disabled={pin.join("").length < 4 || confirmPin.join("").length < 4}
              className="btn-pink w-full rounded-sm"
              style={{ opacity: pin.join("").length < 4 ? 0.4 : 1 }}
            >
              → Crear mi cuenta Stellar
            </button>

            <button
              onClick={() => setSection("choose")}
              className="text-xs font-mono text-body-muted hover:text-foreground transition-colors w-full text-center"
            >
              ← Volver
            </button>
          </div>
        )}

        {/* ── Terminal creation flow ─────────────────── */}
        {(section === "custodial-creating" || section === "custodial-done") && (
          <div>
            <div className="terminal-bg rounded-sm p-4 font-mono text-[0.72rem] leading-8 space-y-1">
              <p className="text-dimmed text-[0.6rem]">
                // Propulsor · Creando tu cuenta Stellar
              </p>
              <p className="text-dimmed text-[0.6rem] mb-3">
                // Red: Testnet
              </p>

              {steps.map((step, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className={statusColor(step.status)}>
                      {statusIcon(step.status)}
                    </span>
                    <span
                      className={step.status === "pending" ? "opacity-30 text-foreground" : "text-foreground"}
                    >
                      {step.label}
                    </span>
                  </span>
                  {step.detail && (
                    <span className={`text-[0.6rem] shrink-0 ${statusColor(step.status)}`}>
                      {step.detail}
                    </span>
                  )}
                </div>
              ))}

              {/* Blinking cursor on active step */}
              {section === "custodial-creating" && (
                <span className="inline-block w-2 h-4 bg-mint animate-pulse ml-6" />
              )}
            </div>

            {/* Done state */}
            {section === "custodial-done" && publicKey && (
              <div className="mt-6 space-y-4">
                <div className="text-center">
                  <p className="text-mint font-mono text-sm">✓ Cuenta creada exitosamente</p>
                </div>

                <div className="bg-card-dark border border-pink-subtle rounded-sm p-4">
                  <p className="text-[0.6rem] text-dimmed font-mono uppercase tracking-wider mb-2">
                    Tu dirección Stellar
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-foreground">
                      {truncateAddress(publicKey)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicKey);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="text-xs font-mono text-pink hover:text-foreground transition-colors"
                      >
                        {copied ? "✓ Copiado" : "Copiar"}
                      </button>
                      <a
                        href={`${STELLAR_EXPLORER_BASE}/account/${publicKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-mint hover:text-foreground transition-colors"
                      >
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
            <div className="w-8 h-8 border-2 border-mint border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-foreground font-mono">
              Abriendo {wallets.find((w) => w.id === connectingWallet)?.name ?? "wallet"}...
            </p>
            <p className="text-xs text-body-muted">
              Confirma la conexión en tu wallet
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectModal;
