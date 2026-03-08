import { useWallet } from "@/lib/stellar/WalletContext";
import { truncateAddress } from "@/lib/stellar/wallet";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";
import { useState } from "react";

const WalletDisplay = () => {
  const { mode, publicKey, walletId, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);

  if (!publicKey || !mode) return null;

  const isCustodial = mode === "custodial";

  return (
    <div className="border-t border-pink-subtle pt-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{isCustodial ? "🔐" : "🔗"}</span>
        <span
          className={`font-mono text-[0.6rem] uppercase tracking-widest ${
            isCustodial ? "text-pink" : "text-mint"
          }`}
        >
          {isCustodial ? "CUENTA PROPULSOR" : "WALLET CONECTADA"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-dimmed">{truncateAddress(publicKey)}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(publicKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-[0.6rem] font-mono text-body-muted hover:text-pink transition-colors"
        >
          {copied ? "✓" : "📋"}
        </button>
      </div>

      <p className="font-mono text-[0.55rem] text-dimmed">
        {isCustodial ? "Protegida con PIN" : walletId ?? "External wallet"}
      </p>

      <div className="flex items-center justify-between">
        <a
          href={`${STELLAR_EXPLORER_BASE}/account/${publicKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.55rem] font-mono text-mint hover:underline"
        >
          Ver en Explorer
        </a>
        <button
          onClick={disconnect}
          className="text-[0.6rem] font-mono text-dimmed hover:text-pink transition-colors"
        >
          Desconectar
        </button>
      </div>
    </div>
  );
};

export default WalletDisplay;
