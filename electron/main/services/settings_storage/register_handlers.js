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
};

module.exports = {
  registerSettingsStorageHandlers,
  SETTINGS_STORAGE_SYNC_CHANNELS,
  SETTINGS_STORAGE_INVOKE_CHANNELS,
};
