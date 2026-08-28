const path = require("path");
const fs = require("fs");
const os = require("os");
const { createHook } = require("async_hooks");
const { EventEmitter } = require("events");
const { Readable } = require("stream");
const { CHANNELS } = require("../../shared/channels");
const {
  createNodeStreamFetch,
  createUnchainService,
} = require("../../main/services/unchain/service");

const createRuntimeContract = (overrides = {}) => {
  const { capabilities: capabilityOverrides = {}, ...contractOverrides } =
    overrides;
  return {
    schema: "pupu.runtime-capabilities",
    version: 1,
    capabilities: {
      runtime_events_v4: true,
      execution_fencing: true,
      durable_interactions: true,
      exact_cancellation: true,
      durable_jobs: {
        version: "D4.1",
        available: true,
        reason: "",
      },
      automatic_wake_resume: false,
      ...capabilityOverrides,
    },
    reasons: {},
    ...contractOverrides,
  };
};

const createCompatibleHealthResponse = (
  contract = createRuntimeContract(),
  sessionGuardStatus = "ready",
) => ({
  ok: true,
  json: async () => ({
    status: "ok",
    contract,
    session_guard_migration: {
      schema: "pupu.session-guard-migration",
      version: 1,
      status: sessionGuardStatus,
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

const createNodeRequestHarness = () => {
  let respondToRequest = null;
  const responseEndResources = new Set();
  const request = new EventEmitter();
  request.destroyed = false;
  request.setTimeout = jest.fn();
  request.end = jest.fn();
  request.destroy = jest.fn(() => {
    request.destroyed = true;
  });
  const requestImpl = jest.fn((_url, _options, onResponse) => {
    respondToRequest = onResponse;
    return request;
  });
  return {
    request,
    requestImpl,
    respond(response) {
      if (typeof respondToRequest !== "function") {
        throw new Error("Node request has not started");
      }
      const hook = createHook({
        init(_asyncId, type, _triggerAsyncId, resource) {
          if (type === "STREAM_END_OF_STREAM") {
            responseEndResources.add(resource);
          }
        },
      });
      hook.enable();
      try {
        respondToRequest(response);
      } finally {
        hook.disable();
      }
    },
    disposeResponseEndResources() {
      // Node 24 releases Readable.toWeb() EOS bookkeeping on GC, even after
      // the source stream closes. Dispose it explicitly in this test fixture.
      responseEndResources.forEach((resource) => {
        resource.emitDestroy();
      });
      responseEndResources.clear();
    },
  };
};

const createRangeBusyNet = ({ ephemeralPort }) => ({
  createServer() {
    const listeners = new Map();
    let boundPort = null;
    return {
      unref() {},
      once(event, callback) {
        listeners.set(event, callback);
      },
      listen(port) {
        if (port === 0) {
          boundPort = ephemeralPort;
          const onListening = listeners.get("listening");
          if (typeof onListening === "function") {
            onListening();
          }
          return;
        }

        const onError = listeners.get("error");
        if (typeof onError === "function") {
          onError(new Error("EADDRINUSE"));
        }
      },
      address() {
        return boundPort == null ? null : { port: boundPort };
      },
      close(callback) {
        if (typeof callback === "function") {
          callback();
        }
      },
    };
  },
});

const createStartupServiceHarness = () => {
  const fakeProcess = createFakeSpawnProcess();
  const spawn = jest.fn(() => fakeProcess);
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
    getAppIsQuitting: () => false,
  });
  return { fakeProcess, service, spawn };
};

const createReplayStreamResponse = (body) => {
  const encoder = new TextEncoder();
  const reader = {
    read: jest
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: encoder.encode(body),
      })
      .mockResolvedValueOnce({ done: true }),
  };
  return {
    reader,
    response: {
      ok: true,
      body: { getReader: () => reader },
    },
  };
};

const buildRuntimeEventStreamBody = (prefix, count, extraPayload = {}) => {
  const blocks = [];
  for (let index = 1; index <= count; index += 1) {
    blocks.push(
      `event: runtime_event\ndata: ${JSON.stringify({
        schema_version: "v4",
        event_id: `${prefix}-${index}`,
        type: "step.delta",
        seq: index,
        ...extraPayload,
      })}\n\n`,
    );
  }
  blocks.push('event: done\ndata: {"ok":true}\n\n');
  return blocks.join("");
};

const createReplayTarget = (id, send = jest.fn()) => ({
  id,
  send,
  isDestroyed: jest.fn(() => false),
  getType: jest.fn(() => "window"),
});

const flushReplayStream = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const startDetachedReplayStream = (
  service,
  sender,
  { requestId, executionId, attemptId, attachmentId },
) => {
  service.handleStreamStartV4(
    { sender },
    {
      requestId,
      attachmentId,
      payload: {
        threadId: executionId,
        attempt_id: attemptId,
        message: "replay test",
        options: {},
      },
    },
  );
  service.handleStreamDetach(
    { sender },
    {
      requestId,
      executionId,
      attemptId,
      attachmentId,
    },
  );
};

const createReplayTestService = async ({
  streamFetchImpl,
  targets,
  streamReplayConfig,
}) => {
  const fakeProcess = createFakeSpawnProcess();
  const spawn = jest.fn(() => fakeProcess);
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(createCompatibleHealthResponse());
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
    streamRequestImpl: streamFetchImpl,
    streamReplayConfig,
    webContents: {
      fromId: jest.fn((id) => targets.get(id) || null),
      getAllWebContents: jest.fn(() => Array.from(targets.values())),
    },
    runtimeService: {},
    getAppIsQuitting: () => false,
  });
  await service.startMiso();
  return service;
};

