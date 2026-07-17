import {
  hexToRgbTriplet,
  resolveSemanticPalette,
  semanticCssVars,
  applySemanticCssVars,
  applySemanticPaletteToTheme,
  BORDER_TIER_ALPHA,
  DETAIL_DEFAULTS,
  resolveThemeDetails,
  persistBootPalette,
  BOOT_PALETTE_STORAGE_KEY,
} from "./theme_semantic";
import { SEMANTIC_DEFAULTS } from "../../BUILTIN_COMPONENTs/theme/semantic_tokens";

describe("hexToRgbTriplet", () => {
  test("converts 6-digit hex to 'r,g,b'", () => {
    expect(hexToRgbTriplet("#65c466")).toBe("101,196,102");
  });
  test("converts 3-digit hex", () => {
    expect(hexToRgbTriplet("#fff")).toBe("255,255,255");
  });
  test("returns null for invalid input", () => {
    expect(hexToRgbTriplet("nope")).toBeNull();
  });
});

describe("resolveSemanticPalette", () => {
  test("returns defaults when no preset/custom", () => {
    const p = resolveSemanticPalette("light_mode", {});
    expect(p).toEqual(SEMANTIC_DEFAULTS.light_mode);
  });
  test("preset overrides defaults", () => {
    const p = resolveSemanticPalette("dark_mode", { preset: "ocean" });
    expect(p.accent).toBe("#38bdf8");
  });
  test("custom overrides preset, only for provided keys", () => {
    const p = resolveSemanticPalette("light_mode", {
      preset: "ocean",
      custom: { light_mode: { accent: "#123456" } },
    });
    expect(p.accent).toBe("#123456");
    expect(p.background).toBe("#f7fbfd"); // from ocean
  });
  test("unknown preset falls back to defaults", () => {
    const p = resolveSemanticPalette("light_mode", { preset: "nope" });
    expect(p.accent).toBe("#65c466");
  });
});

describe("semanticCssVars", () => {
  test("maps each token to hex var + rgb var", () => {
    const vars = semanticCssVars({ accent: "#65c466" });
    expect(vars["--pupu-accent"]).toBe("#65c466");
    expect(vars["--pupu-accent-rgb"]).toBe("101,196,102");
  });
  test("uses kebab var name for textMuted", () => {
    const vars = semanticCssVars({ textMuted: "#8c8c8c" });
    expect(vars["--pupu-text-muted"]).toBe("#8c8c8c");
  });
});

describe("semanticCssVars border strength tiers", () => {
  test("border key emits three additional strength vars as exact rgba strings", () => {
    const vars = semanticCssVars({ border: "#2e2e2e" });
    expect(vars["--pupu-border"]).toBe("#2e2e2e");
    expect(vars["--pupu-border-rgb"]).toBe("46,46,46");
    expect(vars["--pupu-border-strong"]).toBe(
      `rgba(46,46,46, ${BORDER_TIER_ALPHA.strong})`,
    );
    expect(vars["--pupu-border-mid"]).toBe(
      `rgba(46,46,46, ${BORDER_TIER_ALPHA.mid})`,
    );
    expect(vars["--pupu-border-subtle"]).toBe(
      `rgba(46,46,46, ${BORDER_TIER_ALPHA.subtle})`,
    );
  });

  test("BORDER_TIER_ALPHA holds the CEO-approved tier values", () => {
    expect(BORDER_TIER_ALPHA).toEqual({ strong: 0.9, mid: 0.55, subtle: 0.3 });
  });

  test("does not emit strength vars for other palette keys", () => {
    const vars = semanticCssVars({ accent: "#65c466" });
    expect(vars["--pupu-accent-strong"]).toBeUndefined();
    expect(vars["--pupu-accent-mid"]).toBeUndefined();
    expect(vars["--pupu-accent-subtle"]).toBeUndefined();
  });
});

describe("applySemanticPaletteToTheme modal border uses BORDER_TIER_ALPHA.strong", () => {
  test("modal border alpha matches the strong tier constant (single source of truth)", () => {
    const themed = applySemanticPaletteToTheme(
      { modal: {} },
      {
        accent: "#112233",
        background: "#abcdef",
        surface: "#fedcba",
        text: "#010203",
        textMuted: "#445566",
        border: "#2e2e2e",
        success: "#00aa00",
        danger: "#aa0000",
      },
    );
    expect(themed.modal.border).toBe(
      `1px solid rgba(46,46,46, ${BORDER_TIER_ALPHA.strong})`,
    );
  });
});

