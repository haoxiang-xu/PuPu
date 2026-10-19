// The production entry, end to end across the process boundary (#356).
//
// This is the integration hop the two accepted halves never shared: the chat
// page's payload travels through the REAL preload stream client and the REAL
// main service, which now asks the host which credentials the frozen graph
// needs before it dispatches. Everything here is the product's own code; the
// only fakes are the two host seams a desktop app owns (the credential vault
// and the settings registry) and the sidecar's HTTP answers, which are
// recorded so the wire can be asserted.
//
// Every secret below is a sentinel string. No provider is called, no paid API
// is used, and no application is launched.

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
  global.fetch = originalFetch;
  if (originalPython === undefined) delete process.env.UNCHAIN_PYTHON_BIN;
  else process.env.UNCHAIN_PYTHON_BIN = originalPython;
});

const path = require("path");
const { EventEmitter } = require("events");
const { CHANNELS } = require("../../shared/channels");
const {
  createMisoStreamClient,
} = require("../../preload/stream/unchain_stream_client");
const {
  createUnchainService,
} = require("../../main/services/unchain/service");

const originalFetch = global.fetch;
const originalPython = process.env.UNCHAIN_PYTHON_BIN;

const CHAT_ID = "chat-1792345210660-099f0f5079e419655a121096d8e6265b";
const SELECTION = Object.freeze({
  schema: "pupu.skeleton_chat_selection.v1",
  kind: "resource",
  resource_id: "research.agent:v2",
});
const SENTINEL = Object.freeze({
  openai: "OPENAI-ENTRY-SENTINEL",
  anthropic: "ANTHROPIC-ENTRY-SENTINEL",
  "custom.deleted": "CUSTOM-DELETED-ENTRY-SENTINEL",
});
const PROFILE = Object.freeze({
  root: {
    id: "openai:gpt-5.2",
    credential_ref: "openai",
    provider: "openai",
    model: "gpt-5.2",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1",
  },
  child: {
    id: "anthropic:claude-opus-4-6",
    credential_ref: "anthropic",
    provider: "anthropic",
    model: "claude-opus-4-6",
    protocol: "anthropic",
    endpoint: "https://api.anthropic.com",
  },
});
const SECRET_FIELDS = [
  "openaiApiKey",
  "openai_api_key",
  "anthropicApiKey",
  "anthropic_api_key",
  "geminiApiKey",
  "gemini_api_key",
  "custom_provider_api_key",
  "customProviderApiKey",
  "apiKey",
  "api_key",
];

const scope = (overrides = {}) => ({
  schema: "pupu.skeleton_credential_scope.v1",
  mode: "start",
  session_id: CHAT_ID,
  owner_chat_id: CHAT_ID,
  interaction_id: "",
  source_attempt_id: "",
  selection_digest: "a".repeat(64),
  workflows_digest: "b".repeat(64),
  launch_digest: "",
  memory_provider: "openai",
  ...overrides,
});

