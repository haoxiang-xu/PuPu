import { useCallback, useContext, useMemo, useState } from "react";

/* { Contexts } ----------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } ----------------------------------------------------------------------------------------------------------- */

/* { Components } --------------------------------------------------------------------------------------------------------- */
import AnimatedChildren from "../class/animated_children";
import ArcSpinner from "../spinner/arc_spinner";
import Icon from "../icon/icon";
/* { Components } --------------------------------------------------------------------------------------------------------- */

/* ── layout constants ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const TRACK_WIDTH = 24; // px — width of the left column (line + point)
const LINE_WIDTH = 1; // px — connecting line stroke width
const TITLE_LINE_H = 18; // px — explicit line-height of title text
const TITLE_CY = TITLE_LINE_H / 2; // 10px — vertical center of first title line

// Point radii — used to align the vertical center of each point with TITLE_CY
const DEFAULT_DOT_R = 5; // default 10 × 10 dot
const PRESET_DOT_R = 6; // start/end   12 × 12 dot
const LOADING_R = 8; // ArcSpinner  16 × 16

// Branch layout
const BRANCH_TRACK_W = 20; // px — branch track column width (narrower than main)
const FORK_CURVE_H = 18; // px — height of fork/merge SVG curves
/* ── layout constants ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const resolveLineColor = (status, tl) => {
  if (status === "done") return tl.lineDoneColor ?? "rgba(10,186,181,0.85)";
  if (status === "active") return "rgba(10,186,181,0.38)";
  return tl.lineColor ?? "rgba(0,0,0,0.12)";
};

const resolvePointColor = (status, tl) => {
  if (status === "active") return tl.pointColor ?? "rgba(10,186,181,1)";
  if (status === "done")
    return tl.pointDoneColor ?? tl.pointColor ?? "rgba(10,186,181,1)";
  return tl.pointPendingColor ?? "rgba(0,0,0,0.18)";
};

/* opaque line color for branch elements — avoids darkening at SVG/div overlap joints */
const resolveBranchLineColor = (_status, _tl, isDark) => {
  return isDark ? "rgb(55,55,55)" : "rgb(210,210,210)";
};

