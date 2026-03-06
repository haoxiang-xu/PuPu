const path = require("path");
const { CHANNELS } = require("../../shared/channels");

describe("preload API contract", () => {
  let exposed;
  let ipcRenderer;

  beforeEach(() => {
    jest.resetModules();
    exposed = {};

    ipcRenderer = {
      invoke: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    jest.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name, value) => {
          exposed[name] = value;
        },
      },
      ipcRenderer,
    }));

    require(path.resolve(__dirname, "../../preload/index.js"));
  });

  test("exposes expected window APIs", () => {
    expect(Object.keys(exposed).sort()).toEqual(
      [
        "appInfoAPI",
        "appUpdateAPI",
        "misoAPI",
        "ollamaAPI",
        "ollamaLibraryAPI",
        "osInfo",
        "runtime",
        "themeAPI",
        "windowStateAPI",
      ].sort(),
    );

    expect(exposed.runtime).toEqual({
      isElectron: true,
      platform: process.platform,
    });
    expect(exposed.osInfo).toEqual({
      platform: process.platform,
    });
  });

  test("miso API keeps required method surface", () => {
    const miso = exposed.misoAPI;

    [
      "getStatus",
      "getModelCatalog",
      "getToolkitCatalog",
      "respondToolConfirmation",
      "setChromeTerminalOpen",
      "pickWorkspaceRoot",
      "validateWorkspaceRoot",
      "openRuntimeFolder",
      "getRuntimeDirSize",
      "deleteRuntimeEntry",
      "clearRuntimeDir",
      "startStream",
      "startStreamV2",
      "cancelStream",
    ].forEach((method) => {
      expect(typeof miso[method]).toBe("function");
    });
  });

  test("bridges call expected channels", () => {
    exposed.appInfoAPI.getVersion();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.APP.GET_VERSION);

    exposed.appUpdateAPI.getState();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.UPDATE.GET_STATE);

    exposed.ollamaAPI.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.OLLAMA.GET_STATUS);

    exposed.ollamaLibraryAPI.search("q", "c");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.OLLAMA.LIBRARY_SEARCH, {
      query: "q",
      category: "c",
    });

    exposed.misoAPI.setChromeTerminalOpen(true);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.MISO.SET_CHROME_TERMINAL_OPEN,
      { open: true },
    );

    exposed.themeAPI.setThemeMode("dark_mode");
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.THEME.SET_MODE,
      "dark_mode",
    );

    exposed.windowStateAPI.windowStateEventHandler("maximize");
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.WINDOW_STATE.HANDLE_ACTION,
      "maximize",
    );
  });

  test("event listener bridges return unsubscribe", () => {
    const unsubUpdate = exposed.appUpdateAPI.onStateChange(() => {});
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      CHANNELS.UPDATE.STATE_CHANGED,
      expect.any(Function),
    );
    expect(typeof unsubUpdate).toBe("function");
    unsubUpdate();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      CHANNELS.UPDATE.STATE_CHANGED,
      expect.any(Function),
    );

    const unsubWindow = exposed.windowStateAPI.windowStateEventListener(() => {});
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      CHANNELS.WINDOW_STATE.LISTENER_EVENT,
      expect.any(Function),
    );
    expect(typeof unsubWindow).toBe("function");
    unsubWindow();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      CHANNELS.WINDOW_STATE.LISTENER_EVENT,
      expect.any(Function),
    );
  });
});
