import { useLayoutEffect, useRef, useState } from "react";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { NODE_SIZE_MOTION_EVENT } from "../../../../../BUILTIN_COMPONENTs/flow_editor/utils";
import { NODE_MOTION_MOUNT_GRACE_MS, NODE_SPRING, NODE_SPRING_SETTLE } from "./node_metrics";

/* A node's size change, as a spring (every node on the Agents canvas, through
 * PuzzleShape).
 *
 * Two boxes: `contentRef` wraps what the node draws and is never sized by this
 * hook — its height is the node's natural height, watched by a ResizeObserver
 * — and `frameRef` around it, whose explicit height in px IS the node's
 * height: the puzzle body, its shadow, its tabs and the FlowEditor wrapper
 * (and so the ports and edges the editor measures from it) all follow it. At
 * rest the frame holds exactly the natural height. When the natural height
 * changes after mount, a rAF spring carries the frame from the height on
 * screen to the new one, writing `style.height` once a frame, no React render
 * per frame. Layout, not a transform: hit areas are right on every frame and
 * exact at the end.
 *
 * The change is noticed in the same commit that made it: a layout effect
 * re-measures the content after every render of the node (props are where a
 * node's rows come from), so the frame is still pinned at the old height, the
 * clip and the tab clamp are on, and the editor knows, before that commit
 * paints. A ResizeObserver catches what changes without a render here. The
 * frame is only ever resized inside rAF or a layout effect, never inside the
 * observer's callback: resizing an ancestor of the observed box from its own
 * callback is a ResizeObserver loop (the browser reports undelivered
 * notifications).
 *
 * Instant (no spring), all applied on the next frame:
 *   - the first measurement, and the first after the node was hidden (0 px);
 *   - anything within NODE_MOTION_MOUNT_GRACE_MS of mount (graph load, fonts);
 *   - prefers-reduced-motion;
 *   - a hidden document.
 *
 * While a spring runs the frame carries `data-size-motion="running"` and
 * dispatches a bubbling NODE_SIZE_MOTION_EVENT at start and end, so
 * the FlowEditor can keep edges and port dots in the same frame as the body. */

export const SIZE_MOTION_EVENT = NODE_SIZE_MOTION_EVENT;

const REST_DISTANCE = 0.25;
const REST_VELOCITY = 4;
const MAX_FRAME_SECONDS = 1 / 30;
const STEP_SECONDS = 1 / 240;

/* One spring step (semi-implicit Euler), exported for the tests. */
export function step_spring(state, spring, seconds) {
  let { value, velocity } = state;
  let left = Math.min(Math.max(seconds, 0), MAX_FRAME_SECONDS);
  while (left > 1e-9) {
    const dt = Math.min(STEP_SECONDS, left);
    const force = -spring.stiffness * (value - state.target) - spring.damping * velocity;
    velocity += (force / spring.mass) * dt;
    value += velocity * dt;
    left -= dt;
  }
  const settled = Math.abs(value - state.target) < REST_DISTANCE && Math.abs(velocity) < REST_VELOCITY;
  return settled ? { value: state.target, velocity: 0, settled: true } : { value, velocity, settled: false };
}

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/* Newly revealed content eases in: each element whose centre sits below the
   height that was on screen (a new case row, a new pool entry) fades and
   slides up a few px. Rows that leave are simply gone — the body glides
   shut over the space they left. */
