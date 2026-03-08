import { useNetworkStatus, type NetworkState } from "@/hooks/useNetworkStatus";

const statusConfig: Record<NetworkState, { dot: string; label: string; borderClass: string }> = {
  connected: {
    dot: "bg-[#b8f0c8]",
    label: "STELLAR TESTNET",
    borderClass: "border-mint-visible",
  },
  reconnecting: {
    dot: "bg-yellow-400",
    label: "RECONECTANDO...",
    borderClass: "border-yellow-400/20",
  },
  offline: {
    dot: "bg-red-500",
    label: "SIN CONEXIÓN",
    borderClass: "border-red-500/20",
  },
};

const NetworkStatusPill = () => {
  const status = useNetworkStatus();
  const config = statusConfig[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono text-[0.55rem] px-2.5 py-1 rounded-sm border ${config.borderClass}`}
      style={{ background: "rgba(184,240,200,0.06)" }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === "reconnecting" ? "animate-pulse" : ""}`} />
      <span className={status === "connected" ? "text-mint" : status === "reconnecting" ? "text-yellow-400" : "text-red-400"}>
        {config.label}
      </span>
    </div>
  );
};

export default NetworkStatusPill;
