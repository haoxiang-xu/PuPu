import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const ARTIFACT_EVIDENCE_SCHEMA =
  "pupu.release.unchain-artifact.v1";
export const RUNTIME_MANIFEST_SCHEMA =
  "unchain.runtime_protocol_manifest.v1";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const EVIDENCE_KEYS = Object.freeze([
  "artifact",
  "build",
  "runtime_manifest",
  "schema",
  "source",
]);
const ARTIFACT_KEYS = Object.freeze(["name", "sha256", "size_bytes"]);
const BUILD_KEYS = Object.freeze(["built_once", "wheel_count"]);
const SOURCE_KEYS = Object.freeze(["dirty", "ref", "repository", "revision"]);
const MANIFEST_KEYS = Object.freeze([
  "manifest_digest",
  "protocols",
  "runtime",
  "schema",
]);
const PROTOCOL_KEYS = Object.freeze(["features", "id", "major", "minor"]);
export const REQUIRED_RUNTIME_PROTOCOLS = Object.freeze({
  context_memory: Object.freeze([
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
  durable_interaction: Object.freeze([
    "cancel_pending",
    "expected_interaction_id_cas",
    "fresh_run_lineage",
    "host_controlled_resume",
  ]),
  provider_turn_ownership: Object.freeze([
    "atomic_receipt_cas",
    "auxiliary_calls",
    "enforce_mode",
    "graph_runs",
    "memory_off",
    "subagent_runs",
  ]),
  run_bundle: Object.freeze([
    "canonical_metrics",
    "completion_diagnostics_ref",
    "continuation_claim",
    "immutable_pricing_snapshot",
    "provider_call_set_union",
    "provider_call_usage_v1",
    "run_bundle_v1",
  ]),
});
const MANIFEST_DIGEST_DOMAIN =
  "unchain.runtime_protocol_manifest.v1\\u0000";

const utf8Compare = (left, right) => Buffer.compare(
  Buffer.from(left, "utf8"),
  Buffer.from(right, "utf8"),
);

const isUnicodeScalarString = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const canonicalJsonValue = (value, label = "manifest") => {
  if (typeof value === "string") {
    if (!isUnicodeScalarString(value)) {
      throw new Error(`${label} strings must contain only Unicode scalar values`);
    }
    if (value !== value.normalize("NFC")) {
      throw new Error(`${label} strings must be NFC-normalized`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalJsonValue(item, `${label}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(utf8Compare)
        .map((key) => {
          if (!isUnicodeScalarString(key)) {
            throw new Error(`${label} keys must contain only Unicode scalar values`);
          }
          if (key !== key.normalize("NFC")) {
            throw new Error(`${label} keys must be NFC-normalized`);
          }
          return [key, canonicalJsonValue(value[key], `${label}.${key}`)];
        }),
    );
  }
  if (
    value === null || typeof value === "boolean" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  ) {
    return value;
  }
  throw new Error(`${label} contains a non-canonical JSON value`);
};

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(
      `${label} keys must be exactly ${[...expected].sort().join(", ")}`,
    );
  }
};

const requiredString = (value, label) => {
  if (
    typeof value !== "string" || !value || !isUnicodeScalarString(value) ||
    value !== value.trim() ||
    value !== value.normalize("NFC")
  ) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const requiredCanonicalString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty NFC string`);
  }
  if (!isUnicodeScalarString(value)) {
    throw new Error(`${label} must contain only Unicode scalar values`);
  }
  if (value !== value.normalize("NFC")) {
    throw new Error(`${label} must be NFC-normalized`);
  }
  return value;
};

const requireSortedUniqueStrings = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      throw new Error(`${label} must be an array of non-empty strings`);
    }
    if (!isUnicodeScalarString(item)) {
      throw new Error(`${label} must contain only Unicode scalar values`);
    }
    if (item !== item.normalize("NFC")) {
      throw new Error(`${label} must contain only NFC-normalized strings`);
    }
  }
  const normalized = [...value];
  const canonical = [...new Set(normalized)].sort(utf8Compare);
  if (JSON.stringify(normalized) !== JSON.stringify(canonical)) {
    throw new Error(`${label} must be sorted and unique`);
  }
  return normalized;
};

export const hashFileSha256 = (filePath) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return `sha256:${hash.digest("hex")}`;
};

