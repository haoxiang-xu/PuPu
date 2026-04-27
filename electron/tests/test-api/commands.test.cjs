const {
  createCommandRegistry,
} = require("../../main/services/test-api/commands");

describe("test-api/commands", () => {
  test("dispatch routes POST /v1/chats to registered handler", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "POST",
      path: "/v1/chats",
      handler: async (ctx) => ({ chat_id: ctx.body.title }),
    });
    const result = await reg.dispatch({
      method: "POST",
      path: "/v1/chats",
      body: { title: "abc" },
    });
    expect(result).toEqual({ status: 200, body: { chat_id: "abc" } });
  });

  test("dispatch extracts path params {id}", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "DELETE",
      path: "/v1/chats/:id",
      handler: async (ctx) => ({ deleted: ctx.params.id }),
    });
    const result = await reg.dispatch({
      method: "DELETE",
      path: "/v1/chats/c42",
      body: null,
    });
    expect(result.body).toEqual({ deleted: "c42" });
  });

  test("returns 404 when no route matches", async () => {
    const reg = createCommandRegistry();
    const result = await reg.dispatch({
      method: "GET",
      path: "/v1/nope",
      body: null,
    });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("not_found");
  });

  test("validator rejects with 400 invalid_payload", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "POST",
      path: "/v1/x",
      validator: (body) =>
        body && typeof body.text === "string" ? null : "text required",
      handler: async () => ({ ok: true }),
    });
    const result = await reg.dispatch({
      method: "POST",
      path: "/v1/x",
      body: {},
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({
      code: "invalid_payload",
      message: "text required",
    });
  });

  test("handler error becomes 404 with code from err.code", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "GET",
      path: "/v1/boom",
      handler: async () => {
        throw Object.assign(new Error("boom"), {
          code: "chat_not_found",
          status: 404,
        });
      },
    });
    const result = await reg.dispatch({
      method: "GET",
      path: "/v1/boom",
      body: null,
    });
    expect(result.status).toBe(404);
    expect(result.body.error).toMatchObject({
      code: "chat_not_found",
      message: "boom",
    });
  });
});
