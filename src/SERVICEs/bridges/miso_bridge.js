import {
  FrontendApiError,
  assertBridgeMethod,
  hasBridgeMethod,
  toFrontendApiError,
  withTimeout,
} from "../api.shared";

const toTrimmedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const invokeMiso = async (
  methodName,
  args,
  {
    timeoutMs = 5000,
    timeoutCode = "miso_bridge_timeout",
    timeoutMessage = "Miso bridge request timed out",
    failureCode = "miso_bridge_failed",
    failureMessage = "Miso bridge request failed",
  } = {},
) => {
  try {
    const method = assertBridgeMethod("misoAPI", methodName);
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
  isWorkspaceValidationAvailable: () =>
    hasBridgeMethod("misoAPI", "validateWorkspaceRoot"),
  isWorkspacePickerAvailable: () =>
    hasBridgeMethod("misoAPI", "pickWorkspaceRoot"),
  isOpenRuntimeFolderAvailable: () =>
    hasBridgeMethod("misoAPI", "openRuntimeFolder"),
  isRuntimeStorageAvailable: () =>
    hasBridgeMethod("misoAPI", "getRuntimeDirSize"),

  validateWorkspaceRoot: async (path = "") => {
    if (!runtimeBridge.isWorkspaceValidationAvailable()) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "misoAPI.validateWorkspaceRoot is unavailable",
      );
    }

    const response = await invokeMiso("validateWorkspaceRoot", [path], {
      timeoutMs: 6000,
      timeoutCode: "miso_validate_workspace_timeout",
      timeoutMessage: "Workspace path validation timed out",
      failureCode: "miso_validate_workspace_failed",
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
        "misoAPI.pickWorkspaceRoot is unavailable",
      );
    }

    const response = await invokeMiso("pickWorkspaceRoot", [defaultPath], {
      timeoutMs: 20000,
      timeoutCode: "miso_pick_workspace_timeout",
      timeoutMessage: "Workspace picker request timed out",
      failureCode: "miso_pick_workspace_failed",
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
        "misoAPI.openRuntimeFolder is unavailable",
      );
    }

    const response = await invokeMiso("openRuntimeFolder", [path], {
      timeoutMs: 10000,
      timeoutCode: "miso_open_runtime_folder_timeout",
      timeoutMessage: "Open runtime folder request timed out",
      failureCode: "miso_open_runtime_folder_failed",
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
        "misoAPI.getRuntimeDirSize is unavailable",
      );
    }

    const response = await invokeMiso("getRuntimeDirSize", [dirPath], {
      timeoutMs: 15000,
      timeoutCode: "miso_runtime_size_timeout",
      timeoutMessage: "Runtime size request timed out",
      failureCode: "miso_runtime_size_failed",
      failureMessage: "Failed to get runtime directory size",
    });

    if (!response || typeof response !== "object") {
      return { entries: [], total: 0, error: "invalid_response" };
    }

    return {
      ...response,
      entries: Array.isArray(response.entries) ? response.entries : [],
      total: Number.isFinite(Number(response.total)) ? Number(response.total) : 0,
      error: typeof response.error === "string" ? response.error : "",
    };
  },

  deleteRuntimeEntry: async (dirPath, entryName) => {
    return invokeMiso("deleteRuntimeEntry", [dirPath, entryName], {
      timeoutMs: 10000,
      timeoutCode: "miso_runtime_delete_timeout",
      timeoutMessage: "Delete runtime entry request timed out",
      failureCode: "miso_runtime_delete_failed",
      failureMessage: "Failed to delete runtime entry",
    });
  },

  clearRuntimeDir: async (dirPath) => {
    return invokeMiso("clearRuntimeDir", [dirPath], {
      timeoutMs: 15000,
      timeoutCode: "miso_runtime_clear_timeout",
      timeoutMessage: "Clear runtime directory request timed out",
      failureCode: "miso_runtime_clear_failed",
      failureMessage: "Failed to clear runtime directory",
    });
  },
};

export default runtimeBridge;
