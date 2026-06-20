const path = require("path");
const { EventEmitter } = require("events");
const { CHANNELS } = require("../../shared/channels");
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
      .mockResolvedValueOnce({ ok: true })
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
      .mockResolvedValueOnce({ ok: true })
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
    await service.getMisoMcpOAuthStatus("productivity.notion-remote");
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
      "http://127.0.0.1:5879/mcp/oauth/status?entry_id=productivity.notion-remote",
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
      .mockResolvedValueOnce({ ok: true })
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
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
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

  test("handleStreamStartV4 uses v4 endpoint and forwards runtime events", async () => {
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
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
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
        payload: {
          message: "hello",
          options: {},
        },
      },
    );

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(global.fetch.mock.calls[1][0]).toContain("/chat/stream/v4");
    expect(target.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-v4-1",
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
      event: "done",
      data: { ok: true },
    });
  });
});
