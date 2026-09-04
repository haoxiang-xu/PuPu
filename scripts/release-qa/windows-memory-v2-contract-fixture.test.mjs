import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_RUNTIME_PROTOCOLS as ARTIFACT_REQUIRED_PROTOCOLS,
  RUNTIME_MANIFEST_SCHEMA,
} from "./unchain-artifact.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = path.join(
  repoRoot,
  "contracts/memory-v2/windows-required-protocol-and-sink-contract.v1.json",
);
const {
  UNCHAIN_RUNTIME_PROTOCOL_REQUIRED_PROTOCOLS,
  UNCHAIN_RUNTIME_PROTOCOL_SCHEMA,
  createBuildFeatureSnapshot,
  resolveMemoryV2ReleaseConfig,
  validateMemoryV2Status,
} = require("../../electron/main/services/unchain/memory_v2_rollout");
const {
  createVaultSinkExecutor,
  createVaultSinkExecutors,
  parseSupervisorControlFrame,
  VAULT_SINK_KINDS,
} = require("../../electron/main/services/memory_vault/vault_sink_executor");

const sortedUnique = (values) =>
  Array.isArray(values) &&
  values.every((value, index) =>
    typeof value === "string" && value && (index === 0 || values[index - 1] < value),
  );

const readContract = () => {
  const value = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.deepEqual(Object.keys(value).sort(), ["runtime_protocol", "schema", "vault_sink", "version"]);
  assert.equal(
    value.schema,
    "pupu.memory-v2.windows-required-protocol-and-sink-contract.v1",
  );
  assert.equal(value.version, 1);
  assert.deepEqual(
    Object.keys(value.runtime_protocol).sort(),
    ["manifest_schema", "required_protocols"],
  );
  assert.equal(value.runtime_protocol.manifest_schema, RUNTIME_MANIFEST_SCHEMA);
  assert.ok(Array.isArray(value.runtime_protocol.required_protocols));
  assert.ok(value.runtime_protocol.required_protocols.length > 0);
  for (const protocol of value.runtime_protocol.required_protocols) {
    assert.deepEqual(Object.keys(protocol).sort(), ["features", "id", "major", "minimum_minor"]);
    assert.ok(sortedUnique(protocol.features));
    assert.match(protocol.id, /^[a-z][a-z0-9_]*$/);
    assert.equal(protocol.major, 1);
    assert.equal(protocol.minimum_minor, 0);
  }
  assert.ok(sortedUnique(value.vault_sink.recognized_kinds));
  assert.ok(sortedUnique(value.vault_sink.windows.disabled_kinds));
  assert.deepEqual(value.vault_sink.windows.enabled_kinds, []);
  assert.deepEqual(value.vault_sink.windows.unsupported_kinds, ["computer_input"]);
  assert.deepEqual(value.vault_sink.negative_cases, [
    "missing_required_feature",
    "unknown_sink_kind",
    "disabled_windows_sink",
  ]);
  return value;
};

const fixtureProtocolRequirements = (contract) =>
  Object.fromEntries(
    contract.runtime_protocol.required_protocols.map((protocol) => [
      protocol.id,
      protocol.features,
    ]),
  );

const runtimeProtocolManifest = (protocols) => {
  const body = {
    protocols,
    runtime: "unchain",
    schema: UNCHAIN_RUNTIME_PROTOCOL_SCHEMA,
  };
  const digest = crypto
    .createHash("sha256")
    .update("unchain.runtime_protocol_manifest.v1\\u0000", "utf8")
    .update(JSON.stringify(body), "utf8")
    .digest("hex");
  return { manifest_digest: `sha256:${digest}`, ...body };
};

const packagedReleaseConfig = () => {
  const snapshot = createBuildFeatureSnapshot(
    { enable_memory_v2: true },
    {
      PUPU_FEATURE_MEMORY_V2: "all",
      PUPU_MEMORY_V2_MODE: "shadow",
    },
  );
  return resolveMemoryV2ReleaseConfig({
    app: { isPackaged: true, getAppPath: () => "/app" },
    environment: {},
    fs: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(snapshot),
    },
    path,
  });
};

const statusFor = (releaseConfig, manifest) => ({
  available: true,
  canary_percent: releaseConfig.canaryPercent,
  configured_mode: releaseConfig.configuredMode,
  feature_ceiling: releaseConfig.featureCeiling,
  journal_mode: "wal",
  lexical_backend: "degraded",
  read_only_degraded: releaseConfig.readOnlyDegraded,
  rollout_config_valid: true,
  rollout_fingerprint: releaseConfig.rolloutFingerprint,
  rollout_mode: releaseConfig.effectiveMode,
  runtime_protocol_immutable: true,
  runtime_protocol_manifest: manifest,
  runtime_protocol_ready: true,
  runtime_protocol_reason: "unchain_runtime_protocol_compatible",
  runtime_protocol_verification: "runtime_protocol",
  schema_version: 2,
  store_owner: "unchain",
  unchain_revision: "fixture-only",
  unchain_runtime_source: "fixture-only",
  vector_status: "disabled",
});

