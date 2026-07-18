import {
  hexToHsl,
  hslToHex,
  seedColorForIcon,
  warpPaletteFromSeed,
  staticGradientFromPalette,
} from "./warp_palette";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/* Normalizes an angular difference to [0, 180] so 350° vs 10° reads as a
   20° gap rather than 340°. */
const hueGap = (a, b) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

describe("hexToHsl / hslToHex", () => {
  test("converts a known hex color to HSL", () => {
    // #bfdbfe (plan's icon background) — a pale, highly saturated blue.
    const hsl = hexToHsl("#bfdbfe");
    expect(hsl).not.toBeNull();
    expect(hsl.h).toBeGreaterThanOrEqual(195);
    expect(hsl.h).toBeLessThanOrEqual(230);
    expect(hsl.l).toBeGreaterThan(80);
  });

  test("handles #rgb shorthand", () => {
    expect(hexToHsl("#fff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl("#000")).toEqual({ h: 0, s: 0, l: 0 });
  });

  test("invalid hex returns null", () => {
    expect(hexToHsl("not-a-color")).toBeNull();
    expect(hexToHsl("transparent")).toBeNull();
    expect(hexToHsl(undefined)).toBeNull();
    expect(hexToHsl("")).toBeNull();
  });

  test("hslToHex round-trips into a valid 6-digit hex string", () => {
    const hex = hslToHex(213, 60, 45);
    expect(hex).toMatch(HEX_RE);
    const back = hexToHsl(hex);
    expect(back.h).toBeGreaterThanOrEqual(210);
    expect(back.h).toBeLessThanOrEqual(216);
  });
});

describe("seedColorForIcon", () => {
  test("prefers icon.backgroundColor when it is a real hex color", () => {
    expect(seedColorForIcon({ backgroundColor: "#bfdbfe", color: "#111827" }, "mcp")).toBe(
      "#bfdbfe",
    );
  });

  test("skips a non-hex backgroundColor (e.g. transparent) and falls to icon.color", () => {
    expect(
      seedColorForIcon({ backgroundColor: "transparent", color: "#111827" }, "mcp"),
    ).toBe("#111827");
  });

  test("skips non-hex background AND color, falls to the source's SOURCE_CONFIG color", () => {
    expect(
      seedColorForIcon({ backgroundColor: "transparent", color: undefined }, "mcp"),
    ).toBe("#8b5cf6");
  });

  test("an emoji icon with no color info falls to its source's color", () => {
    expect(seedColorForIcon({ type: "emoji", emoji: "🚀" }, "plugin")).toBe("#fb923c");
  });

  test("garbage icon and unknown source fall all the way to the default indigo seed", () => {
    expect(seedColorForIcon(null, "does-not-exist")).toBe("#4a5bd8");
    expect(seedColorForIcon(undefined, undefined)).toBe("#4a5bd8");
  });
});

describe("warpPaletteFromSeed — shape", () => {
  test("returns 4 valid hex colors for dark and light, mode 'match'", () => {
    const dark = warpPaletteFromSeed("#4a5bd8", { mode: "match", isDark: true });
    const light = warpPaletteFromSeed("#4a5bd8", { mode: "match", isDark: false });
    expect(dark).toHaveLength(4);
    expect(light).toHaveLength(4);
    [...dark, ...light].forEach((c) => expect(c).toMatch(HEX_RE));
  });

  test("dark palette darkens toward the two end stops and clamps the seed stop to L 45-60, S>=45", () => {
    const [c0, , c2] = warpPaletteFromSeed("#bfdbfe", { mode: "match", isDark: true });
    const l0 = hexToHsl(c0).l;
    const hsl2 = hexToHsl(c2);
    expect(l0).toBeLessThan(20);
    expect(hsl2.l).toBeGreaterThanOrEqual(44);
    expect(hsl2.l).toBeLessThanOrEqual(61);
    expect(hsl2.s).toBeGreaterThanOrEqual(44);
  });

  test("light palette keeps saturation moderate (no white-text requirement)", () => {
    const light = warpPaletteFromSeed("#bfdbfe", { mode: "match", isDark: false });
    light.forEach((c) => expect(hexToHsl(c).s).toBeLessThanOrEqual(65));
    // first two stops read as pale background tints
    expect(hexToHsl(light[0]).l).toBeGreaterThan(85);
    expect(hexToHsl(light[1]).l).toBeGreaterThan(75);
  });
});

describe("warpPaletteFromSeed — blue-family icon (plan, #bfdbfe)", () => {
  test("the seed-derived stop stays in the blue hue family", () => {
    const [, , c2] = warpPaletteFromSeed("#bfdbfe", { mode: "match", isDark: true });
    const hue = hexToHsl(c2).h;
    expect(hue).toBeGreaterThanOrEqual(195);
    expect(hue).toBeLessThanOrEqual(230);
  });
});

describe("warpPaletteFromSeed — invert mode", () => {
  test("rotates the seed hue by ~180 degrees relative to 'match'", () => {
    const matchPalette = warpPaletteFromSeed("#4a5bd8", { mode: "match", isDark: true });
    const invertPalette = warpPaletteFromSeed("#4a5bd8", { mode: "invert", isDark: true });
    const matchHue = hexToHsl(matchPalette[2]).h;
    const invertHue = hexToHsl(invertPalette[2]).h;
    expect(hueGap(matchHue, invertHue)).toBeGreaterThanOrEqual(170);
    expect(hueGap(matchHue, invertHue)).toBeLessThanOrEqual(190);
  });
});

describe("warpPaletteFromSeed — garbage seed", () => {
  test("an invalid seed falls back to the same palette as the default indigo seed", () => {
    const garbage = warpPaletteFromSeed("not-a-color", { mode: "match", isDark: true });
    const fallback = warpPaletteFromSeed("#4a5bd8", { mode: "match", isDark: true });
    expect(garbage).toEqual(fallback);
  });
});

describe("staticGradientFromPalette", () => {
  test("builds the 135deg 5-stop fallback gradient from a 4-color palette", () => {
    const colors = ["#111111", "#222222", "#333333", "#444444"];
    expect(staticGradientFromPalette(colors)).toBe(
      "linear-gradient(135deg, #111111, #222222 30%, #333333 55%, #444444 72%, #111111 95%)",
    );
  });
});

describe("solidFromSeed", () => {
  const { solidFromSeed, hexToHsl } = require("./warp_palette");
  test("dark: deep tone in the seed's hue family", () => {
    const out = solidFromSeed("#bfdbfe", { isDark: true });
    const hsl = hexToHsl(out);
    expect(Math.abs(hsl.h - hexToHsl("#bfdbfe").h)).toBeLessThanOrEqual(4);
    expect(hsl.l).toBeGreaterThanOrEqual(28);
    expect(hsl.l).toBeLessThanOrEqual(38);
  });
  test("light: pale wash in the seed's hue family", () => {
    const out = solidFromSeed("#F46800", { isDark: false });
    const hsl = hexToHsl(out);
    expect(hsl.l).toBeGreaterThanOrEqual(82);
  });
  test("invalid seed falls back to indigo family", () => {
    const out = solidFromSeed("nope", { isDark: true });
    expect(hexToHsl(out)).not.toBeNull();
  });
});

describe("seedFromSvgContent + svg-file seed priority", () => {
  const { seedFromSvgContent, seedColorForIcon } = require("./warp_palette");
  const CORE_SVG = '<svg fill="none"><rect fill="#315D8E"/><path fill="#fff"/><path stroke="#0b0b0b"/></svg>';
  test("mines the dominant saturated color, ignoring whites/blacks", () => {
    expect(seedFromSvgContent(CORE_SVG)).toBe("#315d8e");
  });
  test("most frequent color wins; tie broken by saturation", () => {
    const svg = '<svg><rect fill="#22aa55"/><rect fill="#22aa55"/><circle fill="#d02090"/></svg>';
    expect(seedFromSvgContent(svg)).toBe("#22aa55");
  });
  test("all-monochrome svg yields null", () => {
    expect(seedFromSvgContent('<svg><path fill="#ffffff"/><path fill="#111111"/></svg>')).toBeNull();
  });
  test("svg-file icon seed beats source fallback in seedColorForIcon", () => {
    const icon = { type: "file", mimeType: "image/svg+xml", content: CORE_SVG };
    expect(seedColorForIcon(icon, "builtin")).toBe("#315d8e");
  });
});

describe("solidFromSeed alpha", () => {
  const { solidFromSeed } = require("./warp_palette");
  test("alpha < 1 yields rgba with that alpha", () => {
    const out = solidFromSeed("#315d8e", { isDark: true, alpha: 0.6 });
    expect(out).toMatch(/^rgba\(\d+,\d+,\d+,0\.6\)$/);
  });
  test("default stays opaque hex", () => {
    expect(solidFromSeed("#315d8e", { isDark: true })).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
