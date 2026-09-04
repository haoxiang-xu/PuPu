#!/usr/bin/env node

// Exercise the complete P6 deletion sequence without touching a user's
// Sidecar, chats.db, or Vault.  This is intentionally a release-QA entrypoint:
// it requires an explicit immutable Unchain wheel. With --installed-app it
// loads the exact main-process modules and release snapshot from that app.asar
// and launches only the Sidecar bundled in the installed application.

const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

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

const extractInstalledMainRuntime = ({ installedApp, targetRoot }) => {
  const asar = require("@electron/asar");
  const resourcesPath = path.join(installedApp, "Contents", "Resources");
  const asarPath = path.join(resourcesPath, "app.asar");
  const sidecarPath = path.join(
    resourcesPath,
    "unchain_runtime",
    "dist",
    "macos",
    "unchain-server",
  );
  if (!fs.existsSync(asarPath)) {
    throw new Error("installed app.asar is missing");
  }
  if (!fs.existsSync(sidecarPath)) {
    throw new Error("installed packaged Sidecar is missing");
  }

  const entries = asar.listPackage(asarPath);
  const files = entries.filter((entry) => {
    if (!entry.startsWith("/electron/")) return false;
    return !asar.statFile(asarPath, entry.slice(1)).files;
  });
  if (files.length === 0) {
    throw new Error("installed app.asar has no Electron main runtime");
  }
  for (const entry of files) {
    const outputPath = path.join(targetRoot, entry.slice(1));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, asar.extractFile(asarPath, entry.slice(1)));
  }

  const snapshotEntry = "build/build_feature_flags.json";
  const snapshotBytes = Buffer.from(asar.extractFile(asarPath, snapshotEntry));
  const snapshotPath = path.join(targetRoot, snapshotEntry);
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, snapshotBytes);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  const releaseMetadata = snapshot?._pupu_memory_v2_release;
  if (
    snapshot?.enable_memory_v2 !== true ||
    releaseMetadata?.schema !== "pupu.memory-v2-release.v1" ||
    typeof releaseMetadata?.snapshot_fingerprint !== "string" ||
    !releaseMetadata.snapshot_fingerprint
  ) {
    throw new Error("installed Memory V2 release snapshot is invalid");
  }
  return {
    asarPath,
    resourcesPath,
    sidecarPath,
    snapshot,
    snapshotBytes,
    snapshotFingerprint: releaseMetadata.snapshot_fingerprint,
  };
};

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

