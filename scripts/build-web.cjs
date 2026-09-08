#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  createBuildFeatureSnapshot,
  normalizeFeatureFlags,
} = require("../electron/main/services/unchain/memory_v2_rollout");

const ROOT_DIR = path.resolve(__dirname, "..");
const SNAPSHOT_PATH = process.env.PUPU_BUILD_FEATURE_SNAPSHOT_PATH
  ? path.resolve(ROOT_DIR, process.env.PUPU_BUILD_FEATURE_SNAPSHOT_PATH)
  : path.join(ROOT_DIR, ".local", "build_feature_flags.snapshot.json");
const RUNTIME_SNAPSHOT_PATH = path.join(
  ROOT_DIR,
  "build",
  "build_feature_flags.json",
);
const RUNTIME_UNCHAIN_ARTIFACT_IDENTITY_PATH = path.join(
  ROOT_DIR,
  "build",
  "unchain-artifact-identity.v1.json",
);
const UNCHAIN_ARTIFACT_IDENTITY_STAGING_PATH = process.env.PUPU_UNCHAIN_ARTIFACT_IDENTITY_PATH
  ? path.resolve(ROOT_DIR, process.env.PUPU_UNCHAIN_ARTIFACT_IDENTITY_PATH)
  : path.join(ROOT_DIR, ".local", "unchain-artifact-identity.v1.json");
const REACT_SCRIPTS_BUILD_PATH = path.join(
  ROOT_DIR,
  "node_modules",
  "react-scripts",
  "scripts",
  "build.js",
);

const requireSnapshot =
  process.env.PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT === "1" ||
  process.env.PUPU_VERSION_PREPARED === "1";

const readRuntimeUnchainArtifactIdentity = () => {
  // The sealed sidecar identity is consumed only by packaged Windows startup.
  // Other platform builds receive the same wheel evidence but do not create a
  // Windows .exe, so they must not require its staged hash record.
  if (process.platform !== "win32") return null;
  const evidencePath = String(process.env.UNCHAIN_ARTIFACT_EVIDENCE_PATH || "").trim();
  const sha256 = /^sha256:[0-9a-f]{64}$/;
  const normalize = (value) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify([
          "runtime_manifest_digest",
          "schema",
          "sidecar_sha256",
          "unchain_wheel_sha256",
        ]) ||
      value.schema !== "pupu.windows-unchain-artifact-identity.v1" ||
      !sha256.test(String(value.runtime_manifest_digest || "")) ||
      !sha256.test(String(value.sidecar_sha256 || "")) ||
      !sha256.test(String(value.unchain_wheel_sha256 || ""))
    ) {
      throw new Error("artifact identity has an invalid closed shape");
    }
    return {
      runtime_manifest_digest: value.runtime_manifest_digest,
      schema: value.schema,
      sidecar_sha256: value.sidecar_sha256,
      unchain_wheel_sha256: value.unchain_wheel_sha256,
    };
  };
  if (!evidencePath) {
    if (!fs.existsSync(UNCHAIN_ARTIFACT_IDENTITY_STAGING_PATH)) return null;
    try {
      return normalize(JSON.parse(fs.readFileSync(UNCHAIN_ARTIFACT_IDENTITY_STAGING_PATH, "utf8")));
    } catch (error) {
      throw new Error(
        `Unchain artifact identity is invalid at ${UNCHAIN_ARTIFACT_IDENTITY_STAGING_PATH}: ${error.message}`,
      );
    }
  }
  try {
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const artifact = evidence?.artifact;
    const manifest = evidence?.runtime_manifest;
    if (
      evidence?.schema !== "pupu.release.unchain-artifact.v1" ||
      !sha256.test(String(artifact?.sha256 || "")) ||
      !sha256.test(String(manifest?.manifest_digest || ""))
    ) {
      throw new Error("evidence does not contain a valid immutable artifact identity");
    }
    if (!fs.existsSync(UNCHAIN_ARTIFACT_IDENTITY_STAGING_PATH)) {
      throw new Error("evidence is missing its staged sidecar identity");
    }
    const staged = normalize(
      JSON.parse(fs.readFileSync(UNCHAIN_ARTIFACT_IDENTITY_STAGING_PATH, "utf8")),
    );
    if (
      staged.runtime_manifest_digest !== manifest.manifest_digest ||
      staged.unchain_wheel_sha256 !== artifact.sha256
    ) {
      throw new Error("staged sidecar identity does not match artifact evidence");
    }
    return staged;
  } catch (error) {
    throw new Error(`Unchain artifact identity is invalid at ${evidencePath}: ${error.message}`);
  }
};

const readBuildFeatureFlagsSnapshot = () => {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    if (requireSnapshot) {
      throw new Error(
        `Build feature flag snapshot is required but missing: ${SNAPSHOT_PATH}`,
      );
    }
    return { loaded: false, source: {} };
  }

  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("snapshot must be an object");
    }

    return { loaded: true, source: parsed };
  } catch (error) {
    if (requireSnapshot) {
      throw new Error(
        `Build feature flag snapshot is invalid at ${SNAPSHOT_PATH}: ${error.message}`,
      );
    }
    console.warn(`[build:web] Failed to read feature flag snapshot at ${SNAPSHOT_PATH}: ${error.message}`);
    return { loaded: false, source: {} };
  }
};

const printFlagsOnly = process.argv.includes("--print-flags");
let snapshot;
let runtimeUnchainArtifactIdentity;
try {
  snapshot = readBuildFeatureFlagsSnapshot();
  runtimeUnchainArtifactIdentity = readRuntimeUnchainArtifactIdentity();
} catch (error) {
  console.error(`[build:web] ${error.message}`);
  process.exit(1);
}
const buildFeatureFlags = normalizeFeatureFlags(snapshot.source);
const serializedFlags = JSON.stringify(buildFeatureFlags);
const runtimeSnapshot = createBuildFeatureSnapshot(
  snapshot.source,
  snapshot.loaded ? {} : process.env,
);

if (printFlagsOnly) {
  console.log(serializedFlags);
  process.exit(0);
}

console.log(
  `[build:web] Using build feature flags: ${serializedFlags} ${
    snapshot.loaded ? `(from ${SNAPSHOT_PATH})` : "(snapshot not found; using local defaults)"
  }`,
);

const result = spawnSync(process.execPath, [REACT_SCRIPTS_BUILD_PATH], {
  cwd: ROOT_DIR,
  stdio: "inherit",
  env: {
    ...process.env,
    REACT_APP_BUILD_FEATURE_FLAGS: serializedFlags,
  },
});

if (result.error) {
  console.error(`[build:web] Failed to start react-scripts build: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0) {
  fs.writeFileSync(
    RUNTIME_SNAPSHOT_PATH,
    `${JSON.stringify(runtimeSnapshot, null, 2)}\n`,
    "utf-8",
  );
  if (runtimeUnchainArtifactIdentity) {
    fs.writeFileSync(
      RUNTIME_UNCHAIN_ARTIFACT_IDENTITY_PATH,
      `${JSON.stringify(runtimeUnchainArtifactIdentity, null, 2)}\n`,
      "utf-8",
    );
  }
}

process.exit(result.status || 0);
