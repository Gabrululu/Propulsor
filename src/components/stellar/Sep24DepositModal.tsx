import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useSep24Deposit } from "@/hooks/useSep24Deposit";
import { STELLAR_EXPLORER_BASE, SEP24_HOME_DOMAIN } from "@/lib/stellar/client";

const ASSET_CODE = "USDC";

const Sep24DepositModal = () => {
  const { mode, publicKey } = useWallet();
  const { state, startDeposit, reset } = useSep24Deposit();

  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  const [pin, setPin] = useState("");
  const [formError, setFormError] = useState("");

  const isCustodial = mode === "custodial";
  const openedTxRef = useRef<string | null>(null);

  // The anchor sends X-Frame-Options: deny, so its hosted form can't render
  // in an iframe — open it in a new tab instead, once per transaction.
  useEffect(() => {
    if (state.status === "interactive" && openedTxRef.current !== state.transactionId) {
      openedTxRef.current = state.transactionId;
      window.open(state.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);

  if (!publicKey) return null;

  const close = () => {
    setIsOpen(false);
    setAmount("10");
    setPin("");
    setFormError("");
    reset();
  };

  const submit = () => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) {
      setFormError("Ingresa un monto válido");
      return;
    }
    if (isCustodial && pin.length !== 4) {
      setFormError("Ingresa tu PIN de 4 dígitos");
      return;
    }
    setFormError("");
    startDeposit(ASSET_CODE, amount, isCustodial ? pin : undefined);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-[0.6rem] font-mono text-mint hover:text-foreground transition-colors"
      >
        + Depositar con banco/tarjeta
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card-dark rounded-sm border border-pink-subtle w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-mint">
                → DEPOSITAR CON BANCO/TARJETA
              </span>
              <button
                onClick={close}
                className="text-body-muted hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            {/* Step 1: amount (+ PIN for custodial) */}
            {state.status === "idle" && (
              <div className="space-y-4">
                <p className="text-xs text-body-muted leading-relaxed">
                  Convierte dinero de tu tarjeta o transferencia a USDC (dólares digitales) directamente
                  en tu cuenta, a través de un proveedor de pagos de prueba
                  (<span className="text-foreground">{SEP24_HOME_DOMAIN}</span>).
                </p>

                <div>
                  <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">
                    Monto a depositar
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-sm">$</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 bg-muted border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-muted-foreground font-mono text-xs">USDC</span>
                  </div>
                  <p className="text-[0.6rem] text-muted-foreground mt-1">
                    Mientras probamos: mínimo $1, máximo $10 por depósito.
                  </p>
                </div>

                {isCustodial && (
                  <div>
                    <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">
                      PIN (para confirmar tu identidad)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      className="w-24 bg-muted border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="••••"
                    />
                  </div>
                )}

                {formError && (
                  <p className="text-xs text-destructive font-mono">{formError}</p>
                )}

                <button onClick={submit} className="btn-pink w-full rounded-sm text-sm">
                  → Continuar
                </button>
              </div>
            )}

            {/* Loading states: SEP-10 auth, SEP-24 session creation */}
            {(state.status === "authenticating" || state.status === "initiating") && (
              <div className="flex items-center gap-3 py-6">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-sm text-foreground font-mono">
                  {state.status === "authenticating"
                    ? "Confirmando tu identidad..."
                    : "Preparando tu depósito..."}
                </span>
              </div>
            )}

            {/* Interactive step: the anchor's hosted KYC/deposit form opens in its own tab */}
            {(state.status === "interactive" || state.status === "polling") && (
              <div className="space-y-3">
                <p className="text-xs text-body-muted">
                  {state.status === "interactive"
                    ? "Abrimos el formulario del proveedor de pagos en una pestaña nueva. Complétalo ahí — esta ventana se actualiza sola cuando termines."
                    : `Formulario enviado — confirmando tu depósito (estado: ${state.anchorStatus})...`}
                </p>
                {state.status === "interactive" && (
                  <a
                    href={state.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline-pink block w-full rounded-sm text-sm py-2.5 text-center"
                  >
                    ¿No se abrió? Abrir formulario de depósito →
                  </a>
                )}
                <div className="flex items-center gap-2 text-[0.65rem] font-mono text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                  Consultando estado cada 3s · comprobante {state.transactionId.slice(0, 8)}...
                </div>
              </div>
            )}

            {/* Success */}
            {state.status === "completed" && (
              <div className="space-y-3">
                <p className="text-secondary font-mono text-sm text-center">
                  ✓ Depósito completado
                </p>
                <div className="bg-muted rounded-sm p-4 space-y-2 font-mono text-xs">
                  {state.amountIn && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Monto recibido</span>
                      <span className="text-foreground font-semibold">${state.amountIn} USDC</span>
                    </div>
                  )}
                  {state.stellarTxId && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Comprobante</span>
                      <a
                        href={`${STELLAR_EXPLORER_BASE}/tx/${state.stellarTxId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary hover:underline truncate max-w-[180px]"
                      >
                        {state.stellarTxId.slice(0, 8)}... →
                      </a>
                    </div>
                  )}
                </div>
                <button onClick={close} className="btn-pink w-full rounded-sm text-sm">
                  Cerrar
                </button>
              </div>
            )}

            {/* Error */}
            {state.status === "error" && (
              <div className="space-y-3">
                <div className="p-3 rounded-sm border border-destructive/30 bg-destructive/10">
                  <p className="text-xs text-destructive font-mono">{state.message}</p>
                </div>
                <button onClick={reset} className="btn-outline-pink w-full rounded-sm text-sm py-2.5">
                  ← Intentar de nuevo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Sep24DepositModal;
