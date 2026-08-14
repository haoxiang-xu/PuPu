import crypto from "node:crypto";

export const PRICING_CATALOG_SCHEMA = "pupu.pricing_catalog.v1";
export const PRICING_ENVELOPE_SCHEMA = "pupu.pricing_catalog_envelope.v1";

const SHA256_RE = /^[a-f0-9]{64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const TOKEN_RATE_KEYS = Object.freeze([
  "input_uncached",
  "input_cache_read",
  "input_cache_write",
  "input_cache_write_5m",
  "input_cache_write_1h",
  "output",
]);
const USAGE_KEYS = Object.freeze([
  "input_uncached_tokens",
  "input_cache_read_tokens",
  "input_cache_write_tokens",
  "input_cache_write_5m_tokens",
  "input_cache_write_1h_tokens",
  "output_tokens",
]);
const VERIFIED_CATALOG_BRAND = Symbol("signature-verified-pricing-catalog");

export class PricingCatalogError extends Error {
  constructor(code, message, path = "catalog") {
    super(`${code}: ${path}: ${message}`);
    this.name = "PricingCatalogError";
    this.code = code;
    this.path = path;
  }
}

const fail = (code, message, path) => {
  throw new PricingCatalogError(code, message, path);
};

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const exactKeys = (value, expected, path) => {
  if (!isObject(value)) fail("pricing_catalog_invalid", "must be an object", path);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(
      "pricing_catalog_invalid",
      `unexpected key set (${actual.join(",")})`,
      path,
    );
  }
};

const text = (value, path, { nullable = false, max = 4096 } = {}) => {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    value.normalize("NFC") !== value ||
    [...value].some((character) => character.codePointAt(0) < 32)
  ) {
    fail("pricing_catalog_invalid", "must be bounded NFC text", path);
  }
  return value;
};

const slug = (value, path) => {
  const normalized = text(value, path, { max: 128 });
  if (!SLUG_RE.test(normalized)) {
    fail("pricing_catalog_invalid", "must be a lowercase slug", path);
  }
  return normalized;
};

const isValidTimestamp = (value) => {
  const calendarPrefix = typeof value === "string" ? value.slice(0, 19) : "";
  const parsed = new Date(`${calendarPrefix}Z`);
  return !(
    typeof value !== "string" ||
    !RFC3339_RE.test(value) ||
    value.startsWith("0000-") ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 19) !== calendarPrefix
  );
};

const timestampNanoseconds = (value) => {
  const milliseconds = BigInt(new Date(`${value.slice(0, 19)}Z`).getTime());
  const fraction = value.match(/\.(\d+)Z$/)?.[1] || "";
  return milliseconds * 1_000_000n + BigInt(fraction.padEnd(9, "0") || "0");
};

const timestamp = (value, path, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (!isValidTimestamp(value)) {
    fail("pricing_catalog_invalid", "must be an RFC3339 UTC timestamp", path);
  }
  return value;
};

const safeInteger = (value, path, { nullable = false, positive = false } = {}) => {
  if (nullable && value === null) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0)
  ) {
    fail(
      "pricing_catalog_invalid",
      nullable ? "must be null or a non-negative safe integer" : "must be a non-negative safe integer",
      path,
    );
  }
  return value;
};

const canonicalValue = (value, path = "value") => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.normalize("NFC") !== value) {
      fail("pricing_catalog_invalid", "must use NFC text", path);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail("pricing_catalog_invalid", "numbers must be safe integers", path);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(item, `${path}[${index}]`));
  }
  if (!isObject(value)) {
    fail("pricing_catalog_invalid", "must be strict JSON", path);
  }
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const normalizedKey = key.normalize("NFC");
    if (normalizedKey !== key || Object.hasOwn(normalized, normalizedKey)) {
      fail("pricing_catalog_invalid", "contains a duplicate/non-NFC key", path);
    }
    normalized[normalizedKey] = canonicalValue(value[key], `${path}.${key}`);
  }
  return normalized;
};

