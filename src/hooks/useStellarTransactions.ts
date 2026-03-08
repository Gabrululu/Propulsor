import { useState, useEffect } from "react";
import { horizonServer, STELLAR_EXPLORER_BASE } from "@/lib/stellar/client";

export interface StellarTransaction {
  id: string;
  hash: string;
  timestamp: string;
  operationCount: number;
  successful: boolean;
  explorerUrl: string;
  memo?: string;
}

export function useStellarTransactions(publicKey: string | null) {
  const [transactions, setTransactions] = useState<StellarTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) return;

    const fetchTxs = async () => {
      setLoading(true);
      try {
        const response = await horizonServer
          .transactions()
          .forAccount(publicKey)
          .order("desc")
          .limit(20)
          .call();

        const txs: StellarTransaction[] = response.records.map((record: any) => ({
          id: record.id,
          hash: record.hash,
          timestamp: record.created_at,
          operationCount: record.operation_count,
          successful: record.successful,
          explorerUrl: `${STELLAR_EXPLORER_BASE}/tx/${record.hash}`,
          memo: record.memo,
        }));

        setTransactions(txs);
      } catch {
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTxs();
  }, [publicKey]);

  return { transactions, loading };
}
