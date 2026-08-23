const crypto = require("crypto");

const RUN_BUNDLE_V2_SCHEMA = "unchain.run_bundle.v2";
const RUN_BUNDLE_DETAILS_REF_SCHEMA = "unchain.run_bundle_details_ref.v1";
const RUN_BUNDLE_V2_MAX_BYTES = 512 * 1024;
const RUN_BUNDLE_V2_MAX_DETAILS_BYTES = 64 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const errorWithCode = (message) => {
  const error = new Error(`[run_bundle_v2_invalid] ${message}`);
  error.code = "run_bundle_v2_invalid";
  return error;
};

const stableObject = (value) => {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableObject(value[key])]),
  );
};

const canonicalize = (value) => JSON.stringify(stableObject(value));
const sha256 = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

const exactKeys = (value, keys, label) => {
  if (!isObject(value)) throw errorWithCode(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw errorWithCode(`${label} has unknown or missing fields`);
  }
};

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw errorWithCode(`${label} is invalid`);
  }
  return value;
};

const requireDigest = (value, label) => {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw errorWithCode(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
};

const requireCount = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw errorWithCode(`${label} must be a non-negative safe integer`);
  }
  return value;
};

const normalizeDetailsRef = (value) => {
  exactKeys(
    value,
    ["schema", "details_id", "facts_digest", "total_bytes", "parts"],
    "bundle.details_ref",
  );
  if (value.schema !== RUN_BUNDLE_DETAILS_REF_SCHEMA) {
    throw errorWithCode("bundle.details_ref.schema is unsupported");
  }
  requireText(value.details_id, "bundle.details_ref.details_id");
  if (!value.details_id.startsWith("rbd_")) {
    throw errorWithCode("bundle.details_ref.details_id is invalid");
  }
  requireDigest(value.facts_digest, "bundle.details_ref.facts_digest");
  requireCount(value.total_bytes, "bundle.details_ref.total_bytes");
  if (value.total_bytes > RUN_BUNDLE_V2_MAX_DETAILS_BYTES) {
    throw errorWithCode("bundle.details_ref.total_bytes exceeds the durable limit");
  }
  if (!Array.isArray(value.parts) || value.parts.length === 0 || value.parts.length > 8) {
    throw errorWithCode("bundle.details_ref.parts is invalid");
  }
  const names = new Set();
  value.parts.forEach((part, index) => {
    exactKeys(part, ["name", "item_count", "canonical_bytes", "root_sha256"], `bundle.details_ref.parts[${index}]`);
    requireText(part.name, `bundle.details_ref.parts[${index}].name`);
    if (names.has(part.name)) throw errorWithCode("bundle.details_ref.parts names must be unique");
    names.add(part.name);
    requireCount(part.item_count, `bundle.details_ref.parts[${index}].item_count`);
    requireCount(part.canonical_bytes, `bundle.details_ref.parts[${index}].canonical_bytes`);
    requireDigest(part.root_sha256, `bundle.details_ref.parts[${index}].root_sha256`);
  });
  return value;
};

const normalizeRunBundleV2 = (rawBundle, { verifyDigest = true } = {}) => {
  exactKeys(
    rawBundle,
    [
      "schema", "bundle_id", "revision", "bundle_digest", "identity", "lifecycle", "descriptor",
      "provider_call_count", "direct_provider_call_count", "descendant_provider_call_count",
      "aggregation_usage", "direct_usage", "descendant_usage", "metrics", "coverage", "cost",
      "legacy", "evidence", "children", "details_ref", "extensions",
    ],
    "run bundle v2",
  );
  if (rawBundle.schema !== RUN_BUNDLE_V2_SCHEMA) throw errorWithCode("schema is unsupported");
  requireText(rawBundle.bundle_id, "bundle.bundle_id");
  if (!Number.isSafeInteger(rawBundle.revision) || rawBundle.revision <= 0) {
    throw errorWithCode("bundle.revision is invalid");
  }
  requireDigest(rawBundle.bundle_digest, "bundle.bundle_digest");
  exactKeys(rawBundle.identity, ["execution_id", "attempt_id", "root_run_id", "run_id", "parent_run_id", "relation"], "bundle.identity");
  ["execution_id", "attempt_id", "root_run_id", "run_id", "relation"].forEach((field) => requireText(rawBundle.identity[field], `bundle.identity.${field}`));
  if (!["root", "subagent", "graph_node", "recipe_node", "auxiliary"].includes(rawBundle.identity.relation)) throw errorWithCode("bundle.identity.relation is unsupported");
  exactKeys(rawBundle.lifecycle, ["status", "started_at", "completed_at", "continued_from_run_id"], "bundle.lifecycle");
  requireText(rawBundle.lifecycle.status, "bundle.lifecycle.status");
  requireText(rawBundle.lifecycle.started_at, "bundle.lifecycle.started_at");
  if (rawBundle.lifecycle.completed_at !== null) requireText(rawBundle.lifecycle.completed_at, "bundle.lifecycle.completed_at");
  exactKeys(rawBundle.descriptor, ["model", "display_model", "active_agent", "agent_orchestration", "iteration"], "bundle.descriptor");
  ["model", "display_model", "active_agent", "agent_orchestration"].forEach((field) => requireText(rawBundle.descriptor[field], `bundle.descriptor.${field}`));
  requireCount(rawBundle.descriptor.iteration, "bundle.descriptor.iteration");
  ["aggregation_usage", "direct_usage", "descendant_usage", "metrics", "coverage", "cost", "legacy", "evidence", "children", "extensions"].forEach((field) => {
    if (!isObject(rawBundle[field])) throw errorWithCode(`bundle.${field} must be an object`);
  });
  ["provider_call_count", "direct_provider_call_count", "descendant_provider_call_count"].forEach((field) => requireCount(rawBundle[field], `bundle.${field}`));
  if (rawBundle.direct_provider_call_count + rawBundle.descendant_provider_call_count !== rawBundle.provider_call_count) {
    throw errorWithCode("provider call counts do not partition the total");
  }
  normalizeDetailsRef(rawBundle.details_ref);
  const body = { ...rawBundle };
  delete body.bundle_digest;
  const bodyBytes = canonicalize(body);
  if (Buffer.byteLength(bodyBytes, "utf8") > RUN_BUNDLE_V2_MAX_BYTES) {
    throw errorWithCode("bundle exceeds the canonical byte limit");
  }
  if (Buffer.byteLength(canonicalize(rawBundle), "utf8") > RUN_BUNDLE_V2_MAX_BYTES) {
    throw errorWithCode("bundle exceeds the canonical byte limit");
  }
  if (verifyDigest && sha256(bodyBytes) !== rawBundle.bundle_digest) {
    throw errorWithCode("bundle_digest does not match canonical body");
  }
  return JSON.parse(JSON.stringify(rawBundle));
};

const isRunBundleV2 = (value) =>
  isObject(value) && value.schema === RUN_BUNDLE_V2_SCHEMA;

module.exports = {
  RUN_BUNDLE_V2_SCHEMA,
  RUN_BUNDLE_DETAILS_REF_SCHEMA,
  RUN_BUNDLE_V2_MAX_BYTES,
  normalizeRunBundleV2,
  isRunBundleV2,
  canonicalizeRunBundleV2: canonicalize,
};
