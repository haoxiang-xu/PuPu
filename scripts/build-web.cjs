#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SNAPSHOT_PATH = path.join(
  ROOT_DIR,
  ".local",
  "build_feature_flags.snapshot.json",
);
const REACT_SCRIPTS_BUILD_PATH = path.join(
  ROOT_DIR,
  "node_modules",
  "react-scripts",
  "scripts",
  "build.js",
);

const readBuildFeatureFlagsSnapshot = () => {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, value === true]),
    );
  } catch (error) {
    console.warn(
      `[build:web] Failed to read feature flag snapshot at ${SNAPSHOT_PATH}: ${error.message}`,
    );
    return {};
  }
};

const printFlagsOnly = process.argv.includes("--print-flags");
const buildFeatureFlags = readBuildFeatureFlagsSnapshot();
const serializedFlags = JSON.stringify(buildFeatureFlags);

if (printFlagsOnly) {
  console.log(serializedFlags);
  process.exit(0);
}

console.log(
  `[build:web] Using build feature flags: ${serializedFlags} ${
    fs.existsSync(SNAPSHOT_PATH) ? `(from ${SNAPSHOT_PATH})` : "(snapshot not found; using defaults)"
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

process.exit(result.status || 0);
