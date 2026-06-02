export const THEME_HIGHLIGHT_COLOR = "#65c466";

const clampAlpha = (alpha) => {
  const next = Number(alpha);
  if (!Number.isFinite(next)) return 1;
  return Math.min(1, Math.max(0, next));
};

const hexToRgb = (color) => {
  const trimmed = String(color || "").trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (shortHex) {
    const [, value] = shortHex;
    return value.split("").map((part) => parseInt(`${part}${part}`, 16));
  }

  const fullHex = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (fullHex) {
    const [, value] = fullHex;
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ];
  }

  return null;
};

export const colorWithAlpha = (color, alpha = 1) => {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clampAlpha(alpha)})`;
};

export const themeHighlightColor = (theme) =>
  theme?.highlightColor || THEME_HIGHLIGHT_COLOR;

export const themeHighlightRgba = (theme, alpha = 1) =>
  colorWithAlpha(themeHighlightColor(theme), alpha);
