import { act, renderHook } from "@testing-library/react";

import {
  getChatsStore,
  createChatInSelectedContext,
  selectTreeNode,
  setChatMessages,
  setChatModel,
  setChatSessionBundle,
  setChatTitle,
} from "../../../SERVICEs/chat_storage";
import { buildTreeNodeLookupByChatId } from "../../../SERVICEs/chat_storage/chat_storage_tree";
import { useChatSessionState } from "./use_chat_session_state";

/* What the composer has chosen, between choosing it and storing it (#356).
 *
 * The five composer selections — toolkits, agent orchestration, workspaces,
 * the legacy Recipe name and the Skeleton Agent id — share one debounced
 * write: a whole-store persist on every toolkit checkbox would stall the
 * click, so the write waits 150ms. For those 150ms the choice lives only in
 * React state, and `reconcileStoreSnapshot` re-applies the stored row to all
 * five whenever any OTHER writer touches this chat. Renaming the current chat
 * in the side menu right after picking an Agent was enough to put the choice
 * back to what it had been — silently, since the row it reads is a perfectly
 * valid one.
 *
 * So the question this suite owns is not "does it persist" but "whose value
 * wins while nothing has been persisted yet": an unrelated write must not
 * revert a choice, and a writer that really did change these fields must
 * still win. A chat keeps its own choice throughout, and nothing is allowed
 * to land on Default without someone choosing it.
 */

