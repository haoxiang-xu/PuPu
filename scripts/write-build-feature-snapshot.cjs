#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  createBuildFeatureSnapshot,
  MEMORY_V2_ENV_KEYS,
  MEMORY_V2_RELEASE_FIELD,
  normalizeFeatureFlags,
} = require("../electron/main/services/unchain/memory_v2_rollout");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PATH = path.join(ROOT_DIR, ".local", "build_feature_flags.snapshot.json");

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
};

const outPath = valueAfter("--out")
  ? path.resolve(ROOT_DIR, valueAfter("--out"))
  : DEFAULT_PATH;
const rawFlags = valueAfter("--feature-flags") || "{}";
const profilePath = valueAfter("--profile");
if (profilePath && process.argv.includes("--feature-flags")) {
  console.error("[build:snapshot] use either --profile or --feature-flags, not both");
  process.exit(1);
}

const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

let profile = null;
if (profilePath) {
  const resolvedProfilePath = path.resolve(ROOT_DIR, profilePath);
  try {
    profile = JSON.parse(fs.readFileSync(resolvedProfilePath, "utf8"));
    const environmentKeys = Object.values(MEMORY_V2_ENV_KEYS);
    if (
      !exactKeys(profile, ["feature_flags", "schema", "sidecar_environment"]) ||
      profile.schema !== "pupu.memory-v2-release-profile.v1" ||
      !exactKeys(profile.feature_flags, ["enable_memory_v2"]) ||
      profile.feature_flags.enable_memory_v2 !== true ||
      !exactKeys(profile.sidecar_environment, environmentKeys) ||
      !environmentKeys.every(
        (key) => typeof profile.sidecar_environment[key] === "string",
      )
    ) {
      throw new Error("profile has an invalid schema or Memory V2 environment");
    }
  } catch (error) {
    console.error(`[build:snapshot] invalid --profile at ${resolvedProfilePath}: ${error.message}`);
    process.exit(1);
  }
}

let featureFlags;
try {
  featureFlags = profile ? profile.feature_flags : JSON.parse(rawFlags);
  if (!featureFlags || typeof featureFlags !== "object" || Array.isArray(featureFlags)) {
    throw new Error("feature flags must be an object");
  }
} catch (error) {
  console.error(`[build:snapshot] invalid --feature-flags JSON: ${error.message}`);
  process.exit(1);
}

const snapshot = createBuildFeatureSnapshot(
  normalizeFeatureFlags(featureFlags),
  profile ? profile.sidecar_environment : process.env,
);
if (
  profile &&
  JSON.stringify(snapshot[MEMORY_V2_RELEASE_FIELD].sidecar_environment) !==
    JSON.stringify(profile.sidecar_environment)
) {
  console.error("[build:snapshot] profile Memory V2 environment is not canonical");
  process.exit(1);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`[build:snapshot] wrote ${outPath}`);
