// Main-process-only one-shot Vault sink worker launcher.
//
// Plaintext crosses exactly one boundary: the length-prefixed JSON request on
// the worker's stdin. It is never placed in argv, cwd, environment, stderr,
// logs, or an error message. Production must inject the already-resolved
// unchain-server entrypoint; this module never searches for a Python runtime.

const childProcess = require("child_process");
const path = require("path");
const { containsAnySecret } = require("./secret_variants");

const VAULT_SINK_WORKER_VERSION = 1;
const VAULT_SINK_WORKER_MAX_REQUEST_BYTES = 1024 * 1024;
const VAULT_SINK_WORKER_MAX_RESPONSE_BYTES = 32 * 1024;
const VAULT_SINK_WORKER_DEFAULT_TIMEOUT_MS = 610 * 1000;
const VAULT_SINK_WORKER_MAX_TIMEOUT_MS = 620 * 1000;
const VAULT_SINK_KINDS = Object.freeze([
  "computer_input",
  "shell_secret_env",
  "shell_secret_stdin",
  "mcp_schema_secret",
]);
const VAULT_SINK_KIND_SET = new Set(VAULT_SINK_KINDS);
const WINDOWS_SINK_CAPABILITY_PROTOCOL = 1;
const WINDOWS_SINK_CAPABILITY_CONTAINMENT = "win32_job_list_v1";
// This is the W0 support decision, not a runtime fallback. W2/W4 may only add
// a kind after its installed-package containment evidence is recorded.
const WINDOWS_W0_APPROVED_SINK_KINDS = Object.freeze([]);
const VAULT_SINK_SUPERVISOR_CONTROL_PROTOCOL = 1;
const VAULT_SINK_SUPERVISOR_CONTROL_MAX_BYTES = 256;
const VAULT_SINK_SUPERVISOR_READY_TIMEOUT_MS = 10 * 1000;
const VAULT_SINK_SUPERVISOR_READY_BODY = Buffer.from(
  '{"containment":"win32_job_list_v1","kind":"ready","protocol":1}',
  "utf8",
);
const VAULT_SINK_SUPERVISOR_ERROR_CODES = Object.freeze([
  "vault_worker_containment_unsupported",
  "vault_worker_parent_unavailable",
  "vault_worker_job_setup_failed",
  "vault_worker_handle_setup_failed",
  "vault_worker_spawn_failed",
  "vault_worker_attestation_failed",
  "vault_worker_ready_timeout",
]);
const SAFE_ERROR_PATTERN = /^vault_[a-z0-9_]{1,80}$/;
// eslint-disable-next-line no-control-regex
const SAFE_FIELD_PATTERN = /^[^\u0000-\u001f\u007f]{1,512}$/u;
const SAFE_ENV_KEYS = Object.freeze([
  "COMSPEC",
  "LANG",
  "LC_ALL",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
]);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const hasExactKeys = (value, keys) =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

const workerError = (code) => {
  const normalized = SAFE_ERROR_PATTERN.test(String(code || ""))
    ? String(code)
    : "vault_worker_failed";
  const error = new Error(`[${normalized}] vault sink worker failed`);
  error.code = normalized;
  return error;
};

// This intentionally compares bytes instead of parsing JSON. The supervisor
// control channel is a small, closed, versioned union; accepting semantically
// equivalent JSON would silently widen that protocol boundary.
const parseSupervisorControlFrame = (frame) => {
  if (!Buffer.isBuffer(frame) || frame.length < 5) {
    throw workerError("vault_worker_ready_protocol_error");
  }
  const bodyLength = frame.readUInt32BE(0);
  if (
    bodyLength < 1 ||
    bodyLength > VAULT_SINK_SUPERVISOR_CONTROL_MAX_BYTES ||
    frame.length !== bodyLength + 4
  ) {
    throw workerError("vault_worker_ready_protocol_error");
  }
  const body = frame.subarray(4);
  if (body.equals(VAULT_SINK_SUPERVISOR_READY_BODY)) {
    return Object.freeze({ kind: "ready" });
  }
  for (const code of VAULT_SINK_SUPERVISOR_ERROR_CODES) {
    const expectedBody = Buffer.from(
      `{"code":"${code}","kind":"error","protocol":${VAULT_SINK_SUPERVISOR_CONTROL_PROTOCOL}}`,
      "utf8",
    );
    if (body.equals(expectedBody)) {
      return Object.freeze({ code, kind: "error" });
    }
  }
  throw workerError("vault_worker_ready_protocol_error");
};

