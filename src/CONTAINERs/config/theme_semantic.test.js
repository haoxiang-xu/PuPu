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
import {
  SEMANTIC_DEFAULTS,
  SEMANTIC_FAMILIES,
  SEMANTIC_PRESETS,
} from "../../BUILTIN_COMPONENTs/theme/semantic_tokens";
import { hexToHsl } from "../../BUILTIN_COMPONENTs/theme/color_derive";

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

  test("border's strength names stay exclusive to border", () => {
    const vars = semanticCssVars({ accent: "#65c466" });
    expect(vars["--pupu-accent-strong"]).toBeUndefined();
    expect(vars["--pupu-accent-mid"]).toBeUndefined();
    expect(vars["--pupu-accent-subtle"]).toBeUndefined();
    /* accent carries the STATUS ladder instead — a different vocabulary
       on purpose: border tiers are strokes, status tints are fills. */
    expect(vars["--pupu-accent-tint"]).toBe("rgba(101,196,102, 0.14)");
  });
});

describe("applySemanticPaletteToTheme modal border references the border-strong var", () => {
  test("modal border defers to --pupu-border-strong instead of recomputing it", () => {
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
        warning: "#aa8800",
        danger: "#aa0000",
        info: "#0000aa",
      },
    );
    /* Recomputing the alpha here duplicated the var AND ignored a user's
       borderAlphaStrong override, so modal borders silently never followed
       it. Referencing the var fixes both. */
    expect(themed.modal.border).toBe("1px solid var(--pupu-border-strong)");
  });

  test("modal.warningAccent is finally populated (confirm_interact reads it)", () => {
    const themed = applySemanticPaletteToTheme(
      { modal: {} },
      {
        accent: "#112233", background: "#abcdef", surface: "#fedcba",
        text: "#010203", textMuted: "#445566", border: "#2e2e2e",
        success: "#00aa00", warning: "#aa8800", danger: "#aa0000", info: "#0000aa",
      },
    );
    expect(themed.modal.warningAccent).toBe("#aa8800");
  });
});

describe("DETAIL_DEFAULTS", () => {
  /* v2: bucketed per mode so that per-mode strength alphas can ride the
     details channel that already resolves per mode. The three published
     border alphas are mode-invariant, so this bucketing changed no
     shipped value. */
  test("is bucketed per mode and keeps the published literals + border alphas", () => {
    expect(Object.keys(DETAIL_DEFAULTS).sort()).toEqual([
      "dark_mode",
      "light_mode",
    ]);
    for (const mode of ["light_mode", "dark_mode"]) {
      expect(DETAIL_DEFAULTS[mode].chipBorder).toBe("transparent");
      expect(DETAIL_DEFAULTS[mode].menuBorder).toBe("transparent");
      expect(DETAIL_DEFAULTS[mode].cardBorder).toBe("transparent");
      expect(DETAIL_DEFAULTS[mode].borderAlphaStrong).toBe(BORDER_TIER_ALPHA.strong);
      expect(DETAIL_DEFAULTS[mode].borderAlphaMid).toBe(BORDER_TIER_ALPHA.mid);
      expect(DETAIL_DEFAULTS[mode].borderAlphaSubtle).toBe(BORDER_TIER_ALPHA.subtle);
    }
  });

  test("carries the per-mode strength alphas that differ between modes", () => {
    expect(DETAIL_DEFAULTS.dark_mode.textFaintAlpha).toBe(0.38);
    expect(DETAIL_DEFAULTS.light_mode.textFaintAlpha).toBe(0.35);
    expect(DETAIL_DEFAULTS.dark_mode.overlayHoverAlpha).toBe(0.08);
    expect(DETAIL_DEFAULTS.light_mode.overlayHoverAlpha).toBe(0.07);
    /* one shared knob for all five status hues */
    expect(DETAIL_DEFAULTS.light_mode.statusTintAlpha).toBe(0.14);
    expect(DETAIL_DEFAULTS.dark_mode.statusTintAlpha).toBe(0.14);
  });
});

