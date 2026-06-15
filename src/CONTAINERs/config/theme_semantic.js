import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
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

const VAR_NAME = {
  accent: "accent",
  background: "background",
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
    if (rgb) vars[`--pupu-${name}-rgb`] = rgb;
  }
  return vars;
};

export const applySemanticCssVars = (palette, element) => {
  const el = element || (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  const vars = semanticCssVars(palette);
  for (const name of Object.keys(vars)) {
    el.style.setProperty(name, vars[name]);
  }
};
