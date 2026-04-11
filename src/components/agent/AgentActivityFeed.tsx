import { useEffect, useRef } from "react";
import { useAgentActivity, type AgentActivityEvent } from "@/hooks/useAgentActivity";

const EVENT_CONFIG: Record<string, { icon: string; color: string }> = {
  split_executed: { icon: "🔵", color: "text-mint" },
  blend_deposit: { icon: "💜", color: "text-mint" },
  payment_detected: { icon: "💸", color: "text-pink" },
  agent_error: { icon: "🔴", color: "text-pink-soft" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function formatEventLine(event: AgentActivityEvent): string {
  const amount = event.amount_usdc ? `${event.amount_usdc.toFixed(2)} USDC` : "";

  switch (event.event_type) {
    case "payment_detected":
      return `Pago detectado — ${amount}`;
    case "split_executed": {
      if (event.vault_breakdown) {
        const vb = event.vault_breakdown;
        const parts = Object.entries(vb)
          .map(([k, v]) => `${k}: ${Number(v).toFixed(2)}`)
          .join(" · ");
        return `Split ejecutado — ${parts}`;
      }
      return `Split ejecutado — ${amount}`;
    }
    case "blend_deposit":
      return `Blend deposit ✓ — txHash: ${event.blend_tx_hash?.slice(0, 8) ?? "..."}...`;
    case "agent_error":
      return `Error: ${event.error_message ?? "desconocido"}`;
    default:
      return `${event.event_type} — ${amount}`;
  }
}

const AgentActivityFeed = () => {
  const { events, loading } = useAgentActivity();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div className="bg-card-dark border border-pink-subtle rounded-sm mb-8">
      <div className="px-4 py-2.5 border-b border-pink-subtle flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-pink-soft opacity-40" />
          <div className="w-2 h-2 rounded-full bg-body-muted opacity-20" />
          <div className="w-2 h-2 rounded-full bg-body-muted opacity-20" />
        </div>
        <span className="font-mono text-[0.6rem] text-dimmed ml-1 uppercase tracking-widest">
          Agent Activity Feed
        </span>
      </div>

      <div
        ref={scrollRef}
        className="p-4 font-mono text-xs leading-relaxed max-h-48 overflow-y-auto"
      >
        {loading ? (
          <p className="text-body-muted animate-pulse">Cargando actividad...</p>
        ) : events.length === 0 ? (
          <p className="text-dimmed">
            No hay actividad del agente todavía. El agente registrará eventos aquí cuando detecte pagos y ejecute splits.
          </p>
        ) : (
          events.map((event) => {
            const config = EVENT_CONFIG[event.event_type] ?? { icon: "·", color: "text-body-muted" };
            return (
              <div key={event.id} className={`${config.color} mb-1`}>
                {config.icon} [{formatTime(event.created_at)}] {formatEventLine(event)}
                {event.tx_hash && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${event.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mint ml-1 hover:underline"
                  >
                    ↗
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AgentActivityFeed;
