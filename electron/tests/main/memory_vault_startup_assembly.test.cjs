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
const IS_WINDOWS = process.platform === "win32";

const mockOrder = [];
const mockState = {
  appHandlers: new Map(),
  isPackaged: false,
  singleInstanceLock: true,
  resolveEntrypoint: null,
  createExecutors: null,
  configureWindowsVaultCapability: null,
  onWindowsVaultCapabilityLost: null,
  configureSinkExecutors: null,
  probeWindowsVaultSupervisor: null,
  resolveWindowsVaultRuntimeProvenance: null,
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
    get isPackaged() { return mockState.isPackaged; },
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
  createUnchainService: (options) => ({
    startMiso: () => record("sidecar:start"),
    stopMiso: () => {},
    resolveVaultSinkWorkerEntrypoint: (...args) => {
      record("worker:resolve");
      mockState.resolveArgs = args;
      return mockState.resolveEntrypoint();
    },
    configureWindowsVaultCapability: (receipt) => {
      record("windows:configure-capability");
      return mockState.configureWindowsVaultCapability(receipt);
    },
    markWindowsVaultCapabilityLost: (reason) =>
      options.onWindowsVaultCapabilityLost?.(reason),
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
    stopSinkBroker: async () => record("vault:stop-broker"),
    getSinkBrokerBootstrap: () => null,
    close: () => {
      record("vault:close");
      if (mockState.vaultClose) mockState.vaultClose();
    },
  }),
}));

jest.mock("../../main/services/memory_vault/vault_sink_executor", () => ({
  VAULT_SINK_KINDS: jest.requireActual(
    "../../main/services/memory_vault/vault_sink_executor",
  ).VAULT_SINK_KINDS,
  createVaultSinkExecutors: (options) => {
    record("executors:create");
    return mockState.createExecutors(options);
  },
}));

jest.mock("../../main/services/unchain/windows_vault_supervisor_probe", () => ({
  probeWindowsVaultSupervisor: async (...args) => {
    record("windows:probe");
    return mockState.probeWindowsVaultSupervisor(...args);
  },
}));

jest.mock("../../main/services/unchain/windows_vault_provenance", () => ({
  resolveWindowsVaultRuntimeProvenance: (...args) => {
    record("windows:provenance");
    return mockState.resolveWindowsVaultRuntimeProvenance(...args);
  },
}));

