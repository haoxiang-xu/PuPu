const { CHANNELS } = require("../../../shared/channels");

const MISO_HOST = "127.0.0.1";
const MISO_PORT_RANGE_START = 5879;
const MISO_PORT_RANGE_END = 5895;
const MISO_BOOT_TIMEOUT_MS = 10000;
const MISO_HEALTH_RETRY_MS = 250;
const MISO_RESTART_DELAY_MS = 1500;
const MISO_STREAM_ENDPOINT = "/chat/stream";
const MISO_STREAM_V2_ENDPOINT = "/chat/stream/v2";
const MISO_TOOL_CONFIRMATION_ENDPOINT = "/chat/tool/confirmation";
const MISO_HEALTH_ENDPOINT = "/health";
const MISO_MODELS_CATALOG_ENDPOINT = "/models/catalog";
const MISO_TOOLKIT_CATALOG_ENDPOINT = "/toolkits/catalog";

const createMisoService = ({
  app,
  fs,
  path,
  spawn,
  spawnSync,
  crypto,
  net,
  webContents,
  runtimeService,
  getAppIsQuitting,
}) => {
  let misoProcess = null;
  let misoPort = null;
  let misoStatus = "stopped";
  let misoStatusReason = "";
  let misoAuthToken = "";
  let misoRestartTimer = null;
  let misoIsStopping = false;

  const misoActiveStreams = new Map();

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
      uniqueCandidates[0] ||
      (process.platform === "win32" ? "python" : "python3")
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

    const devScript = path.join(app.getAppPath(), "miso_runtime", "server", "main.py");
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
    for (let port = MISO_PORT_RANGE_START; port <= MISO_PORT_RANGE_END; port += 1) {
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
    } catch {
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

  const ensureMisoReady = () => {
    if (misoStatus !== "ready" || !misoPort) {
      const reasonSuffix =
        typeof misoStatusReason === "string" && misoStatusReason.trim()
          ? `, reason=${misoStatusReason.trim()}`
          : "";
      throw new Error(`Miso service is not ready (status=${misoStatus}${reasonSuffix})`);
    }
  };

  const readJsonResponse = async (
    response,
    errorPrefix,
    emptyPayload = {},
    invalidJsonMessage = "Invalid JSON response",
  ) => {
    const bodyText = await response.text();
    if (!response.ok) {
      let message = `${errorPrefix} (${response.status})`;
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          const serverMessage = parsed?.error?.message || parsed?.message;
          if (serverMessage) {
            message = String(serverMessage);
          }
        } catch {
          message = bodyText.slice(0, 200);
        }
      }
      throw new Error(message);
    }

    if (!bodyText) {
      return emptyPayload;
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      throw new Error(invalidJsonMessage);
    }
  };

  const getMisoModelCatalogPayload = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${MISO_HOST}:${misoPort}${MISO_MODELS_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: misoAuthToken ? { "x-miso-auth": misoAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso model catalog request failed",
      {},
      "Invalid Miso model catalog response",
    );
  };

  const getMisoToolkitCatalogPayload = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${MISO_HOST}:${misoPort}${MISO_TOOLKIT_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: misoAuthToken ? { "x-miso-auth": misoAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso toolkit catalog request failed",
      {},
      "Invalid Miso toolkit catalog response",
    );
  };

  const submitMisoToolConfirmation = async (payload = {}) => {
    ensureMisoReady();

    const confirmationIdRaw = payload?.confirmation_id;
    const confirmationId =
      typeof confirmationIdRaw === "string" ? confirmationIdRaw.trim() : "";
    if (!confirmationId) {
      throw new Error("confirmation_id is required");
    }

    const reasonRaw = payload?.reason;
    const requestBody = {
      confirmation_id: confirmationId,
      approved: Boolean(payload?.approved),
      reason: typeof reasonRaw === "string" ? reasonRaw : String(reasonRaw || ""),
    };

    const modifiedArguments = payload?.modified_arguments;
    if (modifiedArguments != null) {
      const isObject =
        typeof modifiedArguments === "object" && !Array.isArray(modifiedArguments);
      if (!isObject) {
        throw new Error("modified_arguments must be an object");
      }
      requestBody.modified_arguments = modifiedArguments;
    }

    const response = await fetch(
      `http://${MISO_HOST}:${misoPort}${MISO_TOOL_CONFIRMATION_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(misoAuthToken ? { "x-miso-auth": misoAuthToken } : {}),
        },
        body: JSON.stringify(requestBody),
      },
    );

    return readJsonResponse(
      response,
      "Miso tool confirmation request failed",
      { status: "ok" },
      "Invalid Miso tool confirmation response",
    );
  };

  const emitMisoStreamEvent = (targetWebContentsId, requestId, event, data) => {
    const target = webContents.fromId(targetWebContentsId);
    if (!target || target.isDestroyed()) {
      return;
    }

    target.send(CHANNELS.MISO.STREAM_EVENT, {
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
    if (getAppIsQuitting() || misoRestartTimer) {
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
      if (getAppIsQuitting()) {
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
      const stoppedIntentionally = misoIsStopping || getAppIsQuitting();
      misoProcess = null;

      if (stoppedIntentionally) {
        misoIsStopping = false;
        if (!getAppIsQuitting()) {
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
          misoStatusReason || `Health check timed out after ${MISO_BOOT_TIMEOUT_MS}ms`;
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
    } catch {
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
          emitMisoStreamEvent(webContentsId, requestId, parsedBlock.eventName, payload);

          if (
            parsedBlock.eventName === "done" ||
            parsedBlock.eventName === "error" ||
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
      const reasonSuffix =
        typeof misoStatusReason === "string" && misoStatusReason.trim()
          ? `: ${misoStatusReason.trim()}`
          : "";
      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "miso_not_ready",
        message: `Miso service is not ready (${misoStatus})${reasonSuffix}`,
      });
      return;
    }

    const requestPayload = payload && typeof payload === "object" ? { ...payload } : {};
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
      const validation = runtimeService.validateWorkspaceRootPath(workspaceRootCandidate);
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
          } catch {
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

  const handleStreamStart = (event, payload) => {
    const requestId = payload?.requestId;
    const requestPayload = payload?.payload || {};
    void startMisoStream({
      requestId,
      payload: requestPayload,
      sender: event.sender,
    });
  };

  const handleStreamStartV2 = (event, payload) => {
    const requestId = payload?.requestId;
    const requestPayload = payload?.payload || {};
    void startMisoStreamV2({
      requestId,
      payload: requestPayload,
      sender: event.sender,
    });
  };

  const handleStreamCancel = (_event, payload) => {
    const requestId = payload?.requestId;
    if (typeof requestId === "string") {
      cancelMisoStream(requestId);
    }
  };

  return {
    startMiso,
    stopMiso,
    getMisoStatusPayload,
    getMisoModelCatalogPayload,
    getMisoToolkitCatalogPayload,
    submitMisoToolConfirmation,
    handleStreamStart,
    handleStreamStartV2,
    handleStreamCancel,
  };
};

module.exports = {
  createMisoService,
};
