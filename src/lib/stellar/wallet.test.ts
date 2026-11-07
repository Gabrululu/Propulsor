import { afterEach, describe, expect, it, vi } from "vitest";
import { fundTestnetAccount } from "./wallet";
const { loadAccount } = vi.hoisted(() => ({ loadAccount: vi.fn() }));
vi.mock("./client", () => ({ FRIENDBOT_URL: "https://friendbot.stellar.org", getHorizonServer: async () => ({ loadAccount }), USDC_ASSET_CODE: "USDC", USDC_ISSUER: "issuer" }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
describe("Friendbot", () => {
  it("retries a transient failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = fundTestnetAccount("GACCOUNT");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("fails explicitly after bounded retries", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    loadAccount.mockRejectedValue(new Error("not found"));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(fundTestnetAccount("GACCOUNT")).rejects.toThrow("ACCOUNT_FUNDING_FAILED");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("accepts an account that was funded by an earlier request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    loadAccount.mockResolvedValue({});
    await expect(fundTestnetAccount("GACCOUNT")).resolves.toBe(true);
  });
});
