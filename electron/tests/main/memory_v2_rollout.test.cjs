const { createHash } = require("crypto");
const path = require("path");
const {
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  createBuildFeatureSnapshot,
  projectMemoryV2Status,
  resolveMemoryV2ReleaseConfig,
  validateMemoryV2Status,
} = require("../../main/services/unchain/memory_v2_rollout");

const RUNTIME_PROTOCOL_SCHEMA = "unchain.runtime_protocol_manifest.v1";
const RUNTIME_PROTOCOL_DIGEST_DOMAIN =
  "unchain.runtime_protocol_manifest.v1\\u0000";
const REQUIRED_PROTOCOLS = Object.freeze([
  Object.freeze({
    id: "context_memory",
    major: 1,
    minor: 0,
    features: Object.freeze([
      "artifact_handoff",
      "canonical_journal",
      "chat_deletion_sqlite_scope_closure",
      "context_compiler",
      "interaction_resolution_compat",
      "long_term_promotion",
      "memory_curator",
      "memory_toolkit",
      "memory_workspace",
    ]),
  }),
  Object.freeze({
    id: "durable_interaction",
    major: 1,
    minor: 0,
    features: Object.freeze([
      "cancel_pending",
      "expected_interaction_id_cas",
      "fresh_run_lineage",
      "host_controlled_resume",
    ]),
  }),
  Object.freeze({
    id: "provider_turn_ownership",
    major: 1,
    minor: 0,
    features: Object.freeze([
      "atomic_receipt_cas",
      "auxiliary_calls",
      "enforce_mode",
      "graph_runs",
      "memory_off",
      "subagent_runs",
    ]),
  }),
  Object.freeze({
    id: "run_bundle",
    major: 1,
    minor: 0,
    features: Object.freeze([
      "canonical_metrics",
      "completion_diagnostics_ref",
      "continuation_claim",
      "immutable_pricing_snapshot",
      "provider_call_set_union",
      "provider_call_usage_v1",
      "run_bundle_v1",
    ]),
  }),
]);

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

const cloneProtocols = (protocols = REQUIRED_PROTOCOLS) =>
  protocols.map((protocol) => ({
    features: [...protocol.features],
    id: protocol.id,
    major: protocol.major,
    minor: protocol.minor,
  }));

const runtimeProtocolManifest = (protocols = REQUIRED_PROTOCOLS) => {
  const normalizedProtocols = cloneProtocols(protocols);
  const body = {
    protocols: normalizedProtocols,
    runtime: "unchain",
    schema: RUNTIME_PROTOCOL_SCHEMA,
  };
  const digest = createHash("sha256")
    .update(RUNTIME_PROTOCOL_DIGEST_DOMAIN, "utf8")
    .update(JSON.stringify(body), "utf8")
    .digest("hex");
  return {
    manifest_digest: `sha256:${digest}`,
    ...body,
  };
};

const statusFor = (config, overrides = {}) => ({
  available: true,
  store_owner: "unchain",
  schema_version: 2,
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
  runtime_protocol_ready: true,
  runtime_protocol_reason: "unchain_runtime_protocol_compatible",
  runtime_protocol_verification: "runtime_protocol",
  runtime_protocol_immutable: true,
  runtime_protocol_manifest: runtimeProtocolManifest(),
  unchain_revision: "revision-is-telemetry-only",
  unchain_runtime_source: "installed-wheel",
  ...overrides,
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
    expect(config).not.toHaveProperty("allowDirtyUnchainActiveDev");
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
});

