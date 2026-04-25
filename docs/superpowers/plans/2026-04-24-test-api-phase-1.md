# PuPu Test API — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dev-only HTTP REST endpoint on Electron main that lets Claude Code drive PuPu (create chats, switch model/toolkit/character, send messages, read logs/state/screenshots) so it can run end-to-end regression tests with full UI sync.

**Architecture:** New `electron/main/services/test-api/` module starts a 127.0.0.1 HTTP server (dev only). Each request is dispatched as a command, forwarded over IPC to the renderer, where `src/SERVICEs/test_bridge/` invokes real React/service code so PuPu's UI updates exactly as if a human clicked. Eval/screenshot use Electron's native `webContents` APIs. Logs are collected via console patching (renderer) and stdout patching (main) into a ring buffer in main.

**Tech Stack:** Node `http` (no Express), Electron IPC, React 19 hooks, existing `chat_storage` + `unchainAPI` services. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-04-24-test-api-design.md`

**User commit policy:** **DO NOT run `git commit` yourself.** Each "Commit" step is a checkpoint — stage the relevant files with `git add`, then **stop and ask the user** to review and commit.

---

## File Structure

### New files

```
electron/main/services/test-api/
├─ index.js                       lifecycle, gate, port-file
├─ server.js                      Node http server + tiny router
├─ commands.js                    command table + dispatch
├─ bridge.js                      IPC invoke main↔renderer (requestId pairing)
└─ logs.js                        ring buffer + stdout patch + tail()

electron/preload/test_bridge_preload.js     window.__pupuTestBridge

electron/tests/test-api/
├─ logs.test.js
├─ logs.test.cjs                   mirror
├─ bridge.test.js
├─ bridge.test.cjs
├─ commands.test.js
├─ commands.test.cjs
├─ server.test.js
├─ server.test.cjs
├─ integration.test.js
└─ integration.test.cjs

src/SERVICEs/test_bridge/
├─ index.js                       console patch + load handlers + markReady
├─ state_selector.js              read chat_storage + ConfigContext + modal registry
└─ handlers/
    ├─ chat.js                    create/list/activate/rename/delete
    ├─ catalog.js                 list models/toolkits/characters + select
    ├─ debug.js                   getStateSnapshot
    └─ message_register.js        helper used by ChatInterface to register sendMessage

src/SERVICEs/test_bridge/handlers/chat.test.js
src/SERVICEs/test_bridge/handlers/catalog.test.js
src/SERVICEs/test_bridge/state_selector.test.js

src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.js
src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.test.js

scripts/test-api/client.mjs                  port discovery + retry helper
scripts/test-api/smoke.mjs                   end-to-end smoke

docs/api-reference/test-api.md               endpoint + curl examples
docs/conventions/test-api.md                 how to add a new endpoint / modal
```

### Modified files

```
electron/shared/channels.js           add TEST_BRIDGE channels
electron/preload/index.js             load test_bridge_preload (dev only)
electron/main/index.js                wire createTestApiService + before-quit stop
src/App.js                            build-time guarded require('./SERVICEs/test_bridge')
src/PAGEs/chat/chat.js                ChatInterface useEffect register sendMessage / cancel
<each modal component>                add useModalLifecycle('id', isOpen)
CLAUDE.md                             one-line pointer to docs/api-reference/test-api.md
```

---

## Task ordering rationale

Tasks 1–6 build the main-side server bottom-up (logs → bridge → commands → server → lifecycle) so each unit can be tested in isolation. Tasks 7–9 wire it into the running app. Tasks 10–16 build the renderer side. Task 17 handles the one component-source handler (sendMessage). Task 18 is a cross-cutting modal scan. Tasks 19–20 add tooling. Tasks 21–22 are docs. Task 23 verifies prod cleanliness.

---

## Task 1: Add IPC channels

**Files:**
- Modify: `electron/shared/channels.js`

- [ ] **Step 1.1: Open `electron/shared/channels.js` and read the existing `CHANNELS` object structure**

The file is a `module.exports = { CHANNELS }` where `CHANNELS` is an `Object.freeze` of grouped channel constants (e.g., `CHANNELS.UNCHAIN.STREAM_EVENT`).

- [ ] **Step 1.2: Add the `TEST_BRIDGE` group inside `CHANNELS`**

Insert after the `SCREENSHOT` block, before the closing `})`:

```js
TEST_BRIDGE: Object.freeze({
  INVOKE: "test-bridge:invoke",
  RESULT: "test-bridge:result",
  LOG: "test-bridge:log",
  EVENT: "test-bridge:event",
  READY: "test-bridge:ready",
}),
```

- [ ] **Step 1.3: Verify**

Run: `node -e "console.log(require('./electron/shared/channels').CHANNELS.TEST_BRIDGE)"`
Expected: `{ INVOKE: 'test-bridge:invoke', RESULT: 'test-bridge:result', LOG: 'test-bridge:log', EVENT: 'test-bridge:event', READY: 'test-bridge:ready' }`

- [ ] **Step 1.4: Stage and pause for user commit**

```bash
git add electron/shared/channels.js
```
Stop. Tell the user: "Channels added — please review the diff and commit when ready."

---

## Task 2: Logs ring buffer module

**Files:**
- Create: `electron/main/services/test-api/logs.js`
- Test: `electron/tests/test-api/logs.test.js` (+ `.cjs` mirror)

- [ ] **Step 2.1: Write the failing test**

Create `electron/tests/test-api/logs.test.js`:

```js
const { createLogStore } = require("../../main/services/test-api/logs");

describe("test-api/logs", () => {
  test("ring buffer keeps last N entries per source", () => {
    const store = createLogStore({ capacity: 3 });
    for (let i = 0; i < 5; i++) store.push({ ts: i, level: "log", source: "renderer", msg: `m${i}` });
    expect(store.tail({ source: "renderer", n: 10 })).toEqual([
      { ts: 2, level: "log", source: "renderer", msg: "m2" },
      { ts: 3, level: "log", source: "renderer", msg: "m3" },
      { ts: 4, level: "log", source: "renderer", msg: "m4" },
    ]);
  });

  test("tail filters by since (exclusive)", () => {
    const store = createLogStore({ capacity: 5 });
    store.push({ ts: 100, level: "log", source: "main", msg: "a" });
    store.push({ ts: 200, level: "log", source: "main", msg: "b" });
    expect(store.tail({ source: "main", since: 100 })).toEqual([
      { ts: 200, level: "log", source: "main", msg: "b" },
    ]);
  });

  test("each source has its own buffer", () => {
    const store = createLogStore({ capacity: 2 });
    store.push({ ts: 1, source: "renderer", level: "log", msg: "r" });
    store.push({ ts: 2, source: "main", level: "log", msg: "m" });
    expect(store.tail({ source: "renderer" })).toHaveLength(1);
    expect(store.tail({ source: "main" })).toHaveLength(1);
  });

  test("patchStdout intercepts process.stdout.write but still calls original", () => {
    const writes = [];
    const fakeStdout = { write: (chunk) => { writes.push(String(chunk)); return true; } };
    const store = createLogStore({ capacity: 10 });
    const restore = store.patchStream(fakeStdout, "main", "log");
    fakeStdout.write("hello");
    expect(writes).toEqual(["hello"]);
    expect(store.tail({ source: "main" })).toEqual([
      expect.objectContaining({ source: "main", level: "log", msg: "hello" }),
    ]);
    restore();
    fakeStdout.write("after");
    expect(store.tail({ source: "main" })).toHaveLength(1);
  });
});
```

- [ ] **Step 2.2: Verify test fails**

Run: `npx jest electron/tests/test-api/logs.test.js`
Expected: FAIL with `Cannot find module '../../main/services/test-api/logs'`

- [ ] **Step 2.3: Create `electron/main/services/test-api/logs.js`**

```js
const createLogStore = ({ capacity = 2000 } = {}) => {
  const buffers = new Map();

  const getBuf = (source) => {
    let buf = buffers.get(source);
    if (!buf) {
      buf = [];
      buffers.set(source, buf);
    }
    return buf;
  };

  const push = (entry) => {
    const buf = getBuf(entry.source);
    buf.push(entry);
    if (buf.length > capacity) buf.shift();
  };

  const tail = ({ source, n = 200, since } = {}) => {
    const buf = buffers.get(source) || [];
    let out = buf;
    if (typeof since === "number") {
      out = out.filter((e) => e.ts > since);
    }
    return out.slice(-n);
  };

  const patchStream = (stream, source, level) => {
    const orig = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => {
      try {
        push({ ts: Date.now(), level, source, msg: typeof chunk === "string" ? chunk : chunk.toString() });
      } catch {}
      return orig(chunk, ...rest);
    };
    return () => { stream.write = orig; };
  };

  return { push, tail, patchStream };
};

module.exports = { createLogStore };
```

- [ ] **Step 2.4: Verify test passes**

Run: `npx jest electron/tests/test-api/logs.test.js`
Expected: PASS (4 tests)

- [ ] **Step 2.5: Mirror as `.cjs`**

Copy `electron/tests/test-api/logs.test.js` to `electron/tests/test-api/logs.test.cjs`. The contents are byte-identical (this codebase keeps `.js`/`.cjs` mirrors per its existing convention; check `electron/tests/` for examples).

Run: `npx jest electron/tests/test-api/logs.test.cjs`
Expected: PASS

- [ ] **Step 2.6: Stage and pause for user commit**

```bash
git add electron/main/services/test-api/logs.js electron/tests/test-api/logs.test.js electron/tests/test-api/logs.test.cjs
```

---

## Task 3: IPC bridge module (main ↔ renderer invoke)

**Files:**
- Create: `electron/main/services/test-api/bridge.js`
- Test: `electron/tests/test-api/bridge.test.js` (+ `.cjs` mirror)

- [ ] **Step 3.1: Write the failing test**

Create `electron/tests/test-api/bridge.test.js`:

```js
const EventEmitter = require("events");
const { CHANNELS } = require("../../shared/channels");
const { createBridge } = require("../../main/services/test-api/bridge");

const makeFakeWebContents = () => {
  const sent = [];
  const ipcEmitter = new EventEmitter();
  return {
    send: (channel, payload) => sent.push({ channel, payload }),
    sent,
    simulateRendererResult: (payload) => ipcEmitter.emit("result", payload),
    onResult: (cb) => ipcEmitter.on("result", cb),
  };
};

