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
  message_count: Array.isArray(chat.messages) ? chat.messages.length : 0,
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
    const nodeId = findNodeIdForChat(store, chatId);
    if (nodeId) {
      cs.selectTreeNode({ nodeId }, { source: TEST_API_SOURCE });
    }
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
    const messages = chat.messages || [];
    return {
      model: unwrapModel(chat.model || chat.selectedModelId),
      toolkits: chat.selectedToolkits || chat.toolkits || [],
      character_id: chat.characterId || chat.character_id || null,
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
      messages: chat.messages || [],
    };
  },

  setChatModel: (id, model) => {
    cs.setChatModel(id, model, { source: TEST_API_SOURCE });
  },

  setChatSelectedToolkits: (id, ids) => {
    cs.setChatSelectedToolkits(id, ids, { source: TEST_API_SOURCE });
  },

  setChatCharacter: (id, charId) => {
    // No dedicated setter exists for "switch character on existing chat".
    // For Phase 1, mutate the in-memory chat record. openCharacterChat creates
    // a new chat which is not what test API wants here.
    const store = cs.getChatsStore();
    const chat = store?.chatsById?.[id];
    if (chat) {
      chat.characterId = charId;
    }
  },
});
