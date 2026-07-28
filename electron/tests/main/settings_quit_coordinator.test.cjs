const { EventEmitter } = require("events");
const {
  createSettingsQuitCoordinator,
} = require("../../main/services/settings_storage/quit_coordinator");
const { CHANNELS } = require("../../shared/channels");

const makeEvent = () => ({ preventDefault: jest.fn() });

const createHarness = ({ platform = "darwin", windowCount = 1 } = {}) => {
  const app = new EventEmitter();
  app.quit = jest.fn();
  const ipcMain = new EventEmitter();
  const webContents = new EventEmitter();
  webContents.send = jest.fn();
  webContents.isDestroyed = jest.fn(() => false);
  const window = new EventEmitter();
  window.webContents = webContents;
  window.close = jest.fn();
  window.isDestroyed = jest.fn(() => false);
  const afterEventTasks = [];
  const timers = [];
  const logger = { warn: jest.fn() };

  const coordinator = createSettingsQuitCoordinator({
    app,
    ipcMain,
    getMainWindow: () => window,
    getWindowCount: () => windowCount,
    platform,
    createRequestId: () => "request-1",
    setTimer: (callback) => {
      timers.push(callback);
      return callback;
    },
    clearTimer: jest.fn(),
    scheduleAfterEvent: (callback) => afterEventTasks.push(callback),
    logger,
  });
  coordinator.start();

  return {
    app,
    ipcMain,
    webContents,
    window,
    afterEventTasks,
    timers,
    logger,
    coordinator,
  };
};

