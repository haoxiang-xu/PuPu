const http = require("http");
const { createServer } = require("../../main/services/test-api/server");
const {
  createCommandRegistry,
} = require("../../main/services/test-api/commands");

const httpRequest = (port, { method = "GET", path = "/", body } = {}) =>
  new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: data
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(data),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          let parsed = null;
          try {
            parsed = JSON.parse(buf.toString());
          } catch (_) {
            // not JSON
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            raw: buf,
          });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });

describe("test-api/server", () => {
  test("starts on 127.0.0.1, dispatches request, returns JSON", async () => {
    const registry = createCommandRegistry();
    registry.register({
      method: "POST",
      path: "/v1/echo",
      handler: async (ctx) => ({ echoed: ctx.body }),
    });
    const server = await createServer({
      registry,
      isReady: () => true,
    });
    const res = await httpRequest(server.port, {
      method: "POST",
      path: "/v1/echo",
      body: { hi: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ echoed: { hi: 1 } });
    await server.close();
  });

  test("returns 503 not_ready before isReady() flips true", async () => {
    let ready = false;
    const registry = createCommandRegistry();
    registry.register({
      method: "GET",
      path: "/v1/x",
      handler: async () => ({ ok: true }),
    });
    const server = await createServer({ registry, isReady: () => ready });
    const res = await httpRequest(server.port, {
      method: "GET",
      path: "/v1/x",
    });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("not_ready");
    ready = true;
    const res2 = await httpRequest(server.port, {
      method: "GET",
      path: "/v1/x",
    });
    expect(res2.status).toBe(200);
    await server.close();
  });

  test("/v1/debug/screenshot bypasses JSON serialization, returns binary", async () => {
    const registry = createCommandRegistry();
    registry.register({
      method: "GET",
      path: "/v1/debug/screenshot",
      handler: async () => ({
        __binary: true,
        contentType: "image/png",
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      }),
    });
    const server = await createServer({ registry, isReady: () => true });
    const res = await httpRequest(server.port, {
      path: "/v1/debug/screenshot",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.raw[0]).toBe(0x89);
    await server.close();
  });

  test("invalid JSON body returns 400", async () => {
    const registry = createCommandRegistry();
    registry.register({
      method: "POST",
      path: "/v1/x",
      handler: async () => ({ ok: true }),
    });
    const server = await createServer({ registry, isReady: () => true });
    const port = server.port;
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/v1/x",
          headers: {
            "content-type": "application/json",
            "content-length": 5,
          },
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () =>
            resolve({
              status: r.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.on("error", reject);
      req.write("not{}");
      req.end();
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
    await server.close();
  });
});
