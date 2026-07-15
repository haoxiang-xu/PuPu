import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
} from "./semantic_tokens";

const HEX = /^#[0-9a-f]{6}$/;

describe("semantic_tokens", () => {
  test("exposes 9 token keys", () => {
    expect(SEMANTIC_TOKEN_KEYS).toEqual([
      "accent",
      "background",
      "sidebar",
      "surface",
      "text",
      "textMuted",
      "border",
      "success",
      "danger",
    ]);
  });

  test("defaults define every key for both modes as lowercase hex", () => {
    for (const mode of ["light_mode", "dark_mode"]) {
      for (const key of SEMANTIC_TOKEN_KEYS) {
        expect(SEMANTIC_DEFAULTS[mode][key]).toMatch(HEX);
      }
    }
  });

  test("light accent default stays #65c466 (keeps existing highlight)", () => {
    expect(SEMANTIC_DEFAULTS.light_mode.accent).toBe("#65c466");
  });

  test("every preset is a full valid palette for both modes", () => {
    expect(SEMANTIC_PRESETS.default).toBeDefined();
    for (const preset of Object.values(SEMANTIC_PRESETS)) {
      for (const mode of ["light_mode", "dark_mode"]) {
        for (const key of SEMANTIC_TOKEN_KEYS) {
          expect(preset[mode][key]).toMatch(HEX);
        }
      }
    }
  });

  test("sidebar is a semantic token with light/dark defaults", () => {
    expect(SEMANTIC_TOKEN_KEYS).toContain("sidebar");
    expect(SEMANTIC_DEFAULTS.light_mode.sidebar).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_DEFAULTS.dark_mode.sidebar).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("every preset defines sidebar in both modes", () => {
    for (const name of Object.keys(SEMANTIC_PRESETS)) {
      expect(SEMANTIC_PRESETS[name].light_mode.sidebar).toBeDefined();
      expect(SEMANTIC_PRESETS[name].dark_mode.sidebar).toBeDefined();
    }
  });

  test("only high_contrast opts into a details bag (chipBorder for the softened border family)", () => {
    expect(SEMANTIC_PRESETS.high_contrast.details).toEqual({
      light_mode: { chipBorder: "rgba(107,107,107,0.55)" },
      dark_mode: { chipBorder: "rgba(138,138,138,0.55)" },
    });
    for (const name of Object.keys(SEMANTIC_PRESETS)) {
      if (name === "high_contrast") continue;
      expect(SEMANTIC_PRESETS[name].details).toBeUndefined();
    }
  });
});

describe("phase-3 preset library", () => {
  const HEX6 = /^#[0-9a-f]{6}$/i;

  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const chan = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return (
      0.2126 * chan((n >> 16) & 255) +
      0.7152 * chan((n >> 8) & 255) +
      0.0722 * chan(n & 255)
    );
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const NEW_PRESETS = ["graphite", "violet", "rose", "nord"];

  test("new presets exist with 9 valid hex tokens per mode", () => {
    for (const name of NEW_PRESETS) {
      const preset = SEMANTIC_PRESETS[name];
      expect(preset).toBeDefined();
      for (const mode of ["light_mode", "dark_mode"]) {
        for (const key of SEMANTIC_TOKEN_KEYS) {
          expect(preset[mode][key]).toMatch(HEX6);
        }
      }
    }
  });

  test("every preset keeps text/background ≥ 4.5:1", () => {
    for (const name of Object.keys(SEMANTIC_PRESETS)) {
      for (const mode of ["light_mode", "dark_mode"]) {
        const p = SEMANTIC_PRESETS[name][mode];
        expect(contrast(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("new presets keep accent/background ≥ 3:1", () => {
    for (const name of NEW_PRESETS) {
      for (const mode of ["light_mode", "dark_mode"]) {
        const p = SEMANTIC_PRESETS[name][mode];
        expect(contrast(p.accent, p.background)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