describe("Memory V2 runtime protocol admission", () => {
  const config = packagedConfig(
    createBuildFeatureSnapshot(
      { enable_memory_v2: true },
      {
        PUPU_FEATURE_MEMORY_V2: "all",
        PUPU_MEMORY_V2_MODE: "shadow",
      },
    ),
  );

  test("accepts the compatible manifest independently of revision telemetry", () => {
    const status = statusFor(config);

    expect(projectMemoryV2Status(status)).toMatchObject({
      storeOwner: "unchain",
      schemaVersion: 2,
      runtimeProtocolReady: true,
      runtimeProtocolReason: "unchain_runtime_protocol_compatible",
      runtimeProtocolVerification: "runtime_protocol",
      runtimeProtocolImmutable: true,
      unchainRevision: "revision-is-telemetry-only",
      unchainRuntimeSource: "installed-wheel",
    });
    expect(validateMemoryV2Status(status, config)).toMatchObject({
      ok: true,
      reason: "",
    });
    expect(
      validateMemoryV2Status(
        {
          ...status,
          unchain_revision: "a-different-non-sha-revision",
          unchain_runtime_source: "editable-source",
        },
        config,
      ),
    ).toMatchObject({ ok: true, reason: "" });
    expect(
      validateMemoryV2Status(
        { ...status, unchain_revision: "", unchain_runtime_source: "" },
        config,
      ),
    ).toMatchObject({ ok: true, reason: "" });
  });

  test("accepts higher minor, extra optional features, and extra protocols", () => {
    const protocols = cloneProtocols();
    protocols[0].minor = Number.MAX_SAFE_INTEGER;
    protocols[0].features.push("optional_future_feature ");
    protocols.push({
      features: ["optional_feature"],
      id: "z_optional_protocol",
      major: 99,
      minor: 0,
    });

    expect(
      validateMemoryV2Status(
        statusFor(config, {
          runtime_protocol_manifest: runtimeProtocolManifest(protocols),
        }),
        config,
      ),
    ).toMatchObject({ ok: true, reason: "" });
  });

  test.each([
    ["missing manifest", null],
    [
      "unknown manifest field",
      { ...runtimeProtocolManifest(), extension: true },
    ],
    [
      "unknown protocol item field",
      (() => {
        const manifest = runtimeProtocolManifest();
        manifest.protocols[0].extension = true;
        return manifest;
      })(),
    ],
    [
      "digest mutation",
      {
        ...runtimeProtocolManifest(),
        manifest_digest: `sha256:${"0".repeat(64)}`,
      },
    ],
    [
      "out-of-order protocols with a recomputed digest",
      runtimeProtocolManifest([...cloneProtocols()].reverse()),
    ],
    [
      "duplicate protocol id with a recomputed digest",
      (() => {
        const protocols = cloneProtocols();
        protocols.splice(1, 0, {
          ...protocols[0],
          features: [...protocols[0].features],
        });
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "duplicate feature with a recomputed digest",
      (() => {
        const protocols = cloneProtocols();
        protocols[0].features.splice(1, 0, protocols[0].features[0]);
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "non-NFC feature with a recomputed digest",
      (() => {
        const protocols = cloneProtocols();
        protocols[0].features.push("future_e\u0301");
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "unpaired surrogate feature with a recomputed digest",
      (() => {
        const protocols = cloneProtocols();
        protocols[0].features.push("\ud800");
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "unpaired surrogate protocol id with a recomputed digest",
      (() => {
        const protocols = cloneProtocols();
        protocols.push({
          features: ["optional_feature"],
          id: "\ud800",
          major: 1,
          minor: 0,
        });
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "negative minor below the supported floor",
      (() => {
        const protocols = cloneProtocols();
        protocols[0].minor = -1;
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "boolean major",
      (() => {
        const protocols = cloneProtocols();
        protocols[0].major = true;
        return runtimeProtocolManifest(protocols);
      })(),
    ],
    [
      "minor above the cross-language safe integer ceiling",
      (() => {
        const protocols = cloneProtocols();
        protocols[0].minor = Number.MAX_SAFE_INTEGER + 1;
        return runtimeProtocolManifest(protocols);
      })(),
    ],
  ])("rejects malformed closed manifests: %s", (_label, manifest) => {
    expect(
      validateMemoryV2Status(
        statusFor(config, { runtime_protocol_manifest: manifest }),
        config,
      ),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_unchain_protocol_invalid",
    });
  });

  test.each([
    ["chat_deletion_sqlite_scope_closure", "context_memory"],
    ["interaction_resolution_compat", "context_memory"],
    ["expected_interaction_id_cas", "durable_interaction"],
  ])("requires incident compatibility feature %s", (feature, protocolId) => {
    const protocols = cloneProtocols();
    const protocol = protocols.find((item) => item.id === protocolId);
    protocol.features = protocol.features.filter((item) => item !== feature);

    expect(
      validateMemoryV2Status(
        statusFor(config, {
          runtime_protocol_manifest: runtimeProtocolManifest(protocols),
          unchain_revision: "same-revision-cannot-rescue-incompatibility",
        }),
        config,
      ),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_unchain_protocol_incompatible",
    });
  });

  test.each([
    [
      "missing required protocol",
      () => cloneProtocols().filter(({ id }) => id !== "run_bundle"),
    ],
    [
      "wrong major",
      () => {
        const protocols = cloneProtocols();
        protocols[0].major = 2;
        return protocols;
      },
    ],
    [
      "missing existing required feature",
      () => {
        const protocols = cloneProtocols();
        protocols[3].features = protocols[3].features.filter(
          (feature) => feature !== "run_bundle_v1",
        );
        return protocols;
      },
    ],
  ])("rejects incompatible protocols: %s", (_label, mutate) => {
    expect(
      validateMemoryV2Status(
        statusFor(config, {
          runtime_protocol_manifest: runtimeProtocolManifest(mutate()),
        }),
        config,
      ),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_unchain_protocol_incompatible",
    });
  });

  test.each([
    ["runtime_protocol_ready", false],
    ["runtime_protocol_reason", "unchain_revision_mismatch"],
    ["runtime_protocol_verification", "revision_gate"],
    ["runtime_protocol_immutable", false],
  ])("rejects an inconsistent sidecar success tuple field %s", (key, value) => {
    expect(
      validateMemoryV2Status(statusFor(config, { [key]: value }), config),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_unchain_protocol_invalid",
    });
  });

  test("still requires matching store, schema, WAL, lexical state, and rollout", () => {
    const status = statusFor(config);

    expect(
      validateMemoryV2Status(
        { ...status, store_owner: "pupu_legacy", schema_version: 4 },
        config,
      ),
    ).toMatchObject({
      ok: false,
      reason: "context_v2_store_owner_incompatible",
    });
    expect(
      validateMemoryV2Status({ ...status, schema_version: 3 }, config),
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
  });
});
