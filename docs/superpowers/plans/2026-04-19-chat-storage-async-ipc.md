# Chat Storage Async IPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do NOT commit — the user commits manually. Stop at the end of each task with changes staged but uncommitted.**

**Goal:** Move chat store persistence off renderer's synchronous `localStorage.setItem`/`getItem` onto an async Electron IPC + main-process file IO pipeline, so clicking to switch chats no longer stalls the main thread while the full chats store is parsed/serialised/written.

**Architecture:**
- Main process owns a **single source-of-truth in-memory `store` object** loaded from `{userData}/chats.json` at app boot (before any BrowserWindow is created). A service exposes `getBootstrapSnapshot()` (sync) and `write(store)` (async, debounced, atomic `.tmp` → `rename`). `before-quit` triggers `flushSync()`.
- Renderer's `chat_storage_store.js` is refactored around a module-level memory mirror. Bootstrap pulls the snapshot once via `ipcRenderer.sendSync` (main just returns its already-loaded in-memory copy — no disk IO on the synchronous call). Subsequent mutations update the mirror and fire-and-forget `ipcRenderer.send` the full store to main; main debounces the disk write.
- A thin **backend adapter** (`chat_storage_backend.js`) hides the IPC/localStorage choice so `chat_storage_store.js` stays agnostic. In tests and pure web builds where `window.chatStorageAPI` is absent, the adapter falls back to the existing localStorage path so all 30+ existing `chat_storage.*.test.js` suites stay green.
- First-run migration: on app boot, if `chats.json` does not exist, renderer's bootstrap detects an empty payload from main, reads the legacy `localStorage.chatsStore` one last time, persists it through the new path, and tags localStorage with a migration marker to avoid re-doing it.

**Tech Stack:** Electron 40 (ipcMain/ipcRenderer, contextBridge, `fs.promises`), React 19 (unchanged), existing Jest + CJS test harness for `electron/tests/**`, CRA Jest for `src/**`.

---

## File Structure

### New files

| Path | Role |
|---|---|
| `electron/main/services/chat_storage/service.js` | Main-process service: `init`, `getBootstrapSnapshot`, `write` (debounced, atomic), `flushSync`. |
| `electron/main/services/chat_storage/register_handlers.js` | Exposes `registerChatStorageHandlers({ ipcMain, chatStorageService })` + channel-arrays for parity tests. |
| `electron/preload/bridges/chat_storage_bridge.js` | `createChatStorageBridge(ipcRenderer)` → `{ bootstrap, write }`. |
| `src/SERVICEs/chat_storage/chat_storage_backend.js` | Renderer adapter: prefers `window.chatStorageAPI`, falls back to localStorage. |
| `electron/tests/main/chat_storage_service.test.cjs` | Unit tests for main service. |
| `electron/tests/main/chat_storage_handlers.test.cjs` | Registration & routing tests. |
| `electron/tests/preload/chat_storage_bridge.test.cjs` | Preload bridge tests. |
| `src/SERVICEs/chat_storage/chat_storage_backend.test.js` | Backend adapter tests (both code paths). |

### Modified files

| Path | Change |
|---|---|
| `electron/shared/channels.js` | Add `CHANNELS.CHAT_STORAGE = { BOOTSTRAP_READ, WRITE }`. |
| `electron/preload/channels.js` | Include the two new channels in `PRELOAD_SEND_CHANNELS` (write) and a new `PRELOAD_SEND_SYNC_CHANNELS` (bootstrap). |
| `electron/preload/index.js` | Instantiate bridge, expose `window.chatStorageAPI`. |
| `electron/main/index.js` | Create + `init()` chat storage service before BrowserWindow; wire `before-quit` flush. |
| `electron/main/ipc/register_handlers.js` | Call `registerChatStorageHandlers`; add new channels to `IPC_ON_CHANNELS` / `IPC_ON_SYNC_CHANNELS`. |
| `src/SERVICEs/chat_storage/chat_storage_store.js` | Replace direct `localStorage.*` inside `readStore`/`writeStore` with memory mirror + `backend.persist`. Bootstrap loads mirror via `backend.readBootstrap()`. |

---

### Task 1: Channels — declare IPC surface

**Files:**
- Modify: `electron/shared/channels.js`
- Modify: `electron/preload/channels.js`

