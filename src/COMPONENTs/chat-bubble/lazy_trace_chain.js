import { memo, useEffect, useRef, useState } from "react";
import TraceChain, { DISPLAY_FRAME_TYPES } from "./trace_chain";

/* ─── placeholder height model ───────────────────────────────────────────────
 * Opening an old conversation mounts every bubble's trace inside a 200ms idle
 * window. A fixed 24px placeholder that expands to the real (often hundreds of
 * px) TraceChain makes the scroll anchor drift and the minimap re-calibrate on
 * every mount. To keep the pre-mount footprint close to the final one we:
 *   1. reuse the real measured height once we've seen this message before, and
 *   2. otherwise estimate from the frame count.
 * The bubble stays a pure consumer here — it only reads props.frames /
 * props.messageId, it never drives the stream. */

const BASE_PLACEHOLDER_HEIGHT = 24;
const PER_FRAME_HEIGHT = 26;
const MAX_PLACEHOLDER_HEIGHT = 400;

// messageId → last measured real TraceChain height (px). Module-level so a
// re-open (or a virtualization remount) of the same message can restore the
// exact prior height. Bounded to avoid unbounded growth across a long session.
const TRACE_HEIGHT_CACHE = new Map();
const TRACE_HEIGHT_CACHE_LIMIT = 500;

const rememberTraceHeight = (messageId, height) => {
  if (typeof messageId !== "string" || messageId.length === 0) return;
  if (!Number.isFinite(height) || height <= 0) return;
  if (TRACE_HEIGHT_CACHE.size >= TRACE_HEIGHT_CACHE_LIMIT) {
    // Simplest bound: drop everything once the cap is hit. A stale reopen just
    // falls back to the frame-count estimate — never wrong, only less precise.
    TRACE_HEIGHT_CACHE.clear();
  }
  TRACE_HEIGHT_CACHE.set(messageId, height);
};

// Count only frames that become their own timeline row. tool_result is a
// display frame type (it passes TraceChain's DISPLAY_FRAME_TYPES filter) but it
// is folded into its tool_call row, so it must NOT inflate the estimate.
const countDisplayFrames = (frames) => {
  if (!Array.isArray(frames)) return 0;
  let count = 0;
  for (const frame of frames) {
    if (
      frame &&
      DISPLAY_FRAME_TYPES.has(frame.type) &&
      frame.type !== "tool_result"
    ) {
      count += 1;
    }
  }
  return count;
};

const estimatePlaceholderHeight = (messageId, frames) => {
  if (
    typeof messageId === "string" &&
    messageId.length > 0 &&
    TRACE_HEIGHT_CACHE.has(messageId)
  ) {
    return TRACE_HEIGHT_CACHE.get(messageId);
  }

  const displayFrameCount = countDisplayFrames(frames);
  if (displayFrameCount <= 0) return BASE_PLACEHOLDER_HEIGHT;

  const estimated =
    BASE_PLACEHOLDER_HEIGHT + displayFrameCount * PER_FRAME_HEIGHT;
  return Math.min(
    MAX_PLACEHOLDER_HEIGHT,
    Math.max(BASE_PLACEHOLDER_HEIGHT, estimated),
  );
};

const TracePlaceholder = ({ minHeight = BASE_PLACEHOLDER_HEIGHT }) => (
  <div
    data-testid="lazy-trace-placeholder"
    style={{
      minHeight,
      padding: "4px 0",
      fontSize: 12,
      opacity: 0.35,
      userSelect: "none",
    }}
  />
);

const LazyTraceChain = (props) => {
  const isStreaming = props?.status === "streaming";
  const messageId = props?.messageId;
  const frames = props?.frames;
  const frameCount = Array.isArray(frames) ? frames.length : 0;
  const [mounted, setMounted] = useState(isStreaming);
  const measureRef = useRef(null);

  useEffect(() => {
    if (mounted) {
      return undefined;
    }
    if (typeof window === "undefined") {
      setMounted(true);
      return undefined;
    }

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setMounted(true), {
        timeout: 200,
      });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(id);
        }
      };
    }

    const timerId = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timerId);
  }, [mounted]);

  useEffect(() => {
    if (isStreaming && !mounted) {
      setMounted(true);
    }
  }, [isStreaming, mounted]);

  // Measure the real TraceChain once it's mounted so a later re-open restores
  // the exact height. Skipped entirely while streaming: offsetHeight forces a
  // synchronous reflow, and re-running this on every appended frame (frameCount
  // dep) interleaves that reflow with the streaming store's high-frequency DOM
  // writes, causing jank that gets worse the longer the stream runs. Instead we
  // measure once the message settles (status flips to done/error). Non-streaming
  // frameCount changes (e.g. reopening a historical message) keep re-measuring
  // as before.
  useEffect(() => {
    if (!mounted) return;
    if (isStreaming) return;
    const node = measureRef.current;
    if (!node) return;
    rememberTraceHeight(messageId, node.offsetHeight);
  }, [mounted, messageId, frameCount, isStreaming]);

  if (!mounted) {
    return (
      <TracePlaceholder
        minHeight={estimatePlaceholderHeight(messageId, frames)}
      />
    );
  }

  return (
    // Width contract must match TraceChain's own root node: this wrapper becomes
    // the flex item inside chat_bubble.js's `alignItems: flex-start` column, so
    // without width:100% the item shrink-to-fits and the whole trace chain
    // collapses to content width. jsdom has no layout engine, so this is
    // guarded by an inline-style assertion, not a rendered-width check.
    <div
      ref={measureRef}
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <TraceChain {...props} />
    </div>
  );
};

export default memo(LazyTraceChain);