describe("unchain service session memory replacement", () => {
  const originalFetch = global.fetch;
  const originalEnvPython = process.env.UNCHAIN_PYTHON_BIN;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvPython == null) {
      delete process.env.UNCHAIN_PYTHON_BIN;
    } else {
      process.env.UNCHAIN_PYTHON_BIN = originalEnvPython;
    }
    jest.clearAllMocks();
  });

  test("node stream fetch keeps a quiet chunked body open without an inactivity timeout", async () => {
    const harness = createNodeRequestHarness();
    const streamFetch = createNodeStreamFetch({
      httpRequest: harness.requestImpl,
    });
    const controller = new AbortController();
    const responsePromise = streamFetch(
      "http://127.0.0.1:5888/chat/stream/v4",
      {
        method: "POST",
        headers: { "x-unchain-auth": "test-token" },
        body: '{"message":"hello"}',
        signal: controller.signal,
      },
    );
    const incomingResponse = new Readable({ read() {} });
    incomingResponse.statusCode = 200;
    incomingResponse.statusMessage = "OK";
    harness.respond(incomingResponse);
    let reader = null;
    try {
      const response = await responsePromise;
      expect(response).toMatchObject({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      expect(response.body).toEqual(
        expect.objectContaining({ getReader: expect.any(Function) }),
      );
      expect(harness.requestImpl).toHaveBeenCalledTimes(1);
      expect(harness.request.setTimeout).toHaveBeenCalledWith(0);
      expect(harness.request.end).toHaveBeenCalledWith('{"message":"hello"}');

      reader = response.body.getReader();
      incomingResponse.push("event: runtime_");
      const firstChunk = await reader.read();
      expect(Buffer.from(firstChunk.value).toString("utf8")).toBe(
        "event: runtime_",
      );

      let quietReadSettled = false;
      const quietRead = reader.read().then((result) => {
        quietReadSettled = true;
        return result;
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(quietReadSettled).toBe(false);

      incomingResponse.push("event\ndata: {}\n\n");
      incomingResponse.push(null);
      const secondChunk = await quietRead;
      expect(Buffer.from(secondChunk.value).toString("utf8")).toBe(
        "event\ndata: {}\n\n",
      );
      await expect(reader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      });
      expect(harness.requestImpl).toHaveBeenCalledTimes(1);
    } finally {
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      incomingResponse.destroy();
      await new Promise((resolve) => setImmediate(resolve));
      harness.disposeResponseEndResources();
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

  test("node stream fetch exposes non-2xx response text", async () => {
    const harness = createNodeRequestHarness();
    const streamFetch = createNodeStreamFetch({
      httpRequest: harness.requestImpl,
    });
    const responsePromise = streamFetch(
      "http://127.0.0.1:5888/chat/stream/v4",
      {
        method: "POST",
      },
    );
    const incomingResponse = new Readable({ read() {} });
    incomingResponse.statusCode = 409;
    incomingResponse.statusMessage = "Conflict";
    harness.respond(incomingResponse);
    incomingResponse.push('{"error":{"code":"execution_lease_conflict"}}');
    incomingResponse.push(null);
    try {
      const response = await responsePromise;
      expect(response).toMatchObject({
        ok: false,
        status: 409,
        statusText: "Conflict",
      });
      await expect(response.text()).resolves.toBe(
        '{"error":{"code":"execution_lease_conflict"}}',
      );
    } finally {
      incomingResponse.destroy();
      await new Promise((resolve) => setImmediate(resolve));
      harness.disposeResponseEndResources();
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

  test("node stream fetch aborts an active response body", async () => {
    const harness = createNodeRequestHarness();
    const streamFetch = createNodeStreamFetch({
      httpRequest: harness.requestImpl,
    });
    const abortListeners = new Set();
    const signal = {
      aborted: false,
      reason: undefined,
      addEventListener(event, listener) {
        if (event === "abort") {
          abortListeners.add(listener);
        }
      },
      removeEventListener(event, listener) {
        if (event === "abort") {
          abortListeners.delete(listener);
        }
      },
    };
    const responsePromise = streamFetch(
      "http://127.0.0.1:5888/chat/stream/v4",
      {
        method: "POST",
        signal,
      },
    );
    const incomingResponse = new Readable({ read() {} });
    incomingResponse.statusCode = 200;
    harness.respond(incomingResponse);

    const response = await responsePromise;
    const reader = response.body.getReader();
    try {
      const pendingRead = reader.read();
      const abortError = new Error("stream cancelled");
      abortError.name = "AbortError";
      signal.reason = abortError;
      signal.aborted = true;
      for (const listener of [...abortListeners]) {
        listener();
      }

      const readError = await pendingRead.then(
        () => null,
        (error) => error,
      );
      expect(readError).not.toBeNull();
      expect(
        `${readError?.name || ""}${
          typeof readError?.message === "string" && readError.message.trim()
            ? `: ${readError.message.trim()}`
            : ""
        }`,
      ).toMatch(/^AbortError(?:: .*(?:abort|cancel).*)?$/i);
      expect(harness.request.destroy).toHaveBeenCalledTimes(1);
      expect(harness.request.destroy).toHaveBeenCalledWith(abortError);
      expect(harness.requestImpl).toHaveBeenCalledTimes(1);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      incomingResponse.destroy();
      await new Promise((resolve) => setImmediate(resolve));
      harness.disposeResponseEndResources();
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

  test("node stream fetch propagates a connection error without retrying", async () => {
    const harness = createNodeRequestHarness();
    const streamFetch = createNodeStreamFetch({
      httpRequest: harness.requestImpl,
    });
    const responsePromise = streamFetch(
      "http://127.0.0.1:5888/chat/stream/v4",
      {
        method: "POST",
      },
    );
    const connectionError = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:5888"),
      { code: "ECONNREFUSED" },
    );
    harness.request.emit("error", connectionError);

    await expect(responsePromise).rejects.toBe(connectionError);
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.requestImpl).toHaveBeenCalledTimes(1);
    expect(harness.request.end).toHaveBeenCalledTimes(1);
  });

  test("startup validates and exposes the release runtime contract", async () => {
    const contract = createRuntimeContract();
    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse(contract));
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    const { service } = createStartupServiceHarness();

    await service.startMiso();

    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      reason: "",
      ready: true,
      contract,
    });
  });

  test("startup only injects the bundled MCP runtime for packaged sidecars", async () => {
    const originalResourcesPath = process.resourcesPath;
    const originalMcpRuntimeDir = process.env.PUPU_MCP_RUNTIME_DIR;
    const hadResourcesPath = Object.prototype.hasOwnProperty.call(
      process,
      "resourcesPath",
    );
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/PuPu.app/Contents/Resources",
    });
    process.env.PUPU_MCP_RUNTIME_DIR = "/tmp/untrusted-runtime-override";
    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse());
    const spawn = jest.fn(() => createFakeSpawnProcess());

    try {
      const service = createUnchainService({
        app: {
          isPackaged: true,
          getAppPath: jest.fn(
            () => "/Applications/PuPu.app/Contents/Resources/app.asar",
          ),
          getPath: jest.fn(() => "/tmp/pupu"),
          getVersion: jest.fn(() => "0.1.1"),
        },
        fs: { existsSync: jest.fn(() => true) },
        path,
        spawn,
        spawnSync: jest.fn(() => ({
          status: 0,
          stdout: "",
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
        getAppIsQuitting: () => false,
      });

      await service.startMiso();

      expect(spawn.mock.calls[0][2].env.PUPU_MCP_RUNTIME_DIR).toBe(
        path.join(process.resourcesPath, "mcp_runtime"),
      );
      service.stopMiso();
    } finally {
      if (originalMcpRuntimeDir == null) {
        delete process.env.PUPU_MCP_RUNTIME_DIR;
      } else {
        process.env.PUPU_MCP_RUNTIME_DIR = originalMcpRuntimeDir;
      }
      if (hadResourcesPath) {
        Object.defineProperty(process, "resourcesPath", {
          configurable: true,
          value: originalResourcesPath,
        });
      } else {
        delete process.resourcesPath;
      }
    }
  });

  test("development startup only forwards an explicit MCP runtime path", async () => {
    const originalMcpRuntimeDir = process.env.PUPU_MCP_RUNTIME_DIR;
    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse());

    try {
      delete process.env.PUPU_MCP_RUNTIME_DIR;
      const withoutOverride = createStartupServiceHarness();
      await withoutOverride.service.startMiso();
      expect(withoutOverride.spawn.mock.calls[0][2].env).not.toHaveProperty(
        "PUPU_MCP_RUNTIME_DIR",
      );
      withoutOverride.service.stopMiso();

      process.env.PUPU_MCP_RUNTIME_DIR = "/tmp/pupu-mcp-runtime-dev";
      const withOverride = createStartupServiceHarness();
      await withOverride.service.startMiso();
      expect(
        withOverride.spawn.mock.calls[0][2].env.PUPU_MCP_RUNTIME_DIR,
      ).toBe("/tmp/pupu-mcp-runtime-dev");
      withOverride.service.stopMiso();
    } finally {
      if (originalMcpRuntimeDir == null) {
        delete process.env.PUPU_MCP_RUNTIME_DIR;
      } else {
        process.env.PUPU_MCP_RUNTIME_DIR = originalMcpRuntimeDir;
      }
    }
  });

  test("development startup resolves an explicit Unchain src-layout checkout", async () => {
    const originalSourcePath = process.env.UNCHAIN_SOURCE_PATH;
    const configuredSourcePath = "/tmp/unchain-context-memory-v2";
    const sourcePackage = path.join(
      configuredSourcePath,
      "src",
      "unchain",
      "__init__.py",
    );
    const sourceProject = path.join(configuredSourcePath, "pyproject.toml");
    const spawn = jest.fn(() => createFakeSpawnProcess());
    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse());

    try {
      process.env.UNCHAIN_SOURCE_PATH = configuredSourcePath;
      process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
      const service = createUnchainService({
        app: {
          isPackaged: false,
          getAppPath: jest.fn(() => "/app"),
          getPath: jest.fn(() => "/tmp/pupu"),
          getVersion: jest.fn(() => "0.1.1"),
        },
        fs: {
          existsSync: jest.fn(
            (candidate) =>
              candidate === sourcePackage ||
              candidate === sourceProject ||
              !candidate.startsWith(configuredSourcePath),
          ),
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
        net: createAvailableNet(),
        webContents: {
          fromId: jest.fn(() => null),
          getAllWebContents: jest.fn(() => []),
        },
        runtimeService: {},
        getAppIsQuitting: () => false,
      });

      await service.startMiso();

      expect(spawn.mock.calls[0][2].env.UNCHAIN_SOURCE_PATH).toBe(
        configuredSourcePath,
      );
      service.stopMiso();
    } finally {
      if (originalSourcePath == null) {
        delete process.env.UNCHAIN_SOURCE_PATH;
      } else {
        process.env.UNCHAIN_SOURCE_PATH = originalSourcePath;
      }
    }
  });

  (process.platform === "win32" ? test.skip : test)(
    "startup reaps an orphaned server without killing durable job workers",
    async () => {
      const originalResourcesPath = process.resourcesPath;
      const hadResourcesPath = Object.prototype.hasOwnProperty.call(
        process,
        "resourcesPath",
      );
      Object.defineProperty(process, "resourcesPath", {
        configurable: true,
        value: "/Applications/PuPu.app/Contents/Resources",
      });
      const killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
      const fakeProcess = createFakeSpawnProcess();
      const spawn = jest.fn(() => fakeProcess);
      const packagedBinary = path.join(
        process.resourcesPath,
        "unchain_runtime",
        "dist",
        process.platform === "darwin" ? "macos" : "linux",
        "unchain-server",
      );
      const staleServerPid = 41001;
      const durableWorkerPid = 41002;
      const spawnSync = jest.fn((command) => {
        expect(command).toBe("ps");
        return {
          status: 0,
          stdout: [
            `${staleServerPid} 1 ${packagedBinary}`,
            `${durableWorkerPid} 1 ${packagedBinary} --durable-job-worker --job-id job_alive`,
          ].join("\n"),
        };
      });
      global.fetch = jest
        .fn()
        .mockResolvedValue(createCompatibleHealthResponse());

      try {
        const service = createUnchainService({
          app: {
            isPackaged: true,
            getAppPath: jest.fn(() => "/Applications/PuPu.app/Contents/Resources/app.asar"),
            getPath: jest.fn(() => "/tmp/pupu"),
            getVersion: jest.fn(() => "0.1.1"),
          },
          fs: { existsSync: jest.fn(() => true) },
          path,
          spawn,
          spawnSync,
          crypto: {
            randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
          },
          net: createAvailableNet(),
          webContents: {
            fromId: jest.fn(() => null),
            getAllWebContents: jest.fn(() => []),
          },
          runtimeService: {},
          getAppIsQuitting: () => false,
        });

        await service.startMiso();

        expect(spawnSync).toHaveBeenCalledTimes(1);
        expect(killSpy).toHaveBeenCalledWith(staleServerPid, "SIGTERM");
        expect(killSpy).not.toHaveBeenCalledWith(durableWorkerPid, "SIGTERM");
        expect(spawn).toHaveBeenCalledWith(
          packagedBinary,
          [],
          expect.any(Object),
        );
      } finally {
        killSpy.mockRestore();
        if (hadResourcesPath) {
          Object.defineProperty(process, "resourcesPath", {
            configurable: true,
            value: originalResourcesPath,
          });
        } else {
          delete process.resourcesPath;
        }
      }
    },
  );

  test.each([
    {
      name: "schema mismatch",
      contract: createRuntimeContract({
        schema: "pupu.runtime-capabilities-v0",
      }),
      reason: "expected schema pupu.runtime-capabilities",
    },
    {
      name: "version mismatch",
      contract: createRuntimeContract({ version: 2 }),
      reason: "expected version 1",
    },
    {
      name: "missing exact cancellation",
      contract: createRuntimeContract({
        capabilities: { exact_cancellation: false },
        reasons: {
          exact_cancellation: "exact attempt registry is unavailable",
        },
      }),
      reason: "exact_cancellation is required",
    },
    {
      name: "missing durable jobs D4.1",
      contract: createRuntimeContract({
        capabilities: {
          durable_jobs: {
            version: "D4.1",
            available: false,
            reason: "UNCHAIN_DATA_DIR is not configured",
          },
        },
      }),
      reason: "durable_jobs D4.1 is unavailable",
    },
    {
      name: "automatic wake resume enabled",
      contract: createRuntimeContract({
        capabilities: { automatic_wake_resume: true },
      }),
      reason: "automatic_wake_resume must be explicitly false",
    },
  ])("startup fails closed on $name", async ({ contract, reason }) => {
    jest.useFakeTimers();
    try {
      global.fetch = jest
        .fn()
        .mockResolvedValue(createCompatibleHealthResponse(contract));
      process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
      const { fakeProcess, service, spawn } = createStartupServiceHarness();

      await service.startMiso();
      expect(service.getMisoStatusPayload()).toMatchObject({
        status: "error",
        ready: false,
        contract,
      });
      expect(service.getMisoStatusPayload().reason).toContain(reason);

      fakeProcess.emit("exit", null, "SIGTERM");
      expect(service.getMisoStatusPayload().status).toBe("error");
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("replaceUnchainSessionMemory posts the normalized payload to unchain", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            applied: true,
            session_id: "chat-1",
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await service.replaceUnchainSessionMemory({
      sessionId: "chat-1",
      messages: [{ role: "user", content: "hello" }],
      options: { modelId: "openai:gpt-5" },
      operationId: " replace-1 ",
      expectedSessionRevision: 7,
      expectedCancelAttemptId: " run-1 ",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/memory/session/replace",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-unchain-auth": "auth-token-123",
        }),
        body: JSON.stringify({
          session_id: "chat-1",
          messages: [{ role: "user", content: "hello" }],
          options: { modelId: "openai:gpt-5" },
          operation_id: "replace-1",
          expected_session_revision: 7,
          expected_cancel_attempt_id: "run-1",
        }),
      }),
    );
  });

  test("replaceUnchainSessionMemory preserves structured and transport error semantics", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            error: {
              code: "session_revision_conflict",
              message: "Session state changed before memory replacement",
              retryable: false,
              expected_revision: 7,
              actual_revision: 8,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "not-json",
      })
      .mockRejectedValueOnce(new Error("network unavailable"));

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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await expect(
      service.replaceUnchainSessionMemory({
        sessionId: "chat-1",
        messages: [],
        operationId: "replace-1",
        expectedSessionRevision: 7,
      }),
    ).resolves.toEqual({
      applied: false,
      error: {
        code: "session_revision_conflict",
        message: "Session state changed before memory replacement",
        retryable: false,
        status: 409,
        expected_revision: 7,
        actual_revision: 8,
      },
    });
    await expect(
      service.replaceUnchainSessionMemory({
        sessionId: "chat-1",
        messages: [],
      }),
    ).rejects.toThrow("Invalid Miso session memory replace response");
    await expect(
      service.replaceUnchainSessionMemory({
        sessionId: "chat-1",
        messages: [],
      }),
    ).rejects.toThrow("network unavailable");
  });

  test("durable interaction bridge queries by session and forwards session on receipt", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ status: "none", session_id: "chat/with space" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "ok",
            disposition: "receipt_recorded",
            durable: true,
            session_id: "chat/with space",
            interaction_id: "interaction-1",
            receipt_id: "receipt-1",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "[]",
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "null",
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      });

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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await service.getMisoPendingInteraction({ session_id: "chat/with space" });
    await service.submitMisoToolConfirmation({
      confirmation_id: "interaction-1",
      session_id: "chat/with space",
      approved: true,
    });

    expect(global.fetch.mock.calls[1][0]).toBe(
      "http://127.0.0.1:5879/chat/interactions/pending?session_id=chat%2Fwith%20space",
    );
    expect(global.fetch.mock.calls[2][0]).toBe(
      "http://127.0.0.1:5879/chat/tool/confirmation",
    );
    expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toEqual({
      confirmation_id: "interaction-1",
      approved: true,
      reason: "",
      session_id: "chat/with space",
    });

    await expect(
      service.submitMisoToolConfirmation({
        confirmation_id: "interaction-1",
        session_id: "chat/with space",
        approved: true,
      }),
    ).rejects.toThrow("Invalid Miso tool confirmation response");
    await expect(
      service.getMisoPendingInteraction({ session_id: "chat/with space" }),
    ).rejects.toThrow("Invalid Miso pending interaction response");
    await expect(
      service.submitMisoToolConfirmation({
        confirmation_id: "interaction-1",
        session_id: "chat/with space",
        approved: true,
      }),
    ).rejects.toThrow("Invalid Miso tool confirmation response");
    await expect(
      service.getMisoPendingInteraction({ session_id: "chat/with space" }),
    ).rejects.toThrow("Invalid Miso pending interaction response");

    await expect(
      service.submitMisoToolConfirmation({
        confirmation_id: "interaction-1",
        approved: "false",
      }),
    ).rejects.toThrow("approved must be a boolean");
    expect(global.fetch).toHaveBeenCalledTimes(7);
  });

  test("submitMisoInterject posts the payload to the interject endpoint", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            resolved_channel: "fyi",
            message_id: "m1",
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    const result = await service.submitMisoInterject({
      thread_id: "chat-1",
      text: "please pause here",
      channel: "fyi",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/chat/interject",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-unchain-auth": "auth-token-123",
        }),
        body: JSON.stringify({
          thread_id: "chat-1",
          text: "please pause here",
          channel: "fyi",
        }),
      }),
    );
    expect(result).toEqual({
      resolved_channel: "fyi",
      message_id: "m1",
    });
  });

  test("startup catalog reads return empty payloads while Miso is starting", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    let resolveHealth;
    const healthPromise = new Promise((resolve) => {
      resolveHealth = resolve;
    });
    global.fetch = jest.fn(() => healthPromise);

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    const startPromise = service.startMiso();
    await Promise.resolve();
    await Promise.resolve();

    await expect(service.getMisoModelCatalogPayload()).resolves.toEqual({});
    await expect(service.getMisoToolkitCatalogPayload()).resolves.toEqual({
      artifactKinds: [],
      count: 0,
      source: "",
      toolkits: [],
    });
    await expect(service.listMisoCharacters()).resolves.toEqual({
      characters: [],
      count: 0,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveHealth(createCompatibleHealthResponse());
    await startPromise;
  });

  test("MCP toolkit methods proxy to unchain MCP endpoints", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            toolkits: [{ toolkitId: "mcp.memory.memory" }],
            count: 1,
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await service.listMisoMcpToolkits();
    await service.installMisoMcpToolkit({
      entryId: "custom",
      secrets: {
        SLACK_BOT_TOKEN: "xoxb-test",
        SLACK_TEAM_ID: "T012345",
      },
      customRecipe: {
        toolkit_id: "mcp.custom.local-test",
        toolkit_name: "Local Test",
        mcp: { transport: "stdio", command: "echo", args: ["ok"] },
      },
    });
    await service.reloadMisoMcpToolkits({ workspaceRoot: "/tmp/project" });
    await service.checkMisoMcpToolkitHealth("mcp.workspace.filesystem", {
      workspaceRoot: "/tmp/project",
    });
    await service.configureMisoMcpToolkit("mcp.workspace.filesystem", {
      workspaceRoot: "/tmp/project",
      secrets: { OPENAI_API_KEY: "sk-test" },
    });
    await service.deleteMisoMcpToolkit("mcp.workspace.filesystem");

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/mcp/toolkits",
      expect.objectContaining({
        method: "GET",
        headers: { "x-unchain-auth": "auth-token-123" },
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:5879/mcp/toolkits/install",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-unchain-auth": "auth-token-123",
        }),
        body: JSON.stringify({
          entry_id: "custom",
          secrets: {
            SLACK_BOT_TOKEN: "xoxb-test",
            SLACK_TEAM_ID: "T012345",
          },
          customRecipe: {
            toolkit_id: "mcp.custom.local-test",
            toolkit_name: "Local Test",
            mcp: { transport: "stdio", command: "echo", args: ["ok"] },
          },
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:5879/mcp/toolkits/reload",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ workspaceRoot: "/tmp/project" }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      5,
      "http://127.0.0.1:5879/mcp/toolkits/mcp.workspace.filesystem/health",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ workspaceRoot: "/tmp/project" }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      6,
      "http://127.0.0.1:5879/mcp/toolkits/mcp.workspace.filesystem/configure",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          workspaceRoot: "/tmp/project",
          secrets: { OPENAI_API_KEY: "sk-test" },
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      7,
      "http://127.0.0.1:5879/mcp/toolkits/mcp.workspace.filesystem",
      expect.objectContaining({
        method: "DELETE",
        headers: { "x-unchain-auth": "auth-token-123" },
      }),
    );
  });

  test("testMisoCustomProvider posts custom_provider/api_key and passes the result through", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            model: "anthropic--claude-4.5-haiku",
          }),
      });

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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    const result = await service.testMisoCustomProvider({
      custom_provider: {
        id: "sap-hyperspace",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        models: [{ id: "anthropic--claude-4.5-haiku" }],
      },
      api_key: "hs-secret-key",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/models/custom-providers/test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-unchain-auth": "auth-token-123",
        }),
        body: JSON.stringify({
          custom_provider: {
            id: "sap-hyperspace",
            protocol: "anthropic",
            base_url: "http://localhost:6655/anthropic",
            models: [{ id: "anthropic--claude-4.5-haiku" }],
          },
          api_key: "hs-secret-key",
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      model: "anthropic--claude-4.5-haiku",
    });
  });

  test("testMisoCustomProvider passes a structured backend failure through unchanged", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: false,
            code: "provider_auth_failed",
            message: "The provider rejected the API key.",
          }),
      });

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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    const result = await service.testMisoCustomProvider({
      custom_provider: {
        id: "sap-hyperspace",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        models: [{ id: "anthropic--claude-4.5-haiku" }],
      },
      api_key: "wrong-key",
    });

    expect(result).toEqual({
      ok: false,
      code: "provider_auth_failed",
      message: "The provider rejected the API key.",
    });
  });

  test("testMisoCustomProvider returns a structured error when the runtime is unreachable", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    const result = await service.testMisoCustomProvider({
      custom_provider: {
        id: "sap-hyperspace",
        protocol: "anthropic",
        base_url: "http://localhost:6655/anthropic",
        models: [{ id: "anthropic--claude-4.5-haiku" }],
      },
      api_key: "hs-secret-key",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "provider_unreachable",
        message: "Could not reach the model runtime",
      },
    });
  });

  test("testMisoCustomProvider rejects a missing custom_provider without any request", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());

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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    const result = await service.testMisoCustomProvider({ api_key: "x" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "custom_provider_invalid",
        message: "custom_provider is required",
      },
    });
    // Only the startup health check ran — no provider-test request was issued.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("testMisoCustomProvider never logs the api_key", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true, model: "m1" }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});

    try {
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
        spawnSync,
        crypto: {
          randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
        },
        net: createAvailableNet(),
        webContents: {
          fromId: jest.fn(() => null),
          getAllWebContents: jest.fn(() => []),
        },
        runtimeService: {},
        getAppIsQuitting: () => false,
      });

      await service.startMiso();
      await service.testMisoCustomProvider({
        custom_provider: {
          id: "sap-hyperspace",
          protocol: "anthropic",
          base_url: "http://localhost:6655/anthropic",
          models: [{ id: "m1" }],
        },
        api_key: "hs-super-secret-key",
      });

      const allLogged = [logSpy, errorSpy, infoSpy, warnSpy, debugSpy]
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((entry) =>
          typeof entry === "string" ? entry : JSON.stringify(entry),
        )
        .join("\n");

      expect(allLogged).not.toContain("hs-super-secret-key");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  test("MCP OAuth methods proxy to unchain and open authorization URL", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    const shell = { openExternal: jest.fn().mockResolvedValue("") };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entryId: "productivity.notion-remote",
            toolkitId: "mcp.productivity.notion-remote",
            authUrl: "https://auth.notion.test/authorize",
            state: "state-123",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entryId: "productivity.notion-remote",
            toolkitId: "mcp.productivity.notion-remote",
            authStatus: "connected",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            toolkitId: "mcp.productivity.notion-remote",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            apps: [{ toolkitId: "mcp.dev.github-remote", configured: false }],
            count: 1,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            app: { toolkitId: "mcp.dev.github-remote", configured: true },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            toolkitId: "mcp.dev.github-remote",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entries: [{ entryId: "browser.playwright" }],
            byEntryId: {
              "browser.playwright": { entryId: "browser.playwright" },
            },
            status: "ok",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entries: [{ entryId: "browser.playwright", status: "cached" }],
            byEntryId: {
              "browser.playwright": { entryId: "browser.playwright" },
            },
            status: "ok",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entries: [{ id: "external.sample" }],
            count: 1,
            status: "ok",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            registries: [{ registryId: "registry.inline.test" }],
            count: 1,
            status: "ok",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            registry: { registryId: "registry.inline.test" },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            valid: true,
            diagnostics: [],
            entries: [],
            count: 0,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            registry: { registryId: "registry.inline.test" },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            registryId: "registry.inline.test",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entry: { id: "external.sample", approvalStatus: "approved" },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            entryId: "external.sample",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            cancelled: true,
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      shell,
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await service.startMisoMcpOAuth("productivity.notion-remote");
    await service.getMisoMcpOAuthStatus("state-123");
    await service.disconnectMisoMcpOAuth("mcp.productivity.notion-remote");
    await service.listMisoMcpOAuthApps();
    await service.configureMisoMcpOAuthApp({
      toolkitId: "mcp.dev.github-remote",
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
    });
    await service.deleteMisoMcpOAuthApp("mcp.dev.github-remote");
    await service.listMisoMcpStoreMetadata();
    await service.reloadMisoMcpStoreMetadata({
      entryId: "browser.playwright",
    });
    await service.listMisoMcpStoreEntries();
    await service.listMisoMcpStoreRegistries();
    await service.importMisoMcpStoreRegistry({
      registry: { version: 1, entries: [] },
    });
    await service.validateMisoMcpStoreRegistry({
      registry: { version: 1, entries: [] },
    });
    await service.refreshMisoMcpStoreRegistry("registry.inline.test");
    await service.deleteMisoMcpStoreRegistry("registry.inline.test");
    await service.approveMisoMcpStoreEntry("external.sample", {
      registryId: "registry.inline.test",
      acknowledgedRisk: true,
    });
    await service.revokeMisoMcpStoreEntryApproval("external.sample", {
      registryId: "registry.inline.test",
    });
    await service.cancelMisoMcpOAuth("state-123");

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/mcp/oauth/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entry_id: "productivity.notion-remote" }),
      }),
    );
    expect(shell.openExternal).toHaveBeenCalledWith(
      "https://auth.notion.test/authorize",
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:5879/mcp/oauth/status?state=state-123",
      expect.objectContaining({ method: "GET" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:5879/mcp/oauth/mcp.productivity.notion-remote",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      5,
      "http://127.0.0.1:5879/mcp/oauth/apps",
      expect.objectContaining({ method: "GET" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      6,
      "http://127.0.0.1:5879/mcp/oauth/apps/configure",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          toolkitId: "mcp.dev.github-remote",
          clientId: "github-client-id",
          clientSecret: "github-client-secret",
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      7,
      "http://127.0.0.1:5879/mcp/oauth/apps/mcp.dev.github-remote",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      8,
      "http://127.0.0.1:5879/mcp/store/metadata",
      expect.objectContaining({ method: "GET" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      9,
      "http://127.0.0.1:5879/mcp/store/metadata/reload",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entry_id: "browser.playwright" }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      10,
      "http://127.0.0.1:5879/mcp/store/entries",
      expect.objectContaining({ method: "GET" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      11,
      "http://127.0.0.1:5879/mcp/store/registries",
      expect.objectContaining({ method: "GET" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      12,
      "http://127.0.0.1:5879/mcp/store/registries/import",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ registry: { version: 1, entries: [] } }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      13,
      "http://127.0.0.1:5879/mcp/store/registries/validate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ registry: { version: 1, entries: [] } }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      14,
      "http://127.0.0.1:5879/mcp/store/registries/registry.inline.test/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      15,
      "http://127.0.0.1:5879/mcp/store/registries/registry.inline.test",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      16,
      "http://127.0.0.1:5879/mcp/store/entries/external.sample/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          registryId: "registry.inline.test",
          acknowledgedRisk: true,
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      17,
      "http://127.0.0.1:5879/mcp/store/entries/external.sample/approval",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ registryId: "registry.inline.test" }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      18,
      "http://127.0.0.1:5879/mcp/oauth/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ state: "state-123" }),
      }),
    );
  });

  test("MCP OAuth cancels the backend attempt when opening the browser fails", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    const shell = {
      openExternal: jest.fn().mockRejectedValue(new Error("browser marker")),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            entryId: "productivity.notion-remote",
            toolkitId: "mcp.productivity.notion-remote",
            authUrl: "https://auth.notion.test/authorize",
            state: "state-open-failed",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true, cancelled: true }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      shell,
      fs: { existsSync: jest.fn(() => true) },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await expect(
      service.startMisoMcpOAuth("productivity.notion-remote"),
    ).rejects.toMatchObject({ code: "mcp_oauth_browser_open_failed" });

    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:5879/mcp/oauth/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ state: "state-open-failed" }),
      }),
    );
  });

  test("MCP toolkit proxy preserves backend error code", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              code: "mcp_workspace_required",
              message: "Workspace required",
            },
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await expect(
      service.installMisoMcpToolkit({ entryId: "workspace.filesystem" }),
    ).rejects.toMatchObject({
      code: "mcp_workspace_required",
      message: "mcp_workspace_required: Workspace required",
    });
  });

  test("falls back to an ephemeral port when the preferred unchain range is busy", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse());

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createRangeBusyNet({ ephemeralPort: 61234 }),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/python3.12",
      ["/app/unchain_runtime/server/main.py"],
      expect.objectContaining({
        env: expect.objectContaining({
          UNCHAIN_PORT: "61234",
        }),
      }),
    );
    expect(service.getMisoStatusPayload()).toEqual(
      expect.objectContaining({
        port: 61234,
        url: "http://127.0.0.1:61234",
      }),
    );
  });

  test("listMisoSeedCharacters decorates seed avatars with http urls", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            characters: [
              {
                id: "nico",
                name: "Nico",
                avatar: { absolute_path: "/tmp/nico.png" },
                metadata: { origin: "builtin_seed" },
              },
            ],
            count: 1,
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await expect(service.listMisoSeedCharacters()).resolves.toEqual({
      characters: [
        {
          id: "nico",
          name: "Nico",
          avatar: {
            absolute_path: "/tmp/nico.png",
            url: "http://127.0.0.1:5879/characters/seeds/nico/avatar?unchain_auth=auth-token-123",
          },
          metadata: { origin: "builtin_seed" },
        },
      ],
      count: 1,
    });
  });

  test("listMisoCharacters decorates builtin avatars with http urls", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            characters: [
              {
                id: "nico",
                name: "Nico",
                avatar: null,
                metadata: { origin: "builtin_seed" },
              },
              {
                id: "mina",
                name: "Mina",
                avatar: null,
                metadata: {},
              },
            ],
            count: 2,
          }),
      });

    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    await expect(service.listMisoCharacters()).resolves.toEqual({
      characters: [
        {
          id: "nico",
          name: "Nico",
          avatar: {
            url: "http://127.0.0.1:5879/characters/nico/avatar?unchain_auth=auth-token-123",
          },
          metadata: { origin: "builtin_seed" },
        },
        {
          id: "mina",
          name: "Mina",
          avatar: null,
          metadata: {},
        },
      ],
      count: 2,
    });
  });

  test("forwards stream bridge diagnostics to renderer runtime logs before emitting the stream error", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    const bridgeCause = new Error("socket closed");
    bridgeCause.stack = "CauseStack: socket closed\n  at socket";
    const bridgeError = new Error("terminated");
    bridgeError.stack = "BridgeStack: terminated\n  at read";
    bridgeError.cause = bridgeCause;

    const reader = {
      read: jest.fn().mockRejectedValue(bridgeError),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    const streamRequestImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => reader,
      },
    });

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
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl,
      webContents: {
        fromId: jest.fn(() => target),
        getAllWebContents: jest.fn(() => [target]),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();

    service.handleStreamStartV2(
      { sender: { id: 91 } },
      {
        requestId: "req-bridge-1",
        payload: {
          message: "hello",
          options: {},
        },
      },
    );

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const sendCalls = target.send.mock.calls;

    expect(sendCalls.slice(0, 3)).toEqual([
      [
        CHANNELS.UNCHAIN.RUNTIME_LOG,
        {
          level: "stderr",
          text: "stream bridge failed [requestId=req-bridge-1]: terminated",
        },
      ],
      [
        CHANNELS.UNCHAIN.RUNTIME_LOG,
        {
          level: "stderr",
          text:
            "stream bridge stack [requestId=req-bridge-1]: BridgeStack: terminated\n  at read",
        },
      ],
      [
        CHANNELS.UNCHAIN.RUNTIME_LOG,
        {
          level: "stderr",
          text:
            "stream bridge cause [requestId=req-bridge-1]: CauseStack: socket closed\n  at socket",
        },
      ],
    ]);

    expect(sendCalls[3]).toEqual([
      CHANNELS.UNCHAIN.STREAM_EVENT,
      {
        requestId: "req-bridge-1",
        event: "error",
        data: {
          code: "stream_bridge_failed",
          message: "terminated",
        },
      },
    ]);
  });

  test("does not expose handleStreamStartV3", () => {
    const spawn = jest.fn(() => createFakeSpawnProcess());
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    expect(service.handleStreamStartV3).toBeUndefined();
  });

  test("handleStreamStartV4 uses the injected stream fetch and forwards runtime events", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    const encoder = new TextEncoder();
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode(
            'event: runtime_event\ndata: {"schema_version":"v4","event_id":"evt-1","type":"step.delta","seq":1}\n\n',
          ),
        })
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode('event: done\ndata: {"ok":true}\n\n'),
        })
        .mockResolvedValueOnce({ done: true }),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    const streamFetchImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => reader,
      },
    });

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
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl: streamFetchImpl,
      webContents: {
        fromId: jest.fn(() => target),
        getAllWebContents: jest.fn(() => [target]),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();

    service.handleStreamStartV4(
      { sender: { id: 91 } },
      {
        requestId: "req-v4-1",
        attachmentId: "attachment-v4-1",
        payload: {
          threadId: "chat-v4-1",
          attempt_id: "req-v4-1",
          message: "hello",
          options: {},
        },
      },
    );

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(streamFetchImpl).toHaveBeenCalledTimes(1);
    expect(streamFetchImpl.mock.calls[0][0]).toContain("/chat/stream/v4");
    expect(JSON.parse(streamFetchImpl.mock.calls[0][1].body)).toMatchObject({
      threadId: "chat-v4-1",
      attempt_id: "req-v4-1",
      message: "hello",
    });
    expect(target.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-v4-1",
      streamSeq: 1,
      event: "runtime_event",
      data: {
        schema_version: "v4",
        event_id: "evt-1",
        type: "step.delta",
        seq: 1,
      },
    });
    expect(target.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-v4-1",
      streamSeq: 2,
      event: "done",
      data: { ok: true },
    });
  });

  test("handleStreamStartV4 preserves a structured error code from a non-2xx response", async () => {
    const streamFetchImpl = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          error: {
            code: "execution_lease_conflict",
            message: "execution is already leased by another owner",
          },
        }),
      ),
    });
    const target = createReplayTarget(98);
    const service = await createReplayTestService({
      streamFetchImpl,
      targets: new Map([[98, target]]),
    });

    service.handleStreamStartV4(
      { sender: target },
      {
        requestId: "req-v4-lease-conflict",
        attachmentId: "attachment-v4-lease-conflict",
        payload: {
          threadId: "chat-v4-lease-conflict",
          attempt_id: "attempt-v4-lease-conflict",
          message: "hello",
          options: {},
        },
      },
    );

    await flushReplayStream();

    expect(target.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-v4-lease-conflict",
      streamSeq: 1,
      event: "error",
      data: {
        code: "execution_lease_conflict",
        message: "execution is already leased by another owner",
      },
    });
  });

  test("handleStreamStartV4 fails closed when upstream ends without a terminal event", async () => {
    const { response } = createReplayStreamResponse(
      'event: runtime_event\ndata: {"schema_version":"v4","event_id":"evt-before-eof","type":"step.delta","seq":1}\n\n',
    );
    const streamFetchImpl = jest.fn().mockResolvedValueOnce(response);
    const target = createReplayTarget(92);
    const service = await createReplayTestService({
      streamFetchImpl,
      targets: new Map([[92, target]]),
    });

    service.handleStreamStartV4(
      { sender: { id: 92 } },
      {
        requestId: "req-v4-unexpected-eof",
        attachmentId: "attachment-v4-unexpected-eof",
        payload: {
          threadId: "chat-v4-unexpected-eof",
          attempt_id: "attempt-v4-unexpected-eof",
          message: "hello",
          options: {},
        },
      },
    );

    await flushReplayStream();

    expect(target.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-v4-unexpected-eof",
      streamSeq: 2,
      event: "error",
      data: {
        code: "unexpected_stream_eof",
        message: "Miso stream ended before a terminal event",
      },
    });
    expect(
      target.send.mock.calls.some(
        ([channel, envelope]) =>
          channel === CHANNELS.UNCHAIN.STREAM_EVENT &&
          envelope.requestId === "req-v4-unexpected-eof" &&
          envelope.event === "done",
      ),
    ).toBe(false);
  });

  test("detaches without aborting and replays only the matching V4 attempt", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    const encoder = new TextEncoder();
    let releaseDetachedStream;
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode(
            'event: runtime_event\ndata: {"schema_version":"v4","event_id":"evt-before-detach","type":"step.delta","seq":1}\n\n',
          ),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseDetachedStream = () =>
                resolve({
                  done: false,
                  value: encoder.encode(
                    'event: runtime_event\ndata: {"schema_version":"v4","event_id":"evt-after-attach","type":"step.delta","seq":2}\n\nevent: done\ndata: {"ok":true}\n\n',
                  ),
                });
            }),
        )
        .mockResolvedValueOnce({ done: true }),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    const streamFetchImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => reader },
    });
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const firstTarget = {
      id: 91,
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const attachedTarget = {
      id: 92,
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const targets = new Map([
      [91, firstTarget],
      [92, attachedTarget],
    ]);
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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl: streamFetchImpl,
      webContents: {
        fromId: jest.fn((id) => targets.get(id) || null),
        getAllWebContents: jest.fn(() => Array.from(targets.values())),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    service.handleStreamStartV4(
      { sender: firstTarget },
      {
        requestId: "req-reattach",
        attachmentId: "attachment-initial",
        payload: {
          threadId: "chat-reattach",
          attempt_id: "attempt-reattach",
          message: "keep running",
          options: {},
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    service.handleStreamDetach(
      { sender: firstTarget },
      {
        requestId: "req-reattach",
        executionId: "chat-reattach",
        attemptId: "attempt-reattach",
        attachmentId: "attachment-initial",
      },
    );
    expect(reader.read).toHaveBeenCalledTimes(2);

    expect(
      service.attachMisoStreamV4(
        { sender: attachedTarget },
        {
          requestId: "req-reattach",
          executionId: "chat-reattach",
          attemptId: "wrong-attempt",
          attachmentId: "attachment-wrong",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({ ok: false, code: "stream_identity_mismatch" });
    expect(attachedTarget.send).not.toHaveBeenCalled();

    expect(
      service.attachMisoStreamV4(
        { sender: attachedTarget },
        {
          requestId: "req-reattach",
          executionId: "chat-reattach",
          attemptId: "attempt-reattach",
          attachmentId: "attachment-current",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({
      ok: true,
      active: true,
      terminal: false,
      replayed_through_seq: 1,
    });
    expect(attachedTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({
        requestId: "req-reattach",
        streamSeq: 1,
        event: "runtime_event",
        data: expect.objectContaining({ event_id: "evt-before-detach" }),
      }),
    );

    service.handleStreamDetach(
      { sender: attachedTarget },
      {
        requestId: "req-reattach",
        executionId: "chat-reattach",
        attemptId: "attempt-reattach",
        attachmentId: "attachment-initial",
      },
    );

    releaseDetachedStream();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(attachedTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({
        requestId: "req-reattach",
        streamSeq: 2,
        event: "runtime_event",
        data: expect.objectContaining({ event_id: "evt-after-attach" }),
      }),
    );
    expect(attachedTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({
        requestId: "req-reattach",
        streamSeq: 3,
        event: "done",
      }),
    );
    expect(firstTarget.send).toHaveBeenCalledTimes(1);
  });

  test("lifecycle stop exact-cancels every active V4 attempt and drops replay even when one cancel fails", async () => {
    const abortSignals = [];
    const streamFetchImpl = jest.fn(async (_url, options) => {
      abortSignals.push(options.signal);
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn(
              () =>
                new Promise((_resolve, reject) => {
                  const rejectCancelled = () => {
                    const error = new Error("lifecycle stream aborted");
                    error.name = "AbortError";
                    reject(error);
                  };
                  if (options.signal.aborted) {
                    rejectCancelled();
                    return;
                  }
                  options.signal.addEventListener("abort", rejectCancelled, {
                    once: true,
                  });
                }),
            ),
          }),
        },
      };
    });
    const firstTarget = createReplayTarget(321);
    const secondTarget = createReplayTarget(322);
    const attachTarget = createReplayTarget(323);
    const service = await createReplayTestService({
      streamFetchImpl,
      targets: new Map([
        [firstTarget.id, firstTarget],
        [secondTarget.id, secondTarget],
        [attachTarget.id, attachTarget],
      ]),
    });
    global.fetch
      .mockRejectedValueOnce(new Error("cancel endpoint unavailable"))
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "ok",
            execution_id: "chat-lifecycle-b",
            attempt_id: "attempt-lifecycle-b",
          }),
      });

    service.handleStreamStartV4(
      { sender: firstTarget },
      {
        requestId: "request-lifecycle-a",
        attachmentId: "attachment-lifecycle-a",
        payload: {
          owner_chat_id: "owner-lifecycle-a",
          threadId: "chat-lifecycle-a",
          attempt_id: "attempt-lifecycle-a",
          source_attempt_id: "source-lifecycle-a",
          message: "stop on lifecycle boundary",
          options: {},
        },
      },
    );
    service.handleStreamStartV4(
      { sender: secondTarget },
      {
        requestId: "request-lifecycle-b",
        attachmentId: "attachment-lifecycle-b",
        payload: {
          owner_chat_id: "owner-lifecycle-b",
          threadId: "chat-lifecycle-b",
          attempt_id: "attempt-lifecycle-b",
          message: "stop this one too",
          options: {},
        },
      },
    );
    await flushReplayStream();

    const stopPromise = service.stopActiveMisoExecutionsForLifecycle({
      reason: "system_suspend",
    });
    const repeatedStopPromise = service.stopActiveMisoExecutionsForLifecycle({
      reason: "app_windows_closed",
    });
    expect(abortSignals).toHaveLength(2);
    expect(abortSignals.every((signal) => signal.aborted)).toBe(true);
    expect(
      service.attachMisoStreamV4(
        { sender: attachTarget },
        {
          requestId: "request-lifecycle-a",
          executionId: "chat-lifecycle-a",
          attemptId: "attempt-lifecycle-a",
          attachmentId: "attachment-after-suspend",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({ ok: false, code: "stream_not_found" });

    await expect(stopPromise).resolves.toEqual({
      active_count: 2,
      exact_cancel_count: 2,
      exact_cancel_succeeded: 1,
      exact_cancel_failed: 1,
    });
    await expect(repeatedStopPromise).resolves.toEqual({
      active_count: 0,
      exact_cancel_count: 0,
      exact_cancel_succeeded: 0,
      exact_cancel_failed: 0,
    });
    const cancelCalls = global.fetch.mock.calls.slice(1);
    expect(cancelCalls).toHaveLength(2);
    expect(
      cancelCalls.map(([, options]) => JSON.parse(options.body)),
    ).toEqual([
      {
        owner_chat_id: "owner-lifecycle-a",
        execution_id: "chat-lifecycle-a",
        attempt_id: "attempt-lifecycle-a",
        source_attempt_id: "source-lifecycle-a",
        reason: "system_suspend",
        idempotency_key:
          "lifecycle-stop:chat-lifecycle-a:attempt-lifecycle-a",
      },
      {
        owner_chat_id: "owner-lifecycle-b",
        execution_id: "chat-lifecycle-b",
        attempt_id: "attempt-lifecycle-b",
        reason: "system_suspend",
        idempotency_key:
          "lifecycle-stop:chat-lifecycle-b:attempt-lifecycle-b",
      },
    ]);
  });

  test("lifecycle stop drops completed terminal replay without changing transient detach semantics", async () => {
    const { response } = createReplayStreamResponse(
      buildRuntimeEventStreamBody("terminal-before-close", 1),
    );
    const sourceTarget = createReplayTarget(324);
    const attachTarget = createReplayTarget(325);
    const service = await createReplayTestService({
      streamFetchImpl: jest.fn().mockResolvedValueOnce(response),
      targets: new Map([
        [sourceTarget.id, sourceTarget],
        [attachTarget.id, attachTarget],
      ]),
    });

    service.handleStreamStartV4(
      { sender: sourceTarget },
      {
        requestId: "request-terminal-before-close",
        attachmentId: "attachment-terminal-before-close",
        payload: {
          threadId: "chat-terminal-before-close",
          attempt_id: "attempt-terminal-before-close",
          message: "finish before close",
          options: {},
        },
      },
    );
    await flushReplayStream();

    expect(
      service.attachMisoStreamV4(
        { sender: attachTarget },
        {
          requestId: "request-terminal-before-close",
          executionId: "chat-terminal-before-close",
          attemptId: "attempt-terminal-before-close",
          attachmentId: "attachment-terminal-replay",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({ ok: true, terminal: true, active: false });

    await expect(
      service.stopActiveMisoExecutionsForLifecycle({
        reason: "app_windows_closed",
      }),
    ).resolves.toEqual({
      active_count: 0,
      exact_cancel_count: 0,
      exact_cancel_succeeded: 0,
      exact_cancel_failed: 0,
    });
    expect(
      service.attachMisoStreamV4(
        { sender: attachTarget },
        {
          requestId: "request-terminal-before-close",
          executionId: "chat-terminal-before-close",
          attemptId: "attempt-terminal-before-close",
          attachmentId: "attachment-after-close",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({ ok: false, code: "stream_not_found" });
  });

  test("keeps buffering when a renderer send fails and replays to a healthy attachment", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    const encoder = new TextEncoder();
    const reader = {
      read: jest.fn().mockResolvedValueOnce({
        done: false,
        value: encoder.encode(
          'event: runtime_event\ndata: {"schema_version":"v4","event_id":"evt-before-send-failure","type":"step.delta","seq":1}\n\nevent: done\ndata: {"ok":true}\n\n',
        ),
      }),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    const streamFetchImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => reader },
    });
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const failingTarget = {
      id: 93,
      send: jest.fn(() => {
        throw new Error("renderer was destroyed during send");
      }),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const healthyTarget = {
      id: 94,
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const targets = new Map([
      [93, failingTarget],
      [94, healthyTarget],
    ]);
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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl: streamFetchImpl,
      webContents: {
        fromId: jest.fn((id) => targets.get(id) || null),
        getAllWebContents: jest.fn(() => Array.from(targets.values())),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    service.handleStreamStartV4(
      { sender: failingTarget },
      {
        requestId: "req-send-failure",
        attachmentId: "attachment-failing",
        payload: {
          threadId: "chat-send-failure",
          attempt_id: "attempt-send-failure",
          message: "keep buffering",
          options: {},
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(failingTarget.send).toHaveBeenCalledTimes(1);
    expect(
      service.attachMisoStreamV4(
        { sender: failingTarget },
        {
          requestId: "req-send-failure",
          executionId: "chat-send-failure",
          attemptId: "attempt-send-failure",
          attachmentId: "attachment-still-failing",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({
      ok: false,
      code: "stream_attach_target_unavailable",
      replayed_through_seq: 0,
    });
    expect(failingTarget.send).toHaveBeenCalledTimes(2);
    expect(
      service.attachMisoStreamV4(
        { sender: healthyTarget },
        {
          requestId: "req-send-failure",
          executionId: "chat-send-failure",
          attemptId: "attempt-send-failure",
          attachmentId: "attachment-healthy",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({
      ok: true,
      active: false,
      terminal: true,
      replayed_through_seq: 2,
    });
    expect(healthyTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({
        streamSeq: 1,
        event: "runtime_event",
        data: expect.objectContaining({ event_id: "evt-before-send-failure" }),
      }),
    );
    expect(healthyTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({ streamSeq: 2, event: "done" }),
    );
  });

  test("sends duplicate_request only to the new requester without adding it to replay", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    let releaseStream;
    const encoder = new TextEncoder();
    const reader = {
      read: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseStream = () =>
                resolve({
                  done: false,
                  value: encoder.encode('event: done\ndata: {"ok":true}\n\n'),
                });
            }),
        )
        .mockResolvedValueOnce({ done: true }),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    const streamFetchImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => reader },
    });
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const firstTarget = {
      id: 95,
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const duplicateTarget = {
      id: 96,
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const replayTarget = {
      id: 97,
      send: jest.fn(),
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
    };
    const targets = new Map([
      [95, firstTarget],
      [96, duplicateTarget],
      [97, replayTarget],
    ]);
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
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl: streamFetchImpl,
      webContents: {
        fromId: jest.fn((id) => targets.get(id) || null),
        getAllWebContents: jest.fn(() => Array.from(targets.values())),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();
    service.handleStreamStartV4(
      { sender: firstTarget },
      {
        requestId: "req-duplicate",
        attachmentId: "attachment-original",
        payload: {
          threadId: "chat-duplicate",
          attempt_id: "attempt-duplicate",
          message: "original",
          options: {},
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));

    service.handleStreamStartV4(
      { sender: duplicateTarget },
      {
        requestId: "req-duplicate",
        attachmentId: "attachment-duplicate",
        payload: {
          threadId: "chat-duplicate",
          attempt_id: "attempt-duplicate",
          message: "duplicate",
          options: {},
        },
      },
    );

    expect(duplicateTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      {
        requestId: "req-duplicate",
        event: "error",
        data: {
          code: "duplicate_request",
          message: "Request is already active",
        },
      },
    );
    expect(firstTarget.send).not.toHaveBeenCalled();
    expect(
      service.attachMisoStreamV4(
        { sender: replayTarget },
        {
          requestId: "req-duplicate",
          executionId: "chat-duplicate",
          attemptId: "attempt-duplicate",
          attachmentId: "attachment-replay",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({ ok: true, replayed_through_seq: 0 });
    expect(replayTarget.send).not.toHaveBeenCalled();

    releaseStream();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(replayTarget.send).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({ streamSeq: 1, event: "done" }),
    );
  });

  test("retains 20,001 small runtime events without creating a replay gap", async () => {
    const { response } = createReplayStreamResponse(
      buildRuntimeEventStreamBody("long-run", 20001),
    );
    const streamFetchImpl = jest.fn().mockResolvedValueOnce(response);
    const sourceTarget = createReplayTarget(301);
    let replayCount = 0;
    let firstReplaySeq = 0;
    let lastReplaySeq = 0;
    const replayTarget = createReplayTarget(302, (_channel, envelope) => {
      replayCount += 1;
      firstReplaySeq ||= envelope.streamSeq;
      lastReplaySeq = envelope.streamSeq;
    });
    const targets = new Map([
      [sourceTarget.id, sourceTarget],
      [replayTarget.id, replayTarget],
    ]);
    const service = await createReplayTestService({
      streamFetchImpl,
      targets,
    });

    startDetachedReplayStream(service, sourceTarget, {
      requestId: "req-long-replay",
      executionId: "chat-long-replay",
      attemptId: "attempt-long-replay",
      attachmentId: "attachment-long-source",
    });
    await flushReplayStream();

    expect(
      service.attachMisoStreamV4(
        { sender: replayTarget },
        {
          requestId: "req-long-replay",
          executionId: "chat-long-replay",
          attemptId: "attempt-long-replay",
          attachmentId: "attachment-long-replay",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({
      ok: true,
      terminal: true,
      active: false,
      replayed_through_seq: 20002,
    });
    expect(replayCount).toBe(20002);
    expect(firstReplaySeq).toBe(1);
    expect(lastReplaySeq).toBe(20002);
  });

  test("fails closed on a replay gap after the injected event limit advances the head", async () => {
    const { response } = createReplayStreamResponse(
      buildRuntimeEventStreamBody("count-limit", 4100),
    );
    const sourceTarget = createReplayTarget(303);
    const replayed = [];
    const replayTarget = createReplayTarget(304, (_channel, envelope) => {
      replayed.push(envelope);
    });
    const targets = new Map([
      [sourceTarget.id, sourceTarget],
      [replayTarget.id, replayTarget],
    ]);
    const service = await createReplayTestService({
      streamFetchImpl: jest.fn().mockResolvedValueOnce(response),
      targets,
      streamReplayConfig: {
        maxEvents: 3,
        maxBytes: 1024 * 1024,
        ttlMs: 1000,
      },
    });

    startDetachedReplayStream(service, sourceTarget, {
      requestId: "req-count-limit",
      executionId: "chat-count-limit",
      attemptId: "attempt-count-limit",
      attachmentId: "attachment-count-source",
    });
    await flushReplayStream();

    expect(
      service.attachMisoStreamV4(
        { sender: replayTarget },
        {
          requestId: "req-count-limit",
          executionId: "chat-count-limit",
          attemptId: "attempt-count-limit",
          attachmentId: "attachment-count-gap",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({
      ok: false,
      code: "stream_replay_gap",
      first_available_seq: 4099,
      requested_after_seq: 0,
    });
    expect(replayed).toHaveLength(0);

    expect(
      service.attachMisoStreamV4(
        { sender: replayTarget },
        {
          requestId: "req-count-limit",
          executionId: "chat-count-limit",
          attemptId: "attempt-count-limit",
          attachmentId: "attachment-count-valid",
          afterSeq: 4098,
        },
      ),
    ).toMatchObject({ ok: true, replayed_through_seq: 4101 });
    expect(replayed.map((envelope) => envelope.streamSeq)).toEqual([
      4099, 4100, 4101,
    ]);
  });

  test("evicts an oversized event by byte budget without retaining its payload", async () => {
    const { response } = createReplayStreamResponse(
      buildRuntimeEventStreamBody("byte-limit", 1, {
        delta: "x".repeat(4096),
      }),
    );
    const sourceTarget = createReplayTarget(305);
    const replayed = [];
    const replayTarget = createReplayTarget(306, (_channel, envelope) => {
      replayed.push(envelope);
    });
    const targets = new Map([
      [sourceTarget.id, sourceTarget],
      [replayTarget.id, replayTarget],
    ]);
    const service = await createReplayTestService({
      streamFetchImpl: jest.fn().mockResolvedValueOnce(response),
      targets,
      streamReplayConfig: {
        maxEvents: 100,
        maxBytes: 512,
        ttlMs: 1000,
      },
    });

    startDetachedReplayStream(service, sourceTarget, {
      requestId: "req-byte-limit",
      executionId: "chat-byte-limit",
      attemptId: "attempt-byte-limit",
      attachmentId: "attachment-byte-source",
    });
    await flushReplayStream();

    expect(
      service.attachMisoStreamV4(
        { sender: replayTarget },
        {
          requestId: "req-byte-limit",
          executionId: "chat-byte-limit",
          attemptId: "attempt-byte-limit",
          attachmentId: "attachment-byte-gap",
          afterSeq: 0,
        },
      ),
    ).toMatchObject({
      ok: false,
      code: "stream_replay_gap",
      first_available_seq: 2,
    });

    expect(
      service.attachMisoStreamV4(
        { sender: replayTarget },
        {
          requestId: "req-byte-limit",
          executionId: "chat-byte-limit",
          attemptId: "attempt-byte-limit",
          attachmentId: "attachment-byte-valid",
          afterSeq: 1,
        },
      ),
    ).toMatchObject({ ok: true, replayed_through_seq: 2 });
    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({
      streamSeq: 2,
      event: "done",
      data: { ok: true },
    });
    expect(JSON.stringify(replayed)).not.toContain("xxxxxxxx");
  });

  test("keeps capped replay state isolated across three concurrent streams", async () => {
    const streamCases = [
      {
        key: "a",
        sourceId: 307,
        replayId: 310,
        eventCount: 5,
        afterSeq: 3,
        expectedEventIds: ["parallel-a-4", "parallel-a-5"],
      },
      {
        key: "b",
        sourceId: 308,
        replayId: 311,
        eventCount: 2,
        afterSeq: 0,
        expectedEventIds: ["parallel-b-1", "parallel-b-2"],
      },
      {
        key: "c",
        sourceId: 309,
        replayId: 312,
        eventCount: 4,
        afterSeq: 2,
        expectedEventIds: ["parallel-c-3", "parallel-c-4"],
      },
    ];
    const responses = new Map(
      streamCases.map((streamCase) => [
        `chat-parallel-${streamCase.key}`,
        createReplayStreamResponse(
          buildRuntimeEventStreamBody(
            `parallel-${streamCase.key}`,
            streamCase.eventCount,
          ),
        ).response,
      ]),
    );
    const streamFetchImpl = jest.fn(async (_url, options) => {
      const requestPayload = JSON.parse(options.body);
      return responses.get(requestPayload.threadId);
    });
    const targets = new Map();
    for (const streamCase of streamCases) {
      streamCase.sourceTarget = createReplayTarget(streamCase.sourceId);
      streamCase.replayed = [];
      streamCase.replayTarget = createReplayTarget(
        streamCase.replayId,
        (_channel, envelope) => {
          streamCase.replayed.push(envelope);
        },
      );
      targets.set(streamCase.sourceId, streamCase.sourceTarget);
      targets.set(streamCase.replayId, streamCase.replayTarget);
    }
    const service = await createReplayTestService({
      streamFetchImpl,
      targets,
      streamReplayConfig: {
        maxEvents: 3,
        maxBytes: 1024 * 1024,
        ttlMs: 1000,
      },
    });

    for (const streamCase of streamCases) {
      startDetachedReplayStream(service, streamCase.sourceTarget, {
        requestId: `req-parallel-${streamCase.key}`,
        executionId: `chat-parallel-${streamCase.key}`,
        attemptId: `attempt-parallel-${streamCase.key}`,
        attachmentId: `attachment-parallel-${streamCase.key}-source`,
      });
    }
    await flushReplayStream();

    for (const streamCase of streamCases) {
      expect(
        service.attachMisoStreamV4(
          { sender: streamCase.replayTarget },
          {
            requestId: `req-parallel-${streamCase.key}`,
            executionId: `chat-parallel-${streamCase.key}`,
            attemptId: `attempt-parallel-${streamCase.key}`,
            attachmentId: `attachment-parallel-${streamCase.key}-replay`,
            afterSeq: streamCase.afterSeq,
          },
        ),
      ).toMatchObject({ ok: true, terminal: true, active: false });
      expect(
        streamCase.replayed
          .filter((envelope) => envelope.event === "runtime_event")
          .map((envelope) => envelope.data.event_id),
      ).toEqual(streamCase.expectedEventIds);
      expect(
        streamCase.replayed.every(
          (envelope) =>
            envelope.requestId === `req-parallel-${streamCase.key}`,
        ),
      ).toBe(true);
      expect(streamCase.replayed.at(-1)).toMatchObject({ event: "done" });
    }
  });

  test("keeps a detached terminal replay attachable until the injected TTL expires", async () => {
    const { response } = createReplayStreamResponse(
      buildRuntimeEventStreamBody("terminal-delay", 1),
    );
    const sourceTarget = createReplayTarget(313);
    const replayTarget = createReplayTarget(314);
    const expiredTarget = createReplayTarget(315);
    const targets = new Map([
      [sourceTarget.id, sourceTarget],
      [replayTarget.id, replayTarget],
      [expiredTarget.id, expiredTarget],
    ]);
    const service = await createReplayTestService({
      streamFetchImpl: jest.fn().mockResolvedValueOnce(response),
      targets,
      streamReplayConfig: {
        maxEvents: 100,
        maxBytes: 1024 * 1024,
        ttlMs: 1000,
      },
    });

    jest.useFakeTimers();
    try {
      startDetachedReplayStream(service, sourceTarget, {
        requestId: "req-terminal-delay",
        executionId: "chat-terminal-delay",
        attemptId: "attempt-terminal-delay",
        attachmentId: "attachment-terminal-source",
      });
      for (let iteration = 0; iteration < 20; iteration += 1) {
        await Promise.resolve();
      }

      jest.advanceTimersByTime(750);
      expect(
        service.attachMisoStreamV4(
          { sender: replayTarget },
          {
            requestId: "req-terminal-delay",
            executionId: "chat-terminal-delay",
            attemptId: "attempt-terminal-delay",
            attachmentId: "attachment-terminal-replay",
            afterSeq: 0,
          },
        ),
      ).toMatchObject({
        ok: true,
        terminal: true,
        active: false,
        replayed_through_seq: 2,
      });

      jest.advanceTimersByTime(251);
      expect(
        service.attachMisoStreamV4(
          { sender: expiredTarget },
          {
            requestId: "req-terminal-delay",
            executionId: "chat-terminal-delay",
            attemptId: "attempt-terminal-delay",
            attachmentId: "attachment-terminal-expired",
            afterSeq: 0,
          },
        ),
      ).toMatchObject({ ok: false, code: "stream_not_found" });
    } finally {
      jest.useRealTimers();
    }
  });

  test("cancelMisoExecution posts active V4 identity without disconnecting transport", async () => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));

    let releaseStream;
    const reader = {
      read: jest.fn(
        () =>
          new Promise((resolve) => {
            releaseStream = () => resolve({ done: true });
          }),
      ),
    };
    const cancelAck = {
      status: "ok",
      execution_id: "chat-v4-cancel",
      attempt_id: "req-v4-cancel",
      disposition: "applied",
      state: "cancelled",
      cancellation: {
        requested_at_ms: 1234,
        reason: "user_stop",
        fencing_token: 7,
      },
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(cancelAck),
      });
    const streamRequestImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => reader,
      },
    });

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
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: {
        existsSync: jest.fn(() => true),
      },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      streamRequestImpl,
      webContents: {
        fromId: jest.fn(() => target),
        getAllWebContents: jest.fn(() => [target]),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });

    await service.startMiso();

    service.handleStreamStartV4(
      { sender: { id: 91 } },
      {
        requestId: "req-v4-cancel",
        attachmentId: "attachment-v4-cancel",
        payload: {
          owner_chat_id: "owner-character-chat",
          threadId: "chat-v4-cancel",
          attempt_id: "req-v4-cancel",
          source_attempt_id: "source-v4-cancel",
          message: "keep listening",
          options: { modelId: "local-model" },
        },
      },
    );

    await new Promise((resolve) => setImmediate(resolve));

    await expect(
      service.cancelMisoExecution({
        requestId: "req-v4-cancel",
        owner_chat_id: "another-owner",
        interaction_id: "interaction-v4-cancel",
        reason: "user_stop",
      }),
    ).rejects.toThrow("Cancel identity does not match the active stream attempt");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await expect(
      service.cancelMisoExecution({
        requestId: "req-v4-cancel",
        owner_chat_id: "owner-character-chat",
        interaction_id: "interaction-v4-cancel",
        reason: "user_stop",
        idempotencyKey: "cancel-once",
      }),
    ).resolves.toEqual(cancelAck);

    expect(global.fetch.mock.calls[1][0]).toContain("/chat/executions/cancel");
    expect(global.fetch.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-unchain-auth": "auth-token-123",
      },
    });
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
      owner_chat_id: "owner-character-chat",
      execution_id: "chat-v4-cancel",
      attempt_id: "req-v4-cancel",
      source_attempt_id: "source-v4-cancel",
      interaction_id: "interaction-v4-cancel",
      reason: "user_stop",
      idempotency_key: "cancel-once",
    });
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(target.send).not.toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_EVENT,
      expect.objectContaining({
        requestId: "req-v4-cancel",
        event: "done",
      }),
    );

    releaseStream();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe("unchain service session guard migration handshake", () => {
  const originalFetch = global.fetch;
  const originalResourcesPath = process.resourcesPath;
  const originalMigrationFlag =
    process.env.UNCHAIN_SESSION_GUARD_STOP_THE_WORLD;
  const hadResourcesPath = Object.prototype.hasOwnProperty.call(
    process,
    "resourcesPath",
  );
  const tempDirectories = [];

  const migrationIntentPath = (userData) =>
    path.join(
      userData,
      ".pupu-main",
      "session_guard_migration_intent.json",
    );

  const exactIntentText = JSON.stringify({
    schema: "pupu.session-guard-migration-intent",
    version: 1,
    state: "pending",
    protocol_version: 1,
  });

  const createPackagedMigrationHarness = ({
    healthReceipts,
    initialIntent = false,
  }) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-guard-test-"));
    tempDirectories.push(userData);
    if (initialIntent) {
      const intentPath = migrationIntentPath(userData);
      fs.mkdirSync(path.dirname(intentPath), { recursive: true });
      fs.writeFileSync(intentPath, exactIntentText, "utf8");
    }

    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: "/Applications/PuPu.app/Contents/Resources",
    });
    const packagedBinary = path.join(
      process.resourcesPath,
      "unchain_runtime",
      "dist",
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : "linux",
      process.platform === "win32" ? "unchain-server.exe" : "unchain-server",
    );
    const fsImpl = {
      ...fs,
      existsSync: jest.fn((candidate) =>
        candidate === packagedBinary ? true : fs.existsSync(candidate),
      ),
    };
    const spawnSync = jest.fn((command) => {
      if (command === "ps" || command === "powershell.exe") {
        return { status: 0, stdout: process.platform === "win32" ? "[]" : "" };
      }
      return { status: 0, stdout: "" };
    });
    let firstProcessExited = false;
    let intentAtSecondSpawn = null;
    const processes = [];
    const spawn = jest.fn(() => {
      if (processes.length === 1) {
        expect(firstProcessExited).toBe(true);
        intentAtSecondSpawn = fs.readFileSync(
          migrationIntentPath(userData),
          "utf8",
        );
      }
      const proc = createFakeSpawnProcess();
      proc.pid = 6000 + processes.length;
      proc.kill = jest.fn((signal) => {
        proc.killed = true;
        queueMicrotask(() => {
          if (processes[0] === proc) {
            firstProcessExited = true;
          }
          proc.emit("exit", 0, signal);
        });
        return true;
      });
      processes.push(proc);
      return proc;
    });
    let healthIndex = 0;
    global.fetch = jest.fn(async () => {
      const receipt = healthReceipts[healthIndex] || healthReceipts.at(-1);
      healthIndex += 1;
      if (receipt?.status === "ready" && initialIntent !== false) {
        expect(fs.existsSync(migrationIntentPath(userData))).toBe(true);
      }
      return {
        ok: true,
        json: async () => ({
          status: "ok",
          contract: createRuntimeContract(),
          session_guard_migration: receipt,
        }),
      };
    });
    const service = createUnchainService({
      app: {
        isPackaged: true,
        getAppPath: jest.fn(
          () => "/Applications/PuPu.app/Contents/Resources/app.asar",
        ),
        getPath: jest.fn(() => userData),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: fsImpl,
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });
    return {
      intentAtSecondSpawn: () => intentAtSecondSpawn,
      packagedBinary,
      processes,
      service,
      spawn,
      spawnSync,
      userData,
    };
  };

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalMigrationFlag == null) {
      delete process.env.UNCHAIN_SESSION_GUARD_STOP_THE_WORLD;
    } else {
      process.env.UNCHAIN_SESSION_GUARD_STOP_THE_WORLD = originalMigrationFlag;
    }
    if (hadResourcesPath) {
      Object.defineProperty(process, "resourcesPath", {
        configurable: true,
        value: originalResourcesPath,
      });
    } else {
      delete process.resourcesPath;
    }
    while (tempDirectories.length > 0) {
      fs.rmSync(tempDirectories.pop(), { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  test("packaged startup migrates once only after durable intent and proven managed exit", async () => {
    process.env.UNCHAIN_SESSION_GUARD_STOP_THE_WORLD = "1";
    const requiredReceipt = {
      schema: "pupu.session-guard-migration",
      version: 1,
      status: "migration_required",
      protocol_version: 1,
    };
    const readyReceipt = { ...requiredReceipt, status: "ready" };
    const harness = createPackagedMigrationHarness({
      healthReceipts: [requiredReceipt, readyReceipt],
    });

    await harness.service.startMiso();

    expect(harness.spawn).toHaveBeenCalledTimes(2);
    expect(harness.spawn.mock.calls[0][0]).toBe(harness.packagedBinary);
    expect(harness.spawn.mock.calls[0][2].env).not.toHaveProperty(
      "UNCHAIN_SESSION_GUARD_STOP_THE_WORLD",
    );
    expect(harness.processes[0].kill).toHaveBeenCalledWith("SIGTERM");
    expect(harness.intentAtSecondSpawn()).toBe(exactIntentText);
    expect(harness.spawn.mock.calls[1][2].env).toMatchObject({
      UNCHAIN_SESSION_GUARD_STOP_THE_WORLD: "1",
    });
    expect(fs.existsSync(migrationIntentPath(harness.userData))).toBe(false);
    expect(harness.service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
    });

    await harness.service.restartMiso();
    expect(harness.spawn).toHaveBeenCalledTimes(3);
    expect(harness.spawn.mock.calls[2][2].env).not.toHaveProperty(
      "UNCHAIN_SESSION_GUARD_STOP_THE_WORLD",
    );

    harness.service.stopMiso();
    await new Promise((resolve) => setImmediate(resolve));
  });

  test("invalid receipt fails closed without persisting intent or restarting", async () => {
    process.env.UNCHAIN_SESSION_GUARD_STOP_THE_WORLD = "1";
    const harness = createPackagedMigrationHarness({
      healthReceipts: [
        {
          schema: "pupu.session-guard-migration",
          version: 1,
          status: "ready",
          protocol_version: 1,
          unexpected: true,
        },
      ],
    });

    await harness.service.startMiso();
    await new Promise((resolve) => setImmediate(resolve));

    expect(harness.spawn).toHaveBeenCalledTimes(1);
    expect(harness.spawn.mock.calls[0][2].env).not.toHaveProperty(
      "UNCHAIN_SESSION_GUARD_STOP_THE_WORLD",
    );
    expect(harness.service.getMisoStatusPayload()).toMatchObject({
      status: "error",
      ready: false,
      reason: "Miso session guard migration receipt is invalid",
    });
    expect(fs.existsSync(migrationIntentPath(harness.userData))).toBe(false);
  });

  test("transient unavailable receipt is retried within the startup budget", async () => {
    const unavailableReceipt = {
      schema: "pupu.session-guard-migration",
      version: 1,
      status: "unavailable",
      protocol_version: 1,
    };
    const readyReceipt = { ...unavailableReceipt, status: "ready" };
    const harness = createPackagedMigrationHarness({
      healthReceipts: [unavailableReceipt, readyReceipt],
    });

    await harness.service.startMiso();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
    expect(harness.service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
    });
    expect(fs.existsSync(migrationIntentPath(harness.userData))).toBe(false);

    harness.service.stopMiso();
    await new Promise((resolve) => setImmediate(resolve));
  });

  test("a failed flagged start retains its exact intent for a later safe retry", async () => {
    jest.useFakeTimers();
    let now = 0;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const unavailableReceipt = {
        schema: "pupu.session-guard-migration",
        version: 1,
        status: "unavailable",
        protocol_version: 1,
      };
      const harness = createPackagedMigrationHarness({
        healthReceipts: [unavailableReceipt],
        initialIntent: true,
      });

      const startup = harness.service.startMiso();
      for (let elapsed = 0; elapsed <= 61000; elapsed += 250) {
        // Let the mocked health promise settle and schedule the next retry
        // before advancing the legacy Jest timer implementation.
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
        now += 250;
        jest.advanceTimersByTime(250);
      }
      await startup;

      expect(harness.spawn).toHaveBeenCalledTimes(1);
      expect(harness.spawn.mock.calls[0][2].env).toMatchObject({
        UNCHAIN_SESSION_GUARD_STOP_THE_WORLD: "1",
      });
      expect(
        fs.readFileSync(migrationIntentPath(harness.userData), "utf8"),
      ).toBe(exactIntentText);
      expect(harness.service.getMisoStatusPayload()).toMatchObject({
        status: "error",
        ready: false,
        reason: "Miso session guard migration is unavailable",
      });
    } finally {
      nowSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe("unchain service restartMiso", () => {
  const originalFetch = global.fetch;
  const originalEnvPython = process.env.UNCHAIN_PYTHON_BIN;
  // Mirrors UNCHAIN_RESTART_DELAY_MS in the service (module-private).
  const UNCHAIN_RESTART_DELAY_MS = 1500;

  /* Like createStartupServiceHarness, but hands out a FRESH process per spawn.
     A restart must be able to observe a second, live process — reusing one
     already-killed EventEmitter would make waitForMisoReady bail on
     `unchainProcess.killed` and mask the behavior under test. */
  const createRestartHarness = () => {
    const processes = [];
    const spawn = jest.fn(() => {
      const proc = createFakeSpawnProcess();
      processes.push(proc);
      return proc;
    });
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
      getAppIsQuitting: () => false,
    });
    return { service, spawn, processes };
  };

  beforeEach(() => {
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    global.fetch = jest
      .fn()
      .mockResolvedValue(createCompatibleHealthResponse());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvPython == null) delete process.env.UNCHAIN_PYTHON_BIN;
    else process.env.UNCHAIN_PYTHON_BIN = originalEnvPython;
    jest.clearAllMocks();
  });

  test("REGRESSION: restarts a LIVE sidecar instead of killing it permanently", async () => {
    // The bug this guards: stopMiso() returns with SIGTERM in flight and
    // `unchainProcess` still set, so a naive stopMiso(); startMiso(); hits
    // startMiso's `if (unchainProcess) return` guard and starts nothing — while
    // the exit handler, seeing unchainIsStopping, skips scheduleMisoRestart().
    // A live backend would be killed and never come back.
    const { service, spawn, processes } = createRestartHarness();
    await service.startMiso();
    expect(service.getMisoStatusPayload().ready).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);

    const restarted = service.restartMiso();

    // The old process was signalled but has not exited yet, so no second spawn
    // may have happened: restartMiso must be WAITING, not racing ahead.
    expect(processes[0].kill).toHaveBeenCalledWith("SIGTERM");
    expect(spawn).toHaveBeenCalledTimes(1);

    processes[0].emit("exit", 0, null);
    await restarted;

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "ready",
      ready: true,
    });
  });

  test("the naive stop-then-start sequence is broken — which is why restartMiso exists", async () => {
    const { service, spawn, processes } = createRestartHarness();
    await service.startMiso();
    expect(spawn).toHaveBeenCalledTimes(1);

    /* Documents the exact failure mode a caller outside the closure would hit.
       If any assertion here ever flips, startMiso's guard or the exit handler
       changed and restartMiso's wait should be revisited. */
    service.stopMiso();
    await service.startMiso();

    // startMiso saw the not-yet-cleared `unchainProcess` and returned having
    // started nothing.
    expect(spawn).toHaveBeenCalledTimes(1);

    // Then the process actually dies. The exit handler sees unchainIsStopping,
    // so it marks "stopped" and returns BEFORE arming the crash-restart net.
    processes[0].emit("exit", 0, null);
    expect(service.getMisoStatusPayload()).toMatchObject({
      status: "stopped",
      ready: false,
    });

    // Nothing ever brings it back: a live backend was killed permanently.
    await new Promise((resolve) => setTimeout(resolve, UNCHAIN_RESTART_DELAY_MS + 200));
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(service.getMisoStatusPayload().ready).toBe(false);
  });

  test("restarts cleanly when the sidecar is already stopped", async () => {
    const { service, spawn, processes } = createRestartHarness();
    await service.startMiso();
    service.stopMiso();
    processes[0].emit("exit", 0, null);
    expect(service.getMisoStatusPayload().status).toBe("stopped");

    await service.restartMiso();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(service.getMisoStatusPayload().ready).toBe(true);
  });

  test("fails closed after TERM and bounded KILL when managed exit is never proven", async () => {
    const { service, spawn, processes } = createRestartHarness();
    await service.startMiso();
    jest.useFakeTimers();
    try {
      const restarting = service.restartMiso();
      for (let elapsed = 0; elapsed <= 5100; elapsed += 50) {
        jest.advanceTimersByTime(50);
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
      await restarting;

      expect(processes[0].kill).toHaveBeenCalledWith("SIGTERM");
      expect(processes[0].kill).toHaveBeenCalledWith("SIGKILL");
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(service.getMisoStatusPayload()).toMatchObject({
        status: "error",
        ready: false,
        reason: "Miso process did not exit after forced shutdown",
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("unchain service computer use surface", () => {
  const originalFetch = global.fetch;
  const originalEnvPython = process.env.UNCHAIN_PYTHON_BIN;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvPython == null) {
      delete process.env.UNCHAIN_PYTHON_BIN;
    } else {
      process.env.UNCHAIN_PYTHON_BIN = originalEnvPython;
    }
    jest.clearAllMocks();
  });

  const buildReadyService = (shell) => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    return createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: { existsSync: jest.fn(() => true) },
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      shell,
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });
  };

  test("getComputerUseStatusPayload fetches the sidecar status endpoint", async () => {
    const capabilityPayload = {
      enabled: true,
      capabilities: {
        platform: "macos",
        display_server: "quartz",
        screenshot: true,
        injection: true,
        multi_display: false,
        degradation_reason: null,
        permissions: {
          screen_recording: "granted",
          accessibility: "denied",
        },
        caveats: [],
        action_set: ["computer_20251124"],
      },
    };

    // First fetch is startMiso's health ping — dev's runtime-contract validation
    // (merged) requires a compatible health payload, not a bare { ok: true }.
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse(createRuntimeContract()))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(capabilityPayload),
      });

    const service = buildReadyService({ openExternal: jest.fn() });
    await service.startMiso();
    const result = await service.getComputerUseStatusPayload();

    expect(global.fetch.mock.calls[1][0]).toBe(
      "http://127.0.0.1:5879/computer-use/status",
    );
    expect(global.fetch.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-unchain-auth": "auth-token-123",
        }),
      }),
    );
    expect(result).toEqual(capabilityPayload);
  });

  test("getComputerUseStatusPayload returns disabled payload before ready", async () => {
    const service = buildReadyService({ openExternal: jest.fn() });
    const result = await service.getComputerUseStatusPayload();
    expect(result.enabled).toBe(false);
    expect(result.capabilities).toBeNull();
  });

  test("openComputerUsePrivacySettings opens allowlisted deep links only", async () => {
    const openExternal = jest.fn().mockResolvedValue(undefined);
    const service = buildReadyService({ openExternal });

    const granted = await service.openComputerUsePrivacySettings(
      "accessibility",
    );
    expect(granted).toEqual({ ok: true, target: "accessibility" });
    expect(openExternal).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );

    await service.openComputerUsePrivacySettings("screen_recording");
    expect(openExternal).toHaveBeenLastCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    );

    openExternal.mockClear();
    const rejected = await service.openComputerUsePrivacySettings(
      "https://evil.example.com",
    );
    expect(rejected.ok).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("unchain service computer use enable path", () => {
  const originalFetch = global.fetch;
  const originalEnvPython = process.env.UNCHAIN_PYTHON_BIN;
  const originalEnvComputerUse = process.env.PUPU_COMPUTER_USE;
  const originalEnvComputerUseFeature =
    process.env.PUPU_FEATURE_COMPUTER_USE;

  beforeEach(() => {
    // The spawn-env assertions inspect the exact env the service constructs;
    // a stray ambient PUPU_COMPUTER_USE would leak through the `...process.env`
    // spread and defeat the "cache null => key absent" check.
    delete process.env.PUPU_COMPUTER_USE;
    delete process.env.PUPU_FEATURE_COMPUTER_USE;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvPython == null) {
      delete process.env.UNCHAIN_PYTHON_BIN;
    } else {
      process.env.UNCHAIN_PYTHON_BIN = originalEnvPython;
    }
    if (originalEnvComputerUse == null) {
      delete process.env.PUPU_COMPUTER_USE;
    } else {
      process.env.PUPU_COMPUTER_USE = originalEnvComputerUse;
    }
    if (originalEnvComputerUseFeature == null) {
      delete process.env.PUPU_FEATURE_COMPUTER_USE;
    } else {
      process.env.PUPU_FEATURE_COMPUTER_USE = originalEnvComputerUseFeature;
    }
    jest.clearAllMocks();
  });

  // Each spawn returns a FRESH process so a crash-restart cycle (kill sets
  // `killed = true` on the old one) does not poison the next waitForMisoReady.
  const buildService = ({
    authToken = "auth-token-123",
    fsImpl = { existsSync: jest.fn(() => true) },
  } = {}) => {
    const spawn = jest.fn(() => createFakeSpawnProcess());
    const spawnSync = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        version: "3.12.2",
        major: 3,
        minor: 12,
        missing: [],
      }),
    }));
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";

    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: fsImpl,
      path,
      spawn,
      spawnSync,
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => authToken })),
      },
      net: createAvailableNet(),
      shell: { openExternal: jest.fn() },
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => []),
      },
      runtimeService: {},
      getAppIsQuitting: () => false,
    });
    return { service, spawn };
  };

  test("sidecar release ceiling defaults off", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());

    const { service, spawn } = buildService();
    await service.startMiso();

    expect(spawn.mock.calls[0][2].env.PUPU_FEATURE_COMPUTER_USE).toBe("0");
  });

  test("sidecar release ceiling follows the explicit environment override", async () => {
    process.env.PUPU_FEATURE_COMPUTER_USE = "enabled";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());

    const { service, spawn } = buildService();
    await service.startMiso();

    expect(spawn.mock.calls[0][2].env.PUPU_FEATURE_COMPUTER_USE).toBe("1");
  });

  test("sidecar release ceiling reads the development build snapshot", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());
    const fsImpl = {
      existsSync: jest.fn(() => true),
      readFileSync: jest.fn(() =>
        JSON.stringify({ enable_computer_use: true }),
      ),
    };

    const { service, spawn } = buildService({ fsImpl });
    await service.startMiso();

    expect(spawn.mock.calls[0][2].env.PUPU_FEATURE_COMPUTER_USE).toBe("1");
    expect(fsImpl.readFileSync).toHaveBeenCalledWith(
      path.join("/app", ".local", "build_feature_flags.snapshot.json"),
      "utf-8",
    );
  });

  test("setComputerUseEnabled posts the desired flag to the sidecar config endpoint", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ enabled: true }),
      });

    const { service } = buildService();
    await service.startMiso();
    const result = await service.setComputerUseEnabled(true);

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/computer-use/config",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-unchain-auth": "auth-token-123",
        }),
        body: JSON.stringify({ enabled: true }),
      }),
    );
    expect(result).toEqual({ ok: true, enabled: true });
  });

  test("setComputerUseEnabled sends enabled:false verbatim", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ enabled: false }),
      });

    const { service } = buildService();
    await service.startMiso();
    await service.setComputerUseEnabled(false);

    expect(global.fetch.mock.calls[1][1].body).toBe(
      JSON.stringify({ enabled: false }),
    );
  });

  test("setComputerUseLocalBetaEnabled posts only the independent Beta flag", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ local_beta_enabled: true }),
      });

    const { service } = buildService();
    await service.startMiso();
    const result = await service.setComputerUseLocalBetaEnabled(true);

    expect(global.fetch.mock.calls[1][1].body).toBe(
      JSON.stringify({ local_beta_enabled: true }),
    );
    expect(result).toEqual({ ok: true, local_beta_enabled: true });
  });

  test("probeComputerUseModel posts the bounded local model probe request", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ supported: true, model: "qwen3.5:4b" }),
      });

    const { service } = buildService();
    await service.startMiso();
    await expect(
      service.probeComputerUseModel("qwen3.5:4b", true),
    ).resolves.toMatchObject({ supported: true });
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5879/computer-use/probe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "qwen3.5:4b", force: true }),
      }),
    );
  });

  test("setComputerUseEnabled rejects any non-boolean without touching the sidecar", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());

    const { service } = buildService();
    await service.startMiso();

    const badInputs = ["true", 1, 0, null, undefined, {}, []];
    // eslint-disable-next-line no-restricted-syntax
    for (const input of badInputs) {
      // eslint-disable-next-line no-await-in-loop
      await expect(service.setComputerUseEnabled(input)).rejects.toThrow(
        /strict boolean/i,
      );
    }
    // Only the startMiso health ping happened — no config POST.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("setComputerUseEnabled throws a structured error when the auth token is missing", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());

    const { service } = buildService({ authToken: "" });
    await service.startMiso();

    await expect(service.setComputerUseEnabled(true)).rejects.toMatchObject({
      code: "missing_auth_token",
    });
    // No POST was attempted (still only the health ping).
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("setComputerUseEnabled surfaces sidecar POST failures as structured errors", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () =>
          JSON.stringify({ error: { code: "cu_boom", message: "nope" } }),
      });

    const { service } = buildService();
    await service.startMiso();

    await expect(service.setComputerUseEnabled(true)).rejects.toMatchObject({
      code: "cu_boom",
    });
  });

  test("crash-restart re-pushes the cached desired flag with no renderer involved and carries it in spawn env", async () => {
    global.fetch = jest
      .fn()
      // startMiso #1 health ping
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      // setComputerUseEnabled(true) POST
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ enabled: true }),
      })
      // startMiso #2 (post-crash) health ping
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      // resync POST after ready
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ enabled: true }),
      });

    const { service, spawn } = buildService();
    await service.startMiso();
    const firstProcess = spawn.mock.results[0].value;

    // First boot carries no PUPU_COMPUTER_USE key: cache is still null.
    expect(spawn.mock.calls[0][2].env).not.toHaveProperty("PUPU_COMPUTER_USE");

    await service.setComputerUseEnabled(true);

    // Simulate a sidecar crash: emit exit so the service tears down and clears
    // its process handle (a real restart would be timer-driven; we drive the
    // next startMiso directly to keep the test deterministic).
    firstProcess.emit("exit", 1, null);

    await service.startMiso();

    // The resync POST fired purely from main-process cache — no IPC handler or
    // bridge call took part.
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:5879/computer-use/config",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled: true }),
        headers: expect.objectContaining({
          "x-unchain-auth": "auth-token-123",
        }),
      }),
    );

    // Belt-and-braces: the respawn env now carries the cached desired value.
    expect(spawn.mock.calls[1][2].env.PUPU_COMPUTER_USE).toBe("1");

    // Clear the pending restart timer scheduled by the exit handler.
    service.stopMiso();
  });

  test("startMiso does not push config or set spawn env when the cache is null", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse());

    const { service, spawn } = buildService();
    await service.startMiso();

    // Only the health ping — resync is a no-op while the cache is null.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][2].env).not.toHaveProperty("PUPU_COMPUTER_USE");
  });
});

