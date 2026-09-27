# #349 desktop schema admission repair — 2026-09-26

Electron now accepts exactly integer Unchain schema versions 2 (supported migration source) and 3 (current), after canonical owner and runtime protocol validation. Unknown schemas/types remain rejected. Electron performs no migration itself. This fixes the concrete `context_v2_schema_incompatible` blocker seen with the fixed cache/background runtime.

## Verification

- Red-before-green: the schema-3 positive case failed before the fix (1 failed, 46 passed). [Red evidence](step2-desktop-red.log).
- Desktop rollout and startup suites passed through both `.js` and `.cjs` entrypoints: **201 test executions across 6 suites**, including wrapper discovery through `src/electron`. These counts include shared cases executed by multiple entrypoints, not 201 unique scenarios. Exact supported schemas, invalid types/versions, owner/protocol rejection and existing readiness paths pass. [Log](step2-desktop-tests.log).
- Actual Python status route produces payloads from a real SQLite schema-2 fixture, after runtime migration to schema 3, and after reopening. The real Electron validator admits all three. Historical event snapshot remains identical as a complete dictionary across migration; unsupported schemas are rejected by the same consumer. [Producer](step2-desktop-migration-producer.json), [consumer results](step2-desktop-migration-consumer.json). Replay scripts are retained under `.local/ticket-349-desktop-checkpoint/`.
- A real task-owned diagnostic Electron instance using frozen r7 server + the same installed Unchain wheel reports **Memory V2 ready** at initial startup and after a complete app/sidecar restart. [Initial](step2-desktop-desktop-ready.json), [restart](step2-desktop-desktop-restart-ready.json). All 347 installed wheel files matched their retained archive; actual app-reported runtime manifest matches the prior fixed wheel.
- Real **OpenAI GPT-4.1** conversations completed twice with only core tools selected and a synthetic request to reply OK without tools. App-reported full-round latency: **3,707 ms and 5,104 ms**; external HTTP wall time: **3,728.670 ms and 5,106.000 ms**. Both returned non-empty two-character replies and `finish_reason=stop`. [Timing evidence](step2-desktop-live-after.json). These are two smoke samples, not a statistically controlled speedup or first-token measurement. They do not exercise a real-model memory consolidation job.
- The probe chat was deleted. The isolated app was stopped and its temporary profile, encrypted credential backup, dependency symlink and feature snapshot were removed. The user's original app/profile was not updated or restarted.
- GitNexus upstream impact was run in the task clone before editing `validateMemoryV2Status`; it returned UNKNOWN. Source corroboration finds two service callers: startup readiness and Context V2 status before traffic. The existing protocol/owner/WAL/rollout checks remain in place. [Impact](step2-desktop-impact.txt). `git diff --check` passes; no commit.

## Artifact identity and limits

Composite diagnostic candidate (r7 server identity + changed Electron consumer file): `sha256:ddf32dd4d20b4a283663551744fa4a5fbcd9fd1dc01a54a0be111d2e7782c121`.

Server/resources remain `sha256:176faa3e22f2ad42fcf3580654d35b1ba326e425789917aede12b16c094c7100`.

Wheel remains `sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`; actual runtime manifest remains `sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`. [Identity record](step2-desktop-identity.json).

The isolated desktop used the current dev frontend served at localhost:2911. This establishes the repaired desktop status/request path; it is not a packaged candidate or complete feature-audit PASS. BC-349-05 / SEQ-349-04i / AC-349-15 are recorded in the direct plan. Formal package/full background-memory UI evidence remains outstanding. The earlier baseline app failed readiness, so no valid live before/after speedup is claimed. No production deployment, PR, issue closure or commit.
