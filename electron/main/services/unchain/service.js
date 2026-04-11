const { CHANNELS } = require("../../../shared/channels");
const { createPortFinder } = require("../../../shared/port_utils");

const UNCHAIN_HOST = "127.0.0.1";
const UNCHAIN_PORT_RANGE_START = 5879;
const UNCHAIN_PORT_RANGE_END = 5895;
const UNCHAIN_BOOT_TIMEOUT_MS = 60000;
const UNCHAIN_HEALTH_RETRY_MS = 250;
const UNCHAIN_RESTART_DELAY_MS = 1500;
const UNCHAIN_STREAM_ENDPOINT = "/chat/stream";
const UNCHAIN_STREAM_V2_ENDPOINT = "/chat/stream/v2";
const UNCHAIN_TOOL_CONFIRMATION_ENDPOINT = "/chat/tool/confirmation";
const UNCHAIN_HEALTH_ENDPOINT = "/health";
const UNCHAIN_MODELS_CATALOG_ENDPOINT = "/models/catalog";
const UNCHAIN_TOOLKIT_CATALOG_ENDPOINT = "/toolkits/catalog";
const UNCHAIN_TOOL_MODAL_CATALOG_ENDPOINT = "/toolkits/catalog/v2";
const UNCHAIN_TOOLKIT_DETAIL_ENDPOINT = "/toolkits";
const UNCHAIN_MEMORY_PROJECTION_ENDPOINT = "/memory/projection";
const UNCHAIN_LONG_TERM_MEMORY_PROJECTION_ENDPOINT =
  "/memory/long-term/projection";
const UNCHAIN_REPLACE_SESSION_MEMORY_ENDPOINT = "/memory/session/replace";
const UNCHAIN_SESSION_MEMORY_EXPORT_ENDPOINT = "/memory/session/export";
const UNCHAIN_CHARACTERS_ENDPOINT = "/characters";
const UNCHAIN_CHARACTER_PREVIEW_ENDPOINT = "/characters/preview";
const UNCHAIN_CHARACTER_BUILD_ENDPOINT = "/characters/build";
const UNCHAIN_CHARACTER_IMPORT_ENDPOINT = "/characters/import";

