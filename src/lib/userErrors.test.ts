import { describe, expect, it } from "vitest";
import { userError } from "./userErrors";
describe("safe user errors", () => {
  it.each(["Failed to fetch", "Simulation failed", "INCORRECT_PIN", "User rejected request", "PROFILE_SAVE_FAILED", "ACCOUNT_FUNDING_FAILED"])("translates %s with a next step", message => {
    expect(userError(new Error(message))).not.toContain(message);
    expect(userError(new Error(message)).length).toBeGreaterThan(40);
  });
  it("does not expose unknown server details", () => {
    expect(userError({ message: "private payload 123" })).not.toContain("private");
    expect(userError(null, "en")).toContain("Try again");
  });
});