const createApp = ({ appRoot, userData, isPackaged = false, version = "0.1.10-p6-qa" }) => ({
  isPackaged,
  getAppPath: () => appRoot,
  getPath: (key) => {
    if (key === "userData") return userData;
    throw new Error(`unexpected app path: ${key}`);
  },
  getVersion: () => version,
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

const setScopedEnvironment = ({ pythonPath, wheelTarget, installed }) => {
  const updates = installed ? {
    PYTHONPATH: undefined,
    UNCHAIN_PYTHON_BIN: undefined,
    UNCHAIN_SOURCE_PATH: undefined,
    PUPU_FEATURE_MEMORY_V2: undefined,
    PUPU_MEMORY_V2_MODE: undefined,
    PUPU_MEMORY_V2_CANARY_PERCENT: undefined,
    PUPU_MEMORY_V2_READ_ONLY_DEGRADED: undefined,
    PUPU_CONTEXT_V2_STORE_OWNER: undefined,
  } : {
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

const runMatrix = async ({
  pythonPath,
  wheelPath,
  installedApp = "",
  appVersion = "",
}) => {
  if (!sqlite || typeof sqlite.DatabaseSync !== "function") {
    throw new Error("node:sqlite is required for the P6 full-leg matrix");
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-p6-full-leg-"));
  const wheelTarget = path.join(tempRoot, "wheel-site");
  const appRoot = path.join(tempRoot, "app");
  const userData = path.join(tempRoot, "user-data");
  const repoRoot = path.resolve(__dirname, "..", "..");
  const installed = Boolean(installedApp);
  const restoreEnvironment = setScopedEnvironment({
    pythonPath,
    wheelTarget,
    installed,
  });
  const hadResourcesPath = Object.prototype.hasOwnProperty.call(
    process,
    "resourcesPath",
  );
  const previousResourcesPath = process.resourcesPath;
  let installedIdentity = null;
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

    fs.mkdirSync(userData, { recursive: true });
    fs.mkdirSync(appRoot, { recursive: true });
    if (installed) {
      installedIdentity = extractInstalledMainRuntime({
        installedApp,
        targetRoot: appRoot,
      });
      process.resourcesPath = installedIdentity.resourcesPath;
    } else {
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
      // The Sidecar's MCP registry is a versioned PuPu artifact, not an ambient
      // user setting. Copy precisely that startup dependency into the temporary
      // app root so the real Electron launcher sees the same layout it does in
      // development, without allowing the copied Sidecar to rediscover mutable
      // Unchain source.
      const mcpRegistrySource = path.join(
        repoRoot,
        "src",
        "SERVICEs",
        "mcp_toolkit_registry.json",
      );
      const mcpRegistryTarget = path.join(
        appRoot,
        "src",
        "SERVICEs",
        "mcp_toolkit_registry.json",
      );
      if (!fs.existsSync(mcpRegistrySource)) {
        throw new Error("P6 full-leg matrix MCP registry artifact is missing");
      }
      fs.mkdirSync(path.dirname(mcpRegistryTarget), { recursive: true });
      fs.copyFileSync(mcpRegistrySource, mcpRegistryTarget);
    }
    const serviceRoot = installed ? appRoot : repoRoot;
    const { createChatStorageService } = require(path.join(
      serviceRoot,
      "electron/main/services/chat_storage/service",
    ));
    const { createMemoryVaultService } = require(path.join(
      serviceRoot,
      "electron/main/services/memory_vault/service",
    ));
    const { createUnchainService } = require(path.join(
      serviceRoot,
      "electron/main/services/unchain/service",
    ));
    const app = createApp({
      appRoot,
      userData,
      isPackaged: installed,
      version: installed ? appVersion || "installed-p6-qa" : "0.1.10-p6-qa",
    });
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
    if (installed) {
      if (
        startupStatus.memoryV2?.runtimeProtocolDigest !==
          runtimeIdentity.manifest.manifest_digest ||
        startupStatus.memoryV2?.snapshotFingerprint !==
          installedIdentity.snapshotFingerprint
      ) {
        throw new Error(
          "installed Sidecar runtime identity does not match the wheel/snapshot contract",
        );
      }
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

    // A real terminal Sidecar response must quarantine before any Vault call.
    // This intentionally corrupts only this uniquely named temporary database,
    // after the primary happy/retry sequence is complete.  The Sidecar remains
    // the real HTTP producer; Electron's strict error parser classifies the
    // response and drives the real durable outbox transition.
    const terminalChatId = "p6_terminal_context_chat";
    vaultService.deposit({
      operationId: "p6-terminal-chat-deposit-0001",
      scopeKind: "chat",
      scopeId: terminalChatId,
      label: "terminal schema fixture",
      plaintext: "p6-terminal-context-fixture",
    });
    await unchainService.stopMiso();
    await waitFor(
      () => !unchainService.getMisoStatusPayload().pid,
      5000,
      "isolated Sidecar stop before terminal schema fixture",
    );
    const contextDatabasePath = path.join(
      userData,
      "memory_v2",
      "context_v2.sqlite3",
    );
    fs.rmSync(contextDatabasePath, { force: true });
    fs.rmSync(`${contextDatabasePath}-wal`, { force: true });
    fs.rmSync(`${contextDatabasePath}-shm`, { force: true });
    fs.writeFileSync(contextDatabasePath, "", "utf8");
    await unchainService.startMiso();
    if (!unchainService.getMisoStatusPayload().ready) {
      throw new Error("isolated Sidecar did not restart for terminal schema matrix");
    }

    const terminalContextCalls = [];
    const terminalContextTarget = {
      deleteContextV2Chat: async (payload) => {
        terminalContextCalls.push({ ...payload });
        return unchainService.deleteContextV2Chat(payload);
      },
    };
    const terminalVaultCalls = {
      deleteUseState: 0,
      listDescriptors: 0,
      deleteSecret: 0,
    };
    const terminalVaultTarget = {
      deleteUseStateForOwnerChat: (value) => {
        terminalVaultCalls.deleteUseState += 1;
        return vaultService.deleteUseStateForOwnerChat(value);
      },
      listDescriptors: (payload) => {
        terminalVaultCalls.listDescriptors += 1;
        return vaultService.listDescriptors(payload);
      },
      deleteSecret: (payload) => {
        terminalVaultCalls.deleteSecret += 1;
        return vaultService.deleteSecret(payload);
      },
    };
    restartedChatService.configureDeletionTargets({
      unchainService: terminalContextTarget,
      memoryVaultService: terminalVaultTarget,
    });
    restartedChatService.applyOps([
      {
        type: "put_chat_meta",
        chatId: terminalChatId,
        meta: { id: terminalChatId, title: "P6 terminal QA" },
      },
      {
        type: "put_messages",
        chatId: terminalChatId,
        messages: [{ role: "user", content: "terminal Context fixture" }],
      },
      { type: "delete_chats", chatIds: [terminalChatId] },
    ]);
    const terminalFirstResult =
      await restartedChatService.processDeletionOutboxOnce();
    const terminalAfterFirst = readOutbox({ userData, ownerChatId: terminalChatId });
    if (
      terminalFirstResult?.errorCode !== "context_delete_failed" ||
      terminalFirstResult?.quarantined !== true ||
      Number(terminalAfterFirst?.context_done) !== 0 ||
      Number(terminalAfterFirst?.vault_done) !== 0 ||
      terminalAfterFirst?.status !== "quarantined" ||
      terminalContextCalls.length !== 1 ||
      terminalVaultCalls.deleteUseState !== 0 ||
      terminalVaultCalls.listDescriptors !== 0 ||
      terminalVaultCalls.deleteSecret !== 0
    ) {
      throw new Error("terminal Context failure did not quarantine before Vault");
    }

    restartedChatService.close();
    restartedChatService = null;
    chatService = createChatStorageService({ app, fs, path, sqlite });
    chatService.init();
    chatService.configureDeletionTargets({
      unchainService: terminalContextTarget,
      memoryVaultService: terminalVaultTarget,
    });
    const terminalColdResult = await chatService.processDeletionOutboxOnce();
    if (
      terminalColdResult?.reason !== "not_due" ||
      terminalContextCalls.length !== 1 ||
      terminalVaultCalls.deleteUseState !== 0
    ) {
      throw new Error("cold restart retried a quarantined Context operation");
    }

    // Repair is intentionally external to the outbox. Once the temporary
    // schema fault is removed, only the explicit main-process requeue may
    // reuse the stable Context operation and resume this fenced chat.
    await unchainService.stopMiso();
    await waitFor(
      () => !unchainService.getMisoStatusPayload().pid,
      5000,
      "isolated Sidecar stop before terminal schema repair",
    );
    fs.rmSync(path.join(userData, "memory_v2"), {
      recursive: true,
      force: true,
    });
    await unchainService.startMiso();
    if (!unchainService.getMisoStatusPayload().ready) {
      throw new Error("isolated Sidecar did not restart after terminal schema repair");
    }
    const requeue = chatService.requeueQuarantinedDeletion({
      deletionId: terminalAfterFirst.deletion_id,
      reason: "schema_repaired",
    });
    if (
      requeue?.requeued !== true ||
      requeue.generation !== 1 ||
      requeue.operationId !== terminalAfterFirst.operation_id
    ) {
      throw new Error("explicit quarantine requeue changed deletion identity");
    }
    chatService.configureDeletionTargets({
      unchainService: terminalContextTarget,
      memoryVaultService: vaultService,
    });
    const terminalRepairResult = await chatService.processDeletionOutboxOnce();
    const terminalAfterRepair = readOutbox({
      userData,
      ownerChatId: terminalChatId,
    });
    const terminalSidecar = readSidecarOperation({
      userData,
      ownerChatId: terminalChatId,
    });
    const terminalVaultDescriptors = vaultService.listDescriptors({
      scopeKind: "chat",
      scopeId: terminalChatId,
    });
    if (
      terminalRepairResult?.completed !== true ||
      terminalAfterRepair?.status !== "complete" ||
      Number(terminalAfterRepair?.context_done) !== 1 ||
      Number(terminalAfterRepair?.vault_done) !== 1 ||
      terminalContextCalls.length !== 2 ||
      terminalSidecar?.tombstone?.first_operation_id !==
        terminalAfterFirst.operation_id ||
      terminalSidecar.operations?.length !== 1 ||
      terminalVaultDescriptors?.descriptors?.length !== 0
    ) {
      throw new Error("repaired terminal Context operation did not complete exactly once");
    }

    // Exercise a genuine Sidecar outage rather than a synthetic retryable
    // error: Context must back off before Vault, survive an app cold restart,
    // and then reuse the original operation once the managed Sidecar returns.
    const offlineChatId = "p6_offline_context_chat";
    vaultService.deposit({
      operationId: "p6-offline-chat-deposit-0001",
      scopeKind: "chat",
      scopeId: offlineChatId,
      label: "offline Context fixture",
      plaintext: "p6-offline-context-fixture",
    });
    const offlineContextCalls = [];
    const offlineContextTarget = {
      deleteContextV2Chat: async (payload) => {
        offlineContextCalls.push({ ...payload });
        return unchainService.deleteContextV2Chat(payload);
      },
    };
    const offlineVaultCalls = {
      deleteUseState: 0,
      listDescriptors: 0,
      deleteSecret: 0,
    };
    const offlineVaultTarget = {
      deleteUseStateForOwnerChat: (value) => {
        offlineVaultCalls.deleteUseState += 1;
        return vaultService.deleteUseStateForOwnerChat(value);
      },
      listDescriptors: (payload) => {
        offlineVaultCalls.listDescriptors += 1;
        return vaultService.listDescriptors(payload);
      },
      deleteSecret: (payload) => {
        offlineVaultCalls.deleteSecret += 1;
        return vaultService.deleteSecret(payload);
      },
    };
    await unchainService.stopMiso();
    await waitFor(
      () => !unchainService.getMisoStatusPayload().pid,
      5000,
      "isolated Sidecar stop before offline retry matrix",
    );
    chatService.configureDeletionTargets({
      unchainService: offlineContextTarget,
      memoryVaultService: offlineVaultTarget,
    });
    chatService.applyOps([
      {
        type: "put_chat_meta",
        chatId: offlineChatId,
        meta: { id: offlineChatId, title: "P6 offline QA" },
      },
      {
        type: "put_messages",
        chatId: offlineChatId,
        messages: [{ role: "user", content: "offline Context fixture" }],
      },
      { type: "delete_chats", chatIds: [offlineChatId] },
    ]);
    const offlineFirstResult = await chatService.processDeletionOutboxOnce();
    const offlineAfterFirst = readOutbox({ userData, ownerChatId: offlineChatId });
    if (
      offlineFirstResult?.errorCode !== "context_delete_failed" ||
      offlineFirstResult?.quarantined !== false ||
      Number(offlineAfterFirst?.context_done) !== 0 ||
      Number(offlineAfterFirst?.vault_done) !== 0 ||
      offlineAfterFirst?.status !== "retry" ||
      offlineContextCalls.length !== 1 ||
      offlineVaultCalls.deleteUseState !== 0 ||
      offlineVaultCalls.listDescriptors !== 0 ||
      offlineVaultCalls.deleteSecret !== 0
    ) {
      throw new Error("offline Context failure did not persist retry before Vault");
    }

    chatService.close();
    chatService = null;
    restartedChatService = createChatStorageService({ app, fs, path, sqlite });
    restartedChatService.init();
    restartedChatService.configureDeletionTargets({
      unchainService: offlineContextTarget,
      memoryVaultService: offlineVaultTarget,
    });
    const offlineColdResult =
      await restartedChatService.processDeletionOutboxOnce();
    if (
      offlineColdResult?.reason !== "not_due" ||
      offlineContextCalls.length !== 1 ||
      offlineVaultCalls.deleteUseState !== 0
    ) {
      throw new Error("cold restart retried a Context backoff before it was due");
    }
    restartedChatService.close();
    restartedChatService = null;

    await unchainService.startMiso();
    if (!unchainService.getMisoStatusPayload().ready) {
      throw new Error("isolated Sidecar did not restart for offline retry recovery");
    }
    forceOutboxDue({ userData, ownerChatId: offlineChatId });
    chatService = createChatStorageService({ app, fs, path, sqlite });
    chatService.init();
    chatService.configureDeletionTargets({
      unchainService: offlineContextTarget,
      memoryVaultService: vaultService,
    });
    const offlineRecoveryResult = await chatService.processDeletionOutboxOnce();
    const offlineAfterRecovery = readOutbox({
      userData,
      ownerChatId: offlineChatId,
    });
    const offlineSidecar = readSidecarOperation({
      userData,
      ownerChatId: offlineChatId,
    });
    const offlineVaultDescriptors = vaultService.listDescriptors({
      scopeKind: "chat",
      scopeId: offlineChatId,
    });
    if (
      offlineRecoveryResult?.completed !== true ||
      offlineAfterRecovery?.operation_id !== offlineAfterFirst.operation_id ||
      offlineAfterRecovery?.status !== "complete" ||
      Number(offlineAfterRecovery?.context_done) !== 1 ||
      Number(offlineAfterRecovery?.vault_done) !== 1 ||
      offlineContextCalls.length !== 2 ||
      offlineSidecar?.tombstone?.first_operation_id !==
        offlineAfterFirst.operation_id ||
      offlineSidecar.operations?.length !== 1 ||
      offlineVaultDescriptors?.descriptors?.length !== 0
    ) {
      throw new Error("offline Context retry recovery did not complete exactly once");
    }

    const installedChecks = installed ? {
      installed_asar_main_runtime_loaded: "pass",
      installed_packaged_sidecar_started: "pass",
      installed_snapshot_loaded: "pass",
      installed_runtime_manifest_matches_wheel: "pass",
      installed_snapshot_matches_runtime: "pass",
    } : {};
    return {
      schema: REPORT_SCHEMA,
      executed_tests: 19 + Object.keys(installedChecks).length,
      wheel_sha256: sha256(wheelPath),
      runtime_manifest_digest: runtimeIdentity.manifest.manifest_digest,
      runtime_origin_is_wheel_target: true,
      candidate_source: installed ? "installed_macos_app" : "source_entrypoint",
      installed_identity: installed ? {
        app_asar_sha256: sha256(installedIdentity.asarPath),
        packaged_sidecar_sha256: sha256(installedIdentity.sidecarPath),
        snapshot_sha256: crypto
          .createHash("sha256")
          .update(installedIdentity.snapshotBytes)
          .digest("hex"),
        snapshot_fingerprint: installedIdentity.snapshotFingerprint,
      } : null,
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
        terminal_context_quarantines_before_vault: "pass",
        quarantine_cold_restart_does_not_replay: "pass",
        explicit_requeue_preserves_context_operation: "pass",
        external_schema_repair_then_requeue_completes: "pass",
        requeued_sidecar_tombstone_persisted_once: "pass",
        offline_context_retry_blocks_vault: "pass",
        offline_cold_restart_respects_backoff: "pass",
        offline_context_recovery_reuses_operation: "pass",
        offline_recovery_sidecar_tombstone_persisted_once: "pass",
        ...installedChecks,
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
    if (hadResourcesPath) process.resourcesPath = previousResourcesPath;
    else delete process.resourcesPath;
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
  const installedApp = args["installed-app"]
    ? path.resolve(args["installed-app"])
    : "";
  if (installedApp && !installedApp.endsWith(".app")) {
    throw new Error("--installed-app must identify a macOS .app bundle");
  }
  const report = await runMatrix({ pythonPath, wheelPath, installedApp });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `[release-qa] P6 full-leg runtime matrix passed (${report.executed_tests} checks)\n`,
  );
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `[release-qa] P6 full-leg runtime matrix failed: ${error.message}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runMatrix,
};