const getPointRadius = (point) => {
  if (point === "start" || point === "end") return PRESET_DOT_R;
  if (point === "loading") return LOADING_R;
  if (point != null && typeof point !== "string") return PRESET_DOT_R; // custom element — reasonable guess
  return DEFAULT_DOT_R;
};
/* ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── preset point shapes ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const DotDefault = ({ status, tl }) => (
  <div
    style={{
      width: DEFAULT_DOT_R * 2,
      height: DEFAULT_DOT_R * 2,
      borderRadius: "50%",
      background: "transparent",
      border: `1px solid ${resolvePointColor(status, tl)}`,
      flexShrink: 0,
      transition: "border-color 0.25s",
      boxSizing: "border-box",
    }}
  />
);

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
        transition: "box-shadow 0.25s",
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
        transition: "background 0.25s, box-shadow 0.25s",
      }}
    />
  );
};
/* ── preset point shapes ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── TimelineNode (private) ───────────────────────────────────────────────────────────────────────────────────────────────── */
const TimelineNode = ({
  item,
  index,
  total,
  isExpanded,
  onToggle,
  prevStatus, // null for first item; used to color the top line segment
  tl,
  isPassThrough, // true for collapsed intermediate nodes
  compact = false,
  hideTrack = false,
}) => {
  const {
    title,
    span,
    details,
    detailsBare = false,
    body,
    point,
    status = "pending",
  } = item;

  /* ── resolve point element (must be before any early return) ── */
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

  /* ── pass-through: hide the circle dot, keep content ── */

  /* ── top-line height: aligns point center with first title-line center ── */
  const topLineH = Math.max(0, TITLE_CY - getPointRadius(point));

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
      {!hideTrack && (
        <div
          style={{
            width: TRACK_WIDTH,
            flexShrink: 0,
            position: "relative",
          }}
        >
          {/* top line segment */}
          {index !== 0 && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: LINE_WIDTH,
                height: isPassThrough ? topLineH : Math.max(0, topLineH - 3),
                background: topLineColor,
                transition: "background 0.3s",
              }}
            />
          )}
          {/* point — hidden for pass-through nodes */}
          {!isPassThrough && (
            <div
              style={{
                position: "absolute",
                top: topLineH,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {pointEl}
            </div>
          )}
          {/* bottom line segment */}
          {index !== total - 1 && (
            <div
              style={{
                position: "absolute",
                top: isPassThrough
                  ? topLineH
                  : topLineH + getPointRadius(point) * 2 + 3,
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 0,
                width: LINE_WIDTH,
                background: bottomLineColor,
                transition: "background 0.3s",
              }}
            />
          )}
        </div>
      )}

      {/* ══ Content column ════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          paddingLeft: hideTrack ? 0 : compact ? 10 : 14,
          paddingBottom: index === total - 1 ? 0 : compact ? 10 : 14,
        }}
      >
        {/* title + detail + spacer + span row */}
        {(title != null || span != null || hasDetails) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: compact ? 4 : 6,
              lineHeight: `${TITLE_LINE_H}px`,
            }}
          >
            {title != null && (
              <span
                style={{
                  fontSize: tl.titleFontSize ?? (compact ? "13px" : "14px"),
                  fontWeight: 500,
                  color: tl.titleColor ?? "#222222",
                  letterSpacing: "0.01em",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  flexShrink: 0,
                }}
              >
                {title}
              </span>
            )}
            {hasDetails && (
              <button
                onClick={onToggle}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "0",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: tl.spanFontSize ?? (compact ? "10px" : "11px"),
                  color: tl.seeDetailsColor ?? "rgba(0,0,0,0.35)",
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  outline: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                {isExpanded ? "hide" : "detail"}
                <Icon
                  src="arrow_down"
                  color="currentColor"
                  style={{
                    width: 14,
                    height: 14,
                    transition: "transform 0.22s cubic-bezier(0.32,1,0.32,1)",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}
                />
              </button>
            )}
            {/* spacer pushes span to the right */}
            <span style={{ flex: 1 }} />
            {span != null && (
              <span
                style={{
                  fontSize: tl.spanFontSize ?? (compact ? "10px" : "11px"),
                  color: tl.spanColor ?? "rgba(0,0,0,0.45)",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  flexShrink: 0,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                }}
              >
                {span}
              </span>
            )}
          </div>
        )}

        {/* always-visible body text */}
        {body != null && (
          <div
            style={
              typeof body === "string"
                ? {
                    marginTop: compact ? 2 : 3,
                    fontSize: tl.fontSize ?? (compact ? "11px" : "12px"),
                    color: tl.spanColor ?? "rgba(0,0,0,0.45)",
                    lineHeight: compact ? 1.5 : 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                  }
                : { marginTop: compact ? 2 : 3 }
            }
          >
            {body}
          </div>
        )}

        {/* animated details content */}
        {hasDetails && (
          <AnimatedChildren open={isExpanded}>
            {detailsBare ? (
              <div style={{ marginTop: compact ? 4 : 5 }}>{details}</div>
            ) : (
              <div
                style={{
                  marginTop: compact ? 4 : 5,
                  padding: compact ? "6px 8px" : "8px 10px",
                  borderRadius: compact ? 6 : 8,
                  background: tl.detailsBackground ?? "rgba(0,0,0,0.025)",
                  fontSize: tl.fontSize ?? (compact ? "12px" : "13px"),
                  color: tl.spanColor ?? "rgba(0,0,0,0.45)",
                }}
              >
                {details}
              </div>
            )}
          </AnimatedChildren>
        )}
      </div>
    </div>
  );
};
/* ── TimelineNode (private) ───────────────────────────────────────────────────────────────────────────────────────────────── */

/* ── Branch components (git-graph fork/merge) ────────────────────────────────────────────────────────────────────────────── */

const ForkCurve = ({ width, height, color, strokeWidth }) => (
  <svg
    width={width}
    height={height}
    style={{ display: "block", overflow: "visible" }}
  >
    <path
      d={`M 0,0 C 0,${height * 0.85} ${width},${height * 0.15} ${width},${height}`}
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
    />
  </svg>
);

