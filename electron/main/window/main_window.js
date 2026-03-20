const { CHANNELS } = require("../../shared/channels");

const getDevServerUrl = () =>
  process.env.ELECTRON_START_URL || "http://localhost:2907/#";
const getDevServerOrigin = () => {
  try {
    return new URL(getDevServerUrl()).origin;
  } catch {
    return "http://localhost:2907";
  }
};
const PROD_ENTRY_HASH = "/";
const DEV_SERVER_RETRY_MS = 1200;
const DARWIN_TRAFFIC_LIGHT_X = 14;
const DARWIN_TRAFFIC_LIGHT_Y = 18;

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

/* ── Theme-preference persistence (tiny JSON file in userData) ────── */
const THEME_PREFS_FILENAME = "theme-prefs.json";

const DARK_PALETTE = Object.freeze({
  backgroundColor: "#121212",
  foregroundColor: "rgba(255,255,255,0.75)",
  spinnerTrack: "rgba(255,255,255,0.08)",
  spinnerArc: "rgba(255,255,255,0.4)",
});

const LIGHT_PALETTE = Object.freeze({
  backgroundColor: "#FFFFFF",
  foregroundColor: "rgba(0,0,0,0.65)",
  spinnerTrack: "rgba(0,0,0,0.08)",
  spinnerArc: "rgba(0,0,0,0.35)",
});

const readThemePrefs = (app, fs, path) => {
  try {
    const filePath = path.join(app.getPath("userData"), THEME_PREFS_FILENAME);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeThemePrefs = (app, fs, path, data) => {
  try {
    const filePath = path.join(app.getPath("userData"), THEME_PREFS_FILENAME);
    const existing = readThemePrefs(app, fs, path) || {};
    fs.writeFileSync(filePath, JSON.stringify({ ...existing, ...data }));
  } catch {
    // Non-critical – silently ignore.
  }
};

const paletteForMode = (mode) => {
  if (mode === "light" || mode === "light_mode") return LIGHT_PALETTE;
  return DARK_PALETTE;
};
/* ── Theme-preference persistence ──────────────────────────────────── */

const createMainWindowService = ({
  app,
  BrowserWindow,
  shell,
  fs,
  path,
  nativeTheme,
}) => {
  let mainWindow = null;
  let darwinTrafficLightSyncTimeout = null;

  const resolvePublicPath = (...segments) =>
    path.join(app.getAppPath(), "public", ...segments);
  const resolveBuildPath = (...segments) =>
    path.join(app.getAppPath(), "build", ...segments);

  const emitWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send(CHANNELS.WINDOW_STATE.LISTENER_EVENT, {
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

  /** Resolve the initial background color from persisted prefs. */
  const resolveInitialBackgroundColor = () => {
    const prefs = readThemePrefs(app, fs, path);
    if (
      prefs?.backgroundColor &&
      /^#[0-9a-fA-F]{3,8}$/.test(prefs.backgroundColor)
    ) {
      return prefs.backgroundColor;
    }
    // Fall back based on persisted themeMode or OS preference.
    if (prefs?.themeMode === "light" || prefs?.themeMode === "light_mode") {
      return LIGHT_PALETTE.backgroundColor;
    }
    if (prefs?.themeMode === "system") {
      return nativeTheme.shouldUseDarkColors
        ? DARK_PALETTE.backgroundColor
        : LIGHT_PALETTE.backgroundColor;
    }
    return DARK_PALETTE.backgroundColor;
  };

  /** Resolve the full loading-screen palette from persisted prefs. */
  const resolveLoadingPalette = () => {
    const prefs = readThemePrefs(app, fs, path);
    if (prefs?.themeMode === "light" || prefs?.themeMode === "light_mode") {
      return LIGHT_PALETTE;
    }
    if (prefs?.themeMode === "system") {
      return nativeTheme.shouldUseDarkColors ? DARK_PALETTE : LIGHT_PALETTE;
    }
    // dark is the default
    return DARK_PALETTE;
  };

  const createWindowOptions = () => {
    const windowsIcon = resolvePublicPath("icon-win.ico");
    const fallbackIcon = resolvePublicPath("favicon.ico");

    const initialBgColor = resolveInitialBackgroundColor();

    const baseWindowOptions = {
      title: "Mini UI",
      width: 1280,
      height: 820,
      minWidth: 980,
      minHeight: 620,
      icon: fs.existsSync(windowsIcon) ? windowsIcon : fallbackIcon,
      autoHideMenuBar: true,
      resizable: true,
      maximizable: true,
      webPreferences: {
        preload: resolvePublicPath("preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // Keep preload module loading compatible after modularization.
        sandbox: false,
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
        backgroundColor: initialBgColor,
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
        backgroundColor: initialBgColor,
        show: false,
      };
    }

    return {
      ...baseWindowOptions,
      frame: true,
      titleBarStyle: "hidden",
      backgroundColor: initialBgColor,
      show: false,
    };
  };

  const loadDevUrlWhenReady = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const devServerUrl = getDevServerUrl();

    try {
      const response = await fetch(devServerUrl, { method: "HEAD" });
      if (response.ok || response.status < 500) {
        await mainWindow.loadURL(devServerUrl);
        return;
      }
    } catch {
      // Dev server not ready yet. Retry until CRA is available.
    }

    setTimeout(loadDevUrlWhenReady, DEV_SERVER_RETRY_MS);
  };

  const focusMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return null;
    }
    if (
      typeof mainWindow.isMinimized === "function" &&
      mainWindow.isMinimized()
    ) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  };

  const createMainWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return focusMainWindow();
    }

    mainWindow = new BrowserWindow(createWindowOptions());

    /* Load loading screen with theme-aware query params */
    const palette = resolveLoadingPalette();
    mainWindow.loadFile(resolvePublicPath("loading.html"), {
      query: {
        bg: palette.backgroundColor,
        fg: palette.foregroundColor,
        st: palette.spinnerTrack,
        sa: palette.spinnerArc,
      },
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
      emitWindowState();
      scheduleDarwinTrafficLightSync();
      if (app.isPackaged) {
        mainWindow.loadFile(resolveBuildPath("index.html"), {
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
      const devServerOrigin = getDevServerOrigin();
      const isLocalAppUrl =
        url.startsWith("file://") || url.startsWith(devServerOrigin);
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

    return mainWindow;
  };

  const handleThemeSetBackgroundColor = (color) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (typeof color === "string" && /^#[0-9a-fA-F]{6,8}$/.test(color)) {
      mainWindow.setBackgroundColor(color);
      /* Persist so the next launch uses this color immediately. */
      writeThemePrefs(app, fs, path, { backgroundColor: color });
    }
  };

  const handleThemeSetMode = (mode) => {
    const themeSource = normalizeThemeModeToNativeSource(mode);
    if (!themeSource) {
      return;
    }
    nativeTheme.themeSource = themeSource;
    /* Persist the mode so the loading screen matches on next launch. */
    writeThemePrefs(app, fs, path, { themeMode: themeSource });
  };

  const handleWindowStateEvent = (action) => {
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
  };

  const showMainWindow = () => {
    focusMainWindow();
  };

  return {
    createMainWindow,
    getMainWindow: () => mainWindow,
    focusMainWindow,
    showMainWindow,
    getPublicAssetPath: resolvePublicPath,
    handleThemeSetBackgroundColor,
    handleThemeSetMode,
    handleWindowStateEvent,
  };
};

module.exports = {
  createMainWindowService,
};
