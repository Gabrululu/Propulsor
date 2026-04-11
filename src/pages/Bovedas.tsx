import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import VaultCard from "@/components/VaultCard";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useContracts } from "@/hooks/useContracts";
import { stroopsToUsdc, usdcToStroops, formatTimeRemaining } from "@/lib/stellar/contracts";
import { toast } from "@/hooks/use-toast";

const VAULT_META = [
  { name: "Hogar",        icon: "🏠", colorVariant: "pink"      as const },
  { name: "Fondo seguro", icon: "🔒", colorVariant: "mint"      as const },
  { name: "Meta grande",  icon: "🚀", colorVariant: "pink-soft" as const },
];

interface VaultData {
  vault_id: number;
  name: string;
  icon: string;
  colorVariant: "pink" | "mint" | "pink-soft";
  balance: number;
  percentage: number;
  isLocked: boolean;
  canRelease: boolean;
  unlockDate?: string;
  goalAmount?: number;
  timeRemaining: number;
}

const Bovedas = () => {
  const { mode } = useWallet();
  const contracts = useContracts();
  const [vaults, setVaults] = useState<VaultData[]>([]);
  const [loading, setLoading] = useState(true);

  // Release modal state
  const [releaseModal, setReleaseModal] = useState<{ vaultId: number; name: string } | null>(null);
  const [releasePin, setReleasePin] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState("");

  // Lock modal state
  const [lockModal, setLockModal] = useState<{ vaultId: number; name: string } | null>(null);
  const [lockPin, setLockPin] = useState("");
  const [lockDate, setLockDate] = useState("");
  const [lockGoal, setLockGoal] = useState("");
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");

  // Add funds modal state
  const [addModal, setAddModal] = useState<{ vaultId: number; name: string } | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [addPin, setAddPin] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const isCustodial = mode === "custodial";

  const loadVaults = useCallback(async () => {
    try {
      const [bals, rules] = await Promise.all([
        contracts.getBalances(),
        contracts.getRules(),
      ]);

      const totalStroops = bals.reduce((s, b) => s + b.balance, 0n);

      const vaultList: VaultData[] = await Promise.all(
        VAULT_META.map(async (meta, i) => {
          const balEntry = bals.find((b) => b.vault_id === i);
          const ruleEntry = rules.find((r) => r.vault_id === i);
          const balUsdc = balEntry ? stroopsToUsdc(balEntry.balance) : 0;
          const pct = ruleEntry?.percentage ?? 0;

          const [lock, canRelease, timeRemaining] = await Promise.all([
            contracts.getLock(i),
            contracts.checkRelease(i),
            contracts.getTimeRemaining(i),
          ]);

          let unlockDate: string | undefined;
          if (lock?.unlock_timestamp) {
            const d = new Date(Number(lock.unlock_timestamp) * 1000);
            unlockDate = d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
          }

          const goalUsdc = lock?.goal_amount ? stroopsToUsdc(lock.goal_amount) : undefined;

          return {
            vault_id: i,
            name: meta.name,
            icon: meta.icon,
            colorVariant: meta.colorVariant,
            balance: balUsdc,
            percentage: pct,
            isLocked: !!lock && !canRelease,
            canRelease: !!lock && canRelease,
            unlockDate,
            goalAmount: goalUsdc,
            timeRemaining,
          };
        })
      );

      setVaults(vaultList);
    } catch (err) {
      console.error("Error loading vault data:", err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadVaults();
    const poll = setInterval(loadVaults, 30_000);
    return () => clearInterval(poll);
  }, [loadVaults]);

  // ── Release vault ────────────────────────────────────────
  const handleRelease = async () => {
    if (!releaseModal) return;
    if (isCustodial && releasePin.length < 4) return;
    setReleasing(true);
    setReleaseError("");
    try {
      const { txHash, amount } = await contracts.releaseVault(
        releaseModal.vaultId,
        isCustodial ? releasePin : undefined
      );
      const usdcAmt = stroopsToUsdc(amount).toFixed(2);
      const shortHash = `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
      toast({ title: `✓ Bóveda liberada · $${usdcAmt} USDC`, description: `Tx: ${shortHash}` });
      setReleaseModal(null);
      setReleasePin("");
      await loadVaults();
    } catch (err: unknown) {
      setReleaseError("Error al conectar con la red. Intenta de nuevo.");
      console.error(err);
    } finally {
      setReleasing(false);
    }
  };

  // ── Lock vault ───────────────────────────────────────────
  const handleLock = async () => {
    if (!lockModal) return;
    const vaultBalance = vaults.find((v) => v.vault_id === lockModal.vaultId)?.balance ?? 0;
    if (vaultBalance <= 0) { setLockError("No hay fondos en esta bóveda."); return; }
    if (!lockDate && !lockGoal) { setLockError("Debes especificar una fecha o una meta."); return; }
    if (isCustodial && lockPin.length < 4) return;
    setLocking(true);
    setLockError("");
    try {
      const amount = usdcToStroops(vaultBalance);
      const unlockTs = lockDate ? Math.floor(new Date(lockDate).getTime() / 1000) : null;
      const goalStroops = lockGoal ? usdcToStroops(parseFloat(lockGoal)) : null;
      const txHash = await contracts.lockVault(
        lockModal.vaultId,
        amount,
        unlockTs,
        goalStroops,
        isCustodial ? lockPin : undefined
      );
      const shortHash = `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
      toast({ title: "🔒 Bóveda bloqueada", description: `Tx: ${shortHash}` });
      setLockModal(null);
      setLockPin("");
      setLockDate("");
      setLockGoal("");
      await loadVaults();
    } catch (err: unknown) {
      setLockError("Error al conectar con la red. Intenta de nuevo.");
      console.error(err);
    } finally {
      setLocking(false);
    }
  };

  // ── Add to lock ──────────────────────────────────────────
  const handleAddToLock = async () => {
    if (!addModal) return;
    const usdc = parseFloat(addAmount);
    if (!usdc || usdc <= 0) { setAddError("Ingresa un monto válido."); return; }
    if (isCustodial && addPin.length < 4) return;
    setAdding(true);
    setAddError("");
    try {
      const txHash = await contracts.addToLock(
        addModal.vaultId,
        usdcToStroops(usdc),
        isCustodial ? addPin : undefined
      );
      const shortHash = `${txHash.slice(0, 8)}...${txHash.slice(-4)}`;
      toast({ title: `✓ $${usdc.toFixed(2)} agregados`, description: `Tx: ${shortHash}` });
      setAddModal(null);
      setAddAmount("");
      setAddPin("");
      await loadVaults();
    } catch (err: unknown) {
      setAddError("Error al conectar con la red. Intenta de nuevo.");
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">MIS BÓVEDAS</h1>
            <p className="text-body-muted text-xs font-mono mt-1">
              {loading ? "Cargando..." : `${vaults.filter((v) => v.balance > 0).length} bóvedas activas`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card-dark border border-pink-subtle rounded-sm p-5 animate-pulse h-56" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vaults.map((v) => (
              <VaultCard
                key={v.vault_id}
                name={v.name}
                icon={v.icon}
                percentage={v.percentage}
                balance={v.balance}
                goalAmount={v.goalAmount}
                unlockDate={v.unlockDate}
                isLocked={v.isLocked}
                canRelease={v.canRelease}
                timeRemaining={v.timeRemaining}
                colorVariant={v.colorVariant}
                blendEnabled={v.vault_id === 2}
                onLock={() => setLockModal({ vaultId: v.vault_id, name: v.name })}
                onRelease={() => setReleaseModal({ vaultId: v.vault_id, name: v.name })}
                onAdd={v.isLocked ? () => setAddModal({ vaultId: v.vault_id, name: v.name }) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Release Modal ─────────────────────────────────── */}
      {releaseModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-card-dark border border-pink-subtle rounded-sm w-full max-w-md p-6">
            <h3 className="font-bold text-foreground mb-1">Liberar bóveda</h3>
            <p className="text-body-muted text-xs font-mono mb-5">
              {releaseModal.name} · Las condiciones están cumplidas.
            </p>

            {!releasing ? (
              <>
                {isCustodial && (
                  <>
                    <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      PIN de confirmación
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={releasePin}
                      onChange={(e) => setReleasePin(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-center text-xl tracking-[1rem] focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                      placeholder="••••"
                    />
                  </>
                )}
                {releaseError && <p className="text-xs font-mono text-dimmed mb-3">{releaseError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => { setReleaseModal(null); setReleasePin(""); }} className="flex-1 btn-outline-pink text-xs py-2.5 rounded-sm">
                    Cancelar
                  </button>
                  <button
                    onClick={handleRelease}
                    disabled={isCustodial && releasePin.length < 4}
                    className="flex-1 btn-pink text-xs py-2.5 rounded-sm"
                    style={{ opacity: isCustodial && releasePin.length < 4 ? 0.4 : 1 }}
                  >
                    Retirar →
                  </button>
                </div>
              </>
            ) : (
              <p className="font-mono text-xs text-pink animate-pulse py-4">Liberando bóveda en Soroban...</p>
            )}
          </div>
        </div>
      )}

      {/* ── Lock Modal ────────────────────────────────────── */}
      {lockModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-card-dark border border-pink-subtle rounded-sm w-full max-w-md p-6">
            <h3 className="font-bold text-foreground mb-1">Bloquear bóveda</h3>
            <p className="text-body-muted text-xs font-mono mb-5">
              {lockModal.name} · Define una fecha, una meta, o ambas.
            </p>

            {!locking ? (
              <>
                <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  Fecha de desbloqueo (opcional)
                </label>
                <input
                  type="date"
                  value={lockDate}
                  onChange={(e) => setLockDate(e.target.value)}
                  className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                />

                <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  Meta en USDC (opcional)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={lockGoal}
                  onChange={(e) => setLockGoal(e.target.value)}
                  className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                  placeholder="500.00"
                />

                {isCustodial && (
                  <>
                    <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      PIN de confirmación
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={lockPin}
                      onChange={(e) => setLockPin(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-center text-xl tracking-[1rem] focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                      placeholder="••••"
                    />
                  </>
                )}

                {lockError && <p className="text-xs font-mono text-dimmed mb-3">{lockError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => { setLockModal(null); setLockPin(""); setLockDate(""); setLockGoal(""); }} className="flex-1 btn-outline-pink text-xs py-2.5 rounded-sm">
                    Cancelar
                  </button>
                  <button
                    onClick={handleLock}
                    disabled={isCustodial && lockPin.length < 4}
                    className="flex-1 btn-pink text-xs py-2.5 rounded-sm"
                    style={{ opacity: isCustodial && lockPin.length < 4 ? 0.4 : 1 }}
                  >
                    Bloquear →
                  </button>
                </div>
              </>
            ) : (
              <p className="font-mono text-xs text-pink animate-pulse py-4">Bloqueando bóveda en Soroban...</p>
            )}
          </div>
        </div>
      )}

      {/* ── Add Funds Modal ───────────────────────────────── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-card-dark border border-pink-subtle rounded-sm w-full max-w-md p-6">
            <h3 className="font-bold text-foreground mb-1">Agregar fondos</h3>
            <p className="text-body-muted text-xs font-mono mb-5">
              {addModal.name} · Los fondos se suman a tu bloqueo actual.
            </p>

            {!adding ? (
              <>
                <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  Monto a agregar (USDC)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                  placeholder="10.00"
                />

                {isCustodial && (
                  <>
                    <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      PIN de confirmación
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={addPin}
                      onChange={(e) => setAddPin(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-card border border-border rounded-sm px-4 py-3 text-foreground text-center text-xl tracking-[1rem] focus:outline-none focus:ring-1 focus:ring-primary mb-4"
                      placeholder="••••"
                    />
                  </>
                )}

                {addError && <p className="text-xs font-mono text-dimmed mb-3">{addError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => { setAddModal(null); setAddAmount(""); setAddPin(""); }} className="flex-1 btn-outline-pink text-xs py-2.5 rounded-sm">
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddToLock}
                    disabled={isCustodial && addPin.length < 4}
                    className="flex-1 btn-pink text-xs py-2.5 rounded-sm"
                    style={{ opacity: isCustodial && addPin.length < 4 ? 0.4 : 1 }}
                  >
                    Agregar →
                  </button>
                </div>
              </>
            ) : (
              <p className="font-mono text-xs text-pink animate-pulse py-4">Agregando fondos en Soroban...</p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Bovedas;
