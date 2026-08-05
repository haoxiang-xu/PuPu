const { createHash } = require("crypto");

const MEMORY_V2_RELEASE_SCHEMA = "pupu.memory-v2-release.v1";
const MEMORY_V2_ROLLOUT_SCHEMA = "memory_v2.rollout.v1";
// Must track Unchain's SQLiteContextV2Store schema exactly. This is an
// EQUALITY gate, not a floor. PuPu's retired prototype also used the public
// Context V2 status shape but ended at schema v4, so readiness must verify the
// canonical store owner as well as Unchain schema v2 before enabling traffic.
const MEMORY_V2_REQUIRED_SCHEMA_VERSION = 2;
const MEMORY_V2_BUILD_FEATURE_KEY = "enable_memory_v2";
const MEMORY_V2_RELEASE_FIELD = "_pupu_memory_v2_release";
const MEMORY_V2_DIRTY_ACTIVE_DEV_ENV =
  "PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV";
const MEMORY_V2_ENV_KEYS = Object.freeze({
  featureCeiling: "PUPU_FEATURE_MEMORY_V2",
  rolloutMode: "PUPU_MEMORY_V2_MODE",
  canaryPercent: "PUPU_MEMORY_V2_CANARY_PERCENT",
  readOnlyDegraded: "PUPU_MEMORY_V2_READ_ONLY_DEGRADED",
  storeOwner: "PUPU_CONTEXT_V2_STORE_OWNER",
});
const MEMORY_V2_ROLLOUT_RANK = Object.freeze({
  off: 0,
  shadow: 1,
  canary: 2,
  all: 3,
});
const MEMORY_V2_ALLOWED_LEXICAL_BACKENDS = Object.freeze(
  new Set(["fts5", "degraded"]),
);
const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const stableObject = (value) => {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableObject(value[key])]),
  );
};

const stableJson = (value) => JSON.stringify(stableObject(value));

const normalizeMode = (value, fallback = "off") => {
  if (value === true) return "all";
  if (value === false) return "off";
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "active") return "all";
  if (Object.prototype.hasOwnProperty.call(MEMORY_V2_ROLLOUT_RANK, normalized)) {
    return normalized;
  }
  if (TRUE_VALUES.has(normalized)) return "all";
  if (FALSE_VALUES.has(normalized)) return "off";
  return fallback;
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === true || value === false) return value;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

const normalizeCanaryPercent = (value, fallback = 5) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
};

const effectiveMode = (featureCeiling, configuredMode) => {
  const rank = Math.min(
    MEMORY_V2_ROLLOUT_RANK[featureCeiling],
    MEMORY_V2_ROLLOUT_RANK[configuredMode],
  );
  return Object.keys(MEMORY_V2_ROLLOUT_RANK).find(
    (mode) => MEMORY_V2_ROLLOUT_RANK[mode] === rank,
  );
};

const rolloutFingerprint = ({
  featureCeiling,
  configuredMode,
  rolloutMode,
  canaryPercent,
  readOnlyDegraded,
}) =>
  sha256(
    stableJson({
      canary_percent: canaryPercent,
      configured_mode: configuredMode,
      feature_ceiling: featureCeiling,
      read_only_degraded: readOnlyDegraded,
      rollout_mode: rolloutMode,
      schema_version: MEMORY_V2_ROLLOUT_SCHEMA,
    }),
  );

const normalizeFeatureFlags = (source = {}) => {
  const payload = isObject(source) ? source : {};
  const featureFlags = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key.startsWith("enable_"))
      .map(([key, value]) => [key, value === true]),
  );
  featureFlags[MEMORY_V2_BUILD_FEATURE_KEY] =
    payload[MEMORY_V2_BUILD_FEATURE_KEY] === true;
  return stableObject(featureFlags);
};

