import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import { readMemorySettings } from "../../../COMPONENTs/settings/memory/storage";
import { appendTokenUsageRecord } from "../../../COMPONENTs/settings/token_usage/storage";
import { createLogger } from "../../../SERVICEs/console_logger";
import { createThinkTagParser } from "../think_tag_parser";
import { collectTurnMessageIds, settleStreamingAssistantMessages } from "../utils/chat_turn_utils";
import { createAttachmentPrompt } from "../utils/chat_attachment_utils";

const STREAM_TRACE_LEVEL = "minimal";
const MISO_TRACE_LABEL_BY_TYPE = Object.freeze({
  memory_prepare: "memory_prepare",
  run_started: "start",
  request_messages: "request_messages",
  response_received: "response_received",
  memory_commit: "memory_commit",
  done: "end",
});
const HUMAN_INPUT_TOOL_NAME = "ask_user_question";

const misoLogger = createLogger("MISO", "src/PAGEs/chat/hooks/use_chat_stream.js");

export const useChatStream = ({
  chatId,
  messages,
  setMessages,
  inputValue,
  setInputValue,
  draftAttachments,
  setDraftAttachments,
  selectedModelId,
  selectedToolkits,
  selectedWorkspaceIds,
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
  activeStreamMessagesRef,
}) => {
  const {
    buildHistoryForModel,
    clearAttachmentPayloads,
    hydrateAttachmentPayloads,
    resolveAttachmentPayloads,
  } = attachmentApi;
  const [streamingChatId, setStreamingChatId] = useState(null);
  const [internalStreamError, setInternalStreamError] = useState("");
  const streamError =
    controlledStreamError !== undefined
      ? controlledStreamError
      : internalStreamError;
  const setStreamError =
    typeof controlledSetStreamError === "function"
      ? controlledSetStreamError
      : setInternalStreamError;
  const [toolConfirmationUiStateById, setToolConfirmationUiStateById] =
    useState({});
  const toolConfirmationUiStateByIdRef = useRef({});
  const [pendingContinuationRequest, setPendingContinuationRequest] =
    useState(null);
  const pendingContinuationRequestRef = useRef(null);

  const streamHandleRef = useRef(null);
  const streamingChatIdRef = useRef(null);
  const confirmationIdByCallIdRef = useRef(new Map());
  const confirmationCallIdByIdRef = useRef(new Map());
  const confirmationFollowupSignalByIdRef = useRef(new Map());
  const confirmationResolveTimerByIdRef = useRef(new Map());
  const activeTokenFlushControllerRef = useRef(null);

  const findToolCallFrameByCallId = useCallback(
    (callId) => {
      const normalizedCallId =
        typeof callId === "string" ? callId.trim() : "";
      if (!normalizedCallId) {
        return null;
      }

      const streamState = activeStreamMessagesRef.current;
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
    [activeStreamMessagesRef],
  );

  useEffect(() => {
    toolConfirmationUiStateByIdRef.current = toolConfirmationUiStateById;
  }, [toolConfirmationUiStateById]);

  const isStreaming = streamingChatId === chatId;
  const hasBackgroundStream = Boolean(streamingChatId && streamingChatId !== chatId);

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
      updateToolConfirmationUiState((previous) => {
        if (!previous || !previous[confirmationId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[confirmationId];
        return next;
      });
    },
    [clearConfirmationResolutionTimer, updateToolConfirmationUiState],
  );

  const clearAllPendingToolConfirmations = useCallback(() => {
    const activeConfirmationIds = [
      ...new Set([
        ...confirmationIdByCallIdRef.current.values(),
        ...confirmationCallIdByIdRef.current.keys(),
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
  }, [clearConfirmationResolutionTimer, updateToolConfirmationUiState]);

  const cancelCurrentStreamAndSettleMessages = useCallback(() => {
    clearActiveTokenFlushController("dispose");
    if (
      streamHandleRef.current &&
      typeof streamHandleRef.current.cancel === "function"
    ) {
      streamHandleRef.current.cancel();
    }
    const currentChatId = activeChatIdRef.current;
    streamHandleRef.current = null;
    streamingChatIdRef.current = null;
    activeStreamMessagesRef.current = null;
    setStreamingChatId(null);
    confirmationIdByCallIdRef.current.clear();
    confirmationCallIdByIdRef.current.clear();
    confirmationFollowupSignalByIdRef.current.clear();
    confirmationResolveTimerByIdRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    confirmationResolveTimerByIdRef.current.clear();
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
    activeStreamMessagesRef,
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
      const streamState = activeStreamMessagesRef.current;
      const targetChatId = streamState?.chatId;
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
            frame?.payload?.confirmation_id === normalizedConfirmationId,
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

      activeStreamMessagesRef.current = {
        chatId: targetChatId,
        messages: nextStreamMessages,
      };

      if (activeChatIdRef.current === targetChatId) {
        setMessages(nextStreamMessages);
      } else {
        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
      }

      return true;
    },
    [activeChatIdRef, activeStreamMessagesRef, setMessages, storageApi],
  );

  const handleToolConfirmationDecision = useCallback(
    async ({ confirmationId, approved, userResponse }) => {
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
        misoLogger.log("ask_user_question_submit", {
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
        await api.miso.respondToolConfirmation(payload);
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
        await api.miso.respondToolConfirmation({
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
    async (targetChatId, nextMessages) => {
      if (!targetChatId || readMemorySettings().enabled !== true) {
        return true;
      }

      try {
        const response = await api.miso.replaceSessionMemory({
          sessionId: targetChatId,
          messages: buildHistoryForModel(nextMessages, targetChatId),
          options: {
            modelId: modelIdRef.current,
          },
        });

        return response?.applied !== false;
      } catch (error) {
        if (activeChatIdRef.current === targetChatId) {
          setStreamError(
            error?.message || "Failed to sync short-term memory for this chat.",
          );
        }
        return false;
      }
    },
    [activeChatIdRef, buildHistoryForModel, modelIdRef, setStreamError],
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
    }) => {
      const trimmedText = typeof text === "string" ? text.trim() : "";
      const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
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
      toolConfirmationUiStateByIdRef.current = {};
      setToolConfirmationUiStateById({});
      pendingContinuationRequestRef.current = null;
      setPendingContinuationRequest(null);

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
      const assistantPlaceholder = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        status: "streaming",
        traceFrames: [],
        meta: {
          model: modelIdRef.current,
        },
      };

      const memoryEnabled =
        readMemorySettings().enabled === true && forceHistoryFallback !== true;
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
      setStreamingChatId(targetChatId);
      streamingChatIdRef.current = targetChatId;
      activeStreamMessagesRef.current = {
        chatId: targetChatId,
        messages: nextMessages,
      };

      let streamMessages = nextMessages;
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamMessagesRef.current = {
          chatId: targetChatId,
          messages: nextStreamMessages,
        };

        if (activeChatIdRef.current === targetChatId) {
          setMessages(nextStreamMessages);
          return;
        }

        storageApi.setChatMessages(targetChatId, nextStreamMessages, {
          source: "chat-page",
        });
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

        streamHandle = api.miso.startStreamV2(
          {
            threadId: targetChatId,
            message: promptText,
            history: historyForModel,
            attachments: payloadAttachments,
            options: {
              modelId: modelIdRef.current,
              ...(forceHistoryFallback === true && {
                memory_enabled: false,
              }),
              ...(selectedToolkits.length > 0 && {
                toolkits: selectedToolkits,
              }),
              ...(selectedWorkspaceIds.length > 0 && {
                selectedWorkspaceIds,
              }),
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
              if (!frame || frame.type === "token_delta") return;
              if (
                frame.type === "final_message" ||
                frame.type === "tool_call" ||
                frame.type === "error" ||
                frame.type === "done"
              ) {
                flushBufferedTokenDelta();
              }
              const patchTime = Date.now();

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
                misoLogger.log("request_messages", {
                  messages: requestMessagesForLog,
                  toolNames: requestToolNamesForLog,
                  ...(providerForLog ? { provider: providerForLog } : {}),
                  ...(previousResponseIdForLog
                    ? { previousResponseId: previousResponseIdForLog }
                    : {}),
                });
                return;
              }

              if (frame.type === "continuation_request") {
                const confirmationId =
                  typeof frame.payload?.confirmation_id === "string"
                    ? frame.payload.confirmation_id.trim()
                    : "";
                const iteration =
                  typeof frame.payload?.iteration === "number"
                    ? frame.payload.iteration
                    : 0;
                if (confirmationId) {
                  const state = { confirmationId, iteration, status: "idle" };
                  pendingContinuationRequestRef.current = state;
                  setPendingContinuationRequest(state);
                }
                return;
              }

              if (frame.type === "error") {
                misoLogger.error(
                  `error (iteration=${frame.iteration})`,
                  frame.payload,
                );
              }

              if (frame.type === "done") {
                const endPayload =
                  frame.payload && typeof frame.payload === "object"
                    ? { ...frame.payload }
                    : {};
                delete endPayload.bundle;
                misoLogger.log("end", endPayload);
              }

              if (
                frame.type === "run_started" ||
                frame.type === "response_received" ||
                frame.type === "run_max_iterations"
              ) {
                const label =
                  frame.type === "run_max_iterations"
                    ? "run_max_iterations"
                    : (MISO_TRACE_LABEL_BY_TYPE[frame.type] ?? frame.type);
                misoLogger.log(label, frame.payload);
              }

              if (frame.type === "memory_prepare") {
                const payload =
                  frame.payload && typeof frame.payload === "object"
                    ? frame.payload
                    : {};
                misoLogger.log("memory_prepare", {
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
                misoLogger.log("memory_commit", {
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
                  misoLogger.log("ask_user_question_prompt", {
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
                  misoLogger.log("ask_user_question_result", {
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
                        traceFrame.payload.content.trim() === currentContentTrimmed,
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

                  return {
                    ...message,
                    content: "",
                    updatedAt: patchTime,
                    traceFrames: [...existingFrames, ...syntheticFrame, frame],
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
                storageApi.setChatThreadId(targetChatId, targetChatId, {
                  source: "chat-page",
                });
              }

              if (meta && typeof meta.model === "string" && meta.model.trim()) {
                storageApi.setChatModel(
                  targetChatId,
                  { id: meta.model },
                  { source: "chat-page" },
                );
                if (activeChatIdRef.current === targetChatId) {
                  modelIdRef.current = meta.model;
                  setSelectedModelId(meta.model);
                }
              }
            },
            onToken: (delta) => {
              if (typeof delta !== "string" || !delta) {
                return;
              }

              thinkTagParser.feed(delta);
            },
            onDone: (done) => {
              thinkTagParser.flush();
              flushBufferedTokenDelta();
              const doneTime = Date.now();
              const bundle =
                done?.bundle && typeof done.bundle === "object"
                  ? { ...done.bundle }
                  : undefined;

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

              if (bundle && typeof bundle.consumed_tokens === "number") {
                const modelId = modelIdRef.current || "";
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
                  max_context_window_tokens: bundle.max_context_window_tokens,
                  chatId: targetChatId,
                });
              }

              streamHandleRef.current = null;
              streamingChatIdRef.current = null;
              activeStreamMessagesRef.current = null;
              setStreamingChatId(null);
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
                streamHandleRef.current === null &&
                streamingChatIdRef.current === null
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
                streamHandleRef.current = null;
                streamingChatIdRef.current = null;
                activeStreamMessagesRef.current = null;
                setStreamingChatId(null);
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
                });
                return;
              }

              if (activeChatIdRef.current === targetChatId) {
                setStreamError(errorMessage);
              }
              streamHandleRef.current = null;
              streamingChatIdRef.current = null;
              setStreamingChatId(null);
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
                  type: "error",
                  stage: "stream",
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
              activeStreamMessagesRef.current = null;
            },
          },
        );
      } catch (error) {
        disposeBufferedTokenFlush();
        releaseTokenFlushController();
        const errorMessage = error?.message || "Failed to start stream";
        setStreamError(errorMessage);
        streamHandleRef.current = null;
        streamingChatIdRef.current = null;
        activeStreamMessagesRef.current = null;
        setStreamingChatId(null);

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

      streamHandleRef.current = streamHandle;

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
    [
      activeChatIdRef,
      activeStreamMessagesRef,
      buildHistoryForModel,
      clearActiveTokenFlushController,
      clearAllPendingToolConfirmations,
      clearResolvedToolConfirmationByCallId,
      hydrateAttachmentPayloads,
      markAllPendingConfirmationFollowupSignals,
      markConfirmationFollowupSignalByCallId,
      modelIdRef,
      resolveAttachmentPayloads,
      selectedToolkits,
      selectedWorkspaceIds,
      setDraftAttachments,
      setInputValue,
      setMessages,
      setSelectedModelId,
      setStreamError,
      storageApi,
      systemPromptOverrides,
      updateToolConfirmationUiState,
    ],
  );

  const sendNewTurn = useCallback(() => {
    const currentChatId = activeChatIdRef.current;
    const text = inputValue.trim();
    const hasAttachments = Array.isArray(draftAttachments)
      ? draftAttachments.length > 0
      : false;
    const hasActiveStream = Boolean(
      streamingChatIdRef.current && streamHandleRef.current,
    );
    if (!currentChatId || (!text && !hasAttachments) || hasActiveStream) {
      if (hasActiveStream && streamingChatIdRef.current !== currentChatId) {
        setStreamError(
          "Another chat is still generating. Switch back to stop it or wait.",
        );
      }
      return;
    }

    if (!api.miso.isBridgeAvailable()) {
      setStreamError("Miso bridge is unavailable in this runtime.");
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
      attachments: draftAttachments,
      baseMessages: messages,
      clearComposer: true,
      missingAttachmentPayloadMode: "block",
    });
  }, [
    activeChatIdRef,
    attachmentsDisabledReason,
    attachmentsEnabled,
    draftAttachments,
    inputValue,
    messages,
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
      const hasActiveStream = Boolean(
        streamingChatIdRef.current && streamHandleRef.current,
      );
      if (
        !currentChatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        hasActiveStream
      ) {
        if (hasActiveStream && streamingChatIdRef.current !== currentChatId) {
          setStreamError(
            "Another chat is still generating. Switch back to stop it or wait.",
          );
        }
        return;
      }

      if (!api.miso.isBridgeAvailable()) {
        setStreamError("Miso bridge is unavailable in this runtime.");
        return;
      }

      const baseMessages = messagesRef.current.slice(0, messageIndex);
      const memoryReplaced = await replaceSessionMemoryForMessages(
        currentChatId,
        baseMessages,
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
      });
    },
    [
      activeChatIdRef,
      attachmentsEnabled,
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
      const hasActiveStream = Boolean(
        streamingChatIdRef.current && streamHandleRef.current,
      );
      if (
        !currentChatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        hasActiveStream
      ) {
        if (hasActiveStream && streamingChatIdRef.current !== currentChatId) {
          setStreamError(
            "Another chat is still generating. Switch back to stop it or wait.",
          );
        }
        return;
      }

      if (!api.miso.isBridgeAvailable()) {
        setStreamError("Miso bridge is unavailable in this runtime.");
        return;
      }

      const baseMessages = messagesRef.current.slice(0, messageIndex);
      const memoryReplaced = await replaceSessionMemoryForMessages(
        currentChatId,
        baseMessages,
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
      });
    },
    [
      activeChatIdRef,
      attachmentsEnabled,
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

      const turnMessageIds = collectTurnMessageIds(messagesRef.current, message.id);
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
        streamHandleRef.current &&
        streamingChatIdRef.current === currentChatId
      ) {
        workingMessages = cancelCurrentStreamAndSettleMessages();
      }

      const nextMessages = workingMessages.filter(
        (item) => !turnMessageIds.has(item?.id),
      );
      const memoryReplaced = await replaceSessionMemoryForMessages(
        currentChatId,
        nextMessages,
      );
      if (!memoryReplaced) {
        return;
      }

      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    },
    [
      activeChatIdRef,
      cancelCurrentStreamAndSettleMessages,
      messagesRef,
      replaceSessionMemoryForMessages,
      setMessages,
    ],
  );

  useEffect(() => {
    const confirmationIdByCallId = confirmationIdByCallIdRef.current;
    const confirmationCallIdById = confirmationCallIdByIdRef.current;
    const confirmationFollowupSignalById =
      confirmationFollowupSignalByIdRef.current;
    const confirmationResolveTimerById =
      confirmationResolveTimerByIdRef.current;

    return () => {
      clearActiveTokenFlushController("dispose");
      if (
        streamHandleRef.current &&
        typeof streamHandleRef.current.cancel === "function"
      ) {
        streamHandleRef.current.cancel();
      }
      streamHandleRef.current = null;
      streamingChatIdRef.current = null;
      activeStreamMessagesRef.current = null;
      clearAttachmentPayloads();
      confirmationIdByCallId.clear();
      confirmationCallIdById.clear();
      confirmationFollowupSignalById.clear();
      confirmationResolveTimerById.forEach((timerId) => {
        clearTimeout(timerId);
      });
      confirmationResolveTimerById.clear();
      pendingContinuationRequestRef.current = null;
    };
  }, [
    activeStreamMessagesRef,
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
    resendTurn,
    sendNewTurn,
    setStreamError,
    stopStream,
    streamError,
    toolConfirmationUiStateById,
  };
};
