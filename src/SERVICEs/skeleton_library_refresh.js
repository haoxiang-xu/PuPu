/* "The stored Skeleton resources may have changed."
 *
 * The chat's Agent row offers what the store HAS SAVED. A page that reads that
 * listing once, when the runtime became ready, keeps offering yesterday's
 * library: an Agent saved in the Builder a moment ago cannot be chosen until
 * the chat is unmounted and mounted again, which is a state the user has no
 * way of knowing they are in.
 *
 * So the two sides say so instead of guessing. A writer announces that it
 * wrote (`skeleton_resources.save_draft`), and a reader announces that it is
 * about to show the list (the Agent selector, when it opens) — the same shape
 * `model_catalog_refresh` already uses for the model pill. Nothing here reads
 * or caches a resource: this carries the fact that a re-read is due, and the
 * subscriber decides what to do with it.
 *
 * A listener that throws does not stop the others, and does not fail the save
 * that announced it.
 */

const listeners = new Set();

export const emitSkeletonLibraryRefresh = (payload = {}) => {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (_error) {
      // no-op: a subscriber must not break the writer that announced this
    }
  }
};

export const subscribeSkeletonLibraryRefresh = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