const buildRolloutConfig = ({
  featureEnabled,
  sidecarEnvironment = {},
  processEnvironment = {},
  allowProcessOverrides = false,
}) => {
  const readValue = (key) => {
    if (
      allowProcessOverrides &&
      typeof processEnvironment?.[key] === "string" &&
      processEnvironment[key].trim()
    ) {
      return processEnvironment[key];
    }
    return sidecarEnvironment?.[key];
  };

  const featureCeiling = featureEnabled
    ? normalizeMode(readValue(MEMORY_V2_ENV_KEYS.featureCeiling), "off")
    : "off";
  const configuredMode = featureEnabled
    ? normalizeMode(readValue(MEMORY_V2_ENV_KEYS.rolloutMode), "off")
    : "off";
  const resolvedRolloutMode = effectiveMode(featureCeiling, configuredMode);
  const canaryPercent = normalizeCanaryPercent(
    readValue(MEMORY_V2_ENV_KEYS.canaryPercent),
    5,
  );
  const readOnlyDegraded = normalizeBoolean(
    readValue(MEMORY_V2_ENV_KEYS.readOnlyDegraded),
    false,
  );
  const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";
  const config = {
    featureEnabled: featureEnabled === true,
    featureCeiling,
    configuredMode,
    effectiveMode: resolvedRolloutMode,
    canaryPercent,
    readOnlyDegraded,
  };
  return {
    ...config,
    rolloutFingerprint: rolloutFingerprint({
      ...config,
      rolloutMode: resolvedRolloutMode,
    }),
    sidecarEnvironment: Object.freeze({
      [MEMORY_V2_ENV_KEYS.featureCeiling]: featureCeiling,
      [MEMORY_V2_ENV_KEYS.rolloutMode]: configuredMode,
      [MEMORY_V2_ENV_KEYS.canaryPercent]: String(canaryPercent),
      [MEMORY_V2_ENV_KEYS.readOnlyDegraded]: readOnlyDegraded ? "1" : "0",
      [MEMORY_V2_ENV_KEYS.storeOwner]: storeOwner,
    }),
  };
};

const releaseSnapshotFingerprint = ({ featureFlags, release }) =>
  sha256(
    stableJson({
      feature_flags: featureFlags,
      rollout_fingerprint: release.rollout_fingerprint,
      schema: release.schema,
      sidecar_environment: release.sidecar_environment,
    }),
  );

const createBuildFeatureSnapshot = (source = {}, environment = {}) => {
  const featureFlags = normalizeFeatureFlags(source);
  const rollout = buildRolloutConfig({
    featureEnabled: featureFlags[MEMORY_V2_BUILD_FEATURE_KEY] === true,
    sidecarEnvironment: isObject(source?.[MEMORY_V2_RELEASE_FIELD])
      ? source[MEMORY_V2_RELEASE_FIELD].sidecar_environment
      : {},
    processEnvironment: environment,
    allowProcessOverrides: true,
  });
  const release = {
    schema: MEMORY_V2_RELEASE_SCHEMA,
    sidecar_environment: rollout.sidecarEnvironment,
    rollout_fingerprint: rollout.rolloutFingerprint,
  };
  release.snapshot_fingerprint = releaseSnapshotFingerprint({
    featureFlags,
    release,
  });
  return {
    ...featureFlags,
    [MEMORY_V2_RELEASE_FIELD]: release,
  };
};

