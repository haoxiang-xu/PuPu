const crypto = require("crypto");

const RUN_BUNDLE_SCHEMA = "unchain.run_bundle.v1";
const PROVIDER_CALL_SCHEMA = "unchain.provider_call_usage.v1";
const RUN_BUNDLE_MAX_BYTES = 2 * 1024 * 1024;
const MAX_COLLECTION_ITEMS = 10000;
const MAX_METRIC_EVENTS = 50000;
const MAX_METRIC_EVIDENCE_REFS = 16;
const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 2048;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const SLUG_PATTERN = /^[a-z][a-z0-9_.-]{0,127}$/;
const EXTENSION_KEY_PATTERN =
  /^[a-z][a-z0-9.-]{1,127}\/[a-z][a-z0-9._-]{0,127}$/;

const RUN_BUNDLE_KEYS = Object.freeze([
  "schema",
  "bundle_id",
  "revision",
  "bundle_digest",
  "identity",
  "lifecycle",
  "descriptor",
  "metrics",
  "provider_calls",
  "children",
  "aggregation",
  "usage_slices",
  "coverage",
  "cost",
  "legacy",
  "evidence",
  "extensions",
]);

const USAGE_KEYS = Object.freeze(["input", "output", "total_tokens", "source"]);
const INPUT_USAGE_KEYS = Object.freeze([
  "uncached_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "cache_write_5m_tokens",
  "cache_write_1h_tokens",
  "total_tokens",
]);
const OUTPUT_USAGE_KEYS = Object.freeze([
  "visible_tokens",
  "reasoning_tokens",
  "total_tokens",
]);
const COVERAGE_KEYS = Object.freeze([
  "status",
  "receipt_count",
  "observed_usage_count",
  "missing_usage_count",
  "uncertain_call_count",
  "missing_usage_call_ids",
]);
const COST_KEYS = Object.freeze([
  "status",
  "basis",
  "amount_nano_usd",
  "currency",
  "pricing_snapshot_ids",
]);
const METRIC_COUNTER_KEYS = Object.freeze([
  "artifacts",
  "model_attempts",
  "iterations",
  "tool_calls",
  "tool_results",
  "interactions",
  "context_builds",
  "context_compactions",
  "errors",
]);
const METRIC_KIND_TO_COUNTER = Object.freeze({
  artifact: "artifacts",
  model_attempt: "model_attempts",
  iteration: "iterations",
  tool_call: "tool_calls",
  tool_result: "tool_results",
  interaction: "interactions",
  context_build: "context_builds",
  context_compaction: "context_compactions",
  error: "errors",
});

const FORBIDDEN_EXTENSION_KEYS = new Set([
  "prompt",
  "raw_prompt",
  "system_prompt",
  "messages",
  "request",
  "raw_request",
  "raw_payload",
  "provider_request",
  "response",
  "raw_response",
  "reasoning",
  "reasoning_content",
  "reasoning_item",
  "reasoning_items",
  "chain_of_thought",
  "secret",
  "secrets",
  "api_key",
  "authorization",
  "credential",
  "credentials",
  "password",
  "artifact_bytes",
  "attachment",
  "attachments",
  "tool_output",
  "tool_outputs",
]);

class RunBundleContractError extends Error {
  constructor(message, path = "bundle", code = "run_bundle_storage_invalid") {
    super(`[${code}] ${path}: ${message}`);
    this.name = "RunBundleContractError";
    this.code = code;
    this.path = path;
  }
}

const fail = (path, message, code) => {
  throw new RunBundleContractError(message, path, code);
};

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const assertExactKeys = (value, keys, path) => {
  if (!isPlainObject(value)) fail(path, "must be a plain object");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(path, `unexpected key set (${actual.join(",")})`);
  }
};

const stringValue = (value, path, { nullable = false, max = MAX_TEXT_LENGTH } = {}) => {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    fail(path, nullable ? "must be null or a bounded non-empty string" : "must be a bounded non-empty string");
  }
  if (value.normalize("NFC") !== value || [...value].some((character) => character.codePointAt(0) < 32)) {
    fail(path, "must be canonical NFC text without control characters");
  }
  return value;
};

const slugValue = (value, path) => {
  const normalized = stringValue(value, path, { max: 128 });
  if (!SLUG_PATTERN.test(normalized)) fail(path, "must be a canonical slug");
  return normalized;
};

