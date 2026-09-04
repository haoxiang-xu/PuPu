const childProcess = require("child_process");
const path = require("path");
const {
  parseSupervisorControlFrame,
} = require("../memory_vault/vault_sink_executor");

const MAX_FRAME_BYTES = 1024 * 1024;
const READY_TIMEOUT_MS = 10 * 1000;
const WORKER_ERROR_BODY = Buffer.from(
  '{"error":{"code":"vault_worker_protocol_error"},"ok":false,"version":1}',
  "utf8",
);
const VAULT_SINK_WORKER_FLAG = "--vault-sink-worker";
const VAULT_SINK_SUPERVISOR_FLAG = "--vault-sink-supervisor";
const STATIC_CODE = /^vault_[a-z0-9_]{1,80}$/;

const probeError = (code) => {
  const normalized = STATIC_CODE.test(String(code || ""))
    ? String(code)
    : "vault_worker_probe_failed";
  const error = new Error(`[${normalized}] Windows Vault probe failed`);
  error.code = normalized;
  return error;
};

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const normalizeEntrypoint = (entrypoint) => {
  if (!isPlainObject(entrypoint)) throw probeError("vault_worker_unavailable");
  const command = entrypoint.command;
  const args = entrypoint.args;
  const cwd = entrypoint.cwd === undefined ? null : entrypoint.cwd;
  const dataDir = entrypoint.dataDir;
  if (
    typeof command !== "string" ||
    !path.isAbsolute(command) ||
    !Array.isArray(args) ||
    args.length < 1 ||
    args.at(-1) !== VAULT_SINK_WORKER_FLAG ||
    args.filter((item) => item === VAULT_SINK_WORKER_FLAG).length !== 1 ||
    args.some((item) => typeof item !== "string" || item.includes("\0")) ||
    (cwd !== null && (typeof cwd !== "string" || !path.isAbsolute(cwd))) ||
    typeof dataDir !== "string" ||
    !path.isAbsolute(dataDir)
  ) {
    throw probeError("vault_worker_unavailable");
  }
  return Object.freeze({ command, args: [...args], cwd, dataDir });
};

const supervisorArgsFor = (args) => [
  ...args.slice(0, -1),
  VAULT_SINK_SUPERVISOR_FLAG,
];

const minimalProbeEnv = ({ dataDir, electronPid, environmentSource }) => {
  if (!Number.isSafeInteger(electronPid) || electronPid < 1) {
    throw probeError("vault_worker_parent_unavailable");
  }
  const source = isPlainObject(environmentSource) ? environmentSource : {};
  const environment = Object.create(null);
  environment.PUPU_VAULT_ELECTRON_PID = String(electronPid);
  environment.UNCHAIN_DATA_DIR = dataDir;
  for (const key of ["COMSPEC", "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR"]) {
    if (typeof source[key] === "string" && source[key]) {
      environment[key] = source[key];
    }
  }
  return environment;
};

const frameBody = (body) => {
  const frame = Buffer.allocUnsafe(body.length + 4);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
};

