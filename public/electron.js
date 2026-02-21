const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");

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
    };
  }

  if (process.platform === "win32") {
    return {
      ...baseWindowOptions,
      frame: true,
      titleBarStyle: "hidden",
      hasShadow: true,
      backgroundColor: "#121212",
    };
  }

  return {
    ...baseWindowOptions,
    frame: true,
    titleBarStyle: "hidden",
    backgroundColor: "#121212",
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
  } catch (error) {
    // Dev server not ready yet. Retry until CRA is available.
  }

  setTimeout(loadDevUrlWhenReady, DEV_SERVER_RETRY_MS);
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow(createWindowOptions());

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "build", "index.html"), {
      hash: PROD_ENTRY_HASH,
    });
  } else {
    loadDevUrlWhenReady();
  }

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
  mainWindow.once("ready-to-show", () => {
    emitWindowState();
    scheduleDarwinTrafficLightSync();
  });

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

app.whenReady().then(() => {
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
