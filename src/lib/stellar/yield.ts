/**
 * Yield for the savings vault, through Blend or DeFindex on Stellar Testnet.
 *
 * The user signs every deposit and withdrawal from their own account: there is
 * no shared account and the agent never moves these funds.
 *
 * Testnet only: both protocols use Blend's test USDC (issuer GATALTG…), not the
 * Circle test USDC that remittances arrive in, and there's no way to convert
 * one into the other on testnet. Users get Blend's USDC from its faucet. What
 * they deposit doesn't change Propulsor's vault accounting.
 *
 * Addresses: blend-capital/blend-utils testnet.contracts.json and
 * defindex-io/stellar-contracts public/testnet.contracts.json (checked 2026-11-09).
 */

import * as S from "@stellar/stellar-sdk";
import { supabase } from "@/integrations/supabase/client";
import { NETWORK_PASSPHRASE } from "./client";
import {
  invoke,
  readContract,
  submitSigned,
  type ProgressFn,
  type SignFn,
} from "./contracts";

export const BLEND_TESTNET_POOL = "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";
export const BLEND_TESTNET_USDC = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";
export const BLEND_TESTNET_ISSUER = "GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56";
export const DEFINDEX_TESTNET_USDC_VAULT = "CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN";

export type YieldProviderId = "blend" | "defindex";

export const YIELD_PROVIDERS: Record<
  YieldProviderId,
  { name: string; description: string; contractId: string }
> = {
  blend: {
    name: "Blend",
    description:
      "Prestas tu USDC en un pool de préstamos y ganas intereses. Puedes retirarlo cuando quieras.",
    contractId: BLEND_TESTNET_POOL,
  },
  defindex: {
    name: "DeFindex",
    description:
      "Una bóveda que reparte tu USDC entre estrategias, como Blend. En testnet su bóveda aún no invierte, así que el saldo no crece.",
    contractId: DEFINDEX_TESTNET_USDC_VAULT,
  },
};

// Blend's b_rate has 12 decimals; RequestType 0 = Supply, 1 = Withdraw.
const B_RATE_SCALE = 1_000_000_000_000n;
const BLEND_SUPPLY = 0;
const BLEND_WITHDRAW = 1;
// Most a DeFindex deposit or withdrawal may come in below the expected amount.
const SLIPPAGE_BPS = 100n;

const addressVal = (address: string) => new S.Address(address).toScVal();
const i128 = (value: bigint) => S.nativeToScVal(value, { type: "i128" });
const minAfterSlippage = (value: bigint) => (value * (10_000n - SLIPPAGE_BPS)) / 10_000n;

function blendRequest(requestType: number, amount: bigint): S.xdr.ScVal {
  // Struct fields must be sorted by name
  return S.xdr.ScVal.scvMap([
    new S.xdr.ScMapEntry({
      key: S.xdr.ScVal.scvSymbol("address"),
      val: addressVal(BLEND_TESTNET_USDC),
    }),
    new S.xdr.ScMapEntry({ key: S.xdr.ScVal.scvSymbol("amount"), val: i128(amount) }),
    new S.xdr.ScMapEntry({
      key: S.xdr.ScVal.scvSymbol("request_type"),
      val: S.nativeToScVal(requestType, { type: "u32" }),
    }),
  ]);
}

async function readOrThrow(contractId: string, method: string, args: S.xdr.ScVal[], publicKey: string) {
  const value = await readContract(contractId, method, args, publicKey);
  if (!value) throw new Error("YIELD_UNAVAILABLE");
  return S.scValToNative(value);
}

/** Blend test USDC in the user's account, in stroops. null = no trustline yet. */
export async function getTestUsdcBalance(publicKey: string): Promise<bigint | null> {
  const value = await readContract(BLEND_TESTNET_USDC, "balance", [addressVal(publicKey)], publicKey);
  return value ? BigInt(S.scValToNative(value)) : null;
}

/** USDC the user has supplied to the Blend pool, interest included, in stroops. */
export async function getBlendPosition(publicKey: string): Promise<bigint> {
  const [reserve, positions] = await Promise.all([
    readOrThrow(BLEND_TESTNET_POOL, "get_reserve", [addressVal(BLEND_TESTNET_USDC)], publicKey),
    readOrThrow(BLEND_TESTNET_POOL, "get_positions", [addressVal(publicKey)], publicKey),
  ]);
  const bTokens = BigInt(positions.supply?.[reserve.config.index] ?? 0);
  return (bTokens * BigInt(reserve.data.b_rate)) / B_RATE_SCALE;
}

async function getDefindexShares(publicKey: string): Promise<bigint> {
  return BigInt(
    await readOrThrow(DEFINDEX_TESTNET_USDC_VAULT, "balance", [addressVal(publicKey)], publicKey),
  );
}

