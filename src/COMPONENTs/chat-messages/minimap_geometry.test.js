import {
  MIN_SEG, GAP, PAD, DEFAULT_CALIB,
  median, estimateHeight, calibrate, buildHeights,
  cumulativeOffsets, pickScale, slideOffset, visibleCounts,
  capCount, indexAtContentY, absScrollTop,
  dragScrollGeometry,
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

describe("dragScrollGeometry", () => {
  // off 冻结 + 框锁窗口内 + 跟手指 1:1
  const base = { usable: 200, MH: 400, boxH: 40, scale: 0.5 };

  it("中段:框跟手指 1:1,boxTop = boxVisualTop + off0", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 100, off0: 50, grabOffset: 10, ...base,
    });
    // boxVisualTop = clamp(100-10, 0, 200-40=160) = 90
    // boxTop = 90 + 50 = 140; absTop = 140/0.5 = 280
    expect(r.boxVisualTop).toBe(90);
    expect(r.boxTop).toBe(140);
    expect(r.absTop).toBe(280);
  });

  it("框锁在窗口顶(cursor 过高 → boxVisualTop clamp 到 0)", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 5, off0: 50, grabOffset: 20, ...base,
    });
    // 5-20 = -15 → clamp 0; boxTop = 0 + 50 = 50; absTop = 100
    expect(r.boxVisualTop).toBe(0);
    expect(r.boxTop).toBe(50);
    expect(r.absTop).toBe(100);
  });

  it("框锁在窗口底(cursor 超 usable → boxVisualTop clamp 到 usable-boxH)", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 300, off0: 0, grabOffset: 0, ...base,
    });
    // clamp(300, 0, 160) = 160; boxTop = 160; absTop = 320
    expect(r.boxVisualTop).toBe(160);
    expect(r.boxTop).toBe(160);
    expect(r.absTop).toBe(320);
  });

  it("非溢出(off0=0):退化为整条轨道自由移动", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 80, off0: 0, grabOffset: 0, ...base,
    });
    expect(r.boxVisualTop).toBe(80);
    expect(r.boxTop).toBe(80);
    expect(r.absTop).toBe(160);
  });

  it("boxTop 不超过内容边界 MH-boxH", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 200, off0: 300, grabOffset: 0,
      usable: 200, MH: 360, boxH: 40, scale: 0.9,
    });
    // boxVisualTop = clamp(200,0,160)=160; boxTop = 160+300=460 → clamp(_,0,320)=320
    expect(r.boxTop).toBe(320);
  });

  it("boxH 大于 usable(极小轨道):maxVisual=0,框定死顶部", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 50, off0: 0, grabOffset: 0,
      usable: 30, MH: 400, boxH: 40, scale: 0.5,
    });
    // maxVisual=0 → boxVisualTop=0 → boxTop=off0=0 → absTop=0
    expect(r.boxVisualTop).toBe(0);
    expect(r.boxTop).toBe(0);
    expect(r.absTop).toBe(0);
  });

  it("scale=0 守卫:absTop 不为 NaN", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 50, off0: 0, grabOffset: 0,
      usable: 200, MH: 0, boxH: 40, scale: 0,
    });
    expect(r.absTop).toBe(0);
  });

  it("grabOffset 为负(抓在框外上方):框落到 cursor 下方,纯函数不设限", () => {
    const r = dragScrollGeometry({
      cursorTrackY: 50, off0: 0, grabOffset: -20, ...base,
    });
    // boxVisualTop = clamp(50-(-20), 0, 160) = 70; boxTop = 70; absTop = 140
    expect(r.boxVisualTop).toBe(70);
    expect(r.boxTop).toBe(70);
    expect(r.absTop).toBe(140);
  });
});
