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
    });
    expect(snap.active_chat_id).toBe("chat-1");
    expect(snap.inspected_chat_id).toBe("chat-1");
    expect(snap.active_chat).toMatchObject({
      id: "chat-1",
      message_count: 3,
    });
    expect(snap.inspected_chat).toMatchObject({
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
    expect(Object.keys(snap)).toEqual([
      "active_chat_id",
      "active_chat",
      "inspected_chat_id",
      "inspected_chat",
      "current_model",
      "toolkits_active",
      "character_id",
      "modal_open",
      "is_streaming",
      "route",
      "window_state",
      "catalog_loaded",
    ]);
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
    });
    expect(snap.active_chat_id).toBeNull();
    expect(snap.active_chat).toBeNull();
    expect(snap.current_model).toBeNull();
    expect(snap.is_streaming).toBe(false);
  });

  test("inspects a requested background chat without changing active_chat_id", () => {
    const configs = {
      "chat-a": {
        model: "openai:gpt-5",
        toolkits: ["core"],
        character_id: null,
        is_streaming: false,
        last_message_role: "assistant",
      },
      "chat-b": {
        model: "anthropic:claude-sonnet-4-6",
        toolkits: ["mcp.workspace.filesystem"],
        character_id: "worker-b",
        is_streaming: true,
        last_message_role: "assistant",
      },
    };
    const snap = collectStateSnapshot({
      chatId: "chat-b",
      chatStorage: {
        getActiveChatId: () => "chat-a",
        listChatsSummary: () => [
          {
            id: "chat-a",
            title: "A",
            model: "openai:gpt-5",
            message_count: 2,
          },
          {
            id: "chat-b",
            title: "B",
            model: "anthropic:claude-sonnet-4-6",
            message_count: 7,
          },
        ],
        getChatConfig: (id) => configs[id] || null,
      },
      window: {
        location: { hash: "#/chat" },
        innerWidth: 800,
        innerHeight: 600,
      },
      configContext: { isDark: false, locale: "en" },
      catalogCounts: { models: 2, toolkits: 1, characters: 1 },
    });

    expect(snap.active_chat_id).toBe("chat-a");
    expect(snap.active_chat).toMatchObject({ id: "chat-a", title: "A" });
    expect(snap.inspected_chat_id).toBe("chat-b");
    expect(snap.inspected_chat).toMatchObject({
      id: "chat-b",
      title: "B",
      message_count: 7,
    });
    expect(snap.current_model).toBe("anthropic:claude-sonnet-4-6");
    expect(snap.toolkits_active).toEqual(["mcp.workspace.filesystem"]);
    expect(snap.character_id).toBe("worker-b");
    expect(snap.is_streaming).toBe(true);
  });

  test("uses the inspected chat adapter state for active default and explicit queries", () => {
    const configs = {
      "chat-a": { is_streaming: false },
      "chat-b": { is_streaming: false },
    };
    const chatStorage = {
      getActiveChatId: () => "chat-a",
      listChatsSummary: () => [
        { id: "chat-a", title: "A", model: "gpt-5", message_count: 0 },
        { id: "chat-b", title: "B", model: "gpt-5", message_count: 0 },
      ],
      getChatConfig: (id) => configs[id] || null,
    };
    const sources = {
      chatStorage,
      window: {},
      configContext: {},
      catalogCounts: {},
    };

    configs["chat-a"].is_streaming = true;
    expect(collectStateSnapshot(sources).is_streaming).toBe(true);
    expect(
      collectStateSnapshot({ ...sources, chatId: "chat-a" }).is_streaming,
    ).toBe(true);

    configs["chat-a"].is_streaming = false;
    expect(collectStateSnapshot(sources).is_streaming).toBe(false);
    configs["chat-a"].is_streaming = true;
    expect(collectStateSnapshot(sources).is_streaming).toBe(true);
    configs["chat-a"].is_streaming = false;
    expect(collectStateSnapshot(sources).is_streaming).toBe(false);
  });

  test("keeps background chat streaming independent and unknown chats false", () => {
    const configs = {
      "chat-a": { is_streaming: true },
      "chat-b": { is_streaming: false },
    };
    const sources = {
      chatStorage: {
        getActiveChatId: () => "chat-a",
        listChatsSummary: () => [
          { id: "chat-a", title: "A", model: "gpt-5", message_count: 0 },
          { id: "chat-b", title: "B", model: "gpt-5", message_count: 0 },
        ],
        getChatConfig: (id) => configs[id] || null,
      },
      window: {},
      configContext: {},
      catalogCounts: {},
    };

    expect(
      collectStateSnapshot({ ...sources, chatId: "chat-b" }).is_streaming,
    ).toBe(false);
    configs["chat-b"].is_streaming = true;
    expect(
      collectStateSnapshot({ ...sources, chatId: "chat-b" }).is_streaming,
    ).toBe(true);

    const unknown = collectStateSnapshot({ ...sources, chatId: "missing" });
    expect(unknown.inspected_chat_id).toBe("missing");
    expect(unknown.inspected_chat).toBeNull();
    expect(unknown.is_streaming).toBe(false);
  });
});