const resolveWindowsRegistrySinkKinds = (windowsSinkCapability) => {
  // No supervisor attestation means no provider is registered. The caller will
  // therefore fail before prepare/decrypt with vault_sink_unavailable.
  if (windowsSinkCapability === undefined || windowsSinkCapability === null) {
    return [];
  }
  if (
    !hasExactKeys(windowsSinkCapability, [
      "containment",
      "enabled_sink_kinds",
      "protocol",
    ]) ||
    windowsSinkCapability.protocol !== WINDOWS_SINK_CAPABILITY_PROTOCOL ||
    windowsSinkCapability.containment !== WINDOWS_SINK_CAPABILITY_CONTAINMENT ||
    !Array.isArray(windowsSinkCapability.enabled_sink_kinds)
  ) {
    throw workerError("vault_sink_capability_invalid");
  }
  const seen = new Set();
  for (const sinkKind of windowsSinkCapability.enabled_sink_kinds) {
    if (
      typeof sinkKind !== "string" ||
      !VAULT_SINK_KIND_SET.has(sinkKind) ||
      seen.has(sinkKind) ||
      !WINDOWS_W0_APPROVED_SINK_KINDS.includes(sinkKind)
    ) {
      // A partial capability is never downgraded by silently dropping entries:
      // that could make Electron and the installed supervisor disagree.
      throw workerError("vault_sink_capability_invalid");
    }
    seen.add(sinkKind);
  }
  return [...seen];
};

const boundedTimeout = (value) => {
  if (!Number.isFinite(value)) return VAULT_SINK_WORKER_DEFAULT_TIMEOUT_MS;
  return Math.max(
    1000,
    Math.min(VAULT_SINK_WORKER_MAX_TIMEOUT_MS, Math.trunc(value)),
  );
};

const normalizeEntrypoint = (entrypoint) => {
  if (!isPlainObject(entrypoint)) throw workerError("vault_worker_unavailable");
  const command = entrypoint.command;
  const args = entrypoint.args === undefined ? [] : entrypoint.args;
  const cwd = entrypoint.cwd === undefined ? null : entrypoint.cwd;
  const dataDir = entrypoint.dataDir;
  const mcpRuntimeDir =
    entrypoint.mcpRuntimeDir === undefined ? null : entrypoint.mcpRuntimeDir;
  if (
    typeof command !== "string" ||
    !command ||
    command.includes("\0") ||
    !path.isAbsolute(command) ||
    !Array.isArray(args) ||
    args.length > 64 ||
    args.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.includes("\0") ||
        Buffer.byteLength(argument, "utf8") > 16 * 1024,
    ) ||
    (cwd !== null &&
      (typeof cwd !== "string" ||
        !cwd ||
        cwd.includes("\0") ||
        !path.isAbsolute(cwd))) ||
    typeof dataDir !== "string" ||
    !dataDir ||
    dataDir.includes("\0") ||
    !path.isAbsolute(dataDir) ||
    (mcpRuntimeDir !== null &&
      (typeof mcpRuntimeDir !== "string" ||
        !mcpRuntimeDir ||
        mcpRuntimeDir.includes("\0") ||
        !path.isAbsolute(mcpRuntimeDir)))
  ) {
    throw workerError("vault_worker_unavailable");
  }
  return { command, args: [...args], cwd, dataDir, mcpRuntimeDir };
};

