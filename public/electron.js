const {
  app,
  BrowserWindow,
  dialog,
  shell,
  ipcMain,
  webContents,
  nativeTheme,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const net = require("net");

/* ─── Ollama auto-start ───────────────────────────────────────────────────── */
let ollamaProcess = null;
let ollamaStatus = "checking"; // "checking" | "already_running" | "started" | "not_found" | "error"

const pingOllama = () =>
  new Promise((resolve) => {
    const req = http.get("http://localhost:11434", (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });

const startOllama = async () => {
  const already = await pingOllama();
  if (already) {
    ollamaStatus = "already_running";
    return;
  }

  ollamaProcess = spawn("ollama", ["serve"], {
    detached: false,
    stdio: "ignore",
    env: { ...process.env },
  });

  ollamaProcess.on("error", (err) => {
    ollamaStatus = err.code === "ENOENT" ? "not_found" : "error";
    ollamaProcess = null;
  });

  ollamaProcess.on("exit", () => {
    ollamaProcess = null;
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const up = await pingOllama();
  ollamaStatus = up ? "started" : "error";
};

const stopOllama = () => {
  if (ollamaProcess && !ollamaProcess.killed) {
    ollamaProcess.kill();
    ollamaProcess = null;
  }
};
/* ─── Ollama auto-start ───────────────────────────────────────────────────── */

/* ─── Miso sidecar ─────────────────────────────────────────────────────────── */
const MISO_HOST = "127.0.0.1";
const MISO_PORT_RANGE_START = 5879;
const MISO_PORT_RANGE_END = 5895;
const MISO_BOOT_TIMEOUT_MS = 10000;
const MISO_HEALTH_RETRY_MS = 250;
const MISO_RESTART_DELAY_MS = 1500;
const MISO_STREAM_ENDPOINT = "/chat/stream";
const MISO_STREAM_V2_ENDPOINT = "/chat/stream/v2";
const MISO_HEALTH_ENDPOINT = "/health";
const MISO_MODELS_CATALOG_ENDPOINT = "/models/catalog";
const MISO_TOOLKIT_CATALOG_ENDPOINT = "/toolkits/catalog";

let misoProcess = null;
let misoPort = null;
let misoStatus = "stopped"; // "stopped" | "starting" | "ready" | "error" | "not_found"
let misoStatusReason = "";
let misoAuthToken = "";
let misoRestartTimer = null;
let misoIsStopping = false;
let appIsQuitting = false;

const misoActiveStreams = new Map();

const THEME_MODE_TO_NATIVE_SOURCE = {
  dark_mode: "dark",
  light_mode: "light",
  sync_with_browser: "system",
  dark: "dark",
  light: "light",
  system: "system",
};

const normalizeThemeModeToNativeSource = (mode) => {
  if (typeof mode !== "string") {
    return "";
  }
  const normalizedMode = mode.trim().toLowerCase();
  return THEME_MODE_TO_NATIVE_SOURCE[normalizedMode] || "";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const looksLikeMisoSource = (sourcePath) =>
  fs.existsSync(path.join(sourcePath, "miso", "broth.py")) &&
  fs.existsSync(path.join(sourcePath, "miso", "__init__.py"));

const resolveDevMisoSourcePath = () => {
  const configuredSource = process.env.MISO_SOURCE_PATH;
  if (configuredSource && looksLikeMisoSource(configuredSource)) {
    return configuredSource;
  }

  const siblingSource = path.resolve(app.getAppPath(), "..", "miso");
  if (looksLikeMisoSource(siblingSource)) {
    return siblingSource;
  }

  return null;
};

const hasPythonModule = (pythonCommand, moduleName) => {
  if (!pythonCommand || !moduleName) {
    return false;
  }

  const probe = spawnSync(
    pythonCommand,
    [
      "-c",
      `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec("${moduleName}") else 1)`,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  if (probe.error) {
    return false;
  }

  return probe.status === 0;
};

const resolvePuPuVenvPythonPath = () => {
  const appPath = app.getAppPath();
  if (process.platform === "win32") {
    return path.join(appPath, ".venv", "Scripts", "python.exe");
  }
  return path.join(appPath, ".venv", "bin", "python");
};

const resolveMisoVenvPythonPath = () => {
  const misoSourcePath = resolveDevMisoSourcePath();
  if (!misoSourcePath) {
    return null;
  }

  if (process.platform === "win32") {
    return path.join(misoSourcePath, "venv", "Scripts", "python.exe");
  }
  return path.join(misoSourcePath, "venv", "bin", "python");
};

const pickBestPythonCommand = () => {
  const candidates = [];

  const pupuVenvPython = resolvePuPuVenvPythonPath();
  if (fs.existsSync(pupuVenvPython)) {
    candidates.push(pupuVenvPython);
  }

  const misoVenvPython = resolveMisoVenvPythonPath();
  if (misoVenvPython && fs.existsSync(misoVenvPython)) {
    candidates.push(misoVenvPython);
  }

  if (process.platform === "win32") {
    candidates.push("python");
  } else {
    candidates.push("python3", "python");
  }

  const uniqueCandidates = [...new Set(candidates)];
  const withFlask = uniqueCandidates.find((candidate) =>
    hasPythonModule(candidate, "flask"),
  );
  if (withFlask) {
    return withFlask;
  }

  return (
    uniqueCandidates[0] || (process.platform === "win32" ? "python" : "python3")
  );
};

const getMisoPythonCommand = () => {
  if (process.env.MISO_PYTHON_BIN) {
    return process.env.MISO_PYTHON_BIN;
  }
  return pickBestPythonCommand();
};

const getPackagedMisoBinaryPath = () => {
  if (process.platform === "darwin") {
    return path.join(
      process.resourcesPath,
      "miso_runtime",
      "dist",
      "macos",
      "miso-server",
    );
  }
  if (process.platform === "win32") {
    return path.join(
      process.resourcesPath,
      "miso_runtime",
      "dist",
      "windows",
      "miso-server.exe",
    );
  }
  return path.join(
    process.resourcesPath,
    "miso_runtime",
    "dist",
    "linux",
    "miso-server",
  );
};

const resolveMisoEntrypoint = () => {
  if (app.isPackaged) {
    const packagedBinary = getPackagedMisoBinaryPath();
    if (fs.existsSync(packagedBinary)) {
      return {
        command: packagedBinary,
        args: [],
        cwd: path.dirname(packagedBinary),
      };
    }

    const packagedScript = path.join(
      process.resourcesPath,
      "miso_runtime",
      "server",
      "main.py",
    );
    if (!fs.existsSync(packagedScript)) {
      return null;
    }
    return {
      command: getMisoPythonCommand(),
      args: [packagedScript],
      cwd: path.dirname(packagedScript),
    };
  }

  const devScript = path.join(
    app.getAppPath(),
    "miso_runtime",
    "server",
    "main.py",
  );
  if (!fs.existsSync(devScript)) {
    return null;
  }
  return {
    command: getMisoPythonCommand(),
    args: [devScript],
    cwd: path.dirname(devScript),
  };
};

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, MISO_HOST);
  });

const findAvailableMisoPort = async () => {
  for (
    let port = MISO_PORT_RANGE_START;
    port <= MISO_PORT_RANGE_END;
    port += 1
  ) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return MISO_PORT_RANGE_START;
};

const pingMiso = async () => {
  if (!misoPort) {
    return false;
  }

  try {
    const response = await fetch(
      `http://${MISO_HOST}:${misoPort}${MISO_HEALTH_ENDPOINT}`,
      {
        method: "GET",
        headers: misoAuthToken ? { "x-miso-auth": misoAuthToken } : {},
      },
    );
    return response.ok;
  } catch (_) {
    return false;
  }
};

const waitForMisoReady = async () => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MISO_BOOT_TIMEOUT_MS) {
    if (!misoProcess || misoProcess.killed) {
      return false;
    }

    // eslint-disable-next-line no-await-in-loop
    if (await pingMiso()) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(MISO_HEALTH_RETRY_MS);
  }

  return false;
};

const getMisoStatusPayload = () => ({
  status: misoStatus,
  reason: misoStatusReason || "",
  ready: misoStatus === "ready",
  pid: misoProcess?.pid || null,
  port: misoPort,
  url: misoPort ? `http://${MISO_HOST}:${misoPort}` : null,
});

const getMisoModelCatalogPayload = async () => {
  if (misoStatus !== "ready" || !misoPort) {
    throw new Error("Miso service is not ready");
  }

  const response = await fetch(
    `http://${MISO_HOST}:${misoPort}${MISO_MODELS_CATALOG_ENDPOINT}`,
    {
      method: "GET",
      headers: misoAuthToken ? { "x-miso-auth": misoAuthToken } : {},
    },
  );

  const bodyText = await response.text();
  if (!response.ok) {
    let message = `Miso model catalog request failed (${response.status})`;
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText);
        const serverMessage = parsed?.error?.message || parsed?.message;
        if (serverMessage) {
          message = String(serverMessage);
        }
      } catch (_) {
        message = bodyText.slice(0, 200);
      }
    }
    throw new Error(message);
  }

  if (!bodyText) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch (_) {
    throw new Error("Invalid Miso model catalog response");
  }
};

