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
const UNCHAIN_RUNTIME_PROTOCOL_SCHEMA = "unchain.runtime_protocol_manifest.v1";
const UNCHAIN_RUNTIME_PROTOCOL_DIGEST_DOMAIN =
  "unchain.runtime_protocol_manifest.v1\\u0000";
const UNCHAIN_RUNTIME_PROTOCOL_TOP_LEVEL_KEYS = Object.freeze([
  "manifest_digest",
  "protocols",
  "runtime",
  "schema",
]);
const UNCHAIN_RUNTIME_PROTOCOL_ITEM_KEYS = Object.freeze([
  "features",
  "id",
  "major",
  "minor",
]);
const UNCHAIN_RUNTIME_PROTOCOL_REQUIRED_PROTOCOLS = Object.freeze([
  Object.freeze({
    features: Object.freeze([
      "artifact_handoff",
      "canonical_journal",
      "chat_deletion_sqlite_scope_closure",
      "context_compiler",
      "generation_rebase_live_interaction_cycles",
      "interaction_resolution_compat",
      "long_term_promotion",
      "memory_curator",
      "memory_toolkit",
      "memory_workspace",
    ]),
    id: "context_memory",
    major: 1,
    minimumMinor: 0,
  }),
  Object.freeze({
    features: Object.freeze([
      "cancel_pending",
      "expected_interaction_id_cas",
      "fresh_run_lineage",
      "host_controlled_resume",
    ]),
    id: "durable_interaction",
    major: 1,
    minimumMinor: 0,
  }),
  Object.freeze({
    features: Object.freeze([
      "atomic_receipt_cas",
      "auxiliary_calls",
      "enforce_mode",
      "graph_runs",
      "memory_off",
      "subagent_runs",
    ]),
    id: "provider_turn_ownership",
    major: 1,
    minimumMinor: 0,
  }),
  Object.freeze({
    features: Object.freeze([
      "canonical_metrics",
      "completion_diagnostics_ref",
      "continuation_claim",
      "immutable_pricing_snapshot",
      "provider_call_set_union",
      "provider_call_usage_v1",
      "run_bundle_v1",
    ]),
    id: "run_bundle",
    major: 1,
    minimumMinor: 0,
  }),
]);
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