export const computeRuntimeManifestDigest = (manifest) => {
  const body = canonicalJsonValue({
    protocols: manifest.protocols,
    runtime: manifest.runtime,
    schema: manifest.schema,
  });
  const hash = crypto.createHash("sha256");
  hash.update(Buffer.from(MANIFEST_DIGEST_DOMAIN, "utf8"));
  hash.update(Buffer.from(JSON.stringify(body), "utf8"));
  return `sha256:${hash.digest("hex")}`;
};

export function validateRuntimeManifestForRelease(manifest) {
  exactKeys(manifest, MANIFEST_KEYS, "runtime manifest");
  if (manifest.schema !== RUNTIME_MANIFEST_SCHEMA) {
    throw new Error(`runtime manifest schema must be ${RUNTIME_MANIFEST_SCHEMA}`);
  }
  if (manifest.runtime !== "unchain") {
    throw new Error("runtime manifest runtime must be unchain");
  }
  if (!SHA256_PATTERN.test(manifest.manifest_digest)) {
    throw new Error("runtime manifest manifest_digest must be sha256:<64 hex>");
  }
  if (!Array.isArray(manifest.protocols) || manifest.protocols.length === 0) {
    throw new Error("runtime manifest protocols must be non-empty");
  }

  const protocolIds = [];
  const protocols = new Map();
  for (const [index, protocol] of manifest.protocols.entries()) {
    exactKeys(protocol, PROTOCOL_KEYS, `runtime manifest protocols[${index}]`);
    const id = requiredCanonicalString(
      protocol.id,
      `protocols[${index}].id`,
    );
    if (!Number.isSafeInteger(protocol.major) || protocol.major < 0) {
      throw new Error(`protocols[${index}].major must be a non-negative integer`);
    }
    if (!Number.isSafeInteger(protocol.minor) || protocol.minor < 0) {
      throw new Error(`protocols[${index}].minor must be a non-negative integer`);
    }
    const features = requireSortedUniqueStrings(
      protocol.features,
      `protocols[${index}].features`,
    );
    protocolIds.push(id);
    protocols.set(id, new Set(features));
  }
  if (
    JSON.stringify(protocolIds) !==
    JSON.stringify([...new Set(protocolIds)].sort(utf8Compare))
  ) {
    throw new Error("runtime manifest protocols must be sorted and unique by id");
  }

  const expectedDigest = computeRuntimeManifestDigest(manifest);
  if (manifest.manifest_digest !== expectedDigest) {
    throw new Error(
      `runtime manifest manifest_digest mismatch: expected ${expectedDigest}`,
    );
  }

  for (const [protocolId, requiredFeatures] of Object.entries(
    REQUIRED_RUNTIME_PROTOCOLS,
  )) {
    const protocol = manifest.protocols.find((item) => item.id === protocolId);
    if (!protocol) {
      throw new Error(`runtime manifest is missing protocol ${protocolId}`);
    }
    if (protocol.major !== 1) {
      throw new Error(`runtime manifest ${protocolId}.major must equal 1`);
    }
    if (protocol.minor < 0) {
      throw new Error(`runtime manifest ${protocolId}.minor is too low`);
    }
    for (const feature of requiredFeatures) {
      if (!protocols.get(protocolId)?.has(feature)) {
        throw new Error(
          `runtime manifest is missing ${protocolId}.${feature}`,
        );
      }
    }
  }
  return manifest;
}

const validateSource = (source) => {
  exactKeys(source, SOURCE_KEYS, "artifact source");
  requiredString(source.repository, "artifact source.repository");
  requiredString(source.ref, "artifact source.ref");
  if (!GIT_REVISION_PATTERN.test(source.revision)) {
    throw new Error("artifact source.revision must be a lowercase 40-character Git SHA");
  }
  if (source.dirty !== false) {
    throw new Error(
      source.dirty === true
        ? "artifact source provenance is dirty"
        : "artifact source provenance cleanliness is unknown",
    );
  }
};

