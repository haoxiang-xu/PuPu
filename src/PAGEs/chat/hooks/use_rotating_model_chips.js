import { useEffect, useMemo, useRef, useState } from "react";

/* Defaults for the new-chat model chips. Tune here. */
export const MODEL_CHIP_LIMIT = 16;
export const MODEL_CHIP_SWAP_COUNT = 3;
export const MODEL_CHIP_INTERVAL_MS = 7000;

const pickRandom = (items, count, random) => {
  const pool = items.slice();
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
};

/**
 * Reconcile the previous slot ids with the current chip list: keep every id
 * that still exists in its slot, make sure the pinned id is visible, then fill
 * empty slots with random chips that are not on screen yet.
 */
export const reconcileModelChipSlots = (
  previous,
  chips,
  { limit, pinnedId = null, random = Math.random },
) => {
  const ids = chips.map((chip) => chip.id);
  if (ids.length <= limit) return ids;
  const known = new Set(ids);
  const slots = previous.slice(0, limit).map((id) => (known.has(id) ? id : null));
  while (slots.length < limit) slots.push(null);

  const seen = new Set();
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i] !== null && seen.has(slots[i])) slots[i] = null;
    if (slots[i] !== null) seen.add(slots[i]);
  }

  if (pinnedId && known.has(pinnedId) && !seen.has(pinnedId)) {
    let target = slots.indexOf(null);
    if (target < 0) target = slots.length - 1;
    if (slots[target] !== null) seen.delete(slots[target]);
    slots[target] = pinnedId;
    seen.add(pinnedId);
  }

  const empty = slots.reduce((acc, id, i) => (id === null ? [...acc, i] : acc), []);
  const fill = pickRandom(
    ids.filter((id) => !seen.has(id)),
    empty.length,
    random,
  );
  empty.forEach((slotIndex, i) => {
    slots[slotIndex] = fill[i];
  });
  return slots;
};

/** Replace `count` random non-pinned slots with random off-screen chips. */
export const swapModelChipSlots = (
  slots,
  chips,
  { count, pinnedId = null, random = Math.random },
) => {
  const visible = new Set(slots);
  const hidden = chips.map((chip) => chip.id).filter((id) => !visible.has(id));
  const candidates = slots
    .map((id, index) => ({ id, index }))
    .filter(({ id }) => id !== pinnedId);
  const n = Math.min(count, hidden.length, candidates.length);
  if (n <= 0) return slots;
  const outgoing = pickRandom(candidates, n, random);
  const incoming = pickRandom(hidden, n, random);
  const next = slots.slice();
  outgoing.forEach(({ index }, i) => {
    next[index] = incoming[i];
  });
  return next;
};

/**
 * Random rotation for the new-chat model chips.
 *
 * At most `limit` chips are on screen. When there are more models than that,
 * every `intervalMs` a random `swapCount` of the visible chips are replaced in
 * place by random models that are not on screen. Slots keep their position
 * (and React key), so a swap only changes what one slot shows; the caller
 * animates that change. With `limit` or fewer models, all of them are shown
 * and nothing rotates.
 *
 * The selected model is always visible and never swapped out. Rotation pauses
 * while `paused` is true (e.g. the pointer is over the chips) and while the
 * window is hidden.
 *
 * @returns {Array<{slot:number, chip:object}>}
 */
export function useRotatingModelChips(
  chips,
  {
    limit = MODEL_CHIP_LIMIT,
    swapCount = MODEL_CHIP_SWAP_COUNT,
    intervalMs = MODEL_CHIP_INTERVAL_MS,
    selectedModelId = null,
    paused = false,
  } = {},
) {
  const chipKey = chips.map((chip) => chip.id).join("\u0000");
  const [slots, setSlots] = useState(() =>
    reconcileModelChipSlots([], chips, { limit, pinnedId: selectedModelId }),
  );

  /* Reconcile when models come and go or the selection moves. Done during
     render (not in an effect) so the first paint already has the right set. */
  const reconcileKeyRef = useRef(`${chipKey}|${selectedModelId}|${limit}`);
  const reconcileKey = `${chipKey}|${selectedModelId}|${limit}`;
  let currentSlots = slots;
  if (reconcileKeyRef.current !== reconcileKey) {
    reconcileKeyRef.current = reconcileKey;
    currentSlots = reconcileModelChipSlots(slots, chips, {
      limit,
      pinnedId: selectedModelId,
    });
    if (currentSlots.join("\u0000") !== slots.join("\u0000")) {
      setSlots(currentSlots);
    }
  }

  const needsRotation = chips.length > limit;
  const latestRef = useRef({ chips, selectedModelId, swapCount });
  latestRef.current = { chips, selectedModelId, swapCount };

  useEffect(() => {
    if (!needsRotation || paused) return undefined;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const latest = latestRef.current;
      setSlots((previous) =>
        swapModelChipSlots(previous, latest.chips, {
          count: latest.swapCount,
          pinnedId: latest.selectedModelId,
        }),
      );
    }, intervalMs);
    return () => clearInterval(id);
  }, [needsRotation, paused, intervalMs]);

  return useMemo(() => {
    const byId = new Map(chips.map((chip) => [chip.id, chip]));
    return currentSlots
      .map((id, slot) => ({ slot, chip: byId.get(id) }))
      .filter((entry) => entry.chip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlots, chipKey]);
}
