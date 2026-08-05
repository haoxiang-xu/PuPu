import { hsvToRgb, hexToRgb, rgbToHsv, hsvToHex } from "./color_utils";

/* ━━ Constraint geometry for the SV plane ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Pure geometry. This module knows NOTHING about themes, tokens or roles —
   it is handed a list of allowed WCAG-luminance intervals ("bands") and
   works out where they live on the saturation/value square.

   Key property that makes all of this cheap: for a fixed hue and
   saturation, relative luminance is strictly monotone in V. So each column
   of the SV square maps a band to exactly one contiguous V interval, found
   by bisection, and the boundary between legal and illegal is a curve we
   can sample column by column. */

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export const luminanceOfHsv = (h, s, v) => {
  const { r, g, b } = hsvToRgb(h, s, v);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/* V in [0,100] whose luminance is closest to targetL, for fixed h/s. */
export const solveV = (h, s, targetL) => {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (luminanceOfHsv(h, s, mid) < targetL) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/* Is this exact HSV triple legal AFTER 8-bit quantisation? hsvToRgb rounds
   to integer channels, so luminance is a step function of V, not a
   continuous one. Every legality decision has to be made on the quantised
   value or the wall drifts by up to one step from where it is drawn. */
export const isLegalHsv = (h, s, v, bands) => {
  if (!bands || !bands.length) return true;
  const l = luminanceOfHsv(h, s, v);
  return bands.some(([lo, hi]) => l >= lo && l <= hi);
};

/* Legal V intervals for one column, clipped to [0,100]. Empty when this
   saturation cannot reach any allowed luminance at this hue.

   Edges are pulled INWARD until the quantised colour actually satisfies
   the band, so the drawn boundary never promises a pixel the snapper would
   reject. */
export const legalVIntervals = (h, s, bands) => {
  if (!bands || !bands.length) return [[0, 100]];
  const lowest = luminanceOfHsv(h, s, 0);
  const highest = luminanceOfHsv(h, s, 100);
  const out = [];
  for (const [lo, hi] of bands) {
    if (hi < lowest || lo > highest) continue;
    let vLo = lo <= lowest ? 0 : solveV(h, s, lo);
    let vHi = hi >= highest ? 100 : solveV(h, s, hi);
    for (let k = 0; k < 8 && vLo < vHi && luminanceOfHsv(h, s, vLo) < lo; k += 1) {
      vLo = Math.min(vHi, vLo + 0.5);
    }
    for (let k = 0; k < 8 && vHi > vLo && luminanceOfHsv(h, s, vHi) > hi; k += 1) {
      vHi = Math.max(vLo, vHi - 0.5);
    }
    if (vHi > vLo) out.push([vLo, vHi]);
  }
  return out;
};

const nearestInIntervals = (value, intervals) => {
  let best = null;
  let bestDist = Infinity;
  for (const [lo, hi] of intervals) {
    const clamped = Math.min(hi, Math.max(lo, value));
    const d = Math.abs(clamped - value);
    if (d < bestDist) {
      bestDist = d;
      best = clamped;
    }
  }
  return { value: best, dist: bestDist };
};

/* Snap a pointer position to the nearest legal point.

   Vertical first, on purpose: hue and saturation are what the user is
   expressing, lightness is the part that breaks readability. Correcting V
   alone reads as the thumb sliding along a wall rather than being yanked
   somewhere else. Only when a column has no legal V at all do we walk
   sideways — and the s=0 greyscale column always has a solution whenever
   the bands are non-empty, so the search terminates. */
/* Nearest legal INTEGER v in this column, or null. The picker stores
   integer h/s/v, so returning a fractional "legal" value that then gets
   rounded back out of the band would reopen the very hole this closes. */
const nearestLegalIntV = (h, s, v, bands, intervals) => {
  const ideal = intervals.length ? nearestInIntervals(v, intervals).value : v;
  const start = Math.round(ideal);
  for (let d = 0; d <= 4; d += 1) {
    for (const cand of d === 0 ? [start] : [start - d, start + d]) {
      if (cand < 0 || cand > 100) continue;
      if (isLegalHsv(h, s, cand, bands)) return cand;
    }
  }
  /* fall back to a full sweep of the column before giving up on it */
  let best = null;
  let bestDist = Infinity;
  for (let cand = 0; cand <= 100; cand += 1) {
    if (!isLegalHsv(h, s, cand, bands)) continue;
    const dist = Math.abs(cand - v);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
};

export const snapSV = (h, s, v, bands) => {
  if (!bands || !bands.length) return { s, v };

  const si = Math.round(s);
  const here = nearestLegalIntV(h, si, v, bands, legalVIntervals(h, si, bands));
  if (here != null) return { s: si, v: here };

  for (let step = 1; step <= 100; step += 1) {
    for (const candidate of [si - step, si + step]) {
      if (candidate < 0 || candidate > 100) continue;
      const vv = nearestLegalIntV(
        h,
        candidate,
        v,
        bands,
        legalVIntervals(h, candidate, bands),
      );
      if (vv != null) return { s: candidate, v: vv };
    }
  }
  return { s, v };
};

/* Sampled legal polygons in a 0..100 x 0..100 viewBox where y grows
   downward (y = 100 - v), ready to drop into an SVG path.

   Rendered with fill-rule evenodd against a full-square outer path, these
   punch the legal areas out of the scrim — which handles any number of
   bands without per-case logic. */
export const legalPolygons = (h, bands, samples = 33) => {
  if (!bands || !bands.length) return [];
  const columns = [];
  for (let i = 0; i < samples; i += 1) {
    const s = (i / (samples - 1)) * 100;
    columns.push({ s, intervals: legalVIntervals(h, s, bands) });
  }

  const polys = [];
  for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
    const top = [];
    const bottom = [];
    for (const col of columns) {
      const iv = col.intervals[bandIndex];
      if (!iv) continue;
      top.push([col.s, 100 - iv[1]]);
      bottom.push([col.s, 100 - iv[0]]);
    }
    if (top.length < 2) continue;
    polys.push([...top, ...bottom.reverse()]);
  }
  return polys;
};

export const polygonsToPath = (polys) =>
  polys
    .map(
      (pts) =>
        `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`,
    )
    .join(" ");

/* Outer square + legal cut-outs, evenodd → the illegal region only. */
export const blockedRegionPath = (h, bands, samples = 33) => {
  const polys = legalPolygons(h, bands, samples);
  return `M0,0L100,0L100,100L0,100Z ${polygonsToPath(polys)}`.trim();
};

/* Hex in, legal hex out — hue and saturation preserved, V corrected.
   Returns the input unchanged when it is already legal, so a legal value
   round-trips byte-identically through typing, eyedropper and import. */
export const clampHexToBands = (hex, bands) => {
  if (!bands || !bands.length) return hex;
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s, v } = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const intervals = legalVIntervals(h, s, bands);
  if (intervals.some(([lo, hi]) => v >= lo - 0.5 && v <= hi + 0.5)) return hex;
  const snapped = snapSV(h, s, v, bands);
  return hsvToHex(h, snapped.s, snapped.v);
};
