import { hexToHsl, hslToHex } from "./color_derive";

/* ━━ Readability windows (taxonomy v2 spec §6) ━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Every limit in the theme editor reduces to ONE shape: the colour's WCAG
   relative luminance must land inside a union of allowed intervals.

   Two primitives generate every window:
     polarity(mode)        — keeps a dark theme dark and a light theme light
     minContrastBands(ref) — carves out the forbidden band around a
                             reference colour's luminance

   Both produce ascending, disjoint interval lists, and intersection of such
   lists is closed and cheap — so windows compose without special cases.

   THRESHOLD DISCIPLINE: every number below is <= the measured factory
   minimum across all 9 presets x 2 modes. Picking a number because it is
   the "standard" one rather than because the shipped palettes clear it is
   how you ship a guard that condemns your own default theme. See the
   comment on HUE_MIN_RATIO for the case where that nearly happened. */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export const relativeLuminance = (hex) => {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  if (!Number.isFinite(n)) return 0;
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

export const contrastRatio = (a, b) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
};

/* ── polarity ───────────────────────────────────────────────────────────
   dark  L <= 0.10  <=>  pure white text reaches 7:1 (WCAG AAA) on it
   light L >= 0.30  <=>  pure black text reaches 7:1 on it

   One rule, stated once, yielding two different numbers only because sRGB
   is non-linear. Measured factory bounds: darkest light-mode shell is
   0.8123 (nord sidebar), lightest dark-mode shell is 0.0717 (nord
   surface) — both far inside. */
export const POLARITY_DARK_MAX_L = 0.1;
export const POLARITY_LIGHT_MIN_L = 0.3;

export const polarityBands = (mode) =>
  mode === "dark_mode" ? [[0, POLARITY_DARK_MAX_L]] : [[POLARITY_LIGHT_MIN_L, 1]];

/* Colours whose contrast against `ref` is at least `ratio`: everything
   darker than the lower root, or lighter than the upper root. */
export const minContrastBands = (refHex, ratio) => {
  const lr = relativeLuminance(refHex);
  const darkEdge = (lr + 0.05) / ratio - 0.05;
  const lightEdge = ratio * (lr + 0.05) - 0.05;
  const bands = [];
  if (darkEdge >= 0) bands.push([0, clamp01(darkEdge)]);
  if (lightEdge <= 1) bands.push([clamp01(lightEdge), 1]);
  return bands;
};

export const intersectBands = (a, b) => {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i += 1;
    else j += 1;
  }
  return out;
};

export const bandsContain = (bands, l) =>
  bands.some(([lo, hi]) => l >= lo - 1e-9 && l <= hi + 1e-9);

/* Nearest legal luminance, plus which way "further inside the band" points.
   The direction matters because 8-bit rounding can drop the clamped colour
   a hair back outside the edge it was just snapped to, and nudging the
   wrong way walks it further out. */
export const projectLuminanceEdge = (l, bands) => {
  if (!bands.length) return { value: l, inward: 0 };
  if (bandsContain(bands, l)) return { value: l, inward: 0 };
  let best = bands[0][0];
  let inward = 1;
  let bestDist = Infinity;
  for (const [lo, hi] of bands) {
    /* landing on a band START means the legal side is upward, on a band
       END it is downward */
    for (const [edge, dir] of [
      [lo, 1],
      [hi, -1],
    ]) {
      const d = Math.abs(edge - l);
      if (d < bestDist) {
        bestDist = d;
        best = edge;
        inward = dir;
      }
    }
  }
  return { value: best, inward };
};

export const projectLuminance = (l, bands) => projectLuminanceEdge(l, bands).value;

/* ── role windows ───────────────────────────────────────────────────── */

export const SHELL_ROLES = ["background", "sidebar", "surface"];
export const HUE_ROLES = ["accent", "success", "warning", "danger", "info"];

export const TEXT_MIN_RATIO = 4.5; /* WCAG 1.4.3 AA body text; factory min 7.485 */
export const MUTED_MIN_RATIO = 3.0; /* factory min 3.084 — see below */

/* NOT WCAG 1.4.11's 3:1, deliberately.

   Measured: shipped `success` sits at 2.19–2.28:1 in seven light presets,
   and default light `accent` at 2.178:1. A 3:1 floor would make PuPu's own
   default theme illegal in its own picker. 1.9 is below the measured floor
   of 2.109 (nord dark danger on surface) with room to spare.

   So this guard blocks a status colour VANISHING into the shell. It is not
   a compliance gate and must not be described as one. */
export const HUE_MIN_RATIO = 1.9;

/* Reference set per role = the surfaces that role actually renders on.
   Muted text appears in the sidebar, so the sidebar counts against it
   (which is why its factory floor is 3.084 and not the rosier 3.363 you
   get from measuring background alone). Status colours essentially never
   render on the sidebar chrome, so including it there would only drag the
   floor down to 1.998 while buying no protection. */
export const roleWindow = (role, mode, palette) => {
  if (!palette) return [];

  if (SHELL_ROLES.includes(role)) {
    let bands = polarityBands(mode);
    bands = intersectBands(bands, minContrastBands(palette.text, TEXT_MIN_RATIO));
    bands = intersectBands(
      bands,
      minContrastBands(palette.textMuted, MUTED_MIN_RATIO),
    );
    return bands;
  }

  if (role === "text" || role === "textMuted") {
    const ratio = role === "text" ? TEXT_MIN_RATIO : MUTED_MIN_RATIO;
    let bands = [[0, 1]];
    for (const shell of SHELL_ROLES) {
      bands = intersectBands(bands, minContrastBands(palette[shell], ratio));
    }
    return bands;
  }

  if (HUE_ROLES.includes(role)) {
    let bands = [[0, 1]];
    for (const shell of ["background", "surface"]) {
      bands = intersectBands(
        bands,
        minContrastBands(palette[shell], HUE_MIN_RATIO),
      );
    }
    return bands;
  }

  return []; /* unconstrained (alpha steps carry no window of their own) */
};

/* ── clamping ───────────────────────────────────────────────────────────
   Preserves hue and saturation, moves lightness only: the hue/chroma is
   what the user meant, the lightness is what breaks readability.

   Returns the input UNCHANGED (byte-identical) when it is already legal,
   which is what makes the factory-identity property exact rather than
   approximate. */
export const clampToWindow = (hex, bands) => {
  if (!bands || !bands.length) return hex;
  const current = relativeLuminance(hex);
  if (bandsContain(bands, current)) return hex;

  const { value: target, inward } = projectLuminanceEdge(current, bands);
  const { h, s } = hexToHsl(hex);

  /* Relative luminance is monotone in HSL lightness for fixed h/s, so
     bisect. 24 iterations puts us well inside 8-bit quantisation. */
  let lo = 0;
  let hi = 1;
  let out = hex;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    out = hslToHex(h, s, mid);
    if (relativeLuminance(out) < target) lo = mid;
    else hi = mid;
  }

  /* Rounding to 8 bits can land a hair outside the band; nudge until it is
     inside. Bounded, and the direction is known. */
  let guard = 0;
  let l = (lo + hi) / 2;
  while (!bandsContain(bands, relativeLuminance(out)) && guard < 64) {
    l = clamp01(l + inward * (1 / 255));
    out = hslToHex(h, s, l);
    guard += 1;
  }
  return out;
};
