import {
  SLOT, TICK_W_MIN, TICK_W_MID, TICK_W_MAX, PADV, NEEDLE_W, HOVER_MAX_W,
  messageLen, buildRailModel, widthStats, tickWidth,
  winCapacity, isWindowed, shownCount, groupTopPx,
  tickCenterY, indexAtY, recenterWindow, hiddenCounts, capCount,
  railExtent, fisheyeGain, readingPct,
} from "./minimap_rail_geometry";

const msg = (id, role, content, attachments) => ({ id, role, content, attachments });

describe("messageLen / buildRailModel", () => {
  test("len = content 长度 + 附件×60;缺字段安全为 0", () => {
    expect(messageLen(msg("a", "user", "hello"))).toBe(5);
    expect(messageLen(msg("a", "user", "hi", [1, 2]))).toBe(2 + 120);
    expect(messageLen({})).toBe(0);
    expect(messageLen(null)).toBe(0);
  });
  test("model 标记代码块与附件", () => {
    const model = buildRailModel([
      msg("a", "user", "问题"),
      msg("b", "assistant", "```js\nx\n```"),
      msg("c", "user", "图", [{}]),
    ]);
    expect(model[0]).toMatchObject({ id: "a", role: "user", hasCode: false, hasAttach: false });
    expect(model[1].hasCode).toBe(true);
    expect(model[2].hasAttach).toBe(true);
  });
});

describe("tickWidth 会话内归一", () => {
  test("最短→7px,最长→18px,中间单调", () => {
    const model = buildRailModel([
      msg("a", "user", "x".repeat(20)),
      msg("b", "assistant", "x".repeat(300)),
      msg("c", "assistant", "x".repeat(2000)),
    ]);
    const stats = widthStats(model);
    expect(tickWidth(model[0].len, stats)).toBeCloseTo(TICK_W_MIN, 5);
    expect(tickWidth(model[2].len, stats)).toBeCloseTo(TICK_W_MAX, 5);
    const mid = tickWidth(model[1].len, stats);
    expect(mid).toBeGreaterThan(TICK_W_MIN);
    expect(mid).toBeLessThan(TICK_W_MAX);
  });
  test("分布过窄 → 统一 12.5px;len≤10(流式空消息)不进统计、宽 7px", () => {
    const model = buildRailModel([
      msg("a", "user", "x".repeat(200)),
      msg("b", "assistant", "x".repeat(210)),
      msg("c", "assistant", ""), // 流式空消息
    ]);
    const stats = widthStats(model);
    expect(tickWidth(model[0].len, stats)).toBe(TICK_W_MID);
    expect(tickWidth(model[2].len, stats)).toBe(TICK_W_MIN);
  });
});

describe("窗口与定位(节距恒定)", () => {
  const usable = 500; // 容量 50
  test("容量 = floor(usable/SLOT),下限 10", () => {
    expect(winCapacity(usable)).toBe(50);
    expect(winCapacity(0)).toBe(10);
    expect(isWindowed(50, usable)).toBe(false);
    expect(isWindowed(51, usable)).toBe(true);
  });
  test("消息少 → 整组居中,轨道自然短", () => {
    // 10 条 × 10px = 100px,居中于 500px:groupTop = 6 + 200
    expect(groupTopPx(10, usable)).toBe(PADV + 200);
    expect(tickCenterY({ index: 0, winBase: 0, count: 10, usable })).toBe(PADV + 200 + SLOT / 2);
  });
  test("窗口模式:tickCenterY 减去 winBase;indexAtY 是其逆", () => {
    const count = 200, winBase = 80;
    const y = tickCenterY({ index: 95, winBase, count, usable });
    expect(indexAtY({ y, winBase, count, usable })).toBe(95);
  });
  test("indexAtY 夹在窗口与消息范围内", () => {
    expect(indexAtY({ y: -999, winBase: 80, count: 200, usable })).toBe(80);
    expect(indexAtY({ y: 9999, winBase: 80, count: 200, usable })).toBe(80 + 50 - 1);
    expect(indexAtY({ y: 9999, winBase: 0, count: 5, usable })).toBe(4);
  });
  test("recenterWindow 以视口中心居中并 clamp 到 [0, count-cap]", () => {
    expect(recenterWindow({ first: 100, last: 104, count: 200, usable })).toBe(77);
    expect(recenterWindow({ first: 0, last: 2, count: 200, usable })).toBe(0);
    expect(recenterWindow({ first: 198, last: 199, count: 200, usable })).toBe(150);
  });
  test("hiddenCounts 与 capCount", () => {
    expect(hiddenCounts({ winBase: 77, count: 200, usable })).toEqual({ above: 77, below: 73 });
    expect(capCount(999)).toBe("999");
    expect(capCount(1000)).toBe("999+");
  });
});

describe("railExtent 死区边界", () => {
  test("组范围 = groupTop .. groupTop + shown×SLOT", () => {
    const usable = 500; // 容量 50
    const e = railExtent(10, usable); // 10 条居中:top = 6+200
    expect(e.top).toBe(PADV + 200);
    expect(e.bottom).toBe(PADV + 200 + 10 * SLOT);
    const full = railExtent(200, usable); // 窗口模式:铺满
    expect(full.bottom - full.top).toBe(50 * SLOT);
  });
});

describe("位置针常量关系", () => {
  test("位置针最长,hover 上限不盖过它", () => {
    expect(NEEDLE_W).toBeGreaterThan(TICK_W_MAX);
    expect(HOVER_MAX_W).toBeGreaterThan(TICK_W_MAX);
    expect(HOVER_MAX_W).toBeLessThan(NEEDLE_W);
  });
});

describe("fisheyeGain / readingPct", () => {
  test("距离 0 → 1,远处 → →0,单调递减", () => {
    expect(fisheyeGain(0)).toBeCloseTo(1, 5);
    expect(fisheyeGain(30)).toBeLessThan(fisheyeGain(10));
    expect(fisheyeGain(500)).toBeLessThan(0.01);
  });
  test("readingPct 取整并 clamp", () => {
    expect(readingPct(0.634)).toBe(63);
    expect(readingPct(1.7)).toBe(100);
    expect(readingPct(-1)).toBe(0);
  });
});