async function sharesToUsdc(shares: bigint, publicKey: string): Promise<bigint> {
  if (shares === 0n) return 0n;
  const amounts = await readOrThrow(
    DEFINDEX_TESTNET_USDC_VAULT,
    "get_asset_amounts_per_shares",
    [i128(shares)],
    publicKey,
  );
  return BigInt(amounts[0]);
}

/** USDC the user holds in the provider, in stroops. */
export async function getYieldPosition(provider: YieldProviderId, publicKey: string): Promise<bigint> {
  if (provider === "blend") return getBlendPosition(publicKey);
  return sharesToUsdc(await getDefindexShares(publicKey), publicKey);
}

export async function depositToYield(
  provider: YieldProviderId,
  publicKey: string,
  amount: bigint,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<string> {
  if (amount <= 0n) throw new Error("INVALID_AMOUNT");
  const me = addressVal(publicKey);
  if (provider === "blend") {
    const { txHash } = await invoke(
      BLEND_TESTNET_POOL,
      "submit",
      [me, me, me, S.xdr.ScVal.scvVec([blendRequest(BLEND_SUPPLY, amount)])],
      publicKey,
      signFn,
      onProgress,
    );
    return txHash;
  }
  const { txHash } = await invoke(
    DEFINDEX_TESTNET_USDC_VAULT,
    "deposit",
    [
      S.xdr.ScVal.scvVec([i128(amount)]),
      S.xdr.ScVal.scvVec([i128(minAfterSlippage(amount))]),
      me,
      S.xdr.ScVal.scvBool(true), // invest right away in the vault's strategies
    ],
    publicKey,
    signFn,
    onProgress,
  );
  return txHash;
}

/** Withdraws everything the user has in the provider back to their account. */
export async function withdrawAllFromYield(
  provider: YieldProviderId,
  publicKey: string,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<string> {
  const me = addressVal(publicKey);
  if (provider === "blend") {
    const position = await getBlendPosition(publicKey);
    if (position === 0n) throw new Error("NOTHING_TO_WITHDRAW");
    // Interest keeps accruing until the transaction lands. Blend withdraws at
    // most the whole position, so asking a little more empties it.
    const amount = position + position / 100n + 1n;
    const { txHash } = await invoke(
      BLEND_TESTNET_POOL,
      "submit",
      [me, me, me, S.xdr.ScVal.scvVec([blendRequest(BLEND_WITHDRAW, amount)])],
      publicKey,
      signFn,
      onProgress,
    );
    return txHash;
  }
  const shares = await getDefindexShares(publicKey);
  if (shares === 0n) throw new Error("NOTHING_TO_WITHDRAW");
  const expected = await sharesToUsdc(shares, publicKey);
  const { txHash } = await invoke(
    DEFINDEX_TESTNET_USDC_VAULT,
    "withdraw",
    [i128(shares), S.xdr.ScVal.scvVec([i128(minAfterSlippage(expected))]), me],
    publicKey,
    signFn,
    onProgress,
  );
  return txHash;
}

/**
 * Blend's faucet returns a transaction already signed by its issuer, which the
 * user co-signs. It comes from a third party through our relay, so before the
 * user signs check that their signature can only add trustlines to Blend's test
 * assets: every other operation must be the issuer paying the user.
 */
export function assertSafeFaucetTransaction(xdr: string, publicKey: string): void {
  const reject = () => {
    throw new Error("FAUCET_TX_REJECTED");
  };
  let tx: S.Transaction | S.FeeBumpTransaction;
  try {
    tx = S.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  } catch {
    return reject();
  }
  if (!(tx instanceof S.Transaction) || tx.source !== BLEND_TESTNET_ISSUER) return reject();
  if (tx.operations.length === 0) return reject();

  for (const op of tx.operations) {
    if (op.type === "changeTrust") {
      const line = op.line;
      const ok =
        op.source === publicKey &&
        line instanceof S.Asset &&
        line.getIssuer() === BLEND_TESTNET_ISSUER &&
        op.limit !== "0.0000000";
      if (!ok) return reject();
    } else if (op.type === "payment") {
      const ok =
        (op.source === undefined || op.source === BLEND_TESTNET_ISSUER) &&
        op.destination === publicKey &&
        !op.asset.isNative() &&
        op.asset.getIssuer() === BLEND_TESTNET_ISSUER;
      if (!ok) return reject();
    } else {
      return reject();
    }
  }
}

/** Gets Blend's test USDC (and its other test assets) into the user's account. */
export async function requestTestUsdc(
  publicKey: string,
  signFn: SignFn,
  onProgress?: ProgressFn,
): Promise<string> {
  onProgress?.("Pidiendo USDC de prueba a Blend...");
  const { data, error } = await supabase.functions.invoke("blend-faucet", {
    body: { address: publicKey },
  });
  if (error || typeof data?.xdr !== "string") throw new Error("FAUCET_UNAVAILABLE");
  assertSafeFaucetTransaction(data.xdr, publicKey);
  onProgress?.("Firmando con tu clave...");
  const signed = await signFn(data.xdr);
  return submitSigned(signed, onProgress);
}
