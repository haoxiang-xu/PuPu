import {
  memo,
  useState,
  useContext,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  conversationActivity,
  mergeMemoryJobProjection,
  mergeMemoryJobRuns,
  organizationActivity,
} from "../../SERVICEs/runtime_events/memory_activity_labels";
import MemoryAgentLiveDetails from "./memory_agent_live_details";
import {
  colorWithAlpha,
  themeHighlightColor,
} from "../../CONTAINERs/config/theme_highlight";
import AnimatedChildren from "../../BUILTIN_COMPONENTs/class/animated_children";
import Timeline from "../../BUILTIN_COMPONENTs/timeline/timeline";
import BranchGraph from "../../BUILTIN_COMPONENTs/branch_graph/branch_graph";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SeamlessMarkdown from "./components/seamless_markdown";
import {
  ASSISTANT_MARKDOWN_FONT_SIZE,
  ASSISTANT_MARKDOWN_LINE_HEIGHT,
} from "./components/assistant_markdown_metrics";
import {
  StreamingMarkdownView,
  useStreamingHasLiveText,
  useStreamingMessageStoreContext,
} from "./components/streaming_message_store_context";
import InteractWrapper from "./interact/interact_wrapper";
import { normalizeStreamingChunks } from "../../SERVICEs/streaming_message_chunks";
import { isToolConfirmationCacheable } from "../../SERVICEs/tool_confirmation_cache_policy";
import {
  FINALITY,
  getFrameFinality,
} from "../../PAGEs/chat/utils/message_finality";
import { presentMemoryV2Audit } from "../../SERVICEs/runtime_events/memory_v2_trace_presenter";
import {
  MemoryV2ContextAudit,
} from "./memory_v2_trace_audit";
import { mergeMemoryV2AuditWithJournal } from "./memory_v2_journal_reload";
import { selectRunBundleUsage } from "../../SERVICEs/run_bundle_v1";
import { hasContextCompositionEvidence } from "../../SERVICEs/context_composition_v1";
import ContextCompositionModal from "./context-composition/context_composition_modal";
import {
  groupProviderRetryFrames,
  providerDisplayName,
  providerRetryReason,
  ProviderRetryRecordDetails,
  ProviderRetryWaitBody,
  RetryStoppedPoint,
  RetryWaitPoint,
} from "./provider_retry_step";
import {
  getToolGroupingIdentity,
  groupToolTimelineItems,
} from "./trace_tool_grouping";

const traceScopePart = (value) =>
  typeof value === "string" && value.trim().length > 0
    ? [true, value.trim()]
    : [false, ""];
const hasTraceText = (value) =>
  typeof value === "string" && value.trim().length > 0;
const traceToolkitPart = (payload) => {
  const toolkitId = traceScopePart(payload?.toolkit_id);
  return toolkitId[0] ? toolkitId : traceScopePart(payload?.toolkit_name);
};

const traceIterationPart = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? [true, value]
    : [false, ""];

const traceCallBaseKey = (frame) => {
  const payload = frame?.payload || {};
  if (typeof payload.call_id !== "string" || !payload.call_id.trim()) return "";
  return JSON.stringify([
    payload.call_id.trim(),
    traceScopePart(frame?.run_id),
    traceIterationPart(frame?.iteration),
    traceToolkitPart(payload),
    traceScopePart(payload.tool_name),
  ]);
};

const traceCallScopeKey = (frame) => {
  const baseKey = traceCallBaseKey(frame);
  if (!baseKey) return "";
  return JSON.stringify([
    baseKey,
    traceScopePart(frame?.payload?.confirmation_id),
  ]);
};

const resolveTraceCallScopeKey = (linkedFrame, toolCallFrames, requireConfirmation = false) => {
  const payload = linkedFrame?.payload || {};
  if (typeof payload.call_id !== "string" || !payload.call_id.trim()) return "";
  const linkedConfirmation = traceScopePart(payload.confirmation_id);
  const matches = toolCallFrames.filter((callFrame) => {
    const callPayload = callFrame?.payload || {};
    if (callPayload.call_id !== payload.call_id) return false;
    if (JSON.stringify(traceScopePart(callFrame?.run_id)) !== JSON.stringify(traceScopePart(linkedFrame?.run_id))) return false;
    if (
      typeof linkedFrame?.iteration === "number" &&
      Number.isFinite(linkedFrame.iteration) &&
      callFrame?.iteration !== linkedFrame.iteration
    ) return false;
    if (
      typeof payload.tool_name === "string" &&
      payload.tool_name.trim() &&
      callPayload.tool_name !== payload.tool_name
    ) return false;
    const linkedToolkit = traceToolkitPart(payload);
    const callToolkit = traceToolkitPart(callPayload);
    if (
      linkedToolkit[0] &&
      JSON.stringify(callToolkit) !== JSON.stringify(linkedToolkit)
    ) return false;
    if (
      linkedConfirmation[0] &&
      JSON.stringify(traceScopePart(callPayload.confirmation_id)) !== JSON.stringify(linkedConfirmation)
    ) return false;
    if (
      requireConfirmation &&
      linkedConfirmation[0] &&
      callPayload.confirmation_id !== payload.confirmation_id
    ) return false;
    return true;
  });
  const keys = [...new Set(matches.map(traceCallScopeKey).filter(Boolean))];
  return keys.length === 1 ? keys[0] : "";
};


const hasToolArguments = (value) =>
  Boolean(value && typeof value === "object" && Object.keys(value).length > 0);

const areInteractionPseudoArguments = (value) => {
  if (!hasToolArguments(value)) return false;
  const pseudoArgumentKeys = new Set([
    "request_id",
    "kind",
    "question",
    "options",
    "allow_other",
    "selection_mode",
    "title",
    "min_selected",
    "max_selected",
  ]);
  return Object.keys(value).every((key) => pseudoArgumentKeys.has(key));
};

const canCoalesceProjectionGap = (frame, referenceFrame, confirmationId) => {
  const payload = frame?.payload || {};
  const referencePayload = referenceFrame?.payload || {};
  const callId = referencePayload.call_id;
  const sameCallScope = () => {
    if (frame?.run_id !== referenceFrame?.run_id) return false;
    if (frame?.iteration !== referenceFrame?.iteration) return false;
    if (
      hasTraceText(payload.tool_name) &&
      payload.tool_name.trim() !== referencePayload.tool_name
    ) return false;
    const gapToolkit = traceToolkitPart(payload);
    const referenceToolkit = traceToolkitPart(referencePayload);
    if (
      gapToolkit[0] &&
      referenceToolkit[0] &&
      JSON.stringify(gapToolkit) !== JSON.stringify(referenceToolkit)
    ) return false;
    if (
      hasTraceText(payload.timeline_merge_policy) &&
      payload.timeline_merge_policy !== referencePayload.timeline_merge_policy
    ) return false;
    if (
      hasTraceText(payload.interact_type) &&
      hasTraceText(referencePayload.interact_type) &&
      payload.interact_type.trim() !== referencePayload.interact_type.trim()
    ) return false;
    return true;
  };
  if (
    frame?.type === "response_received" &&
    payload.status === "awaiting_interaction" &&
    payload.has_tool_calls === true
  ) return true;
  if (frame?.type === "interaction.requested") {
    const linkedCallId = payload.call_id || payload.target?.tool_call_id;
    return (
      linkedCallId === callId &&
      (!payload.interaction_id || payload.interaction_id === confirmationId) &&
      sameCallScope()
    );
  }
  if (frame?.type === "interaction.resolved") {
    const linkedCallId = payload.call_id || frame?.links?.tool_call_id;
    return (
      (linkedCallId === callId || payload.interaction_id === confirmationId) &&
      (!payload.interaction_id || payload.interaction_id === confirmationId) &&
      sameCallScope()
    );
  }
  if (frame?.type === "tool_confirmed" || frame?.type === "tool_denied") {
    return (
      payload.call_id === callId &&
      payload.confirmation_id === confirmationId &&
      sameCallScope()
    );
  }
  return false;
};

