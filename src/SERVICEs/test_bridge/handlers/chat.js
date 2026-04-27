export const createChatHandlers = ({ chatStorage }) => ({
  createChat: async ({ title, model } = {}) => {
    const created = chatStorage.createChatInSelectedContext({ title, model });
    chatStorage.selectTreeNode(created.id);
    return { chat_id: created.id, created_at: Date.now() };
  },
  listChats: async () => ({ chats: chatStorage.listChatsSummary() }),
  getChat: async ({ id }) => chatStorage.getChatDetail(id),
  activateChat: async ({ id }) => {
    chatStorage.selectTreeNode(id);
    return { ok: true };
  },
  renameChat: async ({ id, title }) => {
    chatStorage.setChatTitle(id, title);
    return { ok: true };
  },
  deleteChat: async ({ id }) => {
    chatStorage.deleteTreeNodeCascade(id);
    return { ok: true };
  },
});

export const registerChatHandlers = ({ bridge, chatStorage }) => {
  const h = createChatHandlers({ chatStorage });
  bridge.register("createChat", h.createChat);
  bridge.register("listChats", h.listChats);
  bridge.register("getChat", h.getChat);
  bridge.register("activateChat", h.activateChat);
  bridge.register("renameChat", h.renameChat);
  bridge.register("deleteChat", h.deleteChat);
};
