/**
 * Composer sidecar storage透传 regression (contract §3.3 / §5).
 *
 * The `composer` field rides on a user message as an opaque top-level member.
 * chat storage must store & retrieve it field-lossless — no whitelist, no
 * strip. This locks the "zero-action / integral passthrough" guarantee the
 * contract verified for the V3 blob so a future sanitize/whitelist can't
 * silently drop it.
 */
import { getChatsStore, setChatMessages } from "./chat_storage";

const COMPOSER = {
  v: 1,
  rawText: "/plan build the login flow",
  commands: [{ name: "/plan", sourceToolkitId: "demokit" }],
  templateLength: "Draft a plan first.".length,
};

describe("chat_storage composer sidecar passthrough", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("round-trips a user message's composer field with zero loss", () => {
    const store = getChatsStore();
    const chatId = store.activeChatId;
    const content = "Draft a plan first.\n\nbuild the login flow";

    setChatMessages(
      chatId,
      [
        {
          id: "user-1",
          role: "user",
          content,
          createdAt: 1000,
          updatedAt: 1000,
          composer: COMPOSER,
        },
      ],
      { source: "test" },
    );

    const reloaded = getChatsStore();
    const persisted = reloaded.chatsById[chatId].messages[0];

    // deep-equal, field-for-field — nothing added, nothing dropped
    expect(persisted.composer).toEqual(COMPOSER);
    // templateLength still indexes within the stored content (§1.4 bound)
    expect(persisted.composer.templateLength).toBeLessThanOrEqual(
      persisted.content.length,
    );
    expect(persisted.content.slice(0, persisted.composer.templateLength)).toBe(
      "Draft a plan first.",
    );
  });

  test("messages without composer stay clean (no composer key injected)", () => {
    const store = getChatsStore();
    const chatId = store.activeChatId;

    setChatMessages(
      chatId,
      [
        {
          id: "user-plain",
          role: "user",
          content: "just a normal message",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      { source: "test" },
    );

    const reloaded = getChatsStore();
    const persisted = reloaded.chatsById[chatId].messages[0];
    expect("composer" in persisted).toBe(false);
  });

  test("forward-tolerant: unknown v:1 members survive the round-trip (§1.1/§3.3)", () => {
    const store = getChatsStore();
    const chatId = store.activeChatId;
    const withFutureMember = {
      ...COMPOSER,
      futureFlag: "some-later-optional-member",
      commands: [{ name: "/plan", sourceToolkitId: "demokit", futureChip: true }],
    };

    setChatMessages(
      chatId,
      [
        {
          id: "user-fwd",
          role: "user",
          content: "Draft a plan first.\n\nbuild the login flow",
          createdAt: 1000,
          updatedAt: 1000,
          composer: withFutureMember,
        },
      ],
      { source: "test" },
    );

    const persisted = getChatsStore().chatsById[chatId].messages[0];
    // whole object preserved, including members this version does not know
    expect(persisted.composer).toEqual(withFutureMember);
  });

  test("invalid composer is dropped whole, content untouched (§4 atomic fail-open)", () => {
    const store = getChatsStore();
    const chatId = store.activeChatId;
    const content = "Draft a plan first.\n\nbuild the login flow";

    setChatMessages(
      chatId,
      [
        {
          id: "user-bad-tl",
          role: "user",
          content,
          createdAt: 1000,
          updatedAt: 1000,
          // templateLength beyond content.length → whole sidecar invalid
          composer: { ...COMPOSER, templateLength: content.length + 999 },
        },
        {
          id: "user-bad-v",
          role: "user",
          content,
          createdAt: 1001,
          updatedAt: 1001,
          composer: { ...COMPOSER, v: 2 },
        },
        {
          id: "user-bad-cmds",
          role: "user",
          content,
          createdAt: 1002,
          updatedAt: 1002,
          composer: { ...COMPOSER, commands: [] },
        },
      ],
      { source: "test" },
    );

    const messages = getChatsStore().chatsById[chatId].messages;
    for (const m of messages) {
      expect("composer" in m).toBe(false); // dropped, not half-applied
      expect(m.content).toBe(content); // content is the untouched model truth
    }
  });
});
