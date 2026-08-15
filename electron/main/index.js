const {
  app,
  BrowserWindow,
  dialog,
  shell,
  ipcMain,
  webContents,
  nativeTheme,
  powerMonitor,
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
const {
  createSettingsStorageService,
} = require("./services/settings_storage/service");
const {
  createSettingsQuitCoordinator,
} = require("./services/settings_storage/quit_coordinator");
const {
  createRunBundleStorageService,
} = require("./services/run_bundle_storage/service");
const {
  registerRunBundleStorageHandlers,
} = require("./services/run_bundle_storage/register_handlers");
const { createMemoryVaultService } = require("./services/memory_vault/service");
const {
  createVaultSinkExecutors,
} = require("./services/memory_vault/vault_sink_executor");
const {
  createBootReadinessService,
} = require("./services/boot_readiness/service");
const { createTestApiService } = require("./services/test-api");
const { registerIpcHandlers } = require("./ipc/register_handlers");
const sqlite = require("node:sqlite");

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

// dev 模式禁用 HTTP 缓存:Electron 会跨 reload 缓存 dev server 的 bundle.js,
// 表现为"代码已重编译、app 刷新后仍跑旧逻辑"(本项目已三次踩坑)。仅影响未打包运行。
if (!app.isPackaged) {
  app.commandLine.appendSwitch("disable-http-cache");
}

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
    path,
    sqlite,
  });

  const settingsStorageService = createSettingsStorageService({
    app,
    fs,
    path,
    sqlite,
    // Phase 4 (S1): encrypted provider-credential storage. init() runs inside
    // app.whenReady(), so safeStorage's "usable only after ready" precondition
    // is already satisfied by the existing service ordering.
    safeStorage: require("electron").safeStorage,
  });

  // RunBundle v1 accounting owns its tables through a separate connection to
  // settings.db, mirroring Memory Vault's table ownership. It never mutates or
  // migrates the legacy token_usage_records store.
  const runBundleStorageService = createRunBundleStorageService({
    app,
    path,
    sqlite,
  });
  registerRunBundleStorageHandlers({
    ipcMain,
    runBundleStorageService,
  });

  // Memory V2 P0 vault control plane. Shares the settings.db FILE through its
  // own connection but owns only the vault_* tables; init() runs inside
  // app.whenReady() so safeStorage's "usable only after ready" precondition
  // holds here exactly as it does for settingsStorageService.
  const memoryVaultService = createMemoryVaultService({
    app,
    path,
    sqlite,
    safeStorage: require("electron").safeStorage,
    dialog,
    getMainWindow: windowService.getMainWindow,
    http,
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
    // Localhost SSE transport is owned by the service's Node adapter.
    shell,
    webContents,
    runtimeService,
    // Phase 4 (S4): main-internal provider-secret reader used by the stream
    // strip+inject seam. Created above (before unchainService), so it is
    // available to inject here just like runtimeService.
    settingsStorageService,
    // Main-internal Vault broker provider + native confirmation state machine.
    // Neither object is exposed over renderer IPC.
    memoryVaultService,
    getAppIsQuitting: () => appIsQuitting,
  });

  // Main-internal only: renderer chat deletion commits a durable outbox row;
  // these targets are invoked later by the background runner. Neither service
  // object nor the runner controls are exposed through chat-storage IPC.
  chatStorageService.configureDeletionTargets({
    unchainService,
    memoryVaultService,
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

  // Boot readiness gate. Observes the sidecar + MCP environment and publishes
  // the projection the renderer's boot overlay holds its gate on. Created here
  // (before registerIpcHandlers) so GET_READINESS always has an authority to
  // answer from, even if start() has not been called yet.
  const bootReadinessService = createBootReadinessService({
    unchainService,
    webContents,
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
      settingsStorageService,
      memoryVaultService,
      bootReadinessService,
    },
  });

  // Owned by the startup assembly below so `will-quit` can drain it even if
  // configureSinkExecutors never ran (created-then-failed is still a registry
  // that may hold live worker process groups).
  let vaultSinkExecutorRegistry = null;

  const settingsQuitCoordinator = createSettingsQuitCoordinator({
    app,
    ipcMain,
    getMainWindow: windowService.getMainWindow,
    getWindowCount: () => BrowserWindow.getAllWindows().length,
  });
  settingsQuitCoordinator.start();

  const stopBackgroundServices = () => {
    appIsQuitting = true;
    // Before stopMiso(), so the readiness poll cannot observe the deliberate
    // shutdown and broadcast a spurious "backend died" to a renderer that is
    // itself on the way out.
    bootReadinessService.stop();
    chatStorageService.stopDeletionOutboxRunner();
    ollamaService.stopOllama();
    unchainService.stopMiso();
  };

  const stopActiveExecutionsForLifecycle = (reason) => {
    void unchainService.stopActiveMisoExecutionsForLifecycle({ reason });
  };

  // before-quit is cancelable by renderer beforeunload. Defer shutdown until
  // will-quit so a failed chat drain cannot leave a still-running app with its
  // sidecars stopped and appIsQuitting stuck true.
  app.on("will-quit", () => {
    settingsQuitCoordinator.dispose({ abortRenderer: false });
    stopBackgroundServices();
    void testApiService.stop();
    chatStorageService.close();
    runBundleStorageService.close();
    settingsStorageService.close();
    // Stops the broker, then SYNCHRONOUSLY SIGKILLs every live Vault worker
    // process group, then closes the DB. will-quit does not await promises, so
    // an async drain would let a worker holding plaintext outlive the app.
    memoryVaultService.close();
    // Belt-and-braces: covers the case where the registry was created but
    // configureSinkExecutors failed, so the vault never learned about it.
    // close() is idempotent.
    try {
      vaultSinkExecutorRegistry?.close();
    } catch (_error) {
      // Never surface kill details; quit must proceed.
    }
  });

  app.on("second-instance", () => {
    const existingMainWindow = windowService.getMainWindow();
    if (existingMainWindow && !existingMainWindow.isDestroyed()) {
      windowService.focusMainWindow();
      return;
    }
    windowService.createMainWindow();
  });

  app.whenReady().then(async () => {
    if (powerMonitor && typeof powerMonitor.on === "function") {
      powerMonitor.on("suspend", () => {
        stopActiveExecutionsForLifecycle("system_suspend");
      });
    }

    await chatStorageService.init();
    // Must complete before the renderer window exists: the renderer's
    // synchronous bootstrap read depends on it. init() never throws — a broken
    // settings.db puts the service in degraded mode (file left in place).
    await settingsStorageService.init();
    // Independent and degradation-safe: a failed accounting store does not
    // prevent the chat UI from opening, but its writes will fail explicitly.
    await runBundleStorageService.init();
    // After settings storage: both open the same file, and vault init() never
    // throws — a broken settings.db degrades the vault (file left in place).
    await memoryVaultService.init();

    // ---- Vault sink worker assembly (order is a security requirement) -----
    //
    //   settings init  →  vault init
    //     →  resolve the worker entrypoint ONCE and freeze it
    //     →  build the reviewed executor registry
    //     →  configureSinkExecutors (one-shot, main-only)
    //     →  startSinkBroker (refuses an empty registry)
    //     →  only THEN start the sidecar
    //
    // The sidecar must start last: it is the only broker client, so a sidecar
    // that comes up before the broker is configured would be able to reach a
    // listener that cannot serve it. Every failure below is fail-closed —
    // the broker simply never listens and every vault use dies at
    // vault_sink_unavailable. Logs are static codes only: never a path, a
    // broker URL/key, a payload, or an error message.
    let vaultSinkWorkerEntrypoint = null;
    try {
      vaultSinkWorkerEntrypoint =
        unchainService.resolveVaultSinkWorkerEntrypoint();
    } catch (error) {
      console.error(
        "[memory-vault] sink worker entrypoint unavailable:",
        error?.code || "vault_worker_unavailable",
      );
    }

    if (vaultSinkWorkerEntrypoint) {
      try {
        vaultSinkExecutorRegistry = createVaultSinkExecutors({
          command: vaultSinkWorkerEntrypoint.command,
          args: vaultSinkWorkerEntrypoint.args,
          cwd: vaultSinkWorkerEntrypoint.cwd,
          dataDir: vaultSinkWorkerEntrypoint.dataDir,
          mcpRuntimeDir: vaultSinkWorkerEntrypoint.mcpRuntimeDir,
        });
      } catch (error) {
        vaultSinkExecutorRegistry = null;
        console.error(
          "[memory-vault] sink executors unavailable:",
          error?.code || "vault_worker_unavailable",
        );
      }
    }

    if (vaultSinkExecutorRegistry) {
      try {
        memoryVaultService.configureSinkExecutors(vaultSinkExecutorRegistry);
        await memoryVaultService.startSinkBroker();
      } catch (error) {
        // Static code only: never log URL/key, request data or an error message.
        console.error(
          "[memory-vault] sink broker unavailable:",
          error?.code || "vault_broker_unavailable",
        );
      }
    } else {
      console.error(
        "[memory-vault] sink broker unavailable:",
        "vault_sink_unavailable",
      );
    }

    // S6a: clear any leftover skill-pack temp dirs from a prior crashed install.
    runtimeService.sweepLeftoverSkillpackDirs();

    updateService.applyUnsupportedRuntimeMessage();

    ollamaService.startOllama();
    unchainService.startMiso();
    // Start observing immediately after the sidecar is kicked off and BEFORE
    // the window exists: the boot overlay's whole job is to cover the window
    // that has not been created yet, so the clock must already be running.
    bootReadinessService.start();
    chatStorageService.startDeletionOutboxRunner();

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
    stopActiveExecutionsForLifecycle("app_windows_closed");
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
