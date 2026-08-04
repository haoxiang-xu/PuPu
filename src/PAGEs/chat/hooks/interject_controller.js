/* Pure logic for mid-run "interject" messages (fyi / btw / queue / clarify / new_run).
 * No React here — this module is imported by use_chat_stream.js but must stay
 * independently testable and dependency-free (besides the repo's id helper). */
import { generateId } from "../../../SERVICEs/chat_storage/chat_storage_constants";

const PREFIXES = [
  ["/btw", "btw"],
  ["/fyi", "fyi"],
  ["/queue", "queue"],
];

/**
 * parseInterjectPrefix("/fyi remember the deadline")
 *   -> {channel: "fyi", body: "remember the deadline"}
 * parseInterjectPrefix("just a plain message")
 *   -> {channel: "auto", body: "just a plain message"}
 * parseInterjectPrefix("/btw")            -> {channel: "empty", body: ""}
 * parseInterjectPrefix("   ")             -> {channel: "empty", body: ""}
 */
export const parseInterjectPrefix = (text) => {
  const stripped = typeof text === "string" ? text.trim() : "";
  if (!stripped) {
    return { channel: "empty", body: "" };
  }

  for (const [prefix, channel] of PREFIXES) {
    if (stripped === prefix || stripped.startsWith(`${prefix} `)) {
      const body = stripped.slice(prefix.length).trim();
      return body ? { channel, body } : { channel: "empty", body: "" };
    }
  }

  return { channel: "auto", body: stripped };
};

const MERGE_HEADER =
  "The user sent several follow-up requests while the previous task was " +
  "running. Address all of them, in order:\n";

/**
 * Exact copy of unchain's merge_queued_turn_texts semantics
 * (src/unchain/interaction/queue_turns.py): blank entries are filtered, a
 * single remaining entry is returned verbatim, multiple entries get a
 * numbered list under a fixed header. Returns "" (not null) when nothing
 * remains.
 */
export const mergeQueuedTurnTexts = (texts) => {
  const cleaned = (Array.isArray(texts) ? texts : [])
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter((text) => text.length > 0);

  if (cleaned.length === 0) {
    return "";
  }
  if (cleaned.length === 1) {
    return cleaned[0];
  }

  const numbered = cleaned
    .map((text, index) => `${index + 1}. ${text}`)
    .join("\n");
  return MERGE_HEADER + numbered;
};

/**
 * createQueuedTurnBuffer() — local "do this next" buffer for a single chat's
 * active run. Mirrors unchain's QueuedTurnBuffer but keyed by id so the UI
 * (queue pile) can render + let the user undo individual entries before the
 * run ends.
 */
/* The only disposition a queued item may carry. It records that the user
   explicitly clicked "send as plain text" in the secret gate for THIS item, so
   a later programmatic relay of it does not have to fail closed. Anything else
   normalizes away to "" — an unknown or forged value is treated as "no
   approval", which is the safe direction. */
export const QUEUED_TURN_PLAIN_DISPOSITION = "plain_user_approved";

const normalizeQueuedTurnDisposition = (value) =>
  value === QUEUED_TURN_PLAIN_DISPOSITION ? QUEUED_TURN_PLAIN_DISPOSITION : "";

const normalizeQueuedTurnItems = (value) => {
  const deduplicated = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const text = typeof item?.text === "string" ? item.text : "";
    const status =
      item?.status === "queued" || item?.status === "relayed"
        ? item.status
        : "";
    if (!id || !text.trim() || !status) continue;
    const disposition = normalizeQueuedTurnDisposition(item?.disposition);
    deduplicated.set(id, {
      id,
      text,
      status,
      ...(disposition ? { disposition } : {}),
    });
  }
  return Array.from(deduplicated.values()).slice(0, 64);
};

export const createQueuedTurnBuffer = (initialItems = []) => {
  let items = normalizeQueuedTurnItems(initialItems);

  const snapshot = () => items.map((item) => ({ ...item }));

  return {
    push(text, disposition = "") {
      if (
        typeof text !== "string" ||
        !text.trim() ||
        items.length >= 64
      ) {
        return null;
      }
      const id = generateId("queue");
      const normalizedDisposition = normalizeQueuedTurnDisposition(disposition);
      items = [
        ...items,
        {
          id,
          text,
          status: "queued",
          ...(normalizedDisposition
            ? { disposition: normalizedDisposition }
            : {}),
        },
      ];
      return id;
    },
    remove(id) {
      items = items.filter((item) => item.id !== id);
    },
    list() {
      return snapshot();
    },
    snapshot,
    hydrate(nextItems) {
      items = normalizeQueuedTurnItems(nextItems);
      return snapshot();
    },
    markRelayed(ids = null) {
      const selectedIds = Array.isArray(ids) ? new Set(ids) : null;
      items = items.map((item) =>
        !selectedIds || selectedIds.has(item.id)
          ? { ...item, status: "relayed" }
          : item,
      );
    },
    markQueued(ids) {
      const selectedIds = new Set(Array.isArray(ids) ? ids : []);
      items = items.map((item) =>
        selectedIds.has(item.id) ? { ...item, status: "queued" } : item,
      );
    },
    removeMany(ids) {
      const selectedIds = new Set(Array.isArray(ids) ? ids : []);
      items = items.filter((item) => !selectedIds.has(item.id));
    },
    peekMerged() {
      const queuedItems = items.filter((item) => item.status === "queued");
      return {
        ids: queuedItems.map((item) => item.id),
        text: mergeQueuedTurnTexts(queuedItems.map((item) => item.text)),
        /* The merged relay inherits the approval when ANY contributing item
           carries it. Items that never tripped the scanner contribute nothing
           to a hit, and items that DID trip it can only be in this buffer at
           all if they were approved (ungated legacy items are purged at
           load), so this cannot launder an unapproved credential. */
        disposition: queuedItems.some(
          (item) => item.disposition === QUEUED_TURN_PLAIN_DISPOSITION,
        )
          ? QUEUED_TURN_PLAIN_DISPOSITION
          : "",
      };
    },
    drainMerged() {
      const merged = mergeQueuedTurnTexts(items.map((item) => item.text));
      items = [];
      return merged || null;
    },
    size() {
      return items.length;
    },
  };
};

/**
 * buildInterjectionRecord — shape persisted onto an assistant message's
 * `interjections` array (see chat_storage_sanitize.sanitizeInterjections).
 * `ts` is supplied by the caller (not Date.now()'d internally) so this stays
 * a pure, deterministic function.
 */
export const buildInterjectionRecord = ({ type, text, origin, answer, ts }) => {
  const record = {
    id: generateId("itj"),
    type,
    text,
    origin,
  };
  if (typeof answer === "string") {
    record.answer = answer;
  }
  record.ts = ts;
  return record;
};
