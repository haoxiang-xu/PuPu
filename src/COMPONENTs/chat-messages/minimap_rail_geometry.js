// 语义等距轨的纯几何。宪法(spec §0):刻度几何只依赖消息数据(序号/字数/角色),
// 永不读取 DOM 测量。spec: docs/superpowers/specs/2026-07-10-minimap-semantic-rail.md
export const SLOT = 10;        // 节距,恒定
export const TICK_H = 2.5;     // 刻度高,恒定
export const TICK_W_MIN = 7;
export const TICK_W_MID = 12.5;
export const TICK_W_MAX = 18;
export const TRACK_W = 26;
export const PADV = 6;
export const NEEDLE_W = 26; // 位置针:视口顶部所在的刻度拉到最长
export const HOVER_MAX_W = 22; // hover 长度延伸上限(不盖过位置针)
export const FISHEYE_W_BONUS = 8; // hover 只变长,不加粗
export const CRAWL_EDGE_PX = 16;
export const CRAWL_STEP_MS = 80;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clamp01 = (v) => clamp(v, 0, 1);

export function messageLen(message) {
  const len =
    message && typeof message.content === "string" ? message.content.length : 0;
  const attachments =
    message && Array.isArray(message.attachments) ? message.attachments.length : 0;
  return len + attachments * 60;
}

export function buildRailModel(messages) {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    len: messageLen(m),
    hasCode: typeof m.content === "string" && m.content.indexOf("```") !== -1,
    hasAttach: Array.isArray(m.attachments) && m.attachments.length > 0,
  }));
}

// 会话内相对归一:lo/hi 取 log2(1+len/40) 的最小/最大;len≤10(流式空消息)不进统计
export function widthStats(model) {
  let lo = Infinity;
  let hi = -Infinity;
  model.forEach((it) => {
    if (it.len <= 10) return;
    const v = Math.log2(1 + it.len / 40);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  });
  if (!Number.isFinite(lo)) return { lo: 0, hi: 1 };
  return { lo, hi };
}

export function tickWidth(len, stats) {
  if (len <= 10) return TICK_W_MIN;
  if (stats.hi - stats.lo < 0.3) return TICK_W_MID; // 分布过窄:不让噪声假装信息
  const v = Math.log2(1 + len / 40);
  return (
    TICK_W_MIN +
    (TICK_W_MAX - TICK_W_MIN) * clamp01((v - stats.lo) / (stats.hi - stats.lo))
  );
}

export function winCapacity(usable) {
  return Math.max(10, Math.floor(usable / SLOT));
}
export function isWindowed(count, usable) {
  return count > winCapacity(usable);
}
export function shownCount(count, usable) {
  return Math.min(count, winCapacity(usable));
}
export function groupTopPx(count, usable) {
  return PADV + (usable - shownCount(count, usable) * SLOT) / 2;
}
export function tickCenterY({ index, winBase, count, usable }) {
  const base = isWindowed(count, usable) ? winBase : 0;
  return groupTopPx(count, usable) + (index - base) * SLOT + SLOT / 2;
}
export function indexAtY({ y, winBase, count, usable }) {
  const base = isWindowed(count, usable) ? winBase : 0;
  const i = base + Math.floor((y - groupTopPx(count, usable)) / SLOT);
  const hi = Math.min(count - 1, base + shownCount(count, usable) - 1);
  return clamp(i, Math.max(0, base), Math.max(0, hi));
}
export function recenterWindow({ first, last, count, usable }) {
  const cap = winCapacity(usable);
  return clamp(
    Math.round((first + last) / 2 - cap / 2),
    0,
    Math.max(0, count - cap),
  );
}
export function hiddenCounts({ winBase, count, usable }) {
  const cap = winCapacity(usable);
  return {
    above: Math.max(0, winBase),
    below: Math.max(0, count - winBase - cap),
  };
}
export function capCount(n) {
  return n > 999 ? "999+" : String(n);
}

// 刻度组的实际纵向范围(轨道内坐标)。组外是死区:不触发 hover/点击/起拖
export function railExtent(count, usable) {
  const top = groupTopPx(count, usable);
  return { top, bottom: top + shownCount(count, usable) * SLOT };
}

export function fisheyeGain(dist) {
  const sigma = Math.max(20, SLOT * 2.6);
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

export function readingPct(fBot) {
  return Math.round(clamp01(fBot) * 100);
}
