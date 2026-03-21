import { useMemo } from "react";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import Timeline from "../../../../BUILTIN_COMPONENTs/timeline_v2/timeline";
import { TEST_PHASES, ERROR_LABELS } from "../constants";

const phaseIndex = (phase) => TEST_PHASES.findIndex((p) => p.key === phase);

const TestPhasePoint = ({ variant }) => {
  const palette = {
    active: {
      bg: "#fbbf24",
      border: "#fbbf24",
      icon: null,
      pulse: true,
    },
    failed: {
      bg: "#f87171",
      border: "#f87171",
      icon: "close",
      pulse: false,
    },
    success: {
      bg: "#34d399",
      border: "#34d399",
      icon: "check",
      pulse: false,
    },
  };
  const cfg = palette[variant] || palette.active;

  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      {cfg.icon ? (
        <Icon src={cfg.icon} style={{ width: 6, height: 6 }} color="#fff" />
      ) : cfg.pulse ? (
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#fff",
            animation: "mcp-pulse 1s ease-in-out infinite",
          }}
        />
      ) : null}
    </div>
  );
};

const TestResult = ({ result, testing, isDark }) => {
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const currentIdx = result ? phaseIndex(result.phase) : -1;

  const currentStep = useMemo(() => {
    if (testing) {
      return Math.min(Math.max(currentIdx + 1, 0), TEST_PHASES.length - 1);
    }
    if (currentIdx >= 0) {
      return currentIdx;
    }
    return 0;
  }, [currentIdx, testing]);

  const timelineItems = useMemo(
    () =>
      TEST_PHASES.map((phase, i) => {
        const isFailed = result?.status === "failed" && i === currentIdx;
        const isActive = testing && i === currentStep;
        const isSuccess = result?.status === "success" && i === currentIdx;
        const isPast = i < currentStep || isSuccess;

        return {
          title: (
            <span
              style={{
                fontSize: 10,
                fontFamily: "Jost",
                fontWeight: 500,
                lineHeight: "14px",
                color: isFailed ? "#f87171" : isPast ? "#34d399" : mutedColor,
                whiteSpace: "nowrap",
              }}
            >
              {phase.label}
            </span>
          ),
          point: isFailed ? (
            <TestPhasePoint variant="failed" />
          ) : isActive ? (
            <TestPhasePoint variant="active" />
          ) : isSuccess ? (
            <TestPhasePoint variant="success" />
          ) : undefined,
        };
      }),
    [currentIdx, currentStep, mutedColor, result?.status, testing],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Phase progress ── */}
      <Timeline
        items={timelineItems}
        mode="steps"
        direction="horizontal"
        current_step={currentStep}
        compact
        inactive_hollow
        disconnect_line
        disconnect_gap={8}
      />
      <style>{`
        @keyframes mcp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

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
          {result.status === "success" && result.tools?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "Jost",
                  fontWeight: 600,
                  color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
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