const getMisoToolkitCatalogPayload = async () => {
  if (misoStatus !== "ready" || !misoPort) {
    throw new Error("Miso service is not ready");
  }

  const response = await fetch(
    `http://${MISO_HOST}:${misoPort}${MISO_TOOLKIT_CATALOG_ENDPOINT}`,
    {
      method: "GET",
      headers: misoAuthToken ? { "x-miso-auth": misoAuthToken } : {},
    },
  );

  const bodyText = await response.text();
  if (!response.ok) {
    let message = `Miso toolkit catalog request failed (${response.status})`;
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText);
        const serverMessage = parsed?.error?.message || parsed?.message;
        if (serverMessage) message = String(serverMessage);
      } catch (_) {
        message = bodyText.slice(0, 200);
      }
    }
    throw new Error(message);
  }
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch (_) {
    throw new Error("Invalid Miso toolkit catalog response");
  }
};

const expandWorkspacePath = (candidatePath) => {
  if (typeof candidatePath !== "string") {
    return "";
  }
  const trimmed = candidatePath.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed === "~") {
    return app.getPath("home");
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(app.getPath("home"), trimmed.slice(2));
  }
  return trimmed;
};

const validateWorkspaceRootPath = (
  candidatePath,
  { allowEmpty = false } = {},
) => {
  const expanded = expandWorkspacePath(candidatePath);
  if (!expanded) {
    return allowEmpty
      ? { valid: true, resolvedPath: "", reason: "" }
      : {
          valid: false,
          resolvedPath: "",
          reason: "Workspace root is required.",
        };
  }

  const resolvedPath = path.resolve(expanded);
  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      resolvedPath: "",
      reason: `Workspace root does not exist: ${resolvedPath}`,
    };
  }

  let stats = null;
  try {
    stats = fs.statSync(resolvedPath);
  } catch (error) {
    return {
      valid: false,
      resolvedPath: "",
      reason:
        error?.message || `Unable to access workspace root: ${resolvedPath}`,
    };
  }

  if (!stats.isDirectory()) {
    return {
      valid: false,
      resolvedPath: "",
      reason: `Workspace root is not a directory: ${resolvedPath}`,
    };
  }

  return {
    valid: true,
    resolvedPath,
    reason: "",
  };
};

