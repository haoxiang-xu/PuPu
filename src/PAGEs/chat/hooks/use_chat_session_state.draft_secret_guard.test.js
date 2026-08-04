/**
 * Memory V2 P0 — composer draft persistence must never carry a plaintext
 * credential into the chats DB.
 *
 * The composer debounces its text into storage (and tail-flushes it on
 * unload / chat switch / unmount) long before the SEND path's secret capture
 * ever runs. Without a guard at the storage boundary, simply TYPING a secret
 * would durably persist it — bypassing the send-path fail-closed guarantee.
 *
 * Contract locked here:
 *  - flag ON  → any draft text with explicit {{secret:...}} syntax, a known
 *               credential token prefix, or a conservative password/token/
 *               api-key assignment persists as "" (attachments untouched);
 *  - the in-memory composer is NEVER rewritten — typing/editing/sending are
 *    unaffected, only the durable copy is emptied;
 *  - an already-stored matching draft is proactively scrubbed on mount and on
 *    chat switch;
 *  - flag OFF → byte-for-byte identical to the pre-guard behavior.
 *
 * The last describe block is a DRIFT SENTINEL: the predicate in
 * use_chat_session_state.js is a deliberate local copy of the secret_capture
 * heuristics (that module is under concurrent edit, so it is not imported by
 * the hook). If the parity test fails, re-sync the copy.
 */
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  bootstrapChatsStore,
  createChatInSelectedContext,
  getChatsStore,
  markChatStarted,
  selectTreeNode,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import {
  detectLikelySecretAssignment,
  hasSecretCaptureSyntax,
} from "./secret_capture";
import {
  draftTextLooksSecret,
  useChatSessionState,
} from "./use_chat_session_state";

const WRAPPED_SECRET = "here it is {{secret:API key}}hunter2abc{{/secret}}";
const TOKEN_PREFIX_TEXT = "use sk-abcdefghijklmnop0123456789 for now";
const ASSIGNMENT_TEXT = "api_key = zY9pQ2rL7wKm";
const INNOCENT_TEXT = "how do I rotate a password safely?";

const setMemoryV2Flag = (enabled) => {
  const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
  root.feature_flags = {
    ...(root.feature_flags || {}),
    enable_memory_v2: enabled === true,
  };
  window.localStorage.setItem("settings", JSON.stringify(root));
};

const findNodeIdByChatId = (tree, chatId) =>
  Object.entries(tree.nodesById || {}).find(
    ([, node]) => node?.entity === "chat" && node?.chatId === chatId,
  )?.[0] || null;

const draftOf = (chatId) => getChatsStore().chatsById[chatId]?.draft;

