import { deriveTier } from "../../BUILTIN_COMPONENTs/theme/color_derive";
import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
} from "../../BUILTIN_COMPONENTs/theme/semantic_tokens";

const DERIVED_TIERS = ["sidebar", "surface"];

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
  const refBase = presetPalette.background || base.background;
  // Only derive sidebar/surface if the background was explicitly customized
  const backgroundWasCustomized = customPalette.background != null;
  if (backgroundWasCustomized) {
    for (const tier of DERIVED_TIERS) {
      if (!customPalette[tier]) {
        const refTier = presetPalette[tier] || base[tier];
        result[tier] = deriveTier(result.background, refBase, refTier);
      }
    }
  }
  return result;
};

export const semanticCssVars = (palette) => {
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
        vars["--pupu-border-strong"] = `rgba(${rgb}, ${BORDER_TIER_ALPHA.strong})`;
        vars["--pupu-border-mid"] = `rgba(${rgb}, ${BORDER_TIER_ALPHA.mid})`;
        vars["--pupu-border-subtle"] = `rgba(${rgb}, ${BORDER_TIER_ALPHA.subtle})`;
      }
    }
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
      /* thumb: control chip on the track → surface tier */
      color: surface,
    }),
    ...(deepTier
      ? {
          code: merge(base.code, { backgroundColor: deepTier }),
          textfield: merge(base.textfield, {
            backgroundColor: withAlpha(surface, 0.95),
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

export const applySemanticCssVars = (palette, element) => {
  const el = element || (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  const vars = semanticCssVars(palette);
  for (const name of Object.keys(vars)) {
    el.style.setProperty(name, vars[name]);
  }
};