const minimalWorkerEnv = ({
  dataDir,
  mcpRuntimeDir,
  environmentSource,
  electronPid = null,
}) => {
  const source = isPlainObject(environmentSource) ? environmentSource : {};
  const env = Object.create(null);
  env.UNCHAIN_DATA_DIR = dataDir;
  if (mcpRuntimeDir) env.PUPU_MCP_RUNTIME_DIR = mcpRuntimeDir;
  if (electronPid !== null) env.PUPU_VAULT_ELECTRON_PID = electronPid;
  for (const key of SAFE_ENV_KEYS) {
    if (typeof source[key] === "string" && source[key]) env[key] = source[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if (/^LC_[A-Za-z0-9_]+$/.test(key) && typeof value === "string" && value) {
      env[key] = value;
    }
  }
  return env;
};

const supervisorArgsFor = (args) => {
  if (
    !Array.isArray(args) ||
    args.length < 1 ||
    args.at(-1) !== "--vault-sink-worker" ||
    args.filter((item) => item === "--vault-sink-worker").length !== 1
  ) {
    throw workerError("vault_worker_unavailable");
  }
  return [...args.slice(0, -1), "--vault-sink-supervisor"];
};

const normalizeElectronPid = (value) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffffffff) {
    throw workerError("vault_worker_unavailable");
  }
  return String(value);
};

// Encoding coverage lives in ./secret_variants so this leak check, the Vault
// service's result redaction and the deposit label guard can never drift apart
// — a secret that slips past the weakest of the three slips past all of them.
// The shared generator is a strict superset of the list this module used to
// carry (it adds NFC/NFKC forms, unpadded base64url and upper-case hex, and
// folds case for EVERY variant rather than only the %/hex-looking ones).
const responseContainsSecret = (rawResponse, plaintexts) =>
  containsAnySecret(rawResponse.toString("utf8"), plaintexts);

const buildWorkerRequest = (payload) => {
  if (!isPlainObject(payload)) throw workerError("vault_invalid_request");
  const sinkKind = payload.sinkKind;
  const auditArguments = payload.auditArguments;
  const secrets = payload.secrets;
  if (
    !VAULT_SINK_KIND_SET.has(sinkKind) ||
    !isPlainObject(auditArguments) ||
    !Array.isArray(secrets) ||
    secrets.length < 1 ||
    secrets.length > 32
  ) {
    throw workerError("vault_invalid_request");
  }
  const fields = new Set();
  const plaintextBindings = secrets.map((secret) => {
    if (
      !isPlainObject(secret) ||
      typeof secret.field !== "string" ||
      !SAFE_FIELD_PATTERN.test(secret.field) ||
      fields.has(secret.field) ||
      typeof secret.plaintext !== "string" ||
      !secret.plaintext ||
      Buffer.byteLength(secret.plaintext, "utf8") > 64 * 1024
    ) {
      throw workerError("vault_invalid_request");
    }
    fields.add(secret.field);
    return { field: secret.field, plaintext: secret.plaintext };
  });

  let toolkitMetadata = {};
  if (sinkKind === "mcp_schema_secret") {
    const secretFields = auditArguments.secret_fields;
    if (
      typeof auditArguments.toolkit_id !== "string" ||
      typeof auditArguments.tool_name !== "string" ||
      !Array.isArray(secretFields) ||
      typeof payload.schemaFingerprint !== "string"
    ) {
      throw workerError("vault_invalid_request");
    }
    toolkitMetadata = {
      toolkit_id: auditArguments.toolkit_id,
      tool_name: auditArguments.tool_name,
      secret_fields: [...secretFields],
      schema_fingerprint: payload.schemaFingerprint,
    };
  }

  let nonSecretEnvelope;
  try {
    nonSecretEnvelope = Buffer.from(
      JSON.stringify({
        audit_arguments: auditArguments,
        toolkit_metadata: toolkitMetadata,
      }),
      "utf8",
    );
  } catch (_error) {
    throw workerError("vault_invalid_request");
  }
  const plaintexts = plaintextBindings.map((binding) => binding.plaintext);
  const containsPlaintext = responseContainsSecret(
    nonSecretEnvelope,
    plaintexts,
  );
  nonSecretEnvelope.fill(0);
  if (containsPlaintext) {
    throw workerError("vault_audit_contains_plaintext");
  }

  return {
    request: {
      version: VAULT_SINK_WORKER_VERSION,
      sink_kind: sinkKind,
      plaintext_bindings: plaintextBindings,
      audit_arguments: auditArguments,
      toolkit_metadata: toolkitMetadata,
    },
    plaintexts,
  };
};