const enumValue = (value, allowed, path, { nullable = false } = {}) => {
  if (value === null && nullable) return null;
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join("|")}`);
  return value;
};

const nullableCount = (value, path) => {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(path, "must be null or a non-negative safe integer");
  }
  return value;
};

const requiredCount = (value, path) => {
  const normalized = nullableCount(value, path);
  if (normalized === null) fail(path, "must be a non-negative safe integer");
  return normalized;
};

const positiveCount = (value, path, { nullable = false } = {}) => {
  const normalized = nullableCount(value, path);
  if (normalized === null && nullable) return null;
  if (normalized === null || normalized <= 0) {
    fail(path, nullable ? "must be null or a positive safe integer" : "must be a positive safe integer");
  }
  return normalized;
};

const sha256Value = (value, path, { nullable = false } = {}) => {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, nullable ? "must be null or a lowercase sha256" : "must be a lowercase sha256");
  }
  return value;
};

const timestampInstant = (value, path) => {
  const match = typeof value === "string" ? value.match(RFC3339_PATTERN) : null;
  if (!match) fail(path, "must be a valid RFC3339 timestamp");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || hour > 23 || minute > 59 || second > 59) {
    fail(path, "must be a valid RFC3339 timestamp");
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    fail(path, "must be a valid RFC3339 timestamp");
  }
  const fractionNanoseconds = BigInt((match[7] || "").padEnd(9, "0") || "0");
  let instant = BigInt(date.getTime()) * 1_000_000n + fractionNanoseconds;
  if (match[8] !== "Z") {
    const offsetHours = Number(match[8].slice(1, 3));
    const offsetMinutes = Number(match[8].slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) {
      fail(path, "must be a valid RFC3339 timestamp");
    }
    const offset = BigInt((offsetHours * 60 + offsetMinutes) * 60) * 1_000_000_000n;
    instant += match[8][0] === "+" ? -offset : offset;
  }
  return instant;
};

const timestampValue = (value, path, { nullable = true } = {}) => {
  if (value === null && nullable) return null;
  timestampInstant(value, path);
  return value;
};

const uniqueStringList = (
  value,
  path,
  { sha256 = false, maxStringLength = MAX_ID_LENGTH } = {},
) => {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION_ITEMS) {
    fail(path, "must be a bounded array");
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = sha256
      ? sha256Value(item, `${path}[${index}]`)
      : stringValue(item, `${path}[${index}]`, { max: maxStringLength });
    if (seen.has(normalized)) fail(`${path}[${index}]`, "must be unique");
    seen.add(normalized);
    return normalized;
  }).sort();
};

const normalizeJsonValue = (value, path, depth = 0) => {
  if (depth > 12) fail(path, "extension nesting is too deep");
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string" && value.length > 16384) {
      fail(path, "extension string is too long");
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(path, "extension number must be a safe integer");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 1000) fail(path, "extension array is too large");
    return value.map((item, index) =>
      normalizeJsonValue(item, `${path}[${index}]`, depth + 1),
    );
  }
  if (!isPlainObject(value)) fail(path, "extension value must be strict JSON");
  const keys = Object.keys(value);
  if (keys.length > 1000) fail(path, "extension object is too large");
  const normalized = {};
  for (const key of keys.sort()) {
    if (FORBIDDEN_EXTENSION_KEYS.has(key.toLowerCase())) {
      fail(`${path}.${key}`, "payload field is forbidden in renderer-safe extensions");
    }
    normalized[key] = normalizeJsonValue(value[key], `${path}.${key}`, depth + 1);
  }
  return normalized;
};

const normalizeExtensions = (value, path) => {
  if (!isPlainObject(value)) fail(path, "must be a plain object");
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    if (!EXTENSION_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, "must use the approved namespaced extension key format");
    }
    normalized[key] = normalizeJsonValue(value[key], `${path}.${key}`);
  }
  return normalized;
};

const normalizeUsage = (value, path) => {
  assertExactKeys(value, USAGE_KEYS, path);
  assertExactKeys(value.input, INPUT_USAGE_KEYS, `${path}.input`);
  assertExactKeys(value.output, OUTPUT_USAGE_KEYS, `${path}.output`);

  const input = {
    uncached_tokens: nullableCount(value.input.uncached_tokens, `${path}.input.uncached_tokens`),
    cache_read_tokens: nullableCount(value.input.cache_read_tokens, `${path}.input.cache_read_tokens`),
    cache_write_tokens: nullableCount(value.input.cache_write_tokens, `${path}.input.cache_write_tokens`),
    cache_write_5m_tokens: nullableCount(value.input.cache_write_5m_tokens, `${path}.input.cache_write_5m_tokens`),
    cache_write_1h_tokens: nullableCount(value.input.cache_write_1h_tokens, `${path}.input.cache_write_1h_tokens`),
    total_tokens: nullableCount(value.input.total_tokens, `${path}.input.total_tokens`),
  };
  const output = {
    visible_tokens: nullableCount(value.output.visible_tokens, `${path}.output.visible_tokens`),
    reasoning_tokens: nullableCount(value.output.reasoning_tokens, `${path}.output.reasoning_tokens`),
    total_tokens: nullableCount(value.output.total_tokens, `${path}.output.total_tokens`),
  };
  const totalTokens = nullableCount(value.total_tokens, `${path}.total_tokens`);
  const source = enumValue(
    value.source,
    ["provider_observed", "provider_observed_partial", "legacy_partial", "unavailable"],
    `${path}.source`,
  );

  const inputParts = [input.uncached_tokens, input.cache_read_tokens, input.cache_write_tokens];
  const knownInputSum = inputParts.reduce((sum, count) => sum + (count ?? 0), 0);
  if (input.total_tokens !== null && knownInputSum > input.total_tokens) {
    fail(`${path}.input.total_tokens`, "cannot be smaller than known disjoint input parts");
  }
  if (inputParts.every((count) => count !== null) && input.total_tokens !== knownInputSum) {
    fail(`${path}.input.total_tokens`, "must equal the disjoint input parts");
  }
  if (
    input.cache_write_5m_tokens !== null &&
    input.cache_write_1h_tokens !== null &&
    input.cache_write_tokens !==
      input.cache_write_5m_tokens + input.cache_write_1h_tokens
  ) {
    fail(
      `${path}.input.cache_write_tokens`,
      "must equal cache_write_5m_tokens + cache_write_1h_tokens when both are known",
    );
  }

  const outputParts = [output.visible_tokens, output.reasoning_tokens];
  const knownOutputSum = outputParts.reduce((sum, count) => sum + (count ?? 0), 0);
  if (output.total_tokens !== null && knownOutputSum > output.total_tokens) {
    fail(`${path}.output.total_tokens`, "cannot be smaller than known disjoint output parts");
  }
  if (outputParts.every((count) => count !== null) && output.total_tokens !== knownOutputSum) {
    fail(`${path}.output.total_tokens`, "must equal the disjoint output parts");
  }

  if (
    totalTokens !== null &&
    input.total_tokens !== null &&
    output.total_tokens !== null &&
    totalTokens !== input.total_tokens + output.total_tokens
  ) {
    fail(`${path}.total_tokens`, "must equal input.total_tokens + output.total_tokens");
  }
  return { input, output, total_tokens: totalTokens, source };
};

const normalizeCoverage = (value, path) => {
  assertExactKeys(value, COVERAGE_KEYS, path);
  const normalized = {
    status: enumValue(value.status, ["complete", "partial", "unavailable"], `${path}.status`),
    receipt_count: requiredCount(value.receipt_count, `${path}.receipt_count`),
    observed_usage_count: requiredCount(value.observed_usage_count, `${path}.observed_usage_count`),
    missing_usage_count: requiredCount(value.missing_usage_count, `${path}.missing_usage_count`),
    uncertain_call_count: requiredCount(value.uncertain_call_count, `${path}.uncertain_call_count`),
    missing_usage_call_ids: uniqueStringList(value.missing_usage_call_ids, `${path}.missing_usage_call_ids`),
  };
  if (normalized.observed_usage_count + normalized.missing_usage_count !== normalized.receipt_count) {
    fail(path, "observed_usage_count + missing_usage_count must equal receipt_count");
  }
  if (normalized.missing_usage_call_ids.length !== normalized.missing_usage_count) {
    fail(`${path}.missing_usage_call_ids`, "length must equal missing_usage_count");
  }
  if (normalized.uncertain_call_count > normalized.receipt_count) {
    fail(`${path}.uncertain_call_count`, "cannot exceed receipt_count");
  }
  const expectedStatus =
    normalized.observed_usage_count === 0
      ? "unavailable"
      : normalized.missing_usage_count === 0
        ? "complete"
        : "partial";
  if (normalized.status !== expectedStatus) {
    fail(`${path}.status`, "must agree with observed and missing usage counts");
  }
  return normalized;
};

const normalizeBundleCost = (value, path) => {
  assertExactKeys(value, COST_KEYS, path);
  const status = enumValue(value.status, ["estimated", "partial", "unavailable"], `${path}.status`);
  const basis = enumValue(value.basis, ["list_price_estimate"], `${path}.basis`, { nullable: true });
  const amount = nullableCount(value.amount_nano_usd, `${path}.amount_nano_usd`);
  const currency = enumValue(value.currency, ["USD"], `${path}.currency`, { nullable: true });
  const pricingSnapshotIds = uniqueStringList(
    value.pricing_snapshot_ids,
    `${path}.pricing_snapshot_ids`,
  );
  if (
    (status === "estimated" || status === "partial") &&
    (basis === null || amount === null || currency !== "USD")
  ) {
    fail(path, "estimated/partial cost requires basis, amount_nano_usd, and USD currency");
  }
  if (status === "unavailable" && (basis !== null || amount !== null || currency !== null)) {
    fail(path, "unavailable cost must keep basis, amount, and currency null");
  }
  return {
    status,
    basis,
    amount_nano_usd: amount,
    currency,
    pricing_snapshot_ids: pricingSnapshotIds,
  };
};

const normalizePricingSnapshot = (value, path) => {
  if (value === null) return null;
  const keys = [
    "snapshot_id",
    "catalog_version",
    "catalog_sha256",
    "source_url",
    "source_sha256",
    "effective_from",
    "effective_until",
    "currency",
    "provider",
    "billing_surface",
    "model",
    "service_tier",
    "batch",
    "inference_geo",
    "rates",
    "long_context_rule",
  ];
  assertExactKeys(value, keys, path);
  const rateKeys = [
    "input_uncached_nano_usd_per_million",
    "input_cache_read_nano_usd_per_million",
    "input_cache_write_nano_usd_per_million",
    "input_cache_write_5m_nano_usd_per_million",
    "input_cache_write_1h_nano_usd_per_million",
    "output_nano_usd_per_million",
  ];
  assertExactKeys(value.rates, rateKeys, `${path}.rates`);
  const rates = {};
  for (const key of rateKeys) rates[key] = nullableCount(value.rates[key], `${path}.rates.${key}`);
  let longContextRule = null;
  if (value.long_context_rule !== null) {
    assertExactKeys(
      value.long_context_rule,
      ["threshold_input_tokens", "input_multiplier_ppm", "output_multiplier_ppm"],
      `${path}.long_context_rule`,
    );
    longContextRule = {
      threshold_input_tokens: positiveCount(
        value.long_context_rule.threshold_input_tokens,
        `${path}.long_context_rule.threshold_input_tokens`,
      ),
      input_multiplier_ppm: positiveCount(
        value.long_context_rule.input_multiplier_ppm,
        `${path}.long_context_rule.input_multiplier_ppm`,
      ),
      output_multiplier_ppm: positiveCount(
        value.long_context_rule.output_multiplier_ppm,
        `${path}.long_context_rule.output_multiplier_ppm`,
      ),
    };
  }
  if (typeof value.batch !== "boolean") fail(`${path}.batch`, "must be a boolean");
  if (typeof value.source_url !== "string" || !value.source_url.startsWith("https://")) {
    fail(`${path}.source_url`, "must use HTTPS");
  }
  const normalized = {
    snapshot_id: stringValue(value.snapshot_id, `${path}.snapshot_id`, { max: MAX_ID_LENGTH }),
    catalog_version: stringValue(value.catalog_version, `${path}.catalog_version`, { max: 256 }),
    catalog_sha256: sha256Value(value.catalog_sha256, `${path}.catalog_sha256`),
    source_url: stringValue(value.source_url, `${path}.source_url`, { max: 2048 }),
    source_sha256: sha256Value(value.source_sha256, `${path}.source_sha256`),
    effective_from: timestampValue(value.effective_from, `${path}.effective_from`, { nullable: false }),
    effective_until: timestampValue(value.effective_until, `${path}.effective_until`),
    currency: enumValue(value.currency, ["USD"], `${path}.currency`),
    provider: slugValue(value.provider, `${path}.provider`),
    billing_surface: slugValue(value.billing_surface, `${path}.billing_surface`),
    model: stringValue(value.model, `${path}.model`, { max: 256 }),
    service_tier: slugValue(value.service_tier, `${path}.service_tier`),
    batch: value.batch,
    inference_geo: slugValue(value.inference_geo, `${path}.inference_geo`),
    rates,
    long_context_rule: longContextRule,
  };
  if (
    normalized.effective_until !== null &&
    timestampInstant(normalized.effective_until, `${path}.effective_until`) <=
      timestampInstant(normalized.effective_from, `${path}.effective_from`)
  ) {
    fail(`${path}.effective_until`, "must follow effective_from");
  }
  const { snapshot_id: _ignored, ...snapshotBody } = normalized;
  const expectedSnapshotId = `price_${canonicalSha256(snapshotBody)}`;
  if (normalized.snapshot_id !== expectedSnapshotId) {
    fail(`${path}.snapshot_id`, "does not match the immutable pricing snapshot");
  }
  return normalized;
};

const normalizeReceiptPricing = (value, path) => {
  const keys = [
    "status",
    "basis",
    "snapshot",
    "amount_nano_usd",
    "reason",
    "input_multiplier_ppm",
    "output_multiplier_ppm",
  ];
  assertExactKeys(value, keys, path);
  const status = enumValue(value.status, ["estimated", "unavailable"], `${path}.status`);
  const basis = enumValue(value.basis, ["list_price_estimate"], `${path}.basis`, { nullable: true });
  const snapshot = normalizePricingSnapshot(value.snapshot, `${path}.snapshot`);
  const amount = nullableCount(value.amount_nano_usd, `${path}.amount_nano_usd`);
  const reason = stringValue(value.reason, `${path}.reason`, { nullable: true, max: 512 });
  const inputMultiplier = positiveCount(
    value.input_multiplier_ppm,
    `${path}.input_multiplier_ppm`,
    { nullable: true },
  );
  const outputMultiplier = positiveCount(
    value.output_multiplier_ppm,
    `${path}.output_multiplier_ppm`,
    { nullable: true },
  );
  if (
    status === "estimated" &&
    (basis === null ||
      snapshot === null ||
      amount === null ||
      inputMultiplier === null ||
      outputMultiplier === null ||
      reason !== null)
  ) {
    fail(path, "estimated pricing requires snapshot, amount, positive multipliers, and null reason");
  }
  if (
    status === "unavailable" &&
    (basis !== null ||
      amount !== null ||
      inputMultiplier !== null ||
      outputMultiplier !== null ||
      reason === null)
  ) {
    fail(path, "unavailable pricing requires null price fields and a non-null reason");
  }
  return {
    status,
    basis,
    snapshot,
    amount_nano_usd: amount,
    reason,
    input_multiplier_ppm: inputMultiplier,
    output_multiplier_ppm: outputMultiplier,
  };
};

const normalizeReceipt = (value, path) => {
  const keys = [
    "schema",
    "provider_call_id",
    "identity",
    "provider",
    "status",
    "timing",
    "provider_ids",
    "billing_dimensions",
    "usage",
    "raw_usage_sha256",
    "pricing",
    "extensions",
  ];
  assertExactKeys(value, keys, path);
  if (value.schema !== PROVIDER_CALL_SCHEMA) fail(`${path}.schema`, `must equal ${PROVIDER_CALL_SCHEMA}`);
  const identityKeys = [
    "execution_id",
    "attempt_id",
    "root_run_id",
    "owner_run_id",
    "parent_run_id",
    "iteration",
    "retry_ordinal",
    "purpose",
    "request_sha256",
    "route",
  ];
  assertExactKeys(value.identity, identityKeys, `${path}.identity`);
  const providerKeys = ["name", "model", "service_tier"];
  assertExactKeys(value.provider, providerKeys, `${path}.provider`);
  const purpose = slugValue(value.identity.purpose, `${path}.identity.purpose`);
  const provider = {
    name: slugValue(value.provider.name, `${path}.provider.name`),
    model: stringValue(value.provider.model, `${path}.provider.model`, { max: 256 }),
    service_tier:
      value.provider.service_tier === null
        ? null
        : slugValue(value.provider.service_tier, `${path}.provider.service_tier`),
  };
  const status = enumValue(
    value.status,
    ["completed", "failed", "uncertain"],
    `${path}.status`,
  );
  assertExactKeys(value.timing, ["started_at", "completed_at"], `${path}.timing`);
  const timing = {
    started_at: timestampValue(value.timing.started_at, `${path}.timing.started_at`),
    completed_at: timestampValue(
      value.timing.completed_at,
      `${path}.timing.completed_at`,
    ),
  };
  if (timing.completed_at !== null && timing.started_at === null) {
    fail(`${path}.timing.completed_at`, "requires started_at");
  }
  if (
    timing.started_at !== null &&
    timing.completed_at !== null &&
    timestampInstant(timing.completed_at, `${path}.timing.completed_at`) <
      timestampInstant(timing.started_at, `${path}.timing.started_at`)
  ) {
    fail(`${path}.timing.completed_at`, "must not precede started_at");
  }
  if (
    ["completed", "failed"].includes(status) &&
    (timing.started_at === null || timing.completed_at === null)
  ) {
    fail(
      `${path}.timing`,
      "completed/failed provider timing requires started_at and completed_at",
    );
  }
  assertExactKeys(
    value.provider_ids,
    ["request_id_sha256", "response_id_sha256"],
    `${path}.provider_ids`,
  );
  const providerIds = {
    request_id_sha256: sha256Value(
      value.provider_ids.request_id_sha256,
      `${path}.provider_ids.request_id_sha256`,
      { nullable: true },
    ),
    response_id_sha256: sha256Value(
      value.provider_ids.response_id_sha256,
      `${path}.provider_ids.response_id_sha256`,
      { nullable: true },
    ),
  };
  assertExactKeys(
    value.billing_dimensions,
    ["billing_surface", "batch", "inference_geo"],
    `${path}.billing_dimensions`,
  );
  if (
    value.billing_dimensions.batch !== null &&
    typeof value.billing_dimensions.batch !== "boolean"
  ) {
    fail(`${path}.billing_dimensions.batch`, "must be a boolean or null");
  }
  const billingDimensions = {
    billing_surface:
      value.billing_dimensions.billing_surface === null
        ? null
        : slugValue(
            value.billing_dimensions.billing_surface,
            `${path}.billing_dimensions.billing_surface`,
          ),
    batch: value.billing_dimensions.batch,
    inference_geo:
      value.billing_dimensions.inference_geo === null
        ? null
        : slugValue(
            value.billing_dimensions.inference_geo,
            `${path}.billing_dimensions.inference_geo`,
          ),
  };
  const pricing = normalizeReceiptPricing(value.pricing, `${path}.pricing`);
  if (
    pricing.snapshot !== null &&
    (pricing.snapshot.provider !== provider.name ||
      pricing.snapshot.model !== provider.model ||
      pricing.snapshot.service_tier !== provider.service_tier ||
      pricing.snapshot.billing_surface !== billingDimensions.billing_surface ||
      pricing.snapshot.batch !== billingDimensions.batch ||
      pricing.snapshot.inference_geo !== billingDimensions.inference_geo)
  ) {
    fail(
      `${path}.pricing.snapshot`,
      "provider/model/tier/billing dimensions must match the receipt",
    );
  }
  const normalized = {
    schema: PROVIDER_CALL_SCHEMA,
    provider_call_id: stringValue(value.provider_call_id, `${path}.provider_call_id`, { max: MAX_ID_LENGTH }),
    identity: {
      execution_id: stringValue(value.identity.execution_id, `${path}.identity.execution_id`, { max: MAX_ID_LENGTH }),
      attempt_id: stringValue(value.identity.attempt_id, `${path}.identity.attempt_id`, { max: MAX_ID_LENGTH }),
      root_run_id: stringValue(value.identity.root_run_id, `${path}.identity.root_run_id`, { max: MAX_ID_LENGTH }),
      owner_run_id: stringValue(value.identity.owner_run_id, `${path}.identity.owner_run_id`, { max: MAX_ID_LENGTH }),
      parent_run_id: stringValue(value.identity.parent_run_id, `${path}.identity.parent_run_id`, { nullable: true, max: MAX_ID_LENGTH }),
      iteration: requiredCount(value.identity.iteration, `${path}.identity.iteration`),
      retry_ordinal: requiredCount(value.identity.retry_ordinal, `${path}.identity.retry_ordinal`),
      purpose,
      request_sha256: sha256Value(value.identity.request_sha256, `${path}.identity.request_sha256`),
      route: slugValue(value.identity.route, `${path}.identity.route`),
    },
    provider,
    status,
    timing,
    provider_ids: providerIds,
    billing_dimensions: billingDimensions,
    usage: normalizeUsage(value.usage, `${path}.usage`),
    raw_usage_sha256: sha256Value(value.raw_usage_sha256, `${path}.raw_usage_sha256`, { nullable: true }),
    pricing,
    extensions: normalizeExtensions(value.extensions, `${path}.extensions`),
  };
  if (
    normalized.identity.owner_run_id === normalized.identity.root_run_id &&
    normalized.identity.parent_run_id !== null
  ) {
    fail(`${path}.identity.parent_run_id`, "root provider calls require a null parent_run_id");
  }
  if (
    normalized.identity.owner_run_id !== normalized.identity.root_run_id &&
    normalized.identity.parent_run_id === null
  ) {
    fail(`${path}.identity.parent_run_id`, "child provider calls require a parent_run_id");
  }
  const expectedProviderCallId = deterministicProviderCallId(normalized);
  if (normalized.provider_call_id !== expectedProviderCallId) {
    fail(`${path}.provider_call_id`, "does not match its deterministic identity");
  }
  return normalized;
};

const normalizeIdentity = (value, path) => {
  const keys = ["execution_id", "attempt_id", "root_run_id", "run_id", "parent_run_id", "relation"];
  assertExactKeys(value, keys, path);
  return {
    execution_id: stringValue(value.execution_id, `${path}.execution_id`, { max: MAX_ID_LENGTH }),
    attempt_id: stringValue(value.attempt_id, `${path}.attempt_id`, { max: MAX_ID_LENGTH }),
    root_run_id: stringValue(value.root_run_id, `${path}.root_run_id`, { max: MAX_ID_LENGTH }),
    run_id: stringValue(value.run_id, `${path}.run_id`, { max: MAX_ID_LENGTH }),
    parent_run_id: stringValue(value.parent_run_id, `${path}.parent_run_id`, { nullable: true, max: MAX_ID_LENGTH }),
    relation: enumValue(value.relation, ["root", "subagent", "graph_node", "recipe_node", "auxiliary"], `${path}.relation`),
  };
};

const normalizeLifecycle = (value, path) => {
  const keys = ["status", "started_at", "completed_at", "continued_from_run_id"];
  assertExactKeys(value, keys, path);
  const normalized = {
    status: enumValue(value.status, ["running", "completed", "failed", "suspended", "cancelled", "uncertain"], `${path}.status`),
    started_at: timestampValue(value.started_at, `${path}.started_at`),
    completed_at: timestampValue(value.completed_at, `${path}.completed_at`),
    continued_from_run_id: stringValue(value.continued_from_run_id, `${path}.continued_from_run_id`, { nullable: true, max: MAX_ID_LENGTH }),
  };
  if (normalized.started_at === null) {
    fail(`${path}.started_at`, "is required");
  }
  if (normalized.status === "running" && normalized.completed_at !== null) {
    fail(`${path}.completed_at`, "running lifecycle requires null completed_at");
  }
  if (
    ["completed", "failed", "suspended", "cancelled"].includes(
      normalized.status,
    ) &&
    normalized.completed_at === null
  ) {
    fail(`${path}.completed_at`, "terminal lifecycle requires completed_at");
  }
  if (
    normalized.started_at !== null &&
    normalized.completed_at !== null &&
    timestampInstant(normalized.completed_at, `${path}.completed_at`) <
      timestampInstant(normalized.started_at, `${path}.started_at`)
  ) {
    fail(`${path}.completed_at`, "must not precede started_at");
  }
  return normalized;
};

const normalizeDescriptor = (value, path) => {
  const keys = [
    "model",
    "display_model",
    "active_agent",
    "agent_orchestration",
    "iteration",
  ];
  assertExactKeys(value, keys, path);
  return {
    model: stringValue(value.model, `${path}.model`, { max: 256 }),
    display_model: stringValue(value.display_model, `${path}.display_model`, {
      max: 256,
    }),
    active_agent: stringValue(value.active_agent, `${path}.active_agent`, {
      max: 256,
    }),
    agent_orchestration: enumValue(
      value.agent_orchestration,
      ["default", "developer_waiting_approval"],
      `${path}.agent_orchestration`,
    ),
    iteration: requiredCount(value.iteration, `${path}.iteration`),
  };
};

const normalizeMetricCounters = (value, path) => {
  assertExactKeys(value, METRIC_COUNTER_KEYS, path);
  const normalized = {};
  for (const key of METRIC_COUNTER_KEYS) {
    normalized[key] = requiredCount(value[key], `${path}.${key}`);
  }
  return normalized;
};

const deterministicMetricEventId = (event) =>
  `me_${canonicalSha256({
    domain: "unchain.metric_event_id.v1",
    execution_id: event.execution_id,
    attempt_id: event.attempt_id,
    root_run_id: event.root_run_id,
    owner_run_id: event.owner_run_id,
    parent_run_id: event.parent_run_id,
    kind: event.kind,
    subject_id: event.subject_id,
  })}`;

const normalizeMetricEvent = (value, path) => {
  const keys = [
    "metric_event_id",
    "execution_id",
    "attempt_id",
    "root_run_id",
    "owner_run_id",
    "parent_run_id",
    "kind",
    "subject_id",
    "outcome",
    "error",
    "evidence_refs",
  ];
  assertExactKeys(value, keys, path);
  let error = null;
  if (value.error !== null) {
    assertExactKeys(value.error, ["category", "code"], `${path}.error`);
    error = {
      category: slugValue(value.error.category, `${path}.error.category`),
      code: slugValue(value.error.code, `${path}.error.code`),
    };
  }
  if (!Array.isArray(value.evidence_refs)) {
    fail(`${path}.evidence_refs`, "must be an exact array");
  }
  if (value.evidence_refs.length > MAX_METRIC_EVIDENCE_REFS) {
    fail(`${path}.evidence_refs`, "exceeds the metric evidence reference limit");
  }
  const evidenceRefs = value.evidence_refs
    .map((item, index) => {
      const itemPath = `${path}.evidence_refs[${index}]`;
      assertExactKeys(item, ["kind", "ref_id"], itemPath);
      const kind = enumValue(
        item.kind,
        ["artifact", "interaction", "context_event"],
        `${itemPath}.kind`,
      );
      const refId = stringValue(item.ref_id, `${itemPath}.ref_id`, { max: 256 });
      if (!new RegExp(`^${kind}_[a-f0-9]{64}$`).test(refId)) {
        fail(
          `${itemPath}.ref_id`,
          "must be a kind-bound opaque sha256 id",
        );
      }
      return { kind, ref_id: refId };
    })
    .sort((left, right) =>
      left.kind === right.kind
        ? left.ref_id.localeCompare(right.ref_id)
        : left.kind.localeCompare(right.kind),
    );
  if (
    new Set(evidenceRefs.map((item) => `${item.kind}\u0000${item.ref_id}`)).size !==
    evidenceRefs.length
  ) {
    fail(`${path}.evidence_refs`, "must be unique");
  }
  const normalized = {
    metric_event_id: stringValue(value.metric_event_id, `${path}.metric_event_id`, {
      max: 256,
    }),
    execution_id: stringValue(value.execution_id, `${path}.execution_id`, {
      max: MAX_ID_LENGTH,
    }),
    attempt_id: stringValue(value.attempt_id, `${path}.attempt_id`, {
      max: MAX_ID_LENGTH,
    }),
    root_run_id: stringValue(value.root_run_id, `${path}.root_run_id`, {
      max: MAX_ID_LENGTH,
    }),
    owner_run_id: stringValue(value.owner_run_id, `${path}.owner_run_id`, {
      max: MAX_ID_LENGTH,
    }),
    parent_run_id: stringValue(value.parent_run_id, `${path}.parent_run_id`, {
      nullable: true,
      max: MAX_ID_LENGTH,
    }),
    kind: enumValue(
      value.kind,
      Object.keys(METRIC_KIND_TO_COUNTER),
      `${path}.kind`,
    ),
    subject_id: stringValue(value.subject_id, `${path}.subject_id`, { max: 256 }),
    outcome: enumValue(
      value.outcome,
      ["completed", "failed", "uncertain", "requested", "skipped"],
      `${path}.outcome`,
    ),
    error,
    evidence_refs: evidenceRefs,
  };
  if (error !== null && !["failed", "uncertain"].includes(normalized.outcome)) {
    fail(`${path}.error`, "requires a failed or uncertain outcome");
  }
  if (normalized.metric_event_id !== deterministicMetricEventId(normalized)) {
    fail(`${path}.metric_event_id`, "does not match its deterministic identity");
  }
  return normalized;
};

const metricCountersFromEvents = (events, path) => {
  const counters = Object.fromEntries(METRIC_COUNTER_KEYS.map((key) => [key, 0]));
  for (const event of events) {
    const key = METRIC_KIND_TO_COUNTER[event.kind];
    counters[key] += 1;
    if (!Number.isSafeInteger(counters[key])) {
      fail(path, "metric counter exceeds the safe integer limit");
    }
  }
  return counters;
};

const normalizeMetrics = (value, path) => {
  assertExactKeys(value, ["algorithm", "events", "direct", "descendant", "all"], path);
  if (value.algorithm !== "unique_metric_event_set_union.v1") {
    fail(`${path}.algorithm`, "must equal unique_metric_event_set_union.v1");
  }
  if (!Array.isArray(value.events) || value.events.length > MAX_METRIC_EVENTS) {
    fail(`${path}.events`, "must be a bounded exact array");
  }
  const events = value.events
    .map((event, index) => normalizeMetricEvent(event, `${path}.events[${index}]`))
    .sort((left, right) => left.metric_event_id.localeCompare(right.metric_event_id));
  if (new Set(events.map((event) => event.metric_event_id)).size !== events.length) {
    fail(`${path}.events`, "metric_event_id values must be unique");
  }
  const normalized = {
    algorithm: "unique_metric_event_set_union.v1",
    events,
    direct: normalizeMetricCounters(value.direct, `${path}.direct`),
    descendant: normalizeMetricCounters(value.descendant, `${path}.descendant`),
    all: normalizeMetricCounters(value.all, `${path}.all`),
  };
  assertProjectionEqual(
    normalized.all,
    metricCountersFromEvents(events, `${path}.all`),
    `${path}.all`,
    "must be the exact metric-event projection",
  );
  return normalized;
};

const normalizeChild = (value, path) => {
  const keys = [
    "run_id",
    "attempt_id",
    "parent_run_id",
    "relation",
    "bundle_id",
    "status",
  ];
  assertExactKeys(value, keys, path);
  const normalized = {
    run_id: stringValue(value.run_id, `${path}.run_id`, { max: MAX_ID_LENGTH }),
    attempt_id: stringValue(value.attempt_id, `${path}.attempt_id`, { max: MAX_ID_LENGTH }),
    parent_run_id: stringValue(value.parent_run_id, `${path}.parent_run_id`, { max: MAX_ID_LENGTH }),
    relation: enumValue(value.relation, ["subagent", "graph_node", "recipe_node", "auxiliary"], `${path}.relation`),
    bundle_id: stringValue(value.bundle_id, `${path}.bundle_id`, { nullable: true, max: MAX_ID_LENGTH }),
    status: enumValue(value.status, ["running", "completed", "failed", "suspended", "cancelled", "uncertain"], `${path}.status`),
  };
  if (normalized.run_id === normalized.parent_run_id) {
    fail(path, "child run cannot be its own parent");
  }
  return normalized;
};

const normalizeAggregation = (value, path) => {
  const keys = [
    "algorithm",
    "direct_call_ids",
    "descendant_call_ids",
    "all_call_ids",
    "direct_usage",
    "descendant_usage",
    "all_usage",
  ];
  assertExactKeys(value, keys, path);
  if (value.algorithm !== "provider_call_set_union.v1") {
    fail(`${path}.algorithm`, "must equal provider_call_set_union.v1");
  }
  const directCallIds = uniqueStringList(value.direct_call_ids, `${path}.direct_call_ids`);
  const descendantCallIds = uniqueStringList(value.descendant_call_ids, `${path}.descendant_call_ids`);
  const allCallIds = uniqueStringList(value.all_call_ids, `${path}.all_call_ids`);
  const expectedAll = [...new Set([...directCallIds, ...descendantCallIds])].sort();
  if (directCallIds.some((id) => descendantCallIds.includes(id))) {
    fail(path, "direct_call_ids and descendant_call_ids must be disjoint");
  }
  if (JSON.stringify([...allCallIds].sort()) !== JSON.stringify(expectedAll)) {
    fail(`${path}.all_call_ids`, "must be the union of direct and descendant call ids");
  }
  return {
    algorithm: "provider_call_set_union.v1",
    direct_call_ids: directCallIds,
    descendant_call_ids: descendantCallIds,
    all_call_ids: allCallIds,
    direct_usage: normalizeUsage(value.direct_usage, `${path}.direct_usage`),
    descendant_usage: normalizeUsage(value.descendant_usage, `${path}.descendant_usage`),
    all_usage: normalizeUsage(value.all_usage, `${path}.all_usage`),
  };
};

const normalizeUsageSlice = (value, path) => {
  const keys = ["provider", "model", "service_tier", "call_ids", "usage", "coverage", "cost"];
  assertExactKeys(value, keys, path);
  const callIds = uniqueStringList(value.call_ids, `${path}.call_ids`);
  if (callIds.length === 0) fail(`${path}.call_ids`, "must be non-empty");
  const coverage = normalizeCoverage(value.coverage, `${path}.coverage`);
  if (coverage.receipt_count !== callIds.length) {
    fail(`${path}.coverage.receipt_count`, "must equal call_ids length");
  }
  return {
    provider: slugValue(value.provider, `${path}.provider`),
    model: stringValue(value.model, `${path}.model`, { max: 256 }),
    service_tier:
      value.service_tier === null
        ? null
        : slugValue(value.service_tier, `${path}.service_tier`),
    call_ids: callIds,
    usage: normalizeUsage(value.usage, `${path}.usage`),
    coverage,
    cost: normalizeBundleCost(value.cost, `${path}.cost`),
  };
};

const normalizeEvidence = (value, path) => {
  const keys = ["receipt_sha256s", "raw_usage_sha256s", "pricing_snapshot_ids"];
  assertExactKeys(value, keys, path);
  return {
    receipt_sha256s: uniqueStringList(value.receipt_sha256s, `${path}.receipt_sha256s`, { sha256: true }),
    raw_usage_sha256s: uniqueStringList(value.raw_usage_sha256s, `${path}.raw_usage_sha256s`, { sha256: true }),
    pricing_snapshot_ids: uniqueStringList(value.pricing_snapshot_ids, `${path}.pricing_snapshot_ids`),
  };
};

const normalizeLegacy = (value, path) => {
  const keys = ["status", "source", "reason"];
  assertExactKeys(value, keys, path);
  const normalized = {
    status: enumValue(value.status, ["canonical", "legacy_partial"], `${path}.status`),
    source: stringValue(value.source, `${path}.source`, { nullable: true, max: 256 }),
    reason: stringValue(value.reason, `${path}.reason`, { nullable: true, max: 512 }),
  };
  if (
    (normalized.status === "canonical" &&
      (normalized.source !== null || normalized.reason !== null)) ||
    (normalized.status === "legacy_partial" &&
      (normalized.source === null || normalized.reason === null))
  ) {
    fail(path, "status must agree with source and reason presence");
  }
  return normalized;
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const canonicalSha256 = (value) =>
  crypto.createHash("sha256").update(canonicalize(value), "utf8").digest("hex");

const deterministicProviderCallId = (receipt) =>
  `pc_${canonicalSha256({
    domain: "unchain.provider_call_id.v1",
    identity: receipt.identity,
    provider: receipt.provider.name,
    model: receipt.provider.model,
  })}`;

const deterministicBundleId = (identity) =>
  `rb_${canonicalSha256({
    domain: "unchain.run_bundle_id.v1",
    identity,
  })}`;

const computeProviderCallReceiptSha256 = (receipt) => canonicalSha256(receipt);

const unavailableUsage = () => ({
  input: {
    uncached_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    cache_write_5m_tokens: null,
    cache_write_1h_tokens: null,
    total_tokens: null,
  },
  output: {
    visible_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
  },
  total_tokens: null,
  source: "unavailable",
});

const sumUsage = (receipts, path) => {
  if (receipts.length === 0) return unavailableUsage();
  const fields = [
    ["input", "uncached_tokens"],
    ["input", "cache_read_tokens"],
    ["input", "cache_write_tokens"],
    ["input", "cache_write_5m_tokens"],
    ["input", "cache_write_1h_tokens"],
    ["input", "total_tokens"],
    ["output", "visible_tokens"],
    ["output", "reasoning_tokens"],
    ["output", "total_tokens"],
    [null, "total_tokens"],
  ];
  const summed = new Map();
  for (const [section, key] of fields) {
    const values = receipts.map((receipt) =>
      section === null ? receipt.usage[key] : receipt.usage[section][key],
    );
    if (values.some((value) => value === null)) {
      summed.set(`${section || "root"}.${key}`, null);
      continue;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(total)) {
      fail(path, "aggregated token count exceeds the safe integer limit");
    }
    summed.set(`${section || "root"}.${key}`, total);
  }
  const sources = new Set(receipts.map((receipt) => receipt.usage.source));
  const allFieldsKnown = [...summed.values()].every((value) => value !== null);
  let source = "provider_observed_partial";
  if (sources.has("legacy_partial")) {
    source = "legacy_partial";
  } else if (sources.has("unavailable")) {
    source = sources.size === 1 ? "unavailable" : "provider_observed_partial";
  } else if (
    sources.size === 1 &&
    sources.has("provider_observed") &&
    allFieldsKnown
  ) {
    source = "provider_observed";
  }
  return {
    input: {
      uncached_tokens: summed.get("input.uncached_tokens"),
      cache_read_tokens: summed.get("input.cache_read_tokens"),
      cache_write_tokens: summed.get("input.cache_write_tokens"),
      cache_write_5m_tokens: summed.get("input.cache_write_5m_tokens"),
      cache_write_1h_tokens: summed.get("input.cache_write_1h_tokens"),
      total_tokens: summed.get("input.total_tokens"),
    },
    output: {
      visible_tokens: summed.get("output.visible_tokens"),
      reasoning_tokens: summed.get("output.reasoning_tokens"),
      total_tokens: summed.get("output.total_tokens"),
    },
    total_tokens: summed.get("root.total_tokens"),
    source,
  };
};

const coverageFromReceipts = (receipts) => {
  const observed = receipts.filter(
    (receipt) => receipt.status === "completed" && receipt.usage.total_tokens !== null,
  );
  const missing = receipts.filter((receipt) => !observed.includes(receipt));
  return {
    status:
      observed.length === 0
        ? "unavailable"
        : missing.length === 0
          ? "complete"
          : "partial",
    receipt_count: receipts.length,
    observed_usage_count: observed.length,
    missing_usage_count: missing.length,
    uncertain_call_count: receipts.filter((receipt) => receipt.status === "uncertain").length,
    missing_usage_call_ids: missing.map((receipt) => receipt.provider_call_id).sort(),
  };
};

const costFromReceipts = (receipts) => {
  const estimated = receipts.filter((receipt) => receipt.pricing.status === "estimated");
  const pricingSnapshotIds = [
    ...new Set(
      receipts
        .map((receipt) => receipt.pricing.snapshot?.snapshot_id || null)
        .filter((snapshotId) => snapshotId !== null),
    ),
  ].sort();
  if (estimated.length === 0) {
    return {
      status: "unavailable",
      basis: null,
      amount_nano_usd: null,
      currency: null,
      pricing_snapshot_ids: pricingSnapshotIds,
    };
  }
  const amount = estimated.reduce(
    (sum, receipt) => sum + receipt.pricing.amount_nano_usd,
    0,
  );
  if (!Number.isSafeInteger(amount)) {
    fail("bundle.cost.amount_nano_usd", "aggregated cost exceeds the safe integer limit");
  }
  return {
    status: estimated.length === receipts.length ? "estimated" : "partial",
    basis: "list_price_estimate",
    amount_nano_usd: amount,
    currency: "USD",
    pricing_snapshot_ids: pricingSnapshotIds,
  };
};

const evidenceFromReceipts = (receipts) => ({
  receipt_sha256s: [
    ...new Set(
      receipts.map((receipt) => computeProviderCallReceiptSha256(receipt)),
    ),
  ].sort(),
  raw_usage_sha256s: [
    ...new Set(
      receipts
        .map((receipt) => receipt.raw_usage_sha256)
        .filter((digest) => digest !== null),
    ),
  ].sort(),
  pricing_snapshot_ids: [
    ...new Set(
      receipts
        .map((receipt) => receipt.pricing.snapshot?.snapshot_id || null)
        .filter((snapshotId) => snapshotId !== null),
    ),
  ].sort(),
});

const assertProjectionEqual = (actual, expected, path, message) => {
  if (canonicalize(actual) !== canonicalize(expected)) fail(path, message);
};

const computeRunBundleDigest = (bundle) => {
  const { bundle_digest: _ignored, ...body } = bundle;
  return canonicalSha256(body);
};

const normalizeRunBundleV1 = (value, { verifyDigest = true } = {}) => {
  assertExactKeys(value, RUN_BUNDLE_KEYS, "bundle");
  if (value.schema !== RUN_BUNDLE_SCHEMA) fail("bundle.schema", `must equal ${RUN_BUNDLE_SCHEMA}`);
  const identity = normalizeIdentity(value.identity, "bundle.identity");
  if (identity.relation === "root" && (identity.parent_run_id !== null || identity.run_id !== identity.root_run_id)) {
    fail("bundle.identity", "root relation requires null parent_run_id and run_id === root_run_id");
  }
  if (
    identity.relation !== "root" &&
    (identity.parent_run_id === null || identity.run_id === identity.root_run_id)
  ) {
    fail("bundle.identity", "non-root relation requires a distinct run_id and parent_run_id");
  }
  const descriptor = normalizeDescriptor(value.descriptor, "bundle.descriptor");

  if (!Array.isArray(value.provider_calls) || value.provider_calls.length > MAX_COLLECTION_ITEMS) {
    fail("bundle.provider_calls", "must be a bounded array");
  }
  const providerCalls = value.provider_calls
    .map((receipt, index) =>
      normalizeReceipt(receipt, `bundle.provider_calls[${index}]`),
    )
    .sort((left, right) => left.provider_call_id.localeCompare(right.provider_call_id));
  const receiptIds = new Set();
  for (const receipt of providerCalls) {
    if (receiptIds.has(receipt.provider_call_id)) fail("bundle.provider_calls", "provider_call_id values must be unique");
    receiptIds.add(receipt.provider_call_id);
    if (
      receipt.identity.execution_id !== identity.execution_id ||
      receipt.identity.root_run_id !== identity.root_run_id
    ) {
      fail("bundle.provider_calls", "receipt execution identity must match the bundle identity");
    }
  }

  if (!Array.isArray(value.children) || value.children.length > MAX_COLLECTION_ITEMS) {
    fail("bundle.children", "must be a bounded array");
  }
  const children = value.children
    .map((child, index) => normalizeChild(child, `bundle.children[${index}]`))
    .sort((left, right) => left.run_id.localeCompare(right.run_id));
  if (new Set(children.map((child) => child.run_id)).size !== children.length) {
    fail("bundle.children", "child run_id values must be unique");
  }
  const childById = new Map(children.map((child) => [child.run_id, child]));
  if (childById.has(identity.run_id)) {
    fail("bundle.children", "run topology cannot contain the root as its own child");
  }
  const validParentIds = new Set([identity.run_id, ...childById.keys()]);
  for (const child of children) {
    if (!validParentIds.has(child.parent_run_id)) {
      fail("bundle.children", "run topology contains an orphan child");
    }
    if (child.bundle_id === null) {
      fail("bundle.children", "materialized run child requires a bundle_id");
    }
    const childIdentity = {
      execution_id: identity.execution_id,
      attempt_id: child.attempt_id,
      root_run_id: identity.root_run_id,
      run_id: child.run_id,
      parent_run_id: child.parent_run_id,
      relation: child.relation,
    };
    if (child.bundle_id !== deterministicBundleId(childIdentity)) {
      fail(
        "bundle.children",
        "child bundle_id disagrees with its deterministic identity",
      );
    }
  }
  for (const child of children) {
    const visited = new Set([child.run_id]);
    let cursor = child;
    while (cursor.parent_run_id !== identity.run_id) {
      const parent = childById.get(cursor.parent_run_id);
      if (!parent) {
        fail("bundle.children", "run topology child is not rooted at the bundle owner");
      }
      if (visited.has(parent.run_id)) {
        fail("bundle.children", "run topology contains a child cycle");
      }
      visited.add(parent.run_id);
      cursor = parent;
    }
  }
  const ownerAttempts = new Map([
    [identity.run_id, identity.attempt_id],
    ...children.map((child) => [child.run_id, child.attempt_id]),
  ]);
  const ownerParents = new Map([
    [identity.run_id, identity.parent_run_id],
    ...children.map((child) => [child.run_id, child.parent_run_id]),
  ]);
  for (const receipt of providerCalls) {
    const expectedAttemptId = ownerAttempts.get(receipt.identity.owner_run_id);
    if (!expectedAttemptId) {
      fail("bundle.provider_calls", "receipt owner is absent from run topology");
    }
    if (receipt.identity.attempt_id !== expectedAttemptId) {
      fail("bundle.provider_calls", "receipt attempt disagrees with owner topology");
    }
  }

  const metrics = normalizeMetrics(value.metrics, "bundle.metrics");
  for (const event of metrics.events) {
    if (
      event.execution_id !== identity.execution_id ||
      event.root_run_id !== identity.root_run_id
    ) {
      fail("bundle.metrics.events", "metric event crosses the run bundle boundary");
    }
    const expectedAttemptId = ownerAttempts.get(event.owner_run_id);
    if (!expectedAttemptId) {
      fail("bundle.metrics.events", "metric event owner is absent from run topology");
    }
    if (event.attempt_id !== expectedAttemptId) {
      fail("bundle.metrics.events", "metric event attempt disagrees with owner topology");
    }
    if (event.parent_run_id !== ownerParents.get(event.owner_run_id)) {
      fail("bundle.metrics.events", "metric event parent disagrees with owner topology");
    }
  }
  const directMetricEvents = metrics.events.filter(
    (event) => event.owner_run_id === identity.run_id,
  );
  const descendantMetricEvents = metrics.events.filter(
    (event) => event.owner_run_id !== identity.run_id,
  );
  assertProjectionEqual(
    metrics.direct,
    metricCountersFromEvents(directMetricEvents, "bundle.metrics.direct"),
    "bundle.metrics.direct",
    "must be the exact direct metric-event projection",
  );
  assertProjectionEqual(
    metrics.descendant,
    metricCountersFromEvents(descendantMetricEvents, "bundle.metrics.descendant"),
    "bundle.metrics.descendant",
    "must be the exact descendant metric-event projection",
  );
  const modelAttemptEvents = new Map();
  for (const event of metrics.events) {
    if (event.kind === "model_attempt") {
      modelAttemptEvents.set(event.subject_id, event);
    }
  }
  if (
    canonicalize([...modelAttemptEvents.keys()].sort()) !==
    canonicalize([...receiptIds].sort())
  ) {
    fail(
      "bundle.metrics.events",
      "model_attempt events must match provider receipts exactly",
    );
  }
  for (const receipt of providerCalls) {
    if (modelAttemptEvents.get(receipt.provider_call_id).outcome !== receipt.status) {
      fail(
        "bundle.metrics.events",
        "model_attempt outcome disagrees with provider receipt",
      );
    }
  }

  const aggregation = normalizeAggregation(value.aggregation, "bundle.aggregation");
  const directReceipts = providerCalls.filter(
    (receipt) => receipt.identity.owner_run_id === identity.run_id,
  );
  const descendantReceipts = providerCalls.filter(
    (receipt) => receipt.identity.owner_run_id !== identity.run_id,
  );
  const expectedAggregation = {
    algorithm: "provider_call_set_union.v1",
    direct_call_ids: directReceipts.map((receipt) => receipt.provider_call_id),
    descendant_call_ids: descendantReceipts.map((receipt) => receipt.provider_call_id),
    all_call_ids: providerCalls.map((receipt) => receipt.provider_call_id),
    direct_usage: sumUsage(directReceipts, "bundle.aggregation.direct_usage"),
    descendant_usage: sumUsage(
      descendantReceipts,
      "bundle.aggregation.descendant_usage",
    ),
    all_usage: sumUsage(providerCalls, "bundle.aggregation.all_usage"),
  };
  assertProjectionEqual(
    aggregation,
    expectedAggregation,
    "bundle.aggregation",
    "must be the exact provider-receipt projection",
  );

  if (!Array.isArray(value.usage_slices) || value.usage_slices.length > MAX_COLLECTION_ITEMS) {
    fail("bundle.usage_slices", "must be a bounded array");
  }
  const usageSlices = value.usage_slices
    .map((slice, index) =>
      normalizeUsageSlice(slice, `bundle.usage_slices[${index}]`),
    )
    .sort((left, right) => {
      const leftKey = [left.provider, left.model, left.service_tier || ""];
      const rightKey = [right.provider, right.model, right.service_tier || ""];
      return canonicalize(leftKey).localeCompare(canonicalize(rightKey));
    });
  const sliceKeys = new Set();
  const slicedCallIds = new Set();
  for (const slice of usageSlices) {
    const sliceKey = `${slice.provider}\u0000${slice.model}\u0000${slice.service_tier || ""}`;
    if (sliceKeys.has(sliceKey)) fail("bundle.usage_slices", "provider/model/service_tier slices must be unique");
    sliceKeys.add(sliceKey);
    for (const callId of slice.call_ids) {
      if (!receiptIds.has(callId)) fail("bundle.usage_slices", "slice call_id must reference a provider receipt");
      if (slicedCallIds.has(callId)) fail("bundle.usage_slices", "call_id cannot appear in more than one usage slice");
      slicedCallIds.add(callId);
    }
    const sliceReceipts = slice.call_ids.map((callId) =>
      providerCalls.find((receipt) => receipt.provider_call_id === callId),
    );
    if (
      sliceReceipts.some(
        (receipt) =>
          receipt.provider.name !== slice.provider ||
          receipt.provider.model !== slice.model ||
          receipt.provider.service_tier !== slice.service_tier,
      )
    ) {
      fail("bundle.usage_slices", "slice provider identity must match every receipt");
    }
    assertProjectionEqual(
      slice.usage,
      sumUsage(sliceReceipts, "bundle.usage_slices.usage"),
      "bundle.usage_slices",
      "slice usage must equal its provider receipts",
    );
    assertProjectionEqual(
      slice.coverage,
      coverageFromReceipts(sliceReceipts),
      "bundle.usage_slices",
      "slice coverage must equal its provider receipts",
    );
    assertProjectionEqual(
      slice.cost,
      costFromReceipts(sliceReceipts),
      "bundle.usage_slices",
      "slice cost must equal its provider receipts",
    );
  }
  if (slicedCallIds.size !== receiptIds.size) {
    fail("bundle.usage_slices", "must partition every provider receipt exactly once");
  }

  const coverage = normalizeCoverage(value.coverage, "bundle.coverage");
  assertProjectionEqual(
    coverage,
    coverageFromReceipts(providerCalls),
    "bundle.coverage",
    "must equal the provider-receipt coverage projection",
  );
  const cost = normalizeBundleCost(value.cost, "bundle.cost");
  assertProjectionEqual(
    cost,
    costFromReceipts(providerCalls),
    "bundle.cost",
    "must equal the provider-receipt cost projection",
  );
  const legacy = normalizeLegacy(value.legacy, "bundle.legacy");
  const containsLegacy = providerCalls.some(
    (receipt) => receipt.usage.source === "legacy_partial",
  );
  if (containsLegacy !== (legacy.status === "legacy_partial")) {
    fail("bundle.legacy.status", "must agree with provider receipt attribution");
  }
  const evidence = normalizeEvidence(value.evidence, "bundle.evidence");
  assertProjectionEqual(
    evidence,
    evidenceFromReceipts(providerCalls),
    "bundle.evidence",
    "must equal hashes and pricing snapshots derived from provider receipts",
  );
  const bundleId = stringValue(value.bundle_id, "bundle.bundle_id", {
    max: MAX_ID_LENGTH,
  });
  if (bundleId !== deterministicBundleId(identity)) {
    fail("bundle.bundle_id", "does not match its deterministic run identity");
  }
  const normalized = {
    schema: RUN_BUNDLE_SCHEMA,
    bundle_id: bundleId,
    revision: positiveCount(value.revision, "bundle.revision"),
    bundle_digest: sha256Value(value.bundle_digest, "bundle.bundle_digest"),
    identity,
    lifecycle: normalizeLifecycle(value.lifecycle, "bundle.lifecycle"),
    descriptor,
    metrics,
    provider_calls: providerCalls,
    children,
    aggregation,
    usage_slices: usageSlices,
    coverage,
    cost,
    legacy,
    evidence,
    extensions: normalizeExtensions(value.extensions, "bundle.extensions"),
  };

  const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (bytes > RUN_BUNDLE_MAX_BYTES) fail("bundle", "serialized bundle exceeds the byte limit");
  if (verifyDigest) {
    const computed = computeRunBundleDigest(normalized);
    if (computed !== normalized.bundle_digest) {
      fail("bundle.bundle_digest", "does not match canonical bundle content", "bundle_digest_mismatch");
    }
  }
  return normalized;
};

module.exports = {
  RUN_BUNDLE_SCHEMA,
  PROVIDER_CALL_SCHEMA,
  RUN_BUNDLE_MAX_BYTES,
  RUN_BUNDLE_KEYS,
  RunBundleContractError,
  canonicalSha256,
  canonicalize,
  computeProviderCallReceiptSha256,
  computeRunBundleDigest,
  deterministicBundleId,
  deterministicMetricEventId,
  deterministicProviderCallId,
  normalizeRunBundleV1,
};
