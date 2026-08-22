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
try {
  snapshot = readBuildFeatureFlagsSnapshot();
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
}

process.exit(result.status || 0);
