/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  attach_panel_layout                                                           */
/*                                                                                */
/*  Where the attach panel's movable widgets sit (#217): the user's order, and    */
/*  which of them are tucked into the "…" overflow menu. Persisted under its own   */
/*  settings namespace so it survives a restart and so subscribers can filter on  */
/*  it. The model pill and the queue segment are not movable and never appear     */
/*  here; a widget the current chat cannot offer (no screenshot handler, tools    */
/*  hidden for a character chat) is simply skipped at render time and keeps its   */
/*  place for when it comes back.                                                 */
/*                                                                                */
/*  Shape: { version: 1, order: <every movable id, user order>, hidden: <ids> }   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import {
  readNamespace,
  replaceNamespace,
  subscribeSettings,
} from "./settings_repository";

export const ATTACH_PANEL_LAYOUT_NAMESPACE = "attach_panel_layout";
const LAYOUT_VERSION = 1;

/* Default order is the row as it was before the layout became a preference.
   A first launch (no record yet) shows the context ring, the plugin and the
   workspace selectors on the row and tucks attach / screenshot / link into
   the "…" menu — the project owner's call for the out-of-the-box row. A
   record that says otherwise is honoured as written. */
export const MOVABLE_ATTACH_WIDGETS = Object.freeze([
  "context_composition",
  "attach",
  "screenshot",
  "tools",
  "workspace",
  "link",
]);

export const DEFAULT_ATTACH_PANEL_LAYOUT = Object.freeze({
  version: LAYOUT_VERSION,
  order: MOVABLE_ATTACH_WIDGETS,
  hidden: Object.freeze(["attach", "screenshot", "link"]),
});

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const KNOWN = new Set(MOVABLE_ATTACH_WIDGETS);

/**
 * Coerce anything into a valid layout. Unknown ids are dropped, repeats
 * collapse to their first occurrence, and widgets the record never knew about
 * (added after it was written) are appended in default order so a new widget
 * shows up in the row rather than vanishing. A wrong version or a malformed
 * record reads as the default.
 */
export const normalizeAttachPanelLayout = (raw) => {
  if (!isPlainObject(raw) || raw.version !== LAYOUT_VERSION) {
    return DEFAULT_ATTACH_PANEL_LAYOUT;
  }
  if (!Array.isArray(raw.order) || (raw.hidden != null && !Array.isArray(raw.hidden))) {
    return DEFAULT_ATTACH_PANEL_LAYOUT;
  }
  const order = [];
  raw.order.forEach((id) => {
    if (KNOWN.has(id) && !order.includes(id)) order.push(id);
  });
  MOVABLE_ATTACH_WIDGETS.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  const hidden = [];
  (raw.hidden || []).forEach((id) => {
    if (order.includes(id) && !hidden.includes(id)) hidden.push(id);
  });
  return { version: LAYOUT_VERSION, order, hidden };
};

export const readAttachPanelLayout = () =>
  normalizeAttachPanelLayout(readNamespace(ATTACH_PANEL_LAYOUT_NAMESPACE, null));

/**
 * Persist a whole layout (normalized first). Returns the repository's
 * persistence promise; callers that care about write failures await it.
 */
export const writeAttachPanelLayout = (layout) =>
  replaceNamespace(ATTACH_PANEL_LAYOUT_NAMESPACE, normalizeAttachPanelLayout(layout));

/** A new layout with `id` at `toIndex` of the order (clamped); unknown id → same layout. */
export const moveAttachWidget = (layout, id, toIndex) => {
  const current = normalizeAttachPanelLayout(layout);
  const from = current.order.indexOf(id);
  if (from < 0) return current;
  const order = current.order.filter((item) => item !== id);
  const target = Math.min(order.length, Math.max(0, Math.floor(Number(toIndex) || 0)));
  order.splice(target, 0, id);
  return { ...current, order };
};

/** A new layout with `id` tucked into (or restored from) the overflow menu. */
export const setAttachWidgetHidden = (layout, id, hidden) => {
  const current = normalizeAttachPanelLayout(layout);
  if (!current.order.includes(id)) return current;
  const isHidden = current.hidden.includes(id);
  if (Boolean(hidden) === isHidden) return current;
  return {
    ...current,
    hidden: hidden
      ? [...current.hidden, id]
      : current.hidden.filter((item) => item !== id),
  };
};

/** Listener receives the normalized layout after each write of this namespace. */
export const subscribeAttachPanelLayout = (listener) => {
  if (typeof listener !== "function") return () => {};
  return subscribeSettings(({ namespace }) => {
    if (namespace !== ATTACH_PANEL_LAYOUT_NAMESPACE) return;
    listener(readAttachPanelLayout());
  });
};
