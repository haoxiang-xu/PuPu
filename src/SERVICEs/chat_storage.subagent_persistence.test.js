import {
  getChatsStore,
  setChatMessages,
} from "./chat_storage";

describe("chat_storage subagent persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("persists assistant subagent timelines across storage reloads", () => {
    const initialStore = getChatsStore();
    const chatId = initialStore.activeChatId;

    setChatMessages(
      chatId,
      [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          status: "done",
          createdAt: 1000,
          updatedAt: 2000,
          traceFrames: [
            {
              seq: 1,
              ts: 1000,
              type: "tool_call",
              stage: "agent",
              payload: {
                call_id: "call-1",
                tool_name: "delegate_to_subagent",
              },
            },
          ],
          subagentFrames: {
            "child-run-1": [
              {
                seq: 1,
                ts: 1100,
                type: "final_message",
                stage: "model",
                payload: {
                  content: "Nested subagent response",
                },
              },
            ],
          },
          subagentMetaByRunId: {
            "child-run-1": {
              subagentId: "developer.analyzer.1",
              mode: "delegate",
              template: "analyzer",
              batchId: "",
              parentId: "developer",
              lineage: ["developer", "developer.analyzer.1"],
              status: "completed",
            },
          },
        },
      ],
      { source: "test" },
    );

    const reloadedStore = getChatsStore();
    const persistedMessage = reloadedStore.chatsById[chatId].messages[0];

    expect(persistedMessage.subagentFrames).toEqual({
      "child-run-1": [
        expect.objectContaining({
          type: "final_message",
          payload: expect.objectContaining({
            content: "Nested subagent response",
          }),
        }),
      ],
    });
    expect(persistedMessage.subagentMetaByRunId).toEqual({
      "child-run-1": {
        subagentId: "developer.analyzer.1",
        mode: "delegate",
        template: "analyzer",
        batchId: "",
        parentId: "developer",
        lineage: ["developer", "developer.analyzer.1"],
        status: "completed",
      },
    });
  });
});
