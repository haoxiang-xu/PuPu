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
  appendTokenUsage: jest.fn(() => ({ ok: true, id: 1 })),
  queryTokenUsage: jest.fn(() => ({ ok: true, records: [] })),
  clearTokenUsage: jest.fn(() => ({ ok: true, cleared: 0 })),
  migrateLegacyTokenUsage: jest.fn(() => ({ status: "complete" })),
  readDefaultToolkits: jest.fn(() => ({ ok: true, scopes: {} })),
  replaceDefaultToolkitsScope: jest.fn(() => ({
    ok: true,
    scopeKey: "global",
    toolkitIds: [],
  })),
  migrateLegacyDefaultToolkits: jest.fn(() => ({ status: "complete" })),
  readToolkitAutoApprove: jest.fn(() => ({ ok: true, toolkits: [], tools: [] })),
  replaceToolkitAutoApprove: jest.fn(() => ({
    ok: true,
    toolkits: [],
    tools: [],
  })),
  migrateLegacyToolkitAutoApprove: jest.fn(() => ({ status: "complete" })),
  readComputerUsePreferences: jest.fn(() => ({ ok: true, entries: {} })),
  setComputerUsePreference: jest.fn(() => ({ ok: true, key: "consent" })),
  clearComputerUsePreference: jest.fn(() => ({
    ok: true,
    key: "consent",
    cleared: true,
  })),
  migrateLegacyComputerUse: jest.fn(() => ({ status: "complete" })),
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

  test("token-usage-append delegates payload.record", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
    );
    const record = { timestamp: 1, consumed_tokens: 5 };
    await expect(handler({}, { record })).resolves.toEqual({ ok: true, id: 1 });
    expect(service.appendTokenUsage).toHaveBeenCalledWith(record);

    // missing payload does not crash the handler wrapper
    await handler({});
    expect(service.appendTokenUsage).toHaveBeenLastCalledWith(undefined);
  });

  test("token-usage-query delegates payload.query", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
    );
    const query = { startMs: 1, endMs: 2, limit: 10, offset: 0 };
    await expect(handler({}, { query })).resolves.toEqual({
      ok: true,
      records: [],
    });
    expect(service.queryTokenUsage).toHaveBeenCalledWith(query);
  });

  test("token-usage-clear takes no payload", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
    );
    await expect(handler({})).resolves.toEqual({ ok: true, cleared: 0 });
    expect(service.clearTokenUsage).toHaveBeenCalledWith();
  });

  test("token-usage-migrate-legacy delegates the raw payload", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
    );
    const payload = { migrationVersion: 1, records: [] };
    await expect(handler({}, payload)).resolves.toEqual({
      status: "complete",
    });
    expect(service.migrateLegacyTokenUsage).toHaveBeenCalledWith(payload);
  });

  test("token usage handler failures log the code only (never record contents) and rethrow", async () => {
    const failure = new Error(
      "[invalid_token_usage_record] token usage record has no usable token counts",
    );
    failure.code = "invalid_token_usage_record";
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      appendTokenUsage: jest.fn(() => {
        throw failure;
      }),
      queryTokenUsage: jest.fn(() => {
        throw failure;
      }),
      clearTokenUsage: jest.fn(() => {
        throw failure;
      }),
      migrateLegacyTokenUsage: jest.fn(() => {
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
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND)(
          {},
          { record: { provider: "secret-record-content" } },
        ),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY)(
          {},
          { query: { startMs: "secret-query-content" } },
        ),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR)({}),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
        )({}, { records: [{ provider: "secret-record-content" }] }),
      ).rejects.toBe(failure);
      expect(warnSpy).toHaveBeenCalledTimes(4);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain("secret-record-content");
      expect(logged).not.toContain("secret-query-content");
      expect(logged).toContain("invalid_token_usage_record");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("toolkit-prefs read handlers take no payload and delegate", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    await expect(
      ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL)(
        {},
      ),
    ).resolves.toEqual({ ok: true, scopes: {} });
    expect(service.readDefaultToolkits).toHaveBeenCalledWith();

    await expect(
      ipcMain.getHandle(
        CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
      )({}),
    ).resolves.toEqual({ ok: true, toolkits: [], tools: [] });
    expect(service.readToolkitAutoApprove).toHaveBeenCalledWith();
  });

  test("default-toolkits-replace-scope unpacks { scopeKey, toolkitIds } positionally", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
    );
    await expect(
      handler({}, { scopeKey: "global", toolkitIds: ["core"] }),
    ).resolves.toEqual({ ok: true, scopeKey: "global", toolkitIds: [] });
    expect(service.replaceDefaultToolkitsScope).toHaveBeenCalledWith("global", [
      "core",
    ]);

    // missing payload does not crash the handler wrapper
    await handler({});
    expect(service.replaceDefaultToolkitsScope).toHaveBeenLastCalledWith(
      undefined,
      undefined,
    );
  });

  test("toolkit-auto-approve-replace-all delegates the raw payload", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const handler = ipcMain.getHandle(
      CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
    );
    const payload = {
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    };
    await expect(handler({}, payload)).resolves.toEqual({
      ok: true,
      toolkits: [],
      tools: [],
    });
    expect(service.replaceToolkitAutoApprove).toHaveBeenCalledWith(payload);
  });

  test("toolkit-prefs migrate handlers delegate the raw payload", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const defaultToolkitsPayload = { migrationVersion: 1, scopes: {} };
    await expect(
      ipcMain.getHandle(
        CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
      )({}, defaultToolkitsPayload),
    ).resolves.toEqual({ status: "complete" });
    expect(service.migrateLegacyDefaultToolkits).toHaveBeenCalledWith(
      defaultToolkitsPayload,
    );

    const autoApprovePayload = { migrationVersion: 1, toolkits: [], tools: [] };
    await expect(
      ipcMain.getHandle(
        CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
      )({}, autoApprovePayload),
    ).resolves.toEqual({ status: "complete" });
    expect(service.migrateLegacyToolkitAutoApprove).toHaveBeenCalledWith(
      autoApprovePayload,
    );
  });

  test("toolkit-prefs handler failures log the code only (never ids) and rethrow", async () => {
    const failure = new Error(
      "[invalid_toolkit_auto_approve_payload] toolkit-auto-approve: " +
        'field "toolkits" contains an invalid entry',
    );
    failure.code = "invalid_toolkit_auto_approve_payload";
    const throwing = jest.fn(() => {
      throw failure;
    });
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      readDefaultToolkits: throwing,
      replaceDefaultToolkitsScope: throwing,
      migrateLegacyDefaultToolkits: throwing,
      readToolkitAutoApprove: throwing,
      replaceToolkitAutoApprove: throwing,
      migrateLegacyToolkitAutoApprove: throwing,
    });
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL)(
          {},
        ),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
        )({}, { scopeKey: "secret-scope-key", toolkitIds: ["secret-id"] }),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
        )({}, { scopes: { "secret-scope-key": ["secret-id"] } }),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
        )({}),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
        )({}, { toolkits: ["secret-id"] }),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
        )({}, { toolkits: ["secret-id"], tools: [] }),
      ).rejects.toBe(failure);
      expect(warnSpy).toHaveBeenCalledTimes(6);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain("secret-scope-key");
      expect(logged).not.toContain("secret-id");
      expect(logged).toContain("invalid_toolkit_auto_approve_payload");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("computer-use read handler takes no payload and delegates", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    await expect(
      ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL)(
        {},
      ),
    ).resolves.toEqual({ ok: true, entries: {} });
    expect(service.readComputerUsePreferences).toHaveBeenCalledWith();
  });

  test("computer-use-set-key unpacks { key, value } positionally", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const value = { version: 1, acceptedAt: "2026-07-24T10:00:00.000Z" };
    await expect(
      ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY)(
        {},
        { key: "consent", value },
      ),
    ).resolves.toEqual({ ok: true, key: "consent" });
    expect(service.setComputerUsePreference).toHaveBeenCalledWith(
      "consent",
      value,
    );
  });

  test("computer-use-clear-key unpacks { key }", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    await expect(
      ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY)(
        {},
        { key: "consent" },
      ),
    ).resolves.toEqual({ ok: true, key: "consent", cleared: true });
    expect(service.clearComputerUsePreference).toHaveBeenCalledWith("consent");
  });

  test("computer-use-migrate-legacy delegates the raw payload", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const payload = { migrationVersion: 1, records: {} };
    await expect(
      ipcMain.getHandle(
        CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
      )({}, payload),
    ).resolves.toEqual({ status: "complete" });
    expect(service.migrateLegacyComputerUse).toHaveBeenCalledWith(payload);
  });

  test("computer-use handler failures log the code only (never record contents) and rethrow", async () => {
    const failure = new Error(
      '[invalid_computer_use_preference] computer-use: value for "consent" ' +
        "is not a valid preference record",
    );
    failure.code = "invalid_computer_use_preference";
    const throwing = jest.fn(() => {
      throw failure;
    });
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      readComputerUsePreferences: throwing,
      setComputerUsePreference: throwing,
      clearComputerUsePreference: throwing,
      migrateLegacyComputerUse: throwing,
    });
    registerSettingsStorageHandlers({
      ipcMain,
      settingsStorageService: service,
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
        )({}),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY)(
          {},
          {
            key: "consent",
            value: { version: 1, acceptedAt: "secret-timestamp" },
          },
        ),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
        )({}, { key: "consent" }),
      ).rejects.toBe(failure);
      await expect(
        ipcMain.getHandle(
          CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
        )({}, { records: { consent: { acceptedAt: "secret-timestamp" } } }),
      ).rejects.toBe(failure);
      expect(warnSpy).toHaveBeenCalledTimes(4);
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain("secret-timestamp");
      expect(logged).toContain("invalid_computer_use_preference");
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
      ].sort(),
    );
  });
});
