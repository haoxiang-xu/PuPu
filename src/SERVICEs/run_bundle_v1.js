/* global BigInt */

export const RUN_BUNDLE_V1_SCHEMA = "unchain.run_bundle.v1";
export const PROVIDER_CALL_USAGE_V1_SCHEMA = "unchain.provider_call_usage.v1";
export const RUN_BUNDLE_V1_MAX_BYTES = 2 * 1024 * 1024;

export const RUN_BUNDLE_V1_TOP_LEVEL_KEYS = Object.freeze([
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

const MAX_ITEMS = 10000;
const MAX_METRIC_EVENTS = 50000;
const MAX_METRIC_EVIDENCE_REFS = 16;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const PURPOSE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z][a-z0-9_.-]{0,127}$/;
const EXTENSION_KEY_PATTERN =
  /^[a-z][a-z0-9.-]{1,127}\/[a-z][a-z0-9._-]{0,127}$/;
const FORBIDDEN_EXTENSION_KEYS = new Set([
  "prompt",
  "raw_prompt",
  "system_prompt",
  "messages",
  "request",
  "raw_request",
  "provider_request",
  "response",
  "raw_response",
  "reasoning",
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

export class RunBundleV1ValidationError extends Error {
  constructor(message, path = "bundle") {
    super(`[run_bundle_stream_invalid] ${path}: ${message}`);
    this.name = "RunBundleV1ValidationError";
    this.code = "run_bundle_stream_invalid";
    this.path = path;
  }
}

const fail = (path, message) => {
  throw new RunBundleV1ValidationError(message, path);
};

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const exact = (value, keys, path) => {
  if (!isObject(value)) fail(path, "must be a plain object");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(path, `unexpected key set (${actual.join(",")})`);
  }
};

const boundedString = (value, path, nullable = false, max = 2048) => {
  if (value === null && nullable) return;
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    fail(path, nullable ? "must be null or a bounded string" : "must be a bounded string");
  }
};

const oneOf = (value, allowed, path, nullable = false) => {
  if (value === null && nullable) return;
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join("|")}`);
};

const count = (value, path, nullable = true) => {
  if (value === null && nullable) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(path, nullable ? "must be null or a non-negative safe integer" : "must be a non-negative safe integer");
  }
};

const positiveCount = (value, path, nullable = false) => {
  if (value === null && nullable) return;
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(path, nullable ? "must be null or a positive safe integer" : "must be a positive safe integer");
  }
};

const sha256 = (value, path, nullable = false) => {
  if (value === null && nullable) return;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, nullable ? "must be null or a lowercase sha256" : "must be a lowercase sha256");
  }
};

const timestampInstant = (value, path) => {
  const match = typeof value === "string" ? value.match(RFC3339_PATTERN) : null;
  if (!match) fail(path, "must be a valid RFC3339 timestamp");
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
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
  const fractionNanoseconds = BigInt(
    (match[7] || "").padEnd(9, "0") || "0",
  );
  let instant = BigInt(date.getTime()) * 1_000_000n + fractionNanoseconds;
  if (match[8] !== "Z") {
    const offsetHours = Number(match[8].slice(1, 3));
    const offsetMinutes = Number(match[8].slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) {
      fail(path, "must be a valid RFC3339 timestamp");
    }
    const offset = BigInt(
      (offsetHours * 60 + offsetMinutes) * 60,
    ) * 1_000_000_000n;
    instant += match[8][0] === "+" ? -offset : offset;
  }
  return instant;
};

const timestamp = (value, path, nullable = true) => {
  if (value === null && nullable) return;
  timestampInstant(value, path);
};

const stringList = (value, path, { hashes = false } = {}) => {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    fail(path, "must be a bounded array");
  }
  const seen = new Set();
  value.forEach((item, index) => {
    if (hashes) sha256(item, `${path}[${index}]`);
    else boundedString(item, `${path}[${index}]`, false, 256);
    if (seen.has(item)) fail(`${path}[${index}]`, "must be unique");
    seen.add(item);
  });
};

const validateExtensionJson = (value, path, depth = 0) => {
  if (depth > 12) fail(path, "extension nesting is too deep");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > 16384) fail(path, "extension string is too long");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "extension number must be finite");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 1000) fail(path, "extension array is too large");
    value.forEach((item, index) =>
      validateExtensionJson(item, `${path}[${index}]`, depth + 1),
    );
    return;
  }
  if (!isObject(value)) fail(path, "extension value must be strict JSON");
  const keys = Object.keys(value);
  if (keys.length > 1000) fail(path, "extension object is too large");
  keys.forEach((key) => {
    if (FORBIDDEN_EXTENSION_KEYS.has(key.toLowerCase())) {
      fail(`${path}.${key}`, "payload field is forbidden in renderer-safe extensions");
    }
    validateExtensionJson(value[key], `${path}.${key}`, depth + 1);
  });
};

const validateExtensions = (value, path) => {
  if (!isObject(value)) fail(path, "must be a plain object");
  Object.keys(value).forEach((key) => {
    if (!EXTENSION_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, "must use a namespaced extension key");
    }
    validateExtensionJson(value[key], `${path}.${key}`);
  });
};

const validateDescriptor = (descriptor, path) => {
  exact(
    descriptor,
    ["model", "display_model", "active_agent", "agent_orchestration", "iteration"],
    path,
  );
  ["model", "display_model", "active_agent"].forEach((key) =>
    boundedString(descriptor[key], `${path}.${key}`, false, 256),
  );
  oneOf(
    descriptor.agent_orchestration,
    ["default", "developer_waiting_approval"],
    `${path}.agent_orchestration`,
  );
  count(descriptor.iteration, `${path}.iteration`, false);
};

const validateMetricCounters = (counters, path) => {
  exact(counters, METRIC_COUNTER_KEYS, path);
  METRIC_COUNTER_KEYS.forEach((key) => count(counters[key], `${path}.${key}`, false));
};

const metricCountersFromEvents = (events) => {
  const counters = Object.fromEntries(METRIC_COUNTER_KEYS.map((key) => [key, 0]));
  events.forEach((event) => {
    counters[METRIC_KIND_TO_COUNTER[event.kind]] += 1;
  });
  return counters;
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sameMetricCounters = (left, right) =>
  METRIC_COUNTER_KEYS.every((key) => left[key] === right[key]);

const validateMetrics = (metrics, path, { identity, children, providerCalls }) => {
  exact(metrics, ["algorithm", "events", "direct", "descendant", "all"], path);
  if (metrics.algorithm !== "unique_metric_event_set_union.v1") {
    fail(`${path}.algorithm`, "must equal unique_metric_event_set_union.v1");
  }
  if (!Array.isArray(metrics.events) || metrics.events.length > MAX_METRIC_EVENTS) {
    fail(`${path}.events`, "must be a bounded exact array");
  }
  const ownerAttempts = new Map([
    [identity.run_id, identity.attempt_id],
    ...children.map((child) => [child.run_id, child.attempt_id]),
  ]);
  const ownerParents = new Map([
    [identity.run_id, identity.parent_run_id],
    ...children.map((child) => [child.run_id, child.parent_run_id]),
  ]);
  const eventIds = new Set();
  metrics.events.forEach((event, index) => {
    const eventPath = `${path}.events[${index}]`;
    exact(
      event,
      [
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
      ],
      eventPath,
    );
    ["metric_event_id", "execution_id", "attempt_id", "root_run_id", "owner_run_id", "subject_id"].forEach(
      (key) => boundedString(event[key], `${eventPath}.${key}`, false, 256),
    );
    boundedString(event.parent_run_id, `${eventPath}.parent_run_id`, true, 256);
    oneOf(event.kind, Object.keys(METRIC_KIND_TO_COUNTER), `${eventPath}.kind`);
    oneOf(
      event.outcome,
      ["completed", "failed", "uncertain", "requested", "skipped"],
      `${eventPath}.outcome`,
    );
    if (event.error !== null) {
      exact(event.error, ["category", "code"], `${eventPath}.error`);
      boundedString(event.error.category, `${eventPath}.error.category`, false, 128);
      boundedString(event.error.code, `${eventPath}.error.code`, false, 128);
      if (
        !SLUG_PATTERN.test(event.error.category) ||
        !SLUG_PATTERN.test(event.error.code)
      ) {
        fail(`${eventPath}.error`, "category and code must be canonical slugs");
      }
      if (!["failed", "uncertain"].includes(event.outcome)) {
        fail(`${eventPath}.error`, "requires a failed or uncertain outcome");
      }
    }
    if (
      !Array.isArray(event.evidence_refs) ||
      event.evidence_refs.length > MAX_METRIC_EVIDENCE_REFS
    ) {
      fail(`${eventPath}.evidence_refs`, "must be a bounded exact array");
    }
    const evidenceRefs = new Set();
    event.evidence_refs.forEach((reference, referenceIndex) => {
      const referencePath = `${eventPath}.evidence_refs[${referenceIndex}]`;
      exact(reference, ["kind", "ref_id"], referencePath);
      oneOf(
        reference.kind,
        ["artifact", "interaction", "context_event"],
        `${referencePath}.kind`,
      );
      boundedString(reference.ref_id, `${referencePath}.ref_id`, false, 256);
      if (
        !new RegExp(`^${reference.kind}_[a-f0-9]{64}$`).test(reference.ref_id)
      ) {
        fail(
          `${referencePath}.ref_id`,
          "must be a kind-bound opaque sha256 id",
        );
      }
      const key = `${reference.kind}\u0000${reference.ref_id}`;
      if (evidenceRefs.has(key)) fail(referencePath, "must be unique");
      evidenceRefs.add(key);
    });
    if (eventIds.has(event.metric_event_id)) {
      fail(`${eventPath}.metric_event_id`, "must be unique");
    }
    eventIds.add(event.metric_event_id);
    if (
      event.execution_id !== identity.execution_id ||
      event.root_run_id !== identity.root_run_id
    ) {
      fail(eventPath, "crosses the run bundle boundary");
    }
    if (ownerAttempts.get(event.owner_run_id) !== event.attempt_id) {
      fail(eventPath, "attempt disagrees with owner topology");
    }
    if (ownerParents.get(event.owner_run_id) !== event.parent_run_id) {
      fail(eventPath, "parent disagrees with owner topology");
    }
  });
  validateMetricCounters(metrics.direct, `${path}.direct`);
  validateMetricCounters(metrics.descendant, `${path}.descendant`);
  validateMetricCounters(metrics.all, `${path}.all`);
  const directEvents = metrics.events.filter(
    (event) => event.owner_run_id === identity.run_id,
  );
  const descendantEvents = metrics.events.filter(
    (event) => event.owner_run_id !== identity.run_id,
  );
  if (!sameMetricCounters(metrics.direct, metricCountersFromEvents(directEvents))) {
    fail(`${path}.direct`, "must equal the direct metric-event projection");
  }
  if (!sameMetricCounters(metrics.descendant, metricCountersFromEvents(descendantEvents))) {
    fail(`${path}.descendant`, "must equal the descendant metric-event projection");
  }
  if (!sameMetricCounters(metrics.all, metricCountersFromEvents(metrics.events))) {
    fail(`${path}.all`, "must equal the complete metric-event projection");
  }
  const modelAttempts = new Map();
  metrics.events.forEach((event) => {
    if (event.kind === "model_attempt") modelAttempts.set(event.subject_id, event);
  });
  const callIds = providerCalls.map((receipt) => receipt.provider_call_id).sort();
  if (!sameJson([...modelAttempts.keys()].sort(), callIds)) {
    fail(`${path}.events`, "model_attempt events must match provider receipts exactly");
  }
  providerCalls.forEach((receipt) => {
    if (modelAttempts.get(receipt.provider_call_id).outcome !== receipt.status) {
      fail(`${path}.events`, "model_attempt outcome disagrees with provider receipt");
    }
  });
};

const validateUsage = (usage, path) => {
  exact(usage, ["input", "output", "total_tokens", "source"], path);
  exact(
    usage.input,
    [
      "uncached_tokens",
      "cache_read_tokens",
      "cache_write_tokens",
      "cache_write_5m_tokens",
      "cache_write_1h_tokens",
      "total_tokens",
    ],
    `${path}.input`,
  );
  exact(
    usage.output,
    ["visible_tokens", "reasoning_tokens", "total_tokens"],
    `${path}.output`,
  );
  [
    "uncached_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "cache_write_5m_tokens",
    "cache_write_1h_tokens",
    "total_tokens",
  ].forEach(
    (key) => count(usage.input[key], `${path}.input.${key}`),
  );
  ["visible_tokens", "reasoning_tokens", "total_tokens"].forEach((key) =>
    count(usage.output[key], `${path}.output.${key}`),
  );
  count(usage.total_tokens, `${path}.total_tokens`);
  oneOf(
    usage.source,
    ["provider_observed", "provider_observed_partial", "legacy_partial", "unavailable"],
    `${path}.source`,
  );

  const inputParts = [
    usage.input.uncached_tokens,
    usage.input.cache_read_tokens,
    usage.input.cache_write_tokens,
  ];
  const inputKnown = inputParts.reduce((sum, value) => sum + (value ?? 0), 0);
  if (usage.input.total_tokens !== null && inputKnown > usage.input.total_tokens) {
    fail(`${path}.input.total_tokens`, "cannot be smaller than known input parts");
  }
  if (inputParts.every((value) => value !== null) && usage.input.total_tokens !== inputKnown) {
    fail(`${path}.input.total_tokens`, "must equal the disjoint input parts");
  }
  if (
    usage.input.cache_write_5m_tokens !== null &&
    usage.input.cache_write_1h_tokens !== null &&
    usage.input.cache_write_tokens !==
      usage.input.cache_write_5m_tokens + usage.input.cache_write_1h_tokens
  ) {
    fail(
      `${path}.input.cache_write_tokens`,
      "must equal the 5m and 1h cache-write breakdown when both are known",
    );
  }
  const outputParts = [usage.output.visible_tokens, usage.output.reasoning_tokens];
  const outputKnown = outputParts.reduce((sum, value) => sum + (value ?? 0), 0);
  if (usage.output.total_tokens !== null && outputKnown > usage.output.total_tokens) {
    fail(`${path}.output.total_tokens`, "cannot be smaller than known output parts");
  }
  if (outputParts.every((value) => value !== null) && usage.output.total_tokens !== outputKnown) {
    fail(`${path}.output.total_tokens`, "must equal the disjoint output parts");
  }
  if (
    usage.total_tokens !== null &&
    usage.input.total_tokens !== null &&
    usage.output.total_tokens !== null &&
    usage.total_tokens !== usage.input.total_tokens + usage.output.total_tokens
  ) {
    fail(`${path}.total_tokens`, "must equal input.total_tokens + output.total_tokens");
  }
};

const validateCoverage = (coverage, path) => {
  exact(
    coverage,
    [
      "status",
      "receipt_count",
      "observed_usage_count",
      "missing_usage_count",
      "uncertain_call_count",
      "missing_usage_call_ids",
    ],
    path,
  );
  oneOf(coverage.status, ["complete", "partial", "unavailable"], `${path}.status`);
  ["receipt_count", "observed_usage_count", "missing_usage_count", "uncertain_call_count"].forEach(
    (key) => count(coverage[key], `${path}.${key}`, false),
  );
  stringList(coverage.missing_usage_call_ids, `${path}.missing_usage_call_ids`);
  if (coverage.observed_usage_count + coverage.missing_usage_count !== coverage.receipt_count) {
    fail(path, "observed and missing counts must equal receipt_count");
  }
  if (coverage.missing_usage_call_ids.length !== coverage.missing_usage_count) {
    fail(`${path}.missing_usage_call_ids`, "length must equal missing_usage_count");
  }
};

const validateCost = (costValue, path) => {
  exact(
    costValue,
    ["status", "basis", "amount_nano_usd", "currency", "pricing_snapshot_ids"],
    path,
  );
  oneOf(costValue.status, ["estimated", "partial", "unavailable"], `${path}.status`);
  oneOf(costValue.basis, ["list_price_estimate"], `${path}.basis`, true);
  count(costValue.amount_nano_usd, `${path}.amount_nano_usd`);
  oneOf(costValue.currency, ["USD"], `${path}.currency`, true);
  stringList(costValue.pricing_snapshot_ids, `${path}.pricing_snapshot_ids`);
  if (
    costValue.status === "estimated" &&
    (costValue.basis !== "list_price_estimate" ||
      costValue.amount_nano_usd === null ||
      costValue.currency !== "USD")
  ) {
    fail(path, "estimated cost requires basis, amount_nano_usd, and USD currency");
  }
  if (
    costValue.status === "unavailable" &&
    (costValue.basis !== null ||
      costValue.amount_nano_usd !== null ||
      costValue.currency !== null)
  ) {
    fail(path, "unavailable cost must keep basis, amount, and currency null");
  }
};

const validateSnapshot = (snapshot, path) => {
  if (snapshot === null) return;
  exact(
    snapshot,
    [
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
    ],
    path,
  );
  boundedString(snapshot.snapshot_id, `${path}.snapshot_id`, false, 256);
  boundedString(snapshot.catalog_version, `${path}.catalog_version`, false, 128);
  sha256(snapshot.catalog_sha256, `${path}.catalog_sha256`);
  boundedString(snapshot.source_url, `${path}.source_url`, false, 2048);
  sha256(snapshot.source_sha256, `${path}.source_sha256`);
  timestamp(snapshot.effective_from, `${path}.effective_from`, false);
  timestamp(snapshot.effective_until, `${path}.effective_until`);
  oneOf(snapshot.currency, ["USD"], `${path}.currency`);
  boundedString(snapshot.provider, `${path}.provider`, false, 128);
  boundedString(snapshot.billing_surface, `${path}.billing_surface`, false, 128);
  boundedString(snapshot.model, `${path}.model`, false, 256);
  boundedString(snapshot.service_tier, `${path}.service_tier`, false, 128);
  if (typeof snapshot.batch !== "boolean") fail(`${path}.batch`, "must be a boolean");
  boundedString(snapshot.inference_geo, `${path}.inference_geo`, false, 128);
  exact(
    snapshot.rates,
    [
      "input_uncached_nano_usd_per_million",
      "input_cache_read_nano_usd_per_million",
      "input_cache_write_nano_usd_per_million",
      "input_cache_write_5m_nano_usd_per_million",
      "input_cache_write_1h_nano_usd_per_million",
      "output_nano_usd_per_million",
    ],
    `${path}.rates`,
  );
  Object.keys(snapshot.rates).forEach((key) =>
    count(snapshot.rates[key], `${path}.rates.${key}`),
  );
  if (snapshot.long_context_rule !== null) {
    exact(
      snapshot.long_context_rule,
      ["threshold_input_tokens", "input_multiplier_ppm", "output_multiplier_ppm"],
      `${path}.long_context_rule`,
    );
    count(
      snapshot.long_context_rule.threshold_input_tokens,
      `${path}.long_context_rule.threshold_input_tokens`,
      false,
    );
    positiveCount(
      snapshot.long_context_rule.input_multiplier_ppm,
      `${path}.long_context_rule.input_multiplier_ppm`,
    );
    positiveCount(
      snapshot.long_context_rule.output_multiplier_ppm,
      `${path}.long_context_rule.output_multiplier_ppm`,
    );
  }
};

const validateReceipt = (receipt, path) => {
  exact(
    receipt,
    [
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
    ],
    path,
  );
  if (receipt.schema !== PROVIDER_CALL_USAGE_V1_SCHEMA) {
    fail(`${path}.schema`, `must equal ${PROVIDER_CALL_USAGE_V1_SCHEMA}`);
  }
  boundedString(receipt.provider_call_id, `${path}.provider_call_id`, false, 256);
  exact(
    receipt.identity,
    [
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
    ],
    `${path}.identity`,
  );
  ["execution_id", "attempt_id", "root_run_id", "owner_run_id"].forEach((key) =>
    boundedString(receipt.identity[key], `${path}.identity.${key}`, false, 256),
  );
  boundedString(receipt.identity.parent_run_id, `${path}.identity.parent_run_id`, true, 256);
  count(receipt.identity.iteration, `${path}.identity.iteration`, false);
  count(receipt.identity.retry_ordinal, `${path}.identity.retry_ordinal`, false);
  boundedString(receipt.identity.purpose, `${path}.identity.purpose`, false, 128);
  if (!PURPOSE_PATTERN.test(receipt.identity.purpose)) {
    fail(`${path}.identity.purpose`, "must be a canonical purpose slug");
  }
  sha256(receipt.identity.request_sha256, `${path}.identity.request_sha256`);
  boundedString(receipt.identity.route, `${path}.identity.route`, false, 512);
  exact(receipt.provider, ["name", "model", "service_tier"], `${path}.provider`);
  boundedString(receipt.provider.name, `${path}.provider.name`, false, 128);
  boundedString(receipt.provider.model, `${path}.provider.model`, false, 256);
  boundedString(receipt.provider.service_tier, `${path}.provider.service_tier`, true, 128);
  oneOf(receipt.status, ["completed", "failed", "uncertain"], `${path}.status`);
  exact(receipt.timing, ["started_at", "completed_at"], `${path}.timing`);
  timestamp(receipt.timing.started_at, `${path}.timing.started_at`);
  timestamp(receipt.timing.completed_at, `${path}.timing.completed_at`);
  if (receipt.timing.completed_at !== null && receipt.timing.started_at === null) {
    fail(`${path}.timing.completed_at`, "requires started_at");
  }
  if (
    receipt.timing.started_at !== null &&
    receipt.timing.completed_at !== null &&
    timestampInstant(receipt.timing.completed_at, `${path}.timing.completed_at`) <
      timestampInstant(receipt.timing.started_at, `${path}.timing.started_at`)
  ) {
    fail(`${path}.timing.completed_at`, "must not precede started_at");
  }
  if (
    ["completed", "failed"].includes(receipt.status) &&
    (receipt.timing.started_at === null ||
      receipt.timing.completed_at === null)
  ) {
    fail(
      `${path}.timing`,
      "completed/failed provider timing requires started_at and completed_at",
    );
  }
  exact(
    receipt.provider_ids,
    ["request_id_sha256", "response_id_sha256"],
    `${path}.provider_ids`,
  );
  sha256(receipt.provider_ids.request_id_sha256, `${path}.provider_ids.request_id_sha256`, true);
  sha256(receipt.provider_ids.response_id_sha256, `${path}.provider_ids.response_id_sha256`, true);
  exact(
    receipt.billing_dimensions,
    ["billing_surface", "batch", "inference_geo"],
    `${path}.billing_dimensions`,
  );
  for (const key of ["billing_surface", "inference_geo"]) {
    boundedString(receipt.billing_dimensions[key], `${path}.billing_dimensions.${key}`, true, 128);
    if (
      receipt.billing_dimensions[key] !== null &&
      !SLUG_PATTERN.test(receipt.billing_dimensions[key])
    ) {
      fail(`${path}.billing_dimensions.${key}`, "must be a canonical slug or null");
    }
  }
  if (
    receipt.billing_dimensions.batch !== null &&
    typeof receipt.billing_dimensions.batch !== "boolean"
  ) {
    fail(`${path}.billing_dimensions.batch`, "must be a boolean or null");
  }
  validateUsage(receipt.usage, `${path}.usage`);
  sha256(receipt.raw_usage_sha256, `${path}.raw_usage_sha256`, true);
  exact(
    receipt.pricing,
    [
      "status",
      "basis",
      "snapshot",
      "amount_nano_usd",
      "reason",
      "input_multiplier_ppm",
      "output_multiplier_ppm",
    ],
    `${path}.pricing`,
  );
  oneOf(receipt.pricing.status, ["estimated", "unavailable"], `${path}.pricing.status`);
  oneOf(receipt.pricing.basis, ["list_price_estimate"], `${path}.pricing.basis`, true);
  validateSnapshot(receipt.pricing.snapshot, `${path}.pricing.snapshot`);
  count(receipt.pricing.amount_nano_usd, `${path}.pricing.amount_nano_usd`);
  boundedString(receipt.pricing.reason, `${path}.pricing.reason`, true, 512);
  positiveCount(receipt.pricing.input_multiplier_ppm, `${path}.pricing.input_multiplier_ppm`, true);
  positiveCount(receipt.pricing.output_multiplier_ppm, `${path}.pricing.output_multiplier_ppm`, true);
  if (
    receipt.pricing.status === "estimated" &&
    (receipt.pricing.basis !== "list_price_estimate" ||
      receipt.pricing.snapshot === null ||
      receipt.pricing.amount_nano_usd === null ||
      receipt.pricing.input_multiplier_ppm === null ||
      receipt.pricing.output_multiplier_ppm === null ||
      receipt.pricing.reason !== null)
  ) {
    fail(`${path}.pricing`, "estimated pricing fields are incomplete");
  }
  if (
    receipt.pricing.status === "unavailable" &&
    (receipt.pricing.basis !== null ||
      receipt.pricing.amount_nano_usd !== null ||
      receipt.pricing.input_multiplier_ppm !== null ||
      receipt.pricing.output_multiplier_ppm !== null ||
      receipt.pricing.reason === null)
  ) {
    fail(`${path}.pricing`, "unavailable pricing must keep price fields null and include a reason");
  }
  if (
    receipt.pricing.snapshot !== null &&
    (receipt.pricing.snapshot.provider !== receipt.provider.name ||
      receipt.pricing.snapshot.model !== receipt.provider.model ||
      receipt.pricing.snapshot.service_tier !== receipt.provider.service_tier ||
      receipt.pricing.snapshot.billing_surface !== receipt.billing_dimensions.billing_surface ||
      receipt.pricing.snapshot.batch !== receipt.billing_dimensions.batch ||
      receipt.pricing.snapshot.inference_geo !== receipt.billing_dimensions.inference_geo)
  ) {
    fail(`${path}.pricing.snapshot`, "provider/model/tier/billing dimensions must match the receipt");
  }
  validateExtensions(receipt.extensions, `${path}.extensions`);
};

const utf8Bytes = (text) => {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
};

/**
 * Strict renderer admission for the locked Unchain RunBundle v1 wire.
 * The digest format is checked here; Electron recomputes it at the durable
 * transaction boundary so browser crypto timing cannot create a write race.
 */
export const normalizeRendererRunBundleV1 = (bundle) => {
  exact(bundle, RUN_BUNDLE_V1_TOP_LEVEL_KEYS, "bundle");
  if (bundle.schema !== RUN_BUNDLE_V1_SCHEMA) {
    fail("bundle.schema", `must equal ${RUN_BUNDLE_V1_SCHEMA}`);
  }
  boundedString(bundle.bundle_id, "bundle.bundle_id", false, 256);
  positiveCount(bundle.revision, "bundle.revision");
  sha256(bundle.bundle_digest, "bundle.bundle_digest");

  exact(
    bundle.identity,
    ["execution_id", "attempt_id", "root_run_id", "run_id", "parent_run_id", "relation"],
    "bundle.identity",
  );
  ["execution_id", "attempt_id", "root_run_id", "run_id"].forEach((key) =>
    boundedString(bundle.identity[key], `bundle.identity.${key}`, false, 256),
  );
  boundedString(bundle.identity.parent_run_id, "bundle.identity.parent_run_id", true, 256);
  oneOf(
    bundle.identity.relation,
    ["root", "subagent", "graph_node", "recipe_node", "auxiliary"],
    "bundle.identity.relation",
  );
  if (
    bundle.identity.relation === "root" &&
    (bundle.identity.parent_run_id !== null ||
      bundle.identity.run_id !== bundle.identity.root_run_id)
  ) {
    fail("bundle.identity", "root relation requires a null parent and run_id === root_run_id");
  }
  if (
    bundle.identity.relation !== "root" &&
    bundle.identity.parent_run_id === null
  ) {
    fail("bundle.identity.parent_run_id", "non-root relation requires a parent");
  }

  exact(
    bundle.lifecycle,
    ["status", "started_at", "completed_at", "continued_from_run_id"],
    "bundle.lifecycle",
  );
  oneOf(
    bundle.lifecycle.status,
    ["running", "completed", "failed", "suspended", "cancelled", "uncertain"],
    "bundle.lifecycle.status",
  );
  timestamp(bundle.lifecycle.started_at, "bundle.lifecycle.started_at");
  timestamp(bundle.lifecycle.completed_at, "bundle.lifecycle.completed_at");
  boundedString(bundle.lifecycle.continued_from_run_id, "bundle.lifecycle.continued_from_run_id", true, 256);
  if (bundle.lifecycle.started_at === null) {
    fail("bundle.lifecycle.started_at", "is required");
  }
  if (
    bundle.lifecycle.status === "running" &&
    bundle.lifecycle.completed_at !== null
  ) {
    fail(
      "bundle.lifecycle.completed_at",
      "running lifecycle requires null completed_at",
    );
  }
  if (
    ["completed", "failed", "suspended", "cancelled"].includes(
      bundle.lifecycle.status,
    ) &&
    bundle.lifecycle.completed_at === null
  ) {
    fail(
      "bundle.lifecycle.completed_at",
      "terminal lifecycle requires completed_at",
    );
  }
  if (
    bundle.lifecycle.completed_at !== null &&
    timestampInstant(
      bundle.lifecycle.completed_at,
      "bundle.lifecycle.completed_at",
    ) <
      timestampInstant(
        bundle.lifecycle.started_at,
        "bundle.lifecycle.started_at",
      )
  ) {
    fail(
      "bundle.lifecycle.completed_at",
      "must not precede started_at",
    );
  }
  validateDescriptor(bundle.descriptor, "bundle.descriptor");

  if (!Array.isArray(bundle.provider_calls) || bundle.provider_calls.length > MAX_ITEMS) {
    fail("bundle.provider_calls", "must be a bounded array");
  }
  bundle.provider_calls.forEach((receipt, index) =>
    validateReceipt(receipt, `bundle.provider_calls[${index}]`),
  );
  if (new Set(bundle.provider_calls.map((receipt) => receipt.provider_call_id)).size !== bundle.provider_calls.length) {
    fail("bundle.provider_calls", "provider_call_id values must be unique");
  }
  bundle.provider_calls.forEach((receipt) => {
    if (
      receipt.identity.execution_id !== bundle.identity.execution_id ||
      receipt.identity.root_run_id !== bundle.identity.root_run_id
    ) {
      fail("bundle.provider_calls", "receipt execution identity must match the bundle");
    }
  });

  if (!Array.isArray(bundle.children) || bundle.children.length > MAX_ITEMS) {
    fail("bundle.children", "must be a bounded array");
  }
  bundle.children.forEach((child, index) => {
    const path = `bundle.children[${index}]`;
    exact(
      child,
      ["run_id", "attempt_id", "parent_run_id", "relation", "bundle_id", "status"],
      path,
    );
    boundedString(child.run_id, `${path}.run_id`, false, 256);
    boundedString(child.attempt_id, `${path}.attempt_id`, false, 256);
    boundedString(child.parent_run_id, `${path}.parent_run_id`, false, 256);
    oneOf(child.relation, ["subagent", "graph_node", "recipe_node", "auxiliary"], `${path}.relation`);
    boundedString(child.bundle_id, `${path}.bundle_id`, true, 256);
    oneOf(child.status, ["running", "completed", "failed", "suspended", "cancelled", "uncertain"], `${path}.status`);
  });
  if (new Set(bundle.children.map((child) => child.run_id)).size !== bundle.children.length) {
    fail("bundle.children", "child run_id values must be unique");
  }
  const ownerAttempts = new Map([
    [bundle.identity.run_id, bundle.identity.attempt_id],
    ...bundle.children.map((child) => [child.run_id, child.attempt_id]),
  ]);
  bundle.provider_calls.forEach((receipt) => {
    const expectedAttemptId = ownerAttempts.get(receipt.identity.owner_run_id);
    if (!expectedAttemptId) {
      fail("bundle.provider_calls", "receipt owner is absent from run topology");
    }
    if (receipt.identity.attempt_id !== expectedAttemptId) {
      fail("bundle.provider_calls", "receipt attempt disagrees with owner topology");
    }
  });
  validateMetrics(bundle.metrics, "bundle.metrics", {
    identity: bundle.identity,
    children: bundle.children,
    providerCalls: bundle.provider_calls,
  });

  exact(
    bundle.aggregation,
    [
      "algorithm",
      "direct_call_ids",
      "descendant_call_ids",
      "all_call_ids",
      "direct_usage",
      "descendant_usage",
      "all_usage",
    ],
    "bundle.aggregation",
  );
  if (bundle.aggregation.algorithm !== "provider_call_set_union.v1") {
    fail("bundle.aggregation.algorithm", "must equal provider_call_set_union.v1");
  }
  ["direct_call_ids", "descendant_call_ids", "all_call_ids"].forEach((key) =>
    stringList(bundle.aggregation[key], `bundle.aggregation.${key}`),
  );
  const directIds = bundle.aggregation.direct_call_ids;
  const descendantIds = bundle.aggregation.descendant_call_ids;
  if (directIds.some((callId) => descendantIds.includes(callId))) {
    fail("bundle.aggregation", "direct and descendant call ids must be disjoint");
  }
  const expectedAllIds = [...new Set([...directIds, ...descendantIds])].sort();
  if (
    JSON.stringify([...bundle.aggregation.all_call_ids].sort()) !==
    JSON.stringify(expectedAllIds)
  ) {
    fail("bundle.aggregation.all_call_ids", "must be the direct/descendant union");
  }
  const receiptIds = bundle.provider_calls
    .map((receipt) => receipt.provider_call_id)
    .sort();
  if (
    JSON.stringify([...bundle.aggregation.all_call_ids].sort()) !==
    JSON.stringify(receiptIds)
  ) {
    fail("bundle.aggregation.all_call_ids", "must match provider_calls identities");
  }
  ["direct_usage", "descendant_usage", "all_usage"].forEach((key) =>
    validateUsage(bundle.aggregation[key], `bundle.aggregation.${key}`),
  );

  if (!Array.isArray(bundle.usage_slices) || bundle.usage_slices.length > MAX_ITEMS) {
    fail("bundle.usage_slices", "must be a bounded array");
  }
  const sliceKeys = new Set();
  const slicedCallIds = new Set();
  bundle.usage_slices.forEach((slice, index) => {
    const path = `bundle.usage_slices[${index}]`;
    exact(slice, ["provider", "model", "service_tier", "call_ids", "usage", "coverage", "cost"], path);
    boundedString(slice.provider, `${path}.provider`, false, 128);
    boundedString(slice.model, `${path}.model`, false, 256);
    boundedString(slice.service_tier, `${path}.service_tier`, true, 128);
    stringList(slice.call_ids, `${path}.call_ids`);
    validateUsage(slice.usage, `${path}.usage`);
    validateCoverage(slice.coverage, `${path}.coverage`);
    if (slice.coverage.receipt_count !== slice.call_ids.length) {
      fail(`${path}.coverage.receipt_count`, "must equal call_ids length");
    }
    validateCost(slice.cost, `${path}.cost`);
    const key = `${slice.provider}\u0000${slice.model}\u0000${slice.service_tier || ""}`;
    if (sliceKeys.has(key)) fail(path, "provider/model/service_tier slice must be unique");
    sliceKeys.add(key);
    slice.call_ids.forEach((callId) => {
      if (!receiptIds.includes(callId)) {
        fail(`${path}.call_ids`, "must reference a provider receipt");
      }
      if (slicedCallIds.has(callId)) {
        fail(`${path}.call_ids`, "a call id cannot appear in multiple slices");
      }
      slicedCallIds.add(callId);
    });
  });

  validateCoverage(bundle.coverage, "bundle.coverage");
  if (bundle.coverage.receipt_count !== bundle.provider_calls.length) {
    fail("bundle.coverage.receipt_count", "must equal provider_calls length");
  }
  validateCost(bundle.cost, "bundle.cost");
  exact(bundle.legacy, ["status", "source", "reason"], "bundle.legacy");
  oneOf(bundle.legacy.status, ["canonical", "legacy_partial"], "bundle.legacy.status");
  boundedString(bundle.legacy.source, "bundle.legacy.source", true, 128);
  boundedString(bundle.legacy.reason, "bundle.legacy.reason", true, 512);
  exact(
    bundle.evidence,
    ["receipt_sha256s", "raw_usage_sha256s", "pricing_snapshot_ids"],
    "bundle.evidence",
  );
  stringList(bundle.evidence.receipt_sha256s, "bundle.evidence.receipt_sha256s", { hashes: true });
  stringList(bundle.evidence.raw_usage_sha256s, "bundle.evidence.raw_usage_sha256s", { hashes: true });
  stringList(bundle.evidence.pricing_snapshot_ids, "bundle.evidence.pricing_snapshot_ids");
  validateExtensions(bundle.extensions, "bundle.extensions");

  const serialized = JSON.stringify(bundle);
  if (utf8Bytes(serialized) > RUN_BUNDLE_V1_MAX_BYTES) {
    fail("bundle", "serialized bundle exceeds the byte limit");
  }
  return JSON.parse(serialized);
};

const tokenOrNull = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * Canonical presentation selector. Cache read/write and reasoning are
 * annotations/subsets, never values to add to input/output/total again.
 */
export const selectRunBundleUsage = (bundle) => {
  if (bundle && bundle.schema === RUN_BUNDLE_V1_SCHEMA) {
    try {
      const normalized = normalizeRendererRunBundleV1(bundle);
      const usage = normalized.aggregation.all_usage;
      return {
        canonical: true,
        input: usage.input.total_tokens,
        output: usage.output.total_tokens,
        total: usage.total_tokens,
        cacheRead: usage.input.cache_read_tokens,
        cacheWrite: usage.input.cache_write_tokens,
        cacheWrite5m: usage.input.cache_write_5m_tokens,
        cacheWrite1h: usage.input.cache_write_1h_tokens,
        reasoning: usage.output.reasoning_tokens,
        coverage: normalized.coverage.status,
        source: usage.source,
        partial: normalized.coverage.status !== "complete",
        cost: normalized.cost,
        usageSlices: normalized.usage_slices,
      };
    } catch (_error) {
      return {
        canonical: true,
        input: null,
        output: null,
        total: null,
        cacheRead: null,
        cacheWrite: null,
        cacheWrite5m: null,
        cacheWrite1h: null,
        reasoning: null,
        coverage: "unavailable",
        source: "unavailable",
        partial: true,
        cost: null,
        usageSlices: [],
      };
    }
  }

  // Compatibility presentation only. Legacy records remain read-only and are
  // never promoted into canonical v1 facts. In particular, OpenAI cached input
  // is already included in input_tokens and must not be added a second time.
  return {
    canonical: false,
    input: tokenOrNull(bundle?.input_tokens),
    output: tokenOrNull(bundle?.output_tokens),
    total: tokenOrNull(bundle?.consumed_tokens),
    cacheRead: tokenOrNull(bundle?.cache_read_input_tokens),
    cacheWrite: tokenOrNull(bundle?.cache_creation_input_tokens),
    cacheWrite5m: null,
    cacheWrite1h: null,
    reasoning: tokenOrNull(bundle?.reasoning_output_tokens),
    coverage: "partial",
    source: "legacy_partial",
    partial: true,
    cost: null,
    usageSlices: [],
  };
};
