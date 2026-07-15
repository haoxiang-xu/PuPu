// src/COMPONENTs/settings/appearance/theme_editor.test.js
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ThemeEditor from "./theme_editor";
import { readThemeSettings, writeThemeDetails } from "./storage";

jest.mock("../../../SERVICEs/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

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
    // Open the color picker for Accent, then move off the default by typing
    // into the rectangular panel's hex field. Typing emits a live preview only.
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#112233" },
    });

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
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#112233" },
    });

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
    fireEvent.click(screen.getByText("Ocean"));

    expect(readThemeSettings().preset).toBe("ocean");
    expect(
      document.documentElement.style.getPropertyValue("--pupu-accent"),
    ).toBe("#0ea5e9");
  });

  test("preset dropdown shows human-readable labels", () => {
    renderWithCtx();
    // trigger shows the selected preset's pretty label
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.queryByText("high_contrast")).toBeNull();
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
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#112233" },
    });
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));
    expect(readThemeSettings().custom.light_mode.accent).toBeDefined();

    // First click only arms the two-step confirm; second click resets.
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(readThemeSettings().custom.light_mode.accent).toBeUndefined();
  });

  test("token color pickers open the rectangular panel with hex input", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-value-hex")).toBeInTheDocument();
    expect(screen.queryByTestId("color-picker-alpha")).toBeNull();
  });

  test("preview card follows the edited (non-active) mode", () => {
    renderWithCtx(); // active = light_mode
    // SegmentedButton options render as div cells, not <button> elements —
    // query by their visible label text instead of role.
    fireEvent.click(screen.getByText("Dark"));
    expect(screen.getByTestId("theme-preview-card")).toHaveStyle({
      backgroundColor: "#121212",
    });
  });

  test("reset requires a second confirming click", () => {
    renderWithCtx();
    // seed a custom color. "color-picker-value-hex" is the wrapper div; the
    // actual input lives inside it (see color_picker.js renderValueField).
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    const hexInput = screen
      .getByTestId("color-picker-value-hex")
      .querySelector("input");
    fireEvent.change(hexInput, {
      target: { value: "#ff0000" },
    });
    fireEvent.keyDown(hexInput, { key: "Enter" });
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));
    expect(readThemeSettings().custom.light_mode.accent).toBe("#FF0000");

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    // first click arms, does NOT reset
    expect(readThemeSettings().custom.light_mode.accent).toBe("#FF0000");
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(readThemeSettings().custom?.light_mode?.accent).toBeUndefined();
  });

  test("import toasts on success and on malformed file", async () => {
    const { toast } = require("../../../SERVICEs/toast");
    renderWithCtx();
    const input = document.querySelector('input[type="file"]');

    const good = new File(
      [JSON.stringify({ preset: "ocean", custom: {} })],
      "theme.json",
      { type: "application/json" },
    );
    fireEvent.change(input, { target: { files: [good] } });
    await screen.findByTestId("theme-preview-card"); // flush
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(readThemeSettings().preset).toBe("ocean");

    const beforeBad = readThemeSettings();
    const bad = new File(["{not json"], "broken.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(readThemeSettings()).toEqual(beforeBad);
  });

  test("reset confirm falls off after timeout without changing settings", () => {
    jest.useFakeTimers();
    try {
      renderWithCtx();

      fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
      expect(
        screen.getByRole("button", { name: "Confirm reset" }),
      ).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(3100);
      });

      expect(
        screen.getByRole("button", { name: "Reset to default" }),
      ).toBeInTheDocument();
      expect(readThemeSettings().custom?.light_mode?.accent).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  test("dismissing the panel without editing does not pin a custom color (F1 regression)", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();

    // Dismiss without typing anything into the hex field.
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));

    expect(readThemeSettings().custom?.light_mode?.accent).toBeUndefined();
  });

  // Sanity for F1/F4 together: an actual edit (type hex + Enter + dismiss)
  // still persists exactly once. Already covered end-to-end by
  // "reset requires a second confirming click" above, which performs this
  // exact sequence and asserts the single committed value.

  test("stored JSON details channel survives edits (chipBorder stays applied after a commit)", () => {
    writeThemeDetails({ dark_mode: { chipBorder: "#ff0000" } });
    renderWithCtx({ onThemeMode: "dark_mode" });

    // Commit an unrelated color edit — details must not be dropped.
    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#112233" },
    });
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));

    expect(
      document.documentElement.style.getPropertyValue("--pupu-chip-border"),
    ).toBe("#ff0000");
    expect(readThemeSettings().details.dark_mode.chipBorder).toBe("#ff0000");
  });
});
