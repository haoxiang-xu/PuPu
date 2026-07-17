import { hexToHsl, hslToHex } from "../../BUILTIN_COMPONENTs/theme/color_derive";

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * deriveBlobPalette(accent, isDark)
 *
 * Pure function: derives the 4-color palette ShaderBlobBackground needs
 * from a single theme accent hex. The accent is always first (so the blobs
 * read as "the theme's color"); the other three are hue/lightness-nudged
 * neighbors so the set reads as one color family rather than a random
 * palette, and automatically follows theme switches (light/dark, custom
 * accent, presets) with no hardcoded colors.
 */
const deriveBlobPalette = (accent, isDark = false) => {
  const base = hexToHsl(accent);
  const lightDir = isDark ? 1 : -1;

  return [
    accent,
    hslToHex(base.h + 18, clamp01(base.s * 0.92), clamp01(base.l + lightDir * 0.1)),
    hslToHex(base.h - 26, clamp01(base.s * 0.85), clamp01(base.l - lightDir * 0.08)),
    hslToHex(base.h + 42, clamp01(base.s * 0.7), clamp01(base.l + lightDir * 0.16)),
  ];
};

export default deriveBlobPalette;
