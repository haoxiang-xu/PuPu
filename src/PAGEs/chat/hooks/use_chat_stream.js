import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { toast } from "../../../SERVICEs/toast";
import { expandCommands, extractCommands } from "../../../SERVICEs/command_registry";
import { readMemorySettings } from "../../../COMPONENTs/settings/memory/storage";
import { appendTokenUsageRecord } from "../../../COMPONENTs/settings/token_usage/storage";
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
import { isToolAutoApproved } from "../../../SERVICEs/toolkit_auto_approve_store";
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
} from "./durable_interaction_recovery";
import {
  enqueueExecutionCancel,
  readExecutionCancelOutbox,
  removeExecutionCancel,
} from "./execution_cancel_outbox";
import {
  start as progressStart,
  stop as progressStop,
} from "../../../SERVICEs/progress_bus";

const CHAT_STREAM_PROGRESS_ID = "chat_stream_active";

const STREAM_TRACE_LEVEL = "minimal";
const RUNTIME_EVENT_BATCH_FLUSH_MS = 64;
const SUBAGENT_STATE_FLUSH_MS = 100;
const DURABLE_RESUME_MAX_RETRIES = 7;
const EXECUTION_CANCEL_DISCONNECT_GRACE_MS = 1500;
const EXECUTION_CANCEL_OUTBOX_RETRY_MS = 5000;
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
  const sessionId =
    typeof identity?.sessionId === "string" ? identity.sessionId.trim() : "";
  const attemptId =
    typeof identity?.attemptId === "string" ? identity.attemptId.trim() : "";
  if (!sessionId || !attemptId) {
    return null;
  }
  return { ...identity, sessionId, attemptId };
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
      session_id: normalizedIdentity.sessionId,
      attempt_id: normalizedIdentity.attemptId,
      ...(normalizedIdentity.sourceAttemptId
        ? { source_attempt_id: normalizedIdentity.sourceAttemptId }
        : {}),
      ...(normalizedIdentity.requestId
        ? { request_id: normalizedIdentity.requestId }
        : {}),
      reason,
      idempotency_key: `stop:${normalizedIdentity.attemptId}`,
    }),
  ).then((response) => ({ ok: true, response }))
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
  draftAttachments,
  setDraftAttachments,
  selectedModelId,
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
  const [pendingContinuationRequest, setPendingContinuationRequest] =
    useState(null);
  const [interjectStateByChatId, setInterjectStateByChatId] = useState({});
  const interjectStateByChatIdRef = useRef({});
  const isCharacterChat =
    chatKind === "character" &&
    typeof characterId === "string" &&
    characterId.trim().length > 0;
  const pendingContinuationRequestRef = useRef(null);

  /* Stable refs for high-churn values — keeps sendNewTurn callback stable */
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const draftAttachmentsRef = useRef(draftAttachments);
  draftAttachmentsRef.current = draftAttachments;
  const selectedModelIdRef = useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;
  const selectedToolkitsRef = useRef(selectedToolkits);
  selectedToolkitsRef.current = selectedToolkits;

  const streamHandlesRef = useRef(new Map());
  const executionIdentityByChatIdRef = useRef(new Map());
  const fallbackStreamingMessageStoreRef = useRef(null);
  if (!fallbackStreamingMessageStoreRef.current) {
    fallbackStreamingMessageStoreRef.current = createStreamingMessageStore();
  }
  const activeStreamingMessageStore =
    streamingMessageStore || fallbackStreamingMessageStoreRef.current;
  const streamingChatIdsRef = useRef(new Set());
  const sessionAutoApproveRef = useRef(new Set()); // keys: "toolkitId:toolName", cleared on chatId change
  const confirmationRuntimeByChatIdRef = useRef(new Map());
  const durableInteractionLookupRef = useRef(null);
  const durableResumeStartedKeysRef = useRef(new Set());
  const durableResumeStartedKeysByChatIdRef = useRef(new Map());
  const durableResumeRetryTimersRef = useRef(new Map());
  const runGenerationByChatIdRef = useRef(new Map());
  const stoppedRunChatIdsRef = useRef(new Set());
  const queueRelayTimersByChatIdRef = useRef(new Map());
  const confirmationRetryWaitersByChatIdRef = useRef(new Map());
  const renderRuntimeByChatIdRef = useRef(new Map());
  // Interject (mid-run "fyi"/"btw"/"queue"/"clarify") bookkeeping — all keyed
  // by chatId so multiple chats never cross-talk.
  const activeRunThreadIdByChatIdRef = useRef(new Map()); // chatId -> threadId the active run actually used (character chats use a session_id, not chatId)
  const queuedTurnsByChatIdRef = useRef(new Map()); // chatId -> createQueuedTurnBuffer() instance for that chat's active run
  const pendingFyiCountByChatIdRef = useRef(new Map()); // chatId -> count of fyi interjects sent but not yet confirmed injected
  const pendingClarifyByChatIdRef = useRef(new Map()); // chatId -> {id, text} awaiting the user's channel choice
  const handleInterjectRef = useRef(null); // breaks the sendNewTurn <-> handleInterject declaration cycle

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

  const trackDurableResumeStartedKey = useCallback(
    (targetChatId, resumeKey) => {
      if (!resumeKey) {
        return;
      }
      durableResumeStartedKeysRef.current.add(resumeKey);
      let keys =
        durableResumeStartedKeysByChatIdRef.current.get(targetChatId);
      if (!keys) {
        keys = new Set();
        durableResumeStartedKeysByChatIdRef.current.set(targetChatId, keys);
      }
      keys.add(resumeKey);
    },
    [],
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

  const buildCharacterRunConfig = useCallback(async () => {
    if (!isCharacterChat) {
      return null;
    }

    const resolvedThreadId =
      typeof threadIdRef?.current === "string" && threadIdRef.current.trim()
        ? threadIdRef.current.trim()
        : "main";

    const config = await api.unchain.buildCharacterAgentConfig({
      characterId,
      threadId: resolvedThreadId,
      humanId: "local_user",
    });
    return config && typeof config === "object" ? config : null;
  }, [characterId, isCharacterChat, threadIdRef]);

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

  /* Session-scoped "Don't ask again" list is reset whenever the active
   * chat changes, matching the semantics of "only in this session". */
  useEffect(() => {
    sessionAutoApproveRef.current.clear();
  }, [chatId]);

  const isStreaming = streamingChatIds.has(chatId);
  const hasBackgroundStream =
    streamingChatIds.size > 0 && !streamingChatIds.has(chatId);
  const pendingToolConfirmationRequests =
    pendingToolConfirmationRequestsByChatId[chatId] || EMPTY_CONFIRMATION_STATE;
  const toolConfirmationUiStateById =
    toolConfirmationUiStateByChatId[chatId] || EMPTY_CONFIRMATION_STATE;
  const durableInteractionState = durableInteractionByChatId[chatId] || null;
  const durableInteractionStatus =
    typeof durableInteractionState?.status === "string"
      ? durableInteractionState.status
      : "";
  const isDurableInteractionBlocked = Boolean(durableInteractionStatus);
  const canStop =
    isStreaming ||
    [
      "awaiting",
      "awaiting_response",
      "checking",
      "receipt_recorded",
      "resuming",
      "retry_wait",
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
    (targetChatId, callId) => {
      const normalizedCallId = typeof callId === "string" ? callId.trim() : "";
      if (!normalizedCallId) {
        return;
      }

      const runtime = getConfirmationRuntimeForChat(targetChatId, {
        create: false,
      });
      const confirmationId = runtime?.confirmationIdByCallId.get(normalizedCallId);
      if (!confirmationId) {
        return;
      }
      runtime.followupSignalById.set(confirmationId, true);
      resolveSubmittedConfirmationFromSignal(targetChatId, confirmationId);
    },
    [getConfirmationRuntimeForChat, resolveSubmittedConfirmationFromSignal],
  );

  const markAllPendingConfirmationFollowupSignals = useCallback((targetChatId) => {
    const runtime = getConfirmationRuntimeForChat(targetChatId, {
      create: false,
    });
    runtime?.confirmationIdByCallId.forEach((confirmationId) => {
      if (confirmationId) {
        runtime.followupSignalById.set(confirmationId, true);
        resolveSubmittedConfirmationFromSignal(targetChatId, confirmationId);
      }
    });
  }, [getConfirmationRuntimeForChat, resolveSubmittedConfirmationFromSignal]);

  const clearResolvedToolConfirmationByCallId = useCallback(
    (targetChatId, callId) => {
      if (typeof callId !== "string" || !callId.trim()) {
        return;
      }
      const runtime = getConfirmationRuntimeForChat(targetChatId, {
        create: false,
      });
      const confirmationId = runtime?.confirmationIdByCallId.get(callId);
      if (!confirmationId) {
        return;
      }

      runtime.confirmationIdByCallId.delete(callId);
      runtime.confirmationCallIdById.delete(confirmationId);
      runtime.sessionIdByConfirmationId.delete(confirmationId);
      runtime.followupSignalById.delete(confirmationId);
      clearConfirmationResolutionTimer(targetChatId, confirmationId);
      updatePendingToolConfirmationRequests(targetChatId, (previous) => {
        if (!previous || !previous[confirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[confirmationId];
        return next;
      });
      updateToolConfirmationUiState(targetChatId, (previous) => {
        if (!previous || !previous[confirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[confirmationId];
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
    queuedTurnsByChatIdRef.current.delete(currentChatId);
    pendingFyiCountByChatIdRef.current.delete(currentChatId);
    pendingClarifyByChatIdRef.current.delete(currentChatId);
    syncInterjectStateForChat(currentChatId);
    updateDurableInteractionForChat(currentChatId, null);
    clearAllPendingToolConfirmations(currentChatId);
    pendingContinuationRequestRef.current = null;
    setPendingContinuationRequest(null);

    clearActiveTokenFlushController(currentChatId, "flush");
    const handle = streamHandlesRef.current.get(currentChatId);
    const executionIdentity =
      executionIdentityByChatIdRef.current.get(currentChatId) || null;
    executionIdentityByChatIdRef.current.delete(currentChatId);
    const queuedCancellation = enqueueExecutionCancel({
      ...(executionIdentity || {}),
      reason: "user_stop",
      createdAt: Date.now(),
    });
    void requestExecutionCancellationAndDisconnect({
      identity: queuedCancellation,
      handle,
      reason: "user_stop",
    }).then((result) => {
      if (result?.ok && queuedCancellation) {
        removeExecutionCancel(
          queuedCancellation.sessionId,
          queuedCancellation.attemptId,
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
    clearActiveTokenFlushController,
    clearAllPendingToolConfirmations,
    clearDurableResumeStartedKeysForChat,
    clearQueueRelayTimersForChat,
    invalidateRunGeneration,
    materializeStreamingMessages,
    messagesRef,
    setMessages,
    storageApi,
    syncInterjectStateForChat,
    updateDurableInteractionForChat,
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
        if (result?.ok) {
          removeExecutionCancel(entry.sessionId, entry.attemptId);
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

      const appendDecisionFrame = (frames) => {
        const list = Array.isArray(frames) ? frames : [];
        const requestFrame = list.find(
          (frame) =>
            frame?.type === "tool_call" &&
            (frame?.payload?.confirmation_id === normalizedConfirmationId ||
              frame?.payload?.call_id === callId),
        );
        if (!requestFrame) {
          return { frames: list, changed: false };
        }

        const alreadyRecorded = list.some(
          (frame) =>
            frame?.type === decisionFrameType &&
            frame?.payload?.call_id === callId,
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

  const appendLocalInterjectionRecord = useCallback(
    (targetChatId, record) =>
      applyToStreamingAssistantMessage(targetChatId, (message) => ({
        ...message,
        updatedAt: Date.now(),
        interjections: [...(message.interjections || []), record],
      })),
    [applyToStreamingAssistantMessage],
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
      const lookup = durableInteractionLookupRef.current;
      if (typeof lookup === "function") {
        void lookup(targetChatId, sessionId, {
          autoResume: true,
          runGeneration,
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
        typeof requestFrame?.payload?.tool_name === "string"
          ? requestFrame.payload.tool_name
          : "";
      const toolkitId =
        typeof requestFrame?.payload?.toolkit_id === "string"
          ? requestFrame.payload.toolkit_id
          : "";

      /* Session-scoped "Don't ask again": remember this tool so that
       * subsequent requests within the same chat are auto-approved. */
      if (
        approved &&
        scope === "session" &&
        toolName &&
        toolName !== HUMAN_INPUT_TOOL_NAME
      ) {
        sessionAutoApproveRef.current.add(`${toolkitId}:${toolName}`);
      }
      const interactConfig =
        requestFrame?.payload?.interact_config &&
        typeof requestFrame.payload.interact_config === "object"
          ? requestFrame.payload.interact_config
          : {};
      const requestArguments =
        requestFrame?.payload?.arguments &&
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

      const current = pendingContinuationRequestRef.current;
      if (!current || current.status === "submitting") return;

      pendingContinuationRequestRef.current = {
        ...current,
        status: "submitting",
      };
      setPendingContinuationRequest((prev) =>
        prev ? { ...prev, status: "submitting" } : prev,
      );

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
        pendingContinuationRequestRef.current = null;
        setPendingContinuationRequest(null);
        continueFromRecordedReceipt(
          targetChatId,
          sessionId,
          response,
          runGeneration,
        );
      } catch (_error) {
        if (!isRunGenerationCurrent(targetChatId, runGeneration)) return;
        pendingContinuationRequestRef.current = { ...current, status: "idle" };
        setPendingContinuationRequest((prev) =>
          prev ? { ...prev, status: "idle" } : prev,
        );
      }
    },
    [
      activeChatIdRef,
      continueFromRecordedReceipt,
      getRunGeneration,
      isRunGenerationCurrent,
      submitToolConfirmationWithRetry,
    ],
  );

  const isToolCallAutoApprovable = useCallback((frame) => {
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
    const isSessionAllowed = sessionAutoApproveRef.current.has(
      `${toolkitId}:${toolName}`,
    );
    return (
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
      } = {},
    ) => {
      if (
        !targetSessionId ||
        (forceMemoryEnabled !== true && readMemorySettings().enabled !== true)
      ) {
        return true;
      }

      try {
        const response = await api.unchain.replaceSessionMemory({
          sessionId: targetSessionId,
          messages: buildHistoryForModel(nextMessages, chatId),
          options: {
            modelId,
            ...(forceMemoryEnabled === true ? { memory_enabled: true } : {}),
            ...(memoryNamespace
              ? { memory_namespace: memoryNamespace }
              : {}),
          },
        });

        return response?.applied !== false;
      } catch (error) {
        if (activeChatIdRef.current === chatId) {
          setStreamError(
            error?.message || "Failed to sync short-term memory for this chat.",
          );
        }
        return false;
      }
    },
    [activeChatIdRef, buildHistoryForModel, chatId, modelIdRef, setStreamError],
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
      memoryFallbackAttempted = false,
      forceHistoryFallback = false,
      historyOverride = null,
      characterAgentConfig = null,
      durableInteraction = null,
      durableResumeAttempt = 0,
      durableOwnerMessageId = "",
      runGeneration: requestedRunGeneration = null,
    }) => {
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

      const activeRunGeneration =
        Number.isInteger(requestedRunGeneration) && requestedRunGeneration > 0
          ? requestedRunGeneration
          : beginRunGeneration(targetChatId);
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
      pendingContinuationRequestRef.current = null;
      setPendingContinuationRequest(null);
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

        await hydrateAttachmentPayloads(targetChatId, [
          ...normalizedAttachments,
          ...normalizedBaseMessages.flatMap((message) =>
            message.role === "user" && Array.isArray(message.attachments)
              ? message.attachments
              : [],
          ),
        ]);
        if (!isCurrentRun()) {
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
            setStreamError(
              "Some attachment payloads are unavailable in this session. Resending text only.",
            );
          } else {
            setStreamError(
              "Some attachment payloads are unavailable. Please re-attach your files and try again.",
            );
            return false;
          }
        }

        userMessage = { ...userMessageSeed };
        if (persistedAttachments.length > 0) {
          userMessage.attachments = persistedAttachments;
        } else if ("attachments" in userMessage) {
          delete userMessage.attachments;
        }
      }

      const persistImmediateMessages = (nextImmediateMessages) => {
        messagesRef.current = nextImmediateMessages;
        if (activeChatIdRef.current === targetChatId) {
          setMessages(nextImmediateMessages);
          return;
        }

        storageApi.setChatMessages(targetChatId, nextImmediateMessages, {
          source: "chat-page",
        });
      };

      let effectiveModelId = modelIdRef.current;
      let effectiveThreadId = targetChatId;
      let effectiveMemoryNamespace = "";
      let effectiveToolkits = selectedToolkits;
      let effectiveWorkspaceIds = selectedWorkspaceIds;
      let effectiveAgentOrchestration = normalizeAgentOrchestration(
        agentOrchestration,
      );
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
        },
      };
      const optimisticMessages = isDurableResume
        ? durableResumeMessages.messages
        : [
            ...normalizedBaseMessages,
            userMessage,
            optimisticAssistantPlaceholder,
          ];
      const previousInputValue = inputValue;
      const previousDraftAttachments = draftAttachments;

      setMessages(optimisticMessages);
      if (clearComposer) {
        setInputValue("");
        setDraftAttachments([]);
      }
      setStreamError("");
      setStreamingChatIds((prev) => new Set(prev).add(targetChatId));
      streamingChatIdsRef.current.add(targetChatId);
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
      activeStreamsRef.current.set(targetChatId, {
        messages: optimisticMessages,
      });

      const rollbackOptimistic = () => {
        setMessages(normalizedBaseMessages);
        streamingChatIdsRef.current.delete(targetChatId);
        setStreamingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(targetChatId);
          return next;
        });
        activeStreamsRef.current.delete(targetChatId);
        clearStreamingMessageStore(targetChatId, assistantMessageId);
        if (clearComposer) {
          setInputValue(previousInputValue);
          setDraftAttachments(previousDraftAttachments);
        }
      };

      let resolvedCharacterConfig = characterAgentConfig;
      if (isCharacterChat && !isDurableResume) {
        if (!resolvedCharacterConfig) {
          try {
            resolvedCharacterConfig = await buildCharacterRunConfig();
            if (!isCurrentRun()) {
              return false;
            }
          } catch (error) {
            if (!isCurrentRun()) {
              return false;
            }
            rollbackOptimistic();
            setStreamError(
              error?.message || "Failed to prepare this character chat.",
            );
            return false;
          }
        }

        if (!resolvedCharacterConfig?.session_id) {
          rollbackOptimistic();
          setStreamError("Failed to prepare this character chat.");
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
            characterId,
            reason: characterDecision.reason || "unknown",
            courtesyMessage: courtesyMessage || null,
            evaluation: characterDecision.evaluation || null,
          });
          const immediateMessages =
            decisionAction === "defer" && courtesyMessage
              ? [
                  ...normalizedBaseMessages,
                  userMessage,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    content: courtesyMessage,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    status: "done",
                    meta: {
                      model: effectiveModelId,
                    },
                  },
                ]
              : [...normalizedBaseMessages, userMessage];

          persistImmediateMessages(immediateMessages);
          if (clearComposer) {
            setInputValue("");
            setDraftAttachments([]);
          }
          setStreamError("");
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
          if (activeChatIdRef.current === targetChatId) {
            setMessages(nextStreamMessages);
          }
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
              handlers.onToken?.(effect.delta);
              return;
            }
            if (effect.type === "error") {
              runtimeEventStreamFailed = true;
              handlers.onError?.(effect.error);
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

        const streamHandle = startStream(payload, {
          onRuntimeEvent: (runtimeEvent) => {
            if (!isCurrentRun()) {
              return;
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
            if (!isCurrentRun()) {
              runtimeEventBatcher?.cancel();
              return;
            }
            runtimeEventBatcher?.flushNow();
            if (runtimeEventStreamFailed) {
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
            if (!isCurrentRun()) {
              runtimeEventBatcher?.cancel();
              return;
            }
            runtimeEventBatcher?.flushNow();
            runtimeEventStreamFailed = true;
            handlers.onError?.(error);
          },
        });

        if (runtimeEventBatcher && streamHandle) {
          const wrappedHandle = { ...streamHandle };
          if (typeof streamHandle.disconnect === "function") {
            wrappedHandle.disconnect = (...args) => {
              runtimeEventBatcher.cancel();
              return streamHandle.disconnect(...args);
            };
          }
          if (typeof streamHandle.cancel === "function") {
            wrappedHandle.cancel = (...args) => {
              runtimeEventBatcher.cancel();
              return streamHandle.cancel(...args);
            };
          }
          return wrappedHandle;
        }

        return streamHandle;
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

        return api.unchain.startStreamV2(payload, handlers);
      };

      const scheduleDurableResumeRetry = (error, sourceMessages) => {
        if (!isDurableResume || !isCurrentRun()) {
          return false;
        }

        const errorMessage = error?.message || "Failed to resume this run";
        if (
          durableResumeAttempt >= DURABLE_RESUME_MAX_RETRIES ||
          !isRetryableDurableInteractionError(error)
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
        messagesRef.current = retryMessages;
        if (activeChatIdRef.current === targetChatId) {
          setMessages(retryMessages);
        }
        storageApi.setChatMessages(targetChatId, retryMessages, {
          source: "chat-page",
        });

        const nextAttempt = durableResumeAttempt + 1;
        updateDurableInteractionForChat(targetChatId, {
          ...durableInteraction,
          ownerMessageId: assistantMessageId,
          status: "retry_wait",
          resumeAttempt: nextAttempt,
          lastError: errorMessage,
        });
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
          if (!isCurrentRun()) {
            return;
          }
          let refreshedInteraction = durableInteraction;
          try {
            const rawPending = await api.unchain.getPendingInteraction({
              session_id: durableInteraction.sessionId,
            });
            if (!isCurrentRun()) {
              return;
            }
            const refreshedPending = normalizePendingInteraction(
              rawPending,
              durableInteraction.sessionId,
            );
            if (refreshedPending?.status === "none") {
              clearDurableResumeStartedKeysForChat(targetChatId);
              clearAllPendingToolConfirmations(targetChatId);
              updateDurableInteractionForChat(targetChatId, null);
              return;
            }
            if (
              refreshedPending?.status === "receipt_recorded" &&
              refreshedPending.interactionId ===
                durableInteraction.interactionId
            ) {
              refreshedInteraction = {
                ...refreshedPending,
                ownerMessageId: assistantMessageId,
              };
            }
          } catch (_lookupError) {
            // The resume stream already gave us a retryable lease error. If
            // the reconciliation lookup is temporarily unavailable, keep the
            // original durable receipt and let the bounded retry proceed.
          }
          if (!isCurrentRun()) {
            return;
          }
          updateDurableInteractionForChat(targetChatId, {
            ...refreshedInteraction,
            ownerMessageId: assistantMessageId,
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
          });
        }, durableInteractionRetryDelayMs(durableResumeAttempt));
        durableResumeRetryTimersRef.current.set(targetChatId, timerId);
        return true;
      };

      let streamHandle = null;
      try {
        const systemPromptOverridesObject =
          systemPromptOverrides &&
          typeof systemPromptOverrides === "object" &&
          !Array.isArray(systemPromptOverrides)
            ? systemPromptOverrides
            : {};

        const durableInteractionsRequired =
          !isDurableResume &&
          memoryEnabled &&
          typeof api.unchain.isDurableInteractionBridgeAvailable ===
            "function" &&
          api.unchain.isDurableInteractionBridgeAvailable() &&
          (isCharacterChat ||
            (!selectedRecipeName || selectedRecipeName === "Default")) &&
          effectiveAgentOrchestration.mode === "default";

        const streamPayload = isDurableResume
          ? buildDurableResumePayload(durableInteraction)
          : {
              threadId: effectiveThreadId,
              message: promptText,
              history: historyForModel,
              attachments: payloadAttachments,
              options: {
                modelId: effectiveModelId,
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
                ...(!isCharacterChat &&
                  selectedRecipeName &&
                  selectedRecipeName !== "Default" && {
                    recipe_name: selectedRecipeName,
                  }),
                ...(!isCharacterChat && {
                  agent_orchestration: effectiveAgentOrchestration,
                }),
                ...(isCharacterChat
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

        streamHandle = startChatStream(
          streamPayload,
          {
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
              frame = scrubLegacyPlanToolResultFrame(frame);
              if (frame.type === "token_delta") {
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
                pendingContinuationRequestRef.current = nextRequest;
                setPendingContinuationRequest(nextRequest);
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
                    if (isToolCallAutoApprovable(frame)) {
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
                  clearResolvedToolConfirmationByCallId(targetChatId, callId);
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
                  markConfirmationFollowupSignalByCallId(targetChatId, callId);
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
                  if (isToolCallAutoApprovable(frame)) {
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
                clearResolvedToolConfirmationByCallId(targetChatId, callId);
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
                markConfirmationFollowupSignalByCallId(targetChatId, callId);
              } else if (frame.type === "error" || frame.type === "done") {
                markAllPendingConfirmationFollowupSignals(targetChatId);
                pendingContinuationRequestRef.current = null;
                setPendingContinuationRequest(null);
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
                const fyiMessages = Array.isArray(frame.payload?.messages)
                  ? frame.payload.messages
                  : [];
                const fyiRecords = fyiMessages
                  .filter((entry) => entry?.origin === "user")
                  .map((entry) =>
                    buildInterjectionRecord({
                      type: "fyi",
                      text: typeof entry?.text === "string" ? entry.text : "",
                      origin: "user",
                      ts: patchTime,
                    }),
                  )
                  .filter((record) => record.text);

                const nextStreamMessages = streamMessages.map((message) => {
                  if (message.id !== assistantMessageId) return message;
                  return {
                    ...message,
                    updatedAt: patchTime,
                    traceFrames: [...(message.traceFrames || []), frame],
                    ...(fyiRecords.length > 0
                      ? {
                          interjections: [
                            ...(message.interjections || []),
                            ...fyiRecords,
                          ],
                        }
                      : {}),
                  };
                });
                syncStreamMessages(nextStreamMessages);

                // The server just injected everything that was pending —
                // clear the "queued" badge for this chat.
                pendingFyiCountByChatIdRef.current.delete(targetChatId);
                syncInterjectStateForChat(targetChatId);
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
                if (!isCharacterChat) {
                  storageApi.setChatThreadId(targetChatId, meta.thread_id, {
                    source: "chat-page",
                  });
                }
              }

              if (meta && typeof meta.model === "string" && meta.model.trim()) {
                if (!isCharacterChat) {
                  storageApi.setChatModel(
                    targetChatId,
                    { id: meta.model },
                    { source: "chat-page" },
                  );
                }
                if (!isCharacterChat && activeChatIdRef.current === targetChatId) {
                  modelIdRef.current = meta.model;
                  setSelectedModelId(meta.model);
                }
              }
            },
            onToken: (delta) => {
              if (!isCurrentRun()) {
                return;
              }
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
              if (!isCurrentRun()) {
                return;
              }
              /* Sync closure with external updates before building final messages. */
              const _refMsgs = activeStreamsRef.current.get(targetChatId)?.messages;
              if (Array.isArray(_refMsgs) && _refMsgs.length > 0) {
                streamMessages = _refMsgs;
              }

              thinkTagParser.flush();
              flushBufferedTokenDelta();
              flushStreamingMessageStore(targetChatId, assistantMessageId);
              const doneTime = Date.now();
              const bundle =
                done?.bundle && typeof done.bundle === "object"
                  ? { ...done.bundle }
                  : undefined;
              const nextAgentOrchestration =
                bundle && bundle.agent_orchestration
                  ? normalizeAgentOrchestration(bundle.agent_orchestration)
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
                  },
                });
              });

              // Clarify timeout fallback: the run ended before the user picked
              // a channel — resolve it as a queued turn so the message is
              // never lost, and mark the frame so the UI stops showing it as
              // pending.
              const pendingClarifyOnDone =
                pendingClarifyByChatIdRef.current.get(targetChatId);
              if (pendingClarifyOnDone) {
                pendingClarifyByChatIdRef.current.delete(targetChatId);
                let queuedTurnsForClarify =
                  queuedTurnsByChatIdRef.current.get(targetChatId);
                if (!queuedTurnsForClarify) {
                  queuedTurnsForClarify = createQueuedTurnBuffer();
                  queuedTurnsByChatIdRef.current.set(
                    targetChatId,
                    queuedTurnsForClarify,
                  );
                }
                queuedTurnsForClarify.push(pendingClarifyOnDone.text);
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
              }
              syncStreamMessages(nextStreamMessages);

              if (!isCharacterChat && nextAgentOrchestration) {
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

              if (bundle && typeof bundle.consumed_tokens === "number") {
                const modelId =
                  typeof bundle.model === "string" && bundle.model.trim()
                    ? bundle.model.trim()
                    : modelIdRef.current || "";
                const colonIndex = modelId.indexOf(":");
                const provider =
                  colonIndex > 0 ? modelId.slice(0, colonIndex) : "unknown";
                const model =
                  colonIndex > 0
                    ? modelId.slice(colonIndex + 1)
                    : modelId || "unknown";
                appendTokenUsageRecord({
                  timestamp: doneTime,
                  provider,
                  model,
                  model_id: modelId || "unknown",
                  consumed_tokens: bundle.consumed_tokens,
                  ...(typeof bundle.input_tokens === "number"
                    ? { input_tokens: bundle.input_tokens }
                    : {}),
                  ...(typeof bundle.output_tokens === "number"
                    ? { output_tokens: bundle.output_tokens }
                    : {}),
                  ...(typeof bundle.cache_read_input_tokens === "number"
                    ? { cache_read_input_tokens: bundle.cache_read_input_tokens }
                    : {}),
                  ...(typeof bundle.cache_creation_input_tokens === "number"
                    ? { cache_creation_input_tokens: bundle.cache_creation_input_tokens }
                    : {}),
                  max_context_window_tokens: bundle.max_context_window_tokens,
                  chatId: targetChatId,
                });
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

              pendingFyiCountByChatIdRef.current.delete(targetChatId);
              activeRunThreadIdByChatIdRef.current.delete(targetChatId);

              // Queue relay: anything queued locally (explicit /queue, a
              // resolved_channel:"queue" from the server, or the clarify
              // fallback above) merges into one follow-up turn now that this
              // run has fully ended and persisted.
              const queuedTurnsOnDone = queuedTurnsByChatIdRef.current.get(targetChatId);
              if (queuedTurnsOnDone && queuedTurnsOnDone.size() > 0) {
                queuedTurnsOnDone.markRelayed();
                syncInterjectStateForChat(targetChatId);
                const mergedQueueText = queuedTurnsOnDone.drainMerged();
                if (mergedQueueText) {
                  const relayBaseMessages = nextStreamMessages;
                  const relayCharacterConfig = resolvedCharacterConfig;
                  scheduleQueueRelayTimer(targetChatId, activeRunGeneration, () => {
                    void runTurnRequest({
                      mode: "send",
                      chatId: targetChatId,
                      text: mergedQueueText,
                      attachments: [],
                      baseMessages: relayBaseMessages,
                      clearComposer: false,
                      missingAttachmentPayloadMode: "block",
                      characterAgentConfig: relayCharacterConfig,
                    });
                  }, 0);
                }
                // Give the queue pile one render with status:"relayed" before
                // the buffer disappears; guard against clobbering a *new*
                // run's fresh buffer that may have replaced this one by then.
                scheduleQueueRelayTimer(targetChatId, activeRunGeneration, () => {
                  if (
                    queuedTurnsByChatIdRef.current.get(targetChatId) ===
                    queuedTurnsOnDone
                  ) {
                    queuedTurnsByChatIdRef.current.delete(targetChatId);
                    syncInterjectStateForChat(targetChatId);
                  }
                }, 1600);
              } else if (queuedTurnsOnDone) {
                queuedTurnsByChatIdRef.current.delete(targetChatId);
                syncInterjectStateForChat(targetChatId);
              }
            },
            onError: (error) => {
              if (!isCurrentRun()) {
                return;
              }
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
              const errorTime = Date.now();

              if (isDurableResume) {
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
                !isDurableResume &&
                errorCode === "memory_unavailable" &&
                memoryFallbackAttempted !== true
              ) {
                if (activeChatIdRef.current === targetChatId) {
                  setStreamError(
                    "Memory is unavailable for this request. Retrying with recent history.",
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
                  text: promptText,
                  attachments: persistedAttachments,
                  baseMessages: normalizedBaseMessages,
                  clearComposer: false,
                  reuseUserMessage: normalizedReuseUserMessage,
                  missingAttachmentPayloadMode,
                  memoryFallbackAttempted: true,
                  forceHistoryFallback: true,
                  historyOverride: retryHistory,
                  characterAgentConfig: resolvedCharacterConfig,
                  runGeneration: activeRunGeneration,
                });
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
              if (activeChatIdRef.current === targetChatId && !traceHasContent) {
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
                pendingClarifyByChatIdRef.current.get(targetChatId);
              if (pendingClarifyOnError) {
                pendingClarifyByChatIdRef.current.delete(targetChatId);
                let queuedTurnsForClarify =
                  queuedTurnsByChatIdRef.current.get(targetChatId);
                if (!queuedTurnsForClarify) {
                  queuedTurnsForClarify = createQueuedTurnBuffer();
                  queuedTurnsByChatIdRef.current.set(
                    targetChatId,
                    queuedTurnsForClarify,
                  );
                }
                queuedTurnsForClarify.push(pendingClarifyOnError.text);
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
              }
              syncStreamMessages(nextStreamMessages);
              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
              clearStreamingMessageStore(targetChatId, assistantMessageId);
              activeStreamsRef.current.delete(targetChatId);

              pendingFyiCountByChatIdRef.current.delete(targetChatId);
              activeRunThreadIdByChatIdRef.current.delete(targetChatId);

              const queuedTurnsOnError =
                queuedTurnsByChatIdRef.current.get(targetChatId);
              if (queuedTurnsOnError) {
                // Preserve queued input after an error. Only a normal onDone
                // may automatically relay it into a new generation.
                syncInterjectStateForChat(targetChatId);
              }
            },
          },
        );
      } catch (error) {
        if (!isCurrentRun()) {
          return false;
        }
        flushSubagentState(Date.now());
        activeFlushScheduler.flushSync();
        disposeBufferedTokenFlush();
        releaseTokenFlushController();
        const errorMessage = error?.message || "Failed to start stream";
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
        setStreamError(errorMessage);
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

        setMessages(
          nextMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  status: "error",
                  updatedAt: Date.now(),
                  content: `[error] ${errorMessage}`,
                }
              : message,
          ),
        );
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
      if (effectiveThreadId && streamAttemptId) {
        executionIdentityByChatIdRef.current.set(targetChatId, {
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
      }

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeChatIdRef,
      activeStreamsRef,
      appendSyntheticToolConfirmationDecision,
      beginRunGeneration,
      buildCharacterRunConfig,
      buildHistoryForModel,
      characterId,
      clearActiveTokenFlushController,
      clearAllPendingToolConfirmations,
      clearConfirmationResolutionTimer,
      clearDurableResumeStartedKeysForChat,
      clearResolvedToolConfirmationByCallId,
      getConfirmationRuntimeForChat,
      hydrateAttachmentPayloads,
      agentOrchestration,
      isCharacterChat,
      isRunGenerationCurrent,
      isToolCallAutoApprovable,
      markAllPendingConfirmationFollowupSignals,
      markConfirmationFollowupSignalByCallId,
      modelIdRef,
      messagesRef,
      resolveAttachmentPayloads,
      scheduleQueueRelayTimer,
      selectedToolkits,
      selectedWorkspaceIds,
      selectedRecipeName,
      setDraftAttachments,
      setInputValue,
      setMessages,
      setAgentOrchestration,
      setSelectedModelId,
      setStreamError,
      storageApi,
      submitAutoApprovedToolConfirmation,
      systemPromptOverrides,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );

  const lookupDurableInteraction = useCallback(
    async (
      targetChatId,
      targetSessionId,
      {
        autoResume = true,
        lookupAttempt = 0,
        runGeneration: requestedRunGeneration = null,
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
        const rawPending = await api.unchain.getPendingInteraction({
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
                sessionId: pending.sessionId,
                attemptId: lateAttemptId,
                sourceAttemptId: pending.sourceRunId || "",
                reason: "user_stop",
                createdAt: Date.now(),
              });
              void requestExecutionCancellationAndDisconnect({
                identity: queuedCancellation,
                handle: null,
                reason: "user_stop",
              }).then((result) => {
                if (result?.ok && queuedCancellation) {
                  removeExecutionCancel(
                    queuedCancellation.sessionId,
                    queuedCancellation.attemptId,
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

        const pendingAttemptId =
          pending.activeAttemptId || pending.sourceRunId || "";
        if (pendingAttemptId) {
          executionIdentityByChatIdRef.current.set(normalizedChatId, {
            sessionId: pending.sessionId,
            attemptId: pendingAttemptId,
            requestId: "",
            sourceAttemptId: pending.sourceRunId || "",
            runGeneration: activeRunGeneration,
          });
        }

        clearAllPendingToolConfirmations(normalizedChatId);
        const sourceMessages =
          activeChatIdRef.current === normalizedChatId &&
          Array.isArray(messagesRef.current)
            ? messagesRef.current
            : typeof storageApi.getChatMessages === "function"
              ? storageApi.getChatMessages(normalizedChatId)
              : [];
        const ensured = ensureDurableInteractionMessage(
          sourceMessages,
          pending,
        );
        if (ensured.created) {
          messagesRef.current = ensured.messages;
          if (activeChatIdRef.current === normalizedChatId) {
            setMessages(ensured.messages);
          }
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
        updatePendingToolConfirmationRequests(normalizedChatId, {
          [pending.interactionId]: confirmationRequest,
        });
        updateToolConfirmationUiState(normalizedChatId, {
          [pending.interactionId]: {
            status:
              pending.status === "receipt_recorded" ? "submitted" : "idle",
            error: "",
            resolved: pending.status === "receipt_recorded",
            decision:
              pending.resolution?.outcome === "approved"
                ? "approved"
                : pending.resolution?.outcome === "denied"
                  ? "denied"
                  : "",
          },
        });

        const pendingWithOwner = {
          ...pending,
          ownerMessageId: ensured.ownerMessageId,
        };
        updateDurableInteractionForChat(normalizedChatId, pendingWithOwner);

        if (pending.status !== "receipt_recorded") {
          return pendingWithOwner;
        }

        const resolutionResponse = pending.resolution?.response;
        const approved =
          pending.resolution?.outcome === "approved" ||
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

        if (!pending.resumeAvailable) {
          const unavailableMessage = pending.resumeUnavailableReason
            ? `This interrupted run cannot be resumed (${pending.resumeUnavailableReason}).`
            : "This interrupted run cannot be resumed.";
          updateDurableInteractionForChat(normalizedChatId, {
            ...pendingWithOwner,
            status: "resume_failed",
            lastError: unavailableMessage,
          });
          if (activeChatIdRef.current === normalizedChatId) {
            setStreamError(unavailableMessage);
          }
          return pendingWithOwner;
        }

        if (!autoResume || streamingChatIdsRef.current.has(normalizedChatId)) {
          return pendingWithOwner;
        }

        const resumeKey = [
          pending.sessionId,
          pending.interactionId,
          pending.receiptId || "",
        ].join(":");
        if (durableResumeStartedKeysRef.current.has(resumeKey)) {
          return pendingWithOwner;
        }
        trackDurableResumeStartedKey(normalizedChatId, resumeKey);
        updateDurableInteractionForChat(normalizedChatId, {
          ...pendingWithOwner,
          status: "resuming",
          resumeAttempt: 0,
          lastError: "",
        });

        const resumeMessages =
          activeChatIdRef.current === normalizedChatId &&
          Array.isArray(messagesRef.current)
            ? messagesRef.current
            : typeof storageApi.getChatMessages === "function"
              ? storageApi.getChatMessages(normalizedChatId)
              : ensured.messages;
        void runTurnRequest({
          mode: "resume_interaction",
          chatId: normalizedChatId,
          text: "",
          attachments: [],
          baseMessages: resumeMessages,
          clearComposer: false,
          durableInteraction: pendingWithOwner,
          durableResumeAttempt: 0,
          durableOwnerMessageId: ensured.ownerMessageId,
          runGeneration: activeRunGeneration,
        });
        return pendingWithOwner;
      } catch (error) {
        if (!isCurrentLookup()) {
          return null;
        }
        const errorMessage =
          error?.message || "Failed to inspect this chat for interrupted work.";
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
              autoResume,
              lookupAttempt: nextAttempt,
              runGeneration: activeRunGeneration,
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
      ensureRecoveryRunGeneration,
      getConfirmationRuntimeForChat,
      isRunGenerationCurrent,
      messagesRef,
      runTurnRequest,
      setMessages,
      setStreamError,
      storageApi,
      trackDurableResumeStartedKey,
      updateDurableInteractionForChat,
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );
  durableInteractionLookupRef.current = lookupDurableInteraction;

  useEffect(() => {
    const targetChatId =
      typeof chatId === "string" && chatId.trim() ? chatId.trim() : "";
    if (
      !targetChatId ||
      isStreaming ||
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
          const config = await buildCharacterRunConfig();
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
            setStreamError(errorMessage);
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
          autoResume: true,
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
    updateDurableInteractionForChat,
  ]);

  const sendForTest = useCallback(
    ({ text = "", attachments = [] } = {}) => {
      const chatId = activeChatIdRef.current;
      if (!chatId) {
        return Promise.reject(
          Object.assign(new Error("no active chat"), {
            code: "no_active_chat",
          }),
        );
      }
      if (durableInteractionByChatIdRef.current[chatId]?.status) {
        return Promise.reject(
          Object.assign(
            new Error("This chat is restoring an interrupted run."),
            { code: "durable_interaction_in_progress" },
          ),
        );
      }
      const baseLen = (messagesRef.current || []).length;
      const startedAt = Date.now();
      void runTurnRequest({
        mode: "send",
        chatId,
        text,
        attachments,
        baseMessages: messagesRef.current,
        clearComposer: true,
        missingAttachmentPayloadMode: "block",
      });
      return new Promise((resolve, reject) => {
        let timer;
        const interval = setInterval(() => {
          const msgs = messagesRef.current || [];
          const last = msgs[msgs.length - 1];
          const stillStreaming = streamingChatIdsRef.current.has(chatId);
          if (
            msgs.length > baseLen &&
            !stillStreaming &&
            last &&
            last.role === "assistant" &&
            last.content
          ) {
            clearInterval(interval);
            clearTimeout(timer);
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
            });
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
    [activeChatIdRef, messagesRef, runTurnRequest, streamingChatIdsRef],
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
      const thisChatsStreamActive = Boolean(
        streamingChatIdsRef.current.has(currentChatId) &&
          streamHandlesRef.current.has(currentChatId),
      );
      if (!currentChatId || (!text && !hasAttachments)) {
        return;
      }

      const durableState =
        durableInteractionByChatIdRef.current[currentChatId] || null;
      if (durableState?.status) {
        setStreamError(
          durableState.lastError ||
            "This chat is restoring an interrupted run. Please wait.",
        );
        return;
      }

      if (thisChatsStreamActive) {
        if (bypassInterject) {
          // Should not normally happen — see the comment above — but never
          // race a concurrent send into an active run.
          return;
        }
        // A send arrived while this chat's run is still active: route it
        // through the interject channels (fyi/btw/queue/clarify) instead of
        // silently dropping it.
        setInputValue("");
        setDraftAttachments([]);
        handleInterjectRef.current?.(currentChatId, text);
        return;
      }

      if (!api.unchain.isBridgeAvailable()) {
        setStreamError("Unchain bridge is unavailable in this runtime.");
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
      // re-run command tokens that were already handled upstream.
      const outgoingText = isProgrammaticSend
        ? text
        : (
            expandCommands(text, {
              isStreaming: false,
              selectedToolkits: selectedToolkitsRef.current,
            }).body || ""
          ).trim();

      if (!outgoingText && !hasAttachments) {
        return;
      }

      void runTurnRequest({
        mode: "send",
        chatId: currentChatId,
        text: outgoingText,
        attachments: currentDraftAttachments,
        baseMessages: messagesRef.current,
        clearComposer: !isProgrammaticSend,
        missingAttachmentPayloadMode: "block",
      });
    },
    [
      activeChatIdRef,
      attachmentsDisabledReason,
      attachmentsEnabled,
      isCharacterChat,
      messagesRef,
      runTurnRequest,
      setDraftAttachments,
      setInputValue,
      setStreamError,
    ],
  );

  const pushQueuedTurn = useCallback(
    (targetChatId, text) => {
      let queuedTurns = queuedTurnsByChatIdRef.current.get(targetChatId);
      if (!queuedTurns) {
        queuedTurns = createQueuedTurnBuffer();
        queuedTurnsByChatIdRef.current.set(targetChatId, queuedTurns);
      }
      queuedTurns.push(text);
      syncInterjectStateForChat(targetChatId);
    },
    [syncInterjectStateForChat],
  );

  /* Sends {threadId, text: body, channel} to the server and dispatches on
     whatever resolved_channel comes back — NOT on the channel we asked for,
     since the server (not the client) decides how a given run can actually
     absorb a mid-run message. `channel: "queue"` (explicit /queue) is the
     one case that never touches the server: it is purely a local buffer. */
  const dispatchInterjectChannel = useCallback(
    (targetChatId, body, channel) => {
      if (channel === "queue") {
        pushQueuedTurn(targetChatId, body);
        return;
      }

      const runGeneration = getRunGeneration(targetChatId);
      const threadId =
        activeRunThreadIdByChatIdRef.current.get(targetChatId) || targetChatId;
      const isCurrentDispatch = () =>
        isRunGenerationCurrent(targetChatId, runGeneration);
      if (!isCurrentDispatch()) {
        return;
      }

      api.unchain
        .interject({ threadId, text: body, channel })
        .then((result) => {
          if (!isCurrentDispatch()) {
            return;
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
            pendingFyiCountByChatIdRef.current.set(
              targetChatId,
              (pendingFyiCountByChatIdRef.current.get(targetChatId) || 0) + 1,
            );
            syncInterjectStateForChat(targetChatId);
            toast.success("Queued — will be injected next step", {
              dedupeKey: "interject-fyi-queued",
            });
            return;
          }

          if (resolvedChannel === "btw") {
            const answer =
              typeof result?.answer === "string" ? result.answer : "";
            appendLocalTraceFrame(targetChatId, {
              seq: dispatchTime,
              ts: dispatchTime,
              type: "side_answer",
              stage: "client",
              payload: { question: body, answer },
            });
            appendLocalInterjectionRecord(
              targetChatId,
              buildInterjectionRecord({
                type: "btw",
                text: body,
                origin: "user",
                answer,
                ts: dispatchTime,
              }),
            );
            return;
          }

          if (resolvedChannel === "queue") {
            pushQueuedTurn(targetChatId, body);
            return;
          }

          if (resolvedChannel === "clarify") {
            const clarifyId = `clarify-${dispatchTime}-${Math.random()
              .toString(16)
              .slice(2)}`;
            pendingClarifyByChatIdRef.current.set(targetChatId, {
              id: clarifyId,
              text: body,
            });
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
            return;
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
          if (stillActive) {
            pushQueuedTurn(targetChatId, body);
            return;
          }

          if (targetChatId === activeChatIdRef.current) {
            sendNewTurn({
              text: body,
              chatId: targetChatId,
              bypassInterject: true,
            });
          } else {
            // Background chat + no active run to relay into: we have no
            // reliable snapshot of that chat's persisted messages here (only
            // the active chat's messagesRef is available), so sending would
            // risk attaching this turn to the wrong chat. Log and drop
            // rather than corrupt another chat's history.
            unchainLogger.warn("interject_new_run_dropped_background", {
              chatId: targetChatId,
            });
          }
        })
        .catch((error) => {
          if (!isCurrentDispatch()) {
            return;
          }
          setStreamError(error?.message || "Failed to send interjection.");
        });
    },
    [
      activeChatIdRef,
      appendLocalInterjectionRecord,
      appendLocalTraceFrame,
      getRunGeneration,
      isRunGenerationCurrent,
      pushQueuedTurn,
      sendNewTurn,
      setStreamError,
      streamHandlesRef,
      streamingChatIdsRef,
      syncInterjectStateForChat,
    ],
  );

  const handleInterject = useCallback(
    (targetChatId, rawText) => {
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
      if (!trimmedBody) return;
      dispatchInterjectChannel(targetChatId, trimmedBody, channel);
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
      queuedTurns.remove(id);
      syncInterjectStateForChat(targetChatId);
    },
    [activeChatIdRef, syncInterjectStateForChat],
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

      const pending = pendingClarifyByChatIdRef.current.get(targetChatId);
      if (!pending) {
        return;
      }
      pendingClarifyByChatIdRef.current.delete(targetChatId);
      updateLocalClarifyFrame(targetChatId, pending.id, { status: "resolved" });
      dispatchInterjectChannel(targetChatId, pending.text, value);
    },
    [activeChatIdRef, dispatchInterjectChannel, updateLocalClarifyFrame],
  );

  const interjectState = interjectStateByChatId[chatId] || {
    pendingFyiCount: 0,
    queueItems: [],
  };

  const resendTurn = useCallback(
    async (message) => {
      const currentChatId = activeChatIdRef.current;
      const messageIndex = Array.isArray(messagesRef.current)
        ? messagesRef.current.findIndex((item) => item?.id === message?.id)
        : -1;
      const targetMessage =
        messageIndex >= 0 && messageIndex < messagesRef.current.length
          ? messagesRef.current[messageIndex]
          : null;
      const text =
        typeof targetMessage?.content === "string"
          ? targetMessage.content.trim()
          : "";
      const thisChatsStreamActive = Boolean(
        streamingChatIdsRef.current.has(currentChatId) &&
          streamHandlesRef.current.has(currentChatId),
      );
      if (
        !currentChatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        thisChatsStreamActive
      ) {
        return;
      }

      if (!api.unchain.isBridgeAvailable()) {
        setStreamError("Unchain bridge is unavailable in this runtime.");
        return;
      }

      const baseMessages = messagesRef.current.slice(0, messageIndex);
      const characterConfig = isCharacterChat
        ? await buildCharacterRunConfig().catch((error) => {
            setStreamError(
              error?.message || "Failed to prepare this character chat.",
            );
            return null;
          })
        : null;
      if (isCharacterChat && !characterConfig?.session_id) {
        return;
      }
      const memoryReplaced = await replaceSessionMemoryForMessages(
        characterConfig?.session_id || currentChatId,
        baseMessages,
        {
          forceMemoryEnabled: isCharacterChat,
          memoryNamespace: characterConfig?.run_memory_namespace || "",
        },
      );
      if (!memoryReplaced) {
        return;
      }
      const sourceAttachments = Array.isArray(targetMessage.attachments)
        ? targetMessage.attachments
        : [];
      const resendAttachments =
        sourceAttachments.length > 0 && !attachmentsEnabled
          ? []
          : sourceAttachments;
      if (sourceAttachments.length > 0 && !attachmentsEnabled) {
        setStreamError(
          "Current model does not support image/file input. Resending text only.",
        );
      }

      void runTurnRequest({
        mode: "resend",
        chatId: currentChatId,
        text,
        attachments: resendAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
        missingAttachmentPayloadMode: "degrade",
        characterAgentConfig: characterConfig,
      });
    },
    [
      activeChatIdRef,
      attachmentsEnabled,
      buildCharacterRunConfig,
      isCharacterChat,
      messagesRef,
      replaceSessionMemoryForMessages,
      runTurnRequest,
      setStreamError,
    ],
  );

  const editTurn = useCallback(
    async (message, nextContent) => {
      const currentChatId = activeChatIdRef.current;
      const messageIndex = Array.isArray(messagesRef.current)
        ? messagesRef.current.findIndex((item) => item?.id === message?.id)
        : -1;
      const targetMessage =
        messageIndex >= 0 && messageIndex < messagesRef.current.length
          ? messagesRef.current[messageIndex]
          : null;
      const text = typeof nextContent === "string" ? nextContent.trim() : "";
      const thisChatsStreamActive = Boolean(
        streamingChatIdsRef.current.has(currentChatId) &&
          streamHandlesRef.current.has(currentChatId),
      );
      if (
        !currentChatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        thisChatsStreamActive
      ) {
        return;
      }

      if (!api.unchain.isBridgeAvailable()) {
        setStreamError("Unchain bridge is unavailable in this runtime.");
        return;
      }

      const baseMessages = messagesRef.current.slice(0, messageIndex);
      const characterConfig = isCharacterChat
        ? await buildCharacterRunConfig().catch((error) => {
            setStreamError(
              error?.message || "Failed to prepare this character chat.",
            );
            return null;
          })
        : null;
      if (isCharacterChat && !characterConfig?.session_id) {
        return;
      }
      const memoryReplaced = await replaceSessionMemoryForMessages(
        characterConfig?.session_id || currentChatId,
        baseMessages,
        {
          forceMemoryEnabled: isCharacterChat,
          memoryNamespace: characterConfig?.run_memory_namespace || "",
        },
      );
      if (!memoryReplaced) {
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
        setStreamError(
          "Current model does not support image/file input. Sending text only.",
        );
      }

      void runTurnRequest({
        mode: "edit",
        chatId: currentChatId,
        text,
        attachments: originalAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
        missingAttachmentPayloadMode: "degrade",
        characterAgentConfig: characterConfig,
      });
    },
    [
      activeChatIdRef,
      attachmentsEnabled,
      buildCharacterRunConfig,
      isCharacterChat,
      messagesRef,
      replaceSessionMemoryForMessages,
      runTurnRequest,
      setStreamError,
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

      const turnMessageIds = collectTurnMessageIds(
        messagesRef.current,
        message.id,
      );
      if (turnMessageIds.size === 0) {
        return;
      }

      const deletingStreamingAssistant =
        message.role === "assistant" && message.status === "streaming";
      let workingMessages = Array.isArray(messagesRef.current)
        ? messagesRef.current
        : [];

      if (
        deletingStreamingAssistant &&
        streamHandlesRef.current.has(currentChatId) &&
        streamingChatIdsRef.current.has(currentChatId)
      ) {
        workingMessages = cancelCurrentStreamAndSettleMessages();
      }

      const nextMessages = workingMessages.filter(
        (item) => !turnMessageIds.has(item?.id),
      );
      const characterConfig = isCharacterChat
        ? await buildCharacterRunConfig().catch((error) => {
            setStreamError(
              error?.message || "Failed to prepare this character chat.",
            );
            return null;
          })
        : null;
      if (isCharacterChat && !characterConfig?.session_id) {
        return;
      }
      const memoryReplaced = await replaceSessionMemoryForMessages(
        characterConfig?.session_id || currentChatId,
        nextMessages,
        {
          forceMemoryEnabled: isCharacterChat,
          memoryNamespace: characterConfig?.run_memory_namespace || "",
        },
      );
      if (!memoryReplaced) {
        return;
      }

      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    },
    [
      activeChatIdRef,
      buildCharacterRunConfig,
      cancelCurrentStreamAndSettleMessages,
      isCharacterChat,
      messagesRef,
      replaceSessionMemoryForMessages,
      setMessages,
      setStreamError,
    ],
  );

  useEffect(() => {
    const confirmationRuntimeByChatId =
      confirmationRuntimeByChatIdRef.current;
    const streamHandles = streamHandlesRef.current;
    const executionIdentities = executionIdentityByChatIdRef.current;
    const streamingChatIds = streamingChatIdsRef.current;
    const activeStreams = activeStreamsRef.current;
    const activeRunThreadIdByChatId = activeRunThreadIdByChatIdRef.current;
    const queuedTurnsByChatId = queuedTurnsByChatIdRef.current;
    const pendingFyiCountByChatId = pendingFyiCountByChatIdRef.current;
    const pendingClarifyByChatId = pendingClarifyByChatIdRef.current;
    const durableResumeRetryTimers = durableResumeRetryTimersRef.current;
    const durableResumeStartedKeys = durableResumeStartedKeysRef.current;
    const durableResumeStartedKeysByChatId =
      durableResumeStartedKeysByChatIdRef.current;
    const runGenerationsByChatId = runGenerationByChatIdRef.current;
    const stoppedRunChatIds = stoppedRunChatIdsRef.current;
    const queueRelayTimersByChatId = queueRelayTimersByChatIdRef.current;
    const confirmationRetryWaitersByChatId =
      confirmationRetryWaitersByChatIdRef.current;
    const renderRuntimeByChatId = renderRuntimeByChatIdRef.current;

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
        disconnectStreamTransport(handle);
      }
      streamHandles.clear();
      executionIdentities.clear();
      streamingChatIds.clear();
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
      pendingContinuationRequestRef.current = null;
      activeRunThreadIdByChatId.clear();
      queuedTurnsByChatId.clear();
      pendingFyiCountByChatId.clear();
      pendingClarifyByChatId.clear();
      durableResumeRetryTimers.forEach((timerId) => clearTimeout(timerId));
      durableResumeRetryTimers.clear();
      durableResumeStartedKeys.clear();
      durableResumeStartedKeysByChatId.clear();
      queueRelayTimersByChatId.forEach((timerIds) => {
        timerIds.forEach((timerId) => clearTimeout(timerId));
      });
      queueRelayTimersByChatId.clear();
      confirmationRetryWaitersByChatId.forEach((waiters) => {
        waiters.forEach((waiter) => {
          clearTimeout(waiter.timerId);
          waiter.resolve(false);
        });
      });
      confirmationRetryWaitersByChatId.clear();
      durableInteractionByChatIdRef.current = {};
    };
  }, [
    activeStreamsRef,
    clearActiveTokenFlushController,
    clearAttachmentPayloads,
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
    isDurableInteractionBlocked,
    isStreaming,
    onClarifyResolve,
    onQueueUndo,
    pendingContinuationRequest,
    pendingToolConfirmationRequests,
    resendTurn,
    sendNewTurn,
    sendForTest,
    setStreamError,
    stopStream,
    streamError,
    toolConfirmationUiStateById,
  };
};
