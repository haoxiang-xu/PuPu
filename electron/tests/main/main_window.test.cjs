const path = require("path");
const { createMainWindowService } = require("../../main/window/main_window");

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
});
