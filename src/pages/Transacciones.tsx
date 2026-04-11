import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useStellarTransactions, type StellarTransaction } from "@/hooks/useStellarTransactions";
import { useAgentActivity, type AgentActivityEvent } from "@/hooks/useAgentActivity";
import { truncateAddress } from "@/lib/stellar";

type FilterTab = "todas" | "manuales" | "agente";

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

const AgentTxRow = ({ event }: { event: AgentActivityEvent }) => (
  <div className="flex items-center justify-between py-3 px-4 border-b border-pink-subtle hover:bg-hover-dark transition-colors">
    <div className="flex items-center gap-3">
      <span className="text-lg w-8 text-center">🤖</span>
      <div>
        <p className="text-sm text-foreground">
          {event.event_type === "split_executed" && "Agent Split"}
          {event.event_type === "blend_deposit" && "Blend Deposit"}
          {event.event_type === "payment_detected" && "Pago Detectado"}
          {event.event_type === "agent_error" && "Error"}
          {event.amount_usdc != null && (
            <span className="text-mint ml-2 font-mono">${event.amount_usdc.toFixed(2)}</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {event.tx_hash && (
            <>
              <button
                onClick={() => navigator.clipboard.writeText(event.tx_hash!)}
                className="text-xs text-dimmed font-mono hover:text-pink transition-colors"
                title="Copiar hash"
              >
                {truncateAddress(event.tx_hash)}
              </button>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${event.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-mint font-mono hover:text-foreground transition-colors"
              >
                Ver en Explorer →
              </a>
            </>
          )}
          {event.error_message && (
            <span className="text-xs text-pink-soft font-mono">{event.error_message}</span>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <span className="text-xs text-dimmed">
        {new Date(event.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className={`text-xs font-mono px-2 py-0.5 rounded-sm ${
        event.event_type === "agent_error" ? "text-pink-soft bg-deep" : "text-mint bg-deep"
      }`}>
        {event.event_type === "agent_error" ? "Error" : "🤖 Agente"}
      </span>
    </div>
  </div>
);

const Transacciones = () => {
  const { publicKey } = useWallet();
  const { transactions: stellarTxs, loading: stellarLoading } = useStellarTransactions(publicKey);
  const { events: agentEvents, loading: agentLoading } = useAgentActivity();
  const [filter, setFilter] = useState<FilterTab>("todas");

  const loading = stellarLoading || agentLoading;

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "manuales", label: "Manuales" },
    { key: "agente", label: "Agente 🤖" },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 md:p-10 max-w-5xl pb-24 md:pb-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">TRANSACCIONES</h1>
        <p className="text-body-muted text-xs font-mono mb-6">
          {loading ? "Cargando..." : `${stellarTxs.length} on-chain · ${agentEvents.length} agent events`}
        </p>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`font-mono text-xs px-3 py-1.5 rounded-sm transition-colors border ${
                filter === tab.key
                  ? "bg-pink/10 border-pink text-pink"
                  : "border-pink-subtle text-body-muted hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-card-dark rounded-sm border border-pink-subtle overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <p className="text-body-muted text-sm font-mono animate-pulse">Cargando...</p>
            </div>
          ) : (
            <>
              {/* Agent events */}
              {(filter === "todas" || filter === "agente") &&
                agentEvents.map((event) => <AgentTxRow key={event.id} event={event} />)}

              {/* On-chain transactions */}
              {(filter === "todas" || filter === "manuales") &&
                stellarTxs.map((tx) => <StellarTxRow key={tx.id} tx={tx} />)}

              {/* Empty state */}
              {((filter === "todas" && stellarTxs.length === 0 && agentEvents.length === 0) ||
                (filter === "manuales" && stellarTxs.length === 0) ||
                (filter === "agente" && agentEvents.length === 0)) && (
                <div className="p-8 text-center">
                  <p className="text-body-muted text-sm">
                    {filter === "agente"
                      ? "No hay eventos del agente todavía."
                      : publicKey
                      ? "No hay transacciones todavía."
                      : "Conecta tu cuenta Stellar para ver transacciones."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Transacciones;
