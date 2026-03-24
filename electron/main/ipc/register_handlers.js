const path = require("path");
const { CHANNELS } = require("../../shared/channels");

const IPC_HANDLE_CHANNELS = Object.freeze([
  CHANNELS.APP.GET_VERSION,
  CHANNELS.UPDATE.GET_STATE,
  CHANNELS.UPDATE.CHECK_AND_DOWNLOAD,
  CHANNELS.UPDATE.INSTALL_NOW,
  CHANNELS.OLLAMA.GET_STATUS,
  CHANNELS.OLLAMA.LIST_INSTALLED_MODELS,
  CHANNELS.OLLAMA.INSTALL,
  CHANNELS.OLLAMA.RESTART,
  CHANNELS.OLLAMA.LIBRARY_SEARCH,
  CHANNELS.MISO.GET_STATUS,
  CHANNELS.MISO.GET_MODEL_CATALOG,
  CHANNELS.MISO.GET_TOOLKIT_CATALOG,
  CHANNELS.MISO.LIST_TOOL_MODAL_CATALOG,
  CHANNELS.MISO.GET_TOOLKIT_DETAIL,
  CHANNELS.MISO.TOOL_CONFIRMATION,
  CHANNELS.MISO.SET_CHROME_TERMINAL_OPEN,
  CHANNELS.MISO.PICK_WORKSPACE_ROOT,
  CHANNELS.MISO.VALIDATE_WORKSPACE_ROOT,
  CHANNELS.MISO.OPEN_RUNTIME_FOLDER,
  CHANNELS.MISO.GET_RUNTIME_DIR_SIZE,
  CHANNELS.MISO.DELETE_RUNTIME_ENTRY,
  CHANNELS.MISO.CLEAR_RUNTIME_DIR,
  CHANNELS.MISO.GET_MEMORY_SIZE,
  CHANNELS.MISO.GET_MEMORY_PROJECTION,
  CHANNELS.MISO.GET_LONG_TERM_MEMORY_PROJECTION,
  CHANNELS.MISO.REPLACE_SESSION_MEMORY,
  CHANNELS.MISO.GET_SESSION_MEMORY_EXPORT,
  CHANNELS.MISO.LIST_CHARACTERS,
  CHANNELS.MISO.GET_CHARACTER,
  CHANNELS.MISO.SAVE_CHARACTER,
  CHANNELS.MISO.DELETE_CHARACTER,
  CHANNELS.MISO.PREVIEW_CHARACTER_DECISION,
  CHANNELS.MISO.BUILD_CHARACTER_AGENT_CONFIG,
  CHANNELS.MISO.EXPORT_CHARACTER,
  CHANNELS.MISO.IMPORT_CHARACTER,
  CHANNELS.MISO.SHOW_SAVE_DIALOG,
  CHANNELS.MISO.SHOW_OPEN_DIALOG,
  CHANNELS.MISO.WRITE_FILE,
  CHANNELS.MISO.READ_FILE,
]);

const IPC_ON_CHANNELS = Object.freeze([
  CHANNELS.THEME.SET_BACKGROUND_COLOR,
  CHANNELS.THEME.SET_MODE,
  CHANNELS.WINDOW_STATE.HANDLE_ACTION,
  CHANNELS.MISO.STREAM_START,
  CHANNELS.MISO.STREAM_START_V2,
  CHANNELS.MISO.STREAM_CANCEL,
]);

const MAIN_EVENT_CHANNELS = Object.freeze([
  CHANNELS.MISO.STREAM_EVENT,
  CHANNELS.MISO.RUNTIME_LOG,
  CHANNELS.OLLAMA.INSTALL_PROGRESS,
  CHANNELS.UPDATE.STATE_CHANGED,
  CHANNELS.WINDOW_STATE.LISTENER_EVENT,
]);

