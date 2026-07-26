const { CHANNELS } = require("../../../shared/channels");

// BOOTSTRAP_READ is the only synchronous channel (sendSync) — module-init-time
// snapshot only (plan §4.2). Every mutation goes through invoke/handle so the
// renderer gets an explicit ack or error.
const SETTINGS_STORAGE_SYNC_CHANNELS = Object.freeze([
  CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ,
]);

const SETTINGS_STORAGE_INVOKE_CHANNELS = Object.freeze([
  CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
  CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
  CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
  CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
  CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
  CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR,
  CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
  CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL,
  CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
  CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
  CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
  CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
  CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
  CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
  CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
  CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
  CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
  CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
  CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
  CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
  CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS,
  CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
  CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
  CHANNELS.SETTINGS_STORAGE.RESET_SETTINGS,
  CHANNELS.SETTINGS_STORAGE.DB_STATS,
]);

// Failure logs must not amplify attacker-controlled payloads: the namespace
// in a rejected payload is unvalidated input. Only strings are printed —
// clipped to a sane length with control characters stripped — anything else
// logs as a typeof placeholder, never its content.
const LOGGED_NAMESPACE_MAX_LENGTH = 120;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;
const describeNamespaceForLog = (namespace) => {
  if (typeof namespace !== "string") {
    return `<non-string:${typeof namespace}>`;
  }
  return namespace
    .replace(CONTROL_CHARS_PATTERN, "")
    .slice(0, LOGGED_NAMESPACE_MAX_LENGTH);
};