const resolveMemoryV2ReleaseConfig = ({
  app,
  fs,
  path,
  environment = process.env,
}) => {
  const snapshotPath = app.isPackaged
    ? path.join(app.getAppPath(), "build", "build_feature_flags.json")
    : path.join(app.getAppPath(), ".local", "build_feature_flags.snapshot.json");
  let source = {};
  try {
    if (
      typeof fs?.readFileSync === "function" &&
      (typeof fs.existsSync !== "function" || fs.existsSync(snapshotPath))
    ) {
      const parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
      if (isObject(parsed)) source = parsed;
    }
  } catch (_error) {
    source = {};
  }

  const featureFlags = normalizeFeatureFlags(source);
  const featureEnabled = featureFlags[MEMORY_V2_BUILD_FEATURE_KEY] === true;
  const release = isObject(source[MEMORY_V2_RELEASE_FIELD])
    ? source[MEMORY_V2_RELEASE_FIELD]
    : null;
  let snapshotValid = !app.isPackaged || !featureEnabled;
  let snapshotErrorCode = "";
  let sidecarEnvironment = release?.sidecar_environment;

  if (app.isPackaged && featureEnabled) {
    if (
      release?.schema !== MEMORY_V2_RELEASE_SCHEMA ||
      !isObject(sidecarEnvironment) ||
      typeof release.rollout_fingerprint !== "string" ||
      typeof release.snapshot_fingerprint !== "string"
    ) {
      snapshotErrorCode = "memory_v2_release_snapshot_invalid";
    } else {
      const expectedSnapshotFingerprint = releaseSnapshotFingerprint({
        featureFlags,
        release,
      });
      snapshotValid = expectedSnapshotFingerprint === release.snapshot_fingerprint;
      if (!snapshotValid) {
        snapshotErrorCode = "memory_v2_release_snapshot_fingerprint_mismatch";
      }
    }
  }

  const rollout = buildRolloutConfig({
    featureEnabled: featureEnabled && snapshotValid,
    sidecarEnvironment: isObject(sidecarEnvironment) ? sidecarEnvironment : {},
    processEnvironment: environment,
    allowProcessOverrides: !app.isPackaged,
  });
  const allowDirtyUnchainActiveDev =
    !app.isPackaged &&
    rollout.effectiveMode === "all" &&
    environment?.[MEMORY_V2_DIRTY_ACTIVE_DEV_ENV] === "1";
  if (
    app.isPackaged &&
    featureEnabled &&
    snapshotValid &&
    rollout.rolloutFingerprint !== release.rollout_fingerprint
  ) {
    snapshotValid = false;
    snapshotErrorCode = "memory_v2_rollout_fingerprint_mismatch";
  }

  if (!snapshotValid) {
    const disabled = buildRolloutConfig({ featureEnabled: false });
    return Object.freeze({
      ...disabled,
      buildFeatureEnabled: featureEnabled,
      snapshotPath,
      snapshotValid: false,
      snapshotErrorCode,
      snapshotFingerprint:
        typeof release?.snapshot_fingerprint === "string"
          ? release.snapshot_fingerprint
          : "",
      allowDirtyUnchainActiveDev: false,
    });
  }

  return Object.freeze({
    ...rollout,
    buildFeatureEnabled: featureEnabled,
    snapshotPath,
    snapshotValid: true,
    snapshotErrorCode: "",
    snapshotFingerprint:
      typeof release?.snapshot_fingerprint === "string"
        ? release.snapshot_fingerprint
        : "",
    allowDirtyUnchainActiveDev,
  });
};

const constrainMemoryV2ConfigForPlatform = (releaseConfig, platform) => {
  const activeBlocked =
    platform === "win32" &&
    ["canary", "all"].includes(releaseConfig.effectiveMode);
  if (!activeBlocked) {
    return Object.freeze({
      ...releaseConfig,
      releaseEffectiveMode: releaseConfig.effectiveMode,
      releaseRolloutFingerprint: releaseConfig.rolloutFingerprint,
      platformActiveBlocked: false,
      allowDirtyUnchainActiveDev:
        releaseConfig.allowDirtyUnchainActiveDev === true &&
        releaseConfig.effectiveMode === "all",
    });
  }
  const constrained = buildRolloutConfig({
    featureEnabled: true,
    sidecarEnvironment: {
      ...releaseConfig.sidecarEnvironment,
      [MEMORY_V2_ENV_KEYS.featureCeiling]: "shadow",
    },
  });
  return Object.freeze({
    ...releaseConfig,
    ...constrained,
    buildFeatureEnabled: releaseConfig.buildFeatureEnabled,
    releaseEffectiveMode: releaseConfig.effectiveMode,
    releaseRolloutFingerprint: releaseConfig.rolloutFingerprint,
    platformActiveBlocked: true,
    allowDirtyUnchainActiveDev: false,
  });
};

