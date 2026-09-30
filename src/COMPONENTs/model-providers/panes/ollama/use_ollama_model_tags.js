import { useEffect, useState } from "react";
import api from "../../../../SERVICEs/api";

/**
 * Tags of library models for the store's size select (#204, design S3).
 *
 * One session-wide scheduler, not a fetch per row:
 *   - `requestModelTags(name)` queues one fetch per model, de-duplicated,
 *     with at most MAX_INFLIGHT on the wire at a time. The store calls it
 *     for every row inside the visible area plus five rows above and below
 *     (IntersectionObserver), and again on hover with priority.
 *   - results (and failures) are cached for the session, so a row scrolled
 *     away and back never refetches;
 *   - `useOllamaModelTags(name)` subscribes a row to the cache.
 *
 * state: "idle" (never requested) | "loading" (queued or in flight) |
 *        "ready" | "error"
 */

const MAX_INFLIGHT = 3;

const cache = new Map(); // name → { tags, error }
const inflight = new Set();
const queue = []; // names, front = next
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn());

const pump = () => {
  while (inflight.size < MAX_INFLIGHT && queue.length > 0) {
    const name = queue.shift();
    if (cache.has(name) || inflight.has(name)) continue;
    inflight.add(name);
    notify();
    api.ollama
      .fetchLibraryTags(name)
      .then((result) => {
        cache.set(name, { tags: Array.isArray(result) ? result : [], error: null });
      })
      .catch((err) => {
        cache.set(name, { tags: [], error: err?.message || "Failed to load tags" });
      })
      .then(() => {
        inflight.delete(name);
        notify();
        pump();
      });
  }
};

/** Ask for a model's tags. `priority` puts it at the front (hover). */
export const requestModelTags = (name, { priority = false } = {}) => {
  if (!name || cache.has(name) || inflight.has(name)) return;
  const at = queue.indexOf(name);
  if (at >= 0) {
    if (!priority || at === 0) return;
    queue.splice(at, 1);
  }
  if (priority) queue.unshift(name);
  else queue.push(name);
  pump();
};

/** Forget a queued (not yet started) request — a row that left the window. */
export const dropModelTagsRequest = (name) => {
  const at = queue.indexOf(name);
  if (at >= 0) queue.splice(at, 1);
};

/** Re-request after a failure. */
export const retryModelTags = (name) => {
  if (!name) return;
  const hit = cache.get(name);
  if (hit && hit.error) cache.delete(name);
  requestModelTags(name, { priority: true });
};

const snapshot = (name) => {
  if (!name) return { state: "idle", tags: [], error: null };
  const hit = cache.get(name);
  if (hit) return { state: hit.error ? "error" : "ready", tags: hit.tags, error: hit.error };
  if (inflight.has(name) || queue.includes(name)) return { state: "loading", tags: [], error: null };
  return { state: "idle", tags: [], error: null };
};

export const useOllamaModelTags = (modelName) => {
  const [snap, setSnap] = useState(() => snapshot(modelName));

  useEffect(() => {
    setSnap(snapshot(modelName));
    const onChange = () => setSnap(snapshot(modelName));
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, [modelName]);

  return { ...snap, retry: () => retryModelTags(modelName) };
};

/** Test hook: forget everything fetched, queued or in flight. */
export const __resetOllamaModelTagsCache = () => {
  cache.clear();
  inflight.clear();
  queue.length = 0;
};

export default useOllamaModelTags;
