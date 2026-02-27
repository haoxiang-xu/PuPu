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
import {
  saveAttachmentPayload,
  loadAttachmentPayload,
  deleteAttachmentPayload,
} from "../../SERVICEs/attachment_storage";
import { LogoSVGs } from "../../BUILTIN_COMPONENTs/icon/icon_manifest.js";

const DEFAULT_DISCLAIMER =
  "AI can make mistakes, please double-check critical information.";
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const getFileExtension = (name) => {
  if (typeof name !== "string" || !name.includes(".")) {
    return "";
  }
  const ext = name.split(".").pop();
  return typeof ext === "string" ? ext.trim().toLowerCase() : "";
};

const guessMimeTypeFromExtension = (ext) => {
  if (ext === "pdf") {
    return "application/pdf";
  }
  if (ext === "png") {
    return "image/png";
  }
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  }
  if (ext === "gif") {
    return "image/gif";
  }
  if (ext === "webp") {
    return "image/webp";
  }
  return "";
};

const parseDataUrl = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].trim().toLowerCase(),
    data: match[2],
  };
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error(`Failed to read file: ${file?.name || "unknown"}`));
    reader.readAsDataURL(file);
  });

const createAttachmentPrompt = (attachments) => {
  const list = Array.isArray(attachments) ? attachments : [];
  const hasImage = list.some(
    (attachment) =>
      typeof attachment?.mimeType === "string" &&
      attachment.mimeType.toLowerCase().startsWith("image/"),
  );
  const hasPdf = list.some(
    (attachment) =>
      typeof attachment?.mimeType === "string" &&
      attachment.mimeType.toLowerCase() === "application/pdf",
  );

  if (hasImage && hasPdf) {
    return "Please analyze the attached image and file.";
  }
  if (hasImage) {
    return "Please analyze the attached image.";
  }
  if (hasPdf) {
    return "Please analyze the attached file.";
  }
  return "Please analyze the attached file.";
};

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

