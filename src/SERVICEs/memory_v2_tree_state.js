/*
 * Memory V2 tree state — the JUDGMENT half of the Inspector's tree view.
 *
 * The tree view renders four mutually exclusive things: a tree, "V2 is not
 * enabled", "V2 is enabled but this chat has nothing stored", and "the request
 * failed". Deciding WHICH of those is true is not a rendering concern, and a
 * component that decides it by pattern-matching error strings inline is a
 * component that will drift. So the decision lives here and the component is a
 * dumb `switch` over a frozen enum — same split as boot_readiness.js, for the
 * same reason.
 *
 * WHY THE ORDER OF THE PROBES IS THE WHOLE POINT
 *
 * `get_tree` alone cannot tell "V2 is off" from "this owner never had a space"
 * — both come back as an absence. That ambiguity is a known backend gap
 * (case 0000-0008-2026-0808) and is not fixable from the renderer. What IS
 * fixable is not asking `get_tree` the question in the first place:
 *
 *   1. no ownerChatId          → DISABLED(no_owner)    — nothing to scope to
 *   2. no preload bridge       → DISABLED(no_bridge)   — web dev / no Electron
 *   3. getStatus() says off    → DISABLED(sidecar_unavailable | rollout_off)
 *   4. listSpaces() throws off → DISABLED(store_disabled)
 *   5. listSpaces() → []       → EMPTY   ← provable: step 3 already passed
 *   6. getTree() → 0 entries   → EMPTY   ← provable: same
 *
 * Because steps 1-4 have already ruled "enabled" in before step 5 runs, an
 * absence at step 5/6 can only mean "enabled and empty". The ambiguity never
 * reaches the UI. `getStatus` is count-free and cheap, so this costs one extra
 * round trip and buys a distinction the user would otherwise have to guess.
 *
 * `context_v2_store_disabled` is the sidecar's one authoritative "storage is
 * off while durable state still exists" code. It had zero consumers before
 * this module; it is consumed at steps 4-6 wherever a call can raise it.
 *
 * BOUNDED RENDERING. `getTree` and `listEntries` have no pagination, and on a
 * large space the payload is whatever the store holds. This module therefore
 * also owns the render cap: flattenMemoryV2Tree() walks iteratively (no
 * recursion to blow the stack), refuses to revisit a node (no cycle can hang
 * it) and hands back at most MEMORY_V2_TREE_MAX_VISIBLE_ROWS rows plus an
 * honest count of what it withheld. The component cannot opt out of the cap
 * because it never sees the raw tree.
 */

import contextV2Bridge, {
  parseContextV2ErrorCode,
} from "./bridges/context_v2_bridge";

/* The closed set of things the tree view can be showing. Frozen at the
   producer, consumed verbatim — a consumer that re-spells these strings is a
   consumer that will silently stop matching. */
export const MEMORY_V2_TREE_STATES = Object.freeze({
  LOADING: "loading",
  DISABLED: "disabled",
  EMPTY: "empty",
  READY: "ready",
  ERROR: "error",
  /* Explicit catch-all. A payload we do not recognise is NOT empty and is NOT
     a failure — claiming either would be a lie about the user's memory. It
     gets its own class so the difference stays visible instead of being
     rounded into whichever neighbour is closest. */
  UNKNOWN: "unknown",
});

/* Why V2 is unavailable. Presentational only — every one of these renders as
   "not enabled", but the reason is what makes a bug report actionable. */
export const MEMORY_V2_TREE_DISABLED_REASONS = Object.freeze({
  NO_OWNER: "no_owner",
  NO_BRIDGE: "no_bridge",
  SIDECAR_UNAVAILABLE: "sidecar_unavailable",
  ROLLOUT_OFF: "rollout_off",
  STORE_DISABLED: "store_disabled",
});

/* Rows rendered at once. Deliberately smaller than any plausible store: the
   cap exists to keep the modal responsive, not to be generous. */
export const MEMORY_V2_TREE_MAX_VISIBLE_ROWS = 400;

/* Hard ceiling on nodes visited during a flatten, independent of the row cap.
   Guards the walk itself against a payload far larger than we expect. */
const MAX_WALKED_NODES = 20000;

const STORE_DISABLED_CODE = "context_v2_store_disabled";

const EMPTY_RESULT = Object.freeze({
  state: MEMORY_V2_TREE_STATES.LOADING,
  reason: "",
  errorCode: "",
  errorMessage: "",
  spaces: Object.freeze([]),
  spaceId: "",
  spaceName: "",
  roots: Object.freeze([]),
  entryCount: 0,
});

