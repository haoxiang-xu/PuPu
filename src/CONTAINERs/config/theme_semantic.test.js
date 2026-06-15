import {
  hexToRgbTriplet,
  resolveSemanticPalette,
  semanticCssVars,
  applySemanticCssVars,
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

describe("applySemanticCssVars", () => {
  test("writes variables onto the given element", () => {
    const el = document.createElement("div");
    applySemanticCssVars({ accent: "#65c466" }, el);
    expect(el.style.getPropertyValue("--pupu-accent")).toBe("#65c466");
    expect(el.style.getPropertyValue("--pupu-accent-rgb")).toBe("101,196,102");
  });
});
