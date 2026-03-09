import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TxRow from "@/components/TxRow";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useStellarTransactions, type StellarTransaction } from "@/hooks/useStellarTransactions";
import { truncateAddress } from "@/lib/stellar";

const filters = ["Todos", "Depósitos", "Retiros", "Separaciones", "Bloqueos"];
const filterMap: Record<string, string | undefined> = {
  Todos: undefined,
  Depósitos: "deposit",
  Retiros: "withdrawal",
  Separaciones: "split",
  Bloqueos: "lock",
};

const StellarTxRow = ({ tx }: { tx: StellarTransaction }) => (
  <div className="flex items-center justify-between py-3 px-4 border-b border-pink-subtle hover:bg-hover-dark transition-colors">
    <div className="flex items-center gap-3">
      <span className="text-lg w-8 text-center">🌐</span>
      <div>
        <p className="text-sm text-foreground">
          Transacción Stellar ({tx.operationCount} op{tx.operationCount !== 1 ? "s" : ""})
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            onClick={() => navigator.clipboard.writeText(tx.hash)}
            className="text-xs text-dimmed font-mono hover:text-pink transition-colors"
            title="Copiar hash"
          >
            {truncateAddress(tx.hash)}
          </button>
          <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-mint font-mono hover:text-foreground transition-colors"
          >
            Ver en Explorer →
          </a>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <span className="text-xs text-dimmed">
        {new Date(tx.timestamp).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className={`text-xs font-mono px-2 py-0.5 rounded-sm ${tx.successful ? "text-mint bg-deep" : "text-pink-soft bg-deep"}`}>
        {tx.successful ? "Confirmado" : "Fallido"}
      </span>
    </div>
  </div>
);

const Transacciones = () => {
  const { publicKey } = useWallet();
  const [filter, setFilter] = useState("Todos");
  const [tab, setTab] = useState<"stellar">("stellar");
  const { transactions: stellarTxs, loading: stellarLoading } = useStellarTransactions(publicKey);

  const filtered = filterMap[filter]
    ? allTxs.filter((tx) => tx.type === filterMap[filter])
    : allTxs;

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">TRANSACCIONES</h1>
        <p className="text-body-muted text-xs font-mono mb-6">{allTxs.length} transacciones totales</p>

        {/* Tabs: Local / Stellar */}
        <div className="flex gap-1 mb-6 border-b border-pink-subtle">
          <button
            onClick={() => setTab("local")}
            className={`font-mono text-xs px-4 py-2.5 transition-colors ${
              tab === "local"
                ? "text-pink border-b-2 border-pink"
                : "text-dimmed hover:text-foreground"
            }`}
          >
            PROPULSOR
          </button>
          <button
            onClick={() => setTab("stellar")}
            className={`font-mono text-xs px-4 py-2.5 transition-colors ${
              tab === "stellar"
                ? "text-mint border-b-2 border-[#b8f0c8]"
                : "text-dimmed hover:text-foreground"
            }`}
          >
            STELLAR
          </button>
        </div>

        {tab === "local" && (
          <>
            {/* Filters */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors ${
                    filter === f
                      ? "text-pink border-pink-visible bg-card-dark"
                      : "text-dimmed border-pink-subtle hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="bg-card-dark rounded-sm border border-pink-subtle overflow-hidden">
              {filtered.length > 0 ? (
                filtered.map((tx, i) => <TxRow key={i} {...tx} />)
              ) : (
                <div className="p-8 text-center">
                  <p className="text-body-muted text-sm">No hay transacciones de este tipo.</p>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "stellar" && (
          <div className="bg-card-dark rounded-sm border border-pink-subtle overflow-hidden">
            {stellarLoading ? (
              <div className="p-8 text-center">
                <p className="text-body-muted text-sm font-mono">Cargando desde Horizon...</p>
              </div>
            ) : stellarTxs.length > 0 ? (
              stellarTxs.map((tx) => <StellarTxRow key={tx.id} tx={tx} />)
            ) : (
              <div className="p-8 text-center">
                <p className="text-body-muted text-sm">
                  {DEMO_PUBLIC_KEY
                    ? "No hay transacciones en Stellar todavía."
                    : "Conecta tu cuenta Stellar para ver transacciones on-chain."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Transacciones;
