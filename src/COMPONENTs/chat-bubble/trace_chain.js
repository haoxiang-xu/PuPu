import { memo, useState, useContext, useMemo, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import AnimatedChildren from "../../BUILTIN_COMPONENTs/class/animated_children";
import Timeline from "../../BUILTIN_COMPONENTs/timeline/timeline";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SeamlessMarkdown from "./components/seamless_markdown";
import {
  ASSISTANT_MARKDOWN_FONT_SIZE,
  ASSISTANT_MARKDOWN_LINE_HEIGHT,
} from "./components/assistant_markdown_metrics";
import InteractWrapper from "./interact/interact_wrapper";

/* ─── constants & helpers ────────────────────────────────────────────────── */

const DISPLAY_FRAME_TYPES = new Set([
  "reasoning",
  "observation",
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

const getToolDisplayName = (payload) => {
  const displayName =
    typeof payload?.tool_display_name === "string"
      ? payload.tool_display_name.trim()
      : "";
  if (displayName) return displayName;

  const toolName =
    typeof payload?.tool_name === "string" ? payload.tool_name.trim() : "";
  return toolName || "tool";
};

const normalizePersistedInteractionResponse = (interactType, payload = {}) => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  if (
    payload.user_response &&
    typeof payload.user_response === "object" &&
    !Array.isArray(payload.user_response)
  ) {
    return payload.user_response;
  }

  const otherText =
    typeof payload.other_text === "string" && payload.other_text.trim()
      ? payload.other_text.trim()
      : undefined;
  const selectedValues = Array.isArray(payload.selected_values)
    ? payload.selected_values.filter(
        (value) => typeof value === "string" && value.trim(),
      )
    : [];

  if (interactType === "single" && selectedValues.length > 0) {
    return {
      value: selectedValues[0],
      ...(otherText ? { other_text: otherText } : {}),
    };
  }

  if (interactType === "multi" && selectedValues.length > 0) {
    return {
      values: selectedValues,
      ...(otherText ? { other_text: otherText } : {}),
    };
  }

  if (
    interactType === "multi_choice" &&
    Array.isArray(payload.selected) &&
    payload.selected.length > 0
  ) {
    return {
      selected: payload.selected.filter(
        (value) => typeof value === "string" && value.trim(),
      ),
    };
  }

  if (interactType === "text_input" && typeof payload.text === "string") {
    return { text: payload.text };
  }

  if (typeof payload.value === "string") {
    return {
      value: payload.value,
      ...(otherText ? { other_text: otherText } : {}),
    };
  }

  if (Array.isArray(payload.values) && payload.values.length > 0) {
    return {
      values: payload.values.filter(
        (value) => typeof value === "string" && value.trim(),
      ),
      ...(otherText ? { other_text: otherText } : {}),
    };
  }

  return undefined;
};

/* ─── KVPanel ────────────────────────────────────────────────────────────── */

const MAX_PREVIEW = 300;
const TRACE_DETAIL_MARKDOWN_STYLE = Object.freeze({
  blockGap: 6,
  paragraphMargin: "0",
  list: {
    paddingLeft: 18,
    margin: "0",
    itemMargin: "0.1em 0",
  },
  blockquote: {
    margin: "0",
    paddingLeft: 10,
  },
  table: {
    margin: "0",
  },
});

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

/* count badge shown next to ToolTag when consecutive calls are grouped */
const CountBadge = ({ count, isDark }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 5px",
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.055)",
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: "0.72em",
      color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
      userSelect: "none",
      WebkitUserSelect: "none",
    }}
  >
    ×{count}
  </span>
);

/* ─── Subagent helpers ──────────────────────────────────────────────────── */

const SUBAGENT_TOOLS = new Set([
  "delegate_to_subagent",
  "handoff_to_subagent",
  "spawn_worker_batch",
]);

/* tag pill for subagent — purple-tinted to distinguish from regular tools */
const SubagentTag = ({ name, isDark }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 7px",
      borderRadius: 5,
      background: isDark ? "rgba(168,130,255,0.10)" : "rgba(124,58,237,0.07)",
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: "0.82em",
      letterSpacing: 0.1,
      color: isDark ? "rgba(196,170,255,0.85)" : "rgba(109,40,217,0.8)",
      userSelect: "none",
      WebkitUserSelect: "none",
    }}
  >
    {name}
  </span>
);