- [ ] **Step 1: Add CHAT_STORAGE to shared channels**

Edit `electron/shared/channels.js` — append a new frozen section inside the main object (order alphabetical by group):

```js
  CHAT_STORAGE: Object.freeze({
    BOOTSTRAP_READ: "chat-storage:bootstrap-read",
    WRITE: "chat-storage:write",
  }),
```

- [ ] **Step 2: Register the new channels on the preload side**

Edit `electron/preload/channels.js`. Add a new frozen export for sendSync channels and include `WRITE` in the existing send list:

```js
const PRELOAD_SEND_SYNC_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
]);
```

Inside `PRELOAD_SEND_CHANNELS` add at the bottom:

```js
  CHANNELS.CHAT_STORAGE.WRITE,
```

And extend the module.exports:

```js
module.exports = {
  PRELOAD_INVOKE_CHANNELS,
  PRELOAD_SEND_CHANNELS,
  PRELOAD_SEND_SYNC_CHANNELS,
  PRELOAD_EVENT_CHANNELS,
};
```

- [ ] **Step 3: Run the parity test to confirm it now expects new handlers**

Run:

```bash
CI=true npm test -- --testPathPattern='electron/tests/main/ipc_channels' --passWithNoTests
```

Expected: either the existing parity test fails because the new channels have no handler yet, or it still passes (if the parity test does not yet include `PRELOAD_SEND_SYNC_CHANNELS`). Either way we note the diff — Task 2 / Task 4 will add the handler registration to close parity.

- [ ] **Step 4: Stop — leave changes uncommitted**

Changes from Task 1 stage only the two channel-manifest files. User will commit when satisfied. Do not run `git commit`.

---

### Task 2: Main-process chat storage service

**Files:**
- Create: `electron/main/services/chat_storage/service.js`
- Create: `electron/tests/main/chat_storage_service.test.cjs`

- [ ] **Step 1: Write the failing test file first**

Create `electron/tests/main/chat_storage_service.test.cjs`:

```js
const path = require("path");
const os = require("os");
const fs = require("fs");
const fsp = require("fs/promises");

const { createChatStorageService } = require(
  "../../main/services/chat_storage/service",
);

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-chat-storage-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

describe("chat storage service", () => {
  let dir;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("init returns null snapshot when no chats.json exists", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 10,
    });
    await service.init();
    expect(service.getBootstrapSnapshot()).toBeNull();
  });

  test("init reads the existing chats.json synchronously-visible snapshot", async () => {
    const payload = { activeChatId: "a", chatsById: { a: { id: "a" } } };
    fs.writeFileSync(
      path.join(dir, "chats.json"),
      JSON.stringify(payload),
      "utf8",
    );
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 10,
    });
    await service.init();
    expect(service.getBootstrapSnapshot()).toEqual(payload);
  });

  test("write debounces multiple calls into a single file write", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 20,
    });
    await service.init();

    service.write({ n: 1 });
    service.write({ n: 2 });
    service.write({ n: 3 });

    await new Promise((resolve) => setTimeout(resolve, 40));
    const raw = fs.readFileSync(path.join(dir, "chats.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ n: 3 });
  });

  test("write is atomic — tmp file rename, never half-written", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 10,
    });
    await service.init();
    service.write({ atomic: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const entries = fs.readdirSync(dir);
    expect(entries).toContain("chats.json");
    expect(entries.every((name) => !name.endsWith(".tmp"))).toBe(true);
  });

  test("flushSync persists the latest pending write before returning", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 1000,
    });
    await service.init();
    service.write({ final: "yes" });
    service.flushSync();

    const raw = fs.readFileSync(path.join(dir, "chats.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ final: "yes" });
  });

  test("getBootstrapSnapshot reflects the most recent write (memory mirror)", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 50,
    });
    await service.init();
    expect(service.getBootstrapSnapshot()).toBeNull();

    service.write({ mirror: 1 });
    expect(service.getBootstrapSnapshot()).toEqual({ mirror: 1 });
  });
});
```

- [ ] **Step 2: Run the suite and confirm it fails because the module does not exist yet**

Run:

```bash
CI=true npm test -- --testPathPattern='electron/tests/main/chat_storage_service' --passWithNoTests
```