export const canonicalJson = (value) =>
  JSON.stringify(canonicalValue(value));

export const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const validateSource = (value, index) => {
  const path = `catalog.sources[${index}]`;
  exactKeys(
    value,
    ["provider", "url", "retrieved_at", "source_digest", "review_note"],
    path,
  );
  const sourceDigest = text(value.source_digest, `${path}.source_digest`);
  if (!SHA256_RE.test(sourceDigest)) {
    fail("pricing_catalog_invalid", "must be a lowercase SHA-256", `${path}.source_digest`);
  }
  return {
    provider: slug(value.provider, `${path}.provider`),
    url: text(value.url, `${path}.url`),
    retrieved_at: timestamp(value.retrieved_at, `${path}.retrieved_at`),
    source_digest: sourceDigest,
    review_note: text(value.review_note, `${path}.review_note`),
  };
};

const validateEntry = (value, index, sourceCount) => {
  const path = `catalog.entries[${index}]`;
  exactKeys(
    value,
    [
      "provider",
      "billing_surface",
      "model",
      "service_tier",
      "batch",
      "inference_geo",
      "currency",
      "rates_nano_usd_per_million",
      "long_context_rule",
      "source_index",
    ],
    path,
  );
  if (typeof value.batch !== "boolean") {
    fail("pricing_catalog_invalid", "must be boolean", `${path}.batch`);
  }
  if (!Number.isSafeInteger(value.source_index) || value.source_index < 0 || value.source_index >= sourceCount) {
    fail("pricing_catalog_invalid", "must reference one source", `${path}.source_index`);
  }
  exactKeys(value.rates_nano_usd_per_million, TOKEN_RATE_KEYS, `${path}.rates_nano_usd_per_million`);
  const rates = Object.fromEntries(
    TOKEN_RATE_KEYS.map((key) => [
      key,
      safeInteger(
        value.rates_nano_usd_per_million[key],
        `${path}.rates_nano_usd_per_million.${key}`,
        { nullable: true },
      ),
    ]),
  );
  let longContextRule = null;
  if (value.long_context_rule !== null) {
    exactKeys(
      value.long_context_rule,
      ["threshold_input_tokens", "input_multiplier_ppm", "output_multiplier_ppm"],
      `${path}.long_context_rule`,
    );
    longContextRule = {
      threshold_input_tokens: safeInteger(
        value.long_context_rule.threshold_input_tokens,
        `${path}.long_context_rule.threshold_input_tokens`,
        { positive: true },
      ),
      input_multiplier_ppm: safeInteger(
        value.long_context_rule.input_multiplier_ppm,
        `${path}.long_context_rule.input_multiplier_ppm`,
        { positive: true },
      ),
      output_multiplier_ppm: safeInteger(
        value.long_context_rule.output_multiplier_ppm,
        `${path}.long_context_rule.output_multiplier_ppm`,
        { positive: true },
      ),
    };
  }
  return {
    provider: slug(value.provider, `${path}.provider`),
    billing_surface: slug(value.billing_surface, `${path}.billing_surface`),
    model: text(value.model, `${path}.model`, { max: 256 }),
    service_tier: slug(value.service_tier, `${path}.service_tier`),
    batch: value.batch,
    inference_geo: slug(value.inference_geo, `${path}.inference_geo`),
    currency: text(value.currency, `${path}.currency`, { max: 8 }),
    rates_nano_usd_per_million: rates,
    long_context_rule: longContextRule,
    source_index: value.source_index,
  };
};