describe("DETAIL_DEFAULTS", () => {
  test("holds the fallback details values (chipBorder transparent + tier alphas)", () => {
    expect(DETAIL_DEFAULTS).toEqual({
      chipBorder: "transparent",
      menuBorder: "transparent",
      cardBorder: "transparent",
      borderAlphaStrong: BORDER_TIER_ALPHA.strong,
      borderAlphaMid: BORDER_TIER_ALPHA.mid,
      borderAlphaSubtle: BORDER_TIER_ALPHA.subtle,
    });
  });
});

describe("resolveThemeDetails", () => {
  test("returns defaults when no preset/details given", () => {
    expect(resolveThemeDetails("light_mode", {})).toEqual(DETAIL_DEFAULTS);
  });

  test("preset details override defaults (high_contrast chipBorder)", () => {
    const resolved = resolveThemeDetails("light_mode", { preset: "high_contrast" });
    expect(resolved.chipBorder).toBe("rgba(107,107,107,0.25)");
    expect(resolved.borderAlphaStrong).toBe(BORDER_TIER_ALPHA.strong);

    const darkResolved = resolveThemeDetails("dark_mode", { preset: "high_contrast" });
    expect(darkResolved.chipBorder).toBe("rgba(138,138,138,0.25)");
  });

  test("presets without details fall back to global defaults", () => {
    const resolved = resolveThemeDetails("light_mode", { preset: "ocean" });
    expect(resolved.chipBorder).toBe("transparent");
  });

  test("user details override preset details, only for provided keys", () => {
    const resolved = resolveThemeDetails("light_mode", {
      preset: "high_contrast",
      details: { light_mode: { chipBorder: "#ff0000" } },
    });
    expect(resolved.chipBorder).toBe("#ff0000");
    expect(resolved.borderAlphaMid).toBe(BORDER_TIER_ALPHA.mid);
  });

  test("unknown keys in user details pass through untouched (forward compat)", () => {
    const resolved = resolveThemeDetails("light_mode", {
      details: { light_mode: { futureKnob: 42 } },
    });
    expect(resolved.futureKnob).toBe(42);
    expect(resolved.chipBorder).toBe("transparent");
  });
});

describe("semanticCssVars with details (chipBorder + border tier alpha overrides)", () => {
  test("without a details arg, output is byte-identical to the legacy call (regression lock)", () => {
    const legacy = semanticCssVars({ border: "#2e2e2e", accent: "#65c466" });
    expect(legacy["--pupu-chip-border"]).toBeUndefined();
    expect(legacy["--pupu-border-strong"]).toBe(
      `rgba(46,46,46, ${BORDER_TIER_ALPHA.strong})`,
    );
    expect(legacy["--pupu-border-mid"]).toBe(
      `rgba(46,46,46, ${BORDER_TIER_ALPHA.mid})`,
    );
    expect(legacy["--pupu-border-subtle"]).toBe(
      `rgba(46,46,46, ${BORDER_TIER_ALPHA.subtle})`,
    );
  });

  test("with a details arg, emits --pupu-chip-border", () => {
    const vars = semanticCssVars(
      { border: "#2e2e2e" },
      { ...DETAIL_DEFAULTS, chipBorder: "#ff0000" },
    );
    expect(vars["--pupu-chip-border"]).toBe("#ff0000");
  });

  test("with a details arg, emits --pupu-card-border", () => {
    const vars = semanticCssVars(
      { border: "#2e2e2e" },
      { ...DETAIL_DEFAULTS, cardBorder: "#00ffee" },
    );
    expect(vars["--pupu-card-border"]).toBe("#00ffee");
  });

  test("with a details arg, uses the alpha overrides for the three border tier vars", () => {
    const vars = semanticCssVars(
      { border: "#2e2e2e" },
      {
        ...DETAIL_DEFAULTS,
        borderAlphaStrong: 0.99,
        borderAlphaMid: 0.5,
        borderAlphaSubtle: 0.1,
      },
    );
    expect(vars["--pupu-border-strong"]).toBe("rgba(46,46,46, 0.99)");
    expect(vars["--pupu-border-mid"]).toBe("rgba(46,46,46, 0.5)");
    expect(vars["--pupu-border-subtle"]).toBe("rgba(46,46,46, 0.1)");
  });
});

