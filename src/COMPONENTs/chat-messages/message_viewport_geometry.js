export const TOP_LANDING_MARGIN = 12;
export const CURRENT_MESSAGE_EPSILON = 16;

const finiteNumber = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function computeEffectiveViewportHeight(clientHeight = 0, bottomInset = 0) {
  const safeClientHeight = Math.max(0, finiteNumber(clientHeight));
  const safeBottomInset = Math.max(0, finiteNumber(bottomInset));
  return Math.max(0, safeClientHeight - safeBottomInset);
}

export function computeLandingTop({
  offsetTop,
  within = 0,
  align = "top",
  viewportHeight = 0,
  bottomInset = 0,
}) {
  const effectiveViewportHeight = computeEffectiveViewportHeight(
    viewportHeight,
    bottomInset,
  );
  const margin =
    align === "center" ? effectiveViewportHeight / 2 : TOP_LANDING_MARGIN;
  return Math.max(0, offsetTop + within - margin);
}

export function computeMinimapFrame({
  absTop = 0,
  viewportHeight = 0,
  bottomInset = 0,
  scale = 1,
  mapHeight = 0,
  usable = 0,
  offset = 0,
  pad = 0,
  gap = 0,
  minBoxHeight = 20,
}) {
  const safeScale = Math.max(0, finiteNumber(scale, 1));
  const safeMapHeight = Math.max(0, finiteNumber(mapHeight));
  const safeUsable = Math.max(0, finiteNumber(usable));
  const safeOffset = Math.max(0, finiteNumber(offset));
  const safePad = Math.max(0, finiteNumber(pad));
  const safeGap = Math.max(0, finiteNumber(gap));
  const safeMinBoxHeight = Math.max(0, finiteNumber(minBoxHeight, 20));
  const effectiveViewportHeight = computeEffectiveViewportHeight(
    viewportHeight,
    bottomInset,
  );
  const boxHeight = Math.max(
    safeMinBoxHeight,
    effectiveViewportHeight * safeScale,
  );
  const boxTop = clamp(
    finiteNumber(absTop) * safeScale,
    0,
    safeMapHeight - boxHeight,
  );
  const trackHeight = safeUsable + 2 * safePad;
  const visualHeight = Math.min(boxHeight + 2 * safeGap, trackHeight);
  const visualTop = clamp(
    safePad + boxTop - safeOffset - safeGap,
    0,
    trackHeight - visualHeight,
  );

  return {
    viewportHeight: effectiveViewportHeight,
    boxHeight,
    boxTop,
    visualTop,
    visualHeight,
    styleTop: visualTop + safeOffset,
  };
}

export function findCurrentMessageIndex({
  offsets = [],
  total = 0,
  contentY = 0,
  epsilon = CURRENT_MESSAGE_EPSILON,
}) {
  if (!offsets.length) return 0;
  const safeY = clamp(
    finiteNumber(contentY) + Math.max(0, finiteNumber(epsilon)),
    0,
    Math.max(0, finiteNumber(total) - 1),
  );
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= safeY) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
