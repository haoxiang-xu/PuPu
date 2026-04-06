import { memo, useState, useContext, useMemo, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import AnimatedChildren from "../../BUILTIN_COMPONENTs/class/animated_children";
import Timeline from "../../BUILTIN_COMPONENTs/timeline/timeline";
import BranchGraph from "../../BUILTIN_COMPONENTs/branch_graph/branch_graph";
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

const SUBAGENT_TOOLS = new Set([
  "delegate_to_subagent",
  "handoff_to_subagent",
  "spawn_worker_batch",
]);

const MAX_TRACE_DEPTH = 8;
const MAX_PREVIEW = 300;

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
  if (!payload || typeof payload !== "object") return undefined;
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
    ? payload.selected_values.filter((v) => typeof v === "string" && v.trim())
    : [];
  if (interactType === "single" && selectedValues.length > 0) {
    return { value: selectedValues[0], ...(otherText ? { other_text: otherText } : {}) };
  }
  if (interactType === "multi" && selectedValues.length > 0) {
    return { values: selectedValues, ...(otherText ? { other_text: otherText } : {}) };
  }
  if (interactType === "multi_choice" && Array.isArray(payload.selected) && payload.selected.length > 0) {
    return { selected: payload.selected.filter((v) => typeof v === "string" && v.trim()) };
  }
  if (interactType === "text_input" && typeof payload.text === "string") {
    return { text: payload.text };
  }
  if (typeof payload.value === "string") {
    return { value: payload.value, ...(otherText ? { other_text: otherText } : {}) };
  }
  if (Array.isArray(payload.values) && payload.values.length > 0) {
    return {
      values: payload.values.filter((v) => typeof v === "string" && v.trim()),
      ...(otherText ? { other_text: otherText } : {}),
    };
  }
  return undefined;
};

const truncateInlineText = (value, max = 120) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}\u2026` : text;
};

const getSubagentShortLabel = ({ meta, fallbackAgentName = "", fallbackTemplate = "" }) => {
  const subagentId = typeof meta?.subagentId === "string" ? meta.subagentId.trim() : "";
  if (subagentId) {
    const parts = subagentId.split(".").filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join(".") : subagentId;
  }
  const agentName = typeof fallbackAgentName === "string" ? fallbackAgentName.trim() : "";
  if (agentName) {
    const parts = agentName.split(".").filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join(".") : agentName;
  }
  const template = typeof fallbackTemplate === "string" ? fallbackTemplate.trim() : "";
  return template || "subagent";
};

const getSubagentStatusColor = (status, isDark) => {
  const n = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (n === "failed" || n === "timeout" || n === "partial_failure") {
    return isDark ? "rgba(252,165,165,0.9)" : "rgba(220,38,38,0.85)";
  }
  if (n === "completed" || n === "done" || n === "running" || n === "spawned") {
    return isDark ? "rgba(110,231,183,0.88)" : "rgba(5,150,105,0.85)";
  }
  return isDark ? "rgba(255,255,255,0.56)" : "rgba(0,0,0,0.46)";
};

const getSubagentTraceStatus = (status) => {
  const n = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (n === "failed" || n === "timeout") return "error";
  if (n === "running" || n === "spawned" || n === "needs_clarification") return "streaming";
  return "done";
};

const formatPersistedValue = (val) => {
  if (!val || typeof val !== "object") return String(val ?? "");
  if (typeof val.value === "string") return val.value;
  if (Array.isArray(val.values)) return val.values.join(", ");
  if (Array.isArray(val.selected)) return val.selected.join(", ");
  if (typeof val.text === "string") return val.text;
  return JSON.stringify(val);
};

/* ─── sub-components ─────────────────────────────────────────────────────── */

const TRACE_DETAIL_MARKDOWN_STYLE = Object.freeze({
  blockGap: 6,
  paragraphMargin: "0",
  list: { paddingLeft: 18, margin: "0", itemMargin: "0.1em 0" },
  blockquote: { margin: "0", paddingLeft: 10 },
  table: { margin: "0" },
});

const COMPACT_RESPONSE_MARKDOWN_STYLE = Object.freeze({
  blockGap: 4,
  paragraphMargin: "0",
  list: { paddingLeft: 16, margin: "0", itemMargin: "0.05em 0" },
  blockquote: { margin: "0", paddingLeft: 8 },
  table: { margin: "0" },
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
                fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase",
                color, opacity: 0.28,
                fontFamily: "Menlo, Monaco, Consolas, monospace",
                marginBottom: 3, marginTop: si > 0 ? 7 : 2, userSelect: "none",
              }}
            >
              {section.heading}
            </div>
          )}
          {section.pairs.map(({ key, value }, pi) => {
            const id = `${si}-${pi}`;
            const isLong = value.length > MAX_PREVIEW;
            const isOpen = expanded[id];
            const display = isLong && !isOpen ? value.slice(0, MAX_PREVIEW) + "\u2026" : value;
            return (
              <div key={pi} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 18 }}>
                <span style={{
                  fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: 10.5,
                  color, opacity: 0.3, flexShrink: 0, minWidth: 52, paddingTop: 1, userSelect: "none",
                }}>{key}</span>
                <span style={{
                  fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: 10.5,
                  color, opacity: 0.68, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.58,
                }}>
                  {display}
                  {isLong && !isOpen && (
                    <button
                      onClick={() => setExpanded((e) => ({ ...e, [id]: true }))}
                      style={{
                        marginLeft: 5, background: "none", border: "none", padding: 0,
                        cursor: "pointer", fontSize: 9.5, color, opacity: 0.35, fontFamily: "inherit",
                      }}
                    >show more</button>
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

const ToolTag = ({ name, isDark, compact = false }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    padding: compact ? "1px 6px" : "1px 7px", borderRadius: compact ? 4 : 5,
    background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
    fontFamily: "Menlo, Monaco, Consolas, monospace",
    fontSize: compact ? "0.74em" : "0.82em", letterSpacing: 0.1,
    color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)",
    userSelect: "none", WebkitUserSelect: "none",
  }}>{name}</span>
);

const CountBadge = ({ count, isDark }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: "0 5px", minWidth: 16, height: 16, borderRadius: 8,
    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.055)",
    fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "0.72em",
    color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
    userSelect: "none", WebkitUserSelect: "none",
  }}>{"\u00D7"}{count}</span>
);

const SubagentTag = ({ name, isDark }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    padding: "1px 7px", borderRadius: 5,
    background: isDark ? "rgba(168,130,255,0.10)" : "rgba(124,58,237,0.07)",
    fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "0.82em", letterSpacing: 0.1,
    color: isDark ? "rgba(196,170,255,0.85)" : "rgba(109,40,217,0.8)",
    userSelect: "none", WebkitUserSelect: "none",
  }}>{name}</span>
);

const SubagentPoint = ({ isDark }) => (
  <div style={{
    width: 10, height: 10, borderRadius: "50%", background: "transparent",
    border: `1.5px solid ${isDark ? "rgba(168,130,255,0.4)" : "rgba(124,58,237,0.35)"}`,
    boxShadow: `0 0 0 2.5px ${isDark ? "rgba(168,130,255,0.12)" : "rgba(124,58,237,0.08)"}`,
    flexShrink: 0, boxSizing: "border-box",
  }} />
);

const HammerPoint = ({ isDark }) => (
  <div style={{
    width: 10, height: 10, borderRadius: "50%", background: "transparent",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)"}`,
    flexShrink: 0, boxSizing: "border-box",
  }} />
);

