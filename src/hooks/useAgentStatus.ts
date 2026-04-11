import { useState, useEffect } from "react";

const AGENT_SERVER_URL = import.meta.env.VITE_AGENT_SERVER_URL ?? "";
const POLL_INTERVAL_MS = 15_000;

export interface AgentStatus {
  /** true when the /health endpoint responds with 200 */
  isOnline: boolean;
  /** Agent server address (Stellar public key), returned by /health */
  agentAddress?: string;
  /** Whether a server URL is configured at all */
  isConfigured: boolean;
  loading: boolean;
}

/**
 * Polls the autonomous agent's /health endpoint.
 * Set VITE_AGENT_SERVER_URL in the frontend .env (e.g. http://localhost:3001).
 * Falls back gracefully if the server is unreachable or CORS blocks the request.
 */
export function useAgentStatus(): AgentStatus {
  const [isOnline, setIsOnline] = useState(false);
  const [agentAddress, setAgentAddress] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const isConfigured = Boolean(AGENT_SERVER_URL);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${AGENT_SERVER_URL}/health`, {
          signal: AbortSignal.timeout(3_000),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setIsOnline(true);
          setAgentAddress(data.serverAddress);
        } else {
          setIsOnline(false);
        }
      } catch {
        if (!cancelled) setIsOnline(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isConfigured]);

  return { isOnline, agentAddress, isConfigured, loading };
}