export const validateCatalogPayload = (value) => {
  exactKeys(
    value,
    [
      "schema",
      "catalog_version",
      "currency",
      "effective_from",
      "effective_to",
      "retrieved_at",
      "sources",
      "entries",
    ],
    "catalog",
  );
  if (value.schema !== PRICING_CATALOG_SCHEMA) {
    fail("pricing_catalog_invalid", `schema must be ${PRICING_CATALOG_SCHEMA}`, "catalog.schema");
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    fail("pricing_catalog_invalid", "must contain at least one source", "catalog.sources");
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    fail("pricing_catalog_invalid", "must contain at least one entry", "catalog.entries");
  }
  const sources = value.sources.map(validateSource);
  const entries = value.entries.map((entry, index) =>
    validateEntry(entry, index, sources.length),
  );
  const catalogCurrency = text(value.currency, "catalog.currency", { max: 8 });
  if (catalogCurrency !== "USD") {
    fail("pricing_catalog_invalid", "currency must be USD", "catalog.currency");
  }
  const identitySet = new Set();
  for (const [index, entry] of entries.entries()) {
    const identity = canonicalJson([
      entry.provider,
      entry.billing_surface,
      entry.model,
      entry.service_tier,
      entry.batch,
      entry.inference_geo,
    ]);
    if (identitySet.has(identity)) {
      fail("pricing_catalog_invalid", "contains a duplicate price identity", `catalog.entries[${index}]`);
    }
    identitySet.add(identity);
    if (entry.currency !== catalogCurrency) {
      fail(
        "pricing_catalog_invalid",
        "entry currency must match catalog currency",
        `catalog.entries[${index}].currency`,
      );
    }
    if (sources[entry.source_index].provider !== entry.provider) {
      fail(
        "pricing_catalog_invalid",
        "entry provider must match its source provider",
        `catalog.entries[${index}].source_index`,
      );
    }
  }
  const effectiveFrom = timestamp(value.effective_from, "catalog.effective_from");
  const effectiveTo = timestamp(value.effective_to, "catalog.effective_to", { nullable: true });
  if (
    effectiveTo !== null &&
    timestampNanoseconds(effectiveTo) <= timestampNanoseconds(effectiveFrom)
  ) {
    fail("pricing_catalog_invalid", "must be later than effective_from", "catalog.effective_to");
  }
  const retrievedAt = timestamp(value.retrieved_at, "catalog.retrieved_at");
  for (const [index, source] of sources.entries()) {
    if (
      timestampNanoseconds(source.retrieved_at) >
      timestampNanoseconds(retrievedAt)
    ) {
      fail(
        "pricing_catalog_invalid",
        "source retrieval cannot follow catalog retrieval",
        `catalog.sources[${index}].retrieved_at`,
      );
    }
  }
  return {
    schema: PRICING_CATALOG_SCHEMA,
    catalog_version: text(value.catalog_version, "catalog.catalog_version", { max: 128 }),
    currency: catalogCurrency,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    retrieved_at: retrievedAt,
    sources,
    entries,
  };
};

export const signCatalog = (payload, { privateKeyPem, keyId }) => {
  const normalized = validateCatalogPayload(payload);
  const payloadBytes = Buffer.from(canonicalJson(normalized));
  const digest = sha256(payloadBytes);
  const signature = crypto.sign(null, payloadBytes, privateKeyPem).toString("base64");
  return {
    schema: PRICING_ENVELOPE_SCHEMA,
    payload: normalized,
    payload_sha256: digest,
    signature: {
      algorithm: "ed25519",
      key_id: text(keyId, "signature.key_id", { max: 128 }),
      value_base64: signature,
    },
  };
};

