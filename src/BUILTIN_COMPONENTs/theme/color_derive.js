const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const parseHex = (hex) => {
  const s = String(hex || "").trim();
  const short = /^#([0-9a-f]{3})$/i.exec(s);
  if (short) {
    const v = short[1];
    return [
      parseInt(v[0] + v[0], 16),
      parseInt(v[1] + v[1], 16),
      parseInt(v[2] + v[2], 16),
    ];
  }
  const full = /^#([0-9a-f]{6})$/i.exec(s);
  if (full) {
    const v = full[1];
    return [
      parseInt(v.slice(0, 2), 16),
      parseInt(v.slice(2, 4), 16),
      parseInt(v.slice(4, 6), 16),
    ];
  }
  return [0, 0, 0];
};

export const hexToHsl = (hex) => {
  const [r8, g8, b8] = parseHex(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
};

export const hslToHex = (h, s, l) => {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const deriveTier = (baseHex, refBaseHex, refTierHex, opts = {}) => {
  const minStep = opts.minStep == null ? 0.04 : opts.minStep;
  const base = hexToHsl(baseHex);
  const offset = hexToHsl(refTierHex).l - hexToHsl(refBaseHex).l;
  let l = clamp(base.l + offset, 0, 1);
  if (offset !== 0 && Math.abs(l - base.l) < minStep) {
    const dir = offset > 0 ? 1 : -1;
    l = clamp(base.l + dir * minStep, 0, 1);
  }
  return hslToHex(base.h, base.s, l);
};