// Logging policy: namespace names and error codes only — never values.
const registerSettingsStorageHandlers = ({
  ipcMain,
  settingsStorageService,
}) => {
  if (!ipcMain || !settingsStorageService) {
    throw new Error("registerSettingsStorageHandlers: missing dependencies");
  }

  ipcMain.on(CHANNELS.SETTINGS_STORAGE.BOOTSTRAP_READ, (event) => {
    try {
      event.returnValue = settingsStorageService.getBootstrapSnapshot();
    } catch (error) {
      console.error(
        "[settings-storage] bootstrap-read failed:",
        error.code || error.message,
      );
      event.returnValue = {
        available: false,
        degraded: true,
        reason: "bootstrap-read-failed",
      };
    }
  });

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.MIGRATE_LEGACY,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateLegacy(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] migrate-legacy failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.SET_NAMESPACE,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.setNamespace(
          payload.namespace,
          payload.value,
          payload.options,
        );
      } catch (error) {
        console.warn(
          "[settings-storage] set-namespace failed:",
          describeNamespaceForLog(payload && payload.namespace),
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.DELETE_NAMESPACE,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.deleteNamespace(payload.namespace);
      } catch (error) {
        console.warn(
          "[settings-storage] delete-namespace failed:",
          describeNamespaceForLog(payload && payload.namespace),
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  // ---- Phase 2: token_usage structured store -------------------------------
  // Failure logs carry the store name and the error code only — never record
  // contents or query values.

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_APPEND,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.appendTokenUsage(payload.record);
      } catch (error) {
        console.warn(
          "[settings-storage] token-usage-append failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_QUERY,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.queryTokenUsage(payload.query);
      } catch (error) {
        console.warn(
          "[settings-storage] token-usage-query failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_CLEAR, async () => {
    try {
      return settingsStorageService.clearTokenUsage();
    } catch (error) {
      console.warn(
        "[settings-storage] token-usage-clear failed:",
        error.code || error.message,
      );
      throw error;
    }
  });

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.TOKEN_USAGE_MIGRATE_LEGACY,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateLegacyTokenUsage(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] token-usage-migrate-legacy failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  // ---- Phase 2: toolkit preference structured stores (plan §3.3) -----------
  // Same logging policy: store name + error code only — never toolkit ids,
  // tool names or scope keys from the payload.

  ipcMain.handle(CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_READ_ALL, async () => {
    try {
      return settingsStorageService.readDefaultToolkits();
    } catch (error) {
      console.warn(
        "[settings-storage] default-toolkits-read-all failed:",
        error.code || error.message,
      );
      throw error;
    }
  });

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_REPLACE_SCOPE,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.replaceDefaultToolkitsScope(
          payload.scopeKey,
          payload.toolkitIds,
        );
      } catch (error) {
        console.warn(
          "[settings-storage] default-toolkits-replace-scope failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.DEFAULT_TOOLKITS_MIGRATE_LEGACY,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateLegacyDefaultToolkits(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] default-toolkits-migrate-legacy failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_READ_ALL,
    async () => {
      try {
        return settingsStorageService.readToolkitAutoApprove();
      } catch (error) {
        console.warn(
          "[settings-storage] toolkit-auto-approve-read-all failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_REPLACE_ALL,
    async (_event, payload) => {
      try {
        return settingsStorageService.replaceToolkitAutoApprove(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] toolkit-auto-approve-replace-all failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateLegacyToolkitAutoApprove(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] toolkit-auto-approve-migrate-legacy failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  // ---- Phase 2: computer use preference KV store (plan §3.4) ---------------
  // Same logging policy: store name + error code only — record contents
  // (consent timestamps, enablement flags) never reach the logs.

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_READ_ALL,
    async () => {
      try {
        return settingsStorageService.readComputerUsePreferences();
      } catch (error) {
        console.warn(
          "[settings-storage] computer-use-read-all failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_SET_KEY,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.setComputerUsePreference(
          payload.key,
          payload.value,
        );
      } catch (error) {
        console.warn(
          "[settings-storage] computer-use-set-key failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_CLEAR_KEY,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.clearComputerUsePreference(payload.key);
      } catch (error) {
        console.warn(
          "[settings-storage] computer-use-clear-key failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.COMPUTER_USE_PREFS_MIGRATE_LEGACY,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateLegacyComputerUse(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] computer-use-migrate-legacy failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  // ---- Phase 3: custom MCP icon asset store (plan §3.6) --------------------
  // Same logging policy: store name + error code only — never toolkit ids or
  // icon bytes from the payload.

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.MCP_ICON_GET,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.getMcpIconAsset(payload.toolkitId);
      } catch (error) {
        console.warn(
          "[settings-storage] mcp-icon-get failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.MCP_ICON_SET,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.setMcpIconAsset(
          payload.toolkitId,
          payload.icon,
        );
      } catch (error) {
        console.warn(
          "[settings-storage] mcp-icon-set failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.MCP_ICON_DELETE,
    async (_event, payload = {}) => {
      try {
        return settingsStorageService.deleteMcpIconAsset(payload.toolkitId);
      } catch (error) {
        console.warn(
          "[settings-storage] mcp-icon-delete failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(CHANNELS.SETTINGS_STORAGE.MCP_ICON_LIST_OWNERS, async () => {
    try {
      return settingsStorageService.listMcpIconOwners();
    } catch (error) {
      console.warn(
        "[settings-storage] mcp-icon-list-owners failed:",
        error.code || error.message,
      );
      throw error;
    }
  });

  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.MCP_ICON_MIGRATE_LEGACY,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateMcpIconsLegacy(payload);
      } catch (error) {
        console.warn(
          "[settings-storage] mcp-icon-migrate-legacy failed:",
          error.code || error.message,
        );
        throw error;
      }
    },
  );

  // ---- Phase 4 (S7): provider secret migration trigger --------------------
  // This is the ONE inbound channel whose payload carries plaintext provider
  // secrets (the renderer's own legacy localStorage keys, handed in to be
  // encrypted). Two invariants beyond the shared "code only" logging policy:
  //   * The payload is NEVER logged — not on success and not on failure. Only
  //     the error CODE is printed, so a rejected/malformed payload cannot leak
  //     a key into the logs.
  //   * The service returns a status object only (status / migratedCount /
  //     failedCount / secretStorageStatus + identity ids) — never a secret
  //     value or ciphertext. Read-direction secret access has no channel at
  //     all (gate 7 red line #8); this handler is write-direction only.
  ipcMain.handle(
    CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
    async (_event, payload) => {
      try {
        return settingsStorageService.migrateProviderCredentials(payload);
      } catch (error) {
        // Code only — this is the sole inbound channel carrying plaintext
        // provider secrets, so never log error.message (it could embed
        // payload-derived text). An uncoded throw logs a stable placeholder.
        console.warn(
          "[settings-storage] migrate-provider-credentials failed:",
          error.code || "uncoded_error",
        );
        throw error;
      }
    },
  );

  // ---- Phase 5: reset settings + read-only db stats (plan §6-Phase5) -------
  // reset-settings clears the non-sensitive settings/preference tables in one
  // transaction; db-stats returns settings.db metadata only. Both log the
  // store name + error code only — the reset return carries row counts and the
  // stats return carries file size / row counts, never a value or a secret.

  ipcMain.handle(CHANNELS.SETTINGS_STORAGE.RESET_SETTINGS, async () => {
    try {
      return settingsStorageService.resetSettings();
    } catch (error) {
      console.warn(
        "[settings-storage] reset-settings failed:",
        error.code || error.message,
      );
      throw error;
    }
  });

  ipcMain.handle(CHANNELS.SETTINGS_STORAGE.DB_STATS, async () => {
    try {
      return settingsStorageService.getDbStats();
    } catch (error) {
      console.warn(
        "[settings-storage] db-stats failed:",
        error.code || error.message,
      );
      throw error;
    }
  });
};

module.exports = {
  registerSettingsStorageHandlers,
  SETTINGS_STORAGE_SYNC_CHANNELS,
  SETTINGS_STORAGE_INVOKE_CHANNELS,
};
