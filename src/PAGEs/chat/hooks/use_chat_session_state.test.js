import { act, renderHook, waitFor } from "@testing-library/react";

import {
  bootstrapChatsStore,
  createChatInSelectedContext,
  deleteTreeNodeCascade,
  getChatsStore,
  markChatStarted,
  selectTreeNode,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import { useChatSessionState } from "./use_chat_session_state";

const findNodeIdByChatId = (tree, chatId) =>
  Object.entries(tree.nodesById || {}).find(
    ([, node]) => node?.entity === "chat" && node?.chatId === chatId,
  )?.[0] || null;

describe("useChatSessionState deleted active chat handling", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("does not flush stale draft or stream messages back into a deleted active chat", async () => {
    const activeStreamsRef = { current: new Map() };
    const setDraftAttachments = jest.fn();
    const setStreamError = jest.fn();

    const { result } = renderHook(() =>
      useChatSessionState({
        draftAttachments: [],
        setDraftAttachments,
        activeStreamsRef,
        setStreamError,
      }),
    );

    const oldChatId = result.current.activeChatIdRef.current;
    const oldNodeId = findNodeIdByChatId(getChatsStore().tree, oldChatId);
    activeStreamsRef.current.set(oldChatId, {
      messages: [{ role: "user", content: "stale stream message" }],
    });

    act(() => {
      result.current.setInputValue("stale draft text");
    });

    act(() => {
      deleteTreeNodeCascade({ nodeId: oldNodeId }, { source: "side-menu" });
    });

    await waitFor(() => {
      expect(result.current.activeChatIdRef.current).not.toBe(oldChatId);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    const after = getChatsStore();
    expect(after.chatsById[oldChatId]).toBeUndefined();
    expect(after.lruChatIds).not.toContain(oldChatId);
    expect(findNodeIdByChatId(after.tree, oldChatId)).toBeNull();
  });

  test("keeps each chat's draft isolated during a same-tick A to B to A switch", async () => {
    const seeded = bootstrapChatsStore();
    const chatAId = seeded.activeChat.id;
    const chatANodeId = findNodeIdByChatId(seeded.store.tree, chatAId);
    markChatStarted(chatAId, { source: "test" });
    updateChatDraft(chatAId, { text: "Draft A" }, { source: "test" });
    const createdB = createChatInSelectedContext(
      { title: "Chat B" },
      { source: "test" },
    );
    updateChatDraft(
      createdB.chatId,
      { text: "Draft B" },
      { source: "test" },
    );
    selectTreeNode({ nodeId: chatANodeId }, { source: "test" });

    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        bootstrapped: bootstrapChatsStore(),
        draftAttachments: [],
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );

    act(() => {
      result.current.setInputValue("Newest draft A");
    });

    act(() => {
      selectTreeNode({ nodeId: createdB.nodeId }, { source: "test" });
      selectTreeNode({ nodeId: chatANodeId }, { source: "test" });
    });

    await waitFor(() => {
      expect(result.current.activeChatIdRef.current).toBe(chatAId);
      expect(result.current.inputValue).toBe("Newest draft A");
    });
    expect(getChatsStore().chatsById[chatAId]?.draft?.text).toBe(
      "Newest draft A",
    );
    expect(getChatsStore().chatsById[createdB.chatId]?.draft?.text).toBe(
      "Draft B",
    );
  });
});
