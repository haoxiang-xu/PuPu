import {
  FrontendApiError,
  assertBridgeMethod,
  hasBridgeMethod,
  toFrontendApiError,
  withTimeout,
} from "../api.shared";

const toTrimmedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const invokeUnchain = async (
  methodName,
  args,
  {
    timeoutMs = 5000,
    timeoutCode = "unchain_bridge_timeout",
    timeoutMessage = "Unchain bridge request timed out",
    failureCode = "unchain_bridge_failed",
    failureMessage = "Unchain bridge request failed",
  } = {},
) => {
  try {
    const method = assertBridgeMethod("unchainAPI", methodName);
    return await withTimeout(
      () => method(...args),
      timeoutMs,
      timeoutCode,
      timeoutMessage,
    );
  } catch (error) {
    throw toFrontendApiError(error, failureCode, failureMessage);
  }
};

export const runtimeBridge = {
  isChromeTerminalControlAvailable: () =>
    hasBridgeMethod("unchainAPI", "setChromeTerminalOpen"),
  isBuildFeatureFlagsSyncAvailable: () =>
    hasBridgeMethod("unchainAPI", "syncBuildFeatureFlagsSnapshot"),
  isWorkspaceValidationAvailable: () =>
    hasBridgeMethod("unchainAPI", "validateWorkspaceRoot"),
  isWorkspacePickerAvailable: () =>
    hasBridgeMethod("unchainAPI", "pickWorkspaceRoot"),
  isOpenRuntimeFolderAvailable: () =>
    hasBridgeMethod("unchainAPI", "openRuntimeFolder"),
  isRuntimeStorageAvailable: () =>
    hasBridgeMethod("unchainAPI", "getRuntimeDirSize"),
  isMemorySizeAvailable: () => hasBridgeMethod("unchainAPI", "getMemorySize"),
  isCharacterStorageAvailable: () =>
    hasBridgeMethod("unchainAPI", "getCharacterStorageSize") &&
    hasBridgeMethod("unchainAPI", "deleteCharacterStorageEntry"),
  isCharacterApiAvailable: () =>
    hasBridgeMethod("unchainAPI", "listCharacters") &&
    hasBridgeMethod("unchainAPI", "getCharacter") &&
    hasBridgeMethod("unchainAPI", "saveCharacter") &&
    hasBridgeMethod("unchainAPI", "deleteCharacter"),

  setChromeTerminalOpen: async (open = false) => {
    if (!runtimeBridge.isChromeTerminalControlAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.setChromeTerminalOpen is unavailable",
      );
    }

    const nextOpen = Boolean(open);
    const response = await invokeUnchain("setChromeTerminalOpen", [nextOpen], {
      timeoutMs: 6000,
      timeoutCode: "unchain_chrome_terminal_timeout",
      timeoutMessage: "Chrome terminal toggle request timed out",
      failureCode: "unchain_chrome_terminal_failed",
      failureMessage: "Failed to toggle Chrome terminal",
    });

    return {
      ok: Boolean(response?.ok),
      open: typeof response?.open === "boolean" ? response.open : nextOpen,
      error: typeof response?.error === "string" ? response.error : "",
    };
  },

  syncBuildFeatureFlagsSnapshot: async (featureFlags = {}) => {
    if (!runtimeBridge.isBuildFeatureFlagsSyncAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.syncBuildFeatureFlagsSnapshot is unavailable",
      );
    }

    const response = await invokeUnchain(
      "syncBuildFeatureFlagsSnapshot",
      [featureFlags],
      {
        timeoutMs: 6000,
        timeoutCode: "unchain_build_feature_flags_snapshot_timeout",
        timeoutMessage: "Build feature flag snapshot sync timed out",
        failureCode: "unchain_build_feature_flags_snapshot_failed",
        failureMessage: "Failed to sync build feature flag snapshot",
      },
    );

    return {
      ok: Boolean(response?.ok),
      path: toTrimmedString(response?.path),
      error: typeof response?.error === "string" ? response.error : "",
    };
  },

  validateWorkspaceRoot: async (path = "") => {
    if (!runtimeBridge.isWorkspaceValidationAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.validateWorkspaceRoot is unavailable",
      );
    }

    const response = await invokeUnchain("validateWorkspaceRoot", [path], {
      timeoutMs: 6000,
      timeoutCode: "unchain_validate_workspace_timeout",
      timeoutMessage: "Workspace path validation timed out",
      failureCode: "unchain_validate_workspace_failed",
      failureMessage: "Failed to validate workspace path",
    });

    const resolvedPath = toTrimmedString(response?.resolvedPath);
    const reason =
      typeof response?.reason === "string"
        ? response.reason
        : typeof response?.message === "string"
          ? response.message
          : "";

    return {
      valid: Boolean(response?.valid),
      resolvedPath,
      reason,
      message: reason,
    };
  },

  pickWorkspaceRoot: async (defaultPath = "") => {
    if (!runtimeBridge.isWorkspacePickerAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.pickWorkspaceRoot is unavailable",
      );
    }

    const response = await invokeUnchain("pickWorkspaceRoot", [defaultPath], {
      timeoutMs: 20000,
      timeoutCode: "unchain_pick_workspace_timeout",
      timeoutMessage: "Workspace picker request timed out",
      failureCode: "unchain_pick_workspace_failed",
      failureMessage: "Failed to open workspace picker",
    });

    return {
      canceled: Boolean(response?.canceled),
      path: toTrimmedString(response?.path),
    };
  },

  openRuntimeFolder: async (path = "") => {
    if (!runtimeBridge.isOpenRuntimeFolderAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.openRuntimeFolder is unavailable",
      );
    }

    const response = await invokeUnchain("openRuntimeFolder", [path], {
      timeoutMs: 10000,
      timeoutCode: "unchain_open_runtime_folder_timeout",
      timeoutMessage: "Open runtime folder request timed out",
      failureCode: "unchain_open_runtime_folder_failed",
      failureMessage: "Failed to open runtime folder",
    });

    return {
      ok: Boolean(response?.ok),
      error: typeof response?.error === "string" ? response.error : "",
      path: toTrimmedString(response?.path),
    };
  },

  getRuntimeDirSize: async (dirPath = "") => {
    if (!runtimeBridge.isRuntimeStorageAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.getRuntimeDirSize is unavailable",
      );
    }

    const response = await invokeUnchain("getRuntimeDirSize", [dirPath], {
      timeoutMs: 15000,
      timeoutCode: "unchain_runtime_size_timeout",
      timeoutMessage: "Runtime size request timed out",
      failureCode: "unchain_runtime_size_failed",
      failureMessage: "Failed to get runtime directory size",
    });

    if (!response || typeof response !== "object") {
      return { entries: [], total: 0, error: "invalid_response" };
    }

    return {
      ...response,
      entries: Array.isArray(response.entries) ? response.entries : [],
      total: Number.isFinite(Number(response.total))
        ? Number(response.total)
        : 0,
      error: typeof response.error === "string" ? response.error : "",
    };
  },

  getMemorySize: async () => {
    if (!runtimeBridge.isMemorySizeAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.getMemorySize is unavailable",
      );
    }

    const response = await invokeUnchain("getMemorySize", [], {
      timeoutMs: 10000,
      timeoutCode: "unchain_memory_size_timeout",
      timeoutMessage: "Memory size request timed out",
      failureCode: "unchain_memory_size_failed",
      failureMessage: "Failed to get memory size",
    });

    return {
      total: Number.isFinite(Number(response?.total))
        ? Number(response.total)
        : 0,
      vectorTotal: Number.isFinite(Number(response?.vectorTotal))
        ? Number(response.vectorTotal)
        : 0,
      profileTotal: Number.isFinite(Number(response?.profileTotal))
        ? Number(response.profileTotal)
        : 0,
      error: typeof response?.error === "string" ? response.error : "",
    };
  },

  getCharacterStorageSize: async () => {
    if (!runtimeBridge.isCharacterStorageAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.getCharacterStorageSize is unavailable",
      );
    }

    const response = await invokeUnchain("getCharacterStorageSize", [], {
      timeoutMs: 10000,
      timeoutCode: "unchain_character_storage_timeout",
      timeoutMessage: "Character storage request timed out",
      failureCode: "unchain_character_storage_failed",
      failureMessage: "Failed to get character storage size",
    });

    return {
      entries: Array.isArray(response?.entries) ? response.entries : [],
      total: Number.isFinite(Number(response?.total))
        ? Number(response.total)
        : 0,
      registryTotal: Number.isFinite(Number(response?.registryTotal))
        ? Number(response.registryTotal)
        : 0,
      avatarTotal: Number.isFinite(Number(response?.avatarTotal))
        ? Number(response.avatarTotal)
        : 0,
      sessionTotal: Number.isFinite(Number(response?.sessionTotal))
        ? Number(response.sessionTotal)
        : 0,
      profileTotal: Number.isFinite(Number(response?.profileTotal))
        ? Number(response.profileTotal)
        : 0,
      error: typeof response?.error === "string" ? response.error : "",
    };
  },

  deleteCharacterStorageEntry: async (entryName) => {
    if (!runtimeBridge.isCharacterStorageAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.deleteCharacterStorageEntry is unavailable",
      );
    }

    return invokeUnchain("deleteCharacterStorageEntry", [entryName], {
      timeoutMs: 10000,
      timeoutCode: "unchain_character_storage_delete_timeout",
      timeoutMessage: "Character storage delete request timed out",
      failureCode: "unchain_character_storage_delete_failed",
      failureMessage: "Failed to delete character storage entry",
    });
  },

  listSeedCharacters: async () => {
    const response = await invokeUnchain("listSeedCharacters", [], {
      timeoutMs: 15000,
      timeoutCode: "unchain_seed_character_list_timeout",
      timeoutMessage: "Seed character list request timed out",
      failureCode: "unchain_seed_character_list_failed",
      failureMessage: "Failed to list seed characters",
    });

    return {
      characters: Array.isArray(response?.characters) ? response.characters : [],
      count: Number.isFinite(Number(response?.count))
        ? Number(response.count)
        : 0,
    };
  },

  listCharacters: async () => {
    if (!runtimeBridge.isCharacterApiAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI character methods are unavailable",
      );
    }

    const response = await invokeUnchain("listCharacters", [], {
      timeoutMs: 15000,
      timeoutCode: "unchain_character_list_timeout",
      timeoutMessage: "Character list request timed out",
      failureCode: "unchain_character_list_failed",
      failureMessage: "Failed to list characters",
    });

    return {
      characters: Array.isArray(response?.characters) ? response.characters : [],
      count: Number.isFinite(Number(response?.count))
        ? Number(response.count)
        : 0,
    };
  },

  getCharacter: async (characterId) => {
    if (!runtimeBridge.isCharacterApiAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI character methods are unavailable",
      );
    }

    return invokeUnchain("getCharacter", [characterId], {
      timeoutMs: 15000,
      timeoutCode: "unchain_character_get_timeout",
      timeoutMessage: "Character get request timed out",
      failureCode: "unchain_character_get_failed",
      failureMessage: "Failed to get character",
    });
  },

  saveCharacter: async (payload = {}) => {
    if (!runtimeBridge.isCharacterApiAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI character methods are unavailable",
      );
    }

    return invokeUnchain("saveCharacter", [payload], {
      timeoutMs: 20000,
      timeoutCode: "unchain_character_save_timeout",
      timeoutMessage: "Character save request timed out",
      failureCode: "unchain_character_save_failed",
      failureMessage: "Failed to save character",
    });
  },

  deleteCharacter: async (characterId) => {
    if (!runtimeBridge.isCharacterApiAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI character methods are unavailable",
      );
    }

    return invokeUnchain("deleteCharacter", [characterId], {
      timeoutMs: 30000,
      timeoutCode: "unchain_character_delete_timeout",
      timeoutMessage: "Character delete request timed out",
      failureCode: "unchain_character_delete_failed",
      failureMessage: "Failed to delete character",
    });
  },

  previewCharacterDecision: async (payload = {}) => {
    if (!hasBridgeMethod("unchainAPI", "previewCharacterDecision")) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.previewCharacterDecision is unavailable",
      );
    }

    return invokeUnchain("previewCharacterDecision", [payload], {
      timeoutMs: 20000,
      timeoutCode: "unchain_character_preview_timeout",
      timeoutMessage: "Character preview request timed out",
      failureCode: "unchain_character_preview_failed",
      failureMessage: "Failed to preview character decision",
    });
  },

  buildCharacterAgentConfig: async (payload = {}) => {
    if (!hasBridgeMethod("unchainAPI", "buildCharacterAgentConfig")) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.buildCharacterAgentConfig is unavailable",
      );
    }

    return invokeUnchain("buildCharacterAgentConfig", [payload], {
      timeoutMs: 20000,
      timeoutCode: "unchain_character_build_timeout",
      timeoutMessage: "Character build request timed out",
      failureCode: "unchain_character_build_failed",
      failureMessage: "Failed to build character agent config",
    });
  },

  exportCharacter: async (characterId, filePath) => {
    if (!hasBridgeMethod("unchainAPI", "exportCharacter")) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.exportCharacter is unavailable",
      );
    }

    return invokeUnchain("exportCharacter", [characterId, filePath], {
      timeoutMs: 30000,
      timeoutCode: "unchain_character_export_timeout",
      timeoutMessage: "Character export request timed out",
      failureCode: "unchain_character_export_failed",
      failureMessage: "Failed to export character",
    });
  },

  importCharacter: async (filePath) => {
    if (!hasBridgeMethod("unchainAPI", "importCharacter")) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "unchainAPI.importCharacter is unavailable",
      );
    }

    return invokeUnchain("importCharacter", [filePath], {
      timeoutMs: 30000,
      timeoutCode: "unchain_character_import_timeout",
      timeoutMessage: "Character import request timed out",
      failureCode: "unchain_character_import_failed",
      failureMessage: "Failed to import character",
    });
  },

  deleteRuntimeEntry: async (dirPath, entryName) => {
    return invokeUnchain("deleteRuntimeEntry", [dirPath, entryName], {
      timeoutMs: 10000,
      timeoutCode: "unchain_runtime_delete_timeout",
      timeoutMessage: "Delete runtime entry request timed out",
      failureCode: "unchain_runtime_delete_failed",
      failureMessage: "Failed to delete runtime entry",
    });
  },

  clearRuntimeDir: async (dirPath) => {
    return invokeUnchain("clearRuntimeDir", [dirPath], {
      timeoutMs: 15000,
      timeoutCode: "unchain_runtime_clear_timeout",
      timeoutMessage: "Clear runtime directory request timed out",
      failureCode: "unchain_runtime_clear_failed",
      failureMessage: "Failed to clear runtime directory",
    });
  },

  isExportImportAvailable: () =>
    hasBridgeMethod("unchainAPI", "showSaveDialog") &&
    hasBridgeMethod("unchainAPI", "writeFile"),

  showSaveDialog: async (options = {}) => {
    return invokeUnchain("showSaveDialog", [options], {
      timeoutMs: 30000,
      timeoutCode: "unchain_save_dialog_timeout",
      timeoutMessage: "Save dialog request timed out",
      failureCode: "unchain_save_dialog_failed",
      failureMessage: "Failed to open save dialog",
    });
  },

  showOpenDialog: async (options = {}) => {
    return invokeUnchain("showOpenDialog", [options], {
      timeoutMs: 30000,
      timeoutCode: "unchain_open_dialog_timeout",
      timeoutMessage: "Open dialog request timed out",
      failureCode: "unchain_open_dialog_failed",
      failureMessage: "Failed to open file dialog",
    });
  },

  writeFile: async (filePath, content) => {
    return invokeUnchain("writeFile", [filePath, content], {
      timeoutMs: 15000,
      timeoutCode: "unchain_write_file_timeout",
      timeoutMessage: "Write file request timed out",
      failureCode: "unchain_write_file_failed",
      failureMessage: "Failed to write file",
    });
  },

  readFile: async (filePath) => {
    return invokeUnchain("readFile", [filePath], {
      timeoutMs: 15000,
      timeoutCode: "unchain_read_file_timeout",
      timeoutMessage: "Read file request timed out",
      failureCode: "unchain_read_file_failed",
      failureMessage: "Failed to read file",
    });
  },

  isValidateApiKeyAvailable: () =>
    hasBridgeMethod("unchainAPI", "validateApiKey"),

  validateApiKey: async (provider, apiKey) => {
    const result = await invokeMiso("validateApiKey", [provider, apiKey], {
      timeoutMs: 12000,
      timeoutCode: "unchain_validate_api_key_timeout",
      timeoutMessage: "API key validation request timed out",
      failureCode: "unchain_validate_api_key_failed",
      failureMessage: "Failed to validate API key",
    });
    return result || { valid: false, error: "No response from validation" };
  },
};

export default runtimeBridge;
