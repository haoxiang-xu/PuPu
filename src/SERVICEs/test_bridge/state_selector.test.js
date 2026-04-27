import { collectStateSnapshot } from "./state_selector";

describe("state_selector", () => {
  beforeEach(() => {
    window.__pupuModalRegistry = { openIds: () => ["toolkit"] };
  });
  afterEach(() => {
    delete window.__pupuModalRegistry;
  });

  test("collects snapshot from injected sources", () => {
    const snap = collectStateSnapshot({
      chatStorage: {
        getActiveChatId: () => "chat-1",
        listChatsSummary: () => [
          {
            id: "chat-1",
            title: "T",
            model: "gpt-5",
            message_count: 3,
            updated_at: 999,
          },
        ],
        getChatConfig: () => ({
          model: "gpt-5",
          toolkits: ["t1"],
          character_id: "c1",
          last_message_role: "assistant",
        }),
      },
      window: {
        location: { hash: "#/chat" },
        innerWidth: 1280,
        innerHeight: 800,
        __pupuModalRegistry: window.__pupuModalRegistry,
      },
      configContext: { isDark: true, locale: "en" },
      catalogCounts: { models: 5, toolkits: 3, characters: 2 },
      isStreaming: false,
    });
    expect(snap.active_chat_id).toBe("chat-1");
    expect(snap.active_chat).toMatchObject({
      id: "chat-1",
      message_count: 3,
    });
    expect(snap.current_model).toBe("gpt-5");
    expect(snap.toolkits_active).toEqual(["t1"]);
    expect(snap.character_id).toBe("c1");
    expect(snap.modal_open).toEqual(["toolkit"]);
    expect(snap.is_streaming).toBe(false);
    expect(snap.window_state).toMatchObject({
      width: 1280,
      height: 800,
      isDark: true,
      locale: "en",
    });
    expect(snap.catalog_loaded).toEqual({
      models: 5,
      toolkits: 3,
      characters: 2,
    });
  });

  test("returns null active_chat when no active chat", () => {
    const snap = collectStateSnapshot({
      chatStorage: {
        getActiveChatId: () => null,
        listChatsSummary: () => [],
        getChatConfig: () => null,
      },
      window: {
        location: { hash: "" },
        innerWidth: 0,
        innerHeight: 0,
      },
      configContext: { isDark: false, locale: "en" },
      catalogCounts: { models: 0, toolkits: 0, characters: 0 },
      isStreaming: false,
    });
    expect(snap.active_chat_id).toBeNull();
    expect(snap.active_chat).toBeNull();
    expect(snap.current_model).toBeNull();
  });
});
