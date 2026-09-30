/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  recipe_panel_widths                                                           */
/*                                                                                */
/*  Remembers how wide the user dragged the two floating panels on the Agents     */
/*  recipe canvas (left recipe list, right detail panel). The original fixed      */
/*  widths (200 / 300) are the minimums; anything narrower or wider than the      */
/*  limits below is clamped on both read and write, so a stale or hand-edited     */
/*  record can never produce an unusable layout.                                  */
/*                                                                                */
/*  A panel's ceiling is a share of the space it sits in, not a fixed width:     */
/*  the list may take 35% of it and the detail panel 50% (project owner,          */
/*  2026-09-26), so the same recipe is workable in a small window and on a        */
/*  large screen. The minimum stays absolute — below it the panel is unusable     */
/*  whatever the window size — and wins when the share falls under it.            */
/*                                                                                */
/*  Shape: { version: 1, list: <px>, detail: <px> }                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STORAGE_KEY = "recipe_panel_widths";
const PREFS_VERSION = 1;

export const RECIPE_PANEL_LIMITS = Object.freeze({
  list: Object.freeze({ min: 200, maxRatio: 0.35 }),
  detail: Object.freeze({ min: 300, maxRatio: 0.5 }),
});

const PANEL_KEYS = Object.keys(RECIPE_PANEL_LIMITS);

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

/**
 * The widest `panel` may get inside a container of `containerWidth`. An
 * unmeasured container (0, NaN, absent) yields the minimum rather than a
 * guess, so a panel never renders wider than the space it was measured in.
 */
export const panelMaxWidth = (panel, containerWidth) => {
  const limits = RECIPE_PANEL_LIMITS[panel];
  if (!limits) return null;
  if (typeof containerWidth !== "number" || !Number.isFinite(containerWidth)) {
    return limits.min;
  }
  return Math.max(limits.min, Math.round(containerWidth * limits.maxRatio));
};

/** Hold a width inside `panel`'s minimum and its share of the container. */
export const clampPanelWidth = (panel, width, containerWidth) => {
  const limits = RECIPE_PANEL_LIMITS[panel];
  if (!limits) return null;
  if (typeof width !== "number" || !Number.isFinite(width)) return null;
  return Math.min(
    panelMaxWidth(panel, containerWidth),
    Math.max(limits.min, Math.round(width)),
  );
};

/**
 * Clamp a candidate width for storage; null when unusable. Without a container
 * to measure against only the minimum applies — the share is enforced when the
 * value is read back for a container of a known width.
 */
const normalizeWidth = (panel, width) => {
  const limits = RECIPE_PANEL_LIMITS[panel];
  if (!limits) return null;
  if (typeof width !== "number" || !Number.isFinite(width)) return null;
  return Math.max(limits.min, Math.round(width));
};

const defaults = () =>
  Object.fromEntries(PANEL_KEYS.map((k) => [k, RECIPE_PANEL_LIMITS[k].min]));

/**
 * Read both widths, clamped to `containerWidth` when one is given: a window
 * that shrank since the widths were stored must not hand back a panel wider
 * than its share of what is now available.
 *
 * Anything unusable falls back per panel — never throws.
 */
export const readRecipePanelWidths = (containerWidth) => {
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
    if (containerWidth !== undefined) {
      PANEL_KEYS.forEach((panel) => {
        result[panel] = clampPanelWidth(panel, result[panel], containerWidth);
      });
    }
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
