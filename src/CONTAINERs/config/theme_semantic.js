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

const withAlpha = (color, alpha) => {
  const rgb = hexToRgbTriplet(color);
  return rgb ? `rgba(${rgb}, ${alpha})` : color;
};

const merge = (base, overrides) => ({
  ...(base || {}),
  ...overrides,
});

export const applySemanticPaletteToTheme = (base, semantic) => {
  if (!base || !semantic) return base;

  const {
    accent,
    background,
    surface,
    text,
    textMuted,
    border,
    success,
    danger,
  } = semantic;

  return {
    ...base,
    semantic,
    highlightColor: accent,
    color: text,
    backgroundColor: background,
    foregroundColor: surface,
    icon: merge(base.icon, { color: text }),
    font: merge(base.font, { color: text }),
    spinner: merge(base.spinner, {
      arcColor: accent,
    }),
    switch: merge(base.switch, {
      backgroundColor_on: accent,
    }),
    slider: merge(base.slider, {
      activeColor: withAlpha(text, 0.55),
      inactiveColor: withAlpha(border, 0.8),
      labelColor: text,
    }),
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
      option: merge(base.select?.option, {
        hoverBackgroundColor: withAlpha(accent, 0.1),
        selectedBackgroundColor: withAlpha(accent, 0.16),
        disabledColor: withAlpha(textMuted, 0.7),
      }),
      search: merge(base.select?.search, {
        backgroundColor: withAlpha(border, 0.35),
      }),
      group: merge(base.select?.group, {
        headerColor: textMuted,
        headerHoverBackgroundColor: withAlpha(accent, 0.08),
        accentBarColor: withAlpha(accent, 0.24),
        separatorColor: withAlpha(border, 0.8),
      }),
    }),
    code: merge(base.code, {
      backgroundColor: surface,
      header: merge(base.code?.header, {
        color: textMuted,
      }),
    }),
    textfield: merge(base.textfield, {
      backgroundColor: withAlpha(surface, 0.95),
      border: `1px solid ${withAlpha(border, 0.9)}`,
      contentSectionColor: withAlpha(textMuted, 0.8),
      contentSectionActiveColor: withAlpha(text, 0.7),
    }),
    button: merge(base.button, {
      root: merge(base.button?.root, {
        color: text,
      }),
      background: merge(base.button?.background, {
        hoverBackgroundColor: withAlpha(accent, 0.1),
        activeBackgroundColor: withAlpha(accent, 0.16),
      }),
    }),
    tooltip: merge(base.tooltip, {
      color: background,
      backgroundColor: withAlpha(text, 0.92),
    }),
    markdown: merge(base.markdown, {
      color: text,
      blockquote: merge(base.markdown?.blockquote, {
        borderColor: border,
        color: textMuted,
      }),
      link: merge(base.markdown?.link, {
        color: accent,
      }),
      hr: merge(base.markdown?.hr, {
        borderColor: border,
      }),
      table: merge(base.markdown?.table, {
        borderColor: border,
        headerBackground: surface,
      }),
    }),
    modal: merge(base.modal, {
      backgroundColor: surface,
      border: `1px solid ${withAlpha(border, 0.9)}`,
      bodyColor: textMuted,
      closeButtonColor: withAlpha(textMuted, 0.9),
      closeButtonHoverColor: text,
      primaryButtonBg: accent,
      secondaryButtonBg: withAlpha(border, 0.55),
      secondaryButtonColor: text,
      errorAccent: danger,
      successAccent: success,
    }),
    flow_editor: merge(base.flow_editor, {
      canvasBackground: background,
      nodeBackground: surface,
      nodeBorder: withAlpha(border, 0.9),
    }),
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
