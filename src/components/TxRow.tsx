interface TxRowProps {
  type: "deposit" | "withdrawal" | "split" | "lock";
  description: string;
  amount: number;
  vault?: string;
  txHash?: string;
  timestamp: string;
  status: "confirmed" | "pending";
}

const typeIcons: Record<string, string> = {
  deposit: "↓",
  withdrawal: "↑",
  split: "⚡",
  lock: "🔒",
};

const TxRow = ({ type, description, amount, vault, txHash, timestamp, status }: TxRowProps) => {
  const isIncoming = type === "deposit" || type === "split";
  const truncatedHash = txHash
    ? `${txHash.slice(0, 4)}...${txHash.slice(-4)}`
    : null;

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-pink-subtle hover:bg-hover-dark transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-lg w-8 text-center">{typeIcons[type]}</span>
        <div>
          <p className="text-sm text-foreground">{description}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {vault && <span className="text-xs text-body-muted font-mono">{vault}</span>}
            {truncatedHash && (
              <button
                onClick={() => navigator.clipboard.writeText(txHash!)}
                className="text-xs text-dimmed font-mono hover:text-pink transition-colors"
                title="Copiar hash"
              >
                {truncatedHash}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`font-mono text-sm font-bold ${isIncoming ? "text-mint" : "text-body-muted"}`}>
          {isIncoming ? "+" : "-"}${Math.abs(amount).toFixed(2)}
        </span>
        <span className="text-xs text-dimmed">{timestamp}</span>
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded-sm ${
            status === "confirmed"
              ? "text-mint bg-deep"
              : "text-pink-soft bg-deep"
          }`}
        >
          {status === "confirmed" ? "Confirmado" : "Pendiente"}
        </span>
      </div>
    </div>
  );
};

export default TxRow;
