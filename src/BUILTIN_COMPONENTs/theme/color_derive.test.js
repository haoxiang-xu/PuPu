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

describe("deriveTier matchSaturation (spec §2.1)", () => {
  test("default opts stay byte-identical to legacy behavior (regression lock)", () => {
    // Omitting opts, passing {}, and passing matchSaturation:false must all
    // reproduce the legacy formula exactly: base hue + base saturation,
    // lightness stepped by the ref offset. Reconstructed here rather than
    // asserted on a hardcoded hex so the lock states the rule, not a sample.
    const base = hexToHsl("#38bdf8");
    const offset = hexToHsl("#8a8a8a").l - hexToHsl("#ffffff").l;
    const legacy = hslToHex(base.h, base.s, base.l + offset);
    expect(deriveTier("#38bdf8", "#ffffff", "#8a8a8a")).toBe(legacy);
    expect(deriveTier("#38bdf8", "#ffffff", "#8a8a8a", {})).toBe(legacy);
    expect(
      deriveTier("#38bdf8", "#ffffff", "#8a8a8a", { matchSaturation: false }),
    ).toBe(legacy);
    // opt-in actually changes the result (proves the flag is load-bearing)
    expect(
      deriveTier("#38bdf8", "#ffffff", "#8a8a8a", { matchSaturation: true }),
    ).not.toBe(legacy);
  });

  test("chromatic identity: base === refBase reproduces refTier's s and l", () => {
    // ocean dark background -> surface: |offset| = .045 clears the .04
    // minStep floor, so the identity is not masked by the minimum-step rule.
    const out = hexToHsl(
      deriveTier("#0b1620", "#0b1620", "#13232f", { matchSaturation: true }),
    );
    const refTier = hexToHsl("#13232f");
    expect(Math.abs(out.s - refTier.s)).toBeLessThan(0.01);
    expect(Math.abs(out.l - refTier.l)).toBeLessThan(0.01);
    // 2° matches the hue tolerance the shipped tier tests already use — 8-bit
    // hex round-tripping quantizes hue coarsely at low lightness.
    expect(Math.abs(out.h - hexToHsl("#0b1620").h)).toBeLessThan(2);
  });

  test("identity holds under the minStep floor too, for saturation", () => {
    // #0f1d28 sits only .0235 above the base — minStep overrides lightness by
    // design (pre-existing rule), but saturation identity must still hold.
    const out = hexToHsl(
      deriveTier("#0b1620", "#0b1620", "#0f1d28", { matchSaturation: true }),
    );
    expect(Math.abs(out.s - hexToHsl("#0f1d28").s)).toBeLessThan(0.02);
  });

  test("achromatic identity: gray ref pair + gray base reproduces refTier exactly", () => {
    expect(
      deriveTier("#ffffff", "#ffffff", "#8a8a8a", { matchSaturation: true }),
    ).toBe("#8a8a8a");
  });

  test("achromatic fallback caps a chromatic base at S_NEUTRAL_CAP", () => {
    const out = hexToHsl(
      deriveTier("#38bdf8", "#ffffff", "#8a8a8a", { matchSaturation: true }),
    );
    expect(Math.abs(out.s - 0.2)).toBeLessThan(0.01);
  });

  test("achromatic fallback keeps a low-sat base below the cap untouched", () => {
    const base = hslToHex(210, 0.15, 0.6);
    const out = hexToHsl(
      deriveTier(base, "#ffffff", "#8a8a8a", { matchSaturation: true }),
    );
    expect(Math.abs(out.s - 0.15)).toBeLessThan(0.02);
  });

  test("saturation ratio is clamped to [0.25, 1.15]", () => {
    const base = hslToHex(30, 0.4, 0.5);
    const hi = hexToHsl(
      deriveTier(base, hslToHex(200, 0.1, 0.5), hslToHex(200, 0.5, 0.6), {
        matchSaturation: true,
      }),
    );
    expect(Math.abs(hi.s - 0.4 * 1.15)).toBeLessThan(0.02);
    const lo = hexToHsl(
      deriveTier(base, hslToHex(200, 0.6, 0.5), hslToHex(200, 0.06, 0.6), {
        matchSaturation: true,
      }),
    );
    expect(Math.abs(lo.s - 0.4 * 0.25)).toBeLessThan(0.02);
  });
});
