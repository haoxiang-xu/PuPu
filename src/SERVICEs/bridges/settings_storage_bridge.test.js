import {
  settingsStorageBridge,
  isSettingsStorageBridgeAvailable,
  isTokenUsageBridgeAvailable,
  isToolkitPrefsBridgeAvailable,
  isComputerUsePrefsBridgeAvailable,
  isMcpIconBridgeAvailable,
  isProviderCredentialsMigrationBridgeAvailable,
  parseSettingsStorageErrorCode,
  getSessionBootstrapSnapshot,
  getSqlStoreMigrationMeta,
  getBootstrapConfiguredCredentials,
  getBootstrapSecretStorageStatus,
  resetSessionBootstrapSnapshotForTests,
} from "./settings_storage_bridge";

const installMockApi = (overrides = {}) => {
  const api = {
    bootstrap: jest.fn(() => ({
      available: true,
      degraded: false,
      schemaVersion: 1,
      migration: { state: "complete" },
      namespaces: {},
      revisions: {},
    })),
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
    setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

const installMockApiWithTokenUsage = (overrides = {}) =>
  installMockApi({
    appendTokenUsage: jest.fn(() => Promise.resolve({ ok: true, id: 1 })),
    queryTokenUsage: jest.fn(() => Promise.resolve({ ok: true, records: [] })),
    clearTokenUsage: jest.fn(() => Promise.resolve({ ok: true, cleared: 0 })),
    migrateLegacyTokenUsage: jest.fn(() =>
      Promise.resolve({ status: "complete" }),
    ),
    ...overrides,
  });

const installMockApiWithToolkitPrefs = (overrides = {}) =>
  installMockApi({
    readDefaultToolkits: jest.fn(() =>
      Promise.resolve({ ok: true, scopes: {} }),
    ),
    replaceDefaultToolkitsScope: jest.fn(() =>
      Promise.resolve({ ok: true, scopeKey: "global", toolkitIds: [] }),
    ),
    migrateLegacyDefaultToolkits: jest.fn(() =>
      Promise.resolve({ status: "complete" }),
    ),
    readToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ ok: true, toolkits: [], tools: [] }),
    ),
    replaceToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ ok: true, toolkits: [], tools: [] }),
    ),
    migrateLegacyToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ status: "complete" }),
    ),
    ...overrides,
  });

const installMockApiWithComputerUsePrefs = (overrides = {}) =>
  installMockApi({
    readComputerUsePreferences: jest.fn(() =>
      Promise.resolve({ ok: true, entries: {} }),
    ),
    setComputerUsePreference: jest.fn(() =>
      Promise.resolve({ ok: true, key: "consent" }),
    ),
    clearComputerUsePreference: jest.fn(() =>
      Promise.resolve({ ok: true, key: "consent", cleared: true }),
    ),
    migrateLegacyComputerUse: jest.fn(() =>
      Promise.resolve({ status: "complete" }),
    ),
    ...overrides,
  });

const installMockApiWithMcpIcons = (overrides = {}) =>
  installMockApi({
    getMcpIconAsset: jest.fn(() => Promise.resolve({ ok: true, icon: null })),
    setMcpIconAsset: jest.fn(() => Promise.resolve({ ok: true })),
    deleteMcpIconAsset: jest.fn(() =>
      Promise.resolve({ ok: true, deleted: true }),
    ),
    listMcpIconOwners: jest.fn(() =>
      Promise.resolve({ ok: true, owners: [] }),
    ),
    migrateMcpIconsLegacy: jest.fn(() =>
      Promise.resolve({ status: "complete" }),
    ),
    ...overrides,
  });

const installMockApiWithProviderCredentialsMigration = (overrides = {}) =>
  installMockApi({
    migrateProviderCredentials: jest.fn(() =>
      Promise.resolve({
        status: "complete",
        migratedCount: 1,
        failedCount: 0,
      }),
    ),
    ...overrides,
  });

afterEach(() => {
  delete window.settingsStorageAPI;
  resetSessionBootstrapSnapshotForTests();
});

