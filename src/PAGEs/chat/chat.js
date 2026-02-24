import {
  useState,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";
import {
  bootstrapChatsStore,
  cleanupTransientNewChatOnPageLeave,
  setChatGeneratedUnread,
  setChatMessages,
  setChatModel,
  setChatThreadId,
  subscribeChatsStore,
  updateChatDraft,
} from "../../SERVICEs/chat_storage";
import { api, EMPTY_MODEL_CATALOG, FrontendApiError } from "../../SERVICEs/api";

const DEFAULT_DISCLAIMER =
  "AI can make mistakes, please double-check critical information.";

const settleStreamingAssistantMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return { changed: false, nextMessages: [] };
  }

  const patchedAt = Date.now();
  let changed = false;
  const nextMessages = [];

  for (const message of messages) {
    const isStreamingAssistant =
      message?.role === "assistant" && message?.status === "streaming";
    if (!isStreamingAssistant) {
      nextMessages.push(message);
      continue;
    }

    changed = true;
    if (!message?.content) {
      continue;
    }

    nextMessages.push({
      ...message,
      status: "cancelled",
      updatedAt: patchedAt,
    });
  }

  return {
    changed,
    nextMessages: changed ? nextMessages : messages,
  };
};

const ChatInterface = () => {
  const { theme, onFragment } = useContext(ConfigContext);

  const [bootstrapped] = useState(() => bootstrapChatsStore());
  const initialChat = bootstrapped.activeChat;

  const [activeChatId, setActiveChatId] = useState(initialChat.id);
  const [messages, setMessages] = useState(() => initialChat.messages || []);
  const [inputValue, setInputValue] = useState(
    () => initialChat.draft?.text || "",
  );
  const [draftAttachments, setDraftAttachments] = useState(
    () => initialChat.draft?.attachments || [],
  );
  const [streamingChatId, setStreamingChatId] = useState(null);
  const [streamError, setStreamError] = useState("");
  const [misoStatus, setMisoStatus] = useState({
    status: "starting",
    ready: false,
    url: null,
    reason: "",
  });
  const [modelCatalog, setModelCatalog] = useState(() => EMPTY_MODEL_CATALOG);

  const activeChatIdRef = useRef(initialChat.id);
  const streamHandleRef = useRef(null);
  const streamingChatIdRef = useRef(null);
  const activeStreamMessagesRef = useRef(null);
  const messagePersistTimerRef = useRef(null);
  const threadIdRef = useRef(initialChat.threadId || `thread-${Date.now()}`);
  const modelIdRef = useRef(
    typeof initialChat.model?.id === "string" && initialChat.model.id.trim()
      ? initialChat.model.id
      : "miso-unset",
  );
  const [selectedModelId, setSelectedModelId] = useState(modelIdRef.current);
  const isStreaming = streamingChatId === activeChatId;
  const hasBackgroundStream = Boolean(
    streamingChatId && streamingChatId !== activeChatId,
  );

  const refreshMisoStatus = useCallback(async () => {
    try {
      const status = await api.miso.getStatus();
      setMisoStatus({
        status: status?.status || "unknown",
        ready: Boolean(status?.ready),
        url: status?.url || null,
        reason: status?.reason || "",
      });
    } catch (error) {
      if (
        error instanceof FrontendApiError &&
        error.code === "bridge_unavailable"
      ) {
        const hasElectronUserAgent =
          typeof navigator !== "undefined" &&
          typeof navigator.userAgent === "string" &&
          navigator.userAgent.includes("Electron");
        const runtimeHint = hasElectronUserAgent
          ? "Electron detected, but preload failed to expose misoAPI. Check Electron main/preload console logs."
          : "Web mode detected. Run the app with Electron (`npm start` or `npm run start:electron`).";
        setMisoStatus({
          status: "unavailable",
          ready: false,
          url: null,
          reason: runtimeHint,
        });
        return;
      }

      setMisoStatus({
        status: "error",
        ready: false,
        url: null,
        reason: "Failed to query Miso status",
      });
    }
  }, []);

  const refreshModelCatalog = useCallback(async () => {
    try {
      const normalized = await api.miso.getModelCatalog();
      setModelCatalog(normalized);

      if (
        (modelIdRef.current === "miso-unset" || !modelIdRef.current) &&
        normalized.activeModel
      ) {
        const chatId = activeChatIdRef.current;
        modelIdRef.current = normalized.activeModel;
        setSelectedModelId(normalized.activeModel);
        if (chatId) {
          setChatModel(
            chatId,
            { id: normalized.activeModel },
            { source: "chat-page" },
          );
        }
      }
    } catch (_error) {
      // ignore transient catalog fetch failures
    }
  }, []);

  useEffect(() => {
    refreshMisoStatus();

    const timer = setInterval(() => {
      refreshMisoStatus();
    }, 1500);

    return () => {
      clearInterval(timer);
    };
  }, [refreshMisoStatus]);

  useEffect(() => {
    refreshModelCatalog();

    const timer = setInterval(() => {
      refreshModelCatalog();
    }, 10000);

    return () => {
      clearInterval(timer);
    };
  }, [refreshModelCatalog]);

  useEffect(() => {
    const unsubscribe = subscribeChatsStore((nextStore, event = {}) => {
      if (event.source === "chat-page") {
        return;
      }

      const nextActiveId = nextStore?.activeChatId;
      const nextActiveChat = nextActiveId
        ? nextStore?.chatsById?.[nextActiveId]
        : null;
      const currentActiveId = activeChatIdRef.current;

      if (
        !nextActiveId ||
        !nextActiveChat ||
        nextActiveId === currentActiveId
      ) {
        return;
      }

      activeChatIdRef.current = nextActiveId;

      if (
        activeStreamMessagesRef.current?.chatId === currentActiveId &&
        Array.isArray(activeStreamMessagesRef.current?.messages)
      ) {
        setChatMessages(
          currentActiveId,
          activeStreamMessagesRef.current.messages,
          {
            source: "chat-page",
          },
        );
      }

      setActiveChatId(nextActiveId);
      setStreamError("");
      setMessages(nextActiveChat.messages || []);
      setInputValue(nextActiveChat.draft?.text || "");
      setDraftAttachments(nextActiveChat.draft?.attachments || []);

      threadIdRef.current = nextActiveChat.threadId || `thread-${Date.now()}`;
      modelIdRef.current =
        typeof nextActiveChat.model?.id === "string" &&
        nextActiveChat.model.id.trim()
          ? nextActiveChat.model.id
          : "miso-unset";
      setSelectedModelId(modelIdRef.current);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const chatsById = bootstrapped?.store?.chatsById || {};
    for (const [chatId, chat] of Object.entries(chatsById)) {
      const { changed, nextMessages } = settleStreamingAssistantMessages(
        chat?.messages,
      );
      if (!changed) {
        continue;
      }

      setChatMessages(chatId, nextMessages, { source: "chat-page" });
      if (chatId === activeChatIdRef.current) {
        setMessages(nextMessages);
      }
    }
  }, [bootstrapped]);

  useEffect(() => {
    return () => {
      if (messagePersistTimerRef.current) {
        clearTimeout(messagePersistTimerRef.current);
        messagePersistTimerRef.current = null;
      }
      if (
        streamHandleRef.current &&
        typeof streamHandleRef.current.cancel === "function"
      ) {
        streamHandleRef.current.cancel();
      }
      streamHandleRef.current = null;
      streamingChatIdRef.current = null;
      activeStreamMessagesRef.current = null;
      cleanupTransientNewChatOnPageLeave({ source: "chat-page" });
    };
  }, []);

  useEffect(() => {
    const chatId = activeChatIdRef.current;
    if (!chatId) {
      return;
    }

    updateChatDraft(
      chatId,
      {
        text: inputValue,
        attachments: draftAttachments,
      },
      { source: "chat-page" },
    );
  }, [inputValue, draftAttachments]);

  useEffect(() => {
    const chatId = activeChatIdRef.current;
    if (!chatId) {
      return;
    }

    if (messagePersistTimerRef.current) {
      clearTimeout(messagePersistTimerRef.current);
      messagePersistTimerRef.current = null;
    }

    const delay = isStreaming ? 250 : 0;
    messagePersistTimerRef.current = setTimeout(() => {
      messagePersistTimerRef.current = null;
      setChatMessages(chatId, messages, { source: "chat-page" });
    }, delay);

    return () => {
      if (messagePersistTimerRef.current) {
        clearTimeout(messagePersistTimerRef.current);
        messagePersistTimerRef.current = null;
      }
    };
  }, [messages, isStreaming]);

  useEffect(() => {
    const chatId = activeChatIdRef.current;
    if (!chatId) {
      return;
    }

    setChatThreadId(chatId, threadIdRef.current, { source: "chat-page" });
    setChatModel(chatId, { id: modelIdRef.current }, { source: "chat-page" });
  }, []);

  const handleSelectModel = useCallback(
    (modelId) => {
      const chatId = activeChatIdRef.current;
      if (!chatId || !modelId || isStreaming) {
        return;
      }

      modelIdRef.current = modelId;
      setSelectedModelId(modelId);
      setChatModel(chatId, { id: modelId }, { source: "chat-page" });
    },
    [isStreaming],
  );

  const handleStop = useCallback(() => {
    if (
      streamHandleRef.current &&
      typeof streamHandleRef.current.cancel === "function"
    ) {
      streamHandleRef.current.cancel();
    }
    const chatId = activeChatIdRef.current;
    streamHandleRef.current = null;
    streamingChatIdRef.current = null;
    activeStreamMessagesRef.current = null;
    setStreamingChatId(null);
    // Remove empty assistant placeholder; mark partial ones as cancelled
    setMessages((prev) => {
      const { changed, nextMessages } = settleStreamingAssistantMessages(prev);

      if (chatId && changed) {
        setChatMessages(chatId, nextMessages, { source: "chat-page" });
      }

      return nextMessages;
    });
  }, []);

  const startStreamRequest = useCallback(
    ({
      chatId,
      text,
      attachmentsForMessage = [],
      baseMessages = [],
      clearComposer = false,
      reuseUserMessage = null,
    }) => {
      const promptText = typeof text === "string" ? text.trim() : "";
      if (!chatId || !promptText) {
        return false;
      }

      const normalizedAttachments = Array.isArray(attachmentsForMessage)
        ? attachmentsForMessage
        : [];
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

      const userMessage = { ...userMessageSeed };
      if (normalizedAttachments.length > 0) {
        userMessage.attachments = normalizedAttachments;
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
        meta: {
          model: modelIdRef.current,
        },
      };

      const historyForModel = [...normalizedBaseMessages, userMessage]
        .filter((message) => {
          if (!message || typeof message !== "object") {
            return false;
          }
          if (!["system", "user", "assistant"].includes(message.role)) {
            return false;
          }
          if (typeof message.content !== "string") {
            return false;
          }
          return message.content.trim().length > 0;
        })
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

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
      setStreamingChatId(chatId);
      streamingChatIdRef.current = chatId;
      activeStreamMessagesRef.current = {
        chatId,
        messages: nextMessages,
      };

      let streamMessages = nextMessages;
      const syncStreamMessages = (nextStreamMessages) => {
        streamMessages = nextStreamMessages;
        activeStreamMessagesRef.current = {
          chatId,
          messages: nextStreamMessages,
        };

        if (activeChatIdRef.current === chatId) {
          setMessages(nextStreamMessages);
          return;
        }

        setChatMessages(chatId, nextStreamMessages, { source: "chat-page" });
      };

      let streamHandle = null;
      try {
        streamHandle = api.miso.startStream(
          {
            threadId: threadIdRef.current,
            message: promptText,
            history: historyForModel,
            options: {
              modelId: modelIdRef.current,
            },
          },
          {
            onMeta: (meta) => {
              if (
                meta &&
                typeof meta.thread_id === "string" &&
                meta.thread_id.trim()
              ) {
                setChatThreadId(chatId, meta.thread_id, { source: "chat-page" });
                if (activeChatIdRef.current === chatId) {
                  threadIdRef.current = meta.thread_id;
                }
              }

              if (meta && typeof meta.model === "string" && meta.model.trim()) {
                setChatModel(chatId, { id: meta.model }, { source: "chat-page" });
                if (activeChatIdRef.current === chatId) {
                  modelIdRef.current = meta.model;
                  setSelectedModelId(meta.model);
                }
              }
            },
            onToken: (delta) => {
              const patchTime = Date.now();
              const nextStreamMessages = streamMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `${message.content || ""}${delta}`,
                      updatedAt: patchTime,
                      status: "streaming",
                    }
                  : message,
              );
              syncStreamMessages(nextStreamMessages);
            },
            onDone: (done) => {
              const doneTime = Date.now();
              const parseUsageNumber = (value) => {
                const parsed = Number(value);
                if (Number.isFinite(parsed) && parsed >= 0) {
                  return parsed;
                }
                return undefined;
              };
              const parsedUsage =
                done?.usage && typeof done.usage === "object"
                  ? {
                      promptTokens: parseUsageNumber(
                        done.usage.prompt_tokens ?? done.usage.promptTokens,
                      ),
                      completionTokens: parseUsageNumber(
                        done.usage.completion_tokens ??
                          done.usage.completionTokens,
                      ),
                      completionChars: parseUsageNumber(
                        done.usage.completion_chars ?? done.usage.completionChars,
                      ),
                    }
                  : null;
              const usage =
                parsedUsage &&
                (parsedUsage.promptTokens != null ||
                  parsedUsage.completionTokens != null ||
                  parsedUsage.completionChars != null)
                  ? parsedUsage
                  : undefined;

              const nextStreamMessages = streamMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      status: "done",
                      updatedAt: doneTime,
                      meta: {
                        ...(message.meta || {}),
                        ...(usage ? { usage } : {}),
                      },
                    }
                  : message,
              );
              syncStreamMessages(nextStreamMessages);
              streamHandleRef.current = null;
              streamingChatIdRef.current = null;
              activeStreamMessagesRef.current = null;
              setStreamingChatId(null);
              if (activeChatIdRef.current !== chatId) {
                setChatGeneratedUnread(chatId, true, {
                  source: "chat-page",
                });
              }
            },
            onError: (error) => {
              if (
                streamHandleRef.current === null &&
                streamingChatIdRef.current === null
              ) {
                return;
              }
              const errorMessage = error?.message || "Unknown stream error";
              const errorCode = error?.code || "stream_error";
              const errorTime = Date.now();
              if (activeChatIdRef.current === chatId) {
                setStreamError(errorMessage);
              }
              streamHandleRef.current = null;
              streamingChatIdRef.current = null;
              setStreamingChatId(null);

              const nextStreamMessages = streamMessages.map((message) => {
                if (message.id !== assistantMessageId) {
                  return message;
                }

                return {
                  ...message,
                  status: "error",
                  updatedAt: errorTime,
                  content: message.content || `[error] ${errorMessage}`,
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
    [],
  );

  const sendMessage = useCallback(() => {
    const chatId = activeChatIdRef.current;
    const text = inputValue.trim();
    const hasActiveStream = Boolean(
      streamingChatIdRef.current && streamHandleRef.current,
    );
    if (!chatId || !text || hasActiveStream) {
      if (hasActiveStream && streamingChatIdRef.current !== chatId) {
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

    startStreamRequest({
      chatId,
      text,
      attachmentsForMessage: draftAttachments,
      baseMessages: messages,
      clearComposer: true,
    });
  }, [draftAttachments, inputValue, messages, startStreamRequest]);

  const handleResendMessage = useCallback(
    (message) => {
      const chatId = activeChatIdRef.current;
      const messageIndex = Array.isArray(messages)
        ? messages.findIndex((item) => item?.id === message?.id)
        : -1;
      const targetMessage =
        messageIndex >= 0 && messageIndex < messages.length
          ? messages[messageIndex]
          : null;
      const text =
        typeof targetMessage?.content === "string"
          ? targetMessage.content.trim()
          : "";
      const hasActiveStream = Boolean(
        streamingChatIdRef.current && streamHandleRef.current,
      );
      if (
        !chatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        hasActiveStream
      ) {
        if (hasActiveStream && streamingChatIdRef.current !== chatId) {
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

      const baseMessages = messages.slice(0, messageIndex);
      const resendAttachments = Array.isArray(targetMessage.attachments)
        ? targetMessage.attachments
        : [];

      startStreamRequest({
        chatId,
        text,
        attachmentsForMessage: resendAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
      });
    },
    [messages, startStreamRequest],
  );

  const handleEditMessage = useCallback(
    (message, nextContent) => {
      const chatId = activeChatIdRef.current;
      const messageIndex = Array.isArray(messages)
        ? messages.findIndex((item) => item?.id === message?.id)
        : -1;
      const targetMessage =
        messageIndex >= 0 && messageIndex < messages.length
          ? messages[messageIndex]
          : null;
      const text =
        typeof nextContent === "string" ? nextContent.trim() : "";
      const hasActiveStream = Boolean(
        streamingChatIdRef.current && streamHandleRef.current,
      );
      if (
        !chatId ||
        messageIndex < 0 ||
        targetMessage?.role !== "user" ||
        !text ||
        hasActiveStream
      ) {
        if (hasActiveStream && streamingChatIdRef.current !== chatId) {
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

      const baseMessages = messages.slice(0, messageIndex);
      const originalAttachments = Array.isArray(targetMessage.attachments)
        ? targetMessage.attachments
        : [];

      startStreamRequest({
        chatId,
        text,
        attachmentsForMessage: originalAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
      });
    },
    [messages, startStreamRequest],
  );

  const handleAttachFile = useCallback(() => {
    console.log("Attach file");
  }, []);

  const handleAttachLink = useCallback(() => {
    console.log("Attach link");
  }, []);

  const handleAttachGlobal = useCallback(() => {
    console.log("Attach global");
  }, []);

  const handleDeleteMessage = useCallback((message) => {
    if (!message || typeof message.id !== "string" || !message.id) {
      return;
    }

    const deletingStreamingAssistant =
      message.role === "assistant" && message.status === "streaming";

    if (
      deletingStreamingAssistant &&
      streamHandleRef.current &&
      streamingChatIdRef.current === activeChatIdRef.current
    ) {
      if (typeof streamHandleRef.current.cancel === "function") {
        streamHandleRef.current.cancel();
      }
      streamHandleRef.current = null;
      streamingChatIdRef.current = null;
      activeStreamMessagesRef.current = null;
      setStreamingChatId(null);
    }

    setMessages((previousMessages) =>
      previousMessages.filter((item) => item.id !== message.id),
    );
  }, []);

  const effectiveDisclaimer = useMemo(() => {
    if (streamError) {
      return `Miso error: ${streamError}`;
    }
    if (hasBackgroundStream) {
      return "Another chat is streaming a response...";
    }
    if (isStreaming) {
      return "Miso is streaming a response...";
    }
    if (!misoStatus.ready) {
      return misoStatus.reason
        ? `Miso ${misoStatus.status}: ${misoStatus.reason}`
        : `Connecting to Miso (${misoStatus.status})...`;
    }
    return DEFAULT_DISCLAIMER;
  }, [streamError, hasBackgroundStream, isStreaming, misoStatus]);

  const isSendDisabled =
    (!misoStatus.ready && !isStreaming) || hasBackgroundStream;

  return (
    <div
      data-chat-id={activeChatId}
      style={{
        position: "absolute",
        top: 0,
        left: onFragment === "side_menu" ? 320 : 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: theme?.font?.fontFamily || "inherit",
        transition: "left 0.3s ease",
      }}
    >
      <ChatMessages
        chatId={activeChatId}
        messages={messages}
        isStreaming={isStreaming}
        onDeleteMessage={handleDeleteMessage}
        onResendMessage={handleResendMessage}
        onEditMessage={handleEditMessage}
        initialVisibleCount={12}
        loadBatchSize={6}
        topLoadThreshold={80}
      />

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={sendMessage}
        onStop={handleStop}
        isStreaming={isStreaming}
        sendDisabled={isSendDisabled}
        placeholder={
          misoStatus.ready
            ? "Message PuPu Chat..."
            : `Miso unavailable (${misoStatus.status})${misoStatus.reason ? `: ${misoStatus.reason}` : ""}`
        }
        disclaimer={effectiveDisclaimer}
        showAttachments={true}
        onAttachFile={handleAttachFile}
        onAttachLink={handleAttachLink}
        onAttachGlobal={handleAttachGlobal}
        modelCatalog={modelCatalog}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        modelSelectDisabled={isStreaming}
      />
    </div>
  );
};

export default ChatInterface;
