/** @jest-environment jsdom */

describe("chat storage interrupted trace admission and reload", () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI;
  });

  test("keeps exact message/frame outer keys, open bounded payload data, and nested identity after reload", () => {
    const storage = require("./chat_storage/chat_storage_store");
    const chatId = storage.getChatsStore().activeChatId;
    const rootFrame = {
      seq: 4,
      ts: 400,
      run_id: "root-run-384",
      type: "tool_call",
      unknown_frame_field: "drop this closed-boundary member",
      payload: {
        call_id: "root-call-384",
        tool_name: "read_file",
        arguments: { path: "root.txt" },
        content: "x".repeat(8001),
        supported_payload_extension: { keep: "this open-boundary extension" },
      },
    };
    const childFrame = {
      seq: 9,
      ts: 900,
      run_id: "worker-run-384",
      type: "tool_call",
      payload: {
        call_id: "child-call-384",
        tool_name: "search",
        arguments: { query: "child" },
        supported_payload_extension: "child-extension",
      },
    };

    storage.setChatMessages(chatId, [
      { id: "user-384", role: "user", content: "inspect", createdAt: 100, unknown_user_key: true },
      {
        id: "assistant-384",
        role: "assistant",
        status: "cancelled",
        content: "",
        createdAt: 101,
        updatedAt: 102,
        traceFrames: [rootFrame],
        subagentFrames: { "worker-run-384": [childFrame] },
        unknown_assistant_key: true,
      },
    ], { source: "test" });

    const inMemoryAssistant = storage.getChatMessages(chatId).find((message) => message.id === "assistant-384");
    expect(Object.keys(inMemoryAssistant).sort()).toEqual([
      "content", "createdAt", "id", "role", "status", "subagentFrames", "traceFrames", "updatedAt",
    ]);
    expect(Object.keys(inMemoryAssistant.traceFrames[0]).sort()).toEqual([
      "payload", "run_id", "seq", "ts", "type",
    ]);
    expect(inMemoryAssistant.traceFrames[0].payload.content).toHaveLength(8000);
    expect(inMemoryAssistant.traceFrames[0].payload.supported_payload_extension).toEqual({
      keep: "this open-boundary extension",
    });
    expect(inMemoryAssistant.subagentFrames["worker-run-384"][0].payload.call_id).toBe("child-call-384");

    jest.resetModules();
    const coldStorage = require("./chat_storage/chat_storage_store");
    const restoredMessages = coldStorage.getChatMessages(chatId);
    const restoredAssistant = restoredMessages.find((message) => message.id === "assistant-384");

    expect(restoredMessages.map((message) => message.id)).toEqual(["user-384", "assistant-384"]);
    expect(restoredAssistant.status).toBe("cancelled");
    expect(restoredAssistant.content).toBe("");
    expect(restoredAssistant.traceFrames[0].payload.call_id).toBe("root-call-384");
    expect(restoredAssistant.traceFrames[0].payload.content).toHaveLength(8000);
    expect(restoredAssistant.subagentFrames["worker-run-384"][0].payload.call_id).toBe("child-call-384");
    expect(Object.keys(restoredAssistant).sort()).toEqual([
      "content", "createdAt", "id", "role", "status", "subagentFrames", "traceFrames", "updatedAt",
    ]);
  });
});
