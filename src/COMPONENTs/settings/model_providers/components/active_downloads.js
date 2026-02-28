import { useEffect, useState } from "react";
import pull_store from "../pull_store";

const ActiveDownloads = ({ isDark }) => {
  const [pullingMap, setPullingMap] = useState(() => ({ ...pull_store.map }));
  useEffect(() => pull_store.subscribe(setPullingMap), []);

  const entries = Object.entries(pullingMap);
  if (entries.length === 0) return null;

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const bg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)";
  const mutedColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";
  const barTrack = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const barFill = isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.40)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor: bg,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        margin: "6px 0 10px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "Jost",
          textTransform: "uppercase",
          letterSpacing: "1.4px",
          color: mutedColor,
        }}
      >
        Active Downloads
      </div>

      {entries.map(([key, state]) => {
        const isError = state.status === "error";
        const pct = state.percent ?? 0;
        const isRunning = !isError && state.status !== "starting";

        return (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {!isError && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor: isRunning ? barFill : mutedColor,
                    animation: isRunning ? "pulseDot 1.4s ease-in-out infinite" : "none",
                  }}
                />
              )}
              {isError && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor: "rgba(255,100,100,0.75)",
                  }}
                />
              )}

              <span
                style={{
                  fontSize: 12,
                  fontFamily: "Jost",
                  fontWeight: 500,
                  color: isError ? "rgba(255,100,100,0.85)" : textColor,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {key}
              </span>

              <span
                style={{
                  fontSize: 11,
                  fontFamily: "Jost",
                  color: mutedColor,
                  flexShrink: 0,
                }}
              >
                {isError
                  ? state.error
                  : state.percent !== null
                    ? `${state.percent}%`
                    : state.status}
              </span>

              {!isError && (
                <button
                  title="Cancel"
                  onClick={() => {
                    pull_store.refs[key]?.abort();
                    delete pull_store.refs[key];
                    pull_store.delete(key);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: mutedColor,
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {!isError && (
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: barTrack,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    backgroundColor: barFill,
                    width: `${pct}%`,
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default ActiveDownloads;
