const {
  registerSettingsStorageHandlers,
  SETTINGS_STORAGE_SYNC_CHANNELS,
  SETTINGS_STORAGE_INVOKE_CHANNELS,
} = require(
  "../../main/services/settings_storage/register_handlers",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcMain = () => {
  const onHandlers = new Map();
  const handleHandlers = new Map();
  return {
    on: jest.fn((channel, handler) => {
      onHandlers.set(channel, handler);
    }),
    handle: jest.fn((channel, handler) => {
      handleHandlers.set(channel, handler);
    }),
    getOn: (channel) => onHandlers.get(channel),
    getHandle: (channel) => handleHandlers.get(channel),
  };
};

const makeFakeService = (overrides = {}) => ({
  getBootstrapSnapshot: jest.fn(() => ({ available: true, namespaces: {} })),
  migrateLegacy: jest.fn(() => ({ status: "complete" })),
  setNamespace: jest.fn(() => ({ ok: true, revision: 0 })),
  deleteNamespace: jest.fn(() => ({ ok: true, deleted: true })),
  ...overrides,
});

describe("settings storage IPC handlers", () => {
  test("throws on missing dependencies", () => {
    expect(() => registerSettingsStorageHandlers({})).toThrow(
      /missing dependencies/,
    );
    expect(() =>
      registerSettingsStorageHandlers({ ipcMain: makeFakeIpcMain() }),
    ).toThrow(/missing dependencies/);
  });

  test("bootstrap-read is registered as sync (ipcMain.on + event.returnValue)", () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getOn(CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ);
    expect(handler).toBeDefined();
    const event = {};
    handler(event);
    expect(event.returnValue).toEqual({ available: true, namespaces: {} });
    expect(service.getBootstrapSnapshot).toHaveBeenCalled();
  });

  test("bootstrap-read failure yields an explicit degraded marker, never throws", () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      getBootstrapSnapshot: jest.fn(() => {
        throw new Error("db gone");
      }),
    });
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getOn(CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const event = {};
      expect(() => handler(event)).not.toThrow();
      expect(event.returnValue).toEqual({
        available: false,
        degraded: true,
        reason: "bootstrap-read-failed",
      });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("mutations are registered as invoke (ipcMain.handle), never sync", () => {
    const ipcMain = makeFakeIpcMain();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: makeFakeService(),
    });

    for (const channel of [
      CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
      CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
    ]) {
      expect(ipcMain.getHandle(channel)).toBeDefined();
      expect(ipcMain.getOn(channel)).toBeUndefined();
    }
    // bootstrap is the only sync channel
    expect(
      ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ),
    ).toBeUndefined();
  });

  test("migrate-legacy delegates the payload and resolves the service result", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY);
    const payload = { migrationVersion: 1, settingsRoot: { app: {} } };
    await expect(handler({}, payload)).resolves.toEqual({
      status: "complete",
    });
    expect(service.migrateLegacy).toHaveBeenCalledWith(payload);
  });

  test("set-namespace unpacks { namespace, value, options } positionally", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE);
    await expect(
      handler(
        {},
        {
          namespace: "appearance",
          value: { theme_mode: "dark_mode" },
          options: { expectedRevision: 3 },
        },
      ),
    ).resolves.toEqual({ ok: true, revision: 0 });
    expect(service.setNamespace).toHaveBeenCalledWith(
      "appearance",
      { theme_mode: "dark_mode" },
      { expectedRevision: 3 },
    );

    // missing payload does not crash the handler wrapper itself
    await handler({});
    expect(service.setNamespace).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      undefined,
    );
  });

  test("delete-namespace unpacks { namespace }", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
    );
    await expect(handler({}, { namespace: "dev" })).resolves.toEqual({
      ok: true,
      deleted: true,
    });
    expect(service.deleteNamespace).toHaveBeenCalledWith("dev");
  });

  test("mutation errors are logged (code only) and rethrown to the renderer", async () => {
    const failure = new Error("invalid namespace: must match [a-z0-9_.-]");
    failure.code = "invalid_namespace";
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      setNamespace: jest.fn(() => {
        throw failure;
      }),
      migrateLegacy: jest.fn(() => {
        throw failure;
      }),
      deleteNamespace: jest.fn(() => {
        throw failure;
      }),
    });
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE)(
          {},
          { namespace: "Bad Name", value: { secret_value: "must-not-log" } },
        ),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY)({}, {}),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE)(
          {},
          { namespace: "Bad Name" },
        ),
      ).rejects.toBe(failure);
      expect(warnSpy).toHaveBeenCalled();
      // logs never include the namespace value
      for (const call of warnSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("must-not-log");
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("failure logs sanitize the namespace: non-strings never print content, strings are clipped", async () => {
    const failure = new Error("[invalid_namespace] invalid namespace");
    failure.code = "invalid_namespace";
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      setNamespace: jest.fn(() => {
        throw failure;
      }),
      deleteNamespace: jest.fn(() => {
        throw failure;
      }),
    });
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // a non-string namespace (object) takes the rejection path — the log
      // must carry a typeof placeholder, never the object's content
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE)(
          {},
          { namespace: { leaked_key: "leaked-object-content" }, value: {} },
        ),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE)(
          {},
          { namespace: { leaked_key: "leaked-object-content" } },
        ),
      ).rejects.toBe(failure);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain("leaked-object-content");
      expect(logged).not.toContain("leaked_key");
      expect(logged).toContain("<non-string:object>");

      // string namespaces are printed, but clipped to 120 chars with control
      // characters stripped
      warnSpy.mockClear();
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE)(
          {},
          {
            namespace: `evil\u0007name\r\n${"a".repeat(300)}`,
            value: {},
          },
        ),
      ).rejects.toBe(failure);
      const loggedNamespace = warnSpy.mock.calls[0][1];
      expect(typeof loggedNamespace).toBe("string");
      expect(loggedNamespace.length).toBeLessThanOrEqual(120);
      expect(loggedNamespace).not.toContain("\u0007");
      expect(loggedNamespace).not.toContain("\n");
      expect(loggedNamespace.startsWith("evilname")).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("exports channel lists for parity checks", () => {
    expect(SETTINGS_STORAGE_SYNC_CHANNELS).toEqual([
      CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
    ]);
    expect([...SETTINGS_STORAGE_INVOKE_CHANNELS].sort()).toEqual(
      [
        CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
        CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
        CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
      ].sort(),
    );
  });
});