const requirements = (overrides = {}) => ({
  schema: "pupu.skeleton_credential_requirements.v1",
  kind: "skeleton",
  scope: scope(overrides.scope),
  profiles: overrides.profiles || [PROFILE.root, PROFILE.child],
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

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const doneStream = () => ({
  ok: true,
  status: 200,
  body: {
    getReader: () => ({
      read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
    }),
  },
});

const createFakeSpawnProcess = () => {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 4321;
  proc.kill = jest.fn();
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

const flush = async () => {
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/* The whole chain: the real preload client hands its IPC envelope to the real
   main handler, which talks to this recording transport. */
const createChain = async ({
  answer = () => jsonResponse(requirements()),
  secrets = SENTINEL,
  registry = { status: "missing" },
} = {}) => {
  const outbound = [];
  const transport = jest.fn(async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/health" || options.method !== "POST") {
      return healthResponse();
    }
    const record = {
      path: parsed.pathname,
      headers: options.headers || {},
      body: JSON.parse(options.body),
    };
    outbound.push(record);
    if (record.path === "/skeleton_credentials/requirements") {
      return answer(record);
    }
    return doneStream();
  });
  global.fetch = transport;
  process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

  const sender = {
    id: 11,
    send: jest.fn(),
    isDestroyed: jest.fn(() => false),
    getType: jest.fn(() => "window"),
  };
  const settingsStorageService = {
    getSecretStorageStatus: jest.fn(() => "available"),
    readDecryptedProviderSecret: jest.fn((_kind, id) => secrets[id] || null),
    readModelProviderRegistry: jest.fn(() => registry),
  };
  const service = createUnchainService({
    app: {
      isPackaged: false,
      getAppPath: () => "/app",
      getPath: () => "/tmp/pupu",
      getVersion: () => "0.1.12",
    },
    fs: { existsSync: () => true },
    path,
    spawn: () => createFakeSpawnProcess(),
    spawnSync: () => ({
      status: 0,
      stdout: JSON.stringify({ version: "3.12.2", major: 3, minor: 12, missing: [] }),
    }),
    crypto: { randomBytes: () => ({ toString: () => "auth-token-123" }) },
    net: createAvailableNet(),
    streamRequestImpl: transport,
    webContents: { fromId: () => sender, getAllWebContents: () => [sender] },
    runtimeService: {
      validateWorkspaceRootPath: () => ({ valid: true, resolvedPath: "/workspace/root" }),
    },
    settingsStorageService,
    getAppIsQuitting: () => false,
  });
  await service.startMiso();

  const ipcSends = [];
  const ipcRenderer = {
    send: jest.fn((channel, envelope) => {
      ipcSends.push({ channel, envelope });
      if (channel === CHANNELS.UNCHAIN.STREAM_START_V4) {
        service.handleStreamStartV4({ sender }, envelope);
      }
    }),
    on: jest.fn(),
    removeListener: jest.fn(),
    invoke: jest.fn(),
  };
  const client = createMisoStreamClient(ipcRenderer);

  const send = async (payload) => {
    const handle = client.startStreamV4(payload, {});
    await flush();
    return handle;
  };

  return { service, sender, settingsStorageService, outbound, ipcSends, send };
};

const discovery = (chain) =>
  chain.outbound.filter((row) => row.path === "/skeleton_credentials/requirements");
const streams = (chain) =>
  chain.outbound.filter((row) => row.path !== "/skeleton_credentials/requirements");
const errorsSeen = (chain) =>
  chain.sender.send.mock.calls
    .filter(([, envelope]) => envelope?.event === "error")
    .map(([, envelope]) => envelope.data);
/* This transport answers the chat POST with a body that ends immediately, so
   `unexpected_stream_eof` is the fixture's own signature and not a product
   refusal. It stays visible instead of being filtered out of `errorsSeen`. */
const FIXTURE_EOF = "unexpected_stream_eof";
const entryErrors = (chain) =>
  errorsSeen(chain).filter((row) => row.code !== FIXTURE_EOF);
const expectOnlyFixtureEof = (chain) => {
  expect(entryErrors(chain)).toEqual([]);
  expect(errorsSeen(chain).map((row) => row.code)).toEqual([FIXTURE_EOF]);
};
const noSentinelIn = (value) => {
  const text = JSON.stringify(value);
  Object.values(SENTINEL).forEach((secret) => expect(text).not.toContain(secret));
};

/* The page's own payload for a chat that runs a stored Agent. `modelId` is
   empty on purpose: the composer picked nothing and the resource's Kernel is
   what runs. The preload is what adds `attempt_id`. */
const nativePayload = (overrides = {}) => ({
  message: "run this with the Agent",
  threadId: CHAT_ID,
  owner_chat_id: CHAT_ID,
  memory_v2_requested: true,
  memory_agent_config: {
    displayName: "Memory Agent",
    additionalInstructions: "",
    provider: "openai",
    modelId: "gpt-5.2-mini",
  },
  history: [],
  attachments: [],
  ...overrides,
  options: {
    modelId: "",
    toolkits: ["core"],
    skeleton_selection: { ...SELECTION },
    ...(overrides.options || {}),
  },
});

describe("the Skeleton production entry across preload and main", () => {
  test("a stored Agent with no composer model: the host is asked first, then its own Kernel keys are dispatched", async () => {
    const chain = await createChain();
    await chain.send(nativePayload());

    /* Discovery precedes dispatch, both on the authenticated transport. */
    expect(chain.outbound.map((row) => row.path)).toEqual([
      "/skeleton_credentials/requirements",
      "/chat/stream/v4",
    ]);
    chain.outbound.forEach((row) =>
      expect(row.headers["x-unchain-auth"]).toBe("auth-token-123"),
    );

    /* One identity for the whole chain: the page's thread is the query's
       session, and the dispatch carries that same thread. */
    expect(discovery(chain)[0].body).toEqual({
      schema: "pupu.skeleton_credential_query.v1",
      mode: "start",
      session_id: CHAT_ID,
      owner_chat_id: CHAT_ID,
      interaction_id: "",
      source_attempt_id: "",
      selection: SELECTION,
      recipe_name: "",
      memory_agent_config: nativePayload().memory_agent_config,
    });
    const dispatched = streams(chain)[0].body;
    expect(dispatched.threadId).toBe(CHAT_ID);
    expect(dispatched.owner_chat_id).toBe(CHAT_ID);
    expect(typeof dispatched.attempt_id).toBe("string");
    expect(dispatched.attempt_id.length).toBeGreaterThan(0);

    /* The Agent's own targets, and nothing else, are bound. */
    expect(dispatched.options.skeleton_credentials).toEqual({
      openai: { provider: "openai", endpoint: PROFILE.root.endpoint, api_key: SENTINEL.openai },
      anthropic: { provider: "anthropic", endpoint: PROFILE.child.endpoint, api_key: SENTINEL.anthropic },
    });
    expect(dispatched.options.skeleton_credential_scope).toEqual(scope());
    expect(dispatched.options.skeleton_selection).toEqual(SELECTION);
    expect(dispatched.options.modelId).toBe("");
    expect("recipe_name" in dispatched.options).toBe(false);

    /* Secrets exist only on that one outbound body. */
    noSentinelIn(discovery(chain)[0].body);
    noSentinelIn(chain.sender.send.mock.calls);
    noSentinelIn(chain.ipcSends);
    expectOnlyFixtureEof(chain);
  });

  test("a stale custom pill left in the chat sends neither its key nor its descriptor", async () => {
    const chain = await createChain();
    await chain.send(
      nativePayload({
        options: {
          modelId: "custom.deleted:some-model",
          custom_provider: { provider_key: "custom.deleted", base_url: "https://gone.example/v1" },
          customProviderApiKey: "RENDERER-LEFTOVER",
          custom_provider_api_key: "RENDERER-LEFTOVER",
          __pupu_secret_injection: [
            { kind: "custom_provider", id: "custom.deleted", channel: "model" },
            { kind: "provider", id: "openai", channel: "embedding" },
          ],
          memory_enabled: true,
          memory_embedding_provider: "openai",
        },
      }),
    );

    expect(chain.outbound.map((row) => row.path)).toEqual([
      "/skeleton_credentials/requirements",
      "/chat/stream/v4",
    ]);
    const options = streams(chain)[0].body.options;
    /* The pill's own key is gone, the model-channel descriptor with it; the
       independently declared embedding channel survives. */
    expect(options).not.toHaveProperty("customProviderApiKey");
    expect(options).not.toHaveProperty("custom_provider_api_key");
    expect(JSON.stringify(options)).not.toContain("RENDERER-LEFTOVER");
    expect(options).not.toHaveProperty("__pupu_secret_injection");
    expect(options.openaiApiKey).toBe(SENTINEL.openai);
    expect(options.skeleton_credentials).toHaveProperty("openai");
    /* And the deleted provider's vault entry was never opened. */
    expect(
      chain.settingsStorageService.readDecryptedProviderSecret.mock.calls.some(
        ([, id]) => id === "custom.deleted",
      ),
    ).toBe(false);
    expectOnlyFixtureEof(chain);
  });

  test("two turns in the same chat each ask for their own fence", async () => {
    const chain = await createChain();
    await chain.send(nativePayload());
    await chain.send(nativePayload({ message: "and now the second turn" }));

    expect(chain.outbound.map((row) => row.path)).toEqual([
      "/skeleton_credentials/requirements",
      "/chat/stream/v4",
      "/skeleton_credentials/requirements",
      "/chat/stream/v4",
    ]);
    const sent = streams(chain);
    expect(sent).toHaveLength(2);
    sent.forEach((row) => {
      expect(row.body.options.skeleton_credential_scope).toEqual(scope());
      expect(row.body.options.skeleton_selection).toEqual(SELECTION);
      expect(row.body.threadId).toBe(CHAT_ID);
    });
    expect(sent[0].body.attempt_id).not.toBe(sent[1].body.attempt_id);
    expect(discovery(chain)[0].body).toEqual(discovery(chain)[1].body);
  });

  test("a refused discovery stops the turn with the host's own reason and runs nothing instead", async () => {
    const refusal = {
      error: {
        code: "skeleton_credential_scope_stale",
        path: ["options", "skeleton_credential_scope"],
        message: "Skeleton credential requirements could not be admitted.",
      },
    };
    const chain = await createChain({ answer: () => jsonResponse(refusal, 409) });
    await chain.send(nativePayload());

    /* Nothing was dispatched: no second model, no Default, no keyless POST. */
    expect(streams(chain)).toEqual([]);
    const seen = errorsSeen(chain);
    expect(seen).toHaveLength(1);
    expect(seen[0].code).toBe("skeleton_credential_scope_stale");
    expect(seen[0].status).toBe(409);
    expect(
      chain.settingsStorageService.readDecryptedProviderSecret,
    ).not.toHaveBeenCalled();
  });

  test("a missing credential surfaces as itself and still dispatches nothing", async () => {
    const chain = await createChain({ secrets: { anthropic: SENTINEL.anthropic } });
    await chain.send(nativePayload());

    expect(streams(chain)).toEqual([]);
    expect(errorsSeen(chain).map((row) => row.code)).toEqual([
      "provider_missing_api_key",
    ]);
  });

  test("a durable resume keeps the attempt identity it was launched with", async () => {
    const chain = await createChain({
      answer: () =>
        jsonResponse(
          requirements({
            scope: {
              mode: "resume",
              interaction_id: "interaction-7",
              source_attempt_id: "root-run-3",
              launch_digest: "c".repeat(64),
            },
          }),
        ),
    });
    await chain.send({
      mode: "resume_interaction",
      threadId: CHAT_ID,
      owner_chat_id: CHAT_ID,
      interaction_id: "interaction-7",
      source_attempt_id: "root-run-3",
      message: "",
      history: [],
      attachments: [],
      memory_v2_requested: true,
      memory_agent_config: nativePayload().memory_agent_config,
      options: {},
    });

    expect(discovery(chain)[0].body).toMatchObject({
      mode: "resume",
      session_id: CHAT_ID,
      interaction_id: "interaction-7",
      source_attempt_id: "root-run-3",
      selection: null,
      recipe_name: "",
    });
    const dispatched = streams(chain)[0].body;
    expect(dispatched.source_attempt_id).toBe("root-run-3");
    expect(dispatched.options.skeleton_credential_scope).toMatchObject({
      mode: "resume",
      interaction_id: "interaction-7",
      source_attempt_id: "root-run-3",
      launch_digest: "c".repeat(64),
    });
    expect(dispatched.options.skeleton_credentials).toHaveProperty("openai");
  });

  test("a resume with no source attempt is refused before discovery or any key", async () => {
    const chain = await createChain();
    await chain.send({
      mode: "resume_interaction",
      threadId: CHAT_ID,
      owner_chat_id: CHAT_ID,
      interaction_id: "interaction-7",
      message: "",
      history: [],
      attachments: [],
      options: {},
    });

    expect(chain.outbound).toEqual([]);
    expect(errorsSeen(chain).map((row) => row.code)).toEqual([
      "skeleton_credential_query_invalid",
    ]);
    expect(
      chain.settingsStorageService.readDecryptedProviderSecret,
    ).not.toHaveBeenCalled();
  });

  test("a Legacy Recipe chat keeps the composer's own model and asks for no fence", async () => {
    const chain = await createChain();
    await chain.send({
      message: "run the Recipe",
      threadId: CHAT_ID,
      owner_chat_id: CHAT_ID,
      memory_v2_requested: true,
      history: [],
      attachments: [],
      options: {
        modelId: "openai:gpt-5.2",
        recipe_name: "Research Agent",
        __pupu_secret_injection: [{ kind: "provider", id: "openai", channel: "model" }],
      },
    });

    expect(chain.outbound.map((row) => row.path)).toEqual(["/chat/stream/v4"]);
    const options = streams(chain)[0].body.options;
    expect(options.recipe_name).toBe("Research Agent");
    expect(options).not.toHaveProperty("skeleton_credentials");
    expect(options).not.toHaveProperty("skeleton_credential_scope");
    /* The composer's key still arrives by the descriptor path it always used. */
    expect(options.openaiApiKey).toBe(SENTINEL.openai);
    expect(options.apiKey).toBe(SENTINEL.openai);
    expectOnlyFixtureEof(chain);
  });

  test("the fence and the keys never reach the renderer or the retained options", async () => {
    const chain = await createChain();
    await chain.send(nativePayload());

    const toRenderer = JSON.stringify(chain.sender.send.mock.calls);
    SECRET_FIELDS.forEach((field) => expect(toRenderer).not.toContain(field));
    expect(toRenderer).not.toContain("skeleton_credential_scope");
    noSentinelIn(chain.sender.send.mock.calls);
    /* And the renderer-side envelope the preload sent carries neither. */
    const envelope = JSON.stringify(chain.ipcSends);
    expect(envelope).not.toContain("skeleton_credentials");
    expect(envelope).not.toContain("skeleton_credential_scope");
  });
});
