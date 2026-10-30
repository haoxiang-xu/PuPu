/** @jest-environment jsdom */

/* Which Skeleton Agent a chat runs, as the store keeps it (#356, BC-002).
 *
 * The chat row is a fixed field list: a value nobody declared is dropped on
 * every read, and a chat meta is stored as whole JSON, so the sanitizer — not
 * a column — is what makes this field survive. Both directions are asserted
 * here, because "it worked in the session" and "it comes back after a cold
 * start" are different claims.
 *
 * The id spelling itself is mirrored from the server's closed charset and
 * checked against its real verdicts in `skeleton_chat_selection.test.js`.
 * What this suite owns is what the store does with one.
 */

describe("a chat's Skeleton Agent id", () => {
  let bridgeApplyOps;

  const setupIpcBridge = () => {
    bridgeApplyOps = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: jest.fn(),
      readMessages: () => [],
      applyOps: bridgeApplyOps,
    };
  };

  const createChat = (store) =>
    store.createChatInSelectedContext({ title: "Test" }, { source: "test" })
      .chatId;

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI;
    setupIpcBridge();
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  test("a new chat runs no Agent, and that is a string", () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    /* "" rather than null or undefined: the send path asks for a string and
       an absent field would make "no Agent" and "a broken Agent" the same
       shape. */
    expect(store.getChatsStore().chatsById[chatId].selectedSkeletonAgentId).toBe(
      "",
    );
  });

  test("the id is kept, beside the legacy Recipe name rather than inside it", () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSessionBundle(
      chatId,
      { selectedSkeletonAgentId: "research.agent:v2" },
      { source: "test" },
    );
    const chat = store.getChatsStore().chatsById[chatId];
    expect(chat.selectedSkeletonAgentId).toBe("research.agent:v2");
    /* The legacy field is untouched by it — one chat can name an Agent while
       the Recipe name stays at its default, and a Recipe of the same spelling
       is a different identity. */
    expect(chat.selectedRecipeName).toBe("Default");
  });

  test("writing the same id again changes nothing", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSessionBundle(
      chatId,
      { selectedSkeletonAgentId: "agent-1" },
      { source: "test" },
    );
    await Promise.resolve();
    bridgeApplyOps.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);
    store.setChatSessionBundle(
      chatId,
      { selectedSkeletonAgentId: "agent-1" },
      { source: "test" },
    );
    await Promise.resolve();
    expect(bridgeApplyOps).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  test("a value the sender could never transmit is not stored", () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    const refused = [
      "a b",
      " agent-1",
      "agent-1 ",
      "_leading",
      "a/b",
      "__proto__",
      "a".repeat(201),
      null,
      undefined,
      42,
      {},
      ["agent-1"],
      true,
    ];
    refused.forEach((value) => {
      store.setChatSessionBundle(
        chatId,
        { selectedSkeletonAgentId: value },
        { source: "test" },
      );
      expect([
        String(value).slice(0, 20),
        store.getChatsStore().chatsById[chatId].selectedSkeletonAgentId,
      ]).toEqual([String(value).slice(0, 20), ""]);
    });
  });

  test("a chat keyed by a loaded name is still just a chat", () => {
    /* The id is document-chosen data and `constructor` is a legal resource id
       on the server, so it has to be storable without reaching a prototype. */
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSessionBundle(
      chatId,
      { selectedSkeletonAgentId: "constructor" },
      { source: "test" },
    );
    expect(store.getChatsStore().chatsById[chatId].selectedSkeletonAgentId).toBe(
      "constructor",
    );
  });

  test("the id survives the read every launch performs", () => {
    /* `sanitizeChatSession` is the gate a field that nobody declared falls
       through — silently, on every read. A chat meta round-tripped through it
       keeps the id; a chat meta that holds junk comes back with none. */
    const {
      sanitizeChatSession,
    } = require("./chat_storage_sanitize");
    const stored = {
      id: "chat-1",
      title: "Test",
      selectedSkeletonAgentId: "research.agent:v2",
      selectedRecipeName: "Default",
      messages: [],
    };
    expect(sanitizeChatSession(stored, "chat-1").selectedSkeletonAgentId).toBe(
      "research.agent:v2",
    );
    expect(
      sanitizeChatSession(
        { ...stored, selectedSkeletonAgentId: "not an id" },
        "chat-1",
      ).selectedSkeletonAgentId,
    ).toBe("");
    expect(
      sanitizeChatSession({ ...stored, selectedSkeletonAgentId: undefined }, "chat-1")
        .selectedSkeletonAgentId,
    ).toBe("");
  });

  test("a character chat can never hold one", () => {
    /* A character chat runs its character. The Recipe name is already forced
       to Default there, and this follows the same rule — in the sanitizer, so
       a record written by an older build cannot bring one back either. */
    const {
      sanitizeChatSession,
    } = require("./chat_storage_sanitize");
    const cleaned = sanitizeChatSession(
      {
        id: "chat-2",
        kind: "character",
        characterId: "nico",
        title: "Nico",
        selectedSkeletonAgentId: "research.agent:v2",
        messages: [],
      },
      "chat-2",
    );
    expect(cleaned.selectedSkeletonAgentId).toBe("");
    expect(cleaned.selectedRecipeName).toBe("Default");
  });
});
