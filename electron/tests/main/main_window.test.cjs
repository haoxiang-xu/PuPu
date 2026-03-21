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
  afterEach(() => {
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
