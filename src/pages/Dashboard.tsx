import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import SplitBar from "@/components/SplitBar";
import TxRow from "@/components/TxRow";
import { useStellarBalance } from "@/hooks/useStellarBalance";
import { getHorizonServer } from "@/lib/stellar/client";
import { useContracts } from "@/hooks/useContracts";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stroopsToUsdc, usdcToStroops } from "@/lib/stellar/contracts";
import type { SplitRule, VaultLock } from "@/lib/stellar/contracts";
import { toast } from "@/hooks/use-toast";

// Terminal progress messages shown while a split is executing
const SPLIT_STEPS = [
  "Simulando transacción en Soroban...",
  "Firmando con tu clave...",
  "Enviando a Stellar Testnet...",
  "Confirmando en el ledger...",
];

const VAULT_META = [
  { name: "Hogar",       icon: "🏠", color: "pink"      as const, colorHex: "#ffb3c6" },
  { name: "Fondo seguro",icon: "🔒", color: "mint"      as const, colorHex: "#b8f0c8" },
  { name: "Meta grande", icon: "🚀", color: "pink-soft" as const, colorHex: "#e8a0b4" },
];

const Dashboard = () => {
  const { publicKey, mode } = useWallet();
  const { user } = useAuth();
  const contracts = useContracts();
  const { balance } = useStellarBalance(publicKey);
  const streamRef = useRef<(() => void) | null>(null);

  // User profile name
  const [userName, setUserName] = useState<string>("");

  // On-chain vault balances (USDC floats for display)
  const [vaultBalances, setVaultBalances] = useState<number[]>([0, 0, 0]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [recentTxs, setRecentTxs] = useState<typeof mockTxs>([]);

  // On-chain split rules & lock states
  const [rules, setRules] = useState<SplitRule[]>([]);
  const [locks, setLocks] = useState<(VaultLock | null)[]>([null, null, null]);
  const [releaseFlags, setReleaseFlags] = useState<boolean[]>([false, false, false]);

  // Execute-split modal state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitAmount, setSplitAmount] = useState("");
  const [splitPin, setSplitPin] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState("");
  const [splitError, setSplitError] = useState("");

  // ── Load profile name ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("users_profile")
      .select("name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.name) setUserName(data.name);
      });
  }, [user?.id]);

  // ── Load balances + rules + locks from chain ─────────────
  const loadBalances = useCallback(async () => {
    if (!publicKey) { setBalancesLoading(false); return; }
    try {
      const [bals, chainRules] = await Promise.all([
        contracts.getBalances(),
        contracts.getRules(),
      ]);

      const arr = [0, 0, 0];
      bals.forEach((b) => { if (b.vault_id <= 2) arr[b.vault_id] = stroopsToUsdc(b.balance); });
      setVaultBalances(arr);

      if (chainRules.length > 0) setRules(chainRules);

      // Fetch lock states for each vault
      const lockPromises = [0, 1, 2].map((id) => contracts.getLock(id));
      const releasePromises = [0, 1, 2].map((id) => contracts.checkRelease(id));
      const [lockResults, releaseResults] = await Promise.all([
        Promise.all(lockPromises),
        Promise.all(releasePromises),
      ]);
      setLocks(lockResults);
      setReleaseFlags(releaseResults);
    } catch {
      // Keep previous values on RPC failure
    } finally {
      setBalancesLoading(false);
    }
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadBalances();
    const poll = setInterval(loadBalances, 30_000);
    return () => clearInterval(poll);
  }, [loadBalances]);

  // ── Horizon payment stream ───────────────────────────────
  useEffect(() => {
    if (!publicKey) return;
    const setupStream = async () => {
      try {
        const server = await getHorizonServer();
        const closeStream = server
          .payments()
          .forAccount(publicKey)
          .stream({
            onmessage: (payment: { type: string; to: string; amount: string; asset_code?: string }) => {
              if (payment.type === "payment" && payment.to === publicKey) {
                toast({
                  title: "💜 Pago recibido",
                  description: `+${parseFloat(payment.amount).toFixed(2)} ${payment.asset_code || "XLM"}`,
                });
                loadBalances();
              }
            },
          });
        streamRef.current = closeStream as unknown as () => void;
      } catch {}
    };
    setupStream();
    return () => { if (streamRef.current) streamRef.current(); };
  }, [publicKey, loadBalances]);

  // ── Execute split ────────────────────────────────────────
  const handleSplit = async () => {
    const usdc = parseFloat(splitAmount);
    if (!usdc || usdc <= 0) return;

    if (mode === "custodial" && splitPin.length < 4) return;
    if (mode === "custodial_social" && splitPin.length > 0) setSplitPin(""); // PIN not needed

    setSplitting(true);
    setSplitError("");
    setSplitProgress(SPLIT_STEPS[0]);

    try {
      const stroops = usdcToStroops(usdc);
      const { txHash, balances } = await contracts.executeSplit(
        stroops,
        mode === "custodial" ? splitPin : undefined,
        (msg) => setSplitProgress(msg)
      );

      // Update vault balances locally
      const arr = [0, 0, 0];
      balances.forEach((b) => { if (b.vault_id <= 2) arr[b.vault_id] = stroopsToUsdc(b.balance); });
      setVaultBalances(arr);

      const shortHash = `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
      setRecentTxs((prev) => [
        {
          type: "split" as const,
          description: "Separación automática",
          amount: usdc,
          vault: "Todas",
          txHash,
          timestamp: "Ahora",
          status: "confirmed" as const,
        },
        ...prev.slice(0, 4),
      ]);

      toast({ title: "✓ Split ejecutado", description: `Tx: ${shortHash}` });
      setShowSplitModal(false);
      setSplitAmount("");
      setSplitPin("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setSplitError("Error al conectar con la red. Intenta de nuevo.");
      console.error(msg);
    } finally {
      setSplitting(false);
    }
  };

  const totalBalance = vaultBalances.reduce((s, v) => s + v, 0);

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Hola, {userName || "amiga"} 👋</h1>
            <p className="text-body-muted text-xs font-mono mt-1">8 de marzo, 2026</p>
          </div>
          <div className="flex items-center gap-3">
            {mode && (
              <span className="font-mono text-[0.6rem] text-body-muted bg-deep border border-pink-subtle px-2 py-1 rounded-sm">
                {mode === "custodial" && "🔐 PIN"}
                {mode === "custodial_social" && "🌐 Social"}
                {mode === "external" && "💎 Wallet propia"}
              </span>
            )}
            <button
              onClick={() => setShowSplitModal(true)}
              className="btn-pink text-xs py-2 px-5 rounded-sm"
            >
              + Recibí dinero
            </button>
          </div>
        </div>

        {/* Balance card */}
        <div className="bg-card-dark border border-pink-subtle rounded-sm p-6 mb-8">
          <span className="text-body-muted text-xs font-mono uppercase tracking-widest">Balance total</span>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-4xl md:text-5xl font-bold text-pink">
              {balancesLoading ? "..." : `$${totalBalance.toFixed(2)}`}
            </span>
            <span className="text-body-muted text-sm">USDC</span>
          </div>
          <p className="text-dimmed text-xs font-mono mt-1">≈ S/ {(totalBalance * 3.71).toFixed(2)}</p>
          {balance.xlm > 0 && (
            <p className="text-dimmed text-xs font-mono mt-0.5">{balance.xlm.toFixed(4)} XLM</p>
          )}
          <div className="mt-6">
            <SplitBar
              segments={VAULT_META.map((v) => ({ percentage: vaultBalances[VAULT_META.indexOf(v)] / (totalBalance || 1) * 100, color: v.color, label: v.name }))}
              height={8}
            />
          </div>
        </div>

        {/* Vault mini-cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {VAULT_META.map((v, i) => (
            <div
              key={i}
              className="bg-card-dark p-4 rounded-sm border border-pink-subtle"
              style={{ borderLeft: `3px solid ${v.colorHex}` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span>{v.icon}</span>
                <span className="text-sm font-bold uppercase" style={{ color: v.colorHex }}>{v.name}</span>
              </div>
              <span className="font-mono text-xl font-bold text-foreground">
                {balancesLoading ? "..." : `$${vaultBalances[i].toFixed(2)}`}
              </span>
              <div className="w-full h-1 bg-deep rounded-sm mt-2 overflow-hidden">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${totalBalance > 0 ? (vaultBalances[i] / totalBalance) * 100 : 0}%`,
                    backgroundColor: v.colorHex,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4">ACTIVIDAD RECIENTE</h2>
          <div className="bg-card-dark rounded-sm border border-pink-subtle overflow-hidden">
            {recentTxs.length > 0 ? (
              recentTxs.map((tx, i) => <TxRow key={i} {...tx} />)
            ) : (
              <p className="text-body-muted text-xs font-mono p-4">
                Aún no hay transacciones. Usa el botón "Recibí dinero" para empezar.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Execute Split Modal ──────────────────────────────── */}
      {showSplitModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-card-dark border border-pink-subtle rounded-sm w-full max-w-md p-6">
            <h3 className="font-bold text-foreground mb-1">Separar ingreso</h3>
            <p className="text-body-muted text-xs font-mono mb-5">
              El contrato distribuirá el monto según tus reglas de split.
            </p>

            {!splitting ? (
              <>
                <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  Monto recibido (USDC)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={splitAmount}
                  onChange={(e) => setSplitAmount(e.target.value)}
                  className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                  placeholder="0.00"
                />

                {mode === "custodial" && (
                  <>
                    <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      PIN de confirmación
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={splitPin}
                      onChange={(e) => setSplitPin(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-center text-xl tracking-[1rem] focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                      placeholder="••••"
                    />
                  </>
                )}

                {splitError && (
                  <p className="text-xs font-mono text-dimmed mb-3">{splitError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowSplitModal(false); setSplitError(""); setSplitPin(""); }}
                    className="flex-1 btn-outline-pink text-xs py-2.5 rounded-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSplit}
                    disabled={!splitAmount || (mode === "custodial" && splitPin.length < 4)}
                    className="flex-1 btn-pink text-xs py-2.5 rounded-sm"
                    style={{ opacity: !splitAmount || (mode === "custodial" && splitPin.length < 4) ? 0.4 : 1 }}
                  >
                    Separar →
                  </button>
                </div>
              </>
            ) : (
              <div className="py-4">
                <p className="font-mono text-xs text-pink animate-pulse">{splitProgress}</p>
                <div className="mt-3 w-full h-0.5 bg-deep rounded-sm overflow-hidden">
                  <div className="h-full bg-primary animate-[slide_2s_ease-in-out_infinite]" style={{ width: "40%" }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

// Placeholder type kept for TxRow compatibility
const mockTxs: {
  type: "split" | "deposit" | "lock" | "withdrawal";
  description: string;
  amount: number;
  vault: string;
  txHash: string;
  timestamp: string;
  status: "confirmed" | "pending";
}[] = [];

export default Dashboard;
