import {
  settingsStorageBridge,
  isSettingsStorageBridgeAvailable,
  parseSettingsStorageErrorCode,
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

afterEach(() => {
  delete window.settingsStorageAPI;
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

  test("returns null for unprefixed or malformed input", () => {
    expect(parseSettingsStorageErrorCode(new Error("plain failure"))).toBe(
      null,
    );
    expect(parseSettingsStorageErrorCode(new Error("[Not A Code] x"))).toBe(
      null,
    );
    expect(parseSettingsStorageErrorCode(null)).toBe(null);
    expect(parseSettingsStorageErrorCode({})).toBe(null);
  });
});