describe("the composer's selections inside the debounce window", () => {
  const EMPTY_ATTACHMENTS = [];

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

  const setup = () => {
    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        draftAttachments: EMPTY_ATTACHMENTS,
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );
    return { result, activeStreamsRef };
  };

  const storedBundle = (chatId) => {
    const chat = getChatsStore().chatsById[chatId] || {};
    return {
      selectedToolkits: chat.selectedToolkits,
      selectedRecipeName: chat.selectedRecipeName,
      selectedSkeletonAgentId: chat.selectedSkeletonAgentId,
      selectedWorkspaceIds: chat.selectedWorkspaceIds,
    };
  };

  const shownBundle = (result) => ({
    selectedToolkits: result.current.selectedToolkits,
    selectedRecipeName: result.current.selectedRecipeName,
    selectedSkeletonAgentId: result.current.selectedSkeletonAgentId,
    selectedWorkspaceIds: result.current.selectedWorkspaceIds,
  });

  const choose = (result) => {
    act(() => {
      result.current.setSelectedSkeletonAgentId("research.agent:v2");
      result.current.setSelectedToolkits(["core", "web_search"]);
      result.current.setSelectedWorkspaceIds(["ws-1"]);
    });
  };

  const CHOSEN = {
    selectedToolkits: ["core", "web_search"],
    selectedRecipeName: "Default",
    selectedSkeletonAgentId: "research.agent:v2",
    selectedWorkspaceIds: ["ws-1"],
  };

  /* An unrelated write by another part of the app, which is what the side menu
     does when the current chat is renamed. It is NOT a bundle write: the five
     fields are untouched by it. */
  const renameFromSideMenu = (chatId, label) => {
    act(() => {
      setChatTitle(chatId, label, { source: "side-menu" });
    });
  };

  test("an unrelated write to this chat does not revert an unstored choice", () => {
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    choose(result);
    /* Nothing is in the store yet — that is the window under test. */
    expect(storedBundle(chatId).selectedSkeletonAgentId).toBe("");

    renameFromSideMenu(chatId, "Renamed while choosing");

    expect(shownBundle(result)).toEqual(CHOSEN);
    expect(getChatsStore().chatsById[chatId].title).toBe(
      "Renamed while choosing",
    );
    /* And the write still happens when the window closes. */
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(storedBundle(chatId)).toEqual(CHOSEN);
  });

  test("the legacy Recipe name survives the same window", () => {
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    act(() => {
      result.current.setSelectedRecipeName("Legacy Other");
    });
    renameFromSideMenu(chatId, "Renamed with a Recipe chosen");
    expect(result.current.selectedRecipeName).toBe("Legacy Other");
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(storedBundle(chatId).selectedRecipeName).toBe("Legacy Other");
  });

  test("a writer that really changed these fields still wins", () => {
    /* The other half of the rule: this is not "the composer always wins".
       Someone else writing the bundle for this chat — the Test API, another
       window — is an authority on it, and the composer has to follow. */
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    choose(result);
    act(() => {
      setChatSessionBundle(
        chatId,
        {
          selectedToolkits: ["core"],
          selectedRecipeName: "Default",
          selectedSkeletonAgentId: "another.agent",
          selectedWorkspaceIds: [],
        },
        { source: "test-api" },
      );
    });
    expect(shownBundle(result)).toEqual({
      selectedToolkits: ["core"],
      selectedRecipeName: "Default",
      selectedSkeletonAgentId: "another.agent",
      selectedWorkspaceIds: [],
    });
    /* And the dropped choice does not come back when the timer fires. */
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(storedBundle(chatId).selectedSkeletonAgentId).toBe("another.agent");
    expect(result.current.selectedSkeletonAgentId).toBe("another.agent");
  });

  test("switching chats inside the window keeps each chat's own choice", () => {
    const { result } = setup();
    const first = result.current.activeChatIdRef.current;
    choose(result);

    let second = "";
    act(() => {
      second = createChatInSelectedContext(
        { title: "Second" },
        { source: "side-menu" },
      ).chatId;
    });
    act(() => {
      const lookup = buildTreeNodeLookupByChatId(getChatsStore().tree);
      selectTreeNode({ nodeId: lookup[second] }, { source: "side-menu" });
    });

    /* The chat that was left keeps what was chosen in it — the pending write
       is flushed rather than dropped — and the chat that was entered shows its
       own empty selection rather than the previous chat's. */
    expect(storedBundle(first)).toEqual(CHOSEN);
    /* `["core"]` is what a new chat starts with, not a leftover: the point is
       that none of the first chat's choices came along. */
    expect(shownBundle(result)).toEqual({
      selectedToolkits: ["core"],
      selectedRecipeName: "Default",
      selectedSkeletonAgentId: "",
      selectedWorkspaceIds: [],
    });

    act(() => {
      const lookup = buildTreeNodeLookupByChatId(getChatsStore().tree);
      selectTreeNode({ nodeId: lookup[first] }, { source: "side-menu" });
    });
    expect(shownBundle(result)).toEqual(CHOSEN);
    expect(storedBundle(second).selectedSkeletonAgentId).toBe("");
  });

  test("closing the page inside the window stores the choice", () => {
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    choose(result);
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(storedBundle(chatId)).toEqual(CHOSEN);
  });

  test("unmounting inside the window stores the choice", () => {
    const activeStreamsRef = { current: new Map() };
    const { result, unmount } = renderHook(() =>
      useChatSessionState({
        draftAttachments: EMPTY_ATTACHMENTS,
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );
    const chatId = result.current.activeChatIdRef.current;
    choose(result);
    act(() => {
      unmount();
    });
    expect(storedBundle(chatId)).toEqual(CHOSEN);
  });

  test("an unrelated write in the same commit does not revert the choice", () => {
    /* The narrower window: the choice and the other writer land in ONE commit,
       so the debounced write has not even been recorded yet. What the hook
       knows is the bundle the store held when it was last in sync with it, and
       this row still has exactly that bundle — so it carries no news about
       these five fields. */
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => {
      result.current.setSelectedSkeletonAgentId("research.agent:v2");
      setChatTitle(chatId, "renamed in the same commit", {
        source: "side-menu",
      });
    });
    expect(result.current.selectedSkeletonAgentId).toBe("research.agent:v2");
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(storedBundle(chatId).selectedSkeletonAgentId).toBe(
      "research.agent:v2",
    );
  });

  test("an external bundle write in the same commit still wins", () => {
    /* The counter-direction of the case above, so "keep the local value" is
       not what this always does. */
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => {
      result.current.setSelectedSkeletonAgentId("my.choice");
      setChatSessionBundle(
        chatId,
        { selectedSkeletonAgentId: "their.choice" },
        { source: "test-api" },
      );
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(result.current.selectedSkeletonAgentId).toBe("their.choice");
    expect(storedBundle(chatId).selectedSkeletonAgentId).toBe("their.choice");
  });

  test("a message write and a model write to this chat are unrelated too", () => {
    /* Not only renames: any writer that touches this chat used to re-apply all
       five fields. These two are the ones that happen while a person is
       actually using the composer. */
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    choose(result);
    act(() => {
      setChatMessages(
        chatId,
        [{ id: "m-1", role: "user", content: "hi" }],
        { source: "test-api" },
      );
    });
    expect(shownBundle(result)).toEqual(CHOSEN);
    act(() => {
      setChatModel(chatId, { id: "openai:gpt-5" }, { source: "test-api" });
    });
    expect(shownBundle(result)).toEqual(CHOSEN);
    /* The model itself did arrive — this is not "ignore that writer". */
    expect(result.current.selectedModelId).toBe("openai:gpt-5");
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(storedBundle(chatId)).toEqual(CHOSEN);
  });

  test("a fast A to B and back keeps each chat's own choice", () => {
    const { result } = setup();
    const first = result.current.activeChatIdRef.current;
    choose(result);
    let second = "";
    act(() => {
      second = createChatInSelectedContext(
        { title: "Second" },
        { source: "side-menu" },
      ).chatId;
    });
    /* Both switches inside one commit, which is the A to B to A the draft
       path already has to survive. */
    act(() => {
      const lookup = buildTreeNodeLookupByChatId(getChatsStore().tree);
      selectTreeNode({ nodeId: lookup[second] }, { source: "side-menu" });
      result.current.setSelectedRecipeName("Legacy Other");
      selectTreeNode({ nodeId: lookup[first] }, { source: "side-menu" });
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(storedBundle(first)).toEqual(CHOSEN);
    expect(shownBundle(result)).toEqual(CHOSEN);
    /* Whatever the fast detour recorded for B, it is not A's choice and A's is
       not B's. */
    expect(storedBundle(second).selectedSkeletonAgentId).toBe("");
    expect(storedBundle(second).selectedToolkits).not.toEqual(
      CHOSEN.selectedToolkits,
    );
  });

  test("a new window reads the choice back after the page closed", () => {
    /* A real cold read: the page closes inside the window, and a fresh module
       graph bootstraps from the serialized data, which is what the next launch
       does. */
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    choose(result);
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    jest.resetModules();
    // eslint-disable-next-line global-require
    const reopened = require("../../../SERVICEs/chat_storage");
    reopened.bootstrapChatsStore();
    const chat = reopened.getChatsStore().chatsById[chatId];
    expect({
      selectedToolkits: chat.selectedToolkits,
      selectedRecipeName: chat.selectedRecipeName,
      selectedSkeletonAgentId: chat.selectedSkeletonAgentId,
      selectedWorkspaceIds: chat.selectedWorkspaceIds,
    }).toEqual(CHOSEN);
  });

  test("a chat that chose nothing simply follows the store", () => {
    /* The control for the whole rule: with nothing unstored, an external
       bundle write is applied as it always was. */
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => {
      setChatSessionBundle(
        chatId,
        {
          selectedToolkits: ["core", "web_search"],
          selectedRecipeName: "Legacy Other",
          selectedSkeletonAgentId: "someone.elses.agent",
          selectedWorkspaceIds: ["ws-9"],
        },
        { source: "test-api" },
      );
    });
    expect(shownBundle(result)).toEqual({
      selectedToolkits: ["core", "web_search"],
      selectedRecipeName: "Legacy Other",
      selectedSkeletonAgentId: "someone.elses.agent",
      selectedWorkspaceIds: ["ws-9"],
    });
  });
});