describe("test-api/bridge", () => {
  test("invoke sends INVOKE then resolves on matching RESULT", async () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);

    const promise = bridge.invoke("createChat", { title: "x" }, { timeout: 1000 });
    expect(wc.sent).toHaveLength(1);
    const { requestId } = wc.sent[0].payload;
    expect(wc.sent[0].channel).toBe(CHANNELS.TEST_BRIDGE.INVOKE);

    ipcMain.emit(CHANNELS.TEST_BRIDGE.RESULT, {}, { requestId, ok: true, data: { chat_id: "c1" } });
    await expect(promise).resolves.toEqual({ chat_id: "c1" });
  });

  test("invoke rejects on RESULT with ok:false", async () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);
    const promise = bridge.invoke("foo", {}, { timeout: 1000 });
    const { requestId } = wc.sent[0].payload;
    ipcMain.emit(CHANNELS.TEST_BRIDGE.RESULT, {}, { requestId, ok: false, error: { code: "no_handler", message: "x" } });
    await expect(promise).rejects.toMatchObject({ code: "no_handler" });
  });

  test("invoke rejects with ipc_timeout when no result", async () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);
    await expect(bridge.invoke("foo", {}, { timeout: 50 })).rejects.toMatchObject({ code: "ipc_timeout" });
  });

  test("ready handshake exposes isReady() and onReady()", () => {
    const wc = makeFakeWebContents();
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
    const bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    bridge.attach(wc);
    expect(bridge.isReady()).toBe(false);
    let fired = false;
    bridge.onReady(() => { fired = true; });
    ipcMain.emit(CHANNELS.TEST_BRIDGE.READY, {});
    expect(bridge.isReady()).toBe(true);
    expect(fired).toBe(true);
  });
});
```

- [ ] **Step 3.2: Verify test fails**

Run: `npx jest electron/tests/test-api/bridge.test.js`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3.3: Implement `electron/main/services/test-api/bridge.js`**

```js
const crypto = require("crypto");

const createBridge = ({ ipcMain, channels }) => {
  const pending = new Map();
  let webContents = null;
  let ready = false;
  const readyCallbacks = [];

  ipcMain.on(channels.RESULT, (_event, payload) => {
    const entry = pending.get(payload?.requestId);
    if (!entry) return;
    pending.delete(payload.requestId);
    clearTimeout(entry.timer);
    if (payload.ok) entry.resolve(payload.data);
    else entry.reject(Object.assign(new Error(payload.error?.message || "handler error"), payload.error || {}));
  });

  ipcMain.on(channels.READY, () => {
    ready = true;
    while (readyCallbacks.length) readyCallbacks.shift()();
  });

  const attach = (wc) => { webContents = wc; };

  const invoke = (command, payload, { timeout = 30000 } = {}) =>
    new Promise((resolve, reject) => {
      if (!webContents) {
        reject(Object.assign(new Error("no webContents attached"), { code: "no_renderer" }));
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(Object.assign(new Error(`ipc timeout for ${command}`), { code: "ipc_timeout" }));
      }, timeout);
      pending.set(requestId, { resolve, reject, timer });
      webContents.send(channels.INVOKE, { requestId, command, payload });
    });

  const isReady = () => ready;
  const onReady = (cb) => {
    if (ready) cb();
    else readyCallbacks.push(cb);
  };

  return { attach, invoke, isReady, onReady };
};

module.exports = { createBridge };
```

- [ ] **Step 3.4: Verify test passes**

Run: `npx jest electron/tests/test-api/bridge.test.js`
Expected: PASS (4 tests)

- [ ] **Step 3.5: Mirror as `.cjs`**

Copy test file to `bridge.test.cjs` (byte-identical). Run `npx jest electron/tests/test-api/bridge.test.cjs` → PASS.

- [ ] **Step 3.6: Stage and pause for user commit**

```bash
git add electron/main/services/test-api/bridge.js electron/tests/test-api/bridge.test.js electron/tests/test-api/bridge.test.cjs
```

---

## Task 4: Commands router

**Files:**
- Create: `electron/main/services/test-api/commands.js`
- Test: `electron/tests/test-api/commands.test.js` (+ `.cjs` mirror)

- [ ] **Step 4.1: Write the failing test**

Create `electron/tests/test-api/commands.test.js`:

```js
const { createCommandRegistry } = require("../../main/services/test-api/commands");

describe("test-api/commands", () => {
  test("dispatch routes POST /v1/chats to registered handler", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "POST",
      path: "/v1/chats",
      handler: async (ctx) => ({ chat_id: ctx.body.title }),
    });
    const result = await reg.dispatch({ method: "POST", path: "/v1/chats", body: { title: "abc" } });
    expect(result).toEqual({ status: 200, body: { chat_id: "abc" } });
  });

  test("dispatch extracts path params {id}", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "DELETE",
      path: "/v1/chats/:id",
      handler: async (ctx) => ({ deleted: ctx.params.id }),
    });
    const result = await reg.dispatch({ method: "DELETE", path: "/v1/chats/c42", body: null });
    expect(result.body).toEqual({ deleted: "c42" });
  });

  test("returns 404 when no route matches", async () => {
    const reg = createCommandRegistry();
    const result = await reg.dispatch({ method: "GET", path: "/v1/nope", body: null });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("not_found");
  });

  test("validator rejects with 400 invalid_payload", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "POST",
      path: "/v1/x",
      validator: (body) => (body && typeof body.text === "string" ? null : "text required"),
      handler: async () => ({ ok: true }),
    });
    const result = await reg.dispatch({ method: "POST", path: "/v1/x", body: {} });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: "invalid_payload", message: "text required" });
  });

  test("handler error becomes 500 with code from err.code", async () => {
    const reg = createCommandRegistry();
    reg.register({
      method: "GET",
      path: "/v1/boom",
      handler: async () => { throw Object.assign(new Error("boom"), { code: "chat_not_found", status: 404 }); },
    });
    const result = await reg.dispatch({ method: "GET", path: "/v1/boom", body: null });
    expect(result.status).toBe(404);
    expect(result.body.error).toMatchObject({ code: "chat_not_found", message: "boom" });
  });
});
```

- [ ] **Step 4.2: Verify test fails**

Run: `npx jest electron/tests/test-api/commands.test.js`
Expected: FAIL `Cannot find module`

- [ ] **Step 4.3: Implement `electron/main/services/test-api/commands.js`**

```js
const compilePath = (pattern) => {
  const keys = [];
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\//g, "\\/")
        .replace(/:([A-Za-z_]\w*)/g, (_, k) => {
          keys.push(k);
          return "([^/]+)";
        }) +
      "$",
  );
  return { regex, keys };
};

const createCommandRegistry = () => {
  const routes = [];

  const register = ({ method, path, validator, handler }) => {
    routes.push({ method: method.toUpperCase(), ...compilePath(path), validator, handler });
  };

  const dispatch = async ({ method, path, body, query, raw }) => {
    const m = (method || "GET").toUpperCase();
    for (const route of routes) {
      if (route.method !== m) continue;
      const match = route.regex.exec(path);
      if (!match) continue;
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
      if (route.validator) {
        const err = route.validator(body, params);
        if (err) return { status: 400, body: { error: { code: "invalid_payload", message: err } } };
      }
      try {
        const data = await route.handler({ params, body, query, raw });
        return { status: 200, body: data };
      } catch (e) {
        const code = e.code || "handler_error";
        const status = e.status || (code === "chat_not_found" ? 404 : code === "no_handler" ? 409 : code === "ipc_timeout" ? 408 : code === "not_ready" ? 503 : 500);
        return { status, body: { error: { code, message: e.message } } };
      }
    }
    return { status: 404, body: { error: { code: "not_found", message: `no route for ${m} ${path}` } } };
  };

  return { register, dispatch, routes };
};

module.exports = { createCommandRegistry };
```

- [ ] **Step 4.4: Verify test passes**

Run: `npx jest electron/tests/test-api/commands.test.js`
Expected: PASS (5 tests)

- [ ] **Step 4.5: Mirror as `.cjs`** (copy test file, run jest, expect PASS)

- [ ] **Step 4.6: Stage and pause for user commit**

```bash
git add electron/main/services/test-api/commands.js electron/tests/test-api/commands.test.js electron/tests/test-api/commands.test.cjs
```

---

## Task 5: HTTP server

**Files:**
- Create: `electron/main/services/test-api/server.js`
- Test: `electron/tests/test-api/server.test.js` (+ `.cjs` mirror)

- [ ] **Step 5.1: Write the failing test**

Create `electron/tests/test-api/server.test.js`:

```js
const http = require("http");
const { createServer } = require("../../main/services/test-api/server");
const { createCommandRegistry } = require("../../main/services/test-api/commands");

