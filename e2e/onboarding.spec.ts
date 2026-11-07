import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Keypair } from "@stellar/stellar-sdk";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const SPLIT_CONTRACT_ID =
  "CCRH4EPUVIPESWYWOWPQ2QK3XN6KBR3RY6UFK36A4MXKKXIFH6ONRTVY";
const id = "10000000-0000-4000-8000-000000000001";
const publicKey = Keypair.random().publicKey();
const sessionUser = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
async function prepare(page: Page, restored = false) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: expires })).toString("base64url")}.test`;
  await page.addInitScript(
    ({ token, expires, sessionUser, publicKey, restored }) => {
      localStorage.setItem(
        "sb-kytfiqkjczkldrkolqqk-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh-token",
          expires_at: expires,
          expires_in: 3600,
          token_type: "bearer",
          user: sessionUser,
        }),
      );
      localStorage.setItem("propulsor_voice_enabled", "false");
      if (restored)
        localStorage.setItem(
          "propulsor_wallet",
          JSON.stringify({ mode: "custodial", publicKey, walletId: null }),
        );
    },
    { token, expires, sessionUser, publicKey, restored },
  );
  const draft = restored
    ? {
        version: 1,
        publicKey,
        contractId: SPLIT_CONTRACT_ID,
        network: NETWORK_PASSPHRASE,
        name: "Ana",
        profileType: "jefa_hogar",
        vaultNames: ["Hogar", "Fondo", "Meta"],
        percentages: [60, 30, 10],
        transaction: { hash: "a".repeat(64), expiresAt: expires },
      }
    : null;
  await page.route("https://*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/users_profile"))
      return route.fulfill({ json: { onboarding_draft: draft } });
    if (url.pathname.endsWith("/user"))
      return route.fulfill({ json: sessionUser });
    return route.fulfill({
      status: 503,
      json: { message: "Mocked unavailable service" },
    });
  });
  await page.route("https://soroban-testnet.stellar.org/**", (route) =>
    route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          status: "NOT_FOUND",
          txHash: "a".repeat(64),
          latestLedger: 100,
          latestLedgerCloseTime: expires - 100,
          oldestLedger: 1,
          oldestLedgerCloseTime: 1,
        },
      },
    }),
  );
}
test("profile, separate audio controls and PIN work on a narrow screen", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByLabel("Tu nombre", { exact: true }).fill("Ana");
  const household = page.getByRole("button", {
    name: "Responsable del hogar",
    exact: true,
  });
  await page
    .getByRole("button", {
      name: "Escuchar descripción: Responsable del hogar",
      exact: true,
    })
    .click();
  await expect(household).toHaveAttribute("aria-pressed", "false");
  await household.click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
  await expect(
    await new AxeBuilder({ page }).include("main").analyze(),
  ).toMatchObject({ violations: [] });
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText("Freighter", { exact: true })).not.toBeVisible();
  await page
    .getByRole("button", { name: "Crear mi cuenta", exact: true })
    .click();
  const pin = page.getByLabel("Crea un PIN de 4 dígitos", { exact: true });
  await pin.fill("1234");
  await pin.press("Backspace");
  await expect(pin).toHaveValue("123");
  await pin.fill("1234");
  await page
    .getByLabel("Repite el PIN para evitar errores", { exact: true })
    .fill("4321");
  await page
    .getByRole("button", { name: "Crear mi cuenta", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("no coinciden");
  await expect(pin).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("a submitted draft survives reload and never requests another PIN while pending", async ({
  page,
}) => {
  await prepare(page, true);
  await page.goto("/onboarding");
  await expect(
    page.getByRole("button", { name: "Comprobar y continuar" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Comprobar y continuar" }).click();
  await expect(page.getByRole("alert")).toContainText("sigue pendiente");
  await expect(page.getByLabel("Autoriza el reparto con tu PIN")).toHaveCount(
    0,
  );
  await expect(page.getByRole("slider").first()).toBeDisabled();
  await expect(
    page.getByText("Si recibes S/100 → S/60 para Hogar"),
  ).toBeVisible();
  const size = await page.getByRole("slider").first().boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
});
test("connection dialog traps keyboard focus, closes with Escape and restores focus", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/modal.html");
  const trigger = page.getByRole("button", { name: "Abrir cuenta" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear mi cuenta", exact: true }),
  ).toBeFocused();
  const close = page.getByRole("button", { name: "Cerrar", exact: true });
  await close.focus();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
