// These isolated transport/legacy fixtures deliberately exercise internal off.
// Active startup and manifest checks live in memory_v2_startup_readiness.
const previousMemoryRolloutMode = process.env.PUPU_MEMORY_V2_MODE;
beforeEach(() => { process.env.PUPU_MEMORY_V2_MODE = "off"; });
afterEach(() => {
  if (previousMemoryRolloutMode === undefined) delete process.env.PUPU_MEMORY_V2_MODE;
  else process.env.PUPU_MEMORY_V2_MODE = previousMemoryRolloutMode;
});

const path = require("path");
const { EventEmitter } = require("events");
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

// BC-024/025 integration: exercise the public Main stream entry point, not
// the credential helper in isolation. Every secret below is a fake sentinel.
describe("Skeleton credential discovery before Main stream dispatch", () => {
  const originalFetch = global.fetch;
  const originalPython = process.env.UNCHAIN_PYTHON_BIN;
  const SELECTION = { schema: "pupu.skeleton_chat_selection.v1", kind: "resource", resource_id: "research.agent:v2" };
  const SECRET = { openai: "OPENAI-TEST-SENTINEL", anthropic: "ANTHROPIC-TEST-SENTINEL", gemini: "GEMINI-TEST-SENTINEL", "custom.research": "CUSTOM-TEST-SENTINEL" };
  const PROFILE = {
    openai: { id: "openai:root", credential_ref: "openai", provider: "openai", model: "root", protocol: "openai-responses", endpoint: "https://api.openai.com/v1" },
    anthropic: { id: "anthropic:child", credential_ref: "anthropic", provider: "anthropic", model: "child", protocol: "anthropic", endpoint: "https://api.anthropic.com" },
    gemini: { id: "gemini:leaf", credential_ref: "gemini", provider: "gemini", model: "leaf", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com" },
    ollama: { id: "ollama:local", credential_ref: "ollama", provider: "ollama", model: "local", protocol: "ollama", endpoint: "http://localhost:11434" },
  };
  const scope = (overrides = {}) => ({
    schema: "pupu.skeleton_credential_scope.v1", mode: "start", session_id: "session-1", owner_chat_id: "chat-1",
    interaction_id: "", source_attempt_id: "", selection_digest: "a".repeat(64), workflows_digest: "b".repeat(64), launch_digest: "", memory_provider: "openai", ...overrides,
  });
  const requirements = (profiles = [PROFILE.openai], overrides = {}) => ({
    schema: "pupu.skeleton_credential_requirements.v1", kind: "skeleton", scope: scope(), profiles, ...overrides,
  });
  const response = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
    body: { getReader: () => ({ read: jest.fn().mockResolvedValue({ done: true }) }) },
  });
  const nativePayload = (overrides = {}) => ({
    message: "Run the selected Agent", session_id: "session-1", owner_chat_id: "chat-1", attempt_id: "attempt-1",
    options: { skeleton_selection: SELECTION }, ...overrides,
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPython === undefined) delete process.env.UNCHAIN_PYTHON_BIN;
    else process.env.UNCHAIN_PYTHON_BIN = originalPython;
    jest.restoreAllMocks();
  });
  const ready = async ({ result = requirements(), status = 200, pending, definitions = [], secrets = SECRET } = {}) => {
    const outbound = [];
    const secretStore = {
      getSecretStorageStatus: jest.fn(() => "available"),
      getBootstrapSnapshot: jest.fn(() => ({ available: true, namespaces: { model_providers: { custom_providers: definitions } } })),
      readDecryptedProviderSecret: jest.fn((kind, id) => kind === "provider" ? secrets[id] || null : secrets[id] || null),
    };
    const transport = jest.fn(async (url, options = {}) => {
      if (new URL(url).pathname === "/health") return createCompatibleHealthResponse();
      if (options.method !== "POST") return createCompatibleHealthResponse();
      const record = { url, path: new URL(url).pathname, options, body: JSON.parse(options.body) };
      outbound.push(record);
      if (record.path === "/skeleton_credentials/requirements") return pending ? pending : response(result, status);
      return response({});
    });
    global.fetch = transport;
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    const sender = createReplayTarget(1);
    const service = createUnchainService({
      app: { isPackaged: false, getAppPath: () => "/app", getPath: () => "/tmp/pupu", getVersion: () => "0.1.1" },
      fs: { existsSync: () => true }, path, spawn: () => createFakeSpawnProcess(),
      spawnSync: () => ({ status: 0, stdout: JSON.stringify({ version: "3.12.2", major: 3, minor: 12, missing: [] }) }),
      crypto: { randomBytes: () => ({ toString: () => "auth-token-123" }) }, net: createAvailableNet(),
      streamRequestImpl: transport,
      webContents: { fromId: () => sender, getAllWebContents: () => [sender] },
      runtimeService: {}, settingsStorageService: secretStore, getAppIsQuitting: () => false,
    });
    await service.startMiso();
    const send = async (payload = nativePayload(), requestId = "req-1") => {
      service.handleStreamStartV2({ sender }, { requestId, payload });
      await flush();
    };
    return { service, sender, secretStore, outbound, send };
  };
  const discovery = (host) => host.outbound.filter((x) => x.path === "/skeleton_credentials/requirements");
  const streams = (host) => host.outbound.filter((x) => x.path !== "/skeleton_credentials/requirements");
  const errors = (host) => host.sender.send.mock.calls.filter((x) => x[1]?.event === "error").map((x) => x[1].data);
  const assertNoSecrets = (value) => Object.values(SECRET).forEach((key) => expect(JSON.stringify(value)).not.toContain(key));

  test("no composer model: authenticated discovery precedes stream and the exact fixed scope is forwarded", async () => {
    const host = await ready({ result: requirements([PROFILE.openai, PROFILE.anthropic, PROFILE.gemini, PROFILE.ollama]) });
    await host.send(nativePayload({ options: { skeleton_selection: SELECTION, skeleton_credentials: { invented: { api_key: "RENDERER-INVENTED" } }, skeleton_credential_scope: { invented: true }, __pupu_secret_injection: [{ kind: "provider", id: "not-the-graph-provider", channel: "model" }] } }));
    expect(host.outbound.map((x) => x.path)).toEqual(["/skeleton_credentials/requirements", "/chat/stream/v2"]);
    expect(discovery(host)[0].body).toEqual({ schema: "pupu.skeleton_credential_query.v1", mode: "start", session_id: "session-1", owner_chat_id: "chat-1", interaction_id: "", source_attempt_id: "", selection: SELECTION, recipe_name: "", memory_agent_config: null });
    host.outbound.forEach((x) => expect(x.options.headers["x-unchain-auth"]).toBe("auth-token-123"));
    const options = streams(host)[0].body.options;
    expect(options.skeleton_credential_scope).toEqual(scope());
    expect(options.skeleton_credentials).toEqual(Object.fromEntries(["openai", "anthropic", "gemini"].map((key) => [key, { provider: key, endpoint: PROFILE[key].endpoint, api_key: SECRET[key] }])));
    expect(options).not.toHaveProperty("__pupu_secret_injection");
    expect(JSON.stringify(host.outbound)).not.toContain("RENDERER-INVENTED");
    expect(host.secretStore.readDecryptedProviderSecret.mock.calls.every(([kind, id]) => kind === "provider" && ["openai", "anthropic", "gemini"].includes(id))).toBe(true);
    assertNoSecrets(discovery(host)[0].body);
    assertNoSecrets(host.sender.send.mock.calls);
  });

  test("Memory Agent's official provider and embedding key are independent from the Kernel profile", async () => {
    const memory = { displayName: "Memory Agent", additionalInstructions: "", provider: "gemini", modelId: "memory-model" };
    const host = await ready({ result: requirements([PROFILE.anthropic], { scope: scope({ memory_provider: "gemini" }) }) });
    await host.send(nativePayload({ memory_agent_config: memory, options: { skeleton_selection: SELECTION, __pupu_secret_injection: [{ kind: "provider", id: "openai", channel: "embedding" }] } }));
    expect(discovery(host)).toHaveLength(1);
    expect(discovery(host)[0].body.memory_agent_config).toEqual(memory);
    expect(streams(host)).toHaveLength(1);
    const opts = streams(host)[0].body.options;
    expect(opts.skeleton_credentials).toEqual({ anthropic: { provider: "anthropic", endpoint: PROFILE.anthropic.endpoint, api_key: SECRET.anthropic } });
    expect(opts.geminiApiKey).toBe(SECRET.gemini);
    expect(opts.gemini_api_key).toBe(SECRET.gemini);
    expect(opts.openaiApiKey).toBe(SECRET.openai);
    expect(opts.openai_api_key).toBe(SECRET.openai);
    expect(opts).not.toHaveProperty("api_key");
    expect(opts).not.toHaveProperty("__pupu_secret_injection");
  });

  test("legacy inline OpenAI embedding enrichment survives an independent native Kernel binding", async () => {
    /* injectOpenAIEmbeddingKeyIfNeeded still emits this exact two-field shape
       when the OpenAI credential is not yet Main-authoritative. It is for
       embeddings only; neither this Kernel nor its Memory Agent uses OpenAI. */
    const embeddingSecret = "LEGACY-EMBEDDING-ONLY-SENTINEL";
    const host = await ready({ secrets: { anthropic: SECRET.anthropic }, result: requirements([PROFILE.anthropic], { scope: scope({ memory_provider: "anthropic" }) }) });
    await host.send(nativePayload({ options: { skeleton_selection: SELECTION, memory_enabled: true, memory_embedding_provider: "openai", openaiApiKey: embeddingSecret, openai_api_key: embeddingSecret } }));
    expect(discovery(host)).toHaveLength(1);
    expect(streams(host)).toHaveLength(1);
    const options = streams(host)[0].body.options;
    expect(options.skeleton_credentials).toEqual({ anthropic: { provider: "anthropic", endpoint: PROFILE.anthropic.endpoint, api_key: SECRET.anthropic } });
    expect(options.openaiApiKey).toBe(embeddingSecret);
    expect(options.openai_api_key).toBe(embeddingSecret);
    expect(options.anthropicApiKey).toBe(SECRET.anthropic);
    expect(host.secretStore.readDecryptedProviderSecret.mock.calls).not.toContainEqual(["provider", "openai"]);
  });

  test.each([
    ["memory disabled", { memory_enabled: false, memory_embedding_provider: "openai" }],
    ["Ollama embeddings", { memory_enabled: true, memory_embedding_provider: "ollama" }],
  ])("%s does not preserve a stale inline OpenAI composer key", async (_label, memoryOptions) => {
    const host = await ready({ secrets: { anthropic: SECRET.anthropic }, result: requirements([PROFILE.anthropic], { scope: scope({ memory_provider: "anthropic" }) }) });
    await host.send(nativePayload({ options: { skeleton_selection: SELECTION, ...memoryOptions, openaiApiKey: "STALE-COMPOSER-KEY", openai_api_key: "STALE-COMPOSER-KEY" } }));
    expect(streams(host)).toHaveLength(1);
    expect(streams(host)[0].body.options).not.toHaveProperty("openaiApiKey");
    expect(streams(host)[0].body.options).not.toHaveProperty("openai_api_key");
    expect(host.secretStore.readDecryptedProviderSecret.mock.calls).not.toContainEqual(["provider", "openai"]);
  });

  test("an authorized official key wins over an old inline embedding alias", async () => {
    const host = await ready();
    await host.send(nativePayload({ options: { skeleton_selection: SELECTION, memory_enabled: true, memory_embedding_provider: "openai", openaiApiKey: "OLD-INLINE-KEY", openai_api_key: "OLD-INLINE-KEY" } }));
    expect(streams(host)).toHaveLength(1);
    const options = streams(host)[0].body.options;
    expect(options.openaiApiKey).toBe(SECRET.openai);
    expect(options.openai_api_key).toBe(SECRET.openai);
    expect(options.skeleton_credentials.openai.api_key).toBe(SECRET.openai);
    expect(options).not.toHaveProperty("api_key");
  });

  test("custom credentials come from the Main-owned registration and retain their exact target", async () => {
    const custom = { id: "custom.research:answer", credential_ref: "custom.research", provider: "custom.research", model: "answer", protocol: "openai-responses", endpoint: "https://research.example/v1" };
    const memory = { displayName: "Memory Agent", additionalInstructions: "", provider: "gemini", modelId: "memory-model" };
    const definition = { config_version: 1, id: "research", display_name: "Research", enabled: true, protocol: "openai-responses", base_url: custom.endpoint, auth: { mode: "bearer" }, models: [{ id: "answer" }] };
    const host = await ready({ definitions: [definition], result: requirements([custom], { scope: scope({ memory_provider: "gemini" }) }) });
    await host.send(nativePayload({ memory_agent_config: memory, options: { skeleton_selection: SELECTION } }));
    expect(discovery(host)).toHaveLength(1);
    expect(streams(host)).toHaveLength(1);
    expect(streams(host)[0].body.options.skeleton_credentials).toEqual({ "custom.research": { provider: "custom.research", endpoint: custom.endpoint, api_key: SECRET["custom.research"] } });
    expect(host.secretStore.readDecryptedProviderSecret.mock.calls).toContainEqual(["custom_provider", "custom.research"]);
    expect(streams(host)[0].body.options).not.toHaveProperty("custom_provider_api_key");
    assertNoSecrets(host.sender.send.mock.calls);
  });

  test("keyless Ollama never asks the vault for an unrelated key", async () => {
    const host = await ready({ result: requirements([PROFILE.ollama], { scope: scope({ memory_provider: "ollama" }) }) });
    await host.send();
    expect(discovery(host)).toHaveLength(1);
    expect(streams(host)).toHaveLength(1);
    expect(streams(host)[0].body.options.skeleton_credentials).toEqual({});
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
  });

  test("legacy starts keep their single POST and existing model descriptor injection", async () => {
    const host = await ready();
    await host.send({ message: "legacy", options: { recipe_name: "Default", __pupu_secret_injection: [{ kind: "provider", id: "openai", channel: "model" }] } });
    expect(discovery(host)).toHaveLength(0);
    expect(streams(host)).toHaveLength(1);
    expect(streams(host)[0].body.options).toEqual({ recipe_name: "Default", openaiApiKey: SECRET.openai, openai_api_key: SECRET.openai, apiKey: SECRET.openai, api_key: SECRET.openai });
  });

  test("a non-Skeleton resume is discovered, then follows the legacy injection path", async () => {
    const host = await ready({ result: { schema: "pupu.skeleton_credential_requirements.v1", kind: "not_skeleton" } });
    await host.send(nativePayload({ mode: "resume_interaction", interaction_id: "interaction-1", source_attempt_id: "source-1", options: { __pupu_secret_injection: [{ kind: "provider", id: "anthropic", channel: "model" }] } }));
    expect(host.outbound.map((x) => x.path)).toEqual(["/skeleton_credentials/requirements", "/chat/stream/v2"]);
    expect(discovery(host)[0].body).toEqual({ schema: "pupu.skeleton_credential_query.v1", mode: "resume", session_id: "session-1", owner_chat_id: "chat-1", interaction_id: "interaction-1", source_attempt_id: "source-1", selection: null, recipe_name: "", memory_agent_config: null });
    expect(streams(host)[0].body.options.anthropicApiKey).toBe(SECRET.anthropic);
    expect(streams(host)[0].body.options).not.toHaveProperty("skeleton_credentials");
    expect(streams(host)[0].body.options).not.toHaveProperty("skeleton_credential_scope");
  });

  test.each([
    ["missing profiles", { schema: "pupu.skeleton_credential_requirements.v1", kind: "skeleton", scope: scope() }],
    ["unknown scope key", requirements([PROFILE.openai], { scope: scope({ invented: true }) })],
    ["wrong owner", requirements([PROFILE.openai], { scope: scope({ owner_chat_id: "another-chat" }) })],
    ["official reference at attacker endpoint", requirements([{ ...PROFILE.openai, endpoint: "https://attacker.invalid/v1" }])],
    ["one reference targets two addresses", requirements([PROFILE.openai, { ...PROFILE.openai, id: "openai:other", endpoint: "https://another.invalid/v1" }])],
  ])("%s refuses before any vault read or stream dispatch", async (_label, result) => {
    const host = await ready({ result });
    await host.send();
    expect(discovery(host)).toHaveLength(1);
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
    expect(errors(host)).toHaveLength(1);
    expect(typeof errors(host)[0].code).toBe("string");
    assertNoSecrets(host.sender.send.mock.calls);
  });

  test("a typed discovery refusal is surfaced without a key read or a fallback stream", async () => {
    const host = await ready({ status: 409, result: { error: { code: "skeleton_credential_scope_stale", path: ["scope"], message: "The selected definition changed." } } });
    await host.send();
    expect(discovery(host)).toHaveLength(1);
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
    expect(errors(host)[0].code).toBe("skeleton_credential_scope_stale");
    expect(errors(host)[0].path).toEqual(["scope"]);
    expect(errors(host)[0].status).toBe(409);
    assertNoSecrets(host.sender.send.mock.calls);
  });

  test("canceling while discovery is pending prevents a late stream POST", async () => {
    let resolveRequirements;
    const pending = new Promise((resolve) => { resolveRequirements = resolve; });
    const host = await ready({ pending });
    await host.send();
    expect(discovery(host)).toHaveLength(1);
    expect(streams(host)).toHaveLength(0);
    host.service.handleStreamCancel({}, { requestId: "req-1" });
    resolveRequirements(response(requirements()));
    await flush();
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
  });
});
