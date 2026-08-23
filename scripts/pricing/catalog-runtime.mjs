import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  PRICING_CATALOG_SCHEMA,
  canonicalJson,
  sha256,
  validateCatalogPayload,
  verifyCatalog,
} from "./catalog-lib.mjs";

export const PRICING_TRUST_STORE_SCHEMA = "pupu.pricing_trust_store.v1";
export const VERIFIED_PRICING_PROJECTION_SCHEMA =
  "pupu.verified_pricing_catalog_projection.v1";
export const PRICING_SOURCE_CAPTURE_SCHEMA =
  "pupu.pricing_source_capture.v1";

const SHA256_RE = /^[a-f0-9]{64}$/;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const VERIFIED_CATALOG_BRAND = Symbol("verified-pricing-catalog");
const SOURCE_CAPTURE_BRAND = Symbol("official-pricing-source-capture");

const OFFICIAL_SOURCE_RULES = Object.freeze([
  Object.freeze({
    provider: "openai",
    hostname: "developers.openai.com",
    paths: Object.freeze([
      "/api/docs/pricing",
      "/api/docs/guides/latest-model",
    ]),
    pathPrefixes: Object.freeze(["/api/docs/models/"]),
  }),
  Object.freeze({
    provider: "anthropic",
    hostname: "platform.claude.com",
    paths: Object.freeze([
      "/docs/en/about-claude/pricing",
      "/docs/en/manage-claude/usage-cost-api",
    ]),
    pathPrefixes: Object.freeze([]),
  }),
]);

export class PricingRuntimeError extends Error {
  constructor(code, message, target = "pricing") {
    super(`${code}: ${target}: ${message}`);
    this.name = "PricingRuntimeError";
    this.code = code;
    this.target = target;
  }
}

const fail = (code, message, target) => {
  throw new PricingRuntimeError(code, message, target);
};

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const exactKeys = (value, expected, target) => {
  if (!isObject(value)) fail("pricing_runtime_invalid", "must be an object", target);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(
      "pricing_runtime_invalid",
      `unexpected key set (${actual.join(",")})`,
      target,
    );
  }
};

const boundedText = (
  value,
  target,
  { nullable = false, max = 4096, allowLineBreaks = false } = {},
) => {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    value.normalize("NFC") !== value ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint < 32 && !(allowLineBreaks && (codePoint === 10 || codePoint === 13));
    })
  ) {
    fail("pricing_runtime_invalid", "must be bounded NFC text", target);
  }
  return value;
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

const timestamp = (value, target, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (!isValidTimestamp(value)) {
    fail("pricing_runtime_invalid", "must be an RFC3339 UTC timestamp", target);
  }
  return value;
};

const digest = (value, target) => {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail("pricing_runtime_invalid", "must be a lowercase SHA-256", target);
  }
  return value;
};

