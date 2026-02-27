import { memo, useState, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";

/* ─── constants ──────────────────────────────────────────────────────────── */

const DISPLAY_FRAME_TYPES = new Set([
  "reasoning",
  "observation",
  "tool_call",
  "tool_result",
  "error",
]);

/* ─── helpers ────────────────────────────────────────────────────────────── */

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const extractText = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  return (
    payload.content ||
    payload.text ||
    payload.message ||
    payload.reasoning ||
    payload.observation ||
    ""
  );
};

/* ─── sub-components ─────────────────────────────────────────────────────── */

const CollapsibleJson = ({ data, label, isDark, color }) => {
  const [open, setOpen] = useState(false);
  if (data === undefined || data === null) return null;
  const text = JSON.stringify(data, null, 2);

  return (
    <div style={{ marginTop: 2 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          padding: "0",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color,
          fontSize: 11,
          opacity: 0.45,
          fontFamily: "inherit",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontSize: 8,
            display: "inline-block",
            transition: "transform 0.18s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
        <span
          style={{
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            letterSpacing: 0.2,
          }}
        >
          {label}
        </span>
      </button>
      {open && (
        <pre
          style={{
            margin: "4px 0 0 0",
            padding: "6px 10px",
            borderRadius: 5,
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            lineHeight: 1.65,
            color,
            opacity: 0.8,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
};

const ToolCallBlock = ({ callFrame, resultFrame, isDark, color }) => {
  const toolName = callFrame.payload?.tool_name || "tool";
  const args = callFrame.payload?.arguments;
  const callId = callFrame.payload?.call_id;
  const result = resultFrame?.payload?.result;
  const duration =
    resultFrame && callFrame.ts && resultFrame.ts
      ? resultFrame.ts - callFrame.ts
      : null;

  return (
    <div
      style={{
        marginBottom: 6,
        paddingLeft: 2,
      }}
    >
      {/* tool header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          flexWrap: "wrap",
        }}
      >
        {/* tool name badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            background: isDark
              ? "rgba(99,102,241,0.14)"
              : "rgba(99,102,241,0.07)",
            border: isDark
              ? "1px solid rgba(99,102,241,0.22)"
              : "1px solid rgba(99,102,241,0.16)",
            color: isDark ? "#a5b4fc" : "#4f46e5",
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 0.2,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontSize: 10, opacity: 0.7 }}>⚙</span>
          {toolName}
        </span>
        {duration != null && (
          <span
            style={{
              fontSize: 10,
              opacity: 0.38,
              color,
              letterSpacing: 0.3,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
            }}
          >
            {formatDuration(duration)}
          </span>
        )}
      </div>

      {/* collapsible args / result */}
      <div style={{ marginTop: 4, paddingLeft: 4 }}>
        <CollapsibleJson
          data={args}
          label="args"
          isDark={isDark}
          color={color}
        />
        <CollapsibleJson
          data={result}
          label="result"
          isDark={isDark}
          color={color}
        />
      </div>
    </div>
  );
};

const ErrorBlock = ({ frame, isDark }) => {
  const msg = frame.payload?.message || "Unknown error";
  return (
    <div
      style={{
        marginBottom: 6,
        padding: "7px 11px",
        borderRadius: 6,
        background: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.06)",
        border: isDark
          ? "1px solid rgba(239,68,68,0.18)"
          : "1px solid rgba(239,68,68,0.15)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 3,
          fontWeight: 600,
          color: isDark ? "#f87171" : "#dc2626",
          opacity: 0.8,
        }}
      >
        Error
      </div>
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          color: isDark ? "#fca5a5" : "#b91c1c",
          fontFamily: "Menlo, Monaco, Consolas, monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          opacity: 0.85,
        }}
      >
        {msg}
      </div>
    </div>
  );
};

const TextBlock = ({ frame, label, isDark, color }) => {
  const text = extractText(frame.payload);
  if (!text) return null;

  return (
    <div
      style={{
        marginBottom: 6,
        padding: "7px 11px",
        borderRadius: "0 6px 6px 0",
        background: isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.028)",
        borderLeft: `2px solid ${
          isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"
        }`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          opacity: 0.38,
          color,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.62,
          color,
          opacity: 0.7,
          fontStyle: "italic",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* ─── main component ─────────────────────────────────────────────────────── */

const TraceChain = ({ frames = [], status }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";

  const isStreaming = status === "streaming";

  // Collect display frames and timing
  const displayFrames = frames.filter((f) => DISPLAY_FRAME_TYPES.has(f.type));
  const startFrame = frames.find((f) => f.type === "stream_started");
  const doneFrame = frames.find((f) => f.type === "done");
  const duration =
    startFrame && doneFrame ? doneFrame.ts - startFrame.ts : null;

  // Step count: number of tool_calls + reasoning blocks
  const stepCount = displayFrames.filter(
    (f) => f.type === "tool_call" || f.type === "reasoning",
  ).length;

  const hasError = displayFrames.some((f) => f.type === "error");

  // Build call_id → result frame map
  const toolResultByCallId = new Map();
  for (const frame of displayFrames) {
    if (frame.type === "tool_result" && frame.payload?.call_id) {
      toolResultByCallId.set(frame.payload.call_id, frame);
    }
  }

  // Auto-expand when an error arrives
  // (no-op: always expanded)

  // Nothing to show
  if (displayFrames.length === 0 && !isStreaming) return null;

  const headerLabelStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color,
    opacity: 0.5,
    fontSize: 12,
    fontFamily: theme?.font?.fontFamily || "inherit",
    letterSpacing: 0.1,
    userSelect: "none",
    marginBottom: 6,
  };

  return (
    <div style={{ marginBottom: 10 }}>
      {/* ── header label ─────────────────────────────── */}
      <div style={headerLabelStyle}>
        {isStreaming && !doneFrame ? (
          <>
            <ArcSpinner
              size={11}
              stroke_width={2}
              color={isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.3)"}
              track_opacity={0.08}
            />
            <span>Thinking…</span>
          </>
        ) : hasError ? (
          <span
            style={{ color: isDark ? "#f87171" : "#dc2626", opacity: 0.75 }}
          >
            {stepCount > 0
              ? `Failed after ${stepCount} step${stepCount !== 1 ? "s" : ""}`
              : "Failed"}
            {duration ? ` · ${formatDuration(duration)}` : ""}
          </span>
        ) : (
          <span>
            {stepCount > 0
              ? `Used ${stepCount} step${stepCount !== 1 ? "s" : ""}`
              : "Process"}
            {duration ? ` · ${formatDuration(duration)}` : ""}
          </span>
        )}
      </div>

      {/* ── body (always visible) ───────────────────────── */}
      <div
        style={{
          paddingLeft: 12,
          paddingBottom: 2,
          borderLeft: `1.5px solid ${
            isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)"
          }`,
        }}
      >
        {(() => {
          const rendered = [];
          const renderedCallIds = new Set();

          for (const frame of displayFrames) {
            if (frame.type === "reasoning" || frame.type === "observation") {
              rendered.push(
                <TextBlock
                  key={`${frame.seq}-${frame.type}`}
                  frame={frame}
                  label={
                    frame.type === "reasoning" ? "Reasoning" : "Observation"
                  }
                  isDark={isDark}
                  color={color}
                />,
              );
            } else if (frame.type === "tool_call") {
              const callId = frame.payload?.call_id;
              if (!callId || renderedCallIds.has(callId)) continue;
              renderedCallIds.add(callId);
              const resultFrame = toolResultByCallId.get(callId) || null;
              rendered.push(
                <ToolCallBlock
                  key={`${frame.seq}-tool`}
                  callFrame={frame}
                  resultFrame={resultFrame}
                  isDark={isDark}
                  color={color}
                />,
              );
            } else if (frame.type === "error") {
              rendered.push(
                <ErrorBlock
                  key={`${frame.seq}-error`}
                  frame={frame}
                  isDark={isDark}
                />,
              );
            }
            // tool_result rendered inside ToolCallBlock; others skipped
          }

          return rendered;
        })()}

        {/* streaming-in-progress indicator */}
        {isStreaming && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: 0.35,
              marginTop: displayFrames.length > 0 ? 6 : 0,
              paddingBottom: 2,
            }}
          >
            <ArcSpinner
              size={9}
              stroke_width={2}
              color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
              track_opacity={0.0}
            />
            <span
              style={{
                fontSize: 11,
                color,
                fontFamily: theme?.font?.fontFamily || "inherit",
              }}
            >
              Running…
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(TraceChain);
