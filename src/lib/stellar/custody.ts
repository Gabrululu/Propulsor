/**
 * Custodial key management — generate, encrypt, sign for users without wallets.
 * Uses AES-GCM with PBKDF2-derived keys from user's 4-digit PIN.
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import { supabase } from "@/integrations/supabase/client";
import {
  generateKeypair,
  fundTestnetAccount,
  encryptSecretKey,
  decryptSecretKey,
} from "./wallet";
import { NETWORK_PASSPHRASE } from "./client";

// ── Create a custodial account ──────────────────────────────

export interface CustodialAccountResult {
  publicKey: string;
  funded: boolean;
}

export async function createCustodialAccount(
  userId: string,
  pin: string
): Promise<CustodialAccountResult> {
  // 1. Generate Stellar keypair
  const { publicKey, secretKey } = generateKeypair();

  // 2. Fund on testnet via Friendbot
  const funded = await fundTestnetAccount(publicKey);

  // 3. Encrypt secret key with PIN (AES-GCM + PBKDF2)
  const encrypted = await encryptSecretKey(secretKey, pin);

  // 4. Save to Supabase (NEVER store plaintext secret)
  // Note: using upsert pattern since profile may already exist
  const { error } = await supabase.from("users_profile").upsert(
    {
      id: userId,
      stellar_public_key: publicKey,
      stellar_secret_encrypted: encrypted,
      stellar_funded: funded,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Failed to save custodial account:", error.message);
  }

  return { publicKey, funded };
}

// ── Sign a transaction as a custodial user ──────────────────

export async function signCustodial(
  txXdr: string,
  encryptedSecret: string,
  pin: string
): Promise<string> {
  // Decrypt the secret key
  const secret = await decryptSecretKey(encryptedSecret, pin);

  // Build keypair and sign
  const keypair = StellarSdk.Keypair.fromSecret(secret);

  // Parse XDR → sign → return XDR
  try {
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      txXdr,
      NETWORK_PASSPHRASE
    );
    tx.sign(keypair);
    return tx.toXDR();
  } catch {
    // Fallback: try as FeeBumpTransaction
    throw new Error("No se pudo firmar la transacción");
  }
}

// ── Load encrypted secret from Supabase ─────────────────────

export async function loadEncryptedSecret(
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users_profile")
    .select("stellar_secret_encrypted")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data.stellar_secret_encrypted ?? null;
}

// ── Create custodial account without PIN (social auth) ──────
// Uses userId as the encryption seed — no PIN required.
// Idempotent: returns existing keys if account already exists.

export async function createCustodialAccountNoPin(
  userId: string
): Promise<CustodialAccountResult> {
  // Return existing account if already created
  const { data: existing } = await supabase
    .from("users_profile")
    .select("stellar_public_key, stellar_secret_encrypted")
    .eq("id", userId)
    .single();

  if (existing?.stellar_public_key && existing?.stellar_secret_encrypted) {
    return { publicKey: existing.stellar_public_key, funded: true };
  }

  // Generate new keypair and encrypt using userId as passphrase
  const { publicKey, secretKey } = generateKeypair();
  const funded = await fundTestnetAccount(publicKey);
  const encrypted = await encryptSecretKey(secretKey, userId);

  const { error } = await supabase.from("users_profile").upsert(
    {
      id: userId,
      stellar_public_key: publicKey,
      stellar_secret_encrypted: encrypted,
      stellar_funded: funded,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Failed to save social custodial account:", error.message);
  }

  return { publicKey, funded };
}

// ── Verify PIN is correct (decrypt → check validity) ────────

export async function verifyPin(
  encryptedSecret: string,
  pin: string
): Promise<boolean> {
  try {
    const secret = await decryptSecretKey(encryptedSecret, pin);
    // Verify it's a valid Stellar secret
    StellarSdk.Keypair.fromSecret(secret);
    return true;
  } catch {
    return false;
  }
}
