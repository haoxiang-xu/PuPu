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
export const deriveBlobPalette = (accent, isDark = false) => {
  const base = hexToHsl(accent);
  const lightDir = isDark ? 1 : -1;

  return [
    accent,
    hslToHex(base.h + 18, clamp01(base.s * 0.92), clamp01(base.l + lightDir * 0.1)),
    hslToHex(base.h - 26, clamp01(base.s * 0.85), clamp01(base.l - lightDir * 0.08)),
    hslToHex(base.h + 42, clamp01(base.s * 0.7), clamp01(base.l + lightDir * 0.16)),
  ];
};

/**
 * deriveBlobScene(accent, background, isDark)
 *
 * The blob COLORS come from the accent (deriveBlobPalette). The rest of the
 * shader scene — its back plane and the sky/ground lighting tints — is
 * derived from the theme BACKGROUND so the metaballs sit on the theme's own
 * ground instead of the component's baked-in white/light defaults (which
 * clash with every dark theme). Sky/ground borrow the accent's hue at low
 * saturation so the light reads as the theme's color without tinting the
 * whole plate.
 *
 * Returns { colors, bg, skyTint, groundTint } — all theme-derived, zero
 * hardcoded colors, follows theme switches automatically.
 */
export const deriveBlobScene = (accent, background, isDark = false) => {
  const colors = deriveBlobPalette(accent, isDark);
  const bgHsl = hexToHsl(background);
  const accHsl = hexToHsl(accent);

  // Back plane = the theme background verbatim → seamless with the overlay.
  const bg = background;
  // Sky: accent-hued light, lifted above the background lightness.
  const skyTint = hslToHex(
    accHsl.h,
    0.16,
    clamp01(bgHsl.l + (isDark ? 0.14 : 0.1)),
  );
  // Ground: same family, pushed the other way (darker in dark, warmer-dim in light).
  const groundTint = hslToHex(
    accHsl.h,
    0.1,
    clamp01(isDark ? bgHsl.l + 0.04 : bgHsl.l - 0.28),
  );

  return { colors, bg, skyTint, groundTint };
};

export default deriveBlobPalette;
