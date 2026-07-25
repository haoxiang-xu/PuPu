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
  });

  test("bridge surface is exactly { bootstrap, migrateLegacy, setNamespace, deleteNamespace }", () => {
    const api = createSettingsStorageBridge(makeFakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual(
      ["bootstrap", "deleteNamespace", "migrateLegacy", "setNamespace"].sort(),
    );
  });
});
