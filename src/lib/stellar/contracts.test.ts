// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as S from "@stellar/stellar-sdk";
import { setRules, getSetupTransactionStatus } from "./contracts";
const mocks = vi.hoisted(() => ({
  server: {
    getAccount: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
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
  mocks.server.getTransaction.mockResolvedValue({ status: "SUCCESS" });
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
