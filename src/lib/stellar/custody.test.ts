// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustodialAccountNoPin } from "./custody";
import { encryptSecretKey } from "./wallet";
import { Keypair } from "@stellar/stellar-sdk";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  loadAccount: vi.fn(),
  fund: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
      update: (data: unknown) => {
        mocks.update(data);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));
vi.mock("./client", () => ({
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  getHorizonServer: async () => ({ loadAccount: mocks.loadAccount }),
}));
vi.mock("./wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./wallet")>()),
  fundTestnetAccount: mocks.fund,
  generateKeypair: mocks.generate,
}));
const userId = "10000000-0000-4000-8000-000000000001";
const keypair = Keypair.random();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadAccount.mockResolvedValue({});
});
describe("restoring existing custodial accounts", () => {
  it("preserves PIN-protected accounts instead of treating them as social accounts", async () => {
    const encrypted = await encryptSecretKey(keypair.secret(), "1234");
    mocks.read.mockResolvedValue({
      data: {
        stellar_public_key: keypair.publicKey(),
        stellar_secret_encrypted: encrypted,
      },
    });
    await expect(createCustodialAccountNoPin(userId)).resolves.toMatchObject({
      publicKey: keypair.publicKey(),
      mode: "custodial",
      funded: true,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.fund).not.toHaveBeenCalled();
  });
  it("reactivates the same social account after a testnet reset", async () => {
    const encrypted = await encryptSecretKey(keypair.secret(), userId);
    mocks.read.mockResolvedValue({
      data: {
        stellar_public_key: keypair.publicKey(),
        stellar_secret_encrypted: encrypted,
      },
    });
    mocks.loadAccount.mockRejectedValue(new Error("Account not found"));
    mocks.fund.mockResolvedValue(true);
    await expect(createCustodialAccountNoPin(userId)).resolves.toMatchObject({
      publicKey: keypair.publicKey(),
      mode: "custodial_social",
      funded: true,
    });
    expect(mocks.fund).toHaveBeenCalledWith(keypair.publicKey());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ stellar_funded: true });
  });
  it("stops restoration if reactivation fails", async () => {
    mocks.read.mockResolvedValue({
      data: {
        stellar_public_key: keypair.publicKey(),
        stellar_secret_encrypted: "existing",
      },
    });
    mocks.loadAccount.mockRejectedValue(new Error("not found"));
    mocks.fund.mockRejectedValue(new Error("ACCOUNT_FUNDING_FAILED"));
    await expect(createCustodialAccountNoPin(userId)).rejects.toThrow(
      "ACCOUNT_FUNDING_FAILED",
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

it("never creates replacement keys if the existing profile could not be read", async () => {
  mocks.read.mockResolvedValue({
    data: null,
    error: { message: "database unavailable" },
  });
  await expect(createCustodialAccountNoPin(userId)).rejects.toThrow(
    "PROFILE_SAVE_FAILED",
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