describe("resolveThemeDetails", () => {
  test("returns defaults when no preset/details given", () => {
    expect(resolveThemeDetails("light_mode", {})).toEqual(DETAIL_DEFAULTS.light_mode);
    expect(resolveThemeDetails("dark_mode", {})).toEqual(DETAIL_DEFAULTS.dark_mode);
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
      { ...DETAIL_DEFAULTS.light_mode, chipBorder: "#ff0000" },
    );
    expect(vars["--pupu-chip-border"]).toBe("#ff0000");
  });

  test("with a details arg, emits --pupu-card-border", () => {
    const vars = semanticCssVars(
      { border: "#2e2e2e" },
      { ...DETAIL_DEFAULTS.light_mode, cardBorder: "#00ffee" },
    );
    expect(vars["--pupu-card-border"]).toBe("#00ffee");
  });

  test("with a details arg, uses the alpha overrides for the three border tier vars", () => {
    const vars = semanticCssVars(
      { border: "#2e2e2e" },
      {
        ...DETAIL_DEFAULTS.light_mode,
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
      { ...DETAIL_DEFAULTS.light_mode, chipBorder: "#00ff00" },
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

  test("derives every SEMANTIC_FAMILIES child when its root is customized (table-driven gate)", () => {
    for (const [root, fam] of Object.entries(SEMANTIC_FAMILIES)) {
      const palette = resolveSemanticPalette("dark_mode", {
        custom: { dark_mode: { [root]: "#0b1620" } },
      });
      for (const child of fam.children) {
        expect(palette[child]).not.toBe(SEMANTIC_DEFAULTS.dark_mode[child]);
      }
    }
  });

  test("customizing a non-family token derives nothing", () => {
    const palette = resolveSemanticPalette("dark_mode", {
      custom: { dark_mode: { text: "#aabbcc" } },
    });
    expect(palette.sidebar).toBe(SEMANTIC_DEFAULTS.dark_mode.sidebar);
    expect(palette.surface).toBe(SEMANTIC_DEFAULTS.dark_mode.surface);
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
    /* borderColor used to sit in the list above as a stand-in for "left
       alone", which only held because nothing themed it yet. It is a colour,
       and prose rules are strokes, so it belongs to the border family now —
       the preservation check moved to a key that really is non-colour. */
    expect(out.markdown.table.borderColor).toBe("var(--pupu-border)");
  });

  /* Rendered prose is the surface a custom Label is most visible on, and it
     was the last one still painted from fixed hex. */
  test("markdown prose follows the Label ladder, and its rules the border token", () => {
    const palette = resolveSemanticPalette("dark_mode", {});
    const out = applySemanticPaletteToTheme(BASE, palette, "dark_mode");
    expect(out.markdown.color).toBe("var(--pupu-markdown-body)");
    expect(out.markdown.blockquote.color).toBe("var(--pupu-markdown-quote)");
    expect(out.markdown.blockquote.borderColor).toBe("var(--pupu-border)");
    expect(out.markdown.hr.borderColor).toBe("var(--pupu-border)");
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
    /* off track follows the theme: 20% text (was a base pass-through gray
       that could vanish against custom palettes) */
    const [tr, tg, tb] = [1, 3, 5].map((i) =>
      parseInt(palette.text.slice(i, i + 2), 16),
    );
    expect(out.switch.backgroundColor).toBe(`rgba(${tr},${tg},${tb}, 0.2)`);
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

describe("taxonomy v2 — emitted variable set (whitelist increment lock)", () => {
  /* Replaces the old "byte-identical output" lock. That lock said "do not
     silently change behaviour"; v2 only ADDS, so the stronger statement is
     "the set of emitted names is exactly this list". Anything appearing
     here that a human did not write down is a contract leak. */
  const FULL_PALETTE = {
    accent: "#65c466", background: "#121212", sidebar: "#151515",
    surface: "#1e1e1e", text: "#ffffff", textMuted: "#8a8a8a",
    border: "#2e2e2e", success: "#4ade80", warning: "#fbbf24",
    danger: "#f87171", info: "#60a5fa",
  };

  test("emits exactly the declared variable names", () => {
    const vars = semanticCssVars(FULL_PALETTE, resolveThemeDetails("dark_mode", {}));
    const names = Object.keys(vars).sort();

    const roots = [
      "accent", "background", "sidebar", "surface", "text", "text-muted",
      "border", "success", "warning", "danger", "info",
    ];
    const expected = [];
    for (const r of roots) expected.push(`--pupu-${r}`, `--pupu-${r}-rgb`);
    expected.push(
      "--pupu-text-strong", "--pupu-text-secondary",
      "--pupu-text-faint", "--pupu-text-disabled",
      /* Markdown section: prose is an alpha of Label like every other step,
         so rendered answers follow a custom Label instead of a fixed hex. */
      "--pupu-markdown-body", "--pupu-markdown-quote",
      "--pupu-overlay-hover", "--pupu-overlay-active",
      "--pupu-overlay-selected", "--pupu-overlay-ghost",
      "--pupu-border-strong", "--pupu-border-mid", "--pupu-border-subtle",
      "--pupu-chip-border", "--pupu-menu-border", "--pupu-card-border",
    );
    for (const hue of ["accent", "success", "warning", "danger", "info"]) {
      expected.push(
        `--pupu-${hue}-tint`, `--pupu-${hue}-tint-hover`,
        `--pupu-${hue}-tint-active`, `--pupu-${hue}-tint-border`,
      );
    }
    expect(names).toEqual(expected.sort());
  });

  test("strength steps read their alpha from the mode-resolved details", () => {
    const dark = semanticCssVars(FULL_PALETTE, resolveThemeDetails("dark_mode", {}));
    const light = semanticCssVars(FULL_PALETTE, resolveThemeDetails("light_mode", {}));
    expect(dark["--pupu-text-faint"]).toBe("rgba(255,255,255, 0.38)");
    expect(light["--pupu-text-faint"]).toBe("rgba(255,255,255, 0.35)");
    expect(dark["--pupu-overlay-selected"]).toBe("rgba(255,255,255, 0.1)");
    expect(light["--pupu-overlay-selected"]).toBe("rgba(255,255,255, 0.06)");
  });

  test("a user alpha override flows through the details channel", () => {
    const vars = semanticCssVars(
      FULL_PALETTE,
      resolveThemeDetails("dark_mode", {
        details: { dark_mode: { textFaintAlpha: 0.5 } },
      }),
    );
    expect(vars["--pupu-text-faint"]).toBe("rgba(255,255,255, 0.5)");
  });

  test("a partial palette emits no orphan strength steps", () => {
    const vars = semanticCssVars({ accent: "#65c466" }, resolveThemeDetails("dark_mode", {}));
    expect(vars["--pupu-text-faint"]).toBeUndefined();
    expect(vars["--pupu-danger-tint"]).toBeUndefined();
    expect(vars["--pupu-accent-tint"]).toBe("rgba(101,196,102, 0.14)");
  });
});

describe("taxonomy v2 — per-node minStep stops the sidebar drift", () => {
  /* The old global minStep 0.04 was LARGER than the shipped sidebar offset
     (default dark #121212 -> #151515 is 0.0118 in HSL-L), so the floor
     fired on every customisation and pushed sidebar to ~#1c1c1c — a
     permanent, silent drift away from the preset the moment a user touched
     background. */
  test("pinning background to its preset value reproduces the preset tier LIGHTNESS", () => {
    for (const preset of Object.keys(SEMANTIC_PRESETS)) {
      for (const mode of ["light_mode", "dark_mode"]) {
        const ref = SEMANTIC_PRESETS[preset][mode];
        const resolved = resolveSemanticPalette(mode, {
          preset,
          custom: { [mode]: { background: ref.background } },
        });
        for (const tier of ["sidebar", "surface"]) {
          const deltaL =
            Math.abs(hexToHsl(resolved[tier]).l - hexToHsl(ref[tier]).l) * 255;
          expect(deltaL).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  /* KNOWN GAP, deliberately locked in as-is rather than silently fixed.
     deriveTier transplants LIGHTNESS only; it reuses the base colour's
     saturation. So when a preset's authored sidebar/surface has a
     different saturation from its background — which most tinted presets
     do — customising background reproduces the preset's lightness but not
     its chroma. Worst measured case is `warm` light sidebar: authored
     #f6efe7 (a warm grey) derives as #ffeede (a noticeably pinker cream),
     dS = 0.545.

     This predates v2. Closing it needs deriveTier's matchSaturation, but
     matchSaturation's achromatic fallback caps saturation at 0.20 — muted
     TEXT semantics, which applied to a shell tier would desaturate a
     user's deliberately coloured sidebar toward grey. That is a contract
     decision on a shared pure function, so it is escalated, not improvised
     here. This test pins current behaviour so the fix is visible when it
     lands. */
  test("KNOWN GAP: tier saturation still follows the base, not the preset", () => {
    const warmLight = SEMANTIC_PRESETS.warm.light_mode;
    const resolved = resolveSemanticPalette("light_mode", {
      preset: "warm",
      custom: { light_mode: { background: warmLight.background } },
    });
    expect(hexToHsl(resolved.sidebar).s).toBeCloseTo(
      hexToHsl(warmLight.background).s,
      2,
    );
    expect(hexToHsl(resolved.sidebar).s).not.toBeCloseTo(
      hexToHsl(warmLight.sidebar).s,
      2,
    );
  });
});

/* A Button reads its label colour from theme.button.root.color and hands its
   icon theme.icon.color. Mapping only the icon split the two halves of one
   control apart: on the default dark palette the icon moved to #ffffff while
   the label stayed on the JSON's #CCCCCC, and on a custom palette they
   drifted properly. The settings side menu is where it showed first, but
   every plain Button in the app had it. */
describe("applySemanticPaletteToTheme keeps a button's label with its icon", () => {
  const semantic = {
    accent: "#112233",
    background: "#abcdef",
    surface: "#fedcba",
    text: "#010203",
    textMuted: "#445566",
    border: "#2e2e2e",
    success: "#00aa00",
    warning: "#aa8800",
    danger: "#aa0000",
    info: "#0000aa",
  };

  test("label and icon land on the same text token", () => {
    const themed = applySemanticPaletteToTheme(
      { button: { root: { color: "#CCCCCC", fontSize: 16 } }, icon: {} },
      semantic,
    );

    expect(themed.button.root.color).toBe(semantic.text);
    expect(themed.button.root.color).toBe(themed.icon.color);
  });

  test("the rest of the button theme survives the mapping", () => {
    const themed = applySemanticPaletteToTheme(
      {
        button: {
          root: { color: "#CCCCCC", fontSize: 16 },
          background: { hoverBackgroundColor: "#101010" },
        },
        icon: {},
      },
      semantic,
    );

    expect(themed.button.root.fontSize).toBe(16);
    expect(themed.button.background.hoverBackgroundColor).toBe("#101010");
  });

  test("a theme with no button section does not blow up", () => {
    const themed = applySemanticPaletteToTheme({ icon: {} }, semantic);
    expect(themed.button.root.color).toBe(semantic.text);
  });
});
