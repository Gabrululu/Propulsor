import { useState, useEffect } from "react";
import { horizonServer } from "@/lib/stellar/client";

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
        // Fetch fee stats from Horizon
        const feeStats = await horizonServer.feeStats();
        const baseFee = parseInt(feeStats.fee_charged.mode, 10);
        const feeXLM = baseFee / 10_000_000;

        // Fetch XLM price from CoinGecko (free, no API key)
        let xlmPrice = 0.1; // fallback
        try {
          const priceRes = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd"
          );
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            xlmPrice = priceData.stellar?.usd ?? 0.1;
          }
        } catch {
          // Use fallback price
        }

        const feeUSD = feeXLM * xlmPrice;

        setEstimate({
          baseFeeStroops: baseFee,
          feeXLM,
          feeUSD,
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
