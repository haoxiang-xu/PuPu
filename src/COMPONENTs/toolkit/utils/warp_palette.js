import {
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  rgbToHex,
} from "../../../BUILTIN_COMPONENTs/color_picker/color_utils";
import { SOURCE_CONFIG } from "../constants";

/* warp_palette — derives AuroraFeatureCard's DisplacementWarp gradient from
   a plugin's own brand color instead of a hardcoded PuPu-indigo palette
   (CEO mandate 2026-07-18: "the featured card should look like the plugin,
   not like PuPu"). Reuses color_picker/color_utils's hex<->RGB<->HSL
   converters (already handle #rgb/#rrggbb and return null on invalid input)
   rather than re-deriving them. */

const DEFAULT_SEED = "#4a5bd8";

const clampPct = (v) => Math.min(100, Math.max(0, v));

const normalizeHue = (h) => ((h % 360) + 360) % 360;

export const isHexColor = (value) => typeof value === "string" && hexToRgb(value) !== null;

export const hexToHsl = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
};

export const hslToHex = (h, s, l) => rgbToHex(hslToRgb(normalizeHue(h), clampPct(s), clampPct(l)));

/* Resolves the seed brand color for a plugin's icon: an explicit icon
   background wins, then the icon's own glyph color, then the plugin
   source's SOURCE_CONFIG color, then PuPu's own indigo. Each candidate is
   validated as a real hex color first — "transparent" backgrounds and
   colorless emoji icons fall straight through to the next link instead of
   producing an invalid warp seed. */
export const seedColorForIcon = (icon, source) => {
  const candidates = [icon?.backgroundColor, icon?.color, SOURCE_CONFIG[source]?.color, DEFAULT_SEED];
  for (const candidate of candidates) {
    if (isHexColor(candidate)) return candidate;
  }
  return DEFAULT_SEED;
};

/* Fallback HSL used only if hexToHsl somehow fails on an already-validated
   seed (defensive — seed is always hex by the time it reaches here). */
const FALLBACK_HSL = { h: 231, s: 55, l: 55 };

/* Builds the 4-stop DisplacementWarp palette from a seed hex color.
 * mode "match" keeps the seed's own hue; mode "invert" rotates it 180°
 * first (CEO's "absolute inverse" alternative — both are supported, see
 * PALETTE_MODE in aurora_feature_card.js for which one is live).
 *
 * Dark stops: [deep shadow, mid shadow, seed (clamped to a legible mid
 * lightness), a +25° accent]. Light stops mirror the same 4-stop shape but
 * lifted to pale tints with moderate saturation — light cards rely on dark
 * ink + the existing veil for contrast, so no stop needs to be light enough
 * to force white text.
 */
export const warpPaletteFromSeed = (seed, { mode = "match", isDark = true } = {}) => {
  const safeSeed = isHexColor(seed) ? seed : DEFAULT_SEED;
  const base = hexToHsl(safeSeed) || FALLBACK_HSL;
  const hue = mode === "invert" ? normalizeHue(base.h + 180) : base.h;
  const accentHue = normalizeHue(hue + 25);
  const s = base.s;

  if (isDark) {
    const seedLightness = Math.min(Math.max(base.l, 45), 60);
    return [
      hslToHex(hue, s * 0.5, 10),
      hslToHex(hue, s * 0.7, 22),
      hslToHex(hue, Math.max(s, 45), seedLightness),
      hslToHex(accentHue, s, 62),
    ];
  }

  return [
    hslToHex(hue, s * 0.35, 93),
    hslToHex(hue, s * 0.45, 84),
    hslToHex(hue, Math.min(s, 55), 68),
    hslToHex(accentHue, s * 0.45, 78),
  ];
};

/* Plain 135° gradient fallback for environments where DisplacementWarp
 * can't render (no WebGL2 — jsdom, some sandboxes): same 5-stop shape the
 * hardcoded STATIC_FALLBACK_DARK/LIGHT constants used, now built from the
 * derived palette instead of literals.
 */
export const staticGradientFromPalette = (colors) =>
  `linear-gradient(135deg, ${colors[0]}, ${colors[1]} 30%, ${colors[2]} 55%, ${colors[3]} 72%, ${colors[0]} 95%)`;

/* Solid featured-card surface from the seed (CEO direction 2026-07-18b:
 * the flowing warp is out — one solid, icon-adjacent color per plugin).
 * Dark theme sinks the seed to a deep muted tone that white copy reads on;
 * light theme lifts it to a pale wash for dark ink. */
export const solidFromSeed = (seed, { isDark = true } = {}) => {
  const base = hexToHsl(seed) || hexToHsl(DEFAULT_SEED);
  if (isDark) return hslToHex(base.h, Math.min(base.s * 0.8, 62), 33);
  return hslToHex(base.h, Math.min(base.s * 0.55, 48), 87);
};
