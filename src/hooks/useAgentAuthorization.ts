import { useCallback, useEffect, useState } from "react";
import { useContracts } from "@/hooks/useContracts";
import { AGENT_ADDRESS } from "@/lib/stellar/client";

/** Whether this user authorized Propulsor's agent in the SplitProtocol contract. */
export function useAgentAuthorization() {
  const contracts = useContracts();
  const { publicKey } = contracts;
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    contracts.getAgent().then((agent) => {
      if (cancelled) return;
      setAuthorized(agent === AGENT_ADDRESS);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const authorize = useCallback(
    async (pin?: string) => {
      await contracts.authorizeAgent(AGENT_ADDRESS, pin);
      setAuthorized(true);
    },
    [publicKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const revoke = useCallback(
    async (pin?: string) => {
      await contracts.revokeAgent(pin);
      setAuthorized(false);
    },
    [publicKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { authorized, loading, authorize, revoke };
}
