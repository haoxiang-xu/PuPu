// Phase 4 (S6) — provider-secret POST-boundary byte-equivalence characterization
// (Phase 4 release gate).
//
// This is the MAIN half of the cross-S4+S5 integration characterization. It
// proves that the request body `startMisoStream` (V1/V2/V4 single choke) and
// `replaceMisoSessionMemory` POST to Flask is byte-equivalent between:
//   - TODAY's path   : renderer injects secret VALUES inline, main forwards
//                      them untouched (no descriptor present).
//   - DESCRIPTOR path : renderer emits a non-sensitive descriptor list, main
//                      decrypts + injects the SAME field set and strips the
//                      descriptor (frozen v2 contract §2/§4, CTO ADR §3.4).
//
// Byte-equivalence is asserted as a PARSED, key-order-independent deep-equal of
// `body.options` (S4 report concern #1: a literal string compare is physically
// impossible because descriptor mode appends the injected fields at the end and
// dual-secret today lands the two field sets at two different positions — the
// equivalence the model actually sees is field-set + value, not byte offset).
//
// JOIN TO THE RENDERER HALF (api.unchain.byteEquivalence.test.js): that suite
// proves renderer(legacy) writes EXACTLY the `legacyInline` field set used here
// and renderer(steady) writes EXACTLY the `descriptor` list used here. Feeding
// both real renderer outputs through the real main seam and getting the same
// Flask body is the full renderer->main characterization.
//
// All secrets are OBVIOUS SENTINELS (gate 7 red line #5) whose presence in a
// log line or error message would be an immediate failure.

const path = require("path");
const { EventEmitter } = require("events");
const { CHANNELS } = require("../../shared/channels");
const {
  createUnchainService,
} = require("../../main/services/unchain/service");

// ---- minimal ready-service harness (self-contained copy of the shared bits) -

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

