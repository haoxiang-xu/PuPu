import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapChatsStore,
  cleanupTransientNewChatOnPageLeave,
  setChatMessages,
  setChatModel,
  setChatSelectedToolkits,
  setChatSelectedWorkspaceIds,
  setChatThreadId,
  subscribeChatsStore,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import { settleStreamingAssistantMessages } from "../utils/chat_turn_utils";

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
      : "miso-unset",
  );
  const [selectedToolkits, setSelectedToolkits] = useState(
    () => initialChat.selectedToolkits || [],
  );
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState(
    () => initialChat.selectedWorkspaceIds || [],
  );

  const activeChatIdRef = useRef(initialChat.id);
  const messagesRef = useRef(initialChat.messages || []);
  const threadIdRef = useRef(initialChat.id || `chat-${Date.now()}`);
  const modelIdRef = useRef(
    typeof initialChat.model?.id === "string" && initialChat.model.id.trim()
      ? initialChat.model.id
      : "miso-unset",
  );
  const systemPromptOverridesRef = useRef(
    initialChat.systemPromptOverrides || {},
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
          return;
        }

        if (event.type === "chat_update_system_prompt_overrides") {
          systemPromptOverridesRef.current =
            nextActiveChat.systemPromptOverrides || {};
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
      setSelectedToolkits(nextActiveChat.selectedToolkits || []);
      setSelectedWorkspaceIds(nextActiveChat.selectedWorkspaceIds || []);
      systemPromptOverridesRef.current =
        nextActiveChat.systemPromptOverrides || {};

      threadIdRef.current = nextActiveId || `chat-${Date.now()}`;
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
  }, [activeStreamMessagesRef, setDraftAttachments, setStreamError]);

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
      return;
    }

    updateChatDraft(
      currentChatId,
      {
        text: inputValue,
        attachments: draftAttachments,
      },
      { source: "chat-page" },
    );
  }, [draftAttachments, inputValue]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }

    threadIdRef.current = currentChatId;
    setChatThreadId(currentChatId, currentChatId, { source: "chat-page" });
    setChatModel(currentChatId, { id: modelIdRef.current }, { source: "chat-page" });
  }, []);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }

    setChatSelectedToolkits(currentChatId, selectedToolkits, {
      source: "chat-page",
    });
  }, [selectedToolkits]);

  useEffect(() => {
    const currentChatId = activeChatIdRef.current;
    if (!currentChatId) {
      return;
    }

    setChatSelectedWorkspaceIds(currentChatId, selectedWorkspaceIds, {
      source: "chat-page",
    });
  }, [selectedWorkspaceIds]);

  useEffect(() => {
    return () => {
      cleanupTransientNewChatOnPageLeave({ source: "chat-page" });
    };
  }, []);

  const handleSelectModel = useCallback(
    (modelId, disabled = false) => {
      const currentChatId = activeChatIdRef.current;
      if (!currentChatId || !modelId || disabled) {
        return;
      }

      modelIdRef.current = modelId;
      setSelectedModelId(modelId);
      setChatModel(currentChatId, { id: modelId }, { source: "chat-page" });
    },
    [],
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
    selectedToolkits,
    setSelectedToolkits,
    selectedWorkspaceIds,
    setSelectedWorkspaceIds,
    systemPromptOverridesRef,
    threadIdRef,
  };
};
