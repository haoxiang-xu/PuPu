// src/COMPONENTs/settings/appearance/theme_editor.test.js
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ThemeEditor from "./theme_editor";
import { readThemeSettings } from "./storage";

const renderWithCtx = (overrides = {}) => {
  const setTheme = jest.fn();
  const ctx = {
    onThemeMode: "light_mode",
    theme: { semantic: {}, font: {} },
    setTheme,
    ...overrides,
  };
  render(
    <ConfigContext.Provider value={ctx}>
      <ThemeEditor />
    </ConfigContext.Provider>,
  );
  return { setTheme };
};

describe("ThemeEditor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  test("renders all 8 semantic swatches", () => {
    renderWithCtx();
    for (const label of [
      "Accent",
      "Background",
      "Surface",
      "Text",
      "Muted text",
      "Border",
      "Success",
      "Danger",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  test("editing a color persists it and writes CSS var", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.change(screen.getByDisplayValue("#65c466"), {
      target: { value: "#abcdef" },
    });
    expect(readThemeSettings().custom.light_mode.accent).toBe("#abcdef");
    expect(
      document.documentElement.style.getPropertyValue("--pupu-accent"),
    ).toBe("#abcdef");
  });

  test("reset clears custom colors", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.change(screen.getByDisplayValue("#65c466"), {
      target: { value: "#abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(readThemeSettings().custom.light_mode.accent).toBeUndefined();
  });
});
