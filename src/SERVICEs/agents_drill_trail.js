import { useEffect, useRef, useSyncExternalStore } from "react";

/* Where the Agents editor is drilled to, for the side menu's breadcrumb.
 *
 * The editor owns the drill stack; the side menu's breadcrumb, above its
 * search field, is where the path is shown and walked back. They live in two
 * different trees (the side menu is not inside the Agents page), so the path
 * is handed over here, the way the shared search query is. Session-only and
 * never stored.
 *
 * A trail is `{ owner, segments, navigate }`. Each segment is
 * `{ key, label, depth, icon?, presentation?, ariaLabel?, hint? }`: `depth`
 * is the drill level a click goes back to (null for where you are), `icon` an
 * icon name, or `presentation` an Agent resource's own icon. */

let trail = null;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export const getAgentsDrillTrail = () => trail;

export const subscribeAgentsDrillTrail = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/* `owner` keeps one editor from clearing a trail another one has since
   published. An empty list is the same as no trail. */
/* Switching from one Agent to another takes the old editor's trail away a
   few milliseconds before the new one publishes its own (it is mounted, or
   its document read, first). Taken away at once, the breadcrumb went
   Explore → Agents → Default in two overlapping animations, which read as a
   stutter. So a trail that goes away is held this long; one published in
   the meantime replaces it in place, and only a trail nobody replaces
   leaves. */
export const DRILL_TRAIL_RELEASE_MS = 300;
let pendingClear = null;
const cancelPendingClear = () => {
  if (pendingClear !== null) {
    clearTimeout(pendingClear);
    pendingClear = null;
  }
};

export const setAgentsDrillTrail = (owner, segments, navigate) => {
  const list = Array.isArray(segments) ? segments : [];
  if (list.length === 0) {
    clearAgentsDrillTrail(owner);
    return;
  }
  cancelPendingClear();
  trail = { owner, segments: list, navigate };
  emit();
};

export const clearAgentsDrillTrail = (owner) => {
  if (!trail || trail.owner !== owner) return;
  cancelPendingClear();
  const held = trail;
  pendingClear = setTimeout(() => {
    pendingClear = null;
    if (trail !== held) return;
    trail = null;
    emit();
  }, DRILL_TRAIL_RELEASE_MS);
};

/* Drops any trail at once, with nothing held: for a test's clean start. */
export const resetAgentsDrillTrail = () => {
  cancelPendingClear();
  if (trail === null) return;
  trail = null;
  emit();
};

export const useAgentsDrillTrail = () =>
  useSyncExternalStore(subscribeAgentsDrillTrail, getAgentsDrillTrail, getAgentsDrillTrail);

const signature = (segments) =>
  JSON.stringify(
    (segments || []).map((segment) => [
      segment.key,
      segment.label,
      segment.depth,
      segment.icon || null,
      (segment.presentation && segment.presentation.icon) || null,
      segment.ariaLabel || null,
      segment.hint || null,
    ]),
  );

/* Publishes `segments` while the caller is mounted, and takes them back when
   it goes. `navigate(depth)` is read at click time, so a fresh callback on
   every render does not republish anything. */
export function usePublishAgentsDrillTrail(segments, navigate) {
  const owner = useRef(null);
  if (owner.current === null) owner.current = {};
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const key = signature(segments);
  useEffect(() => {
    const me = owner.current;
    const list = segmentsRef.current;
    if (!Array.isArray(list) || list.length === 0) {
      clearAgentsDrillTrail(me);
      return;
    }
    setAgentsDrillTrail(me, list, (depth) => {
      if (typeof navigateRef.current === "function") navigateRef.current(depth);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the segments' content
  }, [key]);
  useEffect(() => {
    const me = owner.current;
    return () => clearAgentsDrillTrail(me);
  }, []);
}

/* The trail as the side menu's breadcrumb crumbs: each its icon and its name,
   and a click on a graph left behind goes back to it. */
export function drillTrailCrumbs(current) {
  if (!current || !Array.isArray(current.segments)) return [];
  return current.segments.map((segment) => ({
    key: segment.key,
    label: segment.label,
    ...(segment.presentation !== undefined
      ? { presentation: segment.presentation }
      : { icon: segment.icon || "bot" }),
    showLabel: true,
    ariaLabel: segment.ariaLabel,
    hint: segment.hint,
    onClick:
      segment.depth !== null && segment.depth !== undefined
        ? () => current.navigate(segment.depth)
        : undefined,
  }));
}