const projectMemoryV2Status = (payload = {}) => ({
  available: payload?.available === true,
  storeOwner:
    typeof payload?.store_owner === "string"
      ? payload.store_owner.trim().toLowerCase()
      : "",
  schemaVersion: Number.isSafeInteger(payload?.schema_version)
    ? payload.schema_version
    : 0,
  journalMode:
    typeof payload?.journal_mode === "string"
      ? payload.journal_mode.trim().toLowerCase()
      : "",
  lexicalBackend:
    typeof payload?.lexical_backend === "string"
      ? payload.lexical_backend.trim().toLowerCase()
      : "",
  vectorStatus:
    typeof payload?.vector_status === "string" ? payload.vector_status : "",
  featureCeiling:
    typeof payload?.feature_ceiling === "string"
      ? payload.feature_ceiling.trim().toLowerCase()
      : "off",
  configuredMode:
    typeof payload?.configured_mode === "string"
      ? payload.configured_mode.trim().toLowerCase()
      : "off",
  rolloutMode:
    typeof payload?.rollout_mode === "string"
      ? payload.rollout_mode.trim().toLowerCase()
      : "off",
  canaryPercent: Number.isSafeInteger(payload?.canary_percent)
    ? payload.canary_percent
    : 0,
  readOnlyDegraded: payload?.read_only_degraded === true,
  rolloutFingerprint:
    typeof payload?.rollout_fingerprint === "string"
      ? payload.rollout_fingerprint
      : "",
  rolloutConfigValid: payload?.rollout_config_valid === true,
  contextMemoryCapabilityReady:
    payload?.context_memory_capability_ready === true,
  contextMemoryCapabilityReason:
    typeof payload?.context_memory_capability_reason === "string"
      ? payload.context_memory_capability_reason
      : "",
  contextMemoryCapabilityVerification:
    typeof payload?.context_memory_capability_verification === "string"
      ? payload.context_memory_capability_verification
      : "",
  contextMemoryCapabilityImmutable:
    payload?.context_memory_capability_immutable === true,
  unchainRevision:
    typeof payload?.unchain_revision === "string"
      ? payload.unchain_revision.trim()
      : "",
  contextMemoryContract: Number.isSafeInteger(payload?.context_memory_contract)
    ? payload.context_memory_contract
    : 0,
});

const validateMemoryV2Status = (payload, releaseConfig) => {
  const status = projectMemoryV2Status(payload);
  let reason = "";
  if (!status.available) reason = "context_v2_unavailable";
  else if (status.storeOwner !== "unchain") {
    reason = "context_v2_store_owner_incompatible";
  } else if (status.schemaVersion !== MEMORY_V2_REQUIRED_SCHEMA_VERSION) {
    reason = "context_v2_schema_incompatible";
  } else if (status.journalMode !== "wal") {
    reason = "context_v2_wal_required";
  } else if (!MEMORY_V2_ALLOWED_LEXICAL_BACKENDS.has(status.lexicalBackend)) {
    reason = "context_v2_lexical_backend_incompatible";
  } else if (!status.contextMemoryCapabilityReady) {
    reason = "context_v2_unchain_capability_unavailable";
  } else if (
    status.contextMemoryCapabilityReason !== "unchain_context_memory_ready" ||
    status.contextMemoryContract !== 1 ||
    !/^[0-9a-f]{40}$/.test(status.unchainRevision) ||
    !["exact_sha", "dev_bypass", "dirty_dev_checkout"].includes(
      status.contextMemoryCapabilityVerification,
    ) ||
    (status.contextMemoryCapabilityVerification === "exact_sha" &&
      !status.contextMemoryCapabilityImmutable) ||
    (status.contextMemoryCapabilityVerification === "dev_bypass" &&
      (status.contextMemoryCapabilityImmutable ||
        releaseConfig.effectiveMode !== "shadow")) ||
    (status.contextMemoryCapabilityVerification === "dirty_dev_checkout" &&
      (status.contextMemoryCapabilityImmutable ||
        releaseConfig.effectiveMode !== "all" ||
        releaseConfig.allowDirtyUnchainActiveDev !== true))
  ) {
    reason = "context_v2_unchain_capability_invalid";
  } else if (!status.rolloutConfigValid) {
    reason = "context_v2_rollout_config_invalid";
  } else if (
    status.featureCeiling !== releaseConfig.featureCeiling ||
    status.configuredMode !== releaseConfig.configuredMode ||
    status.rolloutMode !== releaseConfig.effectiveMode ||
    status.canaryPercent !== releaseConfig.canaryPercent ||
    status.readOnlyDegraded !== releaseConfig.readOnlyDegraded ||
    status.rolloutFingerprint !== releaseConfig.rolloutFingerprint
  ) {
    reason = "context_v2_rollout_mismatch";
  }
  return { ok: reason === "", reason, status };
};

module.exports = {
  MEMORY_V2_BUILD_FEATURE_KEY,
  MEMORY_V2_DIRTY_ACTIVE_DEV_ENV,
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  MEMORY_V2_RELEASE_SCHEMA,
  MEMORY_V2_REQUIRED_SCHEMA_VERSION,
  constrainMemoryV2ConfigForPlatform,
  createBuildFeatureSnapshot,
  normalizeFeatureFlags,
  projectMemoryV2Status,
  resolveMemoryV2ReleaseConfig,
  rolloutFingerprint,
  validateMemoryV2Status,
};
