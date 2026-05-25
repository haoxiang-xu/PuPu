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
const { createUnchainService } = require("./services/unchain/service");
const { createUpdateService } = require("./services/update/service");
const { createScreenshotService } = require("./services/screenshot/service");
const { createChatStorageService } = require("./services/chat_storage/service");
const { createTestApiService } = require("./services/test-api");
const { registerIpcHandlers } = require("./ipc/register_handlers");
const fsp = require("fs/promises");

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

  const chatStorageService = createChatStorageService({
    app,
    fs,
    fsp,
    path,
  });

  const ollamaService = createOllamaService({
    app,
    shell,
    spawn,
    http,
    https,
    fs,
    path,
    net,
  });

  const unchainService = createUnchainService({
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
    fs,
    path,
  });

  const screenshotService = createScreenshotService({
    fs,
    path,
    os: require("os"),
    child_process: require("child_process"),
    getMainWindow: windowService.getMainWindow,
  });

  const testApiService = createTestApiService({
    env: process.env,
    ipcMain,
    portFilePath: path.join(app.getPath("userData"), "test-api-port"),
    getMainWindow: windowService.getMainWindow,
    electron: require("electron"),
  });

  registerIpcHandlers({
    ipcMain,
    app,
    services: {
      windowService,
      updateService,
      ollamaService,
      unchainService,
      runtimeService,
      screenshotService,
      chatStorageService,
    },
  });

  const stopBackgroundServices = () => {
    appIsQuitting = true;
    ollamaService.stopOllama();
    unchainService.stopMiso();
  };

  app.on("before-quit", () => {
    chatStorageService.flushSync();
  });
  app.on("before-quit", stopBackgroundServices);
  app.on("before-quit", () => {
    void testApiService.stop();
  });
  app.on("will-quit", stopBackgroundServices);

  app.on("second-instance", () => {
    const existingMainWindow = windowService.getMainWindow();
    if (existingMainWindow && !existingMainWindow.isDestroyed()) {
      windowService.focusMainWindow();
      return;
    }
    windowService.createMainWindow();
  });

  app.whenReady().then(async () => {
    await chatStorageService.init();

    updateService.applyUnsupportedRuntimeMessage();

    ollamaService.startOllama();
    unchainService.startMiso();

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
    updateService.scheduleStartupAutoUpdateCheck();

    const mainWin = windowService.getMainWindow();
    if (mainWin && mainWin.webContents) {
      await testApiService.start({ webContents: mainWin.webContents });
    }

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