export const emptyMemoryV2TreeResult = () => EMPTY_RESULT;

const result = (patch) => Object.freeze({ ...EMPTY_RESULT, ...patch });

const disabled = (reason) =>
  result({ state: MEMORY_V2_TREE_STATES.DISABLED, reason });

const failed = (error) =>
  result({
    state: MEMORY_V2_TREE_STATES.ERROR,
    errorCode: parseContextV2ErrorCode(error) || "",
    errorMessage:
      error && typeof error.message === "string" ? error.message : "",
  });

/* One place that decides whether a rejection means "off" rather than "broke".
   Every call site funnels through it so the mapping cannot diverge per call. */
const classifyRejection = (error) =>
  parseContextV2ErrorCode(error) === STORE_DISABLED_CODE
    ? disabled(MEMORY_V2_TREE_DISABLED_REASONS.STORE_DISABLED)
    : failed(error);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value) => (typeof value === "string" ? value : "");

/* Spaces are reduced to the two fields the view shows. Keeping the raw rows
   out of the view means a backend field addition cannot leak into the UI. */
const normalizeSpaces = (payload) => {
  if (!isPlainObject(payload) || !Array.isArray(payload.spaces)) return null;
  return payload.spaces
    .filter(isPlainObject)
    .map((space) => ({
      spaceId: text(space.space_id),
      name: text(space.name),
      description: text(space.description),
    }))
    .filter((space) => space.spaceId);
};

/**
 * Resolve what the tree view should be showing for one chat.
 *
 * `bridge` is injectable so the decision table can be tested against every
 * branch without installing a window global; production callers pass nothing.
 *
 * Never throws — every failure is folded into a returned state, because a
 * throw here would land in a render path with no better answer than this one.
 */
export const loadMemoryV2TreeState = async ({
  ownerChatId,
  spaceId = "",
  bridge = contextV2Bridge,
} = {}) => {
  const owner = text(ownerChatId).trim();
  /* The settings/long_term mount point renders this modal with no owner at
     all. That is not a failure and must not read as one. */
  if (!owner) {
    return disabled(MEMORY_V2_TREE_DISABLED_REASONS.NO_OWNER);
  }
  if (!bridge || typeof bridge.isAvailable !== "function") {
    return disabled(MEMORY_V2_TREE_DISABLED_REASONS.NO_BRIDGE);
  }
  if (!bridge.isAvailable()) {
    return disabled(MEMORY_V2_TREE_DISABLED_REASONS.NO_BRIDGE);
  }

  let status;
  try {
    status = await bridge.getStatus();
  } catch (error) {
    return classifyRejection(error);
  }
  if (!isPlainObject(status)) {
    return result({ state: MEMORY_V2_TREE_STATES.UNKNOWN });
  }
  if (status.available !== true) {
    return disabled(MEMORY_V2_TREE_DISABLED_REASONS.SIDECAR_UNAVAILABLE);
  }
  /* "shadow" and "canary" still serve reads — only a hard "off" means the
     surface has nothing to show. Erring toward EMPTY over DISABLED is the
     safe direction: it claims less. */
  if (text(status.rolloutMode) === "off") {
    return disabled(MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF);
  }

  let spaces;
  try {
    spaces = normalizeSpaces(await bridge.listSpaces({ ownerChatId: owner }));
  } catch (error) {
    return classifyRejection(error);
  }
  if (spaces === null) {
    return result({ state: MEMORY_V2_TREE_STATES.UNKNOWN });
  }
  if (spaces.length === 0) {
    /* Enabled, reachable, nothing stored. Provable because getStatus() has
       already answered the "is it on?" question. */
    return result({ state: MEMORY_V2_TREE_STATES.EMPTY, spaces: [] });
  }

  const requested = text(spaceId).trim();
  const active =
    spaces.find((space) => space.spaceId === requested) || spaces[0];

  let tree;
  try {
    tree = await bridge.getTree({ ownerChatId: owner, spaceId: active.spaceId });
  } catch (error) {
    const rejection = classifyRejection(error);
    /* Keep the space list on a failure so the user can switch away from a
       space that is the thing failing. */
    return result({ ...rejection, spaces, spaceId: active.spaceId, spaceName: active.name });
  }
  if (!isPlainObject(tree) || !Array.isArray(tree.tree)) {
    return result({
      state: MEMORY_V2_TREE_STATES.UNKNOWN,
      spaces,
      spaceId: active.spaceId,
      spaceName: active.name,
    });
  }

  const entryCount = Array.isArray(tree.entries) ? tree.entries.length : 0;
  return result({
    state:
      entryCount === 0
        ? MEMORY_V2_TREE_STATES.EMPTY
        : MEMORY_V2_TREE_STATES.READY,
    spaces,
    spaceId: active.spaceId,
    spaceName: active.name,
    roots: tree.tree,
    entryCount,
  });
};