test("W0-04 Node parser consumes the versioned protocol and Windows sink fixture", () => {
  const contract = readContract();
  const requirements = fixtureProtocolRequirements(contract);
  const electronRequirements = Object.fromEntries(
    UNCHAIN_RUNTIME_PROTOCOL_REQUIRED_PROTOCOLS.map((protocol) => [
      protocol.id,
      [...protocol.features],
    ]),
  );

  assert.equal(UNCHAIN_RUNTIME_PROTOCOL_SCHEMA, RUNTIME_MANIFEST_SCHEMA);
  assert.deepEqual(electronRequirements, requirements);
  assert.deepEqual(ARTIFACT_REQUIRED_PROTOCOLS, requirements);
  assert.deepEqual([...VAULT_SINK_KINDS].sort(), contract.vault_sink.recognized_kinds);
});

test("W0-04 fixture negative cases reject missing features, unknown sinks, and all Windows sinks", async () => {
  const contract = readContract();
  const requirements = contract.runtime_protocol.required_protocols.map((protocol) => ({
    features: [...protocol.features],
    id: protocol.id,
    major: protocol.major,
    minor: protocol.minimum_minor,
  }));
  const contextMemory = requirements.find(({ id }) => id === "context_memory");
  const missingFeature = "tool_output_management_v1";
  contextMemory.features = contextMemory.features.filter(
    (feature) => feature !== missingFeature,
  );
  const releaseConfig = packagedReleaseConfig();

  assert.equal(
    validateMemoryV2Status(
      statusFor(releaseConfig, runtimeProtocolManifest(requirements)),
      releaseConfig,
    ).reason,
    "context_v2_unchain_protocol_incompatible",
  );

  let spawnCount = 0;
  const windowsRegistry = createVaultSinkExecutors({
    args: ["-e", "process.exit(0)"],
    command: process.execPath,
    dataDir: "/tmp/pupu-w0-contract",
    environmentSource: {},
    platform: "win32",
    spawn: () => {
      spawnCount += 1;
      throw new Error("must not spawn");
    },
  });
  assert.deepEqual(Object.keys(windowsRegistry.providers), []);
  assert.equal(spawnCount, 0);

  const unknownSinkExecutor = createVaultSinkExecutor({
    args: ["-e", "process.exit(0)"],
    command: process.execPath,
    dataDir: "/tmp/pupu-w0-contract",
    environmentSource: {},
    platform: "darwin",
    spawn: () => {
      spawnCount += 1;
      throw new Error("must not spawn");
    },
  });
  await assert.rejects(
    unknownSinkExecutor.prepare({ sinkKind: "not_a_contract_sink" }),
    (error) => error?.code === "vault_invalid_request",
  );
  assert.equal(spawnCount, 0);
  assert.deepEqual(contract.vault_sink.negative_cases, [
    "missing_required_feature",
    "unknown_sink_kind",
    "disabled_windows_sink",
  ]);
});

test("W1-06 Windows registry exposes no provider before W0/W2 capability evidence", () => {
  const contract = readContract();
  let spawnCount = 0;
  const registry = createVaultSinkExecutors({
    args: ["-e", "process.exit(0)"],
    command: process.execPath,
    dataDir: "/tmp/pupu-w1-contract",
    environmentSource: {},
    platform: "win32",
    spawn: () => {
      spawnCount += 1;
      throw new Error("must not spawn");
    },
    windowsSinkCapability: {
      containment: "win32_job_list_v1",
      enabled_sink_kinds: [...contract.vault_sink.windows.enabled_kinds],
      protocol: contract.vault_sink.worker_protocol_version,
    },
  });

  assert.deepEqual(Object.keys(registry.providers), []);
  assert.equal(spawnCount, 0);
  for (const sinkKind of contract.vault_sink.recognized_kinds) {
    assert.equal(registry.providers[sinkKind], undefined);
  }
});

test("W2-02 Electron strictly consumes Python supervisor control frames", () => {
  const serverRoot = path.join(repoRoot, "unchain_runtime/server");
  const produce = (expression) => {
    const result = spawnSync(
      process.env.PYTHON || "python3",
      [
        "-c",
        `from vault_sink_job_supervisor import error_control_frame, ready_control_frame; import sys; sys.stdout.buffer.write(${expression})`,
      ],
      { cwd: serverRoot, encoding: null },
    );
    assert.equal(result.status, 0, result.stderr?.toString("utf8"));
    return result.stdout;
  };

  assert.deepEqual(parseSupervisorControlFrame(produce("ready_control_frame()")), {
    kind: "ready",
  });
  assert.deepEqual(
    parseSupervisorControlFrame(
      produce('error_control_frame("vault_worker_job_setup_failed")'),
    ),
    { code: "vault_worker_job_setup_failed", kind: "error" },
  );
});
