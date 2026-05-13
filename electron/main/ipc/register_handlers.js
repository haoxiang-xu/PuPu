const path = require("path");
const { CHANNELS } = require("../../shared/channels");
const {
  registerChatStorageHandlers,
  CHAT_STORAGE_SYNC_CHANNELS,
  CHAT_STORAGE_ON_CHANNELS,
} = require("../services/chat_storage/register_handlers");

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
  CHANNELS.UNCHAIN.GET_STATUS,
  CHANNELS.UNCHAIN.GET_MODEL_CATALOG,
  CHANNELS.UNCHAIN.GET_TOOLKIT_CATALOG,
  CHANNELS.UNCHAIN.LIST_TOOL_MODAL_CATALOG,
  CHANNELS.UNCHAIN.GET_TOOLKIT_DETAIL,
  CHANNELS.UNCHAIN.TOOL_CONFIRMATION,
  CHANNELS.UNCHAIN.SET_CHROME_TERMINAL_OPEN,
  CHANNELS.UNCHAIN.SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT,
  CHANNELS.UNCHAIN.PICK_WORKSPACE_ROOT,
  CHANNELS.UNCHAIN.VALIDATE_WORKSPACE_ROOT,
  CHANNELS.UNCHAIN.OPEN_RUNTIME_FOLDER,
  CHANNELS.UNCHAIN.GET_RUNTIME_DIR_SIZE,
  CHANNELS.UNCHAIN.DELETE_RUNTIME_ENTRY,
  CHANNELS.UNCHAIN.CLEAR_RUNTIME_DIR,
  CHANNELS.UNCHAIN.GET_MEMORY_SIZE,
  CHANNELS.UNCHAIN.GET_CHARACTER_STORAGE_SIZE,
  CHANNELS.UNCHAIN.DELETE_CHARACTER_STORAGE_ENTRY,
  CHANNELS.UNCHAIN.GET_MEMORY_PROJECTION,
  CHANNELS.UNCHAIN.GET_LONG_TERM_MEMORY_PROJECTION,
  CHANNELS.UNCHAIN.REPLACE_SESSION_MEMORY,
  CHANNELS.UNCHAIN.GET_SESSION_MEMORY_EXPORT,
  CHANNELS.UNCHAIN.LIST_SEED_CHARACTERS,
  CHANNELS.UNCHAIN.LIST_CHARACTERS,
  CHANNELS.UNCHAIN.GET_CHARACTER,
  CHANNELS.UNCHAIN.SAVE_CHARACTER,
  CHANNELS.UNCHAIN.DELETE_CHARACTER,
  CHANNELS.UNCHAIN.LIST_RECIPES,
  CHANNELS.UNCHAIN.GET_RECIPE,
  CHANNELS.UNCHAIN.SAVE_RECIPE,
  CHANNELS.UNCHAIN.DELETE_RECIPE,
  CHANNELS.UNCHAIN.LIST_SUBAGENT_REFS,
  CHANNELS.UNCHAIN.PREVIEW_CHARACTER_DECISION,
  CHANNELS.UNCHAIN.BUILD_CHARACTER_AGENT_CONFIG,
  CHANNELS.UNCHAIN.EXPORT_CHARACTER,
  CHANNELS.UNCHAIN.IMPORT_CHARACTER,
  CHANNELS.UNCHAIN.SHOW_SAVE_DIALOG,
  CHANNELS.UNCHAIN.SHOW_OPEN_DIALOG,
  CHANNELS.UNCHAIN.WRITE_FILE,
  CHANNELS.UNCHAIN.READ_FILE,
  CHANNELS.SCREENSHOT.CAPTURE,
  CHANNELS.SCREENSHOT.CHECK_AVAILABILITY,
]);

