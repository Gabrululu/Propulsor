import SplitBar from "./SplitBar";
import { formatTimeRemaining } from "@/lib/stellar/contracts";

interface VaultCardProps {
  name: string;
  icon: string;
  percentage: number;
  balance: number;
  goalAmount?: number;
  unlockDate?: string;
  isLocked?: boolean;
  canRelease?: boolean;   // lock conditions are met → allow withdraw
  timeRemaining?: number; // seconds; 0 = no time condition
  colorVariant: "pink" | "mint" | "pink-soft";
  /** vault_2 (savings): show Blend Protocol yield integration badge */
  blendEnabled?: boolean;
  onLock?: () => void;
  onRelease?: () => void;
  onAdd?: () => void;
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
  canRelease,
  timeRemaining = 0,
  colorVariant,
  blendEnabled = false,
  onLock,
  onRelease,
  onAdd,
}: VaultCardProps) => {
  const progress = goalAmount ? (balance / goalAmount) * 100 : percentage;
  const locked = isLocked && !canRelease;

  return (
    <div className="bg-card-dark border border-pink-subtle rounded-sm p-5 hover:bg-hover-dark transition-colors">
      {/* Header */}
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

        {/* Status badge */}
        {canRelease && (
          <span className="text-xs font-mono text-mint bg-deep px-2 py-1 rounded-sm animate-pulse">
            🔓 Lista
          </span>
        )}
        {locked && (
          <span className="text-xs font-mono text-body-muted bg-deep px-2 py-1 rounded-sm">
            🔒 {unlockDate ? `Hasta ${unlockDate}` : "Bloqueada"}
          </span>
        )}
        {!locked && !canRelease && balance > 0 && (
          <span className="text-xs font-mono text-mint bg-deep px-2 py-1 rounded-sm">
            ✓ Disponible
          </span>
        )}
      </div>

      {/* Balance */}
      <div className="mb-3">
        <span className={`font-mono text-2xl font-bold ${colorTextMap[colorVariant]}`}>
          ${balance.toFixed(2)}
        </span>
        <span className="text-body-muted text-sm ml-2">USDC</span>
      </div>

      {/* Blend yield badge — shown on vault_2 (savings) */}
      {blendEnabled && (
        <div className="flex items-center gap-1.5 mb-3 py-1.5 px-2 rounded-sm border border-mint/20 bg-mint/5 w-fit">
          <span className="text-xs">💰</span>
          <span className="font-mono text-[0.65rem] text-mint uppercase tracking-wider">
            Blend · yield automático
          </span>
        </div>
      )}

      {/* Progress bar */}
      <SplitBar
        segments={[{ percentage: Math.min(progress, 100), color: colorVariant }]}
        height={4}
      />

      {/* Goal info */}
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

      {/* Time remaining */}
      {timeRemaining > 0 && locked && (
        <p className="text-xs font-mono text-dimmed mt-2">
          ⏱ {formatTimeRemaining(timeRemaining)}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        {/* Bloquear / Agregar fondos */}
        {!locked && !canRelease ? (
          <button
            onClick={onLock}
            className="btn-pink text-xs py-2 px-4 rounded-sm flex-1"
          >
            Bloquear
          </button>
        ) : locked && onAdd ? (
          <button
            onClick={onAdd}
            className="btn-pink text-xs py-2 px-4 rounded-sm flex-1"
          >
            + Agregar
          </button>
        ) : (
          <button className="btn-pink text-xs py-2 px-4 rounded-sm flex-1 opacity-40" disabled>
            Bloqueada
          </button>
        )}

        {/* Retirar / Liberar */}
        {canRelease ? (
          <button
            onClick={onRelease}
            className="btn-outline-pink text-xs py-2 px-4 rounded-sm flex-1"
          >
            Retirar →
          </button>
        ) : (
          <button
            className="btn-outline-pink text-xs py-2 px-4 rounded-sm flex-1"
            disabled={locked}
            style={{ opacity: locked ? 0.4 : 1 }}
          >
            Retirar
          </button>
        )}
      </div>
    </div>
  );
};

export default VaultCard;
