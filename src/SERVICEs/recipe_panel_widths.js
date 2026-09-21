/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  recipe_panel_widths                                                           */
/*                                                                                */
/*  Remembers how wide the user dragged the two floating panels on the Agents     */
/*  recipe canvas (left recipe list, right detail panel). The original fixed      */
/*  widths (200 / 300) are the minimums; anything narrower or wider than the      */
/*  limits below is clamped on both read and write, so a stale or hand-edited     */
/*  record can never produce an unusable layout.                                  */
/*                                                                                */
/*  Shape: { version: 1, list: <px>, detail: <px> }                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STORAGE_KEY = "recipe_panel_widths";
const PREFS_VERSION = 1;

export const RECIPE_PANEL_LIMITS = Object.freeze({
  list: Object.freeze({ min: 200, max: 480 }),
  detail: Object.freeze({ min: 300, max: 640 }),
});

const PANEL_KEYS = Object.keys(RECIPE_PANEL_LIMITS);

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

/** Clamp a candidate width for `panel` into its limits; null when unusable. */
const normalizeWidth = (panel, width) => {
  const limits = RECIPE_PANEL_LIMITS[panel];
  if (!limits) return null;
  if (typeof width !== "number" || !Number.isFinite(width)) return null;
  return Math.min(limits.max, Math.max(limits.min, Math.round(width)));
};

const defaults = () =>
  Object.fromEntries(PANEL_KEYS.map((k) => [k, RECIPE_PANEL_LIMITS[k].min]));

/** Read both widths. Anything unusable falls back per panel — never throws. */
export const readRecipePanelWidths = () => {
  const result = defaults();
  if (!hasLocalStorage()) return result;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object" || raw.version !== PREFS_VERSION) {
      return result;
    }
    PANEL_KEYS.forEach((panel) => {
      const width = normalizeWidth(panel, raw[panel]);
      if (width !== null) result[panel] = width;
    });
  } catch (_error) {
    // corrupted — treated as defaults
  }
  return result;
};

/** Remember `width` for `panel` ("list" | "detail"); unusable input is a no-op. */
export const writeRecipePanelWidth = (panel, width) => {
  const next = normalizeWidth(panel, width);
  if (next === null || !hasLocalStorage()) return;
  const record = { version: PREFS_VERSION, ...readRecipePanelWidths() };
  record[panel] = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (_error) {
    // quota or privacy mode — the width simply is not remembered
  }
};

export const clearRecipePanelWidths = () => {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // nothing to clear
  }
};
