const path = require("path");
const { EventEmitter } = require("events");
const { createUnchainService } = require("../../main/services/unchain/service");

// Focused suite for the Memory / Context V2 (P0) controlled main-process
// bridge. It locks the three properties the surface exists to guarantee:
//   1. the capability set is explicit (no generic method/path/url/fetch proxy,
//      no internal append/bootstrap/job-lease/namespace surface),
//   2. everything the renderer can influence is validated at THIS boundary
//      (identifiers, pagination, refs, operationId, expectedRevision) and
//      mutation bodies are rebuilt from an allowlist in snake_case,
//   3. nothing privileged leaks outward (auth token, port, filesystem path,
//      row counts on status, raw upstream error text/stack).

const CONTEXT_V2_METHODS = Object.freeze([
  "getContextV2Status",
  "listContextV2Events",
  "readContextV2Content",
  "getContextV2SessionHead",
  "rebaseContextV2Session",
  "deleteContextV2Chat",
  "listContextV2Spaces",
  "getContextV2Tree",
  "listContextV2Entries",
  "searchContextV2Entries",
  "listContextV2Candidates",
  "listContextV2Jobs",
  "listContextV2Promotions",
  "decideContextV2Candidate",
  "createContextV2Promotion",
  "decideContextV2Promotion",
  "listContextV2CandidateReviews",
  "getContextV2CandidateReview",
  "decideContextV2CandidateReview",
]);

const AUTH_TOKEN = "auth-token-123";
const BASE_URL = "http://127.0.0.1:5879";

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
        if (typeof onListening === "function") {
          onListening();
        }
      },
      close(callback) {
        if (typeof callback === "function") {
          callback();
        }
      },
    };
  },
});

const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  text: async () => JSON.stringify(payload),
});

const startService = async (fetchImpl) => {
  const fakeProcess = createFakeSpawnProcess();
  global.fetch = fetchImpl;
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
    spawn: jest.fn(() => fakeProcess),
    spawnSync: jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    })),
    crypto: { randomBytes: jest.fn(() => ({ toString: () => AUTH_TOKEN })) },
    net: createAvailableNet(),
    webContents: {
      fromId: jest.fn(() => null),
      getAllWebContents: jest.fn(() => []),
    },
    runtimeService: {},
    getAppIsQuitting: () => false,
  });

  await service.startMiso();
  return service;
};

const startReadyService = async (payload = { ok: true }) => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(createCompatibleHealthResponse())
    .mockResolvedValue(jsonResponse(payload));
  const service = await startService(fetchImpl);
  return { service, fetchImpl };
};

// Every context v2 call after startup is fetch call #2 onward.
const lastRequest = (fetchImpl) => {
  const calls = fetchImpl.mock.calls;
  return calls[calls.length - 1];
};

describe("context v2 controlled bridge — capability surface", () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test("exposes exactly the explicit context v2 capabilities and no proxy", async () => {
    const { service } = await startReadyService();

    CONTEXT_V2_METHODS.forEach((method) => {
      expect(typeof service[method]).toBe("function");
    });

    // Anything that would be a generic escape hatch or privileged plumbing
    // must not exist on the service surface.
    [
      "contextV2Request",
      "contextV2Fetch",
      "requestContextV2",
      "appendContextV2Event",
      "bootstrapContextV2Session",
      "claimContextV2Job",
      "heartbeatContextV2Job",
      "completeContextV2Job",
      "failContextV2Job",
      "createContextV2Job",
      "createContextV2Space",
      "createContextV2Entry",
      "updateContextV2Entry",
      "deleteContextV2Entry",
      "createContextV2Candidate",
      // schema-v4 reviews: read + adjudicate only. Proposing a review is a
      // curator-job product carried on a lease that never reaches this
      // boundary, and review bodies are read through the existing content ref
      // grammar rather than a second content method.
      "proposeContextV2CandidateReview",
      "createContextV2CandidateReview",
      "readContextV2CandidateReviewContent",
      "getContextV2AuthToken",
      "getContextV2Port",
    ].forEach((method) => {
      expect(service[method]).toBeUndefined();
    });

    // The Context V2 surface is exactly 19 methods on an otherwise unchanged
    // service — no name collides with the legacy memory projection surface.
    expect(typeof service.getMisoMemoryProjection).toBe("function");
    expect(typeof service.getMisoLongTermMemoryProjection).toBe("function");
  });
});

