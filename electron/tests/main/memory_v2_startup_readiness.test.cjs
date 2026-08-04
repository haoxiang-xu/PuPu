const path = require("path");
const { EventEmitter } = require("events");
const {
  createUnchainService,
} = require("../../main/services/unchain/service");
const {
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  createBuildFeatureSnapshot,
  rolloutFingerprint,
} = require("../../main/services/unchain/memory_v2_rollout");

const UNCHAIN_REVISION = "a".repeat(40);

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

const healthResponse = () => ({
  ok: true,
  json: async () => ({ status: "ok", contract: createRuntimeContract() }),
});

const fakeProcess = () => {
  const processHandle = new EventEmitter();
  processHandle.stdout = new EventEmitter();
  processHandle.stderr = new EventEmitter();
  processHandle.pid = 4321;
  processHandle.killed = false;
  processHandle.kill = jest.fn(() => {
    processHandle.killed = true;
  });
  return processHandle;
};

const availableNet = () => ({
  createServer() {
    const listeners = new Map();
    return {
      unref() {},
      once(event, callback) {
        listeners.set(event, callback);
      },
      listen() {
        listeners.get("listening")?.();
      },
      close(callback) {
        callback?.();
      },
    };
  },
});

const buildService = (snapshot, { platform, isPackaged = false } = {}) => {
  const spawn = jest.fn(() => fakeProcess());
  const service = createUnchainService({
    app: {
      isPackaged,
      getAppPath: jest.fn(() => "/app"),
      getPath: jest.fn(() => "/tmp/pupu"),
      getVersion: jest.fn(() => "0.1.1"),
    },
    fs: {
      existsSync: jest.fn(() => true),
      readFileSync: jest.fn(() => JSON.stringify(snapshot)),
    },
    path,
    spawn,
    spawnSync: jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    })),
    crypto: {
      randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
    },
    net: availableNet(),
    webContents: {
      fromId: jest.fn(() => null),
      getAllWebContents: jest.fn(() => []),
    },
    runtimeService: {},
    getAppIsQuitting: () => false,
    ...(platform ? { platform } : {}),
  });
  return { service, spawn };
};

const enabledSnapshot = (mode = "canary") =>
  createBuildFeatureSnapshot(
    { enable_memory_v2: true },
    {
      PUPU_FEATURE_MEMORY_V2: "all",
      PUPU_MEMORY_V2_MODE: mode,
      PUPU_MEMORY_V2_CANARY_PERCENT: "25",
      PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
    },
  );

const readinessPayload = (snapshot, overrides = {}) => {
  const release = snapshot[MEMORY_V2_RELEASE_FIELD];
  return {
    available: true,
    schema_version: 4,
    journal_mode: "wal",
    lexical_backend: "fts5",
    vector_status: "disabled",
    feature_ceiling: "all",
    configured_mode: release.sidecar_environment.PUPU_MEMORY_V2_MODE,
    rollout_mode: release.sidecar_environment.PUPU_MEMORY_V2_MODE,
    canary_percent: 25,
    read_only_degraded: false,
    rollout_config_valid: true,
    rollout_fingerprint: release.rollout_fingerprint,
    context_memory_capability_ready: true,
    context_memory_capability_reason: "unchain_context_memory_ready",
    context_memory_capability_verification: "exact_sha",
    context_memory_capability_immutable: true,
    unchain_revision: UNCHAIN_REVISION,
    context_memory_contract: 1,
    ...overrides,
  };
};

