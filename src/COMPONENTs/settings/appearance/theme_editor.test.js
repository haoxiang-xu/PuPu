// src/COMPONENTs/settings/appearance/theme_editor.test.js
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { resolveSemanticPalette } from "../../../CONTAINERs/config/theme_semantic";
import {
  roleWindow,
  bandsContain,
  relativeLuminance,
} from "../../../BUILTIN_COMPONENTs/theme/contrast_window";
import ThemeEditor from "./theme_editor";
import {
  readThemeSettings,
  writeThemeDetails,
  writeThemeCustomColor,
} from "./storage";

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

  test("renders the 7 main semantic swatches; sidebar/surface live under the Background expander", () => {
    renderWithCtx();
    // "Background color" (Background's own ColorPicker trigger) disambiguates
    // from the Explorer row's plain "Background" label text.
    for (const label of [
      "Accent",
      "Background color",
      "Text",
      "Muted text",
      "Border",
      "Success",
      "Danger",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // The two background-family tiers are hidden until the Background row expands.
    expect(
      screen.queryByRole("button", { name: "Surface" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sidebar" }),
    ).not.toBeInTheDocument();

    // The Explorer row itself (not a role="button" element) is the expand
    // toggle — click its label text, same as the explorer test suite does.
    fireEvent.click(screen.getByText("Background"));

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

  test("commit persists the boot-loading-gate palette cache; live preview alone does not", () => {
    renderWithCtx({
      theme: {
        semantic: {},
        font: {},
        modal: {},
        input: { outline: {} },
        select: { outline: {} },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Accent" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#112233" },
    });

    // Preview only — the boot palette cache must not move yet.
    expect(window.localStorage.getItem("pupu_boot_palette")).toBeNull();

    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));

    const cached = JSON.parse(window.localStorage.getItem("pupu_boot_palette"));
    expect(cached.accent).toBe("#112233");
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

    // "Background" is now the row's expand toggle; its ColorPicker trigger
    // carries the disambiguated "Background color" accessible name.
    fireEvent.click(screen.getByRole("button", { name: "Background color" }));
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

  test("preset dropdown rides the palette variant: rows keep their preset dots and the panel search filters presets", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox", { hidden: true });
    // PresetDots survive the variant switch: each option row still renders
    // its 4 swatch dots (accent/background/surface/text) via option.icon.
    const oceanRow = within(listbox)
      .getByText("Ocean")
      .closest('[role="option"]');
    expect(
      oceanRow.querySelectorAll('span[style*="border-radius: 50%"]'),
    ).toHaveLength(4);

    // The palette panel's search bar (bottom header, same as the attach
    // panel's menus) filters the preset list.
    const search = screen.getByPlaceholderText("Search...");
    fireEvent.change(search, { target: { value: "oce" } });
    expect(within(listbox).getByText("Ocean")).toBeInTheDocument();
    expect(within(listbox).queryByText("High Contrast")).toBeNull();

    // Selecting from the filtered list still applies the preset.
    fireEvent.click(within(listbox).getByText("Ocean"));
    expect(readThemeSettings().preset).toBe("ocean");
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
      screen.getByRole("button", { name: "Background color" }),
    ).toHaveTextContent("#ffffff");

    rerender(
      <ConfigContext.Provider value={ctx("dark_mode")}>
        <ThemeEditor />
      </ConfigContext.Provider>,
    );
    // Switching the active mode re-syncs editMode → Background shows dark default.
    expect(
      screen.getByRole("button", { name: "Background color" }),
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

  test("Background expander shows a linked ×N badge that drops as tiers are customized", () => {
    renderWithCtx();
    fireEvent.click(screen.getByText("Background"));
    // Both background-family tiers (sidebar, surface) start auto-derived.
    expect(screen.getByText("linked ×2")).toBeInTheDocument();

    // Commit a custom Surface color — one tier is no longer auto.
    fireEvent.click(screen.getByRole("button", { name: "Surface" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#112233" },
    });
    fireEvent.click(screen.getByTestId("color-picker-event-blocker"));

    expect(screen.getByText("linked ×1")).toBeInTheDocument();
  });
});

// Variant-A icon toolbar: the reset button is icon-only and, once armed by
// the first click of the two-step confirm, must carry a visible danger
// affordance (icon/background tinted with --pupu-danger). jsdom's CSSOM
// drops var()-based colors from computed style, so this is asserted via a
// source scan rather than getComputedStyle (see select.palette_dropdown_theme
// .test.js for the established precedent in this repo).
describe("theme_editor.js armed reset carries a --pupu-danger affordance", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "theme_editor.js"),
    "utf8",
  );

  test("armed (danger) icon color resolves to var(--pupu-danger)", () => {
    expect(src).toMatch(/color: danger\s*\n\s*\?\s*"var\(--pupu-danger\)"/);
  });

  test("armed (danger) background resolves to a tinted --pupu-danger-rgb fill", () => {
    expect(src).toMatch(
      /backgroundColor: danger \? "rgba\(var\(--pupu-danger-rgb\),0\.12\)" : undefined/,
    );
  });
});

// The custom region-highlight styling this suite used to source-scan for was
// deleted along with the ac20f98 custom expandable group — the Background
// row's expanded-folder region tint now comes from the BUILTIN Explorer
// itself (src/BUILTIN_COMPONENTs/explorer/explorer.js's BackgroundIndicator /
// ExplorerRow hoverBg), which carries its own coverage in explorer.test.js.

describe("ThemeEditor — taxonomy v2 editor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  test("the two new roots get their own rows", () => {
    renderWithCtx();
    expect(screen.getByRole("button", { name: "Warning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Info" })).toBeInTheDocument();
  });

  test("strength steps are hidden until Show all tiers is on", () => {
    renderWithCtx();
    expect(screen.queryByText("Overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all tiers" }));

    /* Overlay is a reference row, not a root: it has no picker of its own
       and says where it derives from. */
    expect(screen.getByText("Overlay")).toBeInTheDocument();
    expect(screen.getByText("follows Text")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overlay" })).toBeNull();
  });

  test("the tiers toggle survives a remount (it is a stored preference)", () => {
    const { unmount } = renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Show all tiers" }));
    unmount();

    renderWithCtx();
    expect(screen.getByRole("button", { name: "Hide tiers" })).toBeInTheDocument();
  });

  test("the tiers toggle never leaks into the exported theme shape", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Show all tiers" }));
    const theme = readThemeSettings();
    expect(theme.theme_editor_show_tiers).toBeUndefined();
    expect(Object.keys(theme).sort()).toEqual(["custom", "preset"]);
  });

  test("pinning a linked tier freezes the value it currently shows", () => {
    /* customise the root BEFORE mounting, so the derived tier differs from
       the preset value — see the documented no-op case below for why that
       distinction currently matters */
    writeThemeCustomColor("light_mode", "background", "#e8e8e8");
    renderWithCtx();
    fireEvent.click(screen.getByText("Background"));

    const shown = readThemeSettings();
    expect(shown.custom.light_mode.sidebar).toBeUndefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Sidebar: following Background, click to pin",
      }),
    );

    const after = readThemeSettings();
    expect(after.custom.light_mode.sidebar).toBeDefined();
    expect(after.custom.light_mode.sidebar).not.toBe("#f5f5f5");
  });

  test("unpinning drops the key and returns the tier to following", () => {
    writeThemeCustomColor("light_mode", "background", "#e8e8e8");
    renderWithCtx();
    fireEvent.click(screen.getByText("Background"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sidebar: following Background, click to pin",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sidebar: pinned, click to follow Background",
      }),
    );
    expect(readThemeSettings().custom.light_mode.sidebar).toBeUndefined();
  });

  /* The case that used to be a no-op: pinning before the parent has been
     touched, when the child still equals its preset value. This is the
     most natural moment to reach for Pin ("keep this one where it is
     while I go change the background"), so it has to work. */
  test("pinning a tier that still equals its preset value sticks", () => {
    renderWithCtx();
    fireEvent.click(screen.getByText("Background"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sidebar: following Background, click to pin",
      }),
    );
    expect(readThemeSettings().custom.light_mode.sidebar).toBe("#f5f5f5");
  });

  test("a pin taken before the parent moves actually holds the tier still", () => {
    renderWithCtx();
    fireEvent.click(screen.getByText("Background"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sidebar: following Background, click to pin",
      }),
    );
    /* now move the parent — a pinned child must NOT follow */
    act(() => {
      writeThemeCustomColor("light_mode", "background", "#c8c8c8");
    });
    expect(readThemeSettings().custom.light_mode.sidebar).toBe("#f5f5f5");
  });

  test("a pin at the preset value is visible in the exported theme, and reset undoes it", () => {
    renderWithCtx();
    fireEvent.click(screen.getByText("Background"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sidebar: following Background, click to pin",
      }),
    );

    /* export serialises exactly what readThemeSettings returns */
    const exported = JSON.parse(JSON.stringify(readThemeSettings()));
    expect(exported.custom.light_mode.sidebar).toBe("#f5f5f5");

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
    expect(readThemeSettings().custom.light_mode.sidebar).toBeUndefined();
  });

  /* Symmetry with the hex tiers: pinning an alpha step at exactly its
     ladder default must stick too, and it must land in the details bucket
     rather than the custom bag. */
  test("pinning an alpha step at its ladder default sticks, via the details channel", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Show all tiers" }));
    fireEvent.click(screen.getByText("Text"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Strong: following Text, click to pin",
      }),
    );

    const pinned = readThemeSettings();
    expect(pinned.custom.light_mode.textStrong).toBeUndefined();
    expect(pinned.details.light_mode.textStrongAlpha).toBe(0.88);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Strong: pinned, click to follow Text",
      }),
    );
    expect(
      readThemeSettings().details.light_mode.textStrongAlpha,
    ).toBeUndefined();
  });

  test("an alpha step is edited through the details channel, never the custom bag", () => {
    renderWithCtx();
    fireEvent.click(screen.getByRole("button", { name: "Show all tiers" }));
    fireEvent.click(screen.getByText("Text"));

    act(() => {
      writeThemeDetails({ light_mode: { textStrongAlpha: 0.5 }, dark_mode: {} });
    });
    const theme = readThemeSettings();
    /* strength steps never enter custom — that is what keeps the palette
       shape, the four-key boot cache and the export contract untouched */
    expect(theme.custom.light_mode.textStrong).toBeUndefined();
    expect(theme.details.light_mode.textStrongAlpha).toBe(0.5);
  });
});

