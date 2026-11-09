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
import { getHorizonServer, NETWORK_PASSPHRASE } from "./client";

// ── Create a custodial account ──────────────────────────────

export interface CustodialAccountResult {
  publicKey: string;
  funded: boolean;
  mode: "custodial" | "custodial_social";
}

export async function createCustodialAccount(
  userId: string,
  pin: string,
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
    { onConflict: "id" },
  );

  if (error) {
    throw new Error("PROFILE_SAVE_FAILED");
  }

  return { publicKey, funded, mode: "custodial" };
}

// ── Sign a transaction as a custodial user ──────────────────

export async function signCustodial(
  txXdr: string,
  encryptedSecret: string,
  pin: string,
): Promise<string> {
  // Decrypt the secret key
  const secret = await decryptSecretKey(encryptedSecret, pin).catch(() => {
    throw new Error("INCORRECT_PIN");
  });

  // Build keypair and sign
  const keypair = StellarSdk.Keypair.fromSecret(secret);

  // Parse XDR → sign → return XDR
  try {
    const tx = StellarSdk.TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
    tx.sign(keypair);
    return tx.toXDR();
  } catch {
    // Fallback: try as FeeBumpTransaction
    throw new Error("No se pudo firmar la transacción");
  }
}

// ── Load encrypted secret from Supabase ─────────────────────

export async function loadEncryptedSecret(
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users_profile")
    .select("stellar_secret_encrypted")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data.stellar_secret_encrypted ?? null;
}

// ── Social accounts' passphrase ─────────────────────────────
// Derived server-side from a secret (see wallet-key Edge Function), so a copy of
// the database isn't enough to decrypt keys.

export async function getSocialPassphrase(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("wallet-key");
  if (error || typeof data?.passphrase !== "string") {
    throw new Error("WALLET_KEY_UNAVAILABLE");
  }
  return data.passphrase;
}

// ── Create custodial account without PIN (social auth) ──────
// Idempotent: returns existing keys if account already exists.

export async function createCustodialAccountNoPin(
  userId: string,
): Promise<CustodialAccountResult> {
  // Return existing account if already created
  const { data: existing, error: loadError } = await supabase
    .from("users_profile")
    .select("stellar_public_key, stellar_secret_encrypted")
    .eq("id", userId)
    .maybeSingle();
  if (loadError) throw new Error("PROFILE_SAVE_FAILED");

  if (existing?.stellar_public_key && existing?.stellar_secret_encrypted) {
    // Testnet resets can remove an account while its encrypted key still exists.
    let funded = false;
    try {
      await (await getHorizonServer()).loadAccount(existing.stellar_public_key);
      funded = true;
    } catch {
      funded = await fundTestnetAccount(existing.stellar_public_key);
    }
    const passphrase = await getSocialPassphrase();
    // Accounts created before the server-side secret used userId as passphrase
    const reencrypted = (await verifyPin(existing.stellar_secret_encrypted, userId))
      ? await encryptSecretKey(
          await decryptSecretKey(existing.stellar_secret_encrypted, userId),
          passphrase,
        )
      : null;
    const { error } = await supabase
      .from("users_profile")
      .update({
        stellar_funded: funded,
        ...(reencrypted && { stellar_secret_encrypted: reencrypted }),
      })
      .eq("id", userId);
    if (error) throw new Error("PROFILE_SAVE_FAILED");
    return {
      publicKey: existing.stellar_public_key,
      funded,
      mode:
        reencrypted ||
        (await verifyPin(existing.stellar_secret_encrypted, passphrase))
          ? "custodial_social"
          : "custodial",
    };
  }

  // Before creating anything, so a missing server secret can't strand an account
  const passphrase = await getSocialPassphrase();
  const { publicKey, secretKey } = generateKeypair();
  const funded = await fundTestnetAccount(publicKey);
  const encrypted = await encryptSecretKey(secretKey, passphrase);

  const { error } = await supabase.from("users_profile").upsert(
    {
      id: userId,
      stellar_public_key: publicKey,
      stellar_secret_encrypted: encrypted,
      stellar_funded: funded,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error("PROFILE_SAVE_FAILED");
  }

  return { publicKey, funded, mode: "custodial_social" };
}

// ── Verify PIN is correct (decrypt → check validity) ────────

export async function verifyPin(
  encryptedSecret: string,
  pin: string,
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
