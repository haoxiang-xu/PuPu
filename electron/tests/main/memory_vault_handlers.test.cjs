const {
  registerMemoryVaultHandlers,
  MEMORY_VAULT_INVOKE_CHANNELS,
} = require("../../main/services/memory_vault/register_handlers");
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
    handleChannels: () => [...handleHandlers.keys()],
    onChannels: () => [...onHandlers.keys()],
  };
};

const makeFakeService = (overrides = {}) => ({
  deposit: jest.fn(() => ({
    ok: true,
    status: "stored",
    handle: `pvh1_${"a".repeat(64)}`,
  })),
  listDescriptors: jest.fn(() => ({ ok: true, descriptors: [] })),
  deleteSecret: jest.fn(() => ({
    ok: true,
    handle: `pvh1_${"a".repeat(64)}`,
    deleted: true,
    revokedGrants: 0,
  })),
  grant: jest.fn(() => ({
    ok: true,
    grantId: `pvg1_${"b".repeat(32)}`,
  })),
  revoke: jest.fn(() => ({
    ok: true,
    grantId: `pvg1_${"b".repeat(32)}`,
    revoked: true,
  })),
  getStatus: jest.fn(() => ({
    ok: true,
    available: true,
    secretStorageStatus: "available",
  })),
  ...overrides,
});

