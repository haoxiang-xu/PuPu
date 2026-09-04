import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";

import {
  RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA,
  computeReleaseBootstrapPolicyDigest,
  validateReleaseBootstrapPolicy,
} from "./release-bootstrap-policy.mjs";

export const RELEASE_ARTIFACT_CONTRACT_SCHEMA = "pupu.release-artifact-contract.v1";
export const RELEASE_ASSET_MANIFEST_SCHEMA = "pupu.release-assets.v1";
export const RELEASE_QUALIFICATION_SCHEMA = "pupu.release-qualification.v1";
export const RELEASE_UPDATE_QUALIFICATION_SCHEMA = "pupu.release-update-qualification.v1";
export { RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA };

const MANIFEST_DIGEST_DOMAIN = "pupu.release-assets.v1\u0000";
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const GITHUB_RUN_ID_PATTERN = /^[1-9]\d*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const STABLE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RESTART_UPDATE_TARGET_IDS = Object.freeze(["macos-arm64", "macos-x64", "windows-x64"]);
const UTF8_COMPARE = (left, right) => Buffer.compare(
  Buffer.from(left, "utf8"),
  Buffer.from(right, "utf8"),
);

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(UTF8_COMPARE);
  const sortedExpected = [...expected].sort(UTF8_COMPARE);
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} keys must be exactly ${sortedExpected.join(", ")}`);
  }
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const requiredArray = (value, label) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const requireSortedUnique = (values, label, map = (value) => value) => {
  const normalized = values.map(map);
  const canonical = [...new Set(normalized)].sort(UTF8_COMPARE);
  if (JSON.stringify(normalized) !== JSON.stringify(canonical)) {
    throw new Error(`${label} must be sorted and unique`);
  }
  return normalized;
};

const canonicalJson = (value, label = "value") => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalJson(item, `${label}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(UTF8_COMPARE)
        .map((key) => [key, canonicalJson(value[key], `${label}.${key}`)]),
    );
  }
  throw new Error(`${label} contains a non-canonical JSON value`);
};

