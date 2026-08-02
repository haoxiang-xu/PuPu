import { deriveTier } from "../../BUILTIN_COMPONENTs/theme/color_derive";
import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
  SEMANTIC_FAMILIES,
} from "../../BUILTIN_COMPONENTs/theme/semantic_tokens";

export const hexToRgbTriplet = (color) => {
  const trimmed = String(color || "").trim();
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    const [, v] = short;
    const r = parseInt(`${v[0]}${v[0]}`, 16);
    const g = parseInt(`${v[1]}${v[1]}`, 16);
    const b = parseInt(`${v[2]}${v[2]}`, 16);
    return `${r},${g},${b}`;
  }
  const full = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (full) {
    const [, v] = full;
    return [
      parseInt(v.slice(0, 2), 16),
      parseInt(v.slice(2, 4), 16),
      parseInt(v.slice(4, 6), 16),
    ].join(",");
  }
  return null;
};

/* three-tier border strength (CEO design ruling, follow-up to phases 3/4):
   single `border` semantic token stays — these are derived strength vars
   layered on top for different sink families. */
export const BORDER_TIER_ALPHA = { strong: 0.9, mid: 0.55, subtle: 0.3 };

/* JSON details channel (CEO-approved): fine-grained knobs the theme editor UI
   does not render, carried only through JSON import/export + presets.
   Precedence per mode-key: user details > preset details > this default. */
export const DETAIL_DEFAULTS = {
  chipBorder: "transparent",
  menuBorder: "transparent",
  cardBorder: "transparent",
  borderAlphaStrong: BORDER_TIER_ALPHA.strong,
  borderAlphaMid: BORDER_TIER_ALPHA.mid,
  borderAlphaSubtle: BORDER_TIER_ALPHA.subtle,
};

export const resolveThemeDetails = (mode, options = {}) => {
  const { preset, details } = options;
  const presetDetails =
    (preset &&
      SEMANTIC_PRESETS[preset] &&
      SEMANTIC_PRESETS[preset].details &&
      SEMANTIC_PRESETS[preset].details[mode]) ||
    {};
  const userDetails = (details && details[mode]) || {};
  return { ...DETAIL_DEFAULTS, ...presetDetails, ...userDetails };
};

const VAR_NAME = {
  accent: "accent",
  background: "background",
  sidebar: "sidebar",
  surface: "surface",
  text: "text",
  textMuted: "text-muted",
  border: "border",
  success: "success",
  danger: "danger",
};

export const resolveSemanticPalette = (mode, options = {}) => {
  const { preset, custom } = options;
  const base = SEMANTIC_DEFAULTS[mode] || SEMANTIC_DEFAULTS.light_mode;
  const presetPalette =
    (preset && SEMANTIC_PRESETS[preset] && SEMANTIC_PRESETS[preset][mode]) || {};
  const customPalette = (custom && custom[mode]) || {};
  const result = {};
  for (const key of SEMANTIC_TOKEN_KEYS) {
    result[key] = customPalette[key] || presetPalette[key] || base[key];
  }
  for (const [root, family] of Object.entries(SEMANTIC_FAMILIES)) {
    /* Only derive a family's tiers when its own root was explicitly
       customized (per-family gate — no cross-family bleed). */
    if (customPalette[root] == null) continue;
    const refRoot = presetPalette[root] || base[root];
    for (const tier of family.children) {
      if (!customPalette[tier]) {
        const refTier = presetPalette[tier] || base[tier];
        result[tier] = deriveTier(result[root], refRoot, refTier);
      }
    }
  }
  return result;
};

export const semanticCssVars = (palette, detailsResolved) => {
  const vars = {};
  for (const key of Object.keys(palette || {})) {
    const name = VAR_NAME[key];
    if (!name) continue;
    const value = palette[key];
    vars[`--pupu-${name}`] = value;
    const rgb = hexToRgbTriplet(value);
    if (rgb) {
      vars[`--pupu-${name}-rgb`] = rgb;
      if (key === "border") {
        const strongAlpha = detailsResolved
          ? (detailsResolved.borderAlphaStrong ?? BORDER_TIER_ALPHA.strong)
          : BORDER_TIER_ALPHA.strong;
        const midAlpha = detailsResolved
          ? (detailsResolved.borderAlphaMid ?? BORDER_TIER_ALPHA.mid)
          : BORDER_TIER_ALPHA.mid;
        const subtleAlpha = detailsResolved
          ? (detailsResolved.borderAlphaSubtle ?? BORDER_TIER_ALPHA.subtle)
          : BORDER_TIER_ALPHA.subtle;
        vars["--pupu-border-strong"] = `rgba(${rgb}, ${strongAlpha})`;
        vars["--pupu-border-mid"] = `rgba(${rgb}, ${midAlpha})`;
        vars["--pupu-border-subtle"] = `rgba(${rgb}, ${subtleAlpha})`;
      }
    }
  }
  if (detailsResolved) {
    vars["--pupu-chip-border"] = detailsResolved.chipBorder ?? DETAIL_DEFAULTS.chipBorder;
    vars["--pupu-menu-border"] = detailsResolved.menuBorder ?? DETAIL_DEFAULTS.menuBorder;
    vars["--pupu-card-border"] = detailsResolved.cardBorder ?? DETAIL_DEFAULTS.cardBorder;
  }
  return vars;
};