Expected: all 6 tests fail / module not found.

- [ ] **Step 3: Implement the service**

Create `electron/main/services/chat_storage/service.js`:

```js
const DEFAULT_DEBOUNCE_MS = 150;
const FILE_NAME = "chats.json";
const TMP_SUFFIX = ".tmp";

const createChatStorageService = ({
  app,
  fs,
  fsp,
  path,
  debounceMs = DEFAULT_DEBOUNCE_MS,
} = {}) => {
  if (!app || !fs || !fsp || !path) {
    throw new Error("createChatStorageService: missing dependencies");
  }

  let memoryStore = null;
  let pendingPayload = null;
  let debounceTimer = null;
  let lastWritePromise = Promise.resolve();
  let resolvedFilePath = null;
  let resolvedTmpPath = null;

  const resolvePaths = () => {
    if (resolvedFilePath) return;
    const userDataDir = app.getPath("userData");
    resolvedFilePath = path.join(userDataDir, FILE_NAME);
    resolvedTmpPath = resolvedFilePath + TMP_SUFFIX;
  };

  const init = async () => {
    resolvePaths();
    try {
      const raw = await fsp.readFile(resolvedFilePath, "utf8");
      memoryStore = JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        memoryStore = null;
        return;
      }
      console.warn("[chat-storage] failed to read chats.json:", error.message);
      memoryStore = null;
    }
  };

  const getBootstrapSnapshot = () => memoryStore;

  const persistPayloadAsync = async (payload) => {
    resolvePaths();
    const json = JSON.stringify(payload);
    await fsp.writeFile(resolvedTmpPath, json, "utf8");
    await fsp.rename(resolvedTmpPath, resolvedFilePath);
  };

  const persistPayloadSync = (payload) => {
    resolvePaths();
    const json = JSON.stringify(payload);
    fs.writeFileSync(resolvedTmpPath, json, "utf8");
    fs.renameSync(resolvedTmpPath, resolvedFilePath);
  };

  const scheduleWrite = () => {
    if (debounceTimer !== null) {
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const payload = pendingPayload;
      pendingPayload = null;
      if (payload === null) {
        return;
      }
      lastWritePromise = persistPayloadAsync(payload).catch((error) => {
        console.error("[chat-storage] async write failed:", error);
      });
    }, debounceMs);
  };

  const write = (nextStore) => {
    memoryStore = nextStore;
    pendingPayload = nextStore;
    scheduleWrite();
  };

  const flushSync = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingPayload !== null) {
      try {
        persistPayloadSync(pendingPayload);
      } catch (error) {
        console.error("[chat-storage] sync flush failed:", error);
      }
      pendingPayload = null;
    }
  };

  const drain = () => lastWritePromise;

  return {
    init,
    getBootstrapSnapshot,
    write,
    flushSync,
    drain,
  };
};

module.exports = { createChatStorageService };
```

- [ ] **Step 4: Run the tests again and confirm all 6 pass**

Run:

```bash
CI=true npm test -- --testPathPattern='electron/tests/main/chat_storage_service'
```

Expected: 6 passed, 6 total.

- [ ] **Step 5: Stop — leave changes uncommitted**

---

### Task 3: Main-process IPC handlers + wiring

**Files:**
- Create: `electron/main/services/chat_storage/register_handlers.js`
- Create: `electron/tests/main/chat_storage_handlers.test.cjs`
- Modify: `electron/main/ipc/register_handlers.js`
- Modify: `electron/main/index.js`

- [ ] **Step 1: Write the handler test first**

Create `electron/tests/main/chat_storage_handlers.test.cjs`:

