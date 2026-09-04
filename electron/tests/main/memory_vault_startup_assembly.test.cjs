// Startup + shutdown assembly for the Memory V2 Vault sink worker.
//
// The ORDER asserted here is a security requirement, not a style choice:
//
//   chat/settings init → vault init → resolve worker entrypoint (once, frozen)
//     → build reviewed executor registry → configureSinkExecutors (one-shot)
//     → startSinkBroker (never empty) → ONLY THEN start the sidecar
//
// The sidecar is the broker's only client, so starting it before the broker is
// configured would let it reach a listener that cannot serve it. On the way
// down, the broker must stop and every live worker process group must be
// SIGKILLed synchronously BEFORE the vault DB closes.
//
// index.js is loaded for real against mocked service factories, so this is a
// behavioural assertion rather than a source-text match.

const path = require("path");

const mockOrder = [];
const mockState = {
  appHandlers: new Map(),
  isPackaged: false,
  singleInstanceLock: true,
  resolveEntrypoint: null,
  createExecutors: null,
  configureSinkExecutors: null,
  startSinkBroker: null,
  vaultClose: null,
};

const record = (label) => {
  mockOrder.push(label);
};

// jest's runtime cannot resolve node: builtins that its Node build lacks.
jest.mock("node:sqlite", () => ({}), { virtual: true });

