import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import { useDropdownWheelGuard } from "../../../BUILTIN_COMPONENTs/select/use_select";
import ContextCompositionPanel, {
  useContextCompositionPalette,
} from "../../chat-bubble/context-composition/context_composition_panel";
import { selectContextCompositionView } from "../../../SERVICEs/context_composition_v1";

/* The box must stay exactly PILL_HEIGHT square (attach_panel.js): every
   icon-only control on that row is 32×32, and a 30px one silently breaks the
   row's rhythm. The ring is drawn smaller than the box so its visual weight
   lands near the 16px icons beside it rather than filling the whole square. */
const SIZE = 32;
const STROKE_WIDTH = 2.5;
const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const pressureColor = (pressure, highlight) => {
  if (pressure >= 0.9) return "#E66A6A";
  if (pressure >= 0.75) return "#D9A441";
  return highlight || "#6F88E8";
};

const ContextCompositionProgress = forwardRef(
  ({ bundle, usageView = null, isDark = false, highlight }, ref) => {
    const [open, setOpen] = useState(false);
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

    // Usage receipts exist on every call; composition only once the runtime
    // instruments a source. Render on either, and take pressure from whichever
    // is present — they measure the same ratio, but usage is the one that is
    // reliably there.
    if (!view && !usageView) return null;

    const pressureSource =
      usageView && usageView.percentageAvailable ? usageView : view;
    const hasPressure =
      Boolean(pressureSource) &&
      pressureSource.percentageAvailable === true &&
      typeof pressureSource.windowPressure === "number" &&
      Number.isFinite(pressureSource.windowPressure);
    const pressure = hasPressure
      ? Math.max(0, pressureSource.windowPressure)
      : null;
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

    /* Tooltip is only the placement engine; the card paints itself in the
       attach-panel menu language — the frosted palette surface that the model,
       plugin and workspace selectors beside it all use. Values mirror the
       palette branch of BUILTIN select's dropdown verbatim (width 300 with the
       rail, 8px inset, r22, blur(20px) saturate(130%)) so this reads as one
       more menu on that bar rather than a second popup style. */
    const card = (
      <div
        ref={panelRef}
        data-testid="context-composition-popover"
        style={{
          boxSizing: "border-box",
          width: 300,
          maxWidth: "calc(100vw - 40px)",
          // Panel now owns its own internal height animation (it slides
          // between two always-mounted scopes and sizes itself to whichever is
          // active) — this only needs to be a hard outer ceiling for the rare
          // case that somehow still exceeds it, so it stays static.
          maxHeight: "min(64vh, 480px)",
          display: "flex",
          flexDirection: "column",
          // Roomier than the selectors' 8px inset — this panel carries a
          // headline, a bar and a long list rather than a flat option list, so
          // it needs more air. The radius stays at the palette family's 22:
          // the outline is what reads as "same menu", so it wins over matching
          // the row radius. Rows go to r10 to stay concentric (22 − 12).
          //
          // Top gets 20 rather than 12 so the inset READS even: every inner
          // block carries its own 8px so rows can hold a hover wash, which puts
          // text 20px from the left and right edges. A flat 12 all round looks
          // top-heavy because only the sides get that extra 8.
          padding: "20px 12px 12px",
          borderRadius: 22,
          backgroundColor: isDark
            ? "rgba(var(--pupu-surface-rgb),0.85)"
            : "rgba(var(--pupu-surface-rgb),0.9)",
          /* blurred surfaces always carry an edge */
          border: isDark
            ? "1px solid rgba(var(--pupu-text-rgb),0.10)"
            : "1px solid rgba(var(--pupu-text-rgb),0.09)",
          backdropFilter: "blur(20px) saturate(130%)",
          WebkitBackdropFilter: "blur(20px) saturate(130%)",
          boxShadow: isDark
            ? "0 10px 34px rgba(0,0,0,0.5)"
            : "0 10px 34px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}
      >
        <ContextCompositionPanel
          bundle={bundle}
          usageView={usageView}
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
        <Button
          ref={triggerRef}
          ariaLabel={label}
          title={label}
          onClick={() => {}}
          dom_props={{
            "data-testid": "context-composition-progress",
            "data-context-pressure":
              displayPercent === null ? "unavailable" : String(displayPercent),
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            // Same guard selectWrap gives the other selectors on this row: without
            // preventDefault, mousedown moves focus to the button by default and
            // blurs the composer's textarea. That drops `focused`, which drops
            // `floating` in attach_panel, which collapses the row BETWEEN
            // mousedown and mouseup — so the click lands on collapsed layout
            // instead of the ring and never opens the popover, and the panel is
            // left looking inactive. stopPropagation alone (the ring's original
            // guard) only keeps the attach panel's own background-drag handler
            // from firing; it does nothing about the browser's default focus
            // shift, which is the actual cause here.
            onMouseDown: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
          }}
          style={{
            /* Zero padding lets the ring itself define the box, which must stay
               PILL_HEIGHT square like every other icon control on this row.
               Everything else — the scale-in wash, the pressed inset, focus and
               disabled handling — comes from Button, so this control cannot
               drift from its neighbours the way a hand-rolled one would. */
            paddingVertical: 0,
            paddingHorizontal: 0,
            iconOnlyPaddingVertical: 0,
            iconOnlyPaddingHorizontal: 0,
            borderRadius: 999,
            color: ringColor,
            content: {
              children: { display: "inline-flex", lineHeight: 0 },
            },
          }}
        >
          <span
            style={{
              position: "relative",
              width: SIZE,
              height: SIZE,
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
              style={{ display: "block" }}
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
                stroke={ringColor}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={
                  pressure === null ? "2 4.5" : String(CIRCUMFERENCE)
                }
                strokeDashoffset={
                  pressure === null ? 0 : CIRCUMFERENCE * (1 - clampedPressure)
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
          </span>
        </Button>
      </Tooltip>
    );
  },
);

ContextCompositionProgress.displayName = "ContextCompositionProgress";

export default ContextCompositionProgress;