```js
const {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
} = require(
  "../../main/services/chat_storage/register_handlers",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcMain = () => {
  const syncHandlers = new Map();
  const onHandlers = new Map();
  return {
    on(channel, handler) {
      onHandlers.set(channel, handler);
    },
    onSync(channel, handler) {
      syncHandlers.set(channel, handler);
    },
    emitSync(channel, payload) {
      const handler = syncHandlers.get(channel);
      if (!handler) throw new Error(`no sync handler for ${channel}`);
      const event = { returnValue: undefined };
      handler(event, payload);
      return event.returnValue;
    },
    emit(channel, payload) {
      const handler = onHandlers.get(channel);
      if (!handler) throw new Error(`no on handler for ${channel}`);
      handler({}, payload);
    },
  };
};

// Our real code uses ipcMain.on for both sync + async; sync responses come via
// event.returnValue.  This shim keeps them distinct only for testing clarity —
// the production registration function just calls ipcMain.on twice.

describe("chat storage IPC handlers", () => {
  test("bootstrap-read returns current snapshot via event.returnValue", () => {
    const snapshot = { active: "a" };
    const service = {
      getBootstrapSnapshot: () => snapshot,
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const bootstrapCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(bootstrapCall).toBeDefined();
    const handler = bootstrapCall[1];
    const event = {};
    handler(event);
    expect(event.returnValue).toEqual(snapshot);
  });

  test("write dispatches payload to service.write", () => {
    const service = {
      getBootstrapSnapshot: () => null,
      write: jest.fn(),
    };
    const ipcMain = { on: jest.fn() };
    registerChatStorageHandlers({ ipcMain, chatStorageService: service });

    const writeCall = ipcMain.on.mock.calls.find(
      ([channel]) => channel === CHANNELS.CHAT_STORAGE.WRITE,
    );
    expect(writeCall).toBeDefined();
    const handler = writeCall[1];
    const payload = { foo: "bar" };
    handler({}, payload);
    expect(service.write).toHaveBeenCalledWith(payload);
  });

  test("exports channel lists for parity checks", () => {
    expect(CHAT_STORAGE_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(CHAT_STORAGE_ON_CHANNELS).toContain(CHANNELS.CHAT_STORAGE.WRITE);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
CI=true npm test -- --testPathPattern='electron/tests/main/chat_storage_handlers' --passWithNoTests
```

Expected: module not found / 3 failing.

- [ ] **Step 3: Implement the handler module**

Create `electron/main/services/chat_storage/register_handlers.js`:

```js
const { CHANNELS } = require("../../../shared/channels");

const CHAT_STORAGE_SYNC_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
]);

const CHAT_STORAGE_ON_CHANNELS = Object.freeze([
  CHANNELS.CHAT_STORAGE.WRITE,
]);

const registerChatStorageHandlers = ({ ipcMain, chatStorageService }) => {
  if (!ipcMain || !chatStorageService) {
    throw new Error("registerChatStorageHandlers: missing dependencies");
  }

  ipcMain.on(CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ, (event) => {
    try {
      event.returnValue = chatStorageService.getBootstrapSnapshot();
    } catch (error) {
      console.error("[chat-storage] bootstrap-read failed:", error);
      event.returnValue = null;
    }
  });

  ipcMain.on(CHANNELS.CHAT_STORAGE.WRITE, (_event, payload) => {
    try {
      chatStorageService.write(payload);
    } catch (error) {
      console.error("[chat-storage] write failed:", error);
    }
  });
};

module.exports = {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
};
```

- [ ] **Step 4: Wire handler registration into the main IPC setup**

Edit `electron/main/ipc/register_handlers.js`:

- At the top, import:

```js
const {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
} = require("../services/chat_storage/register_handlers");
```

- Extend the `registerIpcHandlers` parameter object and call registration — the existing function signature takes `{ ipcMain, ..., unchainService, screenshotService }`; add `chatStorageService` and call registration at the top of the function body:

```js
  registerChatStorageHandlers({ ipcMain, chatStorageService });
```

- Change the `IPC_ON_CHANNELS` export so it includes the new `CHAT_STORAGE_ON_CHANNELS`. If the file currently declares `IPC_ON_CHANNELS` as a concrete array, change it to `[...existing, ...CHAT_STORAGE_ON_CHANNELS]`. Add a new exported array `IPC_ON_SYNC_CHANNELS = CHAT_STORAGE_SYNC_CHANNELS`.

- [ ] **Step 5: Wire service creation into `electron/main/index.js`**

Edit `electron/main/index.js`:

- Add require near the top with the other service imports:

```js
const { createChatStorageService } = require("./services/chat_storage/service");
```

- Inside the `gotSingleInstanceLock` branch, right after `runtimeService` is created, add:

```js
const fsp = require("fs/promises");
const chatStorageService = createChatStorageService({
  app,
  fs,
  fsp,
  path,
});
```

