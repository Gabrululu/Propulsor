/**
 * blend.ts — Blend Protocol integration for Propulsor
 *
 * Deposits USDC into Blend Protocol's lending pool on Stellar Testnet
 * after a split is executed, enabling vault_2 (savings) to earn yield
 * automatically.
 *
 * Blend docs:  https://docs.blend.capital
 * Pool IDs:    Run `npm run blend:pools` or check https://testnet.blend.capital
 *
 * Environment variables:
 *   BLEND_POOL_ID      — Blend lending pool contract ID on Stellar Testnet
 *   RPC_URL            — Soroban RPC URL (defaults to testnet)
 */

import {
  Asset,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;

// Blend USDC lending pool contract ID on Stellar Testnet.
// Find the current pool address at https://testnet.blend.capital or
// in the Blend Capital deployment notes at https://github.com/blend-capital.
// Default points to a known testnet pool — override via BLEND_POOL_ID env var.
const BLEND_POOL_ID =
  process.env.BLEND_POOL_ID ?? 'CCLBPEYS3XGM2RY4BPXJ3BKYKGZLBTVHYXHKPSEWCIJSZ6YD4EJSXDK';

// USDC asset on Stellar Testnet (Circle issuer)
const USDC_CODE = 'USDC';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

// Blend submit() RequestType — 0 = SupplyCollateral (deposit to earn yield)
const REQUEST_TYPE_SUPPLY_COLLATERAL = 0;

const BASE_FEE = '100';
const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepositToBlendParams {
  /** Stellar public key of the vault_2 account */
  userPublicKey: string;
  /** Stellar secret key of the vault_2 account (must hold USDC) */
  userSecret: string;
  /** Amount to deposit in stroops (1 USDC = 10_000_000 stroops) */
  amount: number;
}

export interface DepositToBlendResult {
  success: boolean;
  txHash?: string;
  /** Estimated bTokens received (proportional to amount supplied) */
  blendTokensReceived?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// XDR helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Stellar Asset Contract (SAC) ID for USDC on Testnet.
 * Computed deterministically from the asset — no hardcoded contract ID needed.
 */
function getUsdcSacId(): string {
  const asset = new Asset(USDC_CODE, USDC_ISSUER);
  return asset.contractId(NETWORK_PASSPHRASE);
}

/**
 * Builds a Blend Request ScVal for a supply operation.
 *
 * Blend Request struct (Soroban):
 *   { request_type: u32, address: Address, amount: i128 }
 *
 * Keys must be sorted alphabetically per Soroban XDR map convention.
 */
function buildSupplyRequest(assetContractId: string, amount: bigint): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('address'),
      val: new Address(assetContractId).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('amount'),
      val: nativeToScVal(amount, { type: 'i128' }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('request_type'),
      val: nativeToScVal(REQUEST_TYPE_SUPPLY_COLLATERAL, { type: 'u32' }),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

async function pollForConfirmation(
  soroban: SorobanRpc.Server,
  hash: string,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const result = await soroban.getTransaction(hash);
    if (result.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      return result;
    }
  }
  throw new Error(`Transaction ${hash} not confirmed after ${MAX_POLL_ATTEMPTS} attempts`);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Deposits USDC from vault_2 into Blend Protocol's lending pool on Stellar Testnet.
 *
 * Calls Blend's `submit(from, spender, to, requests)` with a single
 * SupplyCollateral request, then polls for confirmation.
 *
 * Throws on unrecoverable errors — callers should wrap in try/catch and
 * implement their own fallback (e.g. log and continue).
 *
 * @example
 * const result = await depositToBlend({
 *   userPublicKey: 'GABC...',
 *   userSecret: 'SABC...',
 *   amount: 1_000_000, // 0.1 USDC in stroops
 * });
 */
export async function depositToBlend({
  userPublicKey,
  userSecret,
  amount,
}: DepositToBlendParams): Promise<DepositToBlendResult> {
  if (amount <= 0) {
    throw new Error(`Invalid amount: ${amount} (must be > 0 stroops)`);
  }

  const soroban = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  const keypair = Keypair.fromSecret(userSecret);
  const poolContract = new Contract(BLEND_POOL_ID);
  const usdcSacId = getUsdcSacId();

  // Blend submit() args: from, spender, to, requests
  const fromScVal = new Address(userPublicKey).toScVal();
  const requestsScVal = xdr.ScVal.scvVec([
    buildSupplyRequest(usdcSacId, BigInt(amount)),
  ]);

  // Build transaction
  const account = await soroban.getAccount(userPublicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      poolContract.call(
        'submit',
        fromScVal,    // from
        fromScVal,    // spender (same as from — no delegate)
        fromScVal,    // to (bTokens go back to depositor)
        requestsScVal,
      ),
    )
    .setTimeout(30)
    .build();

  // Simulate to get resource footprint + auth entries
  const simResult = await soroban.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Blend simulation failed: ${simResult.error}`);
  }

  // Assemble (injects footprint + fee), sign, submit
  const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
  assembled.sign(keypair);

  const sendResult = await soroban.sendTransaction(assembled);
  if (sendResult.status === 'ERROR') {
    const details = sendResult.errorResult
      ? JSON.stringify(sendResult.errorResult)
      : 'unknown error';
    throw new Error(`Blend transaction send failed: ${details}`);
  }

  // Poll for on-chain confirmation
  const confirmed = await pollForConfirmation(soroban, sendResult.hash);

  if (confirmed.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(
      `Blend transaction failed on-chain (status=${confirmed.status}, hash=${sendResult.hash})`,
    );
  }

  // Parse bTokens from return value (Blend returns Positions struct).
  // We extract the supply balance as a best-effort estimate.
  let blendTokensReceived = String(amount); // fallback: deposited amount
  if (confirmed.returnValue) {
    try {
      const native = scValToNative(confirmed.returnValue);
      // Positions is a map — look for collateral supply entry
      if (native && typeof native === 'object') {
        const supplyEntry =
          native?.supply?.[usdcSacId] ?? native?.collateral?.[usdcSacId];
        if (supplyEntry !== undefined) {
          blendTokensReceived = String(supplyEntry);
        }
      }
    } catch {
      // Non-critical — bToken parsing is best-effort
    }
  }

  return {
    success: true,
    txHash: sendResult.hash,
    blendTokensReceived,
  };
}
