const { createSettingsStorageBridge } = require(
  "../../preload/bridges/settings_storage_bridge",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcRenderer = ({ syncReturn, invokeReturn } = {}) => ({
  sendSync: jest.fn(() => syncReturn),
  invoke: jest.fn(() => Promise.resolve(invokeReturn)),
});

describe("settingsStorageAPI bridge", () => {
  test("requires ipcRenderer", () => {
    expect(() => createSettingsStorageBridge()).toThrow(/ipcRenderer/);
  });

  test("bootstrap performs a synchronous IPC call and returns the payload", () => {
    const syncReturn = { available: true, namespaces: { app: {} } };
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn });
    const api = createSettingsStorageBridge(ipcRenderer);

    const snapshot = api.bootstrap();

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    );
    expect(snapshot).toEqual(syncReturn);
  });

  test("bootstrap returns an explicit unavailable marker when IPC yields nothing", () => {
    const api = createSettingsStorageBridge(
      makeFakeIpcRenderer({ syncReturn: null }),
    );
    expect(api.bootstrap()).toEqual({
      available: false,
      degraded: true,
      reason: "bootstrap-empty",
    });
  });

  test("bootstrap returns an explicit unavailable marker when sendSync throws", () => {
    const ipcRenderer = {
      sendSync: jest.fn(() => {
        throw new Error("boom");
      }),
      invoke: jest.fn(),
    };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const api = createSettingsStorageBridge(ipcRenderer);
      expect(api.bootstrap()).toEqual({
        available: false,
        degraded: true,
        reason: "bootstrap-ipc-failed",
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("migrateLegacy invokes with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { status: "complete" },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const payload = { migrationVersion: 1, settingsRoot: { app: {} } };

    await expect(api.migrateLegacy(payload)).resolves.toEqual({
      status: "complete",
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      payload,
    );
  });

  test("setNamespace invokes with { namespace, value, options }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, revision: 1 },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(
      api.setNamespace("ui", { side_menu_open: true }, { expectedRevision: 0 }),
    ).resolves.toEqual({ ok: true, revision: 1 });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      {
        namespace: "ui",
        value: { side_menu_open: true },
        options: { expectedRevision: 0 },
      },
    );

    // options is optional
    await api.setNamespace("ui", { side_menu_open: false });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      {
        namespace: "ui",
        value: { side_menu_open: false },
        options: undefined,
      },
    );
  });

  test("deleteNamespace invokes with { namespace }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, deleted: true },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(api.deleteNamespace("dev")).resolves.toEqual({
      ok: true,
      deleted: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      { namespace: "dev" },
    );
  });

  test("mutation failures propagate (no silent fake success)", async () => {
    const failure = new Error("revision conflict");
    const ipcRenderer = {
      sendSync: jest.fn(),
      invoke: jest.fn(() => Promise.reject(failure)),
    };
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(api.setNamespace("ui", {})).rejects.toBe(failure);
    await expect(api.deleteNamespace("ui")).rejects.toBe(failure);
    await expect(api.migrateLegacy({})).rejects.toBe(failure);
    await expect(api.appendTokenUsage({})).rejects.toBe(failure);
    await expect(api.queryTokenUsage({})).rejects.toBe(failure);
    await expect(api.clearTokenUsage()).rejects.toBe(failure);
    await expect(api.migrateLegacyTokenUsage({})).rejects.toBe(failure);
    await expect(api.readDefaultToolkits()).rejects.toBe(failure);
    await expect(api.replaceDefaultToolkitsScope("global", [])).rejects.toBe(
      failure,
    );
    await expect(api.migrateLegacyDefaultToolkits({})).rejects.toBe(failure);
    await expect(api.readToolkitAutoApprove()).rejects.toBe(failure);
    await expect(api.replaceToolkitAutoApprove({})).rejects.toBe(failure);
    await expect(api.migrateLegacyToolkitAutoApprove({})).rejects.toBe(failure);
    await expect(api.readComputerUsePreferences()).rejects.toBe(failure);
    await expect(api.setComputerUsePreference("consent", {})).rejects.toBe(
      failure,
    );
    await expect(api.clearComputerUsePreference("consent")).rejects.toBe(
      failure,
    );
    await expect(api.migrateLegacyComputerUse({})).rejects.toBe(failure);
  });

  test("appendTokenUsage invokes with { record }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, id: 7 },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const record = { timestamp: 1, consumed_tokens: 5 };

    await expect(api.appendTokenUsage(record)).resolves.toEqual({
      ok: true,
      id: 7,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
      { record },
    );
  });

  test("queryTokenUsage invokes with { query }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, records: [] },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const query = { startMs: 1, endMs: 2, limit: 100, offset: 0 };

    await expect(api.queryTokenUsage(query)).resolves.toEqual({
      ok: true,
      records: [],
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
      { query },
    );
  });

  test("clearTokenUsage invokes without a payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, cleared: 3 },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(api.clearTokenUsage()).resolves.toEqual({
      ok: true,
      cleared: 3,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
    );
  });

  test("migrateLegacyTokenUsage invokes with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { status: "complete" },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const payload = { migrationVersion: 1, records: [] };

    await expect(api.migrateLegacyTokenUsage(payload)).resolves.toEqual({
      status: "complete",
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
      payload,
    );
  });

  test("readDefaultToolkits / readToolkitAutoApprove invoke without a payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await api.readDefaultToolkits();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
    );

    await api.readToolkitAutoApprove();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
    );
  });

  test("replaceDefaultToolkitsScope invokes with { scopeKey, toolkitIds }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, scopeKey: "global", toolkitIds: ["core"] },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(
      api.replaceDefaultToolkitsScope("global", ["core"]),
    ).resolves.toEqual({ ok: true, scopeKey: "global", toolkitIds: ["core"] });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
      { scopeKey: "global", toolkitIds: ["core"] },
    );
  });

  test("replaceToolkitAutoApprove invokes with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, toolkits: [], tools: [] },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const payload = {
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    };

    await api.replaceToolkitAutoApprove(payload);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
      payload,
    );
  });

  test("toolkit-prefs migrations invoke with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { status: "complete" },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    const defaultToolkitsPayload = {
      migrationVersion: 1,
      scopes: { global: ["core"] },
    };
    await api.migrateLegacyDefaultToolkits(defaultToolkitsPayload);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      defaultToolkitsPayload,
    );

    const autoApprovePayload = { migrationVersion: 1, toolkits: [], tools: [] };
    await api.migrateLegacyToolkitAutoApprove(autoApprovePayload);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      autoApprovePayload,
    );
  });

  test("computer-use read invokes without a payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, entries: {} },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(api.readComputerUsePreferences()).resolves.toEqual({
      ok: true,
      entries: {},
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
    );
  });

  test("setComputerUsePreference invokes with { key, value }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, key: "consent" },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const value = { version: 1, acceptedAt: "2026-07-24T10:00:00.000Z" };

    await expect(api.setComputerUsePreference("consent", value)).resolves.toEqual(
      { ok: true, key: "consent" },
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
      { key: "consent", value },
    );
  });

  test("clearComputerUsePreference invokes with { key }", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, key: "enabled", cleared: true },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(api.clearComputerUsePreference("enabled")).resolves.toEqual({
      ok: true,
      key: "enabled",
      cleared: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
      { key: "enabled" },
    );
  });

  test("migrateLegacyComputerUse invokes with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { status: "complete" },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const payload = { migrationVersion: 1, records: {} };

    await expect(api.migrateLegacyComputerUse(payload)).resolves.toEqual({
      status: "complete",
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      payload,
    );
  });

  test("getMcpIconAsset invokes with the toolkit id envelope", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, icon: null },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(
      api.getMcpIconAsset("mcp.custom.local-test"),
    ).resolves.toEqual({ ok: true, icon: null });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
      { toolkitId: "mcp.custom.local-test" },
    );
  });

  test("setMcpIconAsset invokes with the toolkit id + icon envelope", async () => {
    const ipcRenderer = makeFakeIpcRenderer({ invokeReturn: { ok: true } });
    const api = createSettingsStorageBridge(ipcRenderer);
    const icon = { mime: "image/png", content: "aGVsbG8=" };

    await expect(
      api.setMcpIconAsset("mcp.custom.local-test", icon),
    ).resolves.toEqual({ ok: true });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
      { toolkitId: "mcp.custom.local-test", icon },
    );
  });

  test("deleteMcpIconAsset invokes with the toolkit id envelope", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, deleted: true },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(
      api.deleteMcpIconAsset("mcp.custom.local-test"),
    ).resolves.toEqual({ ok: true, deleted: true });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
      { toolkitId: "mcp.custom.local-test" },
    );
  });

  test("listMcpIconOwners invokes the list channel", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { ok: true, owners: [] },
    });
    const api = createSettingsStorageBridge(ipcRenderer);

    await expect(api.listMcpIconOwners()).resolves.toEqual({
      ok: true,
      owners: [],
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
    );
  });

  test("migrateMcpIconsLegacy invokes with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { status: "complete" },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const payload = { migrationVersion: 1, icons: {} };

    await expect(api.migrateMcpIconsLegacy(payload)).resolves.toEqual({
      status: "complete",
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
      payload,
    );
  });

  test("migrateProviderCredentials invokes with the raw payload", async () => {
    const ipcRenderer = makeFakeIpcRenderer({
      invokeReturn: { status: "complete", migratedCount: 1, failedCount: 0 },
    });
    const api = createSettingsStorageBridge(ipcRenderer);
    const payload = {
      migrationVersion: 1,
      credentials: { openai: "sk-SENTINEL" },
    };

    await expect(api.migrateProviderCredentials(payload)).resolves.toEqual({
      status: "complete",
      migratedCount: 1,
      failedCount: 0,
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
      payload,
    );
  });

  test("bridge surface is exactly the Phase 1A + Phase 2 + Phase 3 + Phase 4 method set", () => {
    const api = createSettingsStorageBridge(makeFakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual(
      [
        "bootstrap",
        "deleteNamespace",
        "migrateLegacy",
        "setNamespace",
        "appendTokenUsage",
        "queryTokenUsage",
        "clearTokenUsage",
        "migrateLegacyTokenUsage",
        "readDefaultToolkits",
        "replaceDefaultToolkitsScope",
        "migrateLegacyDefaultToolkits",
        "readToolkitAutoApprove",
        "replaceToolkitAutoApprove",
        "migrateLegacyToolkitAutoApprove",
        "readComputerUsePreferences",
        "setComputerUsePreference",
        "clearComputerUsePreference",
        "migrateLegacyComputerUse",
        "getMcpIconAsset",
        "setMcpIconAsset",
        "deleteMcpIconAsset",
        "listMcpIconOwners",
        "migrateMcpIconsLegacy",
        "migrateProviderCredentials",
      ].sort(),
    );
  });
});