// Phase 4 (S4): main-side provider-secret strip+inject seam. Frozen v2
// descriptor contract (phase4-descriptor-contract.md): renderer sends a
// non-sensitive list options.__pupu_secret_injection = [{ kind, id, channel }];
// main decrypts, writes the byte-equivalent field set, and ALWAYS strips the
// descriptor. Sentinel keys only — a real key must never appear in a fixture.
describe("unchain service provider-secret injection (Phase 4 S4)", () => {
  const originalFetch = global.fetch;
  const originalEnvPython = process.env.UNCHAIN_PYTHON_BIN;

  const OPENAI_SECRET = "sk-openai-SENTINEL-never-log-000";
  const ANTHROPIC_SECRET = "sk-anthropic-SENTINEL-never-log-1";
  const CUSTOM_SECRET = "sk-custom-SENTINEL-never-log-222";

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnvPython == null) {
      delete process.env.UNCHAIN_PYTHON_BIN;
    } else {
      process.env.UNCHAIN_PYTHON_BIN = originalEnvPython;
    }
    jest.clearAllMocks();
  });

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
        // Mirror the real S1 reader: it returns null whenever secret storage is
        // not "available", regardless of what rows exist.
        if (status !== "available") {
          return null;
        }
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

  const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };

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

  const parseSentBody = (streamRequestImpl) => {
    expect(streamRequestImpl).toHaveBeenCalledTimes(1);
    const requestInit = streamRequestImpl.mock.calls[0][1];
    return JSON.parse(requestInit.body);
  };

  test("injects the openai model field set (4 fields) and strips the descriptor", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-openai-model", {
      __pupu_secret_injection: [
        { kind: "provider", id: "openai", channel: "model" },
      ],
    });
    await flush();

    const body = parseSentBody(streamRequestImpl);
    expect(body.options).toMatchObject({
      openaiApiKey: OPENAI_SECRET,
      openai_api_key: OPENAI_SECRET,
      apiKey: OPENAI_SECRET,
      api_key: OPENAI_SECRET,
    });
    expect(body.options).not.toHaveProperty("__pupu_secret_injection");
    expect(settingsStorageService.readDecryptedProviderSecret).toHaveBeenCalledWith(
      "provider",
      "openai",
    );
    // No anthropic / custom bleed.
    expect(body.options).not.toHaveProperty("anthropicApiKey");
    expect(body.options).not.toHaveProperty("custom_provider_api_key");
  });

  test("injects only the 2-field openai embedding set (no generic api_key)", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-openai-embed", {
      __pupu_secret_injection: [
        { kind: "provider", id: "openai", channel: "embedding" },
      ],
    });
    await flush();

    const body = parseSentBody(streamRequestImpl);
    expect(body.options.openaiApiKey).toBe(OPENAI_SECRET);
    expect(body.options.openai_api_key).toBe(OPENAI_SECRET);
    expect(body.options).not.toHaveProperty("apiKey");
    expect(body.options).not.toHaveProperty("api_key");
    expect(body.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("injects the anthropic model field set (2 fields)", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-anthropic", {
      __pupu_secret_injection: [
        { kind: "provider", id: "anthropic", channel: "model" },
      ],
    });
    await flush();

    const body = parseSentBody(streamRequestImpl);
    expect(body.options.anthropicApiKey).toBe(ANTHROPIC_SECRET);
    expect(body.options.anthropic_api_key).toBe(ANTHROPIC_SECRET);
    expect(body.options).not.toHaveProperty("api_key");
    expect(body.options).not.toHaveProperty("apiKey");
    expect(body.options).not.toHaveProperty("openaiApiKey");
  });

  test("custom provider uses the dedicated channel and never pollutes api_key", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-custom", {
      __pupu_secret_injection: [
        { kind: "custom_provider", id: "custom.myslug", channel: "model" },
      ],
    });
    await flush();

    const body = parseSentBody(streamRequestImpl);
    expect(body.options.custom_provider_api_key).toBe(CUSTOM_SECRET);
    expect(body.options.customProviderApiKey).toBe(CUSTOM_SECRET);
    // Gate 7 red line #9 — custom secret NEVER lands on generic api_key.
    expect(body.options).not.toHaveProperty("api_key");
    expect(body.options).not.toHaveProperty("apiKey");
    expect(body.options).not.toHaveProperty("openaiApiKey");
    expect(body.options).not.toHaveProperty("__pupu_secret_injection");
    expect(settingsStorageService.readDecryptedProviderSecret).toHaveBeenCalledWith(
      "custom_provider",
      "custom.myslug",
    );
  });

  test("injects two distinct secrets in one payload (anthropic model + openai embedding)", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-dual", {
      __pupu_secret_injection: [
        { kind: "provider", id: "openai", channel: "embedding" },
        { kind: "provider", id: "anthropic", channel: "model" },
      ],
    });
    await flush();

    const body = parseSentBody(streamRequestImpl);
    expect(body.options.openaiApiKey).toBe(OPENAI_SECRET);
    expect(body.options.openai_api_key).toBe(OPENAI_SECRET);
    expect(body.options.anthropicApiKey).toBe(ANTHROPIC_SECRET);
    expect(body.options.anthropic_api_key).toBe(ANTHROPIC_SECRET);
    // Embedding must not spill generic keys, and anthropic must not either.
    expect(body.options).not.toHaveProperty("api_key");
    expect(body.options).not.toHaveProperty("apiKey");
    expect(body.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("forwards options unchanged when no descriptor is present (transition window)", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    // Legacy-injected key with NO descriptor — must pass through untouched and
    // the reader must never be consulted.
    driveStreamV2(service, sender, "req-legacy", {
      openaiApiKey: "legacy-inline-key",
      openai_api_key: "legacy-inline-key",
      apiKey: "legacy-inline-key",
      api_key: "legacy-inline-key",
    });
    await flush();

    const body = parseSentBody(streamRequestImpl);
    expect(body.options.openaiApiKey).toBe("legacy-inline-key");
    expect(body.options.api_key).toBe("legacy-inline-key");
    expect(
      settingsStorageService.readDecryptedProviderSecret,
    ).not.toHaveBeenCalled();
  });

  test("fails closed with provider_missing_api_key when a configured secret cannot decrypt", async () => {
    // Storage available, but the requested credential row resolves to null.
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

    // Never keyless-POST.
    expect(streamRequestImpl).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-missing",
      event: "error",
      data: {
        code: "provider_missing_api_key",
        message: "A configured provider secret could not be resolved",
      },
    });
  });

  test("fails closed with secret_storage_unavailable when the secret store is degraded", async () => {
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
    expect(sender.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-degraded",
      event: "error",
      data: {
        code: "secret_storage_unavailable",
        message: "Provider secret storage is unavailable",
      },
    });
  });

  test("fails closed (no crash) when settingsStorageService was never injected", async () => {
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService: undefined,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-no-service", {
      __pupu_secret_injection: [
        { kind: "provider", id: "openai", channel: "model" },
      ],
    });
    await flush();

    expect(streamRequestImpl).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-no-service",
      event: "error",
      data: {
        code: "secret_storage_unavailable",
        message: "Provider secret storage is unavailable",
      },
    });
  });

  test("fails closed on an unknown (kind, id, channel) descriptor entry", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service, sender } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    driveStreamV2(service, sender, "req-unknown", {
      __pupu_secret_injection: [
        { kind: "provider", id: "openai", channel: "reasoning" },
      ],
    });
    await flush();

    expect(streamRequestImpl).not.toHaveBeenCalled();
    const errorCall = sender.send.mock.calls.find(
      (call) => call[1] && call[1].event === "error",
    );
    expect(errorCall).toBeTruthy();
    expect(errorCall[1].data.code).toBe("provider_missing_api_key");
  });

  test("never writes a secret value to console output", async () => {
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
  });

  test("does not expose the secret reader or the injection helper on the service surface", async () => {
    const settingsStorageService = createSecretStore();
    const streamRequestImpl = createDoneStreamImpl();
    const { service } = await createReadyStreamService({
      settingsStorageService,
      streamRequestImpl,
    });

    // Reverse assertion: the main-internal reader/helper is never re-exported
    // by the unchain service surface (and therefore never bridgeable to IPC).
    expect(service).not.toHaveProperty("readDecryptedProviderSecret");
    expect(service).not.toHaveProperty("applyProviderSecretInjection");
    expect(service).not.toHaveProperty("settingsStorageService");
    for (const value of Object.values(service)) {
      expect(value).not.toBe(
        settingsStorageService.readDecryptedProviderSecret,
      );
    }
  });

  // ---- Second outbound secret path: replaceMisoSessionMemory (contract B2) ---
  const createReadyMemoryService = async ({
    settingsStorageService,
    memoryResponse,
  }) => {
    const fakeProcess = createFakeSpawnProcess();
    const spawn = jest.fn(() => fakeProcess);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createCompatibleHealthResponse())
      .mockResolvedValue(
        memoryResponse || {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ applied: true }),
        },
      );
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

  test("replaceMisoSessionMemory injects the descriptor and strips it from the Flask body", async () => {
    const settingsStorageService = createSecretStore();
    const { service, fetchMock } = await createReadyMemoryService({
      settingsStorageService,
    });

    const result = await service.replaceMisoSessionMemory({
      sessionId: "sess-1",
      messages: [],
      options: {
        __pupu_secret_injection: [
          { kind: "provider", id: "anthropic", channel: "model" },
        ],
      },
    });

    expect(result).toEqual({ applied: true });
    // Call 0 = health ping; call 1 = the memory replace POST.
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.options.anthropicApiKey).toBe(ANTHROPIC_SECRET);
    expect(body.options.anthropic_api_key).toBe(ANTHROPIC_SECRET);
    expect(body.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("replaceMisoSessionMemory fails closed (no keyless POST) when decryption fails", async () => {
    const settingsStorageService = createSecretStore({ status: "unavailable" });
    const { service, fetchMock } = await createReadyMemoryService({
      settingsStorageService,
    });

    const result = await service.replaceMisoSessionMemory({
      sessionId: "sess-2",
      messages: [],
      options: {
        __pupu_secret_injection: [
          { kind: "provider", id: "openai", channel: "model" },
        ],
      },
    });

    expect(result).toEqual({
      applied: false,
      error: {
        code: "secret_storage_unavailable",
        message: "Provider secret storage is unavailable",
        retryable: false,
        status: 0,
      },
    });
    // Only the health ping fired — the replace POST never happened.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
