import {
  buildExplorerFromTree,
  chatsStorageConstants,
  getChatsStore,
  openCharacterChat,
  refreshCharacterChatMetadata,
  setChatModel,
  setChatSelectedToolkits,
  setChatSelectedWorkspaceIds,
} from "./chat_storage";

describe("chat_storage character chat behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("openCharacterChat creates one locked character chat and reuses it", () => {
    const initialStore = getChatsStore();
    const sourceChatId = initialStore.activeChatId;
    setChatModel(sourceChatId, { id: "openai:gpt-5" }, { source: "test" });

    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          avatar: { absolute_path: "/tmp/nico.png" },
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);

    const afterCreate = getChatsStore();
    const characterChat = afterCreate.chatsById[created.chatId];
    expect(characterChat.kind).toBe("character");
    expect(characterChat.characterId).toBe("nico");
    expect(characterChat.characterName).toBe("Nico");
    expect(characterChat.title).toBe("Nico");
    expect(characterChat.threadId).toBe("main");
    expect(characterChat.model).toEqual({ id: "openai:gpt-4.1" });
    expect(characterChat.selectedToolkits).toEqual([]);
    expect(characterChat.selectedWorkspaceIds).toEqual([]);

    const reopened = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    const afterReopen = getChatsStore();
    expect(reopened.ok).toBe(true);
    expect(reopened.created).toBe(false);
    expect(reopened.chatId).toBe(created.chatId);
    expect(
      Object.values(afterReopen.chatsById).filter(
        (chat) => chat.kind === "character" && chat.characterId === "nico",
      ),
    ).toHaveLength(1);
  });

  test("openCharacterChat uses a character default model without needing a source model", () => {
    const result = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(getChatsStore().chatsById[result.chatId].model).toEqual({
      id: "openai:gpt-4.1",
    });
  });

  test("openCharacterChat refuses to create a new character chat without a source model or character default", () => {
    const result = openCharacterChat(
      {
        character: {
          id: "mira",
          name: "Mira",
        },
      },
      { source: "test" },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Select a model");
  });

  test("character chats ignore toolkit and workspace mutations", () => {
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

    setChatSelectedToolkits(created.chatId, ["WorkspaceToolkit"], {
      source: "test",
    });
    setChatSelectedWorkspaceIds(created.chatId, ["workspace-1"], {
      source: "test",
    });
    setChatModel(created.chatId, { id: "openai:gpt-4.1" }, { source: "test" });

    const store = getChatsStore();
    expect(store.chatsById[created.chatId].model).toEqual({
      id: "openai:gpt-4.1",
    });
    expect(store.chatsById[created.chatId].selectedToolkits).toEqual([]);
    expect(store.chatsById[created.chatId].selectedWorkspaceIds).toEqual([]);
  });

  test("openCharacterChat updates an existing Nico chat to the character default model", () => {
    const initialStore = getChatsStore();
    setChatModel(initialStore.activeChatId, { id: "openai:gpt-5" }, { source: "test" });

    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
        },
      },
      { source: "test" },
    );

    expect(getChatsStore().chatsById[created.chatId].model).toEqual({
      id: "openai:gpt-5",
    });

    const reopened = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    expect(reopened.ok).toBe(true);
    expect(reopened.created).toBe(false);
    expect(getChatsStore().chatsById[reopened.chatId].model).toEqual({
      id: "openai:gpt-4.1",
    });
  });

  test("normalizeStore dedupes duplicate character chats by character id", () => {
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

    const current = getChatsStore();
    const duplicateId = "chat-duplicate-character";
    const duplicateNodeId = `chn-${duplicateId}`;
    const rawStore = JSON.parse(JSON.stringify(current));
    rawStore.chatsById[duplicateId] = {
      ...rawStore.chatsById[created.chatId],
      id: duplicateId,
      updatedAt: rawStore.chatsById[created.chatId].updatedAt - 1000,
    };
    rawStore.tree.nodesById[duplicateNodeId] = {
      id: duplicateNodeId,
      entity: "chat",
      type: "file",
      chatId: duplicateId,
      label: "Nico",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    rawStore.tree.root.unshift(duplicateNodeId);
    rawStore.lruChatIds.push(duplicateId);
    window.localStorage.setItem(
      chatsStorageConstants.key,
      JSON.stringify(rawStore),
    );

    const hydrated = getChatsStore();
    expect(
      Object.values(hydrated.chatsById).filter(
        (chat) => chat.kind === "character" && chat.characterId === "nico",
      ),
    ).toHaveLength(1);
    expect(hydrated.chatsById[created.chatId]).toBeTruthy();
    expect(hydrated.chatsById[duplicateId]).toBeUndefined();
  });

  test("buildExplorerFromTree exposes character metadata and disables rename behavior", () => {
    const initialStore = getChatsStore();
    setChatModel(initialStore.activeChatId, { id: "openai:gpt-5" }, { source: "test" });
    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          avatar: { absolute_path: "/tmp/nico.png" },
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );
    const store = getChatsStore();
    const model = buildExplorerFromTree(store.tree, store.chatsById, {
      selectedNodeId: store.tree.selectedNodeId,
      onStartRename: jest.fn(),
    });
    const nodeId = Object.keys(model.data).find(
      (id) => model.data[id]?.chatId === created.chatId,
    );
    const explorerNode = model.data[nodeId];

    expect(explorerNode.chatKind).toBe("character");
    expect(explorerNode.characterId).toBe("nico");
    expect(explorerNode.characterName).toBe("Nico");
    expect(explorerNode.characterAvatar).toEqual({
      absolute_path: "/tmp/nico.png",
    });
    expect(explorerNode.prefix_icon).toBeUndefined();
    expect(explorerNode.on_double_click).toBeDefined();
    expect(() => explorerNode.on_double_click()).not.toThrow();
  });

  test("openCharacterChat preserves avatar urls for character chats", () => {
    const initialStore = getChatsStore();
    setChatModel(initialStore.activeChatId, { id: "openai:gpt-5" }, { source: "test" });

    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          avatar: { url: "http://127.0.0.1:5879/characters/nico/avatar" },
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    expect(getChatsStore().chatsById[created.chatId].characterAvatar).toEqual({
      url: "http://127.0.0.1:5879/characters/nico/avatar",
    });
  });

  test("refreshCharacterChatMetadata replaces stale persisted avatar urls", () => {
    const initialStore = getChatsStore();
    setChatModel(initialStore.activeChatId, { id: "openai:gpt-5" }, { source: "test" });

    const created = openCharacterChat(
      {
        character: {
          id: "nico",
          name: "Nico",
          avatar: {
            url: "http://127.0.0.1:5879/characters/nico/avatar?miso_auth=stale-token",
          },
          metadata: { default_model: "openai:gpt-4.1" },
        },
      },
      { source: "test" },
    );

    refreshCharacterChatMetadata(
      [
        {
          id: "nico",
          name: "Nico",
          avatar: {
            url: "http://127.0.0.1:5879/characters/nico/avatar?miso_auth=fresh-token",
          },
        },
      ],
      { source: "test" },
    );

    expect(getChatsStore().chatsById[created.chatId].characterAvatar).toEqual({
      url: "http://127.0.0.1:5879/characters/nico/avatar?miso_auth=fresh-token",
    });
  });
});
