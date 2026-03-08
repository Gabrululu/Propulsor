import { useState, useEffect, useCallback, useRef } from "react";
import { horizonServer } from "@/lib/stellar/client";

export type NetworkState = "connected" | "reconnecting" | "offline";

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkState>("reconnecting");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const checkConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      await horizonServer.ledgers().limit(1).call();
      clearTimeout(timeout);
      setStatus("connected");
    } catch {
      setStatus((prev) => (prev === "connected" ? "reconnecting" : "offline"));
    }
  }, []);

  useEffect(() => {
    checkConnection();
    intervalRef.current = setInterval(checkConnection, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkConnection]);

  return status;
}
