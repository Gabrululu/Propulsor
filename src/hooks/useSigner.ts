/**
 * useSigner — resolves a `SignFn` for the active wallet mode.
 *
 * Extracted from useContracts.ts's makeSign so other flows that need to sign
 * an arbitrary transaction XDR (e.g. useSep24Deposit's SEP-10 challenge) get
 * the same custodial/social/external branching without duplicating it.
 *
 * Usage:
 *   const { publicKey, makeSign } = useSigner();
 *   const signed = await makeSign(pin)(txXdr);
 */

import { useCallback } from "react";
import { useWallet } from "@/lib/stellar/WalletContext";
import { useAuth } from "./useAuth";
import { loadEncryptedSecret, signCustodial } from "@/lib/stellar/custody";
import type { SignFn } from "@/lib/stellar/contracts";

export function useSigner() {
  const { publicKey, mode, signTransaction } = useWallet();
  const { user } = useAuth();

  const makeSign = useCallback(
    (pin?: string): SignFn =>
      async (txXdr: string) => {
        if (mode === "custodial") {
          if (!pin) throw new Error("PIN requerido para firmar");
          if (!user?.id) throw new Error("Sesión no encontrada");
          const enc = await loadEncryptedSecret(user.id);
          if (!enc) throw new Error("No se encontró la clave cifrada");
          return signCustodial(txXdr, enc, pin);
        }
        if (mode === "custodial_social") {
          if (!user?.id) throw new Error("Sesión no encontrada");
          const enc = await loadEncryptedSecret(user.id);
          if (!enc) throw new Error("No se encontró la clave cifrada");
          // Social accounts use userId as the encryption passphrase (no PIN)
          return signCustodial(txXdr, enc, user.id);
        }
        // External wallet (Freighter, xBull …)
        return signTransaction(txXdr);
      },
    [mode, user, signTransaction]
  );

  return { publicKey, mode, makeSign };
}