describe("Unchain Memory V2 startup readiness", () => {
  const originalFetch = global.fetch;
  const originalPython = process.env.UNCHAIN_PYTHON_BIN;
  const originalResourcesPath = process.resourcesPath;
  const originalEnvironment = Object.fromEntries(
    Object.values(MEMORY_V2_ENV_KEYS).map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    process.resourcesPath = "/resources";
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    Object.values(MEMORY_V2_ENV_KEYS).forEach((key) => {
      delete process.env[key];
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.resourcesPath = originalResourcesPath;
    if (originalPython == null) delete process.env.UNCHAIN_PYTHON_BIN;
    else process.env.UNCHAIN_PYTHON_BIN = originalPython;
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    });
    jest.clearAllMocks();
  });

  test("injects the frozen rollout and verifies status before capability ready", async () => {
    const snapshot = enabledSnapshot("canary");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(readinessPayload(snapshot)),
      });
    const { service, spawn } = buildService(snapshot, { isPackaged: true });

    await service.startMiso();

    expect(spawn.mock.calls[0][2].env).toMatchObject({
      PUPU_FEATURE_MEMORY_V2: "all",
      PUPU_MEMORY_V2_MODE: "canary",
      PUPU_MEMORY_V2_CANARY_PERCENT: "25",
      PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
      PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/context/v2/status",
      expect.objectContaining({ method: "GET" }),
    );
    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
      memoryV2: {
        configured: true,
        ready: true,
        status: "ready",
        reason: "",
        rolloutMode: "canary",
        rolloutFingerprint:
          snapshot[MEMORY_V2_RELEASE_FIELD].rollout_fingerprint,
        sidecarFingerprint:
          snapshot[MEMORY_V2_RELEASE_FIELD].rollout_fingerprint,
      },
    });
  });

  test("invalid V2 schema degrades only Context V2 and blocks its methods", async () => {
    const snapshot = enabledSnapshot("shadow");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          // v3 = the immediately-previous schema, i.e. a sidecar that predates
          // candidate_reviews. It must degrade Context V2 at startup rather
          // than let the review triad 404 at call time.
          JSON.stringify(readinessPayload(snapshot, { schema_version: 3 })),
      });
    const { service } = buildService(snapshot);

    await service.startMiso();

    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
      memoryV2: {
        ready: false,
        status: "degraded",
        reason: "context_v2_schema_incompatible",
      },
    });
    await expect(
      service.listContextV2Spaces({ ownerChatId: "chat-1" }),
    ).rejects.toMatchObject({ code: "context_v2_readiness_failed" });
    const sender = {
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
    };
    service.handleStreamStartV4(
      { sender },
      {
        requestId: "request-schema-blocked",
        payload: {
          memory_v2_requested: true,
          options: {},
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(sender.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        requestId: "request-schema-blocked",
        event: "error",
        data: expect.objectContaining({
          code: "context_v2_readiness_failed",
        }),
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("Unchain capability mismatch degrades Context V2 before admission", async () => {
    const snapshot = enabledSnapshot("shadow");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(
            readinessPayload(snapshot, {
              context_memory_capability_ready: false,
              context_memory_capability_reason: "unchain_revision_mismatch",
              context_memory_capability_verification: "failed",
              context_memory_capability_immutable: false,
            }),
          ),
      });
    const { service } = buildService(snapshot);

    await service.startMiso();

    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
      memoryV2: {
        ready: false,
        status: "degraded",
        reason: "context_v2_unchain_capability_unavailable",
      },
    });
    await expect(
      service.listContextV2Spaces({ ownerChatId: "chat-1" }),
    ).rejects.toMatchObject({ code: "context_v2_readiness_failed" });
  });

  test("off rollout preserves legacy health startup and carries explicit off", async () => {
    const snapshot = createBuildFeatureSnapshot({}, {});
    global.fetch = jest.fn().mockResolvedValueOnce(healthResponse());
    const { service, spawn } = buildService(snapshot);

    await service.startMiso();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][2].env).toMatchObject({
      PUPU_FEATURE_MEMORY_V2: "off",
      PUPU_MEMORY_V2_MODE: "off",
      PUPU_MEMORY_V2_CANARY_PERCENT: "5",
      PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0",
      PUPU_CONTEXT_V2_STORE_OWNER: "off",
    });
    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
      memoryV2: {
        configured: false,
        ready: false,
        status: "off",
        reason: "rollout_off",
      },
    });
  });

  test("Windows caps active rollout to shadow and keeps readiness fail-closed", async () => {
    const snapshot = enabledSnapshot("all");
    const constrainedFingerprint = rolloutFingerprint({
      featureCeiling: "shadow",
      configuredMode: "all",
      rolloutMode: "shadow",
      canaryPercent: 25,
      readOnlyDegraded: false,
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(
            readinessPayload(snapshot, {
              feature_ceiling: "shadow",
              configured_mode: "all",
              rollout_mode: "shadow",
              rollout_fingerprint: constrainedFingerprint,
            }),
          ),
      });
    const { service, spawn } = buildService(snapshot, { platform: "win32" });

    await service.startMiso();

    expect(spawn.mock.calls[0][2].env).toMatchObject({
      PUPU_FEATURE_MEMORY_V2: "shadow",
      PUPU_MEMORY_V2_MODE: "all",
      PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
      memoryV2: {
        ready: false,
        status: "degraded",
        reason: "vault_worker_containment_unavailable",
        releaseRolloutMode: "all",
        rolloutMode: "shadow",
        platformActiveBlocked: true,
      },
    });
    await expect(
      service.listContextV2Spaces({ ownerChatId: "chat-1" }),
    ).rejects.toMatchObject({ code: "context_v2_readiness_failed" });
    const sender = {
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
    };
    service.handleStreamStartV4(
      { sender },
      {
        requestId: "request-windows-blocked",
        payload: {
          memory_v2_requested: true,
          options: {},
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(sender.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        requestId: "request-windows-blocked",
        event: "error",
        data: expect.objectContaining({
          code: "context_v2_readiness_failed",
        }),
      }),
    );
  });
});
