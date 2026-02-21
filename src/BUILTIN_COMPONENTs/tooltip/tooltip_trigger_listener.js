/* -------------------------------------------------------
 *  tooltip_trigger_listener.js
 *  Global singleton that ensures only ONE tooltip is open
 *  at any time across the entire application.
 *  Pure JS module — no React context / provider needed.
 * ------------------------------------------------------- */

let activeId = null;
const closeCallbacks = new Map();

/**
 * Register a tooltip instance so the listener can close it later.
 * @param {string} id       unique id for the tooltip instance
 * @param {Function} closeFn  callback that forces the tooltip closed
 */
export const register = (id, closeFn) => {
  closeCallbacks.set(id, closeFn);
};

/**
 * Unregister when the tooltip unmounts.
 */
export const unregister = (id) => {
  closeCallbacks.delete(id);
  if (activeId === id) activeId = null;
};

/**
 * Called when a tooltip is about to open.
 * Closes the currently-active tooltip (if any) first,
 * then marks the new one as active.
 */
export const requestOpen = (id) => {
  if (activeId && activeId !== id) {
    const closeFn = closeCallbacks.get(activeId);
    if (closeFn) closeFn();
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
