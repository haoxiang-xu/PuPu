import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";
import {
  bootstrapChatsStore,
  refreshCharacterChatMetadata,
  setChatAgentOrchestration,
  setChatGeneratedUnread,
  setChatMessages,
  setChatModel,
  setChatThreadId,
} from "../../SERVICEs/chat_storage";
import { api, EMPTY_MODEL_CATALOG, FrontendApiError } from "../../SERVICEs/api";
import { subscribeModelCatalogRefresh } from "../../SERVICEs/model_catalog_refresh";
import { readModelProviders } from "../../COMPONENTs/settings/model_providers/storage";
import { LogoSVGs } from "../../BUILTIN_COMPONENTs/icon/icon_manifest.js";
import { useChatAttachments } from "./hooks/use_chat_attachments";
import { useChatSessionState } from "./hooks/use_chat_session_state";
import { useChatStream } from "./hooks/use_chat_stream";

const DEFAULT_DISCLAIMER =
  "AI can make mistakes, please double-check critical information.";
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const UNCHAIN_STATUS_POLL_INTERVAL_STARTING_MS = 1500;
const UNCHAIN_STATUS_POLL_INTERVAL_READY_MS = 15000;

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

const isSameUnchainStatus = (current, next) =>
  current?.status === next?.status &&
  current?.ready === next?.ready &&
  current?.url === next?.url &&
  current?.reason === next?.reason;

const HeroHeadline = ({ isDark }) => {
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
      } else if (heroCharRef.current > 0) {
        heroCharRef.current -= 1;
        setHeroText(phrase.slice(0, heroCharRef.current));
        timer = setTimeout(tick, 26 + Math.random() * 16);
      } else {
        heroDeletingRef.current = false;
        heroPhraseRef.current =
          (heroPhraseRef.current + 1) % HERO_PHRASES.length;
        timer = setTimeout(tick, 380);
      }
    };

    timer = setTimeout(tick, 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setHeroCursor((value) => !value), 530);
    return () => clearInterval(id);
  }, []);

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

  return (
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
  );
};