describe("settings quit coordinator", () => {
  test("drains before app quit, then releases the renderer after chat veto", () => {
    const harness = createHarness();
    const firstBeforeQuit = makeEvent();
    harness.app.emit("before-quit", firstBeforeQuit);

    expect(firstBeforeQuit.preventDefault).toHaveBeenCalledTimes(1);
    expect(harness.webContents.send).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_REQUEST,
      { requestId: "request-1" },
    );
    expect(harness.app.quit).not.toHaveBeenCalled();

    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "request-1", ok: true },
    );
    expect(harness.app.quit).toHaveBeenCalledTimes(1);

    const authorizedBeforeQuit = makeEvent();
    harness.app.emit("before-quit", authorizedBeforeQuit);
    expect(authorizedBeforeQuit.preventDefault).not.toHaveBeenCalled();

    const appDrivenClose = makeEvent();
    harness.window.emit("close", appDrivenClose);
    expect(appDrivenClose.preventDefault).not.toHaveBeenCalled();

    const chatVeto = makeEvent();
    harness.webContents.emit("will-prevent-unload", chatVeto);
    expect(chatVeto.preventDefault).not.toHaveBeenCalled();
    expect(harness.webContents.send).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      { requestId: "request-1" },
    );
    expect(harness.coordinator.isDraining()).toBe(false);
    expect(harness.app.quit).toHaveBeenCalledTimes(1);

    harness.coordinator.dispose();
  });

  test("timeout cancels quit and aborts the renderer barrier", () => {
    const harness = createHarness();
    const beforeQuit = makeEvent();
    harness.app.emit("before-quit", beforeQuit);

    expect(harness.timers).toHaveLength(1);
    harness.timers[0]();

    expect(harness.app.quit).not.toHaveBeenCalled();
    expect(harness.webContents.send).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      { requestId: "request-1" },
    );
    expect(harness.logger.warn).toHaveBeenCalledWith(
      "[settings-quit] quit canceled:",
      "settings_quit_drain_timeout",
    );
    expect(harness.coordinator.isDraining()).toBe(false);

    harness.coordinator.dispose();
  });

  test("renderer drain failure cancels quit without closing the app", () => {
    const harness = createHarness();
    harness.app.emit("before-quit", makeEvent());
    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      {
        requestId: "request-1",
        ok: false,
        errorCode: "settings_quit_drain_failed",
      },
    );

    expect(harness.app.quit).not.toHaveBeenCalled();
    expect(harness.webContents.send).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      { requestId: "request-1" },
    );
    expect(harness.coordinator.isDraining()).toBe(false);
    harness.coordinator.dispose();
  });

  test("ignores spoofed sender, mismatched request and non-allowlisted result shape", () => {
    const harness = createHarness();
    harness.app.emit("before-quit", makeEvent());

    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: {} },
      { requestId: "request-1", ok: true },
    );
    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "wrong-request", ok: true },
    );
    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "request-1", ok: true, value: "not-allowlisted" },
    );

    expect(harness.app.quit).not.toHaveBeenCalled();
    expect(harness.coordinator.isDraining()).toBe(true);

    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "request-1", ok: true },
    );
    expect(harness.app.quit).toHaveBeenCalledTimes(1);
    harness.coordinator.dispose({ abortRenderer: false });
  });

  test("main-process defaultPrevented veto releases the drained renderer", () => {
    const harness = createHarness();
    harness.app.emit("before-quit", makeEvent());
    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "request-1", ok: true },
    );

    const authorizedAttempt = {
      defaultPrevented: false,
      preventDefault: jest.fn(),
    };
    harness.app.emit("before-quit", authorizedAttempt);
    // Simulate a later synchronous main listener vetoing the same event.
    authorizedAttempt.defaultPrevented = true;
    harness.afterEventTasks.splice(0).forEach((task) => task());

    expect(harness.coordinator.isDraining()).toBe(false);
    expect(harness.webContents.send).toHaveBeenCalledWith(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      { requestId: "request-1" },
    );
    harness.coordinator.dispose();
  });

  test("normal renderer unload may span a task without being mistaken for veto", async () => {
    const harness = createHarness();
    harness.app.emit("before-quit", makeEvent());
    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "request-1", ok: true },
    );

    const authorizedBeforeQuit = {
      defaultPrevented: false,
      preventDefault: jest.fn(),
    };
    harness.app.emit("before-quit", authorizedBeforeQuit);
    const authorizedClose = {
      defaultPrevented: false,
      preventDefault: jest.fn(),
    };
    harness.window.emit("close", authorizedClose);
    harness.afterEventTasks.splice(0).forEach((task) => task());

    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.coordinator.isDraining()).toBe(true);
    expect(
      harness.webContents.send.mock.calls.filter(
        ([channel]) => channel === CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      ),
    ).toHaveLength(0);

    harness.app.emit("will-quit");
    expect(harness.coordinator.isDraining()).toBe(false);
    expect(
      harness.webContents.send.mock.calls.filter(
        ([channel]) => channel === CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      ),
    ).toHaveLength(0);
    harness.coordinator.dispose({ abortRenderer: false });
  });

  test("non-mac last-window close drains once before window-all-closed quit", () => {
    const harness = createHarness({ platform: "linux", windowCount: 0 });
    const initialClose = makeEvent();
    harness.window.emit("close", initialClose);

    expect(initialClose.preventDefault).toHaveBeenCalledTimes(1);
    harness.ipcMain.emit(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      { sender: harness.webContents },
      { requestId: "request-1", ok: true },
    );
    expect(harness.window.close).toHaveBeenCalledTimes(1);

    const authorizedClose = makeEvent();
    harness.window.emit("close", authorizedClose);
    expect(authorizedClose.preventDefault).not.toHaveBeenCalled();
    harness.window.emit("closed");

    const windowAllClosedQuit = makeEvent();
    harness.app.emit("before-quit", windowAllClosedQuit);
    expect(windowAllClosedQuit.preventDefault).not.toHaveBeenCalled();
    expect(
      harness.webContents.send.mock.calls.filter(
        ([channel]) =>
          channel === CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_REQUEST,
      ),
    ).toHaveLength(1);

    harness.coordinator.dispose({ abortRenderer: false });
  });
});
