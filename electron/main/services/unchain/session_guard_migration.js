const SESSION_GUARD_MIGRATION_ENV =
  "UNCHAIN_SESSION_GUARD_STOP_THE_WORLD";
const SESSION_GUARD_MIGRATION_RECEIPT_SCHEMA =
  "pupu.session-guard-migration";
const SESSION_GUARD_MIGRATION_RECEIPT_VERSION = 1;
const SESSION_GUARD_PROTOCOL_VERSION = 1;
const SESSION_GUARD_MIGRATION_INTENT_SCHEMA =
  "pupu.session-guard-migration-intent";
const SESSION_GUARD_MIGRATION_INTENT_VERSION = 1;
const SESSION_GUARD_MIGRATION_INTENT_DIRECTORY = ".pupu-main";
const SESSION_GUARD_MIGRATION_INTENT_FILE =
  "session_guard_migration_intent.json";
const SESSION_GUARD_TERM_TIMEOUT_MS = 1200;
const SESSION_GUARD_KILL_TIMEOUT_MS = 3800;
const SESSION_GUARD_PROCESS_POLL_MS = 50;
const DURABLE_JOB_WORKER_FLAG = "--durable-job-worker";

const SESSION_GUARD_MIGRATION_INTENT = Object.freeze({
  schema: SESSION_GUARD_MIGRATION_INTENT_SCHEMA,
  version: SESSION_GUARD_MIGRATION_INTENT_VERSION,
  state: "pending",
  protocol_version: SESSION_GUARD_PROTOCOL_VERSION,
});
const SESSION_GUARD_MIGRATION_INTENT_TEXT = JSON.stringify(
  SESSION_GUARD_MIGRATION_INTENT,
);

class SessionGuardMigrationError extends Error {
  constructor(code, message, status = "unavailable") {
    super(message);
    this.name = "SessionGuardMigrationError";
    this.code = code;
    this.retryable = false;
    this.status = status;
  }
}

const exactObjectKeys = (value, expectedKeys) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
};

const validateSessionGuardMigrationReceipt = (receipt) => {
  const expectedKeys = ["schema", "version", "status", "protocol_version"];
  if (
    !exactObjectKeys(receipt, expectedKeys) ||
    receipt.schema !== SESSION_GUARD_MIGRATION_RECEIPT_SCHEMA ||
    receipt.version !== SESSION_GUARD_MIGRATION_RECEIPT_VERSION ||
    receipt.protocol_version !== SESSION_GUARD_PROTOCOL_VERSION ||
    !["ready", "migration_required", "unavailable"].includes(receipt.status)
  ) {
    throw new SessionGuardMigrationError(
      "miso_session_guard_migration_receipt_invalid",
      "Miso session guard migration receipt is invalid",
    );
  }
  if (receipt.status === "migration_required") {
    throw new SessionGuardMigrationError(
      "miso_session_guard_migration_required",
      "Miso session guard requires a one-time safe migration",
      receipt.status,
    );
  }
  if (receipt.status !== "ready") {
    throw new SessionGuardMigrationError(
      "miso_session_guard_migration_unavailable",
      "Miso session guard migration is unavailable",
      receipt.status,
    );
  }
  return receipt;
};

const isExactMigrationIntent = (value) =>
  exactObjectKeys(value, ["schema", "version", "state", "protocol_version"]) &&
  value.schema === SESSION_GUARD_MIGRATION_INTENT_SCHEMA &&
  value.version === SESSION_GUARD_MIGRATION_INTENT_VERSION &&
  value.state === "pending" &&
  value.protocol_version === SESSION_GUARD_PROTOCOL_VERSION;

