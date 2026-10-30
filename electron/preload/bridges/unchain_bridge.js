const { CHANNELS } = require("../../shared/channels");
const { unwrapSkeletonResourceResponse } = require("../../shared/skeleton_resource_transport");

const invokeSkeletonResource = async (ipcRenderer, command) => {
  try {
    return unwrapSkeletonResourceResponse(await ipcRenderer.invoke(
      CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, command,
    ));
  } catch (error) {
    // An Error would lose these fields a second time at contextBridge. This
    // plain refusal crosses the isolated world; the renderer facade restores
    // its Error identity after strictly validating the record.
    throw {
      code: error?.code || "skeleton_resource_failed",
      path: error?.path || [],
      message: error?.message || "Skeleton resource request failed",
      status: error?.status ?? null,
    };
  }
};

const createMisoBridge = (ipcRenderer, streamClient) => ({
  getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS),
  getComputerUseStatus: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_COMPUTER_USE_STATUS),
  setComputerUseEnabled: (enabled = false) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SET_COMPUTER_USE_ENABLED, {
      enabled: Boolean(enabled),
    }),
  setComputerUseLocalBetaEnabled: (enabled = false) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SET_COMPUTER_USE_LOCAL_BETA_ENABLED, {
      enabled: Boolean(enabled),
    }),
  probeComputerUseModel: (model = "", force = false) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.PROBE_COMPUTER_USE_MODEL, {
      model: typeof model === "string" ? model : "",
      force: force === true,
    }),
  openComputerUsePrivacySettings: (target = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.OPEN_COMPUTER_USE_PRIVACY_SETTINGS, {
      target,
    }),
  getModelCatalog: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MODEL_CATALOG),
  getToolkitCatalog: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_TOOLKIT_CATALOG),
  listToolModalCatalog: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_TOOL_MODAL_CATALOG),
  // Ticket #291 P5: builds a well-typed request (workspaceRoot: "" | string,
  // includeUserDirs: boolean, toolkits: string[]) — the main-process handler
  // (getMisoSkillInventoryPayload) now rejects anything else outright rather
  // than silently defaulting a mistyped field.
  getSkillInventory: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_SKILL_INVENTORY, {
      workspaceRoot:
        typeof payload.workspaceRoot === "string" ? payload.workspaceRoot : "",
      includeUserDirs: payload.includeUserDirs !== false,
      toolkits: Array.isArray(payload.toolkits)
        ? payload.toolkits.filter((id) => typeof id === "string" && id.length > 0)
        : [],
    }),
  getToolkitDetail: (toolkitId, toolName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_TOOLKIT_DETAIL, {
      toolkitId,
      toolName,
    }),
  listMcpToolkits: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_MCP_TOOLKITS),
  installMcpToolkit: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.INSTALL_MCP_TOOLKIT, payload),
  testCustomProvider: (definition = null, apiKey = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.TEST_CUSTOM_PROVIDER, {
      custom_provider: definition,
      api_key: typeof apiKey === "string" ? apiKey : "",
    }),
  deleteMcpToolkit: (toolkitId = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_MCP_TOOLKIT, { toolkitId }),
  reloadMcpToolkits: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.RELOAD_MCP_TOOLKITS, payload),
  checkMcpToolkitHealth: (toolkitId = "", payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CHECK_MCP_TOOLKIT_HEALTH, {
      ...(payload && typeof payload === "object" ? payload : {}),
      toolkitId,
    }),
  configureMcpToolkit: (toolkitId = "", payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CONFIGURE_MCP_TOOLKIT, {
      ...(payload && typeof payload === "object" ? payload : {}),
      toolkitId,
    }),
  startMcpOAuth: (entryId = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.START_MCP_OAUTH, { entryId }),
  cancelMcpOAuth: (state = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CANCEL_MCP_OAUTH, { state }),
  getMcpOAuthStatus: (state = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MCP_OAUTH_STATUS, { state }),
  disconnectMcpOAuth: (toolkitId = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DISCONNECT_MCP_OAUTH, { toolkitId }),
  listMcpOAuthApps: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_MCP_OAUTH_APPS),
  configureMcpOAuthApp: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CONFIGURE_MCP_OAUTH_APP, payload),
  deleteMcpOAuthApp: (toolkitId = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_MCP_OAUTH_APP, { toolkitId }),
  listMcpStoreMetadata: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_MCP_STORE_METADATA),
  reloadMcpStoreMetadata: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.RELOAD_MCP_STORE_METADATA, payload),
  listMcpStoreEntries: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_MCP_STORE_ENTRIES),
  listMcpStoreRegistries: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_MCP_STORE_REGISTRIES),
  importMcpStoreRegistry: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.IMPORT_MCP_STORE_REGISTRY, payload),
  validateMcpStoreRegistry: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.VALIDATE_MCP_STORE_REGISTRY, payload),
  refreshMcpStoreRegistry: (registryId = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.REFRESH_MCP_STORE_REGISTRY, { registryId }),
  deleteMcpStoreRegistry: (registryId = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_MCP_STORE_REGISTRY, { registryId }),
  approveMcpStoreEntry: (entryId = "", payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.APPROVE_MCP_STORE_ENTRY, {
      ...(payload && typeof payload === "object" ? payload : {}),
      entryId,
    }),
  revokeMcpStoreEntryApproval: (entryId = "", payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.REVOKE_MCP_STORE_ENTRY_APPROVAL, {
      ...(payload && typeof payload === "object" ? payload : {}),
      entryId,
    }),
  respondToolConfirmation: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.TOOL_CONFIRMATION, payload),
  getPendingInteraction: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.PENDING_INTERACTION, payload),
  interject: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.INTERJECT, payload),
  setChromeTerminalOpen: (open = false) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SET_CHROME_TERMINAL_OPEN, {
      open: Boolean(open),
    }),
  syncBuildFeatureFlagsSnapshot: (featureFlags = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT, {
      featureFlags,
    }),
  pickWorkspaceRoot: (defaultPath = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.PICK_WORKSPACE_ROOT, { defaultPath }),
  validateWorkspaceRoot: (path = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.VALIDATE_WORKSPACE_ROOT, { path }),
  openRuntimeFolder: (path = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.OPEN_RUNTIME_FOLDER, { path }),
  getRuntimeDirSize: (dirPath = "") =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_RUNTIME_DIR_SIZE, { dirPath }),
  deleteRuntimeEntry: (dirPath, entryName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_RUNTIME_ENTRY, {
      dirPath,
      entryName,
    }),
  clearRuntimeDir: (dirPath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CLEAR_RUNTIME_DIR, { dirPath }),
  getMemorySize: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MEMORY_SIZE),
  getCharacterStorageSize: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_CHARACTER_STORAGE_SIZE),
  deleteCharacterStorageEntry: (entryName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_CHARACTER_STORAGE_ENTRY, {
      entryName,
    }),
  getMemoryProjection: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_MEMORY_PROJECTION, { sessionId }),
  getLongTermMemoryProjection: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_LONG_TERM_MEMORY_PROJECTION),
  replaceSessionMemory: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.REPLACE_SESSION_MEMORY, payload),
  getSessionMemoryExport: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_SESSION_MEMORY_EXPORT, { sessionId }),
  listSeedCharacters: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_SEED_CHARACTERS),
  listCharacters: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_CHARACTERS),
  getCharacter: (characterId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_CHARACTER, { characterId }),
  saveCharacter: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SAVE_CHARACTER, payload),
  deleteCharacter: (characterId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_CHARACTER, { characterId }),
  listRecipes: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_RECIPES),
  getRecipe: (recipeName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_RECIPE, { recipeName }),
  saveRecipe: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SAVE_RECIPE, payload),
  deleteRecipe: (recipeName) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_RECIPE, { recipeName }),
  listSubagentRefs: () =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.LIST_SUBAGENT_REFS),
  listSkeletonResources: (includeArchived = true) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "list",
      payload: { include_archived: includeArchived === true },
    }),
  getSkeletonResource: (resourceId) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "get",
      payload: { resource_id: resourceId },
    }),
  saveSkeletonResource: (payload = {}) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "save",
      payload,
    }),
  diagnoseSkeletonResource: (document) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "diagnose",
      payload: { document },
    }),
  importSkeletonResource: (document) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "import",
      payload: { document },
    }),
  preflightSkeletonResource: (resourceId, legacyKernel = null) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "preflight",
      payload: {
        resource_id: resourceId,
        ...(legacyKernel && typeof legacyKernel === "object" && !Array.isArray(legacyKernel)
          ? { legacy_kernel: legacyKernel }
          : {}),
      },
    }),
  convertSkeletonLegacyPools: (resourceId, expectedEditToken, legacyKernel = null) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "convert_legacy_pools",
      payload: {
        resource_id: resourceId,
        expected_edit_token: expectedEditToken,
        ...(legacyKernel && typeof legacyKernel === "object" && !Array.isArray(legacyKernel)
          ? { legacy_kernel: legacyKernel }
          : {}),
      },
    }),
  publishSkeletonWorkflow: (resourceId, expectedEditToken) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "publish",
      payload: { resource_id: resourceId, expected_edit_token: expectedEditToken },
    }),
  getSkeletonWorkflowVersion: (workflowId, revisionId) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "get_version",
      payload: { workflow_id: workflowId, revision_id: revisionId },
    }),
  renameSkeletonResource: (resourceId, name, expectedEditToken) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "rename",
      payload: { resource_id: resourceId, name, expected_edit_token: expectedEditToken },
    }),
  duplicateSkeletonResource: (resourceId, newId, name) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "duplicate",
      payload: { resource_id: resourceId, new_id: newId, name },
    }),
  archiveSkeletonResource: (resourceId, expectedEditToken) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "archive",
      payload: { resource_id: resourceId, expected_edit_token: expectedEditToken },
    }),
  restoreSkeletonResource: (resourceId, expectedEditToken) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "restore",
      payload: { resource_id: resourceId, expected_edit_token: expectedEditToken },
    }),
  deleteSkeletonResource: (resourceId, expectedEditToken) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "delete",
      payload: { resource_id: resourceId, expected_edit_token: expectedEditToken },
    }),
  migrateSkeletonResource: (payload = {}) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "migrate",
      payload,
    }),
  resolveSkeletonResource: (payload = {}) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "resolve",
      payload,
    }),
  listSkeletonKernelProfiles: () =>
    invokeSkeletonResource(ipcRenderer, {
      action: "kernel_profiles",
      payload: {},
    }),
  listSkeletonPythonProfiles: () =>
    invokeSkeletonResource(ipcRenderer, {
      action: "list_profiles",
      payload: {},
    }),
  saveSkeletonPythonProfile: (payload = {}) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "save_profile",
      payload,
    }),
  probeSkeletonPythonProfile: (profileId) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "probe_profile",
      payload: { profile_id: profileId },
    }),
  deleteSkeletonPythonProfile: (profileId, expectedEditToken) =>
    invokeSkeletonResource(ipcRenderer, {
      action: "delete_profile",
      payload: {
        profile_id: profileId,
        expected_edit_token: expectedEditToken,
      },
    }),
  previewCharacterDecision: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.PREVIEW_CHARACTER_DECISION, payload),
  buildCharacterAgentConfig: (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.BUILD_CHARACTER_AGENT_CONFIG, payload),
  exportCharacter: (characterId, filePath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.EXPORT_CHARACTER, {
      characterId,
      filePath,
    }),
  importCharacter: (filePath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.IMPORT_CHARACTER, { filePath }),
  showSaveDialog: (options = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SHOW_SAVE_DIALOG, options),
  showOpenDialog: (options = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SHOW_OPEN_DIALOG, options),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.WRITE_FILE, { filePath, content }),
  readFile: (filePath) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.READ_FILE, { filePath }),
  scanSkillDir: (directory) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.SCAN_SKILL_DIR, { directory }),
  downloadSkillRepo: (params = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DOWNLOAD_SKILL_REPO, params),
  installSkillPack: (pack) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.INSTALL_SKILL_PACK, { pack }),
  deleteSkillPack: (toolkitId) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.DELETE_SKILL_PACK, { toolkitId }),
  startStream: streamClient.startStream,
  cancelStream: streamClient.cancelStream,
  cancelExecution: streamClient.cancelExecution,
  startStreamV2: streamClient.startStreamV2,
  startStreamV4: streamClient.startStreamV4,
  attachStreamV4: streamClient.attachStreamV4,
});

module.exports = {
  createMisoBridge,
};