const IPC_ON_CHANNELS = Object.freeze([
  CHANNELS.THEME.SET_BACKGROUND_COLOR,
  CHANNELS.THEME.SET_MODE,
  CHANNELS.WINDOW_STATE.HANDLE_ACTION,
  CHANNELS.UNCHAIN.STREAM_START,
  CHANNELS.UNCHAIN.STREAM_START_V2,
  CHANNELS.UNCHAIN.STREAM_START_V3,
  CHANNELS.UNCHAIN.STREAM_CANCEL,
  ...CHAT_STORAGE_ON_CHANNELS,
]);

const IPC_ON_SYNC_CHANNELS = Object.freeze([...CHAT_STORAGE_SYNC_CHANNELS]);

const MAIN_EVENT_CHANNELS = Object.freeze([
  CHANNELS.UNCHAIN.STREAM_EVENT,
  CHANNELS.UNCHAIN.RUNTIME_LOG,
  CHANNELS.OLLAMA.INSTALL_PROGRESS,
  CHANNELS.UPDATE.STATE_CHANGED,
  CHANNELS.WINDOW_STATE.LISTENER_EVENT,
]);

const registerIpcHandlers = ({ ipcMain, app, services }) => {
  const {
    windowService,
    updateService,
    ollamaService,
    unchainService,
    runtimeService,
    screenshotService,
    chatStorageService,
  } = services;

  registerChatStorageHandlers({ ipcMain, chatStorageService });

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

  ipcMain.handle(CHANNELS.UNCHAIN.GET_STATUS, () =>
    unchainService.getMisoStatusPayload(),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.GET_MODEL_CATALOG, async () =>
    unchainService.getMisoModelCatalogPayload(),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.GET_TOOLKIT_CATALOG, async () =>
    unchainService.getMisoToolkitCatalogPayload(),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.LIST_TOOL_MODAL_CATALOG, async () =>
    unchainService.getMisoToolModalCatalogPayload(),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.GET_TOOLKIT_DETAIL,
    async (_event, payload = {}) =>
      unchainService.getMisoToolkitDetailPayload(
        payload.toolkitId,
        payload.toolName,
      ),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.TOOL_CONFIRMATION,
    async (_event, payload = {}) =>
      unchainService.submitMisoToolConfirmation(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.SET_CHROME_TERMINAL_OPEN,
    (_event, payload = {}) => runtimeService.setChromeTerminalOpen(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT,
    (_event, payload = {}) =>
      runtimeService.syncBuildFeatureFlagsSnapshot(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.PICK_WORKSPACE_ROOT,
    async (_event, payload = {}) => runtimeService.pickWorkspaceRoot(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.VALIDATE_WORKSPACE_ROOT,
    (_event, payload = {}) => runtimeService.validateWorkspaceRoot(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.OPEN_RUNTIME_FOLDER,
    async (_event, payload = {}) => runtimeService.openRuntimeFolder(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.GET_RUNTIME_DIR_SIZE, (_event, payload = {}) =>
    runtimeService.getRuntimeDirSize(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.DELETE_RUNTIME_ENTRY, (_event, payload = {}) =>
    runtimeService.deleteRuntimeEntry(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.CLEAR_RUNTIME_DIR, (_event, payload = {}) =>
    runtimeService.clearRuntimeDir(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.GET_MEMORY_SIZE, () => {
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
  ipcMain.handle(CHANNELS.UNCHAIN.GET_CHARACTER_STORAGE_SIZE, () =>
    runtimeService.getCharacterStorageSize(),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.DELETE_CHARACTER_STORAGE_ENTRY,
    (_event, payload = {}) =>
      runtimeService.deleteCharacterStorageEntry(payload),
  );

  ipcMain.handle(
    CHANNELS.UNCHAIN.GET_MEMORY_PROJECTION,
    async (_event, payload = {}) =>
      unchainService.getMisoMemoryProjection(payload.sessionId),
  );

  ipcMain.handle(CHANNELS.UNCHAIN.GET_LONG_TERM_MEMORY_PROJECTION, async () =>
    unchainService.getMisoLongTermMemoryProjection(),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.REPLACE_SESSION_MEMORY,
    async (_event, payload = {}) =>
      unchainService.replaceMisoSessionMemory(payload),
  );

  ipcMain.handle(
    CHANNELS.UNCHAIN.GET_SESSION_MEMORY_EXPORT,
    async (_event, payload = {}) =>
      unchainService.getMisoSessionMemoryExport(payload.sessionId),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.LIST_CHAT_PLANS,
    async (_event, payload = {}) =>
      unchainService.listMisoChatPlans(payload.threadId),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.GET_CHAT_PLAN,
    async (_event, payload = {}) =>
      unchainService.getMisoChatPlan(payload.threadId, payload.planId),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.LIST_SEED_CHARACTERS, async () =>
    unchainService.listMisoSeedCharacters(),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.LIST_CHARACTERS, async () =>
    unchainService.listMisoCharacters(),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.GET_CHARACTER, async (_event, payload = {}) =>
    unchainService.getMisoCharacter(payload.characterId),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.SAVE_CHARACTER, async (_event, payload = {}) =>
    unchainService.saveMisoCharacter(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.DELETE_CHARACTER,
    async (_event, payload = {}) =>
      unchainService.deleteMisoCharacter(payload.characterId),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.LIST_RECIPES, async () =>
    unchainService.listMisoRecipes(),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.GET_RECIPE,
    async (_event, payload = {}) =>
      unchainService.getMisoRecipe(payload.recipeName),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.SAVE_RECIPE, async (_event, payload = {}) =>
    unchainService.saveMisoRecipe(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.DELETE_RECIPE,
    async (_event, payload = {}) =>
      unchainService.deleteMisoRecipe(payload.recipeName),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.LIST_SUBAGENT_REFS, async () =>
    unchainService.listMisoSubagentRefs(),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.PREVIEW_CHARACTER_DECISION,
    async (_event, payload = {}) =>
      unchainService.previewMisoCharacterDecision(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.BUILD_CHARACTER_AGENT_CONFIG,
    async (_event, payload = {}) =>
      unchainService.buildMisoCharacterAgentConfig(payload),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.EXPORT_CHARACTER,
    async (_event, payload = {}) =>
      unchainService.exportMisoCharacter(payload.characterId, payload.filePath),
  );
  ipcMain.handle(
    CHANNELS.UNCHAIN.IMPORT_CHARACTER,
    async (_event, payload = {}) =>
      unchainService.importMisoCharacter(payload.filePath),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.SHOW_SAVE_DIALOG, async (_event, payload = {}) =>
    runtimeService.showSaveDialog(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.SHOW_OPEN_DIALOG, async (_event, payload = {}) =>
    runtimeService.showOpenDialog(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.WRITE_FILE, (_event, payload = {}) =>
    runtimeService.writeFile(payload),
  );
  ipcMain.handle(CHANNELS.UNCHAIN.READ_FILE, (_event, payload = {}) =>
    runtimeService.readFile(payload),
  );

  ipcMain.handle(CHANNELS.SCREENSHOT.CAPTURE, () =>
    screenshotService.capture(),
  );
  ipcMain.handle(CHANNELS.SCREENSHOT.CHECK_AVAILABILITY, () =>
    screenshotService.checkAvailability(),
  );

  ipcMain.on(CHANNELS.UNCHAIN.STREAM_START, (event, payload) => {
    unchainService.handleStreamStart(event, payload);
  });

  ipcMain.on(CHANNELS.UNCHAIN.STREAM_START_V2, (event, payload) => {
    unchainService.handleStreamStartV2(event, payload);
  });

  ipcMain.on(CHANNELS.UNCHAIN.STREAM_START_V3, (event, payload) => {
    unchainService.handleStreamStartV3(event, payload);
  });

  ipcMain.on(CHANNELS.UNCHAIN.STREAM_CANCEL, (event, payload) => {
    unchainService.handleStreamCancel(event, payload);
  });
};

module.exports = {
  registerIpcHandlers,
  IPC_HANDLE_CHANNELS,
  IPC_ON_CHANNELS,
  IPC_ON_SYNC_CHANNELS,
  MAIN_EVENT_CHANNELS,
};
