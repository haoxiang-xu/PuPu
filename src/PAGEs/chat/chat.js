import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  NavigationContext,
  ThemeContext,
} from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";
import SecretCaptureModal from "./secret_capture_modal";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  bootstrapChatsStore,
  claimChatDraft,
  getChatMessages,
  markChatStarted,
  refreshCharacterChatMetadata,
  releaseAllChatDraftClaims,
  releaseChatDraftClaim,
  replaceClaimedChatDraft,
  setChatAgentOrchestration,
  setChatGeneratedUnread,
  setChatMessages,
  setChatModel,
  setChatThreadId,
  updateChatDraft,
} from "../../SERVICEs/chat_storage";
import { api, EMPTY_MODEL_CATALOG, FrontendApiError } from "../../SERVICEs/api";
import { subscribeModelCatalogRefresh } from "../../SERVICEs/model_catalog_refresh";
import {
  start as progressStart,
  stop as progressStop,
} from "../../SERVICEs/progress_bus";
import { resolveCustomModelCapabilities } from "../../SERVICEs/custom_provider_store";
import { providerSecretConfigured } from "../../SERVICEs/provider_secret_status";
import { LogoSVGs, UISVGs } from "../../BUILTIN_COMPONENTs/icon/icon_manifest.js";
import { useChatAttachments } from "./hooks/use_chat_attachments";
import { useChatSessionState } from "./hooks/use_chat_session_state";
import { useChatStream } from "./hooks/use_chat_stream";
import { consumeStreamFinalizedPersist } from "./hooks/stream_persist_dedupe";
import useSmoothResizeFrame from "./hooks/use_smooth_resize_frame";
import { usePluginSkillSync } from "./hooks/use_plugin_skill_sync";
import { createStreamingMessageStore } from "../../SERVICEs/streaming_message_store";
import { PUPU_PREFILL_COMPOSER } from "../../SERVICEs/composer_prefill";
import { selectLatestContextCompositionBundle } from "../../SERVICEs/context_composition_v1";
import {
  buildContextUsageView,
  selectContextWindowTokens,
  selectLatestContextUsage,
} from "../../SERVICEs/context_usage_v1";
import * as bootProgress from "../../SERVICEs/boot_progress";

const DEFAULT_DISCLAIMER =
  "AI can make mistakes, please double-check critical information.";
/* fallback viewport inset before the floating input is first measured */
const CHAT_BOTTOM_VIEWPORT_INSET = 160;
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const UNCHAIN_STATUS_POLL_INTERVAL_STARTING_MS = 1500;
const UNCHAIN_STATUS_POLL_INTERVAL_READY_MS = 15000;

const _OllamaSVG = LogoSVGs.ollama;
const _OpenAISVG = LogoSVGs.open_ai;
const _AnthropicSVG = LogoSVGs.Anthropic;
/* generic fallback glyph for custom / unknown providers */
const _CustomProviderSVG = UISVGs.server;

const PROVIDER_ICON = {
  ollama: _OllamaSVG,
  openai: _OpenAISVG,
  anthropic: _AnthropicSVG,
};

/**
 * Resolve the icon component for a provider chip. Built-in providers use their
 * brand logo; custom.* (and any unrecognized) provider falls back to a generic
 * glyph so the chip still renders (design §6.3).
 */
const resolveProviderIcon = (provider) =>
  PROVIDER_ICON[provider] || _CustomProviderSVG;

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

const readConfiguredBuiltInProviders = () => ({
  hasOpenAI: providerSecretConfigured("openai"),
  hasAnthropic: providerSecretConfigured("anthropic"),
});

/* Rise-in wrapper that DROPS its animation once finished. The lingering
   transform of `fill: both` turns a static wrapper into a stacking context,
   and a stacking context on a NON-positioned element paints in the in-flow
   background stage — underneath later inline text. With the animation left
   on, the whole input subtree (incl. the floating attach panel, its z-index
   notwithstanding) painted BELOW the greeting's glyphs, so the panel could
   neither cover nor backdrop-blur them. Clearing the animation at its
   resting frame restores normal paint order. */
