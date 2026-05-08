const EventEmitter = require("events");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  createTestApiService,
} = require("../../main/services/test-api");
const { CHANNELS } = require("../../shared/channels");

const httpRequest = (port, opts = {}) =>
  new Promise((resolve, reject) => {
    const data = opts.body == null ? null : JSON.stringify(opts.body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: opts.method || "GET",
        path: opts.path || "/",
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
          });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });

describe("test-api integration", () => {
  let svc;
  let portFile;
  beforeEach(() => {
    portFile = path.join(
      os.tmpdir(),
      `test-api-port-${Date.now()}-${Math.random()}`,
    );
  });
  afterEach(async () => {
    if (svc) await svc.stop();
    try {
      fs.unlinkSync(portFile);
    } catch (_) {
      // best-effort
    }
  });

  const makeFakeWebContents = (ipcMain) => ({
    send: (channel, payload) => {
      if (channel === CHANNELS.TEST_BRIDGE.INVOKE) {
        setImmediate(() => {
          if (payload.command === "createChat") {
            ipcMain.emit(
              CHANNELS.TEST_BRIDGE.RESULT,
              {},
              {
                requestId: payload.requestId,
                ok: true,
                data: { chat_id: "test-chat" },
              },
            );
          } else {
            ipcMain.emit(
              CHANNELS.TEST_BRIDGE.RESULT,
              {},
              {
                requestId: payload.requestId,
                ok: false,
                error: { code: "no_handler", message: "no handler" },
              },
            );
          }
        });
      }
    },
  });

  test("end-to-end: server starts, write port file, handshake gates, command roundtrip", async () => {
    const ipcMain = new EventEmitter();
    const fakeWc = makeFakeWebContents(ipcMain);
    svc = createTestApiService({
      env: { NODE_ENV: "development" },
      ipcMain,
      portFilePath: portFile,
    });
    await svc.start({ webContents: fakeWc });
    expect(fs.existsSync(portFile)).toBe(true);
    const { port } = JSON.parse(fs.readFileSync(portFile, "utf8"));

    // Before READY: 503
    const r1 = await httpRequest(port, {
      method: "POST",
      path: "/v1/chats",
      body: { title: "x" },
    });
    expect(r1.status).toBe(503);

    // Renderer fires READY
    ipcMain.emit(CHANNELS.TEST_BRIDGE.READY, {});

    // After READY: roundtrip works
    const r2 = await httpRequest(port, {
      method: "POST",
      path: "/v1/chats",
      body: { title: "x" },
    });
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ chat_id: "test-chat" });
  });

  test("does not start when NODE_ENV=production", async () => {
    const ipcMain = new EventEmitter();
    svc = createTestApiService({
      env: { NODE_ENV: "production" },
      ipcMain,
      portFilePath: portFile,
    });
    await svc.start({ webContents: makeFakeWebContents(ipcMain) });
    expect(fs.existsSync(portFile)).toBe(false);
    expect(svc.getPort()).toBe(null);
  });

  test("does not start when PUPU_TEST_API_DISABLE=1", async () => {
    const ipcMain = new EventEmitter();
    svc = createTestApiService({
      env: { NODE_ENV: "development", PUPU_TEST_API_DISABLE: "1" },
      ipcMain,
      portFilePath: portFile,
    });
    await svc.start({ webContents: makeFakeWebContents(ipcMain) });
    expect(svc.getPort()).toBe(null);
  });
});