- Find the existing `app.whenReady().then(async () => { ... })` block (or equivalent). Before any BrowserWindow creation and before `registerIpcHandlers(...)` inside it, `await chatStorageService.init()`.

- Pass `chatStorageService` into the `registerIpcHandlers` call:

```js
registerIpcHandlers({
  ipcMain,
  ... // existing args
  chatStorageService,
});
```

- Register a `before-quit` hook to flush pending writes synchronously:

```js
app.on("before-quit", () => {
  chatStorageService.flushSync();
});
```

- [ ] **Step 6: Update the IPC parity test to cover the new sync channels**

Edit `electron/tests/main/ipc_channels.test.cjs`. Require the new exports:

```js
const {
  IPC_HANDLE_CHANNELS,
  IPC_ON_CHANNELS,
  IPC_ON_SYNC_CHANNELS,
  MAIN_EVENT_CHANNELS,
} = require("../../main/ipc/register_handlers");
const {
  PRELOAD_INVOKE_CHANNELS,
  PRELOAD_SEND_CHANNELS,
  PRELOAD_SEND_SYNC_CHANNELS,
  PRELOAD_EVENT_CHANNELS,
} = require("../../preload/channels");
```

Add a new parity test block:

```js
test("preload sendSync channels are registered in main sync handlers", () => {
  const mainSync = new Set(IPC_ON_SYNC_CHANNELS);
  PRELOAD_SEND_SYNC_CHANNELS.forEach((channel) => {
    expect(mainSync.has(channel)).toBe(true);
  });
});
```

- [ ] **Step 7: Run the full electron main test suite to verify**

```bash
CI=true npm test -- --testPathPattern='electron/tests/main'
```

Expected: all existing tests still pass, new handler tests pass, parity tests pass.

- [ ] **Step 8: Stop — leave changes uncommitted**

---

### Task 4: Preload bridge — `window.chatStorageAPI`

**Files:**
- Create: `electron/preload/bridges/chat_storage_bridge.js`
- Create: `electron/tests/preload/chat_storage_bridge.test.cjs`
- Modify: `electron/preload/index.js`

- [ ] **Step 1: Write the bridge test first**

Create `electron/tests/preload/chat_storage_bridge.test.cjs`:

```js
const { createChatStorageBridge } = require(
  "../../preload/bridges/chat_storage_bridge",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcRenderer = ({ syncReturn } = {}) => ({
  sendSync: jest.fn(() => syncReturn),
  send: jest.fn(),
});

describe("chatStorageAPI bridge", () => {
  test("bootstrap performs a synchronous IPC call and returns the payload", () => {
    const syncReturn = { activeChatId: "x" };
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn });
    const api = createChatStorageBridge(ipcRenderer);

    const snapshot = api.bootstrap();

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(snapshot).toEqual(syncReturn);
  });

  test("bootstrap returns null when IPC yields nothing", () => {
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn: undefined });
    const api = createChatStorageBridge(ipcRenderer);
    expect(api.bootstrap()).toBeNull();
  });

  test("write fires send (no round-trip)", () => {
    const ipcRenderer = makeFakeIpcRenderer();
    const api = createChatStorageBridge(ipcRenderer);
    const payload = { chatsById: {} };

    api.write(payload);

    expect(ipcRenderer.send).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.WRITE,
      payload,
    );
  });

  test("write swallows errors from ipcRenderer.send", () => {
    const ipcRenderer = {
      sendSync: () => null,
      send: jest.fn(() => {
        throw new Error("boom");
      }),
    };
    const api = createChatStorageBridge(ipcRenderer);
    expect(() => api.write({})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
CI=true npm test -- --testPathPattern='electron/tests/preload/chat_storage_bridge' --passWithNoTests
```

- [ ] **Step 3: Implement the bridge**

Create `electron/preload/bridges/chat_storage_bridge.js`:

```js
const { CHANNELS } = require("../../shared/channels");

const createChatStorageBridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createChatStorageBridge: ipcRenderer is required");
  }

  const bootstrap = () => {
    try {
      const value = ipcRenderer.sendSync(
        CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
      );
      return value == null ? null : value;
    } catch (error) {
      console.error("[chat-storage] bootstrap IPC failed:", error);
      return null;
    }
  };

  const write = (payload) => {
    try {
      ipcRenderer.send(CHANNELS.CHAT_STORAGE.WRITE, payload);
    } catch (error) {
      console.error("[chat-storage] write IPC failed:", error);
    }
  };

  return { bootstrap, write };
};

module.exports = { createChatStorageBridge };
```

- [ ] **Step 4: Expose the bridge in preload entry**

Edit `electron/preload/index.js`. Add require:

```js
const {
  createChatStorageBridge,
} = require("./bridges/chat_storage_bridge");
```

After the other `contextBridge.exposeInMainWorld` calls, add:

```js
contextBridge.exposeInMainWorld(
  "chatStorageAPI",
  createChatStorageBridge(ipcRenderer),
);
```

- [ ] **Step 5: Run preload tests**

```bash
CI=true npm test -- --testPathPattern='electron/tests/preload'
```

Expected: all pass.

- [ ] **Step 6: Stop — leave changes uncommitted**

---

### Task 5: Renderer backend adapter

**Files:**
- Create: `src/SERVICEs/chat_storage/chat_storage_backend.js`
- Create: `src/SERVICEs/chat_storage/chat_storage_backend.test.js`

- [ ] **Step 1: Write the failing test first**

Create `src/SERVICEs/chat_storage/chat_storage_backend.test.js`:

```js
import {
  createChatStorageBackend,
  LEGACY_LOCALSTORAGE_KEY,
  MIGRATION_MARKER_KEY,
} from "./chat_storage_backend";

describe("chat storage backend adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.chatStorageAPI;
  });

  test("prefers window.chatStorageAPI when present", () => {
    const bootstrapValue = { activeChatId: "a" };
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => bootstrapValue),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(bootstrapValue);
    expect(window.chatStorageAPI.bootstrap).toHaveBeenCalled();

    backend.persist({ foo: "bar" });
    expect(window.chatStorageAPI.write).toHaveBeenCalledWith({ foo: "bar" });
  });

  test("falls back to localStorage when window.chatStorageAPI is absent", () => {
    const stored = { activeChatId: "legacy" };
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(stored),
    );

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(stored);

    backend.persist({ v2: true });
    expect(
      JSON.parse(window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)),
    ).toEqual({ v2: true });
  });

  test("returns null when neither IPC nor localStorage has data", () => {
    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toBeNull();
  });

  test("when IPC bootstrap is null but legacy localStorage exists, migrate once and tag", () => {
    const legacy = { activeChatId: "migrate-me" };
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(legacy),
    );
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: writeSpy,
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(legacy);
    expect(writeSpy).toHaveBeenCalledWith(legacy);
    expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).not.toBeNull();
  });

  test("skips legacy migration when marker already present", () => {
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify({ stale: true }),
    );
    window.localStorage.setItem(MIGRATION_MARKER_KEY, "2026-04-19T00:00:00Z");
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: writeSpy,
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm all 5 fail**

```bash
CI=true npm test -- --testPathPattern='chat_storage_backend'
```

- [ ] **Step 3: Implement the backend adapter**

Create `src/SERVICEs/chat_storage/chat_storage_backend.js`:

```js
import { CHATS_STORAGE_KEY } from "./chat_storage_constants";

export const LEGACY_LOCALSTORAGE_KEY = CHATS_STORAGE_KEY;
export const MIGRATION_MARKER_KEY = `${CHATS_STORAGE_KEY}__migrated_to_ipc`;

const readLegacyFromLocalStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeLegacyToLocalStorage = (payload) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // quota exceeded — swallow, renderer-level LRU already caps size
  }
};

const markMigrationDone = () => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      MIGRATION_MARKER_KEY,
      new Date().toISOString(),
    );
  } catch {
    // ignore
  }
};

