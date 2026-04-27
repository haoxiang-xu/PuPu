import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapChatsStore,
  cleanupTransientNewChatOnPageLeave,
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
  const latestDraftRef = useRef({
    text: initialChat.draft?.text || "",
    attachments: draftAttachments,
  });
  const modelIdRef = useRef(
    typeof initialChat.model?.id === "string" && initialChat.model.id.trim()
      ? initialChat.model.id
      : "unchain-unset",
  );
  const systemPromptOverridesRef = useRef(
    initialChat.systemPromptOverrides || {},
  );

  latestDraftRef.current = {
    text: inputValue,
    attachments: draftAttachments,
  };

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

    const nextDraft = latestDraftRef.current;
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
          setMessages(nextActiveChat.messages || []);
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
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return undefined;
    }

    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current);
    }

    draftPersistTimerRef.current = setTimeout(() => {
      draftPersistTimerRef.current = null;
      updateChatDraft(
        currentChatId,
        {
          text: inputValue,
          attachments: draftAttachments,
        },
        { source: "chat-page" },
      );
    }, DRAFT_PERSIST_DELAY_MS);

    return () => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
      }
    };
  }, [draftAttachments, inputValue]);

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

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }
    if (activeChatKind === "character") {
      return;
    }

    setChatSessionBundle(
      currentChatId,
      {
        selectedToolkits,
        agentOrchestration,
        selectedWorkspaceIds,
        selectedRecipeName,
      },
      { source: "chat-page" },
    );
  }, [
    activeChatKind,
    selectedToolkits,
    agentOrchestration,
    selectedWorkspaceIds,
    selectedRecipeName,
  ]);

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
    handleSelectModel,
    inputValue,
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
