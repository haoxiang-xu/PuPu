// The transport hop of the Skeleton chat selection (#356, BC-001).
//
// The renderer builds `options.skeleton_selection` and the server compares its
// key set exactly. Between them sits this process, which is the one place that
// rewrites `payload.options` — it resolves a workspace root into it and injects
// provider secrets. So "the renderer sends three keys" is only half a claim:
// what Flask receives is what admission sees, and that is what this asserts.
//
// The object driven in here is the one the real chat page produced, copied from
// the frozen capture `skeleton_chat_selection_capture.js`
// (`CAPTURED_RENDERER_PAYLOAD`), not a hand-made lookalike.
//
// No provider is called and no secret is needed: admission happens server-side
// and this stops at the POST body.

const previousMemoryRolloutMode = process.env.PUPU_MEMORY_V2_MODE;
beforeEach(() => {
  process.env.PUPU_MEMORY_V2_MODE = "off";
});
afterEach(() => {
  if (previousMemoryRolloutMode === undefined) {
    delete process.env.PUPU_MEMORY_V2_MODE;
  } else {
    process.env.PUPU_MEMORY_V2_MODE = previousMemoryRolloutMode;
  }
});

const path = require("path");
const { EventEmitter } = require("events");
const {
  createUnchainService,
} = require("../../main/services/unchain/service");

/* What the chat page sent, read from the renderer's frozen capture so the two
   halves cannot drift apart silently. The capture is a JS module; the fields
   needed here are plain JSON, so it is parsed out rather than imported into a
   CommonJS test. */
const CAPTURE_PATH = path.join(
  __dirname,
  "../../../src/SERVICEs/skeleton_chat_selection_capture.js",
);
const CAPTURED_SELECTION = (() => {
  const source = require("fs").readFileSync(CAPTURE_PATH, "utf8");
  const marker = "export const CAPTURED_RENDERER_PAYLOAD = Object.freeze(";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("CAPTURED_RENDERER_PAYLOAD is missing");
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    if (source[end] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const parsed = JSON.parse(source.slice(open, end + 1));
  return parsed.options.skeleton_selection;
})();

const createFakeSpawnProcess = () => {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 4321;
  proc.killed = false;
  proc.kill = jest.fn(() => {
    proc.killed = true;
  });
  return proc;
};

const createAvailableNet = () => ({
  createServer() {
    const listeners = new Map();
    return {
      unref() {},
      once(event, callback) {
        listeners.set(event, callback);
      },
      listen() {
        const onListening = listeners.get("listening");
        if (typeof onListening === "function") onListening();
      },
      close(callback) {
        if (typeof callback === "function") callback();
      },
    };
  },
});

const createRuntimeContract = () => ({
  schema: "pupu.runtime-capabilities",
  version: 1,
  capabilities: {
    runtime_events_v4: true,
    execution_fencing: true,
    durable_interactions: true,
    exact_cancellation: true,
    durable_jobs: { version: "D4.1", available: true, reason: "" },
    automatic_wake_resume: false,
  },
  reasons: {},
});

const createCompatibleHealthResponse = () => ({
  ok: true,
  json: async () => ({
    status: "ok",
    contract: createRuntimeContract(),
    session_guard_migration: {
      schema: "pupu.session-guard-migration",
      version: 1,
      status: "ready",
      protocol_version: 1,
    },
  }),
});

const createDoneStreamImpl = () =>
  jest.fn().mockResolvedValue({
    ok: true,
    body: {
      getReader: () => ({
        read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
      }),
    },
  });

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe("a Skeleton chat selection across the main process", () => {
  const createReadyService = async (streamRequestImpl) => {
    const fakeProcess = createFakeSpawnProcess();
    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse());
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    const target = {
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.12"),
      },
      fs: { existsSync: jest.fn(() => true) },
      path,
      spawn: jest.fn(() => fakeProcess),
      spawnSync: jest.fn(() => ({
        status: 0,
        stdout: JSON.stringify({ ok: true, major: 3, minor: 12, missing: [] }),
      })),
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl,
      webContents: {
        fromId: jest.fn(() => target),
        getAllWebContents: jest.fn(() => [target]),
      },
      runtimeService: {
        validateWorkspaceRootPath: jest.fn(() => ({
          valid: true,
          resolvedPath: "/workspace/root",
        })),
      },
      getAppIsQuitting: () => false,
    });
    await service.startMiso();
    return { service, target };
  };

  const bodyOf = (streamRequestImpl, call = 0) =>
    JSON.parse(streamRequestImpl.mock.calls[call][1].body);

  test("the selection reaches Flask with the exact key set the page built", async () => {
    const streamRequestImpl = createDoneStreamImpl();
    const { service } = await createReadyService(streamRequestImpl);
    service.handleStreamStartV2(
      { sender: { id: 7 } },
      {
        requestId: "req-selection-1",
        payload: {
          message: "run this with the Agent",
          owner_chat_id: "chat-1",
          memory_v2_requested: true,
          options: { skeleton_selection: { ...CAPTURED_SELECTION } },
        },
      },
    );
    await flush();

    expect(streamRequestImpl).toHaveBeenCalledTimes(1);
    const body = bodyOf(streamRequestImpl);
    /* Deep-equal, and nothing added to the object itself: a fourth key is
       `unknown_field` on the far side. */
    expect(body.options.skeleton_selection).toEqual(CAPTURED_SELECTION);
    expect(Object.keys(body.options.skeleton_selection).sort()).toEqual([
      "kind",
      "resource_id",
      "schema",
    ]);
    /* And no Recipe name was introduced beside it, which admission refuses
       outright. */
    expect("recipe_name" in body.options).toBe(false);
  });

  test("the workspace-root rewrite leaves the selection alone", async () => {
    /* This process replaces `payload.options` wholesale when it resolves a
       workspace root. A rewrite that rebuilt the object from a field list
       would silently drop a key the server routes on. */
    const streamRequestImpl = createDoneStreamImpl();
    const { service } = await createReadyService(streamRequestImpl);
    service.handleStreamStartV2(
      { sender: { id: 7 } },
      {
        requestId: "req-selection-2",
        payload: {
          message: "with a workspace",
          options: {
            workspaceRoot: "/some/where",
            skeleton_selection: { ...CAPTURED_SELECTION },
          },
        },
      },
    );
    await flush();

    const body = bodyOf(streamRequestImpl);
    expect(body.options.workspace_root).toBe("/workspace/root");
    expect(body.options.skeleton_selection).toEqual(CAPTURED_SELECTION);
  });

  test("an ordinary chat still carries no selection key at all", async () => {
    const streamRequestImpl = createDoneStreamImpl();
    const { service } = await createReadyService(streamRequestImpl);
    service.handleStreamStartV2(
      { sender: { id: 7 } },
      {
        requestId: "req-selection-3",
        payload: {
          message: "ordinary",
          options: { recipe_name: "Research Agent" },
        },
      },
    );
    await flush();

    const body = bodyOf(streamRequestImpl);
    expect("skeleton_selection" in body.options).toBe(false);
    expect(body.options.recipe_name).toBe("Research Agent");
  });
});