const emitMisoStreamEvent = (targetWebContentsId, requestId, event, data) => {
  const target = webContents.fromId(targetWebContentsId);
  if (!target || target.isDestroyed()) {
    return;
  }

  target.send("miso:stream:event", {
    requestId,
    event,
    data,
  });
};

const terminateAllMisoStreams = (event, data) => {
  for (const [requestId, streamState] of misoActiveStreams.entries()) {
    streamState.controller.abort();
    emitMisoStreamEvent(streamState.webContentsId, requestId, event, data);
  }
  misoActiveStreams.clear();
};

const scheduleMisoRestart = () => {
  if (appIsQuitting || misoRestartTimer) {
    return;
  }

  misoRestartTimer = setTimeout(() => {
    misoRestartTimer = null;
    startMiso();
  }, MISO_RESTART_DELAY_MS);
};

const stopMiso = () => {
  if (misoRestartTimer) {
    clearTimeout(misoRestartTimer);
    misoRestartTimer = null;
  }

  terminateAllMisoStreams("done", {
    cancelled: true,
    reason: "service_stopping",
  });

  if (misoProcess && !misoProcess.killed) {
    misoIsStopping = true;
    misoProcess.kill("SIGTERM");
    setTimeout(() => {
      if (misoProcess && !misoProcess.killed) {
        misoProcess.kill("SIGKILL");
      }
    }, 1200);
  } else {
    misoStatus = "stopped";
    if (appIsQuitting) {
      misoStatusReason = "";
    }
  }
};

