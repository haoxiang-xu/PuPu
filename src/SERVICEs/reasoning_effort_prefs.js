/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  reasoning_effort_prefs                                                        */
/*                                                                                */
/*  Per-model reasoning-effort memory. When the user picks an effort level for a  */
/*  model, that choice becomes that model's default everywhere: new chats, and    */
/*  existing chats the moment they switch back to it.                             */
/*                                                                                */
/*  Scope is deliberately PER MODEL, not per chat. The per-chat record            */
/*  (chat.model.reasoningEffort) stays the source of truth for what a given       */
/*  conversation actually sends — this store only supplies the starting value     */
/*  when a chat has no explicit choice of its own.                                */
/*                                                                                */
/*  Shape: { version: 1, byModel: { "<modelId>": "<level>" } }                     */
/*                                                                                */
/*  Insertion order is the recency order (plain objects preserve it for string    */
/*  keys), so trimming to MAX_ENTRIES drops the least recently written model.     */
/*  Without that cap the map grows once per model the user ever touches — the     */
/*  same unbounded-growth shape that bit the chat library.                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STORAGE_KEY = "reasoning_effort_prefs";
const PREFS_VERSION = 1;
const MAX_ENTRIES = 200;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const normalizeLevel = (level) =>
  typeof level === "string" && level.trim() ? level.trim().toLowerCase() : null;

const normalizeModelId = (modelId) =>
  typeof modelId === "string" && modelId.trim() ? modelId.trim() : null;

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
    Object.entries(byModel).forEach(([modelId, level]) => {
      const id = normalizeModelId(modelId);
      const normalizedLevel = normalizeLevel(level);
      if (id && normalizedLevel) cleaned[id] = normalizedLevel;
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
    entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: PREFS_VERSION,
        byModel: Object.fromEntries(trimmed),
      }),
    );
  } catch (_error) {
    // quota / serialization failure — the in-memory selection still stands
  }
};

/**
 * The effort level this model was last explicitly set to, or null when the user
 * has never chosen one for it (caller then falls back to the model's declared
 * default, which is displayed but not sent).
 */
export const readReasoningEffortPref = (modelId) => {
  const id = normalizeModelId(modelId);
  if (!id) return null;
  return readAll()[id] || null;
};

/**
 * Remember (or, with a null level, forget) this model's effort choice.
 * Re-writing an existing model moves it to the most-recent slot so the
 * MAX_ENTRIES trim evicts genuinely stale models first.
 */
export const writeReasoningEffortPref = (modelId, level) => {
  const id = normalizeModelId(modelId);
  if (!id) return;

  const byModel = readAll();
  delete byModel[id]; // re-insert so this model becomes the most recent
  const normalizedLevel = normalizeLevel(level);
  if (normalizedLevel) byModel[id] = normalizedLevel;
  writeAll(byModel);
};

/** Drop every remembered choice. Used by settings reset. */
export const clearReasoningEffortPrefs = () => {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
};