const parseJsonBytes = (bytes, target) => {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_JSON_BYTES) {
    fail("pricing_runtime_invalid", "JSON file is empty or too large", target);
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    fail("pricing_runtime_invalid", `invalid UTF-8 (${error.message})`, target);
  }
  let cursor = 0;
  const syntax = (message) =>
    fail("pricing_runtime_invalid", `${message} at byte ${cursor}`, target);
  const skipWhitespace = () => {
    while (/[\t\n\r ]/.test(source[cursor] || "")) cursor += 1;
  };
  const parseString = () => {
    if (source[cursor] !== '"') syntax("expected string");
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(source.slice(start, cursor));
        } catch {
          syntax("invalid string escape");
        }
      }
      if (character === "\\") {
        cursor += 2;
      } else {
        if (character.codePointAt(0) < 32) syntax("unescaped control character");
        cursor += 1;
      }
    }
    syntax("unterminated string");
  };
  const parseValue = (depth = 0) => {
    if (depth > 64) syntax("JSON nesting is too deep");
    skipWhitespace();
    const character = source[cursor];
    if (character === '"') return parseString();
    if (character === "{") {
      cursor += 1;
      skipWhitespace();
      const value = {};
      const keys = new Set();
      if (source[cursor] === "}") {
        cursor += 1;
        return value;
      }
      while (cursor < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) syntax(`duplicate object key ${JSON.stringify(key)}`);
        keys.add(key);
        skipWhitespace();
        if (source[cursor] !== ":") syntax("expected colon");
        cursor += 1;
        value[key] = parseValue(depth + 1);
        skipWhitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return value;
        }
        if (source[cursor] !== ",") syntax("expected comma or object end");
        cursor += 1;
      }
      syntax("unterminated object");
    }
    if (character === "[") {
      cursor += 1;
      skipWhitespace();
      const value = [];
      if (source[cursor] === "]") {
        cursor += 1;
        return value;
      }
      while (cursor < source.length) {
        value.push(parseValue(depth + 1));
        skipWhitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return value;
        }
        if (source[cursor] !== ",") syntax("expected comma or array end");
        cursor += 1;
      }
      syntax("unterminated array");
    }
    for (const [token, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ]) {
      if (source.startsWith(token, cursor)) {
        cursor += token.length;
        return value;
      }
    }
    const numberMatch = source
      .slice(cursor)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      cursor += numberMatch[0].length;
      return JSON.parse(numberMatch[0]);
    }
    syntax("unexpected token");
  };
  const value = parseValue();
  skipWhitespace();
  if (cursor !== source.length) syntax("trailing data");
  return value;
};

export const loadStrictJsonFile = async (filePath, target = "json_file") => {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_JSON_BYTES) {
    fail("pricing_runtime_invalid", "JSON file is empty or too large", target);
  }
  return parseJsonBytes(await fs.readFile(filePath), target);
};

export const classifyOfficialPricingSource = (sourceUrl) => {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    fail("pricing_source_not_official", "must be an absolute URL", "source.url");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    fail(
      "pricing_source_not_official",
      "must be an uncredentialed HTTPS URL without port, query, or fragment",
      "source.url",
    );
  }
  const rule = OFFICIAL_SOURCE_RULES.find(
    (candidate) =>
      parsed.hostname === candidate.hostname &&
      (candidate.paths.includes(parsed.pathname) ||
        candidate.pathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))),
  );
  if (!rule) {
    fail(
      "pricing_source_not_official",
      "URL is not in the reviewed official pricing-source allowlist",
      "source.url",
    );
  }
  return Object.freeze({ provider: rule.provider, url: parsed.toString() });
};