const startMiso = async () => {
  if (misoProcess || misoStatus === "starting") {
    return;
  }

  misoPort = await findAvailableMisoPort();
  misoAuthToken = crypto.randomBytes(24).toString("hex");
  misoStatus = "starting";
  misoStatusReason = "";

  const entrypoint = resolveMisoEntrypoint();
  if (!entrypoint) {
    misoStatus = "not_found";
    misoStatusReason = "Miso server entrypoint was not found";
    return;
  }
  const devMisoSourcePath = app.isPackaged ? null : resolveDevMisoSourcePath();
  misoProcess = spawn(entrypoint.command, entrypoint.args, {
    detached: false,
    cwd: entrypoint.cwd,
    windowsHide: true,
    env: {
      ...process.env,
      MISO_HOST,
      MISO_PORT: String(misoPort),
      MISO_AUTH_TOKEN: misoAuthToken,
      MISO_PROVIDER: process.env.MISO_PROVIDER || "ollama",
      MISO_MODEL: process.env.MISO_MODEL || "deepseek-r1:14b",
      ...(devMisoSourcePath ? { MISO_SOURCE_PATH: devMisoSourcePath } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  misoProcess.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`[miso] ${text}`);
    }
  });

  misoProcess.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.error(`[miso:error] ${text}`);
      if (/ModuleNotFoundError|No module named/i.test(text)) {
        misoStatusReason = text;
      }
    }
  });

  misoProcess.on("error", (error) => {
    misoStatus = error.code === "ENOENT" ? "not_found" : "error";
    misoStatusReason = error.message || "Failed to start Miso process";
    misoProcess = null;

    terminateAllMisoStreams("error", {
      code: "miso_process_error",
      message: error.message || "Miso process failed to start",
    });

    if (error.code !== "ENOENT") {
      scheduleMisoRestart();
    }
  });

  misoProcess.on("exit", (code, signal) => {
    const stoppedIntentionally = misoIsStopping || appIsQuitting;
    misoProcess = null;

    if (stoppedIntentionally) {
      misoIsStopping = false;
      if (!appIsQuitting) {
        misoStatus = "stopped";
      }
      return;
    }

    misoStatus = "error";
    misoStatusReason = `Miso process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
    terminateAllMisoStreams("error", {
      code: "miso_process_exit",
      message: `Miso process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
    });
    scheduleMisoRestart();
  });

  const ready = await waitForMisoReady();
  if (!ready) {
    const missingRuntime = misoStatus === "not_found";
    if (!missingRuntime) {
      misoStatus = "error";
      misoStatusReason =
        misoStatusReason ||
        `Health check timed out after ${MISO_BOOT_TIMEOUT_MS}ms`;
    }
    stopMiso();
    if (missingRuntime) {
      misoStatus = "not_found";
      misoStatusReason = misoStatusReason || "Miso runtime not found";
      return;
    }
    scheduleMisoRestart();
    return;
  }

  misoStatus = "ready";
  misoStatusReason = "";
};