export function buildUnchainArtifactEvidence({
  artifactPath,
  runtimeManifest,
  source,
} = {}) {
  if (!artifactPath || !fs.statSync(artifactPath).isFile()) {
    throw new Error("Unchain artifact path must be a file");
  }
  if (path.extname(artifactPath) !== ".whl") {
    throw new Error("Unchain artifact must be one wheel (.whl)");
  }
  validateRuntimeManifestForRelease(runtimeManifest);
  validateSource(source);
  const stat = fs.statSync(artifactPath);
  return {
    schema: ARTIFACT_EVIDENCE_SCHEMA,
    artifact: {
      name: path.basename(artifactPath),
      sha256: hashFileSha256(artifactPath),
      size_bytes: stat.size,
    },
    runtime_manifest: runtimeManifest,
    source: { ...source },
    build: {
      wheel_count: 1,
      built_once: true,
    },
  };
}

const validateEvidenceShape = (evidence) => {
  exactKeys(evidence, EVIDENCE_KEYS, "artifact evidence");
  if (evidence.schema !== ARTIFACT_EVIDENCE_SCHEMA) {
    throw new Error(`artifact evidence schema must be ${ARTIFACT_EVIDENCE_SCHEMA}`);
  }
  exactKeys(evidence.artifact, ARTIFACT_KEYS, "artifact evidence.artifact");
  if (!requiredString(evidence.artifact.name, "artifact evidence.artifact.name").endsWith(".whl")) {
    throw new Error("artifact evidence.artifact.name must identify a wheel");
  }
  if (!SHA256_PATTERN.test(evidence.artifact.sha256)) {
    throw new Error("artifact evidence.artifact.sha256 must be sha256:<64 hex>");
  }
  if (!Number.isSafeInteger(evidence.artifact.size_bytes) || evidence.artifact.size_bytes <= 0) {
    throw new Error("artifact evidence.artifact.size_bytes must be positive");
  }
  exactKeys(evidence.build, BUILD_KEYS, "artifact evidence.build");
  if (evidence.build.wheel_count !== 1 || evidence.build.built_once !== true) {
    throw new Error("artifact evidence must prove exactly one wheel build");
  }
  validateSource(evidence.source);
  validateRuntimeManifestForRelease(evidence.runtime_manifest);
};

