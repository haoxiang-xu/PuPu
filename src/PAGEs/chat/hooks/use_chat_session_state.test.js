import { act, renderHook, waitFor } from "@testing-library/react";

import {
  bootstrapChatsStore,
  createChatInSelectedContext,
  deleteTreeNodeCascade,
  getChatsStore,
  markChatStarted,
  selectTreeNode,
  setChatModel,
  setChatSelectedToolkits,
  setChatSessionBundle,
  setChatSystemPromptOverrides,
  setChatThreadId,
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

  test("reconciles a canonical chat switch that happened before the subscription mounted", async () => {
    const seeded = bootstrapChatsStore();
    const chatAId = seeded.activeChat.id;
    markChatStarted(chatAId, { source: "test" });
    const staleBootstrap = bootstrapChatsStore();

    const createdB = createChatInSelectedContext(
      { title: "Chat B" },
      { source: "test-api" },
    );
    updateChatDraft(
      createdB.chatId,
      { text: "Draft from canonical B" },
      { source: "test-api" },
    );
    setChatModel(
      createdB.chatId,
      { id: "openai:gpt-5.2-codex" },
      { source: "test-api" },
    );

    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        bootstrapped: staleBootstrap,
        draftAttachments: [],
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.activeChatId).toBe(createdB.chatId);
    });
    expect(result.current.activeChatIdRef.current).toBe(createdB.chatId);
    expect(result.current.inputValue).toBe("Draft from canonical B");
    expect(result.current.selectedModelId).toBe("openai:gpt-5.2-codex");
  });

  test("synchronizes external run configuration updates for the active chat", async () => {
    const bootstrapped = bootstrapChatsStore();
    const chatId = bootstrapped.activeChat.id;
    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        bootstrapped,
        draftAttachments: [],
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );

    act(() => {
      setChatModel(chatId, { id: "openai:gpt-5.2-codex" }, { source: "test-api" });
      setChatThreadId(chatId, "thread-exact", { source: "test-api" });
      setChatSelectedToolkits(chatId, ["toolkit.exact"], {
        source: "test-api",
      });
      setChatSessionBundle(
        chatId,
        {
          selectedToolkits: ["toolkit.exact"],
          selectedWorkspaceIds: ["workspace-exact"],
          selectedRecipeName: "Recipe Exact",
          agentOrchestration: { mode: "developer_waiting_approval" },
        },
        { source: "test-api" },
      );
      setChatSystemPromptOverrides(
        chatId,
        { rules: "exact override" },
        { source: "test-api" },
      );
    });

    await waitFor(() => {
      expect(result.current.selectedModelId).toBe("openai:gpt-5.2-codex");
      expect(result.current.modelIdRef.current).toBe("openai:gpt-5.2-codex");
      expect(result.current.threadIdRef.current).toBe("thread-exact");
      expect(result.current.selectedToolkits).toEqual(["toolkit.exact"]);
      expect(result.current.selectedWorkspaceIds).toEqual([
        "workspace-exact",
      ]);
      expect(result.current.selectedRecipeName).toBe("Recipe Exact");
      expect(result.current.agentOrchestration).toEqual({
        mode: "developer_waiting_approval",
      });
      expect(result.current.systemPromptOverridesRef.current).toEqual({
        rules: "exact override",
      });
    });
  });

  test("does not flush a stale deferred session bundle over an external update during a chat switch", async () => {
    const bootstrapped = bootstrapChatsStore();
    const chatAId = bootstrapped.activeChat.id;
    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        bootstrapped,
        draftAttachments: [],
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );

    let createdB;
    act(() => {
      setChatSelectedToolkits(chatAId, ["toolkit.exact"], {
        source: "test-api",
      });
      createdB = createChatInSelectedContext(
        { title: "Chat B" },
        { source: "test-api" },
      );
    });

    await waitFor(() => {
      expect(result.current.activeChatId).toBe(createdB.chatId);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(getChatsStore().chatsById[chatAId].selectedToolkits).toEqual([
      "toolkit.exact",
    ]);
  });

  test("persists a local session edit after rebasing an externally synchronized bundle", async () => {
    const bootstrapped = bootstrapChatsStore();
    const chatId = bootstrapped.activeChat.id;
    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        bootstrapped,
        draftAttachments: [],
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );

    act(() => {
      setChatSelectedToolkits(chatId, ["toolkit.external"], {
        source: "test-api",
      });
    });
    await waitFor(() => {
      expect(result.current.selectedToolkits).toEqual(["toolkit.external"]);
    });

    act(() => {
      result.current.setSelectedToolkits(["toolkit.local"]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(getChatsStore().chatsById[chatId].selectedToolkits).toEqual([
      "toolkit.local",
    ]);
  });
});
