import { act, renderHook } from "@testing-library/react";
import {
  reconcileModelChipSlots,
  swapModelChipSlots,
  useRotatingModelChips,
} from "./use_rotating_model_chips";

const makeChips = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, label: `model-${i}` }));

/* deterministic "random" for repeatable picks */
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("reconcileModelChipSlots", () => {
  test("shows every chip when there are no more than the limit", () => {
    expect(reconcileModelChipSlots([], makeChips(5), { limit: 16 })).toEqual([
      "m0", "m1", "m2", "m3", "m4",
    ]);
  });

  test("fills exactly `limit` distinct slots from a larger list", () => {
    const slots = reconcileModelChipSlots([], makeChips(40), { limit: 16 });
    expect(slots).toHaveLength(16);
    expect(new Set(slots).size).toBe(16);
  });

  test("keeps surviving chips in place and refills removed ones", () => {
    const chips = makeChips(30);
    const previous = reconcileModelChipSlots([], chips, { limit: 16, random: seq(0) });
    const removed = previous[3];
    const next = reconcileModelChipSlots(
      previous,
      chips.filter((chip) => chip.id !== removed),
      { limit: 16 },
    );
    expect(next).toHaveLength(16);
    expect(next).not.toContain(removed);
    previous.forEach((id, i) => {
      if (i !== 3) expect(next[i]).toBe(id);
    });
  });

  test("pins the selected model into view", () => {
    const chips = makeChips(30);
    const previous = reconcileModelChipSlots([], chips, { limit: 16, random: seq(0) });
    const hidden = chips.map((c) => c.id).find((id) => !previous.includes(id));
    const next = reconcileModelChipSlots(previous, chips, { limit: 16, pinnedId: hidden });
    expect(next).toContain(hidden);
    expect(new Set(next).size).toBe(16);
  });
});

describe("swapModelChipSlots", () => {
  test("replaces `count` slots in place with off-screen chips, never the pinned one", () => {
    const chips = makeChips(30);
    const slots = chips.slice(0, 16).map((c) => c.id);
    for (let run = 0; run < 50; run += 1) {
      const next = swapModelChipSlots(slots, chips, { count: 3, pinnedId: "m0" });
      expect(next).toHaveLength(16);
      expect(next[0]).toBe("m0");
      expect(new Set(next).size).toBe(16);
      const changed = next.filter((id, i) => id !== slots[i]);
      expect(changed).toHaveLength(3);
      changed.forEach((id) => expect(slots).not.toContain(id));
    }
  });

  test("does nothing when there is nothing off screen", () => {
    const chips = makeChips(10);
    const slots = chips.map((c) => c.id);
    expect(swapModelChipSlots(slots, chips, { count: 3 })).toBe(slots);
  });
});

describe("useRotatingModelChips", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("does not rotate when every model fits", () => {
    const chips = makeChips(12);
    const { result } = renderHook(() =>
      useRotatingModelChips(chips, { limit: 16, intervalMs: 1000 }),
    );
    const before = result.current.map((s) => s.chip.id);
    act(() => jest.advanceTimersByTime(5000));
    expect(result.current.map((s) => s.chip.id)).toEqual(before);
    expect(before).toHaveLength(12);
  });

  test("swaps a few chips each interval and pauses while paused", () => {
    const chips = makeChips(40);
    const { result, rerender } = renderHook(
      ({ paused }) =>
        useRotatingModelChips(chips, {
          limit: 16,
          swapCount: 3,
          intervalMs: 1000,
          selectedModelId: "m7",
          paused,
        }),
      { initialProps: { paused: false } },
    );
    const before = result.current.map((s) => s.chip.id);
    expect(before).toHaveLength(16);
    expect(before).toContain("m7");
    expect(result.current.map((s) => s.slot)).toEqual([...Array(16).keys()]);

    act(() => jest.advanceTimersByTime(1000));
    const after = result.current.map((s) => s.chip.id);
    expect(after.filter((id, i) => id !== before[i])).toHaveLength(3);
    expect(after).toContain("m7");

    rerender({ paused: true });
    act(() => jest.advanceTimersByTime(5000));
    expect(result.current.map((s) => s.chip.id)).toEqual(after);
  });
});