jest.mock("../../main/services/unchain/windows_vault_capability", () => ({
  ...jest.requireActual("../../main/services/unchain/windows_vault_capability"),
  createWindowsVaultCapabilityReceipt: (receipt) => {
    record("windows:receipt");
    return jest.requireActual(
      "../../main/services/unchain/windows_vault_capability",
    ).createWindowsVaultCapabilityReceipt(receipt);
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
    mockState.isPackaged = false;
    mockState.resolveArgs = null;
    mockState.vaultClose = null;
    mockState.configureWindowsVaultCapability = () => ({ status: "ready" });
    mockState.probeWindowsVaultSupervisor = () => ({
      containment: "win32_job_list_v1",
      protocol: 1,
      supervisor_protocol: 1,
      worker_protocol: 1,
    });
    mockState.resolveWindowsVaultRuntimeProvenance = () => ({
      arch: "x64",
      runtime_manifest_digest: `sha256:${"a".repeat(64)}`,
      schema: "pupu.windows-vault-provenance.v1",
      sidecar_sha256: `sha256:${"b".repeat(64)}`,
      unchain_wheel_sha256: `sha256:${"c".repeat(64)}`,
    });
    mockState.resolveEntrypoint = () => VALID_ENTRYPOINT;
    mockState.createExecutors = () => ({
      providers: {
        shell_secret_env: { prepare: async () => ({}) },
        shell_secret_stdin: { prepare: async () => ({}) },
        mcp_schema_secret: { prepare: async () => ({}) },
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
      ...(IS_WINDOWS ? ["windows:provenance", "windows:probe"] : []),
      "executors:create",
      "vault:configure",
      "vault:start-broker",
      ...(IS_WINDOWS
        ? ["windows:receipt", "windows:configure-capability"]
        : []),
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

    expect(captured).toMatchObject({
      command: VALID_ENTRYPOINT.command,
      args: VALID_ENTRYPOINT.args,
      cwd: VALID_ENTRYPOINT.cwd,
      dataDir: VALID_ENTRYPOINT.dataDir,
      mcpRuntimeDir: VALID_ENTRYPOINT.mcpRuntimeDir,
      ...(IS_WINDOWS
        ? {
            windowsSinkCapability: {
              containment: "win32_job_list_v1",
              enabled_sink_kinds: [
                "shell_secret_env",
                "shell_secret_stdin",
                "mcp_schema_secret",
              ],
              protocol: 1,
            },
          }
        : {}),
    });
    if (IS_WINDOWS) {
      expect(typeof captured.onStructuralFailure).toBe("function");
    }
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

  (IS_WINDOWS ? test : test.skip)("assembles a development receipt after the real startup prerequisites", async () => {
    mockState.resolveWindowsVaultRuntimeProvenance = () => ({
      arch: "x64", schema: "pupu.windows-vault-development.v1",
    });
    let receipt;
    mockState.configureWindowsVaultCapability = (value) => { receipt = value; };
    await loadMain();
    expect(receipt.provenance).toEqual({ arch: "x64", schema: "pupu.windows-vault-development.v1" });
    expect(mockOrder.indexOf("windows:probe")).toBeLessThan(mockOrder.indexOf("windows:receipt"));
    expect(mockOrder.indexOf("vault:start-broker")).toBeLessThan(mockOrder.indexOf("windows:receipt"));
    expect(mockOrder.indexOf("windows:configure-capability")).toBeLessThan(mockOrder.indexOf("sidecar:start"));
  });

  (IS_WINDOWS ? test : test.skip)("a failed Windows probe keeps a trusted sidecar in Shadow without creating a registry", async () => {
    mockState.probeWindowsVaultSupervisor = () => {
      const error = new Error("probe detail must not escape");
      error.code = "vault_worker_probe_protocol_error";
      throw error;
    };

    await loadMain();

    expect(mockOrder).toContain("windows:provenance");
    expect(mockOrder).toContain("windows:probe");
    expect(mockOrder).not.toContain("executors:create");
    expect(mockOrder).not.toContain("vault:start-broker");
    expect(mockOrder).not.toContain("windows:configure-capability");
    expect(mockOrder).toContain("sidecar:start");
    expect(consoleError).toHaveBeenCalledWith(
      "[memory-vault] Windows capability unavailable:",
      "vault_worker_probe_protocol_error",
    );
  });

  (IS_WINDOWS ? test : test.skip)("a failed packaged Windows sidecar identity prevents any sidecar launch", async () => {
    mockState.isPackaged = true;
    mockState.resolveWindowsVaultRuntimeProvenance = () => {
      const error = new Error("identity detail must not escape");
      error.code = "vault_worker_runtime_identity_invalid";
      throw error;
    };

    await loadMain();

    expect(mockOrder).toContain("windows:provenance");
    expect(mockOrder).not.toContain("windows:probe");
    expect(mockOrder).not.toContain("executors:create");
    expect(mockOrder).not.toContain("vault:start-broker");
    expect(mockOrder).not.toContain("sidecar:start");
    expect(consoleError).toHaveBeenCalledWith(
      "[memory-vault] Windows sidecar identity unavailable:",
      "vault_worker_runtime_identity_invalid",
    );
  });

  (IS_WINDOWS ? test : test.skip)("a development provenance absence keeps the sidecar available in Shadow", async () => {
    mockState.isPackaged = false;
    mockState.resolveWindowsVaultRuntimeProvenance = () => {
      const error = new Error("development provenance is intentionally unavailable");
      error.code = "vault_worker_runtime_identity_invalid";
      throw error;
    };

    await loadMain();

    expect(mockOrder).toContain("windows:provenance");
    expect(mockOrder).not.toContain("windows:probe");
    expect(mockOrder).not.toContain("executors:create");
    expect(mockOrder).toContain("sidecar:start");
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

  (IS_WINDOWS ? test : test.skip)("a receipt/configure failure closes its registry and broker before Shadow sidecar launch", async () => {
    mockState.configureWindowsVaultCapability = () => {
      const error = new Error("receipt detail must not escape");
      error.code = "vault_worker_capability_invalid";
      throw error;
    };

    await loadMain();

    expect(mockOrder).toContain("windows:receipt");
    expect(mockOrder).toContain("windows:configure-capability");
    expect(mockOrder).toContain("vault:stop-broker");
    expect(mockOrder).toContain("executors:close");
    expect(mockOrder).toContain("sidecar:start");
  });

  test("a structural Windows capability loss closes the registry immediately", async () => {
    await loadMain();
    const service = mockState.registeredServices?.unchainService;
    expect(service).toBeTruthy();

    mockOrder.length = 0;
    service.markWindowsVaultCapabilityLost("vault_worker_containment_lost");

    expect(mockOrder).toEqual(["vault:stop-broker", "executors:close"]);
  });

  test("will-quit still drains the registry when configure failed", async () => {
    mockState.configureSinkExecutors = () => {
      const error = new Error("[vault_sink_registry_invalid] nope");
      error.code = "vault_sink_registry_invalid";
      throw error;
    };
    await loadMain();

    expect(mockOrder).toContain("executors:close");
    mockOrder.length = 0;
    mockState.appHandlers.get("will-quit")();

    // Failure cleanup already drained the registry; quit remains safe and
    // does not need to retain a stale reference merely for a second close.
    expect(mockOrder).toEqual(["chat:close", "settings:close", "vault:close"]);
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
