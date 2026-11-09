/**
 * Wallet connections through each wallet's official SDK, imported on demand.
 * API shaped like Stellar Wallets Kit, which pulls in Ledger, Trezor and
 * WalletConnect dependencies this app doesn't use.
 */

import { NETWORK_PASSPHRASE } from "./client";

// ── Wallet IDs ──────────────────────────────────────────────
export const FREIGHTER_ID = "freighter";
export const XBULL_ID = "xbull";
export const ALBEDO_ID = "albedo";
export const LOBSTR_ID = "lobstr";

export type WalletId = typeof FREIGHTER_ID | typeof XBULL_ID | typeof ALBEDO_ID | typeof LOBSTR_ID;

export interface WalletModule {
  id: WalletId;
  name: string;
  icon: string;
  isAvailable: () => Promise<boolean>;
  requestAccess: () => Promise<string>; // opens popup → returns address
  getAddress: () => Promise<string>;    // returns address if already granted
  signTransaction: (txXdr: string, opts: { networkPassphrase: string; address: string }) => Promise<string>;
}

// ── Varial Module ───────────────────────────────────────────
function createVarialModule(): WalletModule {
  const getAddress = async () => {
    const { getAddress } = await import("@stellar/varial-sdk");
    const { address, error } = await getAddress();
    if (error) throw new Error(error.message);
    if (!address) throw new Error("Varial no devolvió una dirección. Inicia sesión en la extensión primero.");
    return address;
  };
  return {
    id: FREIGHTER_ID,
    name: "Varial",
    icon: "V",
    async isAvailable() {
      try {
        const { isConnected } = await import("@stellar/varial-sdk");
        const { isConnected: installed, error } = await isConnected();
        return !error && installed;
      } catch {
        return false;
      }
    },
    async requestAccess() {
      const { requestAccess } = await import("@stellar/varial-sdk");
      const { address, error } = await requestAccess();
      if (error) throw new Error(error.message);
      return address || getAddress();
    },
    getAddress,
    async signTransaction(txXdr, opts) {
      const { getNetwork, signTransaction } = await import("@stellar/varial-sdk");
      const { networkPassphrase, error: networkError } = await getNetwork();
      if (networkError) throw new Error(networkError.message);
      if (networkPassphrase !== opts.networkPassphrase) throw new Error("WRONG_NETWORK");
      const { signedTxXdr, error } = await signTransaction(txXdr, opts);
      if (error) throw new Error(error.message);
      return signedTxXdr;
    },
  };
}

// ── xBull Module (web bridge, no extension required) ────────
function createXBullModule(): WalletModule {
  const withBridge = async <T>(
    run: (bridge: import("@creit.tech/xbull-wallet-connect").xBullWalletConnect) => Promise<T>,
  ) => {
    const { xBullWalletConnect } = await import("@creit.tech/xbull-wallet-connect");
    const bridge = new xBullWalletConnect();
    try {
      return await run(bridge);
    } finally {
      bridge.closeConnections();
    }
  };
  const getAddress = () => withBridge((bridge) => bridge.connect());
  return {
    id: XBULL_ID,
    name: "xBull",
    icon: "🐂",
    isAvailable: async () => true,
    requestAccess: getAddress,
    getAddress,
    signTransaction: (txXdr, opts) =>
      withBridge((bridge) =>
        bridge.sign({ xdr: txXdr, publicKey: opts.address, network: opts.networkPassphrase }),
      ),
  };
}

// ── Lobstr Module (extension) ───────────────────────────────
function createLobstrModule(): WalletModule {
  const getAddress = async () => {
    const { getPublicKey } = await import("@lobstrco/signer-extension-api");
    return getPublicKey();
  };
  return {
    id: LOBSTR_ID,
    name: "Lobstr",
    icon: "🦞",
    async isAvailable() {
      try {
        const { isConnected } = await import("@lobstrco/signer-extension-api");
        return await isConnected();
      } catch {
        return false;
      }
    },
    requestAccess: getAddress,
    getAddress,
    async signTransaction(txXdr) {
      // Lobstr's API doesn't let an app choose the network or the signer
      const { signTransaction } = await import("@lobstrco/signer-extension-api");
      return signTransaction(txXdr);
    },
  };
}

// ── Albedo Module (web-based, always available) ─────────────
function createAlbedoModule(): WalletModule {
  const load = async () => {
    const module = await import("@albedo-link/intent");
    // Its CommonJS build nests the export depending on the bundler
    const intent = module.default as unknown as { default?: typeof module.default };
    return intent.default ?? module.default;
  };
  const getAddress = async () => {
    const albedo = await load();
    return (await albedo.publicKey({})).pubkey;
  };
  return {
    id: ALBEDO_ID,
    name: "Albedo",
    icon: "🌅",
    isAvailable: async () => true,
    requestAccess: getAddress,
    getAddress,
    async signTransaction(txXdr, opts) {
      const albedo = await load();
      const { signed_envelope_xdr } = await albedo.tx({
        xdr: txXdr,
        pubkey: opts.address,
        network: "testnet",
      });
      return signed_envelope_xdr;
    },
  };
}

// ── Kit Class ───────────────────────────────────────────────
export class StellarWalletsKit {
  private modules: WalletModule[];
  private selectedWalletId: WalletId;
  private network: string;

  constructor(opts: {
    network: string;
    selectedWalletId: WalletId;
    modules: WalletModule[];
  }) {
    this.network = opts.network;
    this.selectedWalletId = opts.selectedWalletId;
    this.modules = opts.modules;
  }

  setWallet(id: WalletId) {
    this.selectedWalletId = id;
  }

  getSelectedModule(): WalletModule {
    const mod = this.modules.find((m) => m.id === this.selectedWalletId);
    if (!mod) throw new Error(`Wallet ${this.selectedWalletId} not found`);
    return mod;
  }

  /** Request access — opens wallet popup for user to approve */
  async requestAccess(): Promise<{ address: string }> {
    const mod = this.getSelectedModule();
    const address = await mod.requestAccess();
    return { address };
  }

  /** Get address (only works if already authorized) */
  async getAddress(): Promise<{ address: string }> {
    const mod = this.getSelectedModule();
    const address = await mod.getAddress();
    return { address };
  }

  async signTransaction(
    txXdr: string,
    opts: { networkPassphrase: string; address: string }
  ): Promise<{ signedTxXdr: string }> {
    const mod = this.getSelectedModule();
    const signedTxXdr = await mod.signTransaction(txXdr, opts);
    return { signedTxXdr };
  }

  async isAvailable(walletId: WalletId): Promise<boolean> {
    const mod = this.modules.find((m) => m.id === walletId);
    if (!mod) return false;
    return mod.isAvailable();
  }

  getModules(): WalletModule[] {
    return this.modules;
  }
}

// ── Default modules (no native deps) ────────────────────────
export function createDefaultModules(): WalletModule[] {
  return [
    createVarialModule(),
    createXBullModule(),
    createAlbedoModule(),
    createLobstrModule(),
  ];
}

// ── Singleton Kit Instance ──────────────────────────────────
export const kit = new StellarWalletsKit({
  network: NETWORK_PASSPHRASE,
  selectedWalletId: FREIGHTER_ID,
  modules: createDefaultModules(),
});

// ── Helpers ─────────────────────────────────────────────────
export async function getWalletAddress(): Promise<string> {
  const { address } = await kit.requestAccess();
  return address;
}

export async function signWithWallet(txXdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await kit.signTransaction(txXdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  return signedTxXdr;
}