const parseSseBlock = (block) => {
  const lines = block.split("\n");
  let eventName = "message";
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    eventName,
    dataText: dataLines.join("\n"),
  };
};

const parseSsePayload = (dataText) => {
  if (!dataText) {
    return {};
  }

  try {
    return JSON.parse(dataText);
  } catch (_) {
    return {
      message: dataText,
    };
  }
};

const streamMisoSseToRenderer = async ({
  response,
  requestId,
  webContentsId,
  controller,
}) => {
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("Miso stream body is not readable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawTerminalEvent = false;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder
      .decode(value, { stream: true })
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      if (block.trim().length > 0) {
        const parsedBlock = parseSseBlock(block);
        const payload = parseSsePayload(parsedBlock.dataText);
        emitMisoStreamEvent(
          webContentsId,
          requestId,
          parsedBlock.eventName,
          payload,
        );

        if (
          parsedBlock.eventName === "done" ||
          parsedBlock.eventName === "error" ||
          // v2: all events are "frame"; detect terminal type from parsed payload
          (parsedBlock.eventName === "frame" &&
            (payload?.type === "done" || payload?.type === "error"))
        ) {
          sawTerminalEvent = true;
          break;
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (sawTerminalEvent) {
      break;
    }
  }

  if (!sawTerminalEvent && !controller.signal.aborted) {
    emitMisoStreamEvent(webContentsId, requestId, "done", {
      cancelled: false,
      reason: "stream_closed",
    });
  }
};

const startMisoStream = async ({
  requestId,
  payload,
  sender,
  endpoint = MISO_STREAM_ENDPOINT,
}) => {
  if (typeof requestId !== "string" || !requestId.trim()) {
    return;
  }

  if (misoStatus !== "ready" || !misoPort) {
    emitMisoStreamEvent(sender.id, requestId, "error", {
      code: "miso_not_ready",
      message: "Miso service is not ready",
    });
    return;
  }

  const requestPayload =
    payload && typeof payload === "object" ? { ...payload } : {};
  const requestOptions =
    requestPayload.options && typeof requestPayload.options === "object"
      ? { ...requestPayload.options }
      : {};
  const workspaceRootCandidate =
    typeof requestOptions.workspaceRoot === "string" &&
    requestOptions.workspaceRoot.trim()
      ? requestOptions.workspaceRoot
      : typeof requestOptions.workspace_root === "string" &&
          requestOptions.workspace_root.trim()
        ? requestOptions.workspace_root
        : "";

  if (workspaceRootCandidate) {
    const validation = validateWorkspaceRootPath(workspaceRootCandidate);
    if (!validation.valid) {
      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "invalid_workspace_root",
        message: validation.reason || "Invalid workspace root",
      });
      return;
    }

    requestPayload.options = {
      ...requestOptions,
      workspaceRoot: validation.resolvedPath,
      workspace_root: validation.resolvedPath,
    };
  } else {
    requestPayload.options = requestOptions;
  }

  if (misoActiveStreams.has(requestId)) {
    emitMisoStreamEvent(sender.id, requestId, "error", {
      code: "duplicate_request",
      message: "Request is already active",
    });
    return;
  }

  const controller = new AbortController();
  misoActiveStreams.set(requestId, {
    controller,
    webContentsId: sender.id,
  });

  try {
    const response = await fetch(`http://${MISO_HOST}:${misoPort}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-miso-auth": misoAuthToken,
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text();
      let message = `Miso stream request failed (${response.status})`;
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          const serverMessage = parsed?.error?.message || parsed?.message;
          if (serverMessage) {
            message = serverMessage;
          }
        } catch (_) {
          message = bodyText.slice(0, 200);
        }
      }

      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "upstream_http_error",
        message,
      });
      return;
    }

    await streamMisoSseToRenderer({
      response,
      requestId,
      webContentsId: sender.id,
      controller,
    });
  } catch (streamError) {
    if (controller.signal.aborted) {
      emitMisoStreamEvent(sender.id, requestId, "done", {
        cancelled: true,
      });
      return;
    }

    emitMisoStreamEvent(sender.id, requestId, "error", {
      code: "stream_bridge_failed",
      message: streamError?.message || "Failed to bridge SSE stream",
    });
  } finally {
    misoActiveStreams.delete(requestId);
  }
};

const startMisoStreamV2 = (args) =>
  startMisoStream({ ...args, endpoint: MISO_STREAM_V2_ENDPOINT });

const cancelMisoStream = (requestId) => {
  const streamState = misoActiveStreams.get(requestId);
  if (!streamState) {
    return false;
  }
  streamState.controller.abort();
  return true;
};
/* ─── Miso sidecar ─────────────────────────────────────────────────────────── */

const DEV_SERVER_URL =
  process.env.ELECTRON_START_URL || "http://localhost:2907/#";
const PROD_ENTRY_HASH = "/";
const DEV_SERVER_RETRY_MS = 1200;
const DARWIN_TRAFFIC_LIGHT_X = 14;
const DARWIN_TRAFFIC_LIGHT_Y = 18;

let mainWindow = null;
let darwinTrafficLightSyncTimeout = null;

const emitWindowState = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("window-state-event-listener", {
    isMaximized: mainWindow.isMaximized() || mainWindow.isFullScreen(),
  });
};

const syncDarwinTrafficLightPosition = () => {
  if (
    process.platform !== "darwin" ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  if (typeof mainWindow.setWindowButtonPosition !== "function") {
    return;
  }

  if (typeof mainWindow.setWindowButtonVisibility === "function") {
    mainWindow.setWindowButtonVisibility(true);
  }
  mainWindow.setWindowButtonPosition({
    x: DARWIN_TRAFFIC_LIGHT_X,
    y: DARWIN_TRAFFIC_LIGHT_Y,
  });
};

const scheduleDarwinTrafficLightSync = () => {
  if (process.platform !== "darwin") {
    return;
  }

  if (darwinTrafficLightSyncTimeout) {
    clearTimeout(darwinTrafficLightSyncTimeout);
  }

  syncDarwinTrafficLightPosition();

  darwinTrafficLightSyncTimeout = setTimeout(() => {
    syncDarwinTrafficLightPosition();
    setTimeout(syncDarwinTrafficLightPosition, 120);
  }, 16);
};

const createWindowOptions = () => {
  const baseWindowOptions = {
    title: "Mini UI",
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    icon: path.join(__dirname, "favicon.ico"),
    autoHideMenuBar: true,
    resizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  };

  if (process.platform === "darwin") {
    return {
      ...baseWindowOptions,
      frame: true,
      titleBarStyle: "hidden",
      trafficLightPosition: {
        x: DARWIN_TRAFFIC_LIGHT_X,
        y: DARWIN_TRAFFIC_LIGHT_Y,
      },
      backgroundColor: "#121212",
      hasShadow: true,
      show: false,
    };
  }

  if (process.platform === "win32") {
    return {
      ...baseWindowOptions,
      frame: true,
      titleBarStyle: "hidden",
      hasShadow: true,
      backgroundColor: "#121212",
      show: false,
    };
  }

  return {
    ...baseWindowOptions,
    frame: true,
    titleBarStyle: "hidden",
    backgroundColor: "#121212",
    show: false,
  };
};

const loadDevUrlWhenReady = async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    const response = await fetch(DEV_SERVER_URL, { method: "HEAD" });
    if (response.ok || response.status < 500) {
      await mainWindow.loadURL(DEV_SERVER_URL);
      return;
    }
  } catch (_) {
    // Dev server not ready yet. Retry until CRA is available.
  }

  setTimeout(loadDevUrlWhenReady, DEV_SERVER_RETRY_MS);
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow(createWindowOptions());

  // Show loading screen first — swapped out once the real app finishes loading
  mainWindow.loadFile(path.join(__dirname, "loading.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    emitWindowState();
    scheduleDarwinTrafficLightSync();
    if (app.isPackaged) {
      mainWindow.loadFile(path.join(__dirname, "..", "build", "index.html"), {
        hash: PROD_ENTRY_HASH,
      });
    } else {
      loadDevUrlWhenReady();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isLocalAppUrl =
      url.startsWith("file://") || url.startsWith("http://localhost:2907");
    if (!isLocalAppUrl) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.platform === "darwin") {
    mainWindow.webContents.on(
      "did-finish-load",
      scheduleDarwinTrafficLightSync,
    );
    mainWindow.on("show", scheduleDarwinTrafficLightSync);
    mainWindow.on("focus", scheduleDarwinTrafficLightSync);
    mainWindow.on("resize", scheduleDarwinTrafficLightSync);
    mainWindow.on("leave-full-screen", scheduleDarwinTrafficLightSync);
  }

  mainWindow.on("maximize", emitWindowState);
  mainWindow.on("unmaximize", emitWindowState);
  mainWindow.on("enter-full-screen", emitWindowState);
  mainWindow.on("leave-full-screen", emitWindowState);

  mainWindow.on("closed", () => {
    if (darwinTrafficLightSyncTimeout) {
      clearTimeout(darwinTrafficLightSyncTimeout);
      darwinTrafficLightSyncTimeout = null;
    }
    mainWindow = null;
  });
};

ipcMain.on("theme-set-background-color", (_event, color) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (typeof color === "string" && /^#[0-9a-fA-F]{6,8}$/.test(color)) {
    mainWindow.setBackgroundColor(color);
  }
});

ipcMain.on("theme-set-mode", (_event, mode) => {
  const themeSource = normalizeThemeModeToNativeSource(mode);
  if (!themeSource) {
    return;
  }
  nativeTheme.themeSource = themeSource;
});

ipcMain.on("window-state-event-handler", (_event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  switch (action) {
    case "close":
      mainWindow.close();
      break;
    case "minimize":
      mainWindow.minimize();
      break;
    case "maximize":
      if (process.platform === "darwin") {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      } else if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      break;
    default:
      break;
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle("ollama-get-status", () => ollamaStatus);

ipcMain.handle("ollama-restart", async () => {
  stopOllama();
  ollamaStatus = "checking";
  await startOllama();
  return ollamaStatus;
});

ipcMain.handle("miso:get-status", () => getMisoStatusPayload());
ipcMain.handle("miso:get-model-catalog", async () =>
  getMisoModelCatalogPayload(),
);
ipcMain.handle("miso:get-toolkit-catalog", async () =>
  getMisoToolkitCatalogPayload(),
);
ipcMain.handle(
  "miso:pick-workspace-root",
  async (_event, { defaultPath = "" } = {}) => {
    const validation = validateWorkspaceRootPath(defaultPath, {
      allowEmpty: true,
    });
    const fallbackPath = app.getPath("home");
    const targetWindow =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

    const dialogResult = await dialog.showOpenDialog(targetWindow, {
      title: "Select Workspace Root",
      defaultPath:
        validation.valid && validation.resolvedPath
          ? validation.resolvedPath
          : fallbackPath,
      properties: ["openDirectory", "createDirectory"],
    });

    if (
      dialogResult.canceled ||
      !Array.isArray(dialogResult.filePaths) ||
      !dialogResult.filePaths[0]
    ) {
      return { canceled: true, path: "" };
    }

    return {
      canceled: false,
      path: String(dialogResult.filePaths[0]),
    };
  },
);
ipcMain.handle(
  "miso:validate-workspace-root",
  (_event, { path: rootPath } = {}) => {
    const validation = validateWorkspaceRootPath(rootPath, {
      allowEmpty: true,
    });
    return {
      valid: Boolean(validation.valid),
      resolvedPath: validation.resolvedPath || "",
      reason: validation.reason || "",
    };
  },
);

ipcMain.handle(
  "ollama:library-search",
  async (_event, { query = "", category = "" } = {}) => {
    const q = encodeURIComponent(String(query || "").trim());
    const c = encodeURIComponent(String(category || "").trim());
    const parts = [];
    if (q) parts.push(`q=${q}`);
    if (c) parts.push(`c=${c}`);
    const url = `https://ollama.com/search${parts.length ? "?" + parts.join("&") : ""}`;

    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" } },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => resolve(data));
        },
      );
      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error("ollama library search timed out"));
      });
      req.on("error", reject);
    });
  },
);

