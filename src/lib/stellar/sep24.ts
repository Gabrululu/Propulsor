/**
 * SEP-24 — Hosted Deposit and Withdrawal ("fiat on-ramp").
 *
 * Implements the client side of stellar.org's SEP-1 (anchor discovery),
 * SEP-10 (challenge-based auth), and SEP-24 (interactive deposit) flows,
 * tested end-to-end against Stellar's public reference anchor
 * (testanchor.stellar.org — see client.ts's SEP24_HOME_DOMAIN) before this
 * module was written: discovery → SEP-10 auth → interactive session
 * creation → status polling, each step verified against a real response.
 *
 * Spec references:
 *   SEP-1  https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md
 *   SEP-10 https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md
 *   SEP-24 https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
 *
 * Usage (see hooks/useSep24Deposit.ts for the stateful wrapper used by the UI):
 *   const anchor = await discoverAnchor(SEP24_HOME_DOMAIN);
 *   const jwt    = await sep10Authenticate(anchor, publicKey, signFn);
 *   const dep    = await initiateSep24Deposit(anchor, jwt, { assetCode: "USDC", account: publicKey });
 *   // show dep.url in an iframe, then poll:
 *   const tx     = await getSep24Transaction(anchor, jwt, dep.id);
 */

import { Transaction } from "@stellar/stellar-sdk";
import type { SignFn } from "./contracts";

// ── SEP-1: anchor discovery ─────────────────────────────────────────────────

export interface AnchorInfo {
  webAuthEndpoint: string;
  transferServerSep24: string;
  signingKey: string;
  networkPassphrase: string;
}

/**
 * Extracts top-level `KEY = "value"` assignments from a stellar.toml. Only
 * the handful of scalar fields SEP-10/24 discovery needs are read here — the
 * [[CURRENCIES]] array and other tables are ignored, so a full TOML parser
 * isn't pulled in as a dependency for this.
 */
function parseTomlScalars(toml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of toml.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

export async function discoverAnchor(homeDomain: string): Promise<AnchorInfo> {
  const res = await fetch(`https://${homeDomain}/.well-known/stellar.toml`);
  if (!res.ok) throw new Error(`No se pudo leer stellar.toml de ${homeDomain} (HTTP ${res.status})`);
  const fields = parseTomlScalars(await res.text());

  const webAuthEndpoint = fields.WEB_AUTH_ENDPOINT;
  const transferServerSep24 = fields.TRANSFER_SERVER_SEP0024;
  const signingKey = fields.SIGNING_KEY;
  const networkPassphrase = fields.NETWORK_PASSPHRASE;

  if (!webAuthEndpoint || !transferServerSep24 || !signingKey || !networkPassphrase) {
    throw new Error(`${homeDomain} no publica los campos SEP-1 requeridos para SEP-10/24`);
  }
  return { webAuthEndpoint, transferServerSep24, signingKey, networkPassphrase };
}

// ── SEP-10: challenge-based authentication ──────────────────────────────────

interface ChallengeResponse {
  transaction: string;
  network_passphrase: string;
}

/**
 * Requests a SEP-10 challenge transaction, signs it with the caller-provided
 * SignFn (works transparently for custodial/social/external wallets — see
 * hooks/useSigner.ts), and exchanges it for a JWT.
 */
export async function sep10Authenticate(
  anchor: AnchorInfo,
  publicKey: string,
  sign: SignFn,
): Promise<string> {
  const challengeRes = await fetch(`${anchor.webAuthEndpoint}?account=${encodeURIComponent(publicKey)}`);
  if (!challengeRes.ok) throw new Error(`SEP-10 challenge falló (HTTP ${challengeRes.status})`);
  const challenge: ChallengeResponse = await challengeRes.json();

  if (challenge.network_passphrase !== anchor.networkPassphrase) {
    throw new Error("SEP-10: network_passphrase del challenge no coincide con stellar.toml");
  }

  // Sanity-check the challenge before signing it (SEP-10 §Verification):
  // sequence number must be 0 and the transaction must be for our account.
  const tx = new Transaction(challenge.transaction, challenge.network_passphrase);
  if (tx.sequence !== "0") throw new Error("SEP-10: challenge transaction sequence number no es 0");
  if (tx.source !== anchor.signingKey) throw new Error("SEP-10: challenge no está firmado por el SIGNING_KEY del anchor");

  const signedXdr = await sign(challenge.transaction);

  const tokenRes = await fetch(anchor.webAuthEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedXdr }),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(`SEP-10 auth rechazada (HTTP ${tokenRes.status}): ${body}`);
  }
  const { token } = await tokenRes.json() as { token: string };
  return token;
}

// ── SEP-24: interactive deposit ─────────────────────────────────────────────

export interface Sep24AssetInfo {
  enabled: boolean;
  min_amount?: number;
  max_amount?: number;
}

export async function getSep24Info(anchor: AnchorInfo): Promise<{ deposit: Record<string, Sep24AssetInfo> }> {
  const res = await fetch(`${anchor.transferServerSep24}/info`);
  if (!res.ok) throw new Error(`SEP-24 /info falló (HTTP ${res.status})`);
  return res.json();
}

export interface Sep24DepositSession {
  id: string;
  url: string;
}

export async function initiateSep24Deposit(
  anchor: AnchorInfo,
  jwt: string,
  params: { assetCode: string; account: string; amount?: string },
): Promise<Sep24DepositSession> {
  const res = await fetch(`${anchor.transferServerSep24}/transactions/deposit/interactive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      asset_code: params.assetCode,
      account: params.account,
      ...(params.amount ? { amount: params.amount } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`No se pudo iniciar el depósito SEP-24 (HTTP ${res.status}): ${body}`);
  }
  const data = await res.json() as { type: string; url: string; id: string };
  return { id: data.id, url: data.url };
}

// ── SEP-24: transaction status polling ──────────────────────────────────────

export type Sep24TransactionStatus =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_anchor"
  | "pending_stellar"
  | "pending_external"
  | "completed"
  | "refunded"
  | "expired"
  | "error"
  | string; // anchors may define additional custom statuses

export interface Sep24Transaction {
  id: string;
  status: Sep24TransactionStatus;
  amount_in?: string;
  amount_out?: string;
  stellar_transaction_id?: string;
  more_info_url?: string;
}

export async function getSep24Transaction(
  anchor: AnchorInfo,
  jwt: string,
  id: string,
): Promise<Sep24Transaction> {
  const res = await fetch(`${anchor.transferServerSep24}/transaction?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`No se pudo consultar la transacción SEP-24 (HTTP ${res.status})`);
  const data = await res.json() as { transaction: Sep24Transaction };
  return data.transaction;
}
