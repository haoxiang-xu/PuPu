/** @jest-environment jsdom */

// Spec §5 mandated guard: normalizeStore must be idempotent on
// already-sanitized input. The V3 safety argument "chats that are not
// declared dirty are never persisted" rests on this — every writeStore
// re-runs normalizeStore over the whole store, and only if that re-sanitize
// is a fixpoint can we be sure it doesn't silently invent changes (new ids,
// re-minted fields) that would then be dropped because nobody declared them
// dirty.
//
// Volatile-field exclusion: ONLY the top-level `store.updatedAt` is excluded
// from the deep-equal. normalizeStore re-mints it on every call as
// `Math.max(Number(input.updatedAt), now())`, so two calls in different
// milliseconds legitimately differ. Every other timestamp (chat
// createdAt/updatedAt, draft.updatedAt, message createdAt/updatedAt,
// lastMessageAt) is preserved verbatim by sanitize when finite — and
// mutator-built stores always have finite values — so they stay under the
// deep-equal on purpose: if sanitize ever starts re-minting them, this test
// must fail.

const stripVolatile = (store) => {
  const { updatedAt, ...rest } = store;
  return rest;
};

const jsonClone = (value) => JSON.parse(JSON.stringify(value));

describe("normalizeStore idempotence (spec §5 guard)", () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    // Force the localStorage fallback path: mutators hold full messages in
    // memory, so the built store is a complete (non-lazy) v2-shaped store.
    delete window.chatStorageAPI;
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  test("normalizeStore is deterministic and a fixpoint on a mutator-built store", () => {
    const store = require("./chat_storage_store");
    const { normalizeStore } = require("./chat_storage_migrate");

    // Build a realistic store through the public mutators: a folder, a chat
    // with messages (user + finished assistant), and a renamed title.
    store.createFolder({ label: "Idempotence" }, { source: "test" });
    const created = store.createChatInSelectedContext(
      { title: "Fixpoint chat" },
      { source: "test" },
    );
    expect(created.chatId).toBeTruthy();
    store.setChatMessages(
      created.chatId,
      [
        {
          id: "msg-1",
          role: "user",
          content: "prove it",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "q.e.d.",
          status: "done",
          createdAt: 1001,
          updatedAt: 1001,
        },
      ],
      { source: "test" },
    );
    store.setChatTitle(created.chatId, "Fixpoint chat!", { source: "test" });

    const built = store.getChatsStore();
    expect(Object.keys(built.chatsById)).toContain(created.chatId);

    // Same input, two runs → deep-equal outputs (determinism).
    const out1 = normalizeStore(jsonClone(built));
    const out2 = normalizeStore(jsonClone(built));
    expect(stripVolatile(out2)).toEqual(stripVolatile(out1));

    // Already-sanitized input → re-sanitize is a no-op (idempotence proper).
    const out3 = normalizeStore(jsonClone(out1));
    expect(stripVolatile(out3)).toEqual(stripVolatile(out1));

    // And normalize doesn't drift from what the store already holds: the
    // persisted store is itself a fixpoint (no id churn, no re-minted chats).
    expect(stripVolatile(out1)).toEqual(stripVolatile(built));
  });
});