const HERO_PHRASES = [
  "How can I help you today?",
  "What would you like to explore?",
  "Ask me anything.",
  "What's on your mind?",
  "Ready to dive in?",
];

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
  const attachmentFileInputRef = useRef(null);
  const attachmentPayloadByChatRef = useRef(new Map());
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

  const activeModelCapabilities = useMemo(() => {
    const fallbackCapabilities =
      modelCatalog?.activeCapabilities ||
      EMPTY_MODEL_CATALOG.activeCapabilities;
    const selectedModel =
      typeof selectedModelId === "string" && selectedModelId.trim()
        ? selectedModelId.trim()
        : null;

    if (
      selectedModel &&
      modelCatalog?.modelCapabilities &&
      typeof modelCatalog.modelCapabilities === "object" &&
      modelCatalog.modelCapabilities[selectedModel]
    ) {
      return modelCatalog.modelCapabilities[selectedModel];
    }

    if (selectedModel && selectedModel === modelCatalog?.activeModel) {
      return fallbackCapabilities;
    }

    return fallbackCapabilities;
  }, [modelCatalog, selectedModelId]);

  const activeInputModalities = useMemo(() => {
    const rawModalities = Array.isArray(
      activeModelCapabilities?.input_modalities,
    )
      ? activeModelCapabilities.input_modalities
      : [];
    return new Set(
      rawModalities
        .map((item) =>
          typeof item === "string" ? item.trim().toLowerCase() : "",
        )
        .filter(Boolean),
    );
  }, [activeModelCapabilities]);

  const supportsImageAttachments = activeInputModalities.has("image");
  const supportsPdfAttachments = activeInputModalities.has("pdf");
  const attachmentsEnabled = supportsImageAttachments || supportsPdfAttachments;
  const attachmentsDisabledReason = attachmentsEnabled
    ? ""
    : "Current model does not support image or file inputs.";

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

      if (!nextActiveId || !nextActiveChat) {
        return;
      }

      if (nextActiveId === currentActiveId) {
        if (event.type === "chat_update_messages") {
          setMessages(nextActiveChat.messages || []);
        }
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
    const attachmentPayloadByChat = attachmentPayloadByChatRef.current;
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
      attachmentPayloadByChat.clear();
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

  const getOrCreateChatAttachmentPayloadMap = useCallback((chatId) => {
    if (!chatId) {
      return null;
    }
    const existing = attachmentPayloadByChatRef.current.get(chatId);
    if (existing instanceof Map) {
      return existing;
    }
    const created = new Map();
    attachmentPayloadByChatRef.current.set(chatId, created);
    return created;
  }, []);

  const rememberAttachmentPayloads = useCallback(
    (chatId, payloadEntries = []) => {
      const payloadMap = getOrCreateChatAttachmentPayloadMap(chatId);
      if (!payloadMap || !Array.isArray(payloadEntries)) {
        return;
      }

      payloadEntries.forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        const attachmentId =
          typeof entry.id === "string" && entry.id.trim()
            ? entry.id.trim()
            : "";
        if (
          !attachmentId ||
          !entry.payload ||
          typeof entry.payload !== "object"
        ) {
          return;
        }
        payloadMap.set(attachmentId, entry.payload);
      });
    },
    [getOrCreateChatAttachmentPayloadMap],
  );

  const removeAttachmentPayload = useCallback((chatId, attachmentId) => {
    if (!chatId || !attachmentId) {
      return;
    }
    const payloadMap = attachmentPayloadByChatRef.current.get(chatId);
    if (!(payloadMap instanceof Map)) {
      return;
    }
    payloadMap.delete(attachmentId);
  }, []);

  const resolveAttachmentPayloads = useCallback((chatId, attachments = []) => {
    const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
    if (normalizedAttachments.length === 0) {
      return { payloads: [], missingAttachmentNames: [] };
    }

    const payloadMap = attachmentPayloadByChatRef.current.get(chatId);
    const payloads = [];
    const missingAttachmentNames = [];

    normalizedAttachments.forEach((attachment, index) => {
      const attachmentId =
        typeof attachment?.id === "string" && attachment.id.trim()
          ? attachment.id.trim()
          : "";
      const attachmentName =
        typeof attachment?.name === "string" && attachment.name.trim()
          ? attachment.name.trim()
          : `attachment-${index + 1}`;
      const payload =
        attachmentId && payloadMap instanceof Map
          ? payloadMap.get(attachmentId)
          : null;

      if (payload && typeof payload === "object") {
        payloads.push(payload);
      } else {
        missingAttachmentNames.push(attachmentName);
      }
    });

    return { payloads, missingAttachmentNames };
  }, []);

  const buildHistoryForModel = useCallback((baseMessages, chatId) => {
    const normalizedBaseMessages = Array.isArray(baseMessages)
      ? baseMessages
      : [];
    const payloadMap = attachmentPayloadByChatRef.current.get(chatId);

    return normalizedBaseMessages
      .filter((message) => {
        if (!message || typeof message !== "object") {
          return false;
        }
        return ["system", "user", "assistant"].includes(message.role);
      })
      .map((message) => {
        const role = message.role;
        if (role !== "user") {
          if (typeof message.content !== "string" || !message.content.trim()) {
            return null;
          }
          return {
            role,
            content: message.content,
          };
        }

        const textContent =
          typeof message.content === "string" ? message.content.trim() : "";
        const attachmentMeta = Array.isArray(message.attachments)
          ? message.attachments
          : [];

        const contentBlocks = [];
        if (textContent) {
          contentBlocks.push({
            type: "text",
            text: textContent,
          });
        }

        attachmentMeta.forEach((attachment) => {
          const attachmentId =
            typeof attachment?.id === "string" && attachment.id.trim()
              ? attachment.id.trim()
              : "";
          if (!attachmentId || !(payloadMap instanceof Map)) {
            return;
          }
          const payload = payloadMap.get(attachmentId);
          if (payload && typeof payload === "object") {
            contentBlocks.push(payload);
          }
        });

        if (contentBlocks.length === 0) {
          if (!textContent) {
            return null;
          }
          return {
            role,
            content: textContent,
          };
        }

        if (
          contentBlocks.length === 1 &&
          contentBlocks[0]?.type === "text" &&
          typeof contentBlocks[0]?.text === "string"
        ) {
          return {
            role,
            content: contentBlocks[0].text,
          };
        }

        return {
          role,
          content: contentBlocks,
        };
      })
      .filter(Boolean);
  }, []);

  const startStreamRequest = useCallback(
    async ({
      chatId,
      text,
      attachmentsForMessage = [],
      baseMessages = [],
      clearComposer = false,
      reuseUserMessage = null,
      missingAttachmentPayloadMode = "block",
    }) => {
      const trimmedText = typeof text === "string" ? text.trim() : "";
      const normalizedAttachments = Array.isArray(attachmentsForMessage)
        ? attachmentsForMessage
        : [];
      const hasAttachments = normalizedAttachments.length > 0;
      const promptText =
        trimmedText ||
        (hasAttachments ? createAttachmentPrompt(normalizedAttachments) : "");

      if (!chatId || (!promptText && !hasAttachments)) {
        return false;
      }

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

      // Hydrate in-memory Map from IndexedDB for any missing payloads
      const payloadMap = getOrCreateChatAttachmentPayloadMap(chatId);
      const idsToHydrate = [
        ...normalizedAttachments,
        ...normalizedBaseMessages.flatMap((m) =>
          m.role === "user" && Array.isArray(m.attachments)
            ? m.attachments
            : [],
        ),
      ];
      for (const att of idsToHydrate) {
        if (att?.id && !payloadMap.has(att.id)) {
          const hydratedPayload = await loadAttachmentPayload(att.id);
          if (hydratedPayload) payloadMap.set(att.id, hydratedPayload);
        }
      }

      const { payloads: attachmentPayloads, missingAttachmentNames } =
        resolveAttachmentPayloads(chatId, normalizedAttachments);
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

      const historyForModel = buildHistoryForModel(
        normalizedBaseMessages,
        chatId,
      );

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
        streamHandle = api.miso.startStreamV2(
          {
            threadId: threadIdRef.current,
            message: promptText,
            history: historyForModel,
            attachments: payloadAttachments,
            options: {
              modelId: modelIdRef.current,
            },
            trace_level: "full",
          },
          {
            onFrame: (frame) => {
              if (!frame || frame.type === "token_delta") return;
              const patchTime = Date.now();

              // final_message carries the complete reply text
              if (frame.type === "final_message") {
                const finalContent =
                  typeof frame.payload?.content === "string"
                    ? frame.payload.content
                    : "";
                const nextStreamMessages = streamMessages.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content: finalContent,
                        updatedAt: patchTime,
                        traceFrames: [...(message.traceFrames || []), frame],
                      }
                    : message,
                );
                syncStreamMessages(nextStreamMessages);
                return;
              }

              // All other frames go into the trace timeline
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
            onToken: (_delta) => {
              // token_delta is not used directly — final reply comes from
              // the final_message frame via onFrame above.
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
                  // Only set content text fallback when there is no trace
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
      buildHistoryForModel,
      getOrCreateChatAttachmentPayloadMap,
      resolveAttachmentPayloads,
    ],
  );

  const sendMessage = useCallback(() => {
    const chatId = activeChatIdRef.current;
    const text = inputValue.trim();
    const hasAttachments = Array.isArray(draftAttachments)
      ? draftAttachments.length > 0
      : false;
    const hasActiveStream = Boolean(
      streamingChatIdRef.current && streamHandleRef.current,
    );
    if (!chatId || (!text && !hasAttachments) || hasActiveStream) {
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

    if (hasAttachments && !attachmentsEnabled) {
      setStreamError(
        attachmentsDisabledReason ||
          "Current model does not support image or file inputs.",
      );
      return;
    }

    startStreamRequest({
      chatId,
      text,
      attachmentsForMessage: draftAttachments,
      baseMessages: messages,
      clearComposer: true,
      missingAttachmentPayloadMode: "block",
    });
  }, [
    attachmentsDisabledReason,
    attachmentsEnabled,
    draftAttachments,
    inputValue,
    messages,
    startStreamRequest,
  ]);

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

      startStreamRequest({
        chatId,
        text,
        attachmentsForMessage: resendAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
        missingAttachmentPayloadMode: "degrade",
      });
    },
    [attachmentsEnabled, messages, startStreamRequest],
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

      startStreamRequest({
        chatId,
        text,
        attachmentsForMessage: originalAttachments,
        baseMessages,
        clearComposer: false,
        reuseUserMessage: targetMessage,
        missingAttachmentPayloadMode: "degrade",
      });
    },
    [attachmentsEnabled, messages, startStreamRequest],
  );

  const handleAttachFile = useCallback(() => {
    if (!attachmentsEnabled) {
      setStreamError(
        attachmentsDisabledReason ||
          "Current model does not support image or file inputs.",
      );
      return;
    }

    if (attachmentFileInputRef.current) {
      attachmentFileInputRef.current.click();
    }
  }, [attachmentsDisabledReason, attachmentsEnabled]);

  const processFiles = useCallback(
    async (rawFiles) => {
      const chatId = activeChatIdRef.current;
      if (!chatId || rawFiles.length === 0) {
        return;
      }

      if (!attachmentsEnabled) {
        setStreamError(
          attachmentsDisabledReason ||
            "Current model does not support image or file inputs.",
        );
        return;
      }

      const currentAttachmentCount = Array.isArray(draftAttachments)
        ? draftAttachments.length
        : 0;
      if (currentAttachmentCount >= MAX_ATTACHMENT_COUNT) {
        setStreamError(
          `You can attach up to ${MAX_ATTACHMENT_COUNT} files per message.`,
        );
        return;
      }

      const remainingSlots = MAX_ATTACHMENT_COUNT - currentAttachmentCount;
      const files = rawFiles.slice(0, remainingSlots);
      const warnings = [];
      if (rawFiles.length > remainingSlots) {
        warnings.push(
          `Only ${remainingSlots} additional attachment(s) were accepted.`,
        );
      }

      const attachmentEntries = [];
      const payloadEntries = [];

      for (const file of files) {
        const fileSize = Number(file?.size) || 0;
        const fileName =
          typeof file?.name === "string" && file.name.trim()
            ? file.name.trim()
            : "attachment";
        const ext = getFileExtension(fileName);
        const fallbackMimeType = guessMimeTypeFromExtension(ext);
        const mimeTypeRaw =
          typeof file?.type === "string" && file.type.trim()
            ? file.type.trim().toLowerCase()
            : fallbackMimeType;
        const isPdf = mimeTypeRaw === "application/pdf" || ext === "pdf";
        const isImage = mimeTypeRaw.startsWith("image/");

        if (!isPdf && !isImage) {
          warnings.push(
            `Skipped "${fileName}": only images and PDFs are supported.`,
          );
          continue;
        }

        if (fileSize <= 0 || fileSize > MAX_ATTACHMENT_BYTES) {
          warnings.push(
            `Skipped "${fileName}": file size must be between 1 byte and ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.`,
          );
          continue;
        }

        if (isPdf && !supportsPdfAttachments) {
          warnings.push(
            `Skipped "${fileName}": current model does not support PDF input.`,
          );
          continue;
        }

        if (isImage && !supportsImageAttachments) {
          warnings.push(
            `Skipped "${fileName}": current model does not support image input.`,
          );
          continue;
        }

        let parsedDataUrl = null;
        try {
          const dataUrl = await readFileAsDataUrl(file);
          parsedDataUrl = parseDataUrl(dataUrl);
        } catch (_error) {
          parsedDataUrl = null;
        }

        if (!parsedDataUrl || !parsedDataUrl.data) {
          warnings.push(`Skipped "${fileName}": failed to read file data.`);
          continue;
        }

        const normalizedMimeType = isPdf
          ? "application/pdf"
          : parsedDataUrl.mimeType || mimeTypeRaw || fallbackMimeType;
        if (!isPdf && !normalizedMimeType.startsWith("image/")) {
          warnings.push(`Skipped "${fileName}": invalid image format.`);
          continue;
        }

        const attachmentId = `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const attachmentMeta = {
          id: attachmentId,
          kind: "file",
          name: fileName,
          source: "local",
          mimeType: normalizedMimeType,
          ext: ext || undefined,
          size: fileSize,
          createdAt: Date.now(),
        };

        const attachmentPayload = isPdf
          ? {
              type: "pdf",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: parsedDataUrl.data,
                filename: fileName,
              },
            }
          : {
              type: "image",
              source: {
                type: "base64",
                media_type: normalizedMimeType,
                data: parsedDataUrl.data,
              },
            };

        attachmentEntries.push(attachmentMeta);
        payloadEntries.push({
          id: attachmentId,
          payload: attachmentPayload,
        });
      }

      if (attachmentEntries.length > 0) {
        rememberAttachmentPayloads(chatId, payloadEntries);
        payloadEntries.forEach(({ id, payload }, i) => {
          saveAttachmentPayload(id, payload, attachmentEntries[i]?.name).catch(
            () => {},
          );
        });
        setDraftAttachments((previous) => {
          const current = Array.isArray(previous) ? previous : [];
          return [...current, ...attachmentEntries];
        });
      }

      if (attachmentEntries.length === 0) {
        setStreamError(
          warnings[0] || "No compatible attachments were selected.",
        );
        return;
      }

      if (warnings.length > 0) {
        setStreamError(warnings[0]);
        return;
      }

      setStreamError("");
    },
    [
      attachmentsDisabledReason,
      attachmentsEnabled,
      draftAttachments,
      rememberAttachmentPayloads,
      supportsImageAttachments,
      supportsPdfAttachments,
    ],
  );

  const handleFileInputChange = useCallback(
    async (event) => {
      const rawFiles = Array.from(event?.target?.files || []);
      if (event?.target) {
        event.target.value = "";
      }
      await processFiles(rawFiles);
    },
    [processFiles],
  );

  const handleRemoveDraftAttachment = useCallback(
    (attachmentId) => {
      const chatId = activeChatIdRef.current;
      const normalizedAttachmentId =
        typeof attachmentId === "string" ? attachmentId.trim() : "";
      if (!normalizedAttachmentId) {
        return;
      }

      setDraftAttachments((previous) =>
        previous.filter(
          (attachment) => attachment?.id !== normalizedAttachmentId,
        ),
      );
      removeAttachmentPayload(chatId, normalizedAttachmentId);
      deleteAttachmentPayload(normalizedAttachmentId).catch(() => {});
    },
    [removeAttachmentPayload],
  );

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
    if (attachmentsDisabledReason) {
      return attachmentsDisabledReason;
    }
    return DEFAULT_DISCLAIMER;
  }, [
    attachmentsDisabledReason,
    streamError,
    hasBackgroundStream,
    isStreaming,
    misoStatus,
  ]);

  const isSendDisabled =
    (!misoStatus.ready && !isStreaming) || hasBackgroundStream;

  const isEmpty = messages.length === 0;
  const isDark = onThemeMode === "dark_mode";

  /* ── typewriter greeting ── */
  const [heroText, setHeroText] = useState(HERO_PHRASES[0]);
  const [heroCursor, setHeroCursor] = useState(true);
  const heroPhraseRef = useRef(0);
  const heroCharRef = useRef(HERO_PHRASES[0].length);
  const heroDeletingRef = useRef(false);

  useEffect(() => {
    let timer;
    const tick = () => {
      const phrase = HERO_PHRASES[heroPhraseRef.current];
      if (!heroDeletingRef.current) {
        if (heroCharRef.current < phrase.length) {
          heroCharRef.current += 1;
          setHeroText(phrase.slice(0, heroCharRef.current));
          timer = setTimeout(tick, 52 + Math.random() * 32);
        } else {
          timer = setTimeout(() => {
            heroDeletingRef.current = true;
            tick();
          }, 2000);
        }
      } else {
        if (heroCharRef.current > 0) {
          heroCharRef.current -= 1;
          setHeroText(phrase.slice(0, heroCharRef.current));
          timer = setTimeout(tick, 26 + Math.random() * 16);
        } else {
          heroDeletingRef.current = false;
          heroPhraseRef.current =
            (heroPhraseRef.current + 1) % HERO_PHRASES.length;
          timer = setTimeout(tick, 380);
        }
      }
    };
    timer = setTimeout(tick, 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setHeroCursor((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

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
    onDropFiles: processFiles,
    attachments: draftAttachments,
    onRemoveAttachment: handleRemoveDraftAttachment,
    attachmentsEnabled,
    attachmentsDisabledReason,
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
      <input
        ref={attachmentFileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
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
              {heroText}
              <span
                style={{
                  display: "inline-block",
                  width: "2px",
                  height: "1em",
                  marginLeft: "3px",
                  verticalAlign: "text-bottom",
                  borderRadius: "1px",
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.72)"
                    : "rgba(0,0,0,0.62)",
                  opacity: heroCursor ? 1 : 0,
                  transition: "opacity 0.08s",
                }}
              />
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
