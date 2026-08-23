# Offline pricing catalog

`catalog-lib.mjs` defines the fail-closed `pupu.pricing_catalog.v1` contract.
`catalog-runtime.mjs` verifies signed catalog files against
`pupu.pricing_trust_store.v1`, then emits a deterministic, hash-pinned
`pupu.verified_pricing_catalog_projection.v1` for the Python runtime. The
request path never scrapes a pricing page and never receives a signing key.

A release process must:

1. capture and review the official provider pages;
2. write exact model/tier/geo/batch entries with their source digest;
3. sign the canonical payload with an offline Ed25519 release key;
4. pin the matching public key and its SPKI SHA-256 in a reviewed trust store;
5. verify the envelope and export a deterministic runtime projection;
6. configure the runtime with both the projection path and its exact SHA-256;
7. bind the catalog payload and official source digests to each estimate.

The repository intentionally contains no production private key and no
automatically trusted catalog. With no configured projection, or with a missing
or mismatched pin, runtime cost is `unavailable`.

The offline operator entry point is:

```sh
npm run pricing:catalog -- help
```

`fetch-proposal` is the only subcommand with network access. It accepts only the
reviewed official OpenAI and Anthropic pricing-document URL families and writes
the response bytes plus a digest-bound capture manifest for human review.
`sign` requires an explicit local Ed25519 private-key path with owner-only file
permissions and one repeated `--capture-manifest` argument for every source.
It reloads each captured body and requires the provider, final URL, retrieval
time, and body SHA-256 to match the payload exactly. `verify`, `project`, and
`inspect` are local-only operations.

The Python-side projection loader uses no network and does not claim to verify
Ed25519 itself. Signature verification stays in the Node release host; the
Python boundary accepts only an exact projection digest pinned in trusted
configuration. Changing any catalog entry, source snapshot, signing-key
identity, or effective interval produces a different projection pin.

The Unchain adapter reads no catalog by default. A deployment may preload the
resolver from these two settings, which are an inseparable pair:

- `UNCHAIN_PRICING_CATALOG_PROJECTION_PATH`
- `UNCHAIN_PRICING_CATALOG_PROJECTION_SHA256`

The caller must also supply the exact call time, service tier, billing surface,
batch mode, and inference geography recorded for the provider request. Missing
identity data remains `unavailable`; it is never filled with a convenient
pricing default.

Public list prices produce `list_price_estimate`, not provider-observed actual
cost. Provider Admin Cost APIs are aggregate controls; reconciliation may add a
bucket adjustment or an explicitly labelled allocation, but may not rewrite a
historical per-call estimate as actual.

If the catalog, signature, effective interval, model, service tier, geography,
cache-write TTL, or usage component is unknown, cost is `unavailable`. Usage
accounting remains available and must never be replaced with zero.

The test rates and model names are explicitly synthetic. Their source fields
exercise only these allowlisted official provenance URL families:

- <https://developers.openai.com/api/docs/pricing>
- <https://developers.openai.com/api/docs/guides/latest-model>
- <https://platform.claude.com/docs/en/about-claude/pricing>
- <https://platform.claude.com/docs/en/manage-claude/usage-cost-api>