const createReplayTarget = (id, send = jest.fn()) => ({
  id,
  send,
  isDestroyed: jest.fn(() => false),
  getType: jest.fn(() => "window"),
});

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe("unchain provider-secret POST byte equivalence (Phase 4 S6)", () => {
  const originalFetch = global.fetch;
  const originalEnvPython = process.env.UNCHAIN_PYTHON_BIN;

  const OPENAI_SECRET = "sk-openai-SENTINEL-must-never-leak-6";
  const ANTHROPIC_SECRET = "sk-ant-SENTINEL-must-never-leak-66";
  const CUSTOM_SECRET = "sk-custom-SENTINEL-must-never-leak-6";

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvPython == null) {
      delete process.env.UNCHAIN_PYTHON_BIN;
    } else {
      process.env.UNCHAIN_PYTHON_BIN = originalEnvPython;
    }
    jest.clearAllMocks();
  });

  // Mock S1 reader: mirrors the real seam — returns null whenever storage is
  // not "available", otherwise the ciphertext row's plaintext.
  const createSecretStore = ({ status = "available", secrets } = {}) => {
    const table =
      secrets || {
        "provider:openai": OPENAI_SECRET,
        "provider:anthropic": ANTHROPIC_SECRET,
        "custom_provider:custom.myslug": CUSTOM_SECRET,
      };
    return {
      getSecretStorageStatus: jest.fn(() => status),
      readDecryptedProviderSecret: jest.fn((kind, id) => {
        if (status !== "available") return null;
        const key = `${kind}:${id}`;
        return Object.prototype.hasOwnProperty.call(table, key)
          ? table[key]
          : null;
      }),
    };
  };

  const createDoneStreamImpl = () =>
    jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ done: true }),
        }),
      },
    });

  const createReadyStreamService = async ({
    settingsStorageService,
    streamRequestImpl,
  }) => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const sender = createReplayTarget(1);
    const targets = new Map([[1, sender]]);

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: { existsSync: jest.fn(() => true) },
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
      net: createAvailableNet(),
      streamRequestImpl,
      webContents: {
        fromId: jest.fn((id) => targets.get(id) || null),
        getAllWebContents: jest.fn(() => Array.from(targets.values())),
      },
      runtimeService: {},
      settingsStorageService,
      getAppIsQuitting: () => false,
    });
    await service.startMiso();
    return { service, sender };
  };

  const driveStreamV2 = (service, sender, requestId, options) => {
    service.handleStreamStartV2(
      { sender },
      { requestId, payload: { message: "hi", options } },
    );
  };

  // Drives the SAME ready service twice — once with today's inline-value
  // options, once with the descriptor options — and returns both parsed Flask
  // bodies so the caller can assert byte-equivalence.
  const runBothPaths = async ({ base = {}, legacyInline, descriptor }) => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-legacy", { ...base, ...legacyInline });
    await flush();
    driveStreamV2(service, sender, "req-descriptor", {
      ...base,
      __pupu_secret_injection: descriptor,
    });
    await flush();

    expect(streamRequestImpl).toHaveBeenCalledTimes(2);
    return {
      legacyBody: JSON.parse(streamRequestImpl.mock.calls[0][1].body),
      descriptorBody: JSON.parse(streamRequestImpl.mock.calls[1][1].body),
    };
  };

  // ---- the four mandated byte-equivalence combos (S6 brief §1) -------------

  test("openai model, memory off → 4-field set, byte-equivalent, descriptor stripped", async () => {
    const { legacyBody, descriptorBody } = await runBothPaths({
      base: { marker: "keep-me", memory_enabled: false },
      legacyInline: {
        openaiApiKey: OPENAI_SECRET,
        openai_api_key: OPENAI_SECRET,
        apiKey: OPENAI_SECRET,
        api_key: OPENAI_SECRET,
      },
      descriptor: [{ kind: "provider", id: "openai", channel: "model" }],
    });

    // Byte-equivalence: the two Flask bodies' options are deeply equal.
    expect(descriptorBody.options).toEqual(legacyBody.options);
    // Non-secret passthrough field survived identically.
    expect(descriptorBody.options.marker).toBe("keep-me");
    // The four openai fields carry the value, and the descriptor is gone.
    expect(descriptorBody.options.openaiApiKey).toBe(OPENAI_SECRET);
    expect(descriptorBody.options.openai_api_key).toBe(OPENAI_SECRET);
    expect(descriptorBody.options.apiKey).toBe(OPENAI_SECRET);
    expect(descriptorBody.options.api_key).toBe(OPENAI_SECRET);
    expect(descriptorBody.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("openai model + openai embedding collapses to the 2-field set (short-circuit)", async () => {
    const { legacyBody, descriptorBody } = await runBothPaths({
      base: { memory_enabled: true, memory_embedding_provider: "openai" },
      // Today: the embedding path writes the 2-field set first and the openai
      // model path short-circuits on it -> 2 fields total.
      legacyInline: {
        openaiApiKey: OPENAI_SECRET,
        openai_api_key: OPENAI_SECRET,
      },
      // Descriptor: the embedding entry alone; the model path short-circuits on
      // the existing openai list entry -> single 2-field write in main.
      descriptor: [{ kind: "provider", id: "openai", channel: "embedding" }],
    });

    expect(descriptorBody.options).toEqual(legacyBody.options);
    expect(descriptorBody.options.openaiApiKey).toBe(OPENAI_SECRET);
    expect(descriptorBody.options.openai_api_key).toBe(OPENAI_SECRET);
    // The generic api_key/apiKey must NOT appear (2-field collapse, not 4).
    expect(descriptorBody.options).not.toHaveProperty("apiKey");
    expect(descriptorBody.options).not.toHaveProperty("api_key");
    expect(descriptorBody.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("anthropic model + openai embedding → two distinct secrets, byte-equivalent", async () => {
    const { legacyBody, descriptorBody } = await runBothPaths({
      base: { memory_enabled: true, memory_embedding_provider: "openai" },
      legacyInline: {
        openaiApiKey: OPENAI_SECRET,
        openai_api_key: OPENAI_SECRET,
        anthropicApiKey: ANTHROPIC_SECRET,
        anthropic_api_key: ANTHROPIC_SECRET,
      },
      descriptor: [
        { kind: "provider", id: "openai", channel: "embedding" },
        { kind: "provider", id: "anthropic", channel: "model" },
      ],
    });

    expect(descriptorBody.options).toEqual(legacyBody.options);
    // openai 2-field (embedding) + anthropic 2-field (model), no generic key.
    expect(descriptorBody.options.openaiApiKey).toBe(OPENAI_SECRET);
    expect(descriptorBody.options.openai_api_key).toBe(OPENAI_SECRET);
    expect(descriptorBody.options.anthropicApiKey).toBe(ANTHROPIC_SECRET);
    expect(descriptorBody.options.anthropic_api_key).toBe(ANTHROPIC_SECRET);
    expect(descriptorBody.options).not.toHaveProperty("apiKey");
    expect(descriptorBody.options).not.toHaveProperty("api_key");
    expect(descriptorBody.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("custom provider → dedicated channel only, byte-equivalent, no api_key pollution (#9)", async () => {
    const sanitizedDef = { slug: "myslug", protocol: "anthropic" };
    const { legacyBody, descriptorBody } = await runBothPaths({
      // The sanitized (secret-free) definition is injected by the renderer in
      // BOTH modes and must survive the seam untouched.
      base: { custom_provider: sanitizedDef },
      legacyInline: {
        custom_provider_api_key: CUSTOM_SECRET,
        customProviderApiKey: CUSTOM_SECRET,
      },
      descriptor: [
        { kind: "custom_provider", id: "custom.myslug", channel: "model" },
      ],
    });

    expect(descriptorBody.options).toEqual(legacyBody.options);
    expect(descriptorBody.options.custom_provider).toEqual(sanitizedDef);
    expect(descriptorBody.options.custom_provider_api_key).toBe(CUSTOM_SECRET);
    expect(descriptorBody.options.customProviderApiKey).toBe(CUSTOM_SECRET);
    // Gate 7 red line #9: custom secret NEVER lands on the generic channel.
    expect(descriptorBody.options).not.toHaveProperty("api_key");
    expect(descriptorBody.options).not.toHaveProperty("apiKey");
    expect(descriptorBody.options).not.toHaveProperty("openaiApiKey");
    expect(descriptorBody.options).not.toHaveProperty("__pupu_secret_injection");
  });

  // ---- main-side hasAnyApiKey / legacy passthrough (byte-equivalence proof) -

  test("legacy inline key with NO descriptor forwards untouched; reader never consulted", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    const legacyOptions = {
      marker: "x",
      openaiApiKey: OPENAI_SECRET,
      openai_api_key: OPENAI_SECRET,
      apiKey: OPENAI_SECRET,
      api_key: OPENAI_SECRET,
    };
    driveStreamV2(service, sender, "req-passthrough", { ...legacyOptions });
    await flush();

    const body = JSON.parse(streamRequestImpl.mock.calls[0][1].body);
    // main did not touch a keyed, descriptor-free options object — this is what
    // makes main(descriptor) === main(legacy) hold (both equal the same field
    // set). The reader is never consulted on the legacy path.
    expect(body.options).toEqual(legacyOptions);
    expect(
      settingsStorageService.readDecryptedProviderSecret,
    ).not.toHaveBeenCalled();
  });

  // ---- descriptor stripped on BOTH outbound paths (contract B2) ------------

  const createReadyMemoryService = async ({ settingsStorageService }) => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ applied: true }),
      });
    global.fetch = fetchMock;
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: { existsSync: jest.fn(() => true) },
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
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      settingsStorageService,
      getAppIsQuitting: () => false,
    });
    await service.startMiso();
    return { service, fetchMock };
  };

  test("replaceMisoSessionMemory injects the key (non-keyless) and strips the descriptor", async () => {
    const settingsStorageService = createSecretStore();
    const { service, fetchMock } = await createReadyMemoryService({
      settingsStorageService,
    });

    const result = await service.replaceMisoSessionMemory({
      sessionId: "sess-1",
      messages: [],
      options: {
        marker: "mem",
        __pupu_secret_injection: [
          { kind: "provider", id: "anthropic", channel: "model" },
        ],
      },
    });

    expect(result).toEqual({ applied: true });
    // call 0 = health ping; call 1 = the memory replace POST.
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    // Memory re-extraction is NOT keyless — the key was injected...
    expect(body.options.anthropicApiKey).toBe(ANTHROPIC_SECRET);
    expect(body.options.anthropic_api_key).toBe(ANTHROPIC_SECRET);
    // ...and the descriptor never reaches Flask on this second outbound path.
    expect(body.options).not.toHaveProperty("__pupu_secret_injection");
    expect(body.options.marker).toBe("mem");
  });

  // ---- fail-closed error messages carry no secret / ciphertext (#4) --------

  test("fail-closed provider_missing_api_key error data leaks no secret (#4)", async () => {
    const settingsStorageService = createSecretStore({ secrets: {} });
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-missing", {
      __pupu_secret_injection: [
        { kind: "provider", id: "openai", channel: "model" },
      ],
    });
    await flush();

    expect(streamRequestImpl).not.toHaveBeenCalled();
    const errorCall = sender.send.mock.calls.find(
      (call) => call[1] && call[1].event === "error",
    );
    expect(errorCall).toBeTruthy();
    expect(errorCall[1].data.code).toBe("provider_missing_api_key");
    const serialized = JSON.stringify(errorCall[1]);
    expect(serialized).not.toContain(OPENAI_SECRET);
    expect(serialized).not.toContain("enc::");
  });

  test("fail-closed secret_storage_unavailable error data leaks no secret (#4)", async () => {
    const settingsStorageService = createSecretStore({ status: "unavailable" });
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-degraded", {
      __pupu_secret_injection: [
        { kind: "provider", id: "anthropic", channel: "model" },
      ],
    });
    await flush();

    expect(streamRequestImpl).not.toHaveBeenCalled();
    const errorCall = sender.send.mock.calls.find(
      (call) => call[1] && call[1].event === "error",
    );
    expect(errorCall[1].data.code).toBe("secret_storage_unavailable");
    const serialized = JSON.stringify(errorCall[1]);
    expect(serialized).not.toContain(ANTHROPIC_SECRET);
    expect(serialized).not.toContain("enc::");
  });

  // ---- #8 reverse: reader / helper never on the service surface -------------

  test("the secret reader and injection helper are not exposed on the service surface (#8)", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    expect(service).not.toHaveProperty("readDecryptedProviderSecret");
    expect(service).not.toHaveProperty("applyProviderSecretInjection");
    expect(service).not.toHaveProperty("settingsStorageService");
    for (const value of Object.values(service)) {
      expect(value).not.toBe(
        settingsStorageService.readDecryptedProviderSecret,
      );
    }
  });

  // ---- no secret value ever reaches console output (#3, injection seam) -----

  test("injection never writes a secret value to console output (#3)", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    const spies = ["log", "info", "warn", "error", "debug"].map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    );
    try {
      driveStreamV2(service, sender, "req-log", {
        __pupu_secret_injection: [
          { kind: "provider", id: "openai", channel: "model" },
          { kind: "custom_provider", id: "custom.myslug", channel: "model" },
        ],
      });
      await flush();
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join("\n");
    expect(logged).not.toContain(OPENAI_SECRET);
    expect(logged).not.toContain(CUSTOM_SECRET);
  });
});