describe("memory vault IPC handlers", () => {
  test("throws on missing dependencies", () => {
    expect(() => registerMemoryVaultHandlers({})).toThrow(
      /missing dependencies/,
    );
    expect(() =>
      registerMemoryVaultHandlers({ ipcMain: makeFakeIpcMain() }),
    ).toThrow(/missing dependencies/);
  });

  test("registers exactly the six invoke channels and nothing else — no sync, no events", () => {
    const ipcMain = makeFakeIpcMain();
    registerMemoryVaultHandlers({
      ipcMain,
      memoryVaultService: makeFakeService(),
    });

    expect([...ipcMain.handleChannels()].sort()).toEqual(
      [...MEMORY_VAULT_INVOKE_CHANNELS].sort(),
    );
    expect(ipcMain.on).not.toHaveBeenCalled();
  });

  test("the channel group contains no read/resolve/decrypt surface (no plaintext-read IPC)", () => {
    const values = Object.values(CHANNELS.MEMORY_VAULT);
    expect(values).toHaveLength(6);
    expect([...MEMORY_VAULT_INVOKE_CHANNELS].sort()).toEqual([...values].sort());
    for (const channel of values) {
      expect(channel.startsWith("memory-vault:")).toBe(true);
      expect(channel).not.toMatch(/read|resolve|decrypt|reveal|export|plaintext/);
    }
    expect(Object.keys(CHANNELS.MEMORY_VAULT).sort()).toEqual([
      "DELETE",
      "DEPOSIT",
      "GET_STATUS",
      "GRANT",
      "LIST_DESCRIPTORS",
      "REVOKE",
    ]);
  });

  test("the sink executor / broker control plane is NEVER reachable from the renderer", () => {
    // Registering an executor means "this function may receive decrypted
    // plaintext", and starting the broker opens an authenticated loopback
    // listener. Both are main-process-only: no channel, no handler, no bridge.
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      configureSinkExecutors: jest.fn(),
      startSinkBroker: jest.fn(),
      stopSinkBroker: jest.fn(),
      getSinkBrokerBootstrap: jest.fn(),
      executeUseIntent: jest.fn(),
      prepareUseIntent: jest.fn(),
    });
    registerMemoryVaultHandlers({ ipcMain, memoryVaultService: service });

    expect(service.configureSinkExecutors).not.toHaveBeenCalled();
    expect(service.startSinkBroker).not.toHaveBeenCalled();
    expect(service.getSinkBrokerBootstrap).not.toHaveBeenCalled();

    for (const channel of [
      ...ipcMain.handleChannels(),
      ...ipcMain.onChannels(),
      ...Object.values(CHANNELS.MEMORY_VAULT),
    ]) {
      expect(channel).not.toMatch(
        /configure|executor|sink|broker|intent|worker/i,
      );
    }

    // Every registered handler body must be free of these method names too —
    // a handler cannot reach them by any indirection.
    const source = require("fs").readFileSync(
      require("path").join(
        __dirname,
        "../../main/services/memory_vault/register_handlers.js",
      ),
      "utf8",
    );
    for (const method of [
      "configureSinkExecutors",
      "startSinkBroker",
      "stopSinkBroker",
      "getSinkBrokerBootstrap",
      "executeUseIntent",
      "prepareUseIntent",
      "cancelUseIntent",
      "bindPreparedUseIntent",
      "confirmBoundUseIntent",
    ]) {
      expect(source).not.toContain(method);
    }
  });

  test("handlers delegate payloads verbatim and return the service result", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService();
    registerMemoryVaultHandlers({ ipcMain, memoryVaultService: service });

    const depositPayload = {
      operationId: "op-1234567",
      scopeKind: "chat",
      scopeId: "chat-1",
      label: "k",
      plaintext: "v",
    };
    await expect(
      ipcMain.getHandle(CHANNELS.MEMORY_VAULT.DEPOSIT)({}, depositPayload),
    ).resolves.toEqual(service.deposit.mock.results[0].value);
    expect(service.deposit).toHaveBeenCalledWith(depositPayload);

    await ipcMain.getHandle(CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS)(
      {},
      { scopeKind: "chat", scopeId: "chat-1" },
    );
    expect(service.listDescriptors).toHaveBeenCalledWith({
      scopeKind: "chat",
      scopeId: "chat-1",
    });

    await ipcMain.getHandle(CHANNELS.MEMORY_VAULT.DELETE)(
      {},
      { operationId: "op-1234567", handle: "h" },
    );
    expect(service.deleteSecret).toHaveBeenCalledWith({
      operationId: "op-1234567",
      handle: "h",
    });

    const grantPayload = {
      operationId: "op-1234567",
      scopeKind: "chat",
      scopeId: "chat-1",
      handle: "h",
      sinkKind: "computer_input",
    };
    await ipcMain.getHandle(CHANNELS.MEMORY_VAULT.GRANT)({}, grantPayload);
    // The handler is a pure conduit: the service (not the handler) owns the
    // scope/sink gating, so the payload must arrive verbatim and unmodified.
    expect(service.grant).toHaveBeenCalledWith(grantPayload);

    await ipcMain.getHandle(CHANNELS.MEMORY_VAULT.REVOKE)(
      {},
      { operationId: "op-1234567", grantId: "g" },
    );
    expect(service.revoke).toHaveBeenCalled();

    await expect(
      ipcMain.getHandle(CHANNELS.MEMORY_VAULT.GET_STATUS)({}),
    ).resolves.toMatchObject({ ok: true, available: true });
  });

  test("failure logs carry the operation name + stable code ONLY — never the payload, never error.message", async () => {
    const ipcMain = makeFakeIpcMain();
    const secretMarker = "sk-LEAKED-SECRET-VALUE";
    const error = new Error(`[invalid_label] boom ${secretMarker}`);
    error.code = "invalid_label";
    const service = makeFakeService({
      deposit: jest.fn(() => {
        throw error;
      }),
    });
    registerMemoryVaultHandlers({ ipcMain, memoryVaultService: service });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        ipcMain.getHandle(CHANNELS.MEMORY_VAULT.DEPOSIT)(
          {},
          { plaintext: secretMarker, label: secretMarker },
        ),
      ).rejects.toThrow(/invalid_label/);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const loggedText = warnSpy.mock.calls[0]
        .map((arg) => String(arg))
        .join(" ");
      expect(loggedText).toContain("invalid_label");
      expect(loggedText).not.toContain(secretMarker);
      expect(loggedText).not.toContain("boom");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("an uncoded throw logs the stable placeholder, never its message", async () => {
    const ipcMain = makeFakeIpcMain();
    const service = makeFakeService({
      grant: jest.fn(() => {
        throw new Error("raw sqlite text with sk-user-value");
      }),
    });
    registerMemoryVaultHandlers({ ipcMain, memoryVaultService: service });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        ipcMain.getHandle(CHANNELS.MEMORY_VAULT.GRANT)({}, {}),
      ).rejects.toThrow();
      const loggedText = warnSpy.mock.calls[0]
        .map((arg) => String(arg))
        .join(" ");
      expect(loggedText).toContain("uncoded_error");
      expect(loggedText).not.toContain("sk-user-value");
    } finally {
      warnSpy.mockRestore();
    }
  });
});