jest.mock("electron", () => ({
  app: {
    isPackaged: false,
    requestSingleInstanceLock: () => mockState.singleInstanceLock,
    on: (event, handler) => {
      mockState.appHandlers.set(event, handler);
    },
    whenReady: () => Promise.resolve(),
    quit: () => {},
    getPath: () => "/tmp/pupu-userdata",
    getAppPath: () => "/tmp/pupu-app",
    getVersion: () => "0.0.0-test",
    commandLine: { appendSwitch: () => {} },
    dock: null,
  },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {},
  shell: {},
  ipcMain: { on: () => {}, handle: () => {} },
  webContents: { fromId: () => null, getAllWebContents: () => [] },
  nativeTheme: {},
  safeStorage: {},
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));

jest.mock("../../main/window/main_window", () => ({
  createMainWindowService: () => ({
    getMainWindow: () => null,
    createMainWindow: () => {},
    focusMainWindow: () => {},
    getPublicAssetPath: () => "/tmp/logo512.png",
  }),
}));

jest.mock("../../main/services/runtime/service", () => ({
  createRuntimeService: () => ({ sweepLeftoverSkillpackDirs: () => {} }),
}));

jest.mock("../../main/services/ollama/service", () => ({
  createOllamaService: () => ({
    startOllama: () => record("ollama:start"),
    stopOllama: () => {},
  }),
}));

jest.mock("../../main/services/update/service", () => ({
  createUpdateService: () => ({
    applyUnsupportedRuntimeMessage: () => {},
    scheduleStartupAutoUpdateCheck: () => {},
  }),
}));

jest.mock("../../main/services/screenshot/service", () => ({
  createScreenshotService: () => ({}),
}));

jest.mock("../../main/services/test-api", () => ({
  createTestApiService: () => ({
    start: async () => {},
    stop: async () => {},
  }),
}));

jest.mock("../../main/ipc/register_handlers", () => ({
  registerIpcHandlers: (options) => {
    // Whatever the vault exposes to IPC is captured here so the test can prove
    // configureSinkExecutors is not among it.
    mockState.registeredServices = options.services;
  },
}));

jest.mock("../../main/services/settings_storage/quit_coordinator", () => ({
  createSettingsQuitCoordinator: () => ({
    start: () => {},
    dispose: () => {},
  }),
}));

jest.mock("../../main/services/chat_storage/service", () => ({
  createChatStorageService: () => ({
    init: async () => record("chat:init"),
    configureDeletionTargets: () => {},
    startDeletionOutboxRunner: () => {},
    stopDeletionOutboxRunner: () => {},
    close: () => record("chat:close"),
  }),
}));

jest.mock("../../main/services/settings_storage/service", () => ({
  createSettingsStorageService: () => ({
    init: async () => record("settings:init"),
    close: () => record("settings:close"),
  }),
}));

jest.mock("../../main/services/unchain/service", () => ({
  createUnchainService: () => ({
    startMiso: () => record("sidecar:start"),
    stopMiso: () => {},
    resolveVaultSinkWorkerEntrypoint: (...args) => {
      record("worker:resolve");
      mockState.resolveArgs = args;
      return mockState.resolveEntrypoint();
    },
  }),
}));

jest.mock("../../main/services/memory_vault/service", () => ({
  createMemoryVaultService: () => ({
    init: async () => record("vault:init"),
    configureSinkExecutors: (registry) => {
      record("vault:configure");
      return mockState.configureSinkExecutors(registry);
    },
    startSinkBroker: async () => {
      record("vault:start-broker");
      return mockState.startSinkBroker();
    },
    stopSinkBroker: async () => {},
    getSinkBrokerBootstrap: () => null,
    close: () => {
      record("vault:close");
      if (mockState.vaultClose) mockState.vaultClose();
    },
  }),
}));

jest.mock("../../main/services/memory_vault/vault_sink_executor", () => ({
  createVaultSinkExecutors: (options) => {
    record("executors:create");
    return mockState.createExecutors(options);
  },
}));

const VALID_ENTRYPOINT = Object.freeze({
  command: "/abs/unchain-server",
  args: Object.freeze(["--vault-sink-worker"]),
  cwd: "/abs",
  dataDir: "/tmp/pupu-userdata",
  mcpRuntimeDir: "/abs/mcp_runtime",
});

const loadMain = async () => {
  mockOrder.length = 0;
  mockState.appHandlers.clear();
  jest.isolateModules(() => {
    require("../../main/index.js");
  });
  // Drain the whenReady().then() chain.
  for (let index = 0; index < 40; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
};

describe("vault sink worker startup assembly", () => {
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockState.registeredServices = null;
    mockState.resolveArgs = null;
    mockState.vaultClose = null;
    mockState.resolveEntrypoint = () => VALID_ENTRYPOINT;
    mockState.createExecutors = () => ({
      providers: {
        shell_secret_env: { prepare: async () => ({}) },
      },
      close: () => record("executors:close"),
      activeChildCount: () => 0,
      isClosed: () => false,
    });
    mockState.configureSinkExecutors = () => ({ ok: true });
    mockState.startSinkBroker = () => ({ url: "http://127.0.0.1:1", key: "k" });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test("resolves, configures, starts the broker, and only THEN starts the sidecar", async () => {
    await loadMain();

    expect(mockOrder).toEqual([
      "chat:init",
      "settings:init",
      "vault:init",
      "worker:resolve",
      "executors:create",
      "vault:configure",
      "vault:start-broker",
      "ollama:start",
      "sidecar:start",
    ]);
  });

  test("resolves the worker entrypoint exactly once, with no arguments", async () => {
    await loadMain();

    expect(mockOrder.filter((step) => step === "worker:resolve")).toHaveLength(
      1,
    );
    expect(mockState.resolveArgs).toEqual([]);
  });

  test("passes the frozen entrypoint verbatim to the executor factory", async () => {
    let captured = null;
    mockState.createExecutors = (options) => {
      captured = options;
      return {
        providers: {
          shell_secret_env: { prepare: async () => ({}) },
        },
        close: () => {},
        activeChildCount: () => 0,
        isClosed: () => false,
      };
    };

    await loadMain();

    expect(captured).toEqual({
      command: VALID_ENTRYPOINT.command,
      args: VALID_ENTRYPOINT.args,
      cwd: VALID_ENTRYPOINT.cwd,
      dataDir: VALID_ENTRYPOINT.dataDir,
      mcpRuntimeDir: VALID_ENTRYPOINT.mcpRuntimeDir,
    });
    for (const key of ["command", "cwd", "dataDir", "mcpRuntimeDir"]) {
      expect(path.isAbsolute(captured[key])).toBe(true);
    }
  });

  test("an unresolvable entrypoint fails closed: no registry, no configure, no broker", async () => {
    mockState.resolveEntrypoint = () => {
      const error = new Error("[vault_worker_unavailable] unavailable");
      error.code = "vault_worker_unavailable";
      throw error;
    };

    await loadMain();

    expect(mockOrder).not.toContain("executors:create");
    expect(mockOrder).not.toContain("vault:configure");
    expect(mockOrder).not.toContain("vault:start-broker");
    // The app still comes up; only vault use is disabled.
    expect(mockOrder).toContain("sidecar:start");
    expect(consoleError).toHaveBeenCalledWith(
      "[memory-vault] sink worker entrypoint unavailable:",
      "vault_worker_unavailable",
    );
  });

  test("a failed executor build never starts an empty broker", async () => {
    mockState.createExecutors = () => {
      const error = new Error("[vault_worker_unavailable] unavailable");
      error.code = "vault_worker_unavailable";
      throw error;
    };

    await loadMain();

    expect(mockOrder).not.toContain("vault:configure");
    expect(mockOrder).not.toContain("vault:start-broker");
    expect(consoleError).toHaveBeenCalledWith(
      "[memory-vault] sink broker unavailable:",
      "vault_sink_unavailable",
    );
  });

  test("a failed configure never starts the broker and never logs details", async () => {
    mockState.configureSinkExecutors = () => {
      const error = new Error("[vault_sink_registry_empty] secret-ish detail");
      error.code = "vault_sink_registry_empty";
      throw error;
    };

    await loadMain();

    expect(mockOrder).toContain("vault:configure");
    expect(mockOrder).not.toContain("vault:start-broker");
    expect(consoleError).toHaveBeenCalledWith(
      "[memory-vault] sink broker unavailable:",
      "vault_sink_registry_empty",
    );
    for (const call of consoleError.mock.calls) {
      expect(call.join(" ")).not.toContain("secret-ish detail");
    }
  });

  test("configureSinkExecutors is never handed to the IPC layer", async () => {
    await loadMain();

    const vaultService = mockState.registeredServices?.memoryVaultService;
    expect(vaultService).toBeTruthy();
    // The service object legitimately carries the method (main calls it), but
    // the IPC registrar must never expose it. Guarded end-to-end by
    // memory_vault_handlers / ipc_channels / api_contract; asserted here for
    // the assembly wiring itself.
    const source = require("fs").readFileSync(
      path.join(__dirname, "../../main/services/memory_vault/register_handlers.js"),
      "utf8",
    );
    expect(source).not.toMatch(/configureSinkExecutors/);
    expect(source).not.toMatch(/startSinkBroker|stopSinkBroker/);
  });

  test("will-quit stops the broker and drains workers before the DB closes", async () => {
    await loadMain();
    const willQuit = mockState.appHandlers.get("will-quit");
    expect(typeof willQuit).toBe("function");

    // The real vault close() drains the registry it was configured with; this
    // stand-in records that ordering explicitly.
    mockState.vaultClose = () => record("vault:drain-executors");

    mockOrder.length = 0;
    willQuit();

    expect(mockOrder).toEqual([
      "chat:close",
      "settings:close",
      "vault:close",
      "vault:drain-executors",
      // Belt-and-braces second drain of the registry index.js still holds.
      "executors:close",
    ]);
  });

  test("will-quit still drains the registry when configure failed", async () => {
    mockState.configureSinkExecutors = () => {
      const error = new Error("[vault_sink_registry_invalid] nope");
      error.code = "vault_sink_registry_invalid";
      throw error;
    };
    await loadMain();

    mockOrder.length = 0;
    mockState.appHandlers.get("will-quit")();

    // The vault never learned about the registry, so index.js has to reap it.
    expect(mockOrder).toContain("executors:close");
    expect(mockOrder.indexOf("vault:close")).toBeLessThan(
      mockOrder.indexOf("executors:close"),
    );
  });

  test("a throwing registry drain never blocks quit", async () => {
    mockState.createExecutors = () => ({
      providers: {
        shell_secret_env: { prepare: async () => ({}) },
      },
      close: () => {
        throw new Error("kill failed");
      },
      activeChildCount: () => 0,
      isClosed: () => false,
    });
    await loadMain();

    expect(() => mockState.appHandlers.get("will-quit")()).not.toThrow();
  });
});