const awaitSpawn = (child) =>
  new Promise((resolve, reject) => {
    const clean = () => {
      child.removeListener("spawn", onSpawn);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
    };
    const onSpawn = () => {
      clean();
      resolve();
    };
    const onError = () => {
      clean();
      reject(probeError("vault_worker_spawn_failed"));
    };
    const onClose = () => {
      clean();
      reject(probeError("vault_worker_spawn_failed"));
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("close", onClose);
  });

const readFrame = (child, timeoutMs) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks = [];
    const finish = (error, body = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      if (error) reject(error);
      else resolve(body);
    };
    const onError = () => finish(probeError("vault_worker_probe_protocol_error"));
    const onClose = () => finish(probeError("vault_worker_probe_protocol_error"));
    const onData = (chunk) => {
      const bytes = Buffer.from(chunk);
      if (settled) {
        bytes.fill(0);
        return;
      }
      size += bytes.length;
      if (size > MAX_FRAME_BYTES + 4) {
        bytes.fill(0);
        finish(probeError("vault_worker_probe_protocol_error"));
        return;
      }
      chunks.push(bytes);
      const buffered = Buffer.concat(chunks, size);
      try {
        if (buffered.length < 4) return;
        const bodyLength = buffered.readUInt32BE(0);
        if (
          bodyLength < 1 ||
          bodyLength > MAX_FRAME_BYTES ||
          buffered.length > bodyLength + 4
        ) {
          finish(probeError("vault_worker_probe_protocol_error"));
          return;
        }
        if (buffered.length !== bodyLength + 4) return;
        finish(null, Buffer.from(buffered.subarray(4)));
      } finally {
        buffered.fill(0);
      }
    };
    const timer = setTimeout(
      () => finish(probeError("vault_worker_ready_timeout")),
      timeoutMs,
    );
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("close", onClose);
  });

const awaitExit = (child, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(probeError("vault_worker_ready_timeout")),
      timeoutMs,
    );
    const finish = (error, code = null) => {
      clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      if (error) reject(error);
      else resolve(code);
    };
    const onError = () => finish(probeError("vault_worker_probe_protocol_error"));
    const onClose = (code) => finish(null, code);
    child.once("error", onError);
    child.once("close", onClose);
  });

const terminate = (child) => {
  try {
    child?.kill?.("SIGKILL");
  } catch (_error) {
    // A close race is not a successful probe and has no diagnostic payload.
  }
};

const probeWindowsVaultSupervisor = async ({
  electronPid = process.pid,
  entrypoint,
  environmentSource = process.env,
  platform = process.platform,
  spawn = childProcess.spawn,
  timeoutMs = READY_TIMEOUT_MS,
} = {}) => {
  if (platform !== "win32" || typeof spawn !== "function") {
    throw probeError("vault_worker_containment_unsupported");
  }
  const resolvedEntrypoint = normalizeEntrypoint(entrypoint);
  const resolvedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(1000, Math.min(60 * 1000, Math.trunc(timeoutMs)))
    : READY_TIMEOUT_MS;
  let child = null;
  try {
    child = spawn(resolvedEntrypoint.command, supervisorArgsFor(resolvedEntrypoint.args), {
      cwd: resolvedEntrypoint.cwd || undefined,
      detached: false,
      env: minimalProbeEnv({
        dataDir: resolvedEntrypoint.dataDir,
        electronPid,
        environmentSource,
      }),
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    if (!child?.stdin || !child?.stdout) {
      throw probeError("vault_worker_spawn_failed");
    }
    await awaitSpawn(child);

    const readyBody = await readFrame(child, resolvedTimeout);
    const readyFrame = frameBody(readyBody);
    readyBody.fill(0);
    try {
      const control = parseSupervisorControlFrame(readyFrame);
      if (control.kind !== "ready") {
        throw probeError(control.code || "vault_worker_probe_protocol_error");
      }
    } finally {
      readyFrame.fill(0);
    }

    const responsePromise = readFrame(child, resolvedTimeout);
    const malformedFrame = Buffer.alloc(4);
    child.stdin.end(malformedFrame);
    malformedFrame.fill(0);
    const responseBody = await responsePromise;
    const expected = responseBody.equals(WORKER_ERROR_BODY);
    responseBody.fill(0);
    if (!expected) throw probeError("vault_worker_probe_protocol_error");

    const exitCode = await awaitExit(child, resolvedTimeout);
    if (exitCode !== 0) throw probeError("vault_worker_probe_protocol_error");
    return Object.freeze({
      containment: "win32_job_list_v1",
      protocol: 1,
      supervisor_protocol: 1,
      worker_protocol: 1,
    });
  } catch (error) {
    terminate(child);
    throw error?.code ? error : probeError("vault_worker_probe_failed");
  }
};

module.exports = { probeWindowsVaultSupervisor };
