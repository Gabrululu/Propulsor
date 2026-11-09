// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as S from "@stellar/stellar-sdk";

const mocks = vi.hoisted(() => ({
  functionsInvoke: vi.fn(),
  invoke: vi.fn(),
  readContract: vi.fn(),
  submitSigned: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.functionsInvoke } },
}));
vi.mock("./contracts", () => ({
  invoke: mocks.invoke,
  readContract: mocks.readContract,
  submitSigned: mocks.submitSigned,
}));

import {
  BLEND_TESTNET_ISSUER,
  BLEND_TESTNET_POOL,
  DEFINDEX_TESTNET_USDC_VAULT,
  assertSafeFaucetTransaction,
  depositToYield,
  requestTestUsdc,
  withdrawAllFromYield,
} from "./yield";

const PASSPHRASE = S.Networks.TESTNET;
const user = S.Keypair.random().publicKey();
const usdc = new S.Asset("USDC", BLEND_TESTNET_ISSUER);

type Op = S.xdr.Operation;
function faucetTx(ops: Op[], source = BLEND_TESTNET_ISSUER): string {
  const builder = new S.TransactionBuilder(new S.Account(source, "1"), {
    fee: "100",
    networkPassphrase: PASSPHRASE,
  });
  ops.forEach((op) => builder.addOperation(op));
  return builder.setTimeout(60).build().toXDR();
}
const trust = (asset = usdc, opts: { source?: string; limit?: string } = {}) =>
  S.Operation.changeTrust({ asset, source: opts.source ?? user, limit: opts.limit });
const pay = (opts: { source?: string; destination?: string; asset?: S.Asset } = {}) =>
  S.Operation.payment({
    destination: opts.destination ?? user,
    asset: opts.asset ?? usdc,
    amount: "1000",
    source: opts.source,
  });

describe("assertSafeFaucetTransaction", () => {
  it("accepts trustlines for the user and payments from Blend's issuer", () => {
    const tx = faucetTx([trust(), pay(), trust(new S.Asset("BLND", BLEND_TESTNET_ISSUER)), pay({ source: BLEND_TESTNET_ISSUER })]);
    expect(() => assertSafeFaucetTransaction(tx, user)).not.toThrow();
  });

  it.each([
    ["the user pays someone", [trust(), pay({ source: user, destination: BLEND_TESTNET_ISSUER })]],
    ["the user changes account settings", [trust(), S.Operation.setOptions({ source: user, masterWeight: 0 })]],
    ["the user merges their account", [S.Operation.accountMerge({ source: user, destination: BLEND_TESTNET_ISSUER })]],
    ["a trustline is to another issuer", [trust(new S.Asset("USDC", S.Keypair.random().publicKey()))]],
    ["a trustline is removed", [trust(usdc, { limit: "0" })]],
    ["a payment goes to someone else", [trust(), pay({ destination: S.Keypair.random().publicKey() })]],
    ["a payment is in XLM", [pay({ asset: S.Asset.native() })]],
    ["a payment comes from a third account", [pay({ source: S.Keypair.random().publicKey() })]],
    ["it is empty", []],
  ])("rejects a transaction where %s", (_, ops) => {
    expect(() => assertSafeFaucetTransaction(faucetTx(ops as Op[]), user)).toThrow("FAUCET_TX_REJECTED");
  });

  it("rejects a transaction paid for by the user's account", () => {
    expect(() => assertSafeFaucetTransaction(faucetTx([trust()], user), user)).toThrow("FAUCET_TX_REJECTED");
  });

  it("rejects anything that isn't a transaction", () => {
    expect(() => assertSafeFaucetTransaction("not-xdr", user)).toThrow("FAUCET_TX_REJECTED");
  });
});

