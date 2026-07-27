const { randomUUID } = require("crypto");
const { CHANNELS } = require("../../../shared/channels");

const DEFAULT_TIMEOUT_MS = 7000;
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,80}$/;

const isDestroyed = (target) =>
  !target ||
  (typeof target.isDestroyed === "function" && target.isDestroyed());

const createSettingsQuitCoordinator = ({
  app,
  ipcMain,
  getMainWindow,
  getWindowCount = () => 0,
  platform = process.platform,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  createRequestId = randomUUID,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  scheduleAfterEvent = queueMicrotask,
  logger = console,
}) => {
  if (!app || !ipcMain || typeof getMainWindow !== "function") {
    throw new Error(
      "createSettingsQuitCoordinator requires app, ipcMain and getMainWindow",
    );
  }

  let started = false;
  let disposed = false;
  let activeRequest = null;
  let drainedLease = null;
  let appQuitBypass = false;
  let postWindowCloseQuitBypass = false;
  let windowCloseBypass = null;
  const attachedWindows = new WeakSet();
  let fallbackRequestSequence = 0;

  const safeSend = (webContents, channel, payload) => {
    if (isDestroyed(webContents) || typeof webContents.send !== "function") {
      return false;
    }
    try {
      webContents.send(channel, payload);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const sendAbort = (request) => {
    if (!request) return;
    safeSend(
      request.webContents,
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_ABORT,
      { requestId: request.requestId },
    );
  };

  const logFailureCode = (code) => {
    if (logger && typeof logger.warn === "function") {
      logger.warn("[settings-quit] quit canceled:", code);
    }
  };

  const cancelActiveRequest = (code, { notifyRenderer = true } = {}) => {
    const request = activeRequest;
    if (!request) return false;
    activeRequest = null;
    clearTimer(request.timeout);
    if (notifyRenderer) sendAbort(request);
    logFailureCode(code);
    return true;
  };

  const releaseDrainedLease = (code, { notifyRenderer = true } = {}) => {
    const lease = drainedLease;
    if (!lease) return false;
    drainedLease = null;
    appQuitBypass = false;
    windowCloseBypass = null;
    if (notifyRenderer) sendAbort(lease);
    if (code) logFailureCode(code);
    return true;
  };

  const scheduleEventVetoCheck = (event, lease) => {
    scheduleAfterEvent(() => {
      // Main-process vetoes are reflected on the exact Electron event after
      // every synchronous listener has run. Renderer beforeunload vetoes have
      // their own reliable `will-prevent-unload` signal below. Do not infer a
      // cancel merely because normal renderer unload spans event-loop turns.
      if (drainedLease === lease && event?.defaultPrevented === true) {
        releaseDrainedLease("quit_canceled");
      }
    });
  };

  const continueIntentAfterDrain = (lease) => {
    if (lease.intent === "app-quit") {
      appQuitBypass = true;
      app.quit();
      return;
    }

    if (isDestroyed(lease.window) || typeof lease.window.close !== "function") {
      releaseDrainedLease("window_unavailable");
      return;
    }
    windowCloseBypass = lease.window;
    lease.window.close();
  };

  const isValidResultShape = (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return false;
    }
    const keys = Object.keys(payload).sort();
    if (payload.ok === true) {
      return (
        keys.length === 2 &&
        keys[0] === "ok" &&
        keys[1] === "requestId" &&
        typeof payload.requestId === "string"
      );
    }
    return (
      payload.ok === false &&
      keys.length === 3 &&
      keys[0] === "errorCode" &&
      keys[1] === "ok" &&
      keys[2] === "requestId" &&
      typeof payload.requestId === "string" &&
      typeof payload.errorCode === "string" &&
      ERROR_CODE_PATTERN.test(payload.errorCode)
    );
  };

  const handleDrainResult = (event, payload) => {
    const request = activeRequest;
    if (
      !request ||
      event?.sender !== request.webContents ||
      !isValidResultShape(payload) ||
      payload.requestId !== request.requestId
    ) {
      return;
    }

    activeRequest = null;
    clearTimer(request.timeout);
    if (payload.ok !== true) {
      sendAbort(request);
      logFailureCode(payload.errorCode);
      return;
    }

    drainedLease = request;
    continueIntentAfterDrain(request);
  };

  const makeRequestId = () => {
    try {
      const id = createRequestId();
      if (typeof id === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(id)) {
        return id;
      }
    } catch (_error) {
      // Fall through to a process-local non-secret control identifier.
    }
    fallbackRequestSequence += 1;
    return `settings-quit-${Date.now()}-${fallbackRequestSequence}`;
  };

  const requestDrain = (intent, window) => {
    if (disposed || activeRequest || drainedLease) return;

    if (
      isDestroyed(window) ||
      isDestroyed(window.webContents) ||
      typeof window.webContents.send !== "function"
    ) {
      // With no renderer there is no renderer-owned settings FIFO to drain.
      if (intent === "app-quit") {
        appQuitBypass = true;
        app.quit();
      }
      return;
    }

    const request = {
      requestId: makeRequestId(),
      intent,
      window,
      webContents: window.webContents,
      timeout: null,
    };
    request.timeout = setTimer(() => {
      if (activeRequest === request) {
        cancelActiveRequest("settings_quit_drain_timeout");
      }
    }, timeoutMs);
    activeRequest = request;

    if (
      !safeSend(
        request.webContents,
        CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_REQUEST,
        { requestId: request.requestId },
      )
    ) {
      cancelActiveRequest("settings_renderer_unavailable", {
        notifyRenderer: false,
      });
    }
  };

  const handleBeforeQuit = (event) => {
    if (disposed) return;
    if (appQuitBypass) {
      appQuitBypass = false;
      if (drainedLease) {
        scheduleEventVetoCheck(event, drainedLease);
      }
      return;
    }
    if (postWindowCloseQuitBypass) {
      postWindowCloseQuitBypass = false;
      return;
    }
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    requestDrain("app-quit", getMainWindow());
  };

  const attachWindow = (window) => {
    if (
      disposed ||
      isDestroyed(window) ||
      attachedWindows.has(window) ||
      typeof window.on !== "function"
    ) {
      return;
    }
    attachedWindows.add(window);

    window.on("close", (event) => {
      if (window !== getMainWindow()) return;

      if (
        drainedLease &&
        drainedLease.window === window &&
        drainedLease.intent === "app-quit"
      ) {
        scheduleEventVetoCheck(event, drainedLease);
        return;
      }
      if (windowCloseBypass === window) {
        windowCloseBypass = null;
        if (drainedLease) {
          scheduleEventVetoCheck(event, drainedLease);
        }
        return;
      }

      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      requestDrain("window-close", window);
    });

    window.on("closed", () => {
      if (activeRequest && activeRequest.window === window) {
        cancelActiveRequest("window_closed", { notifyRenderer: false });
      }
      if (drainedLease && drainedLease.window === window) {
        const completedWindowClose =
          drainedLease.intent === "window-close";
        drainedLease = null;
        windowCloseBypass = null;
        if (
          completedWindowClose &&
          platform !== "darwin" &&
          getWindowCount() === 0
        ) {
          // `window-all-closed` calls app.quit next; this renderer already
          // drained, so do not request a second handshake from a dead window.
          postWindowCloseQuitBypass = true;
        }
      }
    });

    const contents = window.webContents;
    if (contents && typeof contents.on === "function") {
      contents.on("will-prevent-unload", () => {
        if (drainedLease && drainedLease.window === window) {
          // Observe the chat fail-closed veto; never prevent this event.
          releaseDrainedLease("renderer_unload_veto");
        }
      });
    }
  };

  const handleBrowserWindowCreated = (_event, window) => {
    attachWindow(window);
  };

  const handleWillQuit = () => {
    disposed = true;
    if (activeRequest) {
      clearTimer(activeRequest.timeout);
      activeRequest = null;
    }
    drainedLease = null;
  };

  const start = () => {
    if (started || disposed) return;
    started = true;
    ipcMain.on(CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT, handleDrainResult);
    app.on("before-quit", handleBeforeQuit);
    app.on("browser-window-created", handleBrowserWindowCreated);
    app.on("will-quit", handleWillQuit);
    attachWindow(getMainWindow());
  };

  const dispose = ({ abortRenderer = true } = {}) => {
    if (disposed && !started) return;
    if (activeRequest) {
      clearTimer(activeRequest.timeout);
      if (abortRenderer) sendAbort(activeRequest);
      activeRequest = null;
    }
    if (drainedLease) {
      if (abortRenderer) sendAbort(drainedLease);
      drainedLease = null;
    }
    disposed = true;
    started = false;
    ipcMain.removeListener(
      CHANNELS.SETTINGS_STORAGE.QUIT_DRAIN_RESULT,
      handleDrainResult,
    );
    app.removeListener("before-quit", handleBeforeQuit);
    app.removeListener("browser-window-created", handleBrowserWindowCreated);
    app.removeListener("will-quit", handleWillQuit);
  };

  return {
    start,
    attachWindow,
    dispose,
    isDraining: () => activeRequest !== null || drainedLease !== null,
  };
};

module.exports = {
  createSettingsQuitCoordinator,
  DEFAULT_TIMEOUT_MS,
};
