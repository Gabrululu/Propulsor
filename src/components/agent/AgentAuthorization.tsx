import { useState } from "react";
import { useWallet } from "@/lib/stellar/WalletContext";
import { userError } from "@/lib/userErrors";

interface Props {
  authorized: boolean;
  loading: boolean;
  authorize: (pin?: string) => Promise<void>;
  revoke: (pin?: string) => Promise<void>;
}

const AgentAuthorization = ({ authorized, loading, authorize, revoke }: Props) => {
  const { mode } = useWallet();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsPin = mode === "custodial";

  const run = async (action: (pin?: string) => Promise<void>) => {
    if (needsPin && pin.length !== 4) {
      setError("Ingresa tu PIN de 4 dígitos para confirmar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action(needsPin ? pin : undefined);
    } catch (err) {
      setError(userError(err));
    } finally {
      setPin("");
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-card-dark border border-pink-subtle rounded-sm p-5 mb-8 space-y-3">
      <h3 className="font-mono text-xs uppercase tracking-widest text-body-muted">
        {authorized ? "✓ Agente autorizado" : "Autoriza al agente"}
      </h3>
      <p className="text-body-muted text-xs font-mono leading-relaxed">
        {authorized
          ? "El agente puede separar por ti los pagos que recibes. Puedes revocarlo cuando quieras."
          : "Permite que el agente separe por ti los pagos que recibes, sin pedirte firma cada vez. Solo puede registrar separaciones con tus reglas: no puede retirar tu dinero ni cambiar tus reglas."}
      </p>

      {needsPin && (
        <div>
          <label
            htmlFor="agent-authorization-pin"
            className="block text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1"
          >
            PIN de confirmación
          </label>
          <input
            id="agent-authorization-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full bg-card border border-border rounded-sm px-4 py-2.5 text-foreground text-sm font-mono"
            placeholder="••••"
          />
        </div>
      )}

      {error && <p role="alert" className="font-mono text-xs text-destructive">{error}</p>}

      <button
        onClick={() => run(authorized ? revoke : authorize)}
        disabled={busy}
        className={authorized
          ? "w-full text-xs font-mono text-primary hover:text-foreground border border-border rounded-sm py-2.5 transition-colors"
          : "btn-pink w-full text-xs py-2.5 rounded-sm"}
        style={{ opacity: busy ? 0.5 : 1 }}
      >
        {busy ? "Confirmando..." : authorized ? "Revocar autorización" : "→ Autorizar al agente"}
      </button>
    </div>
  );
};

export default AgentAuthorization;