const frameRequest = (request) => {
  let body;
  try {
    body = Buffer.from(JSON.stringify(request), "utf8");
  } catch (_error) {
    throw workerError("vault_invalid_request");
  }
  if (body.length < 1 || body.length > VAULT_SINK_WORKER_MAX_REQUEST_BYTES) {
    body.fill(0);
    throw workerError("vault_worker_request_too_large");
  }
  const frame = Buffer.allocUnsafe(4 + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  body.fill(0);
  return frame;
};

const terminateChild = (child, platform, processKill) => {
  if (!child) return;
  if (platform !== "win32" && Number.isInteger(child.pid) && child.pid > 0) {
    try {
      processKill(-child.pid, "SIGKILL");
    } catch (_error) {
      // The child may already have exited; direct kill below is best effort.
    }
  }
  try {
    child.kill("SIGKILL");
  } catch (_error) {
    // Static failure is returned by the caller; never surface kill details.
  }
};

const awaitSupervisorReady = (child, timeoutMs) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const chunks = [];
    let size = 0;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      if (error) reject(error);
      else resolve();
    };
    const onError = () => finish(workerError("vault_worker_spawn_failed"));
    const onClose = () => finish(workerError("vault_worker_spawn_failed"));
    const onData = (chunk) => {
      const bytes = Buffer.from(chunk);
      if (settled) {
        bytes.fill(0);
        return;
      }
      size += bytes.length;
      if (size > VAULT_SINK_SUPERVISOR_CONTROL_MAX_BYTES + 4) {
        bytes.fill(0);
        finish(workerError("vault_worker_ready_protocol_error"));
        return;
      }
      chunks.push(bytes);
      const frame = Buffer.concat(chunks, size);
      try {
        if (frame.length < 4) return;
        const bodyLength = frame.readUInt32BE(0);
        if (
          bodyLength < 1 ||
          bodyLength > VAULT_SINK_SUPERVISOR_CONTROL_MAX_BYTES ||
          frame.length > bodyLength + 4
        ) {
          finish(workerError("vault_worker_ready_protocol_error"));
          return;
        }
        if (frame.length !== bodyLength + 4) return;
        const control = parseSupervisorControlFrame(frame);
        if (control.kind !== "ready") {
          finish(workerError(control.code));
          return;
        }
        finish(null);
      } catch (error) {
        finish(error?.code ? error : workerError("vault_worker_ready_protocol_error"));
      } finally {
        frame.fill(0);
      }
    };
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("close", onClose);
    timer = setTimeout(
      () => finish(workerError("vault_worker_ready_timeout")),
      timeoutMs,
    );
  });

// Registry-scoped bookkeeping for every live worker process group.
//
// A one-shot worker normally reaps its own group on the terminal path, but an
// abrupt quit (`will-quit`) has no terminal path to run: the promise never
// settles. The tracker is what makes the drain SYNCHRONOUS — close() must not
// await anything, because Electron does not wait for promises on will-quit and
// a surviving MCP descendant would outlive the one-intent secret boundary.
const createChildTracker = ({ platform, processKill } = {}) => {
  const resolvedPlatform =
    typeof platform === "string" && platform ? platform : process.platform;
  const resolvedKill =
    typeof processKill === "function" ? processKill : process.kill.bind(process);
  const children = new Map();
  let closed = false;

  return {
    isClosed: () => closed,
    size: () => children.size,
    add: (child, drainedPromise = Promise.resolve()) => {
      // Lost the race against close(): refuse rather than leak an untracked
      // process group past the drain.
      if (closed || !child) return false;
      children.set(child, Promise.resolve(drainedPromise));
      return true;
    },
    remove: (child) => {
      children.delete(child);
    },
    // Suspend/cancel stops only the currently leased workers. Unlike close(),
    // it deliberately leaves the registry open so a later resumed session
    // receives a fresh supervisor and cannot reuse an old lease.
    abortActive: () => {
      let terminated = 0;
      for (const child of children.keys()) {
        terminateChild(child, resolvedPlatform, resolvedKill);
        terminated += 1;
      }
      return terminated;
    },
    close: () => {
      closed = true;
      let terminated = 0;
      for (const child of children.keys()) {
        terminateChild(child, resolvedPlatform, resolvedKill);
        terminated += 1;
      }
      return terminated;
    },
    awaitDrained: async () => {
      await Promise.allSettled([...children.values()]);
    },
  };
};

