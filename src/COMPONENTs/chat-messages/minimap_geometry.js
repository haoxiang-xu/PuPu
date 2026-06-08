// 聊天 minimap 的纯几何 + 高度估算。无 React、无 DOM。坐标单位:
//   content px  = 聊天容器内的真实/估算像素
//   minimap px  = content px × scale(轨道内坐标)

export const MIN_SEG = 7; // 最小可辨识段高(minimap px)
export const GAP = 7; // 框上下各外扩(使四边间距与左右一致、首尾留白更足)
export const PAD = GAP + 1; // 裁剪安全边距,保证框两端不被 overflow:hidden 切掉

// 估算参数默认值(运行时会被真实测量校准)
export const DEFAULT_CALIB = { base: 40, slope: 0.32 };

export function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function estimateHeight(message, calib = DEFAULT_CALIB) {
  const len =
    message && typeof message.content === "string" ? message.content.length : 0;
  const attachments =
    message && Array.isArray(message.attachments) ? message.attachments.length : 0;
  return calib.base + calib.slope * len + attachments * 120;
}

// 从已测量样本反推 slope(中位),样本不足回退默认
export function calibrate(samples, fallback = DEFAULT_CALIB) {
  const usable = samples.filter((s) => s.len > 0 && s.height > 0);
  if (usable.length < 3) return fallback;
  const slope = median(usable.map((s) => s.height / s.len));
  return { base: fallback.base, slope: slope > 0 ? slope : fallback.slope };
}

export function buildHeights(messages, cache, calib = DEFAULT_CALIB) {
  return messages.map((m) => {
    const cached = cache.get(m.id);
    return typeof cached === "number" && cached > 0 ? cached : estimateHeight(m, calib);
  });
}

export function cumulativeOffsets(heights) {
  const offsets = new Array(heights.length);
  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = acc;
    acc += heights[i];
  }
  return { offsets, total: acc };
}

export function pickScale({ total, usable, medianHeight, minSeg = MIN_SEG }) {
  if (total <= 0 || usable <= 0) return 1;
  const fit = usable / total;
  const desired = medianHeight > 0 ? minSeg / medianHeight : fit;
  return Math.max(fit, desired);
}

export function slideOffset({ boxTop, boxHeight, usable, MH }) {
  if (MH <= usable) return 0;
  const raw = boxTop + boxHeight / 2 - usable / 2;
  return Math.min(Math.max(0, raw), MH - usable);
}

export function visibleCounts({ offsets, heights, scale, off, usable }) {
  let above = 0;
  let below = 0;
  for (let i = 0; i < offsets.length; i++) {
    const y = offsets[i] * scale;
    const yEnd = y + heights[i] * scale;
    if (yEnd <= off + 2) above++;
    else if (y >= off + usable - 2) below++;
  }
  return { above, below };
}

export function capCount(n) {
  return n > 99 ? "99+" : String(n);
}

export function indexAtContentY({ offsets, total, contentY }) {
  if (!offsets.length) return 0;
  const y = Math.min(Math.max(0, contentY), Math.max(0, total - 1));
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= y) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function absScrollTop({ offsets, safeVisibleStart, scrollTop, firstNodeOffsetTop }) {
  const base = offsets[safeVisibleStart] || 0;
  return base + (scrollTop - firstNodeOffsetTop);
}

// 拖动几何:off 冻结为 off0,视口框跟手指 1:1 但锁在当前可见窗口内
// [0, usable-boxH]。返回 content-minimap 坐标 boxTop 与绝对滚动量 absTop。
// 框拖到窗口顶/底即止 —— 要露出更多 node 须松手让 off 归中(见 spec §2)。
export function dragScrollGeometry({
  cursorTrackY,
  off0,
  grabOffset,
  usable,
  MH,
  boxH,
  scale,
}) {
  const maxVisual = Math.max(0, usable - boxH);
  const boxVisualTop = Math.min(Math.max(0, cursorTrackY - grabOffset), maxVisual);
  const boxTop = Math.min(Math.max(0, boxVisualTop + off0), Math.max(0, MH - boxH));
  const absTop = scale > 0 ? boxTop / scale : 0;
  return { boxVisualTop, boxTop, absTop };
}
