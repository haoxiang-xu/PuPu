import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import ContextCompositionModal from "../../chat-bubble/context-composition/context_composition_modal";
import { selectContextCompositionView } from "../../../SERVICEs/context_composition_v1";

const SIZE = 32;
const STROKE_WIDTH = 3;
const RADIUS = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const pressureColor = (pressure, highlight) => {
  if (pressure >= 0.9) return "#E66A6A";
  if (pressure >= 0.75) return "#D9A441";
  return highlight || "#6F88E8";
};

const ContextCompositionProgress = forwardRef(
  ({ bundle, isDark = false, highlight }, ref) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const view = useMemo(
      () =>
        selectContextCompositionView(bundle, {
          scope: "model_call",
        }),
      [bundle],
    );

    useImperativeHandle(
      ref,
      () => ({
        open: () => setOpen(true),
        focus: () => triggerRef.current?.focus?.(),
      }),
      [],
    );

    if (!view) return null;

    const hasPressure =
      view.available === true &&
      view.percentageAvailable === true &&
      typeof view.windowPressure === "number" &&
      Number.isFinite(view.windowPressure);
    const pressure = hasPressure ? Math.max(0, view.windowPressure) : null;
    const clampedPressure = pressure === null ? 0 : Math.min(1, pressure);
    const displayPercent = pressure === null ? null : Math.round(pressure * 100);
    const ringColor =
      pressure === null
        ? isDark
          ? "rgba(255,255,255,0.42)"
          : "rgba(0,0,0,0.38)"
        : pressureColor(pressure, highlight);
    const trackColor = isDark
      ? "rgba(255,255,255,0.14)"
      : "rgba(0,0,0,0.12)";
    const label =
      displayPercent === null
        ? "Open context composition; latest model call pressure unavailable"
        : `Open context composition; latest model call ${displayPercent}% full`;

    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          data-testid="context-composition-progress"
          data-context-pressure={
            displayPercent === null ? "unavailable" : String(displayPercent)
          }
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={label}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          style={{
            position: "relative",
            width: SIZE,
            height: SIZE,
            flex: `0 0 ${SIZE}px`,
            padding: 0,
            border: 0,
            borderRadius: 999,
            background: "transparent",
            color: ringColor,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            aria-hidden="true"
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={trackColor}
              strokeWidth={STROKE_WIDTH}
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={
                pressure === null ? "2 4" : String(CIRCUMFERENCE)
              }
              strokeDashoffset={
                pressure === null
                  ? 0
                  : CIRCUMFERENCE * (1 - clampedPressure)
              }
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </svg>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Menlo, Monaco, Consolas, monospace",
              fontSize: displayPercent === null ? 10 : 8,
              fontWeight: 700,
              lineHeight: 1,
              color: ringColor,
              pointerEvents: "none",
            }}
          >
            {displayPercent === null ? "–" : displayPercent}
          </span>
        </button>
        <ContextCompositionModal
          open={open}
          onClose={() => setOpen(false)}
          bundle={bundle}
          returnFocusRef={triggerRef}
        />
      </>
    );
  },
);

ContextCompositionProgress.displayName = "ContextCompositionProgress";

export default ContextCompositionProgress;