describe("applySemanticCssVars", () => {
  test("writes variables onto the given element", () => {
    const el = document.createElement("div");
    applySemanticCssVars({ accent: "#65c466" }, el);
    expect(el.style.getPropertyValue("--pupu-accent")).toBe("#65c466");
    expect(el.style.getPropertyValue("--pupu-accent-rgb")).toBe("101,196,102");
  });

  test("threads a details arg through to write --pupu-chip-border", () => {
    const el = document.createElement("div");
    applySemanticCssVars(
      { border: "#2e2e2e" },
      el,
      { ...DETAIL_DEFAULTS, chipBorder: "#00ff00" },
    );
    expect(el.style.getPropertyValue("--pupu-chip-border")).toBe("#00ff00");
  });
});

describe("applySemanticPaletteToTheme", () => {
  test("projects semantic colors onto legacy theme fields", () => {
    const themed = applySemanticPaletteToTheme(
      {
        color: "#000000",
        backgroundColor: "#ffffff",
        modal: { backgroundColor: "#ffffff" },
        input: { outline: { onBlur: "2px solid transparent" } },
        select: {
          option: {
            hoverBackgroundColor: "rgba(0, 0, 0, 0.06)",
            selectedBackgroundColor: "rgba(0, 0, 0, 0.09)",
            disabledColor: "rgba(0, 0, 0, 0.35)",
          },
        },
        slider: { activeColor: "#111111" },
        tooltip: { backgroundColor: "#222222" },
        flow_editor: { canvasBackground: "#333333" },
      },
      {
        accent: "#112233",
        background: "#abcdef",
        surface: "#fedcba",
        text: "#010203",
        textMuted: "#445566",
        border: "#778899",
        success: "#00aa00",
        danger: "#aa0000",
      },
    );

    expect(themed.backgroundColor).toBe("#abcdef");
    expect(themed.color).toBe("#010203");
    expect(themed.highlightColor).toBe("#112233");
    expect(themed.modal.backgroundColor).toBe("#abcdef");
    expect(themed.input.outline.onBlur).toBe("2px solid transparent");
    expect(themed.input.outline.onFocus).toBe("2px solid #112233");
    expect(themed.select.option.hoverBackgroundColor).toBe(
      "rgba(0, 0, 0, 0.06)",
    );
    expect(themed.select.option.selectedBackgroundColor).toBe(
      "rgba(0, 0, 0, 0.09)",
    );
    expect(themed.select.option.disabledColor).toBe("rgba(0, 0, 0, 0.35)");
    expect(themed.modal.errorAccent).toBe("#aa0000");
    expect(themed.modal.successAccent).toBe("#00aa00");
    expect(themed.slider.activeColor).toBe("#111111");
    expect(themed.tooltip.backgroundColor).toBe("#222222");
    expect(themed.flow_editor.canvasBackground).toBe("#333333");
  });
});

describe("resolveSemanticPalette auto-derivation", () => {
  test("auto sidebar/surface derive from a custom background", () => {
    const p = resolveSemanticPalette("dark_mode", {
      preset: "default",
      custom: { dark_mode: { background: "#202028" } },
    });
    // derived, not the static defaults
    expect(p.surface).not.toBe("#1e1e1e");
    expect(p.sidebar).not.toBe("#151515");
    // surface sits above (lighter than) base in dark mode
    expect(p.surface).not.toBe(p.background);
  });

  test("default base reproduces default tiers (zero regression)", () => {
    const p = resolveSemanticPalette("dark_mode", { preset: "default", custom: {} });
    expect(p.background).toBe("#121212");
    expect(p.surface).toBe("#1e1e1e");
    expect(p.sidebar).toBe("#151515");
  });

  test("explicit override wins over derivation", () => {
    const p = resolveSemanticPalette("dark_mode", {
      preset: "default",
      custom: { dark_mode: { background: "#202028", surface: "#333333" } },
    });
    expect(p.surface).toBe("#333333");
  });
});

