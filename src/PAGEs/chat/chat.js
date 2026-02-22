import { useState, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";
import {
  bootstrapChatsStore,
  setChatMessages,
  setChatModel,
  setChatThreadId,
  updateChatDraft,
} from "../../SERVICEs/chat_storage";

const DEFAULT_DISCLAIMER = "AI can make mistakes, please double-check critical information.";

const ChatInterface = () => {
  const { theme, onFragment } = useContext(ConfigContext);
  const [bootstrappedChat] = useState(() => bootstrapChatsStore());
  const chatIdRef = useRef(bootstrappedChat.id);

  const [messages, setMessages] = useState(() => bootstrappedChat.messages || []);
  const [inputValue, setInputValue] = useState(() => bootstrappedChat.draft?.text || "");
  const [draftAttachments, setDraftAttachments] = useState(
    () => bootstrappedChat.draft?.attachments || [],
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [misoStatus, setMisoStatus] = useState({
    status: "starting",
    ready: false,
    url: null,
    reason: "",
  });

  const streamHandleRef = useRef(null);
  const messagePersistTimerRef = useRef(null);
  const threadIdRef = useRef(bootstrappedChat.threadId || `thread-${Date.now()}`);
  const modelIdRef = useRef(
    typeof bootstrappedChat.model?.id === "string" && bootstrappedChat.model.id.trim()
      ? bootstrappedChat.model.id
      : "miso-unset",
  );

  const refreshMisoStatus = useCallback(async () => {
    if (!window.misoAPI || typeof window.misoAPI.getStatus !== "function") {
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

    try {
      const status = await window.misoAPI.getStatus();
      setMisoStatus({
        status: status?.status || "unknown",
        ready: Boolean(status?.ready),
        url: status?.url || null,
        reason: status?.reason || "",
      });
    } catch (_error) {
      setMisoStatus({
        status: "error",
        ready: false,
        url: null,
        reason: "Failed to query Miso status",
      });
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
    updateChatDraft(chatIdRef.current, {
      text: inputValue,
      attachments: draftAttachments,
    });
  }, [inputValue, draftAttachments]);

  useEffect(() => {
    if (messagePersistTimerRef.current) {
      clearTimeout(messagePersistTimerRef.current);
      messagePersistTimerRef.current = null;
    }

    const delay = isStreaming ? 250 : 0;
    messagePersistTimerRef.current = setTimeout(() => {
      messagePersistTimerRef.current = null;
      setChatMessages(chatIdRef.current, messages);
    }, delay);

    return () => {
      if (messagePersistTimerRef.current) {
        clearTimeout(messagePersistTimerRef.current);
        messagePersistTimerRef.current = null;
      }
    };
  }, [messages, isStreaming]);

  useEffect(() => {
    setChatThreadId(chatIdRef.current, threadIdRef.current);
    setChatModel(chatIdRef.current, { id: modelIdRef.current });
  }, []);

  const sendMessage = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) {
      return;
    }

    if (!window.misoAPI || typeof window.misoAPI.startStream !== "function") {
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

    const streamHandle = window.misoAPI.startStream(
      {
        threadId: threadIdRef.current,
        message: text,
        history: historyForModel,
      },
      {
        onMeta: (meta) => {
          if (meta && typeof meta.thread_id === "string" && meta.thread_id.trim()) {
            threadIdRef.current = meta.thread_id;
            setChatThreadId(chatIdRef.current, meta.thread_id);
          }

          if (meta && typeof meta.model === "string" && meta.model.trim()) {
            modelIdRef.current = meta.model;
            setChatModel(chatIdRef.current, { id: meta.model });
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
      />

    </div>
  );
};

export default ChatInterface;
