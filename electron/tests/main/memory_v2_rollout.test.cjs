const path = require("path");
const {
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  createBuildFeatureSnapshot,
  resolveMemoryV2ReleaseConfig,
  validateMemoryV2Status,
} = require("../../main/services/unchain/memory_v2_rollout");

const UNCHAIN_REVISION = "a".repeat(40);

const packagedConfig = (snapshot) =>
  resolveMemoryV2ReleaseConfig({
    app: { isPackaged: true, getAppPath: () => "/app" },
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(snapshot),
    },
    path,
    environment: {},
  });

describe("Memory V2 release rollout snapshot", () => {
  test("an off build still carries every explicit sidecar setting", () => {
    const snapshot = createBuildFeatureSnapshot({}, {});

    expect(snapshot.enable_memory_v2).toBe(false);
    expect(snapshot[MEMORY_V2_RELEASE_FIELD]).toMatchObject({
      sidecar_environment: {
        [MEMORY_V2_ENV_KEYS.featureCeiling]: "off",
        [MEMORY_V2_ENV_KEYS.rolloutMode]: "off",
        [MEMORY_V2_ENV_KEYS.canaryPercent]: "5",
        [MEMORY_V2_ENV_KEYS.readOnlyDegraded]: "0",
        [MEMORY_V2_ENV_KEYS.storeOwner]: "off",
      },
    });
    expect(snapshot[MEMORY_V2_RELEASE_FIELD].rollout_fingerprint).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(snapshot[MEMORY_V2_RELEASE_FIELD].snapshot_fingerprint).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  test("a packaged canary build resolves only from its frozen snapshot", () => {
    const snapshot = createBuildFeatureSnapshot(
      { enable_memory_v2: true },
      {
        PUPU_FEATURE_MEMORY_V2: "all",
        PUPU_MEMORY_V2_MODE: "canary",
        PUPU_MEMORY_V2_CANARY_PERCENT: "25",
        PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "1",
      },
    );
    const config = resolveMemoryV2ReleaseConfig({
      app: { isPackaged: true, getAppPath: () => "/app" },
      fs: {
        existsSync: () => true,
        readFileSync: () => JSON.stringify(snapshot),
      },
      path,
      environment: {
        PUPU_MEMORY_V2_MODE: "all",
        PUPU_MEMORY_V2_CANARY_PERCENT: "100",
      },
    });

    expect(config).toMatchObject({
      snapshotValid: true,
      buildFeatureEnabled: true,
      featureCeiling: "all",
      configuredMode: "canary",
      effectiveMode: "canary",
      canaryPercent: 25,
      readOnlyDegraded: true,
      sidecarEnvironment: {
        [MEMORY_V2_ENV_KEYS.storeOwner]: "unchain",
      },
    });
  });

  test("the build ceiling alone never activates a packaged rollout", () => {
    const buildFlagOnly = packagedConfig(
      createBuildFeatureSnapshot({ enable_memory_v2: true }, {}),
    );
    const missingMode = packagedConfig(
      createBuildFeatureSnapshot(
        { enable_memory_v2: true },
        { PUPU_FEATURE_MEMORY_V2: "all" },
      ),
    );
    const missingCeiling = packagedConfig(
      createBuildFeatureSnapshot(
        { enable_memory_v2: true },
        { PUPU_MEMORY_V2_MODE: "all" },
      ),
    );

    expect(buildFlagOnly).toMatchObject({
      featureCeiling: "off",
      configuredMode: "off",
      effectiveMode: "off",
    });
    expect(missingMode).toMatchObject({
      featureCeiling: "all",
      configuredMode: "off",
      effectiveMode: "off",
    });
    expect(missingCeiling).toMatchObject({
      featureCeiling: "off",
      configuredMode: "all",
      effectiveMode: "off",
    });
  });

  test("a packaged rollout becomes all only when both controls explicitly allow it", () => {
    const config = packagedConfig(
      createBuildFeatureSnapshot(
        { enable_memory_v2: true },
        {
          PUPU_FEATURE_MEMORY_V2: "all",
          PUPU_MEMORY_V2_MODE: "all",
        },
      ),
    );

    expect(config).toMatchObject({
      featureCeiling: "all",
      configuredMode: "all",
      effectiveMode: "all",
    });
  });

  test("tampering with a packaged rollout fails closed", () => {
    const snapshot = JSON.parse(
      JSON.stringify(
        createBuildFeatureSnapshot(
          { enable_memory_v2: true },
          { PUPU_MEMORY_V2_MODE: "all" },
        ),
      ),
    );
    snapshot[MEMORY_V2_RELEASE_FIELD].sidecar_environment[
      MEMORY_V2_ENV_KEYS.rolloutMode
    ] = "shadow";

    expect(packagedConfig(snapshot)).toMatchObject({
      snapshotValid: false,
      effectiveMode: "off",
      snapshotErrorCode: "memory_v2_release_snapshot_fingerprint_mismatch",
    });
  });

  test("readiness requires matching schema, WAL, lexical state, and rollout", () => {
    const snapshot = createBuildFeatureSnapshot(
      { enable_memory_v2: true },
      {
        PUPU_FEATURE_MEMORY_V2: "all",
        PUPU_MEMORY_V2_MODE: "shadow",
      },
    );
    const config = packagedConfig(snapshot);
    const status = {
      available: true,
      schema_version: 4,
      journal_mode: "wal",
      lexical_backend: "degraded",
      vector_status: "disabled",
      feature_ceiling: config.featureCeiling,
      configured_mode: config.configuredMode,
      rollout_mode: config.effectiveMode,
      canary_percent: config.canaryPercent,
      read_only_degraded: config.readOnlyDegraded,
      rollout_config_valid: true,
      rollout_fingerprint: config.rolloutFingerprint,
      context_memory_capability_ready: true,
      context_memory_capability_reason: "unchain_context_memory_ready",
      context_memory_capability_verification: "exact_sha",
      context_memory_capability_immutable: true,
      unchain_revision: UNCHAIN_REVISION,
      context_memory_contract: 1,
    };

    expect(validateMemoryV2Status(status, config)).toMatchObject({ ok: true });
    expect(
      validateMemoryV2Status({ ...status, schema_version: 2 }, config),
    ).toMatchObject({ ok: false, reason: "context_v2_schema_incompatible" });
    // The gate is EQUALITY, not a floor. v3 is the immediately-previous schema
    // (no candidate_reviews table): a sidecar still on it must degrade, not
    // half-serve the review triad. v5 is likewise refused, so a newer sidecar
    // paired with an older shell degrades instead of guessing.
    expect(
      validateMemoryV2Status({ ...status, schema_version: 3 }, config),
    ).toMatchObject({ ok: false, reason: "context_v2_schema_incompatible" });
    expect(
      validateMemoryV2Status({ ...status, schema_version: 5 }, config),
    ).toMatchObject({ ok: false, reason: "context_v2_schema_incompatible" });
    expect(
      validateMemoryV2Status({ ...status, journal_mode: "delete" }, config),
    ).toMatchObject({ ok: false, reason: "context_v2_wal_required" });
    expect(
      validateMemoryV2Status({ ...status, lexical_backend: "unknown" }, config),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_lexical_backend_incompatible",
    });
    expect(
      validateMemoryV2Status({ ...status, rollout_mode: "all" }, config),
    ).toMatchObject({ ok: false, reason: "context_v2_rollout_mismatch" });
    expect(
      validateMemoryV2Status(
        { ...status, context_memory_capability_ready: false },
        config,
      ),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_unchain_capability_unavailable",
    });
    expect(
      validateMemoryV2Status(
        {
          ...status,
          context_memory_capability_verification: "dev_bypass",
          context_memory_capability_immutable: false,
        },
        config,
      ),
    ).toMatchObject({ ok: true });
    expect(
      validateMemoryV2Status(
        {
          ...status,
          context_memory_capability_verification: "exact_sha",
          context_memory_capability_immutable: false,
        },
        config,
      ),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_unchain_capability_invalid",
    });
  });
});
