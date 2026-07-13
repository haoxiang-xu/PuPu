// Switch-chain incrementalization Task 3 (spec §3): buildExplorerFromTree
// grows a caller-owned generation cache so a row OBJECT is reused (reference
// equality) across builds when nothing that feeds it changed. Row identity is
// what lets the explorer's React.memo rows skip re-rendering on every store
// write — the O(library) React cost on create/switch.
//
// Cache policy under test (documented at the implementation):
//  - Chat rows: reuse iff node ref, chat ref, handlers OBJECT ref, computed
//    `selected` flag, and the recomputed relative-age postfix are unchanged.
//    Reference-gated on the chat (T1 guarantees untouched chats keep refs;
//    a re-minted chat object re-mints the row even if content is equal —
//    conservative by design).
//  - Folder rows: descendant roll-ups (generating / unread) are RECOMPUTED
//    every build via the existing memoized subtree walks; the folder row
//    object is reused iff node ref, handlers ref, `selected`, and BOTH
//    roll-up booleans are unchanged. So an ancestor folder's row identity
//    changes exactly when a descendant flip changes its roll-up.
//  - handlers object identity is part of every cache key: a new handlers
//    object ⇒ full rebuild (closures capture `handlers`).
//  - The cache map is rebuilt each build: ids that leave the tree are evicted.
//  - No cache argument ⇒ exact pre-existing behavior (fresh rows per call).

import { buildExplorerFromTree } from "./chat_storage_tree";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_NOW = 400 * DAY_MS; // fixed reference "now" for relative ages

const makeChat = (id, overrides = {}) => ({
  id,
  kind: "default",
  title: `Chat ${id}`,
  createdAt: 1000,
  updatedAt: 2000,
  lastMessageAt: null,
  messages: [],
  isGenerating: false,
  hasUnreadGeneratedReply: false,
  stats: { messageCount: 0, approxBytes: 0 },
  ...overrides,
});

const makeChatNode = (nodeId, chatId, label = chatId) => ({
  id: nodeId,
  entity: "chat",
  type: "file",
  chatId,
  label,
  createdAt: 1000,
  updatedAt: 2000,
});

const makeFolderNode = (nodeId, children, label = nodeId) => ({
  id: nodeId,
  entity: "folder",
  type: "folder",
  label,
  children,
  createdAt: 1000,
  updatedAt: 2000,
});

// folder-a ▸ [node-a1(chat-a1), node-a2(chat-a2)] , node-b(chat-b) at root
const makeFixture = () => {
  const chatsById = {
    "chat-a1": makeChat("chat-a1"),
    "chat-a2": makeChat("chat-a2"),
    "chat-b": makeChat("chat-b", { lastMessageAt: BASE_NOW - 30 * 60 * 1000 }),
  };
  const tree = {
    root: ["folder-a", "node-b"],
    nodesById: {
      "folder-a": makeFolderNode("folder-a", ["node-a1", "node-a2"]),
      "node-a1": makeChatNode("node-a1", "chat-a1"),
      "node-a2": makeChatNode("node-a2", "chat-a2"),
      "node-b": makeChatNode("node-b", "chat-b"),
    },
    selectedNodeId: "node-b",
    expandedFolderIds: [],
  };
  const handlers = {
    selectedNodeId: "node-b",
    relativeNow: BASE_NOW,
    onSelect: jest.fn(),
    onContextMenu: jest.fn(),
    onStartRename: jest.fn(),
  };
  const cache = { rowsByNodeId: new Map() };
  return { chatsById, tree, handlers, cache };
};

const ALL_IDS = ["folder-a", "node-a1", "node-a2", "node-b"];

