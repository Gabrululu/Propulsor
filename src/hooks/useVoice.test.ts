import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoice } from "./useVoice";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  speech: vi.fn(),
  cancel: vi.fn(),
  voices: vi.fn(),
}));
vi.mock("@/lib/i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "es" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.session } },
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.stubGlobal("speechSynthesis", {
    speak: mocks.speech,
    cancel: mocks.cancel,
    getVoices: mocks.voices,
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  mocks.voices.mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());
it("prefers a Peruvian voice over other Spanish voices without gender-name heuristics", async () => {
  mocks.session.mockResolvedValue({ data: { session: null } });
  const peru = { lang: "es-PE", name: "Peru" };
  mocks.voices.mockReturnValue([
    { lang: "es-ES", name: "female" },
    { lang: "es-MX", name: "Mexico" },
    peru,
  ]);
  const { result, unmount } = renderHook(useVoice);
  await act(async () => {
    await result.current.speak("Instrucciones de prueba");
  });
  expect(mocks.speech.mock.calls[0][0]).toMatchObject({
    lang: "es-PE",
    voice: peru,
  });
  unmount();
});
it("does not start late narration after Stop while the cloud request is pending", async () => {
  mocks.session.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
  });
  let resolve!: (response: { ok: boolean }) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<{ ok: boolean }>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { result, unmount } = renderHook(useVoice);
  let speaking!: Promise<void>;
  act(() => {
    speaking = result.current.speak("Respuesta tardía de prueba");
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  act(() => result.current.stop());
  await act(async () => {
    resolve({ ok: false });
    await speaking;
  });
  expect(mocks.speech).not.toHaveBeenCalled();
  expect(result.current.isSpeaking).toBe(false);
  unmount();
});
