import { memo, useState, useContext, useMemo } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import AnimatedChildren from "../../BUILTIN_COMPONENTs/class/animated_children";
import Timeline from "../../BUILTIN_COMPONENTs/timeline/timeline";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SeamlessMarkdown from "./components/seamless_markdown";

/* ─── constants & helpers ────────────────────────────────────────────────── */

const DISPLAY_FRAME_TYPES = new Set([
  "reasoning",
  "observation",
  "tool_confirmation_request",
  "tool_call",
  "tool_result",
  "final_message",
  "error",
]);

const formatDelta = (ms) => {
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

const toKVPairs = (data) => {
  if (data === undefined || data === null) return [];
  if (typeof data !== "object") return [{ key: "value", value: String(data) }];
  return Object.entries(data).map(([k, v]) => ({
    key: k,
    value: typeof v === "object" ? JSON.stringify(v) : String(v),
  }));
};

/* ─── KVPanel ────────────────────────────────────────────────────────────── */

const MAX_PREVIEW = 300;

const KVPanel = ({ sections, isDark, color }) => {
  const [expanded, setExpanded] = useState({});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sections.map((section, si) => (
        <div key={si}>
          {section.heading && (
            <div
              style={{
                fontSize: 9,
                letterSpacing: 0.9,
                textTransform: "uppercase",
                color,
                opacity: 0.28,
                fontFamily: "Menlo, Monaco, Consolas, monospace",
                marginBottom: 3,
                marginTop: si > 0 ? 7 : 2,
                userSelect: "none",
              }}
            >
              {section.heading}
            </div>
          )}
          {section.pairs.map(({ key, value }, pi) => {
            const id = `${si}-${pi}`;
            const isLong = value.length > MAX_PREVIEW;
            const isOpen = expanded[id];
            const display =
              isLong && !isOpen ? value.slice(0, MAX_PREVIEW) + "…" : value;
            return (
              <div
                key={pi}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  minHeight: 18,
                }}
              >
                <span
                  style={{
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    fontSize: 10.5,
                    color,
                    opacity: 0.3,
                    flexShrink: 0,
                    minWidth: 52,
                    paddingTop: 1,
                    userSelect: "none",
                  }}
                >
                  {key}
                </span>
                <span
                  style={{
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    fontSize: 10.5,
                    color,
                    opacity: 0.68,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    lineHeight: 1.58,
                  }}
                >
                  {display}
                  {isLong && !isOpen && (
                    <button
                      onClick={() => setExpanded((e) => ({ ...e, [id]: true }))}
                      style={{
                        marginLeft: 5,
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontSize: 9.5,
                        color,
                        opacity: 0.35,
                        fontFamily: "inherit",
                      }}
                    >
                      show more
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/* ─── ToolTitle ─────────────────────────────────────────────────────────── */

/* tag pill shown as the timeline title for tool_call */
const ToolTag = ({ name, isDark }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 7px",
      borderRadius: 5,
      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: "0.82em",
      letterSpacing: 0.1,
      color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)",
      userSelect: "none",
      WebkitUserSelect: "none",
    }}
  >
    {name}
  </span>
);

/* hollow circle point marker for tool_call */
const HammerPoint = ({ isDark }) => (
  <div
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: "transparent",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)"}`,
      flexShrink: 0,
      boxSizing: "border-box",
    }}
  />
);

/* ─── ErrorPoint ─────────────────────────────────────────────────────────── */

const ErrorPoint = () => (
  <div
    style={{
      width: 16,
      height: 16,
      flexShrink: 0,
      color: "#ef4444",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="16"
      height="16"
    >
      <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z" />
    </svg>
  </div>
);

/* ─── TraceChain ─────────────────────────────────────────────────────────── */

const TraceChain = ({
  frames = [],
  status,
  streamingContent = "",
  onToolConfirmationDecision,
  toolConfirmationUiStateById = {},
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const [bodyOpen, setBodyOpen] = useState(true);

  const isStreaming = status === "streaming";

  // Identify which final_message frames are "intermediate" (not the very last
  // one when the stream is finished). During streaming every final_message is
  // considered intermediate because more content may follow. Once done, all
  // but the last final_message are intermediate — the last one is rendered by
  // the normal AssistantMessageBody bubble instead.
  const intermediateFinalMessageSeqs = useMemo(() => {
    const hasToolCall = frames.some((frame) => frame?.type === "tool_call");
    if (!hasToolCall) {
      return new Set();
    }

    const finalMessageFrames = frames
      .filter(
        (frame) =>
          frame?.type === "final_message" &&
          typeof frame.payload?.content === "string" &&
          frame.payload.content.trim().length > 0,
      )
      .sort((left, right) => {
        const leftSeq = Number(left?.seq);
        const rightSeq = Number(right?.seq);
        const leftHasSeq = Number.isFinite(leftSeq);
        const rightHasSeq = Number.isFinite(rightSeq);
        if (leftHasSeq && rightHasSeq && leftSeq !== rightSeq) {
          return leftSeq - rightSeq;
        }

        const leftTs = Number(left?.ts);
        const rightTs = Number(right?.ts);
        const leftHasTs = Number.isFinite(leftTs);
        const rightHasTs = Number.isFinite(rightTs);
        if (leftHasTs && rightHasTs && leftTs !== rightTs) {
          return leftTs - rightTs;
        }

        return 0;
      });

    if (finalMessageFrames.length === 0) {
      return new Set();
    }

    // While streaming, show ALL final_messages in the timeline (more may come).
    // Once done, keep all except the very last one (which lives in the bubble).
    const included = isStreaming
      ? finalMessageFrames
      : finalMessageFrames.slice(0, -1);

    return new Set(
      included
        .map((frame) => Number(frame.seq))
        .filter((seq) => Number.isFinite(seq)),
    );
  }, [frames, isStreaming]);

  const displayFrames = useMemo(
    () =>
      frames.filter((frame) => {
        if (!DISPLAY_FRAME_TYPES.has(frame.type)) {
          return false;
        }

        if (frame.type !== "final_message") {
          return true;
        }

        const seq = Number(frame.seq);
        return Number.isFinite(seq) && intermediateFinalMessageSeqs.has(seq);
      }),
    [frames, intermediateFinalMessageSeqs],
  );
  const startFrame = frames.find((f) => f.type === "stream_started");
  const doneFrame = frames.find((f) => f.type === "done");
  const duration =
    startFrame && doneFrame ? doneFrame.ts - startFrame.ts : null;

  const stepCount = displayFrames.filter(
    (f) => f.type === "tool_call" || f.type === "reasoning",
  ).length;
  const hasError = displayFrames.some((f) => f.type === "error");

  const toolResultByCallId = useMemo(() => {
    const m = new Map();
    for (const frame of frames) {
      if (frame.type === "tool_result" && frame.payload?.call_id) {
        m.set(frame.payload.call_id, frame);
      }
    }
    return m;
  }, [frames]);

  const confirmationStatusByCallId = useMemo(() => {
    const map = new Map();
    for (const frame of frames) {
      if (!frame?.payload?.call_id) {
        continue;
      }
      if (frame.type === "tool_confirmed") {
        map.set(frame.payload.call_id, "approved");
      } else if (frame.type === "tool_denied") {
        map.set(frame.payload.call_id, "denied");
      }
    }
    return map;
  }, [frames]);

  const timelineItems = useMemo(() => {
    const items = [];
    const renderedCallIds = new Set();
    let prevTs = startFrame?.ts ?? null;

    for (const frame of displayFrames) {
      const delta =
        prevTs != null && frame.ts != null ? frame.ts - prevTs : null;
      if (frame.ts != null) prevTs = frame.ts;
      const spanText =
        delta != null && delta > 0 ? `+${formatDelta(delta)}` : null;

      if (frame.type === "reasoning" || frame.type === "observation") {
        const text = extractText(frame.payload);
        const isObs = frame.type === "observation";
        items.push({
          key: `${frame.seq}-${frame.type}`,
          title: isObs ? "Observation" : "Reasoning",
          span: spanText,
          status: "done",
          body: !isObs && text ? text : undefined,
          details:
            isObs && text ? (
              <SeamlessMarkdown
                content={text}
                status="done"
                fontSize={12}
                lineHeight={1.65}
                style={{
                  color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
                }}
              />
            ) : undefined,
        });
      } else if (frame.type === "tool_confirmation_request") {
        const callId =
          typeof frame.payload?.call_id === "string" ? frame.payload.call_id : "";
        const toolName =
          typeof frame.payload?.tool_name === "string"
            ? frame.payload.tool_name
            : "tool";
        const confirmationId =
          typeof frame.payload?.confirmation_id === "string"
            ? frame.payload.confirmation_id
            : "";
        const description =
          typeof frame.payload?.description === "string"
            ? frame.payload.description.trim()
            : "";
        const args = frame.payload?.arguments;
        const confirmationResult = callId
          ? confirmationStatusByCallId.get(callId)
          : "";

        const confirmationUiState =
          confirmationId && toolConfirmationUiStateById
            ? toolConfirmationUiStateById[confirmationId] || {}
            : {};
        const uiStatus =
          typeof confirmationUiState?.status === "string"
            ? confirmationUiState.status
            : "idle";
        const uiError =
          typeof confirmationUiState?.error === "string"
            ? confirmationUiState.error
            : "";
        const uiResolved = confirmationUiState?.resolved === true;
        const uiDecision =
          confirmationUiState?.decision === "approved" ||
          confirmationUiState?.decision === "denied"
            ? confirmationUiState.decision
            : "";
        const resolvedDecision = confirmationResult || uiDecision;

        const isResolved =
          resolvedDecision === "approved" || resolvedDecision === "denied";
        const isSubmitting =
          !uiResolved && (uiStatus === "submitting" || uiStatus === "submitted");

        let statusLabel = "Pending";
        if (resolvedDecision === "approved") {
          statusLabel = "Approved";
        } else if (resolvedDecision === "denied") {
          statusLabel = "Denied";
        } else if (uiResolved) {
          statusLabel = "Submitted";
        } else if (isSubmitting) {
          statusLabel = "Submitting...";
        } else if (uiError) {
          statusLabel = "Failed to submit";
        }

        const canTakeAction =
          !isResolved &&
          !uiResolved &&
          !isSubmitting &&
          confirmationId &&
          typeof onToolConfirmationDecision === "function";

        const statusColor = isResolved
          ? resolvedDecision === "approved"
            ? isDark
              ? "rgba(110,231,183,0.95)"
              : "rgba(5,150,105,0.95)"
            : isDark
              ? "rgba(252,165,165,0.95)"
              : "rgba(220,38,38,0.95)"
          : isDark
            ? "rgba(255,255,255,0.6)"
            : "rgba(0,0,0,0.52)";

        const argsPairs = toKVPairs(args);
        const detailsSections = [];
        if (description) {
          detailsSections.push({
            heading: "description",
            pairs: [{ key: "text", value: description }],
          });
        }
        if (argsPairs.length) {
          detailsSections.push({
            heading: "args",
            pairs: argsPairs,
          });
        }
        if (uiError) {
          detailsSections.push({
            heading: "error",
            pairs: [{ key: "message", value: uiError }],
          });
        }

        const actionButtonBaseStyle = {
          border: "none",
          borderRadius: 6,
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 11.5,
          lineHeight: 1.4,
          fontFamily: "Menlo, Monaco, Consolas, monospace",
        };

        items.push({
          key: `${frame.seq}-tool-confirmation`,
          title: "Tool Confirmation",
          span: spanText,
          status: isResolved ? "done" : "active",
          point: isResolved ? <HammerPoint isDark={isDark} /> : "loading",
          body: (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <ToolTag name={toolName} isDark={isDark} />
              <span
                style={{
                  fontSize: 11.5,
                  color: statusColor,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                }}
              >
                {statusLabel}
              </span>
              {canTakeAction && (
                <>
                  <button
                    onClick={() =>
                      onToolConfirmationDecision({
                        confirmationId,
                        approved: true,
                      })
                    }
                    style={{
                      ...actionButtonBaseStyle,
                      color: isDark ? "rgba(209,250,229,0.95)" : "#065f46",
                      backgroundColor: isDark
                        ? "rgba(16,185,129,0.22)"
                        : "rgba(16,185,129,0.16)",
                    }}
                  >
                    Allow
                  </button>
                  <button
                    onClick={() =>
                      onToolConfirmationDecision({
                        confirmationId,
                        approved: false,
                      })
                    }
                    style={{
                      ...actionButtonBaseStyle,
                      color: isDark ? "rgba(254,202,202,0.98)" : "#991b1b",
                      backgroundColor: isDark
                        ? "rgba(239,68,68,0.2)"
                        : "rgba(239,68,68,0.14)",
                    }}
                  >
                    Deny
                  </button>
                </>
              )}
            </div>
          ),
          details:
            detailsSections.length > 0 ? (
              <KVPanel sections={detailsSections} isDark={isDark} color={color} />
            ) : undefined,
        });
      } else if (frame.type === "tool_call") {
        const callId = frame.payload?.call_id;
        if (callId && renderedCallIds.has(callId)) continue;
        if (callId) renderedCallIds.add(callId);

        const toolName = frame.payload?.tool_name || "tool";
        const args = frame.payload?.arguments;
        const resultFrame = callId ? toolResultByCallId.get(callId) : null;
        const result = resultFrame?.payload?.result;
        const internalDelta =
          resultFrame?.ts && frame.ts ? resultFrame.ts - frame.ts : null;

        const sections = [];
        if (internalDelta != null)
          sections.push({
            pairs: [{ key: "took", value: formatDelta(internalDelta) }],
          });
        const argPairs = toKVPairs(args);
        if (argPairs.length)
          sections.push({ heading: "args", pairs: argPairs });
        const resPairs = toKVPairs(result);
        if (resPairs.length)
          sections.push({ heading: "result", pairs: resPairs });

        items.push({
          key: `${frame.seq}-tool`,
          title: <ToolTag name={toolName} isDark={isDark} />,
          span: spanText,
          status: "done",
          point: <HammerPoint isDark={isDark} />,
          details:
            sections.length > 0 ? (
              <KVPanel sections={sections} isDark={isDark} color={color} />
            ) : undefined,
        });
      } else if (frame.type === "error") {
        const msg = frame.payload?.message || "Unknown error";
        const code = frame.payload?.code;
        const pairs = [
          ...(code != null ? [{ key: "code", value: String(code) }] : []),
          { key: "message", value: msg },
        ];
        items.push({
          key: `${frame.seq}-error`,
          title: "Error",
          span: spanText,
          status: "done",
          point: <ErrorPoint />,
          details: (
            <KVPanel
              sections={[{ pairs }]}
              isDark={isDark}
              color={isDark ? "#f87171" : "#dc2626"}
            />
          ),
        });
      } else if (frame.type === "final_message") {
        const content =
          typeof frame.payload?.content === "string" ? frame.payload.content : "";
        if (!content.trim()) continue;
        items.push({
          key: `${frame.seq}-final-message`,
          title: "Response",
          span: spanText,
          status: "done",
          body: (
            <div style={{ fontFamily: "inherit" }}>
              <SeamlessMarkdown
                content={content}
                status={isStreaming ? "streaming" : "done"}
                fontSize={13}
                lineHeight={1.6}
              />
            </div>
          ),
        });
      }
    }

    if (isStreaming) {
      const liveContent =
        typeof streamingContent === "string" ? streamingContent : "";
      if (liveContent.trim()) {
        items.push({
          key: "__streaming_content__",
          title: "Response",
          span: null,
          status: "active",
          point: "loading",
          body: (
            <div style={{ fontFamily: "inherit" }}>
              <SeamlessMarkdown
                content={liveContent}
                status="streaming"
                fontSize={13}
                lineHeight={1.6}
                priority="high"
              />
            </div>
          ),
        });
      } else {
        items.push({
          key: "__streaming__",
          title: "Thinking…",
          span: null,
          status: "active",
          point: "loading",
        });
      }
    }

    return items;
  }, [
    displayFrames,
    isStreaming,
    streamingContent,
    startFrame,
    toolResultByCallId,
    confirmationStatusByCallId,
    onToolConfirmationDecision,
    toolConfirmationUiStateById,
    isDark,
    color,
  ]);

  if (timelineItems.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      {/* collapsible header */}
      <div
        onClick={() => setBodyOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          userSelect: "none",
          marginBottom: bodyOpen ? 6 : 0,
        }}
      >
        <Icon
          src="arrow_right"
          color={color}
          style={{
            width: 16,
            height: 16,
            opacity: 0.25,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.2s ease",
            transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            color,
            opacity: 0.38,
            fontFamily: theme?.font?.fontFamily || "inherit",
            letterSpacing: 0.1,
          }}
        >
          {isStreaming && !doneFrame
            ? "Thinking…"
            : hasError
              ? (stepCount > 0
                  ? `Failed after ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                  : "Failed") + (duration ? ` · ${formatDelta(duration)}` : "")
              : (stepCount > 0
                  ? `Used ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                  : "Processing") +
                (duration ? ` · ${formatDelta(duration)}` : "")}
        </span>
      </div>

      {/* Timeline */}
      <AnimatedChildren open={bodyOpen}>
        <div style={{ paddingLeft: 2, paddingBottom: 2 }}>
          <Timeline items={timelineItems} style={{ fontSize: 13 }} />
        </div>
      </AnimatedChildren>
    </div>
  );
};

export default memo(TraceChain);