/* ─── miso runtime directory size ─────────────────────────────────────────── */
const _getDirSize = (dirPath) => {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      const full = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(full);
        total += stat.isDirectory() ? _getDirSize(full) : stat.size;
      } catch {}
    }
  } catch {}
  return total;
};

ipcMain.handle("miso:get-runtime-dir-size", (_event, { dirPath = "" } = {}) => {
  const targetDir =
    typeof dirPath === "string" && dirPath.trim() ? dirPath.trim() : null;

  if (!targetDir || !fs.existsSync(targetDir)) {
    return {
      entries: [],
      total: 0,
      error: targetDir ? "not_found" : "no_path",
    };
  }

  let total = 0;
  const entries = [];

  for (const name of fs.readdirSync(targetDir)) {
    const full = path.join(targetDir, name);
    try {
      const stat = fs.statSync(full);
      const size = stat.isDirectory() ? _getDirSize(full) : stat.size;
      entries.push({ name, size, isDir: stat.isDirectory() });
      total += size;
    } catch {}
  }

  entries.sort((a, b) => b.size - a.size);
  return { entries, total };
});

ipcMain.handle(
  "miso:delete-runtime-entry",
  (_event, { dirPath = "", entryName = "" } = {}) => {
    const dir = typeof dirPath === "string" ? dirPath.trim() : "";
    const name =
      typeof entryName === "string" ? path.basename(entryName.trim()) : "";
    if (!dir || !name || name === "." || name === "..")
      return { ok: false, error: "invalid" };
    const full = path.join(dir, name);
    if (!full.startsWith(dir + path.sep) && full !== dir)
      return { ok: false, error: "invalid" };
    try {
      fs.rmSync(full, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
);

ipcMain.handle("miso:clear-runtime-dir", (_event, { dirPath = "" } = {}) => {
  const dir = typeof dirPath === "string" ? dirPath.trim() : "";
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: "not_found" };
  try {
    for (const name of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.on("miso:stream:start", (event, payload) => {
  const requestId = payload?.requestId;
  const requestPayload = payload?.payload || {};
  void startMisoStream({
    requestId,
    payload: requestPayload,
    sender: event.sender,
  });
});

ipcMain.on("miso:stream:start-v2", (event, payload) => {
  const requestId = payload?.requestId;
  const requestPayload = payload?.payload || {};
  void startMisoStreamV2({
    requestId,
    payload: requestPayload,
    sender: event.sender,
  });
});

ipcMain.on("miso:stream:cancel", (_event, payload) => {
  const requestId = payload?.requestId;
  if (typeof requestId === "string") {
    cancelMisoStream(requestId);
  }
});

const stopBackgroundServices = () => {
  appIsQuitting = true;
  stopOllama();
  stopMiso();
};

app.on("before-quit", stopBackgroundServices);
app.on("will-quit", stopBackgroundServices);

app.whenReady().then(() => {
  startOllama();
  startMiso();

  if (process.platform === "darwin" && app.dock) {
    const dockIconPath = path.join(__dirname, "logo512.png");
    try {
      const { nativeImage } = require("electron");
      const icon = nativeImage.createFromPath(dockIconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    } catch (_) {
      // Silently ignore if icon cannot be loaded.
    }
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
