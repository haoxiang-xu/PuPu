import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapChatsStore,
  cleanupTransientNewChatOnPageLeave,
  getChatMessages,
  setChatMessages,
  setChatModel,
  setChatSessionBundle,
  setChatThreadId,
  subscribeChatsStore,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import { settleStreamingAssistantMessages } from "../utils/chat_turn_utils";
import {
  cancelBackgroundPersist,
  flushAllBackgroundPersist,
} from "./background_stream_persister";

const DRAFT_PERSIST_DELAY_MS = 250;

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
        text: nextDraft.text,
        attachments: nextDraft.attachments,
      },
      { source: "chat-page" },
    );
  }, []);

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

        if (event.type === "chat_update_messages") {
          const nextMessages = nextActiveChat.messages || [];
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
          return;
        }

        if (event.type === "chat_update_system_prompt_overrides") {
          systemPromptOverridesRef.current =
            nextActiveChat.systemPromptOverrides || {};
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
    });

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
    if (typeof window === "undefined") return undefined;
    const onBeforeUnload = () => {
      flushAllBackgroundPersist();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

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

      const { changed, nextMessages } = settleStreamingAssistantMessages(
        getChatMessages(chatId),
      );
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
          text: inputValue,
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
      setChatModel(currentChatId, { id: modelIdRef.current }, { source: "chat-page" });
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
    if (pending) {
      setChatSessionBundle(pending.chatId, pending.bundle, {
        source: "chat-page",
      });
    }
  }, []);

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

    pendingSessionBundleRef.current = {
      chatId: currentChatId,
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
      setChatModel(currentChatId, { id: modelId }, { source: "chat-page" });
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