const runFramedWorker = ({
  child,
  frame,
  plaintexts,
  sinkKind,
  timeoutMs,
  platform,
  processKill,
}) =>
  new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let responseLength = null;
    let responseBytes = 0;
    const responseChunks = [];
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      frame.fill(0);
      for (const chunk of responseChunks) {
        if (Buffer.isBuffer(chunk)) chunk.fill(0);
      }
      responseChunks.length = 0;
      // A successfully framed worker may still have spawned MCP descendants.
      // Reap its detached process group on every terminal path, not only on
      // timeout/error, so no child can outlive the one-intent secret boundary.
      terminateChild(child, platform, processKill);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    timer = setTimeout(() => {
      finish(workerError("vault_worker_timeout"));
    }, timeoutMs);

    child.on("error", () => finish(workerError("vault_worker_spawn_failed")));
    child.stdout.on("data", (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (settled) {
        bytes.fill(0);
        return;
      }
      responseBytes += bytes.length;
      if (responseBytes > VAULT_SINK_WORKER_MAX_RESPONSE_BYTES + 4) {
        bytes.fill(0);
        finish(workerError("vault_worker_output_too_large"));
        return;
      }
      responseChunks.push(bytes);
      const buffered = Buffer.concat(responseChunks, responseBytes);
      try {
        if (responseLength === null && buffered.length >= 4) {
          responseLength = buffered.readUInt32BE(0);
          if (
            responseLength < 1 ||
            responseLength > VAULT_SINK_WORKER_MAX_RESPONSE_BYTES
          ) {
            finish(workerError("vault_worker_protocol_error"));
            return;
          }
        }
        if (responseLength !== null && buffered.length > responseLength + 4) {
          finish(workerError("vault_worker_protocol_error"));
        }
      } finally {
        buffered.fill(0);
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(workerError("vault_worker_failed"));
        return;
      }
      const raw = Buffer.concat(responseChunks, responseBytes);
      try {
        if (
          raw.length < 4 ||
          responseLength === null ||
          raw.length !== responseLength + 4
        ) {
          finish(workerError("vault_worker_protocol_error"));
          return;
        }
        const body = raw.subarray(4);
        if (responseContainsSecret(body, plaintexts)) {
          finish(workerError("vault_worker_secret_leak"));
          return;
        }
        let response;
        try {
          response = JSON.parse(body.toString("utf8"));
        } catch (_error) {
          finish(workerError("vault_worker_protocol_error"));
          return;
        }
        if (
          !isPlainObject(response) ||
          response.version !== VAULT_SINK_WORKER_VERSION
        ) {
          finish(workerError("vault_worker_protocol_error"));
          return;
        }
        if (response.ok === false) {
          if (
            !hasExactKeys(response, ["version", "ok", "error"]) ||
            !hasExactKeys(response.error, ["code"]) ||
            !SAFE_ERROR_PATTERN.test(response.error.code)
          ) {
            finish(workerError("vault_worker_protocol_error"));
            return;
          }
          finish(workerError(response.error.code));
          return;
        }
        if (
          response.ok !== true ||
          !hasExactKeys(response, ["version", "ok", "sink_kind", "result"]) ||
          response.sink_kind !== sinkKind ||
          !VAULT_SINK_KIND_SET.has(response.sink_kind)
        ) {
          finish(workerError("vault_worker_protocol_error"));
          return;
        }
        finish(null, response);
      } finally {
        raw.fill(0);
      }
    });
    child.stdin.on("error", () =>
      finish(workerError("vault_worker_protocol_error")),
    );
    child.stdin.end(frame, () => frame.fill(0));
  });