const ErrorPoint = () => (
  <div style={{ width: 16, height: 16, flexShrink: 0, color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z" />
    </svg>
  </div>
);

const BranchExpandArrow = ({ open, onClick, isDark }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    aria-label={open ? "Collapse" : "Expand"}
    style={{
      display: "inline-flex", alignItems: "center", gap: 3, padding: 0,
      background: "transparent", border: "none", cursor: "pointer",
      fontSize: "10px", color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
      fontFamily: "Menlo, Monaco, Consolas, monospace", outline: "none",
      userSelect: "none", WebkitUserSelect: "none", flexShrink: 0,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
  >
    {open ? "hide" : "detail"}
    <Icon src="arrow_down" color="currentColor" style={{
      width: 14, height: 14,
      transition: "transform 0.22s cubic-bezier(0.32,1,0.32,1)",
      transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0,
    }} />
  </button>
);

const TokenSummary = ({ input, output, total, isDark }) => {
  const fmt = (n) => typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "\u2013";
  const color = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
  return (
    <span style={{ fontSize: 10, fontFamily: "Menlo, Monaco, Consolas, monospace", color, userSelect: "none", letterSpacing: "0.01em" }}>
      {fmt(input)} in &middot; {fmt(output)} out &middot; {fmt(total)} total
    </span>
  );
};

/* ─── TraceChainV3 ───────────────────────────────────────────────────────── */

const TraceChainV3 = ({
  frames = [],
  status,
  streamingContent = "",
  onToolConfirmationDecision,
  toolConfirmationUiStateById = {},
  bundle,
  subagentFrames,
  subagentMetaByRunId,
  showContainerHeader = true,
  bubbleOwnsFinalMessage = true,
  compact = false,
  hideTrack = false,
  _depth = 0,
  /* legacy props accepted for compat — unused */
  pendingContinuationRequest: _pcr,
  onContinuationDecision: _ocd,
}) => {
  const handleInteractSubmit = useCallback(
    (confirmationId, interactType, responseData) => {
      if (typeof onToolConfirmationDecision !== "function") return;
      if (interactType === "confirmation") {
        onToolConfirmationDecision({ confirmationId, approved: responseData?.approved ?? false });
      } else {
        onToolConfirmationDecision({ confirmationId, approved: true, userResponse: responseData });
      }
    },
    [onToolConfirmationDecision],
  );

  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const [bodyOpen, setBodyOpen] = useState(true);

  const [branchState, setBranchState] = useState(() => new Map());
  const toggleBranchSummary = useCallback((callId) => {
    setBranchState((prev) => {
      const next = new Map(prev);
      const cur = next.get(callId) || { expanded: false, expandedWorkers: new Set() };
      next.set(callId, { ...cur, expanded: !cur.expanded });
      return next;
    });
  }, []);
  const toggleBranchWorker = useCallback((callId, wi) => {
    setBranchState((prev) => {
      const next = new Map(prev);
      const cur = next.get(callId) || { expanded: true, expandedWorkers: new Set() };
      const nw = new Set(cur.expandedWorkers);
      nw.has(wi) ? nw.delete(wi) : nw.add(wi);
      next.set(callId, { ...cur, expandedWorkers: nw });
      return next;
    });
  }, []);

  const isStreaming = status === "streaming";

  const effectiveSubagentFrames = useMemo(
    () => (subagentFrames && typeof subagentFrames === "object" ? subagentFrames : {}),
    [subagentFrames],
  );
  const effectiveSubagentMetaByRunId = useMemo(
    () => (subagentMetaByRunId && typeof subagentMetaByRunId === "object" ? subagentMetaByRunId : {}),
    [subagentMetaByRunId],
  );

  /* ── display frames: all renderable types (final_message filtering is in the pre-pass) ── */
  const displayFrames = useMemo(
    () => frames.filter((f) => DISPLAY_FRAME_TYPES.has(f.type)),
    [frames],
  );

  const startFrame = frames.find((f) => f.type === "stream_started");
  const doneFrame = frames.find((f) => f.type === "done");
  const duration = startFrame && doneFrame ? doneFrame.ts - startFrame.ts : null;

  const stepCount = displayFrames.filter((f) => f.type === "tool_call" || f.type === "reasoning").length;
  const hasError = displayFrames.some((f) => f.type === "error");

  /* ── lookup maps ── */
  const toolResultByCallId = useMemo(() => {
    const m = new Map();
    for (const f of frames) {
      if (f.type === "tool_result" && f.payload?.call_id) m.set(f.payload.call_id, f);
    }
    return m;
  }, [frames]);

  const confirmationStatusByCallId = useMemo(() => {
    const m = new Map();
    for (const f of frames) {
      if (!f?.payload?.call_id) continue;
      if (f.type === "tool_confirmed") m.set(f.payload.call_id, "approved");
      else if (f.type === "tool_denied") m.set(f.payload.call_id, "denied");
    }
    return m;
  }, [frames]);

  const childRunIdsBySubagentId = useMemo(() => {
    const m = new Map();
    Object.entries(effectiveSubagentMetaByRunId).forEach(([runId, meta]) => {
      const sid = typeof meta?.subagentId === "string" ? meta.subagentId.trim() : "";
      if (!sid) return;
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid).push(runId);
    });
    return m;
  }, [effectiveSubagentMetaByRunId]);

  const confirmationUserResponseByCallId = useMemo(() => {
    const m = new Map();
    for (const f of frames) {
      if ((f?.type !== "tool_confirmed" && f?.type !== "tool_denied") || !f?.payload?.call_id || f?.payload?.user_response === undefined) continue;
      m.set(f.payload.call_id, f.payload.user_response);
    }
    return m;
  }, [frames]);

  const interactTypeByCallId = useMemo(() => {
    const m = new Map();
    for (const f of frames) {
      if (f?.type !== "tool_call" || !f?.payload?.call_id) continue;
      const it = typeof f.payload?.interact_type === "string" ? f.payload.interact_type : "";
      if (it) m.set(f.payload.call_id, it);
    }
    return m;
  }, [frames]);

  const toolResultUserResponseByCallId = useMemo(() => {
    const m = new Map();
    for (const f of frames) {
      if (f?.type !== "tool_result" || !f?.payload?.call_id) continue;
      const it =
        typeof f?.payload?.interact_type === "string"
          ? f.payload.interact_type
          : interactTypeByCallId.get(f.payload.call_id) ||
            (f?.payload?.tool_name === "ask_user_question" ? "single" : "");
      const normalized = normalizePersistedInteractionResponse(it, f.payload?.result);
      if (normalized !== undefined) m.set(f.payload.call_id, normalized);
    }
    return m;
  }, [frames, interactTypeByCallId]);

  /* ═══════════════════════════════════════════════════════════════════════
     timelineItems — V3 core: unified StepNode model
     ═══════════════════════════════════════════════════════════════════════ */
  const timelineItems = useMemo(() => {
    const items = [];
    const renderedCallIds = new Set();
    const usedRunIds = new Set();
    let prevTs = startFrame?.ts ?? null;

    /* ── pre-pass: determine bubble-owned final_message ── */
    const allFinalMsgFrames = displayFrames
      .filter((f) => f.type === "final_message" && typeof f.payload?.content === "string" && f.payload.content.trim())
      .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

    const bubbleOwnedSeq =
      bubbleOwnsFinalMessage && !isStreaming && allFinalMsgFrames.length > 0
        ? Number(allFinalMsgFrames[allFinalMsgFrames.length - 1].seq)
        : null;

    const hasToolCall = displayFrames.some((f) => f.type === "tool_call");

    /* ── pre-pass: merge final_message into FOLLOWING tool_call ──
       Synthetic final_messages are injected BEFORE their tool_call in
       traceFrames (by use_chat_stream.js). So "text before write" appears
       in the array before tool_call(write). We scan forward: for each
       final_message, find the next tool_call and associate with it. */
    const responseForStep = new Map();
    const standaloneFinalSeqs = new Set();

    if (hasToolCall) {
      for (let fi = 0; fi < displayFrames.length; fi++) {
        const f = displayFrames[fi];
        if (f.type !== "final_message") continue;
        const seq = Number(f.seq);
        if (Number.isFinite(bubbleOwnedSeq) && seq === bubbleOwnedSeq) continue;
        const content = typeof f.payload?.content === "string" ? f.payload.content.trim() : "";
        if (!content) continue;

        /* look ahead for the next non-subagent, non-continuation tool_call */
        let nextToolSeq = null;
        for (let fj = fi + 1; fj < displayFrames.length; fj++) {
          if (displayFrames[fj].type === "tool_call") {
            const tn = displayFrames[fj].payload?.tool_name;
            if (!SUBAGENT_TOOLS.has(tn) && tn !== "__continuation__") {
              nextToolSeq = displayFrames[fj].seq;
            }
            break;  // stop at first tool_call regardless
          }
        }

        if (nextToolSeq != null) {
          const prev = responseForStep.get(nextToolSeq) || "";
          responseForStep.set(nextToolSeq, prev ? `${prev}\n\n${content}` : content);
        } else {
          standaloneFinalSeqs.add(seq);
        }
      }
    }

    /* ── main loop ── */
    for (const frame of displayFrames) {
      /* Compute delta from last RENDERED item, not last seen frame.
         prevTs is only updated when an item is actually pushed. */
      const delta = prevTs != null && frame.ts != null ? frame.ts - prevTs : null;
      const spanText = delta != null && delta > 0 ? `+${formatDelta(delta)}` : null;

      /* ── reasoning / observation ── */
      if (frame.type === "reasoning" || frame.type === "observation") {
        const text = extractText(frame.payload);
        const isObs = frame.type === "observation";
        if (frame.ts != null) prevTs = frame.ts;
        items.push({
          key: `${frame.seq}-${frame.type}`,
          title: isObs ? "Observation" : "Reasoning",
          span: spanText,
          status: "done",
          body: !isObs && text ? text : undefined,
          details: isObs && text ? (
            <SeamlessMarkdown content={text} status="done" fontSize={12} lineHeight={1.65}
              style={{ ...TRACE_DETAIL_MARKDOWN_STYLE, color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)" }} />
          ) : undefined,
        });
        continue;
      }

      /* ── tool_call ── */
      if (frame.type === "tool_call") {
        const callId = frame.payload?.call_id;
        if (callId && renderedCallIds.has(callId)) continue;
        if (callId) renderedCallIds.add(callId);

        const toolName = getToolDisplayName(frame.payload);
        const args = frame.payload?.arguments;
        const confirmationId = typeof frame.payload?.confirmation_id === "string" ? frame.payload.confirmation_id : "";
        const description = typeof frame.payload?.description === "string" ? frame.payload.description.trim() : "";
        const requiresConfirmation = frame.payload?.requires_confirmation === true || Boolean(confirmationId);
        const interactType = typeof frame.payload?.interact_type === "string" ? frame.payload.interact_type : "confirmation";
        const interactConfig = frame.payload?.interact_config || {};
        const resultFrame = callId ? toolResultByCallId.get(callId) : null;
        const result = resultFrame?.payload?.result;
        const internalDelta = resultFrame?.ts && frame.ts ? resultFrame.ts - frame.ts : null;
        const isContinuation = frame.payload?.tool_name === "__continuation__";
        const mergedResponse = responseForStep.get(frame.seq) || "";

        /* ── subagent tool calls → BranchNode ── */
        if (SUBAGENT_TOOLS.has(frame.payload?.tool_name)) {
          const isDelegate = frame.payload.tool_name === "delegate_to_subagent";
          const isBatch = frame.payload.tool_name === "spawn_worker_batch";
          const isHandoff = frame.payload.tool_name === "handoff_to_subagent";
          const target = args?.target || "worker";
          const task = args?.task || args?.reason || "";
          const batchTasks = isBatch && Array.isArray(args?.tasks) ? args.tasks : [];
          const batchCount = isBatch ? batchTasks.length : 0;
          const resultStatus = result?.status || (resultFrame ? "done" : "");
          const resultOutput =
            typeof result?.output === "string" ? result.output
              : typeof result?.summary === "string" ? result.summary : "";
          const batchResults = isBatch && Array.isArray(result?.results) ? result.results : [];
          const failed = resultStatus === "failed" || resultStatus === "timeout" || resultStatus === "partial_failure";

          /* build child timeline items for each subagent */
          const childTimelineItems =
            isDelegate || isHandoff
              ? (() => {
                  const agentName = typeof result?.agent_name === "string" ? result.agent_name : "";
                  const candidates = agentName ? childRunIdsBySubagentId.get(agentName) || [] : [];
                  const childRunId = candidates.find((id) => !usedRunIds.has(id)) || "";
                  if (childRunId) usedRunIds.add(childRunId);
                  const childMeta = childRunId ? effectiveSubagentMetaByRunId[childRunId] : null;
                  const childFrames = childRunId ? effectiveSubagentFrames[childRunId] : [];
                  if (!agentName && !resultFrame) return [];
                  return [{
                    key: `${frame.seq}-${childRunId || agentName || (isHandoff ? "handoff" : "delegate")}`,
                    meta: childMeta, frames: Array.isArray(childFrames) ? childFrames : [],
                    status: typeof result?.status === "string" && result.status.trim() ? result.status : childMeta?.status || "",
                    task, preview: resultOutput || result?.error || "", agentName,
                    template: typeof result?.template_name === "string" ? result.template_name : childMeta?.template || target,
                    orphaned: !childRunId,
                  }];
                })()
              : isBatch
                ? batchResults.map((cr, idx) => {
                    const agentName = typeof cr?.agent_name === "string" ? cr.agent_name : "";
                    const candidates = agentName ? childRunIdsBySubagentId.get(agentName) || [] : [];
                    const childRunId = candidates.find((id) => !usedRunIds.has(id)) || "";
                    if (childRunId) usedRunIds.add(childRunId);
                    const childMeta = childRunId ? effectiveSubagentMetaByRunId[childRunId] : null;
                    const childFrames = childRunId ? effectiveSubagentFrames[childRunId] : [];
                    const childTask = typeof batchTasks[idx]?.task === "string" ? batchTasks[idx].task : "";
                    const childPreview = cr?.summary?.trim() || cr?.output?.trim() || cr?.error || "";
                    return {
                      key: `${frame.seq}-${childRunId || agentName || "w"}-${idx}`,
                      meta: childMeta, frames: Array.isArray(childFrames) ? childFrames : [],
                      status: typeof cr?.status === "string" && cr.status.trim() ? cr.status : childMeta?.status || "",
                      task: childTask, preview: childPreview, agentName,
                      template: typeof cr?.template_name === "string" ? cr.template_name : childMeta?.template || target,
                      orphaned: !childRunId,
                    };
                  })
                : [];

          const modeLabel = isBatch ? "workers" : isDelegate ? "delegate" : "handoff";
          const bKey = callId || `seq-${frame.seq}`;
          const bState = branchState.get(bKey);
          const overallBranchStatus = resultFrame ? (failed ? "error" : "done") : "active";
          /* V3: default expanded while running */
          const isBranchExpanded = bState?.expanded ?? (overallBranchStatus !== "done");
          const bExpandedWorkers = bState?.expandedWorkers ?? new Set();

          const branches = childTimelineItems.map((worker, wi) => {
            const isWExpanded = bState ? bExpandedWorkers.has(wi) : true;
            const wLabel = getSubagentShortLabel({ meta: worker.meta, fallbackAgentName: worker.agentName, fallbackTemplate: worker.template });
            const wStatusColor = getSubagentStatusColor(worker.status, isDark);
            const hasWFrames = Array.isArray(worker.frames) && worker.frames.length > 0;
            const canExpand = hasWFrames && _depth < MAX_TRACE_DEPTH;

            return {
              key: worker.key,
              title: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "0.82em", color: isDark ? "rgba(196,170,255,0.82)" : "rgba(109,40,217,0.76)", userSelect: "none" }}>{wLabel}</span>
                  {worker.template && worker.template !== wLabel && (
                    <span style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "0.74em", color, opacity: 0.34, userSelect: "none" }}>{worker.template}</span>
                  )}
                  <span style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "0.74em", color: wStatusColor, userSelect: "none" }}>{worker.status || "pending"}</span>
                  {canExpand && <BranchExpandArrow open={isWExpanded} onClick={() => toggleBranchWorker(bKey, wi)} isDark={isDark} />}
                </span>
              ),
              span: worker.task ? truncateInlineText(worker.task, 120) : undefined,
              status: getSubagentTraceStatus(worker.status) === "done" ? "done" : getSubagentTraceStatus(worker.status) === "streaming" ? "active" : "pending",
              point: <SubagentPoint isDark={isDark} />,
              expandContent: canExpand ? (
                <TraceChainV3
                  frames={worker.frames}
                  status={getSubagentTraceStatus(worker.status)}
                  showContainerHeader={false}
                  bubbleOwnsFinalMessage={false}
                  compact hideTrack
                  subagentFrames={effectiveSubagentFrames}
                  subagentMetaByRunId={effectiveSubagentMetaByRunId}
                  onToolConfirmationDecision={onToolConfirmationDecision}
                  toolConfirmationUiStateById={toolConfirmationUiStateById}
                  _depth={_depth + 1}
                />
              ) : hasWFrames ? (
                <div style={{ fontSize: 11, fontFamily: "Menlo, Monaco, Consolas, monospace", color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)", padding: "4px 0", userSelect: "none" }}>
                  Trace depth limit reached
                </div>
              ) : undefined,
              isExpanded: canExpand ? isWExpanded : hasWFrames,
            };
          });

          const labelStyle = { fontSize: "0.82em", fontFamily: "Menlo, Monaco, Consolas, monospace", color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)", userSelect: "none" };
          const statusStyle = { fontSize: "0.82em", fontFamily: "Menlo, Monaco, Consolas, monospace", color: failed ? (isDark ? "rgba(252,165,165,0.9)" : "rgba(220,38,38,0.85)") : (isDark ? "rgba(110,231,183,0.8)" : "rgba(5,150,105,0.8)"), userSelect: "none" };

          if (frame.ts != null) prevTs = frame.ts;
          items.push({
            key: `${frame.seq}-subagent`,
            title: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={labelStyle}>{modeLabel}</span>
                <SubagentTag name={target} isDark={isDark} />
                {batchCount > 0 && <CountBadge count={batchCount} isDark={isDark} />}
                {resultStatus && failed && <span style={statusStyle}>{resultStatus}</span>}
                {branches.length > 0 && <BranchExpandArrow open={isBranchExpanded} onClick={() => toggleBranchSummary(bKey)} isDark={isDark} />}
              </span>
            ),
            span: spanText,
            status: resultFrame ? "done" : "active",
            point: <SubagentPoint isDark={isDark} />,
            body: branches.length > 0 ? (
              <BranchGraph
                branches={branches}
                expanded={isBranchExpanded}
                status={overallBranchStatus}
                showMerge={overallBranchStatus === "done" || overallBranchStatus === "error"}
                curveReach={hideTrack ? 0 : compact ? 22 : 26}
                inset={hideTrack ? 0 : 12}
                isDark={isDark}
                compact={compact}
              />
            ) : undefined,
          });
          continue;
        }

        /* ── confirmation / interaction state ── */
        const confirmationResult = callId ? confirmationStatusByCallId.get(callId) : "";
        const confirmationUiState = confirmationId && toolConfirmationUiStateById ? toolConfirmationUiStateById[confirmationId] || {} : {};
        const persistedUserResponse =
          (callId && confirmationUserResponseByCallId.has(callId)) ? confirmationUserResponseByCallId.get(callId)
            : (callId && toolResultUserResponseByCallId.has(callId)) ? toolResultUserResponseByCallId.get(callId)
              : undefined;
        const effectiveUiState =
          persistedUserResponse !== undefined && confirmationUiState?.userResponse === undefined
            ? { ...confirmationUiState, userResponse: persistedUserResponse }
            : confirmationUiState;
        const hasPersistedResult = persistedUserResponse !== undefined && resultFrame != null;
        const uiStatus = typeof effectiveUiState?.status === "string" ? effectiveUiState.status : "idle";
        const uiError = typeof effectiveUiState?.error === "string" ? effectiveUiState.error : "";
        const uiResolved = effectiveUiState?.resolved === true || hasPersistedResult;
        const uiDecision = effectiveUiState?.decision === "approved" || effectiveUiState?.decision === "denied" ? effectiveUiState.decision : "";
        const resolvedDecision = confirmationResult || uiDecision || (hasPersistedResult ? "approved" : "");
        const isResolved = resolvedDecision === "approved" || resolvedDecision === "denied";
        const isSubmitting = !uiResolved && (uiStatus === "submitting" || uiStatus === "submitted");
        const isInlineInteraction = requiresConfirmation && confirmationId;
        const isSelectionInteraction = interactType !== "confirmation" && isInlineInteraction;

        /* ── build detail sections ── */
        const sections = [];
        if (internalDelta != null) sections.push({ pairs: [{ key: "took", value: formatDelta(internalDelta) }] });
        if (!isSelectionInteraction) {
          if (description) sections.push({ heading: "description", pairs: [{ key: "text", value: description }] });
          const argPairs = toKVPairs(args);
          if (argPairs.length) sections.push({ heading: "args", pairs: argPairs });
        }
        const resPairs = toKVPairs(result);
        if (resPairs.length) sections.push({ heading: "result", pairs: resPairs });
        if (uiError) sections.push({ heading: "error", pairs: [{ key: "message", value: uiError }] });

        /* ── interaction body ── */
        let interactBody = undefined;
        /* V3: all tool items use static HammerPoint — the only spinner
           is the trailing "Thinking…" item at the timeline end. */
        let toolPointEl = <HammerPoint isDark={isDark} />;
        let toolStatus = "done";

        if (isInlineInteraction) {
          let statusLabel = "Pending";
          if (resolvedDecision === "approved") statusLabel = isSelectionInteraction ? "Selected" : "Approved";
          else if (resolvedDecision === "denied") statusLabel = "Denied";
          else if (uiResolved) statusLabel = isSelectionInteraction ? "Selected" : "Submitted";
          else if (isSubmitting) statusLabel = "Submitting\u2026";
          else if (uiError) statusLabel = "Failed to submit";

          const canTakeAction = !isResolved && !uiResolved && !isSubmitting && typeof onToolConfirmationDecision === "function";
          const statusColor = isResolved
            ? resolvedDecision === "approved"
              ? isDark ? "rgba(110,231,183,0.95)" : "rgba(5,150,105,0.95)"
              : isDark ? "rgba(252,165,165,0.95)" : "rgba(220,38,38,0.95)"
            : isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.52)";

          toolPointEl = <HammerPoint isDark={isDark} />;
          toolStatus = "done";

          const persistedValue = persistedUserResponse || effectiveUiState?.userResponse;

          interactBody = (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 11.5, color: statusColor, fontFamily: "Menlo, Monaco, Consolas, monospace" }}>{statusLabel}</span>
              {/* V3: persisted selection display after resolve */}
              {isResolved && persistedValue != null && (
                <div data-persisted-selection="true" style={{
                  fontSize: 11, fontFamily: "Menlo, Monaco, Consolas, monospace",
                  color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
                  padding: "4px 8px", borderRadius: 5,
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                }}>
                  {formatPersistedValue(persistedValue)}
                </div>
              )}
              {/* V3: hide interactive UI after resolve, show only when active */}
              {!isResolved && (
                <InteractWrapper
                  type={interactType}
                  config={interactConfig}
                  onSubmit={(data) => handleInteractSubmit(confirmationId, interactType, data)}
                  uiState={effectiveUiState}
                  isDark={isDark}
                  disabled={!canTakeAction}
                />
              )}
            </div>
          );
        }

        /* ── push item ── */
        if (frame.ts != null) prevTs = frame.ts;
        items.push({
          key: `${frame.seq}-tool`,
          title: isContinuation ? (
            <span data-continue-block="true" style={{
              fontSize: compact ? "12px" : "13px", fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)",
              letterSpacing: "0.01em", userSelect: "none",
            }}>Continue?</span>
          ) : (
            <ToolTag name={toolName} isDark={isDark} compact={compact} />
          ),
          span: spanText,
          status: toolStatus,
          point: isContinuation ? "loading" : toolPointEl,
          body: (
            <>
              {/* V3: merged response content from following final_message */}
              {!isContinuation && mergedResponse ? (
                <div data-step-response="true" style={{
                  marginTop: 4, fontSize: compact ? 11 : 12.5, lineHeight: compact ? 1.45 : 1.55,
                  color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
                  fontFamily: "inherit",
                }}>
                  <SeamlessMarkdown content={mergedResponse} status="done"
                    fontSize={compact ? 11 : 12.5} lineHeight={compact ? 1.45 : 1.55} />
                </div>
              ) : null}
              {interactBody}
            </>
          ),
          details: !isContinuation && sections.length > 0 ? (
            <KVPanel sections={sections} isDark={isDark} color={color} />
          ) : undefined,
          _toolName: isContinuation || isInlineInteraction ? undefined : toolName,
          _sections: isContinuation || isInlineInteraction ? undefined : sections,
        });
        continue;
      }

      /* ── final_message ── */
      if (frame.type === "final_message") {
        const seq = Number(frame.seq);
        /* V3: skip if bubble-owned, merged into step, or no tool calls */
        if (Number.isFinite(bubbleOwnedSeq) && seq === bubbleOwnedSeq) continue;
        if (!standaloneFinalSeqs.has(seq)) continue;
        const content = typeof frame.payload?.content === "string" ? frame.payload.content : "";
        if (!content.trim()) continue;
        if (frame.ts != null) prevTs = frame.ts;
        items.push({
          key: `${frame.seq}-final-message`,
          title: "Response",
          span: spanText,
          status: "done",
          body: (
            <div style={{ fontFamily: "inherit" }}>
              <SeamlessMarkdown content={content} status={isStreaming ? "streaming" : "done"}
                fontSize={compact ? 12 : ASSISTANT_MARKDOWN_FONT_SIZE}
                lineHeight={compact ? 1.5 : ASSISTANT_MARKDOWN_LINE_HEIGHT}
                style={compact ? COMPACT_RESPONSE_MARKDOWN_STYLE : undefined} />
            </div>
          ),
        });
        continue;
      }

      /* ── error — V3: always visible (body, not details) ── */
      if (frame.type === "error") {
        const msg = frame.payload?.message || "Unknown error";
        const code = frame.payload?.code;
        const pairs = [
          ...(code != null ? [{ key: "code", value: String(code) }] : []),
          { key: "message", value: msg },
        ];
        if (frame.ts != null) prevTs = frame.ts;
        items.push({
          key: `${frame.seq}-error`,
          title: "Error",
          span: spanText,
          status: "done",
          point: <ErrorPoint />,
          body: (
            <div data-error-node="true">
              <KVPanel sections={[{ pairs }]} isDark={isDark} color={isDark ? "#f87171" : "#dc2626"} />
            </div>
          ),
        });
      }
    }

    /* ── streaming indicator — V3: only when no active subagent ── */
    if (isStreaming) {
      const hasActiveSubagent = Object.values(effectiveSubagentMetaByRunId).some((meta) => {
        const s = typeof meta?.status === "string" ? meta.status.trim().toLowerCase() : "";
        return s === "running" || s === "spawned" || s === "needs_clarification";
      });
      if (!hasActiveSubagent) {
        const liveContent = typeof streamingContent === "string" ? streamingContent : "";
        if (liveContent.trim()) {
          items.push({
            key: "__streaming_content__",
            title: "Response",
            span: null,
            status: "active",
            point: "loading",
            body: (
              <div style={{ fontFamily: "inherit" }}>
                <SeamlessMarkdown content={liveContent} status="streaming"
                  fontSize={compact ? 12 : ASSISTANT_MARKDOWN_FONT_SIZE}
                  lineHeight={compact ? 1.5 : ASSISTANT_MARKDOWN_LINE_HEIGHT}
                  style={compact ? COMPACT_RESPONSE_MARKDOWN_STYLE : undefined}
                  priority="high" />
              </div>
            ),
          });
        } else {
          items.push({ key: "__streaming__", title: "Thinking\u2026", span: null, status: "active", point: "loading" });
        }
      }
    }

    /* ── group consecutive identical tool calls ── */
    const grouped = [];
    let gi = 0;
    while (gi < items.length) {
      const item = items[gi];
      if (!item._toolName) { grouped.push(item); gi++; continue; }
      const run = [item];
      while (gi + run.length < items.length && items[gi + run.length]._toolName === item._toolName) {
        run.push(items[gi + run.length]);
      }
      gi += run.length;
      if (run.length === 1) { grouped.push(item); continue; }
      const allSections = run.flatMap((r) => r._sections || []);
      grouped.push({
        key: run.map((r) => r.key).join("+"),
        title: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ToolTag name={item._toolName} isDark={isDark} compact={compact} />
            <CountBadge count={run.length} isDark={isDark} />
          </span>
        ),
        span: run[run.length - 1].span,
        status: "done",
        point: <HammerPoint isDark={isDark} />,
        details: allSections.length > 0 ? <KVPanel sections={allSections} isDark={isDark} color={color} /> : undefined,
      });
    }

    /* ── token summary ── */
    if (status === "done" && bundle && typeof bundle === "object" && typeof bundle.consumed_tokens === "number" && bundle.consumed_tokens > 0) {
      grouped.push({
        key: "__token_summary__",
        title: <TokenSummary input={bundle.input_tokens} output={bundle.output_tokens} total={bundle.consumed_tokens} isDark={isDark} />,
        status: "done",
        point: "end",
      });
    }

    return grouped;
  }, [
    displayFrames, isStreaming, streamingContent, startFrame,
    toolResultByCallId, confirmationStatusByCallId,
    confirmationUserResponseByCallId, toolResultUserResponseByCallId,
    handleInteractSubmit, onToolConfirmationDecision,
    toolConfirmationUiStateById, isDark, color, status, bundle,
    compact, hideTrack, _depth, childRunIdsBySubagentId,
    effectiveSubagentFrames, effectiveSubagentMetaByRunId,
    branchState, toggleBranchSummary, toggleBranchWorker,
    bubbleOwnsFinalMessage,
  ]);

  if (timelineItems.length === 0) return null;

  const isBodyVisible = showContainerHeader ? bodyOpen : true;
  const timelineBody = (
    <AnimatedChildren open={isBodyVisible}>
      <div style={{ paddingLeft: 2, paddingBottom: 2 }}>
        <Timeline items={timelineItems} compact={compact} hideTrack={hideTrack} style={{ fontSize: compact ? 12 : 13 }} />
      </div>
    </AnimatedChildren>
  );

  return (
    <div style={{ marginBottom: showContainerHeader ? 10 : 0 }}>
      {showContainerHeader ? (
        <div
          onClick={() => setBodyOpen((o) => !o)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            cursor: "pointer", userSelect: "none",
            marginBottom: bodyOpen ? 6 : 0,
          }}
        >
          <Icon src="arrow_right" color={color} style={{
            width: 16, height: 16, opacity: 0.25,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "transform 0.2s cubic-bezier(0.32,1,0.32,1)",
            transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
          }} />
          <span style={{
            fontSize: 11.5, color, opacity: 0.38,
            fontFamily: theme?.font?.fontFamily || "inherit", letterSpacing: 0.1,
          }}>
            {isStreaming && !doneFrame
              ? "Thinking\u2026"
              : hasError
                ? (stepCount > 0
                    ? `Failed after ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                    : "Failed") + (duration ? ` \u00B7 ${formatDelta(duration)}` : "")
                : (stepCount > 0
                    ? `${stepCount} step${stepCount !== 1 ? "s" : ""}`
                    : "Done") +
                  (duration ? ` \u00B7 ${formatDelta(duration)}` : "")}
          </span>
          {!bodyOpen && status === "done" && bundle?.consumed_tokens > 0 && (
            <span style={{ marginLeft: 4 }}>
              <TokenSummary input={bundle.input_tokens} output={bundle.output_tokens} total={bundle.consumed_tokens} isDark={isDark} />
            </span>
          )}
        </div>
      ) : null}
      {timelineBody}
    </div>
  );
};

export default memo(TraceChainV3);
