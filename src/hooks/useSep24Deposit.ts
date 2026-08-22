/**
 * useSep24Deposit — drives the SEP-24 fiat on-ramp deposit flow.
 *
 * State machine: idle → authenticating (SEP-10) → initiating (SEP-24 session)
 * → interactive (hosted form opened in a new tab — anchors block iframing via
 * X-Frame-Options) → polling (form submitted, waiting on the anchor/bank)
 * → completed | error.
 *
 * Usage:
 *   const { state, startDeposit, reset } = useSep24Deposit();
 *   startDeposit("USDC", "25", pin); // pin only needed for custodial wallets
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSigner } from "./useSigner";
import {
  discoverAnchor,
  sep10Authenticate,
  initiateSep24Deposit,
  getSep24Transaction,
  type Sep24TransactionStatus,
} from "@/lib/stellar/sep24";
import { SEP24_HOME_DOMAIN } from "@/lib/stellar/client";

const POLL_INTERVAL_MS = 3000;

export type Sep24DepositState =
  | { status: "idle" }
  | { status: "authenticating" }
  | { status: "initiating" }
  | { status: "interactive"; url: string; transactionId: string }
  | { status: "polling"; url: string; transactionId: string; anchorStatus: Sep24TransactionStatus }
  | { status: "completed"; transactionId: string; amountIn?: string; stellarTxId?: string }
  | { status: "error"; message: string };

export function useSep24Deposit() {
  const { publicKey, makeSign } = useSigner();
  const [state, setState] = useState<Sep24DepositState>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }, []);

  // Stop polling on unmount so a closed modal doesn't keep hitting the anchor.
  useEffect(() => stopPolling, [stopPolling]);

  const startDeposit = useCallback(
    async (assetCode: string, amount: string, pin?: string) => {
      if (!publicKey) {
        setState({ status: "error", message: "Wallet no conectada" });
        return;
      }

      try {
        setState({ status: "authenticating" });
        const anchor = await discoverAnchor(SEP24_HOME_DOMAIN);
        const jwt = await sep10Authenticate(anchor, publicKey, makeSign(pin));

        setState({ status: "initiating" });
        const session = await initiateSep24Deposit(anchor, jwt, {
          assetCode,
          account: publicKey,
          amount,
        });

        setState({ status: "interactive", url: session.url, transactionId: session.id });

        pollRef.current = setInterval(async () => {
          try {
            const tx = await getSep24Transaction(anchor, jwt, session.id);

            if (tx.status === "completed") {
              stopPolling();
              setState({
                status: "completed",
                transactionId: session.id,
                amountIn: tx.amount_in,
                stellarTxId: tx.stellar_transaction_id,
              });
            } else if (tx.status === "error" || tx.status === "expired") {
              stopPolling();
              setState({ status: "error", message: `El anchor reportó el estado "${tx.status}" para este depósito.` });
            } else if (tx.status !== "incomplete") {
              // Past the hosted-form step (user submitted it) — reflect the
              // anchor's own status (pending_anchor, pending_stellar, etc.)
              // instead of leaving the iframe open indefinitely.
              setState((prev) =>
                prev.status === "interactive" || prev.status === "polling"
                  ? { status: "polling", url: session.url, transactionId: session.id, anchorStatus: tx.status }
                  : prev
              );
            }
          } catch {
            // Transient poll failure — retry on the next tick.
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
      }
    },
    [publicKey, makeSign, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({ status: "idle" });
  }, [stopPolling]);

  return { state, startDeposit, reset };
}
