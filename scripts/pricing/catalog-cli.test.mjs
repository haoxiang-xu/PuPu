import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runPricingCatalogCli } from "./catalog-cli.mjs";
import {
  fetchOfficialSourceCapture,
  writeOfficialSourceCapture,
} from "./catalog-runtime.mjs";

test("offline CLI signs, verifies, projects, and inspects with an explicit trust root", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pupu-pricing-cli-"));
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const privateKeyPath = path.join(directory, "release-private.pem");
    const payloadPath = path.join(directory, "payload.json");
    const envelopePath = path.join(directory, "envelope.json");
    const trustPath = path.join(directory, "trust.json");
    const projectionPath = path.join(directory, "projection.json");
    const captureDirectory = path.join(directory, "capture");
    await fs.writeFile(
      privateKeyPath,
      privateKey.export({ format: "pem", type: "pkcs8" }),
      { mode: 0o600 },
    );
    const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
    const publicKeySha256 = crypto
      .createHash("sha256")
      .update(publicKey.export({ format: "der", type: "spki" }))
      .digest("hex");
    const captureBody = Buffer.from("synthetic CLI pricing capture bytes");
    const capture = await fetchOfficialSourceCapture({
      sourceUrl: "https://developers.openai.com/api/docs/pricing",
      retrievedAt: "2026-08-13T12:00:00Z",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://developers.openai.com/api/docs/pricing",
        headers: new Headers({ "content-type": "text/plain" }),
        arrayBuffer: async () => Uint8Array.from(captureBody).buffer,
      }),
    });
    const { manifestPath } = await writeOfficialSourceCapture({
      outputDirectory: captureDirectory,
      capture,
    });
    const payload = {
      schema: "pupu.pricing_catalog.v1",
      catalog_version: "cli-fixture-v1",
      currency: "USD",
      effective_from: "2026-08-13T00:00:00Z",
      effective_to: null,
      retrieved_at: "2026-08-13T12:00:00Z",
      sources: [
        {
          provider: "openai",
          url: "https://developers.openai.com/api/docs/pricing",
          retrieved_at: "2026-08-13T12:00:00Z",
          source_digest: capture.manifest.body_sha256,
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
          rates_nano_usd_per_million: {
            input_uncached: 1_000_000_000,
            input_cache_read: 100_000_000,
            input_cache_write: 1_250_000_000,
            input_cache_write_5m: null,
            input_cache_write_1h: null,
            output: 6_000_000_000,
          },
          long_context_rule: null,
          source_index: 0,
        },
      ],
    };
    await fs.writeFile(payloadPath, JSON.stringify(payload));
    await fs.writeFile(
      trustPath,
      JSON.stringify({
        schema: "pupu.pricing_trust_store.v1",
        keys: [
          {
            key_id: "cli-test-key",
            algorithm: "ed25519",
            public_key_pem: publicKeyPem,
            public_key_sha256: publicKeySha256,
            not_before: "2000-01-01T00:00:00Z",
            not_after: null,
          },
        ],
      }),
    );

    const signed = await runPricingCatalogCli([
      "sign",
      "--payload",
      payloadPath,
      "--capture-manifest",
      manifestPath,
      "--private-key",
      privateKeyPath,
      "--key-id",
      "cli-test-key",
      "--out",
      envelopePath,
    ]);
    assert.equal(JSON.parse(signed.stdout).signed, true);

    const mismatchedPayloadPath = path.join(directory, "mismatched-payload.json");
    const mismatchedPayload = structuredClone(payload);
    mismatchedPayload.sources[0].source_digest = "0".repeat(64);
    await fs.writeFile(mismatchedPayloadPath, JSON.stringify(mismatchedPayload));
    await assert.rejects(
      runPricingCatalogCli([
        "sign",
        "--payload",
        mismatchedPayloadPath,
        "--capture-manifest",
        manifestPath,
        "--private-key",
        privateKeyPath,
        "--key-id",
        "cli-test-key",
        "--out",
        path.join(directory, "mismatched-envelope.json"),
      ]),
      /not bound to a verified capture manifest and body digest/,
    );

    await assert.rejects(
      runPricingCatalogCli([
        "sign",
        "--payload",
        payloadPath,
        "--private-key",
        privateKeyPath,
        "--key-id",
        "cli-test-key",
        "--out",
        path.join(directory, "unsigned-without-capture.json"),
      ]),
      /--capture-manifest is required/,
    );

    const verified = await runPricingCatalogCli([
      "verify",
      "--catalog",
      envelopePath,
      "--trust-store",
      trustPath,
    ]);
    assert.equal(JSON.parse(verified.stdout).verified, true);
    const inspectedCatalog = await runPricingCatalogCli([
      "inspect",
      "--catalog",
      envelopePath,
      "--trust-store",
      trustPath,
    ]);
    assert.equal(
      JSON.parse(inspectedCatalog.stdout).entries[0].rates_nano_usd_per_million
        .input_cache_write,
      1_250_000_000,
    );

    const projected = await runPricingCatalogCli([
      "project",
      "--catalog",
      envelopePath,
      "--trust-store",
      trustPath,
      "--out",
      projectionPath,
    ]);
    const projectionSummary = JSON.parse(projected.stdout);
    assert.equal(projectionSummary.catalog_version, "cli-fixture-v1");

    const inspected = await runPricingCatalogCli([
      "inspect-projection",
      "--projection",
      projectionPath,
      "--sha256",
      projectionSummary.projection_sha256,
    ]);
    assert.deepEqual(JSON.parse(inspected.stdout), projectionSummary);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
