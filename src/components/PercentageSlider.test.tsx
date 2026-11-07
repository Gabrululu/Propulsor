import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PercentageSlider from "./PercentageSlider";
vi.mock("@/lib/i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "es" }),
}));
afterEach(cleanup);
it("keeps all three vaults above zero and the total at 100 when moving between extremes", () => {
  for (const values of [
    [60, 30, 10],
    [98, 1, 1],
    [1, 98, 1],
    [1, 1, 98],
  ]) {
    for (const target of [1, 2, 60, 98]) {
      for (let index = 0; index < 3; index++) {
        const change = vi.fn();
        render(
          <PercentageSlider
            values={values}
            labels={["Hogar", "Fondo", "Meta"]}
            colors={["pink", "mint", "pink-soft"]}
            onChange={change}
          />,
        );
        if (values[index] !== target) {
          fireEvent.change(screen.getAllByRole("slider")[index], {
            target: { value: String(target) },
          });
          const result: number[] = change.mock.calls[0][0];
          expect(result.reduce((a, b) => a + b, 0)).toBe(100);
          expect(result.every((value) => value >= 1 && value <= 98)).toBe(true);
          expect(result[index]).toBe(target);
        }
        cleanup();
      }
    }
  }
});
