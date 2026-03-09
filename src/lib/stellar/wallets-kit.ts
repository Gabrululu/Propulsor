/**
 * Stellar Wallets Kit — lightweight abstraction
 * Supports: Freighter (extension), xBull (extension), Albedo (web), Lobstr (extension)
 * Pattern matches @creit.tech/stellar-wallets-kit API without native USB deps
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

// ── Freighter Module ────────────────────────────────────────
function createFreighterModule(): WalletModule {
  return {
    id: FREIGHTER_ID,
    name: "Freighter",
    icon: "🚀",
    async isAvailable() {
      try {
        const freighter = await import("@stellar/freighter-api");
        const result = await freighter.isConnected();
        return !!result;
      } catch {
        return false;
      }
    },
    async requestAccess() {
      const freighter = await import("@stellar/freighter-api");
      const result = await freighter.requestAccess();
      if ("error" in result) throw new Error(result.error);
      // requestAccess can return empty string if user hasn't signed in yet
      if (!result.address) {
        // Retry with getAddress after access was granted
        const addrResult = await freighter.getAddress();
        if ("error" in addrResult) throw new Error(addrResult.error);
        if (!addrResult.address) throw new Error("No se obtuvo la dirección de Freighter. Asegúrate de estar logueado en la extensión.");
        return addrResult.address;
      }
      return result.address;
    },
    async getAddress() {
      const freighter = await import("@stellar/freighter-api");
      const result = await freighter.getAddress();
      if ("error" in result) throw new Error(result.error);
      if (!result.address) throw new Error("Freighter no devolvió una dirección. Inicia sesión en la extensión primero.");
      return result.address;
    },
    async signTransaction(txXdr, opts) {
      const freighter = await import("@stellar/freighter-api");
      const result = await freighter.signTransaction(txXdr, {
        networkPassphrase: opts.networkPassphrase,
        address: opts.address,
      });
      if ("error" in result) throw new Error(result.error);
      return result.signedTxXdr;
    },
  };
}

// ── Generic Extension Module (xBull, Lobstr) ────────────────
function createGenericExtensionModule(id: WalletId, name: string, icon: string): WalletModule {
  return {
    id,
    name,
    icon,
    async isAvailable() {
      if (id === XBULL_ID) return typeof (window as any).xBullSDK !== "undefined";
      if (id === LOBSTR_ID) return typeof (window as any).lobstrSignerExtension !== "undefined";
      return false;
    },
    async requestAccess() {
      // For extensions, requestAccess is the same as getAddress
      return this.getAddress();
    },
    async getAddress() {
      if (id === XBULL_ID && (window as any).xBullSDK) {
        return (window as any).xBullSDK.connect({ canRequestPublicKey: true });
      }
      if (id === LOBSTR_ID && (window as any).lobstrSignerExtension) {
        return (window as any).lobstrSignerExtension.getPublicKey();
      }
      throw new Error(`${name} no está instalado. Instala la extensión y recarga la página.`);
    },
    async signTransaction(txXdr, opts) {
      if (id === XBULL_ID && (window as any).xBullSDK) {
        return (window as any).xBullSDK.signXDR(txXdr, { network: opts.networkPassphrase });
      }
      if (id === LOBSTR_ID && (window as any).lobstrSignerExtension) {
        return (window as any).lobstrSignerExtension.signTransaction(txXdr);
      }
      throw new Error(`${name} no está instalado`);
    },
  };
}

// ── Albedo Module (web-based, always available) ─────────────
function createAlbedoModule(): WalletModule {
  return {
    id: ALBEDO_ID,
    name: "Albedo",
    icon: "🌅",
    async isAvailable() {
      return true; // Web-based, always available
    },
    async requestAccess() {
      return this.getAddress();
    },
    async getAddress() {
      const w = window.open("https://albedo.link/intent/public-key", "_blank", "width=500,height=600");
      if (!w) throw new Error("Popup bloqueado por el navegador. Permite popups e intenta de nuevo.");
      throw new Error("Albedo requiere interacción manual en albedo.link");
    },
    async signTransaction(_txXdr) {
      throw new Error("Albedo signing no soportado en este entorno");
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
    createFreighterModule(),
    createGenericExtensionModule(XBULL_ID, "xBull", "🐂"),
    createAlbedoModule(),
    createGenericExtensionModule(LOBSTR_ID, "Lobstr", "🦞"),
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
