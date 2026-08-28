import crypto from "node:crypto";
import fs from "node:fs";

export const RELEASE_BOOTSTRAP_POLICY_SCHEMA = "pupu.release-bootstrap-policy.v1";
export const RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA = "pupu.release-bootstrap-qualification.v1";
export const LEGACY_RELEASE_PROJECTION_SCHEMA = "pupu.legacy-release-projection.v1";
export const RELEASE_BOOTSTRAP_BASELINE_TAG = "v0.1.10";
export const RELEASE_BOOTSTRAP_CONFIRMATION = "BOOTSTRAP_V0_1_10";
export const RELEASE_BOOTSTRAP_WORKFLOW_PATH = ".github/workflows/release-bootstrap-qualification.yml";
export const RELEASE_UPDATE_WORKFLOW_PATH = ".github/workflows/release-qualification.yml";

const POLICY_DIGEST_DOMAIN = "pupu.release-bootstrap-policy.v1\0";
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const STABLE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const EXPECTED_FRESH_TARGETS = Object.freeze([
  "linux-x64",
  "macos-arm64",
  "macos-x64",
  "windows-x64",
]);
const UTF8_COMPARE = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(UTF8_COMPARE);
  const canonical = [...expected].sort(UTF8_COMPARE);
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw new Error(`${label} keys must be exactly ${canonical.join(", ")}`);
  }
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const requiredSafeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
};

const sortedUniqueStrings = (value, label) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const actual = value.map((entry, index) => requiredString(entry, `${label}[${index}]`));
  const canonical = [...new Set(actual)].sort(UTF8_COMPARE);
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw new Error(`${label} must be sorted and unique`);
  }
  return actual;
};