const coalesceToolCallProjectionFrames = (frames) => {
  const byInvocation = new Map();
  frames.forEach((frame, index) => {
    if (frame?.type !== "tool_call") return;
    const payload = frame.payload || {};
    if (typeof payload.call_id !== "string" || !payload.call_id.trim()) return;
    const key = JSON.stringify([
      traceScopePart(frame.run_id),
      typeof frame.iteration === "number" ? [true, frame.iteration] : [false, ""],
      payload.call_id.trim(),
    ]);
    if (!byInvocation.has(key)) byInvocation.set(key, []);
    byInvocation.get(key).push({ frame, index });
  });

  const replacements = new Map();
  const skipped = new Set();
  byInvocation.forEach((members) => {
    if (members.length < 2) return;
    const confirmations = new Set(
      members
        .map(({ frame }) => traceScopePart(frame.payload?.confirmation_id))
        .filter(([present]) => present)
        .map(([, value]) => value),
    );
    if (confirmations.size !== 1) return;
    const unconfirmedMembers = members.filter(
      ({ frame }) => !traceScopePart(frame.payload?.confirmation_id)[0],
    );
    if (unconfirmedMembers.length > 1 && unconfirmedMembers.length < members.length) return;
    const confirmationId = [...confirmations][0];
    const ordered = [...members].sort((left, right) => left.index - right.index);
    for (let memberIndex = 1; memberIndex < ordered.length; memberIndex += 1) {
      const previous = ordered[memberIndex - 1].index;
      const current = ordered[memberIndex].index;
      if (
        frames
          .slice(previous + 1, current)
          .some((frame) =>
            !canCoalesceProjectionGap(frame, ordered[memberIndex - 1].frame, confirmationId),
          )
      ) return;
    }

    const hasConflictingIdentityValue = (field, normalize = traceScopePart) => {
      const values = new Set(
        members
          .map(({ frame }) => normalize(frame.payload?.[field]))
          .filter(([present]) => present)
          .map(([, value]) => value),
      );
      return values.size > 1;
    };
    if (
      hasConflictingIdentityValue("tool_name") ||
      new Set(
        members
          .map(({ frame }) => JSON.stringify(traceToolkitPart(frame.payload)))
          .filter((value) => value !== JSON.stringify([false, ""])),
      ).size > 1 ||
      hasConflictingIdentityValue("timeline_merge_policy") ||
      hasConflictingIdentityValue("interact_type")
    ) return;

    const canonical = ordered[0].frame;
    const mergedPayload = { ...canonical.payload };
    const fillIfMissing = [
      "confirmation_id",
      "description",
      "interact_type",
      "interact_config",
      "tool_name",
      "toolkit_id",
      "toolkit_name",
    ];
    ordered.slice(1).forEach(({ frame }) => {
      const payload = frame.payload || {};
      fillIfMissing.forEach((field) => {
        const current = mergedPayload[field];
        const missing =
          current === undefined ||
          current === null ||
          current === "" ||
          (field === "interact_config" &&
            current &&
            typeof current === "object" &&
            Object.keys(current).length === 0);
        if (missing && payload[field] !== undefined) mergedPayload[field] = payload[field];
      });
      if (payload.requires_confirmation === true) {
        mergedPayload.requires_confirmation = true;
      }
    });
    const argumentCandidates = ordered
      .filter(({ frame }) => hasToolArguments(frame.payload?.arguments))
      .sort((left, right) => {
        const score = ({ frame }) => {
          const payload = frame.payload || {};
          const inlineProjection =
            traceScopePart(payload.confirmation_id)[0] ||
            payload.requires_confirmation === true ||
            traceScopePart(payload.interact_type)[0];
          return (
            (areInteractionPseudoArguments(payload.arguments) ? 2 : 0) +
            (inlineProjection ? 1 : 0)
          );
        };
        return score(left) - score(right) || left.index - right.index;
      });
    if (argumentCandidates.length > 0) {
      mergedPayload.arguments = argumentCandidates[0].frame.payload.arguments;
    }

    const originalPolicySource =
      unconfirmedMembers.length === 1
        ? unconfirmedMembers[0].frame
        : ordered.find(({ frame }) =>
            !frame.payload?.requires_confirmation &&
            !traceScopePart(frame.payload?.interact_type)[0],
          )?.frame;
    if (originalPolicySource && originalPolicySource !== canonical) {
      if (Object.prototype.hasOwnProperty.call(originalPolicySource.payload || {}, "timeline_merge_policy")) {
        mergedPayload.timeline_merge_policy =
          originalPolicySource.payload.timeline_merge_policy;
      } else {
        delete mergedPayload.timeline_merge_policy;
      }
    }

    replacements.set(ordered[0].index, {
      ...canonical,
      payload: mergedPayload,
    });
    ordered.slice(1).forEach(({ index }) => skipped.add(index));
  });

  return frames.flatMap((frame, index) => {
    if (skipped.has(index)) return [];
    return [replacements.get(index) || frame];
  });
};

/* ─── constants & helpers ────────────────────────────────────────────────── */

export const DISPLAY_FRAME_TYPES = new Set([
  "reasoning",
  "observation",
  "tool_call",
  "tool_result",
  "final_message",
  "error",
  "fyi_injected",
  "side_answer",
  "clarify_request",
  "provider_retry",
]);

/* Anthropic-protocol providers stream thinking as one runtime event per
   thinking_delta (a single token on DeepSeek), and each becomes its own
   reasoning frame. Adjacent deltas from the same model turn are one block.
   Whole reasoning items (Responses API `reasoning_items`) are left as-is. */
const isReasoningDeltaFrame = (frame) =>
  frame?.type === "reasoning" &&
  typeof frame.payload?.reasoning === "string" &&
  frame.payload?.reasoning_items === undefined;

const sameReasoningTurn = (a, b) =>
  (a.run_id || "") === (b.run_id || "") &&
  a.iteration === b.iteration &&
  (a.payload?.provisional_reasoning_id || "") ===
    (b.payload?.provisional_reasoning_id || "");

export const coalesceReasoningDeltaFrames = (frames) => {
  const out = [];
  for (const frame of frames) {
    const prev = out[out.length - 1];
    if (
      isReasoningDeltaFrame(frame) &&
      isReasoningDeltaFrame(prev) &&
      sameReasoningTurn(prev, frame)
    ) {
      out[out.length - 1] = {
        ...prev,
        payload: {
          ...prev.payload,
          reasoning: prev.payload.reasoning + frame.payload.reasoning,
        },
      };
      continue;
    }
    out.push(frame);
  }
  return out;
};