const httpRequest = (port, { method = "GET", path = "/", body } = {}) =>
  new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          let parsed = null;
          try { parsed = JSON.parse(buf.toString()); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: buf });
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
    const server = await createServer({ registry, isReady: () => true });
    const port = server.port;
    const res = await httpRequest(port, { method: "POST", path: "/v1/echo", body: { hi: 1 } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ echoed: { hi: 1 } });
    await server.close();
  });

  test("returns 503 not_ready before isReady() flips true", async () => {
    let ready = false;
    const registry = createCommandRegistry();
    registry.register({ method: "GET", path: "/v1/x", handler: async () => ({ ok: true }) });
    const server = await createServer({ registry, isReady: () => ready });
    const res = await httpRequest(server.port, { method: "GET", path: "/v1/x" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("not_ready");
    ready = true;
    const res2 = await httpRequest(server.port, { method: "GET", path: "/v1/x" });
    expect(res2.status).toBe(200);
    await server.close();
  });

  test("/v1/debug/screenshot bypasses JSON serialization, returns binary", async () => {
    const registry = createCommandRegistry();
    registry.register({
      method: "GET",
      path: "/v1/debug/screenshot",
      handler: async () => ({ __binary: true, contentType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }),
    });
    const server = await createServer({ registry, isReady: () => true });
    const res = await httpRequest(server.port, { path: "/v1/debug/screenshot" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.raw[0]).toBe(0x89);
    await server.close();
  });

  test("invalid JSON body returns 400", async () => {
    const registry = createCommandRegistry();
    registry.register({ method: "POST", path: "/v1/x", handler: async () => ({ ok: true }) });
    const server = await createServer({ registry, isReady: () => true });
    const port = server.port;
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, method: "POST", path: "/v1/x", headers: { "content-type": "application/json", "content-length": 5 } },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => resolve({ status: r.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
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
```

- [ ] **Step 5.2: Verify test fails**

Run: `npx jest electron/tests/test-api/server.test.js`
Expected: FAIL `Cannot find module`

- [ ] **Step 5.3: Implement `electron/main/services/test-api/server.js`**

```js
const http = require("http");
const { URL } = require("url");

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const writeJson = (res, status, body) => {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": "application/json", "content-length": buf.length });
  res.end(buf);
};

const writeBinary = (res, { contentType, buffer }) => {
  res.writeHead(200, { "content-type": contentType, "content-length": buffer.length });
  res.end(buffer);
};

const createServer = ({ registry, isReady }) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!isReady()) {
          writeJson(res, 503, { error: { code: "not_ready", message: "renderer test bridge not ready" } });
          return;
        }
        const url = new URL(req.url, "http://127.0.0.1");
        const raw = await readBody(req);
        let body = null;
        if (raw.length > 0) {
          try { body = JSON.parse(raw.toString("utf8")); }
          catch {
            writeJson(res, 400, { error: { code: "invalid_json", message: "request body is not valid JSON" } });
            return;
          }
        }
        const query = Object.fromEntries(url.searchParams.entries());
        const result = await registry.dispatch({ method: req.method, path: url.pathname, body, query, raw });
        if (result.body && result.body.__binary) {
          writeBinary(res, result.body);
        } else {
          writeJson(res, result.status, result.body);
        }
      } catch (e) {
        writeJson(res, 500, { error: { code: "server_error", message: e.message } });
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });

module.exports = { createServer };
```

- [ ] **Step 5.4: Verify test passes**

Run: `npx jest electron/tests/test-api/server.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5.5: Mirror as `.cjs`** (copy test file, run jest, expect PASS)

- [ ] **Step 5.6: Stage and pause for user commit**

```bash
git add electron/main/services/test-api/server.js electron/tests/test-api/server.test.js electron/tests/test-api/server.test.cjs
```

---

## Task 6: Lifecycle module + service factory

**Files:**
- Create: `electron/main/services/test-api/index.js`
- Test: `electron/tests/test-api/integration.test.js` (+ `.cjs` mirror)

- [ ] **Step 6.1: Write the failing integration test**

Create `electron/tests/test-api/integration.test.js`:

```js
const EventEmitter = require("events");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createTestApiService } = require("../../main/services/test-api");
const { CHANNELS } = require("../../shared/channels");

const httpRequest = (port, opts = {}) =>
  new Promise((resolve, reject) => {
    const data = opts.body == null ? null : JSON.stringify(opts.body);
    const req = http.request(
      { host: "127.0.0.1", port, method: opts.method || "GET", path: opts.path || "/", headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          let parsed = null; try { parsed = JSON.parse(buf.toString()); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
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
    portFile = path.join(os.tmpdir(), `test-api-port-${Date.now()}-${Math.random()}`);
  });
  afterEach(async () => {
    if (svc) await svc.stop();
    try { fs.unlinkSync(portFile); } catch {}
  });

  const makeFakeWebContents = (ipcMain) => ({
    send: (channel, payload) => {
      // Simulate renderer immediately responding
      if (channel === CHANNELS.TEST_BRIDGE.INVOKE) {
        setImmediate(() => {
          if (payload.command === "createChat") {
            ipcMain.emit(CHANNELS.TEST_BRIDGE.RESULT, {}, { requestId: payload.requestId, ok: true, data: { chat_id: "test-chat" } });
          } else {
            ipcMain.emit(CHANNELS.TEST_BRIDGE.RESULT, {}, { requestId: payload.requestId, ok: false, error: { code: "no_handler", message: "no handler" } });
          }
        });
      }
    },
  });

  test("end-to-end: server starts, write port file, handshake gates, command roundtrip", async () => {
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
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
    const r1 = await httpRequest(port, { method: "POST", path: "/v1/chats", body: { title: "x" } });
    expect(r1.status).toBe(503);

    // Renderer fires READY
    ipcMain.emit(CHANNELS.TEST_BRIDGE.READY, {});

    // After READY: roundtrip works
    const r2 = await httpRequest(port, { method: "POST", path: "/v1/chats", body: { title: "x" } });
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ chat_id: "test-chat" });
  });

  test("does not start when NODE_ENV=production", async () => {
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
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
    ipcMain.handle = () => {};
    svc = createTestApiService({
      env: { NODE_ENV: "development", PUPU_TEST_API_DISABLE: "1" },
      ipcMain,
      portFilePath: portFile,
    });
    await svc.start({ webContents: makeFakeWebContents(ipcMain) });
    expect(svc.getPort()).toBe(null);
  });
});
```

- [ ] **Step 6.2: Verify test fails**

Run: `npx jest electron/tests/test-api/integration.test.js`
Expected: FAIL `Cannot find module '../../main/services/test-api'`

- [ ] **Step 6.3: Implement `electron/main/services/test-api/index.js`**

```js
const fs = require("fs");
const path = require("path");
const { CHANNELS } = require("../../../shared/channels");
const { createCommandRegistry } = require("./commands");
const { createBridge } = require("./bridge");
const { createServer } = require("./server");
const { createLogStore } = require("./logs");
const { registerBuiltinCommands } = require("./builtin_commands");

const createTestApiService = ({ env = process.env, ipcMain, portFilePath, getMainWindow }) => {
  let server = null;
  let bridge = null;
  let logs = null;
  let unpatchStdout = null;
  let unpatchStderr = null;
  let port = null;

  const isEnabled = () => env.NODE_ENV !== "production" && env.PUPU_TEST_API_DISABLE !== "1";

  const start = async ({ webContents } = {}) => {
    if (!isEnabled()) return;
    logs = createLogStore({ capacity: 2000 });
    if (process && process.stdout) unpatchStdout = logs.patchStream(process.stdout, "main", "log");
    if (process && process.stderr) unpatchStderr = logs.patchStream(process.stderr, "main", "error");

    bridge = createBridge({ ipcMain, channels: CHANNELS.TEST_BRIDGE });
    if (webContents) bridge.attach(webContents);

    ipcMain.on(CHANNELS.TEST_BRIDGE.LOG, (_event, entry) => {
      if (logs && entry && entry.source) logs.push(entry);
    });

    const registry = createCommandRegistry();
    registerBuiltinCommands({ registry, bridge, logs, getMainWindow });

    server = await createServer({ registry, isReady: () => bridge.isReady() });
    port = server.port;
    fs.writeFileSync(portFilePath, JSON.stringify({ port, pid: process.pid, started_at: Date.now() }));
    process.stdout.write(`[test-api] listening on http://127.0.0.1:${port}\n`);
  };

  const stop = async () => {
    if (server) await server.close();
    server = null;
    if (unpatchStdout) unpatchStdout();
    if (unpatchStderr) unpatchStderr();
    try { fs.unlinkSync(portFilePath); } catch {}
    port = null;
  };

  const getPort = () => port;
  const getLogs = () => logs;
  const getBridge = () => bridge;

  return { start, stop, getPort, getLogs, getBridge };
};

module.exports = { createTestApiService };
```

- [ ] **Step 6.4: Implement `electron/main/services/test-api/builtin_commands.js`**

This file registers all Phase 1 endpoints as commands that delegate to either `bridge.invoke(...)` (for renderer-bound ops) or to native APIs (for screenshot/eval).

```js
const registerBuiltinCommands = ({ registry, bridge, logs, getMainWindow }) => {
  // Chat lifecycle
  registry.register({ method: "POST",   path: "/v1/chats",                     handler: (ctx) => bridge.invoke("createChat", ctx.body || {}) });
  registry.register({ method: "GET",    path: "/v1/chats",                     handler: () => bridge.invoke("listChats", {}) });
  registry.register({ method: "GET",    path: "/v1/chats/:id",                 handler: (ctx) => bridge.invoke("getChat", { id: ctx.params.id }) });
  registry.register({ method: "POST",   path: "/v1/chats/:id/activate",        handler: (ctx) => bridge.invoke("activateChat", { id: ctx.params.id }) });
  registry.register({ method: "PATCH",  path: "/v1/chats/:id",                 handler: (ctx) => bridge.invoke("renameChat", { id: ctx.params.id, ...(ctx.body || {}) }) });
  registry.register({ method: "DELETE", path: "/v1/chats/:id",                 handler: (ctx) => bridge.invoke("deleteChat", { id: ctx.params.id }) });

  // Message
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/messages",
    validator: (body) => (body && typeof body.text === "string" ? null : "body.text required"),
    handler: (ctx) => bridge.invoke("sendMessage", { id: ctx.params.id, ...(ctx.body || {}) }, { timeout: 5 * 60 * 1000 }),
  });
  registry.register({ method: "POST", path: "/v1/chats/:id/cancel", handler: (ctx) => bridge.invoke("cancelMessage", { id: ctx.params.id }) });

  // Catalog + selection
  registry.register({ method: "GET",  path: "/v1/catalog/models",      handler: () => bridge.invoke("listModels", {}) });
  registry.register({ method: "GET",  path: "/v1/catalog/toolkits",    handler: () => bridge.invoke("listToolkits", {}) });
  registry.register({ method: "GET",  path: "/v1/catalog/characters",  handler: () => bridge.invoke("listCharacters", {}) });
  registry.register({
    method: "POST", path: "/v1/chats/:id/model",
    validator: (body) => (body && typeof body.model_id === "string" ? null : "body.model_id required"),
    handler: (ctx) => bridge.invoke("selectModel", { id: ctx.params.id, model_id: ctx.body.model_id }),
  });
  registry.register({
    method: "POST", path: "/v1/chats/:id/toolkits",
    validator: (body) => (body && Array.isArray(body.toolkit_ids) ? null : "body.toolkit_ids array required"),
    handler: (ctx) => bridge.invoke("setToolkits", { id: ctx.params.id, toolkit_ids: ctx.body.toolkit_ids }),
  });
  registry.register({
    method: "POST", path: "/v1/chats/:id/character",
    handler: (ctx) => bridge.invoke("setCharacter", { id: ctx.params.id, character_id: ctx.body?.character_id ?? null }),
  });

  // Debug
  registry.register({ method: "GET", path: "/v1/debug/state", handler: (ctx) => bridge.invoke("getStateSnapshot", { chat_id: ctx.query?.chat_id || null }) });
  registry.register({
    method: "GET", path: "/v1/debug/logs",
    handler: (ctx) => {
      const source = ctx.query?.source || "renderer";
      const n = ctx.query?.n ? Number(ctx.query.n) : 200;
      const since = ctx.query?.since ? Number(ctx.query.since) : undefined;
      return { entries: logs.tail({ source, n, since }) };
    },
  });
  registry.register({
    method: "GET", path: "/v1/debug/screenshot",
    handler: async (ctx) => {
      const { BrowserWindow } = require("electron");
      const win = BrowserWindow.getFocusedWindow() || (getMainWindow && getMainWindow());
      if (!win) throw Object.assign(new Error("no window"), { code: "no_window", status: 503 });
      const img = await win.webContents.capturePage();
      const fmt = (ctx.query?.format || "png").toLowerCase();
      if (fmt === "jpeg" || fmt === "jpg") {
        const q = Number(ctx.query?.quality) || 80;
        return { __binary: true, contentType: "image/jpeg", buffer: img.toJPEG(q) };
      }
      return { __binary: true, contentType: "image/png", buffer: img.toPNG() };
    },
  });
  registry.register({
    method: "POST", path: "/v1/debug/eval",
    validator: (body) => (body && typeof body.code === "string" && body.code.length <= 65536 ? null : "body.code required (<=64KB)"),
    handler: async (ctx) => {
      const { BrowserWindow } = require("electron");
      const win = BrowserWindow.getFocusedWindow() || (getMainWindow && getMainWindow());
      if (!win) throw Object.assign(new Error("no window"), { code: "no_window", status: 503 });
      const code = ctx.body.code;
      const isAsync = ctx.body.await !== false;
      const wrapped = isAsync ? `(async () => { ${code} })()` : `(() => { return (${code}); })()`;
      try {
        const value = await win.webContents.executeJavaScript(wrapped, true);
        return { ok: true, value };
      } catch (e) {
        return { ok: false, error: { message: e.message, stack: e.stack } };
      }
    },
  });
  registry.register({
    method: "GET", path: "/v1/debug/dom",
    handler: async (ctx) => {
      const { BrowserWindow } = require("electron");
      const win = BrowserWindow.getFocusedWindow() || (getMainWindow && getMainWindow());
      if (!win) throw Object.assign(new Error("no window"), { code: "no_window", status: 503 });
      const sel = ctx.query?.selector || "body";
      const code = `document.querySelector(${JSON.stringify(sel)})?.outerHTML ?? null`;
      const html = await win.webContents.executeJavaScript(`(() => { return (${code}); })()`, true);
      return { html };
    },
  });
};