describe("context v2 controlled bridge — reads", () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test("status is count-free and carries no port, url, path or token", async () => {
    const { service, fetchImpl } = await startReadyService({
      available: true,
      schema_version: 7,
      journal_mode: "wal",
      lexical_backend: "fts5",
      vector_status: "degraded",
      feature_ceiling: "all",
      rollout_mode: "canary",
      read_only_degraded: false,
      // Even if the sidecar starts returning counts, they must not pass
      // through: an unscoped count is a free enumeration oracle.
      counts: { events: 4021, entries: 77 },
    });

    const status = await service.getContextV2Status();

    expect(status).toEqual({
      available: true,
      schemaVersion: 7,
      journalMode: "wal",
      lexicalBackend: "fts5",
      vectorStatus: "degraded",
      featureCeiling: "all",
      rolloutMode: "canary",
      readOnlyDegraded: false,
    });
    expect(Object.keys(status)).not.toContain("counts");
    expect(JSON.stringify(status)).not.toContain(AUTH_TOKEN);
    expect(JSON.stringify(status)).not.toContain("5879");

    const [url, options] = lastRequest(fetchImpl);
    expect(url).toBe(`${BASE_URL}/context/v2/status`);
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({ "x-unchain-auth": AUTH_TOKEN });
    // The token rides in the header only — never in the URL.
    expect(url).not.toContain(AUTH_TOKEN);
  });

  test("status short-circuits without a request when the runtime is not ready", async () => {
    const fetchImpl = jest.fn(() => {
      throw new Error("runtime should not be contacted");
    });
    // Never started: status must be a safe, request-free negative.
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    global.fetch = fetchImpl;
    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: { existsSync: jest.fn(() => true) },
      path,
      spawn: jest.fn(() => createFakeSpawnProcess()),
      spawnSync: jest.fn(() => ({ status: 0, stdout: "{}" })),
      crypto: { randomBytes: jest.fn(() => ({ toString: () => AUTH_TOKEN })) },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await expect(service.getContextV2Status()).resolves.toEqual({
      available: false,
      schemaVersion: 0,
      journalMode: "",
      lexicalBackend: "",
      vectorStatus: "",
      featureCeiling: "off",
      rolloutMode: "off",
      readOnlyDegraded: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("session head uses an owner-bound query and returns a camelCase allowlist", async () => {
    const { service, fetchImpl } = await startReadyService({
      owner_chat_id: "chat-1",
      session_id: "session-1",
      admission_mode: "active",
      target_mode: "active",
      bootstrap_status: "complete",
      bootstrap_error_code: "",
      v2_bootstrapped: true,
      sticky: true,
      session_exists: true,
      mutation_ready: true,
      current_generation_id: "generation-7",
      current_generation_no: 7,
      session_revision: 0,
      events: ["must-not-leak"],
      objective: "must-not-leak",
      auth_token: AUTH_TOKEN,
    });

    const head = await service.getContextV2SessionHead({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      path: "/etc/passwd",
    });

    expect(head).toEqual({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      admissionMode: "active",
      targetMode: "active",
      bootstrapStatus: "complete",
      bootstrapErrorCode: "",
      v2Bootstrapped: true,
      sticky: true,
      sessionExists: true,
      mutationReady: true,
      currentGenerationId: "generation-7",
      currentGenerationNo: 7,
      sessionRevision: 0,
    });
    expect(JSON.stringify(head)).not.toContain("must-not-leak");
    expect(JSON.stringify(head)).not.toContain(AUTH_TOKEN);

    const [url, options] = lastRequest(fetchImpl);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/context/v2/session/head");
    expect(parsed.searchParams.get("owner_chat_id")).toBe("chat-1");
    expect(parsed.searchParams.get("session_id")).toBe("session-1");
    expect(parsed.searchParams.has("path")).toBe(false);
    expect(options.method).toBe("GET");
  });

  test("paged event reads build a bounded URLSearchParams query", async () => {
    const { service, fetchImpl } = await startReadyService({ events: [] });

    await service.listContextV2Events({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      attemptId: "attempt-1",
      after: 42,
      limit: 25,
      includePayload: false,
    });

    const [url, options] = lastRequest(fetchImpl);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/context/v2/events");
    expect(Object.fromEntries(parsed.searchParams.entries())).toEqual({
      owner_chat_id: "chat-1",
      after: "42",
      limit: "25",
      session_id: "session-1",
      attempt_id: "attempt-1",
      include_payload: "false",
    });
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
  });

  test("query values are percent-encoded, never concatenated raw", async () => {
    const { service, fetchImpl } = await startReadyService({ results: [] });

    await service.searchContextV2Entries({
      ownerChatId: "chat-1",
      // A query string is free text — it must not be able to inject a
      // parameter separator into the URL.
      query: "deploy&limit=999#frag notes",
      limit: 5,
    });

    const [url] = lastRequest(fetchImpl);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/context/v2/memory/search");
    expect(parsed.searchParams.get("q")).toBe("deploy&limit=999#frag notes");
    expect(parsed.searchParams.get("limit")).toBe("5");
    expect(url).toContain("deploy%26limit%3D999%23frag");
  });

  test("content reads validate the ref grammar and encode it per segment", async () => {
    const { service, fetchImpl } = await startReadyService({ content: "" });

    await service.readContextV2Content({
      ownerChatId: "chat-1",
      ref: "pupu://memory/space-1/entry-1@3",
      offset: 16,
      limit: 4096,
    });

    const [url] = lastRequest(fetchImpl);
    expect(url.startsWith(`${BASE_URL}/context/v2/content/`)).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("owner_chat_id")).toBe("chat-1");
    expect(parsed.searchParams.get("offset")).toBe("16");
    expect(parsed.searchParams.get("limit")).toBe("4096");
    // Segment structure preserved, every segment percent-encoded.
    expect(url).toContain("/content/pupu%3A//memory/space-1/entry-1%403");
    // …and the encoding is lossless: after the server decodes PATH_INFO it
    // sees exactly the ref the `<path:ref>` route contract expects (the same
    // shape unchain_runtime/server/tests/test_route_memory_v2.py exercises).
    expect(decodeURIComponent(parsed.pathname)).toBe(
      "/context/v2/content/pupu://memory/space-1/entry-1@3",
    );
  });

  test("review diff and proposed refs use the controlled content reader", async () => {
    const { service, fetchImpl } = await startReadyService({ content: "review" });

    // eslint-disable-next-line no-restricted-syntax
    for (const leaf of ["diff", "proposed"]) {
      const ref = `pupu://memory/review/review-1@2/${leaf}`;
      // eslint-disable-next-line no-await-in-loop
      await service.readContextV2Content({
        ownerChatId: "chat-1",
        ref,
        offset: 8,
        limit: 2048,
      });

      const [url, options] = lastRequest(fetchImpl);
      const parsed = new URL(url);
      expect(options.method).toBe("GET");
      expect(parsed.searchParams.get("owner_chat_id")).toBe("chat-1");
      expect(parsed.searchParams.get("offset")).toBe("8");
      expect(parsed.searchParams.get("limit")).toBe("2048");
      expect(decodeURIComponent(parsed.pathname)).toBe(
        `/context/v2/content/${ref}`,
      );
    }
  });

  test("review content refs reject suffix, revision, encoding and traversal smuggling", async () => {
    const { service, fetchImpl } = await startReadyService({ content: "" });
    const callsAfterStart = fetchImpl.mock.calls.length;
    const hostileRefs = [
      "pupu://memory/review/review-1@2/diff#fragment",
      "pupu://memory/review/review-1@2/proposed?offset=0",
      "pupu://memory/review/review-1@2/diff/extra",
      "pupu://memory/review/review-1@0/diff",
      "pupu://memory/review/review-1@01/diff",
      "pupu://memory/review/review-1@-1/diff",
      "pupu://memory/review/review-1@1.5/diff",
      "pupu://memory/review/review-1@/diff",
      "pupu://memory/review/review-1%402/diff",
      "pupu://memory/review/review-1@2/%64iff",
      "pupu://memory/review/review-1@2/%2e%2e",
      "pupu://memory/review/..@2/diff",
      "pupu://memory/review/review-1@2/../diff",
      "pupu://memory/review/review-1@2\\diff",
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const ref of hostileRefs) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.readContextV2Content({ ownerChatId: "chat-1", ref }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }

    expect(fetchImpl.mock.calls.length).toBe(callsAfterStart);
  });

  test("hostile content refs are rejected before any request is made", async () => {
    const { service, fetchImpl } = await startReadyService({ content: "" });
    const callsAfterStart = fetchImpl.mock.calls.length;

    const hostileRefs = [
      "../../../../etc/passwd",
      "pupu://memory/space-1/../../secret@1",
      "pupu://context/event/evt-1?owner_chat_id=other-chat",
      "pupu://context/event/evt-1#fragment",
      "file:///etc/passwd",
      "http://127.0.0.1:5879/health",
      "",
      null,
      42,
      `pupu://context/event/${"a".repeat(2048)}`,
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const ref of hostileRefs) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.readContextV2Content({ ownerChatId: "chat-1", ref }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }

    expect(fetchImpl.mock.calls.length).toBe(callsAfterStart);
  });

  test("space, tree and entry reads are owner-scoped and path-validated", async () => {
    const { service, fetchImpl } = await startReadyService({ entries: [] });

    await service.listContextV2Spaces({ ownerChatId: "chat-1" });
    expect(lastRequest(fetchImpl)[0]).toBe(
      `${BASE_URL}/context/v2/memory/spaces?owner_chat_id=chat-1`,
    );

    await service.getContextV2Tree({
      ownerChatId: "chat-1",
      spaceId: "space-1",
    });
    expect(lastRequest(fetchImpl)[0]).toBe(
      `${BASE_URL}/context/v2/memory/spaces/space-1/tree?owner_chat_id=chat-1`,
    );

    await service.listContextV2Entries({
      ownerChatId: "chat-1",
      spaceId: "space-1",
      parentPath: "notes/deploy",
      includeDescendants: false,
    });
    const parsed = new URL(lastRequest(fetchImpl)[0]);
    expect(parsed.pathname).toBe(
      "/context/v2/memory/spaces/space-1/entries",
    );
    expect(parsed.searchParams.get("parent_path")).toBe("/notes/deploy");
    expect(parsed.searchParams.get("include_descendants")).toBe("false");
  });

  test("candidate, job and promotion listings validate their status filter", async () => {
    const { service, fetchImpl } = await startReadyService({ items: [] });

    await service.listContextV2Candidates({
      ownerChatId: "chat-1",
      status: "pending",
      limit: 10,
    });
    expect(new URL(lastRequest(fetchImpl)[0]).pathname).toBe(
      "/context/v2/memory/candidates",
    );

    await service.listContextV2Jobs({ ownerChatId: "chat-1", status: "leased" });
    expect(new URL(lastRequest(fetchImpl)[0]).pathname).toBe(
      "/context/v2/memory/jobs",
    );

    await service.listContextV2Promotions({
      ownerChatId: "chat-1",
      status: "stale",
    });
    expect(new URL(lastRequest(fetchImpl)[0]).pathname).toBe(
      "/context/v2/memory/promotions",
    );

    const callsBefore = fetchImpl.mock.calls.length;
    await expect(
      service.listContextV2Candidates({
        ownerChatId: "chat-1",
        status: "leased", // valid job status, invalid candidate status
      }),
    ).rejects.toThrow(/context_v2_invalid_request/);
    await expect(
      service.listContextV2Jobs({
        ownerChatId: "chat-1",
        status: "'; DROP TABLE jobs; --",
      }),
    ).rejects.toThrow(/context_v2_invalid_request/);
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  test("rebase rejects malformed history, unsupported reasons and oversized payloads before fetch", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });
    const base = {
      ownerChatId: "chat-1",
      sessionId: "session-1",
      replacementHistory: [],
      sourceGenerationId: "generation-1",
      expectedSessionRevision: 0,
      operationId: "op-rebase-0001",
      reason: "edit",
    };
    const callsBefore = fetchImpl.mock.calls.length;
    const invalidPayloads = [
      { replacementHistory: null },
      { replacementHistory: [{ role: "tool", content: "forged" }] },
      { replacementHistory: [{ role: "user" }] },
      { replacementHistory: [{ role: "user", content: null }] },
      { replacementHistory: [{ role: "user", content: Number.NaN }] },
      { replacementHistory: [{ role: "user", content: "x".repeat(4 * 1024 * 1024) }] },
      { reason: "archive" },
      { sourceGenerationId: "../generation" },
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const override of invalidPayloads) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.rebaseContextV2Session({ ...base, ...override }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });
});

describe("context v2 controlled bridge — boundary validation", () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test("every capability requires a well-formed ownerChatId", async () => {
    const { service, fetchImpl } = await startReadyService();
    const callsBefore = fetchImpl.mock.calls.length;

    const badOwners = ["", "   ", "../other-chat", "chat 1", "a".repeat(300), 7, null];

    // eslint-disable-next-line no-restricted-syntax
    for (const ownerChatId of badOwners) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.listContextV2Events({ ownerChatId }),
      ).rejects.toThrow(/context_v2_invalid_request/);
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.listContextV2Spaces({ ownerChatId }),
      ).rejects.toThrow(/context_v2_invalid_request/);
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.listContextV2CandidateReviews({ ownerChatId }),
      ).rejects.toThrow(/context_v2_invalid_request/);
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.getContextV2CandidateReview({
          ownerChatId,
          reviewId: "review-1",
        }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    await expect(service.listContextV2Events()).rejects.toThrow(
      /context_v2_invalid_request/,
    );
    await expect(service.listContextV2CandidateReviews()).rejects.toThrow(
      /context_v2_invalid_request/,
    );
    await expect(service.getContextV2CandidateReview()).rejects.toThrow(
      /context_v2_invalid_request/,
    );
    await expect(service.decideContextV2CandidateReview()).rejects.toThrow(
      /context_v2_invalid_request/,
    );

    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  test("pagination is bounded and strictly integral", async () => {
    const { service, fetchImpl } = await startReadyService({ events: [] });
    const callsBefore = fetchImpl.mock.calls.length;

    const badPages = [
      { limit: 0 },
      { limit: -1 },
      { limit: 501 },
      { limit: 1.5 },
      { limit: "50" },
      { limit: Number.MAX_SAFE_INTEGER },
      { after: -1 },
      { after: 2.5 },
      { after: "10" },
      { includePayload: "false" },
      { includePayload: 1 },
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const page of badPages) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.listContextV2Events({ ownerChatId: "chat-1", ...page }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);

    // Content reads have their own, larger byte ceiling.
    await expect(
      service.readContextV2Content({
        ownerChatId: "chat-1",
        ref: "event:evt-1",
        limit: 128 * 1024 + 1,
      }),
    ).rejects.toThrow(/context_v2_invalid_request/);

    await service.readContextV2Content({
      ownerChatId: "chat-1",
      ref: "event:evt-1",
      limit: 128 * 1024,
    });
    expect(
      new URL(lastRequest(fetchImpl)[0]).searchParams.get("limit"),
    ).toBe("131072");
  });

  test("rebase requires its generation CAS payload and allows revision zero", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });
    const callsBefore = fetchImpl.mock.calls.length;

    const base = {
      ownerChatId: "chat-1",
      sessionId: "session-1",
      replacementHistory: [],
      sourceGenerationId: "generation-1",
      expectedSessionRevision: 2,
      operationId: "op-rebase-0001",
      reason: "edit",
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const operationId of ["", "short", "op id with spaces", 42, null, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.rebaseContextV2Session({ ...base, operationId }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const expectedSessionRevision of [-1, 1.5, "2", null, undefined]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.rebaseContextV2Session({ ...base, expectedSessionRevision }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }

    await expect(
      service.rebaseContextV2Session({ ...base, expectedSessionRevision: 0 }),
    ).resolves.toEqual(expect.objectContaining({ sessionRevision: 0 }));

    await expect(
      service.deleteContextV2Chat({ ownerChatId: "chat-1" }),
    ).rejects.toThrow(/context_v2_invalid_request/);

    expect(fetchImpl.mock.calls.length).toBe(callsBefore + 1);
  });

  test("rebase and delete-chat send allowlisted snake_case bodies only", async () => {
    const { service, fetchImpl } = await startReadyService({
      owner_chat_id: "chat-1",
      session_id: "session-1",
      attempt_id: "attempt-rebase-1",
      generation_id: "generation-2",
      generation_no: 2,
      source_generation_id: "generation-1",
      source_generation_ref: "pupu://context/generation/generation-1",
      session_revision: 3,
      event_count: 3,
      message_event_count: 2,
      event_refs: ["pupu://context/event/event-1"],
      turn_mutation_event_ref: "pupu://context/event/event-1",
      capture_quality: "partial",
      journal_digest: "digest-1",
      pinned_task_state_revision: 1,
      replacement_history_hash: "hash-1",
      reason: "edit",
      replayed: false,
      secret_payload: "must-not-leak",
    });

    const result = await service.rebaseContextV2Session({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      replacementHistory: [
        { role: "USER", content: "Replacement", ignored: "drop-me" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
        },
      ],
      sourceGenerationId: "generation-1",
      expectedSessionRevision: 2,
      operationId: "op-rebase-0001",
      reason: "EDIT",
      // Hostile extras must not survive the rebuild.
      unchain_auth: AUTH_TOKEN,
      workspaceRoot: "/Users/red/secret",
      target_namespace: "user:attacker",
    });

    expect(result).toEqual({
      ownerChatId: "chat-1",
      sessionId: "session-1",
      attemptId: "attempt-rebase-1",
      generationId: "generation-2",
      generationNo: 2,
      sourceGenerationId: "generation-1",
      sourceGenerationRef: "pupu://context/generation/generation-1",
      sessionRevision: 3,
      eventCount: 3,
      messageEventCount: 2,
      eventRefs: ["pupu://context/event/event-1"],
      turnMutationEventRef: "pupu://context/event/event-1",
      captureQuality: "partial",
      journalDigest: "digest-1",
      pinnedTaskStateRevision: 1,
      replacementHistoryHash: "hash-1",
      reason: "edit",
      replayed: false,
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");

    const [rebaseUrl, rebaseOptions] = lastRequest(fetchImpl);
    expect(rebaseUrl).toBe(`${BASE_URL}/context/v2/session/rebase`);
    expect(rebaseOptions.method).toBe("POST");
    expect(rebaseOptions.headers).toEqual({
      "Content-Type": "application/json",
      "x-unchain-auth": AUTH_TOKEN,
    });
    expect(JSON.parse(rebaseOptions.body)).toEqual({
      owner_chat_id: "chat-1",
      session_id: "session-1",
      replacement_history: [
        { role: "user", content: "Replacement" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
        },
      ],
      source_generation_id: "generation-1",
      expected_session_revision: 2,
      operation_id: "op-rebase-0001",
      reason: "edit",
    });

    await service.deleteContextV2Chat({
      ownerChatId: "chat-1",
      operationId: "op-delete-0001",
      recursive: true,
    });
    const [deleteUrl, deleteOptions] = lastRequest(fetchImpl);
    expect(deleteUrl).toBe(`${BASE_URL}/context/v2/chat/chat-1`);
    expect(deleteOptions.method).toBe("DELETE");
    expect(JSON.parse(deleteOptions.body)).toEqual({
      operation_id: "op-delete-0001",
    });
  });

  test("delete-chat preserves the sidecar retryable classification for the private outbox", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "context_v2_store_schema_incompatible",
              message: "schema cannot be resolved",
              retryable: false,
              ignored: "must not be projected",
            },
          },
          { ok: false, status: 503 },
        ),
      );
    const service = await startService(fetchImpl);

    const rejection = await service
      .deleteContextV2Chat({
        ownerChatId: "chat-1",
        operationId: "op-delete-typed-error-0001",
      })
      .catch((error) => error);

    expect(rejection).toMatchObject({
      code: "context_v2_store_schema_incompatible",
      retryable: false,
    });
    expect(rejection.message).toBe(
      "[context_v2_store_schema_incompatible] context v2 request failed",
    );
    expect(rejection.message).not.toContain("schema cannot be resolved");
  });

  test("candidate decision is an enum and its body is allowlisted", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });

    await service.decideContextV2Candidate({
      ownerChatId: "chat-1",
      candidateId: "cand-1",
      decision: "APPLY",
      expectedRevision: 1,
      expectedSpaceRevision: 4,
      decisionReason: "user approved",
      operationId: "op-candidate-0001",
      targetPath: "/somewhere/else",
      target_namespace: "user:attacker",
    });

    const [url, options] = lastRequest(fetchImpl);
    expect(url).toBe(
      `${BASE_URL}/context/v2/memory/candidates/cand-1/decision`,
    );
    expect(JSON.parse(options.body)).toEqual({
      owner_chat_id: "chat-1",
      decision: "apply",
      expected_revision: 1,
      operation_id: "op-candidate-0001",
      decision_reason: "user approved",
      expected_space_revision: 4,
    });

    const callsBefore = fetchImpl.mock.calls.length;
    // eslint-disable-next-line no-restricted-syntax
    for (const decision of ["delete", "", "apply; drop", null, true]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.decideContextV2Candidate({
          ownerChatId: "chat-1",
          candidateId: "cand-1",
          decision,
          expectedRevision: 1,
          operationId: "op-candidate-0001",
        }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  test("promotion create never carries a renderer-supplied target namespace", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });

    await service.createContextV2Promotion({
      ownerChatId: "chat-1",
      sourceSpaceId: "space-1",
      sourceEntryId: "entry-1",
      sourceEntryRevision: 2,
      targetPath: "profile/preferences.md",
      expectedTargetRevision: 5,
      operationId: "op-promote-0001",
      // Both spellings of the server-bound field must be dropped.
      targetNamespace: "user:attacker",
      target_namespace: "user:attacker",
    });

    const [url, options] = lastRequest(fetchImpl);
    expect(url).toBe(`${BASE_URL}/context/v2/memory/promotions`);
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      owner_chat_id: "chat-1",
      source_space_id: "space-1",
      source_entry_id: "entry-1",
      source_entry_revision: 2,
      target_path: "/profile/preferences.md",
      target_entry_id: "",
      operation_id: "op-promote-0001",
      expected_target_revision: 5,
    });
    expect(options.body).not.toContain("namespace");
    expect(options.body).not.toContain("attacker");
  });

  test("promotion target paths reject traversal, backslashes and control characters", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });
    const callsBefore = fetchImpl.mock.calls.length;

    const badPaths = [
      "",
      "/",
      "../../etc/passwd",
      "/profile/../../etc/passwd",
      "C:\\Users\\red\\secret",
      `/profile/${"a".repeat(300)}.md`,
      `/profile/${String.fromCharCode(0)}name.md`,
      "a".repeat(1100),
      42,
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const targetPath of badPaths) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.createContextV2Promotion({
          ownerChatId: "chat-1",
          sourceSpaceId: "space-1",
          sourceEntryId: "entry-1",
          sourceEntryRevision: 2,
          targetPath,
          operationId: "op-promote-0001",
        }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }

    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  test("promotion decision posts an allowlisted body to the identified promotion", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });

    await service.decideContextV2Promotion({
      ownerChatId: "chat-1",
      promotionId: "promo-1",
      decision: "reject",
      expectedRevision: 3,
      decisionReason: "not now",
      operationId: "op-promo-decide-0001",
      expectedSpaceRevision: 9,
    });

    const [url, options] = lastRequest(fetchImpl);
    expect(url).toBe(
      `${BASE_URL}/context/v2/memory/promotions/promo-1/decision`,
    );
    expect(JSON.parse(options.body)).toEqual({
      owner_chat_id: "chat-1",
      decision: "reject",
      expected_revision: 3,
      operation_id: "op-promo-decide-0001",
      decision_reason: "not now",
    });
  });
});

