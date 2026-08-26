import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { estimateCost, signCatalog } from "./catalog-lib.mjs";
import {
  buildVerifiedCatalogProjection,
  classifyOfficialPricingSource,
  fetchOfficialSourceCapture,
  loadPinnedProjectionFile,
  loadVerifiedCatalogFile,
} from "./catalog-runtime.mjs";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
const publicKeySha256 = crypto
  .createHash("sha256")
  .update(publicKey.export({ format: "der", type: "spki" }))
  .digest("hex");

const rates = (inputRate = 1_000_000_000) => ({
  input_uncached: inputRate,
  input_cache_read: 100_000_000,
  input_cache_write: 1_250_000_000,
  input_cache_write_5m: null,
  input_cache_write_1h: null,
  output: 6_000_000_000,
});

const payload = ({ version = "synthetic-history-v1", inputRate } = {}) => ({
  schema: "pupu.pricing_catalog.v1",
  catalog_version: version,
  currency: "USD",
  effective_from: "2026-08-13T00:00:00Z",
  effective_to: null,
  retrieved_at: "2026-08-13T12:00:00Z",
  sources: [
    {
      provider: "openai",
      url: "https://developers.openai.com/api/docs/pricing",
      retrieved_at: "2026-08-13T12:00:00Z",
      source_digest: "a".repeat(64),
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
      rates_nano_usd_per_million: rates(inputRate),
      long_context_rule: {
        threshold_input_tokens: 272_000,
        input_multiplier_ppm: 2_000_000,
        output_multiplier_ppm: 1_500_000,
      },
      source_index: 0,
    },
  ],
});

const trustStore = {
  schema: "pupu.pricing_trust_store.v1",
  keys: [
    {
      key_id: "test-release-key",
      algorithm: "ed25519",
      public_key_pem: publicKeyPem,
      public_key_sha256: publicKeySha256,
      not_before: "2000-01-01T00:00:00Z",
      not_after: null,
    },
  ],
};

const withFiles = async (callback) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-pricing-test-"));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const writeEnvelopeAndTrust = async (directory, catalogPayload, suffix) => {
  const envelopePath = path.join(directory, `${suffix}.envelope.json`);
  const trustPath = path.join(directory, "trust.json");
  const envelope = signCatalog(catalogPayload, {
    privateKeyPem,
    keyId: "test-release-key",
  });
  await fs.writeFile(envelopePath, JSON.stringify(envelope));
  await fs.writeFile(trustPath, JSON.stringify(trustStore));
  return { envelope, envelopePath, trustPath };
};

const usage = {
  input_uncached_tokens: 1_000_000,
  input_cache_read_tokens: 0,
  input_cache_write_tokens: 0,
  input_cache_write_5m_tokens: null,
  input_cache_write_1h_tokens: null,
  output_tokens: 0,
};

test("trusted loader rejects catalog and trust-store tampering", async () => {
  await withFiles(async (directory) => {
    const { envelope, envelopePath, trustPath } = await writeEnvelopeAndTrust(
      directory,
      payload(),
      "trusted",
    );
    const verified = await loadVerifiedCatalogFile({
      catalogPath: envelopePath,
      trustStorePath: trustPath,
    });
    assert.equal(verified.payload.catalog_version, "synthetic-history-v1");

    envelope.payload.entries[0].rates_nano_usd_per_million.input_uncached += 1;
    await fs.writeFile(envelopePath, JSON.stringify(envelope));
    await assert.rejects(
      loadVerifiedCatalogFile({ catalogPath: envelopePath, trustStorePath: trustPath }),
      /payload digest changed/,
    );

    const badTrust = structuredClone(trustStore);
    badTrust.keys[0].public_key_sha256 = "0".repeat(64);
    await fs.writeFile(trustPath, JSON.stringify(badTrust));
    await assert.rejects(
      loadVerifiedCatalogFile({ catalogPath: envelopePath, trustStorePath: trustPath }),
      /public key digest does not match/,
    );

    await fs.writeFile(
      trustPath,
      '{"schema":"attacker","schema":"pupu.pricing_trust_store.v1","keys":[]}',
    );
    await assert.rejects(
      loadVerifiedCatalogFile({ catalogPath: envelopePath, trustStorePath: trustPath }),
      /duplicate object key/,
    );
  });
});

