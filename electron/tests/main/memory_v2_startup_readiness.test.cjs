const { createHash } = require("crypto");
const path = require("path");
const { EventEmitter } = require("events");
const { createUnchainService } = require("../../main/services/unchain/service");
const {
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  createBuildFeatureSnapshot,
  rolloutFingerprint,
} = require("../../main/services/unchain/memory_v2_rollout");

const RUNTIME_PROTOCOL_SCHEMA = "unchain.runtime_protocol_manifest.v1";
const RUNTIME_PROTOCOL_DIGEST_DOMAIN =
  "unchain.runtime_protocol_manifest.v1\\u0000";
const REQUIRED_PROTOCOLS = Object.freeze([
  Object.freeze({
    features: Object.freeze([
      "artifact_handoff",
      "canonical_journal",
      "chat_deletion_sqlite_scope_closure",
      "context_compiler",
      "generation_rebase_live_interaction_cycles",
      "interaction_resolution_compat",
      "long_term_promotion",
      "memory_curator",
      "memory_toolkit",
      "memory_workspace",
      "tool_output_management_v1",
    ]),
    id: "context_memory",
    major: 1,
    minor: 0,
  }),
  Object.freeze({
    features: Object.freeze([
      "cancel_pending",
      "expected_interaction_id_cas",
      "fresh_run_lineage",
      "host_controlled_resume",
    ]),
    id: "durable_interaction",
    major: 1,
    minor: 0,
  }),
  Object.freeze({
    features: Object.freeze([
      "atomic_receipt_cas",
      "auxiliary_calls",
      "enforce_mode",
      "graph_runs",
      "memory_off",
      "subagent_runs",
    ]),
    id: "provider_turn_ownership",
    major: 1,
    minor: 0,
  }),
  Object.freeze({
    features: Object.freeze([
      "canonical_metrics",
      "completion_diagnostics_ref",
      "continuation_claim",
      "immutable_pricing_snapshot",
      "provider_call_set_union",
      "provider_call_usage_v1",
      "run_bundle_v1",
      "run_bundle_v2",
    ]),
    id: "run_bundle",
    major: 1,
    minor: 0,
  }),
]);

const cloneProtocols = () =>
  REQUIRED_PROTOCOLS.map((protocol) => ({
    features: [...protocol.features],
    id: protocol.id,
    major: protocol.major,
    minor: protocol.minor,
  }));

const runtimeProtocolManifest = (protocols = cloneProtocols()) => {
  const body = {
    protocols,
    runtime: "unchain",
    schema: RUNTIME_PROTOCOL_SCHEMA,
  };
  const digest = createHash("sha256")
    .update(RUNTIME_PROTOCOL_DIGEST_DOMAIN, "utf8")
    .update(JSON.stringify(body), "utf8")
    .digest("hex");
  return { manifest_digest: `sha256:${digest}`, ...body };
};

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
    store_owner: "unchain",
    schema_version: 2,
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
    runtime_protocol_ready: true,
    runtime_protocol_reason: "unchain_runtime_protocol_compatible",
    runtime_protocol_verification: "runtime_protocol",
    runtime_protocol_immutable: true,
    runtime_protocol_manifest: runtimeProtocolManifest(),
    unchain_revision: "revision-is-telemetry-only",
    unchain_runtime_source: "installed-wheel",
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
        runtimeProtocolDigest: runtimeProtocolManifest().manifest_digest,
        runtimeProtocolVerification: "runtime_protocol",
      },
    });
  });

  test("development readiness ignores revision and source telemetry", async () => {
    const snapshot = enabledSnapshot("all");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(
            readinessPayload(snapshot, {
              unchain_revision: "not-a-git-sha-and-still-compatible",
              unchain_runtime_source: "editable-runtime",
            }),
          ),
      });
    const { service } = buildService(snapshot);

    await service.startMiso();

    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
      memoryV2: {
        configured: true,
        ready: true,
        status: "ready",
        runtimeProtocolVerification: "runtime_protocol",
      },
    });
  });

  test("legacy PuPu store ownership degrades only Context V2 and blocks its methods", async () => {
    const snapshot = enabledSnapshot("shadow");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(
            readinessPayload(snapshot, {
              store_owner: "pupu_legacy",
              schema_version: 4,
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
        reason: "context_v2_store_owner_incompatible",
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

  test("malformed runtime protocol degrades Context V2 before admission", async () => {
    const snapshot = enabledSnapshot("shadow");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(
            readinessPayload(snapshot, {
              runtime_protocol_ready: false,
              runtime_protocol_reason:
                "unchain_runtime_protocol_manifest_invalid",
              runtime_protocol_verification: "failed",
              runtime_protocol_immutable: false,
              runtime_protocol_manifest: null,
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
        reason: "context_v2_unchain_protocol_invalid",
      },
    });
    await expect(
      service.listContextV2Spaces({ ownerChatId: "chat-1" }),
    ).rejects.toMatchObject({
      code: "context_v2_unchain_protocol_invalid",
      message: expect.stringContaining(
        "Memory V2 runtime protocol manifest is invalid",
      ),
    });
  });

  test.each([
    ["chat_deletion_sqlite_scope_closure", 0],
    ["expected_interaction_id_cas", 1],
  ])(
    "missing required compatibility feature %s blocks stream admission without a provider send",
    async (requiredFeature, protocolIndex) => {
      const snapshot = enabledSnapshot("all");
      const protocols = cloneProtocols();
      protocols[protocolIndex].features = protocols[
        protocolIndex
      ].features.filter((feature) => feature !== requiredFeature);
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(healthResponse())
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify(
              readinessPayload(snapshot, {
                runtime_protocol_ready: false,
                runtime_protocol_reason:
                  "unchain_runtime_protocol_incompatible",
                runtime_protocol_verification: "runtime_protocol",
                runtime_protocol_immutable: true,
                runtime_protocol_manifest: runtimeProtocolManifest(protocols),
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
          reason: "context_v2_unchain_protocol_incompatible",
        },
      });
      const sender = {
        send: jest.fn(),
        isDestroyed: jest.fn(() => false),
      };
      service.handleStreamStartV4(
        { sender },
        {
          requestId: "request-protocol-blocked",
          payload: { memory_v2_requested: true, options: {} },
        },
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(sender.send).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          requestId: "request-protocol-blocked",
          event: "error",
          data: expect.objectContaining({
            code: "context_v2_unchain_protocol_incompatible",
            message: "Memory V2 runtime protocol is incompatible",
          }),
        }),
      );
      expect(global.fetch).toHaveBeenCalledTimes(2);
    },
  );

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
