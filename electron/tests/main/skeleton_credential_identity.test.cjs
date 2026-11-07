const { buildSkeletonCredentialQuery } = require("../../main/services/unchain/skeleton_credentials");

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
describe("Skeleton discovery and HTTP thread identity", () => {
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
    message: "Run the selected Agent", threadId: "session-1", owner_chat_id: "chat-1", attempt_id: "attempt-1",
    options: { skeleton_selection: SELECTION }, ...overrides,
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPython === undefined) delete process.env.UNCHAIN_PYTHON_BIN;
    else process.env.UNCHAIN_PYTHON_BIN = originalPython;
    jest.restoreAllMocks();
  });
  const ready = async ({ result = requirements(), status = 200, pending, definitions = [], secrets = SECRET, streamResponse } = {}) => {
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
      return streamResponse || response({});
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

  test("first send uses the HTTP threadId over contradictory execution and session aliases", async () => {
    const host = await ready();
    await host.send(nativePayload({ execution_id: "wrong-execution", session_id: "wrong-session" }));
    expect(discovery(host)).toHaveLength(1);
    expect(discovery(host)[0].body.session_id).toBe("session-1");
    expect(streams(host)).toHaveLength(1);
    const sent = streams(host)[0].body;
    expect(sent.threadId || sent.thread_id).toBe(discovery(host)[0].body.session_id);
    expect(host.secretStore.readDecryptedProviderSecret.mock.calls).toEqual([["provider", "openai"]]);
  });

  test("resume binds discovery to the same actual HTTP thread rather than an execution alias", async () => {
    const host = await ready({ result: requirements([PROFILE.openai], { scope: scope({ mode: "resume", interaction_id: "interaction-1", source_attempt_id: "root-1", launch_digest: "c".repeat(64) }) }) });
    await host.send(nativePayload({ mode: "resume_interaction", interaction_id: "interaction-1", source_attempt_id: "root-1", execution_id: "different-execution", session_id: "different-session", options: {} }));
    expect(discovery(host)).toHaveLength(1);
    expect(discovery(host)[0].body).toMatchObject({ mode: "resume", session_id: "session-1", interaction_id: "interaction-1", source_attempt_id: "root-1", selection: null });
    expect(streams(host)).toHaveLength(1);
    const sent = streams(host)[0].body;
    expect(sent.threadId || sent.thread_id).toBe(discovery(host)[0].body.session_id);
  });

  test.each(["start", "resume"])("missing HTTP thread is refused before discovery or decryption for %s", async (mode) => {
    const host = await ready();
    const payload = nativePayload({ threadId: undefined, execution_id: "session-1", session_id: "session-1", ...(mode === "resume" ? { mode: "resume_interaction", interaction_id: "interaction-1" } : {}) });
    await host.send(payload);
    expect(discovery(host)).toHaveLength(0);
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
    expect(errors(host)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "skeleton_credential_query_invalid" })]));
  });

  test.each([null, ""])("a falsey HTTP camel thread falls through to snake thread (%p)", async (camel) => {
    const host = await ready();
    await host.send(nativePayload({ threadId: camel, thread_id: "session-1" }));
    expect(discovery(host)[0].body.session_id).toBe("session-1");
    expect(streams(host)).toHaveLength(1);
    const sent = streams(host)[0].body;
    expect(sent.threadId || sent.thread_id).toBe("session-1");
  });

  test("a truthy blank camel thread does not silently fall through to snake", async () => {
    const host = await ready();
    await host.send(nativePayload({ threadId: "   ", thread_id: "session-1" }));
    expect(discovery(host)).toHaveLength(0);
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
    expect(errors(host)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "skeleton_credential_query_invalid" })]));
  });

  test("two canonical HTTP thread spellings use the camel winner", () => {
    expect(buildSkeletonCredentialQuery(nativePayload({ thread_id: "other-thread", session_id: "wrong-session" })).session_id).toBe("session-1");
  });

  test("native query refuses a non-canonical selected thread rather than coercing or stripping", () => {
    for (const id of [" padded", "padded ", 7, true, ["session-1"], { id: "session-1" }]) {
      expect(() => buildSkeletonCredentialQuery(nativePayload({ threadId: id }))).toThrow();
    }
  });

  test("ordinary legacy send retains its HTTP fallback behavior without native discovery", async () => {
    const host = await ready();
    await host.send({ message: "Legacy", session_id: "legacy-session", options: { recipe_name: "Legacy" } });
    expect(discovery(host)).toHaveLength(0);
    expect(streams(host)).toHaveLength(1);
    expect(streams(host)[0].body).not.toHaveProperty("threadId");
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
  });

  test("a Main-only camel owner alias cannot authorize an absent HTTP owner", async () => {
    const host = await ready();
    await host.send(nativePayload({ owner_chat_id: undefined, ownerChatId: "chat-1" }));
    expect(discovery(host)).toHaveLength(0);
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
    expect(errors(host)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "skeleton_credential_query_invalid" })]));
  });

  test("a Main-only camel interaction alias cannot authorize an absent HTTP interaction", async () => {
    const host = await ready();
    await host.send(nativePayload({ mode: "resume_interaction", interactionId: "interaction-1", options: {} }));
    expect(discovery(host)).toHaveLength(0);
    expect(streams(host)).toHaveLength(0);
    expect(host.secretStore.readDecryptedProviderSecret).not.toHaveBeenCalled();
    expect(errors(host)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "skeleton_credential_query_invalid" })]));
  });

  test("V4 replay and attachment bind to the actual HTTP thread, never a conflicting execution alias", async () => {
    const encoder = new TextEncoder();
    const reader = {
      read: jest.fn()
        .mockResolvedValueOnce({ done: false, value: encoder.encode('event: runtime_event\ndata: {"schema_version":"v4","event_id":"identity-delta","type":"step.delta","seq":1}\n\nevent: done\ndata: {"ok":true}\n\n') })
        .mockResolvedValueOnce({ done: true }),
    };
    const host = await ready({ streamResponse: { ok: true, body: { getReader: () => reader } } });
    host.service.handleStreamStartV4({ sender: host.sender }, {
      requestId: "identity-v4",
      attachmentId: "initial-attachment",
      payload: nativePayload({ execution_id: "wrong-execution", session_id: "wrong-session" }),
    });
    await flush();
    expect(discovery(host)[0].body.session_id).toBe("session-1");
    expect(streams(host)).toHaveLength(1);
    expect(streams(host)[0].body.threadId).toBe("session-1");
    const attached = createReplayTarget(2);
    expect(host.service.attachMisoStreamV4({ sender: attached }, {
      requestId: "identity-v4", executionId: "wrong-execution", attemptId: "attempt-1", attachmentId: "wrong-attachment", afterSeq: 0,
    })).toMatchObject({ ok: false, code: "stream_identity_mismatch" });
    expect(attached.send).not.toHaveBeenCalled();
    expect(host.service.attachMisoStreamV4({ sender: attached }, {
      requestId: "identity-v4", executionId: "session-1", attemptId: "attempt-1", attachmentId: "actual-attachment", afterSeq: 0,
    })).toMatchObject({ ok: true, execution_id: "session-1", attempt_id: "attempt-1", terminal: true, active: false, replayed_through_seq: 2 });
    expect(attached.send.mock.calls.map((call) => call[1].event)).toEqual(["runtime_event", "done"]);
    assertNoSecrets(attached.send.mock.calls);
  });
});