module.exports = { registerBuiltinCommands };
```

- [ ] **Step 6.5: Verify integration test passes**

Run: `npx jest electron/tests/test-api/integration.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6.6: Mirror as `.cjs`** (copy test file)

- [ ] **Step 6.7: Stage and pause for user commit**

```bash
git add electron/main/services/test-api/index.js electron/main/services/test-api/builtin_commands.js electron/tests/test-api/integration.test.js electron/tests/test-api/integration.test.cjs
```

---

## Task 7: Preload bridge

**Files:**
- Create: `electron/preload/test_bridge_preload.js`

- [ ] **Step 7.1: Implement preload bridge**

```js
const { contextBridge, ipcRenderer } = require("electron");
const { CHANNELS } = require("../shared/channels");

const createTestBridgePreload = (renderer = ipcRenderer) => {
  const handlers = new Map(); // command -> handler (last-mount-wins)

  renderer.on(CHANNELS.TEST_BRIDGE.INVOKE, async (_event, { requestId, command, payload }) => {
    const handler = handlers.get(command);
    if (!handler) {
      renderer.send(CHANNELS.TEST_BRIDGE.RESULT, {
        requestId, ok: false, error: { code: "no_handler", message: `no handler registered for ${command}` },
      });
      return;
    }
    try {
      const data = await handler(payload);
      renderer.send(CHANNELS.TEST_BRIDGE.RESULT, { requestId, ok: true, data });
    } catch (e) {
      renderer.send(CHANNELS.TEST_BRIDGE.RESULT, {
        requestId, ok: false, error: { code: e.code || "handler_error", message: e.message, stack: e.stack },
      });
    }
  });

  return {
    register(command, handler) {
      handlers.set(command, handler);
      return () => {
        if (handlers.get(command) === handler) handlers.delete(command);
      };
    },
    pushLog(entry) {
      try { renderer.send(CHANNELS.TEST_BRIDGE.LOG, entry); } catch {}
    },
    pushEvent(evt) {
      try { renderer.send(CHANNELS.TEST_BRIDGE.EVENT, evt); } catch {}
    },
    markReady() {
      renderer.send(CHANNELS.TEST_BRIDGE.READY, {});
    },
  };
};

const install = () => {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.PUPU_TEST_API_DISABLE === "1") return;
  const api = createTestBridgePreload();
  contextBridge.exposeInMainWorld("__pupuTestBridge", api);
};

module.exports = { createTestBridgePreload, install };
```

- [ ] **Step 7.2: Verify it parses**

Run: `node -e "require('./electron/preload/test_bridge_preload')"`
Expected: no error.

- [ ] **Step 7.3: Stage and pause for user commit**

```bash
git add electron/preload/test_bridge_preload.js
```

---

## Task 8: Wire preload

**Files:**
- Modify: `electron/preload/index.js`

- [ ] **Step 8.1: Add the install call**

Open `electron/preload/index.js`. After the existing `contextBridge.exposeInMainWorld(...)` block (last lines of the file), append:

```js
const { install: installTestBridge } = require("./test_bridge_preload");
installTestBridge();
```

- [ ] **Step 8.2: Verify**

Run `npm run start:web` is not relevant here — the preload only loads under Electron. We will validate via integration in Task 9.

- [ ] **Step 8.3: Stage and pause for user commit**

```bash
git add electron/preload/index.js
```

---

## Task 9: Wire main service

**Files:**
- Modify: `electron/main/index.js`

- [ ] **Step 9.1: Import the factory**

Add near the top of `electron/main/index.js`, alongside the other `createXxxService` imports:

```js
const { createTestApiService } = require("./services/test-api");
```

- [ ] **Step 9.2: Construct the service**

Inside the `gotSingleInstanceLock` else-branch, after the existing service constructions (after `createScreenshotService(...)` block), add:

```js
const testApiService = createTestApiService({
  env: process.env,
  ipcMain,
  portFilePath: path.join(app.getPath("userData"), "test-api-port"),
  getMainWindow: windowService.getMainWindow,
});
```

- [ ] **Step 9.3: Start it after window creation**

Inside `app.whenReady().then(async () => { ... })`, after `windowService.createMainWindow();`, add:

```js
const mainWin = windowService.getMainWindow();
if (mainWin && mainWin.webContents) {
  await testApiService.start({ webContents: mainWin.webContents });
}
```

- [ ] **Step 9.4: Stop on quit**

In the existing `app.on("before-quit", stopBackgroundServices);` area, add a separate hook:

```js
app.on("before-quit", () => { void testApiService.stop(); });
```

- [ ] **Step 9.5: Manual verification**

Run: `npm start`
After PuPu boots, in another terminal:
```bash
cat "$HOME/Library/Application Support/pupu/test-api-port"
```
Expected: a JSON `{port, pid, started_at}`.