const normalizeTrustedKey = (value, index) => {
  const target = `trust_store.keys[${index}]`;
  exactKeys(
    value,
    [
      "key_id",
      "algorithm",
      "public_key_pem",
      "public_key_sha256",
      "not_before",
      "not_after",
    ],
    target,
  );
  if (value.algorithm !== "ed25519") {
    fail("pricing_trust_store_invalid", "algorithm must be ed25519", `${target}.algorithm`);
  }
  const publicKeyPem = boundedText(value.public_key_pem, `${target}.public_key_pem`, {
    max: 8192,
    allowLineBreaks: true,
  });
  if (publicKeyPem.includes("PRIVATE KEY")) {
    fail("pricing_trust_store_invalid", "private keys are prohibited", `${target}.public_key_pem`);
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch {
    fail("pricing_trust_store_invalid", "public key is not valid PEM", `${target}.public_key_pem`);
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    fail("pricing_trust_store_invalid", "public key must be Ed25519", `${target}.public_key_pem`);
  }
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const observedDigest = sha256(publicKeyDer);
  const pinnedDigest = digest(value.public_key_sha256, `${target}.public_key_sha256`);
  if (observedDigest !== pinnedDigest) {
    fail("pricing_trust_store_invalid", "public key digest does not match", `${target}.public_key_sha256`);
  }
  const notBefore = timestamp(value.not_before, `${target}.not_before`);
  const notAfter = timestamp(value.not_after, `${target}.not_after`, { nullable: true });
  if (
    notAfter !== null &&
    timestampNanoseconds(notAfter) <= timestampNanoseconds(notBefore)
  ) {
    fail("pricing_trust_store_invalid", "not_after must follow not_before", `${target}.not_after`);
  }
  return Object.freeze({
    key_id: boundedText(value.key_id, `${target}.key_id`, { max: 128 }),
    algorithm: "ed25519",
    public_key_pem: publicKeyPem,
    public_key_sha256: pinnedDigest,
    not_before: notBefore,
    not_after: notAfter,
  });
};

export const validateTrustStore = (value) => {
  exactKeys(value, ["schema", "keys"], "trust_store");
  if (value.schema !== PRICING_TRUST_STORE_SCHEMA) {
    fail(
      "pricing_trust_store_invalid",
      `schema must be ${PRICING_TRUST_STORE_SCHEMA}`,
      "trust_store.schema",
    );
  }
  if (!Array.isArray(value.keys) || value.keys.length === 0) {
    fail("pricing_trust_store_invalid", "must contain at least one key", "trust_store.keys");
  }
  const keys = value.keys.map(normalizeTrustedKey);
  if (new Set(keys.map((key) => key.key_id)).size !== keys.length) {
    fail("pricing_trust_store_invalid", "key_id values must be unique", "trust_store.keys");
  }
  return Object.freeze({ schema: PRICING_TRUST_STORE_SCHEMA, keys: Object.freeze(keys) });
};

export const loadTrustStoreFile = async (trustStorePath) => {
  return validateTrustStore(
    await loadStrictJsonFile(trustStorePath, "trust_store_file"),
  );
};

const assertOfficialCatalogSources = (payload) => {
  for (const [index, source] of payload.sources.entries()) {
    const official = classifyOfficialPricingSource(source.url);
    if (official.provider !== source.provider) {
      fail(
        "pricing_source_not_official",
        "source provider does not match its official host",
        `catalog.sources[${index}].provider`,
      );
    }
  }
};

export const loadVerifiedCatalogFile = async ({
  catalogPath,
  trustStorePath,
}) => {
  const [envelope, trustStore] = await Promise.all([
    loadStrictJsonFile(catalogPath, "catalog_file"),
    loadTrustStoreFile(trustStorePath),
  ]);
  const trustedPublicKeys = Object.fromEntries(
    trustStore.keys.map((key) => [key.key_id, key.public_key_pem]),
  );
  const verified = verifyCatalog(envelope, { trustedPublicKeys });
  const trustedKey = trustStore.keys.find((key) => key.key_id === verified.key_id);
  if (!trustedKey) {
    fail("pricing_catalog_signature_invalid", "signing key is not trusted", "catalog.signature.key_id");
  }
  const trustedVerificationTime = timestamp(new Date().toISOString(), "verified_at");
  const trustedVerificationNanoseconds = timestampNanoseconds(trustedVerificationTime);
  if (
    trustedVerificationNanoseconds < timestampNanoseconds(trustedKey.not_before) ||
    (trustedKey.not_after !== null &&
      trustedVerificationNanoseconds >= timestampNanoseconds(trustedKey.not_after))
  ) {
    fail(
      "pricing_catalog_signature_invalid",
      "trusted verification time is outside the trusted key interval",
      "verified_at",
    );
  }
  assertOfficialCatalogSources(verified.payload);
  const result = {
    payload: verified.payload,
    payload_sha256: verified.payload_sha256,
    key_id: verified.key_id,
    trusted_public_key_sha256: trustedKey.public_key_sha256,
  };
  Object.defineProperty(result, "signature_verified_catalog", {
    value: verified,
    enumerable: false,
  });
  Object.defineProperty(result, VERIFIED_CATALOG_BRAND, { value: true });
  return Object.freeze(result);
};

export const buildVerifiedCatalogProjection = (verifiedCatalog) => {
  if (
    !isObject(verifiedCatalog) ||
    verifiedCatalog[VERIFIED_CATALOG_BRAND] !== true ||
    typeof verifiedCatalog.key_id !== "string" ||
    !SHA256_RE.test(verifiedCatalog.trusted_public_key_sha256 || "")
  ) {
    fail("pricing_catalog_unverified", "verified catalog evidence is missing", "verified_catalog");
  }
  const catalog = validateCatalogPayload(verifiedCatalog.payload);
  const payloadDigest = sha256(Buffer.from(canonicalJson(catalog)));
  if (payloadDigest !== verifiedCatalog.payload_sha256) {
    fail("pricing_catalog_unverified", "catalog payload digest changed", "verified_catalog.payload");
  }
  assertOfficialCatalogSources(catalog);
  const body = {
    schema: VERIFIED_PRICING_PROJECTION_SCHEMA,
    verification: {
      algorithm: "ed25519",
      key_id: verifiedCatalog.key_id,
      trusted_public_key_sha256: verifiedCatalog.trusted_public_key_sha256,
      catalog_payload_sha256: payloadDigest,
    },
    catalog,
  };
  return {
    ...body,
    projection_sha256: sha256(Buffer.from(canonicalJson(body))),
  };
};

export const validatePinnedProjection = (value, { expectedProjectionSha256 }) => {
  exactKeys(
    value,
    ["schema", "verification", "catalog", "projection_sha256"],
    "projection",
  );
  if (value.schema !== VERIFIED_PRICING_PROJECTION_SCHEMA) {
    fail(
      "pricing_projection_invalid",
      `schema must be ${VERIFIED_PRICING_PROJECTION_SCHEMA}`,
      "projection.schema",
    );
  }
  exactKeys(
    value.verification,
    ["algorithm", "key_id", "trusted_public_key_sha256", "catalog_payload_sha256"],
    "projection.verification",
  );
  if (value.verification.algorithm !== "ed25519") {
    fail("pricing_projection_invalid", "algorithm must be ed25519", "projection.verification.algorithm");
  }
  boundedText(value.verification.key_id, "projection.verification.key_id", { max: 128 });
  digest(
    value.verification.trusted_public_key_sha256,
    "projection.verification.trusted_public_key_sha256",
  );
  const catalogDigest = digest(
    value.verification.catalog_payload_sha256,
    "projection.verification.catalog_payload_sha256",
  );
  const catalog = validateCatalogPayload(value.catalog);
  assertOfficialCatalogSources(catalog);
  if (sha256(Buffer.from(canonicalJson(catalog))) !== catalogDigest) {
    fail("pricing_projection_invalid", "catalog payload digest changed", "projection.catalog");
  }
  const projectionDigest = digest(value.projection_sha256, "projection.projection_sha256");
  const body = {
    schema: VERIFIED_PRICING_PROJECTION_SCHEMA,
    verification: value.verification,
    catalog,
  };
  if (sha256(Buffer.from(canonicalJson(body))) !== projectionDigest) {
    fail("pricing_projection_invalid", "projection digest changed", "projection.projection_sha256");
  }
  if (
    typeof expectedProjectionSha256 !== "string" ||
    expectedProjectionSha256 !== projectionDigest
  ) {
    fail("pricing_projection_untrusted", "projection digest is not pinned", "expected_projection_sha256");
  }
  return Object.freeze({ ...body, projection_sha256: projectionDigest });
};

export const loadPinnedProjectionFile = async ({
  projectionPath,
  expectedProjectionSha256,
}) => {
  const projection = await loadStrictJsonFile(projectionPath, "projection_file");
  return validatePinnedProjection(projection, {
    expectedProjectionSha256,
  });
};

const nullableHeader = (headers, name) => {
  const value = headers.get(name);
  return value && value.length <= 4096 ? value : null;
};

const readBoundedResponseBody = async (response) => {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_SOURCE_BYTES
  ) {
    fail("pricing_source_fetch_failed", "source body is too large", "response.body");
  }
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > MAX_SOURCE_BYTES) {
          await reader.cancel();
          fail("pricing_source_fetch_failed", "source body is too large", "response.body");
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }
  return Buffer.from(await response.arrayBuffer());
};

