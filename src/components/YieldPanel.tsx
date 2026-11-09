import { useCallback, useEffect, useState } from "react";
import { useSigner } from "@/hooks/useSigner";
import { userError } from "@/lib/userErrors";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";
import { stroopsToUsdc, usdcToStroops } from "@/lib/stellar/contracts";
import {
  YIELD_PROVIDERS,
  depositToYield,
  getTestUsdcBalance,
  getYieldPosition,
  requestTestUsdc,
  withdrawAllFromYield,
  type YieldProviderId,
} from "@/lib/stellar/yield";

interface Balances {
  wallet: bigint | null; // null = no trustline to Blend's test USDC yet
  blend: bigint;
  defindex: bigint;
}

type Action = "faucet" | "deposit" | "withdraw";

const usdc = (stroops: bigint) => stroopsToUsdc(stroops).toFixed(2);

/** Lets the user put test USDC to work in Blend or DeFindex, signing each move. */
export default function YieldPanel({ savingsBalance }: { savingsBalance: number }) {
  const { publicKey, mode, makeSign } = useSigner();
  const [provider, setProvider] = useState<YieldProviderId>("blend");
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loadError, setLoadError] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState<{ label: string; hash: string } | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return;
    try {
      const [wallet, blend, defindex] = await Promise.all([
        getTestUsdcBalance(publicKey),
        getYieldPosition("blend", publicKey),
        getYieldPosition("defindex", publicKey),
      ]);
      setBalances({ wallet, blend, defindex });
      setLoadError("");
    } catch {
      setLoadError("No pudimos leer tus saldos de rendimiento. Vuelve a intentarlo en unos segundos.");
    }
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  const needsPin = mode === "custodial";
  const pinReady = !needsPin || pin.length === 4;
  const wallet = balances?.wallet ?? 0n;
  const position = balances ? balances[provider] : 0n;
  const name = YIELD_PROVIDERS[provider].name;
  const suggested = Math.min(savingsBalance, stroopsToUsdc(wallet));

  const run = async (action: Action, label: string, task: () => Promise<string>) => {
    if (busy || !publicKey) return;
    setBusy(action);
    setError("");
    setLastTx(null);
    try {
      const hash = await task();
      setLastTx({ label, hash });
      if (action === "deposit") setAmount("");
      await load();
    } catch (err) {
      setError(userError(err));
    } finally {
      setPin("");
      setProgress("");
      setBusy(null);
    }
  };

  const sign = () => makeSign(needsPin ? pin : undefined);

  const getTestUsdc = () =>
    run("faucet", "USDC de prueba recibido", () => requestTestUsdc(publicKey!, sign(), setProgress));

  const deposit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Ingresa un monto mayor que cero.");
      return;
    }
    const stroops = usdcToStroops(value);
    if (stroops > wallet) {
      setError(`Solo tienes ${usdc(wallet)} USDC de prueba en tu cuenta.`);
      return;
    }
    run("deposit", `Depositado en ${name}`, () =>
      depositToYield(provider, publicKey!, stroops, sign(), setProgress),
    );
  };

  const withdraw = () =>
    run("withdraw", `Retirado de ${name}`, () =>
      withdrawAllFromYield(provider, publicKey!, sign(), setProgress),
    );

  if (!publicKey) return null;

  return (
    <section
      aria-labelledby="yield-panel-title"
      className="rounded-sm border border-border bg-card p-5 space-y-4"
      aria-busy={busy !== null}
    >
      <div>
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-primary">
          → RENDIMIENTO · TESTNET
        </span>
        <h2 id="yield-panel-title" className="text-lg font-bold text-foreground mt-1">
          Pon a rendir tu ahorro
        </h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Deposita USDC en Blend o DeFindex y retíralo cuando quieras. Tú firmas cada movimiento desde tu cuenta.
        </p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          En la red de prueba, estos protocolos usan su propio USDC de prueba, distinto al de tus remesas. Lo
          que deposites aquí no cambia el saldo de tus bóvedas.
        </p>
      </div>

      <div role="radiogroup" aria-label="Protocolo de rendimiento" className="grid grid-cols-2 gap-2">
        {(Object.keys(YIELD_PROVIDERS) as YieldProviderId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={provider === id}
            disabled={busy !== null}
            onClick={() => {
              setProvider(id);
              setError("");
            }}
            className={`min-h-11 rounded-sm border px-3 py-2 text-sm font-mono ${
              provider === id ? "border-primary text-foreground bg-primary/10" : "border-border text-muted-foreground"
            }`}
          >
            {YIELD_PROVIDERS[id].name}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{YIELD_PROVIDERS[provider].description}</p>

      {loadError ? (
        <p role="alert" className="text-xs text-destructive font-mono">{loadError}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <div className="bg-muted rounded-sm p-3">
            <dt className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">En tu cuenta</dt>
            <dd className="font-mono text-sm text-foreground font-bold mt-0.5">
              {balances ? `${usdc(wallet)} USDC` : "…"}
            </dd>
          </div>
          <div className="bg-muted rounded-sm p-3">
            <dt className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">En {name}</dt>
            <dd className="font-mono text-sm text-mint font-bold mt-0.5">
              {balances ? `${usdc(position)} USDC` : "…"}
            </dd>
          </div>
        </dl>
      )}

      {balances && wallet === 0n && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {balances.wallet === null
              ? "Para empezar, necesitas USDC de prueba de Blend. Tu cuenta firmará una sola vez para aceptarlo."
              : "No tienes USDC de prueba en tu cuenta."}
          </p>
          {needsPin && <PinField value={pin} onChange={setPin} disabled={busy !== null} id="yield-faucet-pin" />}
          <button
            type="button"
            onClick={getTestUsdc}
            disabled={busy !== null || !pinReady}
            className="btn-outline-pink w-full rounded-sm text-sm min-h-11 disabled:opacity-40"
          >
            {busy === "faucet" ? "Obteniendo..." : "Obtener 1.000 USDC de prueba"}
          </button>
        </div>
      )}

      {balances && (wallet > 0n || position > 0n) && (
        <div className="space-y-3">
          {wallet > 0n && (
            <div>
              <label htmlFor="yield-amount" className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">
                Monto a depositar (USDC)
              </label>
              <input
                id="yield-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                disabled={busy !== null}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-muted border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="10.00"
              />
              {suggested > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(suggested.toFixed(2))}
                  disabled={busy !== null}
                  className="mt-1 text-xs text-primary underline underline-offset-2"
                >
                  Usar lo de tu bóveda de ahorro: {suggested.toFixed(2)} USDC
                </button>
              )}
            </div>
          )}
          {needsPin && <PinField value={pin} onChange={setPin} disabled={busy !== null} id="yield-pin" />}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={deposit}
              disabled={busy !== null || !pinReady || wallet === 0n || !amount}
              className="btn-pink rounded-sm text-sm min-h-11 disabled:opacity-40"
            >
              {busy === "deposit" ? "Depositando..." : `Depositar en ${name}`}
            </button>
            <button
              type="button"
              onClick={withdraw}
              disabled={busy !== null || !pinReady || position === 0n}
              className="btn-outline-pink rounded-sm text-sm min-h-11 disabled:opacity-40"
            >
              {busy === "withdraw" ? "Retirando..." : "Retirar todo"}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="space-y-2">
        {progress && <p className="text-xs font-mono text-secondary">{progress}</p>}
        {lastTx && (
          <p className="text-xs font-mono text-mint">
            ✓ {lastTx.label} ·{" "}
            <a
              href={`${STELLAR_EXPLORER_BASE}/tx/${lastTx.hash}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              ver comprobante
            </a>
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="p-3 rounded-sm border border-destructive/30 bg-destructive/10 text-xs text-destructive font-mono">
          {error}
        </p>
      )}
    </section>
  );
}

function PinField({ id, value, onChange, disabled }: {
  id: string; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">
        PIN de confirmación
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="w-full bg-muted border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="••••"
      />
    </div>
  );
}
