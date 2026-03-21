import { useCallback, useContext, useMemo, useState } from "react";

/* { Contexts } ----------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } ----------------------------------------------------------------------------------------------------------- */

/* { Components } --------------------------------------------------------------------------------------------------------- */
import AnimatedChildren from "../class/animated_children";
import ArcSpinner from "../spinner/arc_spinner";
/* { Components } --------------------------------------------------------------------------------------------------------- */

/* ── animation constants ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DOT_TRANSITION = `background 0.4s ${EASE}, border-color 0.4s ${EASE}, transform 0.4s ${EASE}, box-shadow 0.4s ${EASE}`;
const LINE_TRANSITION = `background 0.45s ${EASE}`;
const FILL_TRANSITION_DURATION = "0.6s";
/* ── animation constants ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── layout constants ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const TRACK_WIDTH = 24; // px — width of the left column (line + point)
const LINE_WIDTH = 1.5; // px — connecting line stroke width
const TITLE_LINE_H = 20; // px — explicit line-height of title text
const TITLE_CY = TITLE_LINE_H / 2; // 10px — vertical center of first title line

// Point radii — used to align the vertical center of each point with TITLE_CY
const DEFAULT_DOT_R = 4; // default 8 × 8 dot
const PRESET_DOT_R = 6; // start/end   12 × 12 dot
const LOADING_R = 8; // ArcSpinner  16 × 16

// Steps-mode layout
const STEP_DOT_R = 5; // default dot in steps mode
const STEP_RAIL_W = 2; // rail thickness
/* ── layout constants ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const resolveLineColor = (status, tl) => {
  if (status === "done") return tl.lineDoneColor ?? "rgba(10,186,181,0.85)";
  if (status === "active") return "rgba(10,186,181,0.38)";
  return tl.lineColor ?? "rgba(0,0,0,0.12)";
};

const resolvePointColor = (status, tl) => {
  if (status === "done" || status === "active")
    return tl.pointColor ?? "rgba(10,186,181,1)";
  return tl.pointPendingColor ?? "rgba(0,0,0,0.18)";
};

const getPointRadius = (point) => {
  if (point === "start" || point === "end") return PRESET_DOT_R;
  if (point === "loading") return LOADING_R;
  if (point != null && typeof point !== "string") return PRESET_DOT_R; // custom element — reasonable guess
  return DEFAULT_DOT_R;
};

const deriveStatus = (index, currentStep) => {
  if (index < currentStep) return "done";
  if (index === currentStep) return "active";
  return "pending";
};

const scalePx = (value, factor) => {
  const match = /^(-?\d*\.?\d+)px$/.exec(String(value).trim());
  if (!match) return value;
  return `${Math.round(Number(match[1]) * factor * 1000) / 1000}px`;
};

const resolveStepsMetrics = (compact) => ({
  titleLineH: compact ? 16 : TITLE_LINE_H,
  trackWidth: compact ? 20 : TRACK_WIDTH,
  presetDotR: compact ? 5 : PRESET_DOT_R,
  stepDotR: compact ? 4 : STEP_DOT_R,
  stepRailW: compact ? 1.5 : STEP_RAIL_W,
  rowMinH: compact ? 28 : 32,
  railRowH: compact ? 14 : STEP_DOT_R * 2 + 8,
  activeHalo: compact ? 3 : 4,
  doneHalo: compact ? 2.5 : 3,
  titleFontWeight: compact ? 400 : 500,
});

const getStepPointRadius = (point, metrics) => {
  if (point === "start" || point === "end") return metrics.presetDotR;
  if (point === "loading") return LOADING_R;
  if (point != null && typeof point !== "string") return metrics.presetDotR;
  return metrics.stepDotR;
};
/* ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── preset point shapes ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const DotDefault = ({ status, tl }) => {
  const active = status === "active";
  return (
    <div
      style={{
        width: DEFAULT_DOT_R * 2,
        height: DEFAULT_DOT_R * 2,
        borderRadius: "50%",
        background: resolvePointColor(status, tl),
        flexShrink: 0,
        transform: active ? "scale(1.25)" : "scale(1)",
        transition: DOT_TRANSITION,
      }}
    />
  );
};

const DotStart = ({ tl }) => {
  const color = tl.pointColor ?? "rgba(10,186,181,1)";
  return (
    <div
      style={{
        width: PRESET_DOT_R * 2,
        height: PRESET_DOT_R * 2,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 0 3px ${color}28`,
        transition: DOT_TRANSITION,
      }}
    />
  );
};

const DotEnd = ({ status, tl }) => {
  const color = resolvePointColor(status, tl);
  const glowing = status === "done" || status === "active";
  return (
    <div
      style={{
        width: PRESET_DOT_R * 2,
        height: PRESET_DOT_R * 2,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        boxShadow: glowing ? `0 0 0 3px ${color}28` : "none",
        transition: DOT_TRANSITION,
      }}
    />
  );
};
/* ── preset point shapes ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── StepDot (steps mode) ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const StepDot = ({ status, tl, point, bgColor, metrics, inactive_hollow }) => {
  const color = resolvePointColor(status, tl);
  const active = status === "active";
  const done = status === "done";

  /* custom ReactNode point — wrap in a masking container */
  if (point != null && typeof point !== "string") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transform: active ? "scale(1.3)" : "scale(1)",
          transition: DOT_TRANSITION,
          zIndex: 2,
        }}
      >
        {point}
      </div>
    );
  }

  /* loading spinner */
  if (point === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          zIndex: 2,
        }}
      >
        <ArcSpinner
          size={LOADING_R * 2}
          stroke_width={2}
          color={tl.pointColor ?? "rgba(10,186,181,1)"}
        />
      </div>
    );
  }

  /* built-in dot (default / start / end) */
  const r = getStepPointRadius(point, metrics);
  const isHollow = inactive_hollow && !active;

  return (
    <div
      style={{
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: isHollow
          ? bgColor
          : `linear-gradient(${color},${color}),${bgColor}`,
        border: isHollow ? `1.5px solid ${color}` : "none",
        boxSizing: "border-box",
        flexShrink: 0,
        transform: active ? "scale(1.3)" : "scale(1)",
        boxShadow: active
          ? `0 0 0 ${metrics.activeHalo}px ${color}22`
          : !isHollow && done && (point === "start" || point === "end")
            ? `0 0 0 ${metrics.doneHalo}px ${color}20`
            : "none",
        transition: DOT_TRANSITION,
        zIndex: 2,
      }}
    />
  );
};
/* ── StepDot (steps mode) ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── TimelineNode (private) ───────────────────────────────────────────────────────────────────────────────────────────────── */
const TimelineNode = ({
  item,
  index,
  total,
  isExpanded,
  onToggle,
  prevStatus, // null for first item; used to color the top line segment
  disconnect_line,
  disconnect_gap,
  tl,
}) => {
  const { title, span, details, point, status = "pending" } = item;

  /* ── resolve point element ── */
  const pointEl = useMemo(() => {
    if (point === "start") return <DotStart tl={tl} />;
    if (point === "end") return <DotEnd status={status} tl={tl} />;
    if (point === "loading")
      return (
        <ArcSpinner
          size={LOADING_R * 2}
          stroke_width={2}
          color={tl.pointColor ?? "rgba(10,186,181,1)"}
        />
      );
    if (point != null && typeof point !== "string") return point;
    return <DotDefault status={status} tl={tl} />;
  }, [point, status, tl]);

  const topDisconnectGap = disconnect_line && index !== 0 ? disconnect_gap : 0;
  const bottomDisconnectGap =
    disconnect_line && index !== total - 1 ? disconnect_gap : 0;

  /* ── top-line height: aligns point center with first title-line center ── */
  const topLineH = Math.max(
    0,
    TITLE_CY - getPointRadius(point) - topDisconnectGap,
  );

  /* ── line colors ── */
  const topLineColor =
    index === 0 || prevStatus === null
      ? "transparent"
      : resolveLineColor(prevStatus, tl);
  const bottomLineColor =
    index === total - 1 ? "transparent" : resolveLineColor(status, tl);

  const hasDetails = details != null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      {/* ══ Track column ══════════════════════════════════════════════════════ */}
      <div
        style={{
          width: TRACK_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* top line segment */}
        <div
          style={{
            width: LINE_WIDTH,
            height: topLineH,
            flexShrink: 0,
            background: topLineColor,
            transition: LINE_TRANSITION,
          }}
        />
        {/* optional disconnection gap above point */}
        {topDisconnectGap > 0 && (
          <div
            style={{
              width: LINE_WIDTH,
              height: topDisconnectGap,
              flexShrink: 0,
            }}
          />
        )}
        {/* point */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {pointEl}
        </div>
        {/* optional disconnection gap below point */}
        {bottomDisconnectGap > 0 && (
          <div
            style={{
              width: LINE_WIDTH,
              height: bottomDisconnectGap,
              flexShrink: 0,
            }}
          />
        )}
        {/* bottom line segment — stretches to fill remaining node height */}
        <div
          style={{
            flex: "1 1 auto",
            width: LINE_WIDTH,
            minHeight: index === total - 1 ? 0 : 16,
            background: bottomLineColor,
            transition: LINE_TRANSITION,
          }}
        />
      </div>

      {/* ══ Content column ════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          paddingLeft: 14,
          paddingBottom: index === total - 1 ? 4 : 22,
        }}
      >
        {/* title */}
        {title != null && (
          <div
            style={{
              fontSize: tl.titleFontSize ?? "14px",
              fontWeight: 500,
              color: tl.titleColor ?? "#222222",
              lineHeight: `${TITLE_LINE_H}px`,
              letterSpacing: "0.01em",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {title}
          </div>
        )}

        {/* span */}
        {span != null && (
          <div
            style={{
              fontSize: tl.fontSize ?? "13px",
              color: tl.spanColor ?? "rgba(0,0,0,0.45)",
              lineHeight: "18px",
              marginTop: title != null ? 2 : 0,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {span}
          </div>
        )}

        {/* see details toggle button */}
        {hasDetails && (
          <button
            onClick={onToggle}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 6,
              padding: "0",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: tl.fontSize ?? "13px",
              color: tl.seeDetailsColor ?? "rgba(10,186,181,1)",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
              outline: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.75";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            {isExpanded ? "Hide details" : "See details"}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              style={{
                transition: `transform 0.22s ${EASE}`,
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                flexShrink: 0,
              }}
            >
              <path
                d="M2 3.5 L5 6.5 L8 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {/* animated details content */}
        {hasDetails && (
          <AnimatedChildren open={isExpanded}>
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: tl.detailsBackground ?? "rgba(0,0,0,0.025)",
                fontSize: tl.fontSize ?? "13px",
                color: tl.spanColor ?? "rgba(0,0,0,0.45)",
              }}
            >
              {details}
            </div>
          </AnimatedChildren>
        )}
      </div>
    </div>
  );
};
/* ── TimelineNode (private) ───────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── HorizontalTimelineNode (private) ─────────────────────────────────────────────────────────────────────────────────────── */
const HorizontalTimelineNode = ({ item, index, total, tl }) => {
  const { title, span, point, status = "pending" } = item;

  const pointEl = useMemo(() => {
    if (point === "start") return <DotStart tl={tl} />;
    if (point === "end") return <DotEnd status={status} tl={tl} />;
    if (point === "loading")
      return (
        <ArcSpinner
          size={LOADING_R * 2}
          stroke_width={2}
          color={tl.pointColor ?? "rgba(10,186,181,1)"}
        />
      );
    if (point != null && typeof point !== "string") return point;
    return <DotDefault status={status} tl={tl} />;
  }, [point, status, tl]);

  const leftLineColor =
    index === 0 ? "transparent" : resolveLineColor(status, tl);
  const rightLineColor =
    index === total - 1 ? "transparent" : resolveLineColor(status, tl);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: 0,
      }}
    >
      {/* ══ Track row ═════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
          justifyContent: "center",
        }}
      >
        {/* left line */}
        <div
          style={{
            flex: 1,
            height: LINE_WIDTH,
            background: leftLineColor,
            transition: LINE_TRANSITION,
          }}
        />
        {/* point */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 2px",
          }}
        >
          {pointEl}
        </div>
        {/* right line */}
        <div
          style={{
            flex: 1,
            height: LINE_WIDTH,
            background: rightLineColor,
            transition: LINE_TRANSITION,
          }}
        />
      </div>

      {/* ══ Content ═══════════════════════════════════════════════════════════ */}
      <div
        style={{
          paddingTop: 8,
          textAlign: "center",
          minWidth: 0,
          width: "100%",
        }}
      >
        {title != null && (
          <div
            style={{
              fontSize: tl.titleFontSize ?? "14px",
              fontWeight: 500,
              color: tl.titleColor ?? "#222222",
              lineHeight: `${TITLE_LINE_H}px`,
              letterSpacing: "0.01em",
              userSelect: "none",
              WebkitUserSelect: "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
        )}
        {span != null && (
          <div
            style={{
              fontSize: tl.fontSize ?? "13px",
              color: tl.spanColor ?? "rgba(0,0,0,0.45)",
              lineHeight: "18px",
              marginTop: title != null ? 2 : 0,
              userSelect: "none",
              WebkitUserSelect: "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {span}
          </div>
        )}
      </div>
    </div>
  );
};
/* ── HorizontalTimelineNode (private) ─────────────────────────────────────────────────────────────────────────────────────── */

/* ── TimelineSteps (private) ──────────────────────────────────────────────────────────────────────────────────────────────── */
const TimelineSteps = ({
  items,
  current_step,
  step_progress,
  direction,
  tl,
  bgColor,
  disconnect_line,
  disconnect_gap,
  compact,
  inactive_hollow,
}) => {
  const total = items.length;
  const isHorizontal = direction === "horizontal";
  const metrics = useMemo(() => resolveStepsMetrics(compact), [compact]);
  const titleLineH = metrics.titleLineH;
  const titleFontSize = compact
    ? scalePx(tl.fontSize ?? "13px", 0.92)
    : tl.titleFontSize ?? "14px";
  const spanFontSize = scalePx(tl.fontSize ?? "13px", compact ? 0.92 : 1);

  /* fill percentage — (current_step + step_progress) / (total - 1) × 100 */
  const fillPct = useMemo(() => {
    if (total <= 1) return 0;
    const raw = (current_step + step_progress) / (total - 1);
    return Math.max(0, Math.min(1, raw)) * 100;
  }, [current_step, step_progress, total]);

  const railColor = tl.lineColor ?? "rgba(0,0,0,0.12)";
  const fillColor = tl.lineDoneColor ?? "rgba(10,186,181,0.85)";

  /* offset to center of first / last flex item — each item is 100/total % wide/tall */
  const edgeOffset = `${50 / total}%`;

  /* mask to punch transparent gaps around each dot center */
  const gap = disconnect_line ? (disconnect_gap ?? 6) : 0;
  const railMask = useMemo(() => {
    if (gap <= 0 || total <= 1) return undefined;
    /* each dot center sits at  (i + 0.5) / total * 100 %  along the rail's local axis */
    const stops = [];
    for (let i = 0; i < total; i++) {
      const center = ((i + 0.5) / total) * 100;
      /* map center from full-track space into the rail sub-region (edgeOffset .. 100%-edgeOffset) */
      const eo = 50 / total; // edgeOffset in %
      const railLen = 100 - 2 * eo; // rail length in %
      const pos = ((center - eo) / railLen) * 100; // position within rail 0..100%
      const halfGapPct = gap / 2; // px but used as a "spread" in the radial gradient
      const pointRadius = getStepPointRadius(items[i]?.point, metrics);
      stops.push(
        `radial-gradient(circle ${halfGapPct + pointRadius}px at ${isHorizontal ? `${pos}% 50%` : `50% ${pos}%`}, transparent ${halfGapPct + pointRadius - 0.5}px, black ${halfGapPct + pointRadius + 0.5}px)`,
      );
    }
    return stops.join(", ");
  }, [gap, total, isHorizontal, items, metrics]);

  const railMaskStyle = railMask
    ? {
        WebkitMaskImage: railMask,
        WebkitMaskComposite: "destination-in",
        maskImage: railMask,
        maskComposite: "intersect",
      }
    : {};

  if (total === 0) return null;

  /* ── Vertical steps ── */
  if (!isHorizontal) {
    return (
      <div
        style={{ display: "flex", flexDirection: "row", alignItems: "stretch" }}
      >
        {/* ══ Rail column ═════════════════════════════════════════════════════ */}
        <div
          style={{
            width: metrics.trackWidth,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* background rail */}
          <div
            style={{
              position: "absolute",
              top: edgeOffset,
              bottom: edgeOffset,
              left: "50%",
              transform: "translateX(-50%)",
              width: metrics.stepRailW,
              background: railColor,
              borderRadius: metrics.stepRailW / 2,
              ...railMaskStyle,
            }}
          />
          {/* animated fill */}
          <div
            style={{
              position: "absolute",
              top: edgeOffset,
              bottom: edgeOffset,
              left: "50%",
              transform: "translateX(-50%)",
              width: metrics.stepRailW,
              borderRadius: metrics.stepRailW / 2,
              background: fillColor,
              transformOrigin: "top",
              clipPath: `inset(0 0 ${100 - fillPct}% 0)`,
              transition: `clip-path ${FILL_TRANSITION_DURATION} ${EASE}`,
              ...railMaskStyle,
            }}
          />
          {/* dots — positioned at equal intervals */}
          {items.map((item, i) => {
            const status = deriveStatus(i, current_step);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  zIndex: 2,
                  minHeight: metrics.rowMinH,
                }}
              >
                <StepDot
                  status={status}
                  tl={tl}
                  point={item.point}
                  bgColor={bgColor}
                  metrics={metrics}
                  inactive_hollow={inactive_hollow}
                />
              </div>
            );
          })}
        </div>

        {/* ══ Content column ══════════════════════════════════════════════════ */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {items.map((item, i) => {
            const status = deriveStatus(i, current_step);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 12,
                  minHeight: metrics.rowMinH,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {item.title != null && (
                    <div
                      style={{
                        fontSize: titleFontSize,
                        fontWeight: metrics.titleFontWeight,
                        color:
                          status === "pending"
                            ? (tl.spanColor ?? "rgba(0,0,0,0.45)")
                            : (tl.titleColor ?? "#222222"),
                        lineHeight: `${titleLineH}px`,
                        letterSpacing: "0.01em",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        transition: `color 0.4s ${EASE}`,
                      }}
                    >
                      {item.title}
                    </div>
                  )}
                  {item.span != null && (
                    <div
                      style={{
                        fontSize: spanFontSize,
                        color: tl.spanColor ?? "rgba(0,0,0,0.45)",
                        lineHeight: "18px",
                        marginTop: item.title != null ? 1 : 0,
                        userSelect: "none",
                        WebkitUserSelect: "none",
                      }}
                    >
                      {item.span}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Horizontal steps ── */
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ══ Rail + dots row ═══════════════════════════════════════════════════ */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          height: metrics.railRowH,
        }}
      >
        {/* background rail */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: edgeOffset,
            right: edgeOffset,
            transform: "translateY(-50%)",
            height: metrics.stepRailW,
            background: railColor,
            borderRadius: metrics.stepRailW / 2,
            ...railMaskStyle,
          }}
        />
        {/* animated fill */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: edgeOffset,
            right: edgeOffset,
            transform: "translateY(-50%)",
            height: metrics.stepRailW,
            borderRadius: metrics.stepRailW / 2,
            background: fillColor,
            clipPath: `inset(0 ${100 - fillPct}% 0 0)`,
            transition: `clip-path ${FILL_TRANSITION_DURATION} ${EASE}`,
            ...railMaskStyle,
          }}
        />
        {/* dots */}
        {items.map((item, i) => {
          const status = deriveStatus(i, current_step);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                zIndex: 2,
              }}
            >
              <StepDot
                status={status}
                tl={tl}
                point={item.point}
                bgColor={bgColor}
                metrics={metrics}
                inactive_hollow={inactive_hollow}
              />
            </div>
          );
        })}
      </div>

      {/* ══ Labels row ════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          marginTop: compact ? 6 : 8,
        }}
      >
        {items.map((item, i) => {
          const status = deriveStatus(i, current_step);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                minWidth: 0,
                padding: "0 4px",
              }}
            >
              {item.title != null && (
                <div
                  style={{
                    fontSize: titleFontSize,
                    fontWeight: metrics.titleFontWeight,
                    color:
                      status === "pending"
                        ? (tl.spanColor ?? "rgba(0,0,0,0.45)")
                        : (tl.titleColor ?? "#222222"),
                    lineHeight: `${titleLineH}px`,
                    letterSpacing: "0.01em",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    transition: `color 0.4s ${EASE}`,
                  }}
                >
                  {item.title}
                </div>
              )}
              {item.span != null && (
                <div
                  style={{
                    fontSize: spanFontSize,
                    color: tl.spanColor ?? "rgba(0,0,0,0.45)",
                    lineHeight: "18px",
                    marginTop: item.title != null ? 1 : 0,
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.span}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
/* ── TimelineSteps (private) ──────────────────────────────────────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Timeline
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Props
   ─────
   items                  {Array}     Array of item objects (see below)
   mode                   {string}    "timeline" (default) | "steps" — steps uses fixed spacing + progress bar
   direction              {string}    "vertical" (default) | "horizontal"
   current_step           {number}    0-based index of active step (steps mode only)
   step_progress          {number}    0–1, partial progress within current step segment (steps mode, default 0)
   compact                {boolean}   Use a smaller steps presentation for tighter layouts.
   inactive_hollow        {boolean}   In steps mode, render non-active nodes as hollow circles.
   expanded_indices       {number[]}  Controlled: which indices are expanded.  Opt in by passing this prop.
   default_expanded_indices {number[]} Uncontrolled initial expanded indices.  Defaults to [].
   on_expand_change       {Function}  Called with the new indices array on every toggle.
   visible_indices        {number[]}  Restrict visible nodes to these original item indices.
   node_filter            {Function}  (item, index, items) => boolean. Return false to hide this node.
   disconnect_line        {boolean}   Add a gap around points so connector lines do not touch the node marker.
   disconnect_gap         {number}    Gap size in px when disconnect_line=true. Defaults to 6.
   style                  {object}    Style override for the root container.

   Item shape
   ──────────
   {
     title   : string | ReactNode          — main label (aligned with the point)
     span    : string | ReactNode          — secondary text / timestamp
     details : ReactNode                   — collapsible content; enables "See details" button (vertical timeline only)
     point   : "start"|"end"|"loading"|ReactNode  — custom point marker; omit for default dot
     status  : "done"|"active"|"pending"   — drives line + dot color; defaults to "pending" (timeline mode)
                                              In steps mode, status is auto-derived from current_step.
   }
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const Timeline = ({
  items = [],
  mode = "timeline",
  direction = "vertical",
  current_step = 0,
  step_progress = 0,
  compact = false,
  inactive_hollow = false,
  expanded_indices,
  default_expanded_indices = [],
  on_expand_change = () => {},
  visible_indices,
  node_filter,
  disconnect_line = false,
  disconnect_gap = 6,
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const tl = useMemo(() => theme?.timeline ?? {}, [theme]);

  /* ── controlled / uncontrolled expanded state (always called, hooks cannot be conditional) ── */
  const isControlled = expanded_indices !== undefined;

  const [internalExpanded, setInternalExpanded] = useState(
    () => new Set(default_expanded_indices),
  );

  const expandedSet = useMemo(
    () => (isControlled ? new Set(expanded_indices) : internalExpanded),
    [isControlled, expanded_indices, internalExpanded],
  );

  const handleToggle = useCallback(
    (index) => {
      const next = new Set(expandedSet);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      const arr = [...next].sort((a, b) => a - b);
      if (!isControlled) setInternalExpanded(next);
      on_expand_change(arr);
    },
    [expandedSet, isControlled, on_expand_change],
  );

  const visibleIndexSet = useMemo(() => {
    if (!Array.isArray(visible_indices)) return null;
    return new Set(visible_indices.filter((index) => Number.isInteger(index)));
  }, [visible_indices]);

  const visibleItems = useMemo(() => {
    return items
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item, originalIndex }) => {
        if (visibleIndexSet && !visibleIndexSet.has(originalIndex))
          return false;
        if (typeof node_filter === "function") {
          return node_filter(item, originalIndex, items);
        }
        return true;
      });
  }, [items, node_filter, visibleIndexSet]);

  const safeDisconnectGap = useMemo(() => {
    const n = Number(disconnect_gap);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [disconnect_gap]);

  /* ── Steps mode ── */
  if (mode === "steps") {
    const stepsItems = visibleItems.map(({ item }) => item);
    if (!stepsItems.length) return null;
    return (
      <div style={{ ...style }}>
        <TimelineSteps
          items={stepsItems}
          current_step={current_step}
          step_progress={step_progress}
          direction={direction}
          tl={tl}
          bgColor={theme?.backgroundColor ?? "#FFFFFF"}
          disconnect_line={disconnect_line}
          disconnect_gap={safeDisconnectGap}
          compact={compact}
          inactive_hollow={inactive_hollow}
        />
      </div>
    );
  }

  if (!visibleItems.length) return null;

  /* ── Horizontal default timeline ── */
  if (direction === "horizontal") {
    return (
      <div style={{ display: "flex", flexDirection: "row", ...style }}>
        {visibleItems.map(({ item, originalIndex }, i) => (
          <HorizontalTimelineNode
            key={originalIndex}
            item={item}
            index={i}
            total={visibleItems.length}
            tl={tl}
          />
        ))}
      </div>
    );
  }

  /* ── Vertical default timeline ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", ...style }}>
      {visibleItems.map(({ item, originalIndex }, i) => {
        const prevVisibleItem = i > 0 ? visibleItems[i - 1].item : null;
        return (
          <TimelineNode
            key={originalIndex}
            item={item}
            index={i}
            total={visibleItems.length}
            isExpanded={expandedSet.has(originalIndex)}
            onToggle={() => handleToggle(originalIndex)}
            prevStatus={
              prevVisibleItem ? (prevVisibleItem.status ?? "pending") : null
            }
            disconnect_line={disconnect_line}
            disconnect_gap={safeDisconnectGap}
            tl={tl}
          />
        );
      })}
    </div>
  );
};

export default Timeline;
