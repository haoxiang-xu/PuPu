import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapChatsStore,
  cleanupTransientNewChatOnPageLeave,
  flushStoreEmitSync,
  getChatMessages,
  getChatsStore,
  setChatMessages,
  setChatModel,
  setChatSessionBundle,
  setChatThreadId,
  subscribeChatsStore,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import { isFeatureFlagEnabled } from "../../../SERVICEs/feature_flags";
import {
  readReasoningEffortPref,
  writeReasoningEffortPref,
} from "../../../SERVICEs/reasoning_effort_prefs";
import { settleStreamingAssistantMessages } from "../utils/chat_turn_utils";
import {
  cancelBackgroundPersist,
  flushAllBackgroundPersist,
} from "./background_stream_persister";

const DRAFT_PERSIST_DELAY_MS = 250;

/* A chat's own recorded effort wins — it is what that conversation has been
   running at. Only when the chat never recorded one (a fresh chat, or a chat
   from before effort existed) does the model's remembered level fill in, so
   the user's per-model choice carries into new chats without ever rewriting
   the history of an existing one. */
const resolveChatReasoningEffort = (chat, modelId) => {
  const recorded = chat?.model?.reasoningEffort;
  if (typeof recorded === "string" && recorded.trim()) return recorded;
  return readReasoningEffortPref(modelId);
};

/* ---- Memory V2 P0: draft-persistence secret guard ------------------------

   The composer debounces its text into the chats DB every 250ms, and also
   tail-flushes it on unload / chat switch / unmount. Secret capture only runs
   on the SEND path, so without this guard a wrapped `{{secret:...}}` value or
   a plainly typed credential reaches durable storage BEFORE it is ever sent —
   the send-path fail-closed guarantee would be bypassed by simply typing.

   These predicates are a deliberate LOCAL COPY of the two secret_capture
   heuristics (explicit syntax + conservative unwrapped-credential detection)
   rather than an import, to keep this file decoupled from a module under
   concurrent edit. Parity with secret_capture.js is locked by
   use_chat_session_state.draft_secret_guard.test.js — if that test fails, the
   copy has drifted and must be re-synced.

   Invariants:
     - matched text is NEVER logged, echoed, or surfaced anywhere;
     - the guard only ever REPLACES persisted text with "" — it never mutates
       the in-memory composer, so typing is untouched;
     - fully inert when `enable_memory_v2` is off (byte-for-byte equivalent).
*/
const MEMORY_V2_FLAG = "enable_memory_v2";

const SECRET_SYNTAX_OPEN_PREFIX = "{{secret:";
const SECRET_SYNTAX_CLOSE_TAG = "{{/secret}}";

const KNOWN_TOKEN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const ASSIGNMENT_PATTERN =
  /(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|auth[_-]?token)["']?\s*[:=]\s*["']?([^\s"']+)/gi;