test("historical projection remains hash-pinned after a catalog update", async () => {
  await withFiles(async (directory) => {
    const v1Files = await writeEnvelopeAndTrust(directory, payload(), "v1");
    const v1Verified = await loadVerifiedCatalogFile({
      catalogPath: v1Files.envelopePath,
      trustStorePath: v1Files.trustPath,
    });
    const v1Projection = buildVerifiedCatalogProjection(v1Verified);
    const v1Path = path.join(directory, "v1.projection.json");
    await fs.writeFile(v1Path, JSON.stringify(v1Projection));

    const v2Files = await writeEnvelopeAndTrust(
      directory,
      payload({ version: "synthetic-history-v2", inputRate: 2_000_000_000 }),
      "v2",
    );
    const v2Verified = await loadVerifiedCatalogFile({
      catalogPath: v2Files.envelopePath,
      trustStorePath: v2Files.trustPath,
    });
    const v2Projection = buildVerifiedCatalogProjection(v2Verified);
    assert.notEqual(v1Projection.projection_sha256, v2Projection.projection_sha256);

    const reloadedV1 = await loadPinnedProjectionFile({
      projectionPath: v1Path,
      expectedProjectionSha256: v1Projection.projection_sha256,
    });
    assert.equal(reloadedV1.catalog.catalog_version, "synthetic-history-v1");
    const oldCost = estimateCost({
      verifiedCatalog: v1Verified.signature_verified_catalog,
      provider: "openai",
      billingSurface: "first_party_api",
      model: "synthetic-openai-model-v1",
      serviceTier: "standard",
      batch: false,
      inferenceGeo: "global",
      occurredAt: "2026-08-13T13:00:00Z",
      usage,
    });
    const newCost = estimateCost({
      verifiedCatalog: v2Verified.signature_verified_catalog,
      provider: "openai",
      billingSurface: "first_party_api",
      model: "synthetic-openai-model-v1",
      serviceTier: "standard",
      batch: false,
      inferenceGeo: "global",
      occurredAt: "2026-08-13T13:00:00Z",
      usage,
    });
    assert.equal(oldCost.amount_nano_usd, "2000000000");
    assert.equal(newCost.amount_nano_usd, "4000000000");
  });
});

test("projection content and caller pin are both mandatory", async () => {
  await withFiles(async (directory) => {
    const files = await writeEnvelopeAndTrust(directory, payload(), "pin");
    const verified = await loadVerifiedCatalogFile({
      catalogPath: files.envelopePath,
      trustStorePath: files.trustPath,
    });
    const projection = buildVerifiedCatalogProjection(verified);
    assert.throws(
      () =>
        buildVerifiedCatalogProjection({
          payload: verified.payload,
          payload_sha256: verified.payload_sha256,
          key_id: verified.key_id,
          trusted_public_key_sha256: verified.trusted_public_key_sha256,
        }),
      /verified catalog evidence is missing/,
    );
    const projectionPath = path.join(directory, "projection.json");
    await fs.writeFile(projectionPath, JSON.stringify(projection));
    await assert.rejects(
      loadPinnedProjectionFile({
        projectionPath,
        expectedProjectionSha256: "0".repeat(64),
      }),
      /projection digest is not pinned/,
    );
    projection.catalog.entries[0].model = "attacker-model";
    await fs.writeFile(projectionPath, JSON.stringify(projection));
    await assert.rejects(
      loadPinnedProjectionFile({
        projectionPath,
        expectedProjectionSha256: projection.projection_sha256,
      }),
      /catalog payload digest changed/,
    );
  });
});

test("trusted loader uses verification time rather than payload retrieval time", async () => {
  await withFiles(async (directory) => {
    const oldPayload = payload();
    oldPayload.retrieved_at = "2019-06-01T00:00:00Z";
    oldPayload.sources[0].retrieved_at = "2019-06-01T00:00:00Z";
    const files = await writeEnvelopeAndTrust(directory, oldPayload, "key-time");
    const expiredTrustStore = structuredClone(trustStore);
    expiredTrustStore.keys[0].not_before = "2019-01-01T00:00:00Z";
    expiredTrustStore.keys[0].not_after = "2020-01-01T00:00:00Z";
    await fs.writeFile(files.trustPath, JSON.stringify(expiredTrustStore));
    await assert.rejects(
      loadVerifiedCatalogFile({
        catalogPath: files.envelopePath,
        trustStorePath: files.trustPath,
      }),
      /trusted verification time is outside the trusted key interval/,
    );
  });
});

test("source capture accepts only reviewed official URLs and binds response bytes", async () => {
  assert.equal(
    classifyOfficialPricingSource("https://platform.claude.com/docs/en/about-claude/pricing")
      .provider,
    "anthropic",
  );
  assert.throws(
    () => classifyOfficialPricingSource("https://example.com/pricing"),
    /not in the reviewed official pricing-source allowlist/,
  );

  const body = Buffer.from("synthetic pricing capture bytes");
  const capture = await fetchOfficialSourceCapture({
    sourceUrl: "https://developers.openai.com/api/docs/pricing",
    retrievedAt: "2026-08-13T12:00:00Z",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://developers.openai.com/api/docs/pricing",
      headers: new Headers({ "content-type": "text/html", etag: "fixture-v1" }),
      arrayBuffer: async () => Uint8Array.from(body).buffer,
    }),
  });
  assert.equal(
    capture.manifest.body_sha256,
    crypto.createHash("sha256").update(body).digest("hex"),
  );
  assert.match(capture.manifest.body_file, /^source-[a-f0-9]{64}\.bin$/);

  const requestedUrls = [];
  await assert.rejects(
    fetchOfficialSourceCapture({
      sourceUrl: "https://developers.openai.com/api/docs/pricing",
      retrievedAt: "2026-08-13T12:00:00Z",
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        return {
          ok: false,
          status: 302,
          url,
          headers: new Headers({ location: "https://example.com/fake-pricing" }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
    }),
    /not in the reviewed official pricing-source allowlist/,
  );
  assert.deepEqual(requestedUrls, [
    "https://developers.openai.com/api/docs/pricing",
  ]);
});
