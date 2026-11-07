import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

const mocks = vi.hoisted(() => ({
  setRules: vi.fn(),
  upsert: vi.fn(),
  navigate: vi.fn(),
  speak: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  recoverDraft: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/onboarding", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/onboarding")>();
  return {
    ...original,
    loadDraft: mocks.loadDraft,
    saveDraft: mocks.saveDraft,
    recoverDraft: mocks.recoverDraft,
  };
});
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useVoice", () => ({
  useVoice: () => ({ speak: mocks.speak, stop: vi.fn(), isSpeaking: false }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/stellar/WalletContext", () => ({
  useWallet: () => ({ mode: "custodial", publicKey: "GACCOUNT" }),
}));
vi.mock("@/hooks/useContracts", () => ({
  useContracts: () => ({ setRules: mocks.setRules }),
}));
vi.mock("@/lib/i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "es" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.upsert },
}));
vi.mock("@/components/stellar/ConnectModal", () => ({ default: () => null }));

async function enterSplit() {
  render(<Onboarding />);
  fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
  fireEvent.change(screen.getByLabelText("Tu nombre"), {
    target: { value: "Ana" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Responsable del hogar" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByLabelText("Autoriza el reparto con tu PIN");
  fireEvent.change(screen.getByLabelText("Autoriza el reparto con tu PIN"), {
    target: { value: "1234" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar mi reparto" }));
  });
}
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadDraft.mockResolvedValue(null);
  mocks.saveDraft.mockResolvedValue(undefined);
  mocks.setRules.mockResolvedValue("confirmed-hash");
  mocks.upsert.mockResolvedValue({ error: null });
});
describe("onboarding completion", () => {
  it("does not save a complete profile when contract confirmation fails and clears the PIN", async () => {
    mocks.setRules.mockRejectedValue(
      new Error("Simulation failed: secret SDK payload"),
    );
    await enterSplit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos preparar el reparto",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "secret SDK payload",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Autoriza el reparto con tu PIN")).toHaveValue(
      "",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("retries profile persistence without signing a second transaction", async () => {
    mocks.upsert
      .mockResolvedValueOnce({ error: { message: "database unavailable" } })
      .mockResolvedValueOnce({ error: null });
    await enterSplit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El reparto ya se confirmó",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("button", { name: "Ir a mi cuenta" });
    expect(mocks.setRules).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[1]).toEqual([
      "complete_onboarding",
      { p_user_id: "user-1", p_hash: "confirmed-hash" },
    ]);
  });
  it("keeps completion pending until the transaction is confirmed", async () => {
    let confirm!: (hash: string) => void;
    mocks.setRules.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          confirm = resolve;
        }),
    );
    await enterSplit();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    await act(async () => {
      confirm("confirmed-hash");
    });
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Ir a mi cuenta" });
  });
});

it("restores a submitted setup after remount without requesting a PIN or signing again", async () => {
  const draft = {
    version: 1,
    publicKey: "GACCOUNT",
    contractId: "contract",
    network: "testnet",
    name: "Ana",
    profileType: "jefa_hogar",
    vaultNames: ["Hogar", "Fondo", "Meta"],
    percentages: [60, 30, 10],
    transaction: { hash: "a".repeat(64), expiresAt: 2000000000 },
  };
  mocks.loadDraft.mockResolvedValue(draft);
  mocks.recoverDraft.mockResolvedValue("confirmed");
  render(<Onboarding />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Comprobar y continuar" }),
  );
  await screen.findByRole("button", { name: "Ir a mi cuenta" });
  expect(mocks.setRules).not.toHaveBeenCalled();
  expect(mocks.upsert.mock.calls[0]).toEqual([
    "complete_onboarding",
    { p_user_id: "user-1", p_hash: "a".repeat(64) },
  ]);
});
it("does not offer another signature while the original transaction remains pending", async () => {
  mocks.loadDraft.mockResolvedValue({
    publicKey: "GACCOUNT",
    name: "Ana",
    profileType: "jefa_hogar",
    vaultNames: ["Hogar", "Fondo", "Meta"],
    percentages: [60, 30, 10],
    transaction: { hash: "a".repeat(64), expiresAt: 2000000000 },
  });
  mocks.recoverDraft.mockResolvedValue("pending");
  render(<Onboarding />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Comprobar y continuar" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("sigue pendiente");
  expect(
    screen.queryByLabelText("Autoriza el reparto con tu PIN"),
  ).not.toBeInTheDocument();
  expect(mocks.setRules).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("blocks signing if the draft cannot be persisted", async () => {
  mocks.saveDraft.mockRejectedValue(new Error("PROFILE_SAVE_FAILED"));
  await enterSplit();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No pudimos guardar tu perfil",
  );
  expect(mocks.setRules).not.toHaveBeenCalled();
});