describe("context v2 controlled bridge — schema-v4 candidate reviews", () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  const hostileReviewPayload = () => ({
    review_id: "review-1",
    review_ref: "pupu://memory/review/review-1@2",
    // A response must never be able to re-attribute itself to another chat:
    // ownerChatId is echoed from the CALLER's validated value.
    owner_chat_id: "chat-attacker",
    job_id: "job-1",
    candidate_id: "cand-1",
    candidate_ref: "pupu://memory/candidate/cand-1@3",
    candidate_revision: 3,
    status: "pending",
    revision: 2,
    decision_reason: "",
    diff_ref: "pupu://memory/review/review-1@2/diff",
    diff_preview: "d".repeat(20000),
    target: {
      space_id: "space-1",
      path: "/profile/preferences.md",
      entry_id: "entry-1",
      expected_revision: 4,
      // Unknown target keys must not survive the rebuild.
      absolute_path: "/Users/red/Library/pupu/memory.db",
    },
    proposed: {
      mode: "update",
      kind: "file",
      description: "tighten the deploy note",
      mime_type: "text/markdown",
      link_url: "",
      candidate_ref: "pupu://memory/candidate/cand-1@3",
      candidate_revision: 3,
      source_event_ids: ["evt-1", 42, "evt-2"],
      candidate_payload_hash: "must-not-leak",
      content: {
        ref: "pupu://memory/review/review-1@2/proposed",
        media_type: "text/markdown",
        bytes: 128,
        sha256: "abc123",
        object_path: "/Users/red/Library/pupu/objects/ab/abc123",
      },
    },
    created_at_ms: 1000,
    updated_at_ms: 2000,
    decided_at_ms: null,
    replayed: false,
    // Privileged plumbing a regressed sidecar might start attaching.
    auth_token: AUTH_TOKEN,
    db_path: "/Users/red/Library/pupu/memory.db",
    port: 5879,
  });

  test("the review queue is owner-scoped, status-validated and projected", async () => {
    const { service, fetchImpl } = await startReadyService({
      owner_chat_id: "chat-attacker",
      reviews: [hostileReviewPayload()],
      // A list envelope must not carry counts or plumbing either.
      total: 91,
      auth_token: AUTH_TOKEN,
    });

    const listed = await service.listContextV2CandidateReviews({
      ownerChatId: "chat-1",
      status: "PENDING",
      limit: 10,
    });

    const [url, options] = lastRequest(fetchImpl);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/context/v2/memory/reviews");
    expect(parsed.searchParams.get("owner_chat_id")).toBe("chat-1");
    expect(parsed.searchParams.get("status")).toBe("pending");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({ "x-unchain-auth": AUTH_TOKEN });
    expect(url).not.toContain(AUTH_TOKEN);

    // Envelope is rebuilt: exactly two keys, owner echoed from the caller.
    expect(Object.keys(listed).sort()).toEqual(["ownerChatId", "reviews"]);
    expect(listed.ownerChatId).toBe("chat-1");
    expect(listed.reviews).toHaveLength(1);
    expect(listed.reviews[0].ownerChatId).toBe("chat-1");
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(AUTH_TOKEN);
    expect(serialized).not.toContain("chat-attacker");
    expect(serialized).not.toContain("Library/pupu");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("5879");

    const callsBefore = fetchImpl.mock.calls.length;
    // "superseded" is a valid CANDIDATE status but not a review status, so the
    // enums must not have been shared by accident.
    // eslint-disable-next-line no-restricted-syntax
    for (const status of ["superseded", "leased", "'; DROP TABLE reviews; --"]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.listContextV2CandidateReviews({
          ownerChatId: "chat-1",
          status,
        }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    await expect(
      service.listContextV2CandidateReviews({ ownerChatId: "../chat" }),
    ).rejects.toThrow(/context_v2_invalid_request/);
    await expect(
      service.listContextV2CandidateReviews({
        ownerChatId: "chat-1",
        limit: -1,
      }),
    ).rejects.toThrow(/context_v2_invalid_request/);
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  test("a single review is rebuilt field-by-field with bounded previews", async () => {
    const { service, fetchImpl } = await startReadyService(
      hostileReviewPayload(),
    );

    const review = await service.getContextV2CandidateReview({
      ownerChatId: "chat-1",
      reviewId: "review-1",
    });

    const [url] = lastRequest(fetchImpl);
    expect(new URL(url).pathname).toBe("/context/v2/memory/reviews/review-1");
    expect(new URL(url).searchParams.get("owner_chat_id")).toBe("chat-1");

    // Closed key set on the way OUT, not just on the way in.
    expect(Object.keys(review).sort()).toEqual(
      [
        "candidateId",
        "candidateRef",
        "candidateRevision",
        "createdAtMs",
        "decidedAtMs",
        "decisionReason",
        "diffPreview",
        "diffRef",
        "jobId",
        "ownerChatId",
        "proposed",
        "replayed",
        "reviewId",
        "reviewRef",
        "revision",
        "status",
        "target",
        "updatedAtMs",
      ].sort(),
    );
    expect(review.ownerChatId).toBe("chat-1");
    expect(review.status).toBe("pending");
    expect(review.revision).toBe(2);
    // decided_at_ms is null upstream while pending — it must not become NaN.
    expect(review.decidedAtMs).toBe(0);
    // The diff preview is clamped: an unbounded blob cannot cross the IPC line.
    expect(review.diffPreview).toHaveLength(8192);

    expect(Object.keys(review.target).sort()).toEqual(
      ["entryId", "expectedRevision", "path", "spaceId"].sort(),
    );
    expect(review.target.absolutePath).toBeUndefined();
    expect(review.proposed.candidatePayloadHash).toBeUndefined();
    // Non-string ids in the array are dropped, not coerced.
    expect(review.proposed.sourceEventIds).toEqual(["evt-1", "evt-2"]);
    expect(Object.keys(review.proposed.content).sort()).toEqual(
      ["bytes", "mediaType", "ref", "sha256"].sort(),
    );
    expect(review.proposed.content.objectPath).toBeUndefined();

    const serialized = JSON.stringify(review);
    expect(serialized).not.toContain(AUTH_TOKEN);
    expect(serialized).not.toContain("chat-attacker");
    expect(serialized).not.toContain("Library/pupu");

    const callsBefore = fetchImpl.mock.calls.length;
    // eslint-disable-next-line no-restricted-syntax
    for (const reviewId of ["", "../review", "review 1", null]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.getContextV2CandidateReview({
          ownerChatId: "chat-1",
          reviewId,
        }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  test("a metadata-only review projects without a content descriptor", async () => {
    const { service } = await startReadyService({
      review_id: "review-2",
      status: "applied",
      revision: 3,
      proposed: { mode: "update", kind: "note" },
    });

    const review = await service.getContextV2CandidateReview({
      ownerChatId: "chat-1",
      reviewId: "review-2",
    });

    expect(review.proposed.content).toBeUndefined();
    expect(review.proposed.sourceEventIds).toEqual([]);
    expect(review.target).toEqual({
      spaceId: "",
      path: "",
      entryId: "",
      expectedRevision: 0,
    });
  });

  test("a review decision sends an allowlisted snake_case body with its CAS fences", async () => {
    const { service, fetchImpl } = await startReadyService(
      hostileReviewPayload(),
    );

    await service.decideContextV2CandidateReview({
      ownerChatId: "chat-1",
      reviewId: "review-1",
      decision: "APPLY",
      expectedReviewRevision: 2,
      expectedCandidateRevision: 3,
      expectedTargetRevision: 4,
      expectedSpaceRevision: 5,
      decisionReason: "looks right",
      operationId: "op-review-0001",
      // A decision says WHETHER a proposed write lands, never WHERE.
      targetPath: "/profile/attacker.md",
      target_path: "/profile/attacker.md",
      targetNamespace: "user:attacker",
      target_namespace: "user:attacker",
      spaceId: "space-attacker",
      jobId: "job-attacker",
      leaseToken: "lease-1",
      workerId: "worker-1",
    });

    const [url, options] = lastRequest(fetchImpl);
    expect(url).toBe(`${BASE_URL}/context/v2/memory/reviews/review-1/decision`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      owner_chat_id: "chat-1",
      decision: "apply",
      expected_review_revision: 2,
      operation_id: "op-review-0001",
      decision_reason: "looks right",
      expected_candidate_revision: 3,
      expected_target_revision: 4,
      expected_space_revision: 5,
    });
    expect(options.body).not.toContain("attacker");
    expect(options.body).not.toContain("namespace");
    expect(options.body).not.toContain("lease");
    expect(options.body).not.toContain("worker");
  });

  test("optional fences are omitted rather than sent as null", async () => {
    const { service, fetchImpl } = await startReadyService(
      hostileReviewPayload(),
    );

    await service.decideContextV2CandidateReview({
      ownerChatId: "chat-1",
      reviewId: "review-1",
      decision: "reject",
      expectedReviewRevision: 7,
      operationId: "op-review-0002",
    });

    const [, options] = lastRequest(fetchImpl);
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      owner_chat_id: "chat-1",
      decision: "reject",
      expected_review_revision: 7,
      operation_id: "op-review-0002",
      decision_reason: "",
    });
    ["expected_candidate_revision", "expected_target_revision", "expected_space_revision"].forEach(
      (key) => {
        expect(Object.prototype.hasOwnProperty.call(body, key)).toBe(false);
      },
    );
  });

  test("a review decision refuses to leave the boundary without a valid fence", async () => {
    const { service, fetchImpl } = await startReadyService({ ok: true });
    const base = {
      ownerChatId: "chat-1",
      reviewId: "review-1",
      decision: "apply",
      expectedReviewRevision: 2,
      operationId: "op-review-0001",
    };
    const callsBefore = fetchImpl.mock.calls.length;
    const invalidPayloads = [
      // The review fence is REQUIRED: applying a diff with no CAS on the review
      // itself could commit something the user never saw.
      { expectedReviewRevision: undefined },
      { expectedReviewRevision: null },
      { expectedReviewRevision: 0 },
      { expectedReviewRevision: -1 },
      { expectedReviewRevision: 1.5 },
      { expectedReviewRevision: "2" },
      // Optional fences are integers-or-absent, never coercible strings.
      { expectedCandidateRevision: "3" },
      { expectedTargetRevision: 0 },
      { expectedSpaceRevision: Number.NaN },
      // Decision is a closed enum — no delete/apply-all smuggling.
      { decision: "delete" },
      { decision: "apply; drop" },
      { decision: "" },
      { decision: null },
      { decision: true },
      // Identity and idempotency are non-negotiable.
      { ownerChatId: "../chat" },
      { reviewId: "../review" },
      { operationId: "short" },
      { operationId: "op review 0001" },
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const override of invalidPayloads) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        service.decideContextV2CandidateReview({ ...base, ...override }),
      ).rejects.toThrow(/context_v2_invalid_request/);
    }
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });
});

describe("context v2 controlled bridge — error containment", () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test("upstream failures keep their stable code but drop upstream detail", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            error: {
              code: "context_v2_operation_conflict",
              message:
                'conflict at /Users/red/Library/Application Support/PuPu/context_v2.sqlite3 :: Traceback (most recent call last): File "memory_v2_store.py", line 1114',
              retryable: false,
            },
          }),
      });
    const service = await startService(fetchImpl);

    const rejection = await service
      .rebaseContextV2Session({
        ownerChatId: "chat-1",
        sessionId: "session-1",
        replacementHistory: [],
        sourceGenerationId: "generation-1",
        expectedSessionRevision: 2,
        operationId: "op-rebase-0001",
        reason: "edit",
      })
      .catch((error) => error);

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection.code).toBe("context_v2_operation_conflict");
    expect(rejection.message).toBe(
      "[context_v2_operation_conflict] context v2 request failed",
    );
    // No path, no traceback, no upstream prose crosses back to the renderer.
    expect(rejection.message).not.toContain("Traceback");
    expect(rejection.message).not.toContain("sqlite3");
    expect(rejection.message).not.toContain("Application Support");
  });

  test.each([
    ["context_v2_rebase_in_progress", 409, true],
    ["context_v2_rebase_recovery_required", 409, true],
    ["context_v2_rebase_journal_incompatible", 409, false],
    ["context_v2_operation_conflict", 409, false],
    ["context_v2_revision_conflict", 409, true],
    ["context_v2_generation_conflict", 409, true],
    ["context_v2_rebase_unavailable", 503, true],
  ])("the rebase carrier preserves structured code %s exactly", async (
    code,
    status,
    retryable,
  ) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValue({
        ok: false,
        status,
        text: async () =>
          JSON.stringify({
            error: {
              code,
              message: "sidecar detail must not cross the IPC boundary",
              retryable,
            },
          }),
      });
    const service = await startService(fetchImpl);

    const rejection = await service
      .rebaseContextV2Session({
        ownerChatId: "chat-1",
        sessionId: "session-1",
        replacementHistory: [],
        sourceGenerationId: "generation-1",
        expectedSessionRevision: 2,
        operationId: "op-rebase-0001",
        reason: "edit",
      })
      .catch((error) => error);

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection.code).toBe(code);
    expect(rejection.retryable).toBe(retryable);
    expect(rejection.message).toBe(`[${code}] context v2 request failed`);
    expect(rejection.message).not.toContain("sidecar detail");
  });

  test("transport failures are normalized and never echo the target url", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockRejectedValue(
        new Error("connect ECONNREFUSED 127.0.0.1:5879 (auth-token-123)"),
      );
    const service = await startService(fetchImpl);

    const rejection = await service
      .listContextV2Spaces({ ownerChatId: "chat-1" })
      .catch((error) => error);

    expect(rejection.code).toBe("context_v2_unreachable");
    expect(rejection.retryable).toBe(true);
    expect(rejection.message).toBe(
      "[context_v2_unreachable] context v2 runtime is unreachable",
    );
    expect(rejection.message).not.toContain(AUTH_TOKEN);
    expect(rejection.message).not.toContain("5879");
  });

  test("a runtime that never became ready rejects reads without contacting the sidecar", async () => {
    const fetchImpl = jest.fn(() => {
      throw new Error("runtime should not be contacted");
    });
    global.fetch = fetchImpl;
    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: { existsSync: jest.fn(() => true) },
      path,
      spawn: jest.fn(() => createFakeSpawnProcess()),
      spawnSync: jest.fn(() => ({ status: 0, stdout: "{}" })),
      crypto: { randomBytes: jest.fn(() => ({ toString: () => AUTH_TOKEN })) },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    // Every capability (not just status) fails closed while the sidecar is
    // not ready — no request is attempted at all.
    await expect(
      service.listContextV2Spaces({ ownerChatId: "chat-1" }),
    ).rejects.toThrow(/not ready/i);
    await expect(
      service.decideContextV2Candidate({
        ownerChatId: "chat-1",
        candidateId: "cand-1",
        decision: "apply",
        expectedRevision: 1,
        operationId: "op-candidate-0001",
      }),
    ).rejects.toThrow(/not ready/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
