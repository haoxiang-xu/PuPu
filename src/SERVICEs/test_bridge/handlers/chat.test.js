import { createChatHandlers } from "./chat";

const makeFakeStorage = () => {
  const state = { chats: [], active: null };
  return {
    state,
    createChatInSelectedContext: ({ title, model }) => {
      const id = `c${state.chats.length + 1}`;
      state.chats.push({
        id,
        title: title || "Untitled",
        model: model || null,
      });
      state.active = id;
      return { id };
    },
    selectTreeNode: (id) => {
      state.active = id;
    },
    setChatTitle: (id, title) => {
      const chat = state.chats.find((c) => c.id === id);
      if (chat) chat.title = title;
    },
    deleteTreeNodeCascade: (id) => {
      state.chats = state.chats.filter((c) => c.id !== id);
      if (state.active === id) state.active = null;
    },
    listChatsSummary: () =>
      state.chats.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        message_count: 0,
        updated_at: 0,
      })),
    getActiveChatId: () => state.active,
    getChatDetail: (id) => {
      const c = state.chats.find((c) => c.id === id);
      if (!c) {
        throw Object.assign(new Error("chat not found"), {
          code: "chat_not_found",
        });
      }
      return {
        id: c.id,
        title: c.title,
        model: c.model,
        character_id: null,
        toolkits: [],
        messages: [],
      };
    },
  };
};

describe("chat handlers", () => {
  test("createChat returns chat_id and activates", async () => {
    const storage = makeFakeStorage();
    const h = createChatHandlers({ chatStorage: storage });
    const result = await h.createChat({ title: "Hello", model: "gpt-5" });
    expect(result).toEqual({
      chat_id: "c1",
      created_at: expect.any(Number),
    });
    expect(storage.state.active).toBe("c1");
  });

  test("listChats returns summary list", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "A" });
    storage.createChatInSelectedContext({ title: "B" });
    const h = createChatHandlers({ chatStorage: storage });
    const r = await h.listChats({});
    expect(r.chats).toHaveLength(2);
    expect(r.chats[0]).toMatchObject({ id: "c1", title: "A" });
  });

  test("activateChat switches active without sending", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "A" });
    storage.createChatInSelectedContext({ title: "B" });
    const h = createChatHandlers({ chatStorage: storage });
    await h.activateChat({ id: "c1" });
    expect(storage.state.active).toBe("c1");
  });

  test("renameChat updates title", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "Old" });
    const h = createChatHandlers({ chatStorage: storage });
    await h.renameChat({ id: "c1", title: "New" });
    expect(storage.state.chats[0].title).toBe("New");
  });

  test("deleteChat removes the chat", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "A" });
    const h = createChatHandlers({ chatStorage: storage });
    await h.deleteChat({ id: "c1" });
    expect(storage.state.chats).toHaveLength(0);
  });

  test("getChat returns chat_not_found-coded error on missing id", async () => {
    const storage = makeFakeStorage();
    const h = createChatHandlers({ chatStorage: storage });
    await expect(h.getChat({ id: "missing" })).rejects.toMatchObject({
      code: "chat_not_found",
    });
  });
});
