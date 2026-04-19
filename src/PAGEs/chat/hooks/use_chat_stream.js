import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { readMemorySettings } from "../../../COMPONENTs/settings/memory/storage";
import { appendTokenUsageRecord } from "../../../COMPONENTs/settings/token_usage/storage";
import { createLogger } from "../../../SERVICEs/console_logger";
import { createThinkTagParser } from "../think_tag_parser";
import {
  collectTurnMessageIds,
  settleStreamingAssistantMessages,
} from "../utils/chat_turn_utils";
import { createAttachmentPrompt } from "../utils/chat_attachment_utils";
import { isToolAutoApproved } from "../../../SERVICEs/toolkit_auto_approve_store";
import {
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  cancelBackgroundPersist,
} from "./background_stream_persister";

const STREAM_TRACE_LEVEL = "minimal";
const DEFAULT_AGENT_ORCHESTRATION = Object.freeze({ mode: "default" });
const UNCHAIN_TRACE_LABEL_BY_TYPE = Object.freeze({
  memory_prepare: "memory_prepare",
  run_started: "start",
  request_messages: "request_messages",
  response_received: "response_received",
  memory_commit: "memory_commit",
  done: "end",
});
const HUMAN_INPUT_TOOL_NAME = "ask_user_question";

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
}) => {
  const {
    buildHistoryForModel,
    clearAttachmentPayloads,
    hydrateAttachmentPayloads,
    resolveAttachmentPayloads,
  } = attachmentApi;
  const [streamingChatIds, setStreamingChatIds] = useState(() => new Set());
  const [internalStreamError, setInternalStreamError] = useState("");
  const streamError =
    controlledStreamError !== undefined
      ? controlledStreamError
      : internalStreamError;
  const setStreamError =
    typeof controlledSetStreamError === "function"
      ? controlledSetStreamError
      : setInternalStreamError;
  const [pendingToolConfirmationRequests, setPendingToolConfirmationRequests] =
    useState({});
  const pendingToolConfirmationRequestsRef = useRef({});
  const [toolConfirmationUiStateById, setToolConfirmationUiStateById] =
    useState({});
  const toolConfirmationUiStateByIdRef = useRef({});
  const [pendingContinuationRequest, setPendingContinuationRequest] =
    useState(null);
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

  const streamHandlesRef = useRef(new Map());
  const streamingChatIdsRef = useRef(new Set());
  const sessionAutoApproveRef = useRef(new Set()); // keys: "toolkitId:toolName", cleared on chatId change
  const confirmationIdByCallIdRef = useRef(new Map());
  const confirmationCallIdByIdRef = useRef(new Map());
  const confirmationFollowupSignalByIdRef = useRef(new Map());
  const confirmationResolveTimerByIdRef = useRef(new Map());
  const activeTokenFlushControllerRef = useRef(null);
  const parentRunIdRef = useRef("");
  const subagentMetaByRunIdRef = useRef(new Map()); // childRunId → metadata
  const subagentFramesByRunIdRef = useRef(new Map()); // childRunId → frame[]
  const lastTokenRunIdRef = useRef("");

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
    (callId) => {
      const normalizedCallId = typeof callId === "string" ? callId.trim() : "";
      if (!normalizedCallId) {
        return null;
      }

      const currentChatId = activeChatIdRef.current;
      const streamState = activeStreamsRef.current.get(currentChatId);
      const streamMessages = Array.isArray(streamState?.messages)
        ? streamState.messages
        : [];

      for (const message of streamMessages) {
        const traceFrames = Array.isArray(message?.traceFrames)
          ? message.traceFrames
          : [];
        const frame = traceFrames.find(
          (candidate) =>
            candidate?.type === "tool_call" &&
            typeof candidate.payload?.call_id === "string" &&
            candidate.payload.call_id.trim() === normalizedCallId,
        );
        if (frame) {
          return frame;
        }
      }

      return null;
    },
    [activeChatIdRef, activeStreamsRef],
  );

  useEffect(() => {
    toolConfirmationUiStateByIdRef.current = toolConfirmationUiStateById;
  }, [toolConfirmationUiStateById]);

  /* Session-scoped "Don't ask again" list is reset whenever the active
   * chat changes, matching the semantics of "only in this session". */
  useEffect(() => {
    sessionAutoApproveRef.current.clear();
  }, [chatId]);

  const isStreaming = streamingChatIds.has(chatId);
  const hasBackgroundStream =
    streamingChatIds.size > 0 && !streamingChatIds.has(chatId);

  const clearActiveTokenFlushController = useCallback((mode = "dispose") => {
    const controller = activeTokenFlushControllerRef.current;
    if (!controller) {
      return;
    }

    if (mode === "flush" && typeof controller.flushNow === "function") {
      controller.flushNow();
    }

    if (typeof controller.dispose === "function") {
      controller.dispose();
    }

    activeTokenFlushControllerRef.current = null;
  }, []);

  const updateToolConfirmationUiState = useCallback((updater) => {
    const previous = toolConfirmationUiStateByIdRef.current;
    const next = typeof updater === "function" ? updater(previous) : updater;
    if (next === previous) {
      return previous;
    }
    toolConfirmationUiStateByIdRef.current = next;
    setToolConfirmationUiStateById(next);
    return next;
  }, []);

  const updatePendingToolConfirmationRequests = useCallback((updater) => {
    const previous = pendingToolConfirmationRequestsRef.current;
    const next = typeof updater === "function" ? updater(previous) : updater;
    if (next === previous) {
      return previous;
    }
    pendingToolConfirmationRequestsRef.current = next;
    setPendingToolConfirmationRequests(next);
    return next;
  }, []);

  const clearConfirmationResolutionTimer = useCallback((confirmationId) => {
    const normalizedId =
      typeof confirmationId === "string" ? confirmationId.trim() : "";
    if (!normalizedId) {
      return;
    }

    const timerId = confirmationResolveTimerByIdRef.current.get(normalizedId);
    if (timerId != null) {
      clearTimeout(timerId);
    }
    confirmationResolveTimerByIdRef.current.delete(normalizedId);
  }, []);

  const resolveSubmittedConfirmationFromSignal = useCallback(
    (confirmationId) => {
      const normalizedId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedId) {
        return;
      }
      clearConfirmationResolutionTimer(normalizedId);

      updateToolConfirmationUiState((previous) => {
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
    (callId) => {
      const normalizedCallId = typeof callId === "string" ? callId.trim() : "";
      if (!normalizedCallId) {
        return;
      }

      const confirmationId =
        confirmationIdByCallIdRef.current.get(normalizedCallId);
      if (!confirmationId) {
        return;
      }
      confirmationFollowupSignalByIdRef.current.set(confirmationId, true);
      resolveSubmittedConfirmationFromSignal(confirmationId);
    },
    [resolveSubmittedConfirmationFromSignal],
  );

  const markAllPendingConfirmationFollowupSignals = useCallback(() => {
    confirmationIdByCallIdRef.current.forEach((confirmationId) => {
      if (confirmationId) {
        confirmationFollowupSignalByIdRef.current.set(confirmationId, true);
        resolveSubmittedConfirmationFromSignal(confirmationId);
      }
    });
  }, [resolveSubmittedConfirmationFromSignal]);

  const clearResolvedToolConfirmationByCallId = useCallback(
    (callId) => {
      if (typeof callId !== "string" || !callId.trim()) {
        return;
      }
      const confirmationId = confirmationIdByCallIdRef.current.get(callId);
      if (!confirmationId) {
        return;
      }

      confirmationIdByCallIdRef.current.delete(callId);
      confirmationCallIdByIdRef.current.delete(confirmationId);
      confirmationFollowupSignalByIdRef.current.delete(confirmationId);
      clearConfirmationResolutionTimer(confirmationId);
      updatePendingToolConfirmationRequests((previous) => {
        if (!previous || !previous[confirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[confirmationId];
        return next;
      });
      updateToolConfirmationUiState((previous) => {
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
      updatePendingToolConfirmationRequests,
      updateToolConfirmationUiState,
    ],
  );

  const clearAllPendingToolConfirmations = useCallback(() => {
    const activeConfirmationIds = [
      ...new Set([
        ...confirmationIdByCallIdRef.current.values(),
        ...confirmationCallIdByIdRef.current.keys(),
        ...Object.keys(pendingToolConfirmationRequestsRef.current),
      ]),
    ];
    confirmationIdByCallIdRef.current.clear();
    confirmationCallIdByIdRef.current.clear();
    confirmationFollowupSignalByIdRef.current.clear();
    activeConfirmationIds.forEach((confirmationId) => {
      clearConfirmationResolutionTimer(confirmationId);
    });
    if (activeConfirmationIds.length === 0) {
      return;
    }

    updatePendingToolConfirmationRequests((previous) => {
      const next = { ...previous };
      let changed = false;
      activeConfirmationIds.forEach((confirmationId) => {
        if (confirmationId && next[confirmationId]) {
          delete next[confirmationId];
          changed = true;
        }
      });
      return changed ? next : previous;
    });

    updateToolConfirmationUiState((previous) => {
      const next = { ...previous };
      let changed = false;
      activeConfirmationIds.forEach((confirmationId) => {
        if (confirmationId && next[confirmationId]) {
          delete next[confirmationId];
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [
    clearConfirmationResolutionTimer,
    updatePendingToolConfirmationRequests,
    updateToolConfirmationUiState,
  ]);

  const cancelCurrentStreamAndSettleMessages = useCallback(() => {
    const currentChatId = activeChatIdRef.current;
    clearActiveTokenFlushController("dispose");
    const handle = streamHandlesRef.current.get(currentChatId);
    if (handle && typeof handle.cancel === "function") {
      handle.cancel();
    }
    cancelBackgroundPersist(currentChatId);
    streamHandlesRef.current.delete(currentChatId);
    streamingChatIdsRef.current.delete(currentChatId);
    activeStreamsRef.current.delete(currentChatId);
    setStreamingChatIds((prev) => {
      const next = new Set(prev);
      next.delete(currentChatId);
      return next;
    });
    confirmationIdByCallIdRef.current.clear();
    confirmationCallIdByIdRef.current.clear();
    confirmationFollowupSignalByIdRef.current.clear();
    confirmationResolveTimerByIdRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    confirmationResolveTimerByIdRef.current.clear();
    pendingToolConfirmationRequestsRef.current = {};
    setPendingToolConfirmationRequests({});
    toolConfirmationUiStateByIdRef.current = {};
    setToolConfirmationUiStateById({});
    pendingContinuationRequestRef.current = null;
    setPendingContinuationRequest(null);
    const { changed, nextMessages } = settleStreamingAssistantMessages(
      messagesRef.current,
    );
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
    clearActiveTokenFlushController,
    messagesRef,
    setMessages,
    storageApi,
  ]);

  const stopStream = useCallback(() => {
    cancelCurrentStreamAndSettleMessages();
  }, [cancelCurrentStreamAndSettleMessages]);

  const appendSyntheticToolConfirmationDecision = useCallback(
    ({ confirmationId, approved, userResponse }) => {
      const normalizedConfirmationId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedConfirmationId) {
        return false;
      }

      const callId =
        confirmationCallIdByIdRef.current.get(normalizedConfirmationId) || "";
      const targetChatId = activeChatIdRef.current;
      const streamState = activeStreamsRef.current.get(targetChatId);
      const streamMessages = Array.isArray(streamState?.messages)
        ? streamState.messages
        : [];
      if (!callId || !targetChatId || streamMessages.length === 0) {
        return false;
      }

      const decisionFrameType = approved ? "tool_confirmed" : "tool_denied";
      const patchTime = Date.now();
      let changed = false;

      const nextStreamMessages = streamMessages.map((message) => {
        const traceFrames = Array.isArray(message?.traceFrames)
          ? message.traceFrames
          : [];
        const requestFrame = traceFrames.find(
          (frame) =>
            frame?.type === "tool_call" &&
            (frame?.payload?.confirmation_id === normalizedConfirmationId ||
              frame?.payload?.call_id === callId),
        );
        if (!requestFrame) {
          return message;
        }

        const alreadyRecorded = traceFrames.some(
          (frame) =>
            frame?.type === decisionFrameType &&
            frame?.payload?.call_id === callId,
        );
        if (alreadyRecorded) {
          return message;
        }

        changed = true;

        const maxSeq = traceFrames.reduce((highest, frame) => {
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
          ...message,
          updatedAt: patchTime,
          traceFrames: [
            ...traceFrames,
            {
              seq: maxSeq + 0.1,
              ts: patchTime,
              type: decisionFrameType,
              stage: "client",
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
        };
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
        // Tool confirmation is infrequent + user-visible — bypass the throttle.
        cancelBackgroundPersist(targetChatId);
        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      }

      return true;
    },
    [activeChatIdRef, activeStreamsRef, setMessages, storageApi],
  );

  const handleToolConfirmationDecision = useCallback(
    async ({ confirmationId, approved, userResponse, scope }) => {
      const normalizedConfirmationId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedConfirmationId) {
        return;
      }

      const callId =
        confirmationCallIdByIdRef.current.get(normalizedConfirmationId) || "";
      const requestFrame = findToolCallFrameByCallId(callId);
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
        toolConfirmationUiStateByIdRef.current[normalizedConfirmationId] || {};
      if (current.status === "submitting" || current.status === "submitted") {
        return;
      }

      updateToolConfirmationUiState((previous) => ({
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
        };
        if (userResponse !== undefined && userResponse !== null) {
          payload.modified_arguments = { user_response: userResponse };
        }
        await api.unchain.respondToolConfirmation(payload);
        if (
          confirmationFollowupSignalByIdRef.current.get(
            normalizedConfirmationId,
          ) !== true
        ) {
          confirmationFollowupSignalByIdRef.current.set(
            normalizedConfirmationId,
            false,
          );
        }
        clearConfirmationResolutionTimer(normalizedConfirmationId);
        appendSyntheticToolConfirmationDecision({
          confirmationId: normalizedConfirmationId,
          approved: Boolean(approved),
          userResponse,
        });
        updateToolConfirmationUiState((previous) => ({
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
      } catch (error) {
        clearConfirmationResolutionTimer(normalizedConfirmationId);
        const errorMessage =
          (typeof error?.message === "string" && error.message) ||
          "Failed to submit confirmation";
        updateToolConfirmationUiState((previous) => ({
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
      clearConfirmationResolutionTimer,
      findToolCallFrameByCallId,
      updateToolConfirmationUiState,
    ],
  );

  const handleContinuationDecision = useCallback(
    async ({ confirmationId, approved }) => {
      const normalizedId =
        typeof confirmationId === "string" ? confirmationId.trim() : "";
      if (!normalizedId) return;

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
        await api.unchain.respondToolConfirmation({
          confirmation_id: normalizedId,
          approved: Boolean(approved),
          reason: "",
        });
        pendingContinuationRequestRef.current = null;
        setPendingContinuationRequest(null);
      } catch (_error) {
        pendingContinuationRequestRef.current = { ...current, status: "idle" };
        setPendingContinuationRequest((prev) =>
          prev ? { ...prev, status: "idle" } : prev,
        );
      }
    },
    [],
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
    }) => {
      const trimmedText = typeof text === "string" ? text.trim() : "";
      const normalizedAttachments = Array.isArray(attachments)
        ? attachments
        : [];
      const hasAttachments = normalizedAttachments.length > 0;
      const promptText =
        trimmedText ||
        (hasAttachments ? createAttachmentPrompt(normalizedAttachments) : "");

      if (!targetChatId || (!promptText && !hasAttachments)) {
        return false;
      }

      clearActiveTokenFlushController("dispose");

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

      confirmationIdByCallIdRef.current.clear();
      confirmationCallIdByIdRef.current.clear();
      confirmationFollowupSignalByIdRef.current.clear();
      confirmationResolveTimerByIdRef.current.forEach((timerId) => {
        clearTimeout(timerId);
      });
      confirmationResolveTimerByIdRef.current.clear();
      pendingToolConfirmationRequestsRef.current = {};
      setPendingToolConfirmationRequests({});
      toolConfirmationUiStateByIdRef.current = {};
      setToolConfirmationUiStateById({});
      pendingContinuationRequestRef.current = null;
      setPendingContinuationRequest(null);
      parentRunIdRef.current = "";
      subagentMetaByRunIdRef.current.clear();
      subagentFramesByRunIdRef.current.clear();
      lastTokenRunIdRef.current = "";

      const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timestamp = Date.now();

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

      const { payloads: attachmentPayloads, missingAttachmentNames } =
        resolveAttachmentPayloads(targetChatId, normalizedAttachments);
      let persistedAttachments = normalizedAttachments;
      let payloadAttachments = attachmentPayloads;

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

      const userMessage = { ...userMessageSeed };
      if (persistedAttachments.length > 0) {
        userMessage.attachments = persistedAttachments;
      } else if ("attachments" in userMessage) {
        delete userMessage.attachments;
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

      let resolvedCharacterConfig = characterAgentConfig;
      if (isCharacterChat) {
        if (!resolvedCharacterConfig) {
          try {
            resolvedCharacterConfig = await buildCharacterRunConfig();
          } catch (error) {
            setStreamError(
              error?.message || "Failed to prepare this character chat.",
            );
            return false;
          }
        }

        if (!resolvedCharacterConfig?.session_id) {
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

      const assistantPlaceholder = {
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

      const memoryEnabled =
        forceHistoryFallback === true
          ? false
          : forceMemoryEnabled === true ||
            readMemorySettings().enabled === true;
      const historyForModel = Array.isArray(historyOverride)
        ? historyOverride
          : memoryEnabled
          ? []
          : buildHistoryForModel(normalizedBaseMessages, targetChatId);

      const nextMessages = [
        ...normalizedBaseMessages,
        userMessage,
        assistantPlaceholder,
      ];

      setMessages(nextMessages);
      if (clearComposer) {
        setInputValue("");
        setDraftAttachments([]);
      }
      setStreamError("");
      setStreamingChatIds((prev) => new Set(prev).add(targetChatId));
      streamingChatIdsRef.current.add(targetChatId);
      activeStreamsRef.current.set(targetChatId, {
        messages: nextMessages,
      });

      let streamMessages = nextMessages;
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamsRef.current.set(targetChatId, {
          messages: nextStreamMessages,
        });

        if (activeChatIdRef.current === targetChatId) {
          setMessages(nextStreamMessages);
          return;
        }

        scheduleBackgroundPersist(targetChatId, nextStreamMessages);
      };

      const serializeSubagentFramesByRunId = () =>
        Object.fromEntries(
          Array.from(subagentFramesByRunIdRef.current.entries()).map(
            ([runId, frames]) => [runId, Array.isArray(frames) ? [...frames] : []],
          ),
        );

      const serializeSubagentMetaByRunId = () =>
        Object.fromEntries(
          Array.from(subagentMetaByRunIdRef.current.entries()).map(
            ([runId, meta]) => [
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
            ],
          ),
        );

      const isKnownSubagentRunId = (runId) =>
        typeof runId === "string" &&
        runId.length > 0 &&
        (!parentRunIdRef.current || runId !== parentRunIdRef.current) &&
        (subagentMetaByRunIdRef.current.has(runId) ||
          subagentFramesByRunIdRef.current.has(runId));

      const upsertSubagentMeta = (childRunId, updates) => {
        if (typeof childRunId !== "string" || !childRunId.trim()) {
          return null;
        }

        const previousMeta =
          subagentMetaByRunIdRef.current.get(childRunId) || {};
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

        subagentMetaByRunIdRef.current.set(childRunId, nextMeta);
        if (!subagentFramesByRunIdRef.current.has(childRunId)) {
          subagentFramesByRunIdRef.current.set(childRunId, []);
        }
        return nextMeta;
      };

      const syncAssistantSubagentState = (patchTime) => {
        const serializedFrames = serializeSubagentFramesByRunId();
        const serializedMeta = serializeSubagentMetaByRunId();
        const nextStreamMessages = streamMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                updatedAt: patchTime,
                subagentFrames: serializedFrames,
                subagentMetaByRunId: serializedMeta,
              }
            : message,
        );
        syncStreamMessages(nextStreamMessages);
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
        const nextStreamMessages = streamMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: `${typeof message.content === "string" ? message.content : ""}${deltaChunk}`,
                updatedAt: patchTime,
              }
            : message,
        );
        syncStreamMessages(nextStreamMessages);
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
      activeTokenFlushControllerRef.current = tokenFlushController;
      const releaseTokenFlushController = () => {
        if (activeTokenFlushControllerRef.current === tokenFlushController) {
          activeTokenFlushControllerRef.current = null;
        }
      };

      let streamHandle = null;
      try {
        const systemPromptOverridesObject =
          systemPromptOverrides &&
          typeof systemPromptOverrides === "object" &&
          !Array.isArray(systemPromptOverrides)
            ? systemPromptOverrides
            : {};

        streamHandle = api.unchain.startStreamV2(
          {
            threadId: effectiveThreadId,
            message: promptText,
            history: historyForModel,
            attachments: payloadAttachments,
            options: {
              modelId: effectiveModelId,
              ...(forceHistoryFallback === true
                ? { memory_enabled: false }
                : forceMemoryEnabled === true
                  ? { memory_enabled: true }
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
              ...(!isCharacterChat && {
                agent_orchestration: effectiveAgentOrchestration,
              }),
              ...(isCharacterChat
                ? {
                    agent_instructions:
                      typeof resolvedCharacterConfig?.instructions === "string"
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
          },
          {
            onFrame: (frame) => {
              /* Sync closure with external updates (e.g. appendSyntheticToolConfirmationDecision
                 writes to activeStreamsRef but cannot update the closure variable). */
              const _refMsgs = activeStreamsRef.current.get(targetChatId)?.messages;
              if (Array.isArray(_refMsgs) && _refMsgs.length > 0) {
                streamMessages = _refMsgs;
              }

              if (!frame) return;
              if (frame.type === "token_delta") {
                lastTokenRunIdRef.current =
                  frame.run_id || frame.payload?.run_id || "";
                return;
              }

              if (frame.type === "request_messages") {
                const rawMessages = Array.isArray(frame.payload?.messages)
                  ? frame.payload.messages
                  : [];
                const requestMessagesForLog = JSON.parse(
                  JSON.stringify(rawMessages),
                );
                const systemPrompt =
                  typeof frame.payload?.system === "string"
                    ? frame.payload.system.trim()
                    : "";
                if (systemPrompt) {
                  requestMessagesForLog.unshift({
                    role: "system",
                    content: systemPrompt,
                  });
                }
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
                  messages: requestMessagesForLog,
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
                if (frame.type === "run_started" && !parentRunIdRef.current) {
                  parentRunIdRef.current = frame.run_id || frame.payload?.run_id || "";
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
                              : typeof subagentMetaByRunIdRef.current.get(
                                    childRunId,
                                  )?.status === "string"
                                ? subagentMetaByRunIdRef.current.get(
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
                  syncAssistantSubagentState(patchTime);
                }
                unchainLogger.log(frame.type, frame.payload);
                return;
              }

              const frameRunId = frame.run_id || frame.payload?.run_id || "";

              /* ── Route subagent frames to their sub-timeline ── */
              /* Known subagent: run_id already registered via lifecycle events */
              const isKnownChild = isKnownSubagentRunId(frameRunId);
              /* Unknown run_id that differs from parent: likely a subagent whose
                 lifecycle event hasn't arrived yet (race condition) or whose
                 run_id format differs. Register it eagerly. */
              const isUnknownChild =
                !isKnownChild &&
                frameRunId.length > 0 &&
                parentRunIdRef.current &&
                frameRunId !== parentRunIdRef.current;

              if (frameRunId && frameRunId !== parentRunIdRef.current) {
                unchainLogger.log("subagent_frame_routing", {
                  frameType: frame.type,
                  runId: frameRunId,
                  parentRunId: parentRunIdRef.current || "",
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
                if (!subagentFramesByRunIdRef.current.has(frameRunId)) {
                  subagentFramesByRunIdRef.current.set(frameRunId, []);
                }
                subagentFramesByRunIdRef.current.get(frameRunId).push(frame);

                if (
                  frame.type === "error" &&
                  typeof subagentMetaByRunIdRef.current.get(frameRunId) ===
                    "object" &&
                  subagentMetaByRunIdRef.current.get(frameRunId) !== null
                ) {
                  upsertSubagentMeta(frameRunId, {
                    status: "failed",
                  });
                }

                syncAssistantSubagentState(patchTime);
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
                const toolkitId =
                  typeof frame.payload?.toolkit_id === "string"
                    ? frame.payload.toolkit_id
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
                  confirmationIdByCallIdRef.current.set(callId, confirmationId);
                  confirmationCallIdByIdRef.current.set(confirmationId, callId);
                  updatePendingToolConfirmationRequests((previous) =>
                    previous[confirmationId]
                      ? previous
                      : {
                          ...previous,
                          [confirmationId]: {
                            confirmationId,
                            callId,
                            toolName,
                            toolDisplayName:
                              typeof frame.payload?.tool_display_name ===
                              "string"
                                ? frame.payload.tool_display_name
                                : "",
                            arguments:
                              frame.payload?.arguments &&
                              typeof frame.payload.arguments === "object"
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
                            requestedAt: patchTime,
                          },
                        },
                  );
                  if (
                    confirmationFollowupSignalByIdRef.current.get(
                      confirmationId,
                    ) !== true
                  ) {
                    confirmationFollowupSignalByIdRef.current.set(
                      confirmationId,
                      false,
                    );
                  }
                  updateToolConfirmationUiState((previous) =>
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

                  /* ── Auto-approve: only for "confirmation" type, never for user-input types ── */
                  const itype =
                    typeof frame.payload?.interact_type === "string"
                      ? frame.payload.interact_type
                      : "";
                  const isSessionAllowed = sessionAutoApproveRef.current.has(
                    `${toolkitId}:${toolName}`,
                  );
                  const isAutoApprovable =
                    toolName !== HUMAN_INPUT_TOOL_NAME &&
                    (!itype || itype === "confirmation") &&
                    (isToolAutoApproved(toolkitId, toolName) || isSessionAllowed);
                  if (isAutoApprovable) {
                    const autoPayload = {
                      confirmation_id: confirmationId,
                      approved: true,
                      reason: "",
                    };
                    api.unchain
                      .respondToolConfirmation(autoPayload)
                      .then(() => {
                        if (
                          confirmationFollowupSignalByIdRef.current.get(
                            confirmationId,
                          ) !== true
                        ) {
                          confirmationFollowupSignalByIdRef.current.set(
                            confirmationId,
                            false,
                          );
                        }
                        clearConfirmationResolutionTimer(confirmationId);
                        appendSyntheticToolConfirmationDecision({
                          confirmationId,
                          approved: true,
                        });
                        updateToolConfirmationUiState((prev) => ({
                          ...prev,
                          [confirmationId]: {
                            ...(prev[confirmationId] || {}),
                            status: "submitted",
                            error: "",
                            resolved: true,
                            decision: "approved",
                          },
                        }));
                      })
                      .catch(() => {
                        /* silent — user can still manually approve */
                      });
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
                clearResolvedToolConfirmationByCallId(callId);
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
                markConfirmationFollowupSignalByCallId(callId);
              } else if (frame.type === "error" || frame.type === "done") {
                markAllPendingConfirmationFollowupSignals();
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

                  const currentContent =
                    typeof message.content === "string" ? message.content : "";
                  const hasToolActivity = (message.traceFrames || []).some(
                    (traceFrame) =>
                      traceFrame.type === "tool_call" ||
                      traceFrame.type === "tool_result",
                  );

                  const useAccumulated =
                    !hasToolActivity &&
                    currentContent.trim() === finalContent.trim() &&
                    currentContent.length > 0;

                  return {
                    ...message,
                    content: useAccumulated ? currentContent : finalContent,
                    updatedAt: patchTime,
                    traceFrames: [...(message.traceFrames || []), frame],
                  };
                });
                syncStreamMessages(nextStreamMessages);
                return;
              }

              if (frame.type === "tool_call") {
                const nextStreamMessages = streamMessages.map((message) => {
                  if (message.id !== assistantMessageId) return message;

                  const currentContent =
                    typeof message.content === "string" ? message.content : "";
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
                          payload: { content: currentContent },
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
                    ...message,
                    content: "",
                    updatedAt: patchTime,
                    traceFrames: mergedFrames,
                  };
                });
                syncStreamMessages(nextStreamMessages);
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
              if (
                lastTokenRunIdRef.current &&
                isKnownSubagentRunId(lastTokenRunIdRef.current)
              ) {
                lastTokenRunIdRef.current = "";
                return;
              }
              lastTokenRunIdRef.current = "";
              if (typeof delta !== "string" || !delta) {
                return;
              }

              thinkTagParser.feed(delta);
            },
            onDone: (done) => {
              /* Sync closure with external updates before building final messages. */
              const _refMsgs = activeStreamsRef.current.get(targetChatId)?.messages;
              if (Array.isArray(_refMsgs) && _refMsgs.length > 0) {
                streamMessages = _refMsgs;
              }

              thinkTagParser.flush();
              flushBufferedTokenDelta();
              const doneTime = Date.now();
              const bundle =
                done?.bundle && typeof done.bundle === "object"
                  ? { ...done.bundle }
                  : undefined;
              const nextAgentOrchestration =
                bundle && bundle.agent_orchestration
                  ? normalizeAgentOrchestration(bundle.agent_orchestration)
                  : null;

              const nextStreamMessages = streamMessages.map((message) => {
                if (message.id !== assistantMessageId) return message;
                let cleanContent =
                  typeof message.content === "string" ? message.content : "";
                cleanContent = cleanContent
                  .replace(/<think>[\s\S]*?<\/think>/g, "")
                  .replace(/^\s*\n/, "");
                return {
                  ...message,
                  content: cleanContent,
                  status: "done",
                  updatedAt: doneTime,
                  meta: {
                    ...(message.meta || {}),
                    ...(bundle ? { bundle } : {}),
                  },
                };
              });
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

              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
              streamHandlesRef.current.delete(targetChatId);
              streamingChatIdsRef.current.delete(targetChatId);
              activeStreamsRef.current.delete(targetChatId);
              setStreamingChatIds((prev) => {
                const next = new Set(prev);
                next.delete(targetChatId);
                return next;
              });
              clearAllPendingToolConfirmations();
              disposeBufferedTokenFlush();
              releaseTokenFlushController();
              if (activeChatIdRef.current !== targetChatId) {
                storageApi.setChatGeneratedUnread(targetChatId, true, {
                  source: "chat-page",
                });
              }
            },
            onError: (error) => {
              thinkTagParser.flush();
              flushBufferedTokenDelta();
              if (
                !streamHandlesRef.current.has(targetChatId) &&
                !streamingChatIdsRef.current.has(targetChatId)
              ) {
                disposeBufferedTokenFlush();
                releaseTokenFlushController();
                return;
              }
              const errorMessage = error?.message || "Unknown stream error";
              const errorCode = error?.code || "stream_error";
              const errorTime = Date.now();

              if (
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
                clearAllPendingToolConfirmations();
                disposeBufferedTokenFlush();
                releaseTokenFlushController();

                const retryHistory = buildHistoryForModel(
                  streamMessages,
                  targetChatId,
                );
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
              clearAllPendingToolConfirmations();
              disposeBufferedTokenFlush();
              releaseTokenFlushController();

              const nextStreamMessages = streamMessages.map((message) => {
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

                return {
                  ...message,
                  status: "error",
                  updatedAt: errorTime,
                  content: hasTrace
                    ? message.content
                    : message.content || `[error] ${errorMessage}`,
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
                };
              });
              syncStreamMessages(nextStreamMessages);
              if (activeChatIdRef.current !== targetChatId) {
                flushBackgroundPersist(targetChatId);
              }
              activeStreamsRef.current.delete(targetChatId);
            },
          },
        );
      } catch (error) {
        disposeBufferedTokenFlush();
        releaseTokenFlushController();
        const errorMessage = error?.message || "Failed to start stream";
        setStreamError(errorMessage);
        cancelBackgroundPersist(targetChatId);
        streamHandlesRef.current.delete(targetChatId);
        streamingChatIdsRef.current.delete(targetChatId);
        activeStreamsRef.current.delete(targetChatId);
        setStreamingChatIds((prev) => {
          const next = new Set(prev);
          next.delete(targetChatId);
          return next;
        });

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

      if (streamHandle?.requestId) {
        const nextStreamMessages = streamMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                meta: {
                  ...(message.meta || {}),
                  requestId: streamHandle.requestId,
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
      buildCharacterRunConfig,
      buildHistoryForModel,
      characterId,
      clearActiveTokenFlushController,
      clearAllPendingToolConfirmations,
      clearConfirmationResolutionTimer,
      clearResolvedToolConfirmationByCallId,
      hydrateAttachmentPayloads,
      agentOrchestration,
      isCharacterChat,
      markAllPendingConfirmationFollowupSignals,
      markConfirmationFollowupSignalByCallId,
      modelIdRef,
      messagesRef,
      resolveAttachmentPayloads,
      selectedToolkits,
      selectedWorkspaceIds,
      setDraftAttachments,
      setInputValue,
      setMessages,
      setAgentOrchestration,
      setSelectedModelId,
      setStreamError,
      storageApi,
      systemPromptOverrides,
      updateToolConfirmationUiState,
    ],
  );

  const sendNewTurn = useCallback(() => {
    const currentChatId = activeChatIdRef.current;
    const text = inputValueRef.current.trim();
    const currentDraftAttachments = draftAttachmentsRef.current;
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
    if (!currentChatId || (!text && !hasAttachments) || thisChatsStreamActive) {
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

    void runTurnRequest({
      mode: "send",
      chatId: currentChatId,
      text,
      attachments: currentDraftAttachments,
      baseMessages: messagesRef.current,
      clearComposer: true,
      missingAttachmentPayloadMode: "block",
    });
  }, [
    activeChatIdRef,
    attachmentsDisabledReason,
    attachmentsEnabled,
    isCharacterChat,
    messagesRef,
    runTurnRequest,
    setStreamError,
  ]);

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
    const confirmationIdByCallId = confirmationIdByCallIdRef.current;
    const confirmationCallIdById = confirmationCallIdByIdRef.current;
    const confirmationFollowupSignalById =
      confirmationFollowupSignalByIdRef.current;
    const confirmationResolveTimerById =
      confirmationResolveTimerByIdRef.current;
    const streamHandles = streamHandlesRef.current;
    const streamingChatIds = streamingChatIdsRef.current;
    const activeStreams = activeStreamsRef.current;

    return () => {
      clearActiveTokenFlushController("dispose");
      for (const handle of streamHandles.values()) {
        if (handle && typeof handle.cancel === "function") {
          handle.cancel();
        }
      }
      streamHandles.clear();
      streamingChatIds.clear();
      activeStreams.clear();
      clearAttachmentPayloads();
      confirmationIdByCallId.clear();
      confirmationCallIdById.clear();
      confirmationFollowupSignalById.clear();
      confirmationResolveTimerById.forEach((timerId) => {
        clearTimeout(timerId);
      });
      confirmationResolveTimerById.clear();
      pendingToolConfirmationRequestsRef.current = {};
      pendingContinuationRequestRef.current = null;
    };
  }, [
    activeStreamsRef,
    clearActiveTokenFlushController,
    clearAttachmentPayloads,
  ]);

  return {
    deleteTurn,
    editTurn,
    handleContinuationDecision,
    handleToolConfirmationDecision,
    hasBackgroundStream,
    isStreaming,
    pendingContinuationRequest,
    pendingToolConfirmationRequests,
    resendTurn,
    sendNewTurn,
    setStreamError,
    stopStream,
    streamError,
    toolConfirmationUiStateById,
  };
};