export function readAndVerifyUnchainArtifactEvidence({
  artifactPath,
  evidencePath,
} = {}) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read Unchain artifact evidence: ${error.message}`);
  }
  validateEvidenceShape(evidence);
  const actualStat = fs.statSync(artifactPath);
  if (!actualStat.isFile()) {
    throw new Error("Unchain artifact path must be a file");
  }
  if (actualStat.size !== evidence.artifact.size_bytes) {
    throw new Error("Unchain artifact size mismatch");
  }
  if (hashFileSha256(artifactPath) !== evidence.artifact.sha256) {
    throw new Error("Unchain artifact SHA-256 mismatch");
  }
  if (path.basename(artifactPath) !== evidence.artifact.name) {
    throw new Error("Unchain artifact filename mismatch");
  }
  return evidence;
}

export function verifyUnchainTestSourceProvenance({
  sourcePath,
  evidence,
} = {}) {
  if (!sourcePath || !fs.existsSync(path.join(sourcePath, "tests"))) {
    throw new Error("UNCHAIN_TEST_SOURCE_PATH must contain Unchain tests");
  }
  const runGit = (args) => {
    const result = spawnSync("git", args, {
      cwd: sourcePath,
      encoding: "utf8",
    });
    if (result.status !== 0 || result.error) {
      const detail = String(
        result.stderr || result.stdout || result.error || "unknown failure",
      ).trim();
      throw new Error(`Unable to verify Unchain test source provenance: ${detail}`);
    }
    return String(result.stdout || "").trim();
  };
  const revision = runGit(["rev-parse", "HEAD"]);
  if (revision !== evidence?.source?.revision) {
    throw new Error(
      "Unchain test source revision does not match the immutable artifact",
    );
  }
  if (runGit(["status", "--porcelain=v1", "--untracked-files=all"])) {
    throw new Error("Unchain test source provenance is dirty");
  }
  return { revision, dirty: false };
}

export function inspectRuntimeManifestFromWheel({ artifactPath, python }) {
  const probe = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[1])",
    "from unchain.runtime.runtime_protocol import runtime_protocol_manifest",
    "print(json.dumps(runtime_protocol_manifest(), ensure_ascii=False, separators=(',', ':'), sort_keys=True))",
  ].join("; ");
  const result = spawnSync(python, ["-I", "-c", probe, artifactPath], {
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  if (result.status !== 0 || result.error) {
    const detail = String(result.stderr || result.stdout || result.error || "").trim();
    throw new Error(`Unable to import runtime manifest from wheel: ${detail}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Wheel runtime manifest output is not JSON: ${error.message}`);
  }
  return validateRuntimeManifestForRelease(manifest);
}

export function verifyWheelRuntimeManifest({
  artifactPath,
  evidencePath,
  python,
} = {}) {
  const evidence = readAndVerifyUnchainArtifactEvidence({
    artifactPath,
    evidencePath,
  });
  const importedManifest = inspectRuntimeManifestFromWheel({ artifactPath, python });
  if (JSON.stringify(importedManifest) !== JSON.stringify(evidence.runtime_manifest)) {
    throw new Error("Wheel runtime manifest does not match artifact evidence");
  }
  return evidence;
}

export function validateInstalledUnchainProbe(probe, evidence) {
  if (!probe || probe.distribution_name !== "unchain") {
    throw new Error("installed distribution must be named unchain");
  }
  requiredString(probe.module_origin, "installed Unchain module origin");
  validateRuntimeManifestForRelease(probe.manifest);
  if (JSON.stringify(probe.manifest) !== JSON.stringify(evidence.runtime_manifest)) {
    throw new Error("installed Unchain manifest does not match artifact evidence");
  }
  const directUrl = probe.direct_url;
  if (
    !directUrl || typeof directUrl !== "object" || directUrl.dir_info?.editable ||
    !directUrl.archive_info || typeof directUrl.url !== "string"
  ) {
    throw new Error("installed Unchain is editable or was not installed from the immutable wheel");
  }
  let installedName = "";
  try {
    installedName = path.basename(decodeURIComponent(new URL(directUrl.url).pathname));
  } catch {
    throw new Error("installed Unchain direct_url is invalid");
  }
  if (installedName !== evidence.artifact.name) {
    throw new Error("installed Unchain wheel filename does not match artifact evidence");
  }
  const expectedHex = evidence.artifact.sha256.slice("sha256:".length);
  const observedHex = directUrl.archive_info?.hashes?.sha256 ||
    String(directUrl.archive_info?.hash || "").replace(/^sha256=/, "");
  if (observedHex !== expectedHex) {
    throw new Error("installed Unchain archive hash does not match artifact evidence");
  }
  return probe;
}

export function verifyInstalledUnchainDistribution({ python, evidence }) {
  const probe = [
    "import importlib.metadata as metadata, json",
    "import unchain",
    "from unchain.runtime.runtime_protocol import runtime_protocol_manifest",
    "dist = metadata.distribution('unchain')",
    "raw_direct = dist.read_text('direct_url.json')",
    "print(json.dumps({'distribution_name': dist.metadata['Name'], 'module_origin': unchain.__file__, 'manifest': runtime_protocol_manifest(), 'direct_url': json.loads(raw_direct) if raw_direct else None}, ensure_ascii=False, separators=(',', ':'), sort_keys=True))",
  ].join("; ");
  const result = spawnSync(python, ["-I", "-c", probe], {
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  if (result.status !== 0 || result.error) {
    const detail = String(result.stderr || result.stdout || result.error || "").trim();
    throw new Error(`Unable to inspect installed Unchain distribution: ${detail}`);
  }
  let installedProbe;
  try {
    installedProbe = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Installed Unchain probe output is not JSON: ${error.message}`);
  }
  return validateInstalledUnchainProbe(installedProbe, evidence);
}
