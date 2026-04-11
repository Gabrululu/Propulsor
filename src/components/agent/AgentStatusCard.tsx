import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useAgentActivity } from "@/hooks/useAgentActivity";
import { truncateAddress } from "@/lib/stellar";

// Flow steps shown inside the card
const FLOW_STEPS = [
  { icon: "💸", label: "Remesa" },
  { icon: "👁", label: "Horizon" },
  { icon: "⚡", label: "x402" },
  { icon: "📊", label: "Split" },
  { icon: "💰", label: "Blend" },
];

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

const AgentStatusCard = () => {
  const { isOnline, agentAddress, isConfigured, loading: healthLoading } = useAgentStatus();
  const { status, loading: statusLoading } = useAgentActivity();

  const loading = healthLoading || statusLoading;
  const isActive = isOnline || status?.is_active;

  return (
    <div
      className="bg-card-dark border rounded-sm p-5 mb-8 transition-colors"
      style={{
        borderColor: isActive ? "rgba(184,240,200,0.25)" : "rgba(255,179,198,0.12)",
      }}
    >
      {/* ── Header row ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="font-mono text-xs uppercase tracking-widest text-foreground font-bold">
            Agente Propulsor
          </span>
        </div>

        {loading ? (
          <span className="font-mono text-xs text-body-muted">...</span>
        ) : isActive ? (
          <span className="flex items-center gap-1.5 font-mono text-xs text-mint">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse inline-block" />
            Activo
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-xs text-body-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-body-muted inline-block" />
            {isConfigured ? "Offline" : "No configurado"}
          </span>
        )}
      </div>

      {/* ── Description ──────────────────────────────────────── */}
      <p className="text-body-muted text-xs font-mono mb-4 leading-relaxed">
        {isActive
          ? "Tu dinero está protegido en el momento en que llega. El agente detecta cada remesa y ejecuta el split antes de que llegue cualquier presión externa."
          : isConfigured
          ? "El servidor del agente no responde. Inicia el agente con npm run dev en la carpeta /agent para habilitar los splits automáticos."
          : "El agente autónomo no está configurado. Inicia el servidor en /agent y añade VITE_AGENT_SERVER_URL al .env del frontend."}
      </p>

      {/* ── Stats row (from agent_status) ────────────────────── */}
      {status && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-deep rounded-sm p-2.5 border border-pink-subtle">
            <span className="font-mono text-[0.55rem] text-body-muted uppercase tracking-wider block mb-0.5">Splits</span>
            <span className="font-mono text-sm text-foreground font-bold">{status.total_splits}</span>
          </div>
          <div className="bg-deep rounded-sm p-2.5 border border-pink-subtle">
            <span className="font-mono text-[0.55rem] text-body-muted uppercase tracking-wider block mb-0.5">Último split</span>
            <span className="font-mono text-sm text-foreground">{timeAgo(status.last_split_at)}</span>
          </div>
          <div className="bg-deep rounded-sm p-2.5 border border-pink-subtle">
            <span className="font-mono text-[0.55rem] text-mint uppercase tracking-wider block mb-0.5">Blend yield</span>
            <span className="font-mono text-sm text-mint font-bold">${Number(status.total_yield_usdc).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* ── Flow diagram ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
            <div
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-sm border"
              style={{
                borderColor: isActive
                  ? "rgba(184,240,200,0.2)"
                  : "rgba(255,179,198,0.08)",
                backgroundColor: isActive
                  ? "rgba(184,240,200,0.04)"
                  : "transparent",
              }}
            >
              <span className="text-sm">{step.icon}</span>
              <span
                className="font-mono text-[0.55rem] uppercase tracking-wider"
                style={{ color: isActive ? "#b8f0c8" : "#5a4850" }}
              >
                {step.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <span
                className="font-mono text-xs"
                style={{ color: isActive ? "#b8f0c8" : "#3a2830" }}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Footer: agent address + watched account ──────────── */}
      {(isActive && (agentAddress || status?.watched_account)) && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-pink-subtle flex-wrap">
          {agentAddress && (
            <>
              <span className="font-mono text-[0.6rem] text-body-muted uppercase tracking-widest">
                Agente
              </span>
              <span className="font-mono text-[0.6rem] text-foreground">
                {truncateAddress(agentAddress)}
              </span>
            </>
          )}
          {status?.watched_account && (
            <>
              <span className="font-mono text-[0.6rem] text-body-muted uppercase tracking-widest">
                Cuenta
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(status.watched_account!)}
                className="font-mono text-[0.6rem] text-foreground hover:text-mint transition-colors"
                title="Copiar dirección"
              >
                {truncateAddress(status.watched_account)}
              </button>
            </>
          )}
          <span className="font-mono text-[0.6rem] text-body-muted ml-auto">
            Stellar Testnet
          </span>
        </div>
      )}

      {!isActive && !loading && (
        <div className="mt-3 pt-3 border-t border-pink-subtle">
          <code className="font-mono text-[0.6rem] text-dimmed">
            cd agent &amp;&amp; npm run dev &amp;&amp; npm run monitor
          </code>
        </div>
      )}
    </div>
  );
};

export default AgentStatusCard;