describe("availability probing", () => {
  test("unavailable when window.settingsStorageAPI is missing", () => {
    expect(isSettingsStorageBridgeAvailable()).toBe(false);
    expect(settingsStorageBridge.isAvailable()).toBe(false);
  });

  test("unavailable when a required method is missing", () => {
    const api = installMockApi();
    delete api.setNamespace;
    expect(isSettingsStorageBridgeAvailable()).toBe(false);
  });

  test("available with the full Phase 1A surface", () => {
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("probes at call time — installing the api later flips availability", () => {
    expect(isSettingsStorageBridgeAvailable()).toBe(false);
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("token usage availability is probed separately from the Phase 1A surface", () => {
    // a pre-Phase-2 preload: base bridge available, token usage NOT
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
    expect(isTokenUsageBridgeAvailable()).toBe(false);
    expect(settingsStorageBridge.isTokenUsageAvailable()).toBe(false);

    const api = installMockApiWithTokenUsage();
    expect(isTokenUsageBridgeAvailable()).toBe(true);

    // any missing token usage method flips only the token usage probe
    delete api.queryTokenUsage;
    expect(isTokenUsageBridgeAvailable()).toBe(false);
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("token usage availability is false without the base Phase 1A surface", () => {
    const api = installMockApiWithTokenUsage();
    delete api.bootstrap;
    expect(isTokenUsageBridgeAvailable()).toBe(false);
  });

  test("toolkit prefs availability is probed separately from the Phase 1A surface", () => {
    // a pre-S2 preload: base bridge available, toolkit prefs NOT
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
    expect(isToolkitPrefsBridgeAvailable()).toBe(false);
    expect(settingsStorageBridge.isToolkitPrefsAvailable()).toBe(false);

    const api = installMockApiWithToolkitPrefs();
    expect(isToolkitPrefsBridgeAvailable()).toBe(true);

    // any missing toolkit-prefs method flips only the toolkit-prefs probe
    delete api.replaceToolkitAutoApprove;
    expect(isToolkitPrefsBridgeAvailable()).toBe(false);
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("toolkit prefs availability is false without the base Phase 1A surface", () => {
    const api = installMockApiWithToolkitPrefs();
    delete api.bootstrap;
    expect(isToolkitPrefsBridgeAvailable()).toBe(false);
  });

  test("computer use prefs availability is probed separately from the Phase 1A surface", () => {
    // a pre-S3 preload: base bridge available, computer use prefs NOT
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
    expect(isComputerUsePrefsBridgeAvailable()).toBe(false);
    expect(settingsStorageBridge.isComputerUsePrefsAvailable()).toBe(false);

    const api = installMockApiWithComputerUsePrefs();
    expect(isComputerUsePrefsBridgeAvailable()).toBe(true);

    // any missing computer-use method flips only the computer-use probe
    delete api.setComputerUsePreference;
    expect(isComputerUsePrefsBridgeAvailable()).toBe(false);
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("computer use prefs availability is false without the base Phase 1A surface", () => {
    const api = installMockApiWithComputerUsePrefs();
    delete api.bootstrap;
    expect(isComputerUsePrefsBridgeAvailable()).toBe(false);
  });

  test("mcp icon availability is probed separately from the Phase 1A surface", () => {
    // a pre-Phase-3 preload: base bridge available, mcp icon store NOT
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
    expect(isMcpIconBridgeAvailable()).toBe(false);
    expect(settingsStorageBridge.isMcpIconAvailable()).toBe(false);

    const api = installMockApiWithMcpIcons();
    expect(isMcpIconBridgeAvailable()).toBe(true);

    // any missing mcp-icon method flips only the mcp-icon probe
    delete api.getMcpIconAsset;
    expect(isMcpIconBridgeAvailable()).toBe(false);
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("mcp icon availability is false without the base Phase 1A surface", () => {
    const api = installMockApiWithMcpIcons();
    delete api.bootstrap;
    expect(isMcpIconBridgeAvailable()).toBe(false);
  });

  test("mcp icon bridge methods forward through the optional invoker", async () => {
    const api = installMockApiWithMcpIcons();
    await expect(
      settingsStorageBridge.getMcpIconAsset("mcp.custom.a"),
    ).resolves.toEqual({ ok: true, icon: null });
    expect(api.getMcpIconAsset).toHaveBeenCalledWith("mcp.custom.a");

    await settingsStorageBridge.setMcpIconAsset("mcp.custom.a", {
      mime: "image/png",
      content: "aGVsbG8=",
    });
    expect(api.setMcpIconAsset).toHaveBeenCalledWith("mcp.custom.a", {
      mime: "image/png",
      content: "aGVsbG8=",
    });

    await settingsStorageBridge.deleteMcpIconAsset("mcp.custom.a");
    expect(api.deleteMcpIconAsset).toHaveBeenCalledWith("mcp.custom.a");

    await settingsStorageBridge.listMcpIconOwners();
    expect(api.listMcpIconOwners).toHaveBeenCalled();

    const payload = { migrationVersion: 1, icons: {} };
    await settingsStorageBridge.migrateMcpIconsLegacy(payload);
    expect(api.migrateMcpIconsLegacy).toHaveBeenCalledWith(payload);
  });

  test("provider credentials migration availability is probed separately from the Phase 1A surface", () => {
    // a pre-Phase-4 preload: base bridge available, provider migration NOT
    installMockApi();
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
    expect(isProviderCredentialsMigrationBridgeAvailable()).toBe(false);
    expect(
      settingsStorageBridge.isProviderCredentialsMigrationAvailable(),
    ).toBe(false);

    const api = installMockApiWithProviderCredentialsMigration();
    expect(isProviderCredentialsMigrationBridgeAvailable()).toBe(true);

    // removing the method flips only this probe
    delete api.migrateProviderCredentials;
    expect(isProviderCredentialsMigrationBridgeAvailable()).toBe(false);
    expect(isSettingsStorageBridgeAvailable()).toBe(true);
  });

  test("provider credentials migration availability is false without the base Phase 1A surface", () => {
    const api = installMockApiWithProviderCredentialsMigration();
    delete api.bootstrap;
    expect(isProviderCredentialsMigrationBridgeAvailable()).toBe(false);
  });

  test("migrateProviderCredentials forwards through the optional invoker", async () => {
    const api = installMockApiWithProviderCredentialsMigration();
    const payload = {
      migrationVersion: 1,
      credentials: { openai: "sk-SENTINEL" },
    };
    await expect(
      settingsStorageBridge.migrateProviderCredentials(payload),
    ).resolves.toEqual({
      status: "complete",
      migratedCount: 1,
      failedCount: 0,
    });
    expect(api.migrateProviderCredentials).toHaveBeenCalledWith(payload);
  });

  test("migrateProviderCredentials rejects when the bridge method is absent", async () => {
    installMockApi();
    await expect(
      settingsStorageBridge.migrateProviderCredentials({
        migrationVersion: 1,
        credentials: {},
      }),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });
});

describe("bootstrap", () => {
  test("returns an unavailable snapshot when the bridge is missing", () => {
    expect(settingsStorageBridge.bootstrap()).toEqual({
      available: false,
      degraded: true,
      reason: "bridge-missing",
    });
  });

  test("passes the preload snapshot through untouched", () => {
    const snapshot = {
      available: true,
      degraded: false,
      schemaVersion: 1,
      migration: { state: "not_started" },
      namespaces: { ui: { side_menu_open: true } },
      revisions: { ui: 0 },
    };
    installMockApi({ bootstrap: jest.fn(() => snapshot) });
    expect(settingsStorageBridge.bootstrap()).toBe(snapshot);
  });

  test("null snapshot becomes an unavailable snapshot", () => {
    installMockApi({ bootstrap: jest.fn(() => null) });
    expect(settingsStorageBridge.bootstrap()).toEqual({
      available: false,
      degraded: true,
      reason: "bootstrap-empty",
    });
  });

  test("a throwing bootstrap never propagates — degrades instead", () => {
    installMockApi({
      bootstrap: jest.fn(() => {
        throw new Error("ipc exploded");
      }),
    });
    expect(settingsStorageBridge.bootstrap()).toEqual({
      available: false,
      degraded: true,
      reason: "bootstrap-failed",
    });
  });
});

describe("mutations", () => {
  test("reject with the coded-prefix unavailable error when the bridge is missing", async () => {
    await expect(
      settingsStorageBridge.setNamespace("ui", { side_menu_open: true }),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.migrateLegacy({ migrationVersion: 1 }),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.deleteNamespace("ui"),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("delegates arguments to the preload api", async () => {
    const api = installMockApi();
    await settingsStorageBridge.setNamespace(
      "ui",
      { side_menu_open: false },
      { expectedRevision: 2 },
    );
    expect(api.setNamespace.mock.calls[0][0]).toBe("ui");
    expect(api.setNamespace.mock.calls[0][1]).toEqual({
      side_menu_open: false,
    });
    expect(api.setNamespace.mock.calls[0][2]).toEqual({ expectedRevision: 2 });

    const payload = { migrationVersion: 1, settingsRoot: {}, standalone: {} };
    await settingsStorageBridge.migrateLegacy(payload);
    expect(api.migrateLegacy.mock.calls[0][0]).toBe(payload);

    await settingsStorageBridge.deleteNamespace("dev");
    expect(api.deleteNamespace.mock.calls[0][0]).toBe("dev");
  });

  test("preload rejections pass through unmodified (no swallowing)", async () => {
    installMockApi({
      setNamespace: jest.fn(() =>
        Promise.reject(new Error("[value_too_large] namespace too big")),
      ),
    });
    await expect(
      settingsStorageBridge.setNamespace("ui", {}),
    ).rejects.toThrow(/^\[value_too_large\]/);
  });

  test("a synchronously-throwing preload method becomes a rejection", async () => {
    installMockApi({
      deleteNamespace: jest.fn(() => {
        throw new Error("sync boom");
      }),
    });
    await expect(settingsStorageBridge.deleteNamespace("ui")).rejects.toThrow(
      "sync boom",
    );
  });
});

describe("token usage methods", () => {
  test("reject with the coded-prefix unavailable error when the bridge is missing", async () => {
    await expect(
      settingsStorageBridge.appendTokenUsage({ consumed_tokens: 1 }),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.queryTokenUsage({}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(settingsStorageBridge.clearTokenUsage()).rejects.toThrow(
      /^\[settings_storage_unavailable\]/,
    );
    await expect(
      settingsStorageBridge.migrateLegacyTokenUsage({ migrationVersion: 1 }),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("reject as unavailable on a pre-Phase-2 preload (base surface only)", async () => {
    installMockApi();
    await expect(
      settingsStorageBridge.appendTokenUsage({ consumed_tokens: 1 }),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("delegates arguments to the preload api", async () => {
    const api = installMockApiWithTokenUsage();

    const record = { timestamp: 1, consumed_tokens: 5 };
    await settingsStorageBridge.appendTokenUsage(record);
    expect(api.appendTokenUsage.mock.calls[0][0]).toBe(record);

    const query = { startMs: 1, endMs: 2, limit: 10, offset: 0 };
    await settingsStorageBridge.queryTokenUsage(query);
    expect(api.queryTokenUsage.mock.calls[0][0]).toBe(query);

    await settingsStorageBridge.clearTokenUsage();
    expect(api.clearTokenUsage).toHaveBeenCalledWith();

    const payload = { migrationVersion: 1, records: [record] };
    await settingsStorageBridge.migrateLegacyTokenUsage(payload);
    expect(api.migrateLegacyTokenUsage.mock.calls[0][0]).toBe(payload);
  });

  test("preload rejections pass through unmodified (no swallowing)", async () => {
    installMockApiWithTokenUsage({
      appendTokenUsage: jest.fn(() =>
        Promise.reject(
          new Error("[invalid_token_usage_record] no usable token counts"),
        ),
      ),
    });
    await expect(
      settingsStorageBridge.appendTokenUsage({}),
    ).rejects.toThrow(/^\[invalid_token_usage_record\]/);
  });
});

describe("toolkit prefs methods", () => {
  test("reject with the coded-prefix unavailable error when the bridge is missing", async () => {
    await expect(
      settingsStorageBridge.readDefaultToolkits(),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.replaceDefaultToolkitsScope("global", []),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.migrateLegacyDefaultToolkits({}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.readToolkitAutoApprove(),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.replaceToolkitAutoApprove({}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.migrateLegacyToolkitAutoApprove({}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("reject as unavailable on a pre-S2 preload (base surface only)", async () => {
    installMockApi();
    await expect(
      settingsStorageBridge.replaceDefaultToolkitsScope("global", ["core"]),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("delegates arguments to the preload api", async () => {
    const api = installMockApiWithToolkitPrefs();

    await settingsStorageBridge.readDefaultToolkits();
    expect(api.readDefaultToolkits).toHaveBeenCalledWith();

    await settingsStorageBridge.replaceDefaultToolkitsScope("global", ["core"]);
    expect(api.replaceDefaultToolkitsScope.mock.calls[0][0]).toBe("global");
    expect(api.replaceDefaultToolkitsScope.mock.calls[0][1]).toEqual(["core"]);

    const defaultToolkitsPayload = {
      migrationVersion: 1,
      scopes: { global: ["core"] },
    };
    await settingsStorageBridge.migrateLegacyDefaultToolkits(
      defaultToolkitsPayload,
    );
    expect(api.migrateLegacyDefaultToolkits.mock.calls[0][0]).toBe(
      defaultToolkitsPayload,
    );

    await settingsStorageBridge.readToolkitAutoApprove();
    expect(api.readToolkitAutoApprove).toHaveBeenCalledWith();

    const replacePayload = {
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    };
    await settingsStorageBridge.replaceToolkitAutoApprove(replacePayload);
    expect(api.replaceToolkitAutoApprove.mock.calls[0][0]).toBe(replacePayload);

    const migrationPayload = { migrationVersion: 1, toolkits: [], tools: [] };
    await settingsStorageBridge.migrateLegacyToolkitAutoApprove(
      migrationPayload,
    );
    expect(api.migrateLegacyToolkitAutoApprove.mock.calls[0][0]).toBe(
      migrationPayload,
    );
  });

  test("preload rejections pass through unmodified (no swallowing)", async () => {
    installMockApiWithToolkitPrefs({
      replaceToolkitAutoApprove: jest.fn(() =>
        Promise.reject(
          new Error(
            "[invalid_toolkit_auto_approve_payload] invalid entry",
          ),
        ),
      ),
    });
    await expect(
      settingsStorageBridge.replaceToolkitAutoApprove({}),
    ).rejects.toThrow(/^\[invalid_toolkit_auto_approve_payload\]/);
  });
});

describe("computer use prefs methods", () => {
  test("reject with the coded-prefix unavailable error when the bridge is missing", async () => {
    await expect(
      settingsStorageBridge.readComputerUsePreferences(),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.setComputerUsePreference("consent", {}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.clearComputerUsePreference("consent"),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    await expect(
      settingsStorageBridge.migrateLegacyComputerUse({}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("reject as unavailable on a pre-S3 preload (base surface only)", async () => {
    installMockApi();
    await expect(
      settingsStorageBridge.setComputerUsePreference("consent", {}),
    ).rejects.toThrow(/^\[settings_storage_unavailable\]/);
  });

  test("delegates arguments to the preload api", async () => {
    const api = installMockApiWithComputerUsePrefs();

    await settingsStorageBridge.readComputerUsePreferences();
    expect(api.readComputerUsePreferences).toHaveBeenCalledWith();

    const record = { version: 1, acceptedAt: "2026-07-24T10:00:00.000Z" };
    await settingsStorageBridge.setComputerUsePreference("consent", record);
    expect(api.setComputerUsePreference.mock.calls[0][0]).toBe("consent");
    expect(api.setComputerUsePreference.mock.calls[0][1]).toBe(record);

    await settingsStorageBridge.clearComputerUsePreference("enabled");
    expect(api.clearComputerUsePreference.mock.calls[0][0]).toBe("enabled");

    const payload = { migrationVersion: 1, records: { consent: record } };
    await settingsStorageBridge.migrateLegacyComputerUse(payload);
    expect(api.migrateLegacyComputerUse.mock.calls[0][0]).toBe(payload);
  });

  test("preload rejections pass through unmodified (no swallowing)", async () => {
    installMockApiWithComputerUsePrefs({
      setComputerUsePreference: jest.fn(() =>
        Promise.reject(
          new Error("[invalid_computer_use_preference] invalid record"),
        ),
      ),
    });
    await expect(
      settingsStorageBridge.setComputerUsePreference("consent", {}),
    ).rejects.toThrow(/^\[invalid_computer_use_preference\]/);
  });
});

describe("parseSettingsStorageErrorCode", () => {
  test("recovers the code from the stable message prefix", () => {
    expect(
      parseSettingsStorageErrorCode(
        new Error('[revision_conflict] namespace "ui": revision conflict'),
      ),
    ).toBe("revision_conflict");
    expect(
      parseSettingsStorageErrorCode(
        new Error("[settings_storage_unavailable] gone"),
      ),
    ).toBe("settings_storage_unavailable");
  });

  test("recovers the code from a REAL Electron invoke rejection (wrapped, prefix mid-string)", () => {
    // ipcRenderer.invoke rejections reach the renderer as
    // "Error invoking remote method '<channel>': [<code>] <message>" — the
    // coded prefix is NOT at the start of the string. A ^-anchored parse
    // would return null for every production error.
    expect(
      parseSettingsStorageErrorCode(
        new Error(
          "Error invoking remote method 'settings-storage:append-token-usage': " +
            "[invalid_token_usage_record] token usage record has no usable token counts",
        ),
      ),
    ).toBe("invalid_token_usage_record");
    expect(
      parseSettingsStorageErrorCode(
        new Error(
          "Error invoking remote method 'settings-storage:migrate-legacy': " +
            "[digest_mismatch] migrate-legacy: digest mismatch",
        ),
      ),
    ).toBe("digest_mismatch");
  });

  test("the FIRST bracketed token wins — later bracketed content never overrides the code", () => {
    expect(
      parseSettingsStorageErrorCode(
        new Error(
          "Error invoking remote method 'settings-storage:set-namespace': " +
            '[value_too_large] namespace "ui": value exceeds [1048576] bytes',
        ),
      ),
    ).toBe("value_too_large");
  });

  test("returns null for unprefixed or malformed input", () => {
    expect(parseSettingsStorageErrorCode(new Error("plain failure"))).toBe(
      null,
    );
    // charset guard: uppercase / spaces are outside the code table alphabet
    expect(parseSettingsStorageErrorCode(new Error("[Not A Code] x"))).toBe(
      null,
    );
    expect(
      parseSettingsStorageErrorCode(
        new Error("Error invoking remote method 'x': plain wrapped failure"),
      ),
    ).toBe(null);
    expect(parseSettingsStorageErrorCode(null)).toBe(null);
    expect(parseSettingsStorageErrorCode({})).toBe(null);
  });
});

describe("session-shared bootstrap snapshot", () => {
  test("getSessionBootstrapSnapshot calls the sendSync bootstrap ONCE and shares the result", () => {
    const api = installMockApi();
    const first = getSessionBootstrapSnapshot();
    const second = getSessionBootstrapSnapshot();
    expect(first).toBe(second);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });

  test("an unavailable result is cached too (mode decisions are per-session)", () => {
    const snapshot = getSessionBootstrapSnapshot(); // no bridge installed
    expect(snapshot.available).toBe(false);
    installMockApi();
    expect(getSessionBootstrapSnapshot()).toBe(snapshot);
  });

  test("resetSessionBootstrapSnapshotForTests forgets the cache", () => {
    const api = installMockApi();
    getSessionBootstrapSnapshot();
    resetSessionBootstrapSnapshotForTests();
    getSessionBootstrapSnapshot();
    expect(api.bootstrap).toHaveBeenCalledTimes(2);
  });
});

describe("getSqlStoreMigrationMeta", () => {
  const storeMigrations = {
    tokenUsage: { state: "complete", version: 1, digest: "d1", migratedAt: 7 },
    defaultToolkits: {
      state: "not_started",
      version: null,
      digest: null,
      migratedAt: null,
    },
  };

  test("returns the per-store meta from an available snapshot", () => {
    installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        storeMigrations,
      })),
    });
    expect(getSqlStoreMigrationMeta("tokenUsage")).toEqual(
      storeMigrations.tokenUsage,
    );
    expect(getSqlStoreMigrationMeta("defaultToolkits").state).toBe(
      "not_started",
    );
  });

  test("returns null when the snapshot is unavailable or predates storeMigrations", () => {
    expect(getSqlStoreMigrationMeta("tokenUsage")).toBeNull(); // no bridge
    resetSessionBootstrapSnapshotForTests();

    installMockApi(); // available snapshot, no storeMigrations section
    expect(getSqlStoreMigrationMeta("tokenUsage")).toBeNull();
    resetSessionBootstrapSnapshotForTests();

    installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        storeMigrations: { tokenUsage: { state: 42 } }, // malformed meta
      })),
    });
    expect(getSqlStoreMigrationMeta("tokenUsage")).toBeNull();
    expect(getSqlStoreMigrationMeta("unknownStore")).toBeNull();
  });
});

describe("provider secret bootstrap signals (S3)", () => {
  test("configuredCredentials + secretStorageStatus come from an available snapshot", () => {
    installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        secretStorageStatus: "available",
        configuredCredentials: ["openai", "anthropic", "custom.foo"],
      })),
    });
    expect(getBootstrapConfiguredCredentials()).toEqual([
      "openai",
      "anthropic",
      "custom.foo",
    ]);
    expect(getBootstrapSecretStorageStatus()).toBe("available");
  });

  test("configuredCredentials → [] when snapshot is unavailable or predates the field", () => {
    expect(getBootstrapConfiguredCredentials()).toEqual([]); // no bridge
    resetSessionBootstrapSnapshotForTests();

    installMockApi(); // available snapshot, no configuredCredentials field
    expect(getBootstrapConfiguredCredentials()).toEqual([]);
    resetSessionBootstrapSnapshotForTests();

    installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        configuredCredentials: "not-an-array",
      })),
    });
    expect(getBootstrapConfiguredCredentials()).toEqual([]);
  });

  test("configuredCredentials filters non-string / empty identity entries", () => {
    installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        configuredCredentials: ["openai", "", 7, null, "custom.bar"],
      })),
    });
    expect(getBootstrapConfiguredCredentials()).toEqual([
      "openai",
      "custom.bar",
    ]);
  });

  test("secretStorageStatus is fail-closed: anything but 'available' → 'unavailable'", () => {
    expect(getBootstrapSecretStorageStatus()).toBe("unavailable"); // no bridge
    resetSessionBootstrapSnapshotForTests();

    installMockApi(); // available snapshot, no secretStorageStatus field
    expect(getBootstrapSecretStorageStatus()).toBe("unavailable");
    resetSessionBootstrapSnapshotForTests();

    installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        secretStorageStatus: "basic_text",
      })),
    });
    expect(getBootstrapSecretStorageStatus()).toBe("unavailable");
  });

  test("both signals ride the single shared session snapshot (one sendSync)", () => {
    const api = installMockApi({
      bootstrap: jest.fn(() => ({
        available: true,
        namespaces: {},
        revisions: {},
        secretStorageStatus: "available",
        configuredCredentials: ["openai"],
      })),
    });
    getBootstrapConfiguredCredentials();
    getBootstrapSecretStorageStatus();
    getSessionBootstrapSnapshot();
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
  });
});
