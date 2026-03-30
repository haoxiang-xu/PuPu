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
        "unchainAPI",
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

  test("unchain API keeps required method surface", () => {
    const unchain = exposed.unchainAPI;

    [
      "getStatus",
      "getModelCatalog",
      "getToolkitCatalog",
      "respondToolConfirmation",
      "setChromeTerminalOpen",
      "syncBuildFeatureFlagsSnapshot",
      "pickWorkspaceRoot",
      "validateWorkspaceRoot",
      "openRuntimeFolder",
      "getRuntimeDirSize",
      "deleteRuntimeEntry",
      "clearRuntimeDir",
      "getSessionMemoryExport",
      "listCharacters",
      "getCharacter",
      "saveCharacter",
      "deleteCharacter",
      "previewCharacterDecision",
      "buildCharacterAgentConfig",
      "replaceSessionMemory",
      "startStream",
      "startStreamV2",
      "cancelStream",
    ].forEach((method) => {
      expect(typeof unchain[method]).toBe("function");
    });
  });

  test("bridges call expected channels", () => {
    exposed.appInfoAPI.getVersion();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.APP.GET_VERSION);

    exposed.appUpdateAPI.getState();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.UPDATE.GET_STATE);

    exposed.ollamaAPI.getStatus();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.OLLAMA.GET_STATUS);

    exposed.ollamaAPI.listInstalledModels();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.OLLAMA.LIST_INSTALLED_MODELS,
    );

    exposed.ollamaLibraryAPI.search("q", "c");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(CHANNELS.OLLAMA.LIBRARY_SEARCH, {
      query: "q",
      category: "c",
    });

    exposed.unchainAPI.setChromeTerminalOpen(true);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SET_CHROME_TERMINAL_OPEN,
      { open: true },
    );

    exposed.unchainAPI.syncBuildFeatureFlagsSnapshot({
      enable_user_access_to_agent_modal: true,
    });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT,
      {
        featureFlags: {
          enable_user_access_to_agent_modal: true,
        },
      },
    );

    exposed.unchainAPI.replaceSessionMemory({ sessionId: "chat-1", messages: [] });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.REPLACE_SESSION_MEMORY,
      { sessionId: "chat-1", messages: [] },
    );

    exposed.unchainAPI.listCharacters();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.LIST_CHARACTERS,
    );

    exposed.unchainAPI.buildCharacterAgentConfig({ characterId: "mina" });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.BUILD_CHARACTER_AGENT_CONFIG,
      { characterId: "mina" },
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

  test("forwards unchain runtime logs to chrome console", () => {
    const runtimeLogCall = ipcRenderer.on.mock.calls.find(
      (call) => call[0] === CHANNELS.UNCHAIN.RUNTIME_LOG,
    );

    expect(runtimeLogCall).toBeDefined();

    const runtimeLogListener = runtimeLogCall[1];
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      runtimeLogListener({}, { level: "stdout", text: "hello from unchain" });
      runtimeLogListener({}, { level: "stderr", text: "oops from unchain" });
      runtimeLogListener(
        {},
        {
          level: "stderr",
          text: '127.0.0.1 - - [14/Mar/2026 14:09:23] "GET /health HTTP/1.1" 200 -',
        },
      );
      runtimeLogListener({}, { level: "stdout", text: "   " });

      expect(logSpy).toHaveBeenCalledWith("[unchain] hello from unchain");
      expect(errorSpy).toHaveBeenCalledWith("["unchain:error] oops from unchain");
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
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
