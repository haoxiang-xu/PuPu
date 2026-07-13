/** @jest-environment jsdom */

// Switch-chain incrementalization Task 2 (spec §2, FROZEN shape): every
// subscribeChatsStore event carries
//   event.dirty = { chatIds: string[], deletedChatIds: string[],
//                   treeChanged: boolean, activeChanged: boolean }
// so consumers (Task 3) can update incrementally instead of re-deriving
// everything from the whole store.
//
// Semantics under test (documented choices):
//  - chatIds     = declared dirty (chatMeta ∪ messages) ids still present in
//                  the next store, PLUS key-diff additions (created chats are
//                  dirty by definition — covers undeclared seed paths).
//  - deletedChatIds = key-diff removals (prev has the id, next doesn't) —
//                  same source of truth as the ops-layer delete_chats.
//  - treeChanged = DERIVED, never hardcoded: selectedNodeId comparison +
//                  root order shallow-compare + per-node reference compare.
//                  Task 1's identity-preserving normalize keeps untouched
//                  node references stable, so reference inequality ⟺ the
//                  node's content really changed this generation.
//  - activeChanged = activeChatId differs between generations.
//  - Same-tick writes coalesce into ONE emit whose dirty is the UNION of all
//    writes; delete wins over a chatIds entry for the same id (and a later
//    re-put cancels a pending delete — recreate semantics, mirrors pendingOps).
//  - Fallback (localStorage, no IPC) emits synchronously per write with the
//    exact same shape.

describe("chat_storage store emits carry dirty hints (IPC ops path)", () => {
  let bridgeApplyOps;
  let bridgeWrite;

  const setupIpcBridge = () => {
    bridgeApplyOps = jest.fn();
    bridgeWrite = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: bridgeWrite,
      readMessages: () => [],
      applyOps: bridgeApplyOps,
    };
  };

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI;
    setupIpcBridge();
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  const flush = () => Promise.resolve();

  const lastDirty = (listener) => {
    const calls = listener.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const [, event] = calls[calls.length - 1];
    expect(event).toBeDefined();
    expect(event.dirty).toBeDefined();
    return event.dirty;
  };

  test("(a) setChatMessages(A) → one emit, dirty.chatIds === [A]", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    // Default-titled chat: setChatMessages will derive a title from the
    // first message, which mirrors into the tree node label — a REAL,
    // deterministic tree change (not a hardcoded true).
    const a = store.createChatInSelectedContext({}, { source: "test" });
    await flush();

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    store.setChatMessages(
      a.chatId,
      [
        {
          id: "m1",
          role: "user",
          content: "hello dirty events",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      { source: "test" },
    );
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    const dirty = lastDirty(listener);
    expect(dirty.chatIds).toEqual([a.chatId]);
    expect(dirty.deletedChatIds).toEqual([]);
    // SEMANTIC CHOICE: treeChanged is true here because the message write
    // mirrors the derived title into the chat's tree node (label change via
    // updateCharacterNodeMetadata) — derived from node identity, not forced.
    expect(dirty.treeChanged).toBe(true);
    // A was already the active chat — activation did not move.
    expect(dirty.activeChanged).toBe(false);

    unsubscribe();
  });

  test("(b) same-tick setChatModel(A) + updateChatDraft(B) → single emit, chatIds union {A,B}", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    const a = store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    const b = store.createChatInSelectedContext({ title: "B" }, { source: "test" });
    await flush();

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    store.setChatModel(a.chatId, { id: "model-x" }, { source: "test" });
    store.updateChatDraft(b.chatId, { text: "draft text" }, { source: "test" });

    expect(listener).toHaveBeenCalledTimes(0);
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    const dirty = lastDirty(listener);
    expect(new Set(dirty.chatIds)).toEqual(new Set([a.chatId, b.chatId]));
    expect(dirty.deletedChatIds).toEqual([]);
    // Neither write moved activation (B stayed active the whole tick).
    expect(dirty.activeChanged).toBe(false);

    unsubscribe();
  });

  test("(c) deleteTreeNodeCascade → removed ids in deletedChatIds, absent from chatIds, treeChanged, activeChanged on reselect", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    const a = store.createChatInSelectedContext({ title: "Keep" }, { source: "test" });
    const b = store.createChatInSelectedContext({ title: "Doomed" }, { source: "test" });
    await flush();

    // B is active (created last); deleting it forces a fallback reselect.
    expect(store.getChatsStore().activeChatId).toBe(b.chatId);

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    store.deleteTreeNodeCascade({ nodeId: b.nodeId }, { source: "test" });
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    const dirty = lastDirty(listener);
    expect(dirty.deletedChatIds).toEqual([b.chatId]);
    expect(dirty.chatIds).not.toContain(b.chatId);
    expect(dirty.treeChanged).toBe(true);
    // Active moved from B to a fallback chat → activeChanged.
    expect(dirty.activeChanged).toBe(true);
    expect(store.getChatsStore().activeChatId).not.toBe(b.chatId);

    unsubscribe();
  });

  test("(d) selectTreeNode: activeChanged + treeChanged; chatIds includes the chat ONLY when its meta changed (unread flip)", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    const a = store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    const b = store.createChatInSelectedContext({ title: "B" }, { source: "test" });
    await flush();
    expect(store.getChatsStore().activeChatId).toBe(b.chatId);

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    // Select A — no unread flag on A, so activation changes NO chat meta.
    store.selectTreeNode({ nodeId: a.nodeId }, { source: "test" });
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    let dirty = lastDirty(listener);
    expect(dirty.chatIds).toEqual([]);
    expect(dirty.deletedChatIds).toEqual([]);
    expect(dirty.activeChanged).toBe(true);
    expect(dirty.treeChanged).toBe(true); // selectedNodeId moved

    // Give B an unread flag, then select it: activation flips the flag
    // (Task 1's metaChanged path) → B's meta really changed → B in chatIds.
    store.setChatGeneratedUnread(b.chatId, true, { source: "test" });
    await flush();
    listener.mockClear();

    store.selectTreeNode({ nodeId: b.nodeId }, { source: "test" });
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    dirty = lastDirty(listener);
    expect(dirty.chatIds).toEqual([b.chatId]);
    expect(dirty.activeChanged).toBe(true);
    expect(dirty.treeChanged).toBe(true);

    unsubscribe();
  });

  test("same-tick create + delete of the same chat: delete wins in the coalesced dirty", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    const keep = store.createChatInSelectedContext({ title: "Keep" }, { source: "test" });
    await flush();

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    const doomed = store.createChatInSelectedContext(
      { title: "Doomed" },
      { source: "test" },
    );
    store.deleteTreeNodeCascade({ nodeId: doomed.nodeId }, { source: "test" });
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    const dirty = lastDirty(listener);
    expect(dirty.deletedChatIds).toContain(doomed.chatId);
    expect(dirty.chatIds).not.toContain(doomed.chatId);
    expect(keep.chatId).toBeTruthy();
    expect(store.getChatsStore().activeChatId).not.toBe(doomed.chatId);

    unsubscribe();
  });
});

