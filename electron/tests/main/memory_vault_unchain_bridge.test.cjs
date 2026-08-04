const path = require("path");
const { EventEmitter } = require("events");
const { CHANNELS } = require("../../shared/channels");
const {
  createUnchainService,
} = require("../../main/services/unchain/service");

const runtimeContract = () => ({
  schema: "pupu.runtime-capabilities",
  version: 1,
  capabilities: {
    runtime_events_v4: true,
    execution_fencing: true,
    durable_interactions: true,
    exact_cancellation: true,
    durable_jobs: { version: "D4.1", available: true, reason: "" },
    automatic_wake_resume: false,
  },
  reasons: {},
});

const healthResponse = () => ({
  ok: true,
  json: async () => ({ status: "ok", contract: runtimeContract() }),
});

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

const createAvailableNet = () => ({
  createServer() {
    const listeners = new Map();
    return {
      unref() {},
      once(event, callback) {
        listeners.set(event, callback);
      },
      listen() {
        listeners.get("listening")?.();
      },
      close(callback) {
        callback?.();
      },
    };
  },
});

const createFakeProcess = ({ withBootstrapPipe = true } = {}) => {
  const processHandle = new EventEmitter();
  processHandle.stdout = new EventEmitter();
  processHandle.stderr = new EventEmitter();
  processHandle.pid = 5001;
  processHandle.killed = false;
  processHandle.kill = jest.fn(() => {
    processHandle.killed = true;
  });
  const bootstrapPipe = new EventEmitter();
  bootstrapPipe.end = jest.fn();
  processHandle.stdio = withBootstrapPipe
    ? [null, processHandle.stdout, processHandle.stderr, bootstrapPipe]
    : [null, processHandle.stdout, processHandle.stderr];
  return { processHandle, bootstrapPipe };
};

