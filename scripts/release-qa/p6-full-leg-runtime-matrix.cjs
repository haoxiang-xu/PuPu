#!/usr/bin/env node

// Exercise the complete P6 deletion sequence without touching a user's
// Sidecar, chats.db, or Vault.  This is intentionally a release-QA entrypoint:
// it requires an explicit immutable Unchain wheel and produces no claim about
// a packaged or installed PuPu candidate.

const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { createChatStorageService } = require("../../electron/main/services/chat_storage/service");
const { createMemoryVaultService } = require("../../electron/main/services/memory_vault/service");
const { createUnchainService } = require("../../electron/main/services/unchain/service");

let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch (_error) {
  if (typeof process.getBuiltinModule === "function") {
    try {
      sqlite = process.getBuiltinModule("node:sqlite");
    } catch (_builtinError) {
      sqlite = null;
    }
  }
}

const REPORT_SCHEMA = "pupu.p6.full-leg-runtime-matrix.v1";
const DELETE_RECEIPT_SCHEMA = "pupu.context_v2_chat_deletion.v1";
const RUNTIME_MANIFEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

const parseArgs = (argv) => {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  for (const key of ["python", "wheel", "out"]) {
    if (!parsed[key]) throw new Error(`--${key} is required`);
  }
  return parsed;
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async (predicate, timeoutMs, description) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    // eslint-disable-next-line no-await-in-loop
    await sleep(25);
  }
  throw new Error(`${description} timed out`);
};

const sha256 = (filePath) => {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(filePath));
  return digest.digest("hex");
};