/**
 * Flatten a `get_tree` root list into the bounded row list the view renders.
 *
 * @param roots    the `tree` array from get_tree
 * @param expanded a Set of expanded node paths
 * @param limit    max rows returned (defaults to the module cap)
 * @returns { rows, visibleCount, hiddenCount, truncated }
 *          `visibleCount` is what WOULD be shown without the cap, so the view
 *          can say how much it is withholding instead of silently dropping it.
 */
export const flattenMemoryV2Tree = (
  roots,
  { expanded = new Set(), limit = MEMORY_V2_TREE_MAX_VISIBLE_ROWS } = {},
) => {
  const rows = [];
  let visibleCount = 0;
  let walked = 0;

  if (!Array.isArray(roots)) {
    return { rows, visibleCount: 0, hiddenCount: 0, truncated: false };
  }

  /* Iterative, not recursive: a deep path must not be able to blow the stack.
     `seen` makes a malformed parent/child link terminate instead of loop. */
  const seen = new Set();
  const stack = [];
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    stack.push({ node: roots[i], depth: 0 });
  }

  while (stack.length > 0) {
    if (walked >= MAX_WALKED_NODES) break;
    const { node, depth } = stack.pop();
    if (!isPlainObject(node)) continue;

    const path = text(node.path);
    const key = path || `${depth}:${text(node.entry_id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    walked += 1;

    const children = Array.isArray(node.children) ? node.children : [];
    const isExpanded = expanded.has(path);

    visibleCount += 1;
    if (rows.length < limit) {
      rows.push({
        key,
        path,
        depth,
        node,
        hasChildren: children.length > 0,
        expanded: isExpanded,
      });
    }

    if (isExpanded) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: children[i], depth: depth + 1 });
      }
    }
  }

  return {
    rows,
    visibleCount,
    hiddenCount: Math.max(visibleCount - rows.length, 0),
    truncated: rows.length < visibleCount,
  };
};

/* ══════════════════════════════════════════════════════════════════════
   ENTRY CONTENT PREVIEW

   `get_tree` carries metadata only — no bytes. The detail panel therefore
   reads content separately, through the pre-existing `readContent` bridge
   method (no new endpoint: AC-3). The judgment half lives here for the same
   reason the tree's does: "this entry has nothing showable" and "reading it
   failed" are different facts and must not be decided inline in a render.

   "Not showable" is deliberately NOT an error. A folder, a link, a PNG and a
   1 GB blob all legitimately have no text preview; presenting any of them as
   a failure would teach the user to distrust a working store.
   ══════════════════════════════════════════════════════════════════════ */

export const MEMORY_V2_PREVIEW_STATES = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  /* The entry exists and was read fine, but there is no text to show. */
  UNSUPPORTED: "unsupported",
  ERROR: "error",
});

/* One page, never more. The panel is a preview, not a reader — and this is the
   same unbounded-payload hazard the row cap exists for. */
export const MEMORY_V2_PREVIEW_MAX_BYTES = 4096;

const BINARY_MIME_PREFIXES = Object.freeze(["image/", "audio/", "video/", "font/"]);
const BINARY_MIME_EXACT = Object.freeze([
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-tar",
]);

const EMPTY_PREVIEW = Object.freeze({
  state: MEMORY_V2_PREVIEW_STATES.IDLE,
  text: "",
  totalBytes: 0,
  shownBytes: 0,
  truncated: false,
  errorCode: "",
  errorMessage: "",
});

export const emptyMemoryV2Preview = () => EMPTY_PREVIEW;

const previewResult = (patch) => Object.freeze({ ...EMPTY_PREVIEW, ...patch });

const base64ToBytes = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/* Strict UTF-8: invalid bytes THROW rather than becoming U+FFFD, because the
   throw is how we tell text from binary. A lenient decode would render a PNG
   as a screenful of replacement characters and call it content. */
const decodeStrictUtf8 = (bytes) => {
  if (typeof TextDecoder === "function") {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  /* Environments without TextDecoder (some jsdom setups). Percent-decoding is
     equally strict — decodeURIComponent throws URIError on invalid UTF-8. */
  let percent = "";
  for (let i = 0; i < bytes.length; i += 1) {
    percent += `%${bytes[i].toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(percent);
};

/* A truncated page can end mid-codepoint through no fault of the file, so a
   truncated read gets up to three bytes trimmed off the tail before we are
   willing to call it binary. A complete page gets no such benefit of doubt. */
const decodeTextPage = (bytes, truncated) => {
  try {
    return decodeStrictUtf8(bytes);
  } catch (error) {
    if (!truncated) throw error;
    for (let drop = 1; drop <= 3 && drop < bytes.length; drop += 1) {
      try {
        return decodeStrictUtf8(bytes.subarray(0, bytes.length - drop));
      } catch (ignored) {
        /* keep trimming */
      }
    }
    throw error;
  }
};

const isBinaryMime = (mime) =>
  BINARY_MIME_EXACT.includes(mime) ||
  BINARY_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));