const hashBufferSha256 = (buffer) =>
  `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;

export const hashFileSha256 = (filePath) => hashBufferSha256(fs.readFileSync(filePath));

export const hashFileSha512 = (filePath) =>
  crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");

export const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

export function computeReleaseAssetManifestDigest(manifest) {
  const { manifest_digest: ignored, ...body } = manifest;
  return hashBufferSha256(
    Buffer.from(
      `${MANIFEST_DIGEST_DOMAIN}${JSON.stringify(canonicalJson(body, "manifest"))}`,
      "utf8",
    ),
  );
}

export function readReleaseArtifactContract(contractPath) {
  const contract = readJson(contractPath);
  validateReleaseArtifactContract(contract);
  return contract;
}

export function validateReleaseArtifactContract(contract) {
  exactKeys(contract, ["product_name", "schema", "targets", "updater_channels"], "artifact contract");
  if (contract.schema !== RELEASE_ARTIFACT_CONTRACT_SCHEMA) {
    throw new Error(`artifact contract schema must be ${RELEASE_ARTIFACT_CONTRACT_SCHEMA}`);
  }
  requiredString(contract.product_name, "artifact contract product_name");
  const targets = requiredArray(contract.targets, "artifact contract targets");
  if (targets.length === 0) throw new Error("artifact contract targets must not be empty");
  const targetIds = [];
  for (const [index, target] of targets.entries()) {
    exactKeys(
      target,
      ["arch", "artifacts", "id", "os", "planned_release", "status", "updater_channel"],
      `artifact contract targets[${index}]`,
    );
    const id = requiredString(target.id, `artifact contract targets[${index}].id`);
    targetIds.push(id);
    if (!["macos", "windows", "linux"].includes(target.os)) {
      throw new Error(`artifact contract target ${id} has unsupported os`);
    }
    if (!["arm64", "x64"].includes(target.arch)) {
      throw new Error(`artifact contract target ${id} has unsupported architecture`);
    }
    if (!["required", "reserved"].includes(target.status)) {
      throw new Error(`artifact contract target ${id} has unsupported status`);
    }
    if (target.status === "required" && target.planned_release !== null) {
      throw new Error(`artifact contract target ${id} must not set planned_release`);
    }
    if (target.status === "reserved") {
      if (!SEMVER_PATTERN.test(requiredString(target.planned_release, `artifact contract target ${id} planned_release`))) {
        throw new Error(`artifact contract target ${id} has invalid planned_release`);
      }
      if (target.artifacts.length !== 0) {
        throw new Error(`artifact contract reserved target ${id} must not declare release artifacts`);
      }
    }
    if (target.updater_channel !== null) {
      requiredString(target.updater_channel, `artifact contract target ${id} updater_channel`);
    }
    const artifactKeys = new Set();
    for (const [artifactIndex, artifact] of target.artifacts.entries()) {
      exactKeys(
        artifact,
        ["format", "name_template", "role"],
        `artifact contract target ${id} artifacts[${artifactIndex}]`,
      );
      const role = requiredString(artifact.role, `artifact contract target ${id} artifact role`);
      const format = requiredString(artifact.format, `artifact contract target ${id} artifact format`);
      const template = requiredString(artifact.name_template, `artifact contract target ${id} artifact template`);
      if (!template.includes("${version}") || template.includes("${arch}")) {
        throw new Error(`artifact contract target ${id} artifact template must use the explicit architecture token`);
      }
      const key = `${role}:${format}:${template}`;
      if (artifactKeys.has(key)) throw new Error(`artifact contract target ${id} repeats an artifact`);
      artifactKeys.add(key);
    }
  }
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("artifact contract target ids must be unique");
  }

  const channels = requiredArray(contract.updater_channels, "artifact contract updater_channels");
  const channelNames = new Set();
  const channelIds = new Set();
  for (const [index, channel] of channels.entries()) {
    exactKeys(channel, ["id", "name", "primary_target", "target_ids"], `artifact contract updater_channels[${index}]`);
    const id = requiredString(channel.id, `artifact contract updater channel ${index} id`);
    const name = requiredString(channel.name, `artifact contract updater channel ${id} name`);
    if (!name.endsWith(".yml")) throw new Error(`artifact contract updater channel ${id} name must end in .yml`);
    if (channelIds.has(id) || channelNames.has(name)) {
      throw new Error("artifact contract updater channel ids and names must be unique");
    }
    channelIds.add(id);
    channelNames.add(name);
    const channelTargets = requiredArray(channel.target_ids, `artifact contract updater channel ${id} target_ids`);
    requireSortedUnique(channelTargets, `artifact contract updater channel ${id} target_ids`);
    if (!channelTargets.includes(channel.primary_target)) {
      throw new Error(`artifact contract updater channel ${id} primary_target must be in target_ids`);
    }
    for (const targetId of channelTargets) {
      const target = targets.find((candidate) => candidate.id === targetId);
      if (!target || target.updater_channel !== name) {
        throw new Error(`artifact contract updater channel ${id} has an invalid target ${targetId}`);
      }
    }
  }
  for (const target of targets) {
    if (target.updater_channel && !channels.some((channel) => channel.name === target.updater_channel)) {
      throw new Error(`artifact contract target ${target.id} references an unknown updater channel`);
    }
  }
  return contract;
}

export const requiredTargets = (contract) => {
  validateReleaseArtifactContract(contract);
  return contract.targets.filter((target) => target.status === "required");
};

export const reservedTargets = (contract) => {
  validateReleaseArtifactContract(contract);
  return contract.targets.filter((target) => target.status === "reserved");
};

export function expectedTargetAssets(contract, version) {
  if (!SEMVER_PATTERN.test(version)) throw new Error("release version must be valid SemVer");
  return requiredTargets(contract)
    .flatMap((target) => target.artifacts.map((artifact) => ({
      target_id: target.id,
      role: artifact.role,
      format: artifact.format,
      name: artifact.name_template.replaceAll("${version}", version),
    })))
    .sort((left, right) => UTF8_COMPARE(left.name, right.name));
}

export function expectedReleaseAssetNames(contract, version) {
  return [
    ...expectedTargetAssets(contract, version).map((asset) => asset.name),
    ...contract.updater_channels.map((channel) => channel.name),
  ].sort(UTF8_COMPARE);
}

export function requiredPackageOutputNames(contract, targetId, version) {
  validateReleaseArtifactContract(contract);
  const target = contract.targets.find((candidate) => candidate.id === targetId);
  if (!target || target.status !== "required") {
    throw new Error(`package target must be required by the contract: ${targetId}`);
  }
  return [
    ...expectedTargetAssets(contract, version)
      .filter((asset) => asset.target_id === targetId)
      .map((asset) => asset.name),
    ...(target.updater_channel ? [target.updater_channel] : []),
  ].sort(UTF8_COMPARE);
}

export function allowedRawPackageOutputNames(contract, targetId, version) {
  validateReleaseArtifactContract(contract);
  const target = contract.targets.find((candidate) => candidate.id === targetId);
  if (!target || target.status !== "required") {
    throw new Error(`package target must be required by the contract: ${targetId}`);
  }
  const targetAssets = expectedTargetAssets(contract, version)
    .filter((asset) => asset.target_id === targetId);
  const builderSupportFiles = [
    "builder-effective-config.yaml",
    "builder-debug.yml",
    ...(target.os === "macos"
      ? targetAssets
        .filter((asset) => asset.format === "dmg")
        .map((asset) => `${asset.name}.blockmap`)
      : []),
    ...(target.os === "linux" ? ["latest-linux.yml"] : []),
  ];
  return [...new Set([
    ...requiredPackageOutputNames(contract, targetId, version),
    ...builderSupportFiles,
  ])].sort(UTF8_COMPARE);
}

export function verifyRawPackageOutputDirectory({ contract, targetId, version, distDir }) {
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    throw new Error(`package output directory is missing: ${distDir}`);
  }
  const requiredNames = requiredPackageOutputNames(contract, targetId, version);
  const allowedNames = new Set(allowedRawPackageOutputNames(contract, targetId, version));
  const actualNames = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort(UTF8_COMPARE);
  const missing = requiredNames.filter((name) => !actualNames.includes(name));
  const unexpected = actualNames.filter((name) => !allowedNames.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `package output inventory mismatch for ${targetId}: missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}`,
    );
  }
  return actualNames;
}

const assertDigest = (value, label) => {
  if (!SHA256_PATTERN.test(value)) throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  return value;
};

const assertRunId = (value, label) => {
  const runId = requiredString(value, label);
  if (!GITHUB_RUN_ID_PATTERN.test(runId)) {
    throw new Error(`${label} must be a positive decimal GitHub Actions run ID`);
  }
  return runId;
};

const assertPositiveSize = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
};

const validateReleaseIdentity = (release) => {
  exactKeys(release, ["candidate_run_id", "commit", "tag", "version"], "manifest release");
  const version = requiredString(release.version, "manifest release version");
  if (!SEMVER_PATTERN.test(version)) throw new Error("manifest release version must be SemVer");
  if (release.tag !== `v${version}`) throw new Error("manifest release tag must equal v<version>");
  if (!GIT_SHA_PATTERN.test(release.commit)) throw new Error("manifest release commit must be a full lowercase Git SHA");
  assertRunId(release.candidate_run_id, "manifest release candidate_run_id");
  return release;
};

const validateUnchainIdentity = (unchain) => {
  exactKeys(unchain, ["artifact_sha256", "runtime_manifest_digest", "source_revision"], "manifest unchain");
  assertDigest(unchain.artifact_sha256, "manifest unchain artifact_sha256");
  assertDigest(unchain.runtime_manifest_digest, "manifest unchain runtime_manifest_digest");
  if (!GIT_SHA_PATTERN.test(unchain.source_revision)) {
    throw new Error("manifest unchain source_revision must be a full lowercase Git SHA");
  }
  return unchain;
};

const validateCandidate = (candidate) => {
  exactKeys(candidate, ["mode", "signing_environment"], "manifest candidate");
  if (candidate.mode !== "release-candidate") {
    throw new Error("manifest candidate mode must be release-candidate");
  }
  if (candidate.signing_environment !== "release-signing") {
    throw new Error("manifest candidate signing_environment must be release-signing");
  }
  return candidate;
};

const validateAsset = (asset, index) => {
  exactKeys(asset, ["format", "name", "role", "sha256", "size_bytes", "target_id"], `manifest assets[${index}]`);
  requiredString(asset.target_id, `manifest assets[${index}].target_id`);
  requiredString(asset.role, `manifest assets[${index}].role`);
  requiredString(asset.format, `manifest assets[${index}].format`);
  requiredString(asset.name, `manifest assets[${index}].name`);
  assertPositiveSize(asset.size_bytes, `manifest assets[${index}].size_bytes`);
  assertDigest(asset.sha256, `manifest assets[${index}].sha256`);
  return asset;
};

const assetMap = (assets) => new Map(assets.map((asset) => [asset.name, asset]));

const isUpdaterPayloadAsset = (asset, channel) =>
  asset.role === "updater-payload" ||
  (channel.id === "windows" && asset.role === "installer" && asset.format === "exe");

const validateTargets = (manifestTargets, contract) => {
  const expected = contract.targets.map((target) => target.id).sort(UTF8_COMPARE);
  requiredArray(manifestTargets, "manifest targets");
  const actual = manifestTargets.map((target, index) => {
    exactKeys(target, ["id", "state"], `manifest targets[${index}]`);
    const id = requiredString(target.id, `manifest targets[${index}].id`);
    const state = requiredString(target.state, `manifest targets[${index}].state`);
    const contractTarget = contract.targets.find((candidate) => candidate.id === id);
    if (!contractTarget || state !== contractTarget.status) {
      throw new Error(`manifest target ${id} does not match the artifact contract`);
    }
    return id;
  });
  requireSortedUnique(actual, "manifest targets", (value) => value);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("manifest targets must exactly match the artifact contract");
  }
};

const validateTargetAssetSet = (assets, contract, version) => {
  const expected = expectedTargetAssets(contract, version);
  const original = assets.map(validateAsset);
  requireSortedUnique(original.map((asset) => asset.name), "manifest asset names");
  const actual = original.sort((left, right) => UTF8_COMPARE(left.name, right.name));
  if (actual.length !== expected.length) {
    throw new Error("manifest assets must exactly match the required target asset set");
  }
  for (const [index, expectedAsset] of expected.entries()) {
    const actualAsset = actual[index];
    for (const field of ["target_id", "role", "format", "name"]) {
      if (actualAsset[field] !== expectedAsset[field]) {
        throw new Error(`manifest asset ${actualAsset.name} does not match the artifact contract`);
      }
    }
  }
  return actual;
};

const validateUpdaterMetadata = (metadata, assets, contract) => {
  const expectedChannels = [...contract.updater_channels].sort((left, right) => UTF8_COMPARE(left.name, right.name));
  requiredArray(metadata, "manifest updater_metadata");
  if (metadata.length !== expectedChannels.length) {
    throw new Error("manifest updater_metadata must exactly match the artifact contract channels");
  }
  const assetsByName = assetMap(assets);
  requireSortedUnique(metadata.map((item) => item?.name || ""), "manifest updater_metadata");
  for (const [index, expectedChannel] of expectedChannels.entries()) {
    const item = metadata[index];
    exactKeys(item, ["channel", "name", "references", "sha256", "size_bytes", "target_ids"], `manifest updater_metadata[${index}]`);
    if (item.channel !== expectedChannel.id || item.name !== expectedChannel.name) {
      throw new Error(`manifest updater metadata ${index} does not match the artifact contract`);
    }
    assertPositiveSize(item.size_bytes, `manifest updater metadata ${item.name} size_bytes`);
    assertDigest(item.sha256, `manifest updater metadata ${item.name} sha256`);
    requireSortedUnique(item.target_ids, `manifest updater metadata ${item.name} target_ids`);
    const expectedTargetIds = [...expectedChannel.target_ids].sort(UTF8_COMPARE);
    if (JSON.stringify(item.target_ids) !== JSON.stringify(expectedTargetIds)) {
      throw new Error(`manifest updater metadata ${item.name} target_ids do not match the artifact contract`);
    }
    const expectedReferences = expectedChannel.target_ids
      .flatMap((targetId) => [...assetsByName.values()].filter((asset) =>
        asset.target_id === targetId && isUpdaterPayloadAsset(asset, expectedChannel)
      ))
      .sort((left, right) => UTF8_COMPARE(left.name, right.name));
    const references = requiredArray(item.references, `manifest updater metadata ${item.name} references`);
    if (references.length !== expectedReferences.length) {
      throw new Error(`manifest updater metadata ${item.name} references do not match updater payloads`);
    }
    const actualReferenceNames = references.map((reference, referenceIndex) => {
      exactKeys(reference, ["name", "sha512", "size_bytes"], `manifest updater metadata ${item.name} references[${referenceIndex}]`);
      const name = requiredString(reference.name, `manifest updater metadata ${item.name} reference name`);
      requiredString(reference.sha512, `manifest updater metadata ${item.name} reference sha512`);
      assertPositiveSize(reference.size_bytes, `manifest updater metadata ${item.name} reference size_bytes`);
      const asset = assetsByName.get(name);
      if (!asset || asset.size_bytes !== reference.size_bytes) {
        throw new Error(`manifest updater metadata ${item.name} reference ${name} does not match an asset`);
      }
      return name;
    });
    requireSortedUnique(actualReferenceNames, `manifest updater metadata ${item.name} references`, (value) => value);
    if (JSON.stringify(actualReferenceNames) !== JSON.stringify(expectedReferences.map((asset) => asset.name))) {
      throw new Error(`manifest updater metadata ${item.name} references do not match the artifact contract`);
    }
  }
  return metadata;
};

export function validateReleaseAssetManifest(manifest, contract) {
  validateReleaseArtifactContract(contract);
  exactKeys(
    manifest,
    ["assets", "candidate", "manifest_digest", "release", "schema", "targets", "unchain", "updater_metadata"],
    "release asset manifest",
  );
  if (manifest.schema !== RELEASE_ASSET_MANIFEST_SCHEMA) {
    throw new Error(`release asset manifest schema must be ${RELEASE_ASSET_MANIFEST_SCHEMA}`);
  }
  validateReleaseIdentity(manifest.release);
  validateUnchainIdentity(manifest.unchain);
  validateCandidate(manifest.candidate);
  validateTargets(manifest.targets, contract);
  const assets = validateTargetAssetSet(manifest.assets, contract, manifest.release.version);
  validateUpdaterMetadata(manifest.updater_metadata, assets, contract);
  const expectedDigest = computeReleaseAssetManifestDigest(manifest);
  if (manifest.manifest_digest !== expectedDigest) {
    throw new Error(`release asset manifest digest mismatch: expected ${expectedDigest}`);
  }
  return manifest;
}

const parseYamlDocument = (filePath) => {
  const document = YAML.parseDocument(fs.readFileSync(filePath, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`updater metadata ${path.basename(filePath)} is invalid YAML: ${document.errors[0].message}`);
  }
  const value = document.toJSON();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`updater metadata ${path.basename(filePath)} must be a YAML object`);
  }
  return value;
};

export function readUpdaterReferences(filePath, { version, channel, assets }) {
  const document = parseYamlDocument(filePath);
  if (document.version !== version) {
    throw new Error(`updater metadata ${path.basename(filePath)} version does not match ${version}`);
  }
  const files = requiredArray(document.files, `updater metadata ${path.basename(filePath)} files`);
  const expectedByName = assetMap(
    assets.filter((asset) =>
      channel.target_ids.includes(asset.target_id) && isUpdaterPayloadAsset(asset, channel)
    ),
  );
  const references = files.map((file, index) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new Error(`updater metadata ${path.basename(filePath)} files[${index}] must be an object`);
    }
    const name = requiredString(file.url, `updater metadata ${path.basename(filePath)} files[${index}].url`);
    const sha512 = requiredString(file.sha512, `updater metadata ${path.basename(filePath)} files[${index}].sha512`);
    const sizeBytes = assertPositiveSize(file.size, `updater metadata ${path.basename(filePath)} files[${index}].size`);
    const asset = expectedByName.get(name);
    if (!asset || asset.size_bytes !== sizeBytes) {
      throw new Error(`updater metadata ${path.basename(filePath)} references unexpected payload ${name}`);
    }
    const payloadPath = path.join(path.dirname(filePath), name);
    if (!fs.existsSync(payloadPath) || !fs.statSync(payloadPath).isFile()) {
      throw new Error(`updater metadata ${path.basename(filePath)} payload is missing: ${name}`);
    }
    if (hashFileSha512(payloadPath) !== sha512) {
      throw new Error(`updater metadata ${path.basename(filePath)} SHA-512 does not match payload ${name}`);
    }
    return { name, sha512, size_bytes: sizeBytes };
  }).sort((left, right) => UTF8_COMPARE(left.name, right.name));
  requireSortedUnique(references, `updater metadata ${path.basename(filePath)} references`, (reference) => reference.name);
  if (references.length !== expectedByName.size ||
      JSON.stringify(references.map((reference) => reference.name)) !== JSON.stringify([...expectedByName.keys()].sort(UTF8_COMPARE))) {
    throw new Error(`updater metadata ${path.basename(filePath)} does not reference every required payload exactly once`);
  }
  const primaryAsset = assets.find((asset) =>
    asset.target_id === channel.primary_target && isUpdaterPayloadAsset(asset, channel)
  );
  const primaryReference = references.find((reference) => reference.name === primaryAsset?.name);
  if (!primaryAsset || !primaryReference || document.path !== primaryAsset.name || document.sha512 !== primaryReference.sha512) {
    throw new Error(`updater metadata ${path.basename(filePath)} primary payload must be ${primaryAsset?.name || "defined"}`);
  }
  return { document, references };
}

const fileAssetRecord = (asset, assetDir) => {
  const filePath = path.join(assetDir, asset.name);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`release asset is missing: ${asset.name}`);
  }
  return {
    ...asset,
    size_bytes: fs.statSync(filePath).size,
    sha256: hashFileSha256(filePath),
  };
};

export function buildReleaseAssetManifest({
  contract,
  assetDir,
  tag,
  version,
  commit,
  candidateRunId,
  unchain,
}) {
  validateReleaseArtifactContract(contract);
  const expectedAssets = expectedTargetAssets(contract, version);
  const assets = expectedAssets.map((asset) => fileAssetRecord(asset, assetDir));
  const updaterMetadata = [...contract.updater_channels]
    .sort((left, right) => UTF8_COMPARE(left.name, right.name))
    .map((channel) => {
      const metadataPath = path.join(assetDir, channel.name);
      if (!fs.existsSync(metadataPath) || !fs.statSync(metadataPath).isFile()) {
        throw new Error(`updater metadata is missing: ${channel.name}`);
      }
      const { references } = readUpdaterReferences(metadataPath, { version, channel, assets });
      return {
        channel: channel.id,
        name: channel.name,
        target_ids: [...channel.target_ids].sort(UTF8_COMPARE),
        size_bytes: fs.statSync(metadataPath).size,
        sha256: hashFileSha256(metadataPath),
        references,
      };
    });
  const manifest = {
    schema: RELEASE_ASSET_MANIFEST_SCHEMA,
    release: {
      tag,
      version,
      commit,
      candidate_run_id: candidateRunId,
    },
    unchain: {
      artifact_sha256: unchain.artifact_sha256,
      runtime_manifest_digest: unchain.runtime_manifest_digest,
      source_revision: unchain.source_revision,
    },
    candidate: {
      mode: "release-candidate",
      signing_environment: "release-signing",
    },
    targets: contract.targets
      .map((target) => ({ id: target.id, state: target.status }))
      .sort((left, right) => UTF8_COMPARE(left.id, right.id)),
    assets,
    updater_metadata: updaterMetadata,
  };
  manifest.manifest_digest = computeReleaseAssetManifestDigest(manifest);
  validateReleaseAssetManifest(manifest, contract);
  return manifest;
}

export function verifyReleaseAssetDirectory({ manifest, contract, assetDir, allowExtraNames = [] }) {
  validateReleaseAssetManifest(manifest, contract);
  if (!fs.existsSync(assetDir) || !fs.statSync(assetDir).isDirectory()) {
    throw new Error(`release asset directory is missing: ${assetDir}`);
  }
  const expectedNames = [
    ...manifest.assets.map((asset) => asset.name),
    ...manifest.updater_metadata.map((metadata) => metadata.name),
  ].sort(UTF8_COMPARE);
  const allowedNames = new Set([...expectedNames, ...allowExtraNames]);
  const actualNames = fs.readdirSync(assetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort(UTF8_COMPARE);
  const unexpected = actualNames.filter((name) => !allowedNames.has(name));
  const missing = expectedNames.filter((name) => !actualNames.includes(name));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`release asset directory inventory mismatch: missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}`);
  }
  for (const asset of manifest.assets) {
    const filePath = path.join(assetDir, asset.name);
    if (fs.statSync(filePath).size !== asset.size_bytes || hashFileSha256(filePath) !== asset.sha256) {
      throw new Error(`release asset bytes do not match manifest: ${asset.name}`);
    }
  }
  for (const metadata of manifest.updater_metadata) {
    const filePath = path.join(assetDir, metadata.name);
    if (fs.statSync(filePath).size !== metadata.size_bytes || hashFileSha256(filePath) !== metadata.sha256) {
      throw new Error(`updater metadata bytes do not match manifest: ${metadata.name}`);
    }
    const channel = contract.updater_channels.find((candidate) => candidate.id === metadata.channel);
    const { references } = readUpdaterReferences(filePath, {
      version: manifest.release.version,
      channel,
      assets: manifest.assets,
    });
    if (JSON.stringify(references) !== JSON.stringify(metadata.references)) {
      throw new Error(`updater metadata references do not match manifest: ${metadata.name}`);
    }
  }
  return manifest;
}

export function validateQualificationReceipt(receipt, manifest, contract, { bootstrapPolicy = null } = {}) {
  validateReleaseAssetManifest(manifest, contract);
  if (receipt?.schema === RELEASE_UPDATE_QUALIFICATION_SCHEMA) {
    return validateReleaseUpdateQualificationReceipt(receipt, manifest, contract);
  }
  if (receipt?.schema === RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA) {
    if (!bootstrapPolicy) throw new Error("bootstrap qualification receipt requires the frozen bootstrap policy");
    return validateReleaseBootstrapQualificationReceipt(receipt, manifest, contract, bootstrapPolicy);
  }
  exactKeys(receipt, ["candidate_run_id", "manifest_digest", "qualification_run_id", "release", "schema", "status", "targets"], "release qualification receipt");
  if (receipt.schema !== RELEASE_QUALIFICATION_SCHEMA) {
    throw new Error(`release qualification receipt schema must be ${RELEASE_QUALIFICATION_SCHEMA}`);
  }
  if (receipt.status !== "passed") {
    throw new Error("release qualification receipt status must be passed");
  }
  if (receipt.manifest_digest !== manifest.manifest_digest) {
    throw new Error("release qualification receipt manifest_digest does not match candidate manifest");
  }
  if (receipt.candidate_run_id !== manifest.release.candidate_run_id) {
    throw new Error("release qualification receipt candidate_run_id does not match candidate manifest");
  }
  assertRunId(receipt.candidate_run_id, "release qualification receipt candidate_run_id");
  assertRunId(receipt.qualification_run_id, "release qualification receipt qualification_run_id");
  exactKeys(receipt.release, ["commit", "tag", "version"], "release qualification receipt release");
  for (const field of ["commit", "tag", "version"]) {
    if (receipt.release[field] !== manifest.release[field]) {
      throw new Error(`release qualification receipt ${field} does not match candidate manifest`);
    }
  }
  const expected = requiredTargets(contract).map((target) => target.id).sort(UTF8_COMPARE);
  const actual = requiredArray(receipt.targets, "release qualification receipt targets").map((target, index) => {
    exactKeys(target, ["id", "status"], `release qualification receipt targets[${index}]`);
    if (target.status !== "passed") throw new Error(`release qualification target ${target.id} must be passed`);
    return requiredString(target.id, `release qualification receipt targets[${index}].id`);
  });
  requireSortedUnique(actual, "release qualification receipt targets", (value) => value);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("release qualification receipt targets must match all required release targets");
  }
  return receipt;
}

export function validateReleaseBootstrapQualificationReceipt(receipt, manifest, contract, policy) {
  validateReleaseAssetManifest(manifest, contract);
  validateReleaseBootstrapPolicy(policy);
  exactKeys(
    receipt,
    [
      "bootstrap",
      "candidate_run_id",
      "fresh_targets",
      "manifest_digest",
      "qualification_run_id",
      "release",
      "restart_disposition",
      "restart_targets",
      "schema",
      "scope",
      "status",
    ],
    "release bootstrap qualification receipt",
  );
  if (receipt.schema !== RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA) {
    throw new Error(`release bootstrap qualification receipt schema must be ${RELEASE_BOOTSTRAP_QUALIFICATION_SCHEMA}`);
  }
  if (receipt.status !== "passed" || receipt.scope !== "bootstrap-fresh-install-only") {
    throw new Error("release bootstrap qualification receipt must be a passed fresh-install-only bootstrap");
  }
  if (receipt.manifest_digest !== manifest.manifest_digest) {
    throw new Error("release bootstrap qualification receipt manifest_digest does not match candidate manifest");
  }
  if (receipt.candidate_run_id !== manifest.release.candidate_run_id) {
    throw new Error("release bootstrap qualification receipt candidate_run_id does not match candidate manifest");
  }
  assertRunId(receipt.candidate_run_id, "release bootstrap qualification receipt candidate_run_id");
  assertRunId(receipt.qualification_run_id, "release bootstrap qualification receipt qualification_run_id");
  if (receipt.candidate_run_id === receipt.qualification_run_id) {
    throw new Error("release bootstrap qualification candidate and qualification runs must be different");
  }
  exactKeys(receipt.release, ["commit", "tag", "version"], "release bootstrap qualification receipt release");
  for (const field of ["commit", "tag", "version"]) {
    if (receipt.release[field] !== manifest.release[field]) {
      throw new Error(`release bootstrap qualification receipt ${field} does not match candidate manifest`);
    }
  }
  if (manifest.release.tag !== policy.baseline.tag || manifest.release.version !== policy.baseline.version) {
    throw new Error("release bootstrap qualification is only valid for the frozen baseline release");
  }
  exactKeys(
    receipt.bootstrap,
    ["legacy_release", "next_strict_from_tag", "policy_digest", "reason_code"],
    "release bootstrap qualification receipt bootstrap",
  );
  if (receipt.bootstrap.policy_digest !== computeReleaseBootstrapPolicyDigest(policy)) {
    throw new Error("release bootstrap qualification policy digest does not match the frozen policy");
  }
  if (receipt.bootstrap.reason_code !== policy.reason_code ||
      receipt.bootstrap.next_strict_from_tag !== policy.baseline.next_strict_from_tag) {
    throw new Error("release bootstrap qualification disposition does not match the frozen policy");
  }
  exactKeys(
    receipt.bootstrap.legacy_release,
    ["release_id", "tag", "tag_commit", "version"],
    "release bootstrap qualification receipt legacy_release",
  );
  for (const field of ["release_id", "tag", "tag_commit", "version"]) {
    if (receipt.bootstrap.legacy_release[field] !== policy.legacy_release[field]) {
      throw new Error(`release bootstrap qualification legacy_release.${field} does not match the frozen policy`);
    }
  }
  const expectedFreshTargets = requiredTargets(contract).map((target) => target.id).sort(UTF8_COMPARE);
  if (JSON.stringify(policy.required_fresh_targets) !== JSON.stringify(expectedFreshTargets)) {
    throw new Error("release bootstrap policy fresh targets do not match the artifact contract");
  }
  const actualFreshTargets = requiredArray(receipt.fresh_targets, "release bootstrap qualification receipt fresh_targets")
    .map((target, index) => {
      exactKeys(target, ["id", "status"], `release bootstrap qualification receipt fresh_targets[${index}]`);
      if (target.status !== "passed") throw new Error(`release bootstrap fresh target ${target.id} must be passed`);
      return requiredString(target.id, `release bootstrap qualification receipt fresh_targets[${index}].id`);
    });
  requireSortedUnique(actualFreshTargets, "release bootstrap qualification receipt fresh_targets");
  if (JSON.stringify(actualFreshTargets) !== JSON.stringify(expectedFreshTargets)) {
    throw new Error("release bootstrap qualification receipt fresh_targets must match all required release targets");
  }
  if (!Array.isArray(receipt.restart_targets) || receipt.restart_targets.length !== 0 || policy.required_restart_targets.length !== 0) {
    throw new Error("release bootstrap qualification receipt restart_targets must be empty");
  }
  exactKeys(receipt.restart_disposition, ["reason_code", "status"], "release bootstrap qualification receipt restart_disposition");
  if (receipt.restart_disposition.status !== "not_run" ||
      receipt.restart_disposition.reason_code !== "legacy-source-not-admissible") {
    throw new Error("release bootstrap qualification restart disposition must preserve the legacy gap");
  }
  return receipt;
}

const validateReceiptTargets = ({ receipt, key, expected, label }) => {
  const actual = requiredArray(receipt[key], `release update qualification receipt ${key}`)
    .map((target, index) => {
      exactKeys(target, ["id", "status"], `release update qualification receipt ${key}[${index}]`);
      if (target.status !== "passed") {
        throw new Error(`release update qualification ${key} target ${target.id} must be passed`);
      }
      return requiredString(target.id, `release update qualification receipt ${key}[${index}].id`);
    });
  requireSortedUnique(actual, `release update qualification receipt ${key}`, (value) => value);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`release update qualification receipt ${key} must match required targets`);
  }
};

const parseStableTag = (value, label) => {
  const match = STABLE_TAG_PATTERN.exec(requiredString(value, label));
  if (!match) throw new Error(`${label} must be a stable vX.Y.Z tag`);
  return match.slice(1).map(Number);
};

const compareVersionParts = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

export function validateReleaseUpdateQualificationReceipt(receipt, manifest, contract) {
  validateReleaseAssetManifest(manifest, contract);
  exactKeys(
    receipt,
    [
      "candidate_run_id",
      "fixture_source",
      "fresh_targets",
      "manifest_digest",
      "qualification_run_id",
      "release",
      "restart_targets",
      "schema",
      "status",
    ],
    "release update qualification receipt",
  );
  if (receipt.schema !== RELEASE_UPDATE_QUALIFICATION_SCHEMA) {
    throw new Error(`release update qualification receipt schema must be ${RELEASE_UPDATE_QUALIFICATION_SCHEMA}`);
  }
  if (receipt.status !== "passed") {
    throw new Error("release update qualification receipt status must be passed");
  }
  if (receipt.manifest_digest !== manifest.manifest_digest) {
    throw new Error("release update qualification receipt manifest_digest does not match candidate manifest");
  }
  if (receipt.candidate_run_id !== manifest.release.candidate_run_id) {
    throw new Error("release update qualification receipt candidate_run_id does not match candidate manifest");
  }
  assertRunId(receipt.candidate_run_id, "release update qualification receipt candidate_run_id");
  assertRunId(receipt.qualification_run_id, "release update qualification receipt qualification_run_id");
  exactKeys(receipt.release, ["commit", "tag", "version"], "release update qualification receipt release");
  for (const field of ["commit", "tag", "version"]) {
    if (receipt.release[field] !== manifest.release[field]) {
      throw new Error(`release update qualification receipt ${field} does not match candidate manifest`);
    }
  }
  exactKeys(receipt.fixture_source, ["from_commit", "from_tag", "from_version"], "release update qualification receipt fixture_source");
  const fromVersion = parseStableTag(receipt.fixture_source.from_tag, "release update qualification receipt fixture_source.from_tag");
  if (receipt.fixture_source.from_version !== fromVersion.join(".")) {
    throw new Error("release update qualification receipt fixture_source.from_version does not match from_tag");
  }
  if (!GIT_SHA_PATTERN.test(receipt.fixture_source.from_commit || "")) {
    throw new Error("release update qualification receipt fixture_source.from_commit must be a Git commit");
  }
  const toVersion = parseStableTag(manifest.release.tag, "candidate release tag");
  if (compareVersionParts(fromVersion, toVersion) >= 0) {
    throw new Error("release update qualification receipt fixture source must precede the candidate release");
  }
  validateReceiptTargets({
    receipt,
    key: "fresh_targets",
    expected: requiredTargets(contract).map((target) => target.id).sort(UTF8_COMPARE),
  });
  validateReceiptTargets({
    receipt,
    key: "restart_targets",
    expected: [...RESTART_UPDATE_TARGET_IDS].sort(UTF8_COMPARE),
  });
  return receipt;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