function reveal_below(content, visible_height) {
  if (!content || typeof content.getBoundingClientRect !== "function") return;
  const box = content.getBoundingClientRect();
  const scale = content.offsetHeight > 0 ? box.height / content.offsetHeight : 1;
  if (!(scale > 0)) return;
  const walk = (element, depth) => {
    Array.from(element.children || []).forEach((child) => {
      const rect = child.getBoundingClientRect();
      const top = (rect.top - box.top) / scale;
      const bottom = (rect.bottom - box.top) / scale;
      if (bottom - top <= 0) return;
      if ((top + bottom) / 2 > visible_height) {
        if (typeof child.animate === "function") {
          child.animate(
            [{ opacity: 0, translate: "0 -4px" }, { opacity: 1, translate: "0 0" }],
            { duration: 240, delay: 40, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
          );
        }
      } else if (bottom > visible_height + 0.5 && depth < 6) {
        walk(child, depth + 1);
      }
    });
  };
  walk(content, 0);
}

export default function useNodeSizeMotion() {
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  const reduced = useReducedMotion();
  const [moving, setMoving] = useState(false);
  const live = useRef({
    natural: null,
    value: null,
    velocity: 0,
    target: null,
    raf: null,
    last_time: null,
    running: false,
    mounted_at: 0,
    reduced,
  });
  live.current.reduced = reduced;

  useLayoutEffect(() => {
    const s = live.current;
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return undefined;
    s.mounted_at = now();

    const announce = (running) => {
      if (s.running === running) return;
      s.running = running;
      if (running) frame.setAttribute("data-size-motion", "running");
      else frame.removeAttribute("data-size-motion");
      setMoving(running);
      if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
        frame.dispatchEvent(new window.CustomEvent(SIZE_MOTION_EVENT, { bubbles: true, detail: { running } }));
      }
    };

    const stop = () => {
      if (s.raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(s.raf);
      s.raf = null;
      s.last_time = null;
    };

    const tick = (time) => {
      s.raf = null;
      if (s.target === null) return;
      if (s.snap) {
        s.snap = false;
        s.value = s.target;
        s.velocity = 0;
        frame.style.height = `${s.target}px`;
        announce(false);
        return;
      }
      const seconds = s.last_time === null ? 1 / 60 : (time - s.last_time) / 1000;
      s.last_time = time;
      const spring = s.target >= s.from ? NODE_SPRING : NODE_SPRING_SETTLE;
      const next = step_spring({ value: s.value, velocity: s.velocity, target: s.target }, spring, seconds);
      s.value = next.value;
      s.velocity = next.velocity;
      frame.style.height = `${s.value}px`;
      if (next.settled) {
        s.last_time = null;
        announce(false);
        return;
      }
      s.raf = requestAnimationFrame(tick);
    };

    const schedule = () => {
      if (s.raf === null && typeof requestAnimationFrame === "function") s.raf = requestAnimationFrame(tick);
    };

    /* `in_layout`: called from a layout effect, where resizing the frame at
       once is safe (no observer callback is on the stack). */
    const measure = (in_layout = false) => {
      const height = content.offsetHeight;
      if (!(height > 0)) {
        /* Hidden (or not laid out): forget the baseline, let the frame size
           itself, and take the next real height as a first measurement. */
        stop();
        s.natural = null;
        s.value = null;
        s.target = null;
        frame.style.height = "";
        announce(false);
        return;
      }
      if (s.natural === null) {
        /* First measurement: the frame already is this tall (auto), so
           pinning it changes no size. */
        s.natural = height;
        s.value = height;
        s.target = height;
        frame.style.height = `${height}px`;
        return;
      }
      if (height === s.natural) return;
      const from = s.value === null ? s.natural : s.value;
      s.natural = height;
      s.target = height;
      const t = now();
      const instant = s.reduced || t - s.mounted_at < NODE_MOTION_MOUNT_GRACE_MS ||
        (typeof document !== "undefined" && document.hidden) || typeof requestAnimationFrame !== "function";
      if (instant) {
        stop();
        if (in_layout || typeof requestAnimationFrame !== "function") {
          s.snap = false;
          s.value = height;
          s.velocity = 0;
          frame.style.height = `${height}px`;
          announce(false);
        } else {
          s.snap = true;
          schedule();
        }
        return;
      }
      s.snap = false;
      if (!s.running) {
        s.value = from;
        s.velocity = 0;
      }
      s.from = s.value;
      if (height > from) reveal_below(content, from);
      announce(true);
      schedule();
    };

    s.measure = measure;
    measure(true);
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => measure(false));
      observer.observe(content);
    }
    return () => {
      s.measure = null;
      if (observer) observer.disconnect();
      stop();
    };
  }, []);

  /* After every render: did this commit change the content's height? */
  useLayoutEffect(() => {
    if (live.current.measure) live.current.measure(true);
  });

  return { frameRef, contentRef, moving };
}
