/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  context_window_prefs                                                          */
/*                                                                                */
/*  Per-model context-window memory (#227). When the user picks a window for a    */
/*  local model in the attach panel, that choice becomes the model's starting     */
/*  value everywhere: new chats, and existing chats the moment they switch back   */
/*  to it. Same shape and rules as reasoning_effort_prefs: the per-chat record    */
/*  (chat.model.contextWindow) stays the source of truth for what a conversation  */
/*  actually sends — this store only fills in when a chat has no choice of its    */
/*  own.                                                                          */
/*                                                                                */
/*  Shape: { version: 1, byModel: { "<modelId>": <tokens> } }                      */
/*  Insertion order is recency; the map is capped so it cannot grow once per      */
/*  model ever touched.                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STORAGE_KEY = "context_window_prefs";
const PREFS_VERSION = 1;
const MAX_ENTRIES = 200;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const normalizeModelId = (modelId) =>
  typeof modelId === "string" && modelId.trim() ? modelId.trim() : null;

/** A window is a positive integer number of tokens; anything else is "unset". */
const normalizeWindow = (tokens) =>
  typeof tokens === "number" && Number.isInteger(tokens) && tokens > 0
    ? tokens
    : null;

/** Read the whole map. Anything unusable reads as an empty map — never throws. */
const readAll = () => {
  if (!hasLocalStorage()) return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return {};
    if (raw.version !== PREFS_VERSION) return {};
    const byModel = raw.byModel;
    if (!byModel || typeof byModel !== "object") return {};

    const cleaned = {};
    Object.entries(byModel).forEach(([modelId, tokens]) => {
      const id = normalizeModelId(modelId);
      const window = normalizeWindow(tokens);
      if (id && window) cleaned[id] = window;
    });
    return cleaned;
  } catch (_error) {
    // corrupted — treated as no stored preferences
    return {};
  }
};

const writeAll = (byModel) => {
  if (!hasLocalStorage()) return;
  const entries = Object.entries(byModel);
  const trimmed =
    entries.length > MAX_ENTRIES
      ? Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES))
      : byModel;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PREFS_VERSION, byModel: trimmed }),
    );
  } catch (_error) {
    // quota or privacy mode — the preference simply is not remembered
  }
};

/** The window last chosen for `modelId`, or null when it was never set. */
export const readContextWindowPref = (modelId) => {
  const id = normalizeModelId(modelId);
  if (!id) return null;
  return readAll()[id] ?? null;
};

/**
 * Remember `tokens` for `modelId`. A null (or unusable) value forgets the
 * model instead of storing an empty entry. Re-writing a model moves it to the
 * most-recent end so the cap drops the least recently chosen one.
 */
export const writeContextWindowPref = (modelId, tokens) => {
  const id = normalizeModelId(modelId);
  if (!id) return;
  const byModel = readAll();
  delete byModel[id];
  const window = normalizeWindow(tokens);
  if (window) byModel[id] = window;
  writeAll(byModel);
};

export const clearContextWindowPrefs = () => {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // nothing to clear
  }
};
