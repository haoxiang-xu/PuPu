import { useState, useEffect, useMemo, useRef } from "react";

/**
 * Sliding-window rotation for model chips.
 *
 * When `chips.length <= limit` every chip is shown and no timer runs.
 * Otherwise a window of `limit` chips is displayed, advancing by `step`
 * positions every `intervalMs` milliseconds in a deterministic sequence
 * so every model gets equal screen-time.
 *
 * The currently-selected model is always pinned into the visible window
 * (swapped into the last slot if it would otherwise be off-screen).
 *
 * @param {Array<{id:string}>} chips        – full ordered chip list
 * @param {object}             opts
 * @param {number}            [opts.limit=24]        – max visible chips
 * @param {number}            [opts.step=4]          – advance per tick
 * @param {number}            [opts.intervalMs=5000]  – ms between ticks
 * @param {string|null}       [opts.selectedModelId]  – always-visible id
 * @returns {Array}  visible chip slice (length ≤ limit)
 */
export function useRotatingModelChips(
  chips,
  { limit = 24, step = 4, intervalMs = 5000, selectedModelId = null } = {},
) {
  const [offset, setOffset] = useState(0);

  /* Reset offset when the chip list identity changes (models added/removed). */
  const prevLenRef = useRef(chips.length);
  useEffect(() => {
    if (chips.length !== prevLenRef.current) {
      setOffset(0);
      prevLenRef.current = chips.length;
    }
  }, [chips.length]);

  /* Advance the window on a fixed interval when rotation is needed. */
  const needsRotation = chips.length > limit;
  useEffect(() => {
    if (!needsRotation) return;
    const id = setInterval(() => {
      setOffset((prev) => (prev + step) % chips.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [needsRotation, chips.length, step, intervalMs]);

  /* Build the visible slice. */
  return useMemo(() => {
    if (chips.length <= limit) return chips;

    const visible = [];
    const seen = new Set();
    for (let i = 0; i < limit; i++) {
      const idx = (offset + i) % chips.length;
      visible.push(chips[idx]);
      seen.add(chips[idx].id);
    }

    /* Pin selected model — if it fell outside the window, swap it into the
       last position so the user always sees their current choice. */
    if (selectedModelId && !seen.has(selectedModelId)) {
      const pinned = chips.find((c) => c.id === selectedModelId);
      if (pinned) {
        visible[visible.length - 1] = pinned;
      }
    }

    return visible;
  }, [chips, limit, offset, selectedModelId]);
}
