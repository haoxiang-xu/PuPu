import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import { TEST_PHASES, ERROR_LABELS } from "../constants";

const phaseIndex = (phase) => TEST_PHASES.findIndex((p) => p.key === phase);

const TestResult = ({ result, testing, isDark }) => {
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Phase progress ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {TEST_PHASES.map((phase, i) => {
          const currentIdx = result ? phaseIndex(result.phase) : -1;
          const isActive = testing && i === currentIdx + 1;
          const isPast = result
            ? i <= currentIdx
            : false;
          const isFailed =
            result?.status === "failed" && i === currentIdx;

          let dotColor = mutedColor;
          if (isPast && !isFailed) {
            dotColor = "#34d399";
          }
          if (isFailed) {
            dotColor = "#f87171";
          }
          if (isActive) {
            dotColor = "#fbbf24";
          }

          return (
            <div
              key={phase.key}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                position: "relative",
              }}
            >
              {/* ── Connector line ── */}
              {i > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    right: "50%",
                    left: "-50%",
                    height: 2,
                    borderRadius: 1,
                    background:
                      isPast && !isFailed
                        ? "#34d399"
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.06)",
                    zIndex: 0,
                  }}
                />
              )}
              {/* ── Dot ── */}
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: dotColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1,
                  transition: "background 0.3s ease",
                }}
              >
                {isPast && !isFailed && (
                  <Icon
                    src="check"
                    style={{ width: 9, height: 9 }}
                    color="#fff"
                  />
                )}
                {isFailed && (
                  <Icon
                    src="close"
                    style={{ width: 9, height: 9 }}
                    color="#fff"
                  />
                )}
                {isActive && (
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#fff",
                      animation: "mcp-pulse 1s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
              {/* ── Label ── */}
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "Jost",
                  fontWeight: 500,
                  color: isPast
                    ? isFailed
                      ? "#f87171"
                      : "#34d399"
                    : mutedColor,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {phase.label}
              </span>
            </div>
          );
        })}
        <style>{`
          @keyframes mcp-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>

      {/* ── Result details ── */}
      {result && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background:
              result.status === "success"
                ? isDark
                  ? "rgba(52,211,153,0.08)"
                  : "rgba(52,211,153,0.06)"
                : isDark
                  ? "rgba(248,113,113,0.08)"
                  : "rgba(248,113,113,0.06)",
          }}
        >
          {/* Summary */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon
              src={result.status === "success" ? "check" : "warning"}
              style={{ width: 14, height: 14, flexShrink: 0 }}
              color={result.status === "success" ? "#34d399" : "#f87171"}
            />
            <span
              style={{
                fontSize: 12,
                fontFamily: "Jost",
                fontWeight: 500,
                color: result.status === "success" ? "#34d399" : "#f87171",
              }}
            >
              {result.summary}
            </span>
          </div>

          {/* Tool list on success */}
          {result.status === "success" &&
            result.tools?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "Jost",
                    fontWeight: 600,
                    color: isDark
                      ? "rgba(255,255,255,0.5)"
                      : "rgba(0,0,0,0.45)",
                  }}
                >
                  Discovered tools ({result.tool_count})
                </span>
                {result.tools.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "2px 0",
                    }}
                  >
                    <Icon
                      src="tool"
                      style={{ width: 11, height: 11, flexShrink: 0 }}
                      color={mutedColor}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                        color: isDark
                          ? "rgba(255,255,255,0.6)"
                          : "rgba(0,0,0,0.55)",
                      }}
                    >
                      {t.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "Jost",
                        color: mutedColor,
                      }}
                    >
                      {t.description}
                    </span>
                  </div>
                ))}
              </div>
            )}

          {/* Errors on failure */}
          {result.errors?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {result.errors.map((err, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    fontFamily: "Jost",
                    color: "#f87171",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: isDark
                      ? "rgba(248,113,113,0.08)"
                      : "rgba(248,113,113,0.05)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {ERROR_LABELS[err.code] || err.code}
                  </span>
                  {err.detail && (
                    <span style={{ opacity: 0.8 }}> — {err.detail}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TestResult;
