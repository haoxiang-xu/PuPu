import { useMemo } from "react";
import AnimatedChildren from "../class/animated_children";
import ArcSpinner from "../spinner/arc_spinner";

/* ── layout constants ─────────────────────────────────────────────────── */
const TRACK_W = 20;
const LINE_W = 1;
const TITLE_LINE_H = 18;
const TITLE_CY = TITLE_LINE_H / 2;
const DOT_R = 5;
const FORK_CURVE_H = 18;
const LOADING_R = 8;
/* curveReach is now a prop — no hardcoded inset */

/* ── status-aware line colors (opaque to prevent SVG/div overlap artifacts) ── */
const resolveLineColor = (status, isDark) => {
  if (status === "done") return isDark ? "rgb(25,120,117)" : "rgb(155,215,213)";
  if (status === "active")
    return isDark ? "rgb(20,95,92)" : "rgb(175,225,223)";
  if (status === "error")
    return isDark ? "rgb(140,68,68)" : "rgb(222,160,160)";
  return isDark ? "rgb(55,55,55)" : "rgb(210,210,210)";
};

/* ── SVG fork/merge curves ────────────────────────────────────────────── */
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

/* ── point helpers ────────────────────────────────────────────────────── */
const getPointRadius = (point) => {
  if (point === "loading") return LOADING_R;
  return DOT_R;
};

const DefaultDot = ({ status, isDark }) => (
  <div
    style={{
      width: DOT_R * 2,
      height: DOT_R * 2,
      borderRadius: "50%",
      background: "transparent",
      border: `1px solid ${resolveLineColor(status, isDark)}`,
      flexShrink: 0,
      boxSizing: "border-box",
      transition: "border-color 0.25s",
    }}
  />
);

/* ── BranchNode (private) ─────────────────────────────────────────────── */
const BranchNode = ({
  item,
  index,
  total,
  prevStatus,
  overallStatus,
  isDark,
  compact,
}) => {
  const {
    title,
    span,
    status = "pending",
    point,
    expandContent,
    isExpanded = false,
  } = item;

  const pointEl = useMemo(() => {
    if (point === "loading") {
      return (
        <ArcSpinner
          size={LOADING_R * 2}
          stroke_width={2}
          color={resolveLineColor("active", isDark)}
        />
      );
    }
    if (point != null && typeof point !== "string") return point;
    return <DefaultDot status={status} isDark={isDark} />;
  }, [point, status, isDark]);

  const topLineH = Math.max(0, TITLE_CY - getPointRadius(point));
  const topColor = resolveLineColor(
    index === 0 ? overallStatus : prevStatus,
    isDark,
  );
  const bottomColor = resolveLineColor(status, isDark);

  return (
    <div
      style={{ display: "flex", flexDirection: "row", alignItems: "stretch" }}
    >
      {/* track column */}
      <div
        style={{
          width: TRACK_W,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: LINE_W,
            height: index === 0 ? topLineH + 2 : topLineH,
            flexShrink: 0,
            background: topColor,
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
            width: LINE_W,
            minHeight: index === total - 1 ? 0 : 12,
            background: bottomColor,
            transition: "background 0.3s",
          }}
        />
      </div>

      {/* content column */}
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
              display: "flex",
              alignItems: "center",
              gap: compact ? 4 : 6,
              lineHeight: `${TITLE_LINE_H}px`,
            }}
          >
            {typeof title === "string" ? (
              <span
                style={{
                  fontSize: compact ? "13px" : "14px",
                  fontWeight: 500,
                  color: isDark ? "#e5e5e5" : "#222222",
                  letterSpacing: "0.01em",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                {title}
              </span>
            ) : (
              title
            )}
            {span != null && (
              <>
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: compact ? "10px" : "11px",
                    color: isDark
                      ? "rgba(255,255,255,0.45)"
                      : "rgba(0,0,0,0.45)",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    flexShrink: 0,
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {span}
                </span>
              </>
            )}
          </div>
        )}

        {expandContent != null && (
          <AnimatedChildren open={isExpanded}>
            <div style={{ marginTop: compact ? 4 : 6 }}>{expandContent}</div>
          </AnimatedChildren>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   BranchGraph — git-style fork/merge visualization for parallel branches
   ═══════════════════════════════════════════════════════════════════════

   Props
   ─────
   branches    {Array}     Branch items (see shape below)
   expanded    {boolean}   Whether branches are visible
   status      {string}    Overall branch status ("done"|"active"|"pending"|"error")
   curveReach  {number}    How far left (px) fork/merge curves extend to reach parent track.
                           0 = no curves (standalone mode). When inside a Timeline body,
                           use TRACK_WIDTH/2 + paddingLeft (e.g. 26 for normal, 22 for compact).
   inset       {number}    Pull branches closer to parent track by this many px (negative marginLeft).
                           Reduces the gap caused by the parent content column's paddingLeft.
   isDark      {boolean}   Dark mode
   compact     {boolean}   Compact spacing

   Branch item shape
   ─────────────────
   {
     key           : string,           — unique key
     title         : string|ReactNode, — branch label
     span          : string|ReactNode, — secondary text (task preview)
     status        : string,           — "done"|"active"|"pending"|"error"
     point         : ReactNode,        — custom point marker; omit for default
     expandContent : ReactNode,        — content shown when isExpanded
     isExpanded    : boolean,          — expansion state
   }
   ═══════════════════════════════════════════════════════════════════════ */
const BranchGraph = ({
  branches = [],
  expanded = false,
  status = "pending",
  curveReach = 0,
  inset = 0,
  isDark = false,
  compact = false,
}) => {
  if (!branches.length) return null;

  const showCurves = curveReach > 0;
  const curveColor = resolveLineColor(status, isDark);
  const effectiveReach = Math.max(0, curveReach - inset);
  const curveW = effectiveReach + TRACK_W / 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginLeft: inset > 0 ? -inset : undefined,
        marginTop: compact ? 4 : 6,
      }}
    >
      {/* fork curve — always visible when connected */}
      {showCurves && (
        <div style={{ position: "relative", height: FORK_CURVE_H }}>
          <div
            style={{ position: "absolute", left: -effectiveReach, top: 0 }}
          >
            <ForkCurve
              width={curveW}
              height={FORK_CURVE_H}
              color={curveColor}
              strokeWidth={LINE_W}
            />
          </div>
        </div>
      )}

      {/* branch nodes — collapsible */}
      <AnimatedChildren open={expanded}>
        <div>
          {branches.map((branch, i) => (
            <BranchNode
              key={branch.key ?? i}
              item={branch}
              index={i}
              total={branches.length}
              prevStatus={
                i > 0 ? (branches[i - 1].status ?? "pending") : null
              }
              overallStatus={status}
              isDark={isDark}
              compact={compact}
            />
          ))}
        </div>
      </AnimatedChildren>

      {/* merge curve — always visible when connected */}
      {showCurves && (
        <div style={{ position: "relative", height: FORK_CURVE_H }}>
          <div
            style={{ position: "absolute", left: -effectiveReach, top: 0 }}
          >
            <MergeCurve
              width={curveW}
              height={FORK_CURVE_H}
              color={curveColor}
              strokeWidth={LINE_W}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchGraph;