describe("ThemeEditor — import clamping (composed machine gate)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    jest.clearAllMocks();
  });

  const importFile = async (payload) => {
    const input = document.querySelector('input[type="file"]');
    const file = new File([JSON.stringify(payload)], "theme.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByTestId("theme-preview-card");
  };

  /* A hand-edited file is the only entry point that can carry an illegal
     palette — the picker cannot produce one. This gate exists so that
     deleting the clamp call, or quietly dropping the disclosure, turns the
     suite red instead of shipping a theme that can blind the user. */
  test("an illegal imported palette is clamped token by token, and the count is disclosed", async () => {
    const { toast } = require("../../../SERVICEs/toast");
    renderWithCtx();

    await importFile({
      preset: "default",
      custom: {
        /* a light shell in the dark theme, plus an accent that vanishes
           into it; and the mirror-image violation in light mode */
        dark_mode: { background: "#ffffff", accent: "#fbfbfb" },
        light_mode: { background: "#000000" },
      },
    });

    const stored = readThemeSettings();
    for (const mode of ["light_mode", "dark_mode"]) {
      const palette = resolveSemanticPalette(mode, {
        preset: stored.preset,
        custom: stored.custom,
      });
      for (const key of Object.keys(stored.custom[mode])) {
        const bands = roleWindow(key, mode, palette);
        expect(bands.length).toBeGreaterThan(0);
        expect(
          bandsContain(bands, relativeLuminance(stored.custom[mode][key])),
        ).toBe(true);
      }
    }

    /* nothing survived unchanged */
    expect(stored.custom.dark_mode.background).not.toBe("#ffffff");
    expect(stored.custom.light_mode.background).not.toBe("#000000");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Theme imported · 3 colors adjusted for readability",
      ),
    );
  });

  test("the disclosure is singular for a single adjustment", async () => {
    const { toast } = require("../../../SERVICEs/toast");
    renderWithCtx();

    await importFile({
      preset: "default",
      custom: { dark_mode: { background: "#ffffff" }, light_mode: {} },
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Theme imported · 1 color adjusted for readability",
      ),
    );
  });

  test("a legal palette imports untouched and says nothing about adjustments", async () => {
    const { toast } = require("../../../SERVICEs/toast");
    renderWithCtx();

    await importFile({
      preset: "default",
      custom: { dark_mode: { background: "#0d0d0d" }, light_mode: {} },
    });

    expect(readThemeSettings().custom.dark_mode.background).toBe("#0d0d0d");
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Theme imported"),
    );
  });
});
