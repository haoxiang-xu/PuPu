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
});
