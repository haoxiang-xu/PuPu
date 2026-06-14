import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DEFAULT_SAMPLE_INTERVAL_MS = 48;
const DEFAULT_SETTLE_DELAY_MS = 140;
const DEFAULT_TRANSITION_MS = 180;
const DEFAULT_KEYED_TRANSITION_MS = 300;

const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const normalizeFrame = (frame) => ({
  width: Math.max(0, Math.round(frame?.width || 0)),
  height: Math.max(0, Math.round(frame?.height || 0)),
});

const readWindowFrame = () =>
  normalizeFrame({
    width:
      typeof window !== "undefined"
        ? window.innerWidth || document?.documentElement?.clientWidth || 0
        : 0,
    height:
      typeof window !== "undefined"
        ? window.innerHeight || document?.documentElement?.clientHeight || 0
        : 0,
  });

const readNodeFrame = (node) => {
  if (!node || typeof node.getBoundingClientRect !== "function") {
    return readWindowFrame();
  }

  const rect = node.getBoundingClientRect();
  const frame = normalizeFrame(rect);

  if (frame.width === 0 && frame.height === 0) {
    return readWindowFrame();
  }

  return frame;
};

const framesEqual = (left, right) =>
  Boolean(left && right && left.width === right.width && left.height === right.height);

const useSmoothResizeFrame = ({
  instantResizeKey,
  keyedTransitionMs = DEFAULT_KEYED_TRANSITION_MS,
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  settleDelayMs = DEFAULT_SETTLE_DELAY_MS,
  transitionMs = DEFAULT_TRANSITION_MS,
} = {}) => {
  const containerRef = useRef(null);
  const sampleTimerRef = useRef(null);
  const settleTimerRef = useRef(null);
  const restoreTransitionTimerRef = useRef(null);
  const instantResizeKeyRef = useRef(instantResizeKey);
  const keyedTransitionActiveRef = useRef(false);
  const latestFrameRef = useRef(null);
  const [frame, setFrame] = useState(null);
  const [isKeyedTransitionActive, setIsKeyedTransitionActive] = useState(false);

  const safeKeyedTransitionMs = Math.max(0, keyedTransitionMs);
  const safeSampleIntervalMs = Math.max(0, sampleIntervalMs);
  const safeSettleDelayMs = Math.max(0, settleDelayMs);
  const safeTransitionMs = Math.max(0, transitionMs);

  const measureFrame = useCallback(
    () => readNodeFrame(containerRef.current),
    [],
  );

  const clearSampleTimer = useCallback(() => {
    if (sampleTimerRef.current) {
      clearTimeout(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
  }, []);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const clearRestoreTransitionTimer = useCallback(() => {
    if (restoreTransitionTimerRef.current) {
      clearTimeout(restoreTransitionTimerRef.current);
      restoreTransitionTimerRef.current = null;
    }
  }, []);

  const commitFrameValue = useCallback((nextFrame) => {
    const normalizedFrame = normalizeFrame(nextFrame);
    latestFrameRef.current = normalizedFrame;
    setFrame((currentFrame) =>
      framesEqual(currentFrame, normalizedFrame) ? currentFrame : normalizedFrame,
    );
  }, []);

  const finishKeyedTransitionAfter = useCallback((delayMs) => {
    clearRestoreTransitionTimer();
    restoreTransitionTimerRef.current = setTimeout(() => {
      restoreTransitionTimerRef.current = null;
      keyedTransitionActiveRef.current = false;
      commitFrameValue(measureFrame());
      setIsKeyedTransitionActive(false);
    }, Math.max(0, delayMs));
  }, [clearRestoreTransitionTimer, commitFrameValue, measureFrame]);

  const commitFrame = useCallback((nextFrame, options = {}) => {
    if (Number.isFinite(options.transitionMs)) {
      const nextTransitionMs = Math.max(0, options.transitionMs);
      keyedTransitionActiveRef.current = true;
      setIsKeyedTransitionActive(true);
      finishKeyedTransitionAfter(nextTransitionMs);
    }

    commitFrameValue(nextFrame);
  }, [commitFrameValue, finishKeyedTransitionAfter]);

  const refreshFrame = useCallback((options) => {
    clearSampleTimer();
    clearSettleTimer();
    commitFrame(measureFrame(), options);
  }, [clearSampleTimer, clearSettleTimer, commitFrame, measureFrame]);

  const scheduleResizeFrame = useCallback(() => {
    latestFrameRef.current = measureFrame();

    if (!sampleTimerRef.current) {
      sampleTimerRef.current = setTimeout(() => {
        sampleTimerRef.current = null;
        commitFrame(latestFrameRef.current || measureFrame());
      }, safeSampleIntervalMs);
    }

    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      clearSampleTimer();
      commitFrame(measureFrame());
    }, safeSettleDelayMs);
  }, [
    clearSampleTimer,
    clearSettleTimer,
    commitFrame,
    measureFrame,
    safeSampleIntervalMs,
    safeSettleDelayMs,
  ]);

  const scheduleObservedResizeFrame = useCallback(() => {
    if (keyedTransitionActiveRef.current) {
      return;
    }

    scheduleResizeFrame();
  }, [scheduleResizeFrame]);

  useLayoutEffect(() => {
    refreshFrame();
  }, [refreshFrame]);

  useLayoutEffect(() => {
    if (instantResizeKeyRef.current === instantResizeKey) {
      return;
    }

    instantResizeKeyRef.current = instantResizeKey;
    refreshFrame({ transitionMs: safeKeyedTransitionMs });
  }, [instantResizeKey, refreshFrame, safeKeyedTransitionMs]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    window.addEventListener("resize", scheduleResizeFrame);

    let resizeObserver = null;
    if (
      typeof ResizeObserver !== "undefined" &&
      containerRef.current
    ) {
      resizeObserver = new ResizeObserver(scheduleObservedResizeFrame);
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", scheduleResizeFrame);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearSampleTimer();
      clearSettleTimer();
      clearRestoreTransitionTimer();
    };
  }, [
    clearRestoreTransitionTimer,
    clearSampleTimer,
    clearSettleTimer,
    scheduleObservedResizeFrame,
    scheduleResizeFrame,
  ]);

  const frameStyle = useMemo(() => {
    const transition = [
      `width ${safeTransitionMs}ms ${EASING}`,
      `height ${safeTransitionMs}ms ${EASING}`,
      `transform ${safeTransitionMs}ms ${EASING}`,
    ].join(", ");

    if (!frame || isKeyedTransitionActive) {
      return {
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        transform: "translate3d(0, 0, 0)",
        transition: isKeyedTransitionActive ? "none" : transition,
      };
    }

    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      overflow: "hidden",
      transform: "translate3d(0, 0, 0)",
      transition,
      willChange: "width, height, transform",
    };
  }, [frame, isKeyedTransitionActive, safeTransitionMs]);

  return {
    containerRef,
    frame,
    frameStyle,
    refreshFrame,
  };
};

export default useSmoothResizeFrame;