const PLACEHOLDER_VALUE_PATTERN =
  /^(<|\$\{|\{\{|\{|\[|\*+$|x{3,}$|your[_-]?|my[_-]|placeholder|example|sample|dummy|change[_-]?me|redacted|hidden|masked|omitted|unset$|none$|null$|undefined$|true$|false$|process\.env|os\.environ|env\[|secret-handle)/i;

const looksLikeCredentialValue = (rawValue) => {
  const value = String(rawValue).replace(/[.,;:!?)\]}]+$/, "");
  if (value.length < 8) return false;
  if (PLACEHOLDER_VALUE_PATTERN.test(value)) return false;
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
};

/**
 * True when a draft text must not be written to storage in plaintext:
 * explicit secret-capture syntax, a recognized credential token prefix, or a
 * conservative password/token/api-key assignment. Pure; never reveals what
 * matched.
 */
export const draftTextLooksSecret = (text) => {
  const source = typeof text === "string" ? text : "";
  if (!source) return false;
  if (
    source.includes(SECRET_SYNTAX_OPEN_PREFIX) ||
    source.includes(SECRET_SYNTAX_CLOSE_TAG)
  ) {
    return true;
  }
  if (KNOWN_TOKEN_PATTERNS.some((pattern) => pattern.test(source))) {
    return true;
  }
  ASSIGNMENT_PATTERN.lastIndex = 0;
  let match = ASSIGNMENT_PATTERN.exec(source);
  while (match) {
    if (looksLikeCredentialValue(match[2])) {
      ASSIGNMENT_PATTERN.lastIndex = 0;
      return true;
    }
    match = ASSIGNMENT_PATTERN.exec(source);
  }
  return false;
};

/* Flag is read BEFORE the predicate so a disabled build does exactly what it
   did before this guard existed. Attachments are deliberately untouched. */
const secretSafeDraftText = (text) => {
  if (typeof text !== "string" || !text) return text;
  if (!isFeatureFlagEnabled(MEMORY_V2_FLAG)) return text;
  return draftTextLooksSecret(text) ? "" : text;
};

export const flushChatWritesBeforeUnload = (
  event,
  { flushDraft, flushSessionBundle } = {},
) => {
  let tailFlushSucceeded = true;
  const runTailFlush = (label, flush) => {
    if (typeof flush !== "function") return;
    try {
      flush();
    } catch (error) {
      tailFlushSucceeded = false;
      console.error(label, error);
    }
  };

  // Hook-local debounces have not reached the global store queue yet. Flush
  // them first so the final synchronous drain can include their fresh ops.
  runTailFlush("[chat-storage] draft tail flush failed:", flushDraft);
  runTailFlush(
    "[chat-storage] session bundle tail flush failed:",
    flushSessionBundle,
  );

  // This flush can create fresh chat ops (stream messages are intentionally
  // deferred during normal interaction). Drain those ops immediately in the
  // same cancelable event.
  try {
    flushAllBackgroundPersist();
  } catch (error) {
    tailFlushSucceeded = false;
    console.error("[chat-storage] background tail flush failed:", error);
  }

  let storeFlushSucceeded = false;
  try {
    storeFlushSucceeded = flushStoreEmitSync() === true;
  } catch (error) {
    console.error("[chat-storage] synchronous unload drain failed:", error);
  }

  if (tailFlushSucceeded && storeFlushSucceeded) return true;
  event.preventDefault();
  event.returnValue = "";
  return false;
};

const snapshotSessionBundle = (chat) => ({
  selectedToolkits: Array.isArray(chat?.selectedToolkits)
    ? chat.selectedToolkits
    : [],
  agentOrchestration:
    chat?.agentOrchestration && typeof chat.agentOrchestration === "object"
      ? chat.agentOrchestration
      : { mode: "default" },
  selectedWorkspaceIds: Array.isArray(chat?.selectedWorkspaceIds)
    ? chat.selectedWorkspaceIds
    : [],
  selectedRecipeName:
    typeof chat?.selectedRecipeName === "string" &&
    chat.selectedRecipeName.trim()
      ? chat.selectedRecipeName.trim()
      : "Default",
});

const sessionBundleFingerprint = (bundle) =>
  JSON.stringify(snapshotSessionBundle(bundle));

export const hasReattachableStreamingAssistant = (messages) =>
  Array.isArray(messages) &&
  messages.some(
    (message) =>
      message?.role === "assistant" &&
      message?.status === "streaming" &&
      typeof message?.meta?.requestId === "string" &&
      message.meta.requestId.trim() &&
      typeof message?.meta?.attemptId === "string" &&
      message.meta.attemptId.trim() &&
      typeof message?.meta?.executionSessionId === "string" &&
      message.meta.executionSessionId.trim(),
  );

export const useChatSessionState = ({
  bootstrapped: bootstrappedProp,
  draftAttachments,
  setDraftAttachments,
  activeStreamsRef,
  setStreamError,
}) => {
  const [bootstrappedFallback] = useState(() => bootstrapChatsStore());
  const bootstrapped = bootstrappedProp || bootstrappedFallback;
  const initialChat = bootstrapped.activeChat;

  const [activeChatId, setActiveChatId] = useState(initialChat.id);
  const [messages, setMessages] = useState(() => initialChat.messages || []);
  const [inputValue, setInputValue] = useState(
    () => initialChat.draft?.text || "",
  );
  const [selectedModelId, setSelectedModelId] = useState(
    typeof initialChat.model?.id === "string" && initialChat.model.id.trim()
      ? initialChat.model.id
      : "unchain-unset",
  );
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState(() =>
    resolveChatReasoningEffort(initialChat, initialChat.model?.id),
  );
  const [agentOrchestration, setAgentOrchestration] = useState(
    () => initialChat.agentOrchestration || { mode: "default" },
  );
  const [selectedToolkits, setSelectedToolkits] = useState(
    () => initialChat.selectedToolkits || [],
  );
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState(
    () => initialChat.selectedWorkspaceIds || [],
  );
  const [selectedRecipeName, setSelectedRecipeName] = useState(
    () => initialChat.selectedRecipeName || "Default",
  );
  const [activeChatKind, setActiveChatKind] = useState(
    initialChat.kind === "character" ? "character" : "default",
  );
  const [activeCharacterId, setActiveCharacterId] = useState(
    typeof initialChat.characterId === "string" ? initialChat.characterId : "",
  );
  const [activeCharacterName, setActiveCharacterName] = useState(
    typeof initialChat.characterName === "string" ? initialChat.characterName : "",
  );
  const [activeCharacterAvatar, setActiveCharacterAvatar] = useState(
    initialChat.characterAvatar || null,
  );

  const activeChatIdRef = useRef(initialChat.id);
  const messagesRef = useRef(initialChat.messages || []);
  const initialChatConfigRef = useRef({
    kind: initialChat.kind,
    threadId: initialChat.threadId,
  });
  const threadIdRef = useRef(
    typeof initialChat.threadId === "string" && initialChat.threadId.trim()
      ? initialChat.threadId
      : initialChat.id || `chat-${Date.now()}`,
  );
  const initialStoreReconcileDoneRef = useRef(false);
  const draftPersistTimerRef = useRef(null);
  const composerRevisionByChatIdRef = useRef(new Map());
  const latestDraftByChatIdRef = useRef(
    new Map([
      [
        initialChat.id,
        {
          text: initialChat.draft?.text || "",
          attachments: draftAttachments,
        },
      ],
    ]),
  );
  const reasoningEffortRef = useRef(
    resolveChatReasoningEffort(initialChat, initialChat.model?.id),
  );
  const modelIdRef = useRef(
    typeof initialChat.model?.id === "string" && initialChat.model.id.trim()
      ? initialChat.model.id
      : "unchain-unset",
  );
  const systemPromptOverridesRef = useRef(
    initialChat.systemPromptOverrides || {},
  );

  if (activeChatId) {
    latestDraftByChatIdRef.current.set(activeChatId, {
      text: inputValue,
      attachments: draftAttachments,
    });
  }

  const bumpActiveComposerRevision = useCallback(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }
    const previousRevision =
      composerRevisionByChatIdRef.current.get(currentChatId) || 0;
    composerRevisionByChatIdRef.current.set(
      currentChatId,
      previousRevision + 1,
    );
  }, []);

  /* Keep user-visible composer mutations distinct from programmatic clears and
     restores performed by the stream lifecycle. A monotonic per-chat revision
     catches ABA edits (type, then erase back to the same value) that cannot be
     detected by comparing draft values alone. */
  const setComposerInputValue = useCallback(
    (nextValue) => {
      bumpActiveComposerRevision();
      setInputValue(nextValue);
    },
    [bumpActiveComposerRevision],
  );
  const setComposerDraftAttachments = useCallback(
    (nextAttachments) => {
      bumpActiveComposerRevision();
      setDraftAttachments(nextAttachments);
    },
    [bumpActiveComposerRevision, setDraftAttachments],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const flushDraftToStore = useCallback((chatId = activeChatIdRef.current) => {
    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    }

    if (!chatId) {
      return;
    }

    const nextDraft = latestDraftByChatIdRef.current.get(chatId);
    if (!nextDraft) {
      return;
    }
    updateChatDraft(
      chatId,
      {
        // Tail flush (unload / chat switch / unmount) is the last write before
        // the composer value could otherwise be frozen into storage.
        text: secretSafeDraftText(nextDraft.text),
        attachments: nextDraft.attachments,
      },
      { source: "chat-page" },
    );
  }, []);

  useEffect(() => {
    const reconcileStoreSnapshot = (nextStore, event = {}) => {
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
        /* External writers (notably the Test API) update the canonical chat
           store synchronously, while React state may not commit until a later
           render. Keep every run-affecting field aligned with that exact active
           chat instead of leaving model/toolkit closures from an older chat. */
        const nextModelId =
          typeof nextActiveChat.model?.id === "string" &&
          nextActiveChat.model.id.trim()
            ? nextActiveChat.model.id
            : "unchain-unset";
        modelIdRef.current = nextModelId;
        setSelectedModelId(nextModelId);
        const nextEffort = resolveChatReasoningEffort(
          nextActiveChat,
          nextModelId,
        );
        reasoningEffortRef.current = nextEffort;
        setSelectedReasoningEffort(nextEffort);
        threadIdRef.current =
          typeof nextActiveChat.threadId === "string" &&
          nextActiveChat.threadId.trim()
            ? nextActiveChat.threadId
            : nextActiveId;
        setAgentOrchestration(
          nextActiveChat.agentOrchestration || { mode: "default" },
        );
        setSelectedToolkits(nextActiveChat.selectedToolkits || []);
        setSelectedWorkspaceIds(nextActiveChat.selectedWorkspaceIds || []);
        setSelectedRecipeName(nextActiveChat.selectedRecipeName || "Default");
        setActiveChatKind(
          nextActiveChat.kind === "character" ? "character" : "default",
        );
        setActiveCharacterId(
          typeof nextActiveChat.characterId === "string"
            ? nextActiveChat.characterId
            : "",
        );
        setActiveCharacterName(
          typeof nextActiveChat.characterName === "string"
            ? nextActiveChat.characterName
            : "",
        );
        setActiveCharacterAvatar(nextActiveChat.characterAvatar || null);
        systemPromptOverridesRef.current =
          nextActiveChat.systemPromptOverrides || {};

        if (event.type === "chat_update_messages") {
          const nextMessages = nextActiveChat.messages || [];
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
          return;
        }
        return;
      }

      const currentActiveChat = currentActiveId
        ? nextStore?.chatsById?.[currentActiveId]
        : null;
      const currentActiveStillExists = Boolean(currentActiveChat);
      if (currentActiveStillExists) {
        flushDraftToStore(currentActiveId);
      }
      activeChatIdRef.current = nextActiveId;

      /* Store callbacks are synchronous while React state updates are batched.
         Seed the imperative draft snapshot immediately so a same-tick A→B→A
         selection flushes B's own draft, never the still-rendered A value. */
      latestDraftByChatIdRef.current.set(nextActiveId, {
        text: nextActiveChat.draft?.text || "",
        attachments: nextActiveChat.draft?.attachments || [],
      });

      const leavingStreamState = activeStreamsRef.current.get(currentActiveId);
      if (
        currentActiveStillExists &&
        leavingStreamState &&
        Array.isArray(leavingStreamState.messages)
      ) {
        setChatMessages(
          currentActiveId,
          leavingStreamState.messages,
          {
            source: "chat-page",
          },
        );
        // We just wrote fresh state; drop any pending throttled write.
        cancelBackgroundPersist(currentActiveId);
      }

      setActiveChatId(nextActiveId);
      setStreamError("");
      // Entering chat becomes foreground — subsequent tokens hit setMessages
      // directly; drop any pending background-persist for this chat so its
      // stale scheduled write doesn't overwrite fresher storage later.
      cancelBackgroundPersist(nextActiveId);
      const enteringStreamState = activeStreamsRef.current.get(nextActiveId);
      const restoredMessages =
        enteringStreamState && Array.isArray(enteringStreamState.messages)
          ? enteringStreamState.messages
          : nextActiveChat.messages || [];
      messagesRef.current = restoredMessages;
      setMessages(restoredMessages);
      setInputValue(nextActiveChat.draft?.text || "");
      setDraftAttachments(nextActiveChat.draft?.attachments || []);
      setAgentOrchestration(
        nextActiveChat.agentOrchestration || { mode: "default" },
      );
      setSelectedToolkits(nextActiveChat.selectedToolkits || []);
      setSelectedWorkspaceIds(nextActiveChat.selectedWorkspaceIds || []);
      setSelectedRecipeName(nextActiveChat.selectedRecipeName || "Default");
      setActiveChatKind(
        nextActiveChat.kind === "character" ? "character" : "default",
      );
      setActiveCharacterId(
        typeof nextActiveChat.characterId === "string"
          ? nextActiveChat.characterId
          : "",
      );
      setActiveCharacterName(
        typeof nextActiveChat.characterName === "string"
          ? nextActiveChat.characterName
          : "",
      );
      setActiveCharacterAvatar(nextActiveChat.characterAvatar || null);
      systemPromptOverridesRef.current =
        nextActiveChat.systemPromptOverrides || {};

      threadIdRef.current =
        typeof nextActiveChat.threadId === "string" &&
        nextActiveChat.threadId.trim()
          ? nextActiveChat.threadId
          : nextActiveId || `chat-${Date.now()}`;
      modelIdRef.current =
        typeof nextActiveChat.model?.id === "string" &&
        nextActiveChat.model.id.trim()
          ? nextActiveChat.model.id
          : "unchain-unset";
      setSelectedModelId(modelIdRef.current);
      reasoningEffortRef.current = resolveChatReasoningEffort(
        nextActiveChat,
        modelIdRef.current,
      );
      setSelectedReasoningEffort(reasoningEffortRef.current);
    };

    // The Test API, reload restoration, or another mounted surface can switch
    // the canonical chat after render but before this passive effect subscribes.
    // Store notifications are edge-triggered, so subscribe first and then read
    // the latest snapshot to close that lost-event window.
    const unsubscribe = subscribeChatsStore(reconcileStoreSnapshot);
    if (!initialStoreReconcileDoneRef.current) {
      initialStoreReconcileDoneRef.current = true;
      reconcileStoreSnapshot(getChatsStore(), {
        source: "chat-store-reconcile",
        type: "chat_store_reconcile",
      });
    }

    return () => {
      unsubscribe();
    };
  }, [
    activeStreamsRef,
    flushDraftToStore,
    setDraftAttachments,
    setStreamError,
  ]);

  useEffect(() => {
    // Bootstrap straggler settle, v3 lazy messages: non-active chats carry
    // `[]` placeholders, so scanning `chat.messages` would miss them. The
    // isGenerating META flag (maintained by setChatMessages) marks the only
    // chats that can hold stranded streaming messages — load just those via
    // getChatMessages, settle, and write back.
    const chatsById = bootstrapped?.store?.chatsById || {};
    for (const [chatId, chat] of Object.entries(chatsById)) {
      if (chat?.isGenerating !== true) {
        continue;
      }

      const storedMessages = getChatMessages(chatId);
      if (hasReattachableStreamingAssistant(storedMessages)) {
        continue;
      }
      const { changed, nextMessages } =
        settleStreamingAssistantMessages(storedMessages);
      if (!changed) {
        continue;
      }

      setChatMessages(chatId, nextMessages, { source: "chat-page" });
      if (chatId === activeChatIdRef.current) {
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
      }
    }
  }, [bootstrapped]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return undefined;
    }

    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current);
    }

    // 流式期间 defer(2026-07 B 批性能):draft 落盘 = 整库 persist(实测 53–80ms),
    // 会顶在流式帧上形成长任务。任何流在跑时置后重查(每 250ms),流结束后的第一拍
    // 落盘。React 内存态(inputValue)始终即时更新,draft 零丢失,只是落盘时机推迟。
    const persistDraft = () => {
      if (activeStreamsRef?.current?.size > 0) {
        draftPersistTimerRef.current = setTimeout(
          persistDraft,
          DRAFT_PERSIST_DELAY_MS,
        );
        return;
      }
      draftPersistTimerRef.current = null;
      updateChatDraft(
        currentChatId,
        {
          // Redaction happens at the storage boundary only — `inputValue`
          // (what the user sees and can still edit/send) is never rewritten.
          text: secretSafeDraftText(inputValue),
          attachments: draftAttachments,
        },
        { source: "chat-page" },
      );
    };
    draftPersistTimerRef.current = setTimeout(
      persistDraft,
      DRAFT_PERSIST_DELAY_MS,
    );

    return () => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
      }
    };
  }, [activeStreamsRef, draftAttachments, inputValue]);

  /* Scrub a plaintext credential that is ALREADY sitting in storage for the
     chat we just opened — e.g. persisted by a build without this guard, or by
     another writer. Runs on mount and on every chat switch, as a passive
     effect rather than inside the store subscriber, so it can never re-enter
     the store emit that switched the chat. The in-memory composer keeps the
     text: the user can still see, edit, and send it (send-path capture then
     handles it) — only the durable copy is emptied. */
  useEffect(() => {
    if (!isFeatureFlagEnabled(MEMORY_V2_FLAG)) {
      return;
    }
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }
    const storedText =
      getChatsStore()?.chatsById?.[currentChatId]?.draft?.text;
    if (typeof storedText !== "string" || !storedText) {
      return;
    }
    if (!draftTextLooksSecret(storedText)) {
      return;
    }
    updateChatDraft(currentChatId, { text: "" }, { source: "chat-page" });
  }, [activeChatId]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }

    const initialChatConfig = initialChatConfigRef.current;
    const isCharacterChat = initialChatConfig?.kind === "character";
    const resolvedThreadId =
      typeof initialChatConfig?.threadId === "string" &&
      initialChatConfig.threadId.trim()
        ? initialChatConfig.threadId
        : currentChatId;

    threadIdRef.current = resolvedThreadId;
    setChatThreadId(currentChatId, resolvedThreadId, { source: "chat-page" });
    if (!isCharacterChat) {
      setChatModel(
        currentChatId,
        {
          id: modelIdRef.current,
          ...(reasoningEffortRef.current
            ? { reasoningEffort: reasoningEffortRef.current }
            : {}),
        },
        { source: "chat-page" },
      );
    }
  }, []);

  /* Session-bundle persist is DEFERRED off the interaction's paint path:
     a synchronous whole-store persist here blocks the main thread for
     40-80ms right after e.g. a toolkit checkbox click, making the toggle
     feel sluggish. Debounced writes coalesce rapid toggles; a pending
     write is flushed when the chat switches under it and on unmount, so
     nothing is lost. */
  const pendingSessionBundleRef = useRef(null);
  const flushPendingSessionBundle = useCallback(() => {
    const pending = pendingSessionBundleRef.current;
    pendingSessionBundleRef.current = null;
    if (!pending) {
      return;
    }
    const canonicalChat = getChatsStore()?.chatsById?.[pending.chatId];
    if (!canonicalChat) {
      return;
    }
    const canonicalFingerprint = sessionBundleFingerprint(canonicalChat);
    const pendingFingerprint = sessionBundleFingerprint(pending.bundle);
    if (
      canonicalFingerprint !== pending.baseFingerprint &&
      canonicalFingerprint !== pendingFingerprint
    ) {
      return;
    }
    setChatSessionBundle(pending.chatId, pending.bundle, {
      source: "chat-page",
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    // Flush hook-local debounces before the global queue drain. Otherwise an
    // immediate app quit can lose the last composer or session edit even when
    // the already-enqueued store operations were persisted successfully.
    const onBeforeUnload = (event) =>
      flushChatWritesBeforeUnload(event, {
        flushDraft: flushDraftToStore,
        flushSessionBundle: flushPendingSessionBundle,
      });
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushDraftToStore, flushPendingSessionBundle]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return undefined;
    }
    if (activeChatKind === "character") {
      return undefined;
    }

    const pending = pendingSessionBundleRef.current;
    if (pending && pending.chatId !== currentChatId) {
      // don't let a chat switch swallow the previous chat's pending write
      flushPendingSessionBundle();
    }

    const existingPending = pendingSessionBundleRef.current;
    const canonicalChat = getChatsStore()?.chatsById?.[currentChatId];
    const canonicalFingerprint = sessionBundleFingerprint(canonicalChat);
    const existingPendingFingerprint =
      existingPending?.chatId === currentChatId
        ? sessionBundleFingerprint(existingPending.bundle)
        : "";
    pendingSessionBundleRef.current = {
      chatId: currentChatId,
      baseFingerprint:
        existingPending?.chatId === currentChatId
          ? existingPendingFingerprint === canonicalFingerprint
            ? canonicalFingerprint
            : existingPending.baseFingerprint
          : canonicalFingerprint,
      bundle: {
        selectedToolkits,
        agentOrchestration,
        selectedWorkspaceIds,
        selectedRecipeName,
      },
    };
    const timer = setTimeout(flushPendingSessionBundle, 150);
    return () => clearTimeout(timer);
  }, [
    activeChatKind,
    selectedToolkits,
    agentOrchestration,
    selectedWorkspaceIds,
    selectedRecipeName,
    flushPendingSessionBundle,
  ]);

  useEffect(
    () => () => {
      flushPendingSessionBundle();
    },
    [flushPendingSessionBundle],
  );

  useEffect(() => {
    return () => {
      flushDraftToStore();
      cleanupTransientNewChatOnPageLeave({ source: "chat-page" });
    };
  }, [flushDraftToStore]);

  const handleSelectModel = useCallback(
    (modelId, disabled = false) => {
      const currentChatId = activeChatIdRef.current;
      if (!currentChatId || !modelId || disabled || activeChatKind === "character") {
        return;
      }

      modelIdRef.current = modelId;
      setSelectedModelId(modelId);

      /* Effort is a property of the MODEL, not of the chat's history: carrying
         the outgoing model's level onto the incoming one silently applies a
         level the new model may not even declare. Restore what this model was
         last set to instead, and leave it unset when it was never set. */
      const rememberedEffort = readReasoningEffortPref(modelId);
      reasoningEffortRef.current = rememberedEffort;
      setSelectedReasoningEffort(rememberedEffort);

      setChatModel(
        currentChatId,
        {
          id: modelId,
          ...(rememberedEffort ? { reasoningEffort: rememberedEffort } : {}),
        },
        { source: "chat-page" },
      );
    },
    [activeChatKind],
  );

  /* Reasoning effort rides the same per-chat model record: null clears it
     (provider default), a level persists alongside the model id. Validity
     against the current model's declared levels is the selector UI's and the
     sidecar's job — stale levels simply stop matching and are omitted. */
  const handleSelectReasoningEffort = useCallback(
    (level) => {
      const currentChatId = activeChatIdRef.current;
      const normalized =
        typeof level === "string" && level.trim()
          ? level.trim().toLowerCase()
          : null;
      reasoningEffortRef.current = normalized;
      setSelectedReasoningEffort(normalized);

      /* Remember it for this model so every later chat on it starts here.
         Written even when there is no active chat to persist to — the choice
         belongs to the model, and a null clears the memory rather than
         leaving a stale level behind. */
      if (modelIdRef.current) {
        writeReasoningEffortPref(modelIdRef.current, normalized);
      }

      if (!currentChatId || activeChatKind === "character") return;
      setChatModel(
        currentChatId,
        {
          id: modelIdRef.current,
          ...(normalized ? { reasoningEffort: normalized } : {}),
        },
        { source: "chat-page" },
      );
    },
    [activeChatKind],
  );

  return {
    activeChatId,
    setActiveChatId,
    activeChatIdRef,
    bootstrapped,
    composerRevisionByChatIdRef,
    handleSelectModel,
    inputValue,
    setComposerInputValue,
    setComposerDraftAttachments,
    setInputValue,
    messages,
    setMessages,
    messagesRef,
    modelIdRef,
    selectedModelId,
    setSelectedModelId,
    selectedReasoningEffort,
    handleSelectReasoningEffort,
    agentOrchestration,
    setAgentOrchestration,
    selectedToolkits,
    setSelectedToolkits,
    selectedRecipeName,
    setSelectedRecipeName,
    selectedWorkspaceIds,
    setSelectedWorkspaceIds,
    systemPromptOverridesRef,
    threadIdRef,
    activeChatKind,
    activeCharacterId,
    activeCharacterName,
    activeCharacterAvatar,
    isCharacterChat: activeChatKind === "character",
  };
};