/**
 * Read one bounded page of an entry's content for the detail panel.
 *
 * `bridge` is injectable for the same reason the tree loader's is. Never
 * throws; every outcome is a returned state.
 */
export const loadMemoryV2EntryPreview = async ({
  ownerChatId,
  ref,
  mimeType = "",
  bridge = contextV2Bridge,
} = {}) => {
  const owner = text(ownerChatId).trim();
  const contentRef = text(ref).trim();
  /* Folders and links carry no content_ref at all — nothing to read, and
     nothing wrong. */
  if (!owner || !contentRef) {
    return previewResult({ state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED });
  }
  if (
    !bridge ||
    typeof bridge.isAvailable !== "function" ||
    !bridge.isAvailable() ||
    typeof bridge.readContent !== "function"
  ) {
    return previewResult({ state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED });
  }
  /* Cheapest possible answer for the formats that can never be text: do not
     move the bytes at all. */
  if (isBinaryMime(text(mimeType).trim().toLowerCase())) {
    return previewResult({ state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED });
  }

  let page;
  try {
    page = await bridge.readContent({
      ownerChatId: owner,
      ref: contentRef,
      offset: 0,
      limit: MEMORY_V2_PREVIEW_MAX_BYTES,
    });
  } catch (error) {
    return previewResult({
      state: MEMORY_V2_PREVIEW_STATES.ERROR,
      errorCode: parseContextV2ErrorCode(error) || "",
      errorMessage:
        error && typeof error.message === "string" ? error.message : "",
    });
  }
  if (!isPlainObject(page)) {
    return previewResult({ state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED });
  }

  const encoding = text(page.encoding);
  if (encoding && encoding !== "base64") {
    return previewResult({ state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED });
  }

  const totalBytes = Number.isFinite(page.total_bytes)
    ? Number(page.total_bytes)
    : 0;
  const truncated = page.truncated === true;

  let bytes;
  let body;
  try {
    bytes = base64ToBytes(text(page.data));
    body = decodeTextPage(bytes, truncated);
  } catch (ignored) {
    /* Malformed base64 or not UTF-8. Both mean "no text to show", which is a
       fact about the payload rather than a failure of the read. */
    return previewResult({
      state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED,
      totalBytes,
    });
  }

  return previewResult({
    state: MEMORY_V2_PREVIEW_STATES.READY,
    text: body,
    totalBytes: totalBytes || bytes.length,
    shownBytes: bytes.length,
    truncated,
  });
};

/**
 * Paths of every root-level node that has children — the default expansion.
 * One level open reads as a tree; zero levels reads as a flat list, and "open
 * everything" is exactly the unbounded render the cap exists to prevent.
 */
export const defaultExpandedPaths = (roots) => {
  const paths = new Set();
  if (!Array.isArray(roots)) return paths;
  for (const node of roots) {
    if (!isPlainObject(node)) continue;
    const children = Array.isArray(node.children) ? node.children : [];
    const path = text(node.path);
    if (path && children.length > 0) paths.add(path);
  }
  return paths;
};

const memoryV2TreeState = {
  MEMORY_V2_TREE_STATES,
  MEMORY_V2_TREE_DISABLED_REASONS,
  MEMORY_V2_TREE_MAX_VISIBLE_ROWS,
  MEMORY_V2_PREVIEW_STATES,
  MEMORY_V2_PREVIEW_MAX_BYTES,
  loadMemoryV2TreeState,
  loadMemoryV2EntryPreview,
  flattenMemoryV2Tree,
  defaultExpandedPaths,
  emptyMemoryV2TreeResult,
  emptyMemoryV2Preview,
};

export default memoryV2TreeState;