const registerIpcHandlers = ({ ipcMain, app, services }) => {
  const {
    windowService,
    updateService,
    ollamaService,
    misoService,
    runtimeService,
  } = services;

  ipcMain.on(CHANNELS.THEME.SET_BACKGROUND_COLOR, (_event, color) => {
    windowService.handleThemeSetBackgroundColor(color);
  });

  ipcMain.on(CHANNELS.THEME.SET_MODE, (_event, mode) => {
    windowService.handleThemeSetMode(mode);
  });

  ipcMain.on(CHANNELS.WINDOW_STATE.HANDLE_ACTION, (_event, action) => {
    windowService.handleWindowStateEvent(action);
  });

  ipcMain.handle(CHANNELS.APP.GET_VERSION, () => app.getVersion());
  ipcMain.handle(CHANNELS.UPDATE.GET_STATE, () =>
    updateService.getAppUpdateStatePayload(),
  );
  ipcMain.handle(CHANNELS.UPDATE.CHECK_AND_DOWNLOAD, async () =>
    updateService.checkAndDownloadAppUpdate(),
  );
  ipcMain.handle(CHANNELS.UPDATE.INSTALL_NOW, async () =>
    updateService.installDownloadedAppUpdate(),
  );

  ipcMain.handle(CHANNELS.OLLAMA.GET_STATUS, () => ollamaService.getStatus());
  ipcMain.handle(CHANNELS.OLLAMA.LIST_INSTALLED_MODELS, async () =>
    ollamaService.listInstalledModels(),
  );
  ipcMain.handle(CHANNELS.OLLAMA.INSTALL, async (event) =>
    ollamaService.installOllama(event),
  );
  ipcMain.handle(CHANNELS.OLLAMA.RESTART, async () =>
    ollamaService.restartOllama(),
  );
  ipcMain.handle(CHANNELS.OLLAMA.LIBRARY_SEARCH, async (_event, payload = {}) =>
    ollamaService.searchLibrary(payload),
  );

  ipcMain.handle(CHANNELS.MISO.GET_STATUS, () =>
    misoService.getMisoStatusPayload(),
  );
  ipcMain.handle(CHANNELS.MISO.GET_MODEL_CATALOG, async () =>
    misoService.getMisoModelCatalogPayload(),
  );
  ipcMain.handle(CHANNELS.MISO.GET_TOOLKIT_CATALOG, async () =>
    misoService.getMisoToolkitCatalogPayload(),
  );
  ipcMain.handle(CHANNELS.MISO.LIST_TOOL_MODAL_CATALOG, async () =>
    misoService.getMisoToolModalCatalogPayload(),
  );
  ipcMain.handle(
    CHANNELS.MISO.GET_TOOLKIT_DETAIL,
    async (_event, payload = {}) =>
      misoService.getMisoToolkitDetailPayload(
        payload.toolkitId,
        payload.toolName,
      ),
  );
  ipcMain.handle(
    CHANNELS.MISO.TOOL_CONFIRMATION,
    async (_event, payload = {}) =>
      misoService.submitMisoToolConfirmation(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.SET_CHROME_TERMINAL_OPEN,
    (_event, payload = {}) => runtimeService.setChromeTerminalOpen(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.PICK_WORKSPACE_ROOT,
    async (_event, payload = {}) => runtimeService.pickWorkspaceRoot(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.VALIDATE_WORKSPACE_ROOT,
    (_event, payload = {}) => runtimeService.validateWorkspaceRoot(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.OPEN_RUNTIME_FOLDER,
    async (_event, payload = {}) => runtimeService.openRuntimeFolder(payload),
  );
  ipcMain.handle(CHANNELS.MISO.GET_RUNTIME_DIR_SIZE, (_event, payload = {}) =>
    runtimeService.getRuntimeDirSize(payload),
  );
  ipcMain.handle(CHANNELS.MISO.DELETE_RUNTIME_ENTRY, (_event, payload = {}) =>
    runtimeService.deleteRuntimeEntry(payload),
  );
  ipcMain.handle(CHANNELS.MISO.CLEAR_RUNTIME_DIR, (_event, payload = {}) =>
    runtimeService.clearRuntimeDir(payload),
  );
  ipcMain.handle(CHANNELS.MISO.GET_MEMORY_SIZE, () => {
    const baseMemoryDir = path.join(app.getPath("userData"), "memory");
    const vectorDir = path.join(baseMemoryDir, "qdrant");
    const profileDir = path.join(baseMemoryDir, "long_term_profiles");
    const vectorResult = runtimeService.getRuntimeDirSize({
      dirPath: vectorDir,
    });
    const profileResult = runtimeService.getRuntimeDirSize({
      dirPath: profileDir,
    });
    const vectorTotal = Number(vectorResult.total) || 0;
    const profileTotal = Number(profileResult.total) || 0;
    const error =
      vectorResult.error && profileResult.error
        ? [vectorResult.error, profileResult.error].filter(Boolean).join(",")
        : vectorResult.error || profileResult.error || "";

    return {
      total: vectorTotal + profileTotal,
      vectorTotal,
      profileTotal,
      error,
    };
  });

  ipcMain.handle(
    CHANNELS.MISO.GET_MEMORY_PROJECTION,
    async (_event, payload = {}) =>
      misoService.getMisoMemoryProjection(payload.sessionId),
  );

  ipcMain.handle(CHANNELS.MISO.GET_LONG_TERM_MEMORY_PROJECTION, async () =>
    misoService.getMisoLongTermMemoryProjection(),
  );
  ipcMain.handle(
    CHANNELS.MISO.REPLACE_SESSION_MEMORY,
    async (_event, payload = {}) =>
      misoService.replaceMisoSessionMemory(payload),
  );

  ipcMain.handle(
    CHANNELS.MISO.GET_SESSION_MEMORY_EXPORT,
    async (_event, payload = {}) =>
      misoService.getMisoSessionMemoryExport(payload.sessionId),
  );
  ipcMain.handle(CHANNELS.MISO.LIST_CHARACTERS, async () =>
    misoService.listMisoCharacters(),
  );
  ipcMain.handle(CHANNELS.MISO.GET_CHARACTER, async (_event, payload = {}) =>
    misoService.getMisoCharacter(payload.characterId),
  );
  ipcMain.handle(CHANNELS.MISO.SAVE_CHARACTER, async (_event, payload = {}) =>
    misoService.saveMisoCharacter(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.DELETE_CHARACTER,
    async (_event, payload = {}) =>
      misoService.deleteMisoCharacter(payload.characterId),
  );
  ipcMain.handle(
    CHANNELS.MISO.PREVIEW_CHARACTER_DECISION,
    async (_event, payload = {}) =>
      misoService.previewMisoCharacterDecision(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.BUILD_CHARACTER_AGENT_CONFIG,
    async (_event, payload = {}) =>
      misoService.buildMisoCharacterAgentConfig(payload),
  );
  ipcMain.handle(
    CHANNELS.MISO.EXPORT_CHARACTER,
    async (_event, payload = {}) =>
      misoService.exportMisoCharacter(payload.characterId, payload.filePath),
  );
  ipcMain.handle(
    CHANNELS.MISO.IMPORT_CHARACTER,
    async (_event, payload = {}) =>
      misoService.importMisoCharacter(payload.filePath),
  );
  ipcMain.handle(CHANNELS.MISO.SHOW_SAVE_DIALOG, async (_event, payload = {}) =>
    runtimeService.showSaveDialog(payload),
  );
  ipcMain.handle(CHANNELS.MISO.SHOW_OPEN_DIALOG, async (_event, payload = {}) =>
    runtimeService.showOpenDialog(payload),
  );
  ipcMain.handle(CHANNELS.MISO.WRITE_FILE, (_event, payload = {}) =>
    runtimeService.writeFile(payload),
  );
  ipcMain.handle(CHANNELS.MISO.READ_FILE, (_event, payload = {}) =>
    runtimeService.readFile(payload),
  );

  ipcMain.on(CHANNELS.MISO.STREAM_START, (event, payload) => {
    misoService.handleStreamStart(event, payload);
  });

  ipcMain.on(CHANNELS.MISO.STREAM_START_V2, (event, payload) => {
    misoService.handleStreamStartV2(event, payload);
  });

  ipcMain.on(CHANNELS.MISO.STREAM_CANCEL, (event, payload) => {
    misoService.handleStreamCancel(event, payload);
  });
};

module.exports = {
  registerIpcHandlers,
  IPC_HANDLE_CHANNELS,
  IPC_ON_CHANNELS,
  MAIN_EVENT_CHANNELS,
};
