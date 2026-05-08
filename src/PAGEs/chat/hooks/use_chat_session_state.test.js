import { act, renderHook, waitFor } from "@testing-library/react";

import {
  deleteTreeNodeCascade,
  getChatsStore,
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
});