describe("applySemanticPaletteToTheme deep background family (phase 3)", () => {
  const BASE = {
    code: { backgroundColor: "#1E1E1E", fontSize: 12 },
    textfield: { backgroundColor: "rgba(30, 30, 30, 0.95)" },
    markdown: {
      color: "#EAEAEA",
      pre: { backgroundColor: "#1E1E1E", padding: 10 },
      table: { headerBackground: "#222222", borderColor: "#333333" },
    },
  };

  test("dark mode maps deep sinks to surface tier", () => {
    const palette = resolveSemanticPalette("dark_mode", {});
    const out = applySemanticPaletteToTheme(BASE, palette, "dark_mode");
    expect(out.code.backgroundColor).toBe("#1e1e1e");
    expect(out.markdown.pre.backgroundColor).toBe("#1e1e1e");
    expect(out.markdown.table.headerBackground).toBe("#1e1e1e");
    expect(out.textfield.backgroundColor).toBe("rgba(30,30,30, 0.95)");
    // non-color keys preserved
    expect(out.code.fontSize).toBe(12);
    expect(out.markdown.pre.padding).toBe(10);
    expect(out.markdown.table.borderColor).toBe("#333333");
  });

  test("light mode maps deep sinks to sidebar tier", () => {
    const palette = resolveSemanticPalette("light_mode", {});
    const out = applySemanticPaletteToTheme(BASE, palette, "light_mode");
    expect(out.code.backgroundColor).toBe("#f5f5f5");
    expect(out.markdown.pre.backgroundColor).toBe("#f5f5f5");
    expect(out.markdown.table.headerBackground).toBe("#f5f5f5");
    expect(out.textfield.backgroundColor).toBe("rgba(255,255,255, 0.95)");
  });

  test("custom palette follows through deep sinks", () => {
    const palette = resolveSemanticPalette("dark_mode", {
      preset: "ocean",
    });
    const out = applySemanticPaletteToTheme(BASE, palette, "dark_mode");
    expect(out.code.backgroundColor).toBe("#13232f");
    expect(out.textfield.backgroundColor).toBe("rgba(19,35,47, 0.95)");
  });

  test("omitting mode keeps legacy behavior (no deep mapping)", () => {
    const palette = resolveSemanticPalette("dark_mode", {});
    const out = applySemanticPaletteToTheme(BASE, palette);
    expect(out.code).toBe(BASE.code);
    expect(out.textfield).toBe(BASE.textfield);
  });

  test("switch on-state follows accent", () => {
    const base = { switch: { backgroundColor: "#CCCCCC", backgroundColor_on: "#65C467", color: "#FFFFFF" } };
    const palette = resolveSemanticPalette("dark_mode", { preset: "ocean" });
    const out = applySemanticPaletteToTheme(base, palette, "dark_mode");
    expect(out.switch.backgroundColor_on).toBe(palette.accent);
    expect(out.switch.backgroundColor).toBe("#CCCCCC");
    // thumb is a control chip → surface tier (light exact, dark #222222→#1e1e1e ≤4/255)
    expect(out.switch.color).toBe(palette.surface);
  });
});

describe("persistBootPalette", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("writes background/text/textMuted/accent as plain JSON under the boot palette key", () => {
    persistBootPalette({
      accent: "#65c466",
      background: "#101010",
      text: "#ffffff",
      textMuted: "#a0a0a0",
      surface: "#1a1a1a",
    });

    const raw = window.localStorage.getItem(BOOT_PALETTE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw)).toEqual({
      background: "#101010",
      text: "#ffffff",
      textMuted: "#a0a0a0",
      accent: "#65c466",
    });
  });

  test("falls back textMuted to text when textMuted is absent", () => {
    persistBootPalette({ accent: "#65c466", background: "#101010", text: "#ffffff" });
    const parsed = JSON.parse(window.localStorage.getItem(BOOT_PALETTE_STORAGE_KEY));
    expect(parsed.textMuted).toBe("#ffffff");
  });

  test("does not write when required fields are missing", () => {
    persistBootPalette({ accent: "#65c466" });
    expect(window.localStorage.getItem(BOOT_PALETTE_STORAGE_KEY)).toBeNull();
  });

  test("is a no-op for null/undefined palettes", () => {
    expect(() => persistBootPalette(null)).not.toThrow();
    expect(() => persistBootPalette(undefined)).not.toThrow();
    expect(window.localStorage.getItem(BOOT_PALETTE_STORAGE_KEY)).toBeNull();
  });

  test("real resolved palette from resolveSemanticPalette round-trips cleanly", () => {
    const palette = resolveSemanticPalette("dark_mode", { preset: "ocean" });
    persistBootPalette(palette);
    const parsed = JSON.parse(window.localStorage.getItem(BOOT_PALETTE_STORAGE_KEY));
    expect(parsed.accent).toBe(palette.accent);
    expect(parsed.background).toBe(palette.background);
  });
});