describe("Vault broker ↔ Unchain main-process bridge", () => {
  const originalFetch = global.fetch;
  const originalPython = process.env.UNCHAIN_PYTHON_BIN;
  const originalUrl = process.env.PUPU_VAULT_BROKER_URL;
  const originalKey = process.env.PUPU_VAULT_BROKER_KEY;
  const originalFd = process.env.PUPU_VAULT_BROKER_FD;

  afterEach(() => {
    global.fetch = originalFetch;
    const restore = (name, value) => {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    };
    restore("UNCHAIN_PYTHON_BIN", originalPython);
    restore("PUPU_VAULT_BROKER_URL", originalUrl);
    restore("PUPU_VAULT_BROKER_KEY", originalKey);
    restore("PUPU_VAULT_BROKER_FD", originalFd);
    jest.clearAllMocks();
  });

  const buildService = ({
    memoryVaultService,
    withBootstrapPipe = true,
    logTarget,
  } = {}) => {
    process.env.UNCHAIN_PYTHON_BIN = "/usr/bin/python3.12";
    const { processHandle, bootstrapPipe } = createFakeProcess({
      withBootstrapPipe,
    });
    const spawn = jest.fn(() => processHandle);
    const service = createUnchainService({
      app: {
        isPackaged: false,
        getAppPath: jest.fn(() => "/app"),
        getPath: jest.fn(() => "/tmp/pupu"),
        getVersion: jest.fn(() => "0.1.1"),
      },
      fs: { existsSync: jest.fn(() => true) },
      path,
      spawn,
      spawnSync: jest.fn(() => ({
        status: 0,
        stdout: JSON.stringify({
          version: "3.12.2",
          major: 3,
          minor: 12,
          missing: [],
        }),
      })),
      crypto: {
        randomBytes: jest.fn(() => ({ toString: () => "auth-token-123" })),
      },
      net: createAvailableNet(),
      webContents: {
        fromId: jest.fn(() => null),
        getAllWebContents: jest.fn(() => (logTarget ? [logTarget] : [])),
      },
      runtimeService: {},
      memoryVaultService,
      getAppIsQuitting: () => false,
    });
    return { service, spawn, processHandle, bootstrapPipe };
  };

  test("delivers the random key once on FD 3, never through inherited env or runtime logs", async () => {
    const brokerKey = "a".repeat(64);
    process.env.PUPU_VAULT_BROKER_URL = "http://attacker.invalid:1";
    process.env.PUPU_VAULT_BROKER_KEY = "ambient-secret";
    process.env.PUPU_VAULT_BROKER_FD = "99";
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => ({
        url: "http://127.0.0.1:45678",
        key: brokerKey,
      })),
      stopSinkBroker: jest.fn(async () => {}),
    };
    const logTarget = {
      isDestroyed: jest.fn(() => false),
      getType: jest.fn(() => "window"),
      send: jest.fn(),
    };
    const { service, spawn, processHandle, bootstrapPipe } = buildService({
      memoryVaultService,
      logTarget,
    });
    global.fetch = jest.fn().mockResolvedValueOnce(healthResponse());
    await service.startMiso();

    const options = spawn.mock.calls[0][2];
    expect(options.stdio).toEqual(["ignore", "pipe", "pipe", "pipe"]);
    expect(options.env.PUPU_VAULT_BROKER_URL).toBe(
      "http://127.0.0.1:45678",
    );
    expect(options.env.PUPU_VAULT_BROKER_FD).toBe("3");
    expect(options.env.PUPU_VAULT_BROKER_KEY).toBeUndefined();
    expect(JSON.stringify(options.env)).not.toContain(brokerKey);
    expect(bootstrapPipe.end).toHaveBeenCalledTimes(1);
    expect(bootstrapPipe.end).toHaveBeenCalledWith(`${brokerKey}\n`);

    processHandle.stdout.emit("data", Buffer.from(`${brokerKey}\n`, "utf8"));
    const runtimeLog = logTarget.send.mock.calls.find(
      (call) => call[0] === CHANNELS.UNCHAIN.RUNTIME_LOG,
    );
    expect(runtimeLog[1].text).toBe("[REDACTED_VAULT_BROKER_KEY]");
    expect(JSON.stringify(logTarget.send.mock.calls)).not.toContain(brokerKey);
  });

  test("a bootstrap pipe error stops both sidecar and broker", async () => {
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => ({
        url: "http://127.0.0.1:45678",
        key: "b".repeat(64),
      })),
      stopSinkBroker: jest.fn(async () => {}),
    };
    const { service, processHandle, bootstrapPipe } = buildService({
      memoryVaultService,
    });
    global.fetch = jest.fn().mockResolvedValueOnce(healthResponse());
    await service.startMiso();
    bootstrapPipe.emit("error", new Error("pipe failed"));
    expect(processHandle.kill).toHaveBeenCalledWith("SIGTERM");
    expect(memoryVaultService.stopSinkBroker).toHaveBeenCalledTimes(1);
  });

  test("missing FD 3 fails closed before health admission", async () => {
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => ({
        url: "http://127.0.0.1:45678",
        key: "c".repeat(64),
      })),
      stopSinkBroker: jest.fn(async () => {}),
    };
    const { service, processHandle } = buildService({
      memoryVaultService,
      withBootstrapPipe: false,
    });
    global.fetch = jest.fn();
    await service.startMiso();
    expect(processHandle.kill).toHaveBeenCalledWith("SIGTERM");
    expect(memoryVaultService.stopSinkBroker).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("bound Vault confirmation rejects modified_arguments before native confirmation or sidecar forward", async () => {
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => null),
      isBoundUseInteraction: jest.fn(() => true),
      confirmBoundUseIntent: jest.fn(async () => ({
        handled: true,
        approved: true,
      })),
    };
    const { service } = buildService({ memoryVaultService });
    global.fetch = jest.fn().mockResolvedValueOnce(healthResponse());
    await service.startMiso();
    await expect(
      service.submitMisoToolConfirmation({
        confirmation_id: "interaction-vault-1",
        approved: true,
        modified_arguments: { value: "forbidden" },
      }),
    ).rejects.toMatchObject({ code: "vault_modified_arguments_forbidden" });
    expect(memoryVaultService.confirmBoundUseIntent).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("native decision overrides renderer auto-approval and forwards no modified_arguments", async () => {
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => null),
      isBoundUseInteraction: jest.fn(() => true),
      confirmBoundUseIntent: jest.fn(async () => ({
        handled: true,
        approved: false,
      })),
    };
    const { service } = buildService({ memoryVaultService });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));
    await service.startMiso();
    await service.submitMisoToolConfirmation({
      confirmation_id: "interaction-vault-2",
      approved: true,
      reason: "",
      session_id: "session-2",
    });
    const forwarded = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(forwarded).toEqual({
      confirmation_id: "interaction-vault-2",
      approved: false,
      reason: "vault_native_confirmation_denied",
      session_id: "session-2",
    });
  });

  test("pending-interaction recovery binds arguments.vault_use before returning", async () => {
    const vaultUse = {
      intent_id: `pvi1_${"d".repeat(32)}`,
      operation_id: "vault-operation-recovery",
      owner_chat_id: "chat-recovery",
      session_id: "session-recovery",
      attempt_id: "attempt-recovery",
      run_id: "run-recovery",
      call_id: "call-recovery",
    };
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => null),
      bindPreparedUseIntent: jest.fn(() => ({ bound: true })),
    };
    const pending = {
      status: "pending",
      interaction_id: "interaction-recovery",
      presentation: {
        tool_call: {
          confirmation_id: "interaction-recovery",
          arguments: { vault_use: vaultUse },
        },
      },
    };
    const { service } = buildService({ memoryVaultService });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce(jsonResponse(pending));
    await service.startMiso();
    await expect(
      service.getMisoPendingInteraction({ session_id: "session-recovery" }),
    ).resolves.toEqual(pending);
    expect(memoryVaultService.bindPreparedUseIntent).toHaveBeenCalledWith({
      ...vaultUse,
      interaction_id: "interaction-recovery",
    });
  });

  test("pending recovery binding failure returns only a static vault error", async () => {
    const memoryVaultService = {
      getSinkBrokerBootstrap: jest.fn(() => null),
      bindPreparedUseIntent: jest.fn(() => {
        throw new Error("SECRET SHOULD NOT CROSS");
      }),
    };
    const pending = {
      status: "pending",
      interaction_id: "interaction-recovery",
      presentation: {
        tool_call: {
          arguments: {
            vault_use: {
              intent_id: `pvi1_${"e".repeat(32)}`,
              operation_id: "vault-operation-recovery",
              owner_chat_id: "chat-recovery",
              session_id: "session-recovery",
              attempt_id: "attempt-recovery",
              run_id: "run-recovery",
              call_id: "call-recovery",
            },
          },
        },
      },
    };
    const { service } = buildService({ memoryVaultService });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(healthResponse())
      .mockResolvedValueOnce(jsonResponse(pending));
    await service.startMiso();
    await expect(
      service.getMisoPendingInteraction({ session_id: "session-recovery" }),
    ).rejects.toMatchObject({
      code: "vault_intent_binding_failed",
      message:
        "[vault_intent_binding_failed] vault interaction binding failed",
    });
  });
});