describe("chat_storage store emits carry dirty hints (localStorage fallback path)", () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI; // NO IPC bridge → fallback path
  });

  test("(e) fallback emits synchronously with the same dirty shape", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    // Create: chatIds carries the new id, tree gains a node, active moves.
    const a = store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    expect(listener).toHaveBeenCalledTimes(1); // synchronous — no microtask
    let dirty = listener.mock.calls[0][1].dirty;
    expect(dirty.chatIds).toContain(a.chatId);
    expect(dirty.deletedChatIds).toEqual([]);
    expect(dirty.treeChanged).toBe(true);
    expect(dirty.activeChanged).toBe(true);

    // Message write: declared dirty for A only.
    listener.mockClear();
    store.setChatMessages(
      a.chatId,
      [
        {
          id: "m1",
          role: "user",
          content: "fallback hello",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      { source: "test" },
    );
    expect(listener).toHaveBeenCalledTimes(1);
    dirty = listener.mock.calls[0][1].dirty;
    expect(dirty.chatIds).toEqual([a.chatId]);
    expect(dirty.deletedChatIds).toEqual([]);
    expect(dirty.activeChanged).toBe(false);

    // Delete: key-diff removal shows up in deletedChatIds, not chatIds.
    listener.mockClear();
    store.deleteTreeNodeCascade({ nodeId: a.nodeId }, { source: "test" });
    expect(listener).toHaveBeenCalledTimes(1);
    dirty = listener.mock.calls[0][1].dirty;
    expect(dirty.deletedChatIds).toEqual([a.chatId]);
    expect(dirty.chatIds).not.toContain(a.chatId);
    expect(dirty.treeChanged).toBe(true);

    unsubscribe();
  });
});
