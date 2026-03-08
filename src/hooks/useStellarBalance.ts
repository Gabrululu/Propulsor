import { useState, useEffect, useRef } from "react";
import { getAccountBalance, type AccountBalances } from "@/lib/stellar/wallet";

export function useStellarBalance(publicKey: string | null) {
  const [balance, setBalance] = useState<AccountBalances>({ xlm: 0, usdc: 0 });
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!publicKey) return;

    const fetchBalance = async () => {
      setLoading(true);
      const b = await getAccountBalance(publicKey);
      setBalance(b);
      setLoading(false);
    };

    fetchBalance();
    // Poll every 30s
    intervalRef.current = setInterval(fetchBalance, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [publicKey]);

  return { balance, loading, refresh: async () => {
    if (publicKey) {
      const b = await getAccountBalance(publicKey);
      setBalance(b);
    }
  }};
}
