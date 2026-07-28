/* eslint-env jest */
import deriveBlobPalette, { deriveBlobScene } from "./derive_blob_palette";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

describe("deriveBlobPalette", () => {
  test("returns 4 valid hex colors with the accent first", () => {
    const palette = deriveBlobPalette("#4C8BF5", false);
    expect(palette).toHaveLength(4);
    expect(palette[0]).toBe("#4C8BF5");
    palette.forEach((color) => expect(color).toMatch(HEX_RE));
  });

  test("all 4 entries are distinct (no duplicate neighbors)", () => {
    const palette = deriveBlobPalette("#22C55E", true);
    const unique = new Set(palette.map((c) => c.toLowerCase()));
    expect(unique.size).toBe(4);
  });

  test("varies by isDark (dark and light palettes differ beyond the accent)", () => {
    const light = deriveBlobPalette("#4C8BF5", false);
    const dark = deriveBlobPalette("#4C8BF5", true);
    expect(light[0]).toBe(dark[0]); // accent itself is theme-mode agnostic
    expect(light.slice(1)).not.toEqual(dark.slice(1));
  });

  test("is deterministic for the same input", () => {
    const a = deriveBlobPalette("#E85D75", true);
    const b = deriveBlobPalette("#E85D75", true);
    expect(a).toEqual(b);
  });

  test("handles a different accent hue (green preset)", () => {
    const palette = deriveBlobPalette("#16A34A", false);
    expect(palette).toHaveLength(4);
    palette.forEach((color) => expect(color).toMatch(HEX_RE));
  });
});

describe("deriveBlobScene", () => {
  const HEX = /^#[0-9a-f]{6}$/i;

  test("colors match deriveBlobPalette; bg is the theme background verbatim", () => {
    const scene = deriveBlobScene("#4C8BF5", "#161c28", true);
    expect(scene.colors).toEqual(deriveBlobPalette("#4C8BF5", true));
    expect(scene.bg).toBe("#161c28");
  });

  test("sky/ground tints are valid hexes derived from the theme", () => {
    const scene = deriveBlobScene("#65c466", "#121212", true);
    expect(scene.skyTint).toMatch(HEX);
    expect(scene.groundTint).toMatch(HEX);
    // sky sits lighter than the (near-black) background ground tint
    expect(scene.skyTint).not.toBe(scene.groundTint);
  });

  test("follows the background: different bg → different scene", () => {
    const a = deriveBlobScene("#4C8BF5", "#161c28", true);
    const b = deriveBlobScene("#4C8BF5", "#2e3440", true);
    expect(a.bg).not.toBe(b.bg);
    expect(a.skyTint).not.toBe(b.skyTint);
  });
});