const CONFIRMATION_DECISION_INTERACT_TYPES = new Set([
  "confirmation",
  "code_diff",
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

const truncateInlineText = (value, max = 120) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
};

const getSubagentShortLabel = ({
  meta,
  fallbackAgentName = "",
  fallbackTemplate = "",
}) => {
  const subagentId =
    typeof meta?.subagentId === "string" ? meta.subagentId.trim() : "";
  if (subagentId) {
    const parts = subagentId.split(".").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return subagentId;
  }

  const agentName =
    typeof fallbackAgentName === "string" ? fallbackAgentName.trim() : "";
  if (agentName) {
    const parts = agentName.split(".").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return agentName;
  }

  const template =
    typeof fallbackTemplate === "string" ? fallbackTemplate.trim() : "";
  return template || "subagent";
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

const COMPACT_RESPONSE_MARKDOWN_STYLE = Object.freeze({
  blockGap: 4,
  paragraphMargin: "0",
  list: {
    paddingLeft: 16,
    margin: "0",
    itemMargin: "0.05em 0",
  },
  blockquote: {
    margin: "0",
    paddingLeft: 8,
  },
  table: {
    margin: "0",
  },
});

const KVPanel = ({ sections, isDark, color }) => {
  const [expanded, setExpanded] = useState({});
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
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
                  minWidth: 0,
                  maxWidth: "100%",
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
                    overflowWrap: "anywhere",
                    wordBreak: "break-all",
                    lineHeight: 1.58,
                    flex: "1 1 auto",
                    minWidth: 0,
                    maxWidth: "100%",
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
const ToolTag = ({ name, isDark, compact = false }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: compact ? "1px 6px" : "1px 7px",
      borderRadius: compact ? 4 : 5,
      background: "var(--pupu-overlay-selected)",
      /* off by default; themes opt in via the JSON details channel */
      border: "1px solid var(--pupu-chip-border, transparent)",
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: compact ? "0.74em" : "0.82em",
      letterSpacing: 0.1,
      color: "var(--pupu-text-secondary)",
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
      background: "var(--pupu-overlay-hover)",
      border: "1px solid var(--pupu-chip-border, transparent)",
      fontFamily: "Menlo, Monaco, Consolas, monospace",
      fontSize: "0.72em",
      color: "var(--pupu-text-faint)",
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
const SUBAGENT_LAZY_FRAME_THRESHOLD = 25;

const MAX_TRACE_DEPTH = 8;

/* tag pill for subagent — purple-tinted to distinguish from regular tools */
const SubagentTag = ({ name, isDark }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 7px",
      borderRadius: 5,
      background: isDark ? "rgba(168,130,255,0.10)" : "rgba(124,58,237,0.07)",
      border: "1px solid var(--pupu-chip-border, transparent)",
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

const getSubagentStatusColor = (status, isDark) => {
  const normalized =
    typeof status === "string" ? status.trim().toLowerCase() : "";
  if (
    normalized === "failed" ||
    normalized === "timeout" ||
    normalized === "partial_failure"
  ) {
    return "var(--pupu-danger)";
  }
  if (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "running" ||
    normalized === "spawned"
  ) {
    return "var(--pupu-success)";
  }
  return "var(--pupu-text-secondary)";
};

const getSubagentTraceStatus = (status) => {
  const normalized =
    typeof status === "string" ? status.trim().toLowerCase() : "";
  if (normalized === "failed" || normalized === "timeout") {
    return "error";
  }
  if (
    normalized === "running" ||
    normalized === "spawned" ||
    normalized === "needs_clarification"
  ) {
    return "streaming";
  }
  return "done";
};

/* ─── BranchExpandArrow ─────────────────────────────────────────────────────── */
const BranchExpandArrow = ({ open, onClick, isDark }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    aria-label={open ? "Collapse" : "Expand"}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      padding: 0,
      background: "transparent",
      border: "none",
      cursor: "pointer",
      fontSize: "10px",
      color: "var(--pupu-text-faint)",
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
    {open ? "hide" : "detail"}
    <Icon
      src="arrow_down"
      color="currentColor"
      style={{
        width: 14,
        height: 14,
        transition: "transform 0.22s cubic-bezier(0.32,1,0.32,1)",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    />
  </button>
);

/* hollow circle point marker for tool_call */
const HammerPoint = ({ isDark }) => (
  <div
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: "transparent",
      border: `1px solid ${"var(--pupu-border)"}`,
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
      color: "var(--pupu-danger)",
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

/* ─── AccentPoint ────────────────────────────────────────────────────────── */

/* filled dot in the theme highlight color — marks side_answer (btw) rows so
   they read as visually distinct from tool rows (hollow HammerPoint). */
const AccentPoint = ({ color }) => (
  <div
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: color,
      flexShrink: 0,
      boxSizing: "border-box",
    }}
  />
);

/* ─── TokenSummary ───────────────────────────────────────────────────────── */

const TokenSummary = ({ usage, isDark, bundle, partialNote = null }) => {
  const [compositionOpen, setCompositionOpen] = useState(false);
  const triggerRef = useRef(null);
  const fmt = (n) =>
    typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "\u2013";
  const color = "var(--pupu-text-faint)";
  const cacheColor = "var(--pupu-text-disabled)";
  const hasCacheRead = typeof usage.cacheRead === "number" && usage.cacheRead > 0;
  const hasCacheCreation =
    typeof usage.cacheWrite === "number" && usage.cacheWrite > 0;
  const hasReasoning =
    typeof usage.reasoning === "number" && usage.reasoning > 0;
  const hasCache = hasCacheRead || hasCacheCreation;
  const hasComposition = hasContextCompositionEvidence(bundle);
  const content = (
    <>
      {fmt(usage.input)} in
      {hasCache && (
        <span style={{ color: cacheColor }}>
          {" ("}
          {hasCacheRead && <>{fmt(usage.cacheRead)} cached</>}
          {hasCacheRead && hasCacheCreation && " + "}
          {hasCacheCreation && <>{fmt(usage.cacheWrite)} cache write</>}
          {")"}
        </span>
      )}
      {" "}&middot; {fmt(usage.output)} out
      {hasReasoning && (
        <span style={{ color: cacheColor }}>
          {" ("}{fmt(usage.reasoning)} reasoning{")"}
        </span>
      )}
      {" "}&middot; {fmt(usage.total)} total
      {partialNote ? (
        <span style={{ color: cacheColor }}>
          {" "}&middot; {partialNote}
        </span>
      ) : null}
    </>
  );
  const textStyle = {
    fontSize: 10,
    fontFamily: "Menlo, Monaco, Consolas, monospace",
    color,
    userSelect: "none",
    letterSpacing: "0.01em",
  };

  if (!hasComposition) {
    return (
      <span data-testid="token-summary" style={textStyle}>
        {content}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="token-summary"
        aria-label="Open context composition"
        aria-haspopup="dialog"
        aria-expanded={compositionOpen}
        title="View context composition"
        onClick={() => setCompositionOpen(true)}
        style={{
          ...textStyle,
          display: "inline",
          border: 0,
          background: "transparent",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {content}
      </button>
      <ContextCompositionModal
        open={compositionOpen}
        onClose={() => setCompositionOpen(false)}
        bundle={bundle}
        returnFocusRef={triggerRef}
      />
    </>
  );
};


/* ─── TraceChain ─────────────────────────────────────────────────────────── */

// Group detail rows can be inserted when a late tool_result adds a truncation
// summary. Timeline's uncontrolled indices would then follow the old position
// instead of the observation row the user expanded. Keep that nested state by
// the existing stable member key while leaving the shared Timeline unchanged.
const ToolGroupTimeline = ({
  items = [],
  compact,
  hideTrack,
  style,
}) => {
  const [expandedItemKeys, setExpandedItemKeys] = useState(() => new Set());
  const expandedIndices = useMemo(() => {
    const indices = [];
    items.forEach((item, index) => {
      if (typeof item?.key === "string" && expandedItemKeys.has(item.key)) {
        indices.push(index);
      }
    });
    return indices;
  }, [expandedItemKeys, items]);
  const handleExpandChange = useCallback(
    (indices) => {
      setExpandedItemKeys(
        new Set(
          indices
            .map((index) => items[index]?.key)
            .filter((key) => typeof key === "string" && key.length > 0),
        ),
      );
    },
    [items],
  );

  return (
    <Timeline
      items={items}
      expanded_indices={expandedIndices}
      on_expand_change={handleExpandChange}
      compact={compact}
      hideTrack={hideTrack}
      style={style}
    />
  );
};

const TraceChain = ({
  frames = [],
  status,
  messageId = "",
  streamingContent = "",
  streamingChunks,
  onToolConfirmationDecision,
  toolConfirmationUiStateById = {},
  onClarifyResolve,
  onStopStream,
  bundle,
  completionDiagnostics,
  subagentFrames,
  subagentMetaByRunId,
  showContainerHeader = true,
  bubbleOwnsFinalMessage = true,
  bubbleOwnsLiveText = false,
  compact = false,
  hideTrack = false,
  _depth = 0,
}) => {
  const { chatId, store } = useStreamingMessageStoreContext();
  const { t } = useTranslation();
  const [memoryJobProjection, setMemoryJobProjection] = useState(null);
  const handleMemoryJobProjection = useCallback(
    (projection) => {
      if (
        projection?.ownerChatId !== chatId ||
        projection?.messageId !== messageId
      ) {
        return;
      }
      setMemoryJobProjection((current) =>
        mergeMemoryJobProjection(current, projection),
      );
    },
    [chatId, messageId],
  );
  // Subscribe only to the boolean "has (non-whitespace) live text" — this flips
  // ~once per tool turn, so per-chunk commits no longer re-render TraceChain or
  // rebuild timelineItems. The per-chunk text upload is consumed inside the
  // self-subscribed StreamingMarkdownView. Dedup text is read imperatively via
  // store.getText() inside the memo (see below).
  const storeHasLiveText = useStreamingHasLiveText(store, chatId, messageId);
  const handleInteractSubmit = useCallback(
    (confirmationId, interactType, responseData) => {
      if (typeof onToolConfirmationDecision !== "function") return;
      if (CONFIRMATION_DECISION_INTERACT_TYPES.has(interactType)) {
        onToolConfirmationDecision({
          confirmationId,
          approved: responseData?.approved ?? false,
          scope: responseData?.scope === "session" ? "session" : "once",
        });
      } else {
        onToolConfirmationDecision({
          confirmationId,
          approved: true,
          userResponse: responseData,
          scope: "once",
        });
      }
    },
    [onToolConfirmationDecision],
  );
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const timelineExpansionScope = JSON.stringify([chatId || "", messageId || ""]);
  const [bodyOpen, setBodyOpen] = useState(true);
  const [expandedTimelineState, setExpandedTimelineState] = useState(
    () => ({ scope: timelineExpansionScope, keys: new Set() }),
  );
  const [memoryV2JournalProjection, setMemoryV2JournalProjection] =
    useState(null);
  const handleMemoryV2JournalProjection = useCallback((projection) => {
    setMemoryV2JournalProjection(projection);
  }, []);

  /* ── branch expand state for subagent fork/merge ── */
  const [branchState, setBranchState] = useState(() => new Map());
  const toggleBranchSummary = useCallback((callId) => {
    setBranchState((prev) => {
      const next = new Map(prev);
      const cur = next.get(callId) || {
        expanded: false,
        expandedWorkers: new Set(),
      };
      next.set(callId, { ...cur, expanded: !cur.expanded });
      return next;
    });
  }, []);
  const toggleBranchWorker = useCallback((callId, wi, currentlyOpen) => {
    setBranchState((prev) => {
      const next = new Map(prev);
      const cur = next.get(callId) || {
        expanded: true,
        expandedWorkers: new Set(),
      };
      const nw = new Set(cur.expandedWorkers);
      if (currentlyOpen) {
        nw.delete(wi);
      } else {
        nw.add(wi);
      }
      next.set(callId, { ...cur, expandedWorkers: nw });
      return next;
    });
  }, []);

  const isStreaming = status === "streaming";
  const effectiveSubagentFrames = useMemo(
    () =>
      subagentFrames && typeof subagentFrames === "object" ? subagentFrames : {},
    [subagentFrames],
  );
  const effectiveSubagentMetaByRunId = useMemo(
    () =>
      subagentMetaByRunId && typeof subagentMetaByRunId === "object"
        ? subagentMetaByRunId
        : {},
    [subagentMetaByRunId],
  );

  // Identify which final_message frames are "intermediate" (not the very last
  // one when the stream is finished). During streaming every final_message is
  // considered intermediate because more content may follow. Once done, all
  // but the last final_message are intermediate — the last one is rendered by
  // the normal AssistantMessageBody bubble instead.
  const intermediateFinalMessageSeqs = useMemo(() => {
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

    if (!bubbleOwnsFinalMessage) {
      return new Set(
        finalMessageFrames
          .map((frame) => Number(frame.seq))
          .filter((seq) => Number.isFinite(seq)),
      );
    }

    // bubbleOwnsFinalMessage === true: decide which final_message frames go to the
    // timeline as drafts vs. which one the bubble renders as its body. Ownership is
    // read from the explicit segment-level `finality` flag (#155-B) — NOT inferred
    // from the presence of a tool_call anywhere in the turn, which was the #155 bug.
    //
    //   - The latest non-empty `terminal` final_message = bubble body → NOT in timeline.
    //   - Every other final_message (drafts, and any earlier terminals) = timeline draft.
    //   - Legacy frames (missing finality) fall back to the old "last non-empty wins"
    //     behavior so historical conversations render unchanged.
    const finalities = finalMessageFrames.map((f) => getFrameFinality(f));
    const allLegacy = finalities.every((fin) => fin === FINALITY.LEGACY);

    if (allLegacy) {
      // Legacy history: bubble owns the last non-empty final_message; rest are drafts.
      // While streaming we have no committed body yet, so every frame is a draft.
      const legacyIncluded = isStreaming
        ? finalMessageFrames
        : finalMessageFrames.slice(0, -1);
      return new Set(
        legacyIncluded.map((f) => Number(f.seq)).filter(Number.isFinite),
      );
    }

    // Finality-aware path. The bubble body = the LAST non-empty terminal frame
    // (finalMessageFrames is already sorted seq-then-ts, empties already filtered).
    // While streaming, bubbleBodyIndex stays -1: nothing is committed to the bubble
    // yet, so every final_message (drafts + any premature terminal) is a timeline draft.
    let bubbleBodyIndex = -1;
    if (!isStreaming) {
      for (let i = finalMessageFrames.length - 1; i >= 0; i -= 1) {
        if (finalities[i] === FINALITY.TERMINAL) {
          bubbleBodyIndex = i;
          break;
        }
      }
    }

    const included = finalMessageFrames.filter((_, i) => i !== bubbleBodyIndex);
    return new Set(included.map((f) => Number(f.seq)).filter(Number.isFinite));
  }, [bubbleOwnsFinalMessage, frames, isStreaming]);

  const logicalFrames = useMemo(
    () => coalesceToolCallProjectionFrames(frames),
    [frames],
  );
  const displayFrames = useMemo(
    () =>
      coalesceReasoningDeltaFrames(
        logicalFrames.filter((frame) => {
          if (!DISPLAY_FRAME_TYPES.has(frame.type)) {
            return false;
          }

          if (frame.type !== "final_message") {
            return true;
          }

          const seq = Number(frame.seq);
          return Number.isFinite(seq) && intermediateFinalMessageSeqs.has(seq);
        }),
      ),
    [logicalFrames, intermediateFinalMessageSeqs],
  );
  const startFrame = frames.find((f) => f.type === "stream_started");
  const doneFrame = frames.find((f) => f.type === "done");
  const duration =
    startFrame && doneFrame ? doneFrame.ts - startFrame.ts : null;

  const stepCount = displayFrames.filter(
    (f) => f.type === "tool_call" || f.type === "reasoning",
  ).length;
  const hasError = displayFrames.some((f) => f.type === "error");
  const providerRetryGroups = useMemo(
    () => groupProviderRetryFrames(displayFrames, frames, status),
    [displayFrames, frames, status],
  );
  const isRetryWaiting = Array.from(providerRetryGroups.values()).some(
    (group) => group.outcome === "waiting",
  );

  const toolCallFrames = useMemo(
    () => logicalFrames.filter((frame) => frame?.type === "tool_call"),
    [logicalFrames],
  );

  const toolResultFramesByCallScope = useMemo(() => {
    const map = new Map();
    for (const frame of logicalFrames) {
      if (frame?.type !== "tool_result") continue;
      const key = resolveTraceCallScopeKey(frame, toolCallFrames);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(frame);
    }
    return map;
  }, [logicalFrames, toolCallFrames]);

  const toolResultByCallScope = useMemo(() => {
    const map = new Map();
    toolResultFramesByCallScope.forEach((candidates, key) => {
      if (candidates.length === 1) map.set(key, candidates[0]);
    });
    return map;
  }, [toolResultFramesByCallScope]);

  const confirmationFramesByCallScope = useMemo(() => {
    const map = new Map();
    for (const frame of logicalFrames) {
      if (frame?.type !== "tool_confirmed" && frame?.type !== "tool_denied") continue;
      const key = resolveTraceCallScopeKey(frame, toolCallFrames, true);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(frame);
    }
    return map;
  }, [logicalFrames, toolCallFrames]);

  const confirmationStatusByCallScope = useMemo(() => {
    const map = new Map();
    confirmationFramesByCallScope.forEach((candidates, key) => {
      if (candidates.length !== 1) return;
      map.set(key, candidates[0].type === "tool_confirmed" ? "approved" : "denied");
    });
    return map;
  }, [confirmationFramesByCallScope]);

  const childRunIdsBySubagentId = useMemo(() => {
    const map = new Map();
    Object.entries(effectiveSubagentMetaByRunId).forEach(([runId, meta]) => {
      const subagentId =
        typeof meta?.subagentId === "string" ? meta.subagentId.trim() : "";
      if (!subagentId) {
        return;
      }
      if (!map.has(subagentId)) {
        map.set(subagentId, []);
      }
      map.get(subagentId).push(runId);
    });
    return map;
  }, [effectiveSubagentMetaByRunId]);

  const interactTypeByCallScope = useMemo(() => {
    const map = new Map();
    for (const frame of toolCallFrames) {
      const key = traceCallScopeKey(frame);
      const itype = typeof frame.payload?.interact_type === "string"
        ? frame.payload.interact_type
        : "";
      if (key && itype) map.set(key, itype);
    }
    return map;
  }, [toolCallFrames]);

  const confirmationUserResponseByCallScope = useMemo(() => {
    const map = new Map();
    for (const frame of logicalFrames) {
      if (
        (frame?.type !== "tool_confirmed" && frame?.type !== "tool_denied") ||
        frame?.payload?.user_response === undefined
      ) continue;
      const key = resolveTraceCallScopeKey(frame, toolCallFrames, true);
      if (!key || confirmationFramesByCallScope.get(key)?.length !== 1) continue;
      const normalized = normalizePersistedInteractionResponse(
        interactTypeByCallScope.get(key) || "",
        frame.payload.user_response,
      );
      map.set(key, normalized === undefined ? frame.payload.user_response : normalized);
    }
    return map;
  }, [logicalFrames, confirmationFramesByCallScope, interactTypeByCallScope, toolCallFrames]);

  const toolResultUserResponseByCallScope = useMemo(() => {
    const map = new Map();
    for (const frame of logicalFrames) {
      if (frame?.type !== "tool_result") continue;
      const key = resolveTraceCallScopeKey(frame, toolCallFrames);
      if (!key || toolResultByCallScope.get(key) !== frame) continue;
      const interactType =
        typeof frame?.payload?.interact_type === "string"
          ? frame.payload.interact_type
          : interactTypeByCallScope.get(key) ||
            (frame?.payload?.tool_name === "ask_user_question" ? "single" : "");
      const normalized = normalizePersistedInteractionResponse(
        interactType,
        frame.payload?.result,
      );
      if (normalized !== undefined) map.set(key, normalized);
    }
    return map;
  }, [logicalFrames, interactTypeByCallScope, toolCallFrames, toolResultByCallScope]);

  const timelineItems = useMemo(() => {
    const items = [];
    const renderedCallScopes = new Set();
    const usedRunIds = new Set();
    let prevTs = startFrame?.ts ?? null;
    const fallbackChunks = isStreaming
      ? normalizeStreamingChunks(streamingChunks)
      : [];
    const fallbackContent =
      isStreaming && typeof streamingContent === "string" ? streamingContent : "";
    const hasLiveContent =
      (isStreaming && storeHasLiveText) ||
      fallbackChunks.some((chunk) => chunk.trim().length > 0) ||
      fallbackContent.trim().length > 0;
    // Dedup text: read imperatively once. This memo only recomputes on frames
    // change / boolean flip, and a final_message frame arriving always coincides
    // with a frames change — so the text read here is the latest live text.
    const liveTextNow = !isStreaming
      ? ""
      : (store && typeof store.getText === "function"
          ? store.getText({ chatId, messageId })
          : "") ||
        (fallbackChunks.length > 0 ? fallbackChunks.join("") : fallbackContent);
    const normalizedLiveText = hasLiveContent ? liveTextNow.trim() : "";

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
          ...(isObs
            ? {
                _sourceFrame: frame,
                _toolOutput: true,
                _outputCallId: frame.payload?.call_id,
              }
            : {}),
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
                  color: "var(--pupu-text-secondary)",
                }}
              />
            ) : undefined,
        });
      } else if (frame.type === "fyi_injected") {
        // btw-channel back-notes (origin "system") are already surfaced by
        // their own side_answer frame — skip them here to avoid showing the
        // same Q&A twice.
        const userMessages = Array.isArray(frame.payload?.messages)
          ? frame.payload.messages.filter((m) => m?.origin === "user")
          : [];
        if (userMessages.length === 0) continue;

        const accent = colorWithAlpha(themeHighlightColor(theme), 0.55);
        items.push({
          key: `${frame.seq}-fyi-injected`,
          title: "User note added",
          span: spanText,
          status: "done",
          body: (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                marginTop: 3,
              }}
            >
              {userMessages.map((m, idx) => (
                <div
                  key={m?.message_id || idx}
                  style={{
                    borderLeft: `2px solid ${accent}`,
                    paddingLeft: 8,
                    fontSize: 12,
                    lineHeight: 1.55,
                    fontFamily: "inherit",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "var(--pupu-text-secondary)",
                  }}
                >
                  {typeof m?.text === "string" ? m.text : ""}
                </div>
              ))}
            </div>
          ),
        });
      } else if (frame.type === "side_answer") {
        const question =
          typeof frame.payload?.question === "string"
            ? frame.payload.question
            : "";
        const answer =
          typeof frame.payload?.answer === "string"
            ? frame.payload.answer
            : "";
        if (!question && !answer) continue;

        items.push({
          key: `${frame.seq}-side-answer`,
          title: "Side answer",
          span: spanText,
          status: "done",
          point: <AccentPoint color={themeHighlightColor(theme)} />,
          details: (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              {question && (
                <div
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: "var(--pupu-text-faint)",
                  }}
                >
                  {question}
                </div>
              )}
              {answer && (
                <SeamlessMarkdown
                  content={answer}
                  status="done"
                  fontSize={12}
                  lineHeight={1.65}
                  style={{
                    ...TRACE_DETAIL_MARKDOWN_STYLE,
                    color: "var(--pupu-text-secondary)",
                  }}
                />
              )}
            </div>
          ),
        });
      } else if (frame.type === "clarify_request") {
        const clarifyStatus =
          typeof frame.payload?.status === "string"
            ? frame.payload.status
            : "pending";
        const clarifyQuestion =
          typeof frame.payload?.question === "string"
            ? frame.payload.question
            : "";
        const clarifyOptions = Array.isArray(frame.payload?.options)
          ? frame.payload.options
          : [];
        const isClarifyResolved =
          clarifyStatus === "resolved" || clarifyStatus === "resolved_default";
        const canResolveClarify =
          !isClarifyResolved && typeof onClarifyResolve === "function";
        // "resolved_default" always means the run ended before the user
        // picked a channel, and the pending clarify falls back to the queue
        // channel (see use_chat_stream.js dispatchInterjectChannel) — reflect
        // that known outcome in the UI instead of leaving nothing selected.
        // Read alias: clarify frames persisted before the steer→queue rename
        // carry value:"steer"; treat it as ≡ "queue" (render-side only, no
        // data migration).
        const defaultClarifyOption =
          clarifyStatus === "resolved_default"
            ? clarifyOptions.find(
                (opt) => opt?.value === "queue" || opt?.value === "steer",
              )
            : undefined;
        const defaultClarifyResponse = defaultClarifyOption
          ? { value: defaultClarifyOption.value }
          : undefined;
        const clarifyStatusColor = isClarifyResolved
          ? "var(--pupu-success)"
          : "var(--pupu-text-secondary)";

        items.push({
          key: `${frame.seq}-clarify`,
          title: "Needs clarification",
          span: spanText,
          status: "done",
          point: <HammerPoint isDark={isDark} />,
          body: (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  color: clarifyStatusColor,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                }}
              >
                {isClarifyResolved ? "Selected" : "Pending"}
              </span>
              <InteractWrapper
                type="single"
                config={{ question: clarifyQuestion, options: clarifyOptions }}
                onSubmit={(data) => {
                  if (typeof onClarifyResolve === "function") {
                    onClarifyResolve(data?.value);
                  }
                }}
                uiState={{
                  resolved: isClarifyResolved,
                  userResponse: defaultClarifyResponse,
                }}
                isDark={isDark}
                disabled={!canResolveClarify}
              />
            </div>
          ),
        });
      } else if (frame.type === "tool_call") {
        const callId = frame.payload?.call_id;
        const callScopeKey = traceCallScopeKey(frame);
        if (callScopeKey && renderedCallScopes.has(callScopeKey)) continue;
        if (callScopeKey) renderedCallScopes.add(callScopeKey);

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
        const interactType =
          typeof frame.payload?.interact_type === "string"
            ? frame.payload.interact_type
            : "confirmation";
        const interactConfig = frame.payload?.interact_config || {};
        const resultFrame = callScopeKey ? toolResultByCallScope.get(callScopeKey) : null;
        const result = resultFrame?.payload?.result;
        const internalDelta =
          resultFrame?.ts && frame.ts ? resultFrame.ts - frame.ts : null;

        /* ── subagent tool calls get special rendering ── */
        if (SUBAGENT_TOOLS.has(frame.payload?.tool_name)) {
          const isDelegate = frame.payload.tool_name === "delegate_to_subagent";
          const isBatch = frame.payload.tool_name === "spawn_worker_batch";
          const isHandoff = frame.payload.tool_name === "handoff_to_subagent";
          const target = args?.target || "worker";
          const task = args?.task || args?.reason || "";
          const batchTasks =
            isBatch && Array.isArray(args?.tasks) ? args.tasks : [];
          const batchCount = isBatch ? batchTasks.length : 0;
          const resultStatus = result?.status || (resultFrame ? "done" : "");
          const resultOutput =
            typeof result?.output === "string"
              ? result.output
              : typeof result?.summary === "string"
                ? result.summary
                : "";
          const batchResults =
            isBatch && Array.isArray(result?.results) ? result.results : [];
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
          if (result?.error)
            detailSections.push({
              heading: "error",
              pairs: [{ key: "message", value: result.error }],
            });

          const childTimelineItems =
            isDelegate || isHandoff
              ? (() => {
                  const agentName =
                    typeof result?.agent_name === "string"
                      ? result.agent_name
                      : "";
                  const candidates = agentName
                    ? childRunIdsBySubagentId.get(agentName) || []
                    : [];
                  const childRunId =
                    candidates.find((id) => !usedRunIds.has(id)) || "";
                  if (childRunId) usedRunIds.add(childRunId);
                  const childMeta = childRunId
                    ? effectiveSubagentMetaByRunId[childRunId]
                    : null;
                  const childFrames = childRunId
                    ? effectiveSubagentFrames[childRunId]
                    : [];
                  if (!agentName && !resultFrame) {
                    return [];
                  }
                  return [
                    {
                      key: `${frame.seq}-${childRunId || agentName || (isHandoff ? "handoff" : "delegate")}`,
                      meta: childMeta,
                      frames: Array.isArray(childFrames) ? childFrames : [],
                      status:
                        typeof result?.status === "string" && result.status.trim()
                          ? result.status
                          : childMeta?.status || "",
                      task,
                      preview: resultOutput || result?.error || "",
                      agentName,
                      template:
                        typeof result?.template_name === "string"
                          ? result.template_name
                          : childMeta?.template || target,
                      orphaned: !childRunId,
                    },
                  ];
                })()
              : isBatch
                ? (() => {
                    return batchResults.map((childResult, index) => {
                      const agentName =
                        typeof childResult?.agent_name === "string"
                          ? childResult.agent_name
                          : "";
                      const candidates = agentName
                        ? childRunIdsBySubagentId.get(agentName) || []
                        : [];
                      const childRunId =
                        candidates.find((id) => !usedRunIds.has(id)) || "";
                      if (childRunId) usedRunIds.add(childRunId);
                      const childMeta = childRunId
                        ? effectiveSubagentMetaByRunId[childRunId]
                        : null;
                      const childFrames = childRunId
                        ? effectiveSubagentFrames[childRunId]
                        : [];
                      const childTask =
                        typeof batchTasks[index]?.task === "string"
                          ? batchTasks[index].task
                          : "";
                      const childPreview =
                        typeof childResult?.summary === "string" &&
                        childResult.summary.trim()
                          ? childResult.summary
                          : typeof childResult?.output === "string" &&
                              childResult.output.trim()
                            ? childResult.output
                            : typeof childResult?.error === "string"
                              ? childResult.error
                              : "";
                      return {
                        key: `${frame.seq}-${childRunId || agentName || "w"}-${index}`,
                        meta: childMeta,
                        frames: Array.isArray(childFrames) ? childFrames : [],
                        status:
                          typeof childResult?.status === "string" &&
                          childResult.status.trim()
                            ? childResult.status
                            : childMeta?.status || "",
                        task: childTask,
                        preview: childPreview,
                        agentName,
                        template:
                          typeof childResult?.template_name === "string"
                            ? childResult.template_name
                            : childMeta?.template || target,
                        orphaned: !childRunId,
                      };
                    });
                  })()
                : [];

          /* ── build branches for BranchGraph ── */
          const modeLabel = isBatch
            ? "workers"
            : isDelegate
              ? "delegate"
              : "handoff";
          const bKey = callId || `seq-${frame.seq}`;
          const bState = branchState.get(bKey);
          const isBranchExpanded = bState?.expanded ?? true;
          const bExpandedWorkers = bState?.expandedWorkers ?? new Set();

          const labelStyle = {
            fontSize: "0.82em",
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: "var(--pupu-text-faint)",
            userSelect: "none",
          };
          const statusStyle = {
            fontSize: "0.82em",
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: failed ? "var(--pupu-danger)" : "var(--pupu-success)",
            userSelect: "none",
          };

          const branches = childTimelineItems.map((worker, wi) => {
            const wLabel = getSubagentShortLabel({
              meta: worker.meta,
              fallbackAgentName: worker.agentName,
              fallbackTemplate: worker.template,
            });
            const wStatusColor = getSubagentStatusColor(
              worker.status,
              isDark,
            );
            const hasWFrames =
              Array.isArray(worker.frames) && worker.frames.length > 0;
            const canExpand = hasWFrames && _depth < MAX_TRACE_DEPTH;
            const frameCount = hasWFrames ? worker.frames.length : 0;
            const workerTraceStatus = getSubagentTraceStatus(worker.status);
            const shouldLazyRender =
              workerTraceStatus === "streaming" ||
              _depth > 0 ||
              frameCount > SUBAGENT_LAZY_FRAME_THRESHOLD;
            const isWExpanded = bState
              ? bExpandedWorkers.has(wi)
              : !shouldLazyRender;

            return {
              key: worker.key,
              title: (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Menlo, Monaco, Consolas, monospace",
                      fontSize: "0.82em",
                      color: isDark
                        ? "rgba(196,170,255,0.82)"
                        : "rgba(109,40,217,0.76)",
                      userSelect: "none",
                    }}
                  >
                    {wLabel}
                  </span>
                  {worker.template && worker.template !== wLabel && (
                    <span
                      style={{
                        fontFamily: "Menlo, Monaco, Consolas, monospace",
                        fontSize: "0.74em",
                        color,
                        opacity: 0.34,
                        userSelect: "none",
                      }}
                    >
                      {worker.template}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "Menlo, Monaco, Consolas, monospace",
                      fontSize: "0.74em",
                      color: wStatusColor,
                      userSelect: "none",
                    }}
                  >
                    {worker.status || "pending"}
                  </span>
                  {canExpand && (
                    <BranchExpandArrow
                      open={isWExpanded}
                      onClick={() => toggleBranchWorker(bKey, wi, isWExpanded)}
                      isDark={isDark}
                    />
                  )}
                </span>
              ),
              span: worker.task
                ? truncateInlineText(worker.task, 120)
                : undefined,
              status:
                workerTraceStatus === "done"
                  ? "done"
                  : workerTraceStatus === "streaming"
                    ? "active"
                    : "pending",
              point: <SubagentPoint isDark={isDark} />,
              expandContent: canExpand && isWExpanded ? (
                <TraceChain
                  frames={worker.frames}
                  status={workerTraceStatus}
                  showContainerHeader={false}
                  bubbleOwnsFinalMessage={false}
                  compact
                  hideTrack
                  subagentFrames={effectiveSubagentFrames}
                  subagentMetaByRunId={effectiveSubagentMetaByRunId}
                  onToolConfirmationDecision={onToolConfirmationDecision}
                  toolConfirmationUiStateById={toolConfirmationUiStateById}
                  onClarifyResolve={onClarifyResolve}
                  onStopStream={onStopStream}
                  _depth={_depth + 1}
                />
              ) : hasWFrames ? (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    color: "var(--pupu-text-faint)",
                    padding: "4px 0",
                    userSelect: "none",
                  }}
                >
                  Trace depth limit reached
                </div>
              ) : undefined,
              isExpanded: canExpand ? isWExpanded : hasWFrames,
            };
          });

          const overallBranchStatus = resultFrame
            ? failed
              ? "error"
              : "done"
            : "active";

          items.push({
            key: `${frame.seq}-subagent`,
            title: (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span style={labelStyle}>{modeLabel}</span>
                <SubagentTag name={target} isDark={isDark} />
                {batchCount > 0 && (
                  <CountBadge count={batchCount} isDark={isDark} />
                )}
                {resultStatus && failed && (
                  <span style={statusStyle}>{resultStatus}</span>
                )}
                {branches.length > 0 && (
                  <BranchExpandArrow
                    open={isBranchExpanded}
                    onClick={() => toggleBranchSummary(bKey)}
                    isDark={isDark}
                  />
                )}
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
                curveReach={hideTrack ? 0 : compact ? 22 : 26}
                inset={hideTrack ? 0 : 12}
                isDark={isDark}
                compact={compact}
              />
            ) : undefined,
          });
          continue;
        }

        const confirmationResult = callScopeKey
          ? confirmationStatusByCallScope.get(callScopeKey)
          : "";
        const hasAuthoritativeConfirmationUiState = Boolean(
          confirmationId &&
            toolConfirmationUiStateById &&
            Object.prototype.hasOwnProperty.call(
              toolConfirmationUiStateById,
              confirmationId,
            ),
        );
        const confirmationUiState = hasAuthoritativeConfirmationUiState
          ? toolConfirmationUiStateById[confirmationId] || {}
          : {};
        const persistedUserResponse =
          callScopeKey && confirmationUserResponseByCallScope.has(callScopeKey)
            ? confirmationUserResponseByCallScope.get(callScopeKey)
            : callScopeKey && toolResultUserResponseByCallScope.has(callScopeKey)
              ? toolResultUserResponseByCallScope.get(callScopeKey)
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

        /* ── confirmation / selection state (computed for all tool_calls) ── */
        let interactBody = undefined;
        let toolPointEl = <HammerPoint isDark={isDark} />;
        let toolStatus = "done";

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
            hasAuthoritativeConfirmationUiState &&
            uiStatus === "idle" &&
            !isResolved &&
            !uiResolved &&
            !isSubmitting &&
            typeof onToolConfirmationDecision === "function";

          /* approved / denied / pending are success, danger and neutral —
             three roles the palette already owns, so they follow it. */
          const statusColor = isResolved
            ? resolvedDecision === "approved"
              ? "var(--pupu-success)"
              : "var(--pupu-danger)"
            : "var(--pupu-text-secondary)";

          toolPointEl = <HammerPoint isDark={isDark} />;
          toolStatus = "done";

          interactBody = (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  color: statusColor,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                }}
              >
                {statusLabel}
              </span>
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
                  allowSessionApproval={isToolConfirmationCacheable(
                    frame.payload?.toolkit_id,
                    frame.payload?.tool_name,
                  )}
                />
              ) : null}
            </div>
          );
        }

        items.push({
          key: `${frame.seq}-tool`,
          title: <ToolTag name={toolName} isDark={isDark} compact={compact} />,
          span: spanText,
          status: toolStatus,
          point: toolPointEl,
          body: interactBody,
          details:
            sections.length > 0 ? (
              <KVPanel sections={sections} isDark={isDark} color={color} />
            ) : undefined,
          _toolName: toolName,
          _sections: sections,
          _sourceFrame: frame,
          _toolGrouping: getToolGroupingIdentity(frame),
        });
      } else if (frame.type === "provider_retry") {
        const group = providerRetryGroups.get(Number(frame.seq));
        if (!group) continue;
        const last = group.frames[group.frames.length - 1].payload;
        const provider = providerDisplayName(last.provider, t);
        // A plain string gets the timeline's default body style.
        const record = `${provider} · ${providerRetryReason(last, t)}`;
        if (group.outcome === "waiting") {
          items.push({
            key: `${frame.seq}-provider-retry`,
            title: t("provider_retry.waiting", { provider }),
            span: spanText,
            status: "active",
            point: "loading",
            body: (
              <ProviderRetryWaitBody
                frames={group.frames}
                onStopStream={onStopStream}
                t={t}
              />
            ),
          });
        } else {
          const stopped = group.outcome === "stopped";
          items.push({
            key: `${frame.seq}-provider-retry`,
            title: stopped
              ? t("provider_retry.stopped")
              : t("provider_retry.retried", { count: last.attempt_failed }),
            span: spanText,
            status: "done",
            point: stopped ? <RetryStoppedPoint /> : <RetryWaitPoint />,
            body: record,
            details: (
              <ProviderRetryRecordDetails
                frames={group.frames}
                outcome={group.outcome}
                t={t}
              />
            ),
          });
        }
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
              color="var(--pupu-danger)"
            />
          ),
        });
      } else if (frame.type === "final_message") {
        const content =
          typeof frame.payload?.content === "string"
            ? frame.payload.content
            : "";
        if (!content.trim()) continue;
        if (
          isStreaming &&
          normalizedLiveText.length > 0 &&
          normalizedLiveText.startsWith(content.trim())
        ) {
          continue;
        }
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
                fontSize={compact ? 12 : ASSISTANT_MARKDOWN_FONT_SIZE}
                lineHeight={compact ? 1.5 : ASSISTANT_MARKDOWN_LINE_HEIGHT}
                style={compact ? COMPACT_RESPONSE_MARKDOWN_STYLE : undefined}
              />
            </div>
          ),
        });
      }
    }

    if (isStreaming) {
      if (hasLiveContent) {
        // When the bubble body is the sole owner of live text (the no-tool
        // placeholder case), the timeline must NOT mirror the streaming
        // response — that double-rendered the answer (regression c417d9c).
        // Pushing nothing here leaves timelineItems empty once text arrives,
        // so the placeholder returns null and the bubble body owns the text.
        if (!bubbleOwnsLiveText) {
          items.push({
            key: "__streaming_content__",
            title: "Response",
            span: null,
            status: "active",
            point: "loading",
            body: (
              <div style={{ fontFamily: "inherit" }}>
                <StreamingMarkdownView
                  messageId={messageId}
                  fallbackContent={fallbackContent}
                  fallbackChunks={streamingChunks}
                  fontSize={compact ? 12 : ASSISTANT_MARKDOWN_FONT_SIZE}
                  lineHeight={compact ? 1.5 : ASSISTANT_MARKDOWN_LINE_HEIGHT}
                  style={compact ? COMPACT_RESPONSE_MARKDOWN_STYLE : undefined}
                  priority="high"
                />
              </div>
            ),
          });
        }
      } else if (!isRetryWaiting) {
        items.push({
          key: "__streaming__",
          title: "Thinking…",
          span: null,
          status: "active",
          point: "loading",
        });
      }
    }

    /* continuation is now a regular tool_call with tool_name "__continuation__"
       — rendered by the normal tool confirmation path above, no special block needed */

    /* ── observation coalescing summary (issue #168): a tool that streamed
       thousands of deltas only kept OBSERVATION_HEAD_LIMIT head rows; the rest
       were folded upstream. The final tool_result carries the omitted count +
       last lines, so drop a quiet "+N more coalesced" row after the head — its
       details expand to the preserved tail. ── */
    for (const frame of displayFrames) {
      if (
        frame.type !== "tool_result" ||
        !frame.payload ||
        !(Number(frame.payload.observation_omitted) > 0)
      ) {
        continue;
      }
      const cid = frame.payload.call_id;
      const resultScopeKey = resolveTraceCallScopeKey(frame, toolCallFrames);
      if (!resultScopeKey) continue;
      let lastObsIdx = -1;
      for (let idx = items.length - 1; idx >= 0; idx -= 1) {
        const observationFrame = items[idx]?._sourceFrame;
        if (
          items[idx]?._toolOutput === true &&
          observationFrame?.type === "observation" &&
          resolveTraceCallScopeKey(observationFrame, toolCallFrames) === resultScopeKey
        ) {
          lastObsIdx = idx;
          break;
        }
      }
      if (lastObsIdx < 0) continue;
      const omitted = Number(frame.payload.observation_omitted);
      const tail = Array.isArray(frame.payload.observation_tail)
        ? frame.payload.observation_tail.filter(Boolean)
        : [];
      const tailText = tail.join("\n");
      const observationAnchor = items[lastObsIdx]?._sourceFrame || frame;
      items.splice(lastObsIdx + 1, 0, {
        key: `obs-trunc-${resultScopeKey}`,
        title: `+${omitted} more output line${omitted === 1 ? "" : "s"} coalesced`,
        status: "done",
        _sourceFrame: observationAnchor,
        _outputFrame: frame,
        _toolOutput: true,
        _outputCallId: cid,
        ...(tailText
          ? {
              details: (
                <SeamlessMarkdown
                  content={tailText}
                  status="done"
                  fontSize={12}
                  lineHeight={1.65}
                  style={{
                    ...TRACE_DETAIL_MARKDOWN_STYLE,
                    color: "var(--pupu-text-secondary)",
                  }}
                />
              ),
            }
          : {}),
      });
    }

    /* ── group consecutive calls by canonical tool, preserving owned output ── */
    const grouped = groupToolTimelineItems(items, logicalFrames).map((item) => {
      const group = item?._toolGroup;
      if (!group) return item;

      const firstCall = group.calls[0];
      const allSections = group.calls.flatMap((call) => call._sections || []);
      const memberTimeline = (
        <ToolGroupTimeline
          key={`tool-group:${timelineExpansionScope}:${firstCall.key}`}
          items={group.memberItems}
          compact
          hideTrack
          style={{ fontSize: compact ? 11 : 12 }}
        />
      );
      const details = group.hasFeedback
        ? undefined
        : group.outputs.length > 0 ? (
          memberTimeline
        ) : allSections.length > 0 ? (
          <KVPanel sections={allSections} isDark={isDark} color={color} />
        ) : undefined;

      return {
        key: firstCall.key,
        title: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ToolTag
              name={firstCall._toolName}
              isDark={isDark}
              compact={compact}
            />
            <CountBadge count={group.calls.length} isDark={isDark} />
          </span>
        ),
        span: group.calls[group.calls.length - 1].span,
        status: "done",
        point: <HammerPoint isDark={isDark} />,
        ...(group.hasFeedback ? { body: memberTimeline } : {}),
        details,
      };
    });

    /* ── durable Memory V2 audit + token summary at the end ── */
    const memoryV2Audit = mergeMemoryV2AuditWithJournal(
      presentMemoryV2Audit(
        completionDiagnostics?.memory_v2 || bundle?.memory_v2,
        {
        runStatus: status,
        },
      ),
      memoryV2JournalProjection?.ownerChatId === chatId
        ? memoryV2JournalProjection
        : null,
    );
    if (memoryV2Audit) {
      const currentJobs = memoryJobProjection?.ownerChatId === chatId &&
        memoryJobProjection?.messageId === messageId ? memoryJobProjection.runs : [];
      const runs = mergeMemoryJobRuns(memoryV2Audit.agentRuns, currentJobs);
      grouped.push({
        key: "__memory_v2_audit__",
        title: (
          <span data-testid="memory-v2-trace-title">
            {conversationActivity(memoryV2Audit, t)}
          </span>
        ),
        span: "",
        status:
          memoryV2Audit.status === "Unavailable" ? "pending" : "done",
        unmountDetailsWhenClosed: true,
        details: (
          <MemoryV2ContextAudit
            audit={memoryV2Audit}
            ownerChatId={chatId}
            isDark={isDark}
            onJournalProjection={handleMemoryV2JournalProjection}
            messageId={messageId}
            rootRunId={bundle?.identity?.root_run_id}
            onMemoryJobs={handleMemoryJobProjection}
          />
        ),
      });

      if (runs.length > 0) {
        grouped.push({
          key: "__memory_agent_audit__",
          title: (
            <span data-testid="memory-agent-trace-title">
              {organizationActivity(runs, t)}
            </span>
          ),
          span: "",
          // Background work must not animate or reopen the finished answer.
          status: "done",
          unmountDetailsWhenClosed: true,
          details: (
            <MemoryAgentLiveDetails
              key={`${chatId}:${messageId}`}
              runs={runs}
              ownerChatId={chatId}
              messageId={messageId}
              onUpdate={handleMemoryJobProjection}
              isDark={isDark}
            />
          ),
        });
      }
    }

    const tokenUsage = selectRunBundleUsage(bundle);
    if (
      status === "done" &&
      (tokenUsage.canonical === true ||
        (typeof tokenUsage.total === "number" && tokenUsage.total > 0))
    ) {
      grouped.push({
        key: "__token_summary__",
        title: (
          <TokenSummary
            usage={tokenUsage}
            isDark={isDark}
            bundle={bundle}
            partialNote={
              tokenUsage.callsWithoutUsage > 0
                ? t("provider_retry.usage_partial", {
                    excluded: tokenUsage.callsWithoutUsage,
                    total: tokenUsage.callCount,
                  })
                : null
            }
          />
        ),
        status: "done",
        point: "end",
      });
    }

    return grouped;
  }, [
    frames,
    logicalFrames,
    displayFrames,
    providerRetryGroups,
    isRetryWaiting,
    onStopStream,
    isStreaming,
    bubbleOwnsLiveText,
    messageId,
    timelineExpansionScope,
    streamingContent,
    streamingChunks,
    storeHasLiveText,
    store,
    chatId,
    startFrame,
    toolResultByCallScope,
    confirmationStatusByCallScope,
    confirmationUserResponseByCallScope,
    toolResultUserResponseByCallScope,
    handleInteractSubmit,
    onToolConfirmationDecision,
    toolConfirmationUiStateById,
    onClarifyResolve,
    isDark,
    color,
    theme,
    status,
    bundle,
    completionDiagnostics,
    memoryV2JournalProjection,
    memoryJobProjection,
    handleMemoryJobProjection,
    t,
    handleMemoryV2JournalProjection,
    compact,
    hideTrack,
    _depth,
    childRunIdsBySubagentId,
    effectiveSubagentFrames,
    effectiveSubagentMetaByRunId,
    branchState,
    toggleBranchSummary,
    toggleBranchWorker,
  ]);

  const expandedTimelineIndices = useMemo(() => {
    const expandedKeys =
      expandedTimelineState.scope === timelineExpansionScope
        ? expandedTimelineState.keys
        : new Set();
    const indices = [];
    timelineItems.forEach((item, index) => {
      if (expandedKeys.has(item.key)) indices.push(index);
    });
    return indices;
  }, [expandedTimelineState, timelineExpansionScope, timelineItems]);
  const handleTimelineExpandChange = useCallback(
    (indices) => {
      setExpandedTimelineState({
        scope: timelineExpansionScope,
        keys: new Set(
          indices
            .map((index) => timelineItems[index]?.key)
            .filter((key) => typeof key === "string" && key.length > 0),
        ),
      });
    },
    [timelineExpansionScope, timelineItems],
  );

  if (timelineItems.length === 0) return null;

  const isBodyVisible = showContainerHeader ? bodyOpen : true;
  // Issue #168: once a trace is settled and the user collapses it, unmount the
  // whole timeline subtree so a large run stops holding thousands of hidden DOM
  // nodes after the collapse animation. Only when settled — never while
  // streaming (frames still updating) or waiting (a pending confirmation /
  // continuation keeps the run out of "done", so its controls stay mounted and
  // actionable). Re-expanding rebuilds losslessly from frames.
  const bodyUnmountWhenClosed = status === "done" || status === "error";
  const timelineBody = (
    <AnimatedChildren
      open={isBodyVisible}
      unmountWhenClosed={showContainerHeader && bodyUnmountWhenClosed}
    >
      <div
        style={{
          paddingLeft: hideTrack ? 0 : 2,
          paddingBottom: hideTrack ? 0 : 2,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        <Timeline
          items={timelineItems}
          expanded_indices={expandedTimelineIndices}
          on_expand_change={handleTimelineExpandChange}
          compact={compact}
          hideTrack={hideTrack}
          style={{ fontSize: compact ? 12 : 13 }}
        />
      </div>
    </AnimatedChildren>
  );

  return (
    <div
      style={{
        marginBottom: showContainerHeader ? 10 : 0,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {showContainerHeader ? (
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
              ? isRetryWaiting
                ? t("provider_retry.retrying_header")
                : "Thinking…"
              : hasError
                ? (stepCount > 0
                    ? `Failed after ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                    : "Failed") + (duration ? ` · ${formatDelta(duration)}` : "")
                : (stepCount > 0
                    ? `Used ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                    : "Done") +
                  (duration ? ` · ${formatDelta(duration)}` : "")}
          </span>
        </div>
      ) : null}
      {timelineBody}
    </div>
  );
};

export default memo(TraceChain);