/* double-circle point marker for subagent nodes */
const SubagentPoint = ({ isDark }) => (
  <div
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: "transparent",
      border: `1.5px solid ${isDark ? "rgba(168,130,255,0.4)" : "rgba(124,58,237,0.35)"}`,
      boxShadow: `0 0 0 2.5px ${isDark ? "rgba(168,130,255,0.12)" : "rgba(124,58,237,0.08)"}`,
      flexShrink: 0,
      boxSizing: "border-box",
    }}
  />
);

/* render a list of worker results as compact rows */
const WorkerResultList = ({ results, isDark, color }) => {
  if (!Array.isArray(results) || results.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {results.map((r, i) => {
        const status = r?.status || "unknown";
        const output = r?.output || r?.summary || "";
        const failed = status === "failed" || status === "timeout";
        const error = r?.error || "";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "4px 0",
              borderBottom:
                i < results.length - 1
                  ? `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`
                  : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  fontSize: 10,
                  color,
                  opacity: 0.3,
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                #{i + 1}
              </span>
              <span
                style={{
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  fontSize: 10,
                  color: failed
                    ? isDark
                      ? "rgba(252,165,165,0.9)"
                      : "rgba(220,38,38,0.85)"
                    : isDark
                      ? "rgba(110,231,183,0.85)"
                      : "rgba(5,150,105,0.85)",
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                {status}
              </span>
            </div>
            {(output || error) && (
              <span
                style={{
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  fontSize: 10.5,
                  color,
                  opacity: failed ? 0.5 : 0.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.5,
                }}
              >
                {failed && error ? error : output}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

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
  pendingContinuationRequest,
  onContinuationDecision,
}) => {
  const handleInteractSubmit = useCallback(
    (confirmationId, interactType, responseData) => {
      if (typeof onToolConfirmationDecision !== "function") return;
      if (interactType === "confirmation") {
        onToolConfirmationDecision({
          confirmationId,
          approved: responseData?.approved ?? false,
        });
      } else {
        onToolConfirmationDecision({
          confirmationId,
          approved: true,
          userResponse: responseData,
        });
      }
    },
    [onToolConfirmationDecision],
  );
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

  const confirmationUserResponseByCallId = useMemo(() => {
    const map = new Map();
    for (const frame of frames) {
      if (
        (frame?.type !== "tool_confirmed" && frame?.type !== "tool_denied") ||
        !frame?.payload?.call_id ||
        frame?.payload?.user_response === undefined
      ) {
        continue;
      }

      map.set(frame.payload.call_id, frame.payload.user_response);
    }
    return map;
  }, [frames]);

  const interactTypeByCallId = useMemo(() => {
    const map = new Map();
    for (const frame of frames) {
      if (frame?.type !== "tool_call" || !frame?.payload?.call_id) {
        continue;
      }
      const rc = frame.payload?.render_component;
      const itype =
        typeof rc?.type === "string" && rc.type
          ? rc.type
          : typeof frame.payload?.interact_type === "string"
            ? frame.payload.interact_type
            : "";
      if (itype) {
        map.set(frame.payload.call_id, itype);
      }
    }
    return map;
  }, [frames]);

  const toolResultUserResponseByCallId = useMemo(() => {
    const map = new Map();
    for (const frame of frames) {
      if (frame?.type !== "tool_result" || !frame?.payload?.call_id) {
        continue;
      }

      const rcType = frame?.payload?.render_component?.type;
      const interactType =
        typeof rcType === "string" && rcType
          ? rcType
          : typeof frame?.payload?.interact_type === "string"
            ? frame.payload.interact_type
            : interactTypeByCallId.get(frame.payload.call_id) ||
              (typeof frame?.payload?.tool_name === "string" &&
              frame.payload.tool_name === "ask_user_question"
                ? "single"
                : "");
      const normalized = normalizePersistedInteractionResponse(
        interactType,
        frame.payload?.result,
      );
      if (normalized !== undefined) {
        map.set(frame.payload.call_id, normalized);
      }
    }
    return map;
  }, [frames, interactTypeByCallId]);

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
                  ...TRACE_DETAIL_MARKDOWN_STYLE,
                  color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
                }}
              />
            ) : undefined,
        });
      } else if (frame.type === "tool_call") {
        const callId = frame.payload?.call_id;
        if (callId && renderedCallIds.has(callId)) continue;
        if (callId) renderedCallIds.add(callId);

        const toolName = getToolDisplayName(frame.payload);
        const args = frame.payload?.arguments;
        const confirmationId =
          typeof frame.payload?.confirmation_id === "string"
            ? frame.payload.confirmation_id
            : "";
        const description =
          typeof frame.payload?.description === "string"
            ? frame.payload.description.trim()
            : "";
        const requiresConfirmation =
          frame.payload?.requires_confirmation === true ||
          Boolean(confirmationId);
        const rc = frame.payload?.render_component;
        const interactType =
          typeof rc?.type === "string" && rc.type
            ? rc.type
            : typeof frame.payload?.interact_type === "string"
              ? frame.payload.interact_type
              : "confirmation";
        const interactConfig =
          rc?.config && typeof rc.config === "object"
            ? rc.config
            : frame.payload?.interact_config || {};
        const resultFrame = callId ? toolResultByCallId.get(callId) : null;
        const result = resultFrame?.payload?.result;
        const internalDelta =
          resultFrame?.ts && frame.ts ? resultFrame.ts - frame.ts : null;

        /* ── subagent tool calls get special rendering ── */
        if (SUBAGENT_TOOLS.has(frame.payload?.tool_name)) {
          const isDelegate = frame.payload.tool_name === "delegate_to_subagent";
          const isBatch = frame.payload.tool_name === "spawn_worker_batch";
          const target = args?.target || "worker";
          const task = args?.task || args?.reason || "";
          const batchTasks = isBatch && Array.isArray(args?.tasks) ? args.tasks : [];
          const batchCount = isBatch ? batchTasks.length : 0;
          const resultStatus = result?.status || (resultFrame ? "done" : "");
          const resultOutput = result?.output || result?.summary || "";
          const batchResults = isBatch ? result?.results : null;
          const failed =
            resultStatus === "failed" ||
            resultStatus === "timeout" ||
            resultStatus === "partial_failure";

          const detailSections = [];
          if (internalDelta != null)
            detailSections.push({
              pairs: [{ key: "took", value: formatDelta(internalDelta) }],
            });
          if (task)
            detailSections.push({
              heading: isDelegate ? "task" : "reason",
              pairs: [{ key: "text", value: task }],
            });
          if (resultOutput && !isBatch)
            detailSections.push({
              heading: "output",
              pairs: [{ key: "text", value: resultOutput }],
            });
          if (result?.error)
            detailSections.push({
              heading: "error",
              pairs: [{ key: "message", value: result.error }],
            });

          const hasDetails =
            detailSections.length > 0 || (Array.isArray(batchResults) && batchResults.length > 0);

          items.push({
            key: `${frame.seq}-subagent`,
            title: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <SubagentTag name={target} isDark={isDark} />
                {batchCount > 1 && (
                  <CountBadge count={batchCount} isDark={isDark} />
                )}
                {resultStatus && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "Menlo, Monaco, Consolas, monospace",
                      color: failed
                        ? isDark
                          ? "rgba(252,165,165,0.9)"
                          : "rgba(220,38,38,0.85)"
                        : isDark
                          ? "rgba(110,231,183,0.8)"
                          : "rgba(5,150,105,0.8)",
                      userSelect: "none",
                    }}
                  >
                    {resultStatus}
                  </span>
                )}
              </span>
            ),
            span: spanText,
            status: resultFrame ? "done" : "active",
            point: resultFrame ? (
              <SubagentPoint isDark={isDark} />
            ) : (
              "loading"
            ),
            body: isBatch && batchTasks.length > 0 && !resultFrame
              ? batchTasks.map((t, i) => `${i + 1}. ${t?.task || "..."}`).join("\n")
              : undefined,
            details: hasDetails ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detailSections.length > 0 && (
                  <KVPanel sections={detailSections} isDark={isDark} color={color} />
                )}
                {Array.isArray(batchResults) && batchResults.length > 0 && (
                  <WorkerResultList results={batchResults} isDark={isDark} color={color} />
                )}
              </div>
            ) : undefined,
          });
          continue;
        }

        const confirmationResult = callId
          ? confirmationStatusByCallId.get(callId)
          : "";
        const confirmationUiState =
          confirmationId && toolConfirmationUiStateById
            ? toolConfirmationUiStateById[confirmationId] || {}
            : {};
        const persistedUserResponse =
          callId && confirmationUserResponseByCallId.has(callId)
            ? confirmationUserResponseByCallId.get(callId)
            : callId && toolResultUserResponseByCallId.has(callId)
              ? toolResultUserResponseByCallId.get(callId)
              : undefined;
        const effectiveConfirmationUiState =
          persistedUserResponse !== undefined &&
          confirmationUiState?.userResponse === undefined
            ? {
                ...confirmationUiState,
                userResponse: persistedUserResponse,
              }
            : confirmationUiState;
        const hasPersistedSelectionResult =
          persistedUserResponse !== undefined && resultFrame != null;
        const uiStatus =
          typeof effectiveConfirmationUiState?.status === "string"
            ? effectiveConfirmationUiState.status
            : "idle";
        const uiError =
          typeof effectiveConfirmationUiState?.error === "string"
            ? effectiveConfirmationUiState.error
            : "";
        const uiResolved =
          effectiveConfirmationUiState?.resolved === true ||
          hasPersistedSelectionResult;
        const uiDecision =
          effectiveConfirmationUiState?.decision === "approved" ||
          effectiveConfirmationUiState?.decision === "denied"
            ? effectiveConfirmationUiState.decision
            : "";
        const resolvedDecision =
          confirmationResult ||
          uiDecision ||
          (hasPersistedSelectionResult ? "approved" : "");
        const isResolved =
          resolvedDecision === "approved" || resolvedDecision === "denied";
        const isSubmitting =
          !uiResolved &&
          (uiStatus === "submitting" || uiStatus === "submitted");
        const isInlineInteraction = requiresConfirmation && confirmationId;
        const isSelectionInteraction =
          interactType !== "confirmation" && isInlineInteraction;

        const sections = [];
        if (internalDelta != null)
          sections.push({
            pairs: [{ key: "took", value: formatDelta(internalDelta) }],
          });
        if (!isSelectionInteraction) {
          if (description) {
            sections.push({
              heading: "description",
              pairs: [{ key: "text", value: description }],
            });
          }
          const argPairs = toKVPairs(args);
          if (argPairs.length)
            sections.push({ heading: "args", pairs: argPairs });
        }
        const resPairs = toKVPairs(result);
        if (resPairs.length)
          sections.push({ heading: "result", pairs: resPairs });
        if (uiError) {
          sections.push({
            heading: "error",
            pairs: [{ key: "message", value: uiError }],
          });
        }

        if (isInlineInteraction) {
          let statusLabel = "Pending";
          if (resolvedDecision === "approved") {
            statusLabel = isSelectionInteraction ? "Selected" : "Approved";
          } else if (resolvedDecision === "denied") {
            statusLabel = "Denied";
          } else if (uiResolved) {
            statusLabel = isSelectionInteraction ? "Selected" : "Submitted";
          } else if (isSubmitting) {
            statusLabel = "Submitting...";
          } else if (uiError) {
            statusLabel = "Failed to submit";
          }

          const canTakeAction =
            !isResolved &&
            !uiResolved &&
            !isSubmitting &&
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

          const interactTitle =
            interactType === "confirmation"
              ? "Tool Confirmation"
              : interactType === "multi_choice" ||
                  interactType === "single" ||
                  interactType === "multi"
                ? "Selection"
                : interactType === "text_input"
                  ? "Input Requested"
                  : "Interaction";

          items.push({
            key: `${frame.seq}-tool`,
            title: interactTitle,
            span: spanText,
            status: isResolved ? "done" : "active",
            point: isResolved ? <HammerPoint isDark={isDark} /> : "loading",
            body: (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
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
                </div>
                {interactType !== "confirmation" ? (
                  <InteractWrapper
                    type={interactType}
                    config={interactConfig}
                    onSubmit={(data) =>
                      handleInteractSubmit(confirmationId, interactType, data)
                    }
                    uiState={effectiveConfirmationUiState}
                    isDark={isDark}
                    disabled={!canTakeAction}
                  />
                ) : canTakeAction ? (
                  <InteractWrapper
                    type={interactType}
                    config={interactConfig}
                    onSubmit={(data) =>
                      handleInteractSubmit(confirmationId, interactType, data)
                    }
                    uiState={effectiveConfirmationUiState}
                    isDark={isDark}
                    disabled={false}
                  />
                ) : null}
              </div>
            ),
            details:
              sections.length > 0 ? (
                <KVPanel sections={sections} isDark={isDark} color={color} />
              ) : undefined,
          });
          continue;
        }

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
          _toolName: toolName,
          _sections: sections,
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
          typeof frame.payload?.content === "string"
            ? frame.payload.content
            : "";
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
                fontSize={ASSISTANT_MARKDOWN_FONT_SIZE}
                lineHeight={ASSISTANT_MARKDOWN_LINE_HEIGHT}
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
                fontSize={ASSISTANT_MARKDOWN_FONT_SIZE}
                lineHeight={ASSISTANT_MARKDOWN_LINE_HEIGHT}
                priority="high"
              />
            </div>
          ),
        });
      } else if (!pendingContinuationRequest) {
        items.push({
          key: "__streaming__",
          title: "Thinking…",
          span: null,
          status: "active",
          point: "loading",
        });
      }
    }

    if (pendingContinuationRequest) {
      const isSubmitting = pendingContinuationRequest.status === "submitting";
      const canAct =
        !isSubmitting && typeof onContinuationDecision === "function";
      items.push({
        key: "__continuation__",
        title: "Continue?",
        span: null,
        status: "active",
        point: "loading",
        body: (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.52)",
                fontFamily: "Menlo, Monaco, Consolas, monospace",
              }}
            >
              Agent reached {pendingContinuationRequest.iteration} iterations
              without a final response.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={!canAct}
                onClick={() =>
                  onContinuationDecision({
                    confirmationId: pendingContinuationRequest.confirmationId,
                    approved: true,
                  })
                }
                style={{
                  padding: "4px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: isDark
                    ? "rgba(110,231,183,0.18)"
                    : "rgba(5,150,105,0.12)",
                  color: isDark
                    ? "rgba(110,231,183,0.95)"
                    : "rgba(5,150,105,0.95)",
                  cursor: canAct ? "pointer" : "default",
                  fontWeight: 500,
                  fontSize: 12,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  opacity: canAct ? 1 : 0.5,
                }}
              >
                Continue
              </button>
              <button
                disabled={!canAct}
                onClick={() =>
                  onContinuationDecision({
                    confirmationId: pendingContinuationRequest.confirmationId,
                    approved: false,
                  })
                }
                style={{
                  padding: "4px 14px",
                  borderRadius: 6,
                  border: isDark
                    ? "1px solid rgba(252,165,165,0.3)"
                    : "1px solid rgba(220,38,38,0.2)",
                  background: "transparent",
                  color: isDark
                    ? "rgba(252,165,165,0.95)"
                    : "rgba(220,38,38,0.95)",
                  cursor: canAct ? "pointer" : "default",
                  fontWeight: 500,
                  fontSize: 12,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  opacity: canAct ? 1 : 0.5,
                }}
              >
                Stop
              </button>
            </div>
          </div>
        ),
      });
    }

    /* ── group consecutive identical tool calls ── */
    const grouped = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (!item._toolName) {
        grouped.push(item);
        i++;
        continue;
      }
      /* collect consecutive run of the same tool name */
      const run = [item];
      while (
        i + run.length < items.length &&
        items[i + run.length]._toolName === item._toolName
      ) {
        run.push(items[i + run.length]);
      }
      i += run.length;
      if (run.length === 1) {
        grouped.push(item);
        continue;
      }
      /* merge run into a single batched item */
      const allSections = run.flatMap((r) => r._sections || []);
      grouped.push({
        key: run.map((r) => r.key).join("+"),
        title: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ToolTag name={item._toolName} isDark={isDark} />
            <CountBadge count={run.length} isDark={isDark} />
          </span>
        ),
        span: run[run.length - 1].span,
        status: "done",
        point: <HammerPoint isDark={isDark} />,
        details:
          allSections.length > 0 ? (
            <KVPanel sections={allSections} isDark={isDark} color={color} />
          ) : undefined,
      });
    }

    return grouped;
  }, [
    displayFrames,
    isStreaming,
    streamingContent,
    startFrame,
    toolResultByCallId,
    confirmationStatusByCallId,
    confirmationUserResponseByCallId,
    toolResultUserResponseByCallId,
    handleInteractSubmit,
    onToolConfirmationDecision,
    toolConfirmationUiStateById,
    pendingContinuationRequest,
    onContinuationDecision,
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