export const fetchOfficialSourceCapture = async ({
  sourceUrl,
  retrievedAt = new Date().toISOString(),
  fetchImpl = globalThis.fetch,
}) => {
  const requested = classifyOfficialPricingSource(sourceUrl);
  timestamp(retrievedAt, "capture.retrieved_at");
  if (typeof fetchImpl !== "function") {
    fail("pricing_source_fetch_failed", "fetch is unavailable", "fetch");
  }
  const signal = AbortSignal.timeout(30_000);
  let currentSource = requested;
  let response = null;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    response = await fetchImpl(currentSource.url, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8",
        "user-agent": "PuPu-pricing-catalog-review/1.0",
      },
    });
    if (response.status < 300 || response.status >= 400) break;
    if (redirectCount === 5) {
      fail("pricing_source_fetch_failed", "too many official redirects", "response.location");
    }
    const location = response.headers.get("location");
    if (!location) {
      fail("pricing_source_fetch_failed", "redirect omitted Location", "response.location");
    }
    const redirected = classifyOfficialPricingSource(
      new URL(location, currentSource.url).toString(),
    );
    if (redirected.provider !== requested.provider) {
      fail("pricing_source_fetch_failed", "redirect changed provider", "response.location");
    }
    currentSource = redirected;
  }
  if (response === null) {
    fail("pricing_source_fetch_failed", "official source returned no response", "response");
  }
  const finalSource = classifyOfficialPricingSource(response.url || currentSource.url);
  if (finalSource.provider !== requested.provider) {
    fail("pricing_source_fetch_failed", "redirect changed provider", "response.url");
  }
  if (!response.ok) {
    fail("pricing_source_fetch_failed", `official source returned HTTP ${response.status}`, "response.status");
  }
  const body = await readBoundedResponseBody(response);
  if (body.length === 0 || body.length > MAX_SOURCE_BYTES) {
    fail("pricing_source_fetch_failed", "source body is empty or too large", "response.body");
  }
  const bodySha256 = sha256(body);
  const manifestBody = {
    schema: PRICING_SOURCE_CAPTURE_SCHEMA,
    provider: requested.provider,
    requested_url: requested.url,
    final_url: finalSource.url,
    retrieved_at: retrievedAt,
    http_status: response.status,
    content_type: nullableHeader(response.headers, "content-type"),
    etag: nullableHeader(response.headers, "etag"),
    last_modified: nullableHeader(response.headers, "last-modified"),
    body_sha256: bodySha256,
    body_bytes: body.length,
    body_file: `source-${bodySha256}.bin`,
  };
  const capture = {
    manifest: Object.freeze({
      ...manifestBody,
      capture_sha256: sha256(Buffer.from(canonicalJson(manifestBody))),
    }),
    body,
  };
  Object.defineProperty(capture, SOURCE_CAPTURE_BRAND, { value: true });
  return Object.freeze(capture);
};

