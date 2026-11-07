import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraft,
  loadDraft,
  recoverDraft,
  hasCompletedOnboarding,
} from "./onboarding";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  getRules: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
      update: (value: unknown) => {
        mocks.update(value);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));
vi.mock("@/lib/stellar/contracts", () => ({
  getRulesStrict: mocks.getRules,
  getSetupTransactionStatus: mocks.status,
}));
const draft = createDraft({
  publicKey: "GACCOUNT",
  name: "Ana",
  profileType: "jefa_hogar",
  vaultNames: ["Hogar", "Fondo", "Meta"],
  percentages: [60, 30, 10],
});
const submitted = {
  ...draft,
  transaction: { hash: "a".repeat(64), expiresAt: 2000000000 },
};
beforeEach(() => vi.resetAllMocks());
describe("durable onboarding recovery", () => {
  it("rejects invalid distributions before any signature", () => {
    expect(() => createDraft({ ...draft, percentages: [100, 0, 0] })).toThrow();
  });
  it("never restores another account's or network's draft", async () => {
    mocks.read.mockResolvedValue({
      data: { onboarding_draft: submitted },
      error: null,
    });
    await expect(loadDraft("user", "OTHER")).resolves.toBeNull();
    mocks.read.mockResolvedValue({
      data: { onboarding_draft: { ...submitted, network: "other" } },
      error: null,
    });
    await expect(loadDraft("user", draft.publicKey)).resolves.toBeNull();
  });
  it("does not interpret a pending transaction as permission to sign again", async () => {
    mocks.status.mockResolvedValue("pending");
    await expect(recoverDraft(submitted)).resolves.toBe("pending");
    expect(mocks.getRules).not.toHaveBeenCalled();
  });
  it("reconciles an old transaction outside RPC retention against actual rules", async () => {
    mocks.status.mockResolvedValue("expired");
    mocks.getRules.mockResolvedValue(
      [60, 30, 10].map((percentage, vault_id) => ({ vault_id, percentage })),
    );
    await expect(recoverDraft(submitted)).resolves.toBe("confirmed");
  });
  it("never offers a replacement transaction on an inconclusive network read", async () => {
    mocks.status.mockResolvedValue("expired");
    mocks.getRules.mockRejectedValue(new Error("network failure"));
    await expect(recoverDraft(submitted)).rejects.toThrow("network failure");
  });
  it("repairs legacy completion only when an actual chain read has no rules", async () => {
    mocks.read.mockResolvedValue({
      data: { onboarding_complete: true, stellar_public_key: "GACCOUNT" },
      error: null,
    });
    mocks.getRules.mockResolvedValue([]);
    await expect(hasCompletedOnboarding("user")).resolves.toBe(false);
    expect(mocks.update).toHaveBeenCalledWith({ onboarding_complete: false });
  });
  it("keeps an existing complete profile intact on network failure", async () => {
    mocks.read.mockResolvedValue({
      data: { onboarding_complete: true, stellar_public_key: "GACCOUNT" },
      error: null,
    });
    mocks.getRules.mockRejectedValue(new Error("network failure"));
    await expect(hasCompletedOnboarding("user")).rejects.toThrow(
      "network failure",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

it("allows an existing complete profile only when the three on-chain rules are valid", async () => {
  mocks.read.mockResolvedValue({
    data: { onboarding_complete: true, stellar_public_key: "GACCOUNT" },
    error: null,
  });
  mocks.getRules.mockResolvedValue(
    [60, 30, 10].map((percentage, vault_id) => ({ percentage, vault_id })),
  );
  await expect(hasCompletedOnboarding("user")).resolves.toBe(true);
  expect(mocks.update).not.toHaveBeenCalled();
});
