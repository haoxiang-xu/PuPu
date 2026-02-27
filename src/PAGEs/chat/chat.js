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
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { LogoSVGs } from "../../BUILTIN_COMPONENTs/icon/icon_manifest.js";

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

/* ─────────────────────────────────────────────────────────────────────────────
   Hero layout constants
───────────────────────────────────────────────────────────────────────────── */
const _OllamaSVG = LogoSVGs.ollama;
const _OpenAISVG = LogoSVGs.open_ai;
const _AnthropicSVG = LogoSVGs.Anthropic;

const PROVIDER_ICON = {
  ollama: _OllamaSVG,
  openai: _OpenAISVG,
  anthropic: _AnthropicSVG,
};

const ChatInterface = () => {
  const { theme, onFragment, onThemeMode } = useContext(ConfigContext);

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
                setChatThreadId(chatId, meta.thread_id, {
                  source: "chat-page",
                });
                if (activeChatIdRef.current === chatId) {
                  threadIdRef.current = meta.thread_id;
                }
              }

              if (meta && typeof meta.model === "string" && meta.model.trim()) {
                setChatModel(
                  chatId,
                  { id: meta.model },
                  { source: "chat-page" },
                );
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
                        done.usage.completion_chars ??
                          done.usage.completionChars,
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
      const text = typeof nextContent === "string" ? nextContent.trim() : "";
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

  const isEmpty = messages.length === 0;
  const isDark = onThemeMode === "dark_mode";

  // Inject hero keyframes once
  useEffect(() => {
    const styleId = "pupu-hero-keyframes";
    if (!document.getElementById(styleId)) {
      const el = document.createElement("style");
      el.id = styleId;
      el.textContent =
        "@keyframes heroRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}";
      document.head.appendChild(el);
    }
  }, []);

  const sharedChatInputProps = {
    value: inputValue,
    onChange: setInputValue,
    onSend: sendMessage,
    onStop: handleStop,
    isStreaming,
    sendDisabled: isSendDisabled,
    placeholder: misoStatus.ready
      ? "Message PuPu Chat..."
      : `Miso unavailable (${misoStatus.status})${misoStatus.reason ? `: ${misoStatus.reason}` : ""}`,
    disclaimer: effectiveDisclaimer,
    showAttachments: true,
    onAttachFile: handleAttachFile,
    onAttachLink: handleAttachLink,
    onAttachGlobal: handleAttachGlobal,
    modelCatalog,
    selectedModelId,
    onSelectModel: handleSelectModel,
    modelSelectDisabled: isStreaming,
  };

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
      {isEmpty ? (
        /* ── Hero: logo → greeting → input → suggestion chips ── */
        <div
          key={activeChatId}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 0 80px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              maxWidth: 780,
              padding: "0 24px",
              boxSizing: "border-box",
              gap: 0,
            }}
          >
            {/* Logo */}
            <div
              style={{
                animation: "heroRise 0.5s cubic-bezier(0.22,1,0.36,1) both",
                animationDelay: "0ms",
                color: isDark
                  ? "rgba(255,255,255,0.82)"
                  : "rgba(20,20,40,0.72)",
                display: "flex",
                marginBottom: 20,
              }}
            >
              <Icon src={"pupu"} style={{ width: 42, height: 42 }} />
            </div>

            {/* Greeting */}
            <div
              style={{
                animation: "heroRise 0.5s cubic-bezier(0.22,1,0.36,1) both",
                animationDelay: "55ms",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.3px",
                color: isDark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.78)",
                marginBottom: 28,
                textAlign: "center",
                fontFamily: "HackNerdFont",
              }}
            >
              How can I help you today?
            </div>

            {/* Input */}
            <div
              style={{
                animation: "heroRise 0.5s cubic-bezier(0.22,1,0.36,1) both",
                animationDelay: "100ms",
                width: "100%",
                marginBottom: 14,
              }}
            >
              <ChatInput {...sharedChatInputProps} />
            </div>

            {/* Model chips */}
            {(() => {
              const p = modelCatalog?.providers || {};
              const chips = [
                ...(p.ollama || []).map((m) => ({
                  id: `ollama:${m}`,
                  label: m,
                  provider: "ollama",
                })),
                ...(p.openai || []).map((m) => ({
                  id: `openai:${m}`,
                  label: m,
                  provider: "openai",
                })),
                ...(p.anthropic || []).map((m) => ({
                  id: `anthropic:${m}`,
                  label: m,
                  provider: "anthropic",
                })),
              ];
              if (chips.length === 0) return null;
              return (
                <div
                  style={{
                    animation: "heroRise 0.5s cubic-bezier(0.22,1,0.36,1) both",
                    animationDelay: "145ms",
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "center",
                    maxWidth: 720,
                  }}
                >
                  {chips.map((c) => {
                    const active = selectedModelId === c.id;
                    const IconComp = PROVIDER_ICON[c.provider];
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectModel(c.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 13px",
                          borderRadius: 20,
                          fontSize: 12.5,
                          fontWeight: active ? 550 : 450,
                          fontFamily: theme?.font?.fontFamily || "inherit",
                          cursor: "pointer",
                          outline: "none",
                          whiteSpace: "nowrap",
                          transition:
                            "background 0.18s, border-color 0.18s, color 0.18s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s",
                          color: active
                            ? isDark
                              ? "rgba(255,255,255,0.88)"
                              : "rgba(0,0,0,0.80)"
                            : isDark
                              ? "rgba(255,255,255,0.45)"
                              : "rgba(0,0,0,0.42)",
                          background: active
                            ? isDark
                              ? "rgba(255,255,255,0.09)"
                              : "rgba(255,255,255,0.92)"
                            : isDark
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(0,0,0,0.03)",
                          border: active
                            ? isDark
                              ? "1px solid rgba(255,255,255,0.16)"
                              : "1px solid rgba(0,0,0,0.13)"
                            : isDark
                              ? "1px solid rgba(255,255,255,0.08)"
                              : "1px solid rgba(0,0,0,0.09)",
                          transform: active
                            ? "translateY(-3px)"
                            : "translateY(0)",
                          boxShadow: active
                            ? isDark
                              ? "0 6px 16px rgba(0,0,0,0.40), 0 2px 4px rgba(0,0,0,0.25)"
                              : "0 6px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.07)"
                            : "none",
                        }}
                        onMouseEnter={(e) => {
                          if (active) return;
                          e.currentTarget.style.background = isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.06)";
                          e.currentTarget.style.borderColor = isDark
                            ? "rgba(255,255,255,0.15)"
                            : "rgba(0,0,0,0.14)";
                          e.currentTarget.style.color = isDark
                            ? "rgba(255,255,255,0.75)"
                            : "rgba(0,0,0,0.70)";
                        }}
                        onMouseLeave={(e) => {
                          if (active) return;
                          e.currentTarget.style.background = isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.03)";
                          e.currentTarget.style.borderColor = isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.09)";
                          e.currentTarget.style.color = isDark
                            ? "rgba(255,255,255,0.45)"
                            : "rgba(0,0,0,0.42)";
                        }}
                      >
                        {IconComp && (
                          <span
                            style={{
                              width: 13,
                              height: 13,
                              display: "flex",
                              alignItems: "center",
                              flexShrink: 0,
                              opacity: active ? 0.9 : 0.5,
                            }}
                          >
                            <IconComp style={{ width: 13, height: 13 }} />
                          </span>
                        )}
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ── Normal chat layout ─────────────────────────────────────── */
        <>
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
          <ChatInput {...sharedChatInputProps} />
        </>
      )}
    </div>
  );
};

export default ChatInterface;
