const {
  registerIpcHandlers,
  IPC_HANDLE_CHANNELS,
  IPC_ON_CHANNELS,
  IPC_ON_SYNC_CHANNELS,
  MAIN_EVENT_CHANNELS,
} = require("../../main/ipc/register_handlers");
const {
  PRELOAD_INVOKE_CHANNELS,
  PRELOAD_SEND_CHANNELS,
  PRELOAD_SEND_SYNC_CHANNELS,
  PRELOAD_EVENT_CHANNELS,
} = require("../../preload/channels");
const { CHANNELS } = require("../../shared/channels");

describe("ipc channel parity", () => {
  test("preload invoke/send channels are registered in main handlers", () => {
    const mainRegistered = new Set([...IPC_HANDLE_CHANNELS, ...IPC_ON_CHANNELS]);

    PRELOAD_INVOKE_CHANNELS.forEach((channel) => {
      expect(mainRegistered.has(channel)).toBe(true);
    });

    PRELOAD_SEND_CHANNELS.forEach((channel) => {
      expect(mainRegistered.has(channel)).toBe(true);
    });
  });

  test("preload event channels are emitted by main", () => {
    const mainEvents = new Set(MAIN_EVENT_CHANNELS);

    PRELOAD_EVENT_CHANNELS.forEach((channel) => {
      expect(mainEvents.has(channel)).toBe(true);
    });
  });

  test("preload sendSync channels are registered in main sync handlers", () => {
    const mainSync = new Set(IPC_ON_SYNC_CHANNELS);
    PRELOAD_SEND_SYNC_CHANNELS.forEach((channel) => {
      expect(mainSync.has(channel)).toBe(true);
    });
  });

  test("custom provider test-connection channel is registered on both sides", () => {
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.TEST_CUSTOM_PROVIDER,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.TEST_CUSTOM_PROVIDER,
    );
  });

  test("chat storage v3 channels are classified on both sides", () => {
    expect(IPC_ON_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(IPC_ON_CHANNELS).toContain(CHANNELS.CHAT_STORAGE.APPLY_OPS);
    expect(PRELOAD_SEND_SYNC_CHANNELS).toContain(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
    );
    expect(PRELOAD_SEND_CHANNELS).toContain(CHANNELS.CHAT_STORAGE.APPLY_OPS);
  });

  test("settings storage channels are classified on both sides", () => {
    // bootstrap is sendSync → main on-sync
    expect(IPC_ON_SYNC_CHANNELS).toContain(
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    );
    expect(PRELOAD_SEND_SYNC_CHANNELS).toContain(
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    );

    // mutations/queries are invoke → main handle (Phase 2 token usage
    // channels included — sync IPC stays bootstrap-only, plan §4.2)
    [
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
    ].forEach((channel) => {
      expect(PRELOAD_INVOKE_CHANNELS).toContain(channel);
      expect(IPC_HANDLE_CHANNELS).toContain(channel);
      // sync IPC is bootstrap-only (plan §4.2)
      expect(PRELOAD_SEND_SYNC_CHANNELS).not.toContain(channel);
    });
  });

  test("settings storage handlers are wired through registerIpcHandlers", () => {
    const handleChannels = new Set();
    const onChannels = new Set();
    const ipcMain = {
      handle: jest.fn((channel) => handleChannels.add(channel)),
      on: jest.fn((channel) => onChannels.add(channel)),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService: {},
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
      },
    });

    expect(onChannels.has(CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ)).toBe(true);
    [
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
    ].forEach((channel) => {
      expect(handleChannels.has(channel)).toBe(true);
    });
  });

  test("v4 stream attach/detach channels are classified on both sides", () => {
    // attach-v4 is a request/response invoke → main handle
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.STREAM_ATTACH_V4,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(CHANNELS.UNCHAIN.STREAM_ATTACH_V4);

    // detach is fire-and-forget send → main on
    expect(PRELOAD_SEND_CHANNELS).toContain(CHANNELS.UNCHAIN.STREAM_DETACH);
    expect(IPC_ON_CHANNELS).toContain(CHANNELS.UNCHAIN.STREAM_DETACH);
  });

  test("skill-repo download channel is classified on both sides", () => {
    expect(PRELOAD_INVOKE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO,
    );
    expect(IPC_HANDLE_CHANNELS).toContain(
      CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO,
    );
  });

  test("skill-repo download invoke delegates to the runtime service", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const downloadAck = { ok: true, dir: "/tmp/pupu-skillpack-abc" };
    const runtimeService = {
      downloadSkillRepo: jest.fn().mockResolvedValue(downloadAck),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService: {},
        runtimeService,
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
      },
    });

    const payload = {
      repo: "obra/superpowers",
      sha: "a".repeat(40),
      manifest: [{ path: "skills/a/SKILL.md", sha256: "b".repeat(64) }],
    };
    const handler = registeredHandlers.get(
      CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO,
    );

    await expect(handler({}, payload)).resolves.toEqual(downloadAck);
    expect(runtimeService.downloadSkillRepo).toHaveBeenCalledWith(payload);
  });

  test("semantic cancel invoke delegates to the unchain service", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const cancelAck = {
      status: "ok",
      execution_id: "chat-1",
      attempt_id: "attempt-1",
      disposition: "applied",
      state: "cancelled",
    };
    const unchainService = {
      cancelMisoExecution: jest.fn().mockResolvedValue(cancelAck),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService,
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
      },
    });

    const payload = {
      executionId: "chat-1",
      attemptId: "attempt-1",
      reason: "user_stop",
    };
    const handler = registeredHandlers.get(CHANNELS.UNCHAIN.CANCEL_EXECUTION);

    await expect(handler({}, payload)).resolves.toEqual(cancelAck);
    expect(unchainService.cancelMisoExecution).toHaveBeenCalledWith(payload);
  });

  test("set-computer-use-enabled rejects non-boolean and delegates strict boolean", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        registeredHandlers.set(channel, handler);
      }),
      on: jest.fn(),
    };
    const unchainService = {
      setComputerUseEnabled: jest.fn().mockResolvedValue({ enabled: true }),
    };

    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {},
        updateService: {},
        ollamaService: {},
        unchainService,
        runtimeService: {},
        screenshotService: {},
        chatStorageService: {},
        settingsStorageService: {},
      },
    });

    const handler = registeredHandlers.get(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_ENABLED,
    );
    expect(typeof handler).toBe("function");

    // Every non-boolean shape must be rejected outright with no truthy coercion
    // and no delegation into the service.
    const rejectedInputs = ["true", "false", 1, 0, null, undefined, {}, []];
    // eslint-disable-next-line no-restricted-syntax
    for (const enabled of rejectedInputs) {
      // eslint-disable-next-line no-await-in-loop
      await expect(handler({}, { enabled })).rejects.toThrow(
        /strict boolean/i,
      );
    }
    // Missing payload entirely is also rejected.
    await expect(handler({})).rejects.toThrow(/strict boolean/i);
    expect(unchainService.setComputerUseEnabled).not.toHaveBeenCalled();

    // Strict booleans pass through unchanged.
    await expect(handler({}, { enabled: true })).resolves.toEqual({
      enabled: true,
    });
    expect(unchainService.setComputerUseEnabled).toHaveBeenCalledWith(true);

    await handler({}, { enabled: false });
    expect(unchainService.setComputerUseEnabled).toHaveBeenLastCalledWith(false);
  });

  test("local Computer Beta channels validate and delegate", async () => {
    const registeredHandlers = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => registeredHandlers.set(channel, handler)),
      on: jest.fn(),
    };
    const unchainService = {
      setComputerUseLocalBetaEnabled: jest.fn().mockResolvedValue({
        local_beta_enabled: true,
      }),
      probeComputerUseModel: jest.fn().mockResolvedValue({ supported: true }),
    };
    registerIpcHandlers({
      ipcMain,
      app: {},
      services: {
        windowService: {}, updateService: {}, ollamaService: {}, unchainService,
        runtimeService: {}, screenshotService: {}, chatStorageService: {},
        settingsStorageService: {},
      },
    });

    const setBeta = registeredHandlers.get(
      CHANNELS.UNCHAIN.SET_COMPUTER_USE_LOCAL_BETA_ENABLED,
    );
    await expect(setBeta({}, { enabled: "true" })).rejects.toThrow(/strict boolean/i);
    await expect(setBeta({}, { enabled: true })).resolves.toEqual({
      local_beta_enabled: true,
    });
    expect(unchainService.setComputerUseLocalBetaEnabled).toHaveBeenCalledWith(true);

    const probe = registeredHandlers.get(CHANNELS.UNCHAIN.PROBE_COMPUTER_USE_MODEL);
    await expect(probe({}, { model: "", force: true })).rejects.toThrow(/requires/i);
    await expect(
      probe({}, { model: "qwen3.5:4b", force: true }),
    ).resolves.toEqual({ supported: true });
    expect(unchainService.probeComputerUseModel).toHaveBeenCalledWith(
      "qwen3.5:4b",
      true,
    );
  });
});
