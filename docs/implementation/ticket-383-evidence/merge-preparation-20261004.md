# Ticket 383: final local merge preparation

Date: 2026-10-04 (America/Vancouver). This record supersedes the earlier local snapshot for the checks below. Local merge preparation passed; live rollout remains **INCOMPLETE** for the explicitly unqualified states below.

## Candidate and runtime

Tested source commit: `0a36cf3bcbae6cd26f1cda35ab93fac70d02e9c3`. All 1,058 frontend source files match the immutable full-test and production-build snapshots. A later documentation-only delivery commit can retain this qualification only if those source bytes remain identical.

The user manually accepted the running candidate at `d59183c4e0c16b4545a7db64e6a8cc79dadcab2a`. The final source adds a narrow ownership-index safeguard and corrects an obsolete raw-event test; those final changes received automated and independent verification. The user did not repeat the manual session after that safeguard.

One unchanged Unchain wheel was reused throughout:

- Source revision: `a7fa15d685b1130bf5678c1e493a51d2551185cf`.
- Wheel SHA-256: `27139af8f6bf94b8f6bd1ce219a5da6966e17dc90b20225ace032e0c1a57d8b6`.
- Imported runtime protocol digest: `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.
- Final readback: all 346 installed package files match that wheel. The five host files still match the previously qualified 120-test plus 18-subtest checkpoint.

Git/source identities establish artifact provenance; runtime admission continues to use the actual imported protocol manifest. No request, receipt, credential, settings, provider schema, or continuation guard was changed by the final safeguard.

## Repairs and regression evidence

Resolved tool feedback groups now keep their members in collapsed details; pending member controls remain immediately actionable. A group header and its members are not rendered simultaneously through two presentation paths.

Live and recovered confirmation builders retain source-owned call references, metadata and raw scope. They omit absent toolkit identity, preserve explicitly supplied invalid values for rejection, and keep routing context separate. The saved 60-frame incident reproduced a trailing duplicate overlay on 52 prefixes before the builder repair; all 60 prefixes passed afterward with each approval bound to its original owner and anchor.

Coalescing repeated lifecycle observations changes display-array positions. The final grouping safeguard permits a numeric source-ownership fallback only when the indexed original frame is exactly the frame being resolved. Call, output and intervening-barrier lookups use that same safeguard. The exact alias-coalescing counterexample failed before the repair and passes afterward, alongside its positive control; the unowned event remains independently visible and cannot enter another tool's group.

The ChatInterface regression retains both original source events, their exact payloads and order, then verifies one legacy logical owner, both alias indexes, the original confirmation binding, and idle approval controls. It does not restore deletion of audit evidence.

## Final validation

| Check | Result and scope |
| --- | --- |
| Full frontend suite | 449/449 suites; 5,560 passed, 0 failed, 5 existing skipped tests. All 1,058 source hashes stable. |
| Production frontend build | CRA optimized build compiled successfully; fresh index and 72 JavaScript assets; all source hashes stable. |
| Focused final regressions | 2/2 named regression tests passed. The new index regression recorded RED before GREEN; the obsolete storage assertion was corrected against independently verified raw-event retention. |
| Independent final source review | PASS for the frozen three-file safeguard/test diff; exact two-case ownership reproduction passed and original RED remained unchanged. |
| Saved real-provider traces | Independent 11/11 checks: OpenAI 170-frame ownership/collapse cases, Gemini 60-frame approval-order case, and the user's latest Anthropic 231-frame trace. Actual production projector, grouping and renderer were used. Every replay prefix retained owner cardinality and ordering; expanded output/arguments belonged to their own members and appeared once. |
| Latest manual trace | The user reported display acceptance. The saved completed trace has 37 logical result owners, 11 acknowledged confirmations, and no remaining actionable approval control. Rendering replay dispatched no callbacks. This establishes presentation behavior, not successful web retrieval. |
| Translation scan | 10 non-English locales and 870 English keys: no missing/orphan keys, placeholder mismatch, or missing static translation references. Dynamic key coverage remains heuristic. |
| Source/fixture integrity | Full tests/build used the same final source bytes. The shipped provider-wire fixture remained unchanged. No user database was rewritten by inspection or replay. |
| GitNexus and diff | Required pre-edit impact and pre-commit change analysis completed; the index was refreshed and zero-symbol detection was rerun. It found the three changed files but could not resolve their symbols/processes. This remains UNKNOWN graph coverage, corroborated by current literal call sites, exact RED/GREEN evidence, independent source review and the full suite. `git diff --check` passed. |

The separate documentation-only change analysis reported **CRITICAL** for a Markdown section with an empty symbol ID and broad process associations. That warning is retained, rather than treated as a clean graph result. The staged paths are three Markdown records; current source searches show no executable/configuration reference to them, and the previously tested source hashes remain identical. Final documentation review qualifies this limited change using those direct checks.

Representative verification commands:

```sh
CI=true npm test -- --watchAll=false --runInBand
CI=true BUILD_PATH=/path/to/isolated/acceptance-build \
  node node_modules/react-scripts/scripts/build.js
```

The direct CRA build verifies production frontend compilation without invoking version preparation, packaging, publishing, or a runtime rebuild. Sealed private evidence contains the trace capsules, before/after hashes, RED/GREEN logs and independent reports; it contains no extracted API keys and is not included in the public repository.

## Declared boundary and sequence qualification

This extends [the logical-call lifecycle plan](../ticket-383-logical-call-lifecycle.md), especially BC-383-L3/L4, SEQ-383-L1/L2 and AC-L3/L5/L7/L8/L9/L10. Existing exact-wheel producer/core and isolated SQLite evidence retains its original qualification in [the systematic local snapshot](systematic-local-acceptance.md).

Actual-HTTP cold pending-resume remains **NOT_RUN / UNQUALIFIED**: earlier guarded attempts did not establish successful resume, and immutable-registration/final-model checks were preserved. Saved-trace rendering and in-process core resume do not replace that state. Actual app durable Stop followed by a sidecar cold restart and pending resume was not performed in this final manual session. Full graph/subagent provider execution remains outside the completed manual checks. These declared states keep active rollout **INCOMPLETE**; this record does not authorize publishing or release.

The reused wheel's empty-error result classifier remains a separate known runtime issue: an approved fetch can still be classified as terminal error. This change preserves the recorded execution status and does not claim fetch success or fix that classifier. Gemini HTTP 503 retries remain genuine provider failures.

The unresolved CodeQL import-cycle observation concerns function-local delayed imports between the durable host and active bridge. The changed read-only display resolver does not recursively call pending-interaction lookup, and the descriptor module imports only the standard library. No runtime blocker was validated from that static cycle; the observation was not silently resolved and unrelated imports were not refactored.