export const verifyCatalog = (envelope, { trustedPublicKeys }) => {
  exactKeys(
    envelope,
    ["schema", "payload", "payload_sha256", "signature"],
    "envelope",
  );
  if (envelope.schema !== PRICING_ENVELOPE_SCHEMA) {
    fail("pricing_catalog_signature_invalid", "unknown envelope schema", "envelope.schema");
  }
  exactKeys(
    envelope.signature,
    ["algorithm", "key_id", "value_base64"],
    "envelope.signature",
  );
  if (envelope.signature.algorithm !== "ed25519") {
    fail("pricing_catalog_signature_invalid", "algorithm must be ed25519", "envelope.signature.algorithm");
  }
  const keyId = text(envelope.signature.key_id, "envelope.signature.key_id", { max: 128 });
  const publicKey = trustedPublicKeys?.[keyId];
  if (typeof publicKey !== "string" || publicKey.length === 0) {
    fail("pricing_catalog_signature_invalid", "key is not trusted", "envelope.signature.key_id");
  }
  const normalized = validateCatalogPayload(envelope.payload);
  const payloadBytes = Buffer.from(canonicalJson(normalized));
  const digest = sha256(payloadBytes);
  if (envelope.payload_sha256 !== digest || !SHA256_RE.test(envelope.payload_sha256)) {
    fail("pricing_catalog_signature_invalid", "payload digest changed", "envelope.payload_sha256");
  }
  let signatureBytes;
  try {
    signatureBytes = Buffer.from(envelope.signature.value_base64, "base64");
  } catch {
    fail("pricing_catalog_signature_invalid", "signature is not base64", "envelope.signature.value_base64");
  }
  if (
    signatureBytes.length !== 64 ||
    !crypto.verify(null, payloadBytes, publicKey, signatureBytes)
  ) {
    fail("pricing_catalog_signature_invalid", "signature verification failed", "envelope.signature");
  }
  const verified = { payload: normalized, payload_sha256: digest, key_id: keyId };
  Object.defineProperty(verified, VERIFIED_CATALOG_BRAND, { value: true });
  return Object.freeze(verified);
};

const normalizeUsage = (value) => {
  exactKeys(value, USAGE_KEYS, "usage");
  return Object.fromEntries(
    USAGE_KEYS.map((key) => [
      key,
      safeInteger(value[key], `usage.${key}`, { nullable: true }),
    ]),
  );
};

const unavailable = (reason, extra = {}) => ({
  status: "unavailable",
  kind: null,
  amount_nano_usd: null,
  currency: null,
  reason,
  ...extra,
});

const multiplyPpm = (amount, ppm) =>
  (amount * BigInt(ppm) + 500000n) / 1000000n;

