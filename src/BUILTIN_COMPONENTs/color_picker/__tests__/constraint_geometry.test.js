import {
  luminanceOfHsv,
  solveV,
  legalVIntervals,
  snapSV,
  legalPolygons,
  blockedRegionPath,
  clampHexToBands,
} from "../constraint_geometry";
import { hexToRgb, rgbToHsv } from "../color_utils";

const DARK_SHELL = [[0, 0.1]];
const LIGHT_SHELL = [[0.3, 1]];
const SPLIT = [
  [0, 0.05],
  [0.6, 1],
];

describe("luminance is monotone in V (the property everything relies on)", () => {
  test("holds for a spread of hues and saturations", () => {
    for (const h of [0, 45, 120, 210, 300]) {
      for (const s of [0, 30, 70, 100]) {
        let prev = -1;
        for (let v = 0; v <= 100; v += 5) {
          const l = luminanceOfHsv(h, s, v);
          expect(l).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = l;
        }
      }
    }
  });
});

describe("solveV", () => {
  test("inverts luminance for fixed hue/saturation", () => {
    for (const [h, s] of [
      [0, 0],
      [210, 60],
      [120, 100],
    ]) {
      const target = 0.25;
      const v = solveV(h, s, target);
      /* 8-bit quantisation puts a floor on how exactly this can invert:
         one channel step is worth up to ~0.004 luminance. */
      expect(luminanceOfHsv(h, s, v)).toBeCloseTo(target, 2);
    }
  });
});

describe("legalVIntervals", () => {
  test("greyscale column always has a solution when bands are non-empty", () => {
    /* This is what guarantees the sideways search in snapSV terminates. */
    for (const bands of [DARK_SHELL, LIGHT_SHELL, SPLIT]) {
      for (const h of [0, 90, 180, 270]) {
        expect(legalVIntervals(h, 0, bands).length).toBeGreaterThan(0);
      }
    }
  });

  test("a saturated blue cannot reach a light-shell luminance", () => {
    /* pure blue tops out around L=0.07, well under the 0.30 light floor */
    expect(legalVIntervals(240, 100, LIGHT_SHELL)).toEqual([]);
  });

  test("unconstrained means the whole column", () => {
    expect(legalVIntervals(0, 50, [])).toEqual([[0, 100]]);
  });
});

describe("snapSV", () => {
  test("corrects V only, leaving saturation alone, when the column allows it", () => {
    const { s, v } = snapSV(210, 60, 95, DARK_SHELL);
    expect(s).toBe(60);
    expect(Number.isInteger(v)).toBe(true);
    expect(luminanceOfHsv(210, s, v)).toBeLessThanOrEqual(0.1);
  });

  test("walks sideways only when the column has no legal V at all", () => {
    const res = snapSV(240, 100, 50, LIGHT_SHELL);
    expect(res.s).toBeLessThan(100);
    expect(luminanceOfHsv(240, res.s, res.v)).toBeGreaterThanOrEqual(0.3);
  });

  test("is a no-op without bands", () => {
    expect(snapSV(10, 20, 30, [])).toEqual({ s: 20, v: 30 });
  });

  test("always lands legal, for a sweep of pointer positions", () => {
    for (const bands of [DARK_SHELL, LIGHT_SHELL, SPLIT]) {
      for (const h of [0, 60, 150, 240, 330]) {
        for (let s = 0; s <= 100; s += 25) {
          for (let v = 0; v <= 100; v += 25) {
            const r = snapSV(h, s, v, bands);
            const l = luminanceOfHsv(h, r.s, r.v);
            /* exact, not epsilon-padded: the snapper must land inside the
               band as quantised, because that is the value that gets
               stored and re-read. */
            const inside = bands.some(([lo, hi]) => l >= lo && l <= hi);
            expect(inside).toBe(true);
          }
        }
      }
    }
  });
});

describe("clampHexToBands", () => {
  test("returns an already-legal colour byte-identically", () => {
    expect(clampHexToBands("#121212", DARK_SHELL)).toBe("#121212");
    expect(clampHexToBands("#ffffff", LIGHT_SHELL)).toBe("#ffffff");
  });

  test("pulls an illegal colour into the band, preserving hue", () => {
    const out = clampHexToBands("#ffffff", DARK_SHELL);
    const rgb = hexToRgb(out);
    const { h } = rgbToHsv(rgb.r, rgb.g, rgb.b);
    expect(h).toBe(0); /* white is achromatic; stays achromatic */
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    expect(luminanceOfHsv(hsv.h, hsv.s, hsv.v)).toBeLessThanOrEqual(0.1);
  });

  test("is a no-op without bands", () => {
    expect(clampHexToBands("#abcdef", [])).toBe("#abcdef");
    expect(clampHexToBands("#abcdef", undefined)).toBe("#abcdef");
  });
});

describe("overlay path generation", () => {
  test("produces one polygon per band that has any legal area", () => {
    expect(legalPolygons(210, DARK_SHELL).length).toBe(1);
    expect(legalPolygons(210, SPLIT).length).toBe(2);
  });

  test("blocked path starts with the full square so evenodd cuts holes", () => {
    const d = blockedRegionPath(210, DARK_SHELL);
    expect(d.startsWith("M0,0L100,0L100,100L0,100Z")).toBe(true);
    expect(d.length).toBeGreaterThan(30);
  });

  test("no bands means nothing to cut out", () => {
    expect(legalPolygons(0, [])).toEqual([]);
  });
});
