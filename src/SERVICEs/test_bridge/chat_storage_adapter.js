import * as cs from "../chat_storage";

const TEST_API_SOURCE = "test-api";

const findNodeIdForChat = (store, chatId) => {
  const nodes = store?.tree?.nodesById || {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node?.entity === "chat" && node.chatId === chatId) {
      return nodeId;
    }
  }
  return null;
};

const unwrapModel = (m) => {
  if (!m) return null;
  if (typeof m === "string") return m;
  return m.id || m.model_id || m.model || null;
};

const buildSummary = (chat) => ({
  id: chat.id,
  title: chat.title || "",
  model: unwrapModel(chat.model || chat.selectedModelId),
  // v3 lazy messages: the summary list must stay cheap — read the meta stats,
  // never load message arrays (non-active chats are `[]` placeholders).
  message_count: chat.stats?.messageCount ?? 0,
  updated_at: chat.updatedAt || chat.modifiedAt || 0,
});

const allChats = (store) => Object.values(store?.chatsById || {});

export const buildChatStorageAdapter = () => ({
  createChatInSelectedContext: ({ title, model } = {}) => {
    const result = cs.createChatInSelectedContext(
      { title },
      { source: TEST_API_SOURCE },
    );
    if (model && result?.chatId) {
      cs.setChatModel(result.chatId, model, { source: TEST_API_SOURCE });
    }
    return { id: result.chatId, nodeId: result.nodeId };
  },

  selectTreeNode: (chatId) => {
    const store = cs.getChatsStore();
    if (!store?.chatsById?.[chatId]) {
      throw Object.assign(new Error(`chat ${chatId} not found`), {
        code: "chat_not_found",
        status: 404,
      });
    }
    const nodeId = findNodeIdForChat(store, chatId);
    if (!nodeId) {
      throw Object.assign(
        new Error(`chat ${chatId} has no selectable tree node`),
        { code: "chat_not_active", status: 409 },
      );
    }
    const nextStore = cs.selectTreeNode(
      { nodeId },
      { source: TEST_API_SOURCE },
    );
    const activeChatId = nextStore?.activeChatId || null;
    if (activeChatId !== chatId) {
      throw Object.assign(
        new Error(
          `chat ${chatId} activation did not commit; active chat is ${activeChatId || "none"}`,
        ),
        { code: "chat_not_active", status: 409 },
      );
    }
    return {
      chat_id: chatId,
      node_id: nodeId,
      active_chat_id: activeChatId,
    };
  },

  setChatTitle: (chatId, title) => {
    cs.setChatTitle(chatId, title, { source: TEST_API_SOURCE });
  },

  deleteTreeNodeCascade: (chatId) => {
    const store = cs.getChatsStore();
    const nodeId = findNodeIdForChat(store, chatId);
    if (nodeId) {
      cs.deleteTreeNodeCascade({ nodeId }, { source: TEST_API_SOURCE });
    }
  },

  listChatsSummary: () => allChats(cs.getChatsStore()).map(buildSummary),

  getActiveChatId: () => cs.getChatsStore()?.activeChatId || null,

  getChatConfig: (id) => {
    const chat = cs.getChatsStore()?.chatsById?.[id];
    if (!chat) return null;
    const messages = cs.getChatMessages(id) || [];
    return {
      model: unwrapModel(chat.model || chat.selectedModelId),
      toolkits: chat.selectedToolkits || chat.toolkits || [],
      character_id: chat.characterId || chat.character_id || null,
      is_streaming: chat.isGenerating === true,
      last_message_role: messages.length
        ? messages[messages.length - 1].role
        : null,
    };
  },

  getChatDetail: (id) => {
    const chat = cs.getChatsStore()?.chatsById?.[id];
    if (!chat) {
      throw Object.assign(new Error(`chat ${id} not found`), {
        code: "chat_not_found",
        status: 404,
      });
    }
    return {
      id: chat.id,
      title: chat.title || "",
      model: unwrapModel(chat.model || chat.selectedModelId),
      character_id: chat.characterId || chat.character_id || null,
      toolkits: chat.selectedToolkits || chat.toolkits || [],
      messages: cs.getChatMessages(id) || [],
    };
  },

  setChatModel: (id, model) => {
    cs.setChatModel(id, model, { source: TEST_API_SOURCE });
  },

  setChatSelectedToolkits: (id, ids) => {
    cs.setChatSelectedToolkits(id, ids, { source: TEST_API_SOURCE });
  },

  setChatCharacter: (id, charId) => {
    const store = cs.getChatsStore();
    const chat = store?.chatsById?.[id];
    if (!chat) {
      throw Object.assign(new Error(`chat ${id} not found`), {
        code: "chat_not_found",
        status: 404,
      });
    }

    const currentCharacterId =
      chat.characterId || chat.character_id || null;
    const requestedCharacterId = charId ?? null;
    if (requestedCharacterId === currentCharacterId) {
      return { ok: true, character_id: currentCharacterId };
    }

    // Character chats carry coupled identity, thread, memory, and orchestration
    // invariants. Mutating only characterId creates a chat that looks switched
    // but still owns the previous character's runtime state.
    throw Object.assign(
      new Error(
        "changing character on an existing chat is unsupported; open the canonical character chat instead",
      ),
      {
        code: "character_update_unsupported",
        status: 409,
      },
    );
  },
});
