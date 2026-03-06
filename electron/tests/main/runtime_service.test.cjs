const path = require("path");
const { createRuntimeService } = require("../../main/services/runtime/service");

const createService = ({ app, getMainWindow } = {}) =>
  createRuntimeService({
    app: app || {
      isPackaged: false,
      getPath: jest.fn(() => "/tmp"),
    },
    dialog: {
      showOpenDialog: jest.fn(),
    },
    shell: {
      openPath: jest.fn(),
    },
    fs: {
      existsSync: jest.fn(() => false),
      statSync: jest.fn(),
      readdirSync: jest.fn(() => []),
      rmSync: jest.fn(),
    },
    path,
    getMainWindow: getMainWindow || jest.fn(() => null),
  });

describe("runtime service chrome terminal control", () => {
  test("allows opening and closing devtools when app is not packaged", () => {
    const webContents = {
      isDestroyed: jest.fn(() => false),
      openDevTools: jest.fn(),
      closeDevTools: jest.fn(),
      isDevToolsOpened: jest
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
    };
    const getMainWindow = jest.fn(() => ({
      isDestroyed: jest.fn(() => false),
      webContents,
    }));

    const service = createService({ getMainWindow });

    const openResult = service.setChromeTerminalOpen({ open: true });
    const closeResult = service.setChromeTerminalOpen({ open: false });

    expect(openResult).toEqual({ ok: true, open: true });
    expect(closeResult).toEqual({ ok: true, open: false });
    expect(webContents.openDevTools).toHaveBeenCalledWith({ mode: "detach" });
    expect(webContents.closeDevTools).toHaveBeenCalledTimes(1);
  });

  test("rejects chrome terminal control in packaged runtime", () => {
    const service = createService({
      app: {
        isPackaged: true,
        getPath: jest.fn(() => "/tmp"),
      },
    });

    expect(service.setChromeTerminalOpen({ open: true })).toEqual({
      ok: false,
      open: false,
      error: "dev_only",
    });
  });

  test("returns explicit error when main window is unavailable", () => {
    const service = createService({
      getMainWindow: jest.fn(() => null),
    });

    expect(service.setChromeTerminalOpen({ open: true })).toEqual({
      ok: false,
      open: true,
      error: "main_window_unavailable",
    });
  });
});
