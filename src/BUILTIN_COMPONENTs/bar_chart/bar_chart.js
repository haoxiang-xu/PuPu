import { useContext, useRef, useState, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  BarChart — minimal, theme-aware bar chart (pure CSS)                                                                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DEFAULT_HEIGHT = 220;
const BAR_RADIUS = 5;
const Y_GRID_LINES = 4;

const formatTokenCount = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

/* Derive a common unit from the y-axis ceiling so ticks show clean numbers
   and the suffix appears once as a label. */
const deriveYAxisUnit = (niceMax) => {
  if (niceMax >= 1_000_000) return { suffix: "M", divisor: 1_000_000 };
  if (niceMax >= 1_000) return { suffix: "k", divisor: 1_000 };
  return { suffix: "", divisor: 1 };
};

const formatYTick = (val, divisor) => {
  const scaled = val / divisor;
  return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
};

export const BarChart = ({
  data = [],
  height = DEFAULT_HEIGHT,
  barColor,
  valueFormatter = formatTokenCount,
  emptyMessage = "No data",
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const defaultBarColor = isDark
    ? "rgba(99,102,241,0.85)"
    : "rgba(79,70,229,0.80)";
  const fillColor = barColor || defaultBarColor;
  const hoverColor = isDark ? "rgba(129,140,248,1)" : "rgba(99,102,241,1)";

  const maxValue = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const niceMax = niceRound(maxValue);
  const { suffix: yUnit, divisor: yDivisor } = deriveYAxisUnit(niceMax);

  const gridLines = Array.from({ length: Y_GRID_LINES + 1 }, (_, i) =>
    Math.round((niceMax / Y_GRID_LINES) * i),
  );

  const handleMouseEnter = useCallback((i) => setHoveredIndex(i), []);
  const handleMouseLeave = useCallback(() => setHoveredIndex(null), []);

  if (!data.length) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontFamily: theme?.font?.fontFamily || "inherit",
          color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)",
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const labelAxisWidth = 48;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        display: "flex",
        fontFamily: theme?.font?.fontFamily || "inherit",
        userSelect: "none",
      }}
    >
      {/* Y-axis labels */}
      <div
        style={{
          width: labelAxisWidth,
          flexShrink: 0,
          position: "relative",
          height: "100%",
        }}
      >
        {yUnit && (
          <span
            style={{
              position: "absolute",
              right: 4,
              top: -2,
              fontSize: 9,
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
              lineHeight: "12px",
              fontStyle: "italic",
            }}
          >
            {yUnit}
          </span>
        )}
        {gridLines.map((val, i) => {
          const pct = (val / niceMax) * 100;
          return (
            <span
              key={i}
              style={{
                position: "absolute",
                right: 4,
                bottom: `calc(${pct}% - 6px)`,
                fontSize: 10,
                color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)",
                lineHeight: "12px",
              }}
            >
              {formatYTick(val, yDivisor)}
            </span>
          );
        })}
      </div>

      {/* Chart area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Grid lines */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {gridLines.map((val, i) => {
            const pct = (val / niceMax) * 100;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: `${pct}%`,
                  height: 1,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.06)",
                }}
              />
            );
          })}
        </div>

        {/* Bars container */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            gap: data.length > 20 ? 2 : data.length > 10 ? 4 : 6,
            padding: "0 4px",
            position: "relative",
          }}
        >
          {data.map((d, i) => {
            const pct = Math.max((d.value / niceMax) * 100, 0.5);
            const isHovered = hoveredIndex === i;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  position: "relative",
                  cursor: "default",
                }}
                onMouseEnter={() => handleMouseEnter(i)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: `calc(${pct}% + 8px)`,
                      left: "50%",
                      transform: "translateX(-50%)",
                      backgroundColor: isDark ? "#2a2a2a" : "#fff",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 11,
                      color: isDark ? "#fff" : "#222",
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      boxShadow: isDark
                        ? "0 4px 12px rgba(0,0,0,0.4)"
                        : "0 4px 12px rgba(0,0,0,0.08)",
                      pointerEvents: "none",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {valueFormatter(d.value)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        opacity: 0.55,
                        marginTop: 1,
                      }}
                    >
                      {d.label}
                    </div>
                  </div>
                )}

                {/* Bar */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: `${pct}%`,
                    backgroundColor: isHovered
                      ? hoverColor
                      : d.color || fillColor,
                    borderRadius: `${BAR_RADIUS}px ${BAR_RADIUS}px 1px 1px`,
                    transition:
                      "height 0.4s cubic-bezier(.4,0,.2,1), background-color 0.15s",
                    minHeight: 2,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div
          style={{
            display: "flex",
            gap: data.length > 20 ? 2 : data.length > 10 ? 4 : 6,
            padding: "6px 4px 0",
          }}
        >
          {data.map((d, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "center",
                fontSize: 10,
                color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {d.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* Round up to a "nice" number for y-axis ceiling */
function niceRound(val) {
  if (val <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
  const normalized = val / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}
