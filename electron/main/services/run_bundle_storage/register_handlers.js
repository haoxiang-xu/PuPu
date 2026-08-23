const { CHANNELS } = require("../../../shared/channels");

const registerRunBundleStorageHandlers = ({
  ipcMain,
  runBundleStorageService,
} = {}) => {
  if (!ipcMain || !runBundleStorageService) {
    throw new Error("registerRunBundleStorageHandlers: missing dependencies");
  }

  ipcMain.handle(
    CHANNELS.RUN_BUNDLE_STORAGE.UPSERT,
    async (_event, payload = {}) => {
      try {
        return runBundleStorageService.upsertRunBundle(payload.bundle);
      } catch (error) {
        console.warn(
          "[run-bundle-storage] upsert failed:",
          error.code || "run_bundle_storage_error",
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.RUN_BUNDLE_STORAGE.QUERY,
    async (_event, payload = {}) => {
      try {
        return runBundleStorageService.queryRunBundles(payload.query);
      } catch (error) {
        console.warn(
          "[run-bundle-storage] query failed:",
          error.code || "run_bundle_storage_error",
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    CHANNELS.RUN_BUNDLE_STORAGE.CLEAR,
    async (_event, payload = {}) => {
      try {
        return runBundleStorageService.clearRunBundles(payload.options);
      } catch (error) {
        console.warn(
          "[run-bundle-storage] clear failed:",
          error.code || "run_bundle_storage_error",
        );
        throw error;
      }
    },
  );
};

module.exports = { registerRunBundleStorageHandlers };