describe("requestTestUsdc", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never asks the user to sign a transaction that fails the check", async () => {
    const sign = vi.fn();
    mocks.functionsInvoke.mockResolvedValue({
      data: { xdr: faucetTx([pay({ source: user, destination: BLEND_TESTNET_ISSUER })]) },
      error: null,
    });
    await expect(requestTestUsdc(user, sign)).rejects.toThrow("FAUCET_TX_REJECTED");
    expect(sign).not.toHaveBeenCalled();
  });

  it("signs and submits a valid faucet transaction", async () => {
    const xdr = faucetTx([trust(), pay()]);
    const sign = vi.fn(async (value: string) => `signed:${value}`);
    mocks.functionsInvoke.mockResolvedValue({ data: { xdr }, error: null });
    mocks.submitSigned.mockResolvedValue("hash");
    await expect(requestTestUsdc(user, sign)).resolves.toBe("hash");
    expect(sign).toHaveBeenCalledWith(xdr);
    expect(mocks.submitSigned).toHaveBeenCalledWith(`signed:${xdr}`, undefined);
  });

  it("reports an unavailable faucet", async () => {
    mocks.functionsInvoke.mockResolvedValue({ data: null, error: new Error("502") });
    await expect(requestTestUsdc(user, vi.fn())).rejects.toThrow("FAUCET_UNAVAILABLE");
  });
});

const native = (value: S.xdr.ScVal) => S.scValToNative(value);
const sign = vi.fn();

describe("deposits and withdrawals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ txHash: "hash", returnValue: S.xdr.ScVal.scvVoid() });
  });

  it("supplies to Blend from the user's own account", async () => {
    await depositToYield("blend", user, 50_0000000n, sign);
    const [contract, method, args, signer] = mocks.invoke.mock.calls[0];
    expect([contract, method, signer]).toEqual([BLEND_TESTNET_POOL, "submit", user]);
    expect(args.slice(0, 3).map(native)).toEqual([user, user, user]);
    expect(native(args[3])).toEqual([
      { address: "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU", amount: 50_0000000n, request_type: 0 },
    ]);
  });

  it("deposits into DeFindex, investing, and accepts at most 1% less", async () => {
    await depositToYield("defindex", user, 100_0000000n, sign);
    const [contract, method, args] = mocks.invoke.mock.calls[0];
    expect([contract, method]).toEqual([DEFINDEX_TESTNET_USDC_VAULT, "deposit"]);
    expect(args.map(native)).toEqual([[100_0000000n], [99_0000000n], user, true]);
  });

  it("rejects a zero deposit before building a transaction", async () => {
    await expect(depositToYield("blend", user, 0n, sign)).rejects.toThrow("INVALID_AMOUNT");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("withdraws the whole Blend position, interest included", async () => {
    mocks.readContract.mockImplementation(async (_id: string, method: string) =>
      method === "get_reserve"
        ? S.nativeToScVal({ config: { index: 3 }, data: { b_rate: 1_100_000_000_000n } })
        : S.nativeToScVal({ supply: { 3: 100_0000000n } }),
    );
    await withdrawAllFromYield("blend", user, sign);
    const request = native(mocks.invoke.mock.calls[0][2][3])[0];
    // 100 bTokens at b_rate 1.1 = 110 USDC; ask for 1% more so nothing is left behind
    expect(request).toMatchObject({ request_type: 1, amount: 111_1000001n });
  });

  it("redeems every DeFindex share, accepting at most 1% less than their value", async () => {
    mocks.readContract.mockImplementation(async (_id: string, method: string) =>
      method === "balance" ? S.nativeToScVal(40n, { type: "i128" }) : S.nativeToScVal([200_0000000n]),
    );
    await withdrawAllFromYield("defindex", user, sign);
    const [, method, args] = mocks.invoke.mock.calls[0];
    expect(method).toBe("withdraw");
    expect(args.map(native)).toEqual([40n, [198_0000000n], user]);
  });

  it("says there is nothing to withdraw instead of sending an empty transaction", async () => {
    mocks.readContract.mockImplementation(async () => S.nativeToScVal(0n, { type: "i128" }));
    await expect(withdrawAllFromYield("defindex", user, sign)).rejects.toThrow("NOTHING_TO_WITHDRAW");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
