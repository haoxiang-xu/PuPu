# Integrate current dev / #390 into #383

Status: PLAN CHECKPOINT, implementation and validation pending. 2026-10-03 UTC.

## Authorized scope

Merge current dev into this bugfix branch and push fast-forward checkpoints. Preserve shared history. Do not merge this PR into dev/main, force push, deploy, restart an owner profile, modify real databases, or call live paid providers.

Initial remote head: 7e7abc21c9e7a5aa6850de01df4c981cb2de4126
Confirmed dev: f689b9fa9732fc4dc3ae527eea96e56c82dc1873
#390 is merged in PuPu PR395 and Unchain PR48. PuPu dev is f689b9fa9732fc4dc3ae527eea96e56c82dc1873; Unchain dev is 358b96d723daa0d2882158985c8245c7f8c7fb23.

## Integration plan

1. Read branch implementation/evidence and repository AGENTS and cross-boundary rules. Map three-way conflicts without discarding either intent.
2. Run complete graph impact before substantive edits. Resolve each semantic conflict using Sol, preserving the owner-accepted #390 behavior and #383 invariants.
3. Obtain independent GPT-6.1 Sol review of final candidate and tests. Repeat affected checks after corrections.
4. Publish small safe remote checkpoints and verify remote SHA/tree and restoration. Final merge must have this branch and confirmed dev as parents; no rebase.
5. Build an immutable Unchain artifact once, reuse its exact bytes for applicable PuPu contract and backend tests. Keep all five workflow default pins consistent per bugfix line.
6. Run applicable aggregate frontend, Electron, runtime/backend, boundary gates and build checks. Publish final tested state; monitor exact-head CI to terminal status or a verified blocker.

## Contract and state tracking

BC-390-I01: Unchain imported artifact to PuPu host/Electron/artifact consumers. VERSIONED; strict exported protocol manifest admission, provenance and digest fences remain unchanged. No Git SHA may become capability admission. AC-390-I01: validate the actual installed wheel, strict manifest positive/negative checks, Context V2 and RunBundle gates against the same immutable wheel.

BC-390-I02: historical diagnostics and leases across persisted state to runtime. CLOSED exact key sets, types, HTTP/null/status associations, canonical bytes, hashes and predecessor identities. AC-390-I02: historical diagnostic-v2/lease-v4 matrices plus unknown/hybrid/crossed state negatives; unknown outcomes cannot authorize resend.

SEQ-390-I01: first/second message, first/second interaction, retry/durable resume/cold restart and normal/graph/subagent paths as applicable to inherited #383/#384 plans. Preserve approval gating, no-resend and Stop behavior. AC-390-I03: combined artifact-pair regression suites and focused policy/interrupted chain tests. Inapplicable cells require a reason; unrun cells stay NOT_RUN.

## Pending evidence

Conflict map, graph risk, final artifact identity, tests, independent review, remote restore proof and exact-head CI are PENDING. Prior branch acceptance is historical, not acceptance of this merged pair. macOS-only unpublished work is not assumed accessible or included. Live/frozen/platform-specific acceptance is NOT_RUN until demonstrated.