export const estimateCost = ({
  verifiedCatalog,
  provider,
  billingSurface,
  model,
  serviceTier,
  batch,
  inferenceGeo,
  occurredAt,
  usage,
}) => {
  const payload = verifiedCatalog?.payload;
  if (
    verifiedCatalog?.[VERIFIED_CATALOG_BRAND] !== true ||
    !payload ||
    verifiedCatalog.payload_sha256 !== sha256(Buffer.from(canonicalJson(payload)))
  ) {
    return unavailable("pricing_catalog_unverified");
  }
  if (serviceTier === undefined || serviceTier === null) {
    return unavailable("pricing_service_tier_unknown");
  }
  if (typeof serviceTier !== "string" || !SLUG_RE.test(serviceTier)) {
    return unavailable("pricing_service_tier_invalid");
  }
  if (billingSurface === undefined || billingSurface === null) {
    return unavailable("pricing_billing_surface_unknown");
  }
  if (typeof billingSurface !== "string" || !SLUG_RE.test(billingSurface)) {
    return unavailable("pricing_billing_surface_invalid");
  }
  if (batch === undefined || batch === null) {
    return unavailable("pricing_batch_mode_unknown");
  }
  if (typeof batch !== "boolean") {
    return unavailable("pricing_batch_mode_invalid");
  }
  if (inferenceGeo === undefined || inferenceGeo === null) {
    return unavailable("pricing_inference_geo_unknown");
  }
  if (typeof inferenceGeo !== "string" || !SLUG_RE.test(inferenceGeo)) {
    return unavailable("pricing_inference_geo_invalid");
  }
  const normalizedUsage = normalizeUsage(usage);
  if (!isValidTimestamp(occurredAt)) return unavailable("pricing_time_invalid");
  const occurredAtNanoseconds = timestampNanoseconds(occurredAt);
  if (
    occurredAtNanoseconds < timestampNanoseconds(payload.effective_from) ||
    (payload.effective_to !== null &&
      occurredAtNanoseconds >= timestampNanoseconds(payload.effective_to))
  ) {
    return unavailable("pricing_catalog_not_effective");
  }
  const matches = payload.entries.filter(
    (entry) =>
      entry.provider === provider &&
      entry.billing_surface === billingSurface &&
      entry.model === model &&
      entry.service_tier === serviceTier &&
      entry.batch === batch &&
      entry.inference_geo === inferenceGeo,
  );
  if (matches.length !== 1) return unavailable(matches.length ? "pricing_identity_ambiguous" : "pricing_identity_unknown");
  const entry = matches[0];
  const aggregateWrite = normalizedUsage.input_cache_write_tokens;
  const write5m = normalizedUsage.input_cache_write_5m_tokens;
  const write1h = normalizedUsage.input_cache_write_1h_tokens;
  if (
    aggregateWrite !== null &&
    write5m !== null &&
    write1h !== null &&
    aggregateWrite !== write5m + write1h
  ) {
    return unavailable("cache_write_breakdown_conflict");
  }
  const components = [
    ["input_uncached_tokens", "input_uncached"],
    ["input_cache_read_tokens", "input_cache_read"],
    ["output_tokens", "output"],
  ];
  if (write5m !== null || write1h !== null) {
    components.push(
      ["input_cache_write_5m_tokens", "input_cache_write_5m"],
      ["input_cache_write_1h_tokens", "input_cache_write_1h"],
    );
  } else {
    components.push(["input_cache_write_tokens", "input_cache_write"]);
  }
  let inputAmount = 0n;
  let outputAmount = 0n;
  const pricedComponents = {};
  for (const [usageKey, rateKey] of components) {
    const tokenCount = normalizedUsage[usageKey];
    if (tokenCount === null) return unavailable(`usage_${usageKey}_unknown`);
    const rate = entry.rates_nano_usd_per_million[rateKey];
    if (tokenCount > 0 && rate === null) return unavailable(`rate_${rateKey}_unknown`);
    const amountNumerator = BigInt(tokenCount) * BigInt(rate ?? 0);
    const roundedComponentAmount = (amountNumerator + 500000n) / 1000000n;
    pricedComponents[rateKey] = {
      tokens: tokenCount,
      rate_nano_usd_per_million: rate,
      amount_nano_usd: roundedComponentAmount.toString(),
    };
    if (rateKey === "output") outputAmount += amountNumerator;
    else inputAmount += amountNumerator;
  }
  const totalInputTokens =
    (normalizedUsage.input_uncached_tokens ?? 0) +
    (normalizedUsage.input_cache_read_tokens ?? 0) +
    (aggregateWrite ?? write5m ?? 0) +
    (aggregateWrite === null ? write1h ?? 0 : 0);
  let inputMultiplierPpm = 1000000;
  let outputMultiplierPpm = 1000000;
  if (
    entry.long_context_rule !== null &&
    totalInputTokens > entry.long_context_rule.threshold_input_tokens
  ) {
    inputMultiplierPpm = entry.long_context_rule.input_multiplier_ppm;
    outputMultiplierPpm = entry.long_context_rule.output_multiplier_ppm;
  }
  const amountNumerator =
    multiplyPpm(inputAmount, inputMultiplierPpm) +
    multiplyPpm(outputAmount, outputMultiplierPpm);
  const amount = (amountNumerator + 500000n) / 1000000n;
  const entryDigest = sha256(Buffer.from(canonicalJson(entry)));
  const source = payload.sources[entry.source_index];
  return {
    status: "estimated",
    kind: "list_price_estimate",
    amount_nano_usd: amount.toString(),
    currency: entry.currency,
    reason: null,
    catalog_version: payload.catalog_version,
    catalog_payload_sha256: verifiedCatalog.payload_sha256,
    catalog_key_id: verifiedCatalog.key_id,
    pricing_entry_sha256: entryDigest,
    effective_at: occurredAt,
    source_url: source.url,
    source_digest: source.source_digest,
    input_multiplier_ppm: inputMultiplierPpm,
    output_multiplier_ppm: outputMultiplierPpm,
    components: pricedComponents,
  };
};
