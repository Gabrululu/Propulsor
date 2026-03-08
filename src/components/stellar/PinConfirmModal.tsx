import { useState } from "react";

interface PinConfirmModalProps {
  isOpen: boolean;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  error?: string;
}

const PinConfirmModal = ({ isOpen, onConfirm, onCancel, error }: PinConfirmModalProps) => {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [shaking, setShaking] = useState(false);

  if (!isOpen) return null;

  const handleInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 3) {
      document.getElementById(`txpin-${index + 1}`)?.focus();
    }
  };

  const handleConfirm = () => {
    const pinStr = digits.join("");
    if (pinStr.length !== 4) return;
    onConfirm(pinStr);
  };

  // Trigger shake on error
  if (error && !shaking) {
    setShaking(true);
    setTimeout(() => setShaking(false), 600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-xs bg-card-dark rounded-sm border border-pink-subtle p-6 transition-transform ${
          shaking ? "animate-shake" : ""
        }`}
      >
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-pink mb-4 text-center">
          Confirma tu PIN para continuar
        </p>

        <div className="flex gap-3 justify-center mb-4">
          {digits.map((d, i) => (
            <input
              key={i}
              id={`txpin-${i}`}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleInput(i, e.target.value)}
              className="w-[52px] h-[52px] text-center text-2xl font-mono bg-card-dark border border-pink-subtle rounded-sm text-foreground focus:outline-none focus:border-pink-visible transition-colors"
            />
          ))}
        </div>

        {error && (
          <p className="text-pink text-xs font-mono text-center mb-3">{error}</p>
        )}

        <button
          onClick={handleConfirm}
          disabled={digits.join("").length < 4}
          className="btn-pink w-full rounded-sm text-sm"
          style={{ opacity: digits.join("").length < 4 ? 0.4 : 1 }}
        >
          Confirmar
        </button>

        <button
          onClick={onCancel}
          className="text-xs font-mono text-body-muted hover:text-foreground transition-colors w-full text-center mt-3"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default PinConfirmModal;
