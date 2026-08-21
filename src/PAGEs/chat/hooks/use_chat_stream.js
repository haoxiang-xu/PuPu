import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { toast } from "../../../SERVICEs/toast";
import { expandCommands, extractCommands } from "../../../SERVICEs/command_registry";
import { readMemorySettings } from "../../../COMPONENTs/settings/memory/storage";
import { admitDoneRunAccountingV1 } from "../../../SERVICEs/run_bundle_storage";
import { RUN_BUNDLE_V1_SCHEMA } from "../../../SERVICEs/run_bundle_v1";
import { RUN_BUNDLE_V2_SCHEMA } from "../../../SERVICEs/run_bundle_v2";
import { buildContextCompositionHintV2 } from "../../../SERVICEs/context_composition_hint_v2";
import { createLogger } from "../../../SERVICEs/console_logger";
import { createThinkTagParser } from "../think_tag_parser";
import {
  collectTurnMessageIds,
  settleStreamingAssistantMessages,
} from "../utils/chat_turn_utils";
import { createAttachmentPrompt } from "../utils/chat_attachment_utils";
import { FINALITY } from "../utils/message_finality";
import { createRuntimeEventStore } from "../../../SERVICEs/runtime_events/event_store";
import {
  createIncrementalActivityTreeProjector,
  reduceActivityTree,
} from "../../../SERVICEs/runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../../../SERVICEs/runtime_events/trace_chain_adapter";
import { summarizeRequestMessagesForLog } from "../../../SERVICEs/runtime_events/request_message_log_summary";
import { isRuntimeEventStreamEnabled } from "../../../SERVICEs/runtime_events/runtime_event_stream_gate";
import { createRuntimeEventStreamReplayProjector } from "../../../SERVICEs/runtime_events/stream_replay_projector";
import { isToolAutoApproved } from "../../../SERVICEs/toolkit_auto_approve_store";
import {
  isToolConfirmationCacheable,
  shouldCacheToolConfirmationDecision,
} from "../../../SERVICEs/tool_confirmation_cache_policy";
import {
  clearStreamingMessageText,
  finalizeStreamingMessage,
} from "../../../SERVICEs/streaming_message_chunks";
import { createStreamingMessageStore } from "../../../SERVICEs/streaming_message_store";
import {
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  cancelBackgroundPersist,
} from "./background_stream_persister";
import { createStreamFlushScheduler } from "./stream_flush_scheduler";
import { finalizeStreamPersist } from "./finalize_stream_persist";
import { createRuntimeEventBatcher } from "./runtime_event_batcher";
import {
  buildInterjectionRecord,
  createQueuedTurnBuffer,
} from "./interject_controller";
import {
  buildDurableResumePayload,
  buildRecoveredConfirmationRequest,
  durableInteractionRetryDelayMs,
  ensureDurableInteractionMessage,
  isRetryableDurableInteractionError,
  normalizePendingInteraction,
  prepareDurableInteractionResumeMessages,
  shouldReconcileDurableResumeError,
} from "./durable_interaction_recovery";
import {
  enqueueExecutionCancel,
  readExecutionCancelOutbox,
  removeExecutionCancel,
} from "./execution_cancel_outbox";
import {
  SECRET_CAPTURE_MESSAGES,
  detectLikelySecretAssignment,
  hasSecretCaptureSyntax,
  scanOutgoingSecretText,
} from "./secret_capture";
import {
  PLAIN_USER_APPROVED_DISPOSITION,
  SECRET_GATE_DECISIONS,
  useSecretCaptureGate,
} from "./use_secret_capture_gate";
import { buildContextV2History } from "./context_v2_history";
import {
  CONTEXT_V2_TURN_MUTATION_MESSAGES,
  TURN_MUTATION_ADMISSION,
  buildContextV2RebasePayload,
  buildRebaseReplacementHistory,
  CONTEXT_V2_V1_MIRROR_ERROR_CODE,
  contextV2TurnMutationMessage,
  contextV2V1MirrorMessage,
  decideTurnMutationMemoryMode,
  projectContextV2RebaseAck,
  resolveContextV2TurnMutationFailure,
  TURN_MUTATION_RETRY_ACTIONS,
  verifyContextV2RebaseAck,
} from "./context_v2_turn_mutation";
import {
  contextV2Bridge,
  parseContextV2ErrorCode,
} from "../../../SERVICEs/bridges/context_v2_bridge";
import { readMemoryAgentSettings } from "../../../SERVICEs/memory_agent_settings";
import { isFeatureFlagEnabled } from "../../../SERVICEs/feature_flags";
import {
  TURN_MUTATION_ADMISSION_MODES,
  TURN_MUTATION_MEMORY_MODES,
  TURN_MUTATION_MAX_REPLAY_ATTEMPTS,
  TURN_MUTATION_RETRY_STATUSES,
  TURN_MUTATION_V1_MIRROR_STATES,
  clearTurnMutationRetryState,
  createTurnMutationOperationId,
  enqueueTurnMutation,
  fingerprintTurnMutationMessages,
  readTurnMutationOutbox,
  readTurnMutationOutboxState,
  recordTurnMutationRebaseAck,
  recordTurnMutationRetryOutcome,
  recordTurnMutationV1MirrorApplied,
  removeTurnMutation,
  reserveTurnMutationRetryAttempt,
} from "../../../SERVICEs/turn_mutation_outbox";
import {
  bindQueuedTurnOwnersToAttempt,
  convertPendingFyiToClarify,
  createPendingFyiMessageId,
  createQueuedTurnClientOperationId,
  fallbackPendingClarifyToQueue,
  migratePendingFyiForAttemptToQueue,
  migratePendingFyiToQueue,
  readPendingClarifyForChat,
  purgeUngatedSecretOutboxEntries,
  readPendingFyiOutbox,
  readPendingFyisForAttempt,
  readQueuedTurnsForAttempt,
  readQueuedTurnsForChat,
  readQueuedTurnsForClientOperation,
  resolvePendingFyiIntent,
  removePendingClarify,
  removePendingFyisForAttempt,
  removeQueuedTurnsForAttempt,
  removeQueuedTurnsForClientOperation,
  transitionPendingClarifyToPendingFyi,
  writePendingFyi,
  writePendingClarify,
  writeQueuedTurnsForAttempt,
  writeQueuedTurnsForClientOperation,
} from "../../../SERVICEs/queued_turn_outbox";
import {
  start as progressStart,
  stop as progressStop,
} from "../../../SERVICEs/progress_bus";
import { getChatsStore } from "../../../SERVICEs/chat_storage";

const CHAT_STREAM_PROGRESS_ID = "chat_stream_active";
const STREAM_REATTACH_FLUSH_MS = 100;
const CLARIFY_BTW_SETTLEMENT_TIMEOUT_MS = 40_000;
const ADMITTED_RUN_ACCOUNTING_ERROR = Symbol("admitted_run_accounting_error");

const mergeDiscardedTurnMutationText = (currentValue, restoredValue) => {
  const current = typeof currentValue === "string" ? currentValue : "";
  const restored = typeof restoredValue === "string" ? restoredValue : "";
  if (!restored || current === restored) return current;
  if (!current) return restored;
  const separator = "\n\n";
  if (current.endsWith(`${separator}${restored}`)) return current;
  return `${current}${separator}${restored}`;
};

/* Process-local ownership complements the durable localStorage outbox. It
   survives Chat page remounts, so an old async finally cannot unlock a newer
   owner and a remounted page cannot start work while recovery is pending. */
const activeTurnMutationsByChatId = new Map();
const turnMutationListeners = new Set();

const notifyTurnMutationChange = (chatId) => {
  turnMutationListeners.forEach((listener) => listener(chatId));
};

const claimTurnMutation = ({ chatId, operationId, mountedRef, recovery }) => {
  if (!chatId || !operationId) {
    return null;
  }
  const outboxSnapshot = readTurnMutationOutboxState();
  if (!outboxSnapshot.available) {
    return null;
  }
  let existingOwner = activeTurnMutationsByChatId.get(chatId);
  if (existingOwner?.mountedRef?.current === false) {
    const hasDurableIntent = outboxSnapshot.entries.some(
      (entry) =>
        entry.chatId === chatId &&
        entry.operationId === existingOwner.operationId,
    );
    if (!hasDurableIntent) {
      activeTurnMutationsByChatId.delete(chatId);
      notifyTurnMutationChange(chatId);
      existingOwner = null;
    }
  }
  if (existingOwner) {
    if (
      existingOwner.operationId !== operationId ||
      existingOwner.mountedRef?.current !== false
    ) {
      return null;
    }
  }
  const owner = { chatId, operationId, mountedRef, recovery: recovery === true };
  activeTurnMutationsByChatId.set(chatId, owner);
  notifyTurnMutationChange(chatId);
  return owner;
};

const ownsTurnMutation = (owner) =>
  Boolean(
    owner?.chatId && activeTurnMutationsByChatId.get(owner.chatId) === owner,
  );

const releaseTurnMutation = (owner) => {
  if (!ownsTurnMutation(owner)) return false;
  activeTurnMutationsByChatId.delete(owner.chatId);
  notifyTurnMutationChange(owner.chatId);
  return true;
};

const isTurnMutationAlreadyCommitted = (entry, messages) => {
  const currentMessages = Array.isArray(messages) ? messages : [];
  const currentFingerprint = fingerprintTurnMutationMessages(currentMessages);
  if (entry?.kind === "delete") {
    return Boolean(
      entry.resultFingerprint && currentFingerprint === entry.resultFingerprint,
    );
  }
  if (
    entry?.originalFingerprint &&
    currentFingerprint === entry.originalFingerprint
  ) {
    return false;
  }
  const baseMessageCount = Math.max(0, Number(entry?.baseMessageCount) || 0);
  const baseMessages = currentMessages.slice(0, baseMessageCount);
  const userMessage = currentMessages[baseMessageCount];
  const assistantMessage = currentMessages[baseMessageCount + 1];
  const userTerminallyAcknowledged = Boolean(
    currentMessages.length === baseMessageCount + 1 &&
      userMessage?.id === entry.targetMessageId &&
      userMessage?.role === "user" &&
      userMessage?.content === entry.text &&
      userMessage?.meta?.turnMutationOperationId === entry.operationId &&
      userMessage?.meta?.turnMutationServerAcknowledged === true,
  );
  return Boolean(
    entry?.baseFingerprint &&
      fingerprintTurnMutationMessages(baseMessages) === entry.baseFingerprint &&
      (userTerminallyAcknowledged ||
        (currentMessages.length === baseMessageCount + 2 &&
          userMessage?.id === entry.targetMessageId &&
          userMessage?.role === "user" &&
          userMessage?.content === entry.text &&
          assistantMessage?.role === "assistant" &&
          assistantMessage?.meta?.turnMutationOperationId ===
            entry.operationId &&
          assistantMessage?.meta?.turnMutationServerAcknowledged === true)),
  );
};

const TERMINAL_TURN_MUTATION_ERROR_CODES = new Set([
  "invalid_request",
  "memory_replace_operation_conflict",
  "memory_replace_receipt_corruption",
  "session_revision_conflict",
]);

const isTerminalTurnMutationError = (error) => {
  if (error?.retryable === true) return false;
  const code = typeof error?.code === "string" ? error.code.trim() : "";
  if (TERMINAL_TURN_MUTATION_ERROR_CODES.has(code)) return true;
  const status = Number(error?.status);
  return (
    error?.retryable === false &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500
  );
};

/* The Context V2 rebase path decides terminality from the sidecar's stable
   error code (see context_v2_turn_mutation), which the V1 heuristic above
   cannot read. Legacy results carry no `terminal` field, so this collapses to
   the exact previous behaviour for them. */
const isTerminalTurnMutationResult = (result) =>
  result?.terminal === true || isTerminalTurnMutationError(result?.error);

const createTurnMutationResponseError = (response) => {
  const detail =
    response?.error && typeof response.error === "object"
      ? response.error
      : {};
  const error = new Error(
    (typeof detail.message === "string" && detail.message.trim()) ||
      "Failed to sync short-term memory for this chat.",
  );
  error.code =
    (typeof detail.code === "string" && detail.code.trim()) ||
    "unchain_session_memory_replace_failed";
  if (typeof detail.retryable === "boolean") {
    error.retryable = detail.retryable;
  }
  const status = Number(detail.status ?? response?.status);
  if (Number.isInteger(status)) error.status = status;
  if (Number.isInteger(Number(detail.expected_revision))) {
    error.expectedRevision = Number(detail.expected_revision);
  }
  if (Number.isInteger(Number(detail.actual_revision))) {
    error.actualRevision = Number(detail.actual_revision);
  }
  return error;
};

const isTurnMutationOptimisticWithoutAck = (entry, messages) => {
  if (!entry || entry.kind === "delete") return false;
  const currentMessages = Array.isArray(messages) ? messages : [];
  const baseMessageCount = Math.max(0, Number(entry.baseMessageCount) || 0);
  const baseMessages = currentMessages.slice(0, baseMessageCount);
  const userMessage = currentMessages[baseMessageCount];
  const assistantMessage = currentMessages[baseMessageCount + 1];
  const baseAndUserMatch = Boolean(
    entry.baseFingerprint &&
      fingerprintTurnMutationMessages(baseMessages) === entry.baseFingerprint &&
      userMessage?.id === entry.targetMessageId &&
      userMessage?.role === "user" &&
      userMessage?.content === entry.text &&
      userMessage?.meta?.turnMutationServerAcknowledged !== true &&
      (!userMessage?.meta?.turnMutationOperationId ||
        userMessage.meta.turnMutationOperationId === entry.operationId),
  );
  if (!baseAndUserMatch) return false;
  if (currentMessages.length === baseMessageCount + 1) {
    // Bootstrap intentionally removes an empty streaming placeholder. The
    // tagged optimistic user message remains sufficient to safely recover or
    // roll back the exact local mutation.
    return true;
  }
  return Boolean(
    currentMessages.length === baseMessageCount + 2 &&
      assistantMessage?.role === "assistant" &&
      assistantMessage?.meta?.turnMutationOperationId === entry.operationId &&
      assistantMessage?.meta?.turnMutationServerAcknowledged !== true,
  );
};

const sameDraftAttachments = (left, right) => {
  const leftItems = Array.isArray(left) ? left : [];
  const rightItems = Array.isArray(right) ? right : [];
  return (
    leftItems.length === rightItems.length &&
    leftItems.every((attachment, index) => {
      const other = rightItems[index];
      return attachment?.id && other?.id
        ? attachment.id === other.id
        : attachment === other;
    })
  );
};

/* ── Composer sidecar (S1↔S2 seam, contract v1 FROZEN) ─────────────────────
 * The `composer` field is a purely presentational, advisory sidecar attached
 * to a user message when its turn expanded ≥1 slash-command. It NEVER reaches
 * the model — content stays the single model-visible truth. runTurnRequest is
 * the sole writer (see the reconciliation block there); buildComposerSend below
 * is the sole builder, shared by sendNewTurn (compose) and editTurn (edit
 * re-expand). See docs/superpowers/specs/2026-07-18-composer-sidecar-contract.md
 */
const COMPOSER_SIDECAR_VERSION = 1;

/* Write-side guard: a composer is valid ONLY for the exact content it was
 * computed against. Mirrors the reader's §4 "整体忽略" rules so we never persist
 * a sidecar a reader would drop. `contentLength` is the final message content
 * length; templateLength must index within it (contract §1.4). */
const isValidComposerForContent = (composer, contentLength) =>
  Boolean(
    composer &&
      typeof composer === "object" &&
      composer.v === COMPOSER_SIDECAR_VERSION &&
      typeof composer.rawText === "string" &&
      composer.rawText !== "" &&
      Array.isArray(composer.commands) &&
      composer.commands.length > 0 &&
      composer.commands.every(
        (cmd) =>
          cmd && typeof cmd === "object" && typeof cmd.name === "string",
      ) &&
      Number.isInteger(composer.templateLength) &&
      composer.templateLength >= 0 &&
      composer.templateLength <= contentLength,
  );

/* Build the outgoing (expanded) text, the ephemeral per-run toolkit selection,
 * and the composer sidecar for a composer/edit send. `composer` is null unless
 * ≥1 command expanded (contract §2 write condition — a zero-template command
 * still counts, it contributes a chip). rawText is stored verbatim (pre-expand,
 * contract §1.2); commands are projected to {name, sourceToolkitId} preserving
 * token order and duplicates (§1.3). */
const buildComposerSend = (rawText, selectedToolkits) => {
  const expansion = expandCommands(rawText, {
    isStreaming: false,
    selectedToolkits: Array.isArray(selectedToolkits) ? selectedToolkits : [],
  });
  const outgoingText = (expansion.body || "").trim();
  const extraToolkits = [
    ...new Set(
      expansion.commands.map((cmd) => cmd.sourceToolkitId).filter(Boolean),
    ),
  ];
  const composer =
    expansion.commands.length > 0
      ? {
          v: COMPOSER_SIDECAR_VERSION,
          rawText,
          commands: expansion.commands.map((cmd) => ({
            name: cmd.name,
            sourceToolkitId:
              typeof cmd.sourceToolkitId === "string"
                ? cmd.sourceToolkitId
                : "",
          })),
          templateLength: expansion.templateLength,
        }
      : null;
  return { outgoingText, extraToolkits, composer };
};

/**
 * Send-time custom-provider fail-closed error codes (thrown by
 * api.unchain.injectCustomProviderIntoPayload before the stream starts) mapped
 * to their actionable-toast i18n keys (C12 / FM15 / design §6.2c).
 *
 *   custom_provider_missing_api_key -> add a key in settings, or reselect
 *   custom_provider_not_found       -> the config was deleted; reselect a model
 *   custom_provider_disabled        -> the provider is off; enable or reselect
 */
const CUSTOM_PROVIDER_SEND_ERROR_KEYS = Object.freeze({
  custom_provider_missing_api_key: {
    title: "chat.custom_provider_error.missing_api_key.title",
    description: "chat.custom_provider_error.missing_api_key.description",
  },
  custom_provider_not_found: {
    title: "chat.custom_provider_error.not_found.title",
    description: "chat.custom_provider_error.not_found.description",
  },
  custom_provider_disabled: {
    title: "chat.custom_provider_error.disabled.title",
    description: "chat.custom_provider_error.disabled.description",
  },
});

/**
 * Fire an actionable toast for a custom-provider send-time error. No-op when
 * the error is not one of the three fail-closed custom-provider codes, so the
 * generic error path still owns everything else. `translate` is the live t()
 * (falls back to returning the key). Returns the matched code or "".
 */
const emitCustomProviderSendErrorToast = (error, translate) => {
  const code = typeof error?.code === "string" ? error.code : "";
  const keys = CUSTOM_PROVIDER_SEND_ERROR_KEYS[code];
  if (!keys) {
    return "";
  }
  const t = typeof translate === "function" ? translate : (key) => key;
  toast.error(t(keys.title), {
    description: t(keys.description),
    dedupeKey: `custom_provider_send_error:${code}`,
  });
  return code;
};

const STREAM_TRACE_LEVEL = "minimal";
const RUNTIME_EVENT_BATCH_FLUSH_MS = 64;
const QUEUE_RELAY_ACCEPTANCE_RECONCILE_MS = 1500;
const QUEUE_RELAY_ACCEPTANCE_MAX_REATTACHES = 2;
const QUEUE_RELAY_AUTHORITATIVE_ACCEPTANCE_EVENTS = Object.freeze([
  "run.started",
  "turn.started",
  "step.started",
]);
const SUBAGENT_STATE_FLUSH_MS = 100;
const DURABLE_RESUME_MAX_RETRIES = 7;
const EXECUTION_CANCEL_DISCONNECT_GRACE_MS = 1500;
const EXECUTION_CANCEL_OUTBOX_RETRY_MS = 5000;
const DURABLE_FRESH_SEND_SEAL_STATUSES = Object.freeze([
  "awaiting_response",
  "receipt_recorded",
]);
const DEFAULT_AGENT_ORCHESTRATION = Object.freeze({ mode: "default" });
const EMPTY_CONFIRMATION_STATE = Object.freeze({});
const UNCHAIN_TRACE_LABEL_BY_TYPE = Object.freeze({
  memory_prepare: "memory_prepare",
  run_started: "start",
  request_messages: "request_messages",
  response_received: "response_received",
  memory_commit: "memory_commit",
  done: "end",
});
const HUMAN_INPUT_TOOL_NAME = "ask_user_question";
const LEGACY_PLAN_RESULT_KEYS = [
  "plan",
  "markdown",
  "artifact",
  "artifacts",
  "proposed_plan",
];

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const resolveQueueRelaySessionOwner = (
  {
    sourceSessionId = "",
    activeSessionId = "",
    runContextSessionId = "",
  } = {},
) => {
  const candidates = [sourceSessionId, activeSessionId, runContextSessionId]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : "";
};

const canSealDurableInteractionForFreshSend = (status) =>
  DURABLE_FRESH_SEND_SEAL_STATUSES.includes(status);

const LIFECYCLE_STOP_REASONS = new Set([
  "app_windows_closed",
  "system_suspend",
]);

const isAuthoritativeQueueAcceptanceEvent = (event) => {
  if (QUEUE_RELAY_AUTHORITATIVE_ACCEPTANCE_EVENTS.includes(event?.type)) {
    return true;
  }
  const stepType = event?.payload?.step_type ?? event?.payload?.stepType;
  return Boolean(
    event?.type === "step.delta" &&
      stepType === "model_response" &&
      typeof event?.payload?.delta === "string" &&
      event.payload.delta.length > 0,
  );
};

const isProvenNeverRegisteredCancellation = (response) => {
  if (response?.state !== "cancelled") {
    return false;
  }
  const cancellationReasons = [
    response?.cancellation?.reason,
    response?.execution?.reason,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    cancellationReasons.some((reason) => LIFECYCLE_STOP_REASONS.has(reason))
  ) {
    return false;
  }
  if (response?.disposition === "cancelled_before_register") {
    return true;
  }
  const execution = response?.execution;
  return Boolean(
    response?.disposition === "unchanged" &&
      isObject(execution) &&
      Object.prototype.hasOwnProperty.call(execution, "registered_at_ms") &&
      execution.registered_at_ms === null,
  );
};

const isPlanDocArtifact = (artifact) =>
  isObject(artifact) && artifact.type === "plan_doc";

const shouldScrubLegacyPlanToolResult = (payload) => {
  if (!isObject(payload) || !isObject(payload.result)) {
    return false;
  }
  const toolName =
    typeof payload.tool_name === "string"
      ? payload.tool_name.trim().toLowerCase()
      : "";
  const result = payload.result;
  return (
    toolName.startsWith("plan_") ||
    isPlanDocArtifact(result.artifact) ||
    (Array.isArray(result.artifacts) &&
      result.artifacts.some((artifact) => isPlanDocArtifact(artifact))) ||
    Object.prototype.hasOwnProperty.call(result, "proposed_plan")
  );
};

const scrubLegacyPlanToolResultFrame = (frame) => {
  if (
    frame?.type !== "tool_result" ||
    !shouldScrubLegacyPlanToolResult(frame.payload)
  ) {
    return frame;
  }
  const result = { ...frame.payload.result };
  for (const key of LEGACY_PLAN_RESULT_KEYS) {
    delete result[key];
  }
  return {
    ...frame,
    payload: {
      ...frame.payload,
      result,
    },
  };
};

const buildToolConfirmationRequest = ({
  frame,
  confirmationId,
  callId,
  toolName,
  requestedAt,
  ownerMessageId,
  chatId,
  sessionId,
}) => ({
  confirmationId,
  callId,
  chatId,
  sessionId,
  toolName,
  toolkitId:
    typeof frame.payload?.toolkit_id === "string"
      ? frame.payload.toolkit_id
      : "",
  toolDisplayName:
    typeof frame.payload?.tool_display_name === "string"
      ? frame.payload.tool_display_name
      : "",
  arguments:
    frame.payload?.arguments && typeof frame.payload.arguments === "object"
      ? frame.payload.arguments
      : {},
  description:
    typeof frame.payload?.description === "string"
      ? frame.payload.description
      : "",
  interactType:
    typeof frame.payload?.interact_type === "string" &&
    frame.payload.interact_type
      ? frame.payload.interact_type
      : "confirmation",
  interactConfig:
    frame.payload?.interact_config &&
    typeof frame.payload.interact_config === "object"
      ? frame.payload.interact_config
      : {},
  requestedAt,
  ownerMessageId:
    typeof ownerMessageId === "string" ? ownerMessageId.trim() : "",
});

const normalizeAgentOrchestration = (value) => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.mode === "string" &&
    ["default", "developer_waiting_approval"].includes(value.mode.trim())
  ) {
    return { mode: value.mode.trim() };
  }
  return { ...DEFAULT_AGENT_ORCHESTRATION };
};

const snapshotStoredRunContext = (store, targetChatId) => {
  const chat = store?.chatsById?.[targetChatId];
  if (!chat || typeof chat !== "object") {
    return null;
  }
  const modelId =
    typeof chat.model === "string"
      ? chat.model.trim()
      : typeof chat.model?.id === "string"
        ? chat.model.id.trim()
        : "";
  const kind = chat.kind === "character" ? "character" : "default";
  const characterId =
    typeof chat.characterId === "string" ? chat.characterId.trim() : "";
  return {
    modelId,
    threadId:
      typeof chat.threadId === "string" && chat.threadId.trim()
        ? chat.threadId.trim()
        : targetChatId,
    selectedToolkits: Array.isArray(chat.selectedToolkits)
      ? [...chat.selectedToolkits]
      : [],
    selectedWorkspaceIds: Array.isArray(chat.selectedWorkspaceIds)
      ? [...chat.selectedWorkspaceIds]
      : [],
    selectedRecipeName:
      typeof chat.selectedRecipeName === "string" &&
      chat.selectedRecipeName.trim()
        ? chat.selectedRecipeName.trim()
        : "Default",
    agentOrchestration: normalizeAgentOrchestration(chat.agentOrchestration),
    systemPromptOverrides:
      chat.systemPromptOverrides &&
      typeof chat.systemPromptOverrides === "object" &&
      !Array.isArray(chat.systemPromptOverrides)
        ? { ...chat.systemPromptOverrides }
        : {},
    kind,
    characterId,
    isCharacterChat: kind === "character" && Boolean(characterId),
  };
};

const getTraceFrameIteration = (frame) => {
  const frameIteration = Number(frame?.iteration);
  if (Number.isFinite(frameIteration)) {
    return frameIteration;
  }

  const payloadIteration = Number(frame?.payload?.iteration);
  return Number.isFinite(payloadIteration) ? payloadIteration : 0;
};

const unchainLogger = createLogger(
  "UNCHAIN",
  "src/PAGEs/chat/hooks/use_chat_stream.js",
);

const characterLogger = createLogger(
  "CHARACTER",
  "src/PAGEs/chat/hooks/use_chat_stream.js",
);

const normalizedExecutionIdentity = (identity) => {
  const ownerChatId =
    typeof identity?.ownerChatId === "string"
      ? identity.ownerChatId.trim()
      : typeof identity?.owner_chat_id === "string"
        ? identity.owner_chat_id.trim()
        : "";
  const sessionId =
    typeof identity?.sessionId === "string" ? identity.sessionId.trim() : "";
  const attemptId =
    typeof identity?.attemptId === "string" ? identity.attemptId.trim() : "";
  if (!sessionId || !attemptId) {
    return null;
  }
  const interactionId =
    typeof identity?.interactionId === "string"
      ? identity.interactionId.trim()
      : typeof identity?.interaction_id === "string"
        ? identity.interaction_id.trim()
        : "";
  return {
    ...identity,
    ownerChatId,
    sessionId,
    attemptId,
    interactionId,
  };
};

/* A renderer can lose its in-memory stream map while the assistant bubble has
   already been durably written.  Stop must still address that exact run: a
   transport disconnect alone leaves the sidecar free to continue a graph
   worker. */
const executionIdentityFromMessages = (chatId, messages) => {
  const ownerChatId = typeof chatId === "string" ? chatId.trim() : "";
  if (!ownerChatId || !Array.isArray(messages)) return null;
  const message = [...messages].reverse().find(
    (candidate) =>
      candidate?.role === "assistant" &&
      typeof candidate?.meta?.attemptId === "string" &&
      candidate.meta.attemptId.trim() &&
      typeof candidate?.meta?.executionSessionId === "string" &&
      candidate.meta.executionSessionId.trim(),
  );
  if (!message) return null;
  return normalizedExecutionIdentity({
    ownerChatId,
    sessionId: message.meta.executionSessionId,
    attemptId: message.meta.attemptId,
    requestId: message.meta.requestId,
    sourceAttemptId: message.meta.sourceAttemptId,
    interactionId: message.meta.interactionId,
  });
};

const inspectExecutionCancellation = (response, identity) => {
  const expected = normalizedExecutionIdentity(identity);
  if (!expected || !response || typeof response !== "object") {
    return { accepted: false, terminal: false };
  }
  const status =
    typeof response.status === "string" ? response.status.trim() : "";
  const executionId =
    typeof (response.execution_id || response.session_id) === "string"
      ? (response.execution_id || response.session_id).trim()
      : "";
  const attemptId =
    typeof response.attempt_id === "string" ? response.attempt_id.trim() : "";
  const state = typeof response.state === "string" ? response.state.trim() : "";
  const accepted =
    ["ok", "cancel_requested", "cancelled"].includes(status) &&
    (!executionId || executionId === expected.sessionId) &&
    (!attemptId || attemptId === expected.attemptId);
  return {
    accepted,
    /* Older trusted preload bridges did not echo execution ids.  Missing ids
       remain compatible, but any conflicting id fails closed.  Only an
       explicit terminal state clears the durable retry tombstone. */
    terminal:
      accepted &&
      (status === "cancelled" ||
        ["cancelled", "completed", "failed"].includes(state)),
  };
};

const disconnectStreamTransport = (handle) => {
  if (handle && typeof handle.disconnect === "function") {
    handle.disconnect();
    return;
  }
  if (handle && typeof handle.cancel === "function") {
    handle.cancel();
  }
};

const requestExecutionCancellationAndDisconnect = ({
  identity,
  handle,
  reason = "user_stop",
  idempotencyKey = "",
}) => {
  let disconnected = false;
  const disconnectOnce = () => {
    if (disconnected) {
      return;
    }
    disconnected = true;
    disconnectStreamTransport(handle);
  };
  const normalizedIdentity = normalizedExecutionIdentity(identity);
  if (
    !normalizedIdentity ||
    !normalizedIdentity.ownerChatId ||
    typeof api.unchain.cancelExecution !== "function"
  ) {
    disconnectOnce();
    return Promise.resolve({ ok: false, response: null });
  }

  const disconnectTimer = setTimeout(
    disconnectOnce,
    EXECUTION_CANCEL_DISCONNECT_GRACE_MS,
  );
  return Promise.resolve(
    api.unchain.cancelExecution({
      owner_chat_id: normalizedIdentity.ownerChatId,
      session_id: normalizedIdentity.sessionId,
      attempt_id: normalizedIdentity.attemptId,
      ...(normalizedIdentity.sourceAttemptId
        ? { source_attempt_id: normalizedIdentity.sourceAttemptId }
        : {}),
      ...(normalizedIdentity.interactionId
        ? { interaction_id: normalizedIdentity.interactionId }
        : {}),
      ...(normalizedIdentity.requestId
        ? { request_id: normalizedIdentity.requestId }
        : {}),
      reason,
      idempotency_key:
        typeof idempotencyKey === "string" && idempotencyKey.trim()
          ? idempotencyKey.trim()
          : `stop:${normalizedIdentity.attemptId}`,
    }),
  ).then((response) => {
    const confirmation = inspectExecutionCancellation(
      response,
      normalizedIdentity,
    );
    return {
      ok: confirmation.accepted,
      terminal: confirmation.terminal,
      response,
    };
  })
    .catch((error) => {
      unchainLogger.warn("execution_cancel_failed", {
        sessionId: normalizedIdentity.sessionId,
        attemptId: normalizedIdentity.attemptId,
        code: error?.code || "execution_cancel_failed",
        message: error?.message || "Failed to cancel execution",
      });
      return { ok: false, response: null };
    })
    .finally(() => {
      clearTimeout(disconnectTimer);
      disconnectOnce();
    });
};

const createChatRenderRuntime = () => ({
  tokenFlushController: null,
  parentRunId: "",
  subagentMetaByRunId: new Map(),
  subagentFramesByRunId: new Map(),
  lastTokenRunId: "",
});

export const useChatStream = ({
  chatId,
  messages,
  setMessages,
  inputValue,
  setInputValue,
  composerRevisionByChatIdRef,
  draftAttachments,
  setDraftAttachments,
  selectedModelId,
  selectedReasoningEffort,
  agentOrchestration,
  selectedToolkits,
  selectedWorkspaceIds,
  selectedRecipeName,
  chatKind = "default",
  characterId = "",
  threadIdRef,
  systemPromptOverrides,
  attachmentApi,
  storageApi,
  streamError: controlledStreamError,
  setStreamError: controlledSetStreamError,
  attachmentsEnabled,
  attachmentsDisabledReason,
  activeChatIdRef,
  messagesRef,
  modelIdRef,
  setSelectedModelId,
  setAgentOrchestration,
  activeStreamsRef,
  streamingMessageStore,
  t,
}) => {
  const {
    buildHistoryForModel,
    clearAttachmentPayloads,
    hydrateAttachmentPayloads,
    resolveAttachmentPayloads,
  } = attachmentApi;
  const [streamingChatIds, setStreamingChatIds] = useState(() => new Set());

  useEffect(() => {
    if (streamingChatIds.size > 0) {
      progressStart(CHAT_STREAM_PROGRESS_ID, "chat_stream");
    } else {
      progressStop(CHAT_STREAM_PROGRESS_ID);
    }
    return () => progressStop(CHAT_STREAM_PROGRESS_ID);
  }, [streamingChatIds]);

  const [internalStreamError, setInternalStreamError] = useState("");
  const streamError =
    controlledStreamError !== undefined
      ? controlledStreamError
      : internalStreamError;
  const setStreamError =
    typeof controlledSetStreamError === "function"
      ? controlledSetStreamError
      : setInternalStreamError;
  const [pendingToolConfirmationRequestsByChatId, setPendingToolConfirmationRequestsByChatId] =
    useState({});
  const pendingToolConfirmationRequestsByChatIdRef = useRef({});
  const [toolConfirmationUiStateByChatId, setToolConfirmationUiStateByChatId] =
    useState({});
  const toolConfirmationUiStateByChatIdRef = useRef({});
  const [durableInteractionByChatId, setDurableInteractionByChatId] =
    useState({});
  const durableInteractionByChatIdRef = useRef({});
  const [
    pendingContinuationRequestsByChatId,
    setPendingContinuationRequestsByChatId,
  ] = useState({});
  const [interjectStateByChatId, setInterjectStateByChatId] = useState({});
  const interjectStateByChatIdRef = useRef({});
  const isCharacterChat =
    chatKind === "character" &&
    typeof characterId === "string" &&
    characterId.trim().length > 0;
  const pendingContinuationRequestsByChatIdRef = useRef({});

  /* Stable refs for high-churn values — keeps sendNewTurn callback stable */
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const draftAttachmentsRef = useRef(draftAttachments);
  draftAttachmentsRef.current = draftAttachments;
  const selectedModelIdRef = useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;
  const selectedReasoningEffortRef = useRef(selectedReasoningEffort);
  selectedReasoningEffortRef.current = selectedReasoningEffort;
  const selectedToolkitsRef = useRef(selectedToolkits);
  selectedToolkitsRef.current = selectedToolkits;
  /* Live translator ref so send-time toasts localize without perturbing the
     large sendNewTurn useCallback deps. Falls back to the key itself when no
     t is supplied (parity with useTranslation's last-resort behavior). */
  const tRef = useRef(null);
  tRef.current = typeof t === "function" ? t : (key) => key;

  const commitForegroundMessages = useCallback(
    (targetChatId, nextMessages) => {
      if (!targetChatId || activeChatIdRef.current !== targetChatId) {
        return false;
      }
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      return true;
    },
    [activeChatIdRef, messagesRef, setMessages],
  );

  const setStreamErrorForChat = useCallback(
    (targetChatId, nextError) => {
      if (targetChatId && activeChatIdRef.current === targetChatId) {
        setStreamError(nextError);
      }
    },
    [activeChatIdRef, setStreamError],
  );

  const updatePendingContinuationRequestForChat = useCallback(
    (targetChatId, nextValue) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return;
      }

      const previous =
        pendingContinuationRequestsByChatIdRef.current[normalizedChatId] || null;
      const resolved =
        typeof nextValue === "function" ? nextValue(previous) : nextValue;
      const nextRequests = {
        ...pendingContinuationRequestsByChatIdRef.current,
      };
      if (resolved) {
        nextRequests[normalizedChatId] = resolved;
      } else {
        delete nextRequests[normalizedChatId];
      }
      pendingContinuationRequestsByChatIdRef.current = nextRequests;
      setPendingContinuationRequestsByChatId(nextRequests);
    },
    [],
  );

  const streamHandlesRef = useRef(new Map());
  const executionIdentityByChatIdRef = useRef(new Map());
  const fallbackStreamingMessageStoreRef = useRef(null);
  if (!fallbackStreamingMessageStoreRef.current) {
    fallbackStreamingMessageStoreRef.current = createStreamingMessageStore();
  }
  const activeStreamingMessageStore =
    streamingMessageStore || fallbackStreamingMessageStoreRef.current;
  const hookMountedRef = useRef(true);
  const initialTurnMutationOutboxRef = useRef(null);
  if (!initialTurnMutationOutboxRef.current) {
    initialTurnMutationOutboxRef.current = readTurnMutationOutboxState();
    initialTurnMutationOutboxRef.current.entries.forEach((entry) => {
      if (
        entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.QUARANTINED
      ) {
        return;
      }
      const existingOwner = activeTurnMutationsByChatId.get(entry.chatId);
      if (
        !existingOwner ||
        (existingOwner.operationId === entry.operationId &&
          existingOwner.mountedRef?.current === false)
      ) {
        activeTurnMutationsByChatId.set(entry.chatId, {
          chatId: entry.chatId,
          operationId: entry.operationId,
          mountedRef: hookMountedRef,
          recovery: true,
        });
      }
    });
  }
  const [turnMutationVersion, setTurnMutationVersion] = useState(0);
  const [turnMutationPresentationByMessageId, setTurnMutationPresentationByMessageId] =
    useState({});
  const streamingChatIdsRef = useRef(new Set());
  const runPreflightGenerationByChatIdRef = useRef(new Map());
  const turnMutationByChatIdRef = useRef(activeTurnMutationsByChatId);
  /* A live in-progress response gets no timer. Mark it for this mount so the
     ownership-change render cannot immediately replay it; a later remount may
     make one fresh check after the server-side live guard has cleared. */
  const turnMutationInProgressSeenRef = useRef(new Set());
  const turnMutationStalledAttemptSeenRef = useRef(new Set());
  /* Legacy V1 rows predate the durable Context V2 retry contract. Keep their
     existing bounded recovery cadence so this V2 rollout does not change
     replaceSessionMemory conflict behavior. */
  const legacyTurnMutationRecoveryAttemptsRef = useRef(new Map());
  const sessionAutoApproveRef = useRef(new Map()); // chatId -> Set<"toolkitId:toolName">, cleared on unmount
  const confirmationRuntimeByChatIdRef = useRef(new Map());
  const durableInteractionLookupByChatIdRef = useRef(new Map());
  const reattachingChatIdsRef = useRef(new Set());
  const runContextByChatIdRef = useRef(new Map());
  const durableResumeStartedKeysRef = useRef(new Set());
  const durableResumeStartedKeysByChatIdRef = useRef(new Map());
  const durableResumeRetryTimersRef = useRef(new Map());
  const runGenerationByChatIdRef = useRef(new Map());
  const stoppedRunChatIdsRef = useRef(new Set());
  const queueRelayTimersByChatIdRef = useRef(new Map());
  const queueRelayAttemptsByChatIdRef = useRef(new Map());
  const queueAttemptIdByChatIdRef = useRef(new Map());
  const queueClientOperationIdByChatIdRef = useRef(new Map());
  const runClientOperationIdByChatIdRef = useRef(new Map());
  const relayQueuedTurnsAfterRunRef = useRef(null);
  const confirmationRetryWaitersByChatIdRef = useRef(new Map());
  const renderRuntimeByChatIdRef = useRef(new Map());
  // Interject (mid-run "fyi"/"btw"/"queue"/"clarify") bookkeeping — all keyed
  // by chatId so multiple chats never cross-talk.
  const activeRunThreadIdByChatIdRef = useRef(new Map()); // chatId -> threadId the active run actually used (character chats use a session_id, not chatId)
  const queuedTurnsByChatIdRef = useRef(new Map()); // chatId -> createQueuedTurnBuffer() instance for that chat's active run
  const pendingFyiCountByChatIdRef = useRef(new Map()); // chatId -> count of fyi interjects sent but not yet confirmed injected
  const pendingClarifyByChatIdRef = useRef(new Map()); // chatId -> {id, text} awaiting the user's channel choice
  const clarifyBtwBarrierByChatIdRef = useRef(new Map()); // chatId -> exact clarify-owned BTW awaiting settlement
  const handleInterjectRef = useRef(null); // breaks the sendNewTurn <-> handleInterject declaration cycle

  const isChatRunPending = useCallback(
    (targetChatId) =>
      Boolean(
        targetChatId &&
          (streamingChatIdsRef.current.has(targetChatId) ||
            runPreflightGenerationByChatIdRef.current.has(targetChatId) ||
            turnMutationByChatIdRef.current.has(targetChatId)),
      ),
    [],
  );

  useEffect(() => {
    hookMountedRef.current = true;
    const listener = () => {
      if (hookMountedRef.current) {
        setTurnMutationVersion((version) => version + 1);
      }
    };
    turnMutationListeners.add(listener);
    return () => {
      hookMountedRef.current = false;
      turnMutationListeners.delete(listener);
      const outboxSnapshot = readTurnMutationOutboxState();
      if (!outboxSnapshot.available) return;
      const durableOperations = new Set(
        outboxSnapshot.entries.map((entry) => entry.operationId),
      );
      for (const [ownerChatId, owner] of activeTurnMutationsByChatId) {
        if (
          owner.mountedRef === hookMountedRef &&
          !durableOperations.has(owner.operationId)
        ) {
          activeTurnMutationsByChatId.delete(ownerChatId);
          notifyTurnMutationChange(ownerChatId);
        }
      }
    };
  }, []);

  /* The resend affordance is deliberately optimistic, but it must not get
     stuck if the durable turn-mutation entry finishes, retries, or is removed
     by recovery in another render.  The outbox remains the source of truth;
     this only mirrors its state for immediate UI feedback. */
  useEffect(() => {
    const currentChatId =
      typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
    const entriesByTargetMessageId = new Map(
      readTurnMutationOutbox()
        .filter(
          (entry) =>
            entry.chatId === currentChatId &&
            entry.kind === "resend" &&
            typeof entry.targetMessageId === "string" &&
            entry.targetMessageId.trim(),
        )
        .map((entry) => [entry.targetMessageId, entry]),
    );
    setTurnMutationPresentationByMessageId((previous) => {
      const next = {};
      let changed = false;
      for (const [messageId, presentation] of Object.entries(previous)) {
        const entry = entriesByTargetMessageId.get(messageId);
        if (
          !entry &&
          presentation?.phase === "Waiting for the previous run to finish…"
        ) {
          changed = true;
          continue;
        }
        if (!entry) {
          next[messageId] = presentation;
          continue;
        }
        const phase =
          entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.IN_PROGRESS
            ? "Waiting for the previous run to finish…"
            : presentation?.phase;
        next[messageId] = { ...presentation, phase };
        if (phase !== presentation?.phase) changed = true;
      }
      return changed ? next : previous;
    });
  }, [chatId, turnMutationVersion]);

  const runContextOwnerChatId =
    typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
  if (runContextOwnerChatId) {
    runContextByChatIdRef.current.set(runContextOwnerChatId, {
      modelId:
        typeof modelIdRef?.current === "string" ? modelIdRef.current : "",
      threadId:
        typeof threadIdRef?.current === "string" ? threadIdRef.current : "",
      selectedToolkits: Array.isArray(selectedToolkits)
        ? [...selectedToolkits]
        : [],
      selectedWorkspaceIds: Array.isArray(selectedWorkspaceIds)
        ? [...selectedWorkspaceIds]
        : [],
      selectedRecipeName:
        typeof selectedRecipeName === "string" && selectedRecipeName.trim()
          ? selectedRecipeName.trim()
          : "Default",
      agentOrchestration: normalizeAgentOrchestration(agentOrchestration),
      systemPromptOverrides:
        systemPromptOverrides &&
        typeof systemPromptOverrides === "object" &&
        !Array.isArray(systemPromptOverrides)
          ? { ...systemPromptOverrides }
          : {},
      kind: isCharacterChat ? "character" : "default",
      characterId:
        typeof characterId === "string" ? characterId.trim() : "",
      isCharacterChat,
    });
  }

  /* ── Memory V2 P0 renderer secret gate ────────────────────────────────────
     Every outgoing text passes through this before ANY side effect. The hook
     owns the plaintext (private ref) and the modal state; this file only ever
     sees a decision plus a one-time token. See use_secret_capture_gate.js. */
  const {
    gate: secretCaptureGate,
    isSecretCapturePending,
    evaluateSecretGate,
    consumeSecretGateToken,
    mintTokenForDisposition,
    setScopeChoice: setSecretCaptureScope,
    confirmStore: confirmSecretCaptureStore,
    confirmPlain: confirmSecretCapturePlain,
    cancelGate: cancelSecretCapture,
  } = useSecretCaptureGate({ activeChatId: chatId });

  /**
   * Run the gate for one outgoing text and translate the decision into the
   * shape the send paths need.
   *
   * Returns null when the caller must stop (cancelled, refused, or a scan
   * error — the static message has already been surfaced), otherwise
   * { text, token } where `text` is what may actually be sent.
   */
  const resolveSecretGateForSend = useCallback(
    async ({ chatId: targetChatId, text, interactive }) => {
      const decision = await evaluateSecretGate({
        chatId: targetChatId,
        text,
        interactive,
      });
      if (decision.status === SECRET_GATE_DECISIONS.CLEAN) {
        return { text: decision.text, token: "" };
      }
      if (
        decision.status === SECRET_GATE_DECISIONS.STORED ||
        decision.status === SECRET_GATE_DECISIONS.PLAIN
      ) {
        return {
          text: decision.text,
          token: decision.token,
          disposition:
            decision.status === SECRET_GATE_DECISIONS.PLAIN
              ? PLAIN_USER_APPROVED_DISPOSITION
              : "",
        };
      }
      if (decision.status === SECRET_GATE_DECISIONS.ERROR) {
        /* Static text only. decision.message is drawn from the frozen
           SECRET_CAPTURE_MESSAGES table and never interpolates user input. */
        setStreamErrorForChat(targetChatId, decision.message);
      }
      /* CANCELLED is silent by design: the user already knows they cancelled,
         and the composer still holds their text. */
      return null;
    },
    [evaluateSecretGate, setStreamErrorForChat],
  );

  /* ── Memory V2 P0 migration: drop pre-gate plaintext from the outbox ──────
     Queue / clarify / FYI entries written before the gate existed can hold a
     plain-text credential in localStorage. They are DELETED, not quarantined:
     leaving the plaintext under a "quarantined" flag would preserve exactly
     the exposure this gate exists to remove. The user is told only through a
     STATIC message that names nothing about the removed content.

     Declared here — ahead of every outbox-hydration effect below — so no
     purged entry can be hydrated into a live buffer first. */
  const legacySecretPurgeDoneRef = useRef(false);
  useEffect(() => {
    if (legacySecretPurgeDoneRef.current) return;
    legacySecretPurgeDoneRef.current = true;
    let purged = null;
    try {
      purged = purgeUngatedSecretOutboxEntries(
        (text) =>
          hasSecretCaptureSyntax(text) || detectLikelySecretAssignment(text),
      );
    } catch (_error) {
      /* Storage unavailable / unparsable. Nothing was hydrated either. */
      return;
    }
    const removed =
      (purged?.removedQueueItems || 0) +
      (purged?.removedClarifies || 0) +
      (purged?.removedFyis || 0);
    if (removed === 0) return;
    for (const purgedChatId of purged.chatIds || []) {
      setStreamErrorForChat(
        purgedChatId,
        SECRET_CAPTURE_MESSAGES.secret_capture_legacy_queue_dropped,
      );
    }
    toast.info(SECRET_CAPTURE_MESSAGES.secret_capture_legacy_queue_dropped, {
      dedupeKey: "secret-capture-legacy-outbox-purge",
    });
  }, [setStreamErrorForChat]);

  const beginRunGeneration = useCallback((targetChatId) => {
    const normalizedChatId =
      typeof targetChatId === "string" ? targetChatId.trim() : "";
    if (!normalizedChatId) {
      return 0;
    }
    const nextGeneration =
      (runGenerationByChatIdRef.current.get(normalizedChatId) || 0) + 1;
    runGenerationByChatIdRef.current.set(normalizedChatId, nextGeneration);
    stoppedRunChatIdsRef.current.delete(normalizedChatId);
    return nextGeneration;
  }, []);

  const getRunGeneration = useCallback((targetChatId) => {
    const normalizedChatId =
      typeof targetChatId === "string" ? targetChatId.trim() : "";
    return normalizedChatId
      ? runGenerationByChatIdRef.current.get(normalizedChatId) || 0
      : 0;
  }, []);

  const ensureRecoveryRunGeneration = useCallback((targetChatId) => {
    const normalizedChatId =
      typeof targetChatId === "string" ? targetChatId.trim() : "";
    if (
      !normalizedChatId ||
      stoppedRunChatIdsRef.current.has(normalizedChatId)
    ) {
      return 0;
    }
    const currentGeneration =
      runGenerationByChatIdRef.current.get(normalizedChatId) || 0;
    if (currentGeneration > 0) {
      return currentGeneration;
    }
    runGenerationByChatIdRef.current.set(normalizedChatId, 1);
    return 1;
  }, []);

  const isRunGenerationCurrent = useCallback(
    (targetChatId, runGeneration) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      return Boolean(
        normalizedChatId &&
          Number.isInteger(runGeneration) &&
          runGeneration > 0 &&
          !stoppedRunChatIdsRef.current.has(normalizedChatId) &&
          runGenerationByChatIdRef.current.get(normalizedChatId) ===
            runGeneration,
      );
    },
    [],
  );

  const invalidateRunGeneration = useCallback((targetChatId) => {
    const normalizedChatId =
      typeof targetChatId === "string" ? targetChatId.trim() : "";
    if (!normalizedChatId) {
      return 0;
    }
    const nextGeneration =
      (runGenerationByChatIdRef.current.get(normalizedChatId) || 0) + 1;
    runGenerationByChatIdRef.current.set(normalizedChatId, nextGeneration);
    stoppedRunChatIdsRef.current.add(normalizedChatId);
    return nextGeneration;
  }, []);

  const clearQueueRelayTimersForChat = useCallback((targetChatId) => {
    const timers = queueRelayTimersByChatIdRef.current.get(targetChatId);
    timers?.forEach((timerId) => clearTimeout(timerId));
    queueRelayTimersByChatIdRef.current.delete(targetChatId);
    queueRelayAttemptsByChatIdRef.current.delete(targetChatId);
  }, []);

  const scheduleQueueRelayTimer = useCallback(
    (targetChatId, runGeneration, callback, delayMs) => {
      if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
        return null;
      }
      let timers = queueRelayTimersByChatIdRef.current.get(targetChatId);
      if (!timers) {
        timers = new Set();
        queueRelayTimersByChatIdRef.current.set(targetChatId, timers);
      }
      let timerId = null;
      timerId = setTimeout(() => {
        const currentTimers =
          queueRelayTimersByChatIdRef.current.get(targetChatId);
        currentTimers?.delete(timerId);
        if (currentTimers?.size === 0) {
          queueRelayTimersByChatIdRef.current.delete(targetChatId);
        }
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
          return;
        }
        callback();
      }, delayMs);
      timers.add(timerId);
      return timerId;
    },
    [isRunGenerationCurrent],
  );

  const scheduleQueueRelayRetryTimer = useCallback(
    (targetChatId, callback, delayMs) => {
      let timers = queueRelayTimersByChatIdRef.current.get(targetChatId);
      if (!timers) {
        timers = new Set();
        queueRelayTimersByChatIdRef.current.set(targetChatId, timers);
      }
      let timerId = null;
      timerId = setTimeout(() => {
        const currentTimers =
          queueRelayTimersByChatIdRef.current.get(targetChatId);
        currentTimers?.delete(timerId);
        if (currentTimers?.size === 0) {
          queueRelayTimersByChatIdRef.current.delete(targetChatId);
        }
        callback();
      }, delayMs);
      timers.add(timerId);
      return timerId;
    },
    [],
  );

  const clearConfirmationRetryWaitersForChat = useCallback((targetChatId) => {
    const waiters =
      confirmationRetryWaitersByChatIdRef.current.get(targetChatId);
    waiters?.forEach((waiter) => {
      clearTimeout(waiter.timerId);
      waiter.resolve(false);
    });
    confirmationRetryWaitersByChatIdRef.current.delete(targetChatId);
  }, []);

  const waitForConfirmationRetry = useCallback(
    (targetChatId, runGeneration, delayMs) =>
      new Promise((resolve) => {
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
          resolve(false);
          return;
        }
        let waiters =
          confirmationRetryWaitersByChatIdRef.current.get(targetChatId);
        if (!waiters) {
          waiters = new Set();
          confirmationRetryWaitersByChatIdRef.current.set(targetChatId, waiters);
        }
        const waiter = { timerId: null, resolve };
        waiter.timerId = setTimeout(() => {
          const currentWaiters =
            confirmationRetryWaitersByChatIdRef.current.get(targetChatId);
          currentWaiters?.delete(waiter);
          if (currentWaiters?.size === 0) {
            confirmationRetryWaitersByChatIdRef.current.delete(targetChatId);
          }
          resolve(isRunGenerationCurrent(targetChatId, runGeneration));
        }, delayMs);
        waiters.add(waiter);
      }),
    [isRunGenerationCurrent],
  );

  const clearDurableResumeStartedKeysForChat = useCallback((targetChatId) => {
    const keys =
      durableResumeStartedKeysByChatIdRef.current.get(targetChatId);
    keys?.forEach((resumeKey) => {
      durableResumeStartedKeysRef.current.delete(resumeKey);
    });
    durableResumeStartedKeysByChatIdRef.current.delete(targetChatId);
  }, []);

  const getConfirmationRuntimeForChat = useCallback(
    (targetChatId, { create = true } = {}) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return null;
      }

      let runtime = confirmationRuntimeByChatIdRef.current.get(normalizedChatId);
      if (!runtime && create) {
        runtime = {
          confirmationIdByCallId: new Map(),
          confirmationCallIdById: new Map(),
          sessionIdByConfirmationId: new Map(),
          followupSignalById: new Map(),
          resolveTimerById: new Map(),
        };
        confirmationRuntimeByChatIdRef.current.set(normalizedChatId, runtime);
      }
      return runtime || null;
    },
    [],
  );

  const buildCharacterRunConfig = useCallback(
    async (threadIdOverride = "") => {
      if (!isCharacterChat) {
        return null;
      }

      const resolvedThreadId =
        typeof threadIdOverride === "string" && threadIdOverride.trim()
          ? threadIdOverride.trim()
          : typeof threadIdRef?.current === "string" &&
              threadIdRef.current.trim()
            ? threadIdRef.current.trim()
            : "main";

      const config = await api.unchain.buildCharacterAgentConfig({
        characterId,
        threadId: resolvedThreadId,
        humanId: "local_user",
      });
      return config && typeof config === "object" ? config : null;
    },
    [characterId, isCharacterChat, threadIdRef],
  );

  const findToolCallFrameByCallId = useCallback(
    (targetChatId, callId) => {
      const normalizedCallId = typeof callId === "string" ? callId.trim() : "";
      if (!normalizedCallId) {
        return null;
      }

      const normalizedChatId =
        typeof targetChatId === "string" && targetChatId.trim()
          ? targetChatId.trim()
          : activeChatIdRef.current;
      const streamState = activeStreamsRef.current.get(normalizedChatId);
      const streamMessages = Array.isArray(streamState?.messages)
        ? streamState.messages
        : activeChatIdRef.current === normalizedChatId &&
            Array.isArray(messagesRef.current)
          ? messagesRef.current
          : [];

      for (const message of streamMessages) {
        const traceFrames = Array.isArray(message?.traceFrames)
          ? message.traceFrames
          : [];
        const rootFrame = traceFrames.find(
          (candidate) =>
            candidate?.type === "tool_call" &&
            typeof candidate.payload?.call_id === "string" &&
            candidate.payload.call_id.trim() === normalizedCallId,
        );
        if (rootFrame) {
          return rootFrame;
        }

        const subagentFrames =
          message?.subagentFrames && typeof message.subagentFrames === "object"
            ? message.subagentFrames
            : {};
        for (const frames of Object.values(subagentFrames)) {
          if (!Array.isArray(frames)) continue;
          const subagentFrame = frames.find(
            (candidate) =>
              candidate?.type === "tool_call" &&
              typeof candidate.payload?.call_id === "string" &&
              candidate.payload.call_id.trim() === normalizedCallId,
          );
          if (subagentFrame) {
            return subagentFrame;
          }
        }
      }

      return null;
    },
    [activeChatIdRef, activeStreamsRef, messagesRef],
  );

  const isStreaming = streamingChatIds.has(chatId);
  const hasBackgroundStream =
    streamingChatIds.size > 0 && !streamingChatIds.has(chatId);
  const pendingToolConfirmationRequests =
    pendingToolConfirmationRequestsByChatId[chatId] || EMPTY_CONFIRMATION_STATE;
  const toolConfirmationUiStateById =
    toolConfirmationUiStateByChatId[chatId] || EMPTY_CONFIRMATION_STATE;
  const durableInteractionState = durableInteractionByChatId[chatId] || null;
  const pendingContinuationRequest =
    pendingContinuationRequestsByChatId[chatId] || null;
  const durableInteractionStatus =
    typeof durableInteractionState?.status === "string"
      ? durableInteractionState.status
      : "";
  const isDurableInteractionBlocked = Boolean(durableInteractionStatus);
  const turnMutationOutboxSnapshot = readTurnMutationOutboxState();
  const heldTurnMutationEntry = turnMutationOutboxSnapshot.entries.find(
    (entry) =>
      entry.chatId === chatId &&
      entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.QUARANTINED,
  );
  const turnMutationHold = heldTurnMutationEntry
    ? {
        operationId: heldTurnMutationEntry.operationId,
        kind: heldTurnMutationEntry.kind,
        canDiscard: !heldTurnMutationEntry.v2Ack,
        message: CONTEXT_V2_TURN_MUTATION_MESSAGES.QUARANTINED,
      }
    : null;
  const isTurnMutationBlocked = Boolean(
    chatId &&
      (!turnMutationOutboxSnapshot.available ||
        turnMutationByChatIdRef.current.has(chatId) ||
        runPreflightGenerationByChatIdRef.current.has(chatId) ||
        turnMutationOutboxSnapshot.entries.some(
          (entry) => entry.chatId === chatId,
        )),
  );

  const retryTurnMutation = useCallback(
    (operationId) => {
      const snapshot = readTurnMutationOutboxState();
      const target = snapshot.entries.find(
        (entry) =>
          entry.operationId === operationId &&
          entry.chatId === activeChatIdRef.current &&
          entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.QUARANTINED,
      );
      if (!target || !clearTurnMutationRetryState(operationId)) return false;
      turnMutationInProgressSeenRef.current.delete(operationId);
      turnMutationStalledAttemptSeenRef.current.delete(operationId);
      setStreamErrorForChat(target.chatId, "");
      setTurnMutationVersion((version) => version + 1);
      return true;
    },
    [activeChatIdRef, setStreamErrorForChat],
  );

  const discardTurnMutation = useCallback(
    (operationId) => {
      const snapshot = readTurnMutationOutboxState();
      const target = snapshot.entries.find(
        (entry) =>
          entry.operationId === operationId &&
          entry.chatId === activeChatIdRef.current &&
          entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.QUARANTINED,
      );
      if (!target || target.v2Ack) return false;
      /* Restore first, delete second. Preserve any newer composer draft and
         make a failed/repeated delete idempotent so neither text is lost or
         duplicated. Delete mutations carry no text and therefore leave the
         composer untouched. */
      const currentDraft = inputValueRef.current;
      const nextDraft = mergeDiscardedTurnMutationText(
        currentDraft,
        target.text,
      );
      if (nextDraft !== currentDraft) {
        if (typeof setInputValue !== "function") return false;
        inputValueRef.current = nextDraft;
        setInputValue(nextDraft);
      }
      if (!removeTurnMutation(operationId)) return false;
      turnMutationInProgressSeenRef.current.delete(operationId);
      turnMutationStalledAttemptSeenRef.current.delete(operationId);
      const owner = turnMutationByChatIdRef.current.get(target.chatId);
      if (owner?.operationId === operationId) releaseTurnMutation(owner);
      setStreamErrorForChat(target.chatId, "");
      setTurnMutationVersion((version) => version + 1);
      return true;
    },
    [activeChatIdRef, setInputValue, setStreamErrorForChat],
  );
  const canStop =
    isStreaming ||
    [
      "awaiting",
      "awaiting_response",
      "checking",
      "receipt_recorded",
      "resuming",
      "retry_wait",
      "resume_failed",
    ].includes(durableInteractionStatus);

  const clearActiveTokenFlushController = useCallback(
    (targetChatId, mode = "dispose") => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return;
      }
      const renderRuntime =
        renderRuntimeByChatIdRef.current.get(normalizedChatId);
      const controller = renderRuntime?.tokenFlushController;
      if (!controller) {
        return;
      }

      if (mode === "flush" && typeof controller.flushNow === "function") {
        controller.flushNow();
      }

      if (typeof controller.dispose === "function") {
        controller.dispose();
      }

      if (renderRuntime.tokenFlushController === controller) {
        renderRuntime.tokenFlushController = null;
      }
    },
    [],
  );

  const flushStreamingMessageStore = useCallback(
    (targetChatId, assistantMessageId) => {
      if (
        activeStreamingMessageStore &&
        typeof activeStreamingMessageStore.flushNow === "function"
      ) {
        activeStreamingMessageStore.flushNow({
          chatId: targetChatId,
          messageId: assistantMessageId,
        });
      }
    },
    [activeStreamingMessageStore],
  );

  const materializeStreamingMessages = useCallback(
    (targetChatId, sourceMessages) => {
      if (
        activeStreamingMessageStore &&
        typeof activeStreamingMessageStore.materializeMessages === "function"
      ) {
        return activeStreamingMessageStore.materializeMessages({
          chatId: targetChatId,
          messages: sourceMessages,
        });
      }
      return Array.isArray(sourceMessages) ? sourceMessages : [];
    },
    [activeStreamingMessageStore],
  );

  const clearStreamingMessageStore = useCallback(
    (targetChatId, assistantMessageId) => {
      if (
        activeStreamingMessageStore &&
        typeof activeStreamingMessageStore.clear === "function"
      ) {
        activeStreamingMessageStore.clear({
          chatId: targetChatId,
          messageId: assistantMessageId,
        });
      }
    },
    [activeStreamingMessageStore],
  );

  const updateToolConfirmationUiState = useCallback(
    (targetChatId, updater) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return EMPTY_CONFIRMATION_STATE;
      }

      const previousByChatId = toolConfirmationUiStateByChatIdRef.current;
      const previous =
        previousByChatId[normalizedChatId] || EMPTY_CONFIRMATION_STATE;
      const updated =
        typeof updater === "function" ? updater(previous) : updater;
      const next =
        updated && typeof updated === "object"
          ? updated
          : EMPTY_CONFIRMATION_STATE;
      if (next === previous) {
        return previous;
      }

      const nextByChatId = { ...previousByChatId };
      if (Object.keys(next).length > 0) {
        nextByChatId[normalizedChatId] = next;
      } else {
        delete nextByChatId[normalizedChatId];
      }
      toolConfirmationUiStateByChatIdRef.current = nextByChatId;
      setToolConfirmationUiStateByChatId(nextByChatId);
      return next;
    },
    [],
  );

  const updatePendingToolConfirmationRequests = useCallback(
    (targetChatId, updater) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return EMPTY_CONFIRMATION_STATE;
      }

      const previousByChatId =
        pendingToolConfirmationRequestsByChatIdRef.current;
      const previous =
        previousByChatId[normalizedChatId] || EMPTY_CONFIRMATION_STATE;
      const updated =
        typeof updater === "function" ? updater(previous) : updater;
      const next =
        updated && typeof updated === "object"
          ? updated
          : EMPTY_CONFIRMATION_STATE;
      if (next === previous) {
        return previous;
      }

      const nextByChatId = { ...previousByChatId };
      if (Object.keys(next).length > 0) {
        nextByChatId[normalizedChatId] = next;
      } else {
        delete nextByChatId[normalizedChatId];
      }
      pendingToolConfirmationRequestsByChatIdRef.current = nextByChatId;
      setPendingToolConfirmationRequestsByChatId(nextByChatId);
      return next;
    },
    [],
  );

  const updateDurableInteractionForChat = useCallback(
    (targetChatId, updater) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return null;
      }
      const previousByChatId = durableInteractionByChatIdRef.current;
      const previous = previousByChatId[normalizedChatId] || null;
      const next = typeof updater === "function" ? updater(previous) : updater;
      if (next === previous) {
        return previous;
      }
      const nextByChatId = { ...previousByChatId };
      if (next && typeof next === "object") {
        nextByChatId[normalizedChatId] = next;
      } else {
        delete nextByChatId[normalizedChatId];
      }
      durableInteractionByChatIdRef.current = nextByChatId;
      setDurableInteractionByChatId(nextByChatId);
      return next;
    },
    [],
  );

  const updateInterjectStateByChatId = useCallback((updater) => {
    const previous = interjectStateByChatIdRef.current;
    const next = typeof updater === "function" ? updater(previous) : updater;
    if (next === previous) {
      return previous;
    }
    interjectStateByChatIdRef.current = next;
    setInterjectStateByChatId(next);
    return next;
  }, []);

  /* Snapshots the current queued-turns buffer + pending-fyi count for
     targetChatId into React state so the queue pile/UI can render it. Called
     explicitly (not derived on every render) so a "relayed" status can be
     shown for one render before the buffer is actually cleared — see the
     onDone queue relay below. */
  const syncInterjectStateForChat = useCallback(
    (targetChatId) => {
      const queuedTurns = queuedTurnsByChatIdRef.current.get(targetChatId);
      const pendingFyiCount =
        pendingFyiCountByChatIdRef.current.get(targetChatId) || 0;
      const queueItems = queuedTurns ? queuedTurns.list() : [];
      updateInterjectStateByChatId((previous) => ({
        ...previous,
        [targetChatId]: { pendingFyiCount, queueItems },
      }));
    },
    [updateInterjectStateByChatId],
  );

  const syncPendingFyiStateForAttempt = useCallback(
    (targetChatId, attemptId) => {
      const pending = readPendingFyisForAttempt(targetChatId, attemptId);
      if (pending.length > 0) {
        pendingFyiCountByChatIdRef.current.set(
          targetChatId,
          pending.length,
        );
      } else {
        pendingFyiCountByChatIdRef.current.delete(targetChatId);
      }
      syncInterjectStateForChat(targetChatId);
      return pending;
    },
    [syncInterjectStateForChat],
  );

  const fallbackPendingFyisForAttempt = useCallback(
    (targetChatId, attemptId) => {
      const pending = readPendingFyisForAttempt(targetChatId, attemptId);
      if (pending.length === 0) {
        syncPendingFyiStateForAttempt(targetChatId, attemptId);
        return { queue: null, migrated: [] };
      }
      const migrated = migratePendingFyiForAttemptToQueue(
        targetChatId,
        attemptId,
      );
      if (!migrated) {
        setStreamErrorForChat(
          targetChatId,
          "The pending FYI is still saved and will be recovered after reload.",
        );
        syncPendingFyiStateForAttempt(targetChatId, attemptId);
        return null;
      }
      let queuedTurns = queuedTurnsByChatIdRef.current.get(targetChatId);
      if (!queuedTurns) {
        queuedTurns = createQueuedTurnBuffer(migrated.queue.items);
        queuedTurnsByChatIdRef.current.set(targetChatId, queuedTurns);
      } else {
        queuedTurns.hydrate(migrated.queue.items);
      }
      queueAttemptIdByChatIdRef.current.set(targetChatId, attemptId);
      queueClientOperationIdByChatIdRef.current.delete(targetChatId);
      syncPendingFyiStateForAttempt(targetChatId, attemptId);
      return migrated;
    },
    [setStreamErrorForChat, syncPendingFyiStateForAttempt],
  );

  const syncDurableQueueForAttempt = useCallback(
    (targetChatId, attemptId, queue) => {
      const exactAttemptId =
        typeof attemptId === "string" ? attemptId.trim() : "";
      if (!targetChatId || !exactAttemptId) return false;
      const items = Array.isArray(queue?.items)
        ? queue.items.filter((item) => item?.status === "queued")
        : [];
      if (items.length > 0) {
        let queuedTurns = queuedTurnsByChatIdRef.current.get(targetChatId);
        if (!queuedTurns) {
          queuedTurns = createQueuedTurnBuffer(items);
          queuedTurnsByChatIdRef.current.set(targetChatId, queuedTurns);
        } else {
          queuedTurns.hydrate(items);
        }
        queueAttemptIdByChatIdRef.current.set(targetChatId, exactAttemptId);
        queueClientOperationIdByChatIdRef.current.delete(targetChatId);
      } else if (
        queueAttemptIdByChatIdRef.current.get(targetChatId) === exactAttemptId
      ) {
        queuedTurnsByChatIdRef.current.delete(targetChatId);
        queueAttemptIdByChatIdRef.current.delete(targetChatId);
      }
      syncPendingFyiStateForAttempt(targetChatId, exactAttemptId);
      return true;
    },
    [syncPendingFyiStateForAttempt],
  );

  const acknowledgeInjectedFyisForAttempt = useCallback(
    (targetChatId, attemptId, messages) => {
      let queueChanged = false;
      let latestQueue = null;
      for (const entry of Array.isArray(messages) ? messages : []) {
        const messageId =
          typeof entry?.message_id === "string"
            ? entry.message_id.trim()
            : typeof entry?.messageId === "string"
              ? entry.messageId.trim()
              : "";
        if (!messageId) continue;
        const resolved = resolvePendingFyiIntent({
          chatId: targetChatId,
          attemptId,
          messageId,
        });
        if (resolved) {
          queueChanged = queueChanged || resolved.removedQueuedFallback;
          latestQueue = resolved.queue || null;
        }
      }
      if (queueChanged) {
        syncDurableQueueForAttempt(targetChatId, attemptId, latestQueue);
      } else {
        syncPendingFyiStateForAttempt(targetChatId, attemptId);
      }
    },
    [syncDurableQueueForAttempt, syncPendingFyiStateForAttempt],
  );

  const persistQueuedTurnBufferForAttempt = useCallback(
    (
      targetChatId,
      queuedTurns,
      explicitAttemptId = "",
      explicitClientOperationId = "",
      { preserveRelayed = true } = {},
    ) => {
      const attemptId =
        (typeof explicitAttemptId === "string"
          ? explicitAttemptId.trim()
          : "") || queueAttemptIdByChatIdRef.current.get(targetChatId) || "";
      const clientOperationId =
        (typeof explicitClientOperationId === "string"
          ? explicitClientOperationId.trim()
          : "") ||
        queueClientOperationIdByChatIdRef.current.get(targetChatId) ||
        "";
      if (!targetChatId || (!attemptId && !clientOperationId) || !queuedTurns) {
        return false;
      }
      const snapshot = queuedTurns.snapshot();
      const durableOwner = attemptId
        ? readQueuedTurnsForAttempt(targetChatId, attemptId)
        : readQueuedTurnsForClientOperation(targetChatId, clientOperationId);
      const relayedItemsById = new Map();

      if (preserveRelayed) {
        for (const item of durableOwner?.items || []) {
          if (item.status === "relayed") {
            relayedItemsById.set(item.id, { ...item, status: "relayed" });
          }
        }

        const relayState = queueRelayAttemptsByChatIdRef.current.get(
          targetChatId,
        );
        const relayOwnerMatches = attemptId
          ? relayState?.attemptId === attemptId
          : Boolean(
              clientOperationId &&
                relayState?.clientOperationId === clientOperationId,
            );
        if (
          relayState?.buffer === queuedTurns &&
          relayState.inFlight === true &&
          relayOwnerMatches
        ) {
          const inFlightIds = new Set(relayState.inFlightIds || []);
          for (const item of snapshot) {
            if (inFlightIds.has(item.id)) {
              relayedItemsById.set(item.id, {
                ...item,
                status: "relayed",
              });
            }
          }
        }
      }

      const mergedItemsById = new Map(relayedItemsById);
      for (const item of snapshot) {
        if (item.status === "queued" && !mergedItemsById.has(item.id)) {
          mergedItemsById.set(item.id, { ...item, status: "queued" });
        }
      }
      const items = Array.from(mergedItemsById.values());
      if (items.length === 0) {
        if (attemptId) {
          removeQueuedTurnsForAttempt(targetChatId, attemptId);
        } else {
          removeQueuedTurnsForClientOperation(
            targetChatId,
            clientOperationId,
          );
        }
        return true;
      }
      const entry = {
        chatId: targetChatId,
        items,
      };
      return Boolean(
        attemptId
          ? writeQueuedTurnsForAttempt({ ...entry, attemptId })
          : writeQueuedTurnsForClientOperation({
              ...entry,
              clientOperationId,
            }),
      );
    },
    [],
  );

  /* `secretDisposition` is "" for every ordinary queue push. It is only ever
     PLAIN_USER_APPROVED_DISPOSITION when the user explicitly approved sending
     THIS text as plain text in the secret gate, and it is persisted with the
     item so a later relay does not have to fail closed. */
  const pushQueuedTurn = useCallback(
    (targetChatId, text, secretDisposition = "") => {
      const currentAttemptId =
        queueAttemptIdByChatIdRef.current.get(targetChatId) || "";
      const attemptId =
        currentAttemptId ||
        executionIdentityByChatIdRef.current.get(targetChatId)?.attemptId ||
        "";
      const currentClientOperationId =
        queueClientOperationIdByChatIdRef.current.get(targetChatId) || "";
      const clientOperationId = attemptId
        ? ""
        : currentClientOperationId ||
          runClientOperationIdByChatIdRef.current.get(targetChatId) ||
          "";
      if (!targetChatId || (!attemptId && !clientOperationId)) {
        const message =
          "Could not save this queued message yet. Your input was kept.";
        setStreamErrorForChat(targetChatId, message);
        toast.error(message, {
          dedupeKey: `queue-owner-unavailable-${targetChatId}`,
        });
        return false;
      }

      let queuedTurns = queuedTurnsByChatIdRef.current.get(targetChatId);
      const createdBuffer = !queuedTurns;
      if (!queuedTurns) {
        queuedTurns = createQueuedTurnBuffer();
      }
      const queuedId = queuedTurns.push(text, secretDisposition);
      if (!queuedId) {
        const message =
          "The queued-message limit was reached. Your input was kept.";
        setStreamErrorForChat(targetChatId, message);
        toast.error(message, {
          dedupeKey: `queue-capacity-${targetChatId}`,
        });
        return false;
      }
      const persisted = persistQueuedTurnBufferForAttempt(
        targetChatId,
        queuedTurns,
        attemptId,
        clientOperationId,
      );
      if (!persisted) {
        queuedTurns.remove(queuedId);
        if (createdBuffer) {
          queuedTurnsByChatIdRef.current.delete(targetChatId);
        }
        const message =
          "Could not save this queued message. Your input was kept.";
        setStreamErrorForChat(targetChatId, message);
        toast.error(message, {
          dedupeKey: `queue-persist-failed-${targetChatId}`,
        });
        syncInterjectStateForChat(targetChatId);
        return false;
      }

      queuedTurnsByChatIdRef.current.set(targetChatId, queuedTurns);
      if (attemptId) {
        queueAttemptIdByChatIdRef.current.set(targetChatId, attemptId);
        queueClientOperationIdByChatIdRef.current.delete(targetChatId);
      } else {
        queueClientOperationIdByChatIdRef.current.set(
          targetChatId,
          clientOperationId,
        );
      }
      syncInterjectStateForChat(targetChatId);
      return true;
    },
    [
      persistQueuedTurnBufferForAttempt,
      setStreamErrorForChat,
      syncInterjectStateForChat,
    ],
  );

  const hydrateQueuedTurnsForAttempt = useCallback(
    (targetChatId, attemptId) => {
      const normalizedAttemptId =
        typeof attemptId === "string" ? attemptId.trim() : "";
      if (!targetChatId || !normalizedAttemptId) {
        return null;
      }

      const currentAttemptId =
        queueAttemptIdByChatIdRef.current.get(targetChatId) || "";
      const currentBuffer = queuedTurnsByChatIdRef.current.get(targetChatId);
      if (currentBuffer) {
        return currentAttemptId === normalizedAttemptId ? currentBuffer : null;
      }

      const persisted = readQueuedTurnsForAttempt(
        targetChatId,
        normalizedAttemptId,
      );
      if (persisted) {
        const retryableItems = persisted.items.filter(
          (item) => item.status === "queued",
        );
        if (retryableItems.length === 0) {
          /* `relayed` items are the exact request already submitted under this
             attempt. Keep that durable correlation while reattaching; replayed
             acceptance will ACK it. Hydrating it as queued would duplicate the
             same logical turn after the attached run completes. */
          return null;
        }
        const hydrated = createQueuedTurnBuffer(retryableItems);
        queuedTurnsByChatIdRef.current.set(targetChatId, hydrated);
        queueAttemptIdByChatIdRef.current.set(
          targetChatId,
          normalizedAttemptId,
        );
        syncInterjectStateForChat(targetChatId);
        return hydrated;
      }

      return null;
    },
    [syncInterjectStateForChat],
  );

  const acknowledgeRelayedQueuedTurnsForAttempt = useCallback(
    (targetChatId, attemptId) => {
      const normalizedAttemptId =
        typeof attemptId === "string" ? attemptId.trim() : "";
      if (!targetChatId || !normalizedAttemptId) return false;
      const persisted = readQueuedTurnsForAttempt(
        targetChatId,
        normalizedAttemptId,
      );
      if (!persisted) return false;
      const relayedItems = persisted.items.filter(
        (item) => item.status === "relayed",
      );
      if (relayedItems.length === 0) return false;
      const queuedRemainder = persisted.items.filter(
        (item) => item.status === "queued",
      );
      if (queuedRemainder.length > 0) {
        writeQueuedTurnsForAttempt({
          chatId: targetChatId,
          attemptId: normalizedAttemptId,
          items: queuedRemainder,
        });
      } else {
        removeQueuedTurnsForAttempt(targetChatId, normalizedAttemptId);
      }
      syncInterjectStateForChat(targetChatId);
      return true;
    },
    [syncInterjectStateForChat],
  );

  const hydrateQueuedTurnsForClientOperation = useCallback(
    (targetChatId, clientOperationId) => {
      const normalizedClientOperationId =
        typeof clientOperationId === "string" ? clientOperationId.trim() : "";
      if (!targetChatId || !normalizedClientOperationId) return null;

      const currentBuffer = queuedTurnsByChatIdRef.current.get(targetChatId);
      if (currentBuffer) {
        return queueClientOperationIdByChatIdRef.current.get(targetChatId) ===
          normalizedClientOperationId
          ? currentBuffer
          : null;
      }
      const persisted = readQueuedTurnsForChat(targetChatId).find(
        (entry) =>
          entry.clientOperationId === normalizedClientOperationId,
      );
      if (!persisted) return null;
      const retryableItems = persisted.items.filter(
        (item) => item.status === "queued",
      );
      if (retryableItems.length === 0) {
        removeQueuedTurnsForClientOperation(
          targetChatId,
          normalizedClientOperationId,
        );
        return null;
      }
      const hydrated = createQueuedTurnBuffer(retryableItems);
      queuedTurnsByChatIdRef.current.set(targetChatId, hydrated);
      queueClientOperationIdByChatIdRef.current.set(
        targetChatId,
        normalizedClientOperationId,
      );
      syncInterjectStateForChat(targetChatId);
      return hydrated;
    },
    [syncInterjectStateForChat],
  );

  const fallbackPendingClarifyForChat = useCallback(
    (targetChatId, explicitPending = null) => {
      const pending =
        explicitPending ||
        pendingClarifyByChatIdRef.current.get(targetChatId) ||
        readPendingClarifyForChat(targetChatId);
      if (!pending?.id) return null;
      const migrated = fallbackPendingClarifyToQueue({
        chatId: targetChatId,
        id: pending.id,
      });
      if (!migrated?.queue) return null;

      pendingClarifyByChatIdRef.current.delete(targetChatId);
      const hydrated = createQueuedTurnBuffer(
        migrated.queue.items.filter((item) => item.status === "queued"),
      );
      queuedTurnsByChatIdRef.current.set(targetChatId, hydrated);
      if (migrated.queue.attemptId) {
        queueAttemptIdByChatIdRef.current.set(
          targetChatId,
          migrated.queue.attemptId,
        );
        queueClientOperationIdByChatIdRef.current.delete(targetChatId);
      } else {
        queueAttemptIdByChatIdRef.current.delete(targetChatId);
        queueClientOperationIdByChatIdRef.current.set(
          targetChatId,
          migrated.queue.clientOperationId,
        );
      }
      syncInterjectStateForChat(targetChatId);
      return pending;
    },
    [syncInterjectStateForChat],
  );

  const isClarifyBtwBarrierCurrentOwner = useCallback(
    (barrier) => {
      if (
        !barrier?.chatId ||
        !barrier.attemptId ||
        !isRunGenerationCurrent(barrier.chatId, barrier.runGeneration)
      ) {
        return false;
      }
      const executionOwner =
        executionIdentityByChatIdRef.current.get(barrier.chatId)?.attemptId ||
        "";
      if (executionOwner) {
        return executionOwner === barrier.attemptId;
      }
      return (
        queueAttemptIdByChatIdRef.current.get(barrier.chatId) ===
        barrier.attemptId
      );
    },
    [isRunGenerationCurrent],
  );

  const tombstoneClarifyBtwBarrierForChat = useCallback((targetChatId) => {
    const barrier =
      clarifyBtwBarrierByChatIdRef.current.get(targetChatId) || null;
    if (!barrier) return false;
    barrier.settled = true;
    barrier.tombstoned = true;
    if (barrier.timeoutId != null) {
      clearTimeout(barrier.timeoutId);
      barrier.timeoutId = null;
    }
    clarifyBtwBarrierByChatIdRef.current.delete(targetChatId);
    return true;
  }, []);

  const settleClarifyBtwBarrier = useCallback(
    (
      barrier,
      { disposition = "migrate", accepted = false } = {},
    ) => {
      if (
        !barrier ||
        barrier.settled ||
        clarifyBtwBarrierByChatIdRef.current.get(barrier.chatId) !== barrier
      ) {
        return false;
      }
      barrier.settled = true;
      if (barrier.timeoutId != null) clearTimeout(barrier.timeoutId);
      clarifyBtwBarrierByChatIdRef.current.delete(barrier.chatId);
      const ownsCurrentRuntime =
        isClarifyBtwBarrierCurrentOwner(barrier);

      let durableSettled = true;
      let queue = null;
      if (disposition === "resolve") {
        const resolved = resolvePendingFyiIntent({
          chatId: barrier.chatId,
          attemptId: barrier.attemptId,
          messageId: barrier.messageId,
        });
        if (resolved) {
          queue = resolved.queue || null;
          if (ownsCurrentRuntime) {
            syncDurableQueueForAttempt(
              barrier.chatId,
              barrier.attemptId,
              queue,
            );
          }
        } else {
          // A side-answer receipt is only successful once the exact durable
          // intent can be removed. If that write fails, fall back once to the
          // exact same-id queue item and report the BTW settlement as failed.
          accepted = false;
          const migrated = migratePendingFyiToQueue({
            chatId: barrier.chatId,
            attemptId: barrier.attemptId,
            messageId: barrier.messageId,
          });
          durableSettled = Boolean(migrated?.queue);
          queue = migrated?.queue || null;
          if (queue && ownsCurrentRuntime) {
            syncDurableQueueForAttempt(
              barrier.chatId,
              barrier.attemptId,
              queue,
            );
          }
        }
      } else if (disposition === "migrate") {
        accepted = false;
        const migrated = migratePendingFyiToQueue({
          chatId: barrier.chatId,
          attemptId: barrier.attemptId,
          messageId: barrier.messageId,
        });
        durableSettled = Boolean(migrated?.queue);
        queue = migrated?.queue || null;
        if (queue && ownsCurrentRuntime) {
          syncDurableQueueForAttempt(
            barrier.chatId,
            barrier.attemptId,
            queue,
          );
        }
      } else if (disposition === "queued") {
        const exactQueue = readQueuedTurnsForAttempt(
          barrier.chatId,
          barrier.attemptId,
        );
        durableSettled = Boolean(
          exactQueue?.items?.some((item) => item.id === barrier.messageId),
        );
        queue = exactQueue || null;
      } else if (disposition === "preserve") {
        durableSettled = readPendingFyisForAttempt(
          barrier.chatId,
          barrier.attemptId,
        ).some(
          (entry) =>
            entry.messageId === barrier.messageId &&
            entry.chatId === barrier.chatId &&
            entry.attemptId === barrier.attemptId,
        );
      } else if (disposition === "converted") {
        durableSettled = Boolean(readPendingClarifyForChat(barrier.chatId));
      }

      if (!durableSettled) {
        if (ownsCurrentRuntime) {
          syncPendingFyiStateForAttempt(barrier.chatId, barrier.attemptId);
          setStreamErrorForChat(
            barrier.chatId,
            "The side question is still saved and will be recovered after reload.",
          );
        }
        return false;
      }

      if (barrier.terminal) {
        if (ownsCurrentRuntime) {
          const fallback = fallbackPendingFyisForAttempt(
            barrier.chatId,
            barrier.attemptId,
          );
          if (!fallback) return false;
          if (
            barrier.terminal.status === "done" &&
            hookMountedRef.current
          ) {
            relayQueuedTurnsAfterRunRef.current?.(
              barrier.terminal.relayContext,
            );
          }
        } else if (
          readPendingFyisForAttempt(
            barrier.chatId,
            barrier.attemptId,
          ).length > 0 &&
          !migratePendingFyiForAttemptToQueue(
            barrier.chatId,
            barrier.attemptId,
          )
        ) {
          return false;
        }
      } else if (queue && ownsCurrentRuntime) {
        syncDurableQueueForAttempt(barrier.chatId, barrier.attemptId, queue);
      }
      return accepted;
    },
    [
      fallbackPendingFyisForAttempt,
      isClarifyBtwBarrierCurrentOwner,
      setStreamErrorForChat,
      syncDurableQueueForAttempt,
      syncPendingFyiStateForAttempt,
    ],
  );

  useEffect(() => {
    const targetChatId =
      typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
    if (!targetChatId) return;
    const storedMessages =
      activeChatIdRef.current === targetChatId &&
      Array.isArray(messagesRef.current)
        ? messagesRef.current
        : storageApi.getChatMessages?.(targetChatId) || [];

    // A renderer can crash after persisting the stable BTW receipt but before
    // removing its durable intent/fallback. Reconcile that exact receipt before
    // queue hydration or terminal relay. Both halves are required so a partial
    // message write can never acknowledge an unanswered side question.
    readPendingFyiOutbox()
      .filter(
        (entry) =>
          entry.chatId === targetChatId && entry.requestedChannel === "btw",
      )
      .forEach((entry) => {
        const ownerAssistant = [...storedMessages].reverse().find(
          (message) =>
            message?.role === "assistant" &&
            message?.meta?.attemptId === entry.attemptId,
        );
        const hasStableFrame = Boolean(
          ownerAssistant?.traceFrames?.some(
            (frame) =>
              frame?.type === "side_answer" &&
              frame?.payload?.message_id === entry.messageId,
          ),
        );
        const hasStableRecord = Boolean(
          ownerAssistant?.interjections?.some(
            (record) => record?.id === `btw-${entry.messageId}`,
          ),
        );
        if (hasStableFrame && hasStableRecord) {
          resolvePendingFyiIntent({
            chatId: targetChatId,
            attemptId: entry.attemptId,
            messageId: entry.messageId,
          });
        }
      });

    if (!queuedTurnsByChatIdRef.current.has(targetChatId)) {
      const exactAssistant = [...storedMessages].reverse().find((message) => {
        const attemptId =
          typeof message?.meta?.attemptId === "string"
            ? message.meta.attemptId.trim()
            : "";
        return Boolean(
          message?.role === "assistant" &&
            attemptId &&
            readQueuedTurnsForAttempt(targetChatId, attemptId),
        );
      });
      const exactAttempt = exactAssistant?.meta?.attemptId;
      if (exactAttempt) {
        const hydrated = hydrateQueuedTurnsForAttempt(
          targetChatId,
          exactAttempt,
        );
        if (hydrated && exactAssistant.status === "done") {
          relayQueuedTurnsAfterRunRef.current?.({
            targetChatId,
            nextStreamMessages: storedMessages,
            characterAgentConfig: null,
            runContext: null,
          });
        }
      } else {
        const pendingClientEntry = readQueuedTurnsForChat(targetChatId)
          .filter((entry) => entry.clientOperationId)
          .sort((left, right) => right.updatedAt - left.updatedAt)[0];
        if (pendingClientEntry) {
          hydrateQueuedTurnsForClientOperation(
            targetChatId,
            pendingClientEntry.clientOperationId,
          );
        }
      }
    }

    storedMessages.forEach((sourceAssistant) => {
      const sourceAttemptId =
        typeof sourceAssistant?.meta?.attemptId === "string"
          ? sourceAssistant.meta.attemptId.trim()
          : "";
      if (sourceAssistant?.role !== "assistant" || !sourceAttemptId) return;
      const persistedFyiMessages = [
        sourceAssistant.traceFrames,
        ...Object.values(sourceAssistant.subagentFrames || {}),
      ].flatMap((frames) =>
        (Array.isArray(frames) ? frames : [])
          .filter((frame) => frame?.type === "fyi_injected")
          .flatMap((frame) =>
            Array.isArray(frame.payload?.messages)
              ? frame.payload.messages
              : [],
          ),
      );
      if (persistedFyiMessages.length > 0) {
        acknowledgeInjectedFyisForAttempt(
          targetChatId,
          sourceAttemptId,
          persistedFyiMessages,
        );
      }
    });

    const pendingFyisByAttempt = new Map();
    readPendingFyiOutbox()
      .filter((entry) => entry.chatId === targetChatId)
      .forEach((entry) => {
        if (!pendingFyisByAttempt.has(entry.attemptId)) {
          pendingFyisByAttempt.set(entry.attemptId, []);
        }
        pendingFyisByAttempt.get(entry.attemptId).push(entry);
      });
    pendingFyisByAttempt.forEach((_entries, sourceAttemptId) => {
      const sourceAssistant = [...storedMessages].reverse().find(
        (message) =>
          message?.role === "assistant" &&
          message?.meta?.attemptId === sourceAttemptId,
      );
      if (
        readPendingFyisForAttempt(targetChatId, sourceAttemptId).length === 0
      ) {
        return;
      }
      const sourceCanResume = Boolean(
        sourceAssistant?.status === "streaming" &&
          sourceAssistant?.meta?.requestId &&
          sourceAssistant?.meta?.executionSessionId,
      );
      if (sourceCanResume) {
        syncPendingFyiStateForAttempt(targetChatId, sourceAttemptId);
        return;
      }
      const migrated = fallbackPendingFyisForAttempt(
        targetChatId,
        sourceAttemptId,
      );
      if (migrated && sourceAssistant?.status === "done") {
        relayQueuedTurnsAfterRunRef.current?.({
          targetChatId,
          nextStreamMessages: storedMessages,
          characterAgentConfig: null,
          runContext: null,
        });
      }
    });

    const durableClarify = readPendingClarifyForChat(targetChatId);
    if (!durableClarify) return;
    const sourceAssistant = [...storedMessages].reverse().find((message) => {
      if (message?.role !== "assistant") return false;
      if (durableClarify.sourceAttemptId) {
        return message?.meta?.attemptId === durableClarify.sourceAttemptId;
      }
      return (
        message?.meta?.queueClientOperationId ===
        durableClarify.clientOperationId
      );
    });
    const sourceCanResume = Boolean(
      sourceAssistant?.status === "streaming" &&
        sourceAssistant?.meta?.requestId &&
        sourceAssistant?.meta?.attemptId &&
        sourceAssistant?.meta?.executionSessionId,
    );
    if (sourceCanResume) {
      pendingClarifyByChatIdRef.current.set(targetChatId, durableClarify);
      return;
    }
    const fallback = fallbackPendingClarifyForChat(
      targetChatId,
      durableClarify,
    );
    if (fallback) {
      const nextMessages = storedMessages.map((message) => ({
        ...message,
        ...(Array.isArray(message?.traceFrames)
          ? {
              traceFrames: message.traceFrames.map((frame) =>
                frame?.type === "clarify_request" &&
                frame?.payload?.id === fallback.id
                  ? {
                      ...frame,
                      payload: {
                        ...frame.payload,
                        status: "resolved_default",
                      },
                    }
                  : frame,
              ),
            }
          : {}),
      }));
      commitForegroundMessages(targetChatId, nextMessages);
      storageApi.setChatMessages(targetChatId, nextMessages, {
        source: "clarify-durable-fallback",
      });
      /* Mirror the fyi-fallback recovery above: once a pending clarify for an
         already-done owner has been migrated into the queue, schedule the exact
         relay so the recovered question actually launches its successor. Error
         or cancelled owners stay queued without auto-run — only a done owner
         relays. */
      if (sourceAssistant?.status === "done") {
        relayQueuedTurnsAfterRunRef.current?.({
          targetChatId,
          nextStreamMessages: nextMessages,
          characterAgentConfig: null,
          runContext: null,
        });
      }
    }
  }, [
    activeChatIdRef,
    acknowledgeInjectedFyisForAttempt,
    chatId,
    commitForegroundMessages,
    fallbackPendingClarifyForChat,
    fallbackPendingFyisForAttempt,
    hydrateQueuedTurnsForClientOperation,
    hydrateQueuedTurnsForAttempt,
    messagesRef,
    storageApi,
    syncPendingFyiStateForAttempt,
  ]);

  const clearQueuedTurnsForChat = useCallback(
    (targetChatId, explicitAttemptId = "") => {
      // Stop/cancel must tombstone the in-flight clarify-owned BTW before its
      // durable intent is cleared, so a late promise or timeout cannot revive
      // the stopped owner or occupy the barrier slot needed by a successor.
      tombstoneClarifyBtwBarrierForChat(targetChatId);
      const attemptIds = new Set([
        typeof explicitAttemptId === "string" ? explicitAttemptId.trim() : "",
        queueAttemptIdByChatIdRef.current.get(targetChatId) || "",
      ]);
      attemptIds.forEach((attemptId) => {
        if (attemptId) {
          removeQueuedTurnsForAttempt(targetChatId, attemptId);
          removePendingFyisForAttempt(targetChatId, attemptId);
        }
      });
      const clientOperationIds = new Set([
        queueClientOperationIdByChatIdRef.current.get(targetChatId) || "",
        runClientOperationIdByChatIdRef.current.get(targetChatId) || "",
      ]);
      clientOperationIds.forEach((clientOperationId) => {
        if (clientOperationId) {
          removeQueuedTurnsForClientOperation(
            targetChatId,
            clientOperationId,
          );
        }
      });
      const pendingClarify =
        pendingClarifyByChatIdRef.current.get(targetChatId) ||
        readPendingClarifyForChat(targetChatId);
      if (pendingClarify?.id) {
        removePendingClarify(targetChatId, pendingClarify.id);
      }
      queuedTurnsByChatIdRef.current.delete(targetChatId);
      queueAttemptIdByChatIdRef.current.delete(targetChatId);
      queueClientOperationIdByChatIdRef.current.delete(targetChatId);
      runClientOperationIdByChatIdRef.current.delete(targetChatId);
      pendingClarifyByChatIdRef.current.delete(targetChatId);
      pendingFyiCountByChatIdRef.current.delete(targetChatId);
      syncInterjectStateForChat(targetChatId);
    },
    [syncInterjectStateForChat, tombstoneClarifyBtwBarrierForChat],
  );

  const clearConfirmationResolutionTimer = useCallback(
    (targetChatId, confirmationId) => {
      const normalizedId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedId) {
        return;
      }

      const runtime = getConfirmationRuntimeForChat(targetChatId, {
        create: false,
      });
      if (!runtime) {
        return;
      }
      const timerId = runtime.resolveTimerById.get(normalizedId);
      if (timerId != null) {
        clearTimeout(timerId);
      }
      runtime.resolveTimerById.delete(normalizedId);
    },
    [getConfirmationRuntimeForChat],
  );

  const resolveSubmittedConfirmationFromSignal = useCallback(
    (targetChatId, confirmationId) => {
      const normalizedId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedId) {
        return;
      }
      clearConfirmationResolutionTimer(targetChatId, normalizedId);

      updateToolConfirmationUiState(targetChatId, (previous) => {
        const current = previous[normalizedId];
        if (!current || current.resolved === true) {
          return previous;
        }

        const currentStatus =
          typeof current.status === "string" ? current.status : "idle";
        const isPendingSubmission =
          currentStatus === "submitting" || currentStatus === "submitted";
        if (!isPendingSubmission) {
          return previous;
        }

        return {
          ...previous,
          [normalizedId]: {
            ...current,
            status: "submitted",
            resolved: true,
            error: "",
          },
        };
      });
    },
    [clearConfirmationResolutionTimer, updateToolConfirmationUiState],
  );

  const markConfirmationFollowupSignalByCallId = useCallback(
    (targetChatId, callId, confirmationId = "") => {
      const normalizedCallId = typeof callId === "string" ? callId.trim() : "";
      const normalizedConfirmationId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedCallId && !normalizedConfirmationId) {
        return;
      }

      const runtime = getConfirmationRuntimeForChat(targetChatId, {
        create: false,
      });
      if (!runtime) {
        return;
      }
      const resolvedConfirmationId =
        normalizedConfirmationId ||
        runtime.confirmationIdByCallId.get(normalizedCallId);
      if (!resolvedConfirmationId) {
        return;
      }
      runtime.followupSignalById.set(resolvedConfirmationId, true);
      resolveSubmittedConfirmationFromSignal(
        targetChatId,
        resolvedConfirmationId,
      );
    },
    [getConfirmationRuntimeForChat, resolveSubmittedConfirmationFromSignal],
  );

  const markAllPendingConfirmationFollowupSignals = useCallback((targetChatId) => {
    const runtime = getConfirmationRuntimeForChat(targetChatId, {
      create: false,
    });
    runtime?.confirmationCallIdById.forEach((_callId, confirmationId) => {
      if (confirmationId) {
        runtime.followupSignalById.set(confirmationId, true);
        resolveSubmittedConfirmationFromSignal(targetChatId, confirmationId);
      }
    });
  }, [getConfirmationRuntimeForChat, resolveSubmittedConfirmationFromSignal]);

  const clearResolvedToolConfirmationByCallId = useCallback(
    (targetChatId, callId, confirmationId = "") => {
      const normalizedCallId = typeof callId === "string" ? callId.trim() : "";
      const normalizedConfirmationId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedCallId && !normalizedConfirmationId) {
        return;
      }
      const runtime = getConfirmationRuntimeForChat(targetChatId, {
        create: false,
      });
      if (!runtime) {
        return;
      }
      const resolvedConfirmationId =
        normalizedConfirmationId ||
        runtime.confirmationIdByCallId.get(normalizedCallId);
      if (!resolvedConfirmationId) {
        return;
      }

      if (
        normalizedCallId &&
        runtime.confirmationIdByCallId.get(normalizedCallId) ===
          resolvedConfirmationId
      ) {
        runtime.confirmationIdByCallId.delete(normalizedCallId);
      }
      runtime.confirmationCallIdById.delete(resolvedConfirmationId);
      if (
        normalizedCallId &&
        !runtime.confirmationIdByCallId.has(normalizedCallId)
      ) {
        for (const [candidateId, candidateCallId] of
          runtime.confirmationCallIdById.entries()) {
          if (candidateCallId === normalizedCallId) {
            runtime.confirmationIdByCallId.set(normalizedCallId, candidateId);
            break;
          }
        }
      }
      runtime.sessionIdByConfirmationId.delete(resolvedConfirmationId);
      runtime.followupSignalById.delete(resolvedConfirmationId);
      clearConfirmationResolutionTimer(targetChatId, resolvedConfirmationId);
      updatePendingToolConfirmationRequests(targetChatId, (previous) => {
        if (!previous || !previous[resolvedConfirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[resolvedConfirmationId];
        return next;
      });
      updateToolConfirmationUiState(targetChatId, (previous) => {
        if (!previous || !previous[resolvedConfirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[resolvedConfirmationId];
        return next;
      });
    },
    [
      clearConfirmationResolutionTimer,
      getConfirmationRuntimeForChat,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );

  const clearAllPendingToolConfirmations = useCallback(
    (targetChatId) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      if (!normalizedChatId) {
        return;
      }

      const runtime = getConfirmationRuntimeForChat(normalizedChatId, {
        create: false,
      });
      if (runtime) {
        runtime.resolveTimerById.forEach((timerId) => {
          clearTimeout(timerId);
        });
        confirmationRuntimeByChatIdRef.current.delete(normalizedChatId);
      }
      updatePendingToolConfirmationRequests(
        normalizedChatId,
        EMPTY_CONFIRMATION_STATE,
      );
      updateToolConfirmationUiState(
        normalizedChatId,
        EMPTY_CONFIRMATION_STATE,
      );
    },
    [
      getConfirmationRuntimeForChat,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );

  const cancelCurrentStreamAndSettleMessages = useCallback(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return Array.isArray(messagesRef.current) ? messagesRef.current : [];
    }
    const executionIdentity =
      executionIdentityByChatIdRef.current.get(currentChatId) ||
      executionIdentityFromMessages(currentChatId, messagesRef.current) ||
      null;
    const durableInteraction =
      durableInteractionByChatIdRef.current[currentChatId] || null;

    // Invalidate first. Any lookup, retry, receipt, or queue callback that was
    // already in flight must observe the tombstone before transport teardown.
    invalidateRunGeneration(currentChatId);
    const durableRetryTimer =
      durableResumeRetryTimersRef.current.get(currentChatId);
    if (durableRetryTimer != null) {
      clearTimeout(durableRetryTimer);
      durableResumeRetryTimersRef.current.delete(currentChatId);
    }
    clearDurableResumeStartedKeysForChat(currentChatId);
    clearConfirmationRetryWaitersForChat(currentChatId);
    clearQueueRelayTimersForChat(currentChatId);
    clearQueuedTurnsForChat(currentChatId, executionIdentity?.attemptId);
    pendingFyiCountByChatIdRef.current.delete(currentChatId);
    pendingClarifyByChatIdRef.current.delete(currentChatId);
    updateDurableInteractionForChat(currentChatId, null);
    clearAllPendingToolConfirmations(currentChatId);
    updatePendingContinuationRequestForChat(currentChatId, null);

    clearActiveTokenFlushController(currentChatId, "flush");
    const handle = streamHandlesRef.current.get(currentChatId);
    executionIdentityByChatIdRef.current.delete(currentChatId);
    const queuedCancellation = enqueueExecutionCancel({
      ...(executionIdentity || {}),
      ownerChatId: currentChatId,
      interactionId:
        typeof durableInteraction?.interactionId === "string"
          ? durableInteraction.interactionId.trim()
          : executionIdentity?.interactionId || "",
      reason: "user_stop",
      createdAt: Date.now(),
    });
    void requestExecutionCancellationAndDisconnect({
      identity: queuedCancellation,
      handle,
      reason: "user_stop",
    }).then((result) => {
      if (result?.terminal && queuedCancellation) {
        removeExecutionCancel(
          queuedCancellation.sessionId,
          queuedCancellation.attemptId,
          queuedCancellation.interactionId,
        );
      }
    });
    cancelBackgroundPersist(currentChatId);
    streamHandlesRef.current.delete(currentChatId);
    streamingChatIdsRef.current.delete(currentChatId);
    activeStreamsRef.current.delete(currentChatId);
    setStreamingChatIds((prev) => {
      const next = new Set(prev);
      next.delete(currentChatId);
      return next;
    });
    const materializedMessages = materializeStreamingMessages(
      currentChatId,
      messagesRef.current,
    );
    const { changed, nextMessages } =
      settleStreamingAssistantMessages(materializedMessages);
    if (
      currentChatId &&
      activeStreamingMessageStore &&
      typeof activeStreamingMessageStore.clearChat === "function"
    ) {
      activeStreamingMessageStore.clearChat(currentChatId);
    }
    messagesRef.current = nextMessages;
    setMessages(nextMessages);

    if (currentChatId && changed) {
      storageApi.setChatMessages(currentChatId, nextMessages, {
        source: "chat-page",
      });
    }
    return nextMessages;
  }, [
    activeChatIdRef,
    activeStreamsRef,
    activeStreamingMessageStore,
    clearConfirmationRetryWaitersForChat,
    clearQueuedTurnsForChat,
    clearActiveTokenFlushController,
    clearAllPendingToolConfirmations,
    clearDurableResumeStartedKeysForChat,
    clearQueueRelayTimersForChat,
    invalidateRunGeneration,
    materializeStreamingMessages,
    messagesRef,
    setMessages,
    storageApi,
    updateDurableInteractionForChat,
    updatePendingContinuationRequestForChat,
  ]);

  const stopStream = useCallback(() => {
    cancelCurrentStreamAndSettleMessages();
  }, [cancelCurrentStreamAndSettleMessages]);

  useEffect(() => {
    let disposed = false;
    let retryTimer = null;

    const drainCancellationOutbox = async () => {
      const entries = readExecutionCancelOutbox();
      for (const entry of entries) {
        if (disposed) {
          return;
        }
        const result = await requestExecutionCancellationAndDisconnect({
          identity: entry,
          handle: null,
          reason: entry.reason || "user_stop",
        });
        if (result?.terminal) {
          removeExecutionCancel(
            entry.sessionId,
            entry.attemptId,
            entry.interactionId,
          );
        }
      }
      if (!disposed) {
        retryTimer = setTimeout(
          drainCancellationOutbox,
          EXECUTION_CANCEL_OUTBOX_RETRY_MS,
        );
      }
    };

    void drainCancellationOutbox();
    return () => {
      disposed = true;
      if (retryTimer != null) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

  const appendSyntheticToolConfirmationDecision = useCallback(
    ({ targetChatId, confirmationId, approved, userResponse }) => {
      const normalizedTargetChatId =
        typeof targetChatId === "string" && targetChatId.trim()
          ? targetChatId.trim()
          : activeChatIdRef.current;
      const normalizedConfirmationId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedTargetChatId || !normalizedConfirmationId) {
        return false;
      }

      const runtime = getConfirmationRuntimeForChat(normalizedTargetChatId, {
        create: false,
      });
      const callId =
        runtime?.confirmationCallIdById.get(normalizedConfirmationId) || "";
      const hasAuthoritativeConfirmationRequest = Boolean(
        pendingToolConfirmationRequestsByChatIdRef.current[
          normalizedTargetChatId
        ]?.[normalizedConfirmationId],
      );
      const streamState = activeStreamsRef.current.get(normalizedTargetChatId);
      const hasActiveStreamMessages = Array.isArray(streamState?.messages);
      const streamMessages = hasActiveStreamMessages
        ? streamState.messages
        : activeChatIdRef.current === normalizedTargetChatId &&
            Array.isArray(messagesRef.current)
          ? messagesRef.current
          : typeof storageApi.getChatMessages === "function"
            ? storageApi.getChatMessages(normalizedTargetChatId)
            : [];
      if (!callId || streamMessages.length === 0) {
        return false;
      }

      const decisionFrameType = approved ? "tool_confirmed" : "tool_denied";
      const patchTime = Date.now();
      let changed = false;
      const containsExactRequest = (frames) =>
        (Array.isArray(frames) ? frames : []).some(
          (frame) =>
            frame?.type === "tool_call" &&
            frame?.payload?.confirmation_id === normalizedConfirmationId,
        );
      const hasExactRequestFrame = streamMessages.some((message) => {
        if (containsExactRequest(message?.traceFrames)) return true;
        return Object.values(message?.subagentFrames || {}).some((frames) =>
          containsExactRequest(frames),
        );
      });
      const allowCallIdFallback =
        !hasAuthoritativeConfirmationRequest && !hasExactRequestFrame;

      const appendDecisionFrame = (frames) => {
        const list = Array.isArray(frames) ? frames : [];
        const requestFrame = list.find(
          (frame) =>
            frame?.type === "tool_call" &&
            (frame?.payload?.confirmation_id === normalizedConfirmationId ||
              (allowCallIdFallback && frame?.payload?.call_id === callId)),
        );
        if (!requestFrame) {
          return { frames: list, changed: false };
        }

        const alreadyRecorded = list.some(
          (frame) =>
            frame?.type === decisionFrameType &&
            (frame?.payload?.confirmation_id === normalizedConfirmationId ||
              (allowCallIdFallback && frame?.payload?.call_id === callId)),
        );
        if (alreadyRecorded) {
          return { frames: list, changed: false };
        }

        const maxSeq = list.reduce((highest, frame) => {
          const seq = Number(frame?.seq);
          return Number.isFinite(seq) && seq > highest ? seq : highest;
        }, 0);
        const toolName =
          typeof requestFrame.payload?.tool_name === "string"
            ? requestFrame.payload.tool_name
            : "";
        const toolDisplayName =
          typeof requestFrame.payload?.tool_display_name === "string"
            ? requestFrame.payload.tool_display_name
            : "";

        return {
          frames: [
            ...list,
            {
              seq: maxSeq + 0.1,
              ts: patchTime,
              type: decisionFrameType,
              stage: "client",
              ...(requestFrame.run_id ? { run_id: requestFrame.run_id } : {}),
              payload: {
                tool_name: toolName,
                ...(toolDisplayName
                  ? { tool_display_name: toolDisplayName }
                  : {}),
                call_id: callId,
                confirmation_id: normalizedConfirmationId,
                synthetic: true,
                ...(userResponse !== undefined
                  ? { user_response: userResponse }
                  : {}),
              },
            },
          ],
          changed: true,
        };
      };

      const nextStreamMessages = streamMessages.map((message) => {
        const traceFrames = Array.isArray(message?.traceFrames)
          ? message.traceFrames
          : [];
        const rootResult = appendDecisionFrame(traceFrames);
        if (rootResult.changed) {
          changed = true;
          return {
            ...message,
            updatedAt: patchTime,
            traceFrames: rootResult.frames,
          };
        }

        const subagentFrames =
          message?.subagentFrames && typeof message.subagentFrames === "object"
            ? message.subagentFrames
            : {};
        let nextSubagentFrames = null;
        for (const [runId, frames] of Object.entries(subagentFrames)) {
          const branchResult = appendDecisionFrame(frames);
          if (!branchResult.changed) {
            continue;
          }
          nextSubagentFrames = {
            ...subagentFrames,
            [runId]: branchResult.frames,
          };
          break;
        }

        if (!nextSubagentFrames) {
          return message;
        }
        changed = true;
        return {
          ...message,
          updatedAt: patchTime,
          subagentFrames: nextSubagentFrames,
        };
      });

      if (!changed) {
        return false;
      }

      if (hasActiveStreamMessages) {
        activeStreamsRef.current.set(normalizedTargetChatId, {
          messages: nextStreamMessages,
        });
      }

      if (activeChatIdRef.current === normalizedTargetChatId) {
        messagesRef.current = nextStreamMessages;
        setMessages(nextStreamMessages);
        if (!hasActiveStreamMessages) {
          storageApi.setChatMessages(normalizedTargetChatId, nextStreamMessages, {
            source: "chat-page",
          });
        }
      } else {
        // Tool confirmation is infrequent + user-visible — bypass the throttle.
        cancelBackgroundPersist(normalizedTargetChatId);
        storageApi.setChatMessages(normalizedTargetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      }

      return true;
    },
    [
      activeChatIdRef,
      activeStreamsRef,
      getConfirmationRuntimeForChat,
      messagesRef,
      setMessages,
      storageApi,
    ],
  );

  /* Same commit pattern as appendSyntheticToolConfirmationDecision above:
     patch the chat's currently-streaming assistant message from outside the
     runTurnRequest closure (used by the interject dispatch below, which runs
     from a promise callback, not from inside the active stream's onFrame). */
  const applyToStreamingAssistantMessage = useCallback(
    (targetChatId, patch) => {
      const streamState = activeStreamsRef.current.get(targetChatId);
      const streamMessages = Array.isArray(streamState?.messages)
        ? streamState.messages
        : [];
      if (streamMessages.length === 0) {
        return false;
      }

      let changed = false;
      const nextStreamMessages = streamMessages.map((message) => {
        if (message?.role !== "assistant" || message?.status !== "streaming") {
          return message;
        }
        const patched = patch(message);
        if (!patched || patched === message) {
          return message;
        }
        changed = true;
        return patched;
      });

      if (!changed) {
        return false;
      }

      activeStreamsRef.current.set(targetChatId, {
        messages: nextStreamMessages,
      });
      if (activeChatIdRef.current === targetChatId) {
        setMessages(nextStreamMessages);
      } else {
        cancelBackgroundPersist(targetChatId);
        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      }
      return true;
    },
    [activeChatIdRef, activeStreamsRef, setMessages, storageApi],
  );

  const appendLocalTraceFrame = useCallback(
    (targetChatId, frame) =>
      applyToStreamingAssistantMessage(targetChatId, (message) => ({
        ...message,
        updatedAt: Date.now(),
        traceFrames: [...(message.traceFrames || []), frame],
      })),
    [applyToStreamingAssistantMessage],
  );

  const appendLocalBtwResultForOwner = useCallback(
    ({
      targetChatId,
      attemptId,
      executionAttemptId,
      messageId,
      question,
      answer,
      ts,
    }) => {
      const streamState = activeStreamsRef.current.get(targetChatId);
      const hasActiveStreamMessages = Array.isArray(streamState?.messages);
      const sourceMessages = hasActiveStreamMessages
        ? streamState.messages
        : activeChatIdRef.current === targetChatId &&
            Array.isArray(messagesRef.current)
          ? messagesRef.current
          : storageApi.getChatMessages?.(targetChatId) || [];
      const stableMessageId =
        typeof messageId === "string" ? messageId.trim() : "";
      const receiptId = stableMessageId ? `btw-${stableMessageId}` : "";
      let ownerFound = false;
      let changed = false;
      const sideAnswerFrame = {
        seq: ts,
        ts,
        type: "side_answer",
        stage: "client",
        payload: {
          ...(stableMessageId ? { message_id: stableMessageId } : {}),
          question,
          answer,
        },
      };
      const record = buildInterjectionRecord({
        type: "btw",
        text: question,
        origin: "user",
        answer,
        ts,
      });
      if (receiptId) record.id = receiptId;
      const ownsResult = (message) =>
        Boolean(
          message?.role === "assistant" &&
            (executionAttemptId
              ? message?.meta?.attemptId === executionAttemptId
              : message?.meta?.queueClientOperationId === attemptId),
        );
      const containsReceipt = (message) => {
        if (!ownsResult(message)) return false;
        const hasFrame = (message.traceFrames || []).some((frame) =>
          stableMessageId
            ? frame?.type === "side_answer" &&
              frame?.payload?.message_id === stableMessageId
            : frame?.type === "side_answer" &&
              frame?.ts === ts &&
              frame?.payload?.question === question,
        );
        const hasRecord = (message.interjections || []).some(
          (entry) => entry?.id === record.id,
        );
        return hasFrame && hasRecord;
      };
      const nextMessages = sourceMessages.map((message) => {
        if (!ownsResult(message)) return message;
        ownerFound = true;
        const hasFrame = (message.traceFrames || []).some((frame) =>
          stableMessageId
            ? frame?.type === "side_answer" &&
              frame?.payload?.message_id === stableMessageId
            : frame?.type === "side_answer" &&
              frame?.ts === ts &&
              frame?.payload?.question === question,
        );
        const hasRecord = (message.interjections || []).some(
          (entry) => entry?.id === record.id,
        );
        if (hasFrame && hasRecord) return message;
        changed = true;
        return {
          ...message,
          updatedAt: Date.now(),
          traceFrames: [
            ...(message.traceFrames || []),
            ...(hasFrame ? [] : [sideAnswerFrame]),
          ],
          interjections: [
            ...(message.interjections || []),
            ...(hasRecord ? [] : [record]),
          ],
        };
      });
      if (!ownerFound) return false;
      if (changed) {
        if (hasActiveStreamMessages) {
          activeStreamsRef.current.set(targetChatId, {
            messages: nextMessages,
          });
        }
        cancelBackgroundPersist(targetChatId);
        commitForegroundMessages(targetChatId, nextMessages);
        storageApi.setChatMessages(targetChatId, nextMessages, {
          source: "interject-btw-result",
        });
      }
      const persistedMessages = storageApi.getChatMessages?.(targetChatId) || [];
      return persistedMessages.some(containsReceipt);
    },
    [activeChatIdRef, activeStreamsRef, commitForegroundMessages, messagesRef, storageApi],
  );

  const updateLocalClarifyFrame = useCallback(
    (targetChatId, clarifyId, payloadPatch) =>
      applyToStreamingAssistantMessage(targetChatId, (message) => {
        const frames = Array.isArray(message.traceFrames)
          ? message.traceFrames
          : [];
        let found = false;
        const nextFrames = frames.map((frame) => {
          if (
            frame?.type === "clarify_request" &&
            frame?.payload?.id === clarifyId
          ) {
            found = true;
            return { ...frame, payload: { ...frame.payload, ...payloadPatch } };
          }
          return frame;
        });
        if (!found) {
          return message;
        }
        return { ...message, updatedAt: Date.now(), traceFrames: nextFrames };
      }),
    [applyToStreamingAssistantMessage],
  );

  const submitToolConfirmationWithRetry = useCallback(
    async (payload, { targetChatId, runGeneration } = {}) => {
      const stoppedError = () =>
        Object.assign(new Error("This run was stopped."), {
          code: "run_stopped",
        });
      let attempt = 0;
      while (true) {
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
          throw stoppedError();
        }
        try {
          const response = await api.unchain.respondToolConfirmation(payload);
          if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
            throw stoppedError();
          }
          return response;
        } catch (error) {
          if (
            error?.code === "run_stopped" ||
            attempt >= DURABLE_RESUME_MAX_RETRIES ||
            !isRetryableDurableInteractionError(error)
          ) {
            throw error;
          }
          const delayMs = durableInteractionRetryDelayMs(attempt);
          attempt += 1;
          const shouldContinue = await waitForConfirmationRetry(
            targetChatId,
            runGeneration,
            delayMs,
          );
          if (!shouldContinue) {
            throw stoppedError();
          }
        }
      }
    },
    [isRunGenerationCurrent, waitForConfirmationRetry],
  );

  const continueFromRecordedReceipt = useCallback(
    (targetChatId, sessionId, response, runGeneration) => {
      if (
        response?.disposition !== "receipt_recorded" ||
        !isRunGenerationCurrent(targetChatId, runGeneration)
      ) {
        return;
      }
      const lookup =
        durableInteractionLookupByChatIdRef.current.get(targetChatId);
      if (typeof lookup === "function") {
        void lookup(targetChatId, sessionId, {
          runGeneration,
          authoritativeReceipt: response,
        });
      }
    },
    [isRunGenerationCurrent],
  );

  const handleToolConfirmationDecision = useCallback(
    async ({ confirmationId, approved, userResponse, scope }) => {
      const targetChatId = activeChatIdRef.current;
      const normalizedConfirmationId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!targetChatId || !normalizedConfirmationId) {
        return;
      }
      const runGeneration = getRunGeneration(targetChatId);
      if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
        return;
      }

      const runtime = getConfirmationRuntimeForChat(targetChatId, {
        create: false,
      });
      const callId =
        runtime?.confirmationCallIdById.get(normalizedConfirmationId) || "";
      const confirmationRequest =
        pendingToolConfirmationRequestsByChatIdRef.current[targetChatId]?.[
          normalizedConfirmationId
        ] || null;
      const sessionId =
        runtime?.sessionIdByConfirmationId.get(normalizedConfirmationId) ||
        (typeof confirmationRequest?.sessionId === "string"
          ? confirmationRequest.sessionId.trim()
          : "") ||
        activeRunThreadIdByChatIdRef.current.get(targetChatId) ||
        targetChatId;
      const requestFrame = findToolCallFrameByCallId(targetChatId, callId);
      const toolName =
        typeof confirmationRequest?.toolName === "string"
          ? confirmationRequest.toolName
          : typeof requestFrame?.payload?.tool_name === "string"
            ? requestFrame.payload.tool_name
            : "";
      const toolkitId =
        typeof confirmationRequest?.toolkitId === "string"
          ? confirmationRequest.toolkitId
          : typeof requestFrame?.payload?.toolkit_id === "string"
            ? requestFrame.payload.toolkit_id
            : "";

      const shouldCacheSessionDecision =
        shouldCacheToolConfirmationDecision({
          approved,
          scope,
          toolkitId,
          toolName,
        }) && toolName !== HUMAN_INPUT_TOOL_NAME;
      const interactConfig =
        confirmationRequest?.interactConfig &&
        typeof confirmationRequest.interactConfig === "object"
          ? confirmationRequest.interactConfig
          : requestFrame?.payload?.interact_config &&
              typeof requestFrame.payload.interact_config === "object"
            ? requestFrame.payload.interact_config
            : {};
      const requestArguments =
        confirmationRequest?.arguments &&
        typeof confirmationRequest.arguments === "object"
          ? confirmationRequest.arguments
          : requestFrame?.payload?.arguments &&
              typeof requestFrame.payload.arguments === "object"
            ? requestFrame.payload.arguments
            : {};

      if (toolName === HUMAN_INPUT_TOOL_NAME) {
        unchainLogger.log("ask_user_question_submit", {
          confirmationId: normalizedConfirmationId,
          callId,
          approved: Boolean(approved),
          userResponse,
          interactRequestId:
            typeof interactConfig.request_id === "string"
              ? interactConfig.request_id
              : "",
          argumentRequestId:
            typeof requestArguments.request_id === "string"
              ? requestArguments.request_id
              : "",
          question:
            typeof interactConfig.question === "string"
              ? interactConfig.question
              : typeof requestArguments.question === "string"
                ? requestArguments.question
                : "",
          selectionMode:
            typeof interactConfig.selection_mode === "string"
              ? interactConfig.selection_mode
              : typeof requestArguments.selection_mode === "string"
                ? requestArguments.selection_mode
                : "",
        });
      }

      const current =
        toolConfirmationUiStateByChatIdRef.current[targetChatId]?.[
          normalizedConfirmationId
        ] || {};
      if (current.status === "submitting" || current.status === "submitted") {
        return;
      }

      updateToolConfirmationUiState(targetChatId, (previous) => ({
        ...previous,
        [normalizedConfirmationId]: {
          ...(previous[normalizedConfirmationId] || {}),
          status: "submitting",
          error: "",
          resolved: false,
          decision: "",
        },
      }));

      try {
        const payload = {
          confirmation_id: normalizedConfirmationId,
          approved: Boolean(approved),
          reason: "",
          session_id: sessionId,
        };
        if (userResponse !== undefined && userResponse !== null) {
          payload.modified_arguments = { user_response: userResponse };
        }
        const response = await submitToolConfirmationWithRetry(payload, {
          targetChatId,
          runGeneration,
        });
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
          return;
        }
        if (shouldCacheSessionDecision) {
          let allowedTools = sessionAutoApproveRef.current.get(targetChatId);
          if (!allowedTools) {
            allowedTools = new Set();
            sessionAutoApproveRef.current.set(targetChatId, allowedTools);
          }
          allowedTools.add(`${toolkitId}:${toolName}`);
        }
        if (
          runtime?.followupSignalById.get(normalizedConfirmationId) !== true
        ) {
          runtime?.followupSignalById.set(normalizedConfirmationId, false);
        }
        clearConfirmationResolutionTimer(targetChatId, normalizedConfirmationId);
        appendSyntheticToolConfirmationDecision({
          targetChatId,
          confirmationId: normalizedConfirmationId,
          approved: Boolean(approved),
          userResponse,
        });
        updateToolConfirmationUiState(targetChatId, (previous) => ({
          ...previous,
          [normalizedConfirmationId]: {
            ...(previous[normalizedConfirmationId] || {}),
            status: "submitted",
            error: "",
            resolved: true,
            decision: approved ? "approved" : "denied",
            userResponse: userResponse ?? null,
          },
        }));
        continueFromRecordedReceipt(
          targetChatId,
          sessionId,
          response,
          runGeneration,
        );
      } catch (error) {
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
          return;
        }
        clearConfirmationResolutionTimer(targetChatId, normalizedConfirmationId);
        const errorMessage =
          (typeof error?.message === "string" && error.message) ||
          "Failed to submit confirmation";
        updateToolConfirmationUiState(targetChatId, (previous) => ({
          ...previous,
          [normalizedConfirmationId]: {
            ...(previous[normalizedConfirmationId] || {}),
            status: "error",
            error: errorMessage,
            resolved: false,
          },
        }));
      }
    },
    [
      appendSyntheticToolConfirmationDecision,
      activeChatIdRef,
      clearConfirmationResolutionTimer,
      continueFromRecordedReceipt,
      findToolCallFrameByCallId,
      getRunGeneration,
      getConfirmationRuntimeForChat,
      isRunGenerationCurrent,
      submitToolConfirmationWithRetry,
      updateToolConfirmationUiState,
    ],
  );

  const handleContinuationDecision = useCallback(
    async ({ confirmationId, approved }) => {
      const targetChatId = activeChatIdRef.current;
      const normalizedId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!targetChatId || !normalizedId) return;
      const runGeneration = getRunGeneration(targetChatId);
      if (!isRunGenerationCurrent(targetChatId, runGeneration)) return;

      const current =
        pendingContinuationRequestsByChatIdRef.current[targetChatId] || null;
      if (
        !current ||
        current.confirmationId !== normalizedId ||
        current.status === "submitting"
      ) {
        return;
      }

      updatePendingContinuationRequestForChat(targetChatId, {
        ...current,
        status: "submitting",
      });

      try {
        const sessionId =
          activeRunThreadIdByChatIdRef.current.get(targetChatId) || targetChatId;
        const response = await submitToolConfirmationWithRetry(
          {
            confirmation_id: normalizedId,
            approved: Boolean(approved),
            reason: "",
            session_id: sessionId,
          },
          { targetChatId, runGeneration },
        );
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) return;
        updatePendingContinuationRequestForChat(targetChatId, (latest) =>
          latest?.confirmationId === normalizedId ? null : latest,
        );
        continueFromRecordedReceipt(
          targetChatId,
          sessionId,
          response,
          runGeneration,
        );
      } catch (_error) {
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) return;
        updatePendingContinuationRequestForChat(targetChatId, (latest) =>
          latest?.confirmationId === normalizedId
            ? { ...latest, status: "idle" }
            : latest,
        );
      }
    },
    [
      activeChatIdRef,
      continueFromRecordedReceipt,
      getRunGeneration,
      isRunGenerationCurrent,
      submitToolConfirmationWithRetry,
      updatePendingContinuationRequestForChat,
    ],
  );

  const isToolCallAutoApprovable = useCallback((targetChatId, frame) => {
    const normalizedChatId =
      typeof targetChatId === "string" ? targetChatId.trim() : "";
    const toolName =
      typeof frame?.payload?.tool_name === "string"
        ? frame.payload.tool_name
        : "";
    const toolkitId =
      typeof frame?.payload?.toolkit_id === "string"
        ? frame.payload.toolkit_id
        : "";
    const itype =
      typeof frame?.payload?.interact_type === "string"
        ? frame.payload.interact_type
        : "";
    const isSessionAllowed = Boolean(
      normalizedChatId &&
        sessionAutoApproveRef.current
          .get(normalizedChatId)
          ?.has(`${toolkitId}:${toolName}`),
    );
    return (
      isToolConfirmationCacheable(toolkitId, toolName) &&
      toolName !== HUMAN_INPUT_TOOL_NAME &&
      (!itype || itype === "confirmation") &&
      (isToolAutoApproved(toolkitId, toolName) || isSessionAllowed)
    );
  }, []);

  const restoreManualToolConfirmationRequest = useCallback(
    ({ targetChatId, confirmationId, request, error }) => {
      const errorMessage =
        (typeof error?.message === "string" && error.message) ||
        "Failed to submit confirmation";

      updatePendingToolConfirmationRequests(targetChatId, (previous) =>
        previous[confirmationId]
          ? previous
          : {
              ...previous,
              [confirmationId]: request,
            },
      );
      updateToolConfirmationUiState(targetChatId, (previous) => ({
        ...previous,
        [confirmationId]: {
          ...(previous[confirmationId] || {}),
          status: "error",
          error: errorMessage,
          resolved: false,
          decision: "",
        },
      }));
    },
    [updatePendingToolConfirmationRequests, updateToolConfirmationUiState],
  );

  const submitAutoApprovedToolConfirmation = useCallback(
    ({ targetChatId, confirmationId, request }) => {
      const runGeneration = getRunGeneration(targetChatId);
      if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
        return;
      }
      const runtime = getConfirmationRuntimeForChat(targetChatId);
      updatePendingToolConfirmationRequests(targetChatId, (previous) => {
        if (!previous[confirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[confirmationId];
        return next;
      });
      updateToolConfirmationUiState(targetChatId, (previous) => ({
        ...previous,
        [confirmationId]: {
          ...(previous[confirmationId] || {}),
          status: "submitted",
          error: "",
          resolved: true,
          decision: "approved",
        },
      }));

      const autoPayload = {
        confirmation_id: confirmationId,
        approved: true,
        reason: "",
        session_id:
          runtime?.sessionIdByConfirmationId.get(confirmationId) || targetChatId,
      };

      try {
        Promise.resolve(
          submitToolConfirmationWithRetry(autoPayload, {
            targetChatId,
            runGeneration,
          }),
        )
          .then((response) => {
            if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
              return;
            }
            if (
              runtime?.followupSignalById.get(confirmationId) !== true
            ) {
              runtime?.followupSignalById.set(confirmationId, false);
            }
            clearConfirmationResolutionTimer(targetChatId, confirmationId);
            appendSyntheticToolConfirmationDecision({
              targetChatId,
              confirmationId,
              approved: true,
            });
            continueFromRecordedReceipt(
              targetChatId,
              autoPayload.session_id,
              response,
              runGeneration,
            );
          })
          .catch((error) => {
            if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
              return;
            }
            clearConfirmationResolutionTimer(targetChatId, confirmationId);
            restoreManualToolConfirmationRequest({
              targetChatId,
              confirmationId,
              request,
              error,
            });
        });
      } catch (error) {
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) {
          return;
        }
        clearConfirmationResolutionTimer(targetChatId, confirmationId);
        restoreManualToolConfirmationRequest({
          targetChatId,
          confirmationId,
          request,
          error,
        });
      }
    },
    [
      appendSyntheticToolConfirmationDecision,
      clearConfirmationResolutionTimer,
      continueFromRecordedReceipt,
      getRunGeneration,
      getConfirmationRuntimeForChat,
      isRunGenerationCurrent,
      restoreManualToolConfirmationRequest,
      submitToolConfirmationWithRetry,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );

  const replaceSessionMemoryForMessages = useCallback(
    async (
      targetSessionId,
      nextMessages,
      {
        forceMemoryEnabled = false,
        memoryNamespace = "",
        modelId = modelIdRef.current,
        targetChatId = chatId,
        operationId = "",
        expectedSessionRevision = null,
        expectedCancelAttemptId = "",
      } = {},
    ) => {
      if (
        !targetSessionId ||
        (forceMemoryEnabled !== true && readMemorySettings().enabled !== true)
      ) {
        return { applied: true, skipped: true, response: null, error: null };
      }

      try {
        const response = await api.unchain.replaceSessionMemory({
          sessionId: targetSessionId,
          messages: buildHistoryForModel(nextMessages, targetChatId),
          ...(operationId
            ? {
                operationId,
                operation_id: operationId,
              }
            : {}),
          ...(Number.isInteger(expectedSessionRevision)
            ? {
                expectedSessionRevision,
                expected_session_revision: expectedSessionRevision,
              }
            : {}),
          ...(expectedCancelAttemptId
            ? {
                expectedCancelAttemptId,
                expected_cancel_attempt_id: expectedCancelAttemptId,
              }
            : {}),
          options: {
            modelId,
            ...(forceMemoryEnabled === true ? { memory_enabled: true } : {}),
            ...(memoryNamespace
              ? { memory_namespace: memoryNamespace }
              : {}),
          },
        });

        if (response?.applied === false) {
          const error = createTurnMutationResponseError(response);
          if (activeChatIdRef.current === targetChatId) {
            setStreamError(error.message);
          }
          return { applied: false, skipped: false, response, error };
        }

        return { applied: true, skipped: false, response, error: null };
      } catch (error) {
        if (activeChatIdRef.current === targetChatId) {
          setStreamError(
            error?.message || "Failed to sync short-term memory for this chat.",
          );
        }
        return { applied: false, skipped: false, response: null, error };
      }
    },
    [activeChatIdRef, buildHistoryForModel, chatId, modelIdRef, setStreamError],
  );

  const readMemorySessionRevision = useCallback(
    async (targetSessionId, { forceMemoryEnabled = false } = {}) => {
      if (
        !targetSessionId ||
        (forceMemoryEnabled !== true && readMemorySettings().enabled !== true)
      ) {
        return null;
      }
      const exported = await api.unchain.getSessionMemoryExport(
        targetSessionId,
      );
      const revision = Number(
        exported?.session_revision ?? exported?.sessionRevision,
      );
      if (!Number.isInteger(revision) || revision < 0) {
        const error = new Error(
          "Unable to verify the current session revision before rewriting memory.",
        );
        error.code = "session_revision_unavailable";
        throw error;
      }
      return revision;
    },
    [],
  );

  /* ── Memory V2 P0 turn-mutation admission ────────────────────────────────
     Resolves, from the SESSION HEAD CONTRACT alone, which memory subsystem
     owns this chat's visible history. Deliberately consults neither
     readMemorySettings() nor any vector/embedding state: whether the legacy
     short-term memory is enabled says nothing about whether a Context V2
     journal exists, and a mutation that rewrites the wrong one cannot be
     undone (the pre-mutation generation is already sealed).

     Exactly two outcomes run the legacy V1 rewrite: the feature flag is off,
     or the head unambiguously reports no V2 state for this session. Every
     other shape blocks. See decideTurnMutationMemoryMode for the rules. */
  const resolveTurnMutationMemoryPlan = useCallback(
    async ({ ownerChatId, sessionId }) => {
      if (!isFeatureFlagEnabled("enable_memory_v2")) {
        return decideTurnMutationMemoryMode({ flagEnabled: false });
      }
      if (!contextV2Bridge.isAvailable()) {
        return decideTurnMutationMemoryMode({
          flagEnabled: true,
          bridgeAvailable: false,
        });
      }
      let head = null;
      let headErrorCode = "";
      try {
        head = await contextV2Bridge.getSessionHead({ ownerChatId, sessionId });
      } catch (error) {
        /* Only the stable code crosses; the message is main-built and may
           carry request detail, so it is never surfaced. */
        headErrorCode = parseContextV2ErrorCode(error) || "context_v2_failed";
      }
      return decideTurnMutationMemoryMode({
        flagEnabled: true,
        bridgeAvailable: true,
        head,
        headErrorCode,
        ownerChatId,
        sessionId,
      });
    },
    [],
  );

  /* Applies the memory half of a turn mutation from the DURABLE OUTBOX ENTRY
     — never from live state. For V2 that means replaying the frozen
     v2RebasePayload byte-for-byte: the session head is read exactly once, at
     enqueue time, and a recovery must not re-read it (a newer head would
     describe a different generation and silently rebase away whatever
     happened in between).

     A SHADOW-admitted chat writes BOTH subsystems, strictly journal-first:
     rebase → verify ack → record ack → V1 authoritative replace → record
     v1MirrorState. Under shadow the model still reads V1 short-term memory, so
     skipping the second leg would leave the edited/deleted turn visible to the
     model — shadow silently changing model input, which is the one thing
     shadow is defined not to do. An ACTIVE chat never touches V1: there the
     journal is the model input. See context_v2_turn_mutation's header.

     If the V1 leg fails after the ack, this returns applied:false so NOTHING
     is committed and no run starts; the row survives as PARTIAL (v2Ack +
     v1MirrorState "pending") and keeps the chat locked until it converges.

     Returns the same {applied, skipped, response, error} shape the legacy path
     already used, plus the durable retry decision for V2 recovery. */
  const applyTurnMutationMemory = useCallback(
    async (entry, { replacementMessages = [], targetChatId = "" } = {}) => {
      if (entry?.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2) {
        return replaceSessionMemoryForMessages(
          entry.sessionId,
          replacementMessages,
          {
            forceMemoryEnabled: entry.forceMemoryEnabled,
            memoryNamespace: entry.memoryNamespace,
            modelId: entry.modelId,
            targetChatId,
            operationId: entry.operationId,
            expectedSessionRevision: entry.expectedSessionRevision,
            expectedCancelAttemptId: entry.expectedCancelAttemptId,
          },
        );
      }

      const alreadyApplied = Boolean(
        entry.v2Ack &&
          (entry.admissionMode !== TURN_MUTATION_ADMISSION_MODES.SHADOW ||
            entry.v1MirrorState === TURN_MUTATION_V1_MIRROR_STATES.APPLIED),
      );
      if (alreadyApplied) {
        return {
          applied: true,
          skipped: true,
          response: null,
          error: null,
          terminal: false,
          retryAction: "",
          retryAt: 0,
        };
      }

      /* Reserve durably BEFORE either memory leg. If the renderer disappears
         after this write, the next mount resumes the remaining budget instead
         of treating the operation as new. */
      const reservedEntry = reserveTurnMutationRetryAttempt(entry.operationId);
      if (!reservedEntry) {
        const current = readTurnMutationOutbox().find(
          (candidate) => candidate.operationId === entry.operationId,
        );
        const message = CONTEXT_V2_TURN_MUTATION_MESSAGES.QUARANTINED;
        const error = new Error(message);
        error.code = current?.lastFailureCode || "context_v2_retry_deferred";
        error.retryable = false;
        return {
          applied: false,
          skipped: false,
          response: null,
          error,
          terminal:
            current?.retryStatus ===
            TURN_MUTATION_RETRY_STATUSES.QUARANTINED,
          retryAction: current?.retryStatus || "deferred",
          retryAt: current?.retryAt || 0,
        };
      }

      const payload = reservedEntry.v2RebasePayload;
      /* `staticMessage` lets the V1 mirror leg supply its own mapping — its
         codes are V1/bridge codes, which contextV2TurnMutationMessage would
         misread. Either way the surfaced string is a fixed literal: the V1
         replace helper may have just set a sidecar-authored message on the
         stream error, and overwriting it here in the same continuation is what
         keeps server text off the screen. */
      const fail = (errorCode, staticMessage = "") => {
        const decision = resolveContextV2TurnMutationFailure({
          errorCode,
          replayAttempts: reservedEntry.replayAttempts,
        });
        const retryAt =
          decision.action === TURN_MUTATION_RETRY_ACTIONS.RETRY
            ? Date.now() + decision.delayMs
            : 0;
        const recorded = recordTurnMutationRetryOutcome(
          reservedEntry.operationId,
          {
            action: decision.action,
            code: errorCode,
            retryAt,
          },
        );
        if (!recorded) {
          const message = CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST;
          if (activeChatIdRef.current === targetChatId) {
            setStreamError(message);
          }
          const persistError = new Error(message);
          persistError.code = "context_v2_persist_failed";
          persistError.retryable = false;
          return {
            applied: false,
            skipped: false,
            response: null,
            error: persistError,
            terminal: true,
            retryAction: "persist_failed",
            retryAt: 0,
          };
        }
        if (decision.action === TURN_MUTATION_RETRY_ACTIONS.IN_PROGRESS) {
          turnMutationInProgressSeenRef.current.add(reservedEntry.operationId);
        }
        const quarantined =
          decision.action === TURN_MUTATION_RETRY_ACTIONS.QUARANTINE;
        const message = quarantined
          ? CONTEXT_V2_TURN_MUTATION_MESSAGES.QUARANTINED
          : staticMessage || contextV2TurnMutationMessage(errorCode);
        if (activeChatIdRef.current === targetChatId) {
          setStreamError(message);
        }
        const error = new Error(message);
        error.code = errorCode;
        error.retryable = !quarantined;
        return {
          applied: false,
          skipped: false,
          response: null,
          error,
          terminal: quarantined,
          retryAction: recorded?.retryStatus || decision.action,
          retryAt: recorded?.retryAt || retryAt,
        };
      };

      if (!payload) return fail("context_v2_invalid_request");

      /* ── Leg [1]: the canonical journal rebase ───────────────────────────
         A durably recorded ack means the server already committed this exact
         rebase, so the rebase is skipped entirely on a replay — re-sending
         would only fetch the receipt back. */
      if (!reservedEntry.v2Ack) {
        if (!contextV2Bridge.isAvailable()) {
          return fail("context_v2_unavailable");
        }

        let ack = null;
        try {
          ack = await contextV2Bridge.rebaseSession(payload);
        } catch (error) {
          const errorCode =
            parseContextV2ErrorCode(error) || "context_v2_failed";
          return fail(errorCode);
        }
        /* Server ack or nothing: a local fingerprint match is NOT evidence the
           journal was rebased. An ack that fails verification is treated as
           retryable, not terminal — replaying the frozen payload returns the
           idempotency receipt, so a later attempt can still resolve it. */
        if (!verifyContextV2RebaseAck(ack, payload)) {
          return fail("context_v2_ack_invalid");
        }
        const recordedAck = recordTurnMutationRebaseAck(
          payload.operationId,
          projectContextV2RebaseAck(ack),
        );
        if (!recordedAck) {
          return fail(
            "context_v2_persist_failed",
            CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
          );
        }
      }

      /* ── Leg [2]: the authoritative V1 replace, SHADOW ONLY ──────────────
         Absent admissionMode = a row frozen before this leg existed; it stays
         rebase-only (see the outbox normalizer). "applied" = a previous
         attempt already converged this leg. */
      if (
        reservedEntry.admissionMode !== TURN_MUTATION_ADMISSION_MODES.SHADOW ||
        reservedEntry.v1MirrorState === TURN_MUTATION_V1_MIRROR_STATES.APPLIED
      ) {
        return {
          applied: true,
          skipped: false,
          response: null,
          error: null,
          terminal: false,
          retryAction: "",
          retryAt: 0,
        };
      }

      /* Content comes from the ONE frozen artifact — the same
         replacementHistory the journal was rebased to — never from
         `replacementMessages`, which is live state. Both legs therefore
         describe byte-identically the same post-mutation conversation, and a
         replay is deterministic no matter how long it was interrupted.

         No expectedSessionRevision and no expectedCancelAttemptId are sent:
         the chat-level mutation claim has already serialised every writer, and
         the V2 rebase's own open-attempt fence has already refused to run
         while an attempt was live. Re-fencing a frozen replay on a transient
         id would strand the PARTIAL row instead of converging it. The replace
         is a whole-history, content-addressed overwrite, so replaying is
         naturally idempotent; operationId lets the sidecar dedupe it too. */
      const mirrorResult = await replaceSessionMemoryForMessages(
        reservedEntry.sessionId,
        payload.replacementHistory,
        {
          forceMemoryEnabled: reservedEntry.forceMemoryEnabled,
          memoryNamespace: reservedEntry.memoryNamespace,
          modelId: reservedEntry.modelId,
          targetChatId,
          operationId: reservedEntry.operationId,
        },
      );
      if (!mirrorResult.applied) {
        /* NEVER terminal, whatever the V1 code says. A terminal result lets
           the call sites discard the row — but the journal has already been
           rebased, so discarding would strip the only record that V1 is behind
           and silently unlock the chat with dirty short-term memory. Retrying
           forever (recovery gives up into a manual-review error after its
           backoff) is the strictly safer failure. */
        const mirrorErrorCode =
          typeof mirrorResult.error?.code === "string" &&
          mirrorResult.error.code.trim()
            ? mirrorResult.error.code.trim()
            : CONTEXT_V2_V1_MIRROR_ERROR_CODE;
        return fail(
          mirrorErrorCode,
          contextV2V1MirrorMessage(mirrorErrorCode),
        );
      }
      const recordedMirror = recordTurnMutationV1MirrorApplied(
        payload.operationId,
      );
      if (!recordedMirror) {
        return fail(
          "context_v2_persist_failed",
          CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
        );
      }
      return {
        applied: true,
        skipped: false,
        response: null,
        error: null,
        terminal: false,
        retryAction: "",
        retryAt: 0,
      };
    },
    [activeChatIdRef, replaceSessionMemoryForMessages, setStreamError],
  );

  const runTurnRequest = useCallback(
    async ({
      mode,
      chatId: targetChatId,
      text,
      attachments = [],
      baseMessages = [],
      clearComposer = false,
      reuseUserMessage = null,
      missingAttachmentPayloadMode = "block",
      /* Plugins pulled in by command usage for THIS run only (ephemeral —
         never written to the session's selected toolkits). */
      extraToolkits = [],
      /* Composer sidecar (contract v1) for THIS content, freshly computed by
         the caller against `text`. Presentation-only, never model-visible.
         Null for every path that isn't a composer/edit command send. */
      composer = null,
      /* Memory V2 P0 secret gate proof. `secretGateToken` is a one-time token
         minted by useSecretCaptureGate for the exact (chatId, secretGateText)
         pair the user reviewed. The final fail-closed guard below consumes it;
         without it, text that still trips the scanner is never sent.
         `secretGateText` is the PRE-EXPANSION text — what the user actually
         saw in the modal — which is what the token is bound to. */
      secretGateToken = "",
      secretGateText = "",
      /* INTERNAL ONLY. Set by the transparent memory-fallback retry below,
         which re-enters runTurnRequest with text this same call already put
         through the guard (and whose one-time token is therefore already
         spent). No caller outside this file may set it: it is the single
         documented way past the guard, and it exists so an app-initiated
         retry of an already-approved send cannot be refused. */
      secretGateSettled = false,
      memoryFallbackAttempted = false,
      forceHistoryFallback = false,
      historyOverride = null,
      characterAgentConfig = null,
      durableInteraction = null,
      durableResumeAttempt = 0,
      durableOwnerMessageId = "",
      runGeneration: requestedRunGeneration = null,
      runContext: requestedRunContext = null,
      turnMutationOperationId = "",
      onConsumed = null,
      onReject = null,
      relayItemIds = [],
      relayItems = [],
      relaySourceAttemptId = "",
      relaySourceClientOperationId = "",
      continuedFromRunId = "",
    }) => {
      /* Queue-relay acceptance protocol (see relayQueuedTurnsAfterRun):
         onConsumed fires exactly once, and only on authoritative server
         acceptance evidence (V4 run/turn/step.started, V2
         run_started/response_received/final_message, any token, or a successful
         done fallback). onReject fires at most once, only when the run reaches a
         terminal failure BEFORE any acceptance evidence and was NOT cancelled by
         the user — a Stop/cancel must never resurrect a relayed turn. The two
         are mutually exclusive. */
      let requestConsumed = false;
      let requestRejected = false;
      let queueRelayAcceptanceTimer = null;
      let queueRelayAcceptanceReattachCount = 0;
      let streamHandle = null;
      let terminalAccountingPending = false;
      const clearQueueRelayAcceptanceTimer = () => {
        if (queueRelayAcceptanceTimer == null) return;
        const timerId = queueRelayAcceptanceTimer;
        clearTimeout(timerId);
        const trackedTimers =
          queueRelayTimersByChatIdRef.current.get(targetChatId);
        trackedTimers?.delete(timerId);
        if (trackedTimers?.size === 0) {
          queueRelayTimersByChatIdRef.current.delete(targetChatId);
        }
        queueRelayAcceptanceTimer = null;
      };
      const isQueueRelayRequest =
        typeof onConsumed === "function" || typeof onReject === "function";
      const exactRelayItemIds = new Set(
        (Array.isArray(relayItemIds) ? relayItemIds : [])
          .filter((itemId) => typeof itemId === "string")
          .map((itemId) => itemId.trim())
          .filter(Boolean),
      );
      const exactRelayItems = (Array.isArray(relayItems) ? relayItems : [])
        .filter(
          (item) =>
            exactRelayItemIds.has(item?.id) &&
            typeof item?.text === "string" &&
            item.text.trim(),
        )
        .map((item) => ({
          id: item.id,
          text: item.text,
          status: "queued",
        }));
      const markRequestConsumed = () => {
        if (requestConsumed || requestRejected) return;
        requestConsumed = true;
        clearQueueRelayAcceptanceTimer();
        if (typeof onConsumed === "function") onConsumed();
      };
      const rejectRequestBeforeAcceptance = () => {
        if (requestConsumed || requestRejected) return;
        requestRejected = true;
        clearQueueRelayAcceptanceTimer();
        if (typeof onReject === "function") onReject();
      };
      const isDurableResume = Boolean(
        mode === "resume_interaction" &&
        durableInteraction?.status === "receipt_recorded" &&
        typeof durableInteraction?.sessionId === "string" &&
        durableInteraction.sessionId.trim() &&
        typeof durableInteraction?.interactionId === "string" &&
        durableInteraction.interactionId.trim(),
      );
      const trimmedText = typeof text === "string" ? text.trim() : "";
      const normalizedAttachments = Array.isArray(attachments)
        ? attachments
        : [];
      const hasAttachments = normalizedAttachments.length > 0;
      const promptText =
        trimmedText ||
        (hasAttachments ? createAttachmentPrompt(normalizedAttachments) : "");
      if (
        !targetChatId ||
        (!isDurableResume && !promptText && !hasAttachments)
      ) {
        return false;
      }

      const turnMutationOwner =
        turnMutationByChatIdRef.current.get(targetChatId) || null;
      if (
        turnMutationOwner &&
        turnMutationOwner.operationId !== turnMutationOperationId
      ) {
        return false;
      }
      if (!turnMutationOwner && turnMutationOperationId) {
        return false;
      }

      /* ── Memory V2 P0 secret gate — final fail-closed guard ────────────────
         THIS IS THE EARLIEST FEASIBLE POSITION and it must stay here.
         Everything above is a pure read or an early return; everything below
         mutates something — beginRunGeneration, runClientOperationId,
         releaseTurnMutation, the composer draft claim, runContext,
         markChatStarted, the render runtime, pending-confirmation cleanup,
         then chat_storage / the journal / the outbox / the stream.

         All capture and deposit already happened in useSecretCaptureGate,
         strictly before this call. Nothing is stored or redacted here; the
         only job is to prove the user reviewed this send.

         The subject of the check is the PRE-EXPANSION text the user actually
         saw (`secretGateText`), not `promptText`. Composer plugin-skill
         expansion runs AFTER the gate and splices in app-authored content, so
         scanning the expanded body here would fail closed on a skill's own
         example credentials even though the user's own text was clean and
         reviewed. Callers that pass no gated text fall back to promptText, so
         an ungated programmatic path is refused rather than exempted. */
      if (!isDurableResume && !secretGateSettled) {
        const gatedText =
          typeof secretGateText === "string" && secretGateText
            ? secretGateText
            : promptText;
        const gateToken =
          typeof secretGateToken === "string" ? secretGateToken.trim() : "";
        const failSecretGateClosed = (staticMessage) => {
          setStreamErrorForChat(targetChatId, staticMessage);
          return false;
        };
        if (gateToken) {
          /* Consumed exactly once, and only for THIS chat and THIS exact
             reviewed text. A replay, a token minted in another chat, and text
             edited after approval all land here and stop the send. BOTH
             decisions mint a token — a "stored" approval is spent here just
             like a "plain" one, so neither can be reused for a second send. */
          if (
            !consumeSecretGateToken(gateToken, {
              chatId: targetChatId,
              text: gatedText,
            })
          ) {
            return failSecretGateClosed(
              SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
            );
          }
        } else {
          /* No token, so the text is only allowed through if it is genuinely
             clean. A surviving credential OR any {{secret:...}} syntax means
             a caller skipped the gate. Static text only. */
          const scan = scanOutgoingSecretText(gatedText);
          if (!scan.ok) {
            return failSecretGateClosed(
              SECRET_CAPTURE_MESSAGES[scan.code] ||
                SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
            );
          }
          if (scan.candidates.length > 0) {
            return failSecretGateClosed(
              SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
            );
          }
        }
      }

      /* Capture the originating chat's composer before attachment hydration or
         character preflight can yield and let another chat become active. */
      const previousInputValue = clearComposer ? inputValueRef.current : "";
      const previousDraftAttachments =
        clearComposer && Array.isArray(draftAttachmentsRef.current)
          ? [...draftAttachmentsRef.current]
          : [];
      const previousComposerRevision =
        composerRevisionByChatIdRef?.current?.get?.(targetChatId) || 0;
      let composerDraftClaimId = null;
      let usesComposerDraftClaim = false;

      const releaseComposerDraftClaim = () => {
        if (
          usesComposerDraftClaim &&
          composerDraftClaimId &&
          typeof storageApi.releaseChatDraftClaim === "function"
        ) {
          storageApi.releaseChatDraftClaim(
            targetChatId,
            composerDraftClaimId,
          );
        }
        composerDraftClaimId = null;
      };

      const replaceComposerDraftClaim = (nextDraft) => {
        if (
          !usesComposerDraftClaim ||
          !composerDraftClaimId ||
          typeof storageApi.replaceClaimedChatDraft !== "function"
        ) {
          return false;
        }
        const result = storageApi.replaceClaimedChatDraft(
          targetChatId,
          composerDraftClaimId,
          nextDraft,
          { source: "chat-page" },
        );
        if (!result?.applied || !result.claimId) {
          composerDraftClaimId = null;
          return false;
        }
        composerDraftClaimId = result.claimId;
        return true;
      };

      const isOriginatingComposerUnchanged = () =>
        (composerRevisionByChatIdRef?.current?.get?.(targetChatId) || 0) ===
          previousComposerRevision &&
        inputValueRef.current === previousInputValue &&
        sameDraftAttachments(
          draftAttachmentsRef.current,
          previousDraftAttachments,
        );

      const activeRunGeneration =
        Number.isInteger(requestedRunGeneration) && requestedRunGeneration > 0
          ? requestedRunGeneration
          : beginRunGeneration(targetChatId);
      const runClientOperationId = createQueuedTurnClientOperationId();
      runClientOperationIdByChatIdRef.current.set(
        targetChatId,
        runClientOperationId,
      );
      if (
        !Number.isInteger(requestedRunGeneration) ||
        requestedRunGeneration <= 0
      ) {
        executionIdentityByChatIdRef.current.delete(targetChatId);
      }
      const isCurrentRun = () =>
        isRunGenerationCurrent(targetChatId, activeRunGeneration);
      if (!isCurrentRun()) {
        return false;
      }
      runPreflightGenerationByChatIdRef.current.set(
        targetChatId,
        activeRunGeneration,
      );
      /* Owner -> preflight handoff is synchronous and identity-scoped: there
         is never a moment where neither guard exists, and unrelated internal
         retries cannot consume another operation's reservation. */
      if (turnMutationOwner) {
        releaseTurnMutation(turnMutationOwner);
      }
      const finishRunPreflight = () => {
        if (
          runPreflightGenerationByChatIdRef.current.get(targetChatId) ===
          activeRunGeneration
        ) {
          runPreflightGenerationByChatIdRef.current.delete(targetChatId);
          /* The mutation owner was released during the synchronous handoff.
             Wake recovery again after preflight ends so an attachment or
             character-preparation failure cannot strand its durable outbox. */
          if (turnMutationOperationId) {
            notifyTurnMutationChange(targetChatId);
          }
        }
      };

      if (
        clearComposer &&
        typeof storageApi.claimChatDraft === "function" &&
        typeof storageApi.replaceClaimedChatDraft === "function" &&
        typeof storageApi.releaseChatDraftClaim === "function"
      ) {
        const claim = storageApi.claimChatDraft(
          targetChatId,
          {
            text: previousInputValue,
            attachments: previousDraftAttachments,
          },
          { source: "chat-page" },
        );
        if (claim?.claimed && claim.claimId) {
          usesComposerDraftClaim = true;
          composerDraftClaimId = claim.claimId;
        }
      }

      const storedRunContext =
        runContextByChatIdRef.current.get(targetChatId) || null;
      const runModelId =
        typeof requestedRunContext?.modelId === "string"
          ? requestedRunContext.modelId
          : typeof storedRunContext?.modelId === "string"
            ? storedRunContext.modelId
            : typeof modelIdRef?.current === "string"
              ? modelIdRef.current
              : "";
      const runThreadId =
        typeof requestedRunContext?.threadId === "string"
          ? requestedRunContext.threadId
          : typeof storedRunContext?.threadId === "string"
            ? storedRunContext.threadId
            : typeof threadIdRef?.current === "string"
              ? threadIdRef.current
              : "";
      const runSelectedToolkits = Array.isArray(
        requestedRunContext?.selectedToolkits,
      )
        ? [...requestedRunContext.selectedToolkits]
        : Array.isArray(storedRunContext?.selectedToolkits)
          ? [...storedRunContext.selectedToolkits]
          : Array.isArray(selectedToolkits)
            ? [...selectedToolkits]
            : [];
      const runSelectedWorkspaceIds = Array.isArray(
        requestedRunContext?.selectedWorkspaceIds,
      )
        ? [...requestedRunContext.selectedWorkspaceIds]
        : Array.isArray(storedRunContext?.selectedWorkspaceIds)
          ? [...storedRunContext.selectedWorkspaceIds]
          : Array.isArray(selectedWorkspaceIds)
            ? [...selectedWorkspaceIds]
            : [];
      const runSelectedRecipeName =
        typeof requestedRunContext?.selectedRecipeName === "string"
          ? requestedRunContext.selectedRecipeName
          : typeof storedRunContext?.selectedRecipeName === "string"
            ? storedRunContext.selectedRecipeName
            : typeof selectedRecipeName === "string"
              ? selectedRecipeName
              : "Default";
      const runAgentOrchestration = normalizeAgentOrchestration(
        requestedRunContext?.agentOrchestration ||
          storedRunContext?.agentOrchestration ||
          agentOrchestration,
      );
      const runSystemPromptOverrides =
        requestedRunContext?.systemPromptOverrides &&
        typeof requestedRunContext.systemPromptOverrides === "object" &&
        !Array.isArray(requestedRunContext.systemPromptOverrides)
          ? { ...requestedRunContext.systemPromptOverrides }
          : storedRunContext?.systemPromptOverrides &&
              typeof storedRunContext.systemPromptOverrides === "object" &&
              !Array.isArray(storedRunContext.systemPromptOverrides)
            ? { ...storedRunContext.systemPromptOverrides }
            : systemPromptOverrides &&
                typeof systemPromptOverrides === "object" &&
                !Array.isArray(systemPromptOverrides)
              ? { ...systemPromptOverrides }
              : {};
      const runKind =
        requestedRunContext?.kind === "character" ||
        requestedRunContext?.kind === "default"
          ? requestedRunContext.kind
          : storedRunContext?.kind === "character" ||
              storedRunContext?.kind === "default"
            ? storedRunContext.kind
            : isCharacterChat
              ? "character"
              : "default";
      const runCharacterId =
        typeof requestedRunContext?.characterId === "string"
          ? requestedRunContext.characterId.trim()
          : typeof storedRunContext?.characterId === "string"
            ? storedRunContext.characterId.trim()
            : typeof characterId === "string"
              ? characterId.trim()
              : "";
      const runIsCharacterChat =
        runKind === "character" && Boolean(runCharacterId);
      const effectiveRunContext = {
        modelId: runModelId,
        threadId: runThreadId,
        selectedToolkits: runSelectedToolkits,
        selectedWorkspaceIds: runSelectedWorkspaceIds,
        selectedRecipeName: runSelectedRecipeName,
        agentOrchestration: runAgentOrchestration,
        systemPromptOverrides: runSystemPromptOverrides,
        kind: runKind,
        characterId: runCharacterId,
        isCharacterChat: runIsCharacterChat,
      };
      runContextByChatIdRef.current.set(targetChatId, effectiveRunContext);
      if (
        !isDurableResume &&
        typeof storageApi.markChatStarted === "function"
      ) {
        storageApi.markChatStarted(targetChatId, { source: "chat-page" });
      }

      clearActiveTokenFlushController(targetChatId, "dispose");
      const renderRuntime = createChatRenderRuntime();
      renderRuntimeByChatIdRef.current.set(targetChatId, renderRuntime);

      const normalizedBaseMessages = Array.isArray(baseMessages)
        ? baseMessages
        : [];
      const normalizedReuseUserMessage =
        reuseUserMessage &&
        typeof reuseUserMessage === "object" &&
        reuseUserMessage.role === "user" &&
        typeof reuseUserMessage.id === "string" &&
        reuseUserMessage.id
          ? reuseUserMessage
          : null;

      clearAllPendingToolConfirmations(targetChatId);
      updatePendingContinuationRequestForChat(targetChatId, null);
      const timestamp = Date.now();
      const durableResumeMessages = isDurableResume
        ? prepareDurableInteractionResumeMessages(
            normalizedBaseMessages,
            durableInteraction,
            durableOwnerMessageId || durableInteraction.ownerMessageId,
            timestamp,
          )
        : null;
      const assistantMessageId =
        durableResumeMessages?.ownerMessageId ||
        `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      let persistedAttachments = [];
      let payloadAttachments = [];
      let userMessage = null;
      if (!isDurableResume) {
        /* `promptText` is already gate-approved: it either scanned clean or a
           one-time token proving the user's decision was consumed at the top
           of this function, before any side effect. There is deliberately NO
           capture, deposit or redaction here — a late deposit is what let
           explicit {{secret:...}} syntax run past markChatStarted, the draft
           claim and the render runtime, and it had no compensation when the
           second of several deposits failed. See useSecretCaptureGate. */
        const userMessageSeed = normalizedReuseUserMessage
          ? {
              ...normalizedReuseUserMessage,
              role: "user",
              content: promptText,
              updatedAt: timestamp,
            }
          : {
              id: `user-${Date.now()}`,
              role: "user",
              content: promptText,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
        if (
          typeof userMessageSeed.createdAt !== "number" ||
          !Number.isFinite(userMessageSeed.createdAt)
        ) {
          userMessageSeed.createdAt = timestamp;
        }

        try {
          await hydrateAttachmentPayloads(targetChatId, [
            ...normalizedAttachments,
            ...normalizedBaseMessages.flatMap((message) =>
              message.role === "user" && Array.isArray(message.attachments)
                ? message.attachments
                : [],
            ),
          ]);
        } catch (error) {
          finishRunPreflight();
          releaseComposerDraftClaim();
          setStreamErrorForChat(
            targetChatId,
            error?.message || "Failed to load attachment payloads.",
          );
          return false;
        }
        if (!isCurrentRun()) {
          finishRunPreflight();
          releaseComposerDraftClaim();
          return false;
        }

        const { payloads: attachmentPayloads, missingAttachmentNames } =
          resolveAttachmentPayloads(targetChatId, normalizedAttachments);
        persistedAttachments = normalizedAttachments;
        payloadAttachments = attachmentPayloads;

        if (missingAttachmentNames.length > 0) {
          if (missingAttachmentPayloadMode === "degrade") {
            persistedAttachments = [];
            payloadAttachments = [];
            setStreamErrorForChat(
              targetChatId,
              "Some attachment payloads are unavailable in this session. Resending text only.",
            );
          } else {
            setStreamErrorForChat(
              targetChatId,
              "Some attachment payloads are unavailable. Please re-attach your files and try again.",
            );
            finishRunPreflight();
            releaseComposerDraftClaim();
            return false;
          }
        }

        userMessage = { ...userMessageSeed };
        if (turnMutationOperationId) {
          userMessage.meta = {
            ...(userMessage.meta || {}),
            turnMutationOperationId,
            turnMutationServerAcknowledged: false,
          };
        }
        if (persistedAttachments.length > 0) {
          userMessage.attachments = persistedAttachments;
        } else if ("attachments" in userMessage) {
          delete userMessage.attachments;
        }

        // ── Composer sidecar reconciliation (contract §2 铁律 / §6.5) ────────
        // A composer is valid ONLY for the exact content it was computed
        // against; a stale one is the contract's single integrity fault source,
        // so we NEVER carry an inherited one blindly. Precedence:
        //   1. a fresh `composer` param (compose/edit re-expand) validated
        //      against THIS content wins;
        //   2. otherwise carry an inherited composer forward ONLY when the
        //      content is byte-identical to the message it came from (resend /
        //      memory-fallback retry re-send the same content → still valid);
        //   3. otherwise drop it — a content rewrite (edit) with no fresh
        //      sidecar renders as plain content (fail-open, content intact).
        // The unconditional delete first guarantees no seed-spread composer
        // (from reuseUserMessage) ever survives unvalidated.
        delete userMessage.composer;
        const contentLength =
          typeof userMessage.content === "string"
            ? userMessage.content.length
            : 0;
        if (isValidComposerForContent(composer, contentLength)) {
          userMessage.composer = composer;
        } else if (
          normalizedReuseUserMessage &&
          typeof normalizedReuseUserMessage.content === "string" &&
          normalizedReuseUserMessage.content === userMessage.content &&
          isValidComposerForContent(
            normalizedReuseUserMessage.composer,
            contentLength,
          )
        ) {
          userMessage.composer = normalizedReuseUserMessage.composer;
        }
      }

      const persistImmediateMessages = (nextImmediateMessages) => {
        commitForegroundMessages(targetChatId, nextImmediateMessages);
        storageApi.setChatMessages(targetChatId, nextImmediateMessages, {
          source: "chat-page",
        });
      };

      let effectiveModelId = runModelId;
      let effectiveThreadId = targetChatId;
      let effectiveMemoryNamespace = "";
      let effectiveToolkits = runSelectedToolkits;
      if (Array.isArray(extraToolkits) && extraToolkits.length > 0) {
        // Command-driven ephemeral selection: the run carries the plugin(s)
        // whose commands were used, without persisting them to the session.
        effectiveToolkits = [
          ...new Set([...(runSelectedToolkits || []), ...extraToolkits]),
        ];
      }
      let effectiveWorkspaceIds = runSelectedWorkspaceIds;
      let effectiveAgentOrchestration = runAgentOrchestration;
      let forceMemoryEnabled = false;

      if (isDurableResume) {
        effectiveThreadId = durableInteraction.sessionId;
        const resumeModelId = durableInteraction.resumeOptions?.modelId;
        if (typeof resumeModelId === "string" && resumeModelId.trim()) {
          effectiveModelId = resumeModelId.trim();
        }
      }

      /* Optimistic UI: push user message + assistant placeholder BEFORE any await.
         For character chats, buildCharacterRunConfig() below can be a slow IPC round-trip;
         we don't want Send to feel frozen during that wait. Rollback on failure. */
      const optimisticAssistantPlaceholder = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        status: "streaming",
        traceFrames: [],
        subagentFrames: {},
        subagentMetaByRunId: {},
        meta: {
          model: effectiveModelId,
          queueClientOperationId: runClientOperationId,
          ...(turnMutationOperationId
            ? { turnMutationOperationId }
            : {}),
        },
      };
      const optimisticMessages = isDurableResume
        ? durableResumeMessages.messages
        : [
            ...normalizedBaseMessages,
            userMessage,
            optimisticAssistantPlaceholder,
          ];
      activeStreamsRef.current.set(targetChatId, {
        messages: optimisticMessages,
      });
      commitForegroundMessages(targetChatId, optimisticMessages);
      /* Persist the optimistic turn immediately, including an active existing
         chat. Character preflight and attachment work can outlive the page;
         relying on ChatInterface's delayed effect would lose both the user
         message and placeholder if the page unmounts in that window. */
      storageApi.setChatMessages(targetChatId, optimisticMessages, {
        source: "chat-page",
      });
      let composerWasCleared = false;
      if (clearComposer) {
        const targetIsActive = activeChatIdRef.current === targetChatId;
        const composerStillMatches =
          !targetIsActive || isOriginatingComposerUnchanged();
        if (composerStillMatches) {
          if (usesComposerDraftClaim) {
            composerWasCleared = replaceComposerDraftClaim({
              text: "",
              attachments: [],
            });
          } else {
            composerWasCleared = true;
            if (
              !targetIsActive &&
              typeof storageApi.updateChatDraft === "function"
            ) {
              storageApi.updateChatDraft(
                targetChatId,
                { text: "", attachments: [] },
                { source: "chat-page" },
              );
            }
          }

          if (composerWasCleared && targetIsActive) {
            setInputValue("");
            setDraftAttachments([]);
          }
        } else {
          releaseComposerDraftClaim();
        }
      }
      setStreamErrorForChat(targetChatId, "");
      streamingChatIdsRef.current.add(targetChatId);
      finishRunPreflight();
      setStreamingChatIds((prev) => new Set(prev).add(targetChatId));
      activeStreamingMessageStore.begin({
        chatId: targetChatId,
        messageId: assistantMessageId,
        seedText: isDurableResume
          ? optimisticMessages.find(
              (message) => message?.id === assistantMessageId,
            )?.content || ""
          : "",
        updatedAt: timestamp,
      });
      const rollbackOptimistic = () => {
        commitForegroundMessages(targetChatId, normalizedBaseMessages);
        storageApi.setChatMessages(targetChatId, normalizedBaseMessages, {
          source: "chat-page",
        });
        streamingChatIdsRef.current.delete(targetChatId);
        setStreamingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(targetChatId);
          return next;
        });
        activeStreamsRef.current.delete(targetChatId);
        clearStreamingMessageStore(targetChatId, assistantMessageId);
        if (clearComposer && composerWasCleared) {
          const targetIsActive = activeChatIdRef.current === targetChatId;
          const composerWasNotEdited =
            (composerRevisionByChatIdRef?.current?.get?.(targetChatId) || 0) ===
            previousComposerRevision;
          const activeComposerIsStillEmpty =
            composerWasNotEdited &&
            (!targetIsActive ||
              (inputValueRef.current === "" &&
                sameDraftAttachments(draftAttachmentsRef.current, [])));
          if (activeComposerIsStillEmpty) {
            let restored = true;
            if (usesComposerDraftClaim) {
              restored = replaceComposerDraftClaim({
                text: previousInputValue,
                attachments: previousDraftAttachments,
              });
            } else if (
              !targetIsActive &&
              typeof storageApi.updateChatDraft === "function"
            ) {
              storageApi.updateChatDraft(
                targetChatId,
                {
                  text: previousInputValue,
                  attachments: previousDraftAttachments,
                },
                { source: "chat-page" },
              );
            }
            if (restored && targetIsActive) {
              setInputValue(previousInputValue);
              setDraftAttachments(previousDraftAttachments);
            }
          }
          releaseComposerDraftClaim();
        }
      };

      let resolvedCharacterConfig = characterAgentConfig;
      if (runIsCharacterChat && !isDurableResume) {
        if (!resolvedCharacterConfig) {
          try {
            resolvedCharacterConfig =
              isCharacterChat && runCharacterId === characterId
                ? await buildCharacterRunConfig(runThreadId)
                : await api.unchain.buildCharacterAgentConfig({
                    characterId: runCharacterId,
                    threadId: runThreadId || "main",
                    humanId: "local_user",
                  });
            if (!isCurrentRun()) {
              releaseComposerDraftClaim();
              return false;
            }
          } catch (error) {
            if (!isCurrentRun()) {
              releaseComposerDraftClaim();
              return false;
            }
            rollbackOptimistic();
            setStreamErrorForChat(
              targetChatId,
              error?.message || "Failed to prepare this character chat.",
            );
            return false;
          }
        }

        if (!resolvedCharacterConfig?.session_id) {
          rollbackOptimistic();
          setStreamErrorForChat(
            targetChatId,
            "Failed to prepare this character chat.",
          );
          return false;
        }

        effectiveThreadId = resolvedCharacterConfig.session_id;
        effectiveMemoryNamespace =
          typeof resolvedCharacterConfig.run_memory_namespace === "string"
            ? resolvedCharacterConfig.run_memory_namespace.trim()
            : "";
        if (
          typeof resolvedCharacterConfig.default_model === "string" &&
          resolvedCharacterConfig.default_model.trim()
        ) {
          effectiveModelId = resolvedCharacterConfig.default_model.trim();
        }
        effectiveToolkits = [];
        effectiveWorkspaceIds = [];
        effectiveAgentOrchestration = { ...DEFAULT_AGENT_ORCHESTRATION };
        forceMemoryEnabled = true;

        const characterDecision =
          resolvedCharacterConfig.decision &&
          typeof resolvedCharacterConfig.decision === "object"
            ? resolvedCharacterConfig.decision
            : {};
        const decisionAction =
          typeof characterDecision.action === "string"
            ? characterDecision.action.trim().toLowerCase()
            : "";
        const courtesyMessage =
          typeof characterDecision.courtesy_message === "string" &&
          characterDecision.courtesy_message.trim()
            ? characterDecision.courtesy_message.trim()
            : "";

        if (decisionAction === "ignore" || decisionAction === "defer") {
          characterLogger.log(decisionAction, {
            characterId: runCharacterId,
            reason: characterDecision.reason || "unknown",
            courtesyMessage: courtesyMessage || null,
            evaluation: characterDecision.evaluation || null,
          });
          const terminalUserMessage = turnMutationOperationId
            ? {
                ...userMessage,
                meta: {
                  ...(userMessage.meta || {}),
                  turnMutationOperationId,
                  turnMutationServerAcknowledged: true,
                },
              }
            : userMessage;
          const immediateMessages =
            decisionAction === "defer" && courtesyMessage
              ? [
                  ...normalizedBaseMessages,
                  terminalUserMessage,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    content: courtesyMessage,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    status: "done",
                    meta: {
                      model: effectiveModelId,
                      ...(turnMutationOperationId
                        ? {
                            turnMutationOperationId,
                            turnMutationServerAcknowledged: true,
                          }
                        : {}),
                    },
                  },
                ]
              : [...normalizedBaseMessages, terminalUserMessage];

          markRequestConsumed();
          persistImmediateMessages(immediateMessages);
          if (turnMutationOperationId) {
            removeTurnMutation(turnMutationOperationId);
          }
          releaseComposerDraftClaim();
          setStreamErrorForChat(targetChatId, "");
          cancelBackgroundPersist(targetChatId);
          streamHandlesRef.current.delete(targetChatId);
          streamingChatIdsRef.current.delete(targetChatId);
          activeStreamsRef.current.delete(targetChatId);
          setStreamingChatIds((prev) => {
            const next = new Set(prev);
            next.delete(targetChatId);
            return next;
          });
          return true;
        }
      }

      releaseComposerDraftClaim();

      // Record the threadId this run actually uses (chatId for normal chats,
      // the character session_id for character chats) so a mid-run interject
      // can target the same run instead of guessing.
      activeRunThreadIdByChatIdRef.current.set(targetChatId, effectiveThreadId);

      const memoryEnabled =
        isDurableResume
          ? durableInteraction.resumeOptions?.memory_enabled === true
          : forceHistoryFallback === true
          ? false
          : forceMemoryEnabled === true ||
            readMemorySettings().enabled === true;
      const historyForModel = isDurableResume
        ? []
        : Array.isArray(historyOverride)
          ? historyOverride
          : memoryEnabled
            ? []
            : buildHistoryForModel(normalizedBaseMessages, targetChatId);

      /* Optimistic push already happened before the character block.
         `nextMessages` is the same value; keep the binding so downstream code
         (streamMessages initial value, etc.) stays unchanged. */
      const nextMessages = optimisticMessages;

      const activeFlushScheduler = createStreamFlushScheduler({
        onFlush: (nextStreamMessages) => {
          commitForegroundMessages(targetChatId, nextStreamMessages);
        },
      });

      let streamMessages = nextMessages;
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamsRef.current.set(targetChatId, {
          messages: nextStreamMessages,
        });

        if (activeChatIdRef.current === targetChatId) {
          activeFlushScheduler.commit(nextStreamMessages);
          return;
        }

        scheduleBackgroundPersist(
          targetChatId,
          materializeStreamingMessages(targetChatId, nextStreamMessages),
        );
      };

      let turnMutationServerAcknowledged = false;
      const acknowledgeTurnMutationRun = () => {
        if (
          !turnMutationOperationId ||
          turnMutationServerAcknowledged ||
          !isCurrentRun()
        ) {
          return;
        }
        turnMutationServerAcknowledged = true;
        const acknowledgedMessages = streamMessages.map((message) =>
          message.id === assistantMessageId || message.id === userMessage?.id
            ? {
                ...message,
                meta: {
                  ...(message.meta || {}),
                  turnMutationOperationId,
                  turnMutationServerAcknowledged: true,
                },
              }
            : message,
        );
        syncStreamMessages(acknowledgedMessages);
        storageApi.setChatMessages(targetChatId, acknowledgedMessages, {
          source: "chat-page",
        });
        removeTurnMutation(turnMutationOperationId);
      };

      const dirtySubagentFrameRunIds = new Set();
      const dirtySubagentMetaRunIds = new Set();
      let pendingSubagentStateFlushHandle = null;

      const serializeSubagentFramesByRunId = (runIds) =>
        Object.fromEntries(
          Array.from(runIds)
            .map((runId) => [
              runId,
              renderRuntime.subagentFramesByRunId.get(runId),
            ])
            .map(([runId, frames]) => [
              runId,
              Array.isArray(frames) ? [...frames] : [],
            ]),
        );

      const serializeSubagentMetaByRunId = (runIds) =>
        Object.fromEntries(
          Array.from(runIds)
            .map((runId) => [
              runId,
              renderRuntime.subagentMetaByRunId.get(runId),
            ])
            .map(([runId, meta]) => [
              runId,
              {
                subagentId:
                  typeof meta?.subagentId === "string" ? meta.subagentId : "",
                mode: typeof meta?.mode === "string" ? meta.mode : "",
                template: typeof meta?.template === "string" ? meta.template : "",
                batchId: typeof meta?.batchId === "string" ? meta.batchId : "",
                parentId:
                  typeof meta?.parentId === "string" ? meta.parentId : "",
                lineage: Array.isArray(meta?.lineage)
                  ? meta.lineage.filter(
                      (item) => typeof item === "string" && item.trim(),
                    )
                  : [],
                status: typeof meta?.status === "string" ? meta.status : "",
              },
            ]),
        );

      const isKnownSubagentRunId = (runId) =>
        typeof runId === "string" &&
        runId.length > 0 &&
        (!renderRuntime.parentRunId || runId !== renderRuntime.parentRunId) &&
        (renderRuntime.subagentMetaByRunId.has(runId) ||
          renderRuntime.subagentFramesByRunId.has(runId));

      const upsertSubagentMeta = (childRunId, updates) => {
        if (typeof childRunId !== "string" || !childRunId.trim()) {
          return null;
        }

        const previousMeta =
          renderRuntime.subagentMetaByRunId.get(childRunId) || {};
        const nextMeta = {
          subagentId:
            typeof updates?.subagentId === "string"
              ? updates.subagentId
              : typeof previousMeta?.subagentId === "string"
                ? previousMeta.subagentId
                : "",
          mode:
            typeof updates?.mode === "string"
              ? updates.mode
              : typeof previousMeta?.mode === "string"
                ? previousMeta.mode
                : "",
          template:
            typeof updates?.template === "string"
              ? updates.template
              : typeof previousMeta?.template === "string"
                ? previousMeta.template
                : "",
          batchId:
            typeof updates?.batchId === "string"
              ? updates.batchId
              : typeof previousMeta?.batchId === "string"
                ? previousMeta.batchId
                : "",
          parentId:
            typeof updates?.parentId === "string"
              ? updates.parentId
              : typeof previousMeta?.parentId === "string"
                ? previousMeta.parentId
                : "",
          lineage: Array.isArray(updates?.lineage)
            ? updates.lineage.filter(
                (item) => typeof item === "string" && item.trim(),
              )
            : Array.isArray(previousMeta?.lineage)
              ? previousMeta.lineage
              : [],
          status:
            typeof updates?.status === "string"
              ? updates.status
              : typeof previousMeta?.status === "string"
                ? previousMeta.status
                : "",
        };

        renderRuntime.subagentMetaByRunId.set(childRunId, nextMeta);
        if (!renderRuntime.subagentFramesByRunId.has(childRunId)) {
          renderRuntime.subagentFramesByRunId.set(childRunId, []);
        }
        dirtySubagentMetaRunIds.add(childRunId);
        return nextMeta;
      };

      const clearPendingSubagentStateFlush = () => {
        if (pendingSubagentStateFlushHandle == null) {
          return;
        }
        clearTimeout(pendingSubagentStateFlushHandle);
        pendingSubagentStateFlushHandle = null;
      };

      const flushSubagentState = (patchTime = Date.now()) => {
        clearPendingSubagentStateFlush();
        if (
          dirtySubagentFrameRunIds.size === 0 &&
          dirtySubagentMetaRunIds.size === 0
        ) {
          return;
        }

        const dirtyFrameRunIds = new Set(dirtySubagentFrameRunIds);
        const dirtyMetaRunIds = new Set(dirtySubagentMetaRunIds);
        dirtySubagentFrameRunIds.clear();
        dirtySubagentMetaRunIds.clear();

        const serializedFrames = serializeSubagentFramesByRunId(dirtyFrameRunIds);
        const serializedMeta = serializeSubagentMetaByRunId(dirtyMetaRunIds);
        const nextStreamMessages = streamMessages.map((message) => {
          if (message.id !== assistantMessageId) {
            return message;
          }

          const previousFrames =
            message.subagentFrames &&
            typeof message.subagentFrames === "object" &&
            !Array.isArray(message.subagentFrames)
              ? message.subagentFrames
              : {};
          const previousMeta =
            message.subagentMetaByRunId &&
            typeof message.subagentMetaByRunId === "object" &&
            !Array.isArray(message.subagentMetaByRunId)
              ? message.subagentMetaByRunId
              : {};

          return {
            ...message,
            updatedAt: patchTime,
            subagentFrames:
              dirtyFrameRunIds.size > 0
                ? { ...previousFrames, ...serializedFrames }
                : previousFrames,
            subagentMetaByRunId:
              dirtyMetaRunIds.size > 0
                ? { ...previousMeta, ...serializedMeta }
                : previousMeta,
          };
        });
        syncStreamMessages(nextStreamMessages);
      };

      const scheduleSubagentStateFlush = () => {
        if (pendingSubagentStateFlushHandle != null) {
          return;
        }
        pendingSubagentStateFlushHandle = setTimeout(() => {
          pendingSubagentStateFlushHandle = null;
          flushSubagentState(Date.now());
        }, SUBAGENT_STATE_FLUSH_MS);
      };

      const syncAssistantSubagentState = (
        patchTime,
        { immediate = false } = {},
      ) => {
        if (immediate) {
          flushSubagentState(patchTime);
          return;
        }
        scheduleSubagentStateFlush();
      };

      /* Reads back the just-persisted chat snapshot and confirms every fresh
         interjection record actually landed. storageApi.setChatMessages
         swallows backend persist failures (see chat_storage writeStore), so a
         synchronous write is not by itself proof of durability — we verify the
         durable read reflects the parent-assistant interjection before we allow
         the exact-ACK to clear the outbox. Records-less frames carry no
         rendered interjection (the raw frame was persisted by the caller), so
         they are treated as durable and still exact-ACK. */
      const fyiInterjectionSnapshotIsDurable = (chatId, messageId, records) => {
        if (!Array.isArray(records) || records.length === 0) {
          return true;
        }
        const persisted =
          typeof storageApi.getChatMessages === "function"
            ? storageApi.getChatMessages(chatId)
            : null;
        if (!Array.isArray(persisted)) return false;
        const assistant = persisted.find((message) => message?.id === messageId);
        const persistedIds = new Set(
          (Array.isArray(assistant?.interjections)
            ? assistant.interjections
            : []
          ).map((record) => record?.id),
        );
        return records.every((record) => persistedIds.has(record.id));
      };

      /* Shared fyi_injected handling for both the root assistant stream AND any
         subagent (child) stream. Persists a parent-assistant interjection with a
         STABLE id derived from the durable message_id (deduped by id, never by
         text), then synchronously persists the exact updated chat snapshot
         (raw fyi frame from the caller — root -> traceFrames, child ->
         subagentFrames — plus the interjection) through storageApi and only
         exact-ACKs the durable pending FYI once that snapshot is verified
         durable. The ACK removes the outbox entry, so it must never run ahead of
         durability: doing so before the 2s background persister (or on a
         swallowed backend failure) would drop the injected FYI while the outbox
         no longer holds it, resurrecting a spurious successor on remount. On a
         non-durable snapshot we keep the durable FYI intent (queue fallback),
         surface an error, and do NOT ACK. */
      const applyFyiParentInterjectionAndAck = (frame, patchTime) => {
        const entries = Array.isArray(frame?.payload?.messages)
          ? frame.payload.messages
          : [];
        const eventId =
          typeof frame?.payload?.runtime_event_id === "string" &&
          frame.payload.runtime_event_id.trim()
            ? frame.payload.runtime_event_id.trim()
            : `seq-${frame?.seq || 0}`;
        const records = [];
        entries.forEach((entry, index) => {
          if (entry?.origin !== "user") return;
          const text = typeof entry?.text === "string" ? entry.text : "";
          if (!text.trim()) return;
          const messageId =
            typeof entry?.message_id === "string"
              ? entry.message_id.trim()
              : typeof entry?.messageId === "string"
                ? entry.messageId.trim()
                : "";
          records.push({
            id: messageId ? `fyi-${messageId}` : `fyi-${eventId}-${index}`,
            type: "fyi",
            text,
            origin: "user",
            ts: patchTime,
          });
        });
        if (records.length > 0) {
          const nextStreamMessages = streamMessages.map((message) => {
            if (message.id !== assistantMessageId) return message;
            const existingIds = new Set(
              (Array.isArray(message.interjections)
                ? message.interjections
                : []
              ).map((record) => record?.id),
            );
            const fresh = records.filter(
              (record) => !existingIds.has(record.id),
            );
            if (fresh.length === 0) return message;
            return {
              ...message,
              updatedAt: patchTime,
              interjections: [...(message.interjections || []), ...fresh],
            };
          });
          syncStreamMessages(nextStreamMessages);
        }
        const fyiAttemptId =
          executionIdentityByChatIdRef.current.get(targetChatId)?.attemptId ||
          queueAttemptIdByChatIdRef.current.get(targetChatId) ||
          "";
        /* Persist the exact updated snapshot synchronously BEFORE the ACK, then
           verify it landed durably. Never rely on React microtasks or the 2s
           background persister here — the outbox entry is about to be removed. */
        let snapshotDurable = false;
        try {
          storageApi.setChatMessages(targetChatId, streamMessages, {
            source: "chat-page",
          });
          snapshotDurable = fyiInterjectionSnapshotIsDurable(
            targetChatId,
            assistantMessageId,
            records,
          );
        } catch (persistError) {
          snapshotDurable = false;
        }
        if (!snapshotDurable) {
          if (fyiAttemptId) {
            fallbackPendingFyisForAttempt(targetChatId, fyiAttemptId);
          }
          setStreamErrorForChat(
            targetChatId,
            "The pending FYI is still saved and will be recovered after reload.",
          );
          return;
        }
        if (fyiAttemptId) {
          acknowledgeInjectedFyisForAttempt(
            targetChatId,
            fyiAttemptId,
            entries,
          );
        }
      };

      let bufferedTokenDelta = "";
      let pendingTokenFlushHandle = null;
      let pendingTokenFlushHandleType = null;
      let bufferedThinkingDelta = "";
      let accumulatedThinkingText = "";
      let thinkingBlockIndex = 0;
      const THINKING_SEQ_BASE = -9000;

      const flushBufferedThinkingDelta = () => {
        if (!bufferedThinkingDelta) return;
        accumulatedThinkingText += bufferedThinkingDelta;
        bufferedThinkingDelta = "";
        const patchTime = Date.now();
        const currentSeq = THINKING_SEQ_BASE - thinkingBlockIndex;
        const updatedFrame = {
          seq: currentSeq,
          ts: patchTime,
          type: "reasoning",
          stage: "model",
          payload: { reasoning: accumulatedThinkingText },
        };
        const nextStreamMessages = streamMessages.map((message) => {
          if (message.id !== assistantMessageId) return message;
          const existingFrames = message.traceFrames || [];
          const frameIndex = existingFrames.findIndex(
            (frame) => frame.seq === currentSeq,
          );
          let nextFrames;
          if (frameIndex >= 0) {
            nextFrames = [...existingFrames];
            nextFrames[frameIndex] = updatedFrame;
          } else {
            nextFrames = [...existingFrames, updatedFrame];
          }
          return {
            ...message,
            updatedAt: patchTime,
            traceFrames: nextFrames,
          };
        });
        syncStreamMessages(nextStreamMessages);
      };

      const finaliseThinkingBlock = () => {
        if (accumulatedThinkingText || bufferedThinkingDelta) {
          flushBufferedThinkingDelta();
        }
        accumulatedThinkingText = "";
        thinkingBlockIndex += 1;
      };

      const thinkTagParser = createThinkTagParser({
        onContent: (value) => {
          bufferedTokenDelta += value;
          scheduleBufferedTokenFlush();
        },
        onThinking: (value) => {
          bufferedThinkingDelta += value;
          scheduleBufferedTokenFlush();
        },
        onThinkEnd: () => {
          finaliseThinkingBlock();
        },
      });

      const clearScheduledTokenFlush = () => {
        if (pendingTokenFlushHandle == null) {
          return;
        }

        if (
          pendingTokenFlushHandleType === "raf" &&
          typeof window !== "undefined" &&
          typeof window.cancelAnimationFrame === "function"
        ) {
          window.cancelAnimationFrame(pendingTokenFlushHandle);
        } else {
          clearTimeout(pendingTokenFlushHandle);
        }

        pendingTokenFlushHandle = null;
        pendingTokenFlushHandleType = null;
      };

      const flushBufferedTokenDelta = () => {
        clearScheduledTokenFlush();

        if (bufferedThinkingDelta) {
          flushBufferedThinkingDelta();
        }

        if (!bufferedTokenDelta) {
          return;
        }

        const deltaChunk = bufferedTokenDelta;
        bufferedTokenDelta = "";
        const patchTime = Date.now();
        activeStreamingMessageStore.append({
          chatId: targetChatId,
          messageId: assistantMessageId,
          delta: deltaChunk,
          updatedAt: patchTime,
        });
      };

      const scheduleBufferedTokenFlush = () => {
        if (pendingTokenFlushHandle != null) {
          return;
        }

        if (
          typeof window !== "undefined" &&
          typeof window.requestAnimationFrame === "function"
        ) {
          pendingTokenFlushHandleType = "raf";
          pendingTokenFlushHandle = window.requestAnimationFrame(() => {
            pendingTokenFlushHandle = null;
            pendingTokenFlushHandleType = null;
            flushBufferedTokenDelta();
          });
          return;
        }

        pendingTokenFlushHandleType = "timeout";
        pendingTokenFlushHandle = setTimeout(() => {
          pendingTokenFlushHandle = null;
          pendingTokenFlushHandleType = null;
          flushBufferedTokenDelta();
        }, 16);
      };

      const disposeBufferedTokenFlush = () => {
        clearScheduledTokenFlush();
        bufferedTokenDelta = "";
      };

      const tokenFlushController = {
        flushNow: flushBufferedTokenDelta,
        dispose: disposeBufferedTokenFlush,
      };
      renderRuntime.tokenFlushController = tokenFlushController;
      const releaseTokenFlushController = () => {
        if (renderRuntime.tokenFlushController === tokenFlushController) {
          renderRuntime.tokenFlushController = null;
        }
      };

      const startChatStream = (payload, handlers = {}) => {
        const forwardTerminalDoneError = (
          done,
          doneError,
          { onAccountingSettled } = {},
        ) => {
          const terminalError = {
            code:
              typeof doneError?.code === "string"
                ? doneError.code
                : "stream_failed",
            message:
              typeof doneError?.message === "string"
                ? doneError.message
                : "The stream failed.",
          };
          const hasCanonicalBundle = [
            RUN_BUNDLE_V1_SCHEMA,
            RUN_BUNDLE_V2_SCHEMA,
          ].includes(done?.bundle?.schema);
          if (!hasCanonicalBundle) {
            handlers.onError?.(terminalError);
            return false;
          }

          const forwardAdmittedError = ({
            bundle,
            completionDiagnostics,
          }) => {
            onAccountingSettled?.();
            if (!isCurrentRun()) return;
            handlers.onError?.({
              ...terminalError,
              [ADMITTED_RUN_ACCOUNTING_ERROR]: true,
              bundle,
              ...(completionDiagnostics
                ? { completion_diagnostics: completionDiagnostics }
                : {}),
            });
          };
          const failAccounting = () => {
            onAccountingSettled?.();
            if (!isCurrentRun()) return;
            handlers.onError?.({
              code: "run_bundle_accounting_failed",
              message:
                "The failed run could not be admitted to the Run Bundle ledger.",
            });
          };

          try {
            const admission = admitDoneRunAccountingV1(done);
            if (admission && typeof admission.then === "function") {
              void admission
                .then(forwardAdmittedError)
                .catch(failAccounting);
              return true;
            }
            forwardAdmittedError(admission);
          } catch (_error) {
            failAccounting();
          }
          return false;
        };

        const startRuntimeEventStream = ({
          createStore,
          reduceTree,
          createProjector,
          adaptTree,
          startStream,
          batchRuntimeEvents = false,
          batchFlushMs = 0,
        }) => {
        const runtimeEventStore = createStore();
        const runtimeEventProjector = createProjector?.();
        const reduceRuntimeEventSnapshot = (snapshot) =>
          runtimeEventProjector
            ? runtimeEventProjector.reduce(snapshot)
            : reduceTree(null, snapshot);
        let runtimeEventActivityTree = reduceRuntimeEventSnapshot(
          runtimeEventStore.getReductionSnapshot(),
        );
        const processedRuntimeEventEffectKeys = new Set();
        let runtimeEventStreamFailed = false;
        let pendingRuntimeEventError = null;
        let terminalDoneReceived = false;
        let terminalDoneAccountingPending = false;
        const runtimeEventEffectKey = (effect) => {
          const eventId =
            typeof effect?.eventId === "string" && effect.eventId.trim()
              ? effect.eventId.trim()
              : typeof effect?.frame?.payload?.runtime_event_id === "string"
                ? effect.frame.payload.runtime_event_id.trim()
                : "";
          if (!eventId) {
            return "";
          }
          const frameType =
            typeof effect?.frame?.type === "string" ? effect.frame.type : "";
          const delta =
            effect?.type === "token" && typeof effect.delta === "string"
              ? effect.delta
              : "";
          const errorCode =
            effect?.type === "error" && typeof effect.error?.code === "string"
              ? effect.error.code
              : "";
          const artifactKey =
            effect?.type === "artifact_summary"
              ? `turn:${effect.turnId || ""}:${effect.reason || ""}`
              : effect?.type === "run_artifact_summary"
                ? `run:${effect.reason || ""}`
                : "";
          return [eventId, effect?.type || "", frameType, delta, errorCode, artifactKey].join(
            "::",
          );
        };
        const flushRuntimeEventEffects = () => {
          runtimeEventActivityTree = reduceRuntimeEventSnapshot(
            runtimeEventStore.getReductionSnapshot(),
          );
          const nextEffects = runtimeEventActivityTree.effects.filter((effect) => {
            const effectKey = runtimeEventEffectKey(effect);
            if (!effectKey || processedRuntimeEventEffectKeys.has(effectKey)) {
              return false;
            }
            processedRuntimeEventEffectKeys.add(effectKey);
            return true;
          });
          return nextEffects;
        };
        const cloneArtifactBucket = (bucket) => ({
          order: bucket.order,
          status: bucket.status,
          artifacts: Array.isArray(bucket.artifacts)
            ? bucket.artifacts.map((a) => ({ ...a }))
            : [],
        });
        const patchArtifactSummary = (effect) => {
          const isRunSummary = effect.type === "run_artifact_summary";
          const bucket = isRunSummary
            ? runtimeEventActivityTree?.runArtifactSummary
            : runtimeEventActivityTree?.artifactSummariesByTurnId?.[effect.turnId];
          if (!bucket && isRunSummary) {
            const patchTime = Date.now();
            const nextStreamMessages = streamMessages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    updatedAt: patchTime,
                    runArtifactSummary: null,
                  }
                : message,
            );
            syncStreamMessages(nextStreamMessages);
            return;
          }
          if (!bucket || bucket.status !== "completed") return;
          const patchTime = Date.now();
          const nextStreamMessages = streamMessages.map((message) => {
            if (message.id !== assistantMessageId) return message;
            if (isRunSummary) {
              return {
                ...message,
                updatedAt: patchTime,
                runArtifactSummary: cloneArtifactBucket(bucket),
              };
            }
            const prev =
              message.artifactSummariesByTurnId &&
              typeof message.artifactSummariesByTurnId === "object" &&
              !Array.isArray(message.artifactSummariesByTurnId)
                ? message.artifactSummariesByTurnId
                : {};
            return {
              ...message,
              updatedAt: patchTime,
              artifactSummariesByTurnId: {
                ...prev,
                [effect.turnId]: cloneArtifactBucket(bucket),
              },
            };
          });
          syncStreamMessages(nextStreamMessages);
        };

        const dispatchRuntimeEventEffects = (effects) => {
          const hasErrorEffect = effects.some((effect) => effect.type === "error");
          effects.forEach((effect) => {
            if (
              effect.type === "frame" &&
              !(hasErrorEffect && effect.frame?.type === "error")
            ) {
              handlers.onFrame?.(effect.frame);
              return;
            }
            if (effect.type === "meta") {
              handlers.onMeta?.(effect.meta);
              return;
            }
            if (effect.type === "token") {
              markRequestConsumed();
              handlers.onToken?.(effect.delta);
              return;
            }
            if (effect.type === "error") {
              runtimeEventStreamFailed = true;
              pendingRuntimeEventError = effect.error;
            }
            if (
              effect.type === "artifact_summary" ||
              effect.type === "run_artifact_summary"
            ) {
              patchArtifactSummary(effect);
              return;
            }
          });
        };

        const flushRuntimeEventBatch = (events) => {
          runtimeEventStore.appendManyForReduction(events);
          const effects = flushRuntimeEventEffects();
          return dispatchRuntimeEventEffects(effects);
        };

        const runtimeEventBatcher = batchRuntimeEvents
          ? createRuntimeEventBatcher({
              delayMs: batchFlushMs,
              onFlush: flushRuntimeEventBatch,
            })
          : null;

        let lastRuntimeStreamSeq = 0;
        const runtimeEventHandlers = {
          onRuntimeEvent: (runtimeEvent, streamMeta = {}) => {
            if (runtimeEventStreamFailed || !isCurrentRun()) {
              return;
            }
            const streamSeq = Number(streamMeta.streamSeq);
            if (Number.isInteger(streamSeq) && streamSeq > lastRuntimeStreamSeq) {
              lastRuntimeStreamSeq = streamSeq;
            }
            if (isAuthoritativeQueueAcceptanceEvent(runtimeEvent)) {
              acknowledgeTurnMutationRun();
              markRequestConsumed();
            }
            if (runtimeEventBatcher) {
              runtimeEventBatcher.enqueue(runtimeEvent);
              return;
            }
            runtimeEventStore.appendForReduction(runtimeEvent);
            const effects = flushRuntimeEventEffects();
            dispatchRuntimeEventEffects(effects);
          },
          onDone: (done) => {
            if (!isCurrentRun() || terminalDoneReceived) {
              runtimeEventBatcher?.cancel();
              return;
            }
            terminalDoneReceived = true;
            runtimeEventBatcher?.flushNow();
            const doneError =
              done?.error && typeof done.error === "object"
                ? done.error
                : null;
            if (doneError) {
              runtimeEventStreamFailed = true;
              terminalDoneAccountingPending = forwardTerminalDoneError(
                done,
                doneError,
                {
                  onAccountingSettled: () => {
                    terminalDoneAccountingPending = false;
                  },
                },
              );
              return;
            }
            if (runtimeEventStreamFailed) {
              handlers.onError?.(
                pendingRuntimeEventError || {
                  code: "stream_failed",
                  message: "The stream failed.",
                },
              );
              return;
            }
            const traceProps = adaptTree(runtimeEventActivityTree);
            const donePayload =
              traceProps.bundle && !(done?.bundle && typeof done.bundle === "object")
                ? { ...(done || {}), bundle: traceProps.bundle }
                : done;
            handlers.onDone?.(donePayload);
          },
          onError: (error) => {
            if (
              !isCurrentRun() ||
              terminalDoneReceived ||
              terminalDoneAccountingPending
            ) {
              runtimeEventBatcher?.cancel();
              return;
            }
            clearQueueRelayAcceptanceTimer();
            runtimeEventBatcher?.flushNow();
            runtimeEventStreamFailed = true;
            handlers.onError?.(error || pendingRuntimeEventError);
          },
        };
        const wrapRuntimeEventStreamHandle = (rawHandle) => {
          if (!rawHandle) return rawHandle;
          const wrappedHandle = { ...rawHandle };
          wrappedHandle.quarantineQueueRelayAcceptance = () => {
            runtimeEventBatcher?.cancel();
            runtimeEventStreamFailed = true;
          };
          wrappedHandle.failQueueRelayAcceptance = (error) => {
            if (runtimeEventStreamFailed || !isCurrentRun()) {
              return false;
            }
            runtimeEventHandlers.onError(error);
            return true;
          };
          if (runtimeEventBatcher && typeof rawHandle.disconnect === "function") {
            wrappedHandle.disconnect = (...args) => {
              runtimeEventBatcher.cancel();
              return rawHandle.disconnect(...args);
            };
          }
          if (runtimeEventBatcher && typeof rawHandle.cancel === "function") {
            wrappedHandle.cancel = (...args) => {
              runtimeEventBatcher.cancel();
              return rawHandle.cancel(...args);
            };
          }
          const requestId =
            typeof rawHandle.requestId === "string"
              ? rawHandle.requestId.trim()
              : "";
          const executionId =
            typeof rawHandle.executionId === "string"
              ? rawHandle.executionId.trim()
              : "";
          const attemptId =
            typeof rawHandle.attemptId === "string"
              ? rawHandle.attemptId.trim()
              : "";
          const attachAvailable =
            typeof api.unchain.isRuntimeEventStreamV4AttachAvailable ===
              "function" &&
            api.unchain.isRuntimeEventStreamV4AttachAvailable() &&
            typeof api.unchain.attachStreamV4 === "function";
          if (attachAvailable && requestId && executionId && attemptId) {
            wrappedHandle.reconcileQueueRelayAcceptance = async () => {
              const attachedHandle = await api.unchain.attachStreamV4(
                {
                  requestId,
                  executionId,
                  attemptId,
                  afterSeq: lastRuntimeStreamSeq,
                },
                runtimeEventHandlers,
              );
              return wrapRuntimeEventStreamHandle(attachedHandle);
            };
          }
          return wrappedHandle;
        };

        return wrapRuntimeEventStreamHandle(
          startStream(payload, runtimeEventHandlers),
        );
        };

        const runtimeEventStreamAvailable =
          typeof api.unchain.isRuntimeEventStreamV4Available === "function" &&
          api.unchain.isRuntimeEventStreamV4Available();
        if (isDurableResume && !runtimeEventStreamAvailable) {
          const error = new Error(
            "Durable interaction recovery requires the V4 runtime event bridge.",
          );
          error.code = "durable_resume_bridge_unavailable";
          throw error;
        }
        const shouldUseRuntimeEvents =
          isDurableResume ||
          (isRuntimeEventStreamEnabled() && runtimeEventStreamAvailable);
        if (shouldUseRuntimeEvents) {
          return startRuntimeEventStream({
            createStore: createRuntimeEventStore,
            reduceTree: reduceActivityTree,
            createProjector: createIncrementalActivityTreeProjector,
            adaptTree: adaptActivityTreeToTraceChain,
            startStream: api.unchain.startStreamV4,
            batchRuntimeEvents: true,
            batchFlushMs: RUNTIME_EVENT_BATCH_FLUSH_MS,
          });
        }

        return api.unchain.startStreamV2(payload, {
          ...handlers,
          onDone: (done = {}) => {
            const doneError =
              done.error && typeof done.error === "object"
                ? done.error
                : null;
            if (doneError) {
              forwardTerminalDoneError(done, doneError);
              return;
            }
            handlers.onDone?.(done);
          },
        });
      };

      const scheduleDurableResumeRetry = (error, sourceMessages) => {
        if (!isDurableResume || !isCurrentRun()) {
          return false;
        }

        const isCurrentReconciliationTarget = () => {
          if (!isCurrentRun()) {
            return false;
          }
          const currentInteraction =
            durableInteractionByChatIdRef.current[targetChatId];
          return Boolean(
            currentInteraction &&
              currentInteraction.sessionId === durableInteraction.sessionId &&
              currentInteraction.interactionId ===
                durableInteraction.interactionId,
          );
        };
        if (!isCurrentReconciliationTarget()) {
          return true;
        }

        const errorMessage = error?.message || "Failed to resume this run";
        const retryCurrentInteraction =
          isRetryableDurableInteractionError(error);
        const reconcileAuthoritativeInteraction =
          shouldReconcileDurableResumeError(error);
        if (
          (!retryCurrentInteraction && !reconcileAuthoritativeInteraction) ||
          (retryCurrentInteraction &&
            !reconcileAuthoritativeInteraction &&
            durableResumeAttempt >= DURABLE_RESUME_MAX_RETRIES)
        ) {
          updateDurableInteractionForChat(targetChatId, {
            ...durableInteraction,
            ownerMessageId: assistantMessageId,
            status: "resume_failed",
            resumeAttempt: durableResumeAttempt,
            lastError: errorMessage,
          });
          return false;
        }

        const retrySourceAttemptId =
          executionIdentityByChatIdRef.current.get(targetChatId)?.attemptId ||
          queueAttemptIdByChatIdRef.current.get(targetChatId) ||
          "";
        if (retrySourceAttemptId) {
          fallbackPendingFyisForAttempt(
            targetChatId,
            retrySourceAttemptId,
          );
        }

        const retryMessages = (Array.isArray(sourceMessages)
          ? sourceMessages
          : normalizedBaseMessages
        ).map((message) =>
          message?.id === assistantMessageId
            ? {
                ...message,
                updatedAt: Date.now(),
                status: "done",
              }
            : message,
        );
        commitForegroundMessages(targetChatId, retryMessages);
        storageApi.setChatMessages(targetChatId, retryMessages, {
          source: "chat-page",
        });

        const nextAttempt = Math.min(
          DURABLE_RESUME_MAX_RETRIES,
          durableResumeAttempt + 1,
        );
        updateDurableInteractionForChat(targetChatId, {
          ...durableInteraction,
          ownerMessageId: assistantMessageId,
          status: "retry_wait",
          resumeAttempt: nextAttempt,
          lastError: errorMessage,
        });

        const failReconciliation = (message, resumeAttempt = nextAttempt) => {
          if (!isCurrentReconciliationTarget()) {
            return;
          }
          updateDurableInteractionForChat(targetChatId, {
            ...durableInteraction,
            ownerMessageId: assistantMessageId,
            status: "resume_failed",
            resumeAttempt,
            lastError: message,
          });
          if (activeChatIdRef.current === targetChatId) {
            setStreamError(message);
          }
        };

        const scheduleAuthoritativeLookup = (lookupAttempt, delayMs) => {
          const existingTimer = durableResumeRetryTimersRef.current.get(
            targetChatId,
          );
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          let timerId = null;
          timerId = setTimeout(async () => {
            if (
              durableResumeRetryTimersRef.current.get(targetChatId) === timerId
            ) {
              durableResumeRetryTimersRef.current.delete(targetChatId);
            }
            if (!isCurrentReconciliationTarget()) {
              return;
            }

            let rawPending;
            try {
              rawPending = await api.unchain.getPendingInteraction({
                session_id: durableInteraction.sessionId,
              });
            } catch (lookupError) {
              if (!isCurrentReconciliationTarget()) {
                return;
              }
              const lookupErrorMessage =
                lookupError?.message ||
                "Failed to inspect the current durable interaction.";
              if (lookupAttempt >= DURABLE_RESUME_MAX_RETRIES) {
                failReconciliation(lookupErrorMessage);
                return;
              }
              updateDurableInteractionForChat(targetChatId, {
                ...durableInteraction,
                ownerMessageId: assistantMessageId,
                status: "retry_wait",
                resumeAttempt: nextAttempt,
                lastError: lookupErrorMessage,
              });
              scheduleAuthoritativeLookup(
                lookupAttempt + 1,
                durableInteractionRetryDelayMs(lookupAttempt),
              );
              return;
            }

            if (!isCurrentReconciliationTarget()) {
              return;
            }
            const refreshedPending = normalizePendingInteraction(
              rawPending,
              durableInteraction.sessionId,
            );
            if (!refreshedPending) {
              const invalidRecordMessage =
                "Unchain returned an invalid durable interaction record.";
              if (lookupAttempt >= DURABLE_RESUME_MAX_RETRIES) {
                failReconciliation(invalidRecordMessage);
                return;
              }
              updateDurableInteractionForChat(targetChatId, {
                ...durableInteraction,
                ownerMessageId: assistantMessageId,
                status: "retry_wait",
                resumeAttempt: nextAttempt,
                lastError: invalidRecordMessage,
              });
              scheduleAuthoritativeLookup(
                lookupAttempt + 1,
                durableInteractionRetryDelayMs(lookupAttempt),
              );
              return;
            }
            if (refreshedPending.status === "none") {
              clearDurableResumeStartedKeysForChat(targetChatId);
              clearAllPendingToolConfirmations(targetChatId);
              executionIdentityByChatIdRef.current.delete(targetChatId);
              updateDurableInteractionForChat(targetChatId, null);
              return;
            }

            const sameRecordedInteraction =
              refreshedPending.status === "receipt_recorded" &&
              refreshedPending.interactionId ===
                durableInteraction.interactionId;
            if (!sameRecordedInteraction) {
              const lookup =
                durableInteractionLookupByChatIdRef.current.get(targetChatId);
              if (typeof lookup === "function") {
                await lookup(
                  targetChatId,
                  durableInteraction.sessionId,
                  {
                    runGeneration: activeRunGeneration,
                    authoritativePending: rawPending,
                  },
                );
                return;
              }
              failReconciliation(
                "Unable to inspect the current durable interaction.",
              );
              return;
            }

            if (durableResumeAttempt >= DURABLE_RESUME_MAX_RETRIES) {
              failReconciliation(errorMessage, durableResumeAttempt);
              return;
            }
            const refreshedInteraction = {
              ...refreshedPending,
              ownerMessageId: assistantMessageId,
            };
            updateDurableInteractionForChat(targetChatId, {
              ...refreshedInteraction,
              status: "resuming",
              resumeAttempt: nextAttempt,
              lastError: "",
            });
            void runTurnRequest({
              mode: "resume_interaction",
              chatId: targetChatId,
              text: "",
              attachments: [],
              baseMessages: retryMessages,
              clearComposer: false,
              durableInteraction: refreshedInteraction,
              durableResumeAttempt: nextAttempt,
              durableOwnerMessageId: assistantMessageId,
              runGeneration: activeRunGeneration,
              runContext: effectiveRunContext,
            });
          }, delayMs);
          durableResumeRetryTimersRef.current.set(targetChatId, timerId);
        };

        scheduleAuthoritativeLookup(
          0,
          reconcileAuthoritativeInteraction
            ? 0
            : durableInteractionRetryDelayMs(durableResumeAttempt),
        );
        return true;
      };

      const rejectQueueRelayBeforeAcceptance = ({ disconnect = false } = {}) => {
        if (
          !isQueueRelayRequest ||
          requestConsumed ||
          requestRejected ||
          !isCurrentRun()
        ) {
          return false;
        }
        clearQueueRelayAcceptanceTimer();
        if (disconnect) {
          disconnectStreamTransport(
            streamHandlesRef.current.get(targetChatId) || streamHandle,
          );
        }
        cancelBackgroundPersist(targetChatId);
        streamHandlesRef.current.delete(targetChatId);
        activeRunThreadIdByChatIdRef.current.delete(targetChatId);
        flushSubagentState(Date.now());
        activeFlushScheduler.flushSync();
        disposeBufferedTokenFlush();
        releaseTokenFlushController();
        rollbackOptimistic();
        rejectRequestBeforeAcceptance();
        return true;
      };

      const terminalizeUnverifiedQueueRelay = (
        expectedHandle,
        { code, message },
        { allowConsumed = false } = {},
      ) => {
        if (
          (!allowConsumed && requestConsumed) ||
          requestRejected ||
          !isCurrentRun() ||
          streamHandlesRef.current.get(targetChatId) !== expectedHandle
        ) {
          return false;
        }
        clearQueueRelayAcceptanceTimer();
        return (
          expectedHandle?.failQueueRelayAcceptance?.({
            code: code || "queue_relay_acceptance_unverified",
            message:
              message ||
              "The queued follow-up could not be verified safely. It was not restarted.",
          }) === true
        );
      };

      const cancelAndSettleUnverifiedQueueRelay = async ({
        expectedHandle,
        code,
        message,
        retryWhenNeverRegistered = false,
      }) => {
        if (
          requestRejected ||
          !isCurrentRun() ||
          streamHandlesRef.current.get(targetChatId) !== expectedHandle
        ) {
          return;
        }
        clearQueueRelayAcceptanceTimer();
        const currentIdentity =
          executionIdentityByChatIdRef.current.get(targetChatId) || null;
        const exactIdentity = normalizedExecutionIdentity({
          ownerChatId: targetChatId,
          sessionId: expectedHandle?.executionId || effectiveThreadId,
          attemptId: expectedHandle?.attemptId,
          requestId: expectedHandle?.requestId,
          sourceAttemptId:
            currentIdentity?.attemptId === expectedHandle?.attemptId
              ? currentIdentity.sourceAttemptId || ""
              : "",
        });
        const queuedCancellation = exactIdentity
          ? enqueueExecutionCancel({
              ...exactIdentity,
              reason: "queue_relay_acceptance_unverified",
              createdAt: Date.now(),
            })
          : null;
        const cancelResult = await requestExecutionCancellationAndDisconnect({
          identity: queuedCancellation || exactIdentity,
          handle: expectedHandle,
          reason: "queue_relay_acceptance_unverified",
          idempotencyKey: exactIdentity
            ? `queue-relay-acceptance:${exactIdentity.attemptId}`
            : "",
        });
        if (cancelResult?.terminal && queuedCancellation) {
          removeExecutionCancel(
            queuedCancellation.sessionId,
            queuedCancellation.attemptId,
            queuedCancellation.interactionId,
          );
        }
        if (
          requestRejected ||
          !isCurrentRun() ||
          streamHandlesRef.current.get(targetChatId) !== expectedHandle
        ) {
          return;
        }
        if (requestConsumed) {
          terminalizeUnverifiedQueueRelay(
            expectedHandle,
            {
              code: "queue_relay_transport_lost_after_acceptance",
              message:
                "The queued follow-up was accepted while its transport was being recovered, then the exact execution was cancelled. It was not restarted.",
            },
            { allowConsumed: true },
          );
          return;
        }
        const cancelResponse = cancelResult?.response;
        const provenNeverRegistered = Boolean(
          cancelResult?.ok &&
            isProvenNeverRegisteredCancellation(cancelResponse),
        );
        if (retryWhenNeverRegistered && provenNeverRegistered) {
          expectedHandle?.quarantineQueueRelayAcceptance?.();
          rejectQueueRelayBeforeAcceptance();
          return;
        }
        terminalizeUnverifiedQueueRelay(expectedHandle, { code, message });
      };

      const scheduleQueueRelayAcceptanceReconciliation = () => {
        clearQueueRelayAcceptanceTimer();
        if (
          !isQueueRelayRequest ||
          requestConsumed ||
          requestRejected ||
          !isCurrentRun()
        ) {
          return;
        }
        queueRelayAcceptanceTimer = scheduleQueueRelayTimer(
          targetChatId,
          activeRunGeneration,
          () => {
          queueRelayAcceptanceTimer = null;
            void (async () => {
              if (
                requestConsumed ||
                requestRejected ||
                !isCurrentRun()
              ) {
                return;
              }
              const expectedHandle = streamHandle;
              if (
                !expectedHandle ||
                streamHandlesRef.current.get(targetChatId) !== expectedHandle
              ) {
                return;
              }
              if (
                queueRelayAcceptanceReattachCount >=
                QUEUE_RELAY_ACCEPTANCE_MAX_REATTACHES
              ) {
                await cancelAndSettleUnverifiedQueueRelay({
                  expectedHandle,
                  code: "queue_relay_acceptance_timeout",
                  message:
                    "The queued follow-up did not provide acceptance evidence in time. Its exact execution was cancelled and it was not restarted unless the server proved it never began.",
                  retryWhenNeverRegistered: true,
                });
                return;
              }
              if (
                typeof expectedHandle.reconcileQueueRelayAcceptance !==
                "function"
              ) {
                await cancelAndSettleUnverifiedQueueRelay({
                  expectedHandle,
                  code: "queue_relay_reattach_unavailable",
                  message:
                    "The queued follow-up could not be reattached safely. Its exact execution was cancelled and it was not restarted.",
                  retryWhenNeverRegistered: true,
                });
                return;
              }
              queueRelayAcceptanceReattachCount += 1;
              try {
                const attachedHandle =
                  await expectedHandle.reconcileQueueRelayAcceptance();
                if (
                  !isCurrentRun() ||
                  streamHandlesRef.current.get(targetChatId) !== expectedHandle
                ) {
                  attachedHandle?.detach?.();
                  return;
                }
                streamHandle = attachedHandle;
                streamHandlesRef.current.set(targetChatId, attachedHandle);
                if (requestRejected) {
                  return;
                }
                if (requestConsumed) {
                  if (
                    attachedHandle?.terminal === true ||
                    attachedHandle?.active === false
                  ) {
                    terminalizeUnverifiedQueueRelay(
                      attachedHandle,
                      {
                        code: "queue_relay_transport_lost_after_acceptance",
                        message:
                          "The queued follow-up was accepted, but its recovered transport was already closed. It was not restarted.",
                      },
                      { allowConsumed: true },
                    );
                  }
                  return;
                }
                if (
                  attachedHandle?.terminal === true ||
                  attachedHandle?.active === false
                ) {
                  await cancelAndSettleUnverifiedQueueRelay({
                    expectedHandle: attachedHandle,
                    code: "queue_relay_terminal_without_acceptance",
                    message:
                      "The queued follow-up ended without verifiable acceptance evidence. It was not restarted.",
                    retryWhenNeverRegistered: true,
                  });
                  return;
                }
                scheduleQueueRelayAcceptanceReconciliation();
              } catch (error) {
                if (!isCurrentRun() || requestRejected) {
                  return;
                }
                const errorCode =
                  typeof error?.code === "string" ? error.code : "";
                if (requestConsumed) {
                  await cancelAndSettleUnverifiedQueueRelay({
                    expectedHandle,
                    code: "queue_relay_transport_lost_after_acceptance",
                    message:
                      "The queued follow-up was accepted during replay, but reconnecting its transport failed. Its exact execution was cancelled and it was not restarted.",
                  });
                  return;
                }
                if (errorCode === "stream_not_found") {
                  await cancelAndSettleUnverifiedQueueRelay({
                    expectedHandle,
                    code: "queue_relay_stream_not_found",
                    message:
                      "The queued follow-up stream was not found. Its exact execution was cancelled and it was not restarted unless the server proved it never began.",
                    retryWhenNeverRegistered: true,
                  });
                  return;
                }
                if (
                  errorCode === "stream_replay_gap" ||
                  errorCode === "stream_identity_mismatch"
                ) {
                  await cancelAndSettleUnverifiedQueueRelay({
                    expectedHandle,
                    code: errorCode || "queue_relay_replay_unavailable",
                    message:
                      errorCode === "stream_replay_gap"
                        ? "The queued follow-up could not be replayed completely. Its exact execution was cancelled and it was not restarted."
                        : "The queued follow-up identity could not be verified. Its exact execution was cancelled and it was not restarted.",
                  });
                  return;
                }
                if (
                  queueRelayAcceptanceReattachCount <
                  QUEUE_RELAY_ACCEPTANCE_MAX_REATTACHES
                ) {
                  scheduleQueueRelayAcceptanceReconciliation();
                  return;
                }
                await cancelAndSettleUnverifiedQueueRelay({
                  expectedHandle,
                  code: errorCode || "queue_relay_reattach_failed",
                  message:
                    "The queued follow-up could not be verified after reconnecting. Its exact execution was cancelled and it was not restarted.",
                  retryWhenNeverRegistered: true,
                });
              }
            })();
          },
          QUEUE_RELAY_ACCEPTANCE_RECONCILE_MS,
        );
      };

      try {
        const systemPromptOverridesObject = runSystemPromptOverrides;

        const durableInteractionsRequired =
          !isDurableResume &&
          memoryEnabled &&
          typeof api.unchain.isDurableInteractionBridgeAvailable ===
            "function" &&
          api.unchain.isDurableInteractionBridgeAvailable() &&
          (runIsCharacterChat ||
            (!runSelectedRecipeName ||
              runSelectedRecipeName === "Default")) &&
          effectiveAgentOrchestration.mode === "default";

        /* Memory V2 P0 payload identity + lazy bootstrap.
           owner_chat_id is ALWAYS the UI chat id (targetChatId) — never
           effectiveThreadId, which becomes the character session_id for
           character chats — and is sent unconditionally on both the normal
           and the durable-resume payload (merged via spread; the durable
           helper itself is intentionally untouched).
           memory_v2_requested + memory_agent_config appear ONLY when the
           enable_memory_v2 flag is on, and then on BOTH the normal send and
           the durable-resume payload — a resumed interaction is still a
           Memory V2 turn and the sidecar must route it the same way.
           context_v2_history is the one V2 field that stays exclusive to the
           normal send: it is built from this chat's settled messages (prior
           turns; the in-flight message travels in `message`) and exists
           solely for the sidecar's lazy bootstrap. A durable resume by
           definition already has canonical history server-side, so re-sending
           it would be redundant at best and a divergent second writer at
           worst.
           memory_agent_config carries ONLY the normalized user-tunable
           Memory Agent surface ({displayName, additionalInstructions,
           provider, modelId}) — explicitly picked so no other settings
           namespace can ever leak into the payload.
           The legacy `history` field keeps its exact existing logic so model
           input stays byte-equivalent in shadow mode, and with the flag off
           the payload is unchanged in both branches. */
        const memoryV2Requested = isFeatureFlagEnabled("enable_memory_v2");
        const memoryV2CommonFields = memoryV2Requested
          ? (() => {
              const memoryAgentSettings = readMemoryAgentSettings();
              return {
                memory_v2_requested: true,
                memory_agent_config: {
                  displayName: memoryAgentSettings.displayName,
                  additionalInstructions:
                    memoryAgentSettings.additionalInstructions,
                  provider: memoryAgentSettings.provider,
                  modelId: memoryAgentSettings.modelId,
                },
              };
            })()
          : {};
        const contextCompositionHint = isDurableResume
          ? null
          : buildContextCompositionHintV2({
              message: promptText,
              composer,
            });
        const streamPayload = isDurableResume
          ? {
              ...buildDurableResumePayload(durableInteraction),
              owner_chat_id: targetChatId,
              ...memoryV2CommonFields,
            }
          : {
              threadId: effectiveThreadId,
              owner_chat_id: targetChatId,
              ...(continuedFromRunId
                ? { continued_from_run_id: continuedFromRunId }
                : {}),
              ...memoryV2CommonFields,
              ...(memoryV2Requested
                ? {
                    context_v2_history: buildContextV2History(
                      normalizedBaseMessages,
                    ),
                  }
                : {}),
              ...(turnMutationOperationId
                ? { attempt_id: turnMutationOperationId }
                : {}),
              message: promptText,
              ...(contextCompositionHint
                ? { context_composition_hint: contextCompositionHint }
                : {}),
              history: historyForModel,
              attachments: payloadAttachments,
              options: {
                modelId: effectiveModelId,
                ...(!runIsCharacterChat &&
                typeof selectedReasoningEffortRef.current === "string" &&
                selectedReasoningEffortRef.current
                  ? { reasoningEffort: selectedReasoningEffortRef.current }
                  : {}),
                memory_enabled: memoryEnabled,
                ...(durableInteractionsRequired
                  ? { durable_interactions_required: true }
                  : {}),
                ...(effectiveMemoryNamespace
                  ? { memory_namespace: effectiveMemoryNamespace }
                  : {}),
                ...(effectiveToolkits.length > 0 && {
                  toolkits: effectiveToolkits,
                }),
                ...(effectiveWorkspaceIds.length > 0 && {
                  selectedWorkspaceIds: effectiveWorkspaceIds,
                }),
                ...(!runIsCharacterChat &&
                  runSelectedRecipeName &&
                  runSelectedRecipeName !== "Default" && {
                    recipe_name: runSelectedRecipeName,
                  }),
                ...(!runIsCharacterChat && {
                  agent_orchestration: effectiveAgentOrchestration,
                }),
                ...(runIsCharacterChat
                  ? {
                      agent_instructions:
                        typeof resolvedCharacterConfig?.instructions ===
                        "string"
                          ? resolvedCharacterConfig.instructions
                          : "",
                      disable_workspace_root: true,
                    }
                  : {}),
                ...(Object.keys(systemPromptOverridesObject).length > 0 && {
                  system_prompt_v2: {
                    overrides: systemPromptOverridesObject,
                  },
                }),
              },
              trace_level: STREAM_TRACE_LEVEL,
            };

        /* Queue relay consume-on-acceptance (see relayQueuedTurnsAfterRun):
           do NOT mark consumed merely because startChatStream returned a handle
           — the server may still reject (e.g. execution_lease_conflict) before
           accepting. onConsumed fires only on the authoritative acceptance
           evidence handled inside these callbacks. */
        const streamCallbacks = {
            onFrame: (frame) => {
              if (!isCurrentRun()) {
                return;
              }
              /* Sync closure with external updates (e.g. appendSyntheticToolConfirmationDecision
                 writes to activeStreamsRef but cannot update the closure variable). */
              const _refMsgs = activeStreamsRef.current.get(targetChatId)?.messages;
              if (Array.isArray(_refMsgs) && _refMsgs.length > 0) {
                streamMessages = _refMsgs;
              }

              if (!frame) return;
              if (
                ["run_started", "response_received", "final_message"].includes(
                  frame.type,
                )
              ) {
                acknowledgeTurnMutationRun();
                markRequestConsumed();
              }
              frame = scrubLegacyPlanToolResultFrame(frame);
              if (frame.type === "token_delta") {
                markRequestConsumed();
                renderRuntime.lastTokenRunId =
                  frame.run_id || frame.payload?.run_id || "";
                return;
              }

              if (frame.type === "request_messages") {
                const rawMessages = Array.isArray(frame.payload?.messages)
                  ? frame.payload.messages
                  : [];
                const systemPrompt =
                  typeof frame.payload?.system === "string"
                    ? frame.payload.system.trim()
                    : "";
                const requestToolNamesForLog = Array.isArray(
                  frame.payload?.tool_names,
                )
                  ? frame.payload.tool_names.filter(
                      (name) => typeof name === "string" && name.trim(),
                    )
                  : [];
                const providerForLog =
                  typeof frame.payload?.provider === "string"
                    ? frame.payload.provider.trim()
                    : "";
                const previousResponseIdForLog =
                  typeof frame.payload?.previous_response_id === "string"
                    ? frame.payload.previous_response_id.trim()
                    : "";
                unchainLogger.log("request_messages", {
                  summary: summarizeRequestMessagesForLog(
                    rawMessages,
                    systemPrompt,
                  ),
                  toolNames: requestToolNamesForLog,
                  ...(providerForLog ? { provider: providerForLog } : {}),
                  ...(previousResponseIdForLog
                    ? { previousResponseId: previousResponseIdForLog }
                    : {}),
                });
                return;
              }

              const patchTime = Date.now();

              /* continuation_request is now emitted as a tool_call with
                 tool_name "__continuation__". Keep a legacy fallback so
                 older runtimes still surface the continue UI. */
              if (frame.type === "continuation_request") {
                const confirmationId =
                  typeof frame.payload?.confirmation_id === "string"
                    ? frame.payload.confirmation_id.trim()
                    : "";
                const iteration = getTraceFrameIteration(frame);
                if (!confirmationId || !Number.isFinite(iteration)) {
                  return;
                }

                const nextRequest = {
                  confirmationId,
                  iteration,
                  status: "idle",
                };
                updatePendingContinuationRequestForChat(
                  targetChatId,
                  nextRequest,
                );
                unchainLogger.log("continuation_request", {
                  confirmationId,
                  iteration,
                  latestMessageRole:
                    streamMessages[streamMessages.length - 1]?.role || "",
                  attachedToLatestAssistantBubble:
                    streamMessages[streamMessages.length - 1]?.id ===
                    assistantMessageId,
                });

                const nextStreamMessages = streamMessages.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        updatedAt: patchTime,
                        traceFrames: [...(message.traceFrames || []), frame],
                      }
                    : message,
                );
                syncStreamMessages(nextStreamMessages);
                return;
              }

              if (frame.type === "error") {
                unchainLogger.error(
                  `error (iteration=${getTraceFrameIteration(frame)})`,
                  frame.payload,
                );
              }

              if (frame.type === "done") {
                const endPayload =
                  frame.payload && typeof frame.payload === "object"
                    ? { ...frame.payload }
                    : {};
                delete endPayload.bundle;
                unchainLogger.log("end", endPayload);
              }

              if (
                frame.type === "run_started" ||
                frame.type === "response_received" ||
                frame.type === "run_max_iterations"
              ) {
                if (frame.type === "run_started" && !renderRuntime.parentRunId) {
                  renderRuntime.parentRunId =
                    frame.run_id || frame.payload?.run_id || "";
                }
                const label =
                  frame.type === "run_max_iterations"
                    ? "run_max_iterations"
                    : (UNCHAIN_TRACE_LABEL_BY_TYPE[frame.type] ?? frame.type);
                unchainLogger.log(label, frame.payload);
              }

              /* ── subagent lifecycle events: register mapping + log ── */
              if (
                frame.type === "subagent_spawned" ||
                frame.type === "subagent_started" ||
                frame.type === "subagent_completed" ||
                frame.type === "subagent_failed" ||
                frame.type === "subagent_handoff" ||
                frame.type === "subagent_clarification_requested" ||
                frame.type === "subagent_batch_started" ||
                frame.type === "subagent_batch_joined"
              ) {
                const childRunId =
                  typeof frame.payload?.child_run_id === "string"
                    ? frame.payload.child_run_id
                    : "";
                if (childRunId) {
                  const lifecycleStatus =
                    frame.type === "subagent_spawned"
                      ? "spawned"
                      : frame.type === "subagent_started" ||
                          frame.type === "subagent_handoff"
                        ? "running"
                        : frame.type === "subagent_completed"
                          ? typeof frame.payload?.status === "string" &&
                              frame.payload.status.trim()
                            ? frame.payload.status.trim()
                            : "completed"
                          : frame.type === "subagent_failed"
                            ? typeof frame.payload?.status === "string" &&
                                frame.payload.status.trim()
                              ? frame.payload.status.trim()
                              : "failed"
                          : frame.type ===
                                "subagent_clarification_requested"
                              ? "needs_clarification"
                              : typeof renderRuntime.subagentMetaByRunId.get(
                                    childRunId,
                                  )?.status === "string"
                                ? renderRuntime.subagentMetaByRunId.get(
                                    childRunId,
                                  ).status
                                : "";
                  upsertSubagentMeta(childRunId, {
                    subagentId:
                      typeof frame.payload?.subagent_id === "string"
                        ? frame.payload.subagent_id
                        : "",
                    mode:
                      typeof frame.payload?.mode === "string"
                        ? frame.payload.mode
                        : "",
                    template:
                      typeof frame.payload?.template === "string"
                        ? frame.payload.template
                        : "",
                    batchId:
                      typeof frame.payload?.batch_id === "string"
                        ? frame.payload.batch_id
                        : "",
                    parentId:
                      typeof frame.payload?.parent_id === "string"
                        ? frame.payload.parent_id
                        : "",
                    lineage: Array.isArray(frame.payload?.lineage)
                      ? frame.payload.lineage
                      : undefined,
                    status: lifecycleStatus,
                  });
                  syncAssistantSubagentState(patchTime, {
                    immediate:
                      frame.type === "subagent_completed" ||
                      frame.type === "subagent_failed" ||
                      frame.type === "subagent_clarification_requested" ||
                      frame.type === "subagent_batch_joined",
                  });
                }
                unchainLogger.log(frame.type, frame.payload);
                return;
              }

              const frameRunId = frame.run_id || frame.payload?.run_id || "";
              const processChildToolInteractionSideEffects = () => {
                if (frame.type === "tool_call") {
                  const callId =
                    typeof frame.payload?.call_id === "string"
                      ? frame.payload.call_id
                      : "";
                  const confirmationId =
                    typeof frame.payload?.confirmation_id === "string"
                      ? frame.payload.confirmation_id
                      : "";
                  const requiresConfirmation =
                    frame.payload?.requires_confirmation === true ||
                    Boolean(confirmationId);
                  const toolName =
                    typeof frame.payload?.tool_name === "string"
                      ? frame.payload.tool_name
                      : "";

                  if (toolName === HUMAN_INPUT_TOOL_NAME) {
                    const interactConfig =
                      frame.payload?.interact_config &&
                      typeof frame.payload.interact_config === "object"
                        ? frame.payload.interact_config
                        : {};
                    const requestArguments =
                      frame.payload?.arguments &&
                      typeof frame.payload.arguments === "object"
                        ? frame.payload.arguments
                        : {};
                    unchainLogger.log("ask_user_question_prompt", {
                      callId,
                      confirmationId,
                      interactRequestId:
                        typeof interactConfig.request_id === "string"
                          ? interactConfig.request_id
                          : "",
                      argumentRequestId:
                        typeof requestArguments.request_id === "string"
                          ? requestArguments.request_id
                          : "",
                      question:
                        typeof interactConfig.question === "string"
                          ? interactConfig.question
                          : typeof requestArguments.question === "string"
                            ? requestArguments.question
                            : "",
                      selectionMode:
                        typeof interactConfig.selection_mode === "string"
                          ? interactConfig.selection_mode
                          : typeof requestArguments.selection_mode === "string"
                            ? requestArguments.selection_mode
                            : "",
                      optionValues: Array.isArray(interactConfig.options)
                        ? interactConfig.options
                            .map((option) =>
                              typeof option?.value === "string"
                                ? option.value
                                : "",
                            )
                            .filter(Boolean)
                        : Array.isArray(requestArguments.options)
                          ? requestArguments.options
                              .map((option) =>
                                typeof option?.value === "string"
                                  ? option.value
                                  : "",
                              )
                              .filter(Boolean)
                          : [],
                    });
                  }

                  if (callId && confirmationId && requiresConfirmation) {
                    const confirmationRuntime =
                      getConfirmationRuntimeForChat(targetChatId);
                    confirmationRuntime.confirmationIdByCallId.set(
                      callId,
                      confirmationId,
                    );
                    confirmationRuntime.confirmationCallIdById.set(
                      confirmationId,
                      callId,
                    );
                    confirmationRuntime.sessionIdByConfirmationId.set(
                      confirmationId,
                      effectiveThreadId,
                    );
                    if (
                      confirmationRuntime.followupSignalById.get(confirmationId) !==
                      true
                    ) {
                      confirmationRuntime.followupSignalById.set(
                        confirmationId,
                        false,
                      );
                    }
                    const confirmationRequest = buildToolConfirmationRequest({
                      frame,
                      confirmationId,
                      callId,
                      toolName,
                      requestedAt: patchTime,
                      ownerMessageId: assistantMessageId,
                      chatId: targetChatId,
                      sessionId: effectiveThreadId,
                    });
                    if (isToolCallAutoApprovable(targetChatId, frame)) {
                      submitAutoApprovedToolConfirmation({
                        targetChatId,
                        confirmationId,
                        request: confirmationRequest,
                      });
                    } else {
                      updatePendingToolConfirmationRequests(targetChatId, (previous) =>
                        previous[confirmationId]
                          ? previous
                          : {
                              ...previous,
                              [confirmationId]: confirmationRequest,
                            },
                      );
                      updateToolConfirmationUiState(targetChatId, (previous) =>
                        previous[confirmationId]
                          ? previous
                          : {
                              ...previous,
                              [confirmationId]: {
                                status: "idle",
                                error: "",
                                resolved: false,
                              },
                            },
                      );
                    }
                  }
                } else if (
                  frame.type === "tool_confirmed" ||
                  frame.type === "tool_denied"
                ) {
                  const callId =
                    typeof frame.payload?.call_id === "string"
                      ? frame.payload.call_id
                      : "";
                  const confirmationId =
                    typeof frame.payload?.confirmation_id === "string"
                      ? frame.payload.confirmation_id
                      : "";
                  clearResolvedToolConfirmationByCallId(
                    targetChatId,
                    callId,
                    confirmationId,
                  );
                } else if (frame.type === "tool_result") {
                  const callId =
                    typeof frame.payload?.call_id === "string"
                      ? frame.payload.call_id
                      : "";
                  const toolName =
                    typeof frame.payload?.tool_name === "string"
                      ? frame.payload.tool_name
                      : typeof frame.payload?.result?.tool === "string"
                        ? frame.payload.result.tool
                        : "";
                  if (toolName === HUMAN_INPUT_TOOL_NAME) {
                    unchainLogger.log("ask_user_question_result", {
                      callId,
                      result: frame.payload?.result,
                    });
                  }
                  const confirmationId =
                    typeof frame.payload?.confirmation_id === "string"
                      ? frame.payload.confirmation_id
                      : "";
                  markConfirmationFollowupSignalByCallId(
                    targetChatId,
                    callId,
                    confirmationId,
                  );
                }
              };

              /* ── Route subagent frames to their sub-timeline ── */
              /* Known subagent: run_id already registered via lifecycle events */
              const isKnownChild = isKnownSubagentRunId(frameRunId);
              /* Unknown run_id that differs from parent: likely a subagent whose
                 lifecycle event hasn't arrived yet (race condition) or whose
                 run_id format differs. Register it eagerly. */
              const isUnknownChild =
                !isKnownChild &&
                frameRunId.length > 0 &&
                renderRuntime.parentRunId &&
                frameRunId !== renderRuntime.parentRunId;

              if (frameRunId && frameRunId !== renderRuntime.parentRunId) {
                unchainLogger.log("subagent_frame_routing", {
                  frameType: frame.type,
                  runId: frameRunId,
                  parentRunId: renderRuntime.parentRunId || "",
                  isKnownSubagentRunId: isKnownChild,
                  isUnknownSubagentRunId: isUnknownChild,
                });
              }

              if (isKnownChild || isUnknownChild) {
                if (isUnknownChild) {
                  /* Eagerly register this run_id as a subagent so subsequent
                     frames are also routed here. */
                  upsertSubagentMeta(frameRunId, { status: "running" });
                }
                if (!renderRuntime.subagentFramesByRunId.has(frameRunId)) {
                  renderRuntime.subagentFramesByRunId.set(frameRunId, []);
                }
                processChildToolInteractionSideEffects();
                renderRuntime.subagentFramesByRunId.get(frameRunId).push(frame);
                dirtySubagentFrameRunIds.add(frameRunId);

                if (
                  frame.type === "error" &&
                  typeof renderRuntime.subagentMetaByRunId.get(frameRunId) ===
                    "object" &&
                  renderRuntime.subagentMetaByRunId.get(frameRunId) !== null
                ) {
                  upsertSubagentMeta(frameRunId, {
                    status: "failed",
                  });
                }

                /* A fyi_injected frame emitted by a subagent (child run) must
                   still persist the parent-assistant interjection and exact-ACK
                   the durable pending FYI — otherwise the frame is only routed
                   into the subagent sub-timeline and the pending FYI survives in
                   the outbox, resurrecting a spurious successor on remount.
                   Flush the child frame immediately so it is durable before the
                   ACK clears the outbox entry. */
                if (frame.type === "fyi_injected") {
                  syncAssistantSubagentState(patchTime, { immediate: true });
                  applyFyiParentInterjectionAndAck(frame, patchTime);
                  return;
                }

                syncAssistantSubagentState(patchTime, {
                  immediate:
                    frame.type === "done" ||
                    frame.type === "error" ||
                    frame.type === "final_message",
                });
                return;
              }

              if (
                frame.type === "final_message" ||
                frame.type === "tool_call" ||
                frame.type === "error" ||
                frame.type === "done"
              ) {
                flushBufferedTokenDelta();
              }

              if (frame.type === "memory_prepare") {
                const payload =
                  frame.payload && typeof frame.payload === "object"
                    ? frame.payload
                    : {};
                unchainLogger.log("memory_prepare", {
                  applied: payload.applied,
                  session_id: payload.session_id,
                  before_estimated_tokens: payload.before_estimated_tokens,
                  after_estimated_tokens: payload.after_estimated_tokens,
                  last_n_turns: payload.last_n_turns,
                  kept_turn_count: payload.kept_turn_count,
                  total_turn_count: payload.total_turn_count,
                  vector_top_k: payload.vector_top_k,
                  vector_adapter_enabled: payload.vector_adapter_enabled,
                  vector_recall_count: payload.vector_recall_count,
                  vector_recall_status: payload.vector_recall_status,
                  vector_recall_preview: payload.vector_recall_preview,
                  vector_fallback_reason: payload.vector_fallback_reason,
                  fallback_reason: payload.fallback_reason,
                });
              }

              if (frame.type === "memory_commit") {
                const payload =
                  frame.payload && typeof frame.payload === "object"
                    ? frame.payload
                    : {};
                unchainLogger.log("memory_commit", {
                  applied: payload.applied,
                  session_id: payload.session_id,
                  stored_message_count: payload.stored_message_count,
                  vector_indexed_count: payload.vector_indexed_count,
                  memory_namespace: payload.memory_namespace,
                  long_term_pending_turn_count:
                    payload.long_term_pending_turn_count,
                  long_term_extract_every_n_turns:
                    payload.long_term_extract_every_n_turns,
                  long_term_extraction_deferred:
                    payload.long_term_extraction_deferred,
                  long_term_profile_updated: payload.long_term_profile_updated,
                  long_term_profile_key_count:
                    payload.long_term_profile_key_count,
                  long_term_memory_indexed_count:
                    payload.long_term_memory_indexed_count,
                  long_term_fact_indexed_count:
                    payload.long_term_fact_indexed_count,
                  long_term_episode_indexed_count:
                    payload.long_term_episode_indexed_count,
                  long_term_playbook_indexed_count:
                    payload.long_term_playbook_indexed_count,
                  long_term_noop: payload.long_term_noop,
                  long_term_fallback_reason: payload.long_term_fallback_reason,
                  long_term_profile_fallback_reason:
                    payload.long_term_profile_fallback_reason,
                  long_term_extractor_fallback_reason:
                    payload.long_term_extractor_fallback_reason,
                  long_term_vector_fallback_reason:
                    payload.long_term_vector_fallback_reason,
                  vector_fallback_reason: payload.vector_fallback_reason,
                  fallback_reason: payload.fallback_reason,
                });
              }

              if (frame.type === "tool_call") {
                const callId =
                  typeof frame.payload?.call_id === "string"
                    ? frame.payload.call_id
                    : "";
                const confirmationId =
                  typeof frame.payload?.confirmation_id === "string"
                    ? frame.payload.confirmation_id
                    : "";
                const requiresConfirmation =
                  frame.payload?.requires_confirmation === true ||
                  Boolean(confirmationId);
                const toolName =
                  typeof frame.payload?.tool_name === "string"
                    ? frame.payload.tool_name
                    : "";
                if (toolName === HUMAN_INPUT_TOOL_NAME) {
                  const interactConfig =
                    frame.payload?.interact_config &&
                    typeof frame.payload.interact_config === "object"
                      ? frame.payload.interact_config
                      : {};
                  const requestArguments =
                    frame.payload?.arguments &&
                    typeof frame.payload.arguments === "object"
                      ? frame.payload.arguments
                      : {};
                  unchainLogger.log("ask_user_question_prompt", {
                    callId,
                    confirmationId,
                    interactRequestId:
                      typeof interactConfig.request_id === "string"
                        ? interactConfig.request_id
                        : "",
                    argumentRequestId:
                      typeof requestArguments.request_id === "string"
                        ? requestArguments.request_id
                        : "",
                    question:
                      typeof interactConfig.question === "string"
                        ? interactConfig.question
                        : typeof requestArguments.question === "string"
                          ? requestArguments.question
                          : "",
                    selectionMode:
                      typeof interactConfig.selection_mode === "string"
                        ? interactConfig.selection_mode
                        : typeof requestArguments.selection_mode === "string"
                          ? requestArguments.selection_mode
                          : "",
                    optionValues: Array.isArray(interactConfig.options)
                      ? interactConfig.options
                          .map((option) =>
                            typeof option?.value === "string"
                              ? option.value
                              : "",
                          )
                          .filter(Boolean)
                      : Array.isArray(requestArguments.options)
                        ? requestArguments.options
                            .map((option) =>
                              typeof option?.value === "string"
                                ? option.value
                                : "",
                            )
                            .filter(Boolean)
                        : [],
                  });
                }
                if (callId && confirmationId && requiresConfirmation) {
                  const confirmationRuntime =
                    getConfirmationRuntimeForChat(targetChatId);
                  confirmationRuntime.confirmationIdByCallId.set(
                    callId,
                    confirmationId,
                  );
                  confirmationRuntime.confirmationCallIdById.set(
                    confirmationId,
                    callId,
                  );
                  confirmationRuntime.sessionIdByConfirmationId.set(
                    confirmationId,
                    effectiveThreadId,
                  );
                  if (
                    confirmationRuntime.followupSignalById.get(confirmationId) !==
                    true
                  ) {
                    confirmationRuntime.followupSignalById.set(
                      confirmationId,
                      false,
                    );
                  }
                  const confirmationRequest = buildToolConfirmationRequest({
                    frame,
                    confirmationId,
                    callId,
                    toolName,
                    requestedAt: patchTime,
                    ownerMessageId: assistantMessageId,
                    chatId: targetChatId,
                    sessionId: effectiveThreadId,
                  });
                  if (isToolCallAutoApprovable(targetChatId, frame)) {
                    submitAutoApprovedToolConfirmation({
                      targetChatId,
                      confirmationId,
                      request: confirmationRequest,
                    });
                  } else {
                    updatePendingToolConfirmationRequests(targetChatId, (previous) =>
                      previous[confirmationId]
                        ? previous
                        : {
                            ...previous,
                            [confirmationId]: confirmationRequest,
                          },
                    );
                    updateToolConfirmationUiState(targetChatId, (previous) =>
                      previous[confirmationId]
                        ? previous
                        : {
                            ...previous,
                            [confirmationId]: {
                              status: "idle",
                              error: "",
                              resolved: false,
                            },
                          },
                    );
                  }
                }
              } else if (
                frame.type === "tool_confirmed" ||
                frame.type === "tool_denied"
              ) {
                const callId =
                  typeof frame.payload?.call_id === "string"
                    ? frame.payload.call_id
                    : "";
                const confirmationId =
                  typeof frame.payload?.confirmation_id === "string"
                    ? frame.payload.confirmation_id
                    : "";
                clearResolvedToolConfirmationByCallId(
                  targetChatId,
                  callId,
                  confirmationId,
                );
              } else if (frame.type === "tool_result") {
                const callId =
                  typeof frame.payload?.call_id === "string"
                    ? frame.payload.call_id
                    : "";
                const toolName =
                  typeof frame.payload?.tool_name === "string"
                    ? frame.payload.tool_name
                    : typeof frame.payload?.result?.tool === "string"
                      ? frame.payload.result.tool
                      : "";
                if (toolName === HUMAN_INPUT_TOOL_NAME) {
                  unchainLogger.log("ask_user_question_result", {
                    callId,
                    result: frame.payload?.result,
                  });
                }
                const confirmationId =
                  typeof frame.payload?.confirmation_id === "string"
                    ? frame.payload.confirmation_id
                    : "";
                markConfirmationFollowupSignalByCallId(
                  targetChatId,
                  callId,
                  confirmationId,
                );
              } else if (frame.type === "error" || frame.type === "done") {
                markAllPendingConfirmationFollowupSignals(targetChatId);
                updatePendingContinuationRequestForChat(targetChatId, null);
              }

              if (frame.type === "final_message") {
                const rawFinalContent =
                  typeof frame.payload?.content === "string"
                    ? frame.payload.content
                    : "";
                const finalContent = rawFinalContent
                  .replace(/<think>[\s\S]*?<\/think>/g, "")
                  .replace(/^\s*\n/, "");
                const nextStreamMessages = streamMessages.map((message) => {
                  if (message.id !== assistantMessageId) return message;

                  const currentContent = activeStreamingMessageStore.getText({
                    chatId: targetChatId,
                    messageId: assistantMessageId,
                  });
                  const hasToolActivity = (message.traceFrames || []).some(
                    (traceFrame) =>
                      traceFrame.type === "tool_call" ||
                      traceFrame.type === "tool_result",
                  );

                  const useAccumulated =
                    !hasToolActivity &&
                    currentContent.trim() === finalContent.trim() &&
                    currentContent.length > 0;

                  if (!useAccumulated) {
                    activeStreamingMessageStore.replace({
                      chatId: targetChatId,
                      messageId: assistantMessageId,
                      text: finalContent,
                      updatedAt: patchTime,
                    });
                  }

                  // #155-A: a real backend final_message is the model's canonical
                  // answer for this turn — stamp it `terminal` so the bubble reads an
                  // explicit ownership flag instead of inferring it from the frame list.
                  // (The renderer takes the latest terminal as the answer; any earlier
                  //  terminal/draft segments fall to the timeline.)
                  return {
                    ...message,
                    updatedAt: patchTime,
                    traceFrames: [
                      ...(message.traceFrames || []),
                      {
                        ...frame,
                        payload: {
                          ...(frame.payload || {}),
                          finality: FINALITY.TERMINAL,
                        },
                      },
                    ],
                  };
                });
                syncStreamMessages(nextStreamMessages);
                return;
              }

              if (frame.type === "tool_call") {
                const nextStreamMessages = streamMessages.map((message) => {
                  if (message.id !== assistantMessageId) return message;

                  const currentContent = activeStreamingMessageStore.getText({
                    chatId: targetChatId,
                    messageId: assistantMessageId,
                  });
                  const currentContentTrimmed = currentContent.trim();
                  const existingFrames = message.traceFrames || [];

                  const alreadyCaptured =
                    !currentContentTrimmed ||
                    existingFrames.some(
                      (traceFrame) =>
                        traceFrame.type === "final_message" &&
                        typeof traceFrame.payload?.content === "string" &&
                        traceFrame.payload.content.trim() ===
                          currentContentTrimmed,
                    );

                  // #155-A: the pre-tool-call accumulated text is an intermediate
                  // draft, not the turn's final answer — mark it `draft` so the bubble
                  // never renders it as the canonical answer (the bug in #155 where a
                  // no-tool answer showed up as both a tool-call draft and a final).
                  const syntheticFrame = alreadyCaptured
                    ? []
                    : [
                        {
                          seq:
                            (Number.isFinite(Number(frame.seq))
                              ? Number(frame.seq)
                              : 0) - 0.5,
                          ts: patchTime,
                          type: "final_message",
                          stage: "model",
                          payload: {
                            content: currentContent,
                            finality: FINALITY.DRAFT,
                          },
                        },
                      ];

                  /* If this tool_call has a confirmation_id and an older
                     frame with the same call_id already exists (emitted by
                     on_event before the confirm callback), replace it so the
                     confirmation UI renders correctly. */
                  const frameCallId =
                    typeof frame.payload?.call_id === "string"
                      ? frame.payload.call_id
                      : "";
                  const frameHasConfirmation =
                    typeof frame.payload?.confirmation_id === "string" &&
                    frame.payload.confirmation_id;
                  let mergedFrames = [...existingFrames, ...syntheticFrame];
                  if (frameCallId && frameHasConfirmation) {
                    const dupIdx = mergedFrames.findIndex(
                      (f) =>
                        f.type === "tool_call" &&
                        f.payload?.call_id === frameCallId,
                    );
                    if (dupIdx >= 0) {
                      mergedFrames[dupIdx] = frame;  // replace old frame
                    } else {
                      mergedFrames.push(frame);
                    }
                  } else {
                    mergedFrames.push(frame);
                  }

                  return {
                    ...clearStreamingMessageText(message),
                    updatedAt: patchTime,
                    traceFrames: mergedFrames,
                  };
                });
                activeStreamingMessageStore.replace({
                  chatId: targetChatId,
                  messageId: assistantMessageId,
                  text: "",
                  updatedAt: patchTime,
                });
                syncStreamMessages(nextStreamMessages);
                return;
              }

              if (frame.type === "fyi_injected") {
                /* Persist the raw frame onto the root assistant's traceFrames
                   first, then run the shared interjection + exact-ACK handling
                   (stable ids derived from message_id, deduped by id). */
                const nextStreamMessages = streamMessages.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        updatedAt: patchTime,
                        traceFrames: [...(message.traceFrames || []), frame],
                      }
                    : message,
                );
                syncStreamMessages(nextStreamMessages);
                applyFyiParentInterjectionAndAck(frame, patchTime);
                return;
              }

              const nextStreamMessages = streamMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      updatedAt: patchTime,
                      traceFrames: [...(message.traceFrames || []), frame],
                    }
                  : message,
              );
              syncStreamMessages(nextStreamMessages);
            },
            onMeta: (meta) => {
              if (!isCurrentRun()) {
                return;
              }
              if (
                meta &&
                typeof meta.thread_id === "string" &&
                meta.thread_id.trim()
              ) {
                if (!runIsCharacterChat) {
                  storageApi.setChatThreadId(targetChatId, meta.thread_id, {
                    source: "chat-page",
                  });
                }
              }

              if (meta && typeof meta.model === "string" && meta.model.trim()) {
                if (!runIsCharacterChat) {
                  storageApi.setChatModel(
                    targetChatId,
                    { id: meta.model },
                    { source: "chat-page" },
                  );
                }
                if (
                  !runIsCharacterChat &&
                  activeChatIdRef.current === targetChatId
                ) {
                  modelIdRef.current = meta.model;
                  setSelectedModelId(meta.model);
                }
              }
            },
            onToken: (delta) => {
              if (!isCurrentRun()) {
                return;
              }
              acknowledgeTurnMutationRun();
              if (
                renderRuntime.lastTokenRunId &&
                isKnownSubagentRunId(renderRuntime.lastTokenRunId)
              ) {
                renderRuntime.lastTokenRunId = "";
                return;
              }
              renderRuntime.lastTokenRunId = "";
              if (typeof delta !== "string" || !delta) {
                return;
              }

              thinkTagParser.feed(delta);
            },
            onDone: (done) => {
              if (!isCurrentRun() || terminalAccountingPending) {
                return;
              }
              terminalAccountingPending = true;
              /* Successful done is authoritative acceptance evidence too — a
                 very fast run may finish before any token/lifecycle frame was
                 observed. Consume the relayed turn here as a done fallback. */
              markRequestConsumed();
              const finishAdmittedDone = ({
                bundle,
                completionDiagnostics,
              }) => {
              terminalAccountingPending = false;
              if (!isCurrentRun()) {
                return;
              }
              updatePendingContinuationRequestForChat(targetChatId, null);
              /* Sync closure with external updates before building final messages. */
              const _refMsgs = activeStreamsRef.current.get(targetChatId)?.messages;
              if (Array.isArray(_refMsgs) && _refMsgs.length > 0) {
                streamMessages = _refMsgs;
              }

              thinkTagParser.flush();
              flushBufferedTokenDelta();
              flushStreamingMessageStore(targetChatId, assistantMessageId);
              const doneTime = Date.now();
              const rawAgentOrchestration =
                bundle?.descriptor?.agent_orchestration ||
                bundle?.agent_orchestration ||
                null;
              const nextAgentOrchestration =
                rawAgentOrchestration
                  ? normalizeAgentOrchestration(
                      typeof rawAgentOrchestration === "string"
                        ? { mode: rawAgentOrchestration }
                        : rawAgentOrchestration,
                    )
                  : null;

              const materializedStreamMessages = materializeStreamingMessages(
                targetChatId,
                streamMessages,
              );
              let nextStreamMessages = materializedStreamMessages.map((message) => {
                if (message.id !== assistantMessageId) return message;
                let cleanContent =
                  typeof message.content === "string" ? message.content : "";
                cleanContent = cleanContent
                  .replace(/<think>[\s\S]*?<\/think>/g, "")
                  .replace(/^\s*\n/, "");
                return finalizeStreamingMessage(message, {
                  content: cleanContent,
                  status: "done",
                  updatedAt: doneTime,
                  meta: {
                    ...(message.meta || {}),
                    ...(bundle ? { bundle } : {}),
                    ...(completionDiagnostics
                      ? { completion_diagnostics: completionDiagnostics }
                      : {}),
                  },
                });
              });

              // Clarify timeout fallback: the run ended before the user picked
              // a channel — resolve it as a queued turn so the message is
              // never lost, and mark the frame so the UI stops showing it as
              // pending.
              const pendingClarifyOnDone =
                pendingClarifyByChatIdRef.current.get(targetChatId) ||
                readPendingClarifyForChat(targetChatId);
              if (pendingClarifyOnDone) {
                const clarifiedFallback = fallbackPendingClarifyForChat(
                  targetChatId,
                );
                if (clarifiedFallback) {
                  nextStreamMessages = nextStreamMessages.map((message) => {
                    if (message.id !== assistantMessageId) return message;
                    const frames = Array.isArray(message.traceFrames)
                      ? message.traceFrames
                      : [];
                    return {
                      ...message,
                      traceFrames: frames.map((frame) =>
                        frame?.type === "clarify_request" &&
                        frame?.payload?.id === pendingClarifyOnDone.id
                          ? {
                              ...frame,
                              payload: {
                                ...frame.payload,
                                status: "resolved_default",
                              },
                            }
                          : frame,
                      ),
                    };
                  });
                } else {
                  setStreamErrorForChat(
                    targetChatId,
                    "The pending clarification is still saved and will be recovered after reload.",
                  );
                }
              }
              syncStreamMessages(nextStreamMessages);

              if (!runIsCharacterChat && nextAgentOrchestration) {
                storageApi.setChatAgentOrchestration(
                  targetChatId,
                  nextAgentOrchestration,
                  { source: "chat-page" },
                );
                if (
                  typeof setAgentOrchestration === "function" &&
                  activeChatIdRef.current === targetChatId
                ) {
                  setAgentOrchestration(nextAgentOrchestration);
                }
              }

              // Persist the final messages now. Foreground writes synchronously
              // (the debounced persist effect waits on a React commit that a
              // janky main thread can starve → lost last response); background
              // chats flush their own buffer.
              finalizeStreamPersist({
                storageApi,
                chatId: targetChatId,
                messages: nextStreamMessages,
                isForeground: activeChatIdRef.current === targetChatId,
                flushBackgroundPersist,
              });
              clearStreamingMessageStore(targetChatId, assistantMessageId);
              streamHandlesRef.current.delete(targetChatId);
              streamingChatIdsRef.current.delete(targetChatId);
              activeStreamsRef.current.delete(targetChatId);
              setStreamingChatIds((prev) => {
                const next = new Set(prev);
                next.delete(targetChatId);
                return next;
              });
              clearAllPendingToolConfirmations(targetChatId);
              if (isDurableResume) {
                const retryTimer = durableResumeRetryTimersRef.current.get(
                  targetChatId,
                );
                if (retryTimer) {
                  clearTimeout(retryTimer);
                  durableResumeRetryTimersRef.current.delete(targetChatId);
                }
                clearDurableResumeStartedKeysForChat(targetChatId);
                updateDurableInteractionForChat(targetChatId, null);
              }
              flushSubagentState(Date.now());
              activeFlushScheduler.flushSync();
              disposeBufferedTokenFlush();
              releaseTokenFlushController();
              if (activeChatIdRef.current !== targetChatId) {
                storageApi.setChatGeneratedUnread(targetChatId, true, {
                  source: "chat-page",
                });
              }

              const terminalAttemptId =
                executionIdentityByChatIdRef.current.get(targetChatId)
                  ?.attemptId ||
                queueAttemptIdByChatIdRef.current.get(targetChatId) ||
                "";
              const pendingClarifyBtwBarrier =
                clarifyBtwBarrierByChatIdRef.current.get(targetChatId) || null;
              const holdsExactClarifyBtw = Boolean(
                pendingClarifyBtwBarrier &&
                  !pendingClarifyBtwBarrier.settled &&
                  pendingClarifyBtwBarrier.attemptId === terminalAttemptId &&
                  pendingClarifyBtwBarrier.runGeneration === activeRunGeneration,
              );
              if (terminalAttemptId && !holdsExactClarifyBtw) {
                fallbackPendingFyisForAttempt(
                  targetChatId,
                  terminalAttemptId,
                );
              }
              activeRunThreadIdByChatIdRef.current.delete(targetChatId);

              const terminalRelayContext = {
                targetChatId,
                nextStreamMessages,
                characterAgentConfig: resolvedCharacterConfig,
                runContext: effectiveRunContext,
              };
              if (holdsExactClarifyBtw) {
                // The owner is fully persisted/settled above, but its clarify-
                // owned BTW is still in flight. Hold only terminal queue relay;
                // the exact barrier releases it after receipt or fallback.
                pendingClarifyBtwBarrier.terminal = {
                  status: "done",
                  relayContext: terminalRelayContext,
                };
              } else {
                relayQueuedTurnsAfterRunRef.current?.(terminalRelayContext);
              }
              };
              const failDoneAccounting = (error) => {
                terminalAccountingPending = false;
                if (!isCurrentRun()) return;
                streamCallbacks.onError({
                  code: error?.code || "run_bundle_accounting_failed",
                  message:
                    error?.message ||
                    "The completed run could not be admitted to the Run Bundle ledger.",
                });
              };
              try {
                const admission = admitDoneRunAccountingV1(done);
                if (admission && typeof admission.then === "function") {
                  void admission.then(finishAdmittedDone).catch(failDoneAccounting);
                } else {
                  finishAdmittedDone(admission);
                }
              } catch (error) {
                failDoneAccounting(error);
              }
            },
            onError: (error) => {
              if (!isCurrentRun()) {
                return;
              }
              updatePendingContinuationRequestForChat(targetChatId, null);
              thinkTagParser.flush();
              flushBufferedTokenDelta();
              flushStreamingMessageStore(targetChatId, assistantMessageId);
              if (
                !streamHandlesRef.current.has(targetChatId) &&
                !streamingChatIdsRef.current.has(targetChatId)
              ) {
                flushSubagentState(Date.now());
                activeFlushScheduler.flushSync();
                disposeBufferedTokenFlush();
                releaseTokenFlushController();
                return;
              }
              const errorMessage = error?.message || "Unknown stream error";
              const errorCode = error?.code || "stream_error";
              const hasAdmittedRunAccounting =
                error?.[ADMITTED_RUN_ACCOUNTING_ERROR] === true;
              const admittedBundle =
                hasAdmittedRunAccounting &&
                error.bundle &&
                typeof error.bundle === "object"
                  ? error.bundle
                  : null;
              const admittedCompletionDiagnostics =
                hasAdmittedRunAccounting &&
                error.completion_diagnostics &&
                typeof error.completion_diagnostics === "object"
                  ? error.completion_diagnostics
                  : null;
              const admittedAccountingMeta = {
                ...(admittedBundle ? { bundle: admittedBundle } : {}),
                ...(admittedCompletionDiagnostics
                  ? {
                      completion_diagnostics:
                        admittedCompletionDiagnostics,
                    }
                  : {}),
              };
              const wasCancelled =
                errorCode === "cancelled" || error?.cancelled === true;
              const errorTime = Date.now();
              const cancellationHandledByRecovery =
                [
                  "execution_lease_conflict",
                  "stream_not_found",
                  "stream_attach_target_unavailable",
                  "stream_replay_gap",
                ].includes(errorCode) || errorCode.startsWith("queue_relay_");
              const hasPendingDurableInteraction =
                Object.keys(
                  pendingToolConfirmationRequestsByChatIdRef.current[
                    targetChatId
                  ] || {},
                ).length > 0;

              /* A renderer-side error is not proof that the durable worker
                 stopped. Persist semantic cancellation before we forget the
                 exact identity, so a graph child cannot become an orphan that
                 resumes when this chat is reopened. */
              if (
                !wasCancelled &&
                !hasAdmittedRunAccounting &&
                !cancellationHandledByRecovery &&
                !hasPendingDurableInteraction
              ) {
                const cancellationIdentity =
                  executionIdentityByChatIdRef.current.get(targetChatId) ||
                  executionIdentityFromMessages(targetChatId, streamMessages);
                const queuedCancellation = enqueueExecutionCancel({
                  ...(cancellationIdentity || {}),
                  ownerChatId: targetChatId,
                  reason: "stream_error",
                  createdAt: Date.now(),
                });
                if (queuedCancellation) {
                  void requestExecutionCancellationAndDisconnect({
                    identity: queuedCancellation,
                    handle: streamHandlesRef.current.get(targetChatId),
                    reason: "stream_error",
                  }).then((result) => {
                    if (result?.terminal) {
                      removeExecutionCancel(
                        queuedCancellation.sessionId,
                        queuedCancellation.attemptId,
                        queuedCancellation.interactionId,
                      );
                    }
                  });
                }
              }

              if (isDurableResume && !hasAdmittedRunAccounting) {
                const retrySourceMessages = materializeStreamingMessages(
                  targetChatId,
                  streamMessages,
                );
                if (scheduleDurableResumeRetry(error, retrySourceMessages)) {
                  cancelBackgroundPersist(targetChatId);
                  streamHandlesRef.current.delete(targetChatId);
                  streamingChatIdsRef.current.delete(targetChatId);
                  activeStreamsRef.current.delete(targetChatId);
                  clearStreamingMessageStore(targetChatId, assistantMessageId);
                  setStreamingChatIds((prev) => {
                    const next = new Set(prev);
                    next.delete(targetChatId);
                    return next;
                  });
                  activeRunThreadIdByChatIdRef.current.delete(targetChatId);
                  flushSubagentState(Date.now());
                  activeFlushScheduler.flushSync();
                  disposeBufferedTokenFlush();
                  releaseTokenFlushController();
                  return;
                }
              }

              if (
                !hasAdmittedRunAccounting &&
                !isDurableResume &&
                errorCode === "memory_unavailable" &&
                memoryFallbackAttempted !== true
              ) {
                if (activeChatIdRef.current === targetChatId) {
                  setStreamError(
                    "Memory is unavailable for this request. Retrying with recent history.",
                  );
                }
                const retrySourceAttemptId =
                  executionIdentityByChatIdRef.current.get(targetChatId)
                    ?.attemptId ||
                  queueAttemptIdByChatIdRef.current.get(targetChatId) ||
                  "";
                if (retrySourceAttemptId) {
                  fallbackPendingFyisForAttempt(
                    targetChatId,
                    retrySourceAttemptId,
                  );
                }
                cancelBackgroundPersist(targetChatId);
                streamHandlesRef.current.delete(targetChatId);
                streamingChatIdsRef.current.delete(targetChatId);
                activeStreamsRef.current.delete(targetChatId);
                setStreamingChatIds((prev) => {
                  const next = new Set(prev);
                  next.delete(targetChatId);
                  return next;
                });
                clearAllPendingToolConfirmations(targetChatId);
                flushSubagentState(Date.now());
                activeFlushScheduler.flushSync();
                disposeBufferedTokenFlush();
                releaseTokenFlushController();

                const retryHistory = buildHistoryForModel(
                  materializeStreamingMessages(targetChatId, streamMessages),
                  targetChatId,
                );
                clearStreamingMessageStore(targetChatId, assistantMessageId);
                void runTurnRequest({
                  mode,
                  chatId: targetChatId,
                  /* Byte-identical to what this run already sent: the gate
                     settled it (handle markers for a "store" decision, the
                     user's own plaintext for an explicit "plain" one) and the
                     guard above already spent the one-time token. This is an
                     app-initiated transparent retry of an approved send, so it
                     declares the gate settled rather than re-deriving proof it
                     structurally cannot have. It never re-deposits and never
                     re-exposes anything the user did not already approve. */
                  text: promptText,
                  secretGateSettled: true,
                  attachments: persistedAttachments,
                  baseMessages: normalizedBaseMessages,
                  clearComposer: false,
                  reuseUserMessage: normalizedReuseUserMessage,
                  missingAttachmentPayloadMode,
                  extraToolkits,
                  memoryFallbackAttempted: true,
                  forceHistoryFallback: true,
                  historyOverride: retryHistory,
                  characterAgentConfig: resolvedCharacterConfig,
                  runGeneration: activeRunGeneration,
                  runContext: effectiveRunContext,
                  /* This is an internal transparent retry, not a terminal
                     failure. Carry the queue-relay acceptance callbacks forward
                     so the retry's acceptance (or its own terminal reject)
                     settles the relay exactly once. */
                  onConsumed,
                  onReject,
                  relayItemIds,
                  relayItems,
                  relaySourceAttemptId,
                  relaySourceClientOperationId,
                  continuedFromRunId,
                });
                return;
              }

              /* Pre-acceptance ownership rejection of a relayed queue turn: the
                 server refused the run because another owns the execution lease
                 (execution_lease_conflict), before any acceptance evidence. Roll
                 the optimistic turn back so the relay's retry re-adds it exactly
                 once — never a double successor — then hand control to the
                 relay's reject callback. This is scoped to the exact lease
                 conflict code: any other terminal error surfaces normally, and a
                 normal user send (no onReject) never reaches here. A user cancel
                 is excluded (wasCancelled) so Stop never resurrects the turn. */
              if (
                !hasAdmittedRunAccounting &&
                !requestConsumed &&
                !wasCancelled &&
                errorCode === "execution_lease_conflict" &&
                typeof onReject === "function"
              ) {
                rejectQueueRelayBeforeAcceptance();
                return;
              }

              /* T5: only show error banner if trace chain doesn't already
                 have frames — when trace is visible, the ErrorNode in the
                 timeline handles display so we avoid duplicating the message. */
              const currentAssistantMsg = streamMessages.find(
                (m) => m.id === assistantMessageId,
              );
              const traceHasContent =
                Array.isArray(currentAssistantMsg?.traceFrames) &&
                currentAssistantMsg.traceFrames.length > 0;
              if (
                !wasCancelled &&
                activeChatIdRef.current === targetChatId &&
                !traceHasContent
              ) {
                setStreamError(errorMessage);
              }
              streamHandlesRef.current.delete(targetChatId);
              streamingChatIdsRef.current.delete(targetChatId);
              setStreamingChatIds((prev) => {
                const next = new Set(prev);
                next.delete(targetChatId);
                return next;
              });
              clearAllPendingToolConfirmations(targetChatId);
              flushSubagentState(Date.now());
              activeFlushScheduler.flushSync();
              disposeBufferedTokenFlush();
              releaseTokenFlushController();

              const materializedStreamMessages = materializeStreamingMessages(
                targetChatId,
                streamMessages,
              );
              let nextStreamMessages = materializedStreamMessages.map((message) => {
                if (message.id !== assistantMessageId) {
                  return message;
                }

                const hasTrace =
                  Array.isArray(message.traceFrames) &&
                  message.traceFrames.length > 0;

                if (wasCancelled) {
                  return finalizeStreamingMessage(message, {
                    status: "cancelled",
                    updatedAt: errorTime,
                    content:
                      typeof message.content === "string"
                        ? message.content
                        : "",
                    meta: {
                      ...(message.meta || {}),
                      ...admittedAccountingMeta,
                    },
                  });
                }

                const errorFrame = {
                  seq: (message.traceFrames?.length || 0) + 1,
                  ts: errorTime,
                  run_id: "",
                  type: "error",
                  payload: { code: errorCode, message: errorMessage },
                };
                const currentContent =
                  typeof message.content === "string" ? message.content : "";

                return finalizeStreamingMessage(message, {
                  status: "error",
                  updatedAt: errorTime,
                  content: hasTrace
                    ? currentContent
                    : currentContent || `[error] ${errorMessage}`,
                  traceFrames: hasTrace
                    ? [...message.traceFrames, errorFrame]
                    : message.traceFrames,
                  meta: {
                    ...(message.meta || {}),
                    ...admittedAccountingMeta,
                    error: {
                      code: errorCode,
                      message: errorMessage,
                    },
                  },
                });
              });

              // Clarify timeout fallback (see onDone) — the run also ends on
              // error, so resolve any pending clarify into the queued-turns
              // buffer here too; the message must never be silently dropped.
              const pendingClarifyOnError =
                pendingClarifyByChatIdRef.current.get(targetChatId) ||
                readPendingClarifyForChat(targetChatId);
              if (pendingClarifyOnError) {
                const clarifiedFallback = fallbackPendingClarifyForChat(
                  targetChatId,
                );
                if (clarifiedFallback) {
                  nextStreamMessages = nextStreamMessages.map((message) => {
                    if (message.id !== assistantMessageId) return message;
                    const frames = Array.isArray(message.traceFrames)
                      ? message.traceFrames
                      : [];
                    return {
                      ...message,
                      traceFrames: frames.map((frame) =>
                        frame?.type === "clarify_request" &&
                        frame?.payload?.id === pendingClarifyOnError.id
                          ? {
                              ...frame,
                              payload: {
                                ...frame.payload,
                                status: "resolved_default",
                              },
                            }
                          : frame,
                      ),
                    };
                  });
                } else {
                  setStreamErrorForChat(
                    targetChatId,
                    "The pending clarification is still saved and will be recovered after reload.",
                  );
                }
              }
              syncStreamMessages(nextStreamMessages);
              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
              clearStreamingMessageStore(targetChatId, assistantMessageId);
              activeStreamsRef.current.delete(targetChatId);

              const failedAttemptId =
                executionIdentityByChatIdRef.current.get(targetChatId)
                  ?.attemptId ||
                queueAttemptIdByChatIdRef.current.get(targetChatId) ||
                "";
              const pendingClarifyBtwBarrier =
                clarifyBtwBarrierByChatIdRef.current.get(targetChatId) || null;
              const ownsFailedClarifyBtw = Boolean(
                pendingClarifyBtwBarrier &&
                  !pendingClarifyBtwBarrier.settled &&
                  pendingClarifyBtwBarrier.attemptId === failedAttemptId &&
                  pendingClarifyBtwBarrier.runGeneration === activeRunGeneration,
              );
              if (ownsFailedClarifyBtw) {
                pendingClarifyBtwBarrier.terminal = {
                  status: wasCancelled ? "cancelled" : "error",
                  relayContext: {
                    targetChatId,
                    nextStreamMessages,
                    characterAgentConfig: resolvedCharacterConfig,
                    runContext: effectiveRunContext,
                  },
                };
                settleClarifyBtwBarrier(pendingClarifyBtwBarrier, {
                  disposition: "migrate",
                });
              } else if (failedAttemptId) {
                fallbackPendingFyisForAttempt(
                  targetChatId,
                  failedAttemptId,
                );
              }
              activeRunThreadIdByChatIdRef.current.delete(targetChatId);

              const queuedTurnsOnError =
                queuedTurnsByChatIdRef.current.get(targetChatId);
              if (queuedTurnsOnError) {
                // Preserve queued input after an error. Only a normal onDone
                // may automatically relay it into a new generation.
                syncInterjectStateForChat(targetChatId);
              }
            },
          };
        streamHandle = startChatStream(streamPayload, streamCallbacks);
      } catch (error) {
        if (!isCurrentRun()) {
          return false;
        }
        flushSubagentState(Date.now());
        activeFlushScheduler.flushSync();
        disposeBufferedTokenFlush();
        releaseTokenFlushController();
        const errorMessage = error?.message || "Failed to start stream";
        // C12 / FM15: a custom provider's send-time fail-closed throw carries a
        // structured code (see api.unchain.injectCustomProviderIntoPayload).
        // Surface an actionable toast instead of letting it fall into the
        // generic error bubble with no way forward.
        emitCustomProviderSendErrorToast(error, tRef.current);
        if (scheduleDurableResumeRetry(error, nextMessages)) {
          cancelBackgroundPersist(targetChatId);
          streamHandlesRef.current.delete(targetChatId);
          streamingChatIdsRef.current.delete(targetChatId);
          activeStreamsRef.current.delete(targetChatId);
          clearStreamingMessageStore(targetChatId, assistantMessageId);
          setStreamingChatIds((prev) => {
            const next = new Set(prev);
            next.delete(targetChatId);
            return next;
          });
          activeRunThreadIdByChatIdRef.current.delete(targetChatId);
          return true;
        }
        setStreamErrorForChat(targetChatId, errorMessage);
        cancelBackgroundPersist(targetChatId);
        streamHandlesRef.current.delete(targetChatId);
        streamingChatIdsRef.current.delete(targetChatId);
        activeStreamsRef.current.delete(targetChatId);
        clearStreamingMessageStore(targetChatId, assistantMessageId);
        setStreamingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(targetChatId);
          return next;
        });
        activeRunThreadIdByChatIdRef.current.delete(targetChatId);

        const failedMessages = nextMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                status: "error",
                updatedAt: Date.now(),
                content: `[error] ${errorMessage}`,
              }
            : message,
        );
        commitForegroundMessages(targetChatId, failedMessages);
        storageApi.setChatMessages(targetChatId, failedMessages, {
          source: "chat-page",
        });
        return false;
      }

      streamHandlesRef.current.set(targetChatId, streamHandle);

      const streamAttemptId =
        typeof streamHandle?.attemptId === "string" &&
        streamHandle.attemptId.trim()
          ? streamHandle.attemptId.trim()
          : typeof streamHandle?.requestId === "string"
            ? streamHandle.requestId.trim()
            : "";
      const previousAttemptId =
        executionIdentityByChatIdRef.current.get(targetChatId)?.attemptId ||
        "";
      if (
        streamAttemptId &&
        previousAttemptId &&
        previousAttemptId !== streamAttemptId
      ) {
        fallbackPendingFyisForAttempt(targetChatId, previousAttemptId);
      }
      if (effectiveThreadId && streamAttemptId) {
        executionIdentityByChatIdRef.current.set(targetChatId, {
          ownerChatId: targetChatId,
          sessionId: effectiveThreadId,
          attemptId: streamAttemptId,
          requestId:
            typeof streamHandle?.requestId === "string"
              ? streamHandle.requestId.trim()
              : "",
          sourceAttemptId: isDurableResume
            ? durableInteraction.sourceRunId || ""
            : "",
          runGeneration: activeRunGeneration,
        });
        syncPendingFyiStateForAttempt(targetChatId, streamAttemptId);
      }
      const queuedTurnsForIdentity =
        queuedTurnsByChatIdRef.current.get(targetChatId);
      const relayStateForBinding =
        queueRelayAttemptsByChatIdRef.current.get(targetChatId);
      const relayInFlightIds = new Set(
        exactRelayItemIds.size > 0
          ? exactRelayItemIds
          : isQueueRelayRequest &&
              relayStateForBinding?.buffer === queuedTurnsForIdentity &&
              Array.isArray(relayStateForBinding.inFlightIds)
            ? relayStateForBinding.inFlightIds
            : [],
      );
      const sourceQueueAttemptId =
        queueAttemptIdByChatIdRef.current.get(targetChatId) ||
        (typeof relaySourceAttemptId === "string"
          ? relaySourceAttemptId.trim()
          : "");
      const sourceQueueClientOperationId =
        queueClientOperationIdByChatIdRef.current.get(targetChatId) ||
        (typeof relaySourceClientOperationId === "string"
          ? relaySourceClientOperationId.trim()
          : "");
      const durableClarifyForIdentity =
        readPendingClarifyForChat(targetChatId);
      if (
        streamAttemptId &&
        (queuedTurnsForIdentity ||
          exactRelayItems.length > 0 ||
          durableClarifyForIdentity)
      ) {
        const queuedItemsForBinding = queuedTurnsForIdentity
          ? queuedTurnsForIdentity.snapshot()
          : exactRelayItems;
        const bound = bindQueuedTurnOwnersToAttempt({
          chatId: targetChatId,
          targetAttemptId: streamAttemptId,
          sourceAttemptId: sourceQueueAttemptId,
          clientOperationIds: [
            sourceQueueClientOperationId,
            runClientOperationId,
          ].filter(Boolean),
          ...(queuedTurnsForIdentity || exactRelayItems.length > 0
            ? {
                /* A queue relay is not consumed when the transport merely
                   returns a handle. Preserve only this relay's exact in-flight
                   ids plus the true queued remainder under the new attempt.
                   Older accepted ids can coexist in the shared buffer during
                   their delayed visual cleanup and must never be resurrected.
                   A synchronous acceptance may happen before handle return; in
                   that case bind only the true remainder. Normal non-relay
                   sends retain the existing queued-only behavior. */
                items:
                  isQueueRelayRequest
                    ? !requestConsumed
                      ? queuedItemsForBinding
                        .filter(
                          (item) =>
                            item.status === "queued" ||
                            relayInFlightIds.has(item.id),
                        )
                        .map((item) => ({
                          ...item,
                          status: relayInFlightIds.has(item.id)
                            ? "relayed"
                            : "queued",
                        }))
                      : queuedTurnsForIdentity
                        ? queuedItemsForBinding.filter(
                            (item) => item.status === "queued",
                          )
                        : []
                    : queuedItemsForBinding.filter(
                        (item) => item.status === "queued",
                      ),
              }
            : {}),
        });
        if (!bound) {
          setStreamErrorForChat(
            targetChatId,
            "The run started, but its queued messages could not be rebound safely.",
          );
        } else {
          if (queuedTurnsForIdentity) {
            const relayState = queueRelayAttemptsByChatIdRef.current.get(
              targetChatId,
            );
            if (
              isQueueRelayRequest &&
              relayState?.buffer === queuedTurnsForIdentity &&
              relayState.attemptId === sourceQueueAttemptId &&
              relayState.clientOperationId === sourceQueueClientOperationId
            ) {
              relayState.attemptId = streamAttemptId;
              relayState.clientOperationId = "";
            }
            queueAttemptIdByChatIdRef.current.set(
              targetChatId,
              streamAttemptId,
            );
            queueClientOperationIdByChatIdRef.current.delete(targetChatId);
          }
          const reboundClarify = bound.clarifies.find(
            (item) => item.id === durableClarifyForIdentity?.id,
          );
          if (reboundClarify) {
            pendingClarifyByChatIdRef.current.set(
              targetChatId,
              reboundClarify,
            );
          }
        }
      }

      if (streamHandle?.requestId) {
        const nextStreamMessages = streamMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                meta: {
                  ...(message.meta || {}),
                  requestId: streamHandle.requestId,
                  ...(streamAttemptId
                    ? {
                        attemptId: streamAttemptId,
                        executionSessionId: effectiveThreadId,
                      }
                    : {}),
                },
              }
            : message,
        );
        syncStreamMessages(nextStreamMessages);
        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "stream-identity",
        });
      }

      scheduleQueueRelayAcceptanceReconciliation();

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeChatIdRef,
      composerRevisionByChatIdRef,
      activeStreamsRef,
      appendSyntheticToolConfirmationDecision,
      beginRunGeneration,
      buildCharacterRunConfig,
      buildHistoryForModel,
      characterId,
      commitForegroundMessages,
      clearActiveTokenFlushController,
      clearAllPendingToolConfirmations,
      clearConfirmationResolutionTimer,
      consumeSecretGateToken,
      clearDurableResumeStartedKeysForChat,
      clearResolvedToolConfirmationByCallId,
      fallbackPendingClarifyForChat,
      fallbackPendingFyisForAttempt,
      getConfirmationRuntimeForChat,
      hydrateAttachmentPayloads,
      agentOrchestration,
      isChatRunPending,
      isCharacterChat,
      isRunGenerationCurrent,
      isToolCallAutoApprovable,
      markAllPendingConfirmationFollowupSignals,
      markConfirmationFollowupSignalByCallId,
      modelIdRef,
      messagesRef,
      persistQueuedTurnBufferForAttempt,
      resolveAttachmentPayloads,
      scheduleQueueRelayTimer,
      scheduleQueueRelayRetryTimer,
      selectedToolkits,
      selectedWorkspaceIds,
      selectedRecipeName,
      settleClarifyBtwBarrier,
      setDraftAttachments,
      setInputValue,
      setMessages,
      setAgentOrchestration,
      setSelectedModelId,
      setStreamError,
      setStreamErrorForChat,
      storageApi,
      submitAutoApprovedToolConfirmation,
      systemPromptOverrides,
      threadIdRef,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
      updatePendingContinuationRequestForChat,
    ],
  );

  const relayQueuedTurnsAfterRun = useCallback(
    ({
      targetChatId,
      nextStreamMessages,
      characterAgentConfig = null,
      runContext = null,
    }) => {
      const queuedTurnsOnDone =
        queuedTurnsByChatIdRef.current.get(targetChatId);
      const queueAttemptId =
        queueAttemptIdByChatIdRef.current.get(targetChatId) || "";
      const queueClientOperationId =
        queueClientOperationIdByChatIdRef.current.get(targetChatId) || "";
      if (!queuedTurnsOnDone || queuedTurnsOnDone.size() === 0) {
        if (queuedTurnsOnDone) {
          queuedTurnsByChatIdRef.current.delete(targetChatId);
          queueAttemptIdByChatIdRef.current.delete(targetChatId);
          if (queueAttemptId) {
            removeQueuedTurnsForAttempt(targetChatId, queueAttemptId);
          }
          syncInterjectStateForChat(targetChatId);
        }
        return;
      }

      const queuedSnapshot = queuedTurnsOnDone.peekMerged();
      if (!queuedSnapshot.text) return;

      let relayState =
        queueRelayAttemptsByChatIdRef.current.get(targetChatId);
      if (!relayState || relayState.buffer !== queuedTurnsOnDone) {
        relayState = {
          buffer: queuedTurnsOnDone,
          attemptId: queueAttemptId,
          clientOperationId: queueClientOperationId,
          inFlight: false,
          inFlightIds: [],
          retryCount: 0,
          attempt: null,
        };
        const relayOwnerIsCurrent = () => {
          if (
            queuedTurnsByChatIdRef.current.get(targetChatId) !==
            queuedTurnsOnDone
          ) {
            return false;
          }
          if (relayState.attemptId) {
            return (
              (queueAttemptIdByChatIdRef.current.get(targetChatId) || "") ===
              relayState.attemptId
            );
          }
          return Boolean(
            relayState.clientOperationId &&
              (queueClientOperationIdByChatIdRef.current.get(targetChatId) ||
                "") === relayState.clientOperationId,
          );
        };
        relayState.attempt = async () => {
          if (
            !relayOwnerIsCurrent() ||
            relayState.inFlight
          ) {
            return;
          }
          const relaySnapshot = queuedTurnsOnDone.peekMerged();
          if (!relaySnapshot.text) return;
          const relayIds = new Set(relaySnapshot.ids);
          const relayDurableItems = queuedTurnsOnDone
            .snapshot()
            .filter((item) => relayIds.has(item.id))
            .map((item) => ({ ...item, status: "queued" }));
          const retryAfterAuthorityGuard = () => {
            relayState.inFlight = false;
            relayState.retryCount += 1;
            scheduleQueueRelayRetryTimer(
              targetChatId,
              relayState.attempt,
              Math.min(
                4000,
                250 * 2 ** Math.min(relayState.retryCount - 1, 4),
              ),
            );
          };
          if (isChatRunPending(targetChatId)) {
            retryAfterAuthorityGuard();
            return;
          }

          relayState.inFlight = true;
          const relayBaseMessages =
            storageApi.getChatMessages?.(targetChatId) ||
            (activeChatIdRef.current === targetChatId &&
            Array.isArray(messagesRef.current)
              ? messagesRef.current
              : nextStreamMessages);
          const sourceAssistant = [...relayBaseMessages]
            .reverse()
            .find((message) => {
              if (message?.role !== "assistant") return false;
              if (relayState.attemptId) {
                return message?.meta?.attemptId === relayState.attemptId;
              }
              return Boolean(
                relayState.clientOperationId &&
                  message?.meta?.queueClientOperationId ===
                    relayState.clientOperationId,
              );
            });
          const relaySessionId = resolveQueueRelaySessionOwner({
            sourceSessionId: sourceAssistant?.meta?.executionSessionId,
            activeSessionId:
              activeRunThreadIdByChatIdRef.current.get(targetChatId),
            runContextSessionId: runContext?.threadId,
          });

          /* Durable-interaction capable runtimes use a CLOSED authoritative
             preflight before any programmatic successor. A terminal callback
             can arrive before the renderer's recovery lookup projects the
             suspended interaction, so the local ref is not sufficient proof
             that a new run is safe. Legacy/off runtimes are admitted only by
             the explicit bridge-shape check below; there is no permissive
             response fallback. */
          let hasDurableInteractionContract = false;
          try {
            hasDurableInteractionContract = Boolean(
              typeof api.unchain.isDurableInteractionBridgeAvailable ===
                "function" &&
                api.unchain.isDurableInteractionBridgeAvailable(),
            );
          } catch (_error) {
            retryAfterAuthorityGuard();
            return;
          }
          if (hasDurableInteractionContract) {
            const lookup =
              durableInteractionLookupByChatIdRef.current.get(targetChatId);
            if (typeof lookup !== "function" || !relaySessionId) {
              retryAfterAuthorityGuard();
              return;
            }
            let authoritativePending = null;
            try {
              authoritativePending = await lookup(
                targetChatId,
                relaySessionId,
              );
            } catch (_error) {
              retryAfterAuthorityGuard();
              return;
            }
            if (!relayOwnerIsCurrent()) {
              relayState.inFlight = false;
              return;
            }
            if (
              !authoritativePending ||
              authoritativePending.status !== "none" ||
              isChatRunPending(targetChatId) ||
              durableInteractionByChatIdRef.current[targetChatId]?.status
            ) {
              retryAfterAuthorityGuard();
              return;
            }
          } else if (
            durableInteractionByChatIdRef.current[targetChatId]?.status
          ) {
            retryAfterAuthorityGuard();
            return;
          }

          const currentRelayItems = new Map(
            queuedTurnsOnDone.snapshot().map((item) => [item.id, item]),
          );
          if (
            !relayOwnerIsCurrent() ||
            relaySnapshot.ids.some(
              (id) => currentRelayItems.get(id)?.status !== "queued",
            )
          ) {
            retryAfterAuthorityGuard();
            return;
          }
          relayState.retryCount = 0;
          relayState.inFlightIds = [...relaySnapshot.ids];
          queuedTurnsOnDone.markRelayed(relaySnapshot.ids);
          syncInterjectStateForChat(targetChatId);
          let relayConsumed = false;
          let relayRejected = false;
          const removeConsumedRelayFromOutbox = () => {
            const consumedIds = new Set(relaySnapshot.ids);
            const durableRemainder = queuedTurnsOnDone
              .snapshot()
              .filter(
                (item) =>
                  item.status === "queued" && !consumedIds.has(item.id),
              );
            if (relayState.attemptId && durableRemainder.length > 0) {
              writeQueuedTurnsForAttempt({
                chatId: targetChatId,
                attemptId: relayState.attemptId,
                items: durableRemainder,
              });
            } else if (relayState.attemptId) {
              removeQueuedTurnsForAttempt(
                targetChatId,
                relayState.attemptId,
              );
            } else if (
              relayState.clientOperationId &&
              durableRemainder.length > 0
            ) {
              writeQueuedTurnsForClientOperation({
                chatId: targetChatId,
                clientOperationId: relayState.clientOperationId,
                items: durableRemainder,
              });
            } else if (relayState.clientOperationId) {
              removeQueuedTurnsForClientOperation(
                targetChatId,
                relayState.clientOperationId,
              );
            }
          };
          const retryUnconsumedRelay = () => {
            if (!relayOwnerIsCurrent()) {
              return;
            }
            queuedTurnsOnDone.markQueued(relaySnapshot.ids);
            persistQueuedTurnBufferForAttempt(
              targetChatId,
              queuedTurnsOnDone,
              relayState.attemptId,
              relayState.clientOperationId,
              { preserveRelayed: false },
            );
            syncInterjectStateForChat(targetChatId);
            relayState.retryCount += 1;
            scheduleQueueRelayRetryTimer(
              targetChatId,
              relayState.attempt,
              Math.min(
                4000,
                250 * 2 ** Math.min(relayState.retryCount - 1, 4),
              ),
            );
          };
          const acknowledgeConsumedRelay = () => {
            queueRelayAttemptsByChatIdRef.current.delete(targetChatId);
            scheduleQueueRelayRetryTimer(
              targetChatId,
              () => {
                if (
                  queuedTurnsByChatIdRef.current.get(targetChatId) !==
                  queuedTurnsOnDone
                ) {
                  /* The accepted ids were reconciled synchronously above. A
                     replacement buffer may now contain fresh clarify/FYI work
                     under the same owner, so this old visual cleanup must not
                     mutate durable state it no longer owns. */
                  return;
                }
                queuedTurnsOnDone.removeMany(relaySnapshot.ids);
                const currentRelayState =
                  queueRelayAttemptsByChatIdRef.current.get(targetChatId);
                const newerRelayOwnsBuffer = Boolean(
                  currentRelayState &&
                    currentRelayState !== relayState &&
                    currentRelayState.buffer === queuedTurnsOnDone,
                );
                if (!newerRelayOwnsBuffer) {
                  const currentQueueAttemptId =
                    queueAttemptIdByChatIdRef.current.get(targetChatId) || "";
                  const currentQueueClientOperationId =
                    queueClientOperationIdByChatIdRef.current.get(targetChatId) ||
                    "";
                  persistQueuedTurnBufferForAttempt(
                    targetChatId,
                    queuedTurnsOnDone,
                    currentQueueAttemptId,
                    currentQueueClientOperationId,
                  );
                }
                if (queuedTurnsOnDone.size() === 0) {
                  queuedTurnsByChatIdRef.current.delete(targetChatId);
                  queueAttemptIdByChatIdRef.current.delete(targetChatId);
                  queueClientOperationIdByChatIdRef.current.delete(targetChatId);
                }
                syncInterjectStateForChat(targetChatId);
              },
              1600,
            );
          };
          /* The relay is a PROGRAMMATIC send: it must never raise a modal.
             A queued item that still trips the scanner can only proceed on the
             plain-text approval the user already gave for it, replayed here as
             a one-time token bound to this exact merged text. Items without an
             approval that trip the scanner were purged from the outbox at load,
             so the only outcome left for them is the fail-closed guard inside
             runTurnRequest. */
          const relaySecretToken =
            mintTokenForDisposition({
              chatId: targetChatId,
              text: relaySnapshot.text,
              disposition: relaySnapshot.disposition,
            }) || "";
          void runTurnRequest({
            mode: "send",
            chatId: targetChatId,
            text: relaySnapshot.text,
            attachments: [],
            baseMessages: relayBaseMessages,
            clearComposer: false,
            missingAttachmentPayloadMode: "block",
            characterAgentConfig,
            runContext,
            secretGateToken: relaySecretToken,
            secretGateText: relaySnapshot.text,
            /* onConsumed fires only on authoritative server acceptance. Only
               then may we remove the durable outbox data and schedule the 1.6s
               cleanup — never merely because startStream returned a handle. */
            onConsumed: () => {
              if (relayConsumed || relayRejected) return;
              relayConsumed = true;
              relayState.inFlight = false;
              removeConsumedRelayFromOutbox();
              acknowledgeConsumedRelay();
            },
            /* onReject fires on a terminal pre-acceptance failure (e.g. an
               execution_lease_conflict) that was not a user cancel. Reset
               relayed->queued and retry, but only if the same buffer+owner is
               still current. */
            onReject: () => {
              if (relayConsumed || relayRejected) return;
              relayRejected = true;
              relayState.inFlight = false;
              retryUnconsumedRelay();
            },
            relayItemIds: relaySnapshot.ids,
            relayItems: relayDurableItems,
            relaySourceAttemptId: relayState.attemptId,
            relaySourceClientOperationId: relayState.clientOperationId,
          })
            .then((started) => {
              /* The promise resolves when startStream returns a handle — that
                 is NOT acceptance. Acceptance (onConsumed) and pre-accept
                 rejection (onReject) are both delivered asynchronously via the
                 stream callbacks, so wait for them. When the run never started
                 at all (early return / synchronous startup throw) leave the
                 durable outbox intact for later recovery and do NOT auto-retry
                 here — an immediate retry could duplicate the optimistic turn. */
              if (!started && !relayConsumed && !relayRejected) {
                relayState.inFlight = false;
              }
            })
            .catch(() => {
              /* runTurnRequest itself rejected before any acceptance. Treat it
                 like a pre-accept rejection: reset relayed->queued and retry,
                 guarded on the same buffer+owner. */
              if (!relayConsumed && !relayRejected) {
                relayRejected = true;
                relayState.inFlight = false;
                retryUnconsumedRelay();
              }
            });
        };
        queueRelayAttemptsByChatIdRef.current.set(targetChatId, relayState);
      }
      scheduleQueueRelayRetryTimer(targetChatId, relayState.attempt, 0);
    },
    [
      activeChatIdRef,
      isChatRunPending,
      messagesRef,
      mintTokenForDisposition,
      persistQueuedTurnBufferForAttempt,
      runTurnRequest,
      scheduleQueueRelayRetryTimer,
      storageApi,
      syncInterjectStateForChat,
    ],
  );
  relayQueuedTurnsAfterRunRef.current = relayQueuedTurnsAfterRun;

  const lookupDurableInteraction = useCallback(
    async (
      targetChatId,
      targetSessionId,
      {
        lookupAttempt = 0,
        runGeneration: requestedRunGeneration = null,
        authoritativePending = null,
        authoritativeReceipt = null,
      } = {},
    ) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      const normalizedSessionId =
        typeof targetSessionId === "string" ? targetSessionId.trim() : "";
      if (!normalizedChatId || !normalizedSessionId) {
        return null;
      }
      const activeRunGeneration =
        Number.isInteger(requestedRunGeneration) && requestedRunGeneration > 0
          ? requestedRunGeneration
          : ensureRecoveryRunGeneration(normalizedChatId);
      const isCurrentLookup = () =>
        isRunGenerationCurrent(normalizedChatId, activeRunGeneration);
      if (!isCurrentLookup()) {
        return null;
      }
      if (
        typeof api.unchain.isDurableInteractionBridgeAvailable !==
          "function" ||
        !api.unchain.isDurableInteractionBridgeAvailable()
      ) {
        updateDurableInteractionForChat(normalizedChatId, null);
        return null;
      }

      try {
        const rawPending = isObject(authoritativePending)
          ? authoritativePending
          : await api.unchain.getPendingInteraction({
              session_id: normalizedSessionId,
            });
        const pending = normalizePendingInteraction(
          rawPending,
          normalizedSessionId,
        );
        if (!isCurrentLookup()) {
          if (
            stoppedRunChatIdsRef.current.has(normalizedChatId) &&
            pending &&
            pending.status !== "none"
          ) {
            const lateAttemptId =
              pending.activeAttemptId || pending.sourceRunId || "";
            if (lateAttemptId) {
              const queuedCancellation = enqueueExecutionCancel({
                ownerChatId: normalizedChatId,
                sessionId: pending.sessionId,
                attemptId: lateAttemptId,
                sourceAttemptId: pending.sourceRunId || "",
                interactionId: pending.interactionId,
                reason: "user_stop",
                createdAt: Date.now(),
              });
              void requestExecutionCancellationAndDisconnect({
                identity: queuedCancellation,
                handle: null,
                reason: "user_stop",
              }).then((result) => {
                if (result?.terminal && queuedCancellation) {
                  removeExecutionCancel(
                    queuedCancellation.sessionId,
                    queuedCancellation.attemptId,
                    queuedCancellation.interactionId,
                  );
                }
              });
            }
          }
          return null;
        }
        if (!pending) {
          const error = new Error(
            "Unchain returned an invalid durable interaction record.",
          );
          error.code = "invalid_durable_interaction_record";
          throw error;
        }

        if (pending.status === "none") {
          const retryTimer = durableResumeRetryTimersRef.current.get(
            normalizedChatId,
          );
          if (retryTimer) {
            clearTimeout(retryTimer);
            durableResumeRetryTimersRef.current.delete(normalizedChatId);
          }
          clearAllPendingToolConfirmations(normalizedChatId);
          executionIdentityByChatIdRef.current.delete(normalizedChatId);
          updateDurableInteractionForChat(normalizedChatId, null);
          return pending;
        }

        const hasAuthoritativeRecordedReceipt = Boolean(
          isObject(authoritativeReceipt) &&
            authoritativeReceipt.status === "ok" &&
            authoritativeReceipt.disposition === "receipt_recorded" &&
            authoritativeReceipt.durable === true &&
            authoritativeReceipt.session_id === pending.sessionId &&
            authoritativeReceipt.interaction_id === pending.interactionId &&
            authoritativeReceipt.receipt_id === pending.receiptId &&
            pending.status === "receipt_recorded",
        );
        if (authoritativeReceipt && !hasAuthoritativeRecordedReceipt) {
          const error = new Error(
            "Unchain returned a durable receipt for a different interaction.",
          );
          error.code = "durable_interaction_receipt_identity_mismatch";
          throw error;
        }

        const pendingAttemptId =
          pending.activeAttemptId || pending.sourceRunId || "";
        if (pendingAttemptId) {
          executionIdentityByChatIdRef.current.set(normalizedChatId, {
            ownerChatId: normalizedChatId,
            sessionId: pending.sessionId,
            attemptId: pendingAttemptId,
            requestId: "",
            sourceAttemptId: pending.sourceRunId || "",
            interactionId: pending.interactionId,
            runGeneration: activeRunGeneration,
          });
        }

        clearAllPendingToolConfirmations(normalizedChatId);
        let sourceMessages =
          activeChatIdRef.current === normalizedChatId &&
          Array.isArray(messagesRef.current)
            ? messagesRef.current
            : typeof storageApi.getChatMessages === "function"
              ? storageApi.getChatMessages(normalizedChatId)
              : [];
        const pendingMutationEntry = readTurnMutationOutbox().find(
          (entry) => entry.chatId === normalizedChatId,
        );
        if (pendingMutationEntry) {
          const pendingAttemptIds = new Set(
            [pending.activeAttemptId, pending.sourceRunId]
              .filter((value) => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean),
          );
          const belongsToMutation = pendingAttemptIds.has(
            pendingMutationEntry.operationId,
          );
          if (belongsToMutation) {
            let changed = false;
            sourceMessages = sourceMessages.map((message) => {
              if (
                message?.role !== "assistant" ||
                message?.meta?.turnMutationOperationId !==
                  pendingMutationEntry.operationId ||
                message?.meta?.turnMutationServerAcknowledged === true
              ) {
                return message;
              }
              changed = true;
              return {
                ...message,
                meta: {
                  ...(message.meta || {}),
                  turnMutationServerAcknowledged: true,
                },
              };
            });
            if (changed) {
              commitForegroundMessages(normalizedChatId, sourceMessages);
              storageApi.setChatMessages(normalizedChatId, sourceMessages, {
                source: "turn-mutation-durable-reconciliation",
              });
            }
          } else {
            if (
              isTurnMutationOptimisticWithoutAck(
                pendingMutationEntry,
                sourceMessages,
              )
            ) {
              sourceMessages = sourceMessages.slice(
                0,
                pendingMutationEntry.baseMessageCount,
              );
              commitForegroundMessages(normalizedChatId, sourceMessages);
              storageApi.setChatMessages(normalizedChatId, sourceMessages, {
                source: "turn-mutation-superseded-rollback",
              });
            }
            setStreamErrorForChat(
              normalizedChatId,
              "A newer server-side run superseded an unfinished local message operation.",
            );
          }
          removeTurnMutation(pendingMutationEntry.operationId);
          const mutationOwner =
            turnMutationByChatIdRef.current.get(normalizedChatId);
          if (
            mutationOwner?.operationId === pendingMutationEntry.operationId
          ) {
            releaseTurnMutation(mutationOwner);
          }
        }
        const ensured = ensureDurableInteractionMessage(
          sourceMessages,
          pending,
        );
        if (ensured.created) {
          commitForegroundMessages(normalizedChatId, ensured.messages);
          storageApi.setChatMessages(normalizedChatId, ensured.messages, {
            source: "chat-page",
          });
        }

        const runtime = getConfirmationRuntimeForChat(normalizedChatId);
        runtime.confirmationIdByCallId.set(
          pending.callId,
          pending.interactionId,
        );
        runtime.confirmationCallIdById.set(
          pending.interactionId,
          pending.callId,
        );
        runtime.sessionIdByConfirmationId.set(
          pending.interactionId,
          pending.sessionId,
        );
        runtime.followupSignalById.set(pending.interactionId, false);

        const confirmationRequest = buildRecoveredConfirmationRequest({
          pending,
          chatId: normalizedChatId,
          ownerMessageId: ensured.ownerMessageId,
        });
        const resolutionOutcome = pending.resolution?.outcome;
        const recoveredDecision =
          resolutionOutcome === "approved" ||
          (pending.kind === "human_input" && resolutionOutcome === "submitted")
            ? "approved"
            : resolutionOutcome === "denied"
              ? "denied"
              : "";
        updatePendingToolConfirmationRequests(normalizedChatId, {
          [pending.interactionId]: confirmationRequest,
        });
        updateToolConfirmationUiState(normalizedChatId, {
          [pending.interactionId]: {
            status:
              pending.status === "receipt_recorded" ? "submitted" : "idle",
            error: "",
            resolved: pending.status === "receipt_recorded",
            decision: recoveredDecision,
          },
        });

        const pendingWithOwner = {
          ...pending,
          ownerMessageId: ensured.ownerMessageId,
        };
        updateDurableInteractionForChat(normalizedChatId, pendingWithOwner);

        /* A live stream may still consume the receipt in-process.  Do not
           disturb that path: live_continues, provider retries, and transport
           recovery keep their existing ownership.  Once the run is no longer
           live, however, a durable interaction is a suspension boundary, not
           an invitation to replay mode=resume_interaction. */
        if (
          (!hasAuthoritativeRecordedReceipt &&
            streamingChatIdsRef.current.has(normalizedChatId)) ||
          runPreflightGenerationByChatIdRef.current.has(normalizedChatId) ||
          turnMutationByChatIdRef.current.has(normalizedChatId)
        ) {
          return pendingWithOwner;
        }

        /* An unanswered interaction remains actionable after reload. Keep the
           exact paused tool UI and durable ownership intact; lookup is
           observational here and must neither resume nor cancel it. */
        if (pending.status !== "receipt_recorded") {
          return pendingWithOwner;
        }

        const resolutionResponse = pending.resolution?.response;
        const approved =
          recoveredDecision === "approved" ||
          resolutionResponse?.approved === true;
        const recoveredUserResponse =
          resolutionResponse?.user_response ??
          resolutionResponse?.modified_arguments?.user_response ??
          (Array.isArray(resolutionResponse?.selected_values)
            ? resolutionResponse
            : undefined);
        appendSyntheticToolConfirmationDecision({
          targetChatId: normalizedChatId,
          confirmationId: pending.interactionId,
          approved,
          userResponse: recoveredUserResponse,
        });

        if (!pendingAttemptId) {
          const error = new Error(
            "The suspended interaction has no exact source attempt identity.",
          );
          error.code = "durable_interaction_cancel_identity_missing";
          throw error;
        }

        const cancellationReason = "interaction_suspended";
        const queuedCancellation = enqueueExecutionCancel({
          ownerChatId: normalizedChatId,
          sessionId: pending.sessionId,
          attemptId: pendingAttemptId,
          sourceAttemptId: pending.sourceRunId || "",
          interactionId: pending.interactionId,
          reason: cancellationReason,
          createdAt: Date.now(),
        });
        updateDurableInteractionForChat(normalizedChatId, {
          ...pendingWithOwner,
          status: "checking",
          lastError: "",
        });

        const cancellationResult =
          await requestExecutionCancellationAndDisconnect({
            identity: queuedCancellation,
            handle: null,
            reason: cancellationReason,
            idempotencyKey: `interaction-pause:${
              pending.sourceRunId || pendingAttemptId
            }:${pending.interactionId}`,
          });
        if (!isCurrentLookup()) {
          return null;
        }
        if (!cancellationResult?.ok) {
          const error = new Error(
            "Failed to seal the suspended interaction on the server.",
          );
          error.code = "durable_interaction_cancel_failed";
          throw error;
        }

        const cancellationResponse = cancellationResult.response;
        const responseAttemptId =
          typeof cancellationResponse?.attempt_id === "string"
            ? cancellationResponse.attempt_id.trim()
            : "";
        const responseSourceAttemptId =
          typeof cancellationResponse?.source_attempt_id === "string"
            ? cancellationResponse.source_attempt_id.trim()
            : "";
        if (
          (responseAttemptId && responseAttemptId !== pendingAttemptId) ||
          (responseSourceAttemptId &&
            responseSourceAttemptId !==
              (pending.sourceRunId || pendingAttemptId))
        ) {
          const error = new Error(
            "Unchain acknowledged cancellation for a different interaction attempt.",
          );
          error.code = "durable_interaction_cancel_identity_mismatch";
          throw error;
        }

        /* The cancel response is not enough to unlock the composer.  Read the
           durable journal again and require the strict `none` projection, so
           a timeout, stale response, or split write cannot become a frontend-
           only clear that later resurrects on reload. */
        const rawAfterCancellation = await api.unchain.getPendingInteraction({
          session_id: normalizedSessionId,
        });
        const pendingAfterCancellation = normalizePendingInteraction(
          rawAfterCancellation,
          normalizedSessionId,
        );
        if (!isCurrentLookup()) {
          return null;
        }
        if (!pendingAfterCancellation) {
          const error = new Error(
            "Unchain returned an invalid durable interaction record after cancellation.",
          );
          error.code = "invalid_durable_interaction_record";
          throw error;
        }
        if (pendingAfterCancellation.status !== "none") {
          const error = new Error(
            "The suspended interaction is still pending after cancellation.",
          );
          error.code = "durable_interaction_cancel_not_observed";
          throw error;
        }

        if (queuedCancellation) {
          removeExecutionCancel(
            queuedCancellation.sessionId,
            queuedCancellation.attemptId,
            queuedCancellation.interactionId,
          );
        }
        const retryTimer = durableResumeRetryTimersRef.current.get(
          normalizedChatId,
        );
        if (retryTimer) {
          clearTimeout(retryTimer);
          durableResumeRetryTimersRef.current.delete(normalizedChatId);
        }
        clearDurableResumeStartedKeysForChat(normalizedChatId);
        clearAllPendingToolConfirmations(normalizedChatId);
        executionIdentityByChatIdRef.current.delete(normalizedChatId);
        updateDurableInteractionForChat(normalizedChatId, null);
        return pendingAfterCancellation;
      } catch (error) {
        if (!isCurrentLookup()) {
          return null;
        }
        const errorMessage =
          error?.message || "Failed to seal this chat's suspended run.";
        if (lookupAttempt < DURABLE_RESUME_MAX_RETRIES) {
          const nextAttempt = lookupAttempt + 1;
          updateDurableInteractionForChat(normalizedChatId, {
            status: "retry_wait",
            sessionId: normalizedSessionId,
            resumeAttempt: nextAttempt,
            lastError: errorMessage,
          });
          const existingTimer = durableResumeRetryTimersRef.current.get(
            normalizedChatId,
          );
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          let timerId = null;
          timerId = setTimeout(() => {
            if (
              durableResumeRetryTimersRef.current.get(normalizedChatId) ===
              timerId
            ) {
              durableResumeRetryTimersRef.current.delete(normalizedChatId);
            }
            if (!isCurrentLookup()) {
              return;
            }
            void lookupDurableInteraction(normalizedChatId, normalizedSessionId, {
              lookupAttempt: nextAttempt,
              runGeneration: activeRunGeneration,
              authoritativeReceipt,
            });
          }, durableInteractionRetryDelayMs(lookupAttempt));
          durableResumeRetryTimersRef.current.set(normalizedChatId, timerId);
          return null;
        }

        updateDurableInteractionForChat(normalizedChatId, {
          status: "resume_failed",
          sessionId: normalizedSessionId,
          resumeAttempt: lookupAttempt,
          lastError: errorMessage,
        });
        if (activeChatIdRef.current === normalizedChatId) {
          setStreamError(errorMessage);
        }
        return null;
      }
    },
    [
      activeChatIdRef,
      appendSyntheticToolConfirmationDecision,
      clearAllPendingToolConfirmations,
      clearDurableResumeStartedKeysForChat,
      commitForegroundMessages,
      ensureRecoveryRunGeneration,
      getConfirmationRuntimeForChat,
      isRunGenerationCurrent,
      messagesRef,
      setStreamError,
      setStreamErrorForChat,
      storageApi,
      updateDurableInteractionForChat,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );
  const lookupOwnerChatId =
    typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
  if (lookupOwnerChatId) {
    durableInteractionLookupByChatIdRef.current.set(
      lookupOwnerChatId,
      lookupDurableInteraction,
    );
  }

  const sealDurableInteractionForFreshSend = useCallback(
    async (targetChatId, expectedPending) => {
      const normalizedChatId =
        typeof targetChatId === "string" ? targetChatId.trim() : "";
      const expectedStatus =
        typeof expectedPending?.status === "string"
          ? expectedPending.status.trim()
          : "";
      const sessionId =
        typeof expectedPending?.sessionId === "string"
          ? expectedPending.sessionId.trim()
          : "";
      const interactionId =
        typeof expectedPending?.interactionId === "string"
          ? expectedPending.interactionId.trim()
          : "";
      const sourceAttemptId =
        typeof expectedPending?.sourceRunId === "string"
          ? expectedPending.sourceRunId.trim()
          : "";
      const activeAttemptId =
        typeof expectedPending?.activeAttemptId === "string"
          ? expectedPending.activeAttemptId.trim()
          : "";
      const attemptId = activeAttemptId || sourceAttemptId;
      const isExpectedOwner = (candidate) =>
        Boolean(
          candidate &&
            candidate.interactionId === interactionId &&
            candidate.sessionId === sessionId &&
            (candidate.activeAttemptId || candidate.sourceRunId || "") ===
              attemptId,
        );
      const failClosed = (message) => {
        const current =
          durableInteractionByChatIdRef.current[normalizedChatId] || null;
        if (isExpectedOwner(current)) {
          updateDurableInteractionForChat(normalizedChatId, {
            ...expectedPending,
            status: expectedStatus,
            lastError: message,
          });
        }
        setStreamErrorForChat(normalizedChatId, message);
        return null;
      };

      if (
        !normalizedChatId ||
        !sessionId ||
        !interactionId ||
        !attemptId ||
        !canSealDurableInteractionForFreshSend(expectedStatus) ||
        !isExpectedOwner(
          durableInteractionByChatIdRef.current[normalizedChatId],
        )
      ) {
        return failClosed(
          "The paused interaction no longer has an exact server owner. Your message was not sent.",
        );
      }

      const cancellationReason = "interaction_abandoned_for_new_message";
      const queuedCancellation = enqueueExecutionCancel({
        ownerChatId: normalizedChatId,
        sessionId,
        attemptId,
        sourceAttemptId,
        interactionId,
        reason: cancellationReason,
        createdAt: Date.now(),
      });
      updateDurableInteractionForChat(normalizedChatId, {
        ...expectedPending,
        status: "checking",
        lastError: "",
      });

      try {
        const cancellationResult =
          await requestExecutionCancellationAndDisconnect({
            identity: queuedCancellation,
            handle: null,
            reason: cancellationReason,
            idempotencyKey: `fresh-send-abandon:${
              sourceAttemptId || attemptId
            }:${interactionId}`,
          });
        if (!cancellationResult?.ok) {
          return failClosed(
            "Could not cancel the paused run on the server. Your message was not sent.",
          );
        }

        const cancellationResponse = cancellationResult.response;
        const responseAttemptId =
          typeof cancellationResponse?.attempt_id === "string"
            ? cancellationResponse.attempt_id.trim()
            : "";
        const responseSourceAttemptId =
          typeof cancellationResponse?.source_attempt_id === "string"
            ? cancellationResponse.source_attempt_id.trim()
            : "";
        if (
          (responseAttemptId && responseAttemptId !== attemptId) ||
          (responseSourceAttemptId &&
            responseSourceAttemptId !== (sourceAttemptId || attemptId))
        ) {
          return failClosed(
            "The server cancelled a different run. Your message was not sent.",
          );
        }

        const rawPending = await api.unchain.getPendingInteraction({
          session_id: sessionId,
        });
        const authoritativePending = normalizePendingInteraction(
          rawPending,
          sessionId,
        );
        if (!authoritativePending) {
          return failClosed(
            "Could not verify the paused run was cancelled. Your message was not sent.",
          );
        }
        if (authoritativePending.status !== "none") {
          return failClosed(
            "The paused run is still pending on the server. Your message was not sent.",
          );
        }

        const current =
          durableInteractionByChatIdRef.current[normalizedChatId] || null;
        if (current && !isExpectedOwner(current)) {
          return failClosed(
            "A newer paused interaction appeared. Your message was not sent.",
          );
        }
        if (queuedCancellation) {
          removeExecutionCancel(
            queuedCancellation.sessionId,
            queuedCancellation.attemptId,
            queuedCancellation.interactionId,
          );
        }
        const retryTimer = durableResumeRetryTimersRef.current.get(
          normalizedChatId,
        );
        if (retryTimer) {
          clearTimeout(retryTimer);
          durableResumeRetryTimersRef.current.delete(normalizedChatId);
        }
        clearDurableResumeStartedKeysForChat(normalizedChatId);
        clearAllPendingToolConfirmations(normalizedChatId);
        executionIdentityByChatIdRef.current.delete(normalizedChatId);
        updateDurableInteractionForChat(normalizedChatId, null);
        return {
          continuedFromRunId: sourceAttemptId || attemptId,
        };
      } catch (error) {
        return failClosed(
          error?.message ||
            "Could not verify the paused run was cancelled. Your message was not sent.",
        );
      }
    },
    [
      clearAllPendingToolConfirmations,
      clearDurableResumeStartedKeysForChat,
      setStreamErrorForChat,
      updateDurableInteractionForChat,
    ],
  );

  useEffect(() => {
    const targetChatId =
      typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
    if (
      !targetChatId ||
      streamingChatIdsRef.current.has(targetChatId) ||
      reattachingChatIdsRef.current.has(targetChatId)
    ) {
      return undefined;
    }

    const storedMessages =
      activeChatIdRef.current === targetChatId &&
      Array.isArray(messagesRef.current)
        ? messagesRef.current
        : storageApi.getChatMessages?.(targetChatId) || [];
    const assistantMessage = [...storedMessages]
      .reverse()
      .find(
        (message) =>
          message?.role === "assistant" &&
          message?.status === "streaming" &&
          typeof message?.meta?.requestId === "string" &&
          message.meta.requestId.trim() &&
          typeof message?.meta?.attemptId === "string" &&
          message.meta.attemptId.trim() &&
          typeof message?.meta?.executionSessionId === "string" &&
          message.meta.executionSessionId.trim(),
      );
    if (!assistantMessage) {
      return undefined;
    }

    const requestId = assistantMessage.meta.requestId.trim();
    const attemptId = assistantMessage.meta.attemptId.trim();
    const executionSessionId =
      assistantMessage.meta.executionSessionId.trim();
    const assistantMessageId = assistantMessage.id;
    const cancellationAlreadyRequested = readExecutionCancelOutbox().some(
      (entry) =>
        entry.sessionId === executionSessionId && entry.attemptId === attemptId,
    );
    if (cancellationAlreadyRequested) {
      /* A prior Stop survives renderer restart in the cancellation outbox.
         Do not race it by reattaching the old transport; settle the visible
         placeholder so this attempt cannot be selected for a later reopen. */
      stoppedRunChatIdsRef.current.add(targetChatId);
      const { changed, nextMessages } =
        settleStreamingAssistantMessages(storedMessages);
      if (changed) {
        commitForegroundMessages(targetChatId, nextMessages);
        storageApi.setChatMessages(targetChatId, nextMessages, {
          source: "stream-reattach-cancellation-pending",
        });
      }
      return undefined;
    }
    const runGeneration = ensureRecoveryRunGeneration(targetChatId);
    if (
      !assistantMessageId ||
      !runGeneration ||
      !isRunGenerationCurrent(targetChatId, runGeneration)
    ) {
      return undefined;
    }
    hydrateQueuedTurnsForAttempt(targetChatId, attemptId);

    const projector = createRuntimeEventStreamReplayProjector();
    let latestProjection = null;
    let flushTimer = null;
    let terminalReceived = false;
    let terminalAccountingPending = false;
    let replayAcceptanceObserved = false;
    let replayAcceptanceTimer = null;
    let replayAcceptanceReattachCount = 0;
    let lastReplayStreamSeq = 0;
    let currentAttachedHandle = null;
    let replayCancellationPending = false;
    const managedReplayConfirmationIds = new Set();

    const readCurrentMessages = () => {
      const activeMessages =
        activeStreamsRef.current.get(targetChatId)?.messages;
      if (Array.isArray(activeMessages)) return activeMessages;
      if (
        activeChatIdRef.current === targetChatId &&
        Array.isArray(messagesRef.current)
      ) {
        return messagesRef.current;
      }
      return storageApi.getChatMessages?.(targetChatId) || storedMessages;
    };

    const clearFlushTimer = () => {
      if (flushTimer == null) return;
      clearTimeout(flushTimer);
      flushTimer = null;
    };

    const clearReplayAcceptanceTimer = () => {
      if (replayAcceptanceTimer == null) return;
      const timerId = replayAcceptanceTimer;
      clearTimeout(timerId);
      const trackedTimers =
        queueRelayTimersByChatIdRef.current.get(targetChatId);
      trackedTimers?.delete(timerId);
      if (trackedTimers?.size === 0) {
        queueRelayTimersByChatIdRef.current.delete(targetChatId);
      }
      replayAcceptanceTimer = null;
    };

    const hasUnverifiedRelayedTurn = () =>
      Boolean(
        !replayAcceptanceObserved &&
          readQueuedTurnsForAttempt(targetChatId, attemptId)?.items?.some(
            (item) => item.status === "relayed",
          ),
      );

    const markReplayAcceptanceObserved = () => {
      if (replayAcceptanceObserved) return;
      replayAcceptanceObserved = true;
      clearReplayAcceptanceTimer();
      acknowledgeRelayedQueuedTurnsForAttempt(targetChatId, attemptId);
    };

    const restoreRejectedRelayedTurn = () => {
      if (replayAcceptanceObserved) return false;
      const persisted = readQueuedTurnsForAttempt(targetChatId, attemptId);
      if (!persisted?.items?.some((item) => item.status === "relayed")) {
        return false;
      }

      const currentMessages = readCurrentMessages();
      const turnMessageIds = collectTurnMessageIds(
        currentMessages,
        assistantMessageId,
      );
      const ownsExactUserTurn = currentMessages.some(
        (message) =>
          message?.role === "user" && turnMessageIds.has(message?.id),
      );
      if (!turnMessageIds.has(assistantMessageId) || !ownsExactUserTurn) {
        return false;
      }

      const retryableItems = persisted.items.map((item) => ({
        ...item,
        status: "queued",
      }));
      const restored = writeQueuedTurnsForAttempt({
        chatId: targetChatId,
        attemptId,
        items: retryableItems,
      });
      if (!restored) return false;

      const restoredBuffer = createQueuedTurnBuffer(retryableItems);
      queuedTurnsByChatIdRef.current.set(targetChatId, restoredBuffer);
      queueAttemptIdByChatIdRef.current.set(targetChatId, attemptId);
      queueClientOperationIdByChatIdRef.current.delete(targetChatId);

      const rollbackMessages = currentMessages.filter(
        (message) => !turnMessageIds.has(message?.id),
      );
      clearStreamingMessageStore(targetChatId, assistantMessageId);
      activeStreamsRef.current.set(targetChatId, {
        messages: rollbackMessages,
      });
      commitForegroundMessages(targetChatId, rollbackMessages);
      storageApi.setChatMessages(targetChatId, rollbackMessages, {
        source: "stream-reattach-lease-retry-rollback",
      });
      syncInterjectStateForChat(targetChatId);
      return true;
    };

    const reconcileReplayInteractions = (projection = {}) => {
      const projectedUiState =
        projection.toolConfirmationUiStateById &&
        typeof projection.toolConfirmationUiStateById === "object"
          ? projection.toolConfirmationUiStateById
          : {};
      const frameGroups = [
        projection.traceFrames,
        ...Object.values(projection.subagentFrames || {}),
      ];
      const currentPendingIds = new Set();

      for (const frames of frameGroups) {
        for (const frame of Array.isArray(frames) ? frames : []) {
          if (frame?.type !== "tool_call") continue;
          const callId =
            typeof frame.payload?.call_id === "string"
              ? frame.payload.call_id.trim()
              : "";
          const confirmationId =
            typeof frame.payload?.confirmation_id === "string"
              ? frame.payload.confirmation_id.trim()
              : "";
          const requiresConfirmation =
            frame.payload?.requires_confirmation === true ||
            Boolean(confirmationId);
          if (!callId || !confirmationId || !requiresConfirmation) continue;

          const replayedUi = projectedUiState[confirmationId] || null;
          if (replayedUi?.resolved === true) continue;
          currentPendingIds.add(confirmationId);

          const runtime = getConfirmationRuntimeForChat(targetChatId);
          runtime.confirmationIdByCallId.set(callId, confirmationId);
          runtime.confirmationCallIdById.set(confirmationId, callId);
          runtime.sessionIdByConfirmationId.set(
            confirmationId,
            executionSessionId,
          );
          if (runtime.followupSignalById.get(confirmationId) !== true) {
            runtime.followupSignalById.set(confirmationId, false);
          }

          const request = buildToolConfirmationRequest({
            frame,
            confirmationId,
            callId,
            toolName:
              typeof frame.payload?.tool_name === "string"
                ? frame.payload.tool_name
                : "",
            requestedAt: Number.isFinite(Number(frame.ts))
              ? Number(frame.ts)
              : Date.now(),
            ownerMessageId: assistantMessageId,
            chatId: targetChatId,
            sessionId: executionSessionId,
          });
          updatePendingToolConfirmationRequests(targetChatId, (previous) =>
            previous[confirmationId]
              ? previous
              : { ...previous, [confirmationId]: request },
          );
          updateToolConfirmationUiState(targetChatId, (previous) =>
            previous[confirmationId]
              ? previous
              : {
                  ...previous,
                  [confirmationId]: {
                    status: "idle",
                    error: "",
                    resolved: false,
                  },
                },
          );
        }
      }

      for (const confirmationId of managedReplayConfirmationIds) {
        if (currentPendingIds.has(confirmationId)) continue;
        const replayedUi = projectedUiState[confirmationId] || null;
        if (replayedUi?.resolved !== true) {
          // Replay projections can be temporarily incomplete while a stream is
          // reconnecting. Absence is not proof that the durable interaction was
          // resolved, so retain ownership until an explicit resolution arrives.
          currentPendingIds.add(confirmationId);
          continue;
        }
        const runtime = getConfirmationRuntimeForChat(targetChatId, {
          create: false,
        });
        const callId = runtime?.confirmationCallIdById.get(confirmationId);
        if (
          callId &&
          runtime?.confirmationIdByCallId.get(callId) === confirmationId
        ) {
          runtime.confirmationIdByCallId.delete(callId);
        }
        runtime?.confirmationCallIdById.delete(confirmationId);
        if (callId && runtime && !runtime.confirmationIdByCallId.has(callId)) {
          for (const [candidateId, candidateCallId] of
            runtime.confirmationCallIdById.entries()) {
            if (candidateCallId === callId) {
              runtime.confirmationIdByCallId.set(callId, candidateId);
              break;
            }
          }
        }
        runtime?.sessionIdByConfirmationId.delete(confirmationId);
        runtime?.followupSignalById.delete(confirmationId);
        updatePendingToolConfirmationRequests(targetChatId, (previous) => {
          if (!previous[confirmationId]) return previous;
          const next = { ...previous };
          delete next[confirmationId];
          return next;
        });
        updateToolConfirmationUiState(targetChatId, (previous) => {
          if (!previous[confirmationId]) return previous;
          const next = { ...previous };
          delete next[confirmationId];
          return next;
        });
      }

      managedReplayConfirmationIds.clear();
      currentPendingIds.forEach((confirmationId) => {
        managedReplayConfirmationIds.add(confirmationId);
      });
    };

    const replayedFyiRecords = (projection = {}) => {
      const frameGroups = [
        projection.traceFrames,
        ...Object.values(projection.subagentFrames || {}),
      ];
      const records = [];
      const recordIds = new Set();
      const messages = [];
      let sawFyiFrame = false;

      for (const frames of frameGroups) {
        for (const frame of Array.isArray(frames) ? frames : []) {
          if (frame?.type !== "fyi_injected") continue;
          sawFyiFrame = true;
          const eventId =
            typeof frame.payload?.runtime_event_id === "string"
              ? frame.payload.runtime_event_id
              : `seq-${frame.seq || 0}`;
          const entries = Array.isArray(frame.payload?.messages)
            ? frame.payload.messages
            : [];
          messages.push(...entries);
          entries.forEach((entry, index) => {
            const text =
              entry?.origin === "user" && typeof entry.text === "string"
                ? entry.text
                : "";
            if (!text) return;
            const messageId =
              typeof entry?.message_id === "string"
                ? entry.message_id.trim()
                : typeof entry?.messageId === "string"
                  ? entry.messageId.trim()
                  : "";
            const recordId = messageId
              ? `fyi-${messageId}`
              : `fyi-${eventId}-${index}`;
            if (recordIds.has(recordId)) return;
            recordIds.add(recordId);
            records.push({
              id: recordId,
              type: "fyi",
              text,
              origin: "user",
              ts: Number.isFinite(Number(frame.ts))
                ? Number(frame.ts)
                : Date.now(),
            });
          });
        }
      }

      return sawFyiFrame ? { records, messages } : null;
    };

    const applyLatestProjection = ({
      status,
      error,
      bundle,
      completionDiagnostics,
    } = {}) => {
      clearFlushTimer();
      if (
        !hookMountedRef.current ||
        !isRunGenerationCurrent(targetChatId, runGeneration)
      ) {
        return [];
      }
      const projection = latestProjection || {};
      const updatedAt = Date.now();
      const replayedFyi = replayedFyiRecords(projection);
      const nextMessages = readCurrentMessages().map((message) => {
        if (message?.id !== assistantMessageId) return message;
        const materialized = finalizeStreamingMessage(message);
        const projectedContent =
          typeof projection.content === "string"
            ? projection.content
            : materialized.content || "";
        const nextError =
          error && typeof error === "object"
            ? {
                code:
                  typeof error.code === "string" ? error.code : "unknown",
                message:
                  typeof error.message === "string"
                    ? error.message
                    : "The attached stream failed",
              }
            : projection.error && typeof projection.error === "object"
              ? { ...projection.error }
              : null;
        const projectedBundle =
          bundle && typeof bundle === "object" ? bundle : null;
        return {
          ...materialized,
          content:
            status === "error" && !projectedContent
              ? `[error] ${nextError?.message || "The attached stream failed"}`
              : projectedContent,
          // Runtime replay may project `done` before terminal accounting has
          // crossed Electron. Only finishAttachedStream may publish terminal
          // status after that barrier succeeds.
          status: status || "streaming",
          updatedAt,
          traceFrames: Array.isArray(projection.traceFrames)
            ? projection.traceFrames
            : message.traceFrames || [],
          subagentFrames:
            projection.subagentFrames &&
            typeof projection.subagentFrames === "object"
              ? projection.subagentFrames
              : message.subagentFrames || {},
          subagentMetaByRunId:
            projection.subagentMetaByRunId &&
            typeof projection.subagentMetaByRunId === "object"
              ? projection.subagentMetaByRunId
              : message.subagentMetaByRunId || {},
          runArtifactSummary:
            projection.runArtifactSummary !== undefined
              ? projection.runArtifactSummary
              : message.runArtifactSummary,
          artifactSummariesByTurnId:
            projection.artifactSummariesByTurnId &&
            typeof projection.artifactSummariesByTurnId === "object"
              ? projection.artifactSummariesByTurnId
              : message.artifactSummariesByTurnId || {},
          ...(replayedFyi
            ? {
                interjections: [
                  ...(Array.isArray(message.interjections)
                    ? message.interjections.filter(
                        (record) => record?.type !== "fyi",
                      )
                    : []),
                  ...replayedFyi.records,
                ],
              }
            : {}),
          meta: {
            ...(message.meta || {}),
            ...(projectedBundle ? { bundle: { ...projectedBundle } } : {}),
            ...(completionDiagnostics
              ? { completion_diagnostics: completionDiagnostics }
              : {}),
            ...(nextError ? { error: nextError } : {}),
          },
        };
      });
      activeStreamsRef.current.set(targetChatId, { messages: nextMessages });
      commitForegroundMessages(targetChatId, nextMessages);
      storageApi.setChatMessages(targetChatId, nextMessages, {
        source: "stream-reattach",
      });
      reconcileReplayInteractions(projection);
      if (replayedFyi) {
        acknowledgeInjectedFyisForAttempt(
          targetChatId,
          attemptId,
          replayedFyi.messages,
        );
      }
      return nextMessages;
    };

    const scheduleProjectionFlush = () => {
      if (flushTimer != null) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        applyLatestProjection();
      }, STREAM_REATTACH_FLUSH_MS);
    };

    const finishAttachedStream = ({
      status,
      error,
      bundle,
      completionDiagnostics,
    } = {}) => {
      if (terminalReceived) return;
      terminalReceived = true;
      clearReplayAcceptanceTimer();
      let nextMessages = applyLatestProjection({
        status,
        error,
        bundle,
        completionDiagnostics,
      });
      const pendingClarify =
        pendingClarifyByChatIdRef.current.get(targetChatId) ||
        readPendingClarifyForChat(targetChatId);
      if (pendingClarify) {
        const fallback = fallbackPendingClarifyForChat(
          targetChatId,
          pendingClarify,
        );
        if (fallback) {
          nextMessages = nextMessages.map((message) => ({
            ...message,
            ...(Array.isArray(message?.traceFrames)
              ? {
                  traceFrames: message.traceFrames.map((frame) =>
                    frame?.type === "clarify_request" &&
                    frame?.payload?.id === pendingClarify.id
                      ? {
                          ...frame,
                          payload: {
                            ...frame.payload,
                            status: "resolved_default",
                          },
                        }
                      : frame,
                  ),
                }
              : {}),
          }));
          commitForegroundMessages(targetChatId, nextMessages);
        } else {
          setStreamErrorForChat(
            targetChatId,
            "The pending clarification is still saved and will be recovered after reload.",
          );
        }
      }
      fallbackPendingFyisForAttempt(targetChatId, attemptId);
      reattachingChatIdsRef.current.delete(targetChatId);
      streamHandlesRef.current.delete(targetChatId);
      executionIdentityByChatIdRef.current.delete(targetChatId);
      streamingChatIdsRef.current.delete(targetChatId);
      activeStreamsRef.current.delete(targetChatId);
      activeRunThreadIdByChatIdRef.current.delete(targetChatId);
      clearAllPendingToolConfirmations(targetChatId);
      updatePendingContinuationRequestForChat(targetChatId, null);
      syncInterjectStateForChat(targetChatId);
      setStreamingChatIds((previous) => {
        const next = new Set(previous);
        next.delete(targetChatId);
        return next;
      });
      if (nextMessages.length > 0) {
        finalizeStreamPersist({
          storageApi,
          chatId: targetChatId,
          messages: nextMessages,
          isForeground: activeChatIdRef.current === targetChatId,
          flushBackgroundPersist,
        });
      }
      if (status === "done") {
        relayQueuedTurnsAfterRunRef.current?.({
          targetChatId,
          nextStreamMessages: nextMessages,
          characterAgentConfig: null,
          runContext: runContextByChatIdRef.current.get(targetChatId) || null,
        });
      }
      return nextMessages;
    };

    const finishAttachedError = (
      error,
      bundle,
      { completionDiagnostics = null, retryRelayedTurn = false } = {},
    ) => {
      if (
        terminalReceived ||
        terminalAccountingPending ||
        !isRunGenerationCurrent(targetChatId, runGeneration)
      ) {
        return;
      }
      const shouldRetryRelayedTurn = Boolean(
        (error?.code === "execution_lease_conflict" || retryRelayedTurn) &&
          restoreRejectedRelayedTurn(),
      );
      const nextMessages = finishAttachedStream({
        status: "error",
        error,
        bundle,
        completionDiagnostics,
      });
      if (shouldRetryRelayedTurn) {
        relayQueuedTurnsAfterRunRef.current?.({
          targetChatId,
          nextStreamMessages: nextMessages,
          characterAgentConfig: null,
          runContext: runContextByChatIdRef.current.get(targetChatId) || null,
        });
        return;
      }
      setStreamErrorForChat(
        targetChatId,
        error?.message || "The attached stream failed.",
      );
    };

    const settleUnavailableStream = (error) => {
      if (terminalReceived) return;
      terminalReceived = true;
      clearReplayAcceptanceTimer();
      clearFlushTimer();
      fallbackPendingFyisForAttempt(targetChatId, attemptId);
      reattachingChatIdsRef.current.delete(targetChatId);
      streamHandlesRef.current.delete(targetChatId);
      executionIdentityByChatIdRef.current.delete(targetChatId);
      streamingChatIdsRef.current.delete(targetChatId);
      activeStreamsRef.current.delete(targetChatId);
      activeRunThreadIdByChatIdRef.current.delete(targetChatId);
      setStreamingChatIds((previous) => {
        const next = new Set(previous);
        next.delete(targetChatId);
        return next;
      });
      const { changed, nextMessages } = settleStreamingAssistantMessages(
        readCurrentMessages(),
      );
      if (changed) {
        commitForegroundMessages(targetChatId, nextMessages);
        storageApi.setChatMessages(targetChatId, nextMessages, {
          source: "stream-reattach-unavailable",
        });
      }
      const pendingClarify =
        pendingClarifyByChatIdRef.current.get(targetChatId) ||
        readPendingClarifyForChat(targetChatId);
      if (pendingClarify) {
        fallbackPendingClarifyForChat(targetChatId, pendingClarify);
      }
      setStreamErrorForChat(
        targetChatId,
        error?.code === "stream_replay_gap"
          ? "This interrupted run is too old to replay safely. It was not restarted."
          : "This interrupted run is no longer available. It was not restarted.",
      );
    };

    const cancelAndSettleUnverifiedReattach = async ({
      expectedHandle = null,
      error,
      retryWhenNeverRegistered = false,
    }) => {
      if (
        terminalReceived ||
        replayCancellationPending ||
        !isRunGenerationCurrent(targetChatId, runGeneration) ||
        (expectedHandle &&
          streamHandlesRef.current.get(targetChatId) !== expectedHandle)
      ) {
        return;
      }
      replayCancellationPending = true;
      clearReplayAcceptanceTimer();
      const queuedCancellation = enqueueExecutionCancel({
        ownerChatId: targetChatId,
        sessionId: executionSessionId,
        attemptId,
        requestId,
        reason: "queue_relay_acceptance_unverified",
        createdAt: Date.now(),
      });
      const cancelResult = await requestExecutionCancellationAndDisconnect({
        identity: queuedCancellation,
        handle: expectedHandle,
        reason: "queue_relay_acceptance_unverified",
        idempotencyKey: `queue-relay-acceptance:${attemptId}`,
      });
      if (cancelResult?.terminal && queuedCancellation) {
        removeExecutionCancel(
          queuedCancellation.sessionId,
          queuedCancellation.attemptId,
          queuedCancellation.interactionId,
        );
      }
      if (
        terminalReceived ||
        !isRunGenerationCurrent(targetChatId, runGeneration) ||
        (expectedHandle &&
          streamHandlesRef.current.get(targetChatId) !== expectedHandle)
      ) {
        return;
      }
      const cancelResponse = cancelResult?.response;
      const provenNeverRegistered = Boolean(
        cancelResult?.ok &&
          isProvenNeverRegisteredCancellation(cancelResponse),
      );
      finishAttachedError(
        error || {
          code: "queue_relay_acceptance_unverified",
          message:
            "The recovered queued follow-up could not be verified safely. It was not restarted.",
        },
        undefined,
        {
          retryRelayedTurn: Boolean(
            retryWhenNeverRegistered &&
              !replayAcceptanceObserved &&
              provenNeverRegistered,
          ),
        },
      );
    };

    const reattachHandlers = {
      onRuntimeEvent: (runtimeEvent, streamMeta = {}) => {
        if (
          terminalReceived ||
          terminalAccountingPending ||
          !isRunGenerationCurrent(targetChatId, runGeneration)
        ) {
          return;
        }
        const streamSeq = Number(streamMeta.streamSeq);
        if (Number.isInteger(streamSeq) && streamSeq > lastReplayStreamSeq) {
          lastReplayStreamSeq = streamSeq;
        }
        if (isAuthoritativeQueueAcceptanceEvent(runtimeEvent)) {
          markReplayAcceptanceObserved();
        }
        latestProjection = projector.append(
          runtimeEvent,
          streamMeta.streamSeq,
        );
        scheduleProjectionFlush();
      },
      onDone: (done = {}) => {
        if (
          terminalReceived ||
          terminalAccountingPending ||
          !isRunGenerationCurrent(targetChatId, runGeneration)
        ) {
          return;
        }
        const projectedError =
          latestProjection?.error && typeof latestProjection.error === "object"
            ? latestProjection.error
            : null;
        const doneError =
          done.error && typeof done.error === "object" ? done.error : null;
        if (latestProjection?.status === "error" || doneError) {
          const terminalError = projectedError || doneError;
          const hasCanonicalBundle = [
            RUN_BUNDLE_V1_SCHEMA,
            RUN_BUNDLE_V2_SCHEMA,
          ].includes(done?.bundle?.schema);
          if (doneError && hasCanonicalBundle) {
            terminalAccountingPending = true;
            const finishAdmittedError = ({
              bundle,
              completionDiagnostics,
            }) => {
              if (
                terminalReceived ||
                !isRunGenerationCurrent(targetChatId, runGeneration)
              ) {
                return;
              }
              terminalAccountingPending = false;
              finishAttachedError(terminalError, bundle, {
                completionDiagnostics,
              });
            };
            const failErrorAccounting = () => {
              if (
                terminalReceived ||
                !isRunGenerationCurrent(targetChatId, runGeneration)
              ) {
                return;
              }
              terminalAccountingPending = false;
              finishAttachedError({
                code: "run_bundle_accounting_failed",
                message:
                  "The failed recovered run could not be admitted to the Run Bundle ledger.",
              });
            };
            try {
              const admission = admitDoneRunAccountingV1(done);
              if (admission && typeof admission.then === "function") {
                void admission
                  .then(finishAdmittedError)
                  .catch(failErrorAccounting);
              } else {
                finishAdmittedError(admission);
              }
            } catch (_error) {
              failErrorAccounting();
            }
            return;
          }
          finishAttachedError(terminalError);
          return;
        }
        markReplayAcceptanceObserved();
        terminalAccountingPending = true;
        const finishAdmittedDone = ({ bundle, completionDiagnostics }) => {
            if (
              terminalReceived ||
              !isRunGenerationCurrent(targetChatId, runGeneration)
            ) {
              return;
            }
            terminalAccountingPending = false;
            finishAttachedStream({
              status: "done",
              bundle,
              completionDiagnostics,
            });
        };
        const failDoneAccounting = (error) => {
            if (
              terminalReceived ||
              !isRunGenerationCurrent(targetChatId, runGeneration)
            ) {
              return;
            }
            terminalAccountingPending = false;
            finishAttachedError({
              code: error?.code || "run_bundle_accounting_failed",
              message:
                error?.message ||
                "The recovered run could not be admitted to the Run Bundle ledger.",
            });
        };
        try {
          const admission = admitDoneRunAccountingV1(done);
          if (admission && typeof admission.then === "function") {
            void admission.then(finishAdmittedDone).catch(failDoneAccounting);
          } else {
            finishAdmittedDone(admission);
          }
        } catch (error) {
          failDoneAccounting(error);
        }
      },
      onError: (error) => {
        if (
          terminalReceived ||
          terminalAccountingPending ||
          !isRunGenerationCurrent(targetChatId, runGeneration)
        ) {
          return;
        }
        const wasCancelled = error?.code === "cancelled";
        if (wasCancelled) {
          if (hasUnverifiedRelayedTurn()) {
            void cancelAndSettleUnverifiedReattach({
              error: {
                code: "queue_relay_cancelled_without_acceptance",
                message:
                  "The recovered queued follow-up was cancelled without verifiable acceptance evidence.",
              },
              retryWhenNeverRegistered: true,
            });
          } else {
            finishAttachedStream({ status: "cancelled" });
          }
        } else {
          finishAttachedError(error);
        }
      },
    };

    const scheduleReplayAcceptanceReconciliation = () => {
      clearReplayAcceptanceTimer();
      if (
        terminalReceived ||
        terminalAccountingPending ||
        !isRunGenerationCurrent(targetChatId, runGeneration) ||
        !hasUnverifiedRelayedTurn()
      ) {
        return;
      }
      replayAcceptanceTimer = scheduleQueueRelayTimer(
        targetChatId,
        runGeneration,
        () => {
          replayAcceptanceTimer = null;
          void (async () => {
            if (
              terminalReceived ||
              !isRunGenerationCurrent(targetChatId, runGeneration) ||
              !hasUnverifiedRelayedTurn()
            ) {
              return;
            }
            const expectedHandle = currentAttachedHandle;
            if (
              !expectedHandle ||
              streamHandlesRef.current.get(targetChatId) !== expectedHandle
            ) {
              return;
            }
            if (
              replayAcceptanceReattachCount >=
              QUEUE_RELAY_ACCEPTANCE_MAX_REATTACHES
            ) {
              await cancelAndSettleUnverifiedReattach({
                expectedHandle,
                error: {
                  code: "queue_relay_acceptance_timeout",
                  message:
                    "The recovered queued follow-up did not provide acceptance evidence in time. Its exact execution was cancelled and it was not restarted unless the server proved it never began.",
                },
                retryWhenNeverRegistered: true,
              });
              return;
            }
            replayAcceptanceReattachCount += 1;
            try {
              const attachedHandle = await api.unchain.attachStreamV4(
                {
                  requestId,
                  executionId: executionSessionId,
                  attemptId,
                  afterSeq: lastReplayStreamSeq,
                },
                reattachHandlers,
              );
              if (
                terminalReceived ||
                terminalAccountingPending ||
                !isRunGenerationCurrent(targetChatId, runGeneration) ||
                streamHandlesRef.current.get(targetChatId) !== expectedHandle
              ) {
                attachedHandle?.detach?.();
                return;
              }
              currentAttachedHandle = attachedHandle;
              streamHandlesRef.current.set(targetChatId, attachedHandle);
              if (!hasUnverifiedRelayedTurn()) {
                if (
                  attachedHandle?.terminal === true ||
                  attachedHandle?.active === false
                ) {
                  finishAttachedError({
                    code: "queue_relay_transport_lost_after_acceptance",
                    message:
                      "The recovered queued follow-up was accepted, but its transport was already closed. It was not restarted.",
                  });
                }
                return;
              }
              if (
                attachedHandle?.terminal === true ||
                attachedHandle?.active === false
              ) {
                await cancelAndSettleUnverifiedReattach({
                  expectedHandle: attachedHandle,
                  error: {
                    code: "queue_relay_terminal_without_acceptance",
                    message:
                      "The recovered queued follow-up ended without verifiable acceptance evidence. It was not restarted.",
                  },
                  retryWhenNeverRegistered: true,
                });
                return;
              }
              scheduleReplayAcceptanceReconciliation();
            } catch (attachError) {
              if (
                terminalReceived ||
                !isRunGenerationCurrent(targetChatId, runGeneration)
              ) {
                return;
              }
              const errorCode =
                typeof attachError?.code === "string" ? attachError.code : "";
              if (replayAcceptanceObserved) {
                await cancelAndSettleUnverifiedReattach({
                  expectedHandle,
                  error: {
                    code: "queue_relay_transport_lost_after_acceptance",
                    message:
                      "The recovered queued follow-up was accepted during replay, but reconnecting its transport failed. Its exact execution was cancelled and it was not restarted.",
                  },
                });
                return;
              }
              if (errorCode === "stream_not_found") {
                await cancelAndSettleUnverifiedReattach({
                  expectedHandle,
                  error: {
                    code: "queue_relay_stream_not_found",
                    message:
                      "The recovered queued follow-up stream was not found. Its exact execution was cancelled and it was not restarted unless the server proved it never began.",
                  },
                  retryWhenNeverRegistered: true,
                });
                return;
              }
              if (
                errorCode === "stream_replay_gap" ||
                errorCode === "stream_identity_mismatch" ||
                replayAcceptanceReattachCount >=
                  QUEUE_RELAY_ACCEPTANCE_MAX_REATTACHES
              ) {
                await cancelAndSettleUnverifiedReattach({
                  expectedHandle,
                  error: {
                    code: errorCode || "queue_relay_reattach_failed",
                    message:
                      errorCode === "stream_replay_gap"
                        ? "The recovered queued follow-up could not be replayed completely. Its exact execution was cancelled and it was not restarted."
                        : "The recovered queued follow-up could not be verified after reconnecting. Its exact execution was cancelled and it was not restarted.",
                  },
                  retryWhenNeverRegistered: Boolean(
                    errorCode !== "stream_replay_gap" &&
                      errorCode !== "stream_identity_mismatch",
                  ),
                });
                return;
              }
              scheduleReplayAcceptanceReconciliation();
            }
          })();
        },
        QUEUE_RELAY_ACCEPTANCE_RECONCILE_MS,
      );
    };

    const attachAvailable =
      typeof api.unchain.isRuntimeEventStreamV4AttachAvailable === "function" &&
      api.unchain.isRuntimeEventStreamV4AttachAvailable() &&
      typeof api.unchain.attachStreamV4 === "function";
    if (!attachAvailable) {
      settleUnavailableStream({ code: "stream_attach_unavailable" });
      return undefined;
    }

    reattachingChatIdsRef.current.add(targetChatId);
    streamingChatIdsRef.current.add(targetChatId);
    activeStreamsRef.current.set(targetChatId, { messages: storedMessages });
    activeRunThreadIdByChatIdRef.current.set(
      targetChatId,
      executionSessionId,
    );
    executionIdentityByChatIdRef.current.set(targetChatId, {
      ownerChatId: targetChatId,
      sessionId: executionSessionId,
      attemptId,
      requestId,
      sourceAttemptId: "",
      runGeneration,
    });
    syncPendingFyiStateForAttempt(targetChatId, attemptId);
    setStreamingChatIds((previous) => new Set(previous).add(targetChatId));

    void api.unchain
      .attachStreamV4(
        {
          requestId,
          executionId: executionSessionId,
          attemptId,
          // Rebuild from the beginning. Replacing the projected text avoids
          // duplicate tokens even when a partial message was already persisted.
          afterSeq: 0,
        },
        reattachHandlers,
      )
      .then((handle) => {
        if (
          terminalReceived ||
          terminalAccountingPending ||
          !isRunGenerationCurrent(targetChatId, runGeneration)
        ) {
          handle?.detach?.();
          return;
        }
        currentAttachedHandle = handle;
        streamHandlesRef.current.set(targetChatId, handle);
        if (handle?.terminal === true || handle?.active === false) {
          if (hasUnverifiedRelayedTurn()) {
            void cancelAndSettleUnverifiedReattach({
              expectedHandle: handle,
              error: {
                code: "queue_relay_terminal_without_acceptance",
                message:
                  "The recovered queued follow-up ended without verifiable acceptance evidence. It was not restarted.",
              },
              retryWhenNeverRegistered: true,
            });
          } else {
            finishAttachedError({
              code: "stream_closed_without_terminal_event",
              message:
                "The recovered stream closed before a terminal event was received.",
            });
          }
          return;
        }
        scheduleReplayAcceptanceReconciliation();
      })
      .catch((error) => {
        if (
          terminalReceived ||
          terminalAccountingPending ||
          !isRunGenerationCurrent(targetChatId, runGeneration)
        ) {
          return;
        }
        if (replayAcceptanceObserved || hasUnverifiedRelayedTurn()) {
          void cancelAndSettleUnverifiedReattach({
            error:
              replayAcceptanceObserved
                ? {
                    code: "queue_relay_transport_lost_after_acceptance",
                    message:
                      "The recovered queued follow-up was accepted during replay, but reconnecting its transport failed. Its exact execution was cancelled and it was not restarted.",
                  }
                : {
                    code:
                      typeof error?.code === "string"
                        ? error.code
                        : "queue_relay_reattach_failed",
                    message:
                      error?.code === "stream_replay_gap"
                        ? "The recovered queued follow-up could not be replayed completely. Its exact execution was cancelled and it was not restarted."
                        : "The recovered queued follow-up stream could not be verified. Its exact execution was cancelled and it was not restarted unless the server proved it never began.",
                  },
            retryWhenNeverRegistered: Boolean(
              !replayAcceptanceObserved &&
                error?.code !== "stream_replay_gap" &&
                error?.code !== "stream_identity_mismatch",
            ),
          });
          return;
        }
        settleUnavailableStream(error);
      });

    // Chat switches do not detach this listener. The hook-level unmount
    // cleanup owns transport detach for every active chat.
    return undefined;
  }, [
    activeChatIdRef,
    activeStreamsRef,
    acknowledgeRelayedQueuedTurnsForAttempt,
    acknowledgeInjectedFyisForAttempt,
    chatId,
    clearAllPendingToolConfirmations,
    clearStreamingMessageStore,
    commitForegroundMessages,
    ensureRecoveryRunGeneration,
    fallbackPendingClarifyForChat,
    fallbackPendingFyisForAttempt,
    getConfirmationRuntimeForChat,
    hydrateQueuedTurnsForAttempt,
    isRunGenerationCurrent,
    messagesRef,
    scheduleQueueRelayTimer,
    setStreamErrorForChat,
    storageApi,
    syncInterjectStateForChat,
    syncPendingFyiStateForAttempt,
    updatePendingContinuationRequestForChat,
    updatePendingToolConfirmationRequests,
    updateToolConfirmationUiState,
  ]);

  useEffect(() => {
    const targetChatId =
      typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
    if (
      !targetChatId ||
      isStreaming ||
      reattachingChatIdsRef.current.has(targetChatId) ||
      typeof api.unchain.isDurableInteractionBridgeAvailable !== "function" ||
      !api.unchain.isDurableInteractionBridgeAvailable()
    ) {
      return undefined;
    }
    const runGeneration = ensureRecoveryRunGeneration(targetChatId);
    if (
      !runGeneration ||
      !isRunGenerationCurrent(targetChatId, runGeneration)
    ) {
      return undefined;
    }
    const existingState = durableInteractionByChatIdRef.current[targetChatId];
    if (
      ["retry_wait", "resume_failed", "resuming"].includes(
        existingState?.status,
      )
    ) {
      return undefined;
    }

    let cancelled = false;
    updateDurableInteractionForChat(targetChatId, {
      ...(existingState || {}),
      status: "checking",
      lastError: "",
    });
    void (async () => {
      let sessionId = targetChatId;
      if (isCharacterChat) {
        try {
          const recoveryThreadId =
            typeof threadIdRef?.current === "string" ? threadIdRef.current : "";
          const config = await buildCharacterRunConfig(recoveryThreadId);
          if (
            cancelled ||
            !isRunGenerationCurrent(targetChatId, runGeneration)
          ) {
            return;
          }
          sessionId =
            typeof config?.session_id === "string" && config.session_id.trim()
              ? config.session_id.trim()
              : "";
        } catch (error) {
          if (
            !cancelled &&
            isRunGenerationCurrent(targetChatId, runGeneration)
          ) {
            const errorMessage =
              error?.message || "Failed to prepare durable recovery.";
            updateDurableInteractionForChat(targetChatId, {
              status: "resume_failed",
              sessionId: "",
              lastError: errorMessage,
            });
            setStreamErrorForChat(targetChatId, errorMessage);
          }
          return;
        }
      }
      if (
        !cancelled &&
        sessionId &&
        isRunGenerationCurrent(targetChatId, runGeneration)
      ) {
        await lookupDurableInteraction(targetChatId, sessionId, {
          runGeneration,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    buildCharacterRunConfig,
    chatId,
    ensureRecoveryRunGeneration,
    isCharacterChat,
    isRunGenerationCurrent,
    isStreaming,
    lookupDurableInteraction,
    setStreamError,
    setStreamErrorForChat,
    threadIdRef,
    turnMutationVersion,
    updateDurableInteractionForChat,
  ]);

  const readMessagesForTest = useCallback(
    (targetChatId) => {
      const streamMessages =
        activeStreamsRef.current.get(targetChatId)?.messages;
      if (Array.isArray(streamMessages)) {
        return streamMessages;
      }
      if (
        activeChatIdRef.current === targetChatId &&
        Array.isArray(messagesRef.current)
      ) {
        return messagesRef.current;
      }
      if (typeof storageApi.getChatMessages === "function") {
        const storedMessages = storageApi.getChatMessages(targetChatId);
        return Array.isArray(storedMessages) ? storedMessages : [];
      }
      return [];
    },
    [activeChatIdRef, activeStreamsRef, messagesRef, storageApi],
  );

  const getRunForTest = useCallback(
    ({ id, attempt_id: requestedAttemptId, attemptId } = {}) => {
      const targetChatId = typeof id === "string" ? id.trim() : "";
      const normalizedAttemptId =
        typeof (requestedAttemptId ?? attemptId) === "string"
          ? (requestedAttemptId ?? attemptId).trim()
          : "";
      if (!targetChatId) {
        throw Object.assign(new Error("chat id is required"), {
          code: "invalid_request",
        });
      }
      if (!normalizedAttemptId) {
        throw Object.assign(new Error("attempt_id is required"), {
          code: "invalid_request",
        });
      }

      const identity =
        executionIdentityByChatIdRef.current.get(targetChatId) || null;
      const identityMatches = identity?.attemptId === normalizedAttemptId;
      const messagesForChat = readMessagesForTest(targetChatId);
      const assistantMessage = [...messagesForChat]
        .reverse()
        .find(
          (message) =>
            message?.role === "assistant" &&
            message?.meta?.attemptId === normalizedAttemptId,
        );
      if (!identityMatches && !assistantMessage) {
        throw Object.assign(
          new Error(
            `run ${normalizedAttemptId} was not found for chat ${targetChatId}`,
          ),
          { code: "run_not_found" },
        );
      }

      const messageStatus =
        typeof assistantMessage?.status === "string"
          ? assistantMessage.status
          : "";
      const isRunning =
        identityMatches && streamingChatIdsRef.current.has(targetChatId);
      const status = isRunning
        ? "running"
        : messageStatus === "done"
          ? "completed"
          : messageStatus === "error"
            ? "failed"
            : messageStatus === "cancelled"
              ? "cancelled"
              : messageStatus === "streaming"
                ? "interrupted"
                : "completed";
      const executionId =
        (identityMatches && identity?.sessionId) ||
        assistantMessage?.meta?.executionSessionId ||
        targetChatId;
      const content =
        typeof assistantMessage?.content === "string"
          ? assistantMessage.content
          : assistantMessage?.content == null
            ? ""
            : JSON.stringify(assistantMessage.content);
      const pendingRequestsRef =
        pendingToolConfirmationRequestsByChatIdRef.current[targetChatId] || {};
      const pendingRequestsRendered =
        pendingToolConfirmationRequestsByChatId[targetChatId] || {};
      const confirmationUiRef =
        toolConfirmationUiStateByChatIdRef.current[targetChatId] || {};
      const confirmationUiRendered =
        toolConfirmationUiStateByChatId[targetChatId] || {};
      const confirmationRuntime =
        confirmationRuntimeByChatIdRef.current.get(targetChatId) || null;
      const requestSummary = (requests) =>
        Object.fromEntries(
          Object.entries(requests).map(([confirmationId, request]) => [
            confirmationId,
            {
              confirmation_id: request?.confirmationId || confirmationId,
              call_id: request?.callId || "",
              owner_message_id: request?.ownerMessageId || "",
              session_id: request?.sessionId || "",
            },
          ]),
        );
      const traceGroups = [
        assistantMessage?.traceFrames,
        ...Object.values(assistantMessage?.subagentFrames || {}),
      ];
      const confirmationTraceFrames = traceGroups.flatMap((frames) =>
        (Array.isArray(frames) ? frames : [])
          .filter(
            (frame) =>
              frame?.type === "tool_call" &&
              (frame.payload?.call_id || frame.payload?.confirmation_id),
          )
          .map((frame) => ({
            type: frame.type,
            seq: frame.seq ?? null,
            call_id: frame.payload?.call_id || "",
            confirmation_id: frame.payload?.confirmation_id || "",
            requires_confirmation:
              frame.payload?.requires_confirmation === true,
            tool_name: frame.payload?.tool_name || "",
          })),
      );

      return {
        chat_id: targetChatId,
        execution_id: executionId,
        attempt_id: normalizedAttemptId,
        status,
        message_id: assistantMessage?.id || null,
        content,
        tool_calls: assistantMessage?.tool_calls || null,
        finish_reason: assistantMessage?.finish_reason || null,
        started_at: assistantMessage?.createdAt || null,
        updated_at: assistantMessage?.updatedAt || null,
        error: assistantMessage?.meta?.error || null,
        confirmation_debug: {
          pending_requests_ref: requestSummary(pendingRequestsRef),
          pending_requests_rendered: requestSummary(pendingRequestsRendered),
          ui_state_ref: confirmationUiRef,
          ui_state_rendered: confirmationUiRendered,
          runtime: confirmationRuntime
            ? {
                confirmation_id_by_call_id: Object.fromEntries(
                  confirmationRuntime.confirmationIdByCallId,
                ),
                confirmation_call_id_by_id: Object.fromEntries(
                  confirmationRuntime.confirmationCallIdById,
                ),
                session_id_by_confirmation_id: Object.fromEntries(
                  confirmationRuntime.sessionIdByConfirmationId,
                ),
              }
            : null,
          trace_frames: confirmationTraceFrames,
        },
      };
    },
    [
      pendingToolConfirmationRequestsByChatId,
      readMessagesForTest,
      streamingChatIdsRef,
      toolConfirmationUiStateByChatId,
    ],
  );

  const cancelRunForTest = useCallback(
    async ({ id, attempt_id: requestedAttemptId, attemptId } = {}) => {
      const targetChatId = typeof id === "string" ? id.trim() : "";
      const normalizedAttemptId =
        typeof (requestedAttemptId ?? attemptId) === "string"
          ? (requestedAttemptId ?? attemptId).trim()
          : "";
      if (!targetChatId) {
        throw Object.assign(new Error("chat id is required"), {
          code: "invalid_request",
        });
      }

      const identity =
        executionIdentityByChatIdRef.current.get(targetChatId) || null;
      if (
        !identity?.attemptId ||
        !streamingChatIdsRef.current.has(targetChatId)
      ) {
        throw Object.assign(
          new Error(`chat ${targetChatId} has no active run`),
          { code: "run_not_active" },
        );
      }
      if (normalizedAttemptId && identity.attemptId !== normalizedAttemptId) {
        throw Object.assign(
          new Error(
            `attempt ${normalizedAttemptId} does not own chat ${targetChatId}`,
          ),
          { code: "attempt_mismatch" },
        );
      }

      const handle = streamHandlesRef.current.get(targetChatId) || null;
      /* Fence the cancel to the exact run (A) we captured. During the await
         below, A can finish and a queue relay can start a fresh run (B) that
         reuses this chat id. Capture A's generation + identity now so that,
         after the await, we can tell whether we are still cancelling A or would
         otherwise clobber B's live handle / FYI / queue state. */
      const capturedRunGeneration = getRunGeneration(targetChatId);
      const capturedSessionId = identity.sessionId;
      const capturedAttemptId = identity.attemptId;
      const capturedMessages = materializeStreamingMessages(
        targetChatId,
        readMessagesForTest(targetChatId),
      );
      const capturedStreamingAssistant = capturedMessages.find(
        (message) =>
          message?.role === "assistant" &&
          message?.status === "streaming" &&
          message?.meta?.attemptId === capturedAttemptId,
      );
      /* Tombstone queue relay intent before awaiting backend cancellation. A
         pre-acceptance lease conflict can arrive while cancelExecution is
         pending; clearing the relay owner now makes its onReject callback
         fail closed instead of scheduling a successor behind the cancel. */
      clearQueueRelayTimersForChat(targetChatId);
      clearQueuedTurnsForChat(targetChatId, capturedAttemptId);
      const result = await requestExecutionCancellationAndDisconnect({
        identity,
        handle,
        reason: "test_api_cancel",
      });
      if (!result?.ok) {
        throw Object.assign(new Error("failed to cancel the exact run"), {
          code: "execution_cancel_failed",
        });
      }
      const currentIdentity =
        executionIdentityByChatIdRef.current.get(targetChatId) || null;
      const stillExactOwner =
        isRunGenerationCurrent(targetChatId, capturedRunGeneration) &&
        currentIdentity?.attemptId === capturedAttemptId &&
        currentIdentity?.sessionId === capturedSessionId;
      if (!stillExactOwner) {
        const messagesAfterAwait = materializeStreamingMessages(
          targetChatId,
          readMessagesForTest(targetChatId),
        );
        const exactAssistantAfterAwait = messagesAfterAwait.find(
          (message) =>
            message?.role === "assistant" &&
            message?.meta?.attemptId === capturedAttemptId,
        );
        const newerOwnerExists = Boolean(
          currentIdentity?.attemptId &&
            currentIdentity.attemptId !== capturedAttemptId,
        );
        const newerStreamingAssistantExists = messagesAfterAwait.some(
          (message) =>
            message?.role === "assistant" &&
            message?.status === "streaming" &&
            message?.id !== capturedStreamingAssistant?.id,
        );
        if (
          !newerOwnerExists &&
          !newerStreamingAssistantExists &&
          capturedStreamingAssistant &&
          (!exactAssistantAfterAwait ||
            exactAssistantAfterAwait.status === "streaming")
        ) {
          const tombstone = finalizeStreamingMessage(
            exactAssistantAfterAwait || capturedStreamingAssistant,
            {
              content: "",
              status: "cancelled",
              updatedAt: Date.now(),
            },
          );
          const nextMessages = exactAssistantAfterAwait
            ? messagesAfterAwait.map((message) =>
                message.id === exactAssistantAfterAwait.id ? tombstone : message,
              )
            : [...messagesAfterAwait, tombstone];
          clearStreamingMessageStore(targetChatId, tombstone.id);
          activeStreamsRef.current.delete(targetChatId);
          streamingChatIdsRef.current.delete(targetChatId);
          commitForegroundMessages(targetChatId, nextMessages);
          storageApi.setChatMessages(targetChatId, nextMessages, {
            source: "test-api-cancel-terminal-race",
          });
        }
        /* A already terminated and a successor (B) — or nothing — now owns the
           chat. Report A's cancellation without mutating the current (B) run's
           handle, streaming set, FYI, or queued-turn state. */
        return {
          ok: true,
          chat_id: targetChatId,
          execution_id: capturedSessionId,
          attempt_id: capturedAttemptId,
          status: "cancel_requested",
          cancellation: result.response || null,
        };
      }
      invalidateRunGeneration(targetChatId);
      clearConfirmationRetryWaitersForChat(targetChatId);
      clearQueueRelayTimersForChat(targetChatId);
      clearQueuedTurnsForChat(targetChatId, identity.attemptId);
      pendingFyiCountByChatIdRef.current.delete(targetChatId);
      pendingClarifyByChatIdRef.current.delete(targetChatId);
      clearAllPendingToolConfirmations(targetChatId);
      updatePendingContinuationRequestForChat(targetChatId, null);
      streamHandlesRef.current.delete(targetChatId);
      executionIdentityByChatIdRef.current.delete(targetChatId);
      streamingChatIdsRef.current.delete(targetChatId);
      activeRunThreadIdByChatIdRef.current.delete(targetChatId);
      const materializedMessages = materializeStreamingMessages(
        targetChatId,
        readMessagesForTest(targetChatId),
      );
      const exactStreamingAssistant =
        materializedMessages.find(
          (message) =>
            message?.role === "assistant" &&
            message?.status === "streaming" &&
            message?.meta?.attemptId === identity.attemptId,
        ) || capturedStreamingAssistant;
      const settled = settleStreamingAssistantMessages(materializedMessages);
      let nextMessages = settled.nextMessages;
      if (
        exactStreamingAssistant &&
        !nextMessages.some(
          (message) => message?.id === exactStreamingAssistant.id,
        )
      ) {
        /* Exact Test API runs need a terminal tombstone even when cancellation
           happens before the first token. Otherwise the empty placeholder is
           dropped and a follow-up GET incorrectly becomes run_not_found. */
        nextMessages = [
          ...nextMessages,
          finalizeStreamingMessage(exactStreamingAssistant, {
            content: "",
            status: "cancelled",
            updatedAt: Date.now(),
          }),
        ];
      }
      materializedMessages.forEach((message) => {
        if (message?.role === "assistant" && message?.status === "streaming") {
          clearStreamingMessageStore(targetChatId, message.id);
        }
      });
      activeStreamsRef.current.delete(targetChatId);
      cancelBackgroundPersist(targetChatId);
      commitForegroundMessages(targetChatId, nextMessages);
      storageApi.setChatMessages(targetChatId, nextMessages, {
        source: "test-api-cancel",
      });
      setStreamingChatIds((previous) => {
        const next = new Set(previous);
        next.delete(targetChatId);
        return next;
      });
      return {
        ok: true,
        chat_id: targetChatId,
        execution_id: identity.sessionId,
        attempt_id: identity.attemptId,
        status: "cancel_requested",
        cancellation: result.response || null,
      };
    },
    [
      activeStreamsRef,
      clearAllPendingToolConfirmations,
      clearConfirmationRetryWaitersForChat,
      clearQueuedTurnsForChat,
      clearQueueRelayTimersForChat,
      clearStreamingMessageStore,
      commitForegroundMessages,
      getRunGeneration,
      invalidateRunGeneration,
      isRunGenerationCurrent,
      materializeStreamingMessages,
      readMessagesForTest,
      storageApi,
      streamingChatIdsRef,
      updatePendingContinuationRequestForChat,
    ],
  );

  const sendForTest = useCallback(
    async ({
      id,
      text = "",
      attachments = [],
      wait_for_completion: waitForCompletionSnake,
      waitForCompletion: waitForCompletionCamel,
    } = {}) => {
      const targetChatId = typeof id === "string" ? id.trim() : "";
      const activeChatId = activeChatIdRef.current;
      if (!targetChatId) {
        throw Object.assign(new Error("chat id is required"), {
          code: "invalid_request",
        });
      }
      const exactStore = getChatsStore();
      const exactRunContext = snapshotStoredRunContext(
        exactStore,
        targetChatId,
      );
      if (!exactRunContext) {
        throw Object.assign(new Error(`chat ${targetChatId} not found`), {
          code: "chat_not_found",
        });
      }
      if (
        !activeChatId ||
        activeChatId !== targetChatId ||
        exactStore?.activeChatId !== targetChatId
      ) {
        throw Object.assign(
          new Error(
            `chat ${targetChatId} is not active; activate it before starting a run`,
          ),
          { code: "chat_not_active" },
        );
      }
      if (
        exactRunContext.kind === "character" &&
        !exactRunContext.characterId
      ) {
        throw Object.assign(
          new Error(`chat ${targetChatId} has an invalid character config`),
          { code: "chat_config_unavailable" },
        );
      }
      if (
        exactRunContext.kind !== "character" &&
        (!exactRunContext.modelId ||
          exactRunContext.modelId === "unchain-unset")
      ) {
        throw Object.assign(
          new Error(`chat ${targetChatId} has no runnable model config`),
          { code: "chat_config_unavailable" },
        );
      }
      if (durableInteractionByChatIdRef.current[targetChatId]?.status) {
        throw Object.assign(
          new Error("This chat is restoring an interrupted run."),
          { code: "durable_interaction_in_progress" },
        );
      }
      if (
        streamingChatIdsRef.current.has(targetChatId) ||
        runPreflightGenerationByChatIdRef.current.has(targetChatId)
      ) {
        throw Object.assign(new Error("This chat already has an active run."), {
          code: "run_already_active",
        });
      }

      const waitForCompletion =
        waitForCompletionSnake !== undefined
          ? waitForCompletionSnake !== false
          : waitForCompletionCamel !== undefined
            ? waitForCompletionCamel !== false
            : true;
      const baseMessages = readMessagesForTest(targetChatId);
      const baseMessageIds = new Set(
        baseMessages
          .map((message) => message?.id)
          .filter((messageId) => typeof messageId === "string" && messageId),
      );
      const startedAt = Date.now();
      const started = await runTurnRequest({
        mode: "send",
        chatId: targetChatId,
        text,
        attachments,
        baseMessages,
        clearComposer: true,
        missingAttachmentPayloadMode: "block",
        runContext: exactRunContext,
      });
      if (!started) {
        throw Object.assign(new Error("run did not start"), {
          code: "run_start_failed",
        });
      }

      const identity =
        executionIdentityByChatIdRef.current.get(targetChatId) || null;
      const attemptIdValue =
        typeof identity?.attemptId === "string"
          ? identity.attemptId.trim()
          : "";
      if (!waitForCompletion) {
        if (!attemptIdValue) {
          throw Object.assign(
            new Error("runtime did not return an attempt identity"),
            { code: "run_identity_unavailable" },
          );
        }
        return getRunForTest({ id: targetChatId, attempt_id: attemptIdValue });
      }

      return new Promise((resolve, reject) => {
        let timer;
        const finish = (callback) => {
          clearInterval(interval);
          clearTimeout(timer);
          callback();
        };
        const interval = setInterval(() => {
          if (attemptIdValue) {
            let snapshot;
            try {
              snapshot = getRunForTest({
                id: targetChatId,
                attempt_id: attemptIdValue,
              });
            } catch (error) {
              if (error?.code === "run_not_found") {
                return;
              }
              finish(() => reject(error));
              return;
            }
            if (snapshot.status === "completed") {
              finish(() =>
                resolve({
                  message_id: snapshot.message_id,
                  role: "assistant",
                  content: snapshot.content,
                  tool_calls: snapshot.tool_calls,
                  finish_reason: snapshot.finish_reason || "stop",
                  latency_ms: Date.now() - startedAt,
                  chat_id: targetChatId,
                  execution_id: snapshot.execution_id,
                  attempt_id: attemptIdValue,
                }),
              );
            } else if (
              ["failed", "cancelled", "interrupted"].includes(snapshot.status)
            ) {
              finish(() =>
                reject(
                  Object.assign(
                    new Error(
                      snapshot.error?.message ||
                        `run ended with status ${snapshot.status}`,
                    ),
                    {
                      code: snapshot.error?.code || `run_${snapshot.status}`,
                    },
                  ),
                ),
              );
            }
            return;
          }

          // Legacy V2 compatibility: V2 handles do not expose attempt ids, but
          // the blocking /messages endpoint must still resolve from this exact
          // chat rather than whichever chat is currently visible.
          const messagesForChat = readMessagesForTest(targetChatId);
          const last = [...messagesForChat]
            .reverse()
            .find(
              (message) =>
                message?.role === "assistant" &&
                !baseMessageIds.has(message?.id),
            );
          const stillStreaming = streamingChatIdsRef.current.has(targetChatId);
          if (
            !stillStreaming &&
            last &&
            last.status !== "error" &&
            last.status !== "streaming"
          ) {
            finish(() =>
              resolve({
                message_id: last.id,
                role: "assistant",
                content:
                  typeof last.content === "string"
                    ? last.content
                    : JSON.stringify(last.content),
                tool_calls: last.tool_calls || null,
                finish_reason: last.finish_reason || "stop",
                latency_ms: Date.now() - startedAt,
                chat_id: targetChatId,
              }),
            );
          }
        }, 100);
        timer = setTimeout(
          () => {
            clearInterval(interval);
            reject(
              Object.assign(new Error("send timeout"), { code: "ipc_timeout" }),
            );
          },
          5 * 60 * 1000,
        );
      });
    },
    [
      activeChatIdRef,
      getRunForTest,
      readMessagesForTest,
      runTurnRequest,
      streamingChatIdsRef,
    ],
  );

  /* sendNewTurn(options) — options is optional and only consulted when it is
     a plain object carrying our own known keys, so the common call sites
     (onClick={sendNewTurn} handing sendNewTurn a SyntheticEvent, or the
     plain sendNewTurn() from the input panel) stay exactly as before:
       - options.text: string   — programmatic send (queue-relay / new_run
         fallback via handleInterject); bypasses the composer entirely.
       - options.chatId: string — target chat for a programmatic send
         (only ever used when it equals the active chat — see
         dispatchInterjectChannel's new_run branch).
       - options.bypassInterject: true — used when re-invoking sendNewTurn
         from the interject fallback path itself, so a race that finds the
         chat streaming again refuses instead of recursing into
         handleInterject a second time. */
  const sendNewTurn = useCallback(
    (options) => {
      const overrideText = typeof options?.text === "string" ? options.text : null;
      const bypassInterject = options?.bypassInterject === true;
      const isProgrammaticSend = overrideText !== null;

      const currentChatId =
        isProgrammaticSend && typeof options?.chatId === "string" && options.chatId
          ? options.chatId
          : activeChatIdRef.current;
      const text = isProgrammaticSend
        ? overrideText.trim()
        : inputValueRef.current.trim();
      const currentDraftAttachments = isProgrammaticSend
        ? []
        : draftAttachmentsRef.current;
      const hasAttachments = Array.isArray(currentDraftAttachments)
        ? currentDraftAttachments.length > 0
        : false;
      const normalizedSelectedModelId =
        typeof selectedModelIdRef.current === "string" ? selectedModelIdRef.current.trim() : "";
      const hasSelectedModel =
        isCharacterChat ||
        (normalizedSelectedModelId &&
          normalizedSelectedModelId !== "unchain-unset");
      const thisChatsRunActive = isChatRunPending(currentChatId);
      const thisChatHasStreamHandle =
        streamHandlesRef.current.has(currentChatId);
      if (!currentChatId || (!text && !hasAttachments)) {
        return;
      }
      const composerRevisionAtRequest =
        composerRevisionByChatIdRef?.current?.get?.(currentChatId) || 0;

      /* ── Memory V2 P0 secret gate ───────────────────────────────────────────
         Everything from here down is `runSend`, and NOTHING in it runs until
         the gate has resolved. That matters because runSend is where the first
         durable side effects of a send live: pushQueuedTurn (queue outbox),
         handleInterject (FYI/clarify outbox), and runTurnRequest (composer
         draft claim, beginRunGeneration, markChatStarted, chat_storage,
         journal, stream). The checks ABOVE this point are pure reads plus
         React-only error state, so gating here still dominates every write.

         `outgoingSource` is the gate's answer (identical to `text` when the
         message is clean). `text` stays in scope on purpose: the composer
         staleness comparisons must be made against what the user actually
         typed, not against the redacted form. */
      const runSend = (
        outgoingSource,
        secretGateToken,
        secretDisposition,
        continuedFromRunId = "",
      ) => {
      const discardSecretGateToken = () => {
        if (!secretGateToken) return;
        consumeSecretGateToken(secretGateToken, {
          chatId: currentChatId,
          text: outgoingSource,
        });
      };
      const durableState =
        durableInteractionByChatIdRef.current[currentChatId] || null;
      if (durableState?.status && !thisChatsRunActive) {
        if (
          !isProgrammaticSend &&
          canSealDurableInteractionForFreshSend(durableState.status)
        ) {
          /* A new composer message abandons, rather than resumes, the exact
             paused attempt. No optimistic user message or new run exists
             until the backend cancellation is authoritative and a fresh
             lookup projects `none`. */
          void sealDurableInteractionForFreshSend(
            currentChatId,
            durableState,
          ).then((sealed) => {
            if (!sealed) {
              discardSecretGateToken();
              return;
            }
            if (
              activeChatIdRef.current !== currentChatId ||
              isChatRunPending(currentChatId) !== thisChatsRunActive ||
              durableInteractionByChatIdRef.current[currentChatId]?.status ||
              inputValueRef.current.trim() !== text ||
              !sameDraftAttachments(
                draftAttachmentsRef.current,
                currentDraftAttachments,
              ) ||
              (composerRevisionByChatIdRef?.current?.get?.(currentChatId) ||
                0) !== composerRevisionAtRequest
            ) {
              discardSecretGateToken();
              return;
            }
            runSend(
              outgoingSource,
              secretGateToken,
              secretDisposition,
              sealed.continuedFromRunId,
            );
          });
          return;
        }
        setStreamError(
          durableState.lastError ||
            "This chat is finishing a paused run. Please wait.",
        );
        discardSecretGateToken();
        return;
      }

      /* A gate token is one-time and only runTurnRequest may spend it. Every
         other way out of runSend (no model selected, bridge unavailable,
         attachments refused, queued locally, routed to interject) ends the
         send WITHOUT reaching runTurnRequest, so the token is burned here
         instead — an approval must never outlive the send it was granted for.
         The body below is deliberately not re-indented; see the note above. */
      let secretGateTokenHandedOff = false;
      try {
      if (thisChatsRunActive) {
        if (bypassInterject) {
          // Should not normally happen — see the comment above — but never
          // race a concurrent send into an active run.
          return;
        }
        if (!thisChatHasStreamHandle) {
          const preflightInterject = extractCommands(outgoingSource ?? "", {
            isStreaming: true,
          });
          const normalizedPreflightText = outgoingSource.trim();
          const isExplicitQueue =
            preflightInterject.commands.some(
              (command) => command?.channel === "queue",
            ) || normalizedPreflightText.startsWith("/queue ");
          const preflightQueueBody =
            preflightInterject.body.trim() ||
            (normalizedPreflightText.startsWith("/queue ")
              ? normalizedPreflightText.slice("/queue".length).trim()
              : "");
          if (
            isExplicitQueue &&
            !hasAttachments &&
            preflightQueueBody
          ) {
            if (
              pushQueuedTurn(
                currentChatId,
                preflightQueueBody,
                secretDisposition,
              )
            ) {
              setInputValue("");
              setDraftAttachments([]);
            }
            return;
          }
          /* The run is still in local preflight, so there is no backend
             execution to interject into yet. Explicit queue input can wait
             locally for the exact attempt identity; every other channel keeps
             the draft intact and refuses a second run. */
          toast.info("This chat is still preparing. Please wait.", {
            dedupeKey: `chat-preflight-${currentChatId}`,
          });
          return;
        }
        // Fail closed on attachments: the interject channels are text-only, so
        // a follow-up carrying attachments cannot be addressed to the running
        // response without silently dropping the attachments. Keep the composer
        // (text + attachments) intact and never call interject — the user can
        // resend once the current response finishes.
        if (hasAttachments) {
          toast.info(
            "Attachments can't be added to a response that's already running. Wait for it to finish, then send them.",
            { dedupeKey: `chat-active-attachment-${currentChatId}` },
          );
          return;
        }
        // A send arrived while this chat's run is still active: route it
        // through the interject channels (fyi/btw/queue/clarify) instead of
        // silently dropping it.
        const interjectResult = handleInterjectRef.current?.(
          currentChatId,
          outgoingSource,
          { secretDisposition },
        );
        void Promise.resolve(interjectResult).then((accepted) => {
          if (
            accepted !== true ||
            activeChatIdRef.current !== currentChatId ||
            inputValueRef.current.trim() !== text ||
            !sameDraftAttachments(
              draftAttachmentsRef.current,
              currentDraftAttachments,
            )
          ) {
            return;
          }
          setInputValue("");
          setDraftAttachments([]);
        });
        return;
      }

      if (!api.unchain.isBridgeAvailable()) {
        setStreamErrorForChat(
          currentChatId,
          "Unchain bridge is unavailable in this runtime.",
        );
        return;
      }

      if (!hasSelectedModel) {
        setStreamError("Select a model before sending a message.");
        return;
      }

      if (hasAttachments && !attachmentsEnabled) {
        setStreamError(
          attachmentsDisabledReason ||
            "Current model does not support image or file inputs.",
        );
        return;
      }

      // Composer plugin-skill expansion: only for text actually typed into
      // the composer. Programmatic sends (interject new_run fallback / queue
      // relay) already carry a resolved body — expanding them again would
      // re-run command tokens that were already handled upstream, so they
      // never carry a composer sidecar either.
      let outgoingText = outgoingSource;
      let commandToolkits = [];
      let composer = null;
      if (!isProgrammaticSend) {
        // buildComposerSend: expanded body + ephemeral per-run toolkit
        // selection (using a plugin's command selects that plugin for THIS run
        // only — never persisted to the session) + the presentation sidecar.
        const built = buildComposerSend(
          outgoingSource,
          selectedToolkitsRef.current,
        );
        outgoingText = built.outgoingText;
        commandToolkits = built.extraToolkits;
        composer = built.composer;
      }

      if (!outgoingText && !hasAttachments) {
        return;
      }

      /* Ownership of the one-time token passes to runTurnRequest here. */
      secretGateTokenHandedOff = true;
      void runTurnRequest({
        mode: "send",
        chatId: currentChatId,
        text: outgoingText,
        attachments: currentDraftAttachments,
        baseMessages: messagesRef.current,
        clearComposer: !isProgrammaticSend,
        missingAttachmentPayloadMode: "block",
        extraToolkits: commandToolkits,
        composer,
        secretGateToken,
        /* PRE-expansion text: this is what the modal showed the user and what
           the token is bound to. `outgoingText` may carry skill expansion. */
        secretGateText: outgoingSource,
        continuedFromRunId,
      });
      } finally {
        if (secretGateToken && !secretGateTokenHandedOff) {
          consumeSecretGateToken(secretGateToken, {
            chatId: currentChatId,
            text: outgoingSource,
          });
        }
      }
      };

      /* A programmatic relay of an item the user already approved as plain
         text mints its one-time token from the PERSISTED disposition. Any
         other programmatic send goes through the gate, where a hit fails
         closed because a background relay must never raise a modal. */
      const programmaticDispositionToken = isProgrammaticSend
        ? mintTokenForDisposition({
            chatId: currentChatId,
            text,
            disposition: options?.secretDisposition,
          })
        : null;
      if (programmaticDispositionToken) {
        runSend(
          text,
          programmaticDispositionToken,
          PLAIN_USER_APPROVED_DISPOSITION,
        );
        return;
      }

      /* Clean text keeps the original, fully SYNCHRONOUS path. The gate only
         changes control flow when it actually has something to gate, so the
         send timing of ordinary messages is byte-for-byte unchanged.

         This MUST use scanOutgoingSecretText, which reports explicit
         {{secret:...}} blocks as candidates. The previous heuristic-only scan
         treated wrapped spans as excluded regions, so a message using the
         documented syntax scanned "clean", took this synchronous path, and
         reached a late deposit inside runTurnRequest that ran after
         markChatStarted / the draft claim / the render runtime — the very
         bypass this guard exists to prevent. */
      const preScan = scanOutgoingSecretText(text);
      if (preScan.ok && preScan.candidates.length === 0) {
        runSend(text, "", "");
        return;
      }

      void resolveSecretGateForSend({
        chatId: currentChatId,
        text,
        interactive: !isProgrammaticSend,
      }).then((resolved) => {
        if (!resolved) return;
        /* Stale-state revalidation. While the modal was open the user may have
           switched chats, edited the composer, changed attachments, or started
           a run. Any drift means this approval no longer describes what is on
           screen, so nothing is sent — the composer keeps its text and the
           user can send again deliberately. */
        if (activeChatIdRef.current !== currentChatId) return;
        if (isChatRunPending(currentChatId) !== thisChatsRunActive) return;
        if (!isProgrammaticSend) {
          if (inputValueRef.current.trim() !== text) return;
          if (
            !sameDraftAttachments(
              draftAttachmentsRef.current,
              currentDraftAttachments,
            )
          ) {
            return;
          }
          if (
            (composerRevisionByChatIdRef?.current?.get?.(currentChatId) || 0) !==
            composerRevisionAtRequest
          ) {
            return;
          }
        }
        runSend(
          resolved.text,
          resolved.token || "",
          resolved.disposition || "",
        );
      });
    },
    [
      activeChatIdRef,
      attachmentsDisabledReason,
      attachmentsEnabled,
      composerRevisionByChatIdRef,
      consumeSecretGateToken,
      isCharacterChat,
      isChatRunPending,
      messagesRef,
      mintTokenForDisposition,
      pushQueuedTurn,
      resolveSecretGateForSend,
      runTurnRequest,
      sealDurableInteractionForFreshSend,
      setDraftAttachments,
      setInputValue,
      setStreamError,
      setStreamErrorForChat,
    ],
  );

  /* Sends {threadId, text: body, channel} to the server and dispatches on
     whatever resolved_channel comes back — NOT on the channel we asked for,
     since the server (not the client) decides how a given run can actually
     absorb a mid-run message. `channel: "queue"` (explicit /queue) is the
     one case that never touches the server: it is purely a local buffer. */
  const dispatchInterjectChannel = useCallback(
    (targetChatId, body, channel, options = {}) => {
      /* Carried from the secret gate through every queue fallback below, so a
         plain-text approval survives the auto-routing detour and the item is
         still relayable later without re-prompting. */
      const secretDisposition =
        options?.secretDisposition === PLAIN_USER_APPROVED_DISPOSITION
          ? PLAIN_USER_APPROVED_DISPOSITION
          : "";
      if (channel === "queue") {
        return pushQueuedTurn(targetChatId, body, secretDisposition);
      }

      const runGeneration = getRunGeneration(targetChatId);
      const threadId =
        activeRunThreadIdByChatIdRef.current.get(targetChatId) || targetChatId;
      const isGenerationCurrent = () =>
        isRunGenerationCurrent(targetChatId, runGeneration);
      if (!isGenerationCurrent()) {
        return false;
      }

      const executionAttemptId =
        executionIdentityByChatIdRef.current.get(targetChatId)?.attemptId ||
        "";
      const sourceClientOperationId =
        runClientOperationIdByChatIdRef.current.get(targetChatId) || "";
      const sourceAttemptId =
        executionAttemptId || sourceClientOperationId;
      const suppliedPendingFyiIntent =
        options?.pendingFyiIntent &&
        typeof options.pendingFyiIntent === "object"
          ? options.pendingFyiIntent
          : null;
      const usesSuppliedPendingFyiIntent = Boolean(suppliedPendingFyiIntent);
      const isCurrentDispatch = () => {
        if (!isGenerationCurrent()) return false;
        if (!sourceAttemptId) return true;
        if (
          sourceClientOperationId &&
          runClientOperationIdByChatIdRef.current.get(targetChatId) !==
            sourceClientOperationId
        ) {
          return false;
        }
        if (executionAttemptId) {
          return (
            executionIdentityByChatIdRef.current.get(targetChatId)
              ?.attemptId === executionAttemptId
          );
        }
        return true;
      };
      const needsDurableFyiIntent =
        channel === "fyi" || channel === "auto" || usesSuppliedPendingFyiIntent;
      const messageId = usesSuppliedPendingFyiIntent
        ? suppliedPendingFyiIntent.messageId
        : needsDurableFyiIntent
          ? createPendingFyiMessageId()
          : "";
      if (needsDurableFyiIntent && !sourceAttemptId) {
        const message =
          "Could not address this message to the active run. Your input was kept.";
        setStreamErrorForChat(targetChatId, message);
        toast.error(message, {
          dedupeKey: `interject-owner-unavailable-${targetChatId}`,
        });
        return usesSuppliedPendingFyiIntent
          ? Promise.resolve(false)
          : false;
      }
      if (needsDurableFyiIntent) {
        const saved = usesSuppliedPendingFyiIntent
          ? readPendingFyisForAttempt(targetChatId, sourceAttemptId).find(
              (entry) =>
                entry.chatId === targetChatId &&
                entry.attemptId === sourceAttemptId &&
                entry.messageId === suppliedPendingFyiIntent.messageId &&
                entry.requestedChannel === channel &&
                entry.threadId === threadId &&
                entry.text === body &&
                suppliedPendingFyiIntent.chatId === entry.chatId &&
                suppliedPendingFyiIntent.attemptId === entry.attemptId &&
                suppliedPendingFyiIntent.requestedChannel ===
                  entry.requestedChannel &&
                suppliedPendingFyiIntent.threadId === entry.threadId &&
                suppliedPendingFyiIntent.text === entry.text,
            ) || null
          : writePendingFyi({
              chatId: targetChatId,
              attemptId: sourceAttemptId,
              messageId,
              text: body,
              requestedChannel: channel,
              threadId,
              disposition: secretDisposition,
            });
        if (!saved) {
          const message =
            "Could not save this in-run message. Your input was kept.";
          setStreamErrorForChat(targetChatId, message);
          toast.error(message, {
            dedupeKey: `interject-persist-failed-${targetChatId}`,
          });
          return usesSuppliedPendingFyiIntent
            ? Promise.resolve(false)
            : false;
        }
        if (!executionAttemptId) {
          // Legacy V2 transports do not expose a server attempt id. Their
          // per-run client operation id is still an exact, durable owner and
          // is cleared/fallen back with this run only.
          queueAttemptIdByChatIdRef.current.set(
            targetChatId,
            sourceAttemptId,
          );
          queueClientOperationIdByChatIdRef.current.delete(targetChatId);
        }
        syncPendingFyiStateForAttempt(targetChatId, sourceAttemptId);
      }

      let clarifyBtwBarrier = null;
      if (usesSuppliedPendingFyiIntent && channel === "btw") {
        const clarifyId =
          typeof options?.clarifyId === "string" ? options.clarifyId.trim() : "";
        const clarifyRunGeneration = Number(options?.runGeneration);
        const existingBarrier =
          clarifyBtwBarrierByChatIdRef.current.get(targetChatId) || null;
        if (
          !clarifyId ||
          clarifyRunGeneration !== runGeneration ||
          existingBarrier
        ) {
          setStreamErrorForChat(
            targetChatId,
            "The side question could not be bound to its exact run. It remains saved for recovery.",
          );
          return Promise.resolve(false);
        }
        clarifyBtwBarrier = {
          key: [
            targetChatId,
            clarifyId,
            messageId,
            sourceAttemptId,
            runGeneration,
          ].join(":"),
          chatId: targetChatId,
          clarifyId,
          messageId,
          attemptId: sourceAttemptId,
          runGeneration,
          settled: false,
          terminal: null,
          timeoutId: null,
        };
        clarifyBtwBarrierByChatIdRef.current.set(
          targetChatId,
          clarifyBtwBarrier,
        );
      }

      const timeoutPromise = clarifyBtwBarrier
        ? new Promise((_, reject) => {
            clarifyBtwBarrier.timeoutId = setTimeout(() => {
              settleClarifyBtwBarrier(clarifyBtwBarrier, {
                disposition: "migrate",
              });
              reject(
                Object.assign(new Error("Side question timed out."), {
                  code: "interject_btw_timeout",
                }),
              );
            }, CLARIFY_BTW_SETTLEMENT_TIMEOUT_MS);
          })
        : null;
      let interjectRequest;
      try {
        interjectRequest = Promise.resolve(
          api.unchain.interject({
          threadId,
          text: body,
          channel,
          ...(messageId ? { messageId } : {}),
          }),
        );
      } catch (error) {
        interjectRequest = Promise.reject(error);
      }
      const dispatchPromise = (timeoutPromise
        ? Promise.race([interjectRequest, timeoutPromise])
        : interjectRequest)
        .then((result) => {
          if (!isCurrentDispatch()) {
            if (clarifyBtwBarrier) {
              settleClarifyBtwBarrier(clarifyBtwBarrier, {
                disposition: "migrate",
              });
            }
            return false;
          }
          const rawResolvedChannel =
            result && typeof result.resolved_channel === "string"
              ? result.resolved_channel
              : "new_run";
          // Legacy wire alias — pre-rename servers answer resolved_channel
          // steer for what is now the queue channel. Normalize at this
          // single read point so the rest of the client only speaks queue.
          const resolvedChannel =
            rawResolvedChannel === "steer" ? "queue" : rawResolvedChannel;
          const dispatchTime = Date.now();

          if (resolvedChannel === "fyi") {
            const acceptedMessageId =
              typeof result?.message_id === "string"
                ? result.message_id.trim()
                : "";
            if (
              needsDurableFyiIntent &&
              acceptedMessageId !== messageId
            ) {
              setStreamErrorForChat(
                targetChatId,
                "The runtime did not confirm the addressed FYI. It remains saved for recovery.",
              );
              return clarifyBtwBarrier
                ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                    disposition: "migrate",
                  })
                : true;
            }
            toast.success("Queued — will be injected next step", {
              dedupeKey: "interject-fyi-queued",
            });
            return clarifyBtwBarrier
              ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                  disposition: "preserve",
                  accepted: true,
                })
              : true;
          }

          if (resolvedChannel === "btw") {
            const answer =
              typeof result?.answer === "string" ? result.answer : "";
            const recorded = appendLocalBtwResultForOwner({
              targetChatId,
              attemptId: sourceAttemptId,
              executionAttemptId,
              messageId,
              question: body,
              answer,
              ts: dispatchTime,
            });
            if (!recorded) {
              setStreamErrorForChat(
                targetChatId,
                needsDurableFyiIntent
                  ? "The side answer arrived after its owner changed. The question remains queued."
                  : "The side answer arrived after its owner changed. Your input was kept.",
              );
              return clarifyBtwBarrier
                ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                    disposition: "migrate",
                  })
                : needsDurableFyiIntent;
            }
            if (needsDurableFyiIntent) {
              if (clarifyBtwBarrier) {
                if (!clarifyBtwBarrier.settled) {
                  return settleClarifyBtwBarrier(clarifyBtwBarrier, {
                    disposition: "resolve",
                    accepted: true,
                  });
                }
                // onError may already have migrated this exact intent to its
                // same-id fallback while the HTTP request was still in flight.
                // A later successful receipt wins over that fallback, but it
                // may update live refs only while the original owner remains
                // the exact current runtime owner.
                const lateResolved = resolvePendingFyiIntent({
                  chatId: targetChatId,
                  attemptId: sourceAttemptId,
                  messageId,
                });
                if (
                  lateResolved &&
                  isClarifyBtwBarrierCurrentOwner(clarifyBtwBarrier)
                ) {
                  syncDurableQueueForAttempt(
                    targetChatId,
                    sourceAttemptId,
                    lateResolved.queue || null,
                  );
                }
                return Boolean(lateResolved);
              }
              const resolved = resolvePendingFyiIntent({
                chatId: targetChatId,
                attemptId: sourceAttemptId,
                messageId,
              });
              if (resolved) {
                syncDurableQueueForAttempt(
                  targetChatId,
                  sourceAttemptId,
                  resolved.queue || null,
                );
              } else {
                syncPendingFyiStateForAttempt(
                  targetChatId,
                  sourceAttemptId,
                );
              }
              if (!resolved &&
                readPendingFyisForAttempt(
                  targetChatId,
                  sourceAttemptId,
                ).some((entry) => entry.messageId === messageId)
              ) {
                setStreamErrorForChat(
                  targetChatId,
                  "The side answer arrived, but its saved intent could not be finalized.",
                );
              }
            }
            return true;
          }

          if (resolvedChannel === "queue") {
            if (!needsDurableFyiIntent) {
              return pushQueuedTurn(targetChatId, body, secretDisposition);
            }
            const migrated = migratePendingFyiToQueue({
              chatId: targetChatId,
              attemptId: sourceAttemptId,
              messageId,
            });
            if (!migrated?.queue) {
              setStreamErrorForChat(
                targetChatId,
                "This message is still saved and will be recovered after the run settles.",
              );
              return clarifyBtwBarrier
                ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                    disposition: "migrate",
                  })
                : true;
            }
            syncDurableQueueForAttempt(
              targetChatId,
              sourceAttemptId,
              migrated.queue,
            );
            return clarifyBtwBarrier
              ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                  disposition: "queued",
                  accepted: true,
                })
              : true;
          }

          if (resolvedChannel === "clarify") {
            const ownerStillActive = Boolean(
              streamingChatIdsRef.current.has(targetChatId) &&
                streamHandlesRef.current.has(targetChatId),
            );
            if (needsDurableFyiIntent && !ownerStillActive) {
              const migrated = migratePendingFyiToQueue({
                chatId: targetChatId,
                attemptId: sourceAttemptId,
                messageId,
              });
              if (migrated?.queue) {
                syncDurableQueueForAttempt(
                  targetChatId,
                  sourceAttemptId,
                  migrated.queue,
                );
              }
              return clarifyBtwBarrier
                ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                    disposition: migrated?.queue ? "queued" : "migrate",
                    accepted: Boolean(migrated?.queue),
                  })
                : true;
            }
            const clarifyId = `clarify-${dispatchTime}-${Math.random()
              .toString(16)
              .slice(2)}`;
            const clientOperationId =
              runClientOperationIdByChatIdRef.current.get(targetChatId) || "";
            const durableClarify = needsDurableFyiIntent
              ? convertPendingFyiToClarify({
                  chatId: targetChatId,
                  attemptId: sourceAttemptId,
                  messageId,
                  clarifyId,
                })
              : writePendingClarify({
                  chatId: targetChatId,
                  ...(sourceAttemptId
                    ? { sourceAttemptId }
                    : { clientOperationId }),
                  id: clarifyId,
                  text: body,
                  disposition: secretDisposition,
                });
            if (!durableClarify) {
              if (needsDurableFyiIntent) {
                const migrated = migratePendingFyiToQueue({
                  chatId: targetChatId,
                  attemptId: sourceAttemptId,
                  messageId,
                });
                if (migrated?.queue) {
                  syncDurableQueueForAttempt(
                    targetChatId,
                    sourceAttemptId,
                    migrated.queue,
                  );
                  return clarifyBtwBarrier
                    ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                        disposition: "queued",
                        accepted: true,
                      })
                    : true;
                }
              }
              setStreamErrorForChat(
                targetChatId,
                "Could not save this clarification. Your input was kept.",
              );
              return false;
            }
            pendingClarifyByChatIdRef.current.set(
              targetChatId,
              durableClarify,
            );
            appendLocalTraceFrame(targetChatId, {
              seq: dispatchTime,
              ts: dispatchTime,
              type: "clarify_request",
              stage: "client",
              payload: {
                id: clarifyId,
                question: body,
                options: [
                  { label: "加进当前任务", value: "fyi" },
                  { label: "做完再研究", value: "queue" },
                  { label: "只是问一嘴", value: "btw" },
                ],
                status: "pending",
              },
            });
            return clarifyBtwBarrier
              ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                  disposition: "converted",
                  accepted: true,
                })
              : true;
          }

          // resolved_channel === "new_run": graph-recipe runs never register
          // an interject channel, so the server can (and will) report
          // new_run even while the stream is still active — that must be
          // treated as a queued turn, never a concurrent send. Only fall back
          // to an actual new send once the stream is genuinely no longer
          // active.
          const stillActive = Boolean(
            streamingChatIdsRef.current.has(targetChatId) &&
              streamHandlesRef.current.has(targetChatId),
          );
          if (needsDurableFyiIntent) {
            const migrated = migratePendingFyiToQueue({
              chatId: targetChatId,
              attemptId: sourceAttemptId,
              messageId,
            });
            if (!migrated?.queue) {
              setStreamErrorForChat(
                targetChatId,
                "This message is still saved and will be recovered after the run settles.",
              );
              return clarifyBtwBarrier
                ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                    disposition: "migrate",
                  })
                : true;
            }
            syncDurableQueueForAttempt(
              targetChatId,
              sourceAttemptId,
              migrated.queue,
            );
            if (!stillActive && !clarifyBtwBarrier) {
              relayQueuedTurnsAfterRunRef.current?.({
                targetChatId,
                nextStreamMessages:
                  activeStreamsRef.current.get(targetChatId)?.messages ||
                  storageApi.getChatMessages?.(targetChatId) ||
                  [],
                characterAgentConfig: null,
                runContext:
                  runContextByChatIdRef.current.get(targetChatId) || null,
              });
            }
            return clarifyBtwBarrier
              ? settleClarifyBtwBarrier(clarifyBtwBarrier, {
                  disposition: "queued",
                  accepted: true,
                })
              : true;
          }
          if (stillActive) {
            return pushQueuedTurn(targetChatId, body, secretDisposition);
          }

          if (targetChatId === activeChatIdRef.current) {
            sendNewTurn({
              text: body,
              chatId: targetChatId,
              bypassInterject: true,
              secretDisposition,
            });
            return true;
          }
          return pushQueuedTurn(targetChatId, body, secretDisposition);
        })
        .catch((error) => {
          if (clarifyBtwBarrier && !clarifyBtwBarrier.settled) {
            settleClarifyBtwBarrier(clarifyBtwBarrier, {
              disposition: "migrate",
            });
          }
          if (!isCurrentDispatch()) {
            return false;
          }
          setStreamErrorForChat(
            targetChatId,
            error?.message || "Failed to send interjection.",
          );
          return false;
        });

      if (needsDurableFyiIntent && !usesSuppliedPendingFyiIntent) {
        void dispatchPromise;
        return true;
      }
      return dispatchPromise;
    },
    [
      activeChatIdRef,
      activeStreamsRef,
      appendLocalBtwResultForOwner,
      appendLocalTraceFrame,
      getRunGeneration,
      isClarifyBtwBarrierCurrentOwner,
      isRunGenerationCurrent,
      pushQueuedTurn,
      sendNewTurn,
      settleClarifyBtwBarrier,
      setStreamErrorForChat,
      storageApi,
      streamHandlesRef,
      streamingChatIdsRef,
      syncDurableQueueForAttempt,
      syncPendingFyiStateForAttempt,
    ],
  );

  const handleInterject = useCallback(
    (targetChatId, rawText, options = {}) => {
      // Inline command tokens can sit anywhere in the text now. extractCommands
      // pulls the ACTIVE tokens (exclusive-group rule: first per group wins)
      // out of the text; the interject-channel command decides the channel and
      // the stripped remainder is the body. No command -> auto routing.
      const { commands, body } = extractCommands(rawText ?? "", {
        isStreaming: true,
      });
      // The registry's `channel` field is the routing contract — command
      // NAMES are presentation and may be renamed freely.
      const channelCommand = commands.find((command) =>
        Boolean(command?.channel),
      );
      const channel = channelCommand ? channelCommand.channel : "auto";
      const trimmedBody = (body || "").trim();
      if (!trimmedBody) return false;
      return dispatchInterjectChannel(targetChatId, trimmedBody, channel, {
        secretDisposition:
          options?.secretDisposition === PLAIN_USER_APPROVED_DISPOSITION
            ? PLAIN_USER_APPROVED_DISPOSITION
            : "",
      });
    },
    [dispatchInterjectChannel],
  );
  handleInterjectRef.current = handleInterject;

  const onQueueUndo = useCallback(
    (id) => {
      const targetChatId = activeChatIdRef.current;
      const queuedTurns = queuedTurnsByChatIdRef.current.get(targetChatId);
      if (!queuedTurns) {
        return;
      }
      const previousItems = queuedTurns.snapshot();
      queuedTurns.remove(id);
      if (!persistQueuedTurnBufferForAttempt(targetChatId, queuedTurns)) {
        queuedTurns.hydrate(previousItems);
        setStreamErrorForChat(
          targetChatId,
          "Could not update the queued messages. Nothing was removed.",
        );
        return;
      }
      syncInterjectStateForChat(targetChatId);
    },
    [
      activeChatIdRef,
      persistQueuedTurnBufferForAttempt,
      setStreamErrorForChat,
      syncInterjectStateForChat,
    ],
  );

  /* onClarifyResolve(value) resolves the active chat's pending clarify, or
     onClarifyResolve(chatId, value) targets a specific chat explicitly. */
  const onClarifyResolve = useCallback(
    (chatIdOrValue, maybeValue) => {
      const hasExplicitChatId = typeof maybeValue !== "undefined";
      const targetChatId = hasExplicitChatId
        ? chatIdOrValue
        : activeChatIdRef.current;
      const value = hasExplicitChatId ? maybeValue : chatIdOrValue;

      const pending =
        pendingClarifyByChatIdRef.current.get(targetChatId) ||
        readPendingClarifyForChat(targetChatId);
      if (!pending) {
        return false;
      }
      if (value === "queue") {
        const fallback = fallbackPendingClarifyForChat(targetChatId, pending);
        if (!fallback) return false;
        updateLocalClarifyFrame(targetChatId, pending.id, {
          status: "resolved",
        });
        return true;
      }
      if (value !== "fyi" && value !== "btw") return false;

      const sourceAttemptId =
        pending.sourceAttemptId || pending.clientOperationId || "";
      const threadId =
        activeRunThreadIdByChatIdRef.current.get(targetChatId) || targetChatId;
      const runGeneration = getRunGeneration(targetChatId);
      const messageId = createPendingFyiMessageId();
      const pendingFyiIntent = transitionPendingClarifyToPendingFyi({
        chatId: targetChatId,
        clarifyId: pending.id,
        attemptId: sourceAttemptId,
        messageId,
        requestedChannel: value,
        threadId,
      });
      if (!pendingFyiIntent) {
        setStreamErrorForChat(
          targetChatId,
          "Could not save this clarification choice. Please try again.",
        );
        return false;
      }

      // The durable outbox now contains the FYI/BTW intent and no clarify.
      // Only after that atomic transition may the UI stop presenting the
      // clarify frame or any network request begin.
      pendingClarifyByChatIdRef.current.delete(targetChatId);
      syncPendingFyiStateForAttempt(targetChatId, sourceAttemptId);
      updateLocalClarifyFrame(targetChatId, pending.id, {
        status: "resolved",
      });
      return dispatchInterjectChannel(
        targetChatId,
        pendingFyiIntent.text,
        value,
        {
          pendingFyiIntent,
          clarifyId: pending.id,
          runGeneration,
          /* This text was already gated when the user first sent it; the
             clarify entry carries the approval forward so a queue fallback
             here does not lose it and get purged as "ungated" later. */
          secretDisposition: pending.disposition || "",
        },
      );
    },
    [
      activeChatIdRef,
      dispatchInterjectChannel,
      fallbackPendingClarifyForChat,
      getRunGeneration,
      setStreamErrorForChat,
      syncPendingFyiStateForAttempt,
      updateLocalClarifyFrame,
    ],
  );

  const interjectState = interjectStateByChatId[chatId] || {
    pendingFyiCount: 0,
    queueItems: [],
  };

  const setTurnMutationPresentation = useCallback((messageId, phase) => {
    const normalizedMessageId =
      typeof messageId === "string" ? messageId.trim() : "";
    if (!normalizedMessageId) return;
    setTurnMutationPresentationByMessageId((previous) => ({
      ...previous,
      [normalizedMessageId]: { phase },
    }));
  }, []);

  const clearTurnMutationPresentation = useCallback((messageId) => {
    const normalizedMessageId =
      typeof messageId === "string" ? messageId.trim() : "";
    if (!normalizedMessageId) return;
    setTurnMutationPresentationByMessageId((previous) => {
      if (!previous[normalizedMessageId]) return previous;
      const next = { ...previous };
      delete next[normalizedMessageId];
      return next;
    });
  }, []);

  const resendTurn = useCallback(
    async (message) => {
      const currentChatId = activeChatIdRef.current;
      const originalMessages = Array.isArray(messagesRef.current)
        ? [...messagesRef.current]
        : [];
      const messageIndex = originalMessages
        ? originalMessages.findIndex((item) => item?.id === message?.id)
        : -1;
      const targetMessage =
        messageIndex >= 0 && messageIndex < originalMessages.length
          ? originalMessages[messageIndex]
          : null;
      const text =
        typeof targetMessage?.content === "string"
          ? targetMessage.content.trim()
          : "";
      const thisChatsStreamActive = isChatRunPending(currentChatId);
      const durableMutationBlocked = Boolean(
        durableInteractionByChatIdRef.current[currentChatId]?.status,
      );
      if (
        !currentChatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        thisChatsStreamActive ||
        durableMutationBlocked
      ) {
        return;
      }

      /* Presentation is intentionally independent from the rebase round trip.
         Canonical history remains unchanged until the durable acknowledgement
         arrives, but the click must be visible in this same renderer turn. */
      setTurnMutationPresentation(targetMessage.id, "Preparing resend…");
      let retainPresentation = false;

      /* ── Memory V2 P0 secret gate ──────────────────────────────────────────
         A resend replays a stored message, which for anything sent after this
         gate shipped is already handle-only and scans clean. A message stored
         BEFORE the gate existed can still hold plaintext, and resending it
         would re-send that plaintext — so the gate runs here too, ahead of
         claimTurnMutation / enqueueTurnMutation / runTurnRequest. */
      const gatedResend = await resolveSecretGateForSend({
        chatId: currentChatId,
        text,
        interactive: true,
      });
      if (!gatedResend) {
        clearTurnMutationPresentation(targetMessage.id);
        return;
      }
      /* The chat or its run state may have moved while the modal was open. */
      if (
        activeChatIdRef.current !== currentChatId ||
        isChatRunPending(currentChatId) !== thisChatsStreamActive
      ) {
        clearTurnMutationPresentation(targetMessage.id);
        return;
      }
      const resendText = gatedResend.text;
      const resendSecretToken = gatedResend.token || "";
      const resendSecretGateSettled = Boolean(resendSecretToken);
      if (
        resendSecretGateSettled &&
        !consumeSecretGateToken(resendSecretToken, {
          chatId: currentChatId,
          text: resendText,
        })
      ) {
        setStreamErrorForChat(
          currentChatId,
          SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
        );
        clearTurnMutationPresentation(targetMessage.id);
        return;
      }

      const operationId = createTurnMutationOperationId(currentChatId);
      const turnMutationOwner = claimTurnMutation({
        chatId: currentChatId,
        operationId,
        mountedRef: hookMountedRef,
      });
      if (!turnMutationOwner) {
        clearTurnMutationPresentation(targetMessage.id);
        return;
      }
      const isCurrentTurnMutation = () => ownsTurnMutation(turnMutationOwner);

      try {
        if (!api.unchain.isBridgeAvailable()) {
          setStreamErrorForChat(
            currentChatId,
            "Unchain bridge is unavailable in this runtime.",
          );
          return;
        }

        const baseMessages = originalMessages.slice(0, messageIndex);
        const targetThreadId =
          typeof threadIdRef?.current === "string" ? threadIdRef.current : "";
        const capturedModelId =
          typeof modelIdRef?.current === "string" ? modelIdRef.current : "";
        const characterConfig = isCharacterChat
          ? await buildCharacterRunConfig(targetThreadId).catch((error) => {
              setStreamErrorForChat(
                currentChatId,
                error?.message || "Failed to prepare this character chat.",
              );
              return null;
            })
          : null;
        if (
          !isCurrentTurnMutation() ||
          (isCharacterChat && !characterConfig?.session_id)
        ) {
          return;
        }
        const targetSessionId = characterConfig?.session_id || currentChatId;
        const targetModelId =
          typeof characterConfig?.default_model === "string" &&
          characterConfig.default_model.trim()
            ? characterConfig.default_model.trim()
            : capturedModelId;
        const memoryPlan = await resolveTurnMutationMemoryPlan({
          ownerChatId: currentChatId,
          sessionId: targetSessionId,
        });
        if (!isCurrentTurnMutation()) return;
        if (memoryPlan.mode === TURN_MUTATION_ADMISSION.BLOCKED) {
          setStreamErrorForChat(
            currentChatId,
            contextV2TurnMutationMessage(memoryPlan.reason),
          );
          return;
        }
        const isV2Mutation = memoryPlan.mode === TURN_MUTATION_ADMISSION.V2;
        let expectedSessionRevision = null;
        let v2RebasePayload = null;
        if (isV2Mutation) {
          /* Frozen HERE, from this one head read, and never rebuilt again. */
          v2RebasePayload = buildContextV2RebasePayload({
            ownerChatId: currentChatId,
            sessionId: targetSessionId,
            replacementHistory: buildRebaseReplacementHistory(baseMessages),
            sourceGenerationId: memoryPlan.sourceGenerationId,
            expectedSessionRevision: memoryPlan.expectedSessionRevision,
            operationId,
            reason: "resend",
          });
          if (!v2RebasePayload) {
            setStreamErrorForChat(
              currentChatId,
              CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
            );
            return;
          }
        } else {
          try {
            expectedSessionRevision = await readMemorySessionRevision(
              targetSessionId,
              { forceMemoryEnabled: isCharacterChat },
            );
          } catch (error) {
            setStreamErrorForChat(currentChatId, error?.message);
            return;
          }
          if (!isCurrentTurnMutation()) return;
        }
        const outboxEntry = enqueueTurnMutation({
          operationId,
          chatId: currentChatId,
          sessionId: targetSessionId,
          kind: "resend",
          memoryMode: isV2Mutation
            ? TURN_MUTATION_MEMORY_MODES.V2
            : TURN_MUTATION_MEMORY_MODES.LEGACY,
          ...(v2RebasePayload
            ? {
                v2RebasePayload,
                /* Frozen from the SAME single head read as the payload. It
                   decides whether the authoritative V1 leg exists at all, so
                   recovery must replay it rather than re-decide it. */
                admissionMode: memoryPlan.admissionMode,
                ...(memoryPlan.admissionMode ===
                TURN_MUTATION_ADMISSION_MODES.SHADOW
                  ? { v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING }
                  : {}),
              }
            : {}),
          targetMessageId: targetMessage.id,
          originalFingerprint:
            fingerprintTurnMutationMessages(originalMessages),
          baseFingerprint: fingerprintTurnMutationMessages(baseMessages),
          baseMessageCount: baseMessages.length,
          text: resendText,
          modelId: targetModelId,
          threadId: targetThreadId,
          memoryNamespace: characterConfig?.run_memory_namespace || "",
          forceMemoryEnabled: isCharacterChat,
          expectedSessionRevision,
        });
        if (!outboxEntry) {
          setStreamErrorForChat(
            currentChatId,
            "Unable to safely persist this resend. Please try again.",
          );
          return;
        }
        /* Server ack strictly before any optimistic message or local persist:
           runTurnRequest below is what writes the optimistic user message. */
        const memoryResult = await applyTurnMutationMemory(outboxEntry, {
          replacementMessages: baseMessages,
          targetChatId: currentChatId,
        });
        if (!memoryResult.applied) {
          if (memoryResult.retryAction === TURN_MUTATION_RETRY_ACTIONS.IN_PROGRESS) {
            retainPresentation = true;
            setTurnMutationPresentation(
              targetMessage.id,
              "Waiting for the previous run to finish…",
            );
          }
          if (
            outboxEntry.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2 &&
            isTerminalTurnMutationResult(memoryResult) &&
            fingerprintTurnMutationMessages(
              storageApi.getChatMessages?.(currentChatId) || [],
            ) === outboxEntry.originalFingerprint
          ) {
            removeTurnMutation(operationId);
          }
          return;
        }
        if (!isCurrentTurnMutation() || !hookMountedRef.current) return;
        const sourceAttachments = Array.isArray(targetMessage.attachments)
          ? targetMessage.attachments
          : [];
        const resendAttachments =
          sourceAttachments.length > 0 && !attachmentsEnabled
            ? []
            : sourceAttachments;
        if (sourceAttachments.length > 0 && !attachmentsEnabled) {
          setStreamErrorForChat(
            currentChatId,
            "Current model does not support image/file input. Resending text only.",
          );
        }

        await runTurnRequest({
          mode: "resend",
          chatId: currentChatId,
          text: resendText,
          secretGateText: resendText,
          secretGateSettled: resendSecretGateSettled,
          attachments: resendAttachments,
          baseMessages,
          clearComposer: false,
          reuseUserMessage: targetMessage,
          missingAttachmentPayloadMode: "degrade",
          characterAgentConfig: characterConfig,
          runContext: { modelId: targetModelId, threadId: targetThreadId },
          turnMutationOperationId: operationId,
        });
      } finally {
        releaseTurnMutation(turnMutationOwner);
        if (!retainPresentation) {
          clearTurnMutationPresentation(targetMessage.id);
        }
      }
    },
    [
      activeChatIdRef,
      attachmentsEnabled,
      buildCharacterRunConfig,
      consumeSecretGateToken,
      isChatRunPending,
      isCharacterChat,
      messagesRef,
      modelIdRef,
      applyTurnMutationMemory,
      readMemorySessionRevision,
      resolveTurnMutationMemoryPlan,
      resolveSecretGateForSend,
      runTurnRequest,
      clearTurnMutationPresentation,
      setStreamErrorForChat,
      setTurnMutationPresentation,
      storageApi,
      threadIdRef,
    ],
  );

  const editTurn = useCallback(
    async (message, nextContent) => {
      const currentChatId = activeChatIdRef.current;
      const originalMessages = Array.isArray(messagesRef.current)
        ? [...messagesRef.current]
        : [];
      const messageIndex = originalMessages.findIndex(
        (item) => item?.id === message?.id,
      );
      const targetMessage =
        messageIndex >= 0 && messageIndex < originalMessages.length
          ? originalMessages[messageIndex]
          : null;
      const text = typeof nextContent === "string" ? nextContent.trim() : "";
      const thisChatsStreamActive = isChatRunPending(currentChatId);
      const durableMutationBlocked = Boolean(
        durableInteractionByChatIdRef.current[currentChatId]?.status,
      );
      if (
        !currentChatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        thisChatsStreamActive ||
        durableMutationBlocked
      ) {
        return;
      }

      /* ── Memory V2 P0 secret gate ──────────────────────────────────────────
         An edit is brand-new user text, so it is gated exactly like a compose
         send — and gated HERE, ahead of claimTurnMutation, the session-head
         read, enqueueTurnMutation, applyTurnMutationMemory and runTurnRequest,
         so no turn-mutation outbox row, no memory rewrite (V1 or V2 rebase)
         and no optimistic message can exist before the user has decided. */
      const gatedEdit = await resolveSecretGateForSend({
        chatId: currentChatId,
        text,
        interactive: true,
      });
      if (!gatedEdit) return;
      /* The chat or its run state may have moved while the modal was open. */
      if (
        activeChatIdRef.current !== currentChatId ||
        isChatRunPending(currentChatId) !== thisChatsStreamActive
      ) {
        return;
      }
      const editText = gatedEdit.text;
      const editSecretToken = gatedEdit.token || "";
      const editSecretGateSettled = Boolean(editSecretToken);
      if (
        editSecretGateSettled &&
        !consumeSecretGateToken(editSecretToken, {
          chatId: currentChatId,
          text: editText,
        })
      ) {
        setStreamErrorForChat(
          currentChatId,
          SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
        );
        return;
      }

      const operationId = createTurnMutationOperationId(currentChatId);
      const turnMutationOwner = claimTurnMutation({
        chatId: currentChatId,
        operationId,
        mountedRef: hookMountedRef,
      });
      if (!turnMutationOwner) return;
      const isCurrentTurnMutation = () => ownsTurnMutation(turnMutationOwner);

      try {
        if (!api.unchain.isBridgeAvailable()) {
          setStreamErrorForChat(
            currentChatId,
            "Unchain bridge is unavailable in this runtime.",
          );
          return;
        }

        const baseMessages = originalMessages.slice(0, messageIndex);
        const targetThreadId =
          typeof threadIdRef?.current === "string" ? threadIdRef.current : "";
        const capturedModelId =
          typeof modelIdRef?.current === "string" ? modelIdRef.current : "";
        const targetSelectedToolkits = Array.isArray(selectedToolkitsRef.current)
          ? [...selectedToolkitsRef.current]
          : [];
        const characterConfig = isCharacterChat
          ? await buildCharacterRunConfig(targetThreadId).catch((error) => {
              setStreamErrorForChat(
                currentChatId,
                error?.message || "Failed to prepare this character chat.",
              );
              return null;
            })
          : null;
        if (
          !isCurrentTurnMutation() ||
          (isCharacterChat && !characterConfig?.session_id)
        ) {
          return;
        }
        const sourceAttachments = Array.isArray(targetMessage.attachments)
          ? targetMessage.attachments
          : [];
        const originalAttachments =
          sourceAttachments.length > 0 && !attachmentsEnabled
            ? []
            : sourceAttachments;
        if (sourceAttachments.length > 0 && !attachmentsEnabled) {
          setStreamErrorForChat(
            currentChatId,
            "Current model does not support image/file input. Sending text only.",
          );
        }

        // The expanded edit and its sidecar are persisted in the outbox so a
        // remount resumes the exact same operation, not a newly-resolved one.
        const built = buildComposerSend(editText, targetSelectedToolkits);
        if (!built.outgoingText && originalAttachments.length === 0) {
          setStreamErrorForChat(
            currentChatId,
            "This edit does not contain any text or usable attachments.",
          );
          return;
        }
        const targetSessionId = characterConfig?.session_id || currentChatId;
        const targetModelId =
          typeof characterConfig?.default_model === "string" &&
          characterConfig.default_model.trim()
            ? characterConfig.default_model.trim()
            : capturedModelId;
        const memoryPlan = await resolveTurnMutationMemoryPlan({
          ownerChatId: currentChatId,
          sessionId: targetSessionId,
        });
        if (!isCurrentTurnMutation()) return;
        if (memoryPlan.mode === TURN_MUTATION_ADMISSION.BLOCKED) {
          setStreamErrorForChat(
            currentChatId,
            contextV2TurnMutationMessage(memoryPlan.reason),
          );
          return;
        }
        const isV2Mutation = memoryPlan.mode === TURN_MUTATION_ADMISSION.V2;
        let expectedSessionRevision = null;
        let v2RebasePayload = null;
        if (isV2Mutation) {
          /* Frozen HERE, from this one head read, and never rebuilt again. */
          v2RebasePayload = buildContextV2RebasePayload({
            ownerChatId: currentChatId,
            sessionId: targetSessionId,
            replacementHistory: buildRebaseReplacementHistory(baseMessages),
            sourceGenerationId: memoryPlan.sourceGenerationId,
            expectedSessionRevision: memoryPlan.expectedSessionRevision,
            operationId,
            reason: "edit",
          });
          if (!v2RebasePayload) {
            setStreamErrorForChat(
              currentChatId,
              CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
            );
            return;
          }
        } else {
          try {
            expectedSessionRevision = await readMemorySessionRevision(
              targetSessionId,
              { forceMemoryEnabled: isCharacterChat },
            );
          } catch (error) {
            setStreamErrorForChat(currentChatId, error?.message);
            return;
          }
          if (!isCurrentTurnMutation()) return;
        }
        const outboxEntry = enqueueTurnMutation({
          operationId,
          chatId: currentChatId,
          sessionId: targetSessionId,
          kind: "edit",
          memoryMode: isV2Mutation
            ? TURN_MUTATION_MEMORY_MODES.V2
            : TURN_MUTATION_MEMORY_MODES.LEGACY,
          ...(v2RebasePayload
            ? {
                v2RebasePayload,
                /* Frozen from the SAME single head read as the payload. It
                   decides whether the authoritative V1 leg exists at all, so
                   recovery must replay it rather than re-decide it. */
                admissionMode: memoryPlan.admissionMode,
                ...(memoryPlan.admissionMode ===
                TURN_MUTATION_ADMISSION_MODES.SHADOW
                  ? { v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING }
                  : {}),
              }
            : {}),
          targetMessageId: targetMessage.id,
          originalFingerprint:
            fingerprintTurnMutationMessages(originalMessages),
          baseFingerprint: fingerprintTurnMutationMessages(baseMessages),
          baseMessageCount: baseMessages.length,
          text: built.outgoingText,
          extraToolkits: built.extraToolkits,
          composer: built.composer,
          modelId: targetModelId,
          threadId: targetThreadId,
          memoryNamespace: characterConfig?.run_memory_namespace || "",
          forceMemoryEnabled: isCharacterChat,
          expectedSessionRevision,
        });
        if (!outboxEntry) {
          setStreamErrorForChat(
            currentChatId,
            "Unable to safely persist this edit. Please try again.",
          );
          return;
        }
        /* Server ack strictly before any optimistic message or local persist:
           runTurnRequest below is what writes the optimistic user message. */
        const memoryResult = await applyTurnMutationMemory(outboxEntry, {
          replacementMessages: baseMessages,
          targetChatId: currentChatId,
        });
        if (!memoryResult.applied) {
          if (
            outboxEntry.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2 &&
            isTerminalTurnMutationResult(memoryResult) &&
            fingerprintTurnMutationMessages(
              storageApi.getChatMessages?.(currentChatId) || [],
            ) === outboxEntry.originalFingerprint
          ) {
            removeTurnMutation(operationId);
          }
          return;
        }
        if (!isCurrentTurnMutation() || !hookMountedRef.current) return;

        await runTurnRequest({
          mode: "edit",
          chatId: currentChatId,
          text: built.outgoingText,
          secretGateText: editText,
          secretGateSettled: editSecretGateSettled,
          attachments: originalAttachments,
          baseMessages,
          clearComposer: false,
          reuseUserMessage: targetMessage,
          missingAttachmentPayloadMode: "degrade",
          extraToolkits: built.extraToolkits,
          characterAgentConfig: characterConfig,
          composer: built.composer,
          runContext: { modelId: targetModelId, threadId: targetThreadId },
          turnMutationOperationId: operationId,
        });
      } finally {
        releaseTurnMutation(turnMutationOwner);
      }
    },
    [
      activeChatIdRef,
      attachmentsEnabled,
      buildCharacterRunConfig,
      consumeSecretGateToken,
      isChatRunPending,
      isCharacterChat,
      messagesRef,
      modelIdRef,
      applyTurnMutationMemory,
      readMemorySessionRevision,
      resolveTurnMutationMemoryPlan,
      resolveSecretGateForSend,
      runTurnRequest,
      setStreamErrorForChat,
      storageApi,
      threadIdRef,
    ],
  );

  const deleteTurn = useCallback(
    async (message) => {
      if (!message || typeof message.id !== "string" || !message.id) {
        return;
      }

      const currentChatId = activeChatIdRef.current;
      if (!currentChatId) {
        return;
      }

      if (durableInteractionByChatIdRef.current[currentChatId]?.status) {
        return;
      }

      const originalMessages = Array.isArray(messagesRef.current)
        ? [...messagesRef.current]
        : [];

      const turnMessageIds = collectTurnMessageIds(
        originalMessages,
        message.id,
      );
      if (turnMessageIds.size === 0) {
        return;
      }

      const deletingStreamingAssistant =
        message.role === "assistant" && message.status === "streaming";
      const hasTurnMutation =
        turnMutationByChatIdRef.current.has(currentChatId);
      const hasRunPreflight =
        runPreflightGenerationByChatIdRef.current.has(currentChatId);
      const hasStreamingRun =
        streamingChatIdsRef.current.has(currentChatId);
      if (
        hasTurnMutation ||
        hasRunPreflight ||
        (hasStreamingRun && !deletingStreamingAssistant)
      ) {
        return;
      }
      let workingMessages = Array.isArray(messagesRef.current)
        ? originalMessages
        : [];

      const activeExecutionIdentity =
        executionIdentityByChatIdRef.current.get(currentChatId) || null;
      const expectedCancelAttemptId =
        deletingStreamingAssistant && hasStreamingRun
          ? activeExecutionIdentity?.attemptId || ""
          : "";

      if (deletingStreamingAssistant && hasStreamingRun) {
        workingMessages = cancelCurrentStreamAndSettleMessages();
      }

      const nextMessages = workingMessages.filter(
        (item) => !turnMessageIds.has(item?.id),
      );
      const operationId = createTurnMutationOperationId(currentChatId);
      const turnMutationOwner = claimTurnMutation({
        chatId: currentChatId,
        operationId,
        mountedRef: hookMountedRef,
      });
      if (!turnMutationOwner) return;
      const isCurrentTurnMutation = () => ownsTurnMutation(turnMutationOwner);
      try {
        const targetThreadId =
          typeof threadIdRef?.current === "string" ? threadIdRef.current : "";
        const capturedModelId =
          typeof modelIdRef?.current === "string" ? modelIdRef.current : "";
        const characterConfig = isCharacterChat
          ? await buildCharacterRunConfig(targetThreadId).catch((error) => {
              setStreamErrorForChat(
                currentChatId,
                error?.message || "Failed to prepare this character chat.",
              );
              return null;
            })
          : null;
        if (
          !isCurrentTurnMutation() ||
          (isCharacterChat && !characterConfig?.session_id)
        ) {
          return;
        }
        const targetSessionId = characterConfig?.session_id || currentChatId;
        const targetModelId =
          typeof characterConfig?.default_model === "string" &&
          characterConfig.default_model.trim()
            ? characterConfig.default_model.trim()
            : capturedModelId;
        /* The cancel/fence above has already run, so this head read observes
           the post-cancel state. If the sidecar still reports the generation's
           attempt as open, rebaseSession answers
           context_v2_rebase_in_progress — a RETRYABLE code, so the frozen
           intent stays in the durable outbox and recovery replays it. We never
           fabricate a cancel ack and never fall back to V1 to get around it. */
        const memoryPlan = await resolveTurnMutationMemoryPlan({
          ownerChatId: currentChatId,
          sessionId: targetSessionId,
        });
        if (!isCurrentTurnMutation()) return;
        if (memoryPlan.mode === TURN_MUTATION_ADMISSION.BLOCKED) {
          setStreamErrorForChat(
            currentChatId,
            contextV2TurnMutationMessage(memoryPlan.reason),
          );
          return;
        }
        const isV2Mutation = memoryPlan.mode === TURN_MUTATION_ADMISSION.V2;
        let expectedSessionRevision = null;
        let v2RebasePayload = null;
        if (isV2Mutation) {
          /* Frozen HERE, from this one head read, and never rebuilt again. */
          v2RebasePayload = buildContextV2RebasePayload({
            ownerChatId: currentChatId,
            sessionId: targetSessionId,
            replacementHistory: buildRebaseReplacementHistory(nextMessages),
            sourceGenerationId: memoryPlan.sourceGenerationId,
            expectedSessionRevision: memoryPlan.expectedSessionRevision,
            operationId,
            reason: "delete",
          });
          if (!v2RebasePayload) {
            setStreamErrorForChat(
              currentChatId,
              CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
            );
            return;
          }
        } else {
          try {
            expectedSessionRevision = await readMemorySessionRevision(
              targetSessionId,
              { forceMemoryEnabled: isCharacterChat },
            );
          } catch (error) {
            setStreamErrorForChat(currentChatId, error?.message);
            return;
          }
          if (!isCurrentTurnMutation()) return;
        }
        const outboxEntry = enqueueTurnMutation({
          operationId,
          chatId: currentChatId,
          sessionId: targetSessionId,
          kind: "delete",
          memoryMode: isV2Mutation
            ? TURN_MUTATION_MEMORY_MODES.V2
            : TURN_MUTATION_MEMORY_MODES.LEGACY,
          ...(v2RebasePayload
            ? {
                v2RebasePayload,
                /* Frozen from the SAME single head read as the payload. It
                   decides whether the authoritative V1 leg exists at all, so
                   recovery must replay it rather than re-decide it. */
                admissionMode: memoryPlan.admissionMode,
                ...(memoryPlan.admissionMode ===
                TURN_MUTATION_ADMISSION_MODES.SHADOW
                  ? { v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING }
                  : {}),
              }
            : {}),
          targetMessageId: message.id,
          originalFingerprint:
            fingerprintTurnMutationMessages(workingMessages),
          baseFingerprint: fingerprintTurnMutationMessages([]),
          resultFingerprint: fingerprintTurnMutationMessages(nextMessages),
          baseMessageCount: 0,
          text: "",
          modelId: targetModelId,
          threadId: targetThreadId,
          memoryNamespace: characterConfig?.run_memory_namespace || "",
          forceMemoryEnabled: isCharacterChat,
          expectedCancelAttemptId,
          expectedSessionRevision,
        });
        if (!outboxEntry) {
          setStreamErrorForChat(
            currentChatId,
            "Unable to safely persist this delete. Please try again.",
          );
          return;
        }
        /* Server ack strictly before the local commit below. */
        const memoryResult = await applyTurnMutationMemory(outboxEntry, {
          replacementMessages: nextMessages,
          targetChatId: currentChatId,
        });
        if (!memoryResult.applied) {
          if (
            outboxEntry.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2 &&
            isTerminalTurnMutationResult(memoryResult) &&
            fingerprintTurnMutationMessages(
              storageApi.getChatMessages?.(currentChatId) || [],
            ) === outboxEntry.originalFingerprint
          ) {
            removeTurnMutation(operationId);
          }
          return;
        }
        if (!isCurrentTurnMutation() || !hookMountedRef.current) return;

        commitForegroundMessages(currentChatId, nextMessages);
        storageApi.setChatMessages(currentChatId, nextMessages, {
          source: "chat-page",
        });
        removeTurnMutation(operationId);
      } finally {
        releaseTurnMutation(turnMutationOwner);
      }
    },
    [
      activeChatIdRef,
      buildCharacterRunConfig,
      cancelCurrentStreamAndSettleMessages,
      commitForegroundMessages,
      isCharacterChat,
      messagesRef,
      modelIdRef,
      applyTurnMutationMemory,
      readMemorySessionRevision,
      resolveTurnMutationMemoryPlan,
      setStreamErrorForChat,
      storageApi,
      threadIdRef,
    ],
  );

  useEffect(() => {
    const targetChatId =
      typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
    if (!targetChatId || !hookMountedRef.current) return undefined;

    const recoveryOutboxSnapshot = readTurnMutationOutboxState();
    if (!recoveryOutboxSnapshot.available) {
      setStreamErrorForChat(
        targetChatId,
        CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
      );
      return undefined;
    }
    const entry = recoveryOutboxSnapshot.entries.find(
      (item) => item.chatId === targetChatId,
    );
    if (!entry) return undefined;
    const activeRetryOwner = turnMutationByChatIdRef.current.get(targetChatId);
    const hasActiveRetryAttempt = Boolean(
      activeRetryOwner?.operationId === entry.operationId &&
        activeRetryOwner.mountedRef?.current !== false &&
        (activeRetryOwner.recovery !== true ||
          activeRetryOwner.recoveryRunToken),
    );

    if (
      entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.QUARANTINED
    ) {
      return undefined;
    }
    if (
      entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.IN_PROGRESS &&
      turnMutationInProgressSeenRef.current.has(entry.operationId)
    ) {
      return undefined;
    }
    if (
      entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.ATTEMPTING &&
      entry.retryAt === 0 &&
      !hasActiveRetryAttempt
    ) {
      /* ATTEMPTING+0 is a persist-before-schedule fence, not runnable work.
         It means the renderer disappeared after the reservation or could not
         persist the outcome. Hold it for explicit user review; never infer a
         retry from the absence of a timestamp. One conversion attempt per
         mount also avoids a storage-failure render loop. */
      if (!turnMutationStalledAttemptSeenRef.current.has(entry.operationId)) {
        turnMutationStalledAttemptSeenRef.current.add(entry.operationId);
        const held = recordTurnMutationRetryOutcome(entry.operationId, {
          action: TURN_MUTATION_RETRY_ACTIONS.QUARANTINE,
          code: "context_v2_persist_failed",
        });
        setStreamErrorForChat(
          targetChatId,
          CONTEXT_V2_TURN_MUTATION_MESSAGES.PERSIST,
        );
        if (held) {
          setTurnMutationVersion((version) => version + 1);
        }
      }
      return undefined;
    }
    if (
      entry.memoryMode === TURN_MUTATION_MEMORY_MODES.V2 &&
      entry.replayAttempts >= TURN_MUTATION_MAX_REPLAY_ATTEMPTS &&
      !hasActiveRetryAttempt
    ) {
      recordTurnMutationRetryOutcome(entry.operationId, {
        action: TURN_MUTATION_RETRY_ACTIONS.QUARANTINE,
        code: entry.lastFailureCode || "context_v2_retry_exhausted",
      });
      setTurnMutationVersion((version) => version + 1);
      return undefined;
    }
    if (
      entry.memoryMode === TURN_MUTATION_MEMORY_MODES.V2 &&
      entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.WAITING &&
      entry.retryAt > Date.now()
    ) {
      const retryTimer = setTimeout(() => {
        if (hookMountedRef.current) {
          setTurnMutationVersion((version) => version + 1);
        }
      }, Math.max(0, entry.retryAt - Date.now()));
      return () => clearTimeout(retryTimer);
    }

    if (
      runPreflightGenerationByChatIdRef.current.has(targetChatId) ||
      streamingChatIdsRef.current.has(targetChatId) ||
      streamHandlesRef.current.has(targetChatId) ||
      activeStreamsRef.current.has(targetChatId)
    ) {
      return undefined;
    }

    let owner = turnMutationByChatIdRef.current.get(targetChatId) || null;
    if (
      owner &&
      owner.mountedRef?.current !== false &&
      owner.recovery !== true
    ) {
      /* The foreground handler owns this operation and may currently be
         awaiting the same idempotent memory request. Recovery must never run
         concurrently merely because that await caused a React render. */
      return undefined;
    }
    if (!owner || owner.mountedRef?.current === false) {
      owner = claimTurnMutation({
        chatId: targetChatId,
        operationId: entry.operationId,
        mountedRef: hookMountedRef,
        recovery: true,
      });
    }
    if (
      !owner ||
      owner.recovery !== true ||
      owner.operationId !== entry.operationId ||
      owner.mountedRef !== hookMountedRef
    ) {
      return undefined;
    }
    if (owner.recoveryRunToken) {
      return undefined;
    }
    const recoveryRunToken = {};
    owner.recoveryRunToken = recoveryRunToken;

    let cancelled = false;
    let legacyRetryTimer = null;
    const scheduleLegacyRetry = (error) => {
      if (cancelled || !hookMountedRef.current) return;
      const attempt =
        (legacyTurnMutationRecoveryAttemptsRef.current.get(entry.operationId) ||
          0) + 1;
      legacyTurnMutationRecoveryAttemptsRef.current.set(
        entry.operationId,
        attempt,
      );
      if (attempt >= 6) {
        setStreamErrorForChat(
          targetChatId,
          error?.message ||
            "This message change still needs recovery. Reopen the task to retry safely.",
        );
        return;
      }
      legacyRetryTimer = setTimeout(() => {
        if (!cancelled && hookMountedRef.current) {
          setTurnMutationVersion((version) => version + 1);
        }
      }, Math.min(4000, 250 * 2 ** (attempt - 1)));
    };
    const quarantineEntry = (code, message) => {
      recordTurnMutationRetryOutcome(entry.operationId, {
        action: TURN_MUTATION_RETRY_ACTIONS.QUARANTINE,
        code,
      });
      setStreamErrorForChat(
        targetChatId,
        message || CONTEXT_V2_TURN_MUTATION_MESSAGES.QUARANTINED,
      );
      releaseTurnMutation(owner);
    };

    void (async () => {
      let currentMessages = storageApi.getChatMessages?.(targetChatId) || [];
      if (isTurnMutationAlreadyCommitted(entry, currentMessages)) {
        removeTurnMutation(entry.operationId);
        legacyTurnMutationRecoveryAttemptsRef.current.delete(
          entry.operationId,
        );
        releaseTurnMutation(owner);
        return;
      }

      let targetMessage = currentMessages.find(
        (message) => message?.id === entry.targetMessageId,
      );
      let baseMessages = [];
      let replacementMessages = [];
      let recoveringOptimisticWithoutAck = false;

      if (isTurnMutationOptimisticWithoutAck(entry, currentMessages)) {
        recoveringOptimisticWithoutAck = true;
        baseMessages = currentMessages.slice(0, entry.baseMessageCount);
        targetMessage = currentMessages[entry.baseMessageCount] || null;
      } else if (
        fingerprintTurnMutationMessages(currentMessages) !==
        entry.originalFingerprint
      ) {
        quarantineEntry(
          "turn_mutation_conversation_changed",
          "This message change cannot be recovered automatically because the conversation changed.",
        );
        return;
      }

      if (entry.kind === "delete") {
        const turnMessageIds = collectTurnMessageIds(
          currentMessages,
          entry.targetMessageId,
        );
        if (turnMessageIds.size === 0) {
          quarantineEntry(
            "turn_mutation_target_missing",
            "This delete can no longer be matched to its original turn.",
          );
          return;
        }
        replacementMessages = currentMessages.filter(
          (message) => !turnMessageIds.has(message?.id),
        );
        if (
          entry.resultFingerprint &&
          fingerprintTurnMutationMessages(replacementMessages) !==
            entry.resultFingerprint
        ) {
          quarantineEntry(
            "turn_mutation_result_mismatch",
            "This delete no longer matches the stored recovery intent.",
          );
          return;
        }
      } else {
        const targetIndex = recoveringOptimisticWithoutAck
          ? entry.baseMessageCount
          : currentMessages.findIndex(
              (message) => message?.id === entry.targetMessageId,
            );
        if (targetIndex < 0 || targetMessage?.role !== "user") {
          quarantineEntry(
            "turn_mutation_target_missing",
            "This resend or edit can no longer be matched to its original turn.",
          );
          return;
        }
        if (!recoveringOptimisticWithoutAck) {
          baseMessages = currentMessages.slice(0, targetIndex);
        }
        if (
          fingerprintTurnMutationMessages(baseMessages) !==
          entry.baseFingerprint
        ) {
          quarantineEntry(
            "turn_mutation_base_mismatch",
            "This resend or edit no longer matches the stored conversation.",
          );
          return;
        }
        replacementMessages = baseMessages;
      }

      let characterConfig = null;
      if (entry.forceMemoryEnabled) {
        try {
          characterConfig = await buildCharacterRunConfig(entry.threadId);
        } catch (error) {
          quarantineEntry(
            "turn_mutation_character_recovery_failed",
            error?.message || "The character session could not be recovered.",
          );
          return;
        }
        if (
          cancelled ||
          !characterConfig?.session_id ||
          characterConfig.session_id !== entry.sessionId
        ) {
          if (!cancelled) {
            quarantineEntry(
              "turn_mutation_session_changed",
              "The character session changed while recovering this message operation.",
            );
          }
          return;
        }
      }

      /* Memory V2 recovery replays the FROZEN payload verbatim — no fresh
         getSessionHead, no history rebuilt from the messages currently on
         screen. The local checks above only decide whether it is still safe to
         proceed; they never reshape what is sent. Sending a recomputed request
         would rebase against a generation the user never saw. */
      const memoryResult = await applyTurnMutationMemory(entry, {
        replacementMessages,
        targetChatId,
      });
      if (!memoryResult.applied) {
        if (entry.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2) {
          if (isTerminalTurnMutationResult(memoryResult)) {
            const latestMessages =
              storageApi.getChatMessages?.(targetChatId) || [];
            if (
              fingerprintTurnMutationMessages(latestMessages) ===
              entry.originalFingerprint
            ) {
              removeTurnMutation(entry.operationId);
              legacyTurnMutationRecoveryAttemptsRef.current.delete(
                entry.operationId,
              );
              releaseTurnMutation(owner);
              setStreamErrorForChat(
                targetChatId,
                "The conversation changed before this message operation could be applied. Please try it again.",
              );
            } else {
              setStreamErrorForChat(
                targetChatId,
                "This message operation conflicted with newer conversation state and needs manual review before it can be discarded.",
              );
            }
          } else {
            scheduleLegacyRetry(memoryResult.error);
          }
        } else {
          /* applyTurnMutationMemory already persisted waiting, in-progress, or
             quarantine. Releasing ownership is what lets the waiting state
             mount its one 250 ms timer and lets quarantine render its actions. */
          releaseTurnMutation(owner);
        }
        return;
      }
      if (cancelled || !hookMountedRef.current || !ownsTurnMutation(owner)) {
        return;
      }

      if (entry.kind === "delete") {
        commitForegroundMessages(targetChatId, replacementMessages);
        storageApi.setChatMessages(targetChatId, replacementMessages, {
          source: "turn-mutation-recovery",
        });
        removeTurnMutation(entry.operationId);
        legacyTurnMutationRecoveryAttemptsRef.current.delete(
          entry.operationId,
        );
        releaseTurnMutation(owner);
        return;
      }

      const sourceAttachments = Array.isArray(targetMessage?.attachments)
        ? targetMessage.attachments
        : [];
      const recoveredAttachments =
        sourceAttachments.length > 0 && !attachmentsEnabled
          ? []
          : sourceAttachments;
      const started = await runTurnRequest({
        mode: entry.kind,
        chatId: targetChatId,
        text: entry.text,
        attachments: recoveredAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
        missingAttachmentPayloadMode: "degrade",
        extraToolkits: entry.extraToolkits,
        composer: entry.composer,
        characterAgentConfig: characterConfig,
        runContext: { modelId: entry.modelId, threadId: entry.threadId },
        turnMutationOperationId: entry.operationId,
      });
      const storedMessages = storageApi.getChatMessages?.(targetChatId) || [];
      if (isTurnMutationAlreadyCommitted(entry, storedMessages)) {
        removeTurnMutation(entry.operationId);
        legacyTurnMutationRecoveryAttemptsRef.current.delete(
          entry.operationId,
        );
      } else if (!started && !cancelled) {
        if (entry.memoryMode === TURN_MUTATION_MEMORY_MODES.V2) {
          quarantineEntry(
            "turn_mutation_run_not_started",
            "The recovered message change could not start a new run.",
          );
        } else {
          scheduleLegacyRetry(
            new Error("The recovered message change could not start a new run."),
          );
        }
      }
    })().finally(() => {
      if (owner.recoveryRunToken !== recoveryRunToken) {
        return;
      }
      delete owner.recoveryRunToken;
      if (
        cancelled &&
        hookMountedRef.current &&
        ownsTurnMutation(owner) &&
        readTurnMutationOutbox().some(
          (item) =>
            item.chatId === targetChatId &&
            item.operationId === entry.operationId,
        )
      ) {
        setTurnMutationVersion((version) => version + 1);
      }
    });

    const shouldCancelRecoveryOnCleanup = () =>
      !hookMountedRef.current ||
      activeChatIdRef.current !== targetChatId ||
      owner.recoveryRunToken !== recoveryRunToken;

    return () => {
      /* claimTurnMutation notifies listeners, which intentionally rerenders
         this hook. That dependency cleanup must not cancel the in-flight
         recovery it just started; the succeeding effect observes the same
         recoveryRunToken and stays idle. A real unmount or chat switch still
         cancels before any local commit/run. */
      if (shouldCancelRecoveryOnCleanup()) {
        cancelled = true;
        if (legacyRetryTimer != null) {
          clearTimeout(legacyRetryTimer);
        }
      }
    };
  }, [
    activeChatIdRef,
    attachmentsEnabled,
    buildCharacterRunConfig,
    chatId,
    commitForegroundMessages,
    activeStreamsRef,
    isStreaming,
    applyTurnMutationMemory,
    runTurnRequest,
    setStreamErrorForChat,
    storageApi,
    turnMutationVersion,
  ]);

  useEffect(() => {
    const confirmationRuntimeByChatId =
      confirmationRuntimeByChatIdRef.current;
    const streamHandles = streamHandlesRef.current;
    const executionIdentities = executionIdentityByChatIdRef.current;
    const streamingChatIds = streamingChatIdsRef.current;
    const runPreflights = runPreflightGenerationByChatIdRef.current;
    const activeStreams = activeStreamsRef.current;
    const activeRunThreadIdByChatId = activeRunThreadIdByChatIdRef.current;
    const queuedTurnsByChatId = queuedTurnsByChatIdRef.current;
    const pendingFyiCountByChatId = pendingFyiCountByChatIdRef.current;
    const pendingClarifyByChatId = pendingClarifyByChatIdRef.current;
    const durableResumeRetryTimers = durableResumeRetryTimersRef.current;
    const durableInteractionLookups =
      durableInteractionLookupByChatIdRef.current;
    const reattachingChatIds = reattachingChatIdsRef.current;
    const runContextsByChatId = runContextByChatIdRef.current;
    const durableResumeStartedKeys = durableResumeStartedKeysRef.current;
    const durableResumeStartedKeysByChatId =
      durableResumeStartedKeysByChatIdRef.current;
    const runGenerationsByChatId = runGenerationByChatIdRef.current;
    const stoppedRunChatIds = stoppedRunChatIdsRef.current;
    const queueRelayTimersByChatId = queueRelayTimersByChatIdRef.current;
    const queueRelayAttemptsByChatId = queueRelayAttemptsByChatIdRef.current;
    const queueAttemptIdsByChatId = queueAttemptIdByChatIdRef.current;
    const queueClientOperationIdsByChatId =
      queueClientOperationIdByChatIdRef.current;
    const runClientOperationIdsByChatId =
      runClientOperationIdByChatIdRef.current;
    const confirmationRetryWaitersByChatId =
      confirmationRetryWaitersByChatIdRef.current;
    const renderRuntimeByChatId = renderRuntimeByChatIdRef.current;
    const sessionAutoApprovalsByChatId = sessionAutoApproveRef.current;

    return () => {
      runGenerationsByChatId.clear();
      stoppedRunChatIds.clear();
      for (const runtimeChatId of renderRuntimeByChatId.keys()) {
        clearActiveTokenFlushController(runtimeChatId, "dispose");
      }
      renderRuntimeByChatId.clear();
      // Renderer lifecycle is transport lifecycle, not execution intent.
      // Navigation, reload, and HMR must never silently turn into user Stop.
      for (const handle of streamHandles.values()) {
        if (handle && typeof handle.detach === "function") {
          handle.detach();
        } else {
          disconnectStreamTransport(handle);
        }
      }
      streamHandles.clear();
      executionIdentities.clear();
      streamingChatIds.clear();
      runPreflights.clear();
      storageApi.releaseAllChatDraftClaims?.();
      activeStreams.clear();
      clearAttachmentPayloads();
      confirmationRuntimeByChatId.forEach((runtime) => {
        runtime.resolveTimerById.forEach((timerId) => {
          clearTimeout(timerId);
        });
      });
      confirmationRuntimeByChatId.clear();
      pendingToolConfirmationRequestsByChatIdRef.current = {};
      toolConfirmationUiStateByChatIdRef.current = {};
      pendingContinuationRequestsByChatIdRef.current = {};
      activeRunThreadIdByChatId.clear();
      queuedTurnsByChatId.clear();
      queueAttemptIdsByChatId.clear();
      queueClientOperationIdsByChatId.clear();
      runClientOperationIdsByChatId.clear();
      pendingFyiCountByChatId.clear();
      pendingClarifyByChatId.clear();
      durableResumeRetryTimers.forEach((timerId) => clearTimeout(timerId));
      durableResumeRetryTimers.clear();
      durableInteractionLookups.clear();
      reattachingChatIds.clear();
      runContextsByChatId.clear();
      durableResumeStartedKeys.clear();
      durableResumeStartedKeysByChatId.clear();
      queueRelayTimersByChatId.forEach((timerIds) => {
        timerIds.forEach((timerId) => clearTimeout(timerId));
      });
      queueRelayTimersByChatId.clear();
      queueRelayAttemptsByChatId.clear();
      confirmationRetryWaitersByChatId.forEach((waiters) => {
        waiters.forEach((waiter) => {
          clearTimeout(waiter.timerId);
          waiter.resolve(false);
        });
      });
      confirmationRetryWaitersByChatId.clear();
      durableInteractionByChatIdRef.current = {};
      sessionAutoApprovalsByChatId.clear();
    };
  }, [
    activeStreamsRef,
    clearActiveTokenFlushController,
    clearAttachmentPayloads,
    storageApi,
  ]);

  return {
    canStop,
    deleteTurn,
    editTurn,
    handleContinuationDecision,
    handleToolConfirmationDecision,
    hasBackgroundStream,
    interjectState,
    durableInteractionStatus,
    discardTurnMutation,
    isDurableInteractionBlocked,
    isTurnMutationBlocked,
    isStreaming,
    onClarifyResolve,
    onQueueUndo,
    pendingContinuationRequest,
    pendingToolConfirmationRequests,
    cancelRunForTest,
    getRunForTest,
    resendTurn,
    retryTurnMutation,
    /* Memory V2 P0 secret gate. `secretCaptureGate` is the six-field public
       object rendered by secret_capture_modal — it never carries message text
       or any matched value. `isSecretCapturePending` is what the page uses to
       lock send / model / tool / attachment controls while the user decides. */
    secretCaptureGate,
    isSecretCapturePending,
    confirmSecretCaptureStore,
    confirmSecretCapturePlain,
    cancelSecretCapture,
    setSecretCaptureScope,
    sendNewTurn,
    sendForTest,
    setStreamError,
    stopStream,
    streamError,
    toolConfirmationUiStateById,
    turnMutationHold,
    turnMutationPresentationByMessageId,
  };
};
