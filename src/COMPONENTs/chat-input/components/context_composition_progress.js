import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import { useDropdownWheelGuard } from "../../../BUILTIN_COMPONENTs/select/use_select";
import ContextCompositionPanel, {
  useContextCompositionPalette,
} from "../../chat-bubble/context-composition/context_composition_panel";
import { selectContextCompositionView } from "../../../SERVICEs/context_composition_v1";

const SIZE = 30;
const STROKE_WIDTH = 2.6;
const RADIUS = 11;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const pressureColor = (pressure, highlight) => {
  if (pressure >= 0.9) return "#E66A6A";
  if (pressure >= 0.75) return "#D9A441";
  return highlight || "#6F88E8";
};

const ContextCompositionProgress = forwardRef(
  ({ bundle, isDark = false, highlight }, ref) => {
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const listRef = useRef(null);
    const palette = useContextCompositionPalette();

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

    useDropdownWheelGuard(open, panelRef, listRef);

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
      ? "rgba(255,255,255,0.15)"
      : "rgba(0,0,0,0.13)";
    const label =
      displayPercent === null
        ? "Open context usage; latest model call pressure unavailable"
        : `Open context usage; latest model call ${displayPercent}% full`;

    /* The card paints itself — Tooltip is only the placement engine here, the
       same way BUILTIN select drives its dropdown. Keeping the two on one
       mechanism is what makes this read as another attach-panel menu rather
       than a second, competing popup style. */
    const card = (
      <div
        ref={panelRef}
        data-testid="context-composition-popover"
        style={{
          width: 340,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "min(64vh, 480px)",
          display: "flex",
          flexDirection: "column",
          padding: "12px 12px 4px",
          borderRadius: 10,
          border: "1px solid var(--pupu-menu-border, transparent)",
          backgroundColor: palette.background,
          boxShadow: isDark
            ? "0 12px 24px rgba(0, 0, 0, 0.34)"
            : "0 12px 20px rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
        }}
      >
        <ContextCompositionPanel
          bundle={bundle}
          open={open}
          palette={palette}
          listRef={listRef}
        />
      </div>
    );

    return (
      <Tooltip
        trigger={["click"]}
        position="top"
        align="start"
        offset={8}
        show_arrow={false}
        tooltip_component={card}
        open={open}
        on_open_change={setOpen}
        style={{
          padding: 0,
          backgroundColor: "transparent",
          boxShadow: "none",
          border: "none",
        }}
      >
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
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "relative",
            width: SIZE,
            height: SIZE,
            flex: `0 0 ${SIZE}px`,
            padding: 0,
            border: 0,
            borderRadius: 999,
            backgroundColor:
              hovered || open ? palette.hover : "transparent",
            color: ringColor,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.16s ease",
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
                pressure === null ? "2 4.5" : String(CIRCUMFERENCE)
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
              fontSize: displayPercent === null ? 11 : 9,
              fontWeight: 660,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: ringColor,
              pointerEvents: "none",
            }}
          >
            {displayPercent === null ? "–" : displayPercent}
          </span>
        </button>
      </Tooltip>
    );
  },
);

ContextCompositionProgress.displayName = "ContextCompositionProgress";

export default ContextCompositionProgress;
