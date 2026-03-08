import { useState, useEffect } from "react";
import { getHorizonServer } from "@/lib/stellar/client";

export interface FeeEstimate {
  baseFeeStroops: number;
  feeXLM: number;
  feeUSD: number;
  xlmPrice: number;
  loading: boolean;
}

export function useStellarFees(): FeeEstimate {
  const [estimate, setEstimate] = useState<FeeEstimate>({
    baseFeeStroops: 100,
    feeXLM: 0.00001,
    feeUSD: 0.000001,
    xlmPrice: 0.1,
    loading: true,
  });

  useEffect(() => {
    const fetchFees = async () => {
      try {
        const server = await getHorizonServer();
        const feeStats = await server.feeStats();
        const baseFee = parseInt(feeStats.fee_charged.mode, 10);
        const feeXLM = baseFee / 10_000_000;

        let xlmPrice = 0.1;
        try {
          const priceRes = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd"
          );
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            xlmPrice = priceData.stellar?.usd ?? 0.1;
          }
        } catch {}

        setEstimate({
          baseFeeStroops: baseFee,
          feeXLM,
          feeUSD: feeXLM * xlmPrice,
          xlmPrice,
          loading: false,
        });
      } catch {
        setEstimate((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchFees();
  }, []);

  return estimate;
}
