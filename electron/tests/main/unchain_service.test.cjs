const path = require("path");
const { EventEmitter } = require("events");
const { createUnchainService } = require("../../main/services/unchain/service");

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

  test("replaceUnchainSessionMemory posts the normalized payload to miso", async () => {
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
      .mockResolvedValueOnce({ ok: true })
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
        }),
      }),
    );
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

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

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
      .mockResolvedValueOnce({ ok: true })
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
      .mockResolvedValueOnce({ ok: true })
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
});
