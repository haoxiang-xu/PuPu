import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  estimateCost,
  signCatalog,
  verifyCatalog,
} from "./catalog-lib.mjs";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });

const rates = (overrides = {}) => ({
  input_uncached: null,
  input_cache_read: null,
  input_cache_write: null,
  input_cache_write_5m: null,
  input_cache_write_1h: null,
  output: null,
  ...overrides,
});

const payload = {
  schema: "pupu.pricing_catalog.v1",
  catalog_version: "synthetic-test-2026-08-13.1",
  currency: "USD",
  effective_from: "2026-08-13T00:00:00Z",
  effective_to: null,
  retrieved_at: "2026-08-13T12:00:00Z",
  sources: [
    {
      provider: "openai",
      url: "https://developers.openai.com/api/docs/pricing",
      retrieved_at: "2026-08-13T12:00:00Z",
      source_digest: "1".repeat(64),
      review_note: "synthetic contract fixture; allowlisted provenance URL only",
    },
    {
      provider: "anthropic",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
      retrieved_at: "2026-08-13T12:00:00Z",
      source_digest: "2".repeat(64),
      review_note: "synthetic contract fixture; allowlisted provenance URL only",
    },
  ],
  entries: [
    {
      provider: "openai",
      billing_surface: "first_party_api",
      model: "synthetic-openai-model-v1",
      service_tier: "standard",
      batch: false,
      inference_geo: "global",
      currency: "USD",
      rates_nano_usd_per_million: rates({
        input_uncached: 1000000000,
        input_cache_read: 100000000,
        input_cache_write: 1250000000,
        output: 6000000000,
      }),
      long_context_rule: {
        threshold_input_tokens: 272000,
        input_multiplier_ppm: 2000000,
        output_multiplier_ppm: 1500000,
      },
      source_index: 0,
    },
    {
      provider: "anthropic",
      billing_surface: "first_party_api",
      model: "synthetic-anthropic-model-v1",
      service_tier: "standard",
      batch: false,
      inference_geo: "global",
      currency: "USD",
      rates_nano_usd_per_million: rates({
        input_uncached: 3000000000,
        input_cache_read: 300000000,
        input_cache_write_5m: 3750000000,
        input_cache_write_1h: 6000000000,
        output: 15000000000,
      }),
      long_context_rule: null,
      source_index: 1,
    },
  ],
};

const verified = () =>
  verifyCatalog(signCatalog(payload, { privateKeyPem, keyId: "test-key" }), {
    trustedPublicKeys: { "test-key": publicKeyPem },
  });

const usage = (overrides = {}) => ({
  input_uncached_tokens: 0,
  input_cache_read_tokens: 0,
  input_cache_write_tokens: 0,
  input_cache_write_5m_tokens: null,
  input_cache_write_1h_tokens: null,
  output_tokens: 0,
  ...overrides,
});

test("signs and verifies a strict Ed25519 catalog envelope", () => {
  const envelope = signCatalog(payload, { privateKeyPem, keyId: "test-key" });
  const result = verifyCatalog(envelope, {
    trustedPublicKeys: { "test-key": publicKeyPem },
  });
  assert.equal(result.payload.catalog_version, payload.catalog_version);
  envelope.payload.entries[0].model = "attacker-model";
  assert.throws(
    () => verifyCatalog(envelope, { trustedPublicKeys: { "test-key": publicKeyPem } }),
    /payload digest changed/,
  );

  const invalidCalendar = structuredClone(payload);
  invalidCalendar.retrieved_at = "2026-99-13T12:00:00Z";
  assert.throws(
    () => signCatalog(invalidCalendar, { privateKeyPem, keyId: "test-key" }),
    /RFC3339 UTC timestamp/,
  );

  const nonSlugIssuer = structuredClone(payload);
  nonSlugIssuer.sources[0].provider = "OpenAI";
  assert.throws(
    () => signCatalog(nonSlugIssuer, { privateKeyPem, keyId: "test-key" }),
    /must be a lowercase slug/,
  );
});

test("prices OpenAI cache write/read as disjoint input without double counting", () => {
  const result = estimateCost({
    verifiedCatalog: verified(),
    provider: "openai",
    billingSurface: "first_party_api",
    model: "synthetic-openai-model-v1",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
    occurredAt: "2026-08-13T13:00:00Z",
    usage: usage({
      input_uncached_tokens: 80000,
      input_cache_read_tokens: 80000,
      input_cache_write_tokens: 80000,
      output_tokens: 80000,
    }),
  });
  assert.equal(result.status, "estimated");
  assert.equal(result.amount_nano_usd, "668000000");
});

