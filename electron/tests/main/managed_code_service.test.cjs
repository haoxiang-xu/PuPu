// Lifecycle harness copied from the existing transport suite; producer remains actual Flask output.
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

const DONE_STREAM = () => ({
  ok: true,
  body: {
    getReader: () => ({
      read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
    }),
  },
});

/* A chat that runs a stored Agent now makes this process ask the host which
   credentials that frozen graph needs before it dispatches, so the transport
   this file is about is the SECOND call. The answer below is keyless on
   purpose — one Ollama Kernel and an Ollama Memory Agent — because this file
   has no settings service and the selection hop is what it asserts. */
const KEYLESS_REQUIREMENTS = {
  schema: "pupu.skeleton_credential_requirements.v1",
  kind: "skeleton",
  scope: {
    schema: "pupu.skeleton_credential_scope.v1",
    mode: "start",
    session_id: "chat-1792345210660-099f0f5079e419655a121096d8e6265b",
    owner_chat_id: "chat-1792345210660-099f0f5079e419655a121096d8e6265b",
    interaction_id: "",
    source_attempt_id: "",
    selection_digest: "a".repeat(64),
    workflows_digest: "b".repeat(64),
    launch_digest: "",
    memory_provider: "ollama",
  },
  profiles: [
    {
      id: "ollama:qwen3:8b",
      credential_ref: "ollama",
      provider: "ollama",
      model: "qwen3:8b",
      protocol: "ollama",
      endpoint: "http://localhost:11434",
    },
  ],
};

const REQUIREMENTS_PATH = "/skeleton_credentials/requirements";

const createDoneStreamImpl = (requirements = KEYLESS_REQUIREMENTS) =>
  jest.fn(async (url) => {
    if (String(url).includes(REQUIREMENTS_PATH)) {
      return {
        ok: true,
        status: 200,
        json: async () => requirements,
        text: async () => JSON.stringify(requirements),
      };
    }
    return DONE_STREAM();
  });

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};


const producer = require('../fixtures/managed_code_producer.json');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { createSkeletonResourceReply } = require('../../shared/skeleton_resource_transport');
describe('managed Code over the complete real Main service', () => {
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

  test('preload command handshakes before the exact source POST and validates its result', async () => {
    const { service } = await createReadyService(jest.fn());
    const fetch = jest.fn(async url => ({ status: 200, ok: true, text: async () => JSON.stringify(
      url.endsWith('/capabilities') ? producer.capabilities : producer.resource) }));
    global.fetch = fetch;
    const bridge = createMisoBridge({ invoke: (_channel, command) => createSkeletonResourceReply(() =>
      service.runMisoSkeletonResourceCommand(command.action, command.payload)) }, {});
    expect(await bridge.saveManagedSkeletonResource(producer.edit)).toEqual(producer.resource);
    expect(fetch.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method])).toEqual([
      ['/skeleton_resources/v2/capabilities','GET'], ['/skeleton_resources/v2','POST']]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(producer.edit);
    service.stopMiso();
  });
  test('an old/malformed host stops before the source write; no v1 downgrade', async () => {
    const { service } = await createReadyService(jest.fn());
    global.fetch = jest.fn(async () => ({ status: 200, ok: true, text: async () => JSON.stringify({schema:'future'}) }));
    await expect(service.runMisoSkeletonResourceCommand('code_save', producer.edit)).rejects.toMatchObject({ code: 'managed_source_protocol_error' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    service.stopMiso();
  });
});