export const createChatStorageBackend = () => {
  const ipcApi =
    typeof window !== "undefined" && window.chatStorageAPI
      ? window.chatStorageAPI
      : null;

  const readBootstrap = () => {
    if (!ipcApi) {
      return readLegacyFromLocalStorage();
    }

    const ipcSnapshot = ipcApi.bootstrap();
    if (ipcSnapshot) {
      return ipcSnapshot;
    }

    const alreadyMigrated =
      typeof window !== "undefined" &&
      window.localStorage &&
      window.localStorage.getItem(MIGRATION_MARKER_KEY);
    if (alreadyMigrated) {
      return null;
    }

    const legacy = readLegacyFromLocalStorage();
    if (!legacy) return null;

    try {
      ipcApi.write(legacy);
    } catch {
      // if the write fails, we still hand legacy data back to the renderer
      // so at least the UI reflects it — migration will retry next boot
      return legacy;
    }
    markMigrationDone();
    return legacy;
  };

  const persist = (store) => {
    if (ipcApi) {
      ipcApi.write(store);
      return;
    }
    writeLegacyToLocalStorage(store);
  };

  return { readBootstrap, persist };
};
```

- [ ] **Step 4: Run tests and confirm all 5 pass**

```bash
CI=true npm test -- --testPathPattern='chat_storage_backend'
```

- [ ] **Step 5: Stop — leave changes uncommitted**

---

### Task 6: Refactor renderer store to use backend

**Files:**
- Modify: `src/SERVICEs/chat_storage/chat_storage_store.js`

- [ ] **Step 1: Snapshot the current failing-test baseline**

Run the full chat_storage test suite to confirm current green state before changes:

```bash
CI=true npm test -- --testPathPattern='SERVICEs/chat_storage'
```

Expected: all chat_storage.*.test.js suites pass. Note the count — this is the regression target for Step 4.

- [ ] **Step 2: Introduce memory mirror + backend inside `chat_storage_store.js`**

Edit `src/SERVICEs/chat_storage/chat_storage_store.js`:

- At the top (after the last `import`), add:

```js
import { createChatStorageBackend } from "./chat_storage_backend";

const storageBackend = createChatStorageBackend();
let memoryStore = null;

const ensureMemoryStoreLoaded = () => {
  if (memoryStore !== null) return memoryStore;
  const bootstrap = storageBackend.readBootstrap();
  memoryStore = bootstrap ? normalizeStore(bootstrap) : createEmptyStoreV2();
  return memoryStore;
};
```

- Replace the body of `readStore` (around the current localStorage parse) with:

```js
const readStore = () => {
  return ensureMemoryStoreLoaded();
};
```

- Replace the body of `writeStore` so that the localStorage branch is replaced by a backend call. The existing logic that runs `normalizeStore`, `dropLeastRecentlyUsedChats`, and a second `normalizeStore` stays intact — we only change how the final `finalized` object is persisted:

```js
const writeStore = (store, options = {}) => {
  const normalized = normalizeStore(store);
  const bounded = dropLeastRecentlyUsedChats(normalized);
  const finalized = normalizeStore(bounded);
  const emit = options.emit !== false;
  const event = {
    type: options.type || "store_write",
    source: options.source || "unknown",
  };

  memoryStore = finalized;
  try {
    storageBackend.persist(finalized);
  } catch (error) {
    console.error("[chat-storage] backend persist failed:", error);
  }

  if (emit) emitStoreChange(finalized, event);
  return finalized;
};
```

- Remove the quota-exceeded fallback branch that previously constructed a minimal `fallback` store — that logic was guarding a localStorage quota overflow, which no longer applies now that persistence is fire-and-forget IPC (main process has no quota). If the renderer still needs to guard against backend write failures, the `try/catch` above already swallows and logs.

- [ ] **Step 3: Run the full chat_storage test suite and assert the same green count as Step 1**

```bash
CI=true npm test -- --testPathPattern='SERVICEs/chat_storage'
```

Expected: identical number of passing tests to Step 1. No regressions.

If any test fails because it hand-rolled `window.localStorage.setItem(CHATS_STORAGE_KEY, ...)` as setup, understand that in jest-jsdom there is no `window.chatStorageAPI`, so the backend adapter's `readBootstrap()` will still read legacy localStorage, and `persist()` will still write to legacy localStorage. The existing setup should keep working. If a test breaks, investigate the specific fail — do not loosen assertions.

- [ ] **Step 4: Run the PAGEs/chat test suite for integration sanity**

```bash
CI=true npm test -- --testPathPattern='PAGEs/chat'
```

Expected: all existing tests still green.

- [ ] **Step 5: Stop — leave changes uncommitted**

---

### Task 7: Whole-system verification

**Files:** (none — verification only)

- [ ] **Step 1: Run the full project test matrix**

```bash
CI=true npm test -- --testPathPattern='SERVICEs/chat_storage|PAGEs/chat|COMPONENTs/chat-bubble|COMPONENTs/chat-messages'
```

Expected: all previously green suites remain green.

- [ ] **Step 2: Run the electron-side tests**

```bash
CI=true npm test -- --testPathPattern='electron/tests'
```

Expected: all electron parity + handler + bridge + service tests pass.

- [ ] **Step 3: Lint modified files**

```bash
npx eslint \
  electron/shared/channels.js \
  electron/preload/channels.js \
  electron/preload/index.js \
  electron/preload/bridges/chat_storage_bridge.js \
  electron/main/index.js \
  electron/main/ipc/register_handlers.js \
  electron/main/services/chat_storage/service.js \
  electron/main/services/chat_storage/register_handlers.js \
  src/SERVICEs/chat_storage/chat_storage_store.js \
  src/SERVICEs/chat_storage/chat_storage_backend.js
