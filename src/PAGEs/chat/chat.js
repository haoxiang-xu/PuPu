import { useState, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";

const DEFAULT_DISCLAIMER = "AI can make mistakes, please double-check critical information.";

const ChatInterface = () => {
  const { theme, onFragment } = useContext(ConfigContext);

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [streamError, setStreamError] = useState("");
  const [misoStatus, setMisoStatus] = useState({
    status: "starting",
    ready: false,
    url: null,
  });

  const streamHandleRef = useRef(null);
  const threadIdRef = useRef(`thread-${Date.now()}`);

  const refreshMisoStatus = useCallback(async () => {
    if (!window.misoAPI || typeof window.misoAPI.getStatus !== "function") {
      setMisoStatus({
        status: "unavailable",
        ready: false,
        url: null,
      });
      return;
    }

    try {
      const status = await window.misoAPI.getStatus();
      setMisoStatus({
        status: status?.status || "unknown",
        ready: Boolean(status?.ready),
        url: status?.url || null,
      });
    } catch (_error) {
      setMisoStatus({
        status: "error",
        ready: false,
        url: null,
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
      if (streamHandleRef.current && typeof streamHandleRef.current.cancel === "function") {
        streamHandleRef.current.cancel();
      }
    };
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

    const userMessage = {
      id: userMessageId,
      role: "user",
      content: text,
    };
    const assistantPlaceholder = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
    };

    const nextMessages = [...messages, userMessage, assistantPlaceholder];

    setMessages(nextMessages);
    setInputValue("");
    setStreamError("");
    setIsStreaming(true);

    const streamHandle = window.misoAPI.startStream(
      {
        threadId: threadIdRef.current,
        message: text,
        history: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
      {
        onMeta: (meta) => {
          if (meta && typeof meta.thread_id === "string" && meta.thread_id.trim()) {
            threadIdRef.current = meta.thread_id;
          }
        },
        onToken: (delta) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: `${message.content || ""}${delta}`,
                  }
                : message,
            ),
          );
        },
        onDone: (_done) => {
          setIsStreaming(false);
          setActiveRequestId(null);
          streamHandleRef.current = null;
        },
        onError: (error) => {
          const errorMessage = error?.message || "Unknown stream error";
          setStreamError(errorMessage);
          setIsStreaming(false);
          setActiveRequestId(null);
          streamHandleRef.current = null;

          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== assistantMessageId) {
                return message;
              }
              if (message.content) {
                return message;
              }
              return {
                ...message,
                content: `[error] ${errorMessage}`,
              };
            }),
          );
        },
      },
    );

    streamHandleRef.current = streamHandle;
    setActiveRequestId(streamHandle.requestId);
  }, [inputValue, isStreaming, messages]);

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
      return `Connecting to Miso (${misoStatus.status})...`;
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
            : `Miso unavailable (${misoStatus.status})`
        }
        disclaimer={effectiveDisclaimer}
        showAttachments={true}
        onAttachFile={handleAttachFile}
        onAttachLink={handleAttachLink}
        onAttachGlobal={handleAttachGlobal}
      />

      <div
        style={{
          position: "absolute",
          top: 56,
          right: 20,
          fontSize: 11,
          opacity: 0.45,
          userSelect: "none",
          WebkitUserSelect: "none",
          color: theme?.color || "#222",
        }}
      >
        Miso: {misoStatus.status}
        {activeRequestId ? ` | req ${activeRequestId.slice(0, 8)}` : ""}
      </div>

    </div>
  );
};

export default ChatInterface;