const hasExactKeys = (value, expectedKeys) => {
  if (!isObject(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
};

const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const isCanonicalString = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  Buffer.from(value, "utf8").toString("utf8") === value &&
  value === value.normalize("NFC");

const isStrictlySortedUnique = (values) =>
  values.every(
    (value, index) => index === 0 || compareUtf8(values[index - 1], value) < 0,
  );

const parseRuntimeProtocolManifest = (value) => {
  if (!hasExactKeys(value, UNCHAIN_RUNTIME_PROTOCOL_TOP_LEVEL_KEYS)) {
    return null;
  }
  if (
    value.schema !== UNCHAIN_RUNTIME_PROTOCOL_SCHEMA ||
    value.runtime !== "unchain" ||
    !Array.isArray(value.protocols) ||
    !/^sha256:[0-9a-f]{64}$/.test(value.manifest_digest)
  ) {
    return null;
  }

  const protocols = [];
  for (const candidate of value.protocols) {
    if (
      !hasExactKeys(candidate, UNCHAIN_RUNTIME_PROTOCOL_ITEM_KEYS) ||
      !isCanonicalString(candidate.id) ||
      !Number.isSafeInteger(candidate.major) ||
      candidate.major < 0 ||
      !Number.isSafeInteger(candidate.minor) ||
      candidate.minor < 0 ||
      !Array.isArray(candidate.features) ||
      !candidate.features.every(isCanonicalString) ||
      !isStrictlySortedUnique(candidate.features)
    ) {
      return null;
    }
    protocols.push({
      features: [...candidate.features],
      id: candidate.id,
      major: candidate.major,
      minor: candidate.minor,
    });
  }
  if (!isStrictlySortedUnique(protocols.map(({ id }) => id))) {
    return null;
  }

  const body = {
    protocols,
    runtime: "unchain",
    schema: UNCHAIN_RUNTIME_PROTOCOL_SCHEMA,
  };
  const expectedDigest = `sha256:${sha256(
    `${UNCHAIN_RUNTIME_PROTOCOL_DIGEST_DOMAIN}${JSON.stringify(body)}`,
  )}`;
  if (value.manifest_digest !== expectedDigest) {
    return null;
  }
  return {
    manifest_digest: expectedDigest,
    ...body,
  };
};

const isRuntimeProtocolCompatible = (manifest) => {
  const byId = new Map(
    manifest.protocols.map((protocol) => [protocol.id, protocol]),
  );
  return UNCHAIN_RUNTIME_PROTOCOL_REQUIRED_PROTOCOLS.every((required) => {
    const protocol = byId.get(required.id);
    return (
      protocol != null &&
      protocol.major === required.major &&
      protocol.minor >= required.minimumMinor &&
      required.features.every((feature) => protocol.features.includes(feature))
    );
  });
};

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
  runtimeProtocolReady: payload?.runtime_protocol_ready === true,
  runtimeProtocolReason:
    typeof payload?.runtime_protocol_reason === "string"
      ? payload.runtime_protocol_reason
      : "",
  runtimeProtocolVerification:
    typeof payload?.runtime_protocol_verification === "string"
      ? payload.runtime_protocol_verification
      : "",
  runtimeProtocolImmutable: payload?.runtime_protocol_immutable === true,
  runtimeProtocolManifest: payload?.runtime_protocol_manifest ?? null,
  unchainRevision:
    typeof payload?.unchain_revision === "string"
      ? payload.unchain_revision.trim()
      : "",
  unchainRuntimeSource:
    typeof payload?.unchain_runtime_source === "string"
      ? payload.unchain_runtime_source.trim()
      : "",
});

const validateMemoryV2Status = (payload, releaseConfig) => {
  const status = projectMemoryV2Status(payload);
  const manifest = parseRuntimeProtocolManifest(status.runtimeProtocolManifest);
  let reason = "";
  if (manifest === null) {
    reason = "context_v2_unchain_protocol_invalid";
  } else if (!isRuntimeProtocolCompatible(manifest)) {
    reason = "context_v2_unchain_protocol_incompatible";
  } else if (
    !status.runtimeProtocolReady ||
    status.runtimeProtocolReason !== "unchain_runtime_protocol_compatible" ||
    status.runtimeProtocolVerification !== "runtime_protocol" ||
    !status.runtimeProtocolImmutable
  ) {
    reason = "context_v2_unchain_protocol_invalid";
  } else if (!status.available) reason = "context_v2_unavailable";
  else if (status.storeOwner !== "unchain") {
    reason = "context_v2_store_owner_incompatible";
  } else if (status.schemaVersion !== MEMORY_V2_REQUIRED_SCHEMA_VERSION) {
    reason = "context_v2_schema_incompatible";
  } else if (status.journalMode !== "wal") {
    reason = "context_v2_wal_required";
  } else if (!MEMORY_V2_ALLOWED_LEXICAL_BACKENDS.has(status.lexicalBackend)) {
    reason = "context_v2_lexical_backend_incompatible";
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
  if (manifest !== null) {
    status.runtimeProtocolManifest = manifest;
  }
  return { ok: reason === "", reason, status };
};

module.exports = {
  MEMORY_V2_BUILD_FEATURE_KEY,
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  MEMORY_V2_RELEASE_SCHEMA,
  MEMORY_V2_REQUIRED_SCHEMA_VERSION,
  UNCHAIN_RUNTIME_PROTOCOL_REQUIRED_PROTOCOLS,
  UNCHAIN_RUNTIME_PROTOCOL_SCHEMA,
  constrainMemoryV2ConfigForPlatform,
  createBuildFeatureSnapshot,
  normalizeFeatureFlags,
  projectMemoryV2Status,
  resolveMemoryV2ReleaseConfig,
  rolloutFingerprint,
  validateMemoryV2Status,
};