const RiseIn = ({ delay, style, children }) => {
  const [settled, setSettled] = useState(false);
  return (
    <div
      onAnimationEnd={(e) => {
        /* animationend bubbles — only settle on our own rise */
        if (e.target === e.currentTarget) setSettled(true);
      }}
      style={{
        ...(settled
          ? {}
          : {
              animation: "heroRise 0.5s cubic-bezier(0.22,1,0.36,1) both",
              animationDelay: delay,
            }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const HeroHeadline = ({ isDark }) => {
  const [heroText, setHeroText] = useState(HERO_PHRASES[0]);
  const [heroCursor, setHeroCursor] = useState(true);
  /* Once the rise animation ends we DROP it. A lingering animation/transform
     keeps this element on its own compositing layer, and a composited sibling
     is invisible to the attach panel's backdrop-filter — so the frosted panel
     can't blur the greeting while it's still "animating". Removing the
     animation (already at its resting frame) lets the greeting rejoin the
     normal backdrop, and the blur works. */
  const [heroSettled, setHeroSettled] = useState(false);
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
      onAnimationEnd={() => setHeroSettled(true)}
      style={{
        animation: heroSettled
          ? "none"
          : "heroRise 0.5s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: heroSettled ? undefined : "55ms",
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
  const { t } = useTranslation();
  const { theme, onThemeMode } = useContext(ThemeContext) || {};
  const { onFragment } = useContext(NavigationContext) || {};

  const [bootstrapped] = useState(() => {
    const result = bootstrapChatsStore();
    /* Chat store hydration completing is the boot gate's second milestone
       (S2, 55% -> 80%); this runs synchronously in the initializer, right
       as hydration finishes. */
    bootProgress.set(80);
    return result;
  });
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
  const [recipeOptions, setRecipeOptions] = useState([]);
  const [configuredProviders, setConfiguredProviders] = useState(
    readConfiguredBuiltInProviders,
  );

  const activeStreamsRef = useRef(new Map());
  const messagePersistTimerRef = useRef(null);
  const streamingMessageStoreRef = useRef(null);
  if (!streamingMessageStoreRef.current) {
    streamingMessageStoreRef.current = createStreamingMessageStore();
  }
  const commitUnchainStatus = useCallback((nextStatus) => {
    setUnchainStatus((currentStatus) =>
      isSameUnchainStatus(currentStatus, nextStatus)
        ? currentStatus
        : nextStatus,
    );
  }, []);

  const storageApi = useMemo(
    () => ({
      getChatMessages,
      claimChatDraft,
      markChatStarted,
      releaseAllChatDraftClaims,
      setChatAgentOrchestration,
      setChatGeneratedUnread,
      setChatMessages,
      setChatModel,
      setChatThreadId,
      releaseChatDraftClaim,
      replaceClaimedChatDraft,
      updateChatDraft,
    }),
    [],
  );

  const session = useChatSessionState({
    bootstrapped,
    draftAttachments,
    setDraftAttachments,
    activeStreamsRef,
    setStreamError,
  });
  const activeChatIdRef = session.activeChatIdRef;
  const modelIdRef = session.modelIdRef;
  const setInputValue = session.setComposerInputValue;
  const setSelectedModelId = session.setSelectedModelId;
  const setSelectedToolkits = session.setSelectedToolkits;
  const setSelectedWorkspaceIds = session.setSelectedWorkspaceIds;

  /* Boot gate S3: chat page's first effect firing is "chat first-screen
     rendered" — the readiness threshold the hero-boot-overlay design pins
     the Enter gate to. One-time and idempotent (bootProgress.signalReady()
     no-ops on repeat calls). It satisfies ONE of the boot gates and dismisses
     nothing: the overlay stays up until the local backend is ready too, and
     then the user drives the actual transition into chat. */
  useEffect(() => {
    bootProgress.signalReady();
  }, []);

  /* "Try in chat" from the Plugins app-store modal (plugin_detail_page.js):
     the modal has no shared component tree with this page, so it prefills
     the composer over a plain window event (src/SERVICEs/composer_prefill.js)
     rather than a new context provider. Mounted once — session.setInputValue
     is a stable useState setter and always targets whichever chat is
     currently active. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePrefill = (event) => {
      const text = typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      setInputValue(text);
    };
    window.addEventListener(PUPU_PREFILL_COMPOSER, handlePrefill);
    return () => window.removeEventListener(PUPU_PREFILL_COMPOSER, handlePrefill);
  }, [setInputValue]);

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

    // 1) Catalog hit (built-in models AND custom.* models merged into the
    //    catalog via mergeCustomProvidersIntoCatalog).
    if (
      selectedModel &&
      modelCatalog?.modelCapabilities &&
      typeof modelCatalog.modelCapabilities === "object" &&
      modelCatalog.modelCapabilities[selectedModel]
    ) {
      return modelCatalog.modelCapabilities[selectedModel];
    }

    // 2) Custom-capabilities hit — resolve directly from the definition store
    //    so tool/attachment gating is correct even before the catalog has
    //    refreshed after a custom provider change (design §6.4).
    if (selectedModel) {
      const customCapabilities = resolveCustomModelCapabilities(selectedModel);
      if (customCapabilities) {
        return customCapabilities;
      }
    }

    // 3) Default.
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
  const modelSupportsTools = activeModelCapabilities?.supports_tools !== false;
  const attachmentsEnabled = hasSelectedModel && modelSupportsAttachments;
  const attachmentsDisabledReason = !hasSelectedModel
    ? "Select a model to enable attachments."
    : modelSupportsAttachments
      ? ""
      : "Current model does not support image or file inputs.";

  usePluginSkillSync(unchainStatus.ready);

  const effectiveSelectedToolkits = useMemo(
    () => (modelSupportsTools ? session.selectedToolkits : []),
    [modelSupportsTools, session.selectedToolkits],
  );
  const effectiveSelectedWorkspaceIds = useMemo(
    () => (modelSupportsTools ? session.selectedWorkspaceIds : []),
    [modelSupportsTools, session.selectedWorkspaceIds],
  );
  const handleToolkitsChange = useCallback(
    (nextToolkits) => {
      if (modelSupportsTools) {
        setSelectedToolkits(nextToolkits);
      }
    },
    [modelSupportsTools, setSelectedToolkits],
  );
  const handleWorkspaceIdsChange = useCallback(
    (nextWorkspaceIds) => {
      if (modelSupportsTools) {
        setSelectedWorkspaceIds(nextWorkspaceIds);
      }
    },
    [modelSupportsTools, setSelectedWorkspaceIds],
  );

  const attachments = useChatAttachments({
    chatId: session.activeChatId,
    initialDraftAttachments: initialChat.draft?.attachments || [],
    draftAttachments,
    setDraftAttachments: session.setComposerDraftAttachments,
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
    composerRevisionByChatIdRef: session.composerRevisionByChatIdRef,
    draftAttachments,
    setDraftAttachments,
    selectedModelId: session.selectedModelId,
    agentOrchestration: session.agentOrchestration,
    selectedToolkits: effectiveSelectedToolkits,
    selectedWorkspaceIds: effectiveSelectedWorkspaceIds,
    selectedRecipeName: session.selectedRecipeName,
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
    activeStreamsRef,
    streamingMessageStore: streamingMessageStoreRef.current,
    t,
  });
  const {
    cancelRunForTest: streamCancelRunForTest,
    getRunForTest: streamGetRunForTest,
    sendForTest: streamSendForTest,
    isStreaming: streamIsStreaming,
  } = stream;

  useEffect(() => {
    const currentChatId = session.activeChatId;
    if (!currentChatId) {
      return;
    }

    if (messagePersistTimerRef.current) {
      clearTimeout(messagePersistTimerRef.current);
      messagePersistTimerRef.current = null;
    }

    // T4(B 批性能):流式 lull-persist 节奏 250ms → 2000ms(对齐 background
    // persister)。每次落盘是整库写(实测 48–68ms 长任务),250ms 会在每个 token
    // 间歇反复触发;2s 窗口内的崩溃丢失量与后台会话一致,done 边沿仍由
    // finalizeStreamPersist 同步兜底(见 use_chat_stream onDone)。
    const delay = streamIsStreaming ? 2000 : 0;
    messagePersistTimerRef.current = setTimeout(() => {
      messagePersistTimerRef.current = null;
      const messagesToPersist = streamIsStreaming
        ? streamingMessageStoreRef.current.materializeMessages({
            chatId: currentChatId,
            messages: session.messages,
          })
        : session.messages;
      const activeStreamMessages =
        activeStreamsRef.current.get(currentChatId)?.messages;
      if (
        !streamIsStreaming &&
        Array.isArray(activeStreamMessages) &&
        activeStreamMessages !== session.messages
      ) {
        return;
      }
      // T3(B 批性能):done 边沿 finalizeStreamPersist 已同步写过同一数组引用
      // (flushSync → setMessages 传递的就是 finalize 那份),这里跳过重复的整库写
      // (实测 ~47ms 长任务)。引用不匹配(subagent 链路/后续真实变更)照常落盘。
      if (consumeStreamFinalizedPersist(currentChatId, messagesToPersist)) {
        return;
      }
      storageApi.setChatMessages(currentChatId, messagesToPersist, {
        source: "chat-page",
      });
    }, delay);

    return () => {
      if (messagePersistTimerRef.current) {
        clearTimeout(messagePersistTimerRef.current);
        messagePersistTimerRef.current = null;
      }
    };
  }, [session.activeChatId, session.messages, storageApi, streamIsStreaming]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.__pupuTestBridge) {
      return undefined;
    }
    const offSendMessage = window.__pupuTestBridge.register(
      "sendMessage",
      (payload = {}) =>
        streamSendForTest({ ...payload, wait_for_completion: true }),
    );
    const offStartRun = window.__pupuTestBridge.register(
      "startChatRun",
      (payload = {}) =>
        streamSendForTest({ ...payload, wait_for_completion: false }),
    );
    const offGetRun = window.__pupuTestBridge.register(
      "getChatRun",
      streamGetRunForTest,
    );
    const offCancelRun = window.__pupuTestBridge.register(
      "cancelChatRun",
      streamCancelRunForTest,
    );
    const offCancelMessage = window.__pupuTestBridge.register(
      "cancelMessage",
      async (payload = {}) => {
        try {
          const result = await streamCancelRunForTest(payload);
          return { ...result, was_streaming: true };
        } catch (error) {
          if (!payload?.attempt_id && error?.code === "run_not_active") {
            return { ok: true, was_streaming: false };
          }
          throw error;
        }
      },
    );
    return () => {
      offSendMessage && offSendMessage();
      offStartRun && offStartRun();
      offGetRun && offGetRun();
      offCancelRun && offCancelRun();
      offCancelMessage && offCancelMessage();
    };
  }, [streamCancelRunForTest, streamGetRunForTest, streamSendForTest]);

  const refreshUnchainStatus = useCallback(async () => {
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
        reason: "Failed to query Unchain status",
      });
    }
  }, [commitUnchainStatus]);

  const unchainStatusPollInterval = unchainStatus.ready
    ? UNCHAIN_STATUS_POLL_INTERVAL_READY_MS
    : UNCHAIN_STATUS_POLL_INTERVAL_STARTING_MS;

  const refreshModelCatalog = useCallback(async () => {
    const progressId = `model_catalog_refresh_${Date.now()}`;
    progressStart(progressId, "model_catalog_refresh");
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
    } finally {
      progressStop(progressId);
    }
  }, [
    activeChatIdRef,
    modelIdRef,
    session.isCharacterChat,
    setSelectedModelId,
    storageApi,
  ]);

  useEffect(() => {
    refreshUnchainStatus();

    const timer = setInterval(() => {
      refreshUnchainStatus();
    }, unchainStatusPollInterval);

    return () => {
      clearInterval(timer);
    };
  }, [refreshUnchainStatus, unchainStatusPollInterval]);

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

    const refreshRecipeOptions = async () => {
      try {
        const { recipes } = await api.unchain.listRecipes();
        if (cancelled) return;
        const options = (recipes || []).map((r) => ({
          label: r.name,
          value: r.name,
        }));
        setRecipeOptions(options);
      } catch (_exc) {
        // ignore; recipes are optional
      }
    };
    refreshRecipeOptions();

    const unsubscribeModelCatalogRefresh = subscribeModelCatalogRefresh(() => {
      refreshModelCatalog();
      setConfiguredProviders(readConfiguredBuiltInProviders());
    });

    return () => {
      cancelled = true;
      unsubscribeModelCatalogRefresh();
    };
  }, [unchainStatus.ready, refreshModelCatalog]);

  /* Memory V2 P0 secret gate: while the user is deciding what to do with a
     detected credential, the whole composer surface is frozen. Changing the
     model, the toolkits or the attachments mid-decision would change what the
     approved message is actually sent with. */
  const isModelSelectionDisabled =
    stream.isStreaming ||
    session.isCharacterChat ||
    stream.isSecretCapturePending ||
    stream.isDurableInteractionBlocked ||
    stream.isTurnMutationBlocked;

  const onSelectModel = useCallback(
    (modelId) => {
      if (
        stream.isDurableInteractionBlocked ||
        stream.isTurnMutationBlocked
      ) {
        return;
      }
      session.handleSelectModel(modelId, stream.isStreaming);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      session.handleSelectModel,
      stream.isDurableInteractionBlocked,
      stream.isTurnMutationBlocked,
      stream.isStreaming,
    ],
  );

  const effectiveDisclaimer = useMemo(() => {
    if (
      stream.durableInteractionStatus === "awaiting" ||
      stream.durableInteractionStatus === "awaiting_response"
    ) {
      return "This run is waiting for your confirmation.";
    }
    if (stream.durableInteractionStatus === "checking") {
      return "Checking for an interrupted Unchain run...";
    }
    if (
      stream.durableInteractionStatus === "resuming" ||
      stream.durableInteractionStatus === "receipt_recorded"
    ) {
      return "Restoring an interrupted Unchain run...";
    }
    if (stream.durableInteractionStatus === "retry_wait") {
      return "Waiting to retry restoring the interrupted run...";
    }
    if (stream.durableInteractionStatus === "resume_failed") {
      return stream.streamError
        ? `Unchain could not restore the interrupted run: ${stream.streamError}`
        : "Unchain could not restore the interrupted run.";
    }
    if (stream.streamError) {
      return `Unchain error: ${stream.streamError}`;
    }
    if (stream.isStreaming) {
      return "Unchain is streaming a response...";
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
    stream.durableInteractionStatus,
    stream.isStreaming,
    stream.streamError,
  ]);

  const isSendDisabled =
    (stream.isDurableInteractionBlocked &&
      !["awaiting_response", "receipt_recorded"].includes(
        stream.durableInteractionStatus,
      )) ||
    stream.isTurnMutationBlocked ||
    stream.isSecretCapturePending ||
    (!unchainStatus.ready && !stream.isStreaming) ||
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
  const contextCompositionBundle = useMemo(
    () => selectLatestContextCompositionBundle(session.messages),
    [session.messages],
  );
  // Accounting-only pressure. Independent of Context Composition so the
  // indicator works before any contribution source is instrumented; the window
  // comes from model capabilities and stays null when the catalog has none.
  const contextUsageView = useMemo(() => {
    const usage = selectLatestContextUsage(session.messages);
    if (!usage) return null;
    return buildContextUsageView(
      usage,
      selectContextWindowTokens(activeModelCapabilities),
    );
  }, [session.messages, activeModelCapabilities]);
  const {
    containerRef: smoothResizeContainerRef,
    frameStyle: smoothResizeFrameStyle,
    refreshFrame: refreshSmoothResizeFrame,
  } = useSmoothResizeFrame({
    instantResizeKey: onFragment,
  });

  useEffect(() => {
    refreshSmoothResizeFrame();
    const timer = setTimeout(() => {
      refreshSmoothResizeFrame();
    }, 340);

    return () => clearTimeout(timer);
  }, [onFragment, refreshSmoothResizeFrame]);

  /* the input floats over the message list, so the list needs a live
     bottom inset matching the input's current height to scroll clear */
  const inputOverlayRef = useRef(null);
  const [inputOverlayHeight, setInputOverlayHeight] = useState(
    CHAT_BOTTOM_VIEWPORT_INSET,
  );
  useEffect(() => {
    const el = inputOverlayRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = Math.ceil(entry.contentRect.height);
        if (next > 0) setInputOverlayHeight(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isEmpty]);

  const sharedChatInputProps = useMemo(
    () => ({
      value: session.inputValue,
      onChange: session.setComposerInputValue,
      onSend: stream.sendNewTurn,
      onStop: stream.stopStream,
      isStreaming: stream.canStop,
      sendDisabled: isSendDisabled,
      placeholder: unchainStatus.ready
        ? t("chat.placeholder")
        : `Unchain unavailable (${unchainStatus.status})${unchainStatus.reason ? `: ${unchainStatus.reason}` : ""}`,
      disclaimer: effectiveDisclaimer,
      showAttachments: true,
      onAttachFile: attachments.handleAttachFile,
      onAttachScreenshot: attachments.handleScreenshot,
      onDropFiles: attachments.processFiles,
      attachments: draftAttachments,
      onRemoveAttachment: attachments.removeDraftAttachment,
      attachmentsEnabled: attachmentsEnabled && !stream.isSecretCapturePending,
      attachmentsDisabledReason,
      modelCatalog,
      selectedModelId: session.selectedModelId,
      onSelectModel,
      modelSelectDisabled: isModelSelectionDisabled,
      toolSelectDisabled: stream.isSecretCapturePending,
      showModelSelector: !session.isCharacterChat,
      showToolSelector: !session.isCharacterChat && modelSupportsTools,
      showWorkspaceSelector: !session.isCharacterChat && modelSupportsTools,
      selectedToolkits: effectiveSelectedToolkits,
      onToolkitsChange: handleToolkitsChange,
      selectedWorkspaceIds: effectiveSelectedWorkspaceIds,
      onWorkspaceIdsChange: handleWorkspaceIdsChange,
      selectedRecipeName: session.selectedRecipeName,
      onSelectRecipe: session.setSelectedRecipeName,
      recipeOptions,
      interjectState: stream.interjectState,
      onQueueUndo: stream.onQueueUndo,
      contextCompositionBundle,
      contextUsageView,
      turnMutationHold: stream.turnMutationHold,
      onTurnMutationRetry: stream.retryTurnMutation,
      onTurnMutationDiscard: stream.discardTurnMutation,
    }),
    [
      session.inputValue, session.setComposerInputValue, session.selectedModelId,
      session.isCharacterChat, effectiveSelectedToolkits, handleToolkitsChange,
      effectiveSelectedWorkspaceIds, handleWorkspaceIdsChange,
      session.selectedRecipeName, session.setSelectedRecipeName, recipeOptions,
      stream.sendNewTurn, stream.stopStream, stream.canStop,
      stream.interjectState, stream.onQueueUndo,
      contextCompositionBundle, contextUsageView,
      stream.turnMutationHold, stream.retryTurnMutation, stream.discardTurnMutation,
      isModelSelectionDisabled,
      isSendDisabled, unchainStatus.ready, unchainStatus.status, unchainStatus.reason,
      effectiveDisclaimer, attachments.handleAttachFile, attachments.handleScreenshot,
      attachments.processFiles, draftAttachments, attachments.removeDraftAttachment,
      attachmentsEnabled, attachmentsDisabledReason, modelCatalog, onSelectModel,
      modelSupportsTools,
      stream.isSecretCapturePending,
      t,
    ],
  );

  return (
    <div
      data-chat-id={session.activeChatId}
      ref={smoothResizeContainerRef}
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
      <div
        data-testid="chat-smooth-resize-frame"
        style={{
          ...smoothResizeFrameStyle,
          display: "flex",
          flexDirection: "column",
        }}
      >
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

              <RiseIn delay="100ms" style={{ width: "100%", marginBottom: 14 }}>
                <ChatInput {...sharedChatInputProps} />
              </RiseIn>

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
                <RiseIn
                  delay="145ms"
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "center",
                    maxWidth: 720,
                  }}
                >
                  {chips.map((chip) => {
                    const active = session.selectedModelId === chip.id;
                    const IconComp = resolveProviderIcon(chip.provider);
                    return (
                      <button
                        key={chip.id}
                        disabled={isModelSelectionDisabled}
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
                          cursor: isModelSelectionDisabled
                            ? "not-allowed"
                            : "pointer",
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
                          opacity: isModelSelectionDisabled ? 0.45 : 1,
                        }}
                        onMouseEnter={(event) => {
                          if (active || isModelSelectionDisabled) return;
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
                          if (active || isModelSelectionDisabled) return;
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
                </RiseIn>
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
            disableActionButtons={
              stream.isDurableInteractionBlocked ||
              stream.isTurnMutationBlocked
            }
            isCharacterChat={session.isCharacterChat}
            characterName={session.activeCharacterName}
            characterAvatar={session.activeCharacterAvatar}
            characterAvailability={characterAvailability}
            onDeleteMessage={stream.deleteTurn}
            onResendMessage={stream.resendTurn}
            onEditMessage={stream.editTurn}
            onToolConfirmationDecision={stream.handleToolConfirmationDecision}
            toolConfirmationUiStateById={stream.toolConfirmationUiStateById}
            onClarifyResolve={stream.onClarifyResolve}
            pendingToolConfirmationRequests={
              stream.pendingToolConfirmationRequests
            }
            pendingContinuationRequest={stream.pendingContinuationRequest}
            onContinuationDecision={stream.handleContinuationDecision}
            streamingMessageStore={streamingMessageStoreRef.current}
            initialVisibleCount={12}
            loadBatchSize={6}
            topLoadThreshold={80}
            bottomViewportInset={inputOverlayHeight}
          />
          {/* floating frosted input — the message list scrolls underneath */}
          <div
            ref={inputOverlayRef}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 5,
            }}
          >
            {/* below the input card everything is covered; across the input's
               own band the cover fades out, so wider list content (narrow
               windows) dissolves instead of hitting a hard edge */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background: `linear-gradient(to top, var(--pupu-background, ${
                  isDark ? "rgb(18,18,18)" : "rgb(255,255,255)"
                }) 0px, var(--pupu-background, ${
                  isDark ? "rgb(18,18,18)" : "rgb(255,255,255)"
                }) 44px, transparent 100%)`,
              }}
            />
            <div style={{ position: "relative" }}>
              <ChatInput {...sharedChatInputProps} />
            </div>
          </div>
        </>
      )}
      </div>

      {/* Memory V2 P0 secret gate. Portalled by Modal, so it sits outside the
          chat layout; it receives only the six-field public gate object and
          never any message text. Close / ESC / backdrop all map to onCancel,
          which stores nothing, sends nothing and keeps the composer intact. */}
      <SecretCaptureModal
        gate={stream.secretCaptureGate}
        onConfirmStore={stream.confirmSecretCaptureStore}
        onConfirmPlain={stream.confirmSecretCapturePlain}
        onCancel={stream.cancelSecretCapture}
        onScopeChange={stream.setSecretCaptureScope}
      />
    </div>
  );
};

export default ChatInterface;
