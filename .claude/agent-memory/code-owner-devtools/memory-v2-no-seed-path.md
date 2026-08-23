---
name: memory-v2-no-seed-path
description: Memory V2 state (candidate/entry/job/promotion) cannot be seeded from any QA harness, and that is a deliberate security design - not a gap to patch casually
metadata:
  type: project
---

Memory V2 / Context V2 state cannot be materialized from the test-api, the test bridge, e2e, or any other QA harness. Verified 2026-08-07 during court case `0000-0001-2026-0807`.

The three doors and why each is closed:

- **test-api → renderer**: `POST /v1/debug/eval` can run arbitrary JS in the renderer, but the only Memory V2 door there is `window.contextV2API`, whose method list is a **read + decide** subset. No `createEntry`, no `createCandidate`, no job control.
- **direct HTTP → Flask sidecar**: the sidecar *does* expose a full write surface (`POST /context/v2/memory/{spaces,candidates,jobs,promotions}` and entry create/patch/delete). Unreachable — the sidecar port and the `x-unchain-auth` token are generated in the Electron main closure and never leave it.
- **direct SQLite write**: the store keeps `candidate_revisions`, `memory_operation_receipts`, `promotion_operation_receipts`. Hand-written rows would be revision/receipt-inconsistent.

**Why:** this is not an oversight. `electron/main/services/unchain/service.js` carries an explicit design comment enumerating what is intentionally ABSENT from the renderer surface — job lease protocol, space/entry direct mutation, candidate create — because writes must go through the candidate → decision funnel and a renderer must never take a worker lease. Any seeding affordance is a hole in that funnel.

**How to apply:** when asked to build a Memory V2 test panel, seed fixture, or QA scenario that needs existing entries/candidates/promotions, do **not** quietly add a create path. It crosses `code-owner-electron` + `code-owner-runtime` + `expert-security` and needs a ruling. The legitimate deterministic route is the opposite direction: script a `memory_propose` tool call through `scripts/test-api/fixtures/fake_openai_responses_server.js` (already wired into `e2e/pupu-deterministic-soak.spec.js` and `e2e/pupu-single-agent-long-run.spec.js`) and let the product produce the state itself.

Related: [[memory-v2-dev-packaged-divergence]]
