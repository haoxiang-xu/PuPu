const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch (_error) {
  sqlite = null;
}
if (!sqlite && typeof process.getBuiltinModule === "function") {
  try {
    sqlite = process.getBuiltinModule("node:sqlite");
  } catch (_error) {
    sqlite = null;
  }
}

const describeIfSqlite = sqlite ? describe : describe.skip;
const {
  createMemoryVaultService,
  USE_INTENT_ID_PATTERN,
  USE_RECEIPT_ID_PATTERN,
} = require("../../main/services/memory_vault/service");

const SECRET_A = "vault-secret-alpha";
const SECRET_B = "vault-secret-beta";
const SINK_KIND = "shell_secret_env";
const hash = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");
const op = (suffix) => `vault-operation-${suffix}`;
const fakeApp = (dir) => ({
  getPath: (key) => {
    if (key === "userData") return dir;
    throw new Error("unexpected path key");
  },
});

const encodeSecret = (plaintext) => {
  const bytes = Buffer.from(plaintext, "utf8");
  const output = Buffer.alloc(bytes.length + 4);
  Buffer.from("ENC:").copy(output);
  for (let index = 0; index < bytes.length; index += 1) {
    output[index + 4] = bytes[index] ^ 0x5a;
  }
  return output;
};
const decodeSecret = (ciphertext) => {
  const bytes = Buffer.from(ciphertext).subarray(4);
  const output = Buffer.alloc(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes[index] ^ 0x5a;
  }
  return output.toString("utf8");
};
const makeSafeStorage = (overrides = {}) => ({
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn(encodeSecret),
  decryptString: jest.fn(decodeSecret),
  ...overrides,
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const providerFor = (execute) =>
  Object.freeze({
    prepare: jest.fn(async () =>
      Object.freeze({
        execute,
        abort: jest.fn(() => true),
        awaitDrained: jest.fn(async () => {}),
      }),
    ),
  });

const expectCode = async (run, code) => {
  let caught = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).not.toBeNull();
  expect(caught.code).toBe(code);
  return caught;
};

const preparePayload = (overrides = {}) => ({
  version: 1,
  operation_id: op("prepare-a"),
  owner_chat_id: "chat-42",
  session_id: "session-42",
  attempt_id: "attempt-42",
  run_id: "run-42",
  call_id: "call-42",
  sink_kind: SINK_KIND,
  handles: [],
  audit_arguments: { target: "API_TOKEN", command_preview: "tool" },
  target_hash: hash("target"),
  schema_fingerprint: hash("schema"),
  ...overrides,
});

const bindingPayload = (prepared, identity, interactionId = "interaction-42") => ({
  intent_id: prepared.intent_id,
  interaction_id: interactionId,
  operation_id: identity.operation_id,
  owner_chat_id: identity.owner_chat_id,
  session_id: identity.session_id,
  attempt_id: identity.attempt_id,
  run_id: identity.run_id,
  call_id: identity.call_id,
});

const executePayload = (prepared, identity, interactionId = "interaction-42") => ({
  ...identity,
  operation_id: op("execute-a"),
  intent_id: prepared.intent_id,
  interaction_id: interactionId,
});

describeIfSqlite("memory vault one-time use state machine", () => {
  let dir;
  let services;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-vault-use-"));
    services = [];
  });

  afterEach(async () => {
    for (const service of services) {
      try {
        await service.stopSinkBroker();
        service.close();
      } catch (_error) {
        // already closed
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const makeVault = ({ safeStorage, confirmUse, sinkExecutors } = {}) => {
    const service = createMemoryVaultService({
      app: fakeApp(dir),
      path,
      sqlite,
      safeStorage: safeStorage || makeSafeStorage(),
      confirmUse,
      sinkExecutors,
      http: require("http"),
    });
    service.init();
    services.push(service);
    return service;
  };

  const seed = (
    vault,
    {
      suffix = "a",
      plaintext = SECRET_A,
      label = "Primary token",
      scopeKind = "chat",
      scopeId = "chat-42",
      sinkKind = SINK_KIND,
      grant = true,
    } = {},
  ) => {
    const stored = vault.deposit({
      operationId: op(`deposit-${suffix}`),
      scopeKind,
      scopeId,
      label,
      plaintext,
    });
    if (grant) {
      vault.grant({
        operationId: op(`grant-${suffix}`),
        scopeKind,
        scopeId,
        handle: stored.handle,
        sinkKind,
      });
    }
    return stored;
  };

  const rawDb = () =>
    new sqlite.DatabaseSync(path.join(dir, "settings.db"));

  test("prepare generates the intent and resolves scope/grant internally", () => {
    const vault = makeVault();
    const stored = seed(vault, { grant: false });
    const identity = preparePayload({
      handles: [{ field: "secret_env.API_TOKEN", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);

    expect(USE_INTENT_ID_PATTERN.test(prepared.intent_id)).toBe(true);
    expect(prepared.status).toBe("pending_confirmation");
    expect(prepared.descriptor).toEqual({
      label: "Primary token",
      sink_kind: SINK_KIND,
      target: "API_TOKEN",
    });
    expect(prepared.replayed).toBe(false);
    expect(JSON.stringify(prepared)).not.toContain(stored.handle);
    expect(JSON.stringify(prepared)).not.toContain(SECRET_A);

    const replay = vault.prepareUseIntent(identity);
    expect(replay.intent_id).toBe(prepared.intent_id);
    expect(replay.replayed).toBe(true);
    expectCode(
      () =>
        vault.prepareUseIntent({
          ...identity,
          target_hash: hash("changed-target"),
        }),
      "vault_intent_conflict",
    );
  });

  test("prepare rejects caller-selected intent/scope, while first native approval creates the sink grant", async () => {
    const vault = makeVault();
    const chatSecret = seed(vault);
    const globalSecret = seed(vault, {
      suffix: "global",
      scopeKind: "user",
      scopeId: "local",
      label: "Global token",
    });
    const otherChatSecret = seed(vault, {
      suffix: "other",
      scopeId: "chat-other",
    });
    const ungranted = seed(vault, { suffix: "ungranted", grant: false });

    const allowed = vault.prepareUseIntent(
      preparePayload({
        handles: [
          { field: "chat", handle: chatSecret.handle },
          { field: "global", handle: globalSecret.handle },
        ],
      }),
    );
    expect(allowed.status).toBe("pending_confirmation");

    await expectCode(
      () =>
        vault.prepareUseIntent({
          ...preparePayload({
            operation_id: op("caller-intent"),
            handles: [{ field: "x", handle: chatSecret.handle }],
          }),
          intent_id: `pvi1_${"a".repeat(32)}`,
        }),
      "invalid_vault_use_request",
    );
    await expectCode(
      () =>
        vault.prepareUseIntent(
          preparePayload({
            operation_id: op("wrong-scope"),
            handles: [{ field: "x", handle: otherChatSecret.handle }],
          }),
        ),
      "vault_secret_unavailable",
    );
    const captured = vault.prepareUseIntent(
      preparePayload({
        operation_id: op("no-pregrant"),
        handles: [{ field: "x", handle: ungranted.handle }],
      }),
    );
    expect(captured.status).toBe("pending_confirmation");
  });

  test("binding is full-identity CAS and renderer auto-approval still needs native confirmation", async () => {
    const confirmUse = jest.fn(async () => true);
    const vault = makeVault({ confirmUse });
    const stored = seed(vault, { grant: false });
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    expect(vault.bindPreparedUseIntent(binding)).toEqual({
      handled: true,
      bound: true,
      replayed: false,
    });
    expect(vault.bindPreparedUseIntent(binding).replayed).toBe(true);
    await expectCode(
      () =>
        vault.bindPreparedUseIntent({
          ...binding,
          call_id: "call-other",
        }),
      "vault_intent_conflict",
    );

    const decision = await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    expect(decision).toEqual({
      handled: true,
      approved: true,
      status: "approved",
    });
    expect(confirmUse).toHaveBeenCalledTimes(1);
    expect(confirmUse).toHaveBeenCalledWith({
      label: "Primary token",
      sinkKind: SINK_KIND,
      target: "API_TOKEN",
    });
    const db = rawDb();
    expect(
      Number(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM vault_grants WHERE handle = ? AND sink_kind = ?",
          )
          .get(stored.handle, SINK_KIND).count,
      ),
    ).toBe(1);
    db.close();

    const replay = await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    expect(replay.approved).toBe(true);
    expect(confirmUse).toHaveBeenCalledTimes(1);
  });

  test("renderer denial records denied without opening a native prompt", async () => {
    const confirmUse = jest.fn(async () => true);
    const vault = makeVault({ confirmUse });
    const stored = seed(vault, { grant: false });
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    const decision = await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: false,
    });
    expect(decision).toEqual({
      handled: true,
      approved: false,
      status: "denied",
    });
    expect(confirmUse).not.toHaveBeenCalled();
    const db = rawDb();
    expect(
      Number(
        db
          .prepare("SELECT COUNT(*) AS count FROM vault_grants WHERE handle = ?")
          .get(stored.handle).count,
      ),
    ).toBe(0);
    db.close();
  });

  test("execute resolves multiple secrets only inside the injected sink and returns a safe replayable receipt", async () => {
    let echoedHandle = "";
    const executor = jest.fn(async () => ({
      unsafe: SECRET_A,
      nested: {
        encoded: Buffer.from(SECRET_A, "utf8").toString("base64"),
        handle: echoedHandle,
        binary: Buffer.from(SECRET_B, "utf8"),
      },
    }));
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: providerFor(executor) },
    });
    const first = seed(vault);
    const second = seed(vault, {
      suffix: "b",
      plaintext: SECRET_B,
      label: "Secondary token",
    });
    echoedHandle = first.handle;
    const identity = preparePayload({
      handles: [
        { field: "secret_env.A", handle: first.handle },
        { field: "secret_env.B", handle: second.handle },
      ],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });

    const response = await vault.executeUseIntent(
      executePayload(prepared, identity),
    );
    expect(response.status).toBe("complete");
    expect(USE_RECEIPT_ID_PATTERN.test(response.receipt_id)).toBe(true);
    expect(response.result).toEqual({
      unsafe: "[REDACTED]",
      nested: {
        encoded: "[REDACTED]",
        handle: "[REDACTED]",
        binary: { redacted: true, reason: "binary_result" },
      },
    });
    expect(JSON.stringify(response)).not.toContain(SECRET_A);
    expect(JSON.stringify(response)).not.toContain(SECRET_B);
    expect(JSON.stringify(response)).not.toContain(first.handle);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0][0].secrets).toEqual([
      { field: "secret_env.A", plaintext: SECRET_A },
      { field: "secret_env.B", plaintext: SECRET_B },
    ]);

    const replay = await vault.executeUseIntent(
      executePayload(prepared, identity),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.receipt_id).toBe(response.receipt_id);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(safeStorage.decryptString).toHaveBeenCalledTimes(2);
    await expectCode(
      () =>
        vault.executeUseIntent({
          ...executePayload(prepared, identity),
          operation_id: op("execute-conflict"),
        }),
      "vault_intent_conflict",
    );
  });

  test("oversized executor output is replaced by a bounded static result", async () => {
    const executor = jest.fn(async () => ({ data: "x".repeat(40 * 1024) }));
    const vault = makeVault({
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: providerFor(executor) },
    });
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    const response = await vault.executeUseIntent(
      executePayload(prepared, identity),
    );
    expect(response.result).toEqual({
      redacted: true,
      reason: "result_safety_limit",
    });
    expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeLessThan(
      32 * 1024,
    );
  });

  test("missing executor fails closed while keeping approval retryable and never decrypting", async () => {
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: {},
    });
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    await expectCode(
      () => vault.executeUseIntent(executePayload(prepared, identity)),
      "vault_sink_unavailable",
    );
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
    const db = rawDb();
    expect(
      db
        .prepare("SELECT status FROM vault_use_intents WHERE intent_id = ?")
        .get(prepared.intent_id).status,
    ).toBe("approved");
    db.close();
  });

  test("an unregistered computer sink fails before decrypting", async () => {
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: providerFor(async () => ({})) },
    });
    const stored = seed(vault, { sinkKind: "computer_input" });
    const identity = preparePayload({
      handles: [{ field: "text", handle: stored.handle }],
      sink_kind: "computer_input",
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });

    await expectCode(
      () => vault.executeUseIntent(executePayload(prepared, identity)),
      "vault_sink_unavailable",
    );
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
  });

  test("executor prepare must reach READY before CAS or decrypt", async () => {
    const ready = deferred();
    const prepare = jest.fn(() => ready.promise);
    const provider = Object.freeze({ prepare });
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: provider },
    });
    const { prepared, identity } = await approvedIntent(vault);

    const execution = vault.executeUseIntent(executePayload(prepared, identity));
    await Promise.resolve();
    await Promise.resolve();

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith({ sinkKind: SINK_KIND });
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
    const db = rawDb();
    expect(
      db
        .prepare("SELECT status FROM vault_use_intents WHERE intent_id = ?")
        .get(prepared.intent_id).status,
    ).toBe("approved");

    ready.resolve(Object.freeze({
      execute: async () => ({ accepted: true }),
      abort: () => {},
      awaitDrained: async () => {},
    }));
    await execution;
    db.close();
  });

  test("prepare rejection leaves the durable intent approved and never decrypts", async () => {
    const prepare = jest.fn(async () => {
      const error = new Error(`unsafe ${SECRET_A}`);
      error.code = "vault_worker_spawn_failed";
      throw error;
    });
    const provider = Object.freeze({ prepare });
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: provider },
    });
    const { prepared, identity } = await approvedIntent(vault);

    const error = await expectCode(
      () => vault.executeUseIntent(executePayload(prepared, identity)),
      "vault_worker_spawn_failed",
    );

    expect(error.message).not.toContain(SECRET_A);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
    const db = rawDb();
    expect(
      db
        .prepare("SELECT status FROM vault_use_intents WHERE intent_id = ?")
        .get(prepared.intent_id).status,
    ).toBe("approved");
    expect(
      db
        .prepare("SELECT execute_operation_id FROM vault_use_intents WHERE intent_id = ?")
        .get(prepared.intent_id).execute_operation_id,
    ).toBeNull();
    db.close();
  });

  test("concurrent replay of one operation shares exactly one prepared lease", async () => {
    const ready = deferred();
    const execute = jest.fn(async () => ({ accepted: true }));
    const abort = jest.fn(() => true);
    const awaitDrained = jest.fn(async () => {});
    const provider = Object.freeze({
      prepare: jest.fn(() => ready.promise),
    });
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: provider },
    });
    const { prepared, identity } = await approvedIntent(vault);
    const payload = executePayload(prepared, identity);

    const first = vault.executeUseIntent(payload);
    const replay = vault.executeUseIntent(payload);
    await Promise.resolve();
    expect(provider.prepare).toHaveBeenCalledTimes(1);
    expect(safeStorage.decryptString).not.toHaveBeenCalled();

    ready.resolve(Object.freeze({ execute, abort, awaitDrained }));
    const [firstResult, replayResult] = await Promise.all([first, replay]);
    expect(replayResult).toEqual(firstResult);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(safeStorage.decryptString).toHaveBeenCalledTimes(1);
    expect(awaitDrained).toHaveBeenCalledTimes(1);
  });

  test("a different operation conflicts while prepare is pending", async () => {
    const ready = deferred();
    const execute = jest.fn(async () => ({ accepted: true }));
    const provider = Object.freeze({
      prepare: jest.fn(() => ready.promise),
    });
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: provider },
    });
    const { prepared, identity } = await approvedIntent(vault);
    const execution = vault.executeUseIntent(executePayload(prepared, identity));

    await expectCode(
      () =>
        vault.executeUseIntent({
          ...executePayload(prepared, identity),
          operation_id: op("execute-other"),
        }),
      "vault_intent_conflict",
    );
    expect(provider.prepare).toHaveBeenCalledTimes(1);
    expect(safeStorage.decryptString).not.toHaveBeenCalled();

    ready.resolve(
      Object.freeze({
        execute,
        abort: jest.fn(() => true),
        awaitDrained: jest.fn(async () => {}),
      }),
    );
    await execution;
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("cancellation during prepare wins without decrypting or becoming indeterminate", async () => {
    const ready = deferred();
    const execute = jest.fn(async () => ({ accepted: true }));
    const abort = jest.fn(() => true);
    const awaitDrained = jest.fn(async () => {});
    const provider = Object.freeze({
      prepare: jest.fn(() => ready.promise),
    });
    const safeStorage = makeSafeStorage();
    const vault = makeVault({
      safeStorage,
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: provider },
    });
    const { prepared, identity } = await approvedIntent(vault);
    const execution = vault.executeUseIntent(executePayload(prepared, identity));
    await Promise.resolve();

    const cancelled = vault.cancelUseIntent({
      version: 1,
      operation_id: op("cancel-during-prepare"),
      intent_id: prepared.intent_id,
      owner_chat_id: identity.owner_chat_id,
      session_id: identity.session_id,
      attempt_id: identity.attempt_id,
      run_id: identity.run_id,
      call_id: identity.call_id,
      interaction_id: "interaction-42",
      reason_code: "run_cancelled",
    });
    expect(cancelled.status).toBe("cancelled");

    ready.resolve(Object.freeze({ execute, abort, awaitDrained }));
    await expect(execution).rejects.toMatchObject({
      code: "vault_intent_conflict",
    });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(awaitDrained).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
    const db = rawDb();
    expect(
      db
        .prepare("SELECT status FROM vault_use_intents WHERE intent_id = ?")
        .get(prepared.intent_id).status,
    ).toBe("cancelled");
    db.close();
  });

  test("executor failure becomes durable indeterminate and is never replayed", async () => {
    const executor = jest.fn(async () => {
      throw new Error(`unsafe ${SECRET_A}`);
    });
    const vault = makeVault({
      confirmUse: async () => true,
      sinkExecutors: { [SINK_KIND]: providerFor(executor) },
    });
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });

    await expectCode(
      () => vault.executeUseIntent(executePayload(prepared, identity)),
      "vault_use_indeterminate",
    );
    await expectCode(
      () => vault.executeUseIntent(executePayload(prepared, identity)),
      "vault_use_indeterminate",
    );
    expect(executor).toHaveBeenCalledTimes(1);
    const db = rawDb();
    const receipt = db
      .prepare("SELECT status, outcome_code FROM vault_use_receipts WHERE intent_id = ?")
      .get(prepared.intent_id);
    expect(receipt).toEqual({
      status: "indeterminate",
      outcome_code: "execution_indeterminate",
    });
    db.close();
  });

  test("startup converts a crash-left executing intent to indeterminate", async () => {
    const vault = makeVault({ confirmUse: async () => true });
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    const db = rawDb();
    db.prepare(
      "UPDATE vault_use_intents SET status = 'executing' WHERE intent_id = ?",
    ).run(prepared.intent_id);
    db.close();
    vault.close();

    const reopened = makeVault();
    const reopenedDb = rawDb();
    const intent = reopenedDb
      .prepare("SELECT status FROM vault_use_intents WHERE intent_id = ?")
      .get(prepared.intent_id);
    const receipt = reopenedDb
      .prepare("SELECT status, outcome_code FROM vault_use_receipts WHERE intent_id = ?")
      .get(prepared.intent_id);
    expect(intent.status).toBe("indeterminate");
    expect(receipt).toEqual({
      status: "indeterminate",
      outcome_code: "process_recovery_indeterminate",
    });
    reopenedDb.close();
    reopened.close();
  });

  test("cancel is strictly interaction-bound and idempotently records a safe receipt", async () => {
    const vault = makeVault();
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    const cancellation = {
      version: 1,
      operation_id: op("cancel-a"),
      intent_id: prepared.intent_id,
      owner_chat_id: identity.owner_chat_id,
      session_id: identity.session_id,
      attempt_id: identity.attempt_id,
      run_id: identity.run_id,
      call_id: identity.call_id,
      interaction_id: binding.interaction_id,
      reason_code: "run_cancelled",
    };
    await expectCode(
      () =>
        vault.cancelUseIntent({
          ...cancellation,
          interaction_id: "interaction-other",
        }),
      "vault_intent_conflict",
    );
    const cancelled = vault.cancelUseIntent(cancellation);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.result).toEqual({});
    const replay = vault.cancelUseIntent(cancellation);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt_id).toBe(cancelled.receipt_id);
  });

  test("chat deletion atomically removes only use state and is naturally idempotent", async () => {
    const vault = makeVault({
      confirmUse: async () => true,
      sinkExecutors: {
        [SINK_KIND]: providerFor(async () => ({ accepted: true })),
      },
    });
    const deletedChatSecret = seed(vault);
    const retainedChatSecret = seed(vault, {
      suffix: "retained-chat",
      scopeId: "chat-retained",
    });

    const deletedIdentity = preparePayload({
      handles: [{ field: "secret", handle: deletedChatSecret.handle }],
    });
    const deletedPrepared = vault.prepareUseIntent(deletedIdentity);
    const deletedBinding = bindingPayload(deletedPrepared, deletedIdentity);
    vault.bindPreparedUseIntent(deletedBinding);
    await vault.confirmBoundUseIntent({
      interactionId: deletedBinding.interaction_id,
      rendererApproved: true,
    });
    await vault.executeUseIntent(
      executePayload(deletedPrepared, deletedIdentity),
    );

    const retainedIdentity = preparePayload({
      operation_id: op("prepare-retained-chat"),
      owner_chat_id: "chat-retained",
      session_id: "session-retained",
      attempt_id: "attempt-retained",
      run_id: "run-retained",
      call_id: "call-retained",
      handles: [{ field: "secret", handle: retainedChatSecret.handle }],
    });
    const retainedPrepared = vault.prepareUseIntent(retainedIdentity);

    expect(vault.deleteUseStateForOwnerChat("chat-42")).toEqual({
      ok: true,
      ownerChatId: "chat-42",
      deletedIntents: 1,
      deletedReceipts: 1,
    });
    expect(vault.deleteUseStateForOwnerChat("chat-42")).toEqual({
      ok: true,
      ownerChatId: "chat-42",
      deletedIntents: 0,
      deletedReceipts: 0,
    });

    const db = rawDb();
    expect(
      Number(
        db
          .prepare("SELECT COUNT(*) AS count FROM vault_secrets")
          .get().count,
      ),
    ).toBe(2);
    expect(
      db
        .prepare(
          "SELECT owner_chat_id FROM vault_use_intents WHERE intent_id = ?",
        )
        .get(retainedPrepared.intent_id),
    ).toEqual({ owner_chat_id: "chat-retained" });
    expect(
      Number(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM vault_use_intents WHERE owner_chat_id = ?",
          )
          .get("chat-42").count,
      ),
    ).toBe(0);
    db.close();
  });

  test("chat deletion remains retryable while native confirmation is in flight", async () => {
    let resolveNativeConfirmation;
    const vault = makeVault({
      confirmUse: () =>
        new Promise((resolve) => {
          resolveNativeConfirmation = resolve;
        }),
    });
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    const confirmation = vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    await Promise.resolve();

    await expectCode(
      () => vault.deleteUseStateForOwnerChat("chat-42"),
      "vault_use_cleanup_in_progress",
    );
    resolveNativeConfirmation(false);
    await confirmation;
    expect(vault.deleteUseStateForOwnerChat("chat-42")).toEqual({
      ok: true,
      ownerChatId: "chat-42",
      deletedIntents: 1,
      deletedReceipts: 0,
    });
  });

  // ---- sink executor registry lifecycle ---------------------------------

  const approvedIntent = async (vault) => {
    const stored = seed(vault);
    const identity = preparePayload({
      handles: [{ field: "secret", handle: stored.handle }],
    });
    const prepared = vault.prepareUseIntent(identity);
    const binding = bindingPayload(prepared, identity);
    vault.bindPreparedUseIntent(binding);
    await vault.confirmBoundUseIntent({
      interactionId: binding.interaction_id,
      rendererApproved: true,
    });
    return { prepared, identity };
  };

  test("before configureSinkExecutors: execute never decrypts and the broker refuses to listen", async () => {
    const safeStorage = makeSafeStorage();
    const vault = makeVault({ safeStorage, confirmUse: async () => true });

    // An unconfigured vault must never open an authenticated loopback
    // listener it cannot serve.
    await expectCode(() => vault.startSinkBroker(), "vault_sink_unavailable");
    expect(vault.getSinkBrokerBootstrap()).toBeNull();

    const { prepared, identity } = await approvedIntent(vault);
    await expectCode(
      () => vault.executeUseIntent(executePayload(prepared, identity)),
      "vault_sink_unavailable",
    );
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
  });

  test("a configured-but-empty registry is rejected outright, not treated as configured", async () => {
    const vault = makeVault({ confirmUse: async () => true });

    await expectCode(
      () => vault.configureSinkExecutors({}),
      "vault_sink_registry_empty",
    );
    await expectCode(
      () => vault.configureSinkExecutors({ providers: {}, close: () => 0 }),
      "vault_sink_registry_empty",
    );
    // Still unconfigured, so the broker still refuses.
    await expectCode(() => vault.startSinkBroker(), "vault_sink_unavailable");
  });

  test("configureSinkExecutors rejects unknown sink kinds and invalid providers", async () => {
    const vault = makeVault({ confirmUse: async () => true });
    for (const bad of [
      null,
      "registry",
      [],
      { not_a_sink_kind: providerFor(async () => ({})) },
      { [SINK_KIND]: "not-a-function" },
      { [SINK_KIND]: { prepare: "not-a-function" } },
      {
        providers: { [SINK_KIND]: providerFor(async () => ({})) },
        close: "nope",
      },
    ]) {
      await expectCode(
        () => vault.configureSinkExecutors(bad),
        bad && typeof bad === "object" && !Array.isArray(bad) &&
          Object.keys(bad).length === 0
          ? "vault_sink_registry_empty"
          : "vault_sink_registry_invalid",
      );
    }
    await expectCode(() => vault.startSinkBroker(), "vault_sink_unavailable");
  });

  test("configureSinkExecutors is one-shot and locks once the broker has started", async () => {
    const vault = makeVault({ confirmUse: async () => true });
    const executor = jest.fn(async () => ({ accepted: true }));
    const provider = providerFor(executor);

    expect(vault.configureSinkExecutors({ [SINK_KIND]: provider })).toEqual({
      ok: true,
      sinkKinds: [SINK_KIND],
    });
    // Second call before the broker starts.
    await expectCode(
      () => vault.configureSinkExecutors({ [SINK_KIND]: provider }),
      "vault_sink_executors_already_configured",
    );

    const bootstrap = await vault.startSinkBroker();
    expect(bootstrap.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    // Any call after the broker has started — no swap window mid-flight.
    await expectCode(
      () => vault.configureSinkExecutors({ [SINK_KIND]: provider }),
      "vault_sink_executors_locked",
    );
    // Stopping the broker does not reopen the window.
    await vault.stopSinkBroker();
    await expectCode(
      () => vault.configureSinkExecutors({ [SINK_KIND]: provider }),
      "vault_sink_executors_locked",
    );
  });

  test("close stops the broker and drains the executor registry before closing the db", async () => {
    const order = [];
    const executor = jest.fn(async () => ({ accepted: true }));
    const registry = {
      providers: { [SINK_KIND]: providerFor(executor) },
      close: jest.fn(() => {
        order.push("drain-executors");
        return 1;
      }),
    };
    const vault = makeVault({ confirmUse: async () => true });
    vault.configureSinkExecutors(registry);
    await vault.startSinkBroker();
    expect(vault.getSinkBrokerBootstrap()).not.toBeNull();

    vault.close();
    order.push("db-closed");

    expect(registry.close).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["drain-executors", "db-closed"]);
    expect(vault.getSinkBrokerBootstrap()).toBeNull();
    expect(vault.getStatus()).toMatchObject({ ok: true, available: false });
  });

  test("a throwing registry drain never blocks the db close", () => {
    const vault = makeVault({ confirmUse: async () => true });
    vault.configureSinkExecutors({
      providers: {
        [SINK_KIND]: providerFor(async () => ({ accepted: true })),
      },
      close: () => {
        throw new Error("kill failed");
      },
    });

    expect(() => vault.close()).not.toThrow();
    expect(vault.getStatus()).toMatchObject({ ok: true, available: false });
  });
});