export const writeOfficialSourceCapture = async ({ outputDirectory, capture }) => {
  if (
    !isObject(capture) ||
    capture[SOURCE_CAPTURE_BRAND] !== true ||
    !isObject(capture.manifest) ||
    !Buffer.isBuffer(capture.body)
  ) {
    fail("pricing_source_capture_invalid", "capture must contain manifest and body", "capture");
  }
  const observedBodySha256 = sha256(capture.body);
  if (
    capture.manifest.body_sha256 !== observedBodySha256 ||
    capture.manifest.body_file !== `source-${observedBodySha256}.bin`
  ) {
    fail("pricing_source_capture_invalid", "source body digest changed", "capture.body");
  }
  const { capture_sha256: captureSha256, ...manifestBody } = capture.manifest;
  if (sha256(Buffer.from(canonicalJson(manifestBody))) !== captureSha256) {
    fail("pricing_source_capture_invalid", "capture manifest digest changed", "capture.manifest");
  }
  const targetDirectory = path.resolve(outputDirectory);
  await fs.mkdir(targetDirectory, { recursive: true });
  const bodyPath = path.join(targetDirectory, capture.manifest.body_file);
  const manifestPath = path.join(targetDirectory, "capture.json");
  await fs.writeFile(bodyPath, capture.body, { flag: "wx", mode: 0o600 });
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(capture.manifest, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  return Object.freeze({ bodyPath, manifestPath });
};

export const loadOfficialSourceCapture = async ({ manifestPath }) => {
  const manifest = await loadStrictJsonFile(manifestPath, "capture_manifest_file");
  exactKeys(
    manifest,
    [
      "schema",
      "provider",
      "requested_url",
      "final_url",
      "retrieved_at",
      "http_status",
      "content_type",
      "etag",
      "last_modified",
      "body_sha256",
      "body_bytes",
      "body_file",
      "capture_sha256",
    ],
    "capture.manifest",
  );
  if (manifest.schema !== PRICING_SOURCE_CAPTURE_SCHEMA) {
    fail(
      "pricing_source_capture_invalid",
      `schema must be ${PRICING_SOURCE_CAPTURE_SCHEMA}`,
      "capture.manifest.schema",
    );
  }
  const requested = classifyOfficialPricingSource(manifest.requested_url);
  const finalSource = classifyOfficialPricingSource(manifest.final_url);
  const provider = boundedText(manifest.provider, "capture.manifest.provider", { max: 64 });
  if (provider !== requested.provider || provider !== finalSource.provider) {
    fail(
      "pricing_source_capture_invalid",
      "capture provider must match requested and final official sources",
      "capture.manifest.provider",
    );
  }
  timestamp(manifest.retrieved_at, "capture.manifest.retrieved_at");
  if (!Number.isSafeInteger(manifest.http_status) || manifest.http_status < 200 || manifest.http_status >= 300) {
    fail("pricing_source_capture_invalid", "HTTP status must be successful", "capture.manifest.http_status");
  }
  for (const field of ["content_type", "etag", "last_modified"]) {
    boundedText(manifest[field], `capture.manifest.${field}`, { nullable: true });
  }
  const bodySha256 = digest(manifest.body_sha256, "capture.manifest.body_sha256");
  if (
    !Number.isSafeInteger(manifest.body_bytes) ||
    manifest.body_bytes <= 0 ||
    manifest.body_bytes > MAX_SOURCE_BYTES
  ) {
    fail("pricing_source_capture_invalid", "body size is invalid", "capture.manifest.body_bytes");
  }
  if (manifest.body_file !== `source-${bodySha256}.bin`) {
    fail("pricing_source_capture_invalid", "body filename must be digest-bound", "capture.manifest.body_file");
  }
  const captureSha256 = digest(
    manifest.capture_sha256,
    "capture.manifest.capture_sha256",
  );
  const { capture_sha256: ignoredCaptureSha256, ...manifestBody } = manifest;
  if (sha256(Buffer.from(canonicalJson(manifestBody))) !== captureSha256) {
    fail("pricing_source_capture_invalid", "capture manifest digest changed", "capture.manifest");
  }
  const bodyPath = path.join(path.dirname(path.resolve(manifestPath)), manifest.body_file);
  const bodyStats = await fs.stat(bodyPath);
  if (!bodyStats.isFile() || bodyStats.size !== manifest.body_bytes) {
    fail("pricing_source_capture_invalid", "source body size changed", "capture.body");
  }
  const body = await fs.readFile(bodyPath);
  if (sha256(body) !== bodySha256) {
    fail("pricing_source_capture_invalid", "source body digest changed", "capture.body");
  }
  const capture = { manifest: Object.freeze(manifest), body };
  Object.defineProperty(capture, SOURCE_CAPTURE_BRAND, { value: true });
  return Object.freeze(capture);
};

export const pricingProjectionSummary = (projection) => ({
  schema: projection.schema,
  catalog_version: projection.catalog.catalog_version,
  catalog_payload_sha256: projection.verification.catalog_payload_sha256,
  projection_sha256: projection.projection_sha256,
  key_id: projection.verification.key_id,
  trusted_public_key_sha256: projection.verification.trusted_public_key_sha256,
  effective_from: projection.catalog.effective_from,
  effective_to: projection.catalog.effective_to,
  source_count: projection.catalog.sources.length,
  entry_count: projection.catalog.entries.length,
});

export const pricingCatalogSchemas = Object.freeze({
  catalog: PRICING_CATALOG_SCHEMA,
  trustStore: PRICING_TRUST_STORE_SCHEMA,
  projection: VERIFIED_PRICING_PROJECTION_SCHEMA,
  sourceCapture: PRICING_SOURCE_CAPTURE_SCHEMA,
});
