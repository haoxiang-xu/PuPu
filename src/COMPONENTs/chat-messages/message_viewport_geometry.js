export const TOP_LANDING_MARGIN = 12;

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

