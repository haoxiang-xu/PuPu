import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapChatsStore,
  cleanupTransientNewChatOnPageLeave,
  setChatMessages,
  setChatAgentOrchestration,
  setChatModel,
  setChatSelectedToolkits,
  setChatSelectedWorkspaceIds,
  setChatThreadId,
  subscribeChatsStore,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import { settleStreamingAssistantMessages } from "../utils/chat_turn_utils";

const DRAFT_PERSIST_DELAY_MS = 250;

export const useChatSessionState = ({
  bootstrapped: bootstrappedProp,
  draftAttachments,
  setDraftAttachments,
  activeStreamMessagesRef,
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

      if (
        currentActiveStillExists &&
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
      setAgentOrchestration(
        nextActiveChat.agentOrchestration || { mode: "default" },
      );
      setSelectedToolkits(nextActiveChat.selectedToolkits || []);
      setSelectedWorkspaceIds(nextActiveChat.selectedWorkspaceIds || []);
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
    activeStreamMessagesRef,
    flushDraftToStore,
    setDraftAttachments,
    setStreamError,
  ]);

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

    setChatSelectedToolkits(currentChatId, selectedToolkits, {
      source: "chat-page",
    });
  }, [activeChatKind, selectedToolkits]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }
    if (activeChatKind === "character") {
      return;
    }

    setChatAgentOrchestration(currentChatId, agentOrchestration, {
      source: "chat-page",
    });
  }, [activeChatKind, agentOrchestration]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }
    if (activeChatKind === "character") {
      return;
    }

    setChatSelectedWorkspaceIds(currentChatId, selectedWorkspaceIds, {
      source: "chat-page",
    });
  }, [activeChatKind, selectedWorkspaceIds]);

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
