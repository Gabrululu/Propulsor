import { useState, useEffect, useRef } from "react";
import { getAccountBalance, type AccountBalances } from "@/lib/stellar/wallet";

export function useStellarBalance(publicKey: string | null) {
  const [balance, setBalance] = useState<AccountBalances>({ xlm: 0, usdc: 0 });
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!publicKey) return;

    let active = true; // prevents stale updates after unmount or publicKey change

    const fetchBalance = async () => {
      if (!active) return;
      setLoading(true);
      const b = await getAccountBalance(publicKey);
      if (active) {
        setBalance(b);
        setLoading(false);
      }
    };

    fetchBalance();
    intervalRef.current = setInterval(fetchBalance, 30000);

    return () => {
      active = false;
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
