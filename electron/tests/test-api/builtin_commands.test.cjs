const {
  registerBuiltinCommands,
} = require("../../main/services/test-api/builtin_commands");
const {
  createCommandRegistry,
} = require("../../main/services/test-api/commands");

describe("test-api builtin chat run commands", () => {
  const makeHarness = () => {
    const registry = createCommandRegistry();
    const bridge = {
      invoke: jest.fn(async (command, payload) => ({ command, payload })),
    };
    registerBuiltinCommands({
      registry,
      bridge,
      logs: { tail: jest.fn(() => []) },
      getMainWindow: jest.fn(() => null),
      electron: { BrowserWindow: { getFocusedWindow: jest.fn(() => null) } },
    });
    return { registry, bridge };
  };

  test("forwards the path chat id to both blocking messages and async start", async () => {
    const { registry, bridge } = makeHarness();

    const blocking = await registry.dispatch({
      method: "POST",
      path: "/v1/chats/chat-a/messages",
      body: { id: "body-impostor", text: "hello" },
      query: {},
    });
    const started = await registry.dispatch({
      method: "POST",
      path: "/v1/chats/chat-b/runs",
      body: { id: "body-impostor", text: "long run" },
      query: {},
    });

    expect(blocking.status).toBe(200);
    expect(started.status).toBe(200);
    expect(bridge.invoke).toHaveBeenNthCalledWith(
      1,
      "sendMessage",
      { id: "chat-a", text: "hello" },
      { timeout: 5 * 60 * 1000 },
    );
    expect(bridge.invoke).toHaveBeenNthCalledWith(
      2,
      "startChatRun",
      { id: "chat-b", text: "long run" },
      { timeout: 60 * 1000 },
    );
  });

  test("forwards exact chat and path attempt ids to status and cancel", async () => {
    const { registry, bridge } = makeHarness();

    const status = await registry.dispatch({
      method: "GET",
      path: "/v1/chats/chat-a/runs/attempt-a",
      body: null,
      query: {},
    });
    const cancelled = await registry.dispatch({
      method: "POST",
      path: "/v1/chats/chat-a/runs/attempt-a/cancel",
      body: {
        id: "body-impostor",
        attempt_id: "attempt-impostor",
        reason: "test",
      },
      query: {},
    });

    expect(status.status).toBe(200);
    expect(cancelled.status).toBe(200);
    expect(bridge.invoke).toHaveBeenNthCalledWith(1, "getChatRun", {
      id: "chat-a",
      attempt_id: "attempt-a",
    });
    expect(bridge.invoke).toHaveBeenNthCalledWith(2, "cancelChatRun", {
      id: "chat-a",
      attempt_id: "attempt-a",
      reason: "test",
    });
  });

  test("maps exact-addressing failures to fail-closed HTTP statuses", async () => {
    const registry = createCommandRegistry();
    const bridge = {
      invoke: jest.fn(async (command) => {
        const code =
          command === "startChatRun" ? "chat_not_active" : "attempt_mismatch";
        throw Object.assign(new Error(code), { code });
      }),
    };
    registerBuiltinCommands({
      registry,
      bridge,
      logs: { tail: jest.fn(() => []) },
      getMainWindow: jest.fn(() => null),
      electron: { BrowserWindow: { getFocusedWindow: jest.fn(() => null) } },
    });

    const wrongChat = await registry.dispatch({
      method: "POST",
      path: "/v1/chats/chat-a/runs",
      body: { text: "hello" },
      query: {},
    });
    const wrongAttempt = await registry.dispatch({
      method: "POST",
      path: "/v1/chats/chat-a/runs/attempt-b/cancel",
      body: null,
      query: {},
    });

    expect(wrongChat).toMatchObject({
      status: 409,
      body: { error: { code: "chat_not_active" } },
    });
    expect(wrongAttempt).toMatchObject({
      status: 409,
      body: { error: { code: "attempt_mismatch" } },
    });
  });
});
