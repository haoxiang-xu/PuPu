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

const { createMainWindowService } = require("./window/main_window");
const { createRuntimeService } = require("./services/runtime/service");
const { createOllamaService } = require("./services/ollama/service");
const { createMisoService } = require("./services/miso/service");
const { createUpdateService } = require("./services/update/service");
const { registerIpcHandlers } = require("./ipc/register_handlers");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (error) {
  console.warn(
    "[updater] electron-updater is not installed; in-app updates are disabled.",
    error?.message || error,
  );
}

let appIsQuitting = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  appIsQuitting = true;
  app.quit();
} else {
  const windowService = createMainWindowService({
    app,
    BrowserWindow,
    shell,
    fs,
    path,
    nativeTheme,
  });

  const runtimeService = createRuntimeService({
    app,
    dialog,
    shell,
    fs,
    path,
    getMainWindow: windowService.getMainWindow,
  });

  const ollamaService = createOllamaService({
    app,
    shell,
    spawn,
    http,
    https,
    fs,
    path,
  });

  const misoService = createMisoService({
    app,
    fs,
    path,
    spawn,
    spawnSync,
    crypto,
    net,
    webContents,
    runtimeService,
    getAppIsQuitting: () => appIsQuitting,
  });

  const updateService = createUpdateService({
    app,
    webContents,
    autoUpdater,
  });

  registerIpcHandlers({
    ipcMain,
    app,
    services: {
      windowService,
      updateService,
      ollamaService,
      misoService,
      runtimeService,
    },
  });

  const stopBackgroundServices = () => {
    appIsQuitting = true;
    ollamaService.stopOllama();
    misoService.stopMiso();
  };

  app.on("before-quit", stopBackgroundServices);
  app.on("will-quit", stopBackgroundServices);

  app.on("second-instance", () => {
    const existingMainWindow = windowService.getMainWindow();
    if (existingMainWindow && !existingMainWindow.isDestroyed()) {
      windowService.focusMainWindow();
      return;
    }
    windowService.createMainWindow();
  });

  app.whenReady().then(() => {
    updateService.applyUnsupportedRuntimeMessage();

    ollamaService.startOllama();
    misoService.startMiso();

    if (process.platform === "darwin" && app.dock) {
      const dockIconPath = windowService.getPublicAssetPath("logo512.png");
      try {
        const { nativeImage } = require("electron");
        const icon = nativeImage.createFromPath(dockIconPath);
        if (!icon.isEmpty()) {
          app.dock.setIcon(icon);
        }
      } catch {
        // Silently ignore if icon cannot be loaded.
      }
    }

    windowService.createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowService.createMainWindow();
      } else {
        windowService.focusMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
