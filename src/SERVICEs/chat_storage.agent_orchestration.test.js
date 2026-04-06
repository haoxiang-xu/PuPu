import {
  chatsStorageConstants,
  getChatsStore,
  openCharacterChat,
  setChatAgentOrchestration,
  setChatModel,
} from "./chat_storage";

describe("chat_storage agent orchestration persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("defaults agentOrchestration to default for legacy chat payloads", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;
    const legacy = JSON.parse(JSON.stringify(seeded));
    delete legacy.chatsById[activeChatId].agentOrchestration;
    window.localStorage.setItem(chatsStorageConstants.key, JSON.stringify(legacy));

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].agentOrchestration).toEqual({
      mode: "default",
    });
  });

  test("setChatAgentOrchestration persists supported modes per chat", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;

    setChatAgentOrchestration(
      activeChatId,
      { mode: "developer_waiting_approval" },
      { source: "test" },
    );

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].agentOrchestration).toEqual({
      mode: "developer_waiting_approval",
    });
  });

  test("character chats ignore agent orchestration mutations", () => {
    const initialStore = getChatsStore();
    setChatModel(initialStore.activeChatId, { id: "openai:gpt-5" }, { source: "test" });

    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    setChatAgentOrchestration(
      created.chatId,
      { mode: "developer_waiting_approval" },
      { source: "test" },
    );

    const store = getChatsStore();
    expect(store.chatsById[created.chatId].agentOrchestration).toEqual({
      mode: "default",
    });
  });
});