const ChatInterface = () => {
  const { theme, onFragment, onThemeMode } = useContext(ConfigContext);

  const [bootstrapped] = useState(() => bootstrapChatsStore());
  const initialChat = bootstrapped.activeChat;
  const [draftAttachments, setDraftAttachments] = useState(
    () => initialChat.draft?.attachments || [],
  );
  const [streamError, setStreamError] = useState("");
  const [unchainStatus, setUnchainStatus] = useState({
    status: "starting",
    ready: false,
    url: null,
    reason: "",
  });
  const [modelCatalog, setModelCatalog] = useState(() => EMPTY_MODEL_CATALOG);
  const [configuredProviders, setConfiguredProviders] = useState(() => {
    const stored = readModelProviders();
    return { hasOpenAI: !!stored.openai_api_key, hasAnthropic: !!stored.anthropic_api_key };
  });

  const activeStreamMessagesRef = useRef(null);
  const messagePersistTimerRef = useRef(null);
  const commitUnchainStatus = useCallback((nextStatus) => {
    setUnchainStatus((currentStatus) =>
      isSameUnchainStatus(currentStatus, nextStatus)
        ? currentStatus
        : nextStatus,
    );
  }, []);

  const storageApi = useMemo(
    () => ({
      setChatAgentOrchestration,
      setChatGeneratedUnread,
      setChatMessages,
      setChatModel,
      setChatThreadId,
    }),
    [],
  );

  const session = useChatSessionState({
    bootstrapped,
    draftAttachments,
    setDraftAttachments,
    activeStreamMessagesRef,
    setStreamError,
  });
  const activeChatIdRef = session.activeChatIdRef;
  const modelIdRef = session.modelIdRef;
  const setSelectedModelId = session.setSelectedModelId;
  const hasSelectedModel = useMemo(() => {
    if (session.isCharacterChat) {
      return true;
    }

    const selectedModelId =
      typeof session.selectedModelId === "string"
        ? session.selectedModelId.trim()
        : "";
    return Boolean(selectedModelId && selectedModelId !== "unchain-unset");
  }, [session.isCharacterChat, session.selectedModelId]);

  const activeModelCapabilities = useMemo(() => {
    const fallbackCapabilities =
      modelCatalog?.activeCapabilities || EMPTY_MODEL_CATALOG.activeCapabilities;
    const selectedModel =
      typeof session.selectedModelId === "string" && session.selectedModelId.trim()
        ? session.selectedModelId.trim()
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
  }, [modelCatalog, session.selectedModelId]);

  const activeInputModalities = useMemo(() => {
    const rawModalities = Array.isArray(activeModelCapabilities?.input_modalities)
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
  const modelSupportsAttachments =
    supportsImageAttachments || supportsPdfAttachments;
  const attachmentsEnabled = hasSelectedModel && modelSupportsAttachments;
  const attachmentsDisabledReason = !hasSelectedModel
    ? "Select a model to enable attachments."
    : modelSupportsAttachments
      ? ""
      : "Current model does not support image or file inputs.";

  const attachments = useChatAttachments({
    chatId: session.activeChatId,
    initialDraftAttachments: initialChat.draft?.attachments || [],
    draftAttachments,
    setDraftAttachments,
    attachmentsEnabled,
    attachmentsDisabledReason,
    supportsImageAttachments,
    supportsPdfAttachments,
    setStreamError,
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    maxAttachmentCount: MAX_ATTACHMENT_COUNT,
  });

  const stream = useChatStream({
    chatId: session.activeChatId,
    messages: session.messages,
    setMessages: session.setMessages,
    inputValue: session.inputValue,
    setInputValue: session.setInputValue,
    draftAttachments,
    setDraftAttachments,
    selectedModelId: session.selectedModelId,
    agentOrchestration: session.agentOrchestration,
    selectedToolkits: session.selectedToolkits,
    selectedWorkspaceIds: session.selectedWorkspaceIds,
    chatKind: session.activeChatKind,
    characterId: session.activeCharacterId,
    threadIdRef: session.threadIdRef,
    systemPromptOverrides: session.systemPromptOverridesRef.current,
    attachmentApi: attachments,
    storageApi,
    streamError,
    setStreamError,
    attachmentsEnabled,
    attachmentsDisabledReason,
    activeChatIdRef: session.activeChatIdRef,
    messagesRef: session.messagesRef,
    modelIdRef: session.modelIdRef,
    setSelectedModelId: session.setSelectedModelId,
    setAgentOrchestration: session.setAgentOrchestration,
    activeStreamMessagesRef,
  });

  useEffect(() => {
    const currentChatId = session.activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }

    if (messagePersistTimerRef.current) {
      clearTimeout(messagePersistTimerRef.current);
      messagePersistTimerRef.current = null;
    }

    const delay = stream.isStreaming ? 250 : 0;
    messagePersistTimerRef.current = setTimeout(() => {
      messagePersistTimerRef.current = null;
      storageApi.setChatMessages(currentChatId, session.messages, {
        source: "chat-page",
      });
    }, delay);

    return () => {
      if (messagePersistTimerRef.current) {
        clearTimeout(messagePersistTimerRef.current);
        messagePersistTimerRef.current = null;
      }
    };
  }, [session.messages, session.activeChatIdRef, storageApi, stream.isStreaming]);

  const refreshMisoStatus = useCallback(async () => {
    try {
      const status = await api.unchain.getStatus();
      commitUnchainStatus({
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
          ? "Electron detected, but preload failed to expose unchainAPI. Check Electron main/preload console logs."
          : "Web mode detected. Run the app with Electron (`npm start` or `npm run start:electron`).";
        commitUnchainStatus({
          status: "unavailable",
          ready: false,
          url: null,
          reason: runtimeHint,
        });
        return;
      }

      commitUnchainStatus({
        status: "error",
        ready: false,
        url: null,
        reason: "Failed to query Miso status",
      });
    }
  }, [commitUnchainStatus]);

  const unchainStatusPollInterval = unchainStatus.ready
    ? UNCHAIN_STATUS_POLL_INTERVAL_READY_MS
    : UNCHAIN_STATUS_POLL_INTERVAL_STARTING_MS;

  const refreshModelCatalog = useCallback(async () => {
    try {
      const normalized = await api.unchain.getModelCatalog();
      setModelCatalog(normalized);

      if (
        !session.isCharacterChat &&
        (modelIdRef.current === "unchain-unset" || !modelIdRef.current) &&
        normalized.activeModel
      ) {
        const currentChatId = activeChatIdRef.current;
        modelIdRef.current = normalized.activeModel;
        setSelectedModelId(normalized.activeModel);
        if (currentChatId) {
          storageApi.setChatModel(
            currentChatId,
            { id: normalized.activeModel },
            { source: "chat-page" },
          );
        }
      }
    } catch (_error) {
      // ignore transient catalog fetch failures
    }
  }, [
    activeChatIdRef,
    modelIdRef,
    session.isCharacterChat,
    setSelectedModelId,
    storageApi,
  ]);

  useEffect(() => {
    refreshMisoStatus();

    const timer = setInterval(() => {
      refreshMisoStatus();
    }, unchainStatusPollInterval);

    return () => {
      clearInterval(timer);
    };
  }, [refreshMisoStatus, unchainStatusPollInterval]);

  useEffect(() => {
    if (!unchainStatus.ready) {
      return undefined;
    }

    refreshModelCatalog();
    let cancelled = false;
    const refreshPersistedCharacterAvatars = async () => {
      try {
        const response = await api.unchain.listCharacters();
        if (cancelled) {
          return;
        }
        refreshCharacterChatMetadata(response?.characters || [], {
          source: "character-avatar-refresh",
        });
      } catch (_error) {
        // ignore transient character catalog failures
      }
    };

    refreshPersistedCharacterAvatars();
    const unsubscribeModelCatalogRefresh = subscribeModelCatalogRefresh(() => {
      refreshModelCatalog();
      const stored = readModelProviders();
      setConfiguredProviders({ hasOpenAI: !!stored.openai_api_key, hasAnthropic: !!stored.anthropic_api_key });
    });

    return () => {
      cancelled = true;
      unsubscribeModelCatalogRefresh();
    };
  }, [unchainStatus.ready, refreshModelCatalog]);

  const onSelectModel = useCallback(
    (modelId) => {
      session.handleSelectModel(modelId, stream.isStreaming);
    },
    [session.handleSelectModel, stream.isStreaming],
  );

  const effectiveDisclaimer = useMemo(() => {
    if (stream.streamError) {
      return `Miso error: ${stream.streamError}`;
    }
    if (stream.hasBackgroundStream) {
      return "Another chat is streaming a response...";
    }
    if (stream.isStreaming) {
      return "Miso is streaming a response...";
    }
    if (!unchainStatus.ready) {
      return unchainStatus.reason
        ? `Unchain ${unchainStatus.status}: ${unchainStatus.reason}`
        : `Connecting to Unchain (${unchainStatus.status})...`;
    }
    if (!hasSelectedModel) {
      return "Select a model to send a message.";
    }
    if (attachmentsDisabledReason) {
      return attachmentsDisabledReason;
    }
    return DEFAULT_DISCLAIMER;
  }, [
    hasSelectedModel,
    attachmentsDisabledReason,
    unchainStatus,
    stream.hasBackgroundStream,
    stream.isStreaming,
    stream.streamError,
  ]);

  const isSendDisabled =
    (!unchainStatus.ready && !stream.isStreaming) ||
    stream.hasBackgroundStream ||
    !hasSelectedModel;

  const [characterAvailability, setCharacterAvailability] = useState("");

  useEffect(() => {
    if (!session.isCharacterChat || !session.activeCharacterId || !unchainStatus.ready) {
      setCharacterAvailability("");
      return;
    }

    let cancelled = false;
    const fetchAvailability = async () => {
      try {
        const result = await api.unchain.previewCharacterDecision({
          characterId: session.activeCharacterId,
        });
        if (!cancelled) {
          const availability =
            typeof result?.evaluation?.availability === "string"
              ? result.evaluation.availability
              : "";
          setCharacterAvailability(availability);
        }
      } catch (_error) {
        if (!cancelled) setCharacterAvailability("");
      }
    };

    fetchAvailability();
    const timer = setInterval(fetchAvailability, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session.isCharacterChat, session.activeCharacterId, unchainStatus.ready]);

  const isEmpty = session.messages.length === 0;
  const isDark = onThemeMode === "dark_mode";

  const sharedChatInputProps = useMemo(
    () => ({
      value: session.inputValue,
      onChange: session.setInputValue,
      onSend: stream.sendNewTurn,
      onStop: stream.stopStream,
      isStreaming: stream.isStreaming,
      sendDisabled: isSendDisabled,
      placeholder: unchainStatus.ready
        ? "Message PuPu Chat..."
        : `Miso unavailable (${unchainStatus.status})${unchainStatus.reason ? `: ${unchainStatus.reason}` : ""}`,
      disclaimer: effectiveDisclaimer,
      showAttachments: true,
      onAttachFile: attachments.handleAttachFile,
      onDropFiles: attachments.processFiles,
      attachments: draftAttachments,
      onRemoveAttachment: attachments.removeDraftAttachment,
      attachmentsEnabled,
      attachmentsDisabledReason,
      modelCatalog,
      selectedModelId: session.selectedModelId,
      onSelectModel,
      modelSelectDisabled: stream.isStreaming || session.isCharacterChat,
      showModelSelector: !session.isCharacterChat,
      showToolSelector: !session.isCharacterChat,
      showWorkspaceSelector: !session.isCharacterChat,
      selectedToolkits: session.selectedToolkits,
      onToolkitsChange: session.setSelectedToolkits,
      selectedWorkspaceIds: session.selectedWorkspaceIds,
      onWorkspaceIdsChange: session.setSelectedWorkspaceIds,
    }),
    [
      session.inputValue, session.setInputValue, session.selectedModelId,
      session.isCharacterChat, session.selectedToolkits, session.setSelectedToolkits,
      session.selectedWorkspaceIds, session.setSelectedWorkspaceIds,
      stream.sendNewTurn, stream.stopStream, stream.isStreaming,
      isSendDisabled, unchainStatus.ready, unchainStatus.status, unchainStatus.reason,
      effectiveDisclaimer, attachments.handleAttachFile, attachments.processFiles,
      draftAttachments, attachments.removeDraftAttachment,
      attachmentsEnabled, attachmentsDisabledReason, modelCatalog, onSelectModel,
    ],
  );

  return (
    <div
      data-chat-id={session.activeChatId}
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
        ref={attachments.attachmentFileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        style={{ display: "none" }}
        onChange={attachments.handleFileInputChange}
      />
      {isEmpty ? (
        <div
          key={session.activeChatId}
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
            <HeroHeadline isDark={isDark} />

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

            {(() => {
              const providers = modelCatalog?.providers || {};
              const chips = [
                ...(providers.ollama || []).map((model) => ({
                  id: `ollama:${model}`,
                  label: model,
                  provider: "ollama",
                })),
                ...(configuredProviders.hasOpenAI ? providers.openai || [] : []).map((model) => ({
                  id: `openai:${model}`,
                  label: model,
                  provider: "openai",
                })),
                ...(configuredProviders.hasAnthropic ? providers.anthropic || [] : []).map((model) => ({
                  id: `anthropic:${model}`,
                  label: model,
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
                  {chips.map((chip) => {
                    const active = session.selectedModelId === chip.id;
                    const IconComp = PROVIDER_ICON[chip.provider];
                    return (
                      <button
                        key={chip.id}
                        onClick={() => onSelectModel(chip.id)}
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
                          transform: active ? "translateY(-3px)" : "translateY(0)",
                          boxShadow: active
                            ? isDark
                              ? "0 6px 16px rgba(0,0,0,0.40), 0 2px 4px rgba(0,0,0,0.25)"
                              : "0 6px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.07)"
                            : "none",
                        }}
                        onMouseEnter={(event) => {
                          if (active) return;
                          event.currentTarget.style.background = isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.06)";
                          event.currentTarget.style.borderColor = isDark
                            ? "rgba(255,255,255,0.15)"
                            : "rgba(0,0,0,0.14)";
                          event.currentTarget.style.color = isDark
                            ? "rgba(255,255,255,0.75)"
                            : "rgba(0,0,0,0.70)";
                        }}
                        onMouseLeave={(event) => {
                          if (active) return;
                          event.currentTarget.style.background = isDark
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.03)";
                          event.currentTarget.style.borderColor = isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.09)";
                          event.currentTarget.style.color = isDark
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
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <>
          <ChatMessages
            chatId={session.activeChatId}
            messages={session.messages}
            isStreaming={stream.isStreaming}
            isCharacterChat={session.isCharacterChat}
            characterName={session.activeCharacterName}
            characterAvatar={session.activeCharacterAvatar}
            characterAvailability={characterAvailability}
            onDeleteMessage={stream.deleteTurn}
            onResendMessage={stream.resendTurn}
            onEditMessage={stream.editTurn}
            onToolConfirmationDecision={stream.handleToolConfirmationDecision}
            toolConfirmationUiStateById={stream.toolConfirmationUiStateById}
            pendingToolConfirmationRequests={
              stream.pendingToolConfirmationRequests
            }
            pendingContinuationRequest={stream.pendingContinuationRequest}
            onContinuationDecision={stream.handleContinuationDecision}
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
