/* -------------------------------------------------------
 *  tooltip_trigger_listener.js
 *  Global singleton that ensures only ONE tooltip is open
 *  at any time across the entire application.
 *  Pure JS module — no React context / provider needed.
 * ------------------------------------------------------- */

let activeId = null;
const entries = new Map();

/**
 * Register a tooltip instance so the listener can close it later.
 * @param {string} id       unique id for the tooltip instance
 * @param {Function} closeFn  callback that forces the tooltip closed
 * @param {Function} [getBubbleEl]  returns this tooltip's own rendered
 *   bubble DOM node (or null/undefined while closed) — used to detect
 *   a tooltip opening from *inside* this one's own content, e.g. a
 *   Select's dropdown nested in an already-open popover.
 * @param {Function} [getTriggerEl]  returns this tooltip's own trigger DOM
 *   node — used the same way, from the other side of the relationship.
 */
export const register = (id, closeFn, getBubbleEl, getTriggerEl) => {
  entries.set(id, { closeFn, getBubbleEl, getTriggerEl });
};

/**
 * Unregister when the tooltip unmounts.
 */
export const unregister = (id) => {
  entries.delete(id);
  if (activeId === id) activeId = null;
};

/**
 * Called when a tooltip is about to open.
 * Closes the currently-active tooltip first, UNLESS the newly-opening
 * one is nested inside the active tooltip's own bubble content (its
 * trigger element lives within the active tooltip's rendered DOM) — a
 * dropdown opened from inside an already-open popover should not blow
 * the popover away out from under itself. Otherwise marks the new one
 * as active as before.
 * @param {string} id
 * @param {Element} [triggerEl]  the newly-opening tooltip's own trigger DOM node
 */
export const requestOpen = (id, triggerEl) => {
  if (activeId && activeId !== id) {
    const active = entries.get(activeId);
    const activeBubbleEl = active?.getBubbleEl?.();
    const isNestedInsideActive =
      activeBubbleEl && triggerEl && activeBubbleEl.contains(triggerEl);
    if (!isNestedInsideActive && active?.closeFn) {
      active.closeFn();
    }
  }
  activeId = id;
};

/**
 * Called when a tooltip closes itself normally.
 * Clears the activeId so no stale reference remains.
 */
export const notifyClose = (id) => {
  if (activeId === id) activeId = null;
};

/**
 * Whether `target` sits inside some OTHER registered tooltip's bubble that
 * was itself opened from within `ownBubbleEl` — i.e. a genuine child popover
 * (a Select's dropdown nested in an already-open popover), as opposed to
 * some unrelated content elsewhere in the shared portal. Every bubble is a
 * DOM sibling of every other one (they all share one portal root), so plain
 * `ownBubbleEl.contains(target)` can never see a nested child's bubble
 * directly — this walks the trigger/bubble relationship instead: the
 * child's own trigger element always lives inside its parent's bubble
 * content (only bubbles are portaled, triggers render in place).
 * @param {Element|null|undefined} ownBubbleEl
 * @param {EventTarget|null|undefined} target
 */
export const isClickInNestedTooltip = (ownBubbleEl, target) => {
  if (!ownBubbleEl || !target) return false;
  for (const entry of entries.values()) {
    const bubbleEl = entry.getBubbleEl?.();
    if (!bubbleEl || bubbleEl === ownBubbleEl || !bubbleEl.contains(target)) {
      continue;
    }
    const triggerEl = entry.getTriggerEl?.();
    if (triggerEl && ownBubbleEl.contains(triggerEl)) return true;
  }
  return false;
};