describe("buildExplorerFromTree generation row cache", () => {
  test("(a) same refs + same handlers + cache → second build returns reference-equal rows", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers, cache);
    const second = buildExplorerFromTree(tree, chatsById, handlers, cache);

    for (const id of ALL_IDS) {
      expect(second.data[id]).toBe(first.data[id]);
    }
    // containers are fresh per build (consumers may mutate them)
    expect(second.data).not.toBe(first.data);
    expect(second.root).not.toBe(first.root);
    expect(second.root).toEqual(first.root);
  });

  test("(b) one chat re-minted (isGenerating flip) → only its row + affected ancestor folder rows change", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers, cache);

    const nextChats = {
      ...chatsById,
      "chat-a1": { ...chatsById["chat-a1"], isGenerating: true },
    };
    const second = buildExplorerFromTree(tree, nextChats, handlers, cache);

    // the dirty chat's row is new, and correct
    expect(second.data["node-a1"]).not.toBe(first.data["node-a1"]);
    expect(second.data["node-a1"].is_generating).toBe(true);
    // ancestor folder roll-up flipped false→true ⇒ folder row re-minted
    expect(second.data["folder-a"]).not.toBe(first.data["folder-a"]);
    expect(second.data["folder-a"].has_generating_chat_descendant).toBe(true);
    // untouched rows keep identity
    expect(second.data["node-a2"]).toBe(first.data["node-a2"]);
    expect(second.data["node-b"]).toBe(first.data["node-b"]);
  });

  test("(b2) folder row keeps identity when a descendant chat changes WITHOUT moving the roll-ups", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers, cache);

    // re-mint chat-a1 with equal roll-up-relevant flags (e.g. a model change)
    const nextChats = {
      ...chatsById,
      "chat-a1": { ...chatsById["chat-a1"], model: { id: "m2" } },
    };
    const second = buildExplorerFromTree(tree, nextChats, handlers, cache);

    // reference-gated: the touched chat's row is conservatively re-minted…
    expect(second.data["node-a1"]).not.toBe(first.data["node-a1"]);
    // …but the ancestor folder row is stable (roll-ups unchanged)
    expect(second.data["folder-a"]).toBe(first.data["folder-a"]);
    expect(second.data["node-a2"]).toBe(first.data["node-a2"]);
  });

  test("(c) handlers object identity change → full rebuild (no stale closures)", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers, cache);
    const second = buildExplorerFromTree(tree, chatsById, { ...handlers }, cache);

    for (const id of ALL_IDS) {
      expect(second.data[id]).not.toBe(first.data[id]);
    }
  });

  test("(d) selection move on the SAME handlers object → exactly the two affected rows change", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers, cache);

    handlers.selectedNodeId = "node-a2";
    const second = buildExplorerFromTree(tree, chatsById, handlers, cache);

    expect(second.data["node-b"]).not.toBe(first.data["node-b"]);
    expect(second.data["node-b"].is_active).toBe(false);
    expect(second.data["node-a2"]).not.toBe(first.data["node-a2"]);
    expect(second.data["node-a2"].is_active).toBe(true);
    // unaffected rows keep identity (folder-a's selected flag stayed false)
    expect(second.data["node-a1"]).toBe(first.data["node-a1"]);
    expect(second.data["folder-a"]).toBe(first.data["folder-a"]);
  });

  test("(e) relativeNow tick re-mints only rows whose formatted age actually changed", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers, cache);
    expect(first.data["node-b"].postfix).toBe("30m");

    handlers.relativeNow = BASE_NOW + 2 * 60 * 60 * 1000; // +2h
    const second = buildExplorerFromTree(tree, chatsById, handlers, cache);

    // chat-b's bucket moved 30m → 2h ⇒ new row
    expect(second.data["node-b"]).not.toBe(first.data["node-b"]);
    expect(second.data["node-b"].postfix).toBe("2h");
    // a1/a2 are ~400 days old — same "1y" bucket ⇒ identity preserved
    expect(second.data["node-a1"]).toBe(first.data["node-a1"]);
    expect(second.data["node-a2"]).toBe(first.data["node-a2"]);
  });

  test("(f) nodes that leave the tree are evicted from the cache", () => {
    const { chatsById, tree, handlers, cache } = makeFixture();

    buildExplorerFromTree(tree, chatsById, handlers, cache);
    expect(cache.rowsByNodeId.has("node-b")).toBe(true);

    const nextChats = { ...chatsById };
    delete nextChats["chat-b"];
    const nextTree = {
      ...tree,
      root: ["folder-a"],
      nodesById: {
        "folder-a": tree.nodesById["folder-a"],
        "node-a1": tree.nodesById["node-a1"],
        "node-a2": tree.nodesById["node-a2"],
      },
    };
    const second = buildExplorerFromTree(nextTree, nextChats, handlers, cache);

    expect(second.data["node-b"]).toBeUndefined();
    expect(cache.rowsByNodeId.has("node-b")).toBe(false);
    // survivors still hit
    expect(cache.rowsByNodeId.has("node-a1")).toBe(true);
  });

  test("(g) without a cache argument the pre-existing behavior holds (fresh rows per call)", () => {
    const { chatsById, tree, handlers } = makeFixture();

    const first = buildExplorerFromTree(tree, chatsById, handlers);
    const second = buildExplorerFromTree(tree, chatsById, handlers);

    for (const id of ALL_IDS) {
      expect(second.data[id]).not.toBe(first.data[id]);
      expect(second.data[id]).toMatchObject({
        entity: first.data[id].entity,
        label: first.data[id].label,
      });
    }
  });
});
