export const RESTART_UPDATE_QUALIFICATION_SCHEMA = "pupu.restart-update-qualification.v1";

export const RESTART_UPDATE_TARGET_IDS = Object.freeze([
  "macos-arm64",
  "macos-x64",
  "windows-x64",
]);

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SHA512 = /^[A-Za-z0-9+/]+={0,2}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys must be exactly ${required.join(", ")}`);
  }
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const requiredPositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
};

const requiredSha256 = (value, label) => {
  if (!SHA256.test(value)) throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  return value;
};

const requiredSha512 = (value, label) => {
  if (typeof value !== "string" || !SHA512.test(value)) {
    throw new Error(`${label} must be a base64 SHA-512 value`);
  }
  return value;
};

const stableVersionFromTag = (tag, label) => {
  const match = STABLE_TAG.exec(requiredString(tag, label));
  if (!match) throw new Error(`${label} must be a stable vX.Y.Z tag`);
  return match.slice(1).map(Number);
};

const compareVersions = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

const expectedUpdaterBinding = (manifest, targetId) => {
  const metadata = manifest?.updater_metadata?.filter((item) => item.target_ids?.includes(targetId)) || [];
  if (metadata.length !== 1) {
    throw new Error(`candidate manifest must have exactly one updater metadata entry for ${targetId}`);
  }
  const payloadAssets = manifest.assets?.filter((asset) =>
    asset.target_id === targetId && (
      asset.role === "updater-payload" ||
      (targetId === "windows-x64" && asset.role === "installer" && asset.format === "exe")
    )
  ) || [];
  if (payloadAssets.length !== 1) {
    throw new Error(`candidate manifest must have exactly one updater payload for ${targetId}`);
  }
  const payload = payloadAssets[0];
  const blockmaps = manifest.assets?.filter((asset) =>
    asset.target_id === targetId && asset.role === "updater-blockmap" && asset.format === "blockmap"
  ) || [];
  if (blockmaps.length !== 1) {
    throw new Error(`candidate manifest must have exactly one updater blockmap for ${targetId}`);
  }
  const reference = metadata[0].references?.find((item) => item.name === payload.name);
  if (!reference) {
    throw new Error(`candidate updater metadata must reference the ${targetId} payload`);
  }
  return { metadata: metadata[0], payload, reference, blockmap: blockmaps[0] };
};

const validateInstalledIdentity = (installed) => {
  exactKeys(installed, ["identity", "sentinel"], "restart-update report installed");
  exactKeys(
    installed.identity,
    ["app_asar_sha256", "executable_sha256", "sidecar_sha256", "snapshot_fingerprint", "snapshot_sha256"],
    "restart-update report installed.identity",
  );
  for (const key of ["app_asar_sha256", "executable_sha256", "sidecar_sha256", "snapshot_sha256"]) {
    requiredSha256(installed.identity[key], `restart-update report installed.identity.${key}`);
  }
  if (typeof installed.identity.snapshot_fingerprint !== "string" ||
      !FINGERPRINT.test(installed.identity.snapshot_fingerprint)) {
    throw new Error("restart-update report installed.identity.snapshot_fingerprint must be SHA-256 hex");
  }
  exactKeys(installed.sentinel, ["after_sha256", "before_sha256", "retained"], "restart-update report installed.sentinel");
  requiredSha256(installed.sentinel.before_sha256, "restart-update report installed.sentinel.before_sha256");
  requiredSha256(installed.sentinel.after_sha256, "restart-update report installed.sentinel.after_sha256");
  if (installed.sentinel.retained !== true || installed.sentinel.before_sha256 !== installed.sentinel.after_sha256) {
    throw new Error("restart-update report must retain the exact sentinel bytes");
  }
};

export function validateUpdateFixtureSource({ manifest, fromTag, fromVersion, fromCommit }) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("update fixture source requires the candidate manifest");
  }
  const toTag = manifest.release?.tag;
  const toVersion = manifest.release?.version;
  const toVersionParts = stableVersionFromTag(toTag, "candidate release tag");
  if (toVersion !== toVersionParts.join(".")) {
    throw new Error("candidate release version does not match its stable tag");
  }
  const fromVersionParts = stableVersionFromTag(fromTag, "update fixture from_tag");
  if (fromVersion !== fromVersionParts.join(".")) {
    throw new Error("update fixture from_version does not match from_tag");
  }
  if (compareVersions(fromVersionParts, toVersionParts) >= 0) {
    throw new Error("update fixture from_version must be lower than the candidate version");
  }
  if (typeof fromCommit !== "string" || !GIT_COMMIT.test(fromCommit)) {
    throw new Error("update fixture from_commit must be a 40-character lowercase Git commit");
  }
  return {
    from_tag: fromTag,
    from_version: fromVersion,
    from_commit: fromCommit,
  };
}

export function validateRestartUpdateQualificationReport(report, { manifest, targetId = "" } = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("restart-update report requires the candidate manifest");
  }
  exactKeys(
    report,
    ["candidate", "executed_tests", "feed", "fixture", "installed", "schema", "status", "target_id", "update"],
    "restart-update report",
  );
  if (report.schema !== RESTART_UPDATE_QUALIFICATION_SCHEMA) {
    throw new Error(`restart-update report schema must be ${RESTART_UPDATE_QUALIFICATION_SCHEMA}`);
  }
  if (report.status !== "passed") throw new Error("restart-update report status must be passed");
  if (!RESTART_UPDATE_TARGET_IDS.includes(report.target_id)) {
    throw new Error("restart-update report target is unsupported");
  }
  if (targetId && targetId !== report.target_id) {
    throw new Error("restart-update report target does not match expectation");
  }

  exactKeys(report.candidate, ["manifest_digest", "to_tag", "to_version"], "restart-update report candidate");
  if (report.candidate.manifest_digest !== manifest.manifest_digest) {
    throw new Error("restart-update report candidate manifest digest does not match the sealed candidate");
  }
  requiredSha256(report.candidate.manifest_digest, "restart-update report candidate.manifest_digest");
  if (report.candidate.to_tag !== manifest.release?.tag || report.candidate.to_version !== manifest.release?.version) {
    throw new Error("restart-update report candidate release identity does not match the sealed candidate");
  }
  const toVersion = stableVersionFromTag(report.candidate.to_tag, "restart-update report candidate.to_tag");
  if (report.candidate.to_version !== toVersion.join(".")) {
    throw new Error("restart-update report candidate.to_version does not match its tag");
  }

  exactKeys(
    report.fixture,
    ["allowed_differences", "from_commit", "from_tag", "from_version", "sha256", "signer_subject", "signer_thumbprint"],
    "restart-update report fixture",
  );
  const fromVersion = stableVersionFromTag(report.fixture.from_tag, "restart-update report fixture.from_tag");
  if (report.fixture.from_version !== fromVersion.join(".")) {
    throw new Error("restart-update report fixture.from_version does not match its tag");
  }
  if (typeof report.fixture.from_commit !== "string" || !GIT_COMMIT.test(report.fixture.from_commit)) {
    throw new Error("restart-update report fixture.from_commit must be a 40-character lowercase Git commit");
  }
  if (compareVersions(fromVersion, toVersion) >= 0) {
    throw new Error("restart-update report fixture from_version must be lower than the candidate version");
  }
  requiredSha256(report.fixture.sha256, "restart-update report fixture.sha256");
  requiredString(report.fixture.signer_subject, "restart-update report fixture.signer_subject");
  requiredString(report.fixture.signer_thumbprint, "restart-update report fixture.signer_thumbprint");
  if (JSON.stringify(report.fixture.allowed_differences) !== JSON.stringify(["app-update.yml"])) {
    throw new Error("restart-update report fixture allowed_differences must be exactly app-update.yml");
  }

  exactKeys(report.feed, ["blockmap", "metadata", "payload", "schema", "transport"], "restart-update report feed");
  if (report.feed.schema !== "pupu.qualification-feed.v1" || report.feed.transport !== "runner-loopback") {
    throw new Error("restart-update report feed must use the versioned runner-loopback qualification feed");
  }
  const expectedBinding = expectedUpdaterBinding(manifest, report.target_id);
  exactKeys(report.feed.metadata, ["name", "sha256"], "restart-update report feed.metadata");
  if (report.feed.metadata.name !== expectedBinding.metadata.name ||
      report.feed.metadata.sha256 !== expectedBinding.metadata.sha256) {
    throw new Error("restart-update report feed metadata does not match the sealed candidate");
  }
  exactKeys(report.feed.payload, ["name", "sha256", "sha512"], "restart-update report feed.payload");
  if (report.feed.payload.name !== expectedBinding.payload.name ||
      report.feed.payload.sha256 !== expectedBinding.payload.sha256 ||
      report.feed.payload.sha512 !== expectedBinding.reference.sha512) {
    throw new Error("restart-update report feed payload does not match the sealed candidate");
  }
  exactKeys(report.feed.blockmap, ["name", "sha256"], "restart-update report feed.blockmap");
  if (report.feed.blockmap.name !== expectedBinding.blockmap.name ||
      report.feed.blockmap.sha256 !== expectedBinding.blockmap.sha256) {
    throw new Error("restart-update report feed blockmap does not match the sealed candidate");
  }
  requiredSha256(report.feed.metadata.sha256, "restart-update report feed.metadata.sha256");
  requiredSha256(report.feed.payload.sha256, "restart-update report feed.payload.sha256");
  requiredSha512(report.feed.payload.sha512, "restart-update report feed.payload.sha512");
  requiredSha256(report.feed.blockmap.sha256, "restart-update report feed.blockmap.sha256");

  exactKeys(report.update, ["attempts", "duplicate_install_blocked", "events", "old_process_cleanup"], "restart-update report update");
  requiredPositiveInteger(report.update.attempts, "restart-update report update.attempts");
  if (report.update.duplicate_install_blocked !== true || report.update.old_process_cleanup !== true) {
    throw new Error("restart-update report must prove duplicate-install blocking and old-process cleanup");
  }
  const expectedEvents = [
    "checking",
    "downloading",
    "downloaded",
    "install_requested",
    "old_process_exited",
    "relaunched",
  ];
  if (JSON.stringify(report.update.events) !== JSON.stringify(expectedEvents)) {
    throw new Error("restart-update report update events do not prove the required restart sequence");
  }
  validateInstalledIdentity(report.installed);
  requiredPositiveInteger(report.executed_tests, "restart-update report executed_tests");
  return report;
}