describe("useChatSessionState draft secret guard", () => {
  const setup = (draftAttachments = []) => {
    const activeStreamsRef = { current: new Map() };
    const setDraftAttachments = jest.fn();
    const { result, unmount } = renderHook(() =>
      useChatSessionState({
        bootstrapped: bootstrapChatsStore(),
        draftAttachments,
        setDraftAttachments,
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );
    return { result, unmount, activeStreamsRef, setDraftAttachments };
  };

  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe("flag ON", () => {
    beforeEach(() => {
      setMemoryV2Flag(true);
    });

    test.each([
      ["explicit {{secret:...}} syntax", WRAPPED_SECRET],
      ["a recognized token prefix", TOKEN_PREFIX_TEXT],
      ["a conservative credential assignment", ASSIGNMENT_TEXT],
    ])("debounced persist writes empty text for %s", (_label, secretText) => {
      const { result } = setup();
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(secretText);
      });
      act(() => {
        jest.advanceTimersByTime(250);
      });

      expect(draftOf(chatId)?.text).toBe("");
      // in-memory composer is untouched: the user can still edit and send
      expect(result.current.inputValue).toBe(secretText);
    });

    test("ordinary prose still persists verbatim (guard is conservative)", () => {
      const { result } = setup();
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(INNOCENT_TEXT);
      });
      act(() => {
        jest.advanceTimersByTime(250);
      });

      expect(draftOf(chatId)?.text).toBe(INNOCENT_TEXT);
    });

    test("redacts the text but keeps draft attachments", () => {
      const attachments = [{ id: "att-1", name: "notes.txt" }];
      const { result } = setup(attachments);
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(WRAPPED_SECRET);
      });
      act(() => {
        jest.advanceTimersByTime(250);
      });

      expect(draftOf(chatId)?.text).toBe("");
      // storage normalizes attachment records; identity must survive redaction
      expect(
        (draftOf(chatId)?.attachments || []).map((a) => ({
          id: a.id,
          name: a.name,
        })),
      ).toEqual([{ id: "att-1", name: "notes.txt" }]);
    });

    test("beforeunload tail flush persists empty text, not the secret", () => {
      const { result } = setup();
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(TOKEN_PREFIX_TEXT);
      });
      // no timer advance: the debounce has NOT fired, the tail flush is the
      // only writer here
      act(() => {
        window.dispatchEvent(
          new Event("beforeunload", { bubbles: false, cancelable: true }),
        );
      });

      expect(draftOf(chatId)?.text).toBe("");
    });

    test("unmount flush persists empty text, not the secret", () => {
      const seeded = bootstrapChatsStore();
      markChatStarted(seeded.activeChat.id, { source: "test" });
      const { result, unmount } = setup();
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(ASSIGNMENT_TEXT);
      });
      act(() => {
        unmount();
      });

      expect(draftOf(chatId)?.text).toBe("");
    });

    test("scrubs an already-stored secret draft on mount", () => {
      const seeded = bootstrapChatsStore();
      const chatId = seeded.activeChat.id;
      markChatStarted(chatId, { source: "test" });
      // simulate a draft persisted by a build without this guard
      updateChatDraft(chatId, { text: WRAPPED_SECRET }, { source: "test" });
      expect(draftOf(chatId)?.text).toBe(WRAPPED_SECRET);

      const { result } = setup();

      // storage scrubbed immediately on mount, before any debounce fires
      expect(draftOf(chatId)?.text).toBe("");
      // composer still shows it, so the user does not silently lose their text
      expect(result.current.inputValue).toBe(WRAPPED_SECRET);
    });

    test("scrubs an already-stored secret draft when switching into that chat", async () => {
      const seeded = bootstrapChatsStore();
      const chatAId = seeded.activeChat.id;
      const chatANodeId = findNodeIdByChatId(seeded.store.tree, chatAId);
      markChatStarted(chatAId, { source: "test" });
      const createdB = createChatInSelectedContext(
        { title: "Chat B" },
        { source: "test" },
      );
      markChatStarted(createdB.chatId, { source: "test" });
      updateChatDraft(
        createdB.chatId,
        { text: TOKEN_PREFIX_TEXT },
        { source: "test" },
      );
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

      const { result } = setup();
      expect(draftOf(createdB.chatId)?.text).toBe(TOKEN_PREFIX_TEXT);

      act(() => {
        selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
      });

      await waitFor(() => {
        expect(result.current.activeChatIdRef.current).toBe(createdB.chatId);
      });
      expect(draftOf(createdB.chatId)?.text).toBe("");
    });
  });

  describe("flag OFF is byte-for-byte the pre-guard behavior", () => {
    beforeEach(() => {
      setMemoryV2Flag(false);
    });

    test.each([
      ["explicit {{secret:...}} syntax", WRAPPED_SECRET],
      ["a recognized token prefix", TOKEN_PREFIX_TEXT],
      ["a conservative credential assignment", ASSIGNMENT_TEXT],
      ["ordinary prose", INNOCENT_TEXT],
    ])("debounced persist writes %s verbatim", (_label, text) => {
      const { result } = setup();
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(text);
      });
      act(() => {
        jest.advanceTimersByTime(250);
      });

      expect(draftOf(chatId)?.text).toBe(text);
    });

    test("does not scrub an already-stored secret draft on mount", () => {
      const seeded = bootstrapChatsStore();
      const chatId = seeded.activeChat.id;
      markChatStarted(chatId, { source: "test" });
      updateChatDraft(chatId, { text: WRAPPED_SECRET }, { source: "test" });

      setup();

      expect(draftOf(chatId)?.text).toBe(WRAPPED_SECRET);
    });

    test("beforeunload tail flush writes the text verbatim", () => {
      const { result } = setup();
      const chatId = result.current.activeChatIdRef.current;

      act(() => {
        result.current.setInputValue(TOKEN_PREFIX_TEXT);
      });
      act(() => {
        window.dispatchEvent(
          new Event("beforeunload", { bubbles: false, cancelable: true }),
        );
      });

      expect(draftOf(chatId)?.text).toBe(TOKEN_PREFIX_TEXT);
    });
  });
});

/* DRIFT SENTINEL — keep the hook's local copy in lockstep with the shared
   secret_capture heuristics. A failure here means the two have diverged, not
   that either one is necessarily wrong: re-read secret_capture.js and re-sync
   draftTextLooksSecret. */
describe("draftTextLooksSecret parity with secret_capture heuristics", () => {
  const CORPUS = [
    "",
    "hello world",
    INNOCENT_TEXT,
    "my password is stored in 1Password",
    "set PASSWORD to the value in the vault",
    // eslint-disable-next-line no-template-curly-in-string -- placeholder fixture
    "token: ${MY_TOKEN}",
    "api_key = process.env.OPENAI_KEY",
    "password = your-password-here",
    "secret: xxxxxxx",
    "apikey: redacted",
    WRAPPED_SECRET,
    "{{secret:label}}",
    "{{/secret}}",
    "unterminated {{secret:label}}value",
    TOKEN_PREFIX_TEXT,
    ASSIGNMENT_TEXT,
    "password: abc12345",
    "pwd=Zx9Qw8Er7Ty6",
    'client_secret="a1b2c3d4e5f6"',
    "access-key: AKIAIOSFODNN7EXAMPLE",
    "ghp_abcdefghijklmnopqrstuvwxyz0123",
    "-----BEGIN RSA PRIVATE KEY-----",
    "xoxb-1234567890-abcdefghij",
    "the pwd is short: ab1",
  ];

  test.each(CORPUS.map((text, index) => [index, text]))(
    "case %i agrees with hasSecretCaptureSyntax || detectLikelySecretAssignment",
    (_index, text) => {
      const expected =
        hasSecretCaptureSyntax(text) || detectLikelySecretAssignment(text);
      expect(draftTextLooksSecret(text)).toBe(expected);
    },
  );

  test("is pure across repeated calls (no sticky regex lastIndex)", () => {
    expect(draftTextLooksSecret(ASSIGNMENT_TEXT)).toBe(true);
    expect(draftTextLooksSecret(ASSIGNMENT_TEXT)).toBe(true);
    expect(draftTextLooksSecret(INNOCENT_TEXT)).toBe(false);
    expect(draftTextLooksSecret(ASSIGNMENT_TEXT)).toBe(true);
  });

  test("non-string input is never treated as secret", () => {
    expect(draftTextLooksSecret(undefined)).toBe(false);
    expect(draftTextLooksSecret(null)).toBe(false);
    expect(draftTextLooksSecret(42)).toBe(false);
  });
});
