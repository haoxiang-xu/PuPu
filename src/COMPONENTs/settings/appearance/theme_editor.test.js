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
  const result = render(
    <ConfigContext.Provider value={ctx}>
      <ThemeEditor />
    </ConfigContext.Provider>,
  );
  return { ...result, setTheme };
};

describe("ThemeEditor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  test("renders the 7 main semantic swatches; sidebar/surface live under Advanced", () => {
    renderWithCtx();
    for (const label of [
      "Accent",
      "Background",
      "Text",
      "Muted text",
      "Border",
      "Success",
      "Danger",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // The two background-family tiers are hidden until the disclosure opens.
    expect(
      screen.queryByRole("button", { name: "Surface" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sidebar" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Advanced background" }));

    expect(
      screen.getByRole("button", { name: "Sidebar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Surface" }),
    ).toBeInTheDocument();
  });

  test("editing a color previews without persisting until commit", () => {
    const { setTheme } = renderWithCtx({
      theme: {
        semantic: {},
        font: {},
        modal: {},
        input: { outline: {} },
        select: { outline: {} },
      },
    });
    // Open the color picker for Accent, then move off the default by picking a
    // swatch from the Nordic rail. The rail emits a live preview only.
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.click(screen.getByTestId("nordic-swatch-8"));

    const previewed = document.documentElement.style.getPropertyValue(
      "--pupu-accent",
    );
    // Live preview landed on the CSS var and it is genuinely off the default.
    expect(previewed).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(previewed.toLowerCase()).not.toBe("#65c466");
    // ...but nothing is persisted and the app theme is untouched until commit.
    expect(readThemeSettings().custom.light_mode.accent).toBeUndefined();
    expect(setTheme).not.toHaveBeenCalled();

    // Dismissing the popover commits the previewed colour.
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));

    expect(readThemeSettings().custom.light_mode.accent).toBe(previewed);
    expect(setTheme).toHaveBeenLastCalledWith(
      expect.objectContaining({
        highlightColor: previewed,
        semantic: expect.objectContaining({ accent: previewed }),
      }),
    );
  });

  test("live preview maps edited background onto legacy theme fields", () => {
    const { setTheme } = renderWithCtx({
      theme: {
        semantic: {},
        font: {},
        modal: {},
        input: { outline: {} },
        select: { outline: {} },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Background" }));
    fireEvent.click(screen.getByTestId("nordic-swatch-8"));

    const previewed = document.documentElement.style.getPropertyValue(
      "--pupu-background",
    );
    // The edit previews live but must not reach the app theme yet.
    expect(previewed).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(setTheme).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));

    // On commit the edited background is mapped onto the legacy theme fields.
    expect(setTheme).toHaveBeenLastCalledWith(
      expect.objectContaining({
        backgroundColor: previewed,
        semantic: expect.objectContaining({ background: previewed }),
      }),
    );
  });

  test("renders preset selector with MiniUI Select instead of native select", () => {
    const { container } = renderWithCtx();

    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  test("selecting a preset persists and previews semantic colors", () => {
    renderWithCtx();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("ocean"));

    expect(readThemeSettings().preset).toBe("ocean");
    expect(
      document.documentElement.style.getPropertyValue("--pupu-accent"),
    ).toBe("#0ea5e9");
  });

  test("edit mode follows the active app theme mode", () => {
    const ctx = (mode) => ({
      onThemeMode: mode,
      theme: { semantic: {}, font: {} },
      setTheme: jest.fn(),
    });
    const { rerender } = render(
      <ConfigContext.Provider value={ctx("light_mode")}>
        <ThemeEditor />
      </ConfigContext.Provider>,
    );
    // Light mode → Background swatch shows the light default.
    expect(
      screen.getByRole("button", { name: "Background" }),
    ).toHaveTextContent("#ffffff");

    rerender(
      <ConfigContext.Provider value={ctx("dark_mode")}>
        <ThemeEditor />
      </ConfigContext.Provider>,
    );
    // Switching the active mode re-syncs editMode → Background shows dark default.
    expect(
      screen.getByRole("button", { name: "Background" }),
    ).toHaveTextContent("#121212");
  });

  test("reset clears custom colors", () => {
    renderWithCtx();
    // Edit + commit a custom Accent so there is something to clear.
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.click(screen.getByTestId("nordic-swatch-8"));
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));
    expect(readThemeSettings().custom.light_mode.accent).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(readThemeSettings().custom.light_mode.accent).toBeUndefined();
  });
});
