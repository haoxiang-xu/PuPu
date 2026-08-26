const { CHANNELS } = require("../../shared/channels");
const { normalizeRunBundleV1 } = require("../../shared/run_bundle_v1");
const {
  normalizeRunBundleV2,
  isRunBundleV2,
} = require("../../shared/run_bundle_v2");

const assertOnlyKeys = (value, allowed, label) => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`[run_bundle_storage_invalid] ${label} must be an object`);
  }
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`[run_bundle_storage_invalid] ${label} has unknown fields`);
  }
};

const createRunBundleStorageBridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createRunBundleStorageBridge: ipcRenderer is required");
  }

  const upsert = (bundle) => {
    // Preload is an independent admission point: reconstruct from the strict
    // validator result and never forward the caller-owned object reference.
    const normalized = isRunBundleV2(bundle)
      ? normalizeRunBundleV2(bundle, { verifyDigest: false })
      : normalizeRunBundleV1(bundle, { verifyDigest: false });
    return ipcRenderer.invoke(CHANNELS.RUN_BUNDLE_STORAGE.UPSERT, {
      bundle: normalized,
    });
  };

  const query = (queryOptions = {}) => {
    assertOnlyKeys(
      queryOptions,
      ["executionId", "status", "startMs", "endMs", "limit", "offset"],
      "query",
    );
    const queryPayload = {};
    for (const key of [
      "executionId",
      "status",
      "startMs",
      "endMs",
      "limit",
      "offset",
    ]) {
      if (queryOptions[key] !== undefined) queryPayload[key] = queryOptions[key];
    }
    return ipcRenderer.invoke(CHANNELS.RUN_BUNDLE_STORAGE.QUERY, {
      query: queryPayload,
    });
  };

  const clear = (options = {}) => {
    assertOnlyKeys(options, ["executionId"], "clear options");
    const clearOptions = {};
    if (options.executionId !== undefined) {
      clearOptions.executionId = options.executionId;
    }
    return ipcRenderer.invoke(CHANNELS.RUN_BUNDLE_STORAGE.CLEAR, {
      options: clearOptions,
    });
  };

  return Object.freeze({ upsert, query, clear });
};

module.exports = { createRunBundleStorageBridge };
