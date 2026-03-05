import {
  chatsStorageConstants,
  getChatsStore,
  setChatSystemPromptOverrides,
} from "./chat_storage";

describe("chat_storage system prompt overrides persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("defaults systemPromptOverrides to {} for legacy chat payloads", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;
    const legacy = JSON.parse(JSON.stringify(seeded));
    delete legacy.chatsById[activeChatId].systemPromptOverrides;
    window.localStorage.setItem(chatsStorageConstants.key, JSON.stringify(legacy));

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].systemPromptOverrides).toEqual({});
  });

  test("setChatSystemPromptOverrides normalizes keys and persists null clears", () => {
    const seeded = getChatsStore();
    const activeChatId = seeded.activeChatId;

    setChatSystemPromptOverrides(
      activeChatId,
      {
        personally: "  Helpful and direct.  ",
        rules: "  Do not guess.  ",
        context: null,
        unknown: "ignored",
      },
      { source: "test" },
    );

    const hydrated = getChatsStore();
    expect(hydrated.chatsById[activeChatId].systemPromptOverrides).toEqual({
      personality: "Helpful and direct.",
      rules: "Do not guess.",
      context: null,
    });
  });
});
