// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as S from "@stellar/stellar-sdk";
import { setRules, getSetupTransactionStatus, executeSplit, getBalances } from "./contracts";
const mocks = vi.hoisted(() => ({
  server: {
    getAccount: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
    pollTransaction: vi.fn(),
  },
}));
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...original,
    rpc: {
      ...original.rpc,
      Server: class {
        constructor() {
          return mocks.server;
        }
      },
      assembleTransaction: (tx: unknown) => ({ build: () => tx }),
    },
  };
});
const keypair = S.Keypair.random();
const sign = async (xdr: string) => {
  const tx = S.TransactionBuilder.fromXDR(xdr, S.Networks.TESTNET);
  tx.sign(keypair);
  return tx.toXDR();
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.server.getAccount.mockResolvedValue(
    new S.Account(keypair.publicKey(), "1"),
  );
  mocks.server.simulateTransaction.mockResolvedValue({
    result: { retval: S.xdr.ScVal.scvVoid() },
    latestLedger: 1,
  });
  mocks.server.sendTransaction.mockResolvedValue({
    status: "PENDING",
    hash: "hash",
  });
  mocks.server.pollTransaction.mockResolvedValue({ status: "SUCCESS" });
});
describe("transaction journaling", () => {
  it("does not broadcast if persisting its hash fails", async () => {
    await expect(
      setRules(
        keypair.publicKey(),
        [60, 30, 10].map((percentage, vault_id) => ({ percentage, vault_id })),
        sign,
        undefined,
        async () => {
          throw new Error("PROFILE_SAVE_FAILED");
        },
      ),
    ).rejects.toThrow("PROFILE_SAVE_FAILED");
    expect(mocks.server.sendTransaction).not.toHaveBeenCalled();
  });
  it("records the real signed hash and expiry before broadcasting", async () => {
    const persist = vi.fn(async ({ hash, expiresAt }) => {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
      expect(mocks.server.sendTransaction).not.toHaveBeenCalled();
    });
    await setRules(
      keypair.publicKey(),
      [60, 30, 10].map((percentage, vault_id) => ({ percentage, vault_id })),
      sign,
      undefined,
      persist,
    );
    expect(persist).toHaveBeenCalledOnce();
    expect(mocks.server.sendTransaction).toHaveBeenCalledOnce();
  });
  it("doesn't record or send a transaction signed after it expired", async () => {
    const realNow = Date.now();
    const slowSign = async (xdr: string) => {
      // The user takes three minutes to approve in their wallet
      vi.spyOn(Date, "now").mockReturnValue(realNow + 180_000);
      return sign(xdr);
    };
    const persist = vi.fn();
    try {
      await expect(
        setRules(
          keypair.publicKey(),
          [60, 30, 10].map((percentage, vault_id) => ({ percentage, vault_id })),
          slowSign,
          undefined,
          persist,
        ),
      ).rejects.toThrow("SIGNATURE_EXPIRED");
    } finally {
      vi.restoreAllMocks();
    }
    expect(persist).not.toHaveBeenCalled();
    expect(mocks.server.sendTransaction).not.toHaveBeenCalled();
  });
  it("gives a wallet two minutes to approve onboarding", async () => {
    const persist = vi.fn();
    const start = Date.now() / 1000;
    await setRules(
      keypair.publicKey(),
      [60, 30, 10].map((percentage, vault_id) => ({ percentage, vault_id })),
      sign,
      undefined,
      persist,
    );
    expect(persist.mock.calls[0][0].expiresAt - start).toBeGreaterThanOrEqual(119);
  });
  it("resends a transaction the network asked to try again later", async () => {
    vi.useFakeTimers();
    mocks.server.sendTransaction
      .mockResolvedValueOnce({ status: "TRY_AGAIN_LATER", hash: "hash" })
      .mockResolvedValueOnce({ status: "PENDING", hash: "hash" });
    const done = executeSplit(keypair.publicKey(), 1n, sign);
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(mocks.server.sendTransaction).toHaveBeenCalledTimes(2);
  });
  it("gives up with a clear error if the network stays busy", async () => {
    vi.useFakeTimers();
    mocks.server.sendTransaction.mockResolvedValue({
      status: "TRY_AGAIN_LATER",
      hash: "hash",
    });
    const done = executeSplit(keypair.publicKey(), 1n, sign).catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await done).message).toContain("La red está ocupada");
    vi.useRealTimers();
    expect(mocks.server.pollTransaction).not.toHaveBeenCalled();
  });
  it("uses ledger time when deciding whether a missing transaction can be retried", async () => {
    mocks.server.getTransaction.mockResolvedValue({
      status: "NOT_FOUND",
      latestLedgerCloseTime: 100,
    });
    await expect(getSetupTransactionStatus("hash", 101)).resolves.toBe(
      "pending",
    );
    await expect(getSetupTransactionStatus("hash", 99)).resolves.toBe(
      "expired",
    );
  });
});

describe("reads", () => {
  it("retries a read that fails in transit once", async () => {
    mocks.server.simulateTransaction
      .mockRejectedValueOnce(new Error("timeout of 15000ms exceeded"))
      .mockResolvedValueOnce({
        result: {
          retval: S.xdr.ScVal.scvVec([
            S.xdr.ScVal.scvMap([
              new S.xdr.ScMapEntry({ key: S.xdr.ScVal.scvSymbol("balance"), val: S.nativeToScVal(5n, { type: "i128" }) }),
              new S.xdr.ScMapEntry({ key: S.xdr.ScVal.scvSymbol("vault_id"), val: S.nativeToScVal(2, { type: "u32" }) }),
            ]),
          ]),
        },
        latestLedger: 1,
      });
    await expect(getBalances(keypair.publicKey())).resolves.toEqual([
      { balance: 5n, vault_id: 2 },
    ]);
    expect(mocks.server.simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it("reports an unreachable network instead of empty vaults", async () => {
    mocks.server.simulateTransaction.mockRejectedValue(new Error("timeout"));
    await expect(getBalances(keypair.publicKey())).rejects.toThrow("RPC_UNAVAILABLE");
  });

  it("still returns no vaults for an account that has none", async () => {
    mocks.server.simulateTransaction.mockResolvedValue({
      result: { retval: S.nativeToScVal([]) },
      latestLedger: 1,
    });
    await expect(getBalances(keypair.publicKey())).resolves.toEqual([]);
  });
});
