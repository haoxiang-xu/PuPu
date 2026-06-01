import {
  MIN_SEG, GAP, PAD, DEFAULT_CALIB,
  median, estimateHeight, calibrate, buildHeights,
  cumulativeOffsets, pickScale, slideOffset, visibleCounts,
  capCount, indexAtContentY, absScrollTop,
} from "./minimap_geometry";

describe("minimap_geometry", () => {
  test("constants", () => {
    expect(GAP).toBe(7);
    expect(PAD).toBe(GAP + 1);
    expect(MIN_SEG).toBe(7);
  });

  test("median handles odd/even/empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  test("estimateHeight = base + slope*len + attachments*120", () => {
    expect(estimateHeight({ content: "abcd" }, { base: 40, slope: 0.5 })).toBe(42);
    expect(estimateHeight({ content: "ab", attachments: [{}, {}] }, { base: 40, slope: 0.5 }))
      .toBe(40 + 1 + 240);
    expect(estimateHeight({}, DEFAULT_CALIB)).toBe(DEFAULT_CALIB.base);
  });

  test("calibrate uses median slope when >=3 samples, else fallback", () => {
    const fb = { base: 40, slope: 0.3 };
    expect(calibrate([{ len: 10, height: 50 }], fb)).toEqual(fb);
    const c = calibrate(
      [{ len: 10, height: 10 }, { len: 10, height: 20 }, { len: 10, height: 30 }],
      fb,
    );
    expect(c.slope).toBeCloseTo(2, 5); // median of [1,2,3]
    expect(c.base).toBe(40);
  });

  test("buildHeights prefers cache over estimate", () => {
    const cache = new Map([["b", 999]]);
    const hs = buildHeights(
      [{ id: "a", content: "xx" }, { id: "b", content: "xx" }],
      cache,
      { base: 40, slope: 0 },
    );
    expect(hs).toEqual([40, 999]);
  });

  test("cumulativeOffsets", () => {
    expect(cumulativeOffsets([10, 20, 5])).toEqual({ offsets: [0, 10, 30], total: 35 });
    expect(cumulativeOffsets([])).toEqual({ offsets: [], total: 0 });
  });

  test("pickScale = max(fit, minSeg/median)", () => {
    // fit larger
    expect(pickScale({ total: 100, usable: 100, medianHeight: 50, minSeg: 7 })).toBe(1);
    // desired larger (long convo)
    expect(pickScale({ total: 1000, usable: 100, medianHeight: 10, minSeg: 7 }))
      .toBeCloseTo(0.7, 5);
  });

  test("slideOffset clamps; 0 when fits", () => {
    expect(slideOffset({ boxTop: 0, boxHeight: 20, usable: 100, MH: 80 })).toBe(0);
    // overflow, centered then clamped
    expect(slideOffset({ boxTop: 0, boxHeight: 20, usable: 100, MH: 300 })).toBe(0);
    expect(slideOffset({ boxTop: 250, boxHeight: 20, usable: 100, MH: 300 })).toBe(200);
    expect(slideOffset({ boxTop: 150, boxHeight: 20, usable: 100, MH: 300 })).toBe(110);
  });

  test("visibleCounts above/below the window", () => {
    // 3 segs each height 100 at scale 1; window [off=120, off+usable=220]
    const offsets = [0, 100, 200];
    const heights = [100, 100, 100];
    const { above, below } = visibleCounts({ offsets, heights, scale: 1, off: 120, usable: 100 });
    expect(above).toBe(1); // seg0 fully above
    expect(below).toBe(0); // seg2 starts at 200 < 220 → not below
  });

  test("capCount caps at 99+", () => {
    expect(capCount(0)).toBe("0");
    expect(capCount(99)).toBe("99");
    expect(capCount(100)).toBe("99+");
  });

  test("indexAtContentY binary search", () => {
    const offsets = [0, 100, 300];
    const total = 350;
    expect(indexAtContentY({ offsets, total, contentY: 0 })).toBe(0);
    expect(indexAtContentY({ offsets, total, contentY: 150 })).toBe(1);
    expect(indexAtContentY({ offsets, total, contentY: 320 })).toBe(2);
    expect(indexAtContentY({ offsets, total, contentY: 99999 })).toBe(2);
  });

  test("absScrollTop = offset[start] + (scrollTop - firstNodeOffsetTop)", () => {
    expect(absScrollTop({
      offsets: [0, 100, 250], safeVisibleStart: 1, scrollTop: 30, firstNodeOffsetTop: 10,
    })).toBe(120);
  });
});
