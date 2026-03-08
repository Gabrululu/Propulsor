import * as StellarSdk from "@stellar/stellar-sdk";
import {
  getHorizonServer,
  FRIENDBOT_URL,
  USDC_ASSET_CODE,
  USDC_ISSUER,
} from "./client";

// ── Keypair Generation ──────────────────────────────────────

export function generateKeypair(): { publicKey: string; secretKey: string } {
  const pair = StellarSdk.Keypair.random();
  return {
    publicKey: pair.publicKey(),
    secretKey: pair.secret(),
  };
}

// ── Friendbot Funding (Testnet Only) ────────────────────────

export async function fundTestnetAccount(publicKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Balance Queries ─────────────────────────────────────────

export interface AccountBalances {
  xlm: number;
  usdc: number;
}

export async function getAccountBalance(publicKey: string): Promise<AccountBalances> {
  try {
    const server = await getHorizonServer();
    const account = await server.loadAccount(publicKey);
    let xlm = 0;
    let usdc = 0;

    for (const balance of account.balances) {
      if (balance.asset_type === "native") {
        xlm = parseFloat(balance.balance);
      } else if (
        "asset_code" in balance &&
        balance.asset_code === USDC_ASSET_CODE &&
        "asset_issuer" in balance &&
        balance.asset_issuer === USDC_ISSUER
      ) {
        usdc = parseFloat(balance.balance);
      }
    }

    return { xlm, usdc };
  } catch {
    return { xlm: 0, usdc: 0 };
  }
}

// ── Secret Key Encryption (AES-GCM with PIN) ───────────────

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecretKey(secretKey: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    enc.encode(secretKey) as unknown as ArrayBuffer
  );

  // Pack salt + iv + ciphertext as base64
  const packed = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...packed));
}

export async function decryptSecretKey(encryptedBlob: string, pin: string): Promise<string> {
  const packed = Uint8Array.from(atob(encryptedBlob), (c) => c.charCodeAt(0));
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const ciphertext = packed.slice(28);

  const key = await deriveKey(pin, salt);
  const dec = new TextDecoder();

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return dec.decode(plaintext);
}

// ── Utility ─────────────────────────────────────────────────

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