test("prices Anthropic 5m and 1h cache writes separately", () => {
  const result = estimateCost({
    verifiedCatalog: verified(),
    provider: "anthropic",
    billingSurface: "first_party_api",
    model: "synthetic-anthropic-model-v1",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
    occurredAt: "2026-08-13T13:00:00Z",
    usage: usage({
      input_uncached_tokens: 1000,
      input_cache_read_tokens: 1000,
      input_cache_write_tokens: 2000,
      input_cache_write_5m_tokens: 1000,
      input_cache_write_1h_tokens: 1000,
      output_tokens: 1000,
    }),
  });
  assert.equal(result.status, "estimated");
  assert.equal(result.amount_nano_usd, "28050000");
});

test("fails cost closed when cache TTL or model identity is unknown", () => {
  const forgedUnsigned = estimateCost({
    verifiedCatalog: {
      payload,
      payload_sha256: verified().payload_sha256,
      key_id: "forged-key",
    },
    provider: "openai",
    billingSurface: "first_party_api",
    model: "synthetic-openai-model-v1",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
    occurredAt: "2026-08-13T13:00:00Z",
    usage: usage(),
  });
  assert.equal(forgedUnsigned.reason, "pricing_catalog_unverified");

  const ttlUnknown = estimateCost({
    verifiedCatalog: verified(),
    provider: "anthropic",
    billingSurface: "first_party_api",
    model: "synthetic-anthropic-model-v1",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
    occurredAt: "2026-08-13T13:00:00Z",
    usage: usage({ input_cache_write_tokens: 10 }),
  });
  assert.equal(ttlUnknown.status, "unavailable");
  assert.equal(ttlUnknown.reason, "rate_input_cache_write_unknown");

  const modelUnknown = estimateCost({
    verifiedCatalog: verified(),
    provider: "openai",
    billingSurface: "first_party_api",
    model: "gpt-moving-alias",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
    occurredAt: "2026-08-13T13:00:00Z",
    usage: usage(),
  });
  assert.equal(modelUnknown.reason, "pricing_identity_unknown");
});

test("requires every exact pricing dimension instead of applying defaults", () => {
  const exactIdentity = {
    billingSurface: "first_party_api",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
  };
  const reasons = {
    billingSurface: "pricing_billing_surface_unknown",
    serviceTier: "pricing_service_tier_unknown",
    batch: "pricing_batch_mode_unknown",
    inferenceGeo: "pricing_inference_geo_unknown",
  };
  for (const [missing, reason] of Object.entries(reasons)) {
    const identity = { ...exactIdentity };
    delete identity[missing];
    const result = estimateCost({
      verifiedCatalog: verified(),
      provider: "openai",
      model: "synthetic-openai-model-v1",
      occurredAt: "2026-08-13T13:00:00Z",
      usage: usage(),
      ...identity,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, reason);
  }
});

test("pins a long-context price multiplier into the estimate", () => {
  const result = estimateCost({
    verifiedCatalog: verified(),
    provider: "openai",
    billingSurface: "first_party_api",
    model: "synthetic-openai-model-v1",
    serviceTier: "standard",
    batch: false,
    inferenceGeo: "global",
    occurredAt: "2026-08-13T13:00:00Z",
    usage: usage({ input_uncached_tokens: 300000, output_tokens: 100000 }),
  });
  assert.equal(result.input_multiplier_ppm, 2000000);
  assert.equal(result.output_multiplier_ppm, 1500000);
  assert.equal(result.amount_nano_usd, "1500000000");
});

test("orders fractional RFC3339 effective boundaries chronologically", () => {
  const fractionalPayload = structuredClone(payload);
  fractionalPayload.effective_from = "2026-08-13T00:00:00Z";
  fractionalPayload.effective_to = "2026-08-13T00:00:00.000000001Z";
  const fractionalCatalog = verifyCatalog(
    signCatalog(fractionalPayload, { privateKeyPem, keyId: "test-key" }),
    { trustedPublicKeys: { "test-key": publicKeyPem } },
  );
  assert.equal(
    estimateCost({
      verifiedCatalog: fractionalCatalog,
      provider: "openai",
      billingSurface: "first_party_api",
      model: "synthetic-openai-model-v1",
      serviceTier: "standard",
      batch: false,
      inferenceGeo: "global",
      occurredAt: "2026-08-13T00:00:00Z",
      usage: usage(),
    }).status,
    "estimated",
  );
  assert.equal(
    estimateCost({
      verifiedCatalog: fractionalCatalog,
      provider: "openai",
      billingSurface: "first_party_api",
      model: "synthetic-openai-model-v1",
      serviceTier: "standard",
      batch: false,
      inferenceGeo: "global",
      occurredAt: "2026-08-13T00:00:00.000000001Z",
      usage: usage(),
    }).reason,
    "pricing_catalog_not_effective",
  );
});
