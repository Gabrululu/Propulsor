import { useState, useEffect, useCallback, useRef } from "react";
import { getHorizonServer } from "@/lib/stellar/client";

export type NetworkState = "connected" | "reconnecting" | "offline";

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkState>("reconnecting");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const checkConnection = useCallback(async () => {
    try {
      const server = await getHorizonServer();
      await server.ledgers().limit(1).call();
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