const prepareFramedWorkerLease = async ({
  entrypoint,
  sinkKind,
  spawn,
  environmentSource,
  timeoutMs,
  platform,
  processKill,
  tracker,
  electronPid,
}) => {
  let child;
  try {
    child = spawn(
      entrypoint.command,
      platform === "win32"
        ? supervisorArgsFor(entrypoint.args)
        : entrypoint.args,
      {
        cwd: entrypoint.cwd || undefined,
        env: minimalWorkerEnv({
          dataDir: entrypoint.dataDir,
          mcpRuntimeDir: entrypoint.mcpRuntimeDir,
          environmentSource,
          electronPid,
        }),
        stdio: ["pipe", "pipe", "ignore"],
        shell: false,
        windowsHide: true,
        detached: platform !== "win32",
      },
    );
  } catch (_error) {
    throw workerError("vault_worker_spawn_failed");
  }

  let spawned = false;
  let closed = false;
  let aborted = false;
  let executeStarted = false;
  let preExecuteError = null;
  let resolveDrained;
  const drainedPromise = new Promise((resolve) => {
    resolveDrained = resolve;
  });
  const finishDrained = () => {
    if (closed) return;
    closed = true;
    tracker.remove(child);
    resolveDrained();
  };

  if (!tracker.add(child, drainedPromise)) {
    terminateChild(child, platform, processKill);
    throw workerError("vault_worker_unavailable");
  }

  child.once("close", finishDrained);
  const preExecuteStdout = (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes.fill(0);
    if (!executeStarted && !preExecuteError) {
      preExecuteError = workerError("vault_worker_protocol_error");
      terminateChild(child, platform, processKill);
    }
  };
  const readyPromise = new Promise((resolve, reject) => {
    const onSpawn = () => {
      spawned = true;
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      if (!spawned) finishDrained();
      reject(workerError("vault_worker_spawn_failed"));
    };
    const onClose = () => {
      cleanup();
      reject(workerError("vault_worker_spawn_failed"));
    };
    const cleanup = () => {
      child.removeListener("spawn", onSpawn);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("close", onClose);
  });

  try {
    await readyPromise;
    if (platform === "win32") {
      await awaitSupervisorReady(child, VAULT_SINK_SUPERVISOR_READY_TIMEOUT_MS);
    }
    child.stdout.on("data", preExecuteStdout);
  } catch (error) {
    child.stdout.removeListener("data", preExecuteStdout);
    terminateChild(child, platform, processKill);
    throw error;
  }

  const onPostReadyError = () => {
    if (!executeStarted && !preExecuteError) {
      preExecuteError = workerError("vault_worker_spawn_failed");
      // The process was already observed as spawned. Do not remove it from the
      // tracker on an error event alone: only the real close event proves the
      // process boundary drained.
      terminateChild(child, platform, processKill);
    }
  };
  child.on("error", onPostReadyError);
  drainedPromise.finally(() => {
    child.removeListener("error", onPostReadyError);
    child.stdout.removeListener("data", preExecuteStdout);
  });

  const lease = {
    execute: async (payload) => {
      if (executeStarted || aborted || closed || preExecuteError) {
        throw preExecuteError || workerError("vault_worker_unavailable");
      }
      if (!isPlainObject(payload) || payload.sinkKind !== sinkKind) {
        throw workerError("vault_invalid_request");
      }
      executeStarted = true;
      child.stdout.removeListener("data", preExecuteStdout);
      let request;
      let plaintexts;
      let frame;
      try {
        ({ request, plaintexts } = buildWorkerRequest(payload));
        frame = frameRequest(request);
      } catch (error) {
        aborted = true;
        terminateChild(child, platform, processKill);
        throw error;
      }
      return runFramedWorker({
        child,
        frame,
        plaintexts,
        sinkKind,
        timeoutMs,
        platform,
        processKill,
      });
    },
    abort: () => {
      if (aborted) return false;
      aborted = true;
      terminateChild(child, platform, processKill);
      return true;
    },
    awaitDrained: () => drainedPromise,
  };
  return Object.freeze(lease);
};

const createVaultSinkExecutor = ({
  command,
  args = [],
  cwd = null,
  dataDir,
  mcpRuntimeDir = null,
  resolveEntrypoint,
  spawn = childProcess.spawn,
  environmentSource = process.env,
  timeoutMs,
  platform = process.platform,
  processKill = process.kill.bind(process),
  electronPid = process.pid,
  // Shared, registry-scoped process-group bookkeeping. Omitted → this executor
  // owns a private tracker so a standalone executor behaves identically.
  tracker,
} = {}) => {
  if (
    typeof spawn !== "function" ||
    (resolveEntrypoint !== undefined && typeof resolveEntrypoint !== "function")
  ) {
    throw new Error("createVaultSinkExecutor: invalid dependencies");
  }
  const staticEntrypoint = resolveEntrypoint
    ? null
    : normalizeEntrypoint({ command, args, cwd, dataDir, mcpRuntimeDir });
  const resolvedTimeoutMs = boundedTimeout(timeoutMs);
  const resolvedTracker =
    tracker || createChildTracker({ platform, processKill });

  return Object.freeze({
    prepare: async (identity) => {
      if (
        !isPlainObject(identity) ||
        Object.keys(identity).length !== 1 ||
        !VAULT_SINK_KIND_SET.has(identity.sinkKind)
      ) {
        throw workerError("vault_invalid_request");
      }
      if (resolvedTracker.isClosed()) {
        throw workerError("vault_worker_unavailable");
      }
      const entrypoint = resolveEntrypoint
        ? normalizeEntrypoint(await resolveEntrypoint())
        : staticEntrypoint;
      if (resolvedTracker.isClosed()) {
        throw workerError("vault_worker_unavailable");
      }
      return prepareFramedWorkerLease({
        entrypoint,
        sinkKind: identity.sinkKind,
        spawn,
        environmentSource,
        timeoutMs: resolvedTimeoutMs,
        platform,
        processKill,
        tracker: resolvedTracker,
        electronPid:
          platform === "win32" ? normalizeElectronPid(electronPid) : null,
      });
    },
  });
};

// The production registry object. `providers` is the closed sink_kind →
// prepared-lease provider map
// the Vault service consumes; `close()` is the synchronous drain the owner
// (memoryVaultService.close / app will-quit) calls so no worker process group
// survives the app.
const createVaultSinkExecutors = (options = {}) => {
  const platform =
    typeof options.platform === "string" && options.platform
      ? options.platform
      : process.platform;
  const processKill =
    typeof options.processKill === "function"
      ? options.processKill
      : process.kill.bind(process);
  const tracker = createChildTracker({ platform, processKill });
  const sinkKinds =
    platform === "win32"
      ? resolveWindowsRegistrySinkKinds(options.windowsSinkCapability)
      : VAULT_SINK_KINDS;
  const provider =
    sinkKinds.length > 0
      ? createVaultSinkExecutor({ ...options, tracker })
      : null;
  const providers = Object.freeze(
    Object.fromEntries(sinkKinds.map((sinkKind) => [sinkKind, provider])),
  );
  return Object.freeze({
    providers,
    abortActive: () => tracker.abortActive(),
    close: () => tracker.close(),
    awaitDrained: () => tracker.awaitDrained(),
    activeChildCount: () => tracker.size(),
    isClosed: () => tracker.isClosed(),
  });
};

module.exports = {
  createVaultSinkExecutor,
  createVaultSinkExecutors,
  createChildTracker,
  parseSupervisorControlFrame,
  VAULT_SINK_KINDS,
  VAULT_SINK_WORKER_MAX_REQUEST_BYTES,
  VAULT_SINK_WORKER_MAX_RESPONSE_BYTES,
};
