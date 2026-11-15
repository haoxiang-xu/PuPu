/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  model_chip_pins                                                               */
/*                                                                                */
/*  Which model chips the user pinned on the new-chat page. Pinned chips sit at   */
/*  the front of the chip row in pin order and are never rotated away.            */
/*                                                                                */
/*  Shape: { version: 1, pinned: ["<modelId>", ...] }  (oldest pin first)          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STORAGE_KEY = "new_chat_model_chip_pins";
const PINS_VERSION = 1;
const MAX_PINS = 64;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const normalize = (ids) => {
  const seen = new Set();
  const out = [];
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    if (typeof id !== "string") return;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out.slice(-MAX_PINS);
};

/** Pinned model ids, oldest pin first. Never throws. */
export const readPinnedModelChips = () => {
  if (!hasLocalStorage()) return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || raw.version !== PINS_VERSION) return [];
    return normalize(raw.pinned);
  } catch (_error) {
    return [];
  }
};

const writePinnedModelChips = (ids) => {
  const pinned = normalize(ids);
  if (!hasLocalStorage()) return pinned;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: PINS_VERSION, pinned }),
    );
  } catch (_error) {
    // quota / private mode: the pin still applies for this session
  }
  return pinned;
};

/** Pin or unpin `modelId`; returns the new pinned list. A new pin goes last. */
export const togglePinnedModelChip = (modelId) => {
  const current = readPinnedModelChips();
  const next = current.includes(modelId)
    ? current.filter((id) => id !== modelId)
    : [...current, modelId];
  return writePinnedModelChips(next);
};

export const MODEL_CHIP_PINS_STORAGE_KEY = STORAGE_KEY;
