const { CHANNELS } = require("../../shared/channels");

const DEV_SERVER_URL = process.env.ELECTRON_START_URL || "http://localhost:2907/#";
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

  const createWindowOptions = () => {
    const windowsIcon = resolvePublicPath("icon-win.ico");
    const fallbackIcon = resolvePublicPath("favicon.ico");

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
    } catch {
      // Dev server not ready yet. Retry until CRA is available.
    }

    setTimeout(loadDevUrlWhenReady, DEV_SERVER_RETRY_MS);
  };

  const focusMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return null;
    }
    if (typeof mainWindow.isMinimized === "function" && mainWindow.isMinimized()) {
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

    mainWindow.loadFile(resolvePublicPath("loading.html"));

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

    return mainWindow;
  };

  const handleThemeSetBackgroundColor = (color) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (typeof color === "string" && /^#[0-9a-fA-F]{6,8}$/.test(color)) {
      mainWindow.setBackgroundColor(color);
    }
  };

  const handleThemeSetMode = (mode) => {
    const themeSource = normalizeThemeModeToNativeSource(mode);
    if (!themeSource) {
      return;
    }
    nativeTheme.themeSource = themeSource;
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
