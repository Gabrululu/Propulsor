import SplitBar from "./SplitBar";

interface VaultCardProps {
  name: string;
  icon: string;
  percentage: number;
  balance: number;
  goalAmount?: number;
  unlockDate?: string;
  isLocked?: boolean;
  colorVariant: "pink" | "mint" | "pink-soft";
}

const colorTextMap = {
  pink: "text-pink",
  mint: "text-mint",
  "pink-soft": "text-pink-soft",
};

const VaultCard = ({
  name,
  icon,
  percentage,
  balance,
  goalAmount,
  unlockDate,
  isLocked,
  colorVariant,
}: VaultCardProps) => {
  const progress = goalAmount ? (balance / goalAmount) * 100 : percentage;

  return (
    <div className="bg-card-dark border border-pink-subtle rounded-sm p-5 hover:bg-hover-dark transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className={`text-sm font-bold uppercase tracking-wide ${colorTextMap[colorVariant]}`}>
              {name}
            </h3>
            <span className="text-body-muted text-xs font-mono">{percentage}%</span>
          </div>
        </div>
        {isLocked && (
          <span className="text-xs font-mono text-body-muted bg-deep px-2 py-1 rounded-sm">
            🔒 {unlockDate ? `Hasta ${unlockDate}` : "Bloqueado"}
          </span>
        )}
        {!isLocked && balance > 0 && (
          <span className="text-xs font-mono text-mint bg-deep px-2 py-1 rounded-sm">
            ✓ Disponible
          </span>
        )}
      </div>

      <div className="mb-3">
        <span className={`font-mono text-2xl font-bold ${colorTextMap[colorVariant]}`}>
          ${balance.toFixed(2)}
        </span>
        <span className="text-body-muted text-sm ml-2">USDC</span>
      </div>

      <SplitBar
        segments={[{ percentage: Math.min(progress, 100), color: colorVariant }]}
        height={4}
      />

      {goalAmount && (
        <div className="flex justify-between mt-2">
          <span className="text-xs text-dimmed font-mono">
            {((balance / goalAmount) * 100).toFixed(0)}% completado
          </span>
          <span className="text-xs text-dimmed font-mono">
            Meta: ${goalAmount.toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button className="btn-pink text-xs py-2 px-4 rounded-sm flex-1" disabled={isLocked}>
          Depositar
        </button>
        <button
          className="btn-outline-pink text-xs py-2 px-4 rounded-sm flex-1"
          disabled={isLocked}
          style={{ opacity: isLocked ? 0.4 : 1 }}
        >
          Retirar
        </button>
      </div>
    </div>
  );
};

export default VaultCard;