const canonicalJson = (value, label = "value") => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) return value.map((entry, index) => canonicalJson(entry, `${label}[${index}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort(UTF8_COMPARE)
      .map((key) => [key, canonicalJson(value[key], `${label}.${key}`)]));
  }
  throw new Error(`${label} contains a non-canonical JSON value`);
};

const validateLegacyAssets = (assets, label) => {
  if (!Array.isArray(assets) || assets.length === 0) throw new Error(`${label} must be a non-empty array`);
  const names = [];
  for (const [index, asset] of assets.entries()) {
    exactKeys(asset, ["digest", "id", "name", "size"], `${label}[${index}]`);
    requiredSafeInteger(asset.id, `${label}[${index}].id`);
    requiredSafeInteger(asset.size, `${label}[${index}].size`);
    const name = requiredString(asset.name, `${label}[${index}].name`);
    if (!SHA256_PATTERN.test(asset.digest || "")) throw new Error(`${label}[${index}].digest must be SHA-256`);
    names.push(name);
  }
  const canonical = [...new Set(names)].sort(UTF8_COMPARE);
  if (JSON.stringify(names) !== JSON.stringify(canonical)) throw new Error(`${label} must be sorted by unique name`);
};

const validateLegacyRelease = (release, label) => {
  exactKeys(release, ["assets", "draft", "prerelease", "release_id", "tag", "tag_commit", "version"], label);
  if (!STABLE_TAG_PATTERN.test(requiredString(release.tag, `${label}.tag`))) throw new Error(`${label}.tag must be stable`);
  if (release.version !== release.tag.slice(1)) throw new Error(`${label}.version must match tag`);
  if (!GIT_SHA_PATTERN.test(release.tag_commit || "")) throw new Error(`${label}.tag_commit must be a Git commit`);
  requiredSafeInteger(release.release_id, `${label}.release_id`);
  if (release.draft !== false || release.prerelease !== false) throw new Error(`${label} must be a public stable release`);
  validateLegacyAssets(release.assets, `${label}.assets`);
};

export function validateReleaseBootstrapPolicy(policy) {
  exactKeys(
    policy,
    ["baseline", "legacy_release", "qualification_workflow", "reason_code", "required_fresh_targets", "required_restart_targets", "schema"],
    "release bootstrap policy",
  );
  if (policy.schema !== RELEASE_BOOTSTRAP_POLICY_SCHEMA) {
    throw new Error(`release bootstrap policy schema must be ${RELEASE_BOOTSTRAP_POLICY_SCHEMA}`);
  }
  exactKeys(policy.baseline, ["confirmation", "next_strict_from_tag", "tag", "version"], "release bootstrap policy baseline");
  if (policy.baseline.tag !== RELEASE_BOOTSTRAP_BASELINE_TAG || policy.baseline.version !== RELEASE_BOOTSTRAP_BASELINE_TAG.slice(1)) {
    throw new Error(`release bootstrap policy baseline must be ${RELEASE_BOOTSTRAP_BASELINE_TAG}`);
  }
  if (policy.baseline.confirmation !== RELEASE_BOOTSTRAP_CONFIRMATION) {
    throw new Error(`release bootstrap policy confirmation must be ${RELEASE_BOOTSTRAP_CONFIRMATION}`);
  }
  if (policy.baseline.next_strict_from_tag !== RELEASE_BOOTSTRAP_BASELINE_TAG) {
    throw new Error("release bootstrap policy next_strict_from_tag must equal the baseline tag");
  }
  validateLegacyRelease(policy.legacy_release, "release bootstrap policy legacy_release");
  if (policy.legacy_release.tag !== "v0.1.9") throw new Error("release bootstrap policy legacy release must be v0.1.9");
  if (policy.reason_code !== "legacy-release-missing-modern-manifest") {
    throw new Error("release bootstrap policy reason_code is not recognized");
  }
  if (policy.qualification_workflow !== RELEASE_BOOTSTRAP_WORKFLOW_PATH) {
    throw new Error("release bootstrap policy qualification_workflow is not recognized");
  }
  if (JSON.stringify(sortedUniqueStrings(policy.required_fresh_targets, "release bootstrap policy required_fresh_targets")) !== JSON.stringify(EXPECTED_FRESH_TARGETS)) {
    throw new Error("release bootstrap policy required_fresh_targets must match the four supported targets");
  }
  if (!Array.isArray(policy.required_restart_targets) || policy.required_restart_targets.length !== 0) {
    throw new Error("release bootstrap policy required_restart_targets must be empty");
  }
  return policy;
}

export function computeReleaseBootstrapPolicyDigest(policy) {
  validateReleaseBootstrapPolicy(policy);
  return `sha256:${crypto.createHash("sha256")
    .update(Buffer.from(`${POLICY_DIGEST_DOMAIN}${JSON.stringify(canonicalJson(policy, "policy"))}`, "utf8"))
    .digest("hex")}`;
}

export function readReleaseBootstrapPolicy(filePath) {
  const policy = JSON.parse(fs.readFileSync(filePath, "utf8"));
  validateReleaseBootstrapPolicy(policy);
  return policy;
}

export function validateLegacyReleaseProjection(projection, policy) {
  validateReleaseBootstrapPolicy(policy);
  exactKeys(projection, ["release", "schema"], "legacy release projection");
  if (projection.schema !== LEGACY_RELEASE_PROJECTION_SCHEMA) {
    throw new Error(`legacy release projection schema must be ${LEGACY_RELEASE_PROJECTION_SCHEMA}`);
  }
  validateLegacyRelease(projection.release, "legacy release projection release");
  if (JSON.stringify(canonicalJson(projection.release)) !== JSON.stringify(canonicalJson(policy.legacy_release))) {
    throw new Error("legacy release projection does not match the frozen bootstrap policy");
  }
  return projection;
}

export function projectLegacyReleaseApi(apiRelease, policy, legacyTagCommit) {
  validateReleaseBootstrapPolicy(policy);
  if (!apiRelease || typeof apiRelease !== "object" || Array.isArray(apiRelease)) {
    throw new Error("GitHub legacy release response must be an object");
  }
  if (!Array.isArray(apiRelease.assets)) throw new Error("GitHub legacy release assets must be an array");
  const projection = {
    schema: LEGACY_RELEASE_PROJECTION_SCHEMA,
    release: {
      tag: requiredString(apiRelease.tag_name, "GitHub legacy release tag_name"),
      version: requiredString(apiRelease.tag_name, "GitHub legacy release tag_name").slice(1),
      tag_commit: requiredString(legacyTagCommit, "legacy tag commit"),
      release_id: requiredSafeInteger(apiRelease.id, "GitHub legacy release id"),
      draft: apiRelease.draft,
      prerelease: apiRelease.prerelease,
      assets: apiRelease.assets.map((asset, index) => ({
        id: requiredSafeInteger(asset?.id, `GitHub legacy release assets[${index}].id`),
        name: requiredString(asset?.name, `GitHub legacy release assets[${index}].name`),
        size: requiredSafeInteger(asset?.size, `GitHub legacy release assets[${index}].size`),
        digest: requiredString(asset?.digest, `GitHub legacy release assets[${index}].digest`),
      })).sort((left, right) => UTF8_COMPARE(left.name, right.name)),
    },
  };
  validateLegacyReleaseProjection(projection, policy);
  return projection;
}
