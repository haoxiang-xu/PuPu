import { hexToHsl, hslToHex, deriveTier } from "./color_derive";

describe("color_derive", () => {
  test("hex<->hsl round trips opaque grays", () => {
    expect(hslToHex(hexToHsl("#121212").h, hexToHsl("#121212").s, hexToHsl("#121212").l))
      .toBe("#121212");
  });

  test("deriveTier reproduces default dark surface from default dark base", () => {
    // base == refBase, so result == refTier exactly for neutral grays
    expect(deriveTier("#121212", "#121212", "#1e1e1e")).toBe("#1e1e1e");
  });

  test("deriveTier preserves base hue (tint), steps lightness by ref offset", () => {
    // warm base; ref offset is +lightness (dark elevation)
    const out = deriveTier("#241910", "#1a120b", "#241910");
    const baseHue = hexToHsl("#241910").h;
    expect(Math.abs(hexToHsl(out).h - baseHue)).toBeLessThan(2);
    expect(hexToHsl(out).l).toBeGreaterThan(hexToHsl("#241910").l - 0.001);
  });

  test("deriveTier enforces a minimum visible step when offset is tiny", () => {
    const out = deriveTier("#808080", "#000000", "#010101", { minStep: 0.05 });
    expect(Math.abs(hexToHsl(out).l - hexToHsl("#808080").l)).toBeGreaterThanOrEqual(0.049);
  });

  test("deriveTier clamps at white without throwing", () => {
    const out = deriveTier("#ffffff", "#ffffff", "#f5f5f5"); // negative offset
    expect(hexToHsl(out).l).toBeLessThan(hexToHsl("#ffffff").l);
  });
});