Then:
```bash
PORT=$(cat "$HOME/Library/Application Support/pupu/test-api-port" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).port))")
curl -i http://127.0.0.1:$PORT/v1/debug/state
```
Expected: `503 not_ready` (renderer hasn't `markReady()` yet — that comes in Task 16). This proves the server is up and gating correctly.

- [ ] **Step 9.6: Stage and pause for user commit**

```bash
git add electron/main/index.js
```

---

## Task 10: Modal registry hook

**Files:**
- Create: `src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.js`
- Test: `src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.test.js`

- [ ] **Step 10.1: Write the failing test**

```js
import { renderHook } from "@testing-library/react";
import { useModalLifecycle, getModalRegistry } from "./use_modal_lifecycle";

describe("useModalLifecycle", () => {
  beforeEach(() => { delete window.__pupuModalRegistry; });

  test("registers id on mount when isOpen=true, deregisters on unmount", () => {
    const { unmount } = renderHook(() => useModalLifecycle("toolkit", true));
    expect(getModalRegistry().openIds()).toContain("toolkit");
    unmount();
    expect(getModalRegistry().openIds()).not.toContain("toolkit");
  });

  test("does not register when isOpen=false", () => {
    renderHook(() => useModalLifecycle("settings", false));
    expect(getModalRegistry().openIds()).not.toContain("settings");
  });

  test("toggles when isOpen flips", () => {
    let open = true;
    const { rerender } = renderHook(() => useModalLifecycle("char", open));
    expect(getModalRegistry().openIds()).toContain("char");
    open = false; rerender();
    expect(getModalRegistry().openIds()).not.toContain("char");
  });
});
```

- [ ] **Step 10.2: Verify test fails**

Run: `npm test -- --testPathPattern=use_modal_lifecycle`
Expected: FAIL `Cannot find module './use_modal_lifecycle'`

- [ ] **Step 10.3: Implement**

```js
import { useEffect } from "react";

const ensureRegistry = () => {
  if (typeof window === "undefined") return null;
  if (!window.__pupuModalRegistry) {
    const open = new Set();
    window.__pupuModalRegistry = {
      open(id) { open.add(id); },
      close(id) { open.delete(id); },
      openIds() { return [...open]; },
    };
  }
  return window.__pupuModalRegistry;
};

export const getModalRegistry = () => ensureRegistry();

export const useModalLifecycle = (id, isOpen) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const reg = ensureRegistry();
    if (!reg) return undefined;
    reg.open(id);
    return () => reg.close(id);
  }, [id, isOpen]);
};
```

- [ ] **Step 10.4: Verify test passes**

Run: `npm test -- --testPathPattern=use_modal_lifecycle`
Expected: PASS (3 tests)

- [ ] **Step 10.5: Stage and pause for user commit**

```bash
git add src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.js src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.test.js
```

---

## Task 11: State selector

**Files:**
- Create: `src/SERVICEs/test_bridge/state_selector.js`
- Test: `src/SERVICEs/test_bridge/state_selector.test.js`

- [ ] **Step 11.1: Write the failing test**

```js
import { collectStateSnapshot } from "./state_selector";

describe("state_selector", () => {
  beforeEach(() => {
    window.__pupuModalRegistry = { openIds: () => ["toolkit"] };
  });

  test("collects snapshot from injected sources", () => {
    const snap = collectStateSnapshot({
      chatStorage: {
        getActiveChatId: () => "chat-1",
        listChatsSummary: () => [{ id: "chat-1", title: "T", model: "gpt-5", message_count: 3, updated_at: 999 }],
        getChatConfig: (id) => ({ model: "gpt-5", toolkits: ["t1"], character_id: "c1", last_message_role: "assistant" }),
      },
      window: { location: { hash: "#/chat" }, innerWidth: 1280, innerHeight: 800 },
      configContext: { isDark: true, locale: "en" },
      catalogCounts: { models: 5, toolkits: 3, characters: 2 },
      isStreaming: false,
    });
    expect(snap.active_chat_id).toBe("chat-1");
    expect(snap.active_chat).toMatchObject({ id: "chat-1", message_count: 3 });
    expect(snap.current_model).toBe("gpt-5");
    expect(snap.toolkits_active).toEqual(["t1"]);
    expect(snap.character_id).toBe("c1");
    expect(snap.modal_open).toEqual(["toolkit"]);
    expect(snap.is_streaming).toBe(false);
    expect(snap.window_state).toMatchObject({ width: 1280, height: 800, isDark: true, locale: "en" });
    expect(snap.catalog_loaded).toEqual({ models: 5, toolkits: 3, characters: 2 });
  });

  test("returns null active_chat when no active chat", () => {
    const snap = collectStateSnapshot({
      chatStorage: { getActiveChatId: () => null, listChatsSummary: () => [], getChatConfig: () => null },
      window: { location: { hash: "" }, innerWidth: 0, innerHeight: 0 },
      configContext: { isDark: false, locale: "en" },
      catalogCounts: { models: 0, toolkits: 0, characters: 0 },
      isStreaming: false,
    });
    expect(snap.active_chat_id).toBeNull();
    expect(snap.active_chat).toBeNull();
    expect(snap.current_model).toBeNull();
  });
});
```

- [ ] **Step 11.2: Verify test fails**

Run: `npm test -- --testPathPattern=state_selector`
Expected: FAIL `Cannot find module`

- [ ] **Step 11.3: Implement**

```js
export const collectStateSnapshot = ({ chatStorage, window: win, configContext, catalogCounts, isStreaming }) => {
  const activeChatId = chatStorage.getActiveChatId() || null;
  const config = activeChatId ? chatStorage.getChatConfig(activeChatId) : null;
  const summaries = chatStorage.listChatsSummary() || [];
  const summary = activeChatId ? summaries.find((c) => c.id === activeChatId) : null;
  const modalRegistry = (win && win.__pupuModalRegistry) || null;
  return {
    active_chat_id: activeChatId,
    active_chat: summary && config
      ? {
          id: summary.id,
          title: summary.title,
          model: summary.model,
          message_count: summary.message_count,
          last_message_role: config.last_message_role || null,
        }
      : null,
    current_model: config?.model ?? null,
    toolkits_active: config?.toolkits ?? [],
    character_id: config?.character_id ?? null,
    modal_open: modalRegistry ? modalRegistry.openIds() : [],
    is_streaming: !!isStreaming,
    route: win?.location?.hash || "",
    window_state: {
      width: win?.innerWidth ?? 0,
      height: win?.innerHeight ?? 0,
      isDark: !!configContext?.isDark,
      locale: configContext?.locale || "en",
    },
    catalog_loaded: catalogCounts,
  };
};
```

- [ ] **Step 11.4: Verify test passes**

Run: `npm test -- --testPathPattern=state_selector`
Expected: PASS (2 tests)

- [ ] **Step 11.5: Stage and pause for user commit**

```bash
git add src/SERVICEs/test_bridge/state_selector.js src/SERVICEs/test_bridge/state_selector.test.js
```

---

## Task 12: Chat handlers (service-source)

**Files:**
- Create: `src/SERVICEs/test_bridge/handlers/chat.js`
- Test: `src/SERVICEs/test_bridge/handlers/chat.test.js`

> **Audit note for implementer:** `src/SERVICEs/chat_storage.js` re-exports from `./chat_storage/chat_storage_store`. The relevant exports are: `createChatInSelectedContext`, `selectTreeNode`, `setChatTitle`, `deleteTreeNodeCascade`, `getChatsStore`, `subscribeChatsStore`. Read the JSDoc on each (especially `createChatInSelectedContext` to confirm its signature for `{title, model}`). If any signature differs from what's used below, adjust the handler — keep the public test API contract stable.

- [ ] **Step 12.1: Write the failing test**

```js
import { createChatHandlers } from "./chat";

const makeFakeStorage = () => {
  const state = { chats: [], active: null };
  return {
    state,
    createChatInSelectedContext: ({ title, model }) => {
      const id = `c${state.chats.length + 1}`;
      state.chats.push({ id, title: title || "Untitled", model: model || null });
      state.active = id;
      return { id };
    },
    selectTreeNode: (id) => { state.active = id; },
    setChatTitle: (id, title) => { state.chats.find((c) => c.id === id).title = title; },
    deleteTreeNodeCascade: (id) => { state.chats = state.chats.filter((c) => c.id !== id); if (state.active === id) state.active = null; },
    listChatsSummary: () => state.chats.map((c) => ({ id: c.id, title: c.title, model: c.model, message_count: 0, updated_at: 0 })),
    getActiveChatId: () => state.active,
    getChatDetail: (id) => {
      const c = state.chats.find((c) => c.id === id);
      if (!c) throw Object.assign(new Error("chat not found"), { code: "chat_not_found" });
      return { id: c.id, title: c.title, model: c.model, character_id: null, toolkits: [], messages: [] };
    },
  };
};

describe("chat handlers", () => {
  test("createChat returns chat_id and activates", async () => {
    const storage = makeFakeStorage();
    const h = createChatHandlers({ chatStorage: storage });
    const result = await h.createChat({ title: "Hello", model: "gpt-5" });
    expect(result).toEqual({ chat_id: "c1", created_at: expect.any(Number) });
    expect(storage.state.active).toBe("c1");
  });

  test("listChats returns summary list", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "A" });
    storage.createChatInSelectedContext({ title: "B" });
    const h = createChatHandlers({ chatStorage: storage });
    const r = await h.listChats({});
    expect(r.chats).toHaveLength(2);
    expect(r.chats[0]).toMatchObject({ id: "c1", title: "A" });
  });

  test("activateChat switches active without sending", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "A" });
    storage.createChatInSelectedContext({ title: "B" });
    const h = createChatHandlers({ chatStorage: storage });
    await h.activateChat({ id: "c1" });
    expect(storage.state.active).toBe("c1");
  });

  test("renameChat updates title", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "Old" });
    const h = createChatHandlers({ chatStorage: storage });
    await h.renameChat({ id: "c1", title: "New" });
    expect(storage.state.chats[0].title).toBe("New");
  });

  test("deleteChat removes the chat", async () => {
    const storage = makeFakeStorage();
    storage.createChatInSelectedContext({ title: "A" });
    const h = createChatHandlers({ chatStorage: storage });
    await h.deleteChat({ id: "c1" });
    expect(storage.state.chats).toHaveLength(0);
  });

  test("getChat returns 404-like error on missing id", async () => {
    const storage = makeFakeStorage();
    const h = createChatHandlers({ chatStorage: storage });
    await expect(h.getChat({ id: "missing" })).rejects.toMatchObject({ code: "chat_not_found" });
  });
});
```

- [ ] **Step 12.2: Verify test fails**

Run: `npm test -- --testPathPattern=test_bridge/handlers/chat`
Expected: FAIL `Cannot find module`

- [ ] **Step 12.3: Implement**

```js
export const createChatHandlers = ({ chatStorage }) => ({
  createChat: async ({ title, model, character_id, toolkit_ids } = {}) => {
    const created = chatStorage.createChatInSelectedContext({ title, model, character_id, toolkit_ids });
    chatStorage.selectTreeNode(created.id);
    return { chat_id: created.id, created_at: Date.now() };
  },
  listChats: async () => ({ chats: chatStorage.listChatsSummary() }),
  getChat: async ({ id }) => chatStorage.getChatDetail(id),
  activateChat: async ({ id }) => {
    chatStorage.selectTreeNode(id);
    return { ok: true };
  },
  renameChat: async ({ id, title }) => {
    chatStorage.setChatTitle(id, title);
    return { ok: true };
  },
  deleteChat: async ({ id }) => {
    chatStorage.deleteTreeNodeCascade(id);
    return { ok: true };
  },
});

export const registerChatHandlers = ({ bridge, chatStorage }) => {
  const h = createChatHandlers({ chatStorage });
  bridge.register("createChat", h.createChat);
  bridge.register("listChats", h.listChats);
  bridge.register("getChat", h.getChat);
  bridge.register("activateChat", h.activateChat);
  bridge.register("renameChat", h.renameChat);
  bridge.register("deleteChat", h.deleteChat);
};
```

- [ ] **Step 12.4: Verify test passes**

Run: `npm test -- --testPathPattern=test_bridge/handlers/chat`
Expected: PASS (6 tests)

- [ ] **Step 12.5: Audit-driven adapter step**

The chat-storage adapter must expose `listChatsSummary`, `getActiveChatId`, `getChatConfig`, `getChatDetail`. These probably do not all exist as named exports yet — they need to be assembled on top of `getChatsStore()` / `subscribeChatsStore()`. Create `src/SERVICEs/test_bridge/chat_storage_adapter.js`:

```js
import * as cs from "../chat_storage";

const buildSummary = (chat) => ({
  id: chat.id,
  title: chat.title || "",
  model: chat.model || null,
  message_count: Array.isArray(chat.messages) ? chat.messages.length : 0,
  updated_at: chat.updated_at || chat.modified_at || 0,
});

export const buildChatStorageAdapter = () => ({
  createChatInSelectedContext: (opts) => cs.createChatInSelectedContext(opts),
  selectTreeNode: (id) => cs.selectTreeNode(id),
  setChatTitle: (id, title) => cs.setChatTitle(id, title),
  deleteTreeNodeCascade: (id) => cs.deleteTreeNodeCascade(id),
  listChatsSummary: () => {
    const store = cs.getChatsStore();
    const chats = store?.chats || store?.allChats || [];
    return chats.map(buildSummary);
  },
  getActiveChatId: () => {
    const store = cs.getChatsStore();
    return store?.activeChatId || store?.selectedChatId || null;
  },
  getChatConfig: (id) => {
    const store = cs.getChatsStore();
    const chats = store?.chats || store?.allChats || [];
    const chat = chats.find((c) => c.id === id);
    if (!chat) return null;
    return {
      model: chat.model || null,
      toolkits: chat.selectedToolkits || chat.toolkits || [],
      character_id: chat.character_id || null,
      last_message_role: Array.isArray(chat.messages) && chat.messages.length ? chat.messages[chat.messages.length - 1].role : null,
    };
  },
  getChatDetail: (id) => {
    const store = cs.getChatsStore();
    const chats = store?.chats || store?.allChats || [];
    const chat = chats.find((c) => c.id === id);
    if (!chat) throw Object.assign(new Error(`chat ${id} not found`), { code: "chat_not_found" });
    return {
      id: chat.id,
      title: chat.title || "",
      model: chat.model || null,
      character_id: chat.character_id || null,
      toolkits: chat.selectedToolkits || chat.toolkits || [],
      messages: chat.messages || [],
    };
  },
});
```

> If `getChatsStore()` shape differs from the guesses above, fix the field names; the adapter is the only place that knows raw shapes — handlers stay decoupled.

- [ ] **Step 12.6: Stage and pause for user commit**

```bash
git add src/SERVICEs/test_bridge/handlers/chat.js src/SERVICEs/test_bridge/handlers/chat.test.js src/SERVICEs/test_bridge/chat_storage_adapter.js
```

---

## Task 13: Catalog handlers

**Files:**
- Create: `src/SERVICEs/test_bridge/handlers/catalog.js`
- Test: `src/SERVICEs/test_bridge/handlers/catalog.test.js`

> **Audit note:** Models are loaded via `window.unchainAPI.getModelCatalog()`. Toolkits via `window.unchainAPI.getToolkitCatalog()`. Characters via `window.unchainAPI.listCharacters()`. Per-chat config writes use `setChatModel` / `setChatSelectedToolkits` / (character — see `openCharacterChat` semantics). Confirm method names against `electron/preload/bridges/unchain_bridge.js` and adjust if needed.

- [ ] **Step 13.1: Write the failing test**

```js
import { createCatalogHandlers } from "./catalog";

const makeDeps = () => {
  const calls = [];
  return {
    calls,
    unchainAPI: {
      getModelCatalog: async () => ({ models: [{ id: "gpt-5", provider: "openai", label: "GPT-5" }] }),
      getToolkitCatalog: async () => ({ toolkits: [{ id: "tk1", name: "Search", enabled_by_default: false }] }),
      listCharacters: async () => ({ characters: [{ id: "ch1", name: "Default" }] }),
    },
    chatStorage: {
      setChatModel: (id, model) => calls.push(["model", id, model]),
      setChatSelectedToolkits: (id, ids) => calls.push(["toolkits", id, ids]),
      setChatCharacter: (id, charId) => calls.push(["character", id, charId]),
    },
  };
};

describe("catalog handlers", () => {
  test("listModels", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    const r = await h.listModels({});
    expect(r.models[0].id).toBe("gpt-5");
  });
  test("listToolkits", async () => {
    const h = createCatalogHandlers(makeDeps());
    const r = await h.listToolkits({});
    expect(r.toolkits).toHaveLength(1);
  });
  test("listCharacters", async () => {
    const h = createCatalogHandlers(makeDeps());
    const r = await h.listCharacters({});
    expect(r.characters[0].name).toBe("Default");
  });
  test("selectModel writes through", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    await h.selectModel({ id: "c1", model_id: "gpt-5" });
    expect(d.calls).toContainEqual(["model", "c1", "gpt-5"]);
  });
  test("setToolkits writes through (override)", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    await h.setToolkits({ id: "c1", toolkit_ids: ["a", "b"] });
    expect(d.calls).toContainEqual(["toolkits", "c1", ["a", "b"]]);
  });
  test("setCharacter accepts null to clear", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    await h.setCharacter({ id: "c1", character_id: null });
    expect(d.calls).toContainEqual(["character", "c1", null]);
  });
});
```

- [ ] **Step 13.2: Verify test fails**

Run: `npm test -- --testPathPattern=test_bridge/handlers/catalog`
Expected: FAIL `Cannot find module`

- [ ] **Step 13.3: Implement**

```js
export const createCatalogHandlers = ({ unchainAPI, chatStorage }) => ({
  listModels: async () => unchainAPI.getModelCatalog(),
  listToolkits: async () => unchainAPI.getToolkitCatalog(),
  listCharacters: async () => unchainAPI.listCharacters(),
  selectModel: async ({ id, model_id }) => { chatStorage.setChatModel(id, model_id); return { ok: true, model_id }; },
  setToolkits: async ({ id, toolkit_ids }) => { chatStorage.setChatSelectedToolkits(id, toolkit_ids); return { ok: true }; },
  setCharacter: async ({ id, character_id }) => { chatStorage.setChatCharacter(id, character_id); return { ok: true }; },
});

export const registerCatalogHandlers = ({ bridge, unchainAPI, chatStorage }) => {
  const h = createCatalogHandlers({ unchainAPI, chatStorage });
  bridge.register("listModels", h.listModels);
  bridge.register("listToolkits", h.listToolkits);
  bridge.register("listCharacters", h.listCharacters);
  bridge.register("selectModel", h.selectModel);
  bridge.register("setToolkits", h.setToolkits);
  bridge.register("setCharacter", h.setCharacter);
};
```

- [ ] **Step 13.4: Verify tests pass**

Run: `npm test -- --testPathPattern=test_bridge/handlers/catalog`
Expected: PASS (6 tests)

- [ ] **Step 13.5: Extend chat_storage_adapter with `setChatCharacter`**

In `src/SERVICEs/test_bridge/chat_storage_adapter.js`, add inside the returned object:

```js
setChatModel: (id, model) => cs.setChatModel(id, model),
setChatSelectedToolkits: (id, ids) => cs.setChatSelectedToolkits(id, ids),
setChatCharacter: (id, charId) => {
  if (typeof cs.openCharacterChat === "function" && charId) {
    cs.openCharacterChat({ chatId: id, characterId: charId });
  } else {
    // adapter-level fallback: store under character_id field if no dedicated setter exists
    const store = cs.getChatsStore();
    const chats = store?.chats || store?.allChats || [];
    const chat = chats.find((c) => c.id === id);
    if (chat) chat.character_id = charId;
  }
},
```

> If `openCharacterChat` does not match this signature, replace with the actual character-attachment method. The contract from the handler is just `setChatCharacter(id, charId)` — the adapter must implement that, however it does so against the real store.

- [ ] **Step 13.6: Stage and pause for user commit**

```bash
git add src/SERVICEs/test_bridge/handlers/catalog.js src/SERVICEs/test_bridge/handlers/catalog.test.js src/SERVICEs/test_bridge/chat_storage_adapter.js
```

---

## Task 14: Debug handlers (state snapshot)

**Files:**
- Create: `src/SERVICEs/test_bridge/handlers/debug.js`

- [ ] **Step 14.1: Implement**

```js
import { collectStateSnapshot } from "../state_selector";

export const registerDebugHandlers = ({ bridge, chatStorage, getConfigContext, getCatalogCounts, getIsStreaming }) => {
  bridge.register("getStateSnapshot", async () => collectStateSnapshot({
    chatStorage,
    window,
    configContext: getConfigContext ? getConfigContext() : { isDark: false, locale: "en" },
    catalogCounts: getCatalogCounts ? getCatalogCounts() : { models: 0, toolkits: 0, characters: 0 },
    isStreaming: getIsStreaming ? getIsStreaming() : false,
  }));
};
```

- [ ] **Step 14.2: Stage and pause for user commit**

```bash
git add src/SERVICEs/test_bridge/handlers/debug.js
```

---

## Task 15: Test bridge index (console patch + handler wiring)

**Files:**
- Create: `src/SERVICEs/test_bridge/index.js`

- [ ] **Step 15.1: Implement**

```js
import { registerChatHandlers } from "./handlers/chat";
import { registerCatalogHandlers } from "./handlers/catalog";
import { registerDebugHandlers } from "./handlers/debug";
import { buildChatStorageAdapter } from "./chat_storage_adapter";

const installConsolePatch = (bridge) => {
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const serialize = (args) => args
    .map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(" ");
  ["log", "info", "warn", "error"].forEach((level) => {
    console[level] = (...args) => {
      orig[level](...args);
      try { bridge.pushLog({ ts: Date.now(), level, source: "renderer", msg: serialize(args) }); } catch {}
    };
  });
  window.addEventListener("error", (e) => {
    try { bridge.pushLog({ ts: Date.now(), level: "error", source: "renderer", msg: `${e.message} @${e.filename}:${e.lineno}` }); } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try { bridge.pushLog({ ts: Date.now(), level: "error", source: "renderer", msg: `unhandled: ${e.reason && (e.reason.stack || e.reason.message || e.reason)}` }); } catch {}
  });
};

let installed = false;
const catalogCounts = { models: 0, toolkits: 0, characters: 0 };
let isStreamingFlag = false;
let configContextRef = { isDark: false, locale: "en" };

export const setIsStreaming = (v) => { isStreamingFlag = !!v; };
export const setConfigContextRef = (ctx) => { configContextRef = ctx || configContextRef; };
export const setCatalogCounts = (counts) => { Object.assign(catalogCounts, counts || {}); };

export const installTestBridge = () => {
  if (installed) return;
  if (typeof window === "undefined" || !window.__pupuTestBridge) return;
  installed = true;
  const bridge = window.__pupuTestBridge;
  installConsolePatch(bridge);

  const chatStorage = buildChatStorageAdapter();
  registerChatHandlers({ bridge, chatStorage });
  registerCatalogHandlers({ bridge, unchainAPI: window.unchainAPI, chatStorage });
  registerDebugHandlers({
    bridge,
    chatStorage,
    getConfigContext: () => configContextRef,
    getCatalogCounts: () => catalogCounts,
    getIsStreaming: () => isStreamingFlag,
  });
  bridge.markReady();
};

installTestBridge();
```

- [ ] **Step 15.2: Stage and pause for user commit**

```bash
git add src/SERVICEs/test_bridge/index.js
```

---

## Task 16: Wire App.js

**Files:**
- Modify: `src/App.js`

- [ ] **Step 16.1: Add build-time guarded import**

Open `src/App.js`. At the very top of the file (after the very first React import line), add:

```js
if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line global-require
  require("./SERVICEs/test_bridge");
}
```

> CRA inlines `process.env.NODE_ENV` at build time, so this entire block is dead-code-eliminated in production bundles.

- [ ] **Step 16.2: Manual verification**

Run: `npm start`
After PuPu boots, in another terminal:
```bash
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/Library/Application Support/pupu/test-api-port')).port)")
curl -s http://127.0.0.1:$PORT/v1/debug/state | python3 -m json.tool
```
Expected: 200 with a state snapshot JSON (not 503). If still 503, check renderer DevTools console for any error from `installTestBridge`.

- [ ] **Step 16.3: Stage and pause for user commit**

```bash
git add src/App.js
```

---

## Task 17: Component-source registration for sendMessage / cancelMessage

**Files:**
- Modify: `src/PAGEs/chat/chat.js`
- Reference: `src/PAGEs/chat/hooks/use_chat_stream.js` (already exposes `sendNewTurn` as a `useCallback` at ~L2506; `cancelCurrentStreamAndSettleMessages` and `stopStream` at ~L429/L479; `runTurnRequest` at ~L820)

> **Audit note:** `sendNewTurn` reads `inputValueRef.current` and `draftAttachmentsRef.current` — it does NOT take `text` as a parameter. The simplest test API path is to wrap a `sendForTest({ text, attachments })` that calls `runTurnRequest` directly. Check whether `runTurnRequest` is already accessible from `ChatInterface` (it's a `useCallback` returned from the hook). If the hook does not currently return `runTurnRequest`, add it to the hook's return object before continuing.

- [ ] **Step 17.1: Confirm `useChatStream` returns `runTurnRequest` and `stopStream`**

Grep the hook's return object:

```bash
grep -n "return {" /Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js | tail -5
```

Open the return statement and verify `runTurnRequest`, `stopStream` (or equivalent cancel function), and `messagesRef` are in the returned object. If not, add them — they are already defined inside the hook with `useCallback`/`useRef`.

- [ ] **Step 17.2: Add register `useEffect` in `ChatInterface`**

In `src/PAGEs/chat/chat.js`, near the bottom of the `ChatInterface` component (after all hook calls, before the JSX `return`), add:

```js
useEffect(() => {
  if (!window.__pupuTestBridge) return undefined;
  const sendForTest = async ({ id, text, attachments }) => {
    if (id && id !== activeChatIdRef.current) {
      // The handler expects the chat to be active; for cross-chat sends the caller should activate first.
      throw Object.assign(new Error(`chat ${id} is not active; call POST /chats/${id}/activate first`), { code: "chat_not_active", status: 409 });
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const startedAt = Date.now();
      const baseLen = (messagesRef.current || []).length;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(Object.assign(new Error("send timeout"), { code: "ipc_timeout" }));
      }, 5 * 60 * 1000);
      const interval = setInterval(() => {
        if (settled) return;
        const msgs = messagesRef.current || [];
        const last = msgs[msgs.length - 1];
        const grew = msgs.length > baseLen;
        const stillStreaming = streamingChatIdsRef.current.has(activeChatIdRef.current);
        if (grew && !stillStreaming && last && last.role === "assistant" && last.content) {
          clearInterval(interval);
          clearTimeout(timer);
          settled = true;
          resolve({
            message_id: last.id,
            role: "assistant",
            content: last.content,
            tool_calls: last.tool_calls || null,
            finish_reason: last.finish_reason || "stop",
            latency_ms: Date.now() - startedAt,
          });
        }
      }, 100);
      void runTurnRequest({
        mode: "send",
        chatId: activeChatIdRef.current,
        text,
        attachments: attachments || [],
        baseMessages: messagesRef.current,
        clearComposer: true,
        missingAttachmentPayloadMode: "block",
      });
    });
  };
  const cancelForTest = async () => {
    const wasStreaming = streamingChatIdsRef.current.has(activeChatIdRef.current);
    stopStream();
    return { ok: true, was_streaming: wasStreaming };
  };
  const off1 = window.__pupuTestBridge.register("sendMessage", sendForTest);
  const off2 = window.__pupuTestBridge.register("cancelMessage", cancelForTest);
  return () => { off1(); off2(); };
}, [runTurnRequest, stopStream, messagesRef, activeChatIdRef, streamingChatIdsRef]);
```

> **Critical:** all three refs (`messagesRef`, `activeChatIdRef`, `streamingChatIdsRef`) and both callbacks (`runTurnRequest`, `stopStream`) must be present in the dependency array AND must be stable (refs are stable; callbacks are `useCallback`). If `chat.js` does not currently destructure these from `useChatStream`, add them to the destructure.

- [ ] **Step 17.3: Manual end-to-end check**

Run `npm start`. After boot:

```bash
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/Library/Application Support/pupu/test-api-port')).port)")
# 1. Create a chat
CHAT=$(curl -s -X POST http://127.0.0.1:$PORT/v1/chats -H 'content-type: application/json' -d '{"title":"smoke","model":"gpt-5"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['chat_id'])")
# 2. UI should show new chat selected
# 3. Send message
curl -s -X POST http://127.0.0.1:$PORT/v1/chats/$CHAT/messages -H 'content-type: application/json' -d '{"text":"say hi"}'
# 4. UI should show streamed response
```

- [ ] **Step 17.4: Stage and pause for user commit**

```bash
git add src/PAGEs/chat/chat.js src/PAGEs/chat/hooks/use_chat_stream.js
```

---

## Task 18: Modal lifecycle scan + register

**Files:** Each modal component listed below. Find them by:

```bash
grep -rln "useState.*[Mm]odal\|isOpen\|setIsOpen\|[Dd]ialog" src/COMPONENTs --include="*.js" | head -30
```

> **Audit note:** Common known modals (verify against the codebase): `toolkit/ToolkitModal`, `settings/SettingsModal`, character picker, system-prompt editor, recipe picker. The `id` strings are part of the public test API contract — choose stable kebab-case names (e.g., `'toolkit-modal'`, `'settings-modal'`, `'character-picker'`).

- [ ] **Step 18.1: For each modal component, add the hook call**

Inside the component body, alongside other hooks:

```js
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";

// inside component:
useModalLifecycle("toolkit-modal", isOpen);   // replace 'toolkit-modal' and isOpen with the modal's actual id and open-state expression
```

The relative import path depends on the modal's depth. Use the actual path in `src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle`.

- [ ] **Step 18.2: Manual verification**

After modifying each modal:
```bash
# Open a modal in the UI, then:
curl -s http://127.0.0.1:$PORT/v1/debug/state | python3 -c "import sys,json;print(json.load(sys.stdin)['modal_open'])"
```
Expected: list contains the open modal's id. Close the modal → list shrinks.

- [ ] **Step 18.3: Document the chosen ids**

Append the id list to `docs/conventions/test-api.md` (created in Task 22). For now write them on a sticky note for Task 22.

- [ ] **Step 18.4: Stage and pause for user commit**

```bash
git add src/COMPONENTs/
```

---

## Task 19: Client helper script

**Files:**
- Create: `scripts/test-api/client.mjs`

- [ ] **Step 19.1: Implement**

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT_FILE = path.join(os.homedir(), "Library/Application Support/pupu/test-api-port");

const isAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

export const discoverBaseUrl = () => {
  if (!fs.existsSync(PORT_FILE)) {
    throw new Error(`PuPu test API port file not found: ${PORT_FILE} (is PuPu running in dev mode?)`);
  }
  const { port, pid } = JSON.parse(fs.readFileSync(PORT_FILE, "utf8"));
  if (!isAlive(pid)) {
    throw new Error(`port file references dead PID ${pid}; restart PuPu`);
  }
  return `http://127.0.0.1:${port}/v1`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const request = async (method, path, body, { retryOn503 = true, baseUrl } = {}) => {
  const url = `${baseUrl || discoverBaseUrl()}${path}`;
  const init = {
    method,
    headers: body == null ? {} : { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 503 && retryOn503) {
      await sleep(200);
      continue;
    }
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.arrayBuffer();
    if (!res.ok) {
      const err = new Error(typeof data === "object" ? data.error?.message : String(data));
      Object.assign(err, { status: res.status, body: data });
      throw err;
    }
    return data;
  }
  throw new Error("test API not ready after 6s");
};

export const client = {
  baseUrl: discoverBaseUrl,
  GET: (p) => request("GET", p),
  POST: (p, body) => request("POST", p, body),
  PATCH: (p, body) => request("PATCH", p, body),
  DELETE: (p) => request("DELETE", p),
};
```

- [ ] **Step 19.2: Verify import works**

```bash
node -e "import('./scripts/test-api/client.mjs').then(m => console.log(typeof m.client))"
```
Expected: `object`

- [ ] **Step 19.3: Stage and pause for user commit**

```bash
git add scripts/test-api/client.mjs
```

---

## Task 20: Smoke script

**Files:**
- Create: `scripts/test-api/smoke.mjs`

- [ ] **Step 20.1: Implement**

```js
import { client } from "./client.mjs";
import fs from "node:fs";

const log = (...a) => console.log("[smoke]", ...a);
const fail = (msg) => { console.error("[smoke] FAIL:", msg); process.exit(1); };

(async () => {
  log("base url:", client.baseUrl());

  log("listing models...");
  const { models } = await client.GET("/catalog/models");
  if (!models?.length) fail("no models in catalog");
  const model_id = models[0].id;
  log("using model:", model_id);

  log("creating chat...");
  const { chat_id } = await client.POST("/chats", { title: "smoke-test", model: model_id });
  log("chat_id:", chat_id);

  log("sending message...");
  const reply = await client.POST(`/chats/${chat_id}/messages`, { text: "Reply with the single word 'pong' and nothing else." });
  log("reply:", reply.content?.slice(0, 80));
  if (!reply.content) fail("empty assistant content");

  log("taking screenshot...");
  const png = await client.request?.("GET", "/debug/screenshot") ?? await fetch(`${client.baseUrl()}/debug/screenshot`).then((r) => r.arrayBuffer());
  fs.writeFileSync("/tmp/pupu-smoke.png", Buffer.from(png));
  log("screenshot -> /tmp/pupu-smoke.png");

  log("snapshot:");
  const state = await client.GET("/debug/state");
  log(JSON.stringify(state, null, 2));

  log("cleaning up...");
  await client.DELETE(`/chats/${chat_id}`);

  log("OK");
})().catch((e) => fail(e.message));
```

- [ ] **Step 20.2: Run smoke against running PuPu**

Run: `npm start` (in one terminal) → wait for PuPu UI to appear, then:
```bash
node scripts/test-api/smoke.mjs
```
Expected: prints `[smoke] OK`. Inspect `/tmp/pupu-smoke.png` to confirm PuPu UI captured.

- [ ] **Step 20.3: Stage and pause for user commit**

```bash
git add scripts/test-api/smoke.mjs
```

---

## Task 21: API reference docs

**Files:**
- Create: `docs/api-reference/test-api.md`
- Create: `docs/api-reference/test-api-debug.md`

- [ ] **Step 21.1: Write `docs/api-reference/test-api.md`**

```markdown
# Test API (dev only)

A local HTTP REST endpoint for driving PuPu programmatically. **Dev mode only**, bound to `127.0.0.1` on a random port.

## Discovery

The port is written to `$HOME/Library/Application Support/pupu/test-api-port`:

```json
{"port": 49231, "pid": 12345, "started_at": 1714000000000}
```

Use `scripts/test-api/client.mjs` for a Node helper, or `curl` directly.

## Endpoints

Base: `http://127.0.0.1:<port>/v1`

### Chat lifecycle

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats` | `{title?, model?, character_id?, toolkit_ids?}` | `{chat_id, created_at}` |
| GET | `/chats` | — | `{chats: [...]}` |
| GET | `/chats/:id` | — | `{id, title, model, character_id, toolkits, messages}` |
| POST | `/chats/:id/activate` | — | `{ok: true}` |
| PATCH | `/chats/:id` | `{title?}` | `{ok: true}` |
| DELETE | `/chats/:id` | — | `{ok: true}` |

### Messages (blocking only in Phase 1)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats/:id/messages` | `{text, attachments?}` | `{message_id, role, content, tool_calls?, finish_reason, latency_ms}` |
| POST | `/chats/:id/cancel` | — | `{ok, was_streaming}` |

### Catalog and selection

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/catalog/models` | — | `{models: [...]}` |
| GET | `/catalog/toolkits` | — | `{toolkits: [...]}` |
| GET | `/catalog/characters` | — | `{characters: [...]}` |
| POST | `/chats/:id/model` | `{model_id}` | `{ok, model_id}` |
| POST | `/chats/:id/toolkits` | `{toolkit_ids: [...]}` | `{ok}` (override) |
| POST | `/chats/:id/character` | `{character_id\|null}` | `{ok}` |

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_payload` / `invalid_json` | Bad body |
| 404 | `chat_not_found` / `not_found` | Unknown id/route |
| 408 | `ipc_timeout` | Renderer didn't respond |
| 409 | `no_handler` / `chat_not_active` | Command unregistered or chat not active |
| 500 | `handler_error` | Handler threw |
| 503 | `not_ready` | Renderer test bridge not yet `markReady()` |

### Examples

```bash
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/Library/Application Support/pupu/test-api-port')).port)")
BASE="http://127.0.0.1:$PORT/v1"

curl -s -X POST $BASE/chats -H 'content-type: application/json' -d '{"title":"hi","model":"gpt-5"}'
curl -s $BASE/chats
curl -s -X POST $BASE/chats/<id>/messages -H 'content-type: application/json' -d '{"text":"ping"}'
```

See [test-api-debug.md](./test-api-debug.md) for `/debug/*` endpoints.
```

- [ ] **Step 21.2: Write `docs/api-reference/test-api-debug.md`**

```markdown
# Test API — Debug Endpoints

All under `/v1/debug/*`.

## GET `/debug/state`

Returns a structured snapshot of renderer state. Optional `?chat_id=` to scope.

```json
{
  "active_chat_id": "...",
  "active_chat": {"id": "...", "title": "...", "model": "...", "message_count": 3, "last_message_role": "assistant"},
  "current_model": "gpt-5",
  "toolkits_active": ["t1"],
  "character_id": "c1",
  "modal_open": ["toolkit-modal"],
  "is_streaming": false,
  "route": "#/chat",
  "window_state": {"width": 1280, "height": 800, "isDark": true, "locale": "en"},
  "catalog_loaded": {"models": 5, "toolkits": 3, "characters": 2}
}
```

## GET `/debug/logs`

Query: `source=renderer|main` (default renderer), `n=200`, `since=<ts ms>` (exclusive).

```json
{"entries": [{"ts": 1714000000000, "level": "log", "source": "renderer", "msg": "..."}]}
```

## GET `/debug/screenshot`

Query: `format=png|jpeg`, `quality=` (jpeg only). Returns binary image; `Content-Type: image/png` or `image/jpeg`.

## POST `/debug/eval`

Body: `{code, await=true}`. `code` must be ≤64KB. Result must be JSON-serializable.

```bash
curl -s -X POST $BASE/debug/eval -H 'content-type: application/json' \
  -d '{"code":"return document.title","await":false}'
# => {"ok": true, "value": "PuPu"}
```

## GET `/debug/dom`

Query: `selector=` (default `body`). Returns `{"html": "..."}`.
```

- [ ] **Step 21.3: Stage and pause for user commit**

```bash
git add docs/api-reference/test-api.md docs/api-reference/test-api-debug.md
```

---

## Task 22: Conventions doc + CLAUDE.md pointer

**Files:**
- Create: `docs/conventions/test-api.md`
- Modify: `CLAUDE.md`

- [ ] **Step 22.1: Write `docs/conventions/test-api.md`**

```markdown
# Test API Conventions

## Adding a new endpoint

1. Pick a stable URL: `/v1/<noun>/<id?>/<verb?>`. Use HTTP verbs semantically.
2. Register the route in `electron/main/services/test-api/builtin_commands.js`. Choose: dispatch via `bridge.invoke('cmdName', payload)` (renderer-bound) or implement natively (main-only, e.g., screenshot/eval).
3. If renderer-bound, add a handler in either:
   - `src/SERVICEs/test_bridge/handlers/<area>.js` — for service-source ops (handler in module load registers via `bridge.register()`)
   - In a React component with `useEffect(() => __pupuTestBridge.register('cmd', impl); return () => __pupuTestBridge.register('cmd', null))` — for component-source ops that need hook closures
4. Add a Jest test for the handler (mock `chatStorage` / `unchainAPI`).
5. Update `docs/api-reference/test-api.md`.

## Adding a new modal

Whenever you create a new modal/dialog component, add **one line** to make it visible to the test API:

```js
import { useModalLifecycle } from "<relative-path>/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
useModalLifecycle("my-modal-id", isOpen);
```

Choose a stable kebab-case id. The id becomes part of `/v1/debug/state` payload (`modal_open`).

### Registered modal ids

| id | component | location |
|---|---|---|
| `toolkit-modal` | `ToolkitModal` | `src/COMPONENTs/toolkit/...` |
| _(add others as you wire them up in Task 18)_ | | |

## Component-source handler rules

- The handler `impl` must be a stable reference (`useCallback`). Otherwise re-renders re-register and create races with in-flight calls.
- Always include the cleanup `return () => __pupuTestBridge.register('cmd', null)` so unmounted components don't leave stale handlers.
- Last-mount-wins: the most recently mounted instance receives the call. In multi-window setups the active focus window is the one that handles requests. (Phase 2 will introduce keyed routing.)

## Production safety

- The whole stack is gated by `process.env.NODE_ENV !== 'production'`. CRA inlines this constant at build time, so prod bundles do not include the `test_bridge` module.
- An additional kill-switch: `PUPU_TEST_API_DISABLE=1` env var stops the server even in dev mode.
- Server binds 127.0.0.1 only. No auth — the binding is the security boundary.
```

- [ ] **Step 22.2: Modify `CLAUDE.md`**

Open `/Users/red/Desktop/GITRepo/PuPu/.claude/CLAUDE.md`. Under the "Documentation" section table, add a row:

| Test API | `docs/api-reference/test-api.md` (dev only) |

- [ ] **Step 22.3: Stage and pause for user commit**

```bash
git add docs/conventions/test-api.md .claude/CLAUDE.md
```

---

## Task 23: Production bundle verification

**Files:** none (verification only)

- [ ] **Step 23.1: Build production bundle**

Run: `npm run version:prepare-build && npm run build:electron:mac`
Expected: build succeeds.

- [ ] **Step 23.2: Verify test_bridge code is not in renderer bundle**

```bash
grep -rn "__pupuTestBridge\|test_bridge" build/ dist/ 2>/dev/null | grep -v ".map" | head
```
Expected: **no matches** in compiled JS bundles. If matches appear, the build-time guard in `src/App.js` failed; check that CRA's `process.env.NODE_ENV` substitution is enabled (it is by default for `react-scripts build`).

- [ ] **Step 23.3: Verify port file not created in prod**

Launch the built app (`open dist/mac-arm64/*.app`). After it boots, check:

```bash
ls -la "$HOME/Library/Application Support/pupu/test-api-port" 2>&1
```
Expected: `No such file or directory`.

- [ ] **Step 23.4: Verify HTTP server not listening in prod**

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -i pupu
```
Expected: no test-api port listed (PuPu may have unrelated listeners).

- [ ] **Step 23.5: Done — final checkpoint**

Tell the user: "Phase 1 complete. All 23 tasks done. Production build verified clean. Smoke script ready: `node scripts/test-api/smoke.mjs`. Phase 2 (SSE streaming, Flask logs, capability discovery) is in the spec under `Phase 2`."

---

## Phase 2 (out of scope for this plan)

These were explicitly deferred during brainstorming:

- `stream=true` SSE message responses (use `test-bridge:event` channel for token frames)
- `unchain_runtime` `/internal/logs/tail` Python endpoint + `main` proxy to `/v1/debug/logs?source=flask`
- `GET /v1` capability discovery
- Settings/system-prompt/import-export/theme operations
- Multi-window keyed handler routing (today: last-mount-wins)