const createSessionGuardMigrationController = ({
  app,
  fs,
  path,
  spawnSync,
  platform = process.platform,
  killProcess = (pid, signal) => process.kill(pid, signal),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  termTimeoutMs = SESSION_GUARD_TERM_TIMEOUT_MS,
  killTimeoutMs = SESSION_GUARD_KILL_TIMEOUT_MS,
  pollMs = SESSION_GUARD_PROCESS_POLL_MS,
}) => {
  const intentDirectory = path.join(
    app.getPath("userData"),
    SESSION_GUARD_MIGRATION_INTENT_DIRECTORY,
  );
  const intentPath = path.join(
    intentDirectory,
    SESSION_GUARD_MIGRATION_INTENT_FILE,
  );

  const hasReadableIntentStore = () =>
    typeof fs?.existsSync === "function" &&
    typeof fs?.readFileSync === "function" &&
    typeof fs?.lstatSync === "function";

  const readPendingIntent = () => {
    // Several unit-test dependency stubs intentionally provide only
    // existsSync. Production Electron injects node:fs; an incomplete injected
    // store can never create or consume an intent and therefore can never
    // authorize the stop-the-world flag.
    if (!hasReadableIntentStore()) {
      return false;
    }
    let present;
    try {
      present = fs.existsSync(intentPath);
    } catch (_error) {
      throw new SessionGuardMigrationError(
        "miso_session_guard_migration_intent_unavailable",
        "Miso session guard migration intent is unavailable",
      );
    }
    if (!present) {
      return false;
    }
    try {
      const directoryStat = fs.lstatSync(intentDirectory);
      const intentStat = fs.lstatSync(intentPath);
      if (
        directoryStat.isSymbolicLink() ||
        !directoryStat.isDirectory() ||
        intentStat.isSymbolicLink() ||
        !intentStat.isFile()
      ) {
        throw new Error("migration intent is not a file");
      }
      const parsed = JSON.parse(fs.readFileSync(intentPath, "utf8"));
      if (!isExactMigrationIntent(parsed)) {
        throw new Error("invalid migration intent");
      }
      return true;
    } catch (_error) {
      throw new SessionGuardMigrationError(
        "miso_session_guard_migration_intent_invalid",
        "Miso session guard migration intent is invalid",
      );
    }
  };

  const persistPendingIntent = () => {
    if (readPendingIntent()) {
      return;
    }
    if (
      !hasReadableIntentStore() ||
      typeof fs?.mkdirSync !== "function" ||
      typeof fs?.writeFileSync !== "function" ||
      typeof fs?.renameSync !== "function" ||
      typeof fs?.unlinkSync !== "function"
    ) {
      throw new SessionGuardMigrationError(
        "miso_session_guard_migration_intent_unavailable",
        "Miso session guard migration intent is unavailable",
      );
    }
    const temporaryPath =
      `${intentPath}.tmp-${process.pid}-${now()}-` +
      Math.random().toString(36).slice(2);
    try {
      fs.mkdirSync(intentDirectory, { recursive: true, mode: 0o700 });
      const directoryStat = fs.lstatSync(intentDirectory);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
        throw new Error("migration intent directory is invalid");
      }
      if (typeof fs.chmodSync === "function") {
        fs.chmodSync(intentDirectory, 0o700);
      }
      fs.writeFileSync(temporaryPath, SESSION_GUARD_MIGRATION_INTENT_TEXT, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, intentPath);
      if (typeof fs.chmodSync === "function") {
        fs.chmodSync(intentPath, 0o600);
      }
    } catch (_error) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (_cleanupError) {
        // The temporary file may not have been created. Preserve the original
        // failure and never authorize a flagged spawn without the final file.
      }
      throw new SessionGuardMigrationError(
        "miso_session_guard_migration_intent_unavailable",
        "Miso session guard migration intent could not be persisted",
      );
    }
  };

  const consumePendingIntent = () => {
    if (!readPendingIntent()) {
      return;
    }
    if (typeof fs?.unlinkSync !== "function") {
      throw new SessionGuardMigrationError(
        "miso_session_guard_migration_intent_unavailable",
        "Miso session guard migration intent could not be consumed",
      );
    }
    try {
      fs.unlinkSync(intentPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw new SessionGuardMigrationError(
        "miso_session_guard_migration_intent_unavailable",
        "Miso session guard migration intent could not be consumed",
      );
    }
  };

  const parsePosixProcess = (line) => {
    const match = String(line || "").match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      return null;
    }
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3] || "",
    };
  };

  const inspectPosixProcesses = () => {
    const probe = spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (probe?.error || probe?.status !== 0 || typeof probe?.stdout !== "string") {
      return null;
    }
    return probe.stdout
      .split("\n")
      .map(parsePosixProcess)
      .filter(Boolean);
  };

  const inspectWindowsProcesses = () => {
    const probe = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (probe?.error || probe?.status !== 0 || typeof probe?.stdout !== "string") {
      return null;
    }
    try {
      const parsed = JSON.parse(probe.stdout || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          pid: Number(row?.ProcessId),
          ppid: Number(row?.ParentProcessId),
          command: typeof row?.CommandLine === "string" ? row.CommandLine : "",
        }))
        .filter(
          (row) =>
            Number.isSafeInteger(row.pid) &&
            row.pid > 0 &&
            Number.isSafeInteger(row.ppid) &&
            row.ppid >= 0,
        );
    } catch (_error) {
      return null;
    }
  };

  const inspectStaleMisoPids = (entrypoint) => {
    if (!entrypoint) {
      return { ok: false, pids: [] };
    }
    const scriptPath = Array.isArray(entrypoint.args) ? entrypoint.args[0] : "";
    const commandPath =
      typeof entrypoint.command === "string" ? entrypoint.command : "";
    const matchToken = String(scriptPath || commandPath || "").trim();
    if (!matchToken) {
      return { ok: false, pids: [] };
    }

    const rows =
      platform === "win32" ? inspectWindowsProcesses() : inspectPosixProcesses();
    if (!rows) {
      return { ok: false, pids: [] };
    }
    const livePids = new Set(rows.map((row) => row.pid));
    const pids = rows
      .filter((row) => {
        if (row.pid === process.pid || !row.command.includes(matchToken)) {
          return false;
        }
        if (row.command.includes(DURABLE_JOB_WORKER_FLAG)) {
          return false;
        }
        return platform === "win32"
          ? row.ppid === 0 || !livePids.has(row.ppid)
          : row.ppid === 1;
      })
      .map((row) => row.pid);
    return { ok: true, pids: [...new Set(pids)] };
  };

  const signalProcesses = (pids, signal) => {
    for (const pid of pids) {
      try {
        killProcess(pid, signal);
      } catch (error) {
        if (error?.code !== "ESRCH") {
          return false;
        }
      }
    }
    return true;
  };

  const terminateStaleMisoProcesses = (entrypoint) => {
    const inspection = inspectStaleMisoPids(entrypoint);
    if (inspection.ok) {
      signalProcesses(inspection.pids, "SIGTERM");
    }
  };

  const waitForNoStaleMisoProcesses = async (entrypoint, deadline) => {
    while (now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(pollMs);
      const inspection = inspectStaleMisoPids(entrypoint);
      if (!inspection.ok) {
        return { ok: false, pids: [] };
      }
      if (inspection.pids.length === 0) {
        return { ok: true, pids: [] };
      }
    }
    return inspectStaleMisoPids(entrypoint);
  };

  const terminateStaleMisoProcessesAndWait = async (entrypoint) => {
    let inspection = inspectStaleMisoPids(entrypoint);
    if (!inspection.ok) {
      return false;
    }
    if (inspection.pids.length === 0) {
      return true;
    }
    if (!signalProcesses(inspection.pids, "SIGTERM")) {
      return false;
    }
    inspection = await waitForNoStaleMisoProcesses(
      entrypoint,
      now() + termTimeoutMs,
    );
    if (!inspection.ok) {
      return false;
    }
    if (inspection.pids.length === 0) {
      return true;
    }
    if (!signalProcesses(inspection.pids, "SIGKILL")) {
      return false;
    }
    inspection = await waitForNoStaleMisoProcesses(
      entrypoint,
      now() + killTimeoutMs,
    );
    return inspection.ok && inspection.pids.length === 0;
  };

  return Object.freeze({
    readPendingIntent,
    persistPendingIntent,
    consumePendingIntent,
    terminateStaleMisoProcesses,
    terminateStaleMisoProcessesAndWait,
  });
};

module.exports = {
  SESSION_GUARD_MIGRATION_ENV,
  SessionGuardMigrationError,
  createSessionGuardMigrationController,
  validateSessionGuardMigrationReceipt,
};
