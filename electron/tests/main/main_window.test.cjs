const path = require("path");
const { createMainWindowService } = require("../../main/window/main_window");

const originalElectronStartUrl = process.env.ELECTRON_START_URL;

const createMockWindowInstance = () => ({
  loadFile: jest.fn(),
  loadURL: jest.fn(),
  once: jest.fn(),
  on: jest.fn(),
  isDestroyed: jest.fn(() => false),
  isMinimized: jest.fn(() => true),
  restore: jest.fn(),
  show: jest.fn(),
  focus: jest.fn(),
  isMaximized: jest.fn(() => false),
  isFullScreen: jest.fn(() => false),
  close: jest.fn(),
  minimize: jest.fn(),
  maximize: jest.fn(),
  unmaximize: jest.fn(),
  setFullScreen: jest.fn(),
  setBackgroundColor: jest.fn(),
  webContents: {
    send: jest.fn(),
    setWindowOpenHandler: jest.fn(),
    on: jest.fn(),
  },
});

describe("main window service", () => {
  beforeEach(() => {
    /* Dev path now calls loadDevUrlWhenReady() eagerly at window creation
     * (not gated behind a "ready-to-show" event, unlike the mocked `once`
     * used elsewhere in this file). Default to an immediate resolved dev
     * server response so tests that don't care about dev polling never
     * leave a dangling real fetch call or retry timer behind. */
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    delete global.fetch;
    if (originalElectronStartUrl == null) {
      delete process.env.ELECTRON_START_URL;
    } else {
      process.env.ELECTRON_START_URL = originalElectronStartUrl;
    }
  });

  test("createMainWindow is idempotent and focuses existing window", () => {
    const windowInstance = createMockWindowInstance();
    const BrowserWindow = jest.fn(() => windowInstance);

    const service = createMainWindowService({
      app: {
        getAppPath: () => "/app",
        isPackaged: true,
      },
      BrowserWindow,
      shell: { openExternal: jest.fn() },
      fs: { existsSync: jest.fn(() => false) },
      path,
      nativeTheme: {},
    });

    const firstWindow = service.createMainWindow();
    const secondWindow = service.createMainWindow();

    expect(firstWindow).toBe(windowInstance);
    expect(secondWindow).toBe(windowInstance);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(windowInstance.restore).toHaveBeenCalledTimes(1);
    expect(windowInstance.show).toHaveBeenCalledTimes(1);
    expect(windowInstance.focus).toHaveBeenCalledTimes(1);
  });

  test("packaged: loads build/index.html directly with no loading.html swap", () => {
    const windowInstance = createMockWindowInstance();
    const BrowserWindow = jest.fn(() => windowInstance);

    const service = createMainWindowService({
      app: {
        getAppPath: () => "/app",
        isPackaged: true,
      },
      BrowserWindow,
      shell: { openExternal: jest.fn() },
      fs: { existsSync: jest.fn(() => false) },
      path,
      nativeTheme: {},
    });

    service.createMainWindow();

    expect(windowInstance.loadFile).toHaveBeenCalledTimes(1);
    expect(windowInstance.loadFile).toHaveBeenCalledWith(
      path.join("/app", "build", "index.html"),
      { hash: "/" },
    );
    expect(
      windowInstance.loadFile.mock.calls.some(([filePath]) =>
        String(filePath).includes("loading.html"),
      ),
    ).toBe(false);

    // Window stays hidden until ready-to-show fires.
    expect(windowInstance.show).not.toHaveBeenCalled();

    const readyToShowHandler = windowInstance.once.mock.calls.find(
      ([eventName]) => eventName === "ready-to-show",
    )?.[1];
    expect(typeof readyToShowHandler).toBe("function");

    readyToShowHandler();

    expect(windowInstance.show).toHaveBeenCalledTimes(1);
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isMaximized: false }),
    );
    // Only the single direct loadFile call — no second navigation on show.
    expect(windowInstance.loadFile).toHaveBeenCalledTimes(1);
  });

  test("dev: shows the themed window immediately without waiting on ready-to-show, then polls the dev server", async () => {
    process.env.ELECTRON_START_URL = "http://localhost:2907/#";

    const windowInstance = createMockWindowInstance();
    const BrowserWindow = jest.fn(() => windowInstance);

    const service = createMainWindowService({
      app: {
        getAppPath: () => "/app",
        isPackaged: false,
      },
      BrowserWindow,
      shell: { openExternal: jest.fn() },
      fs: { existsSync: jest.fn(() => false) },
      path,
      nativeTheme: {},
    });

    service.createMainWindow();

    // Dev path shows right away; nothing was loaded yet, so no ready-to-show wait.
    expect(windowInstance.show).toHaveBeenCalledTimes(1);
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isMaximized: false }),
    );
    expect(windowInstance.loadFile).not.toHaveBeenCalled();
    expect(
      windowInstance.once.mock.calls.some(
        ([eventName]) => eventName === "ready-to-show",
      ),
    ).toBe(false);

    // Dev-server polling still happens via loadURL, same as before.
    // Flush enough microtask ticks to drain the async fetch → loadURL chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:2907/#",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(windowInstance.loadURL).toHaveBeenCalledWith(
      "http://localhost:2907/#",
    );
  });

  test("allows navigation to the configured development origin", () => {
    process.env.ELECTRON_START_URL = "http://localhost:3912/#";

    const windowInstance = createMockWindowInstance();
    const BrowserWindow = jest.fn(() => windowInstance);
    const shell = { openExternal: jest.fn() };

    const service = createMainWindowService({
      app: {
        getAppPath: () => "/app",
        isPackaged: false,
      },
      BrowserWindow,
      shell,
      fs: { existsSync: jest.fn(() => false) },
      path,
      nativeTheme: {},
    });

    service.createMainWindow();

    const willNavigateHandler = windowInstance.webContents.on.mock.calls.find(
      ([eventName]) => eventName === "will-navigate",
    )?.[1];

    expect(typeof willNavigateHandler).toBe("function");

    const allowedEvent = { preventDefault: jest.fn() };
    willNavigateHandler(allowedEvent, "http://localhost:3912/static/js/bundle.js");
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();

    const blockedEvent = { preventDefault: jest.fn() };
    willNavigateHandler(blockedEvent, "http://localhost:2907/");
    expect(blockedEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).toHaveBeenCalledWith("http://localhost:2907/");
  });
});