const withAlpha = (color, alpha) => {
  const rgb = hexToRgbTriplet(color);
  return rgb ? `rgba(${rgb}, ${alpha})` : color;
};

const merge = (base, overrides) => ({
  ...(base || {}),
  ...overrides,
});

export const applySemanticPaletteToTheme = (base, semantic, mode) => {
  if (!base || !semantic) return base;

  const {
    accent,
    background,
    sidebar,
    surface,
    text,
    textMuted,
    border,
    success,
    danger,
  } = semantic;

  const deepTier =
    mode === "light_mode" ? sidebar : mode === "dark_mode" ? surface : null;

  return {
    ...base,
    semantic,
    highlightColor: accent,
    color: text,
    backgroundColor: background,
    foregroundColor: surface,
    icon: merge(base.icon, { color: text }),
    font: merge(base.font, { color: text }),
    input: merge(base.input, {
      backgroundColor: withAlpha(surface, 0.9),
      outline: merge(base.input?.outline, {
        onFocus: `2px solid ${accent}`,
      }),
    }),
    select: merge(base.select, {
      color: text,
      backgroundColor: withAlpha(surface, 0.9),
      placeholderColor: withAlpha(textMuted, 0.85),
      outline: merge(base.select?.outline, {
        onFocus: `2px solid ${accent}`,
      }),
      dropdown: merge(base.select?.dropdown, {
        backgroundColor: surface,
      }),
    }),
    modal: merge(base.modal, {
      backgroundColor: background,
      border: `1px solid ${withAlpha(border, BORDER_TIER_ALPHA.strong)}`,
      bodyColor: textMuted,
      closeButtonColor: withAlpha(textMuted, 0.9),
      closeButtonHoverColor: text,
      errorAccent: danger,
      successAccent: success,
    }),
    switch: merge(base.switch, {
      backgroundColor_on: accent,
      /* off track: 20% text over whatever it sits on — reproduces the old
         fixed grays (#ccc light / ~#494949 dark) on the default palette,
         but keeps contrast with background AND the surface thumb on any
         custom palette (the base JSON grays didn't follow the theme) */
      backgroundColor: withAlpha(text, 0.2),
      /* thumb: control chip on the track → surface tier */
      color: surface,
    }),
    ...(deepTier
      ? {
          code: merge(base.code, { backgroundColor: deepTier }),
          textfield: merge(base.textfield, {
            backgroundColor: withAlpha(surface, 0.95),
            /* one border source for input surfaces: the base JSON's
               hardcoded textfield border would otherwise shadow the
               mid-tier var that the attach panel and context menus use */
            border: "1px solid var(--pupu-border-mid)",
          }),
          markdown: {
            ...(base.markdown || {}),
            pre: merge(base.markdown?.pre, { backgroundColor: deepTier }),
            table: merge(base.markdown?.table, { headerBackground: deepTier }),
          },
        }
      : {}),
  };
};

export const applySemanticCssVars = (palette, element, detailsResolved) => {
  const el = element || (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  const vars = semanticCssVars(palette, detailsResolved);
  for (const name of Object.keys(vars)) {
    el.style.setProperty(name, vars[name]);
  }
};

/* ── Boot palette cache (boot-loading-gate design) ─────────────────────
   The static S1 shell in public/index.html cannot resolve a preset/custom
   theme (no bundle, no BUILTIN_COMPONENTs/theme data) — it can only read a
   plain-JSON cache of the already-resolved key colors. This is that write
   side: called wherever a fresh semantic palette gets committed (container
   boot IIFE, container theme effect, theme editor commit), never from a
   transient preview path. The static shell's inline script is the read
   side and has no knowledge of preset/custom resolution — it only trusts
   this cache or falls back to its own hardcoded dark default. */
export const BOOT_PALETTE_STORAGE_KEY = "pupu_boot_palette";

export const persistBootPalette = (palette) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!palette || typeof palette !== "object") return;
  const { background, text, textMuted, accent } = palette;
  if (!background || !text || !accent) return;
  try {
    window.localStorage.setItem(
      BOOT_PALETTE_STORAGE_KEY,
      JSON.stringify({ background, text, textMuted: textMuted || text, accent }),
    );
  } catch (_e) {
    // Storage full/unavailable — the static shell just falls back to its
    // hardcoded default on next boot. Non-critical.
  }
};