const MergeCurve = ({ width, height, color, strokeWidth }) => (
  <svg
    width={width}
    height={height}
    style={{ display: "block", overflow: "visible" }}
  >
    <path
      d={`M ${width},0 C ${width},${height * 0.85} 0,${height * 0.15} 0,${height}`}
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
    />
  </svg>
);

const BranchNode = ({
  item,
  index,
  total,
  prevStatus,
  branchStatus,
  tl,
  compact = false,
}) => {
  const {
    title,
    span,
    status = "pending",
    point,
    children,
    expandContent,
    isExpanded = false,
  } = item;

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

  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const topLineH = Math.max(0, TITLE_CY - getPointRadius(point));

  const topLineColor =
    index === 0
      ? resolveBranchLineColor(branchStatus, tl, isDark)
      : resolveBranchLineColor(prevStatus, tl, isDark);
  const bottomLineColor = resolveBranchLineColor(status, tl, isDark);

  const hasBranch = Array.isArray(children) && children.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          width: BRANCH_TRACK_W,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: LINE_WIDTH,
            height: index === 0 ? topLineH + 2 : topLineH,
            flexShrink: 0,
            background: topLineColor,
            transition: "background 0.3s",
          }}
        />
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
        <div
          style={{
            flex: "1 1 auto",
            width: LINE_WIDTH,
            minHeight: index === total - 1 ? 0 : 12,
            background: bottomLineColor,
            transition: "background 0.3s",
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          paddingLeft: compact ? 8 : 10,
          paddingBottom: index === total - 1 ? 0 : compact ? 10 : 14,
        }}
      >
        {title != null && (
          <div
            style={{
              fontSize: tl.titleFontSize ?? (compact ? "13px" : "14px"),
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
        {span != null && (
          <div
            style={{
              fontSize: tl.fontSize ?? (compact ? "11px" : "13px"),
              color: tl.spanColor ?? "rgba(0,0,0,0.45)",
              lineHeight: compact ? "16px" : "18px",
              marginTop: title != null ? 2 : 0,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {span}
          </div>
        )}
        {/* animated expandable content (e.g. nested TraceChain) */}
        {expandContent != null && (
          <AnimatedChildren open={isExpanded}>
            <div style={{ marginTop: compact ? 4 : 6 }}>{expandContent}</div>
          </AnimatedChildren>
        )}
        {hasBranch && (
          <BranchGroup
            items={children}
            tl={tl}
            branchStatus={status}
            forkOffset={(compact ? 8 : 10) + BRANCH_TRACK_W / 2}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
};

const BranchGroup = ({
  items,
  tl,
  branchStatus,
  forkOffset,
  compact = false,
  open = true,
  animateFrom = 0,
}) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const forkColor = resolveBranchLineColor(
    branchStatus === "pending" ? "pending" : "done",
    tl,
    isDark,
  );
  const lastStatus = items[items.length - 1]?.status ?? "pending";
  const mergeColor = resolveBranchLineColor(
    lastStatus === "pending" ? "pending" : "done",
    tl,
    isDark,
  );
  const curveWidth = forkOffset + BRANCH_TRACK_W / 2;

  const useAnimation = animateFrom > 0 && animateFrom < items.length;
  const alwaysItems = useAnimation ? items.slice(0, animateFrom) : items;
  const animatedItems = useAnimation ? items.slice(animateFrom) : [];

  const visibleTotal = useAnimation && !open ? alwaysItems.length : items.length;

  const renderNode = (child, i) => (
    <BranchNode
      key={child.key ?? i}
      item={child}
      index={i}
      total={visibleTotal}
      prevStatus={i > 0 ? (items[i - 1].status ?? "pending") : null}
      branchStatus={branchStatus}
      tl={tl}
      compact={compact}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* fork curve */}
      <div style={{ position: "relative", height: FORK_CURVE_H }}>
        <div style={{ position: "absolute", left: -forkOffset, top: 0 }}>
          <ForkCurve
            width={curveWidth}
            height={FORK_CURVE_H}
            color={forkColor}
            strokeWidth={LINE_WIDTH}
          />
        </div>
      </div>
      {alwaysItems.map((child, i) => renderNode(child, i))}

      {useAnimation && animatedItems.length > 0 && (
        <AnimatedChildren open={open}>
          <div>
            {animatedItems.map((child, i) =>
              renderNode(child, animateFrom + i),
            )}
          </div>
        </AnimatedChildren>
      )}

      <div style={{ position: "relative", height: FORK_CURVE_H }}>
        <div style={{ position: "absolute", left: -forkOffset, top: 0 }}>
          <MergeCurve
            width={curveWidth}
            height={FORK_CURVE_H}
            color={mergeColor}
            strokeWidth={LINE_WIDTH}
          />
        </div>
      </div>
    </div>
  );
};

const BranchSection = ({ item, index, total, prevStatus, tl, compact = false }) => {
  const branchStatus = item.status ?? "pending";
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div style={{ position: "relative" }}>
      {!isFirst && (
        <div
          style={{
            position: "absolute",
            top: 0,
            height: "50%",
            left: TRACK_WIDTH / 2,
            width: LINE_WIDTH,
            transform: "translateX(-50%)",
            background: resolveLineColor(prevStatus ?? "pending", tl),
            transition: "background 0.3s",
          }}
        />
      )}
      {!isLast && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            bottom: 0,
            left: TRACK_WIDTH / 2,
            width: LINE_WIDTH,
            transform: "translateX(-50%)",
            background: resolveLineColor(branchStatus, tl),
            transition: "background 0.3s",
          }}
        />
      )}
      <div style={{ paddingLeft: TRACK_WIDTH }}>
        <BranchGroup
          items={item.children}
          tl={tl}
          branchStatus={branchStatus}
          forkOffset={TRACK_WIDTH / 2}
          compact={compact}
          open={item.branchOpen ?? true}
          animateFrom={item.branchAnimateFrom ?? 0}
        />
      </div>
    </div>
  );
};
/* ── Branch components (git-graph fork/merge) ────────────────────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Timeline
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Props
   ─────
   items                  {Array}     Array of item objects (see below)
   expanded_indices       {number[]}  Controlled: which indices are expanded.  Opt in by passing this prop.
   default_expanded_indices {number[]} Uncontrolled initial expanded indices.  Defaults to [].
   on_expand_change       {Function}  Called with the new indices array on every toggle.
   style                  {object}    Style override for the root container.

   Item shape
   ──────────
   {
     title    : string | ReactNode          — main label (aligned with the point)
     span     : string | ReactNode          — secondary text / timestamp
     details  : ReactNode                   — collapsible content; enables "See details" button
     point    : "start"|"end"|"loading"|ReactNode  — custom point marker; omit for default dot
     status   : "done"|"active"|"pending"   — drives line + dot color; defaults to "pending"
     children : Item[]                      — creates a fork/merge branch (git graph style)
   }
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const Timeline = ({
  items = [],
  expanded_indices,
  default_expanded_indices = [],
  on_expand_change = () => {},
  style,
  compact = false,
  hideTrack = false,
}) => {
  const { theme } = useContext(ConfigContext);
  const tl = useMemo(() => theme?.timeline ?? {}, [theme]);

  /* ── controlled / uncontrolled expanded state ── */
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

  if (!items.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", ...style }}>
      {items.map((item, i) => {
        const isFirst = i === 0;
        const isLast = i === items.length - 1;
        const isActive = (item.status ?? "pending") === "active";
        const isPreset = item.point === "start" || item.point === "end";
        const isPassThrough = !isFirst && !isLast && !isActive && !isPreset;
        const hasBranch =
          Array.isArray(item.children) && item.children.length > 0;

        if (hasBranch) {
          return (
            <BranchSection
              key={i}
              item={item}
              index={i}
              total={items.length}
              prevStatus={i > 0 ? (items[i - 1].status ?? "pending") : null}
              tl={tl}
              compact={compact}
            />
          );
        }

        return (
          <TimelineNode
            key={i}
            item={item}
            index={i}
            total={items.length}
            isExpanded={expandedSet.has(i)}
            onToggle={() => handleToggle(i)}
            prevStatus={i > 0 ? (items[i - 1].status ?? "pending") : null}
            tl={tl}
            isPassThrough={isPassThrough}
            compact={compact}
            hideTrack={hideTrack}
          />
        );
      })}
    </div>
  );
};

export default Timeline;
