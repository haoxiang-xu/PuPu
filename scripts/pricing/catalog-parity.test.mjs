import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { estimateCost, signCatalog } from "./catalog-lib.mjs";
import {
  buildVerifiedCatalogProjection,
  loadVerifiedCatalogFile,
} from "./catalog-runtime.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const UNCHAIN_ROOT = path.resolve(
  process.env.UNCHAIN_SOURCE_PATH || path.join(ROOT, "../unchain"),
);

test("Node signed projection loads and estimates identically in Python", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-pricing-parity-"));
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
    const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
    const publicKeySha256 = crypto
      .createHash("sha256")
      .update(publicKey.export({ format: "der", type: "spki" }))
      .digest("hex");
    const payload = {
      schema: "pupu.pricing_catalog.v1",
      catalog_version: "synthetic-node-python-golden-v1",
      currency: "USD",
      effective_from: "2026-08-13T00:00:00Z",
      effective_to: null,
      retrieved_at: "2026-08-13T12:00:00Z",
      sources: [
        {
          provider: "openai",
          url: "https://developers.openai.com/api/docs/pricing",
          retrieved_at: "2026-08-13T12:00:00Z",
          source_digest: "d".repeat(64),
          review_note: "synthetic parity fixture; allowlisted provenance URL only",
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
          rates_nano_usd_per_million: {
            input_uncached: 1_000_000_000,
            input_cache_read: 100_000_000,
            input_cache_write: 1_250_000_000,
            input_cache_write_5m: null,
            input_cache_write_1h: null,
            output: 6_000_000_000,
          },
          long_context_rule: {
            threshold_input_tokens: 272_000,
            input_multiplier_ppm: 2_000_000,
            output_multiplier_ppm: 1_500_000,
          },
          source_index: 0,
        },
      ],
    };
    const envelope = signCatalog(payload, {
      privateKeyPem,
      keyId: "synthetic-parity-key",
    });
    const envelopePath = path.join(directory, "envelope.json");
    const trustPath = path.join(directory, "trust.json");
    const projectionPath = path.join(directory, "projection.json");
    await fs.writeFile(envelopePath, JSON.stringify(envelope));
    await fs.writeFile(
      trustPath,
      JSON.stringify({
        schema: "pupu.pricing_trust_store.v1",
        keys: [
          {
            key_id: "synthetic-parity-key",
            algorithm: "ed25519",
            public_key_pem: publicKeyPem,
            public_key_sha256: publicKeySha256,
            not_before: "2000-01-01T00:00:00Z",
            not_after: null,
          },
        ],
      }),
    );
    const verified = await loadVerifiedCatalogFile({
      catalogPath: envelopePath,
      trustStorePath: trustPath,
    });
    const projection = buildVerifiedCatalogProjection(verified);
    await fs.writeFile(projectionPath, JSON.stringify(projection));

    const usage = {
      input_uncached_tokens: 300_000,
      input_cache_read_tokens: 0,
      input_cache_write_tokens: 0,
      input_cache_write_5m_tokens: null,
      input_cache_write_1h_tokens: null,
      output_tokens: 100_000,
    };
    const nodeEstimate = estimateCost({
      verifiedCatalog: verified.signature_verified_catalog,
      provider: "openai",
      billingSurface: "first_party_api",
      model: "synthetic-openai-model-v1",
      serviceTier: "standard",
      batch: false,
      inferenceGeo: "global",
      occurredAt: "2026-08-13T13:00:00Z",
      usage,
    });

    const pythonSource = `
import json
import sys
from unchain.pricing_catalog import PricingCatalogResolver
from unchain.run_bundle import ProviderCallPricing, ProviderCallUsage

projection_path, projection_sha256 = sys.argv[1:3]
resolver = PricingCatalogResolver.from_projection_file(
    projection_path,
    expected_projection_sha256=projection_sha256,
)
snapshot = resolver.resolve_snapshot(
    provider="openai",
    billing_surface="first_party_api",
    model="synthetic-openai-model-v1",
    service_tier="standard",
    batch=False,
    inference_geo="global",
    occurred_at="2026-08-13T13:00:00Z",
)
usage = ProviderCallUsage(
    input_uncached_tokens=300_000,
    input_cache_read_tokens=0,
    input_cache_write_tokens=0,
    input_cache_write_5m_tokens=None,
    input_cache_write_1h_tokens=None,
    input_total_tokens=300_000,
    output_visible_tokens=100_000,
    output_reasoning_tokens=0,
    output_total_tokens=100_000,
    total_tokens=400_000,
    source="provider_observed_partial",
)
print(json.dumps(ProviderCallPricing.estimate(snapshot=snapshot, usage=usage).to_dict(), sort_keys=True))
`;
    const python = process.env.PYTHON || path.join(UNCHAIN_ROOT, ".venv/bin/python");
    const pythonEstimate = JSON.parse(
      execFileSync(
        python,
        ["-c", pythonSource, projectionPath, projection.projection_sha256],
        {
          cwd: UNCHAIN_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            PYTHONPATH: [
              path.join(UNCHAIN_ROOT, "src"),
              process.env.PYTHONPATH,
            ].filter(Boolean).join(path.delimiter),
          },
        },
      ),
    );
    assert.equal(nodeEstimate.status, pythonEstimate.status);
    assert.equal(nodeEstimate.amount_nano_usd, String(pythonEstimate.amount_nano_usd));
    assert.equal(nodeEstimate.input_multiplier_ppm, pythonEstimate.input_multiplier_ppm);
    assert.equal(nodeEstimate.output_multiplier_ppm, pythonEstimate.output_multiplier_ppm);
    assert.equal(nodeEstimate.catalog_payload_sha256, pythonEstimate.snapshot.catalog_sha256);
    assert.equal(nodeEstimate.source_digest, pythonEstimate.snapshot.source_sha256);
    assert.equal(nodeEstimate.source_url, pythonEstimate.snapshot.source_url);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
