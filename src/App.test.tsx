import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./App";

const { hasCompletedOnboarding, wasOnboardingComplete } = vi.hoisted(() => ({
  hasCompletedOnboarding: vi.fn(),
  wasOnboardingComplete: vi.fn(),
}));
vi.mock("@/lib/onboarding", () => ({ hasCompletedOnboarding, wasOnboardingComplete }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user" }, session: null, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "es" }),
  LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const Stateful = () => {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>clicks {count}</button>;
};

const queryKey = ["onboarding", "user"];

function renderGuard(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Stateful />
              </ProtectedRoute>
            }
          />
          <Route path="/onboarding" element={<p>onboarding page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    hasCompletedOnboarding.mockReset();
    wasOnboardingComplete.mockReset();
  });

  it("shows a known-good user at once while the chain read is pending", async () => {
    wasOnboardingComplete.mockReturnValue(true);
    let finish!: (done: boolean) => void;
    hasCompletedOnboarding.mockReturnValue(new Promise((r) => (finish = r)));
    renderGuard();

    expect(screen.getByRole("button", { name: "clicks 0" })).toBeInTheDocument();
    await waitFor(() => expect(hasCompletedOnboarding).toHaveBeenCalled());
    await act(async () => finish(true));
    expect(screen.getByRole("button", { name: "clicks 0" })).toBeInTheDocument();
  });

  it("still redirects a remembered user if revalidation says onboarding is incomplete", async () => {
    wasOnboardingComplete.mockReturnValue(true);
    hasCompletedOnboarding.mockResolvedValue(false);
    renderGuard();
    expect(await screen.findByText("onboarding page")).toBeInTheDocument();
  });

  it("keeps the page mounted while onboarding is revalidated in the background", async () => {
    hasCompletedOnboarding.mockResolvedValue(true);
    const client = renderGuard();
    fireEvent.click(await screen.findByRole("button", { name: "clicks 0" }));

    let finish!: (done: boolean) => void;
    hasCompletedOnboarding.mockReturnValue(new Promise((r) => (finish = r)));
    act(() => void client.invalidateQueries({ queryKey }));
    await waitFor(() => expect(client.isFetching({ queryKey })).toBe(1));

    expect(screen.getByRole("button", { name: "clicks 1" })).toBeInTheDocument();
    await act(async () => finish(true));
    expect(screen.getByRole("button", { name: "clicks 1" })).toBeInTheDocument();
  });

  it("keeps the page mounted when a background revalidation fails", async () => {
    hasCompletedOnboarding.mockResolvedValue(true);
    const client = renderGuard();
    fireEvent.click(await screen.findByRole("button", { name: "clicks 0" }));

    hasCompletedOnboarding.mockRejectedValue(new Error("network failure"));
    await act(() => client.refetchQueries({ queryKey }));

    expect(client.getQueryState(queryKey)?.status).toBe("error");
    expect(screen.getByRole("button", { name: "clicks 1" })).toBeInTheDocument();
  });

  it("redirects to onboarding when it is not complete", async () => {
    hasCompletedOnboarding.mockResolvedValue(false);
    renderGuard();
    expect(await screen.findByText("onboarding page")).toBeInTheDocument();
  });

  it("does not bounce back to onboarding while a just-finished one is revalidated", async () => {
    const client = new QueryClient();
    client.setQueryData(queryKey, false);
    let finish!: (done: boolean) => void;
    hasCompletedOnboarding.mockReturnValue(new Promise((r) => (finish = r)));
    void client.invalidateQueries({ queryKey });
    renderGuard(client);

    await waitFor(() => expect(hasCompletedOnboarding).toHaveBeenCalled());
    expect(screen.queryByText("onboarding page")).not.toBeInTheDocument();
    await act(async () => finish(true));
    expect(await screen.findByRole("button", { name: "clicks 0" })).toBeInTheDocument();
  });
});
