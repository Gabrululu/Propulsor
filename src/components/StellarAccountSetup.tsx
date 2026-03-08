import { useState, useEffect } from "react";
import { generateKeypair, fundTestnetAccount, truncateAddress, encryptSecretKey } from "@/lib/stellar";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";

interface StellarAccountSetupProps {
  onComplete: (publicKey: string, encryptedSecret: string) => void;
}

interface Step {
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

const StellarAccountSetup = ({ onComplete }: StellarAccountSetupProps) => {
  const [steps, setSteps] = useState<Step[]>([
    { label: "Generando par de claves...", status: "pending" },
    { label: "Activando cuenta en Stellar...", status: "pending" },
    { label: "Configurando bóvedas...", status: "pending" },
  ]);
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [phase, setPhase] = useState<"creating" | "pin" | "done">("creating");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [copied, setCopied] = useState(false);

  const updateStep = (index: number, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)));
  };

  useEffect(() => {
    const runSetup = async () => {
      // Step 1: Generate keypair
      updateStep(0, { status: "active" });
      await new Promise((r) => setTimeout(r, 800));
      const { publicKey: pub, secretKey: sec } = generateKeypair();
      setPublicKey(pub);
      setSecretKey(sec);
      updateStep(0, { status: "done", detail: "✓ Listo" });

      // Step 2: Fund via Friendbot
      updateStep(1, { status: "active" });
      const funded = await fundTestnetAccount(pub);
      updateStep(1, {
        status: funded ? "done" : "error",
        detail: funded ? "✓ Fondos recibidos" : "⚠ No se pudo fondear (reintenta)",
      });

      // Step 3: Configure vaults (simulated)
      updateStep(2, { status: "active" });
      await new Promise((r) => setTimeout(r, 1200));
      updateStep(2, { status: "done", detail: "✓ Contrato listo" });

      setPhase("pin");
    };

    runSetup();
  }, []);

  const handlePinInput = (arr: string[], setArr: (v: string[]) => void, index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...arr];
    next[index] = value;
    setArr(next);
    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${arr === pin ? "a" : "b"}-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleConfirmPin = async () => {
    const pinStr = pin.join("");
    const confirmStr = confirmPin.join("");

    if (pinStr.length !== 4) {
      setPinError("Ingresa 4 dígitos");
      return;
    }
    if (pinStr !== confirmStr) {
      setPinError("Los PINs no coinciden");
      return;
    }

    try {
      const encrypted = await encryptSecretKey(secretKey, pinStr);
      setPhase("done");
      onComplete(publicKey, encrypted);
    } catch {
      setPinError("Error al encriptar. Intenta de nuevo.");
    }
  };

  const statusColor = (s: Step["status"]) => {
    switch (s) {
      case "done": return "text-pink";
      case "active": return "text-mint";
      case "error": return "text-pink-soft";
      default: return "text-dimmed";
    }
  };

  return (
    <div>
      <span className="font-mono text-xs text-dimmed tracking-widest">CUENTA STELLAR</span>
      <h1 className="text-2xl font-bold mt-2 mb-6">
        <span className="text-foreground">CREANDO TU </span>
        <span className="text-pink">CUENTA</span>
      </h1>

      {/* Terminal steps */}
      <div className="terminal-bg rounded-sm p-4 font-mono text-sm space-y-2 mb-6">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={statusColor(step.status)}>
                {step.status === "active" ? "▸" : step.status === "done" ? "✓" : step.status === "error" ? "✗" : "○"}
              </span>
              <span className={step.status === "active" ? "text-foreground" : "text-body-muted"}>
                {step.label}
              </span>
            </span>
            {step.detail && (
              <span className={`text-xs ${statusColor(step.status)}`}>{step.detail}</span>
            )}
          </div>
        ))}
      </div>

      {/* Public key display */}
      {publicKey && phase !== "creating" && (
        <div className="bg-card-dark border border-pink-subtle rounded-sm p-4 mb-6">
          <p className="text-xs text-dimmed font-mono uppercase tracking-wider mb-2">Tu dirección Stellar</p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-foreground">{truncateAddress(publicKey)}</span>
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
          <p className="text-xs text-body-muted mt-2">
            Guarda este código — es tu dirección en la red Stellar.
          </p>
        </div>
      )}

      {/* PIN entry */}
      {phase === "pin" && (
        <div className="space-y-4">
          <p className="text-sm text-foreground font-semibold uppercase tracking-wider">
            Crea un PIN de 4 dígitos
          </p>
          <p className="text-xs text-body-muted">
            Tu PIN protege tu clave secreta. Nunca la almacenamos en texto plano.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-dimmed font-mono uppercase tracking-wider mb-2 block">PIN</label>
              <div className="flex gap-3 justify-center">
                {pin.map((d, i) => (
                  <input
                    key={i}
                    id={`pin-a-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handlePinInput(pin, setPin, i, e.target.value)}
                    className="w-14 h-14 text-center text-2xl font-mono bg-card-dark border border-pink-subtle rounded-sm text-foreground focus:outline-none focus:border-pink-visible"
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-dimmed font-mono uppercase tracking-wider mb-2 block">Confirmar PIN</label>
              <div className="flex gap-3 justify-center">
                {confirmPin.map((d, i) => (
                  <input
                    key={i}
                    id={`pin-b-${i}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handlePinInput(confirmPin, setConfirmPin, i, e.target.value)}
                    className="w-14 h-14 text-center text-2xl font-mono bg-card-dark border border-pink-subtle rounded-sm text-foreground focus:outline-none focus:border-pink-visible"
                  />
                ))}
              </div>
            </div>
          </div>

          {pinError && <p className="text-pink text-xs font-mono text-center">{pinError}</p>}

          <button
            onClick={handleConfirmPin}
            disabled={pin.join("").length < 4 || confirmPin.join("").length < 4}
            className="btn-pink w-full rounded-sm mt-4"
            style={{ opacity: pin.join("").length < 4 ? 0.4 : 1 }}
          >
            Proteger mi clave →
          </button>
        </div>
      )}
    </div>
  );
};

export default StellarAccountSetup;
