import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { kit, FREIGHTER_ID, type WalletId } from "./wallets-kit";
import { createCustodialAccount, signCustodial, loadEncryptedSecret } from "./custody";
import { NETWORK_PASSPHRASE } from "./client";

// ── Types ───────────────────────────────────────────────────

export type WalletMode = "custodial" | "external" | null;

interface WalletState {
  mode: WalletMode;
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletId: WalletId | null;

  connectCustodial: (userId: string, pin: string) => Promise<string>;
  connectExternal: (walletId: WalletId) => Promise<void>;
  disconnect: () => void;
  signTransaction: (txXdr: string, pin?: string) => Promise<string>;
}

const STORAGE_KEY = "propulsor_wallet";

interface PersistedWallet {
  mode: WalletMode;
  publicKey: string | null;
  walletId: WalletId | null;
}

// ── Context ─────────────────────────────────────────────────

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

// ── Provider ────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WalletMode>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<WalletId | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = !!publicKey && !!mode;

  // Restore persisted connection
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: PersistedWallet = JSON.parse(stored);
        if (parsed.publicKey && parsed.mode) {
          setMode(parsed.mode);
          setPublicKey(parsed.publicKey);
          setWalletId(parsed.walletId);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const persist = useCallback((m: WalletMode, pk: string | null, wId: WalletId | null) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: m, publicKey: pk, walletId: wId }));
  }, []);

  // ── Custodial connect ───────────────────────────────────
  const connectCustodial = useCallback(
    async (userId: string, pin: string): Promise<string> => {
      setIsConnecting(true);
      try {
        const { publicKey: pk } = await createCustodialAccount(userId, pin);
        setMode("custodial");
        setPublicKey(pk);
        setWalletId(null);
        persist("custodial", pk, null);
        return pk;
      } finally {
        setIsConnecting(false);
      }
    },
    [persist]
  );

  // ── External wallet connect ─────────────────────────────
  const connectExternal = useCallback(
    async (wId: WalletId) => {
      setIsConnecting(true);
      try {
        kit.setWallet(wId);
        const { address } = await kit.getAddress();
        setMode("external");
        setPublicKey(address);
        setWalletId(wId);
        persist("external", address, wId);
      } finally {
        setIsConnecting(false);
      }
    },
    [persist]
  );

  // ── Disconnect ──────────────────────────────────────────
  const disconnect = useCallback(() => {
    setMode(null);
    setPublicKey(null);
    setWalletId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ── Sign transaction (dual path) ───────────────────────
  const signTransaction = useCallback(
    async (txXdr: string, pin?: string): Promise<string> => {
      if (mode === "custodial") {
        if (!pin) throw new Error("PIN requerido para firmar");
        // Load encrypted secret from Supabase
        const stored = localStorage.getItem(STORAGE_KEY);
        const userId = stored ? JSON.parse(stored).userId : null;
        const encryptedSecret = userId ? await loadEncryptedSecret(userId) : null;
        if (!encryptedSecret) throw new Error("No se encontró la clave cifrada");
        return signCustodial(txXdr, encryptedSecret, pin);
      }

      if (mode === "external" && publicKey) {
        if (walletId) kit.setWallet(walletId);
        const { signedTxXdr } = await kit.signTransaction(txXdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: publicKey,
        });
        return signedTxXdr;
      }

      throw new Error("No hay wallet conectada");
    },
    [mode, publicKey, walletId]
  );

  return (
    <WalletContext.Provider
      value={{
        mode,
        publicKey,
        isConnected,
        isConnecting,
        walletId,
        connectCustodial,
        connectExternal,
        disconnect,
        signTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
