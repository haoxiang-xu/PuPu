import { useState, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";
import {
  bootstrapChatsStore,
  setChatMessages,
  setChatModel,
  setChatThreadId,
  subscribeChatsStore,
  updateChatDraft,
} from "../../SERVICEs/chat_storage";
import { api, EMPTY_MODEL_CATALOG, FrontendApiError } from "../../SERVICEs/api";

const DEFAULT_DISCLAIMER = "AI can make mistakes, please double-check critical information.";

const ChatInterface = () => {
  const { theme, onFragment } = useContext(ConfigContext);

  const [bootstrapped] = useState(() => bootstrapChatsStore());
  const initialChat = bootstrapped.activeChat;

  const [activeChatId, setActiveChatId] = useState(initialChat.id);
  const [messages, setMessages] = useState(() => initialChat.messages || []);
  const [inputValue, setInputValue] = useState(() => initialChat.draft?.text || "");
  const [draftAttachments, setDraftAttachments] = useState(
    () => initialChat.draft?.attachments || [],
  );
  const [isStreaming, setIsStreaming] = useState(false);
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
  const messagePersistTimerRef = useRef(null);
  const threadIdRef = useRef(initialChat.threadId || `thread-${Date.now()}`);
  const modelIdRef = useRef(
    typeof initialChat.model?.id === "string" && initialChat.model.id.trim()
      ? initialChat.model.id
      : "miso-unset",
  );
  const [selectedModelId, setSelectedModelId] = useState(modelIdRef.current);

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
      if (error instanceof FrontendApiError && error.code === "bridge_unavailable") {
        const hasElectronUserAgent =
          typeof navigator !== "undefined" &&
          typeof navigator.userAgent === "string" &&
          navigator.userAgent.includes("Electron");
        const runtimeHint =
          hasElectronUserAgent
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

      if ((modelIdRef.current === "miso-unset" || !modelIdRef.current) && normalized.activeModel) {
        const chatId = activeChatIdRef.current;
        modelIdRef.current = normalized.activeModel;
        setSelectedModelId(normalized.activeModel);
        if (chatId) {
          setChatModel(chatId, { id: normalized.activeModel }, { source: "chat-page" });
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
      const nextActiveChat = nextActiveId ? nextStore?.chatsById?.[nextActiveId] : null;

      if (!nextActiveId || !nextActiveChat || nextActiveId === activeChatIdRef.current) {
        return;
      }

      if (streamHandleRef.current && typeof streamHandleRef.current.cancel === "function") {
        streamHandleRef.current.cancel();
      }
      streamHandleRef.current = null;

      activeChatIdRef.current = nextActiveId;
      setActiveChatId(nextActiveId);
      setIsStreaming(false);
      setStreamError("");
      setMessages(nextActiveChat.messages || []);
      setInputValue(nextActiveChat.draft?.text || "");
      setDraftAttachments(nextActiveChat.draft?.attachments || []);

      threadIdRef.current = nextActiveChat.threadId || `thread-${Date.now()}`;
      modelIdRef.current =
        typeof nextActiveChat.model?.id === "string" && nextActiveChat.model.id.trim()
          ? nextActiveChat.model.id
          : "miso-unset";
      setSelectedModelId(modelIdRef.current);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (messagePersistTimerRef.current) {
        clearTimeout(messagePersistTimerRef.current);
        messagePersistTimerRef.current = null;
      }
      if (streamHandleRef.current && typeof streamHandleRef.current.cancel === "function") {
        streamHandleRef.current.cancel();
      }
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

  const sendMessage = useCallback(() => {
    const chatId = activeChatIdRef.current;
    const text = inputValue.trim();
    if (!chatId || !text || isStreaming) {
      return;
    }

    if (!api.miso.isBridgeAvailable()) {
      setStreamError("Miso bridge is unavailable in this runtime.");
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timestamp = Date.now();
    const attachmentsForMessage = draftAttachments;

    const userMessage = {
      id: userMessageId,
      role: "user",
      content: text,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(attachmentsForMessage.length > 0 ? { attachments: attachmentsForMessage } : {}),
    };
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

    const historyForModel = [...messages, userMessage]
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

    const nextMessages = [...messages, userMessage, assistantPlaceholder];

    setMessages(nextMessages);
    setInputValue("");
    setDraftAttachments([]);
    setStreamError("");
    setIsStreaming(true);

    let streamHandle = null;
    try {
      streamHandle = api.miso.startStream(
        {
          threadId: threadIdRef.current,
          message: text,
          history: historyForModel,
          options: {
            modelId: modelIdRef.current,
          },
        },
        {
          onMeta: (meta) => {
            if (meta && typeof meta.thread_id === "string" && meta.thread_id.trim()) {
              threadIdRef.current = meta.thread_id;
              setChatThreadId(chatId, meta.thread_id, { source: "chat-page" });
            }

            if (meta && typeof meta.model === "string" && meta.model.trim()) {
              modelIdRef.current = meta.model;
              setSelectedModelId(meta.model);
              setChatModel(chatId, { id: meta.model }, { source: "chat-page" });
            }
          },
          onToken: (delta) => {
            const patchTime = Date.now();
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `${message.content || ""}${delta}`,
                      updatedAt: patchTime,
                      status: "streaming",
                    }
                  : message,
              ),
            );
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
            const parsedUsage = done?.usage && typeof done.usage === "object"
              ? {
                  promptTokens: parseUsageNumber(done.usage.prompt_tokens ?? done.usage.promptTokens),
                  completionTokens: parseUsageNumber(
                    done.usage.completion_tokens ?? done.usage.completionTokens,
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

            setMessages((prev) =>
              prev.map((message) =>
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
              ),
            );
            setIsStreaming(false);
            streamHandleRef.current = null;
          },
          onError: (error) => {
            const errorMessage = error?.message || "Unknown stream error";
            const errorCode = error?.code || "stream_error";
            const errorTime = Date.now();
            setStreamError(errorMessage);
            setIsStreaming(false);
            streamHandleRef.current = null;

            setMessages((prev) =>
              prev.map((message) => {
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
              }),
            );
          },
        },
      );
    } catch (error) {
      const errorMessage = error?.message || "Failed to start stream";
      setStreamError(errorMessage);
      setIsStreaming(false);
      streamHandleRef.current = null;

      setMessages((prev) =>
        prev.map((message) =>
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
      return;
    }

    streamHandleRef.current = streamHandle;

    if (streamHandle?.requestId) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                meta: {
                  ...(message.meta || {}),
                  requestId: streamHandle.requestId,
                },
              }
            : message,
        ),
      );
    }
  }, [draftAttachments, inputValue, isStreaming, messages]);

  const handleEdit = useCallback((message) => {
    console.log("Edit message:", message);
  }, []);

  const handleCopy = useCallback((message) => {
    navigator.clipboard.writeText(message.content);
    console.log("Copied to clipboard");
  }, []);

  const handleRegenerate = useCallback((message) => {
    console.log("Regenerate message:", message);
  }, []);

  const handleAttachFile = useCallback(() => {
    console.log("Attach file");
  }, []);

  const handleAttachLink = useCallback(() => {
    console.log("Attach link");
  }, []);

  const handleAttachGlobal = useCallback(() => {
    console.log("Attach global");
  }, []);

  const effectiveDisclaimer = useMemo(() => {
    if (streamError) {
      return `Miso error: ${streamError}`;
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
  }, [streamError, isStreaming, misoStatus]);

  const isSendDisabled = isStreaming || !misoStatus.ready;

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
        messages={messages}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onRegenerate={handleRegenerate}
      />

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={sendMessage}
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
