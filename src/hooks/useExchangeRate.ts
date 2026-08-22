import { useState, useEffect } from "react";

export interface ExchangeRate {
  /** PEN per 1 USD */
  rate: number;
  loading: boolean;
}

// Fallback used until the live rate loads (or if the fetch fails) — kept
// close to reality so the simulator never shows a wildly wrong number, but
// this is not meant to stay accurate over time on its own.
const FALLBACK_PEN_PER_USD = 3.71;

export function useExchangeRate(): ExchangeRate {
  const [state, setState] = useState<ExchangeRate>({ rate: FALLBACK_PEN_PER_USD, loading: true });

  useEffect(() => {
    let cancelled = false;

    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { result?: string; rates?: Record<string, number> }) => {
        if (cancelled) return;
        const pen = data.result === "success" ? data.rates?.PEN : undefined;
        setState({ rate: pen ?? FALLBACK_PEN_PER_USD, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
