const { CHANNELS } = require("../../../shared/channels");

const UPDATE_STAGES = Object.freeze({
  IDLE: "idle",
  CHECKING: "checking",
  NO_UPDATE: "no_update",
  DOWNLOADING: "downloading",
  DOWNLOADED: "downloaded",
  ERROR: "error",
});

const UPDATE_SUPPORTED_PLATFORMS = new Set(["darwin", "win32"]);

// Delay (ms) between app window creation and the startup auto-update check.
const STARTUP_CHECK_DELAY_MS = 8000;

const createUpdateService = ({ app, webContents, autoUpdater, fs, path }) => {
  let autoUpdaterConfigured = false;
  let updateCheckInFlight = false;
  let updateDownloaded = false;
  let appUpdateState = {
    stage: UPDATE_STAGES.IDLE,
    currentVersion: app.getVersion(),
  };

  const clampUpdateProgress = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    if (numeric < 0) {
      return 0;
    }
    if (numeric > 100) {
      return 100;
    }
    return Math.round(numeric);
  };

  const normalizeUpdateMessage = (error) => {
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    return "Update failed.";
  };

  const getAppUpdateStatePayload = () => ({
    ...appUpdateState,
    currentVersion: app.getVersion(),
  });

  const emitAppUpdateState = () => {
    const payload = getAppUpdateStatePayload();
    const targets = webContents.getAllWebContents();
    targets.forEach((target) => {
      if (!target || target.isDestroyed()) {
        return;
      }
      try {
        target.send(CHANNELS.UPDATE.STATE_CHANGED, payload);
      } catch {
        // Best-effort event dispatch.
      }
    });
  };

  const setAppUpdateState = (nextPatch = {}) => {
    const nextState = {
      ...appUpdateState,
      ...nextPatch,
      currentVersion: app.getVersion(),
    };

    if (nextState.progress == null) {
      delete nextState.progress;
    } else {
      nextState.progress = clampUpdateProgress(nextState.progress);
    }

    if (!nextState.latestVersion) {
      delete nextState.latestVersion;
    }

    if (!nextState.message) {
      delete nextState.message;
    }

    appUpdateState = nextState;
    emitAppUpdateState();
  };

  const isInAppUpdateSupported = () =>
    app.isPackaged && UPDATE_SUPPORTED_PLATFORMS.has(process.platform);

  const configureAutoUpdater = () => {
    if (!autoUpdater) {
      return;
    }

    if (autoUpdaterConfigured) {
      return;
    }

    autoUpdaterConfigured = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = {
      info: (...args) => console.log("[updater]", ...args),
      warn: (...args) => console.warn("[updater]", ...args),
      error: (...args) => console.error("[updater]", ...args),
      debug: (...args) => console.debug("[updater]", ...args),
    };

    autoUpdater.on("checking-for-update", () => {
      setAppUpdateState({
        stage: UPDATE_STAGES.CHECKING,
        progress: 0,
        message: "Checking for updates...",
      });
    });

    autoUpdater.on("update-available", (info) => {
      updateCheckInFlight = false;
      setAppUpdateState({
        stage: UPDATE_STAGES.DOWNLOADING,
        latestVersion:
          typeof info?.version === "string" ? info.version : undefined,
        progress: 0,
        message: "Downloading update...",
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      updateCheckInFlight = false;
      setAppUpdateState({
        stage: UPDATE_STAGES.NO_UPDATE,
        latestVersion:
          typeof info?.version === "string" ? info.version : app.getVersion(),
        progress: 100,
        message: "Up to date.",
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const percentage = clampUpdateProgress(progress?.percent);
      setAppUpdateState({
        stage: UPDATE_STAGES.DOWNLOADING,
        progress: percentage,
        message: `Downloading update... ${percentage}%`,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateCheckInFlight = false;
      updateDownloaded = true;
      setAppUpdateState({
        stage: UPDATE_STAGES.DOWNLOADED,
        latestVersion:
          typeof info?.version === "string" ? info.version : undefined,
        progress: 100,
        message: "Update downloaded. Restart to install.",
      });
    });

    autoUpdater.on("error", (error) => {
      updateCheckInFlight = false;
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: normalizeUpdateMessage(error),
      });
    });
  };

  const checkAndDownloadAppUpdate = async () => {
    if (!autoUpdater) {
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: "Update module is unavailable. Install dependencies first.",
      });
      return { started: false };
    }

    if (!UPDATE_SUPPORTED_PLATFORMS.has(process.platform)) {
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: "In-app updates are available on macOS and Windows only.",
      });
      return { started: false };
    }

    if (!app.isPackaged) {
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: "In-app updates are available in packaged builds only.",
      });
      return { started: false };
    }

    if (updateDownloaded || appUpdateState.stage === UPDATE_STAGES.DOWNLOADED) {
      return { started: false };
    }

    if (
      updateCheckInFlight ||
      appUpdateState.stage === UPDATE_STAGES.CHECKING ||
      appUpdateState.stage === UPDATE_STAGES.DOWNLOADING
    ) {
      return { started: false };
    }

    configureAutoUpdater();

    updateCheckInFlight = true;
    setAppUpdateState({
      stage: UPDATE_STAGES.CHECKING,
      progress: 0,
      message: "Checking for updates...",
    });

    try {
      await autoUpdater.checkForUpdates();
      return { started: true };
    } catch (error) {
      updateCheckInFlight = false;
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: normalizeUpdateMessage(error),
      });
      return { started: false };
    }
  };

  const installDownloadedAppUpdate = async () => {
    if (!autoUpdater) {
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: "Update module is unavailable. Install dependencies first.",
      });
      return { started: false };
    }

    if (appUpdateState.stage !== UPDATE_STAGES.DOWNLOADED || !updateDownloaded) {
      return { started: false };
    }

    try {
      autoUpdater.quitAndInstall(false, true);
      return { started: true };
    } catch (error) {
      setAppUpdateState({
        stage: UPDATE_STAGES.ERROR,
        message: normalizeUpdateMessage(error),
      });
      return { started: false };
    }
  };

  const applyUnsupportedRuntimeMessage = () => {
    if (!isInAppUpdateSupported()) {
      setAppUpdateState({
        stage: UPDATE_STAGES.IDLE,
        message:
          process.platform === "darwin" || process.platform === "win32"
            ? "In-app updates are available in packaged builds only."
            : "In-app updates are available on macOS and Windows only.",
      });
    }
  };

  // ── auto-update preference (persisted to userData) ──────────────────────

  const getAutoUpdatePrefPath = () =>
    path.join(app.getPath("userData"), "auto_update_pref.json");

  const getAutoUpdateEnabled = () => {
    try {
      const raw = fs.readFileSync(getAutoUpdatePrefPath(), "utf8");
      const parsed = JSON.parse(raw);
      return parsed?.enabled !== false; // default true
    } catch {
      return true; // default true if file missing or unreadable
    }
  };

  const setAutoUpdateEnabled = (enabled) => {
    try {
      fs.writeFileSync(
        getAutoUpdatePrefPath(),
        JSON.stringify({ enabled: Boolean(enabled) }),
        "utf8",
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Failed to save preference" };
    }
  };

  const scheduleStartupAutoUpdateCheck = () => {
    if (!isInAppUpdateSupported()) {
      return;
    }
    setTimeout(() => {
      if (getAutoUpdateEnabled()) {
        checkAndDownloadAppUpdate().catch(() => {});
      }
    }, STARTUP_CHECK_DELAY_MS);
  };

  return {
    UPDATE_STAGES,
    isInAppUpdateSupported,
    applyUnsupportedRuntimeMessage,
    getAppUpdateStatePayload,
    checkAndDownloadAppUpdate,
    installDownloadedAppUpdate,
    getAutoUpdateEnabled,
    setAutoUpdateEnabled,
    scheduleStartupAutoUpdateCheck,
  };
};

module.exports = {
  createUpdateService,
  UPDATE_STAGES,
};