```

Expected: no warnings.

- [ ] **Step 4: Impact analysis via gitnexus (if available)**

```bash
npx gitnexus detect_changes --scope=all 2>/dev/null || echo "gitnexus unavailable — skip"
```

Expected: only the files listed in Task 1–6 should appear.

- [ ] **Step 5: Manual performance verification**

- Launch dev build: `npm start`.
- Create / open at least 5 chats, each containing 20+ messages with code blocks, so the chats store is non-trivial (~500 KB – 2 MB).
- Click between chats rapidly. Observe that the click-to-paint latency for the entering chat feels instant (sub-100 ms) instead of the prior ~500 ms stall.
- Open DevTools → Performance. Record a 3-second trace covering a chat switch. The Main thread should no longer have a large synchronous block attributable to `localStorage.setItem` or `JSON.stringify`.
- Kill the app while a write was just scheduled (e.g. immediately after typing in the input). Relaunch. Verify the draft was persisted (`before-quit` flushSync path).
- For the first launch after this change: verify migration happened. Close the app, reopen DevTools on next launch and check `localStorage.getItem(<MIGRATION_MARKER_KEY>)` is set. Legacy `localStorage.chatsStore` may still exist as a one-time backup.

- [ ] **Step 6: Stop — leave changes uncommitted**

User will create the commits.

---

## Self-Review

- **Spec coverage:**
  - "Move persistence off synchronous localStorage" — covered by Tasks 2–6.
  - "Bootstrap must remain fast (no async await before first paint)" — satisfied: main-process service preloads the file before any BrowserWindow exists, renderer pulls via `sendSync` against a memory cache (no disk IO on the sync path).
  - "All existing `chat_storage.*.test.js` suites must remain green" — Task 5 backend adapter provides localStorage fallback specifically so jsdom tests keep working unchanged; Task 6 verifies regression.
  - "Data must not be lost on crash" — atomic `.tmp` → `rename`; `before-quit` `flushSync`; renderer memory mirror always reflects latest committed state.
  - "First-run migration from localStorage must happen exactly once" — `MIGRATION_MARKER_KEY` gate in backend adapter.
  - "Respect user rule: do not commit" — no task contains `git commit`.

- **Placeholder scan:**
  - Every code step lists concrete file, concrete code, concrete command. No "etc.", "similar to", or "TODO".

- **Type consistency:**
  - Service API: `init()`, `getBootstrapSnapshot()`, `write(store)`, `flushSync()`, `drain()` — same names in service, handler, index wiring, and tests.
  - Bridge API: `bootstrap()`, `write(payload)` — same names in bridge, backend adapter, and tests.
  - Channel constants: `CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ`, `CHANNELS.CHAT_STORAGE.WRITE` — referenced identically everywhere.
  - Migration marker: `MIGRATION_MARKER_KEY` — defined and exported once in `chat_storage_backend.js`.

No gaps detected. Plan ready.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-19-chat-storage-async-ipc.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, inter-task review, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Pick one when ready. Reminder: the user commits manually — each task's "Stop — leave changes uncommitted" checkpoint is load-bearing.