const runChecked = (command, args, options = {}) => {
  const result = childProcess.spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed: ${String(
        result.stderr || result.stdout || result.error || "unknown failure",
      ).trim()}`,
    );
  }
  return String(result.stdout || "").trim();
};

const wheelRuntimeIdentity = ({ pythonPath, wheelTarget }) => {
  const output = runChecked(
    pythonPath,
    [
      "-c",
      [
        "import json,unchain",
        "from unchain.runtime.runtime_protocol import runtime_protocol_manifest",
        "print(json.dumps({'origin': unchain.__file__, 'manifest': runtime_protocol_manifest()}, sort_keys=True))",
      ].join("; "),
    ],
    {
      env: {
        ...process.env,
        PYTHONPATH: wheelTarget,
        UNCHAIN_SOURCE_PATH: "",
      },
    },
  );
  const identity = JSON.parse(output);
  if (
    !identity ||
    typeof identity.origin !== "string" ||
    !identity.origin.startsWith(wheelTarget + path.sep) ||
    !identity.manifest ||
    !RUNTIME_MANIFEST_PATTERN.test(identity.manifest.manifest_digest || "")
  ) {
    throw new Error("wheel runtime identity is invalid");
  }
  return identity;
};

const createSafeStorage = () => ({
  isEncryptionAvailable: () => true,
  encryptString: (plaintext) => {
    const input = Buffer.from(plaintext, "utf8");
    const output = Buffer.alloc(input.length + 4);
    Buffer.from("ENC:").copy(output);
    for (let index = 0; index < input.length; index += 1) {
      output[index + 4] = input[index] ^ 0x5a;
    }
    return output;
  },
});

const createApp = ({ appRoot, userData }) => ({
  isPackaged: false,
  getAppPath: () => appRoot,
  getPath: (key) => {
    if (key === "userData") return userData;
    throw new Error(`unexpected app path: ${key}`);
  },
  getVersion: () => "0.1.10-p6-qa",
});

const readOutbox = ({ userData, ownerChatId }) => {
  const database = new sqlite.DatabaseSync(path.join(userData, "chats.db"));
  try {
    return database
      .prepare(
        "SELECT * FROM chat_deletion_outbox WHERE owner_chat_id = ? " +
          "ORDER BY created_at DESC LIMIT 1",
      )
      .get(ownerChatId);
  } finally {
    database.close();
  }
};

const forceOutboxDue = ({ userData, ownerChatId }) => {
  const database = new sqlite.DatabaseSync(path.join(userData, "chats.db"));
  try {
    database
      .prepare(
        "UPDATE chat_deletion_outbox SET next_attempt_at = 0 " +
          "WHERE owner_chat_id = ?",
      )
      .run(ownerChatId);
  } finally {
    database.close();
  }
};

const readSidecarOperation = ({ userData, ownerChatId }) => {
  const databasePath = path.join(
    userData,
    "memory_v2",
    "context_v2.sqlite3",
  );
  const database = new sqlite.DatabaseSync(databasePath);
  try {
    const tombstone = database
      .prepare(
        "SELECT owner_chat_id, first_operation_id FROM chat_deletion_tombstones " +
          "WHERE owner_chat_id = ?",
      )
      .get(ownerChatId);
    const operations = database
      .prepare(
        "SELECT owner_chat_id, operation_id FROM chat_deletion_operations " +
          "WHERE owner_chat_id = ? ORDER BY operation_id",
      )
      .all(ownerChatId);
    return { tombstone, operations };
  } finally {
    database.close();
  }
};

const setScopedEnvironment = ({ pythonPath, wheelTarget }) => {
  const updates = {
    PYTHONPATH: wheelTarget,
    UNCHAIN_PYTHON_BIN: pythonPath,
    UNCHAIN_SOURCE_PATH: undefined,
    PUPU_FEATURE_MEMORY_V2: "shadow",
    PUPU_MEMORY_V2_MODE: "shadow",
    PUPU_MEMORY_V2_CANARY_PERCENT: "0",
    PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "1",
    PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
  };
  const previous = new Map(
    Object.keys(updates).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};

const runMatrix = async ({ pythonPath, wheelPath }) => {
  if (!sqlite || typeof sqlite.DatabaseSync !== "function") {
    throw new Error("node:sqlite is required for the P6 full-leg matrix");
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-p6-full-leg-"));
  const wheelTarget = path.join(tempRoot, "wheel-site");
  const appRoot = path.join(tempRoot, "app");
  const userData = path.join(tempRoot, "user-data");
  const repoRoot = path.resolve(__dirname, "..", "..");
  const restoreEnvironment = setScopedEnvironment({ pythonPath, wheelTarget });
  let chatService = null;
  let restartedChatService = null;
  let vaultService = null;
  let unchainService = null;

  try {
    runChecked(pythonPath, [
      "-m",
      "pip",
      "install",
      "--no-deps",
      "--disable-pip-version-check",
      "--target",
      wheelTarget,
      wheelPath,
    ]);
    const runtimeIdentity = wheelRuntimeIdentity({ pythonPath, wheelTarget });

    fs.mkdirSync(appRoot, { recursive: true });
    fs.mkdirSync(userData, { recursive: true });
    fs.mkdirSync(path.join(appRoot, ".local"), { recursive: true });
    fs.writeFileSync(
      path.join(appRoot, ".local", "build_feature_flags.snapshot.json"),
      `${JSON.stringify({ enable_memory_v2: true })}\n`,
      "utf8",
    );
    // Do not symlink this directory. The server's Python bootstrap resolves
    // __file__; a symlink would rediscover the mutable sibling Unchain source
    // and put it ahead of this matrix's immutable wheel target.
    fs.cpSync(
      path.join(repoRoot, "unchain_runtime"),
      path.join(appRoot, "unchain_runtime"),
      { recursive: true },
    );
    const app = createApp({ appRoot, userData });
    const webContents = {
      fromId: () => null,
      getAllWebContents: () => [],
    };
    unchainService = createUnchainService({
      app,
      fs,
      path,
      spawn: childProcess.spawn,
      spawnSync: childProcess.spawnSync,
      crypto,
      net,
      webContents,
      runtimeService: {},
      getAppIsQuitting: () => false,
    });
    await unchainService.startMiso();
    const startupStatus = unchainService.getMisoStatusPayload();
    if (!startupStatus.ready) {
      const safeReason = String(startupStatus.reason || "")
        .replace(/[^a-zA-Z0-9_. -]/g, "")
        .slice(0, 160);
      throw new Error(
        "isolated Electron Sidecar did not become ready " +
          `(status=${startupStatus.status}, reason=${safeReason || "none"})`,
      );
    }

    chatService = createChatStorageService({ app, fs, path, sqlite });
    chatService.init();
    vaultService = createMemoryVaultService({
      app,
      path,
      sqlite,
      platform: "darwin",
      safeStorage: createSafeStorage(),
    });
    vaultService.init();

    const ownerChatId = "p6_full_leg_chat";
    const userScopeId = "p6_full_leg_user";
    vaultService.deposit({
      operationId: "p6-full-leg-chat-deposit-0001",
      scopeKind: "chat",
      scopeId: ownerChatId,
      label: "chat scope fixture",
      plaintext: "p6-full-leg-chat-fixture",
    });
    vaultService.deposit({
      operationId: "p6-full-leg-user-deposit-0001",
      scopeKind: "user",
      scopeId: userScopeId,
      label: "user scope fixture",
      plaintext: "p6-full-leg-user-fixture",
    });

    const contextCalls = [];
    const contextFailures = [];
    const contextTarget = {
      deleteContextV2Chat: async (payload) => {
        contextCalls.push({ ...payload });
        try {
          return await unchainService.deleteContextV2Chat(payload);
        } catch (error) {
          contextFailures.push({
            code: typeof error?.code === "string" ? error.code : "",
            retryable: error?.retryable === true,
          });
          throw error;
        }
      },
    };
    let failVaultEnumeration = true;
    const firstVaultTarget = {
      deleteUseStateForOwnerChat: (value) =>
        vaultService.deleteUseStateForOwnerChat(value),
      listDescriptors: (payload) => {
        if (failVaultEnumeration) {
          failVaultEnumeration = false;
          const error = new Error("synthetic vault enumeration unavailable");
          error.retryable = true;
          throw error;
        }
        return vaultService.listDescriptors(payload);
      },
      deleteSecret: (payload) => vaultService.deleteSecret(payload),
    };
    chatService.configureDeletionTargets({
      unchainService: contextTarget,
      memoryVaultService: firstVaultTarget,
    });
    chatService.applyOps([
      {
        type: "put_chat_meta",
        chatId: ownerChatId,
        meta: { id: ownerChatId, title: "P6 QA" },
      },
      {
        type: "put_messages",
        chatId: ownerChatId,
        messages: [{ role: "user", content: "isolated P6 fixture" }],
      },
      { type: "delete_chats", chatIds: [ownerChatId] },
    ]);

    const firstResult = await chatService.processDeletionOutboxOnce();
    const afterFirst = readOutbox({ userData, ownerChatId });
    if (
      firstResult?.errorCode !== "vault_list_failed" ||
      Number(afterFirst?.context_done) !== 1 ||
      Number(afterFirst?.vault_done) !== 0 ||
      afterFirst?.status !== "retry" ||
      contextCalls.length !== 1
    ) {
      throw new Error(
        "first full-leg attempt did not persist Context-only progress " +
          `(context=${JSON.stringify(contextFailures)})`,
      );
    }
    const sidecarAfterFirst = readSidecarOperation({ userData, ownerChatId });
    if (
      sidecarAfterFirst?.tombstone?.first_operation_id !== afterFirst.operation_id ||
      sidecarAfterFirst.operations?.length !== 1 ||
      sidecarAfterFirst.operations[0]?.operation_id !== afterFirst.operation_id
    ) {
      throw new Error("Sidecar deletion identity was not persisted exactly once");
    }

    chatService.close();
    chatService = null;
    forceOutboxDue({ userData, ownerChatId });
    restartedChatService = createChatStorageService({ app, fs, path, sqlite });
    restartedChatService.init();
    restartedChatService.configureDeletionTargets({
      unchainService: contextTarget,
      memoryVaultService: vaultService,
    });
    const secondResult = await restartedChatService.processDeletionOutboxOnce();
    const afterSecond = readOutbox({ userData, ownerChatId });
    if (
      secondResult?.completed !== true ||
      Number(afterSecond?.context_done) !== 1 ||
      Number(afterSecond?.vault_done) !== 1 ||
      afterSecond?.status !== "complete" ||
      contextCalls.length !== 1
    ) {
      throw new Error("cold restart did not resume only the Vault leg");
    }
    const chatDescriptors = vaultService.listDescriptors({
      scopeKind: "chat",
      scopeId: ownerChatId,
    });
    const userDescriptors = vaultService.listDescriptors({
      scopeKind: "user",
      scopeId: userScopeId,
    });
    if (
      !chatDescriptors?.ok ||
      chatDescriptors.descriptors.length !== 0 ||
      !userDescriptors?.ok ||
      userDescriptors.descriptors.length !== 1
    ) {
      throw new Error("Vault scope cleanup is not exact");
    }
    const sidecarAfterSecond = readSidecarOperation({ userData, ownerChatId });
    if (sidecarAfterSecond.operations?.length !== 1) {
      throw new Error("cold restart replayed the completed Context operation");
    }

    return {
      schema: REPORT_SCHEMA,
      executed_tests: 10,
      wheel_sha256: sha256(wheelPath),
      runtime_manifest_digest: runtimeIdentity.manifest.manifest_digest,
      runtime_origin_is_wheel_target: true,
      checks: {
        immutable_wheel_runtime_import: "pass",
        electron_started_isolated_sidecar: "pass",
        electron_delete_reached_sidecar: "pass",
        sidecar_tombstone_persisted_once: "pass",
        context_checkpoint_persisted_before_vault: "pass",
        vault_transient_failure_retry: "pass",
        cold_restart_skips_context_leg: "pass",
        vault_chat_scope_deleted: "pass",
        vault_user_scope_preserved: "pass",
        complete_requires_both_checkpoints: "pass",
      },
    };
  } finally {
    try {
      restartedChatService?.close();
    } catch (_error) {
      // cleanup must continue through every isolated resource
    }
    try {
      chatService?.close();
    } catch (_error) {
      // cleanup must continue through every isolated resource
    }
    try {
      vaultService?.close();
    } catch (_error) {
      // cleanup must continue through every isolated resource
    }
    try {
      unchainService?.stopMiso();
      await waitFor(
        () => !unchainService?.getMisoStatusPayload().pid,
        5000,
        "isolated Sidecar shutdown",
      );
    } catch (_error) {
      // The temporary directory remains uniquely named even if a process has
      // already exited. The caller receives the original matrix failure.
    }
    restoreEnvironment();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const pythonPath = path.resolve(args.python);
  const wheelPath = path.resolve(args.wheel);
  const outputPath = path.resolve(args.out);
  if (!fs.existsSync(pythonPath)) throw new Error("--python must exist");
  if (!fs.existsSync(wheelPath) || !wheelPath.endsWith(".whl")) {
    throw new Error("--wheel must be an existing wheel");
  }
  const report = await runMatrix({ pythonPath, wheelPath });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `[release-qa] P6 full-leg runtime matrix passed (${report.executed_tests} checks)\n`,
  );
};

main().catch((error) => {
  process.stderr.write(`[release-qa] P6 full-leg runtime matrix failed: ${error.message}\n`);
  process.exitCode = 1;
});