const createUnchainService = ({
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
  let unchainProcess = null;
  let unchainPort = null;
  let unchainStatus = "stopped";
  let unchainStatusReason = "";
  let unchainAuthToken = "";
  let unchainRestartTimer = null;
  let unchainIsStopping = false;
  let unchainStartPromise = null;

  const unchainActiveStreams = new Map();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const { findAvailablePort } = createPortFinder(net);

  const _parsePosixPsLine = (line) => {
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

  const listStaleMisoPids = (entrypoint) => {
    if (!entrypoint || process.platform === "win32") {
      return [];
    }

    const scriptPath = Array.isArray(entrypoint.args) ? entrypoint.args[0] : "";
    const commandPath =
      typeof entrypoint.command === "string" ? entrypoint.command : "";
    const matchToken = String(scriptPath || commandPath || "").trim();
    if (!matchToken) {
      return [];
    }

    const psProbe = spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (
      psProbe.error ||
      psProbe.status !== 0 ||
      typeof psProbe.stdout !== "string"
    ) {
      return [];
    }

    const stalePids = [];
    const rows = psProbe.stdout.split("\n");
    for (const row of rows) {
      const parsed = _parsePosixPsLine(row);
      if (!parsed) {
        continue;
      }

      // Only reap orphaned unchain server scripts from previous crashed sessions.
      if (parsed.ppid !== 1) {
        continue;
      }
      if (parsed.pid === process.pid) {
        continue;
      }
      if (!parsed.command.includes(matchToken)) {
        continue;
      }
      stalePids.push(parsed.pid);
    }

    return stalePids;
  };

  const terminateStaleMisoProcesses = (entrypoint) => {
    const stalePids = listStaleMisoPids(entrypoint);
    for (const pid of stalePids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Ignore races where process exits between ps and kill.
      }
    }
  };

  const looksLikeUnchainSource = (sourcePath) =>
    fs.existsSync(path.join(sourcePath, "unchain", "__init__.py")) &&
    fs.existsSync(path.join(sourcePath, "unchain", "__init__.py"));

  const resolveDevUnchainSourcePath = () => {
    const configuredSource = process.env.UNCHAIN_SOURCE_PATH;
    if (configuredSource && looksLikeUnchainSource(configuredSource)) {
      return configuredSource;
    }

    const siblingSource = path.resolve(app.getAppPath(), "..", "unchain");
    if (looksLikeUnchainSource(siblingSource)) {
      return siblingSource;
    }

    return null;
  };

  const UNCHAIN_REQUIRED_PYTHON_MODULES = [
    "flask",
    "qdrant_client",
    "openai",
    "anthropic",
  ];
  const UNCHAIN_REQUIRED_PYTHON_VERSION = "3.12.x";

  const inspectPythonCommand = (
    pythonCommand,
    label,
    moduleNames = UNCHAIN_REQUIRED_PYTHON_MODULES,
  ) => {
    if (!pythonCommand) {
      return {
        ok: false,
        reason: `${label} is not configured.`,
      };
    }

    const probe = spawnSync(
      pythonCommand,
      [
        "-c",
        [
          "import importlib.util",
          "import json",
          "import sys",
          `module_names = ${JSON.stringify(moduleNames)}`,
          "missing = [name for name in module_names if importlib.util.find_spec(name) is None]",
          "print(json.dumps({",
          '    "version": sys.version.split()[0],',
          '    "major": sys.version_info[0],',
          '    "minor": sys.version_info[1],',
          '    "missing": missing,',
          "}))",
        ].join("\n"),
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (probe.error) {
      return {
        ok: false,
        reason: `${label} is unavailable at ${pythonCommand}: ${probe.error.message}`,
      };
    }

    if (probe.status !== 0) {
      return {
        ok: false,
        reason: `${label} could not be inspected at ${pythonCommand}.`,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(String(probe.stdout || "").trim());
    } catch {
      return {
        ok: false,
        reason: `${label} returned an invalid probe response.`,
      };
    }

    if (parsed.major !== 3 || parsed.minor !== 12) {
      return {
        ok: false,
        reason: `${label} must use Python ${UNCHAIN_REQUIRED_PYTHON_VERSION}. Found ${parsed.version} at ${pythonCommand}.`,
      };
    }

    if (parsed.missing.length > 0) {
      return {
        ok: false,
        reason: `${label} is missing required modules (${parsed.missing.join(", ")}). Recreate that .venv with Python ${UNCHAIN_REQUIRED_PYTHON_VERSION}.`,
      };
    }

    return {
      ok: true,
      command: pythonCommand,
      version: parsed.version,
    };
  };

  const resolvePuPuVenvPythonPath = () => {
    const appPath = app.getAppPath();
    if (process.platform === "win32") {
      return path.join(appPath, ".venv", "Scripts", "python.exe");
    }
    return path.join(appPath, ".venv", "bin", "python");
  };

  const resolveMisoVenvPythonPath = () => {
    const unchainSourcePath = resolveDevUnchainSourcePath();
    if (!unchainSourcePath) {
      return null;
    }

    if (process.platform === "win32") {
      return path.join(unchainSourcePath, ".venv", "Scripts", "python.exe");
    }
    return path.join(unchainSourcePath, ".venv", "bin", "python");
  };

  const pickBestPythonCommand = () => {
    const candidates = [
      {
        label: "PuPu .venv",
        command: resolvePuPuVenvPythonPath(),
      },
      {
        label: "unchain .venv",
        command: resolveMisoVenvPythonPath(),
      },
    ];
    const failures = [];

    for (const candidate of candidates) {
      if (!candidate.command) {
        failures.push(`${candidate.label} could not be resolved.`);
        continue;
      }
      if (!fs.existsSync(candidate.command)) {
        failures.push(
          `${candidate.label} was not found at ${candidate.command}.`,
        );
        continue;
      }

      const inspection = inspectPythonCommand(
        candidate.command,
        candidate.label,
      );
      if (inspection.ok) {
        return inspection.command;
      }
      failures.push(inspection.reason);
    }

    throw new Error(
      [
        `PuPu requires a Python ${UNCHAIN_REQUIRED_PYTHON_VERSION} runtime in .venv.`,
        "Initialize ./scripts/init_python312_venv.sh in PuPu and ../unchain/scripts/init_python312_venv.sh in unchain.",
        ...failures,
      ].join(" "),
    );
  };

  const getMisoPythonCommand = () => {
    if (process.env.UNCHAIN_PYTHON_BIN) {
      const inspection = inspectPythonCommand(
        process.env.UNCHAIN_PYTHON_BIN,
        "UNCHAIN_PYTHON_BIN",
      );
      if (!inspection.ok) {
        throw new Error(inspection.reason);
      }
      return process.env.UNCHAIN_PYTHON_BIN;
    }
    return pickBestPythonCommand();
  };

  const getPackagedMisoBinaryPath = () => {
    if (process.platform === "darwin") {
      return path.join(
        process.resourcesPath,
        "unchain_runtime",
        "dist",
        "macos",
        "unchain-server",
      );
    }
    if (process.platform === "win32") {
      return path.join(
        process.resourcesPath,
        "unchain_runtime",
        "dist",
        "windows",
        "unchain-server.exe",
      );
    }
    return path.join(
      process.resourcesPath,
      "unchain_runtime",
      "dist",
      "linux",
      "unchain-server",
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
        "unchain_runtime",
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
      "unchain_runtime",
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

  const findAvailableMisoPort = async () => {
    return findAvailablePort({
      host: UNCHAIN_HOST,
      startPort: UNCHAIN_PORT_RANGE_START,
      endPort: UNCHAIN_PORT_RANGE_END,
      fallbackToEphemeral: true,
    });
  };

  const pingMiso = async () => {
    if (!unchainPort) {
      return false;
    }

    try {
      const response = await fetch(
        `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_HEALTH_ENDPOINT}`,
        {
          method: "GET",
          headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  };

  const waitForMisoReady = async () => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < UNCHAIN_BOOT_TIMEOUT_MS) {
      if (!unchainProcess || unchainProcess.killed) {
        return false;
      }

      // eslint-disable-next-line no-await-in-loop
      if (await pingMiso()) {
        return true;
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(UNCHAIN_HEALTH_RETRY_MS);
    }

    return false;
  };

  const getMisoStatusPayload = () => ({
    status: unchainStatus,
    reason: unchainStatusReason || "",
    ready: unchainStatus === "ready",
    pid: unchainProcess?.pid || null,
    port: unchainPort,
    url: unchainPort ? `http://${UNCHAIN_HOST}:${unchainPort}` : null,
  });

  const ensureMisoReady = () => {
    if (unchainStatus !== "ready" || !unchainPort) {
      const reasonSuffix =
        typeof unchainStatusReason === "string" && unchainStatusReason.trim()
          ? `, reason=${unchainStatusReason.trim()}`
          : "";
      throw new Error(
        `Miso service is not ready (status=${unchainStatus}${reasonSuffix})`,
      );
    }
  };

  const buildMisoUrl = (endpoint) => {
    ensureMisoReady();
    return `http://${UNCHAIN_HOST}:${unchainPort}${endpoint}`;
  };

  const buildMisoAssetUrl = (endpoint) => {
    const baseUrl = buildMisoUrl(endpoint);
    if (!unchainAuthToken) {
      return baseUrl;
    }
    return `${baseUrl}?unchain_auth=${encodeURIComponent(unchainAuthToken)}`;
  };

  const decorateCharacterAvatar = (character, { seed = false } = {}) => {
    if (!character || typeof character !== "object" || Array.isArray(character)) {
      return character;
    }

    const characterId =
      typeof character.id === "string" ? character.id.trim() : "";
    if (!characterId) {
      return character;
    }

    const avatarMeta =
      character.avatar &&
      typeof character.avatar === "object" &&
      !Array.isArray(character.avatar)
        ? character.avatar
        : null;
    const isBuiltinSeed =
      character.metadata &&
      typeof character.metadata === "object" &&
      character.metadata.origin === "builtin_seed";

    if (seed && !avatarMeta) {
      return character;
    }
    if (!seed && !avatarMeta && !isBuiltinSeed) {
      return character;
    }

    const avatar = avatarMeta ? { ...avatarMeta } : {};
    avatar.url = buildMisoAssetUrl(
      seed
        ? `${UNCHAIN_CHARACTERS_ENDPOINT}/seeds/${encodeURIComponent(characterId)}/avatar`
        : `${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(characterId)}/avatar`,
    );

    return {
      ...character,
      avatar,
    };
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
          const serverMessage =
            (typeof parsed?.error?.message === "string" &&
              parsed.error.message.trim()) ||
            (typeof parsed?.error === "string" && parsed.error.trim()) ||
            (typeof parsed?.message === "string" && parsed.message.trim()) ||
            "";
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
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_MODELS_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
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
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOLKIT_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso toolkit catalog request failed",
      {},
      "Invalid Miso toolkit catalog response",
    );
  };

  const getMisoToolModalCatalogPayload = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOL_MODAL_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso tool modal catalog request failed",
      {},
      "Invalid Miso tool modal catalog response",
    );
  };

  const getMisoToolkitDetailPayload = async (toolkitId, toolName) => {
    ensureMisoReady();

    const safeToolkitId = encodeURIComponent(String(toolkitId || ""));
    let url = `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOLKIT_DETAIL_ENDPOINT}/${safeToolkitId}/metadata`;
    if (typeof toolName === "string" && toolName.trim()) {
      url += `?tool_name=${encodeURIComponent(toolName.trim())}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
    });

    return readJsonResponse(
      response,
      "Miso toolkit detail request failed",
      {},
      "Invalid Miso toolkit detail response",
    );
  };

  const getMisoMemoryProjection = async (sessionId) => {
    ensureMisoReady();

    const cleanId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!cleanId) {
      throw new Error("sessionId is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_MEMORY_PROJECTION_ENDPOINT}?session_id=${encodeURIComponent(cleanId)}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso memory projection request failed",
      {},
      "Invalid Miso memory projection response",
    );
  };

  const getMisoLongTermMemoryProjection = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_LONG_TERM_MEMORY_PROJECTION_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso long-term memory projection request failed",
      {},
      "Invalid Miso long-term memory projection response",
    );
  };

  const replaceMisoSessionMemory = async (payload = {}) => {
    ensureMisoReady();

    const sessionIdRaw = payload?.sessionId ?? payload?.session_id;
    const sessionId =
      typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";
    if (!sessionId) {
      throw new Error("session_id is required");
    }

    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const options =
      payload?.options && typeof payload.options === "object"
        ? payload.options
        : {};

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_REPLACE_SESSION_MEMORY_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          messages,
          options,
        }),
      },
    );

    return readJsonResponse(
      response,
      "Miso session memory replace request failed",
      {},
      "Invalid Miso session memory replace response",
    );
  };

  const getMisoSessionMemoryExport = async (sessionId) => {
    ensureMisoReady();

    const cleanId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!cleanId) {
      throw new Error("sessionId is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_SESSION_MEMORY_EXPORT_ENDPOINT}?session_id=${encodeURIComponent(cleanId)}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso session memory export request failed",
      {},
      "Invalid Miso session memory export response",
    );
  };

  const listMisoSeedCharacters = async () => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(`${UNCHAIN_CHARACTERS_ENDPOINT}/seeds`),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    const payload = await readJsonResponse(
      response,
      "Miso seed character list request failed",
      { characters: [], count: 0 },
      "Invalid Miso seed character list response",
    );

    return {
      ...payload,
      characters: Array.isArray(payload.characters)
        ? payload.characters.map((character) =>
            decorateCharacterAvatar(character, { seed: true }),
          )
        : [],
    };
  };

  const listMisoCharacters = async () => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_CHARACTERS_ENDPOINT),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    const payload = await readJsonResponse(
      response,
      "Miso character list request failed",
      { characters: [], count: 0 },
      "Invalid Miso character list response",
    );

    return {
      ...payload,
      characters: Array.isArray(payload.characters)
        ? payload.characters.map((character) => decorateCharacterAvatar(character))
        : [],
    };
  };

  const getMisoCharacter = async (characterId) => {
    ensureMisoReady();

    const cleanId = typeof characterId === "string" ? characterId.trim() : "";
    if (!cleanId) {
      throw new Error("characterId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      ),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    const payload = await readJsonResponse(
      response,
      "Miso character get request failed",
      {},
      "Invalid Miso character get response",
    );

    return decorateCharacterAvatar(payload);
  };

  const saveMisoCharacter = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTERS_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso character save request failed",
      {},
      "Invalid Miso character save response",
    );
  };

  const deleteMisoCharacter = async (characterId) => {
    ensureMisoReady();

    const cleanId = typeof characterId === "string" ? characterId.trim() : "";
    if (!cleanId) {
      throw new Error("characterId is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso character delete request failed",
      {},
      "Invalid Miso character delete response",
    );
  };

  const previewMisoCharacterDecision = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTER_PREVIEW_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso character preview request failed",
      {},
      "Invalid Miso character preview response",
    );
  };

  const buildMisoCharacterAgentConfig = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTER_BUILD_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso character build request failed",
      {},
      "Invalid Miso character build response",
    );
  };

  const exportMisoCharacter = async (characterId, filePath) => {
    ensureMisoReady();

    const cleanId = typeof characterId === "string" ? characterId.trim() : "";
    if (!cleanId) {
      throw new Error("characterId is required");
    }
    const cleanPath = typeof filePath === "string" ? filePath.trim() : "";
    if (!cleanPath) {
      throw new Error("filePath is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(cleanId)}/export`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({ file_path: cleanPath }),
      },
    );

    return readJsonResponse(
      response,
      "Miso character export request failed",
      {},
      "Invalid Miso character export response",
    );
  };

  const importMisoCharacter = async (filePath) => {
    ensureMisoReady();

    const cleanPath = typeof filePath === "string" ? filePath.trim() : "";
    if (!cleanPath) {
      throw new Error("filePath is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTER_IMPORT_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({ file_path: cleanPath }),
      },
    );

    return readJsonResponse(
      response,
      "Miso character import request failed",
      {},
      "Invalid Miso character import response",
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
      reason:
        typeof reasonRaw === "string" ? reasonRaw : String(reasonRaw || ""),
    };

    const modifiedArguments = payload?.modified_arguments;
    if (modifiedArguments != null) {
      const isObject =
        typeof modifiedArguments === "object" &&
        !Array.isArray(modifiedArguments);
      if (!isObject) {
        throw new Error("modified_arguments must be an object");
      }
      requestBody.modified_arguments = modifiedArguments;
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOL_CONFIRMATION_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
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

    target.send(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId,
      event,
      data,
    });
  };

  const emitMisoRuntimeLog = (level, text) => {
    const normalizedLevel = level === "stderr" ? "stderr" : "stdout";
    const normalizedText = typeof text === "string" ? text.trim() : "";
    if (!normalizedText) {
      return;
    }

    const targets =
      typeof webContents.getAllWebContents === "function"
        ? webContents.getAllWebContents()
        : [];

    for (const target of targets) {
      if (!target || target.isDestroyed()) {
        continue;
      }
      if (
        typeof target.getType === "function" &&
        target.getType() !== "window"
      ) {
        continue;
      }
      try {
        target.send(CHANNELS.UNCHAIN.RUNTIME_LOG, {
          level: normalizedLevel,
          text: normalizedText,
        });
      } catch {
        // Ignore renderer availability races.
      }
    }
  };

  const stringifyBridgeErrorValue = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value == null) {
      return "";
    }

    try {
      const json = JSON.stringify(value);
      if (typeof json === "string" && json.trim()) {
        return json.trim();
      }
    } catch {
      // Fall through to String(value).
    }

    try {
      return String(value).trim();
    } catch {
      return "";
    }
  };

  const serializeBridgeErrorCause = (cause) => {
    if (cause instanceof Error) {
      if (typeof cause.stack === "string" && cause.stack.trim()) {
        return cause.stack.trim();
      }
      if (typeof cause.message === "string" && cause.message.trim()) {
        return cause.message.trim();
      }
    }

    return stringifyBridgeErrorValue(cause);
  };

  const logMisoStreamBridgeFailure = (requestId, streamError) => {
    try {
      const normalizedRequestId =
        typeof requestId === "string" && requestId.trim()
          ? requestId.trim()
          : "unknown";
      const prefix = `[requestId=${normalizedRequestId}]`;
      const message =
        (typeof streamError?.message === "string" && streamError.message.trim()) ||
        stringifyBridgeErrorValue(streamError) ||
        "Failed to bridge SSE stream";

      emitMisoRuntimeLog(
        "stderr",
        `stream bridge failed ${prefix}: ${message}`,
      );

      const stack =
        typeof streamError?.stack === "string" && streamError.stack.trim()
          ? streamError.stack.trim()
          : "";
      if (stack) {
        emitMisoRuntimeLog(
          "stderr",
          `stream bridge stack ${prefix}: ${stack}`,
        );
      }

      const cause = serializeBridgeErrorCause(streamError?.cause);
      if (cause) {
        emitMisoRuntimeLog(
          "stderr",
          `stream bridge cause ${prefix}: ${cause}`,
        );
      }
    } catch {
      // Diagnostics must never interfere with stream error handling.
    }
  };

  const createUnchainRuntimeLogLineEmitter = (level) => {
    let bufferedText = "";

    const emitLine = (line) => {
      const normalizedLine = typeof line === "string" ? line.trim() : "";
      if (!normalizedLine) {
        return;
      }
      emitMisoRuntimeLog(level, normalizedLine);
    };

    const push = (chunk) => {
      if (chunk == null) {
        return;
      }

      bufferedText += String(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = bufferedText.split("\n");
      bufferedText = lines.pop() || "";

      for (const line of lines) {
        emitLine(line);
      }
    };

    const flush = () => {
      if (!bufferedText) {
        return;
      }
      emitLine(bufferedText);
      bufferedText = "";
    };

    return {
      push,
      flush,
    };
  };

  const terminateAllMisoStreams = (event, data) => {
    for (const [requestId, streamState] of unchainActiveStreams.entries()) {
      streamState.controller.abort();
      emitMisoStreamEvent(streamState.webContentsId, requestId, event, data);
    }
    unchainActiveStreams.clear();
  };

  const scheduleMisoRestart = () => {
    if (getAppIsQuitting() || unchainRestartTimer) {
      return;
    }

    unchainRestartTimer = setTimeout(() => {
      unchainRestartTimer = null;
      startMiso();
    }, UNCHAIN_RESTART_DELAY_MS);
  };

  const stopMiso = () => {
    if (unchainRestartTimer) {
      clearTimeout(unchainRestartTimer);
      unchainRestartTimer = null;
    }

    terminateAllMisoStreams("done", {
      cancelled: true,
      reason: "service_stopping",
    });

    if (unchainProcess && !unchainProcess.killed) {
      unchainIsStopping = true;
      unchainProcess.kill("SIGTERM");
      setTimeout(() => {
        if (unchainProcess && !unchainProcess.killed) {
          unchainProcess.kill("SIGKILL");
        }
      }, 1200);
    } else {
      unchainStatus = "stopped";
      if (getAppIsQuitting()) {
        unchainStatusReason = "";
      }
    }
  };

  const startMiso = async () => {
    if (unchainProcess || unchainStatus === "starting") {
      return;
    }
    if (unchainStartPromise) {
      return unchainStartPromise;
    }

    unchainStatus = "starting";
    unchainStatusReason = "";

    unchainStartPromise = (async () => {
      let entrypoint;
      try {
        entrypoint = resolveMisoEntrypoint();
      } catch (error) {
        unchainStatus = "not_found";
        unchainStatusReason =
          error?.message || "Python 3.12 runtime for Miso was not found";
        return;
      }
      if (!entrypoint) {
        unchainStatus = "not_found";
        unchainStatusReason = "Miso server entrypoint was not found";
        return;
      }

      terminateStaleMisoProcesses(entrypoint);

      unchainPort = await findAvailableMisoPort();
      if (!unchainPort) {
        unchainStatus = "error";
        unchainStatusReason = "Unable to find an open port for the Miso service";
        return;
      }
      unchainAuthToken = crypto.randomBytes(24).toString("hex");

      const devUnchainSourcePath = app.isPackaged
        ? null
        : resolveDevUnchainSourcePath();
      unchainProcess = spawn(entrypoint.command, entrypoint.args, {
        detached: false,
        cwd: entrypoint.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          UNCHAIN_HOST,
          UNCHAIN_PORT: String(unchainPort),
          UNCHAIN_AUTH_TOKEN: unchainAuthToken,
          UNCHAIN_VERSION: app.getVersion(),
          UNCHAIN_PROVIDER: process.env.UNCHAIN_PROVIDER || "ollama",
          UNCHAIN_MODEL: process.env.UNCHAIN_MODEL || "deepseek-r1:14b",
          UNCHAIN_DATA_DIR: app.getPath("userData"),
          UNCHAIN_PARENT_PID: String(process.pid),
          PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
          PYTHONUTF8: process.env.PYTHONUTF8 || "1",
          ...(devUnchainSourcePath ? { UNCHAIN_SOURCE_PATH: devUnchainSourcePath } : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutLineEmitter = createUnchainRuntimeLogLineEmitter("stdout");
      const stderrLineEmitter = createUnchainRuntimeLogLineEmitter("stderr");
      const flushUnchainRuntimeLogs = () => {
        stdoutLineEmitter.flush();
        stderrLineEmitter.flush();
      };

      unchainProcess.stdout?.on("data", (chunk) => {
        stdoutLineEmitter.push(chunk);
      });

      unchainProcess.stderr?.on("data", (chunk) => {
        stderrLineEmitter.push(chunk);
        const text = String(chunk).trim();
        if (/ModuleNotFoundError|No module named/i.test(text)) {
          unchainStatusReason = text;
        }
      });

      unchainProcess.on("error", (error) => {
        flushUnchainRuntimeLogs();
        unchainStatus = error.code === "ENOENT" ? "not_found" : "error";
        unchainStatusReason = error.message || "Failed to start Miso process";
        unchainProcess = null;

        terminateAllMisoStreams("error", {
          code: "unchain_process_error",
          message: error.message || "Miso process failed to start",
        });

        if (error.code !== "ENOENT") {
          scheduleMisoRestart();
        }
      });

      unchainProcess.on("exit", (code, signal) => {
        flushUnchainRuntimeLogs();
        const stoppedIntentionally = unchainIsStopping || getAppIsQuitting();
        unchainProcess = null;

        if (stoppedIntentionally) {
          unchainIsStopping = false;
          if (!getAppIsQuitting()) {
            unchainStatus = "stopped";
          }
          return;
        }

        unchainStatus = "error";
        unchainStatusReason = `Miso process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
        terminateAllMisoStreams("error", {
          code: "unchain_process_exit",
          message: `Miso process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        });
        scheduleMisoRestart();
      });

      const ready = await waitForMisoReady();
      if (!ready) {
        const missingRuntime = unchainStatus === "not_found";
        if (!missingRuntime) {
          unchainStatus = "error";
          unchainStatusReason =
            unchainStatusReason ||
            `Health check timed out after ${UNCHAIN_BOOT_TIMEOUT_MS}ms`;
        }
        stopMiso();
        if (missingRuntime) {
          unchainStatus = "not_found";
          unchainStatusReason = unchainStatusReason || "Miso runtime not found";
          return;
        }
        scheduleMisoRestart();
        return;
      }

      unchainStatus = "ready";
      unchainStatusReason = "";
    })();

    try {
      await unchainStartPromise;
    } finally {
      unchainStartPromise = null;
    }
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
      return {
        payload: {},
        isValidJson: true,
      };
    }

    try {
      return {
        payload: JSON.parse(dataText),
        isValidJson: true,
      };
    } catch {
      return {
        payload: {
          message: dataText,
        },
        isValidJson: false,
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
          const parsedPayload = parseSsePayload(parsedBlock.dataText);
          const payload = parsedPayload.payload;
          emitMisoStreamEvent(
            webContentsId,
            requestId,
            parsedBlock.eventName,
            payload,
          );

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

    // Recover a final SSE block even when upstream closes without the
    // trailing "\n\n" separator.
    const trailingBlock = buffer.trim();
    if (!sawTerminalEvent && trailingBlock.length > 0) {
      const parsedBlock = parseSseBlock(trailingBlock);
      const parsedPayload = parseSsePayload(parsedBlock.dataText);
      if (parsedPayload.isValidJson) {
        const payload = parsedPayload.payload;
        emitMisoStreamEvent(
          webContentsId,
          requestId,
          parsedBlock.eventName,
          payload,
        );
        if (
          parsedBlock.eventName === "done" ||
          parsedBlock.eventName === "error" ||
          (parsedBlock.eventName === "frame" &&
            (payload?.type === "done" || payload?.type === "error"))
        ) {
          sawTerminalEvent = true;
        }
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
    endpoint = UNCHAIN_STREAM_ENDPOINT,
  }) => {
    if (typeof requestId !== "string" || !requestId.trim()) {
      return;
    }

    if (unchainStatus !== "ready" || !unchainPort) {
      const reasonSuffix =
        typeof unchainStatusReason === "string" && unchainStatusReason.trim()
          ? `: ${unchainStatusReason.trim()}`
          : "";
      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "unchain_not_ready",
        message: `Miso service is not ready (${unchainStatus})${reasonSuffix}`,
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
      const validation = runtimeService.validateWorkspaceRootPath(
        workspaceRootCandidate,
      );
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

    if (unchainActiveStreams.has(requestId)) {
      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "duplicate_request",
        message: "Request is already active",
      });
      return;
    }

    const controller = new AbortController();
    unchainActiveStreams.set(requestId, {
      controller,
      webContentsId: sender.id,
    });

    try {
      const response = await fetch(
        `http://${UNCHAIN_HOST}:${unchainPort}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-unchain-auth": unchainAuthToken,
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        },
      );

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

      logMisoStreamBridgeFailure(requestId, streamError);
      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "stream_bridge_failed",
        message: streamError?.message || "Failed to bridge SSE stream",
      });
    } finally {
      unchainActiveStreams.delete(requestId);
    }
  };

  const startMisoStreamV2 = (args) =>
    startMisoStream({ ...args, endpoint: UNCHAIN_STREAM_V2_ENDPOINT });

  const cancelMisoStream = (requestId) => {
    const streamState = unchainActiveStreams.get(requestId);
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

  const validateMisoApiKey = async (provider, apiKey) => {
    // HTTP headers only allow Latin-1 characters (code points 0-255).
    // Reject keys with non-Latin-1 characters before attempting a network call.
    if (!/^[\x00-\xFF]*$/.test(apiKey)) {
      return { valid: false, error: "Invalid API key" };
    }
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: "Invalid API key" };
      if (response.status === 403) return { valid: false, error: "API key does not have permission" };
      return { valid: false, error: `Validation failed (${response.status})` };
    }
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: "Invalid API key" };
      if (response.status === 403) return { valid: false, error: "API key does not have permission" };
      return { valid: false, error: `Validation failed (${response.status})` };
    }
    return { valid: false, error: "Unsupported provider" };
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
    getMisoToolModalCatalogPayload,
    getMisoToolkitDetailPayload,
    getMisoMemoryProjection,
    getMisoLongTermMemoryProjection,
    replaceMisoSessionMemory,
    getMisoSessionMemoryExport,
    listMisoSeedCharacters,
    listMisoCharacters,
    getMisoCharacter,
    saveMisoCharacter,
    deleteMisoCharacter,
    previewMisoCharacterDecision,
    buildMisoCharacterAgentConfig,
    exportMisoCharacter,
    importMisoCharacter,
    submitMisoToolConfirmation,
    validateMisoApiKey,
    handleStreamStart,
    handleStreamStartV2,
    handleStreamCancel,
  };
};

module.exports = {
  createUnchainService,
};
