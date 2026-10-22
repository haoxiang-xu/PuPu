# Ticket 383: logical tool-call lifecycle

- Issue: https://github.com/haoxiang-xu/PuPu/issues/383
- Release: https://github.com/haoxiang-xu/PuPu/issues/216
- Plan state: final local merge preparation passed; live rollout remains incomplete for the declared unqualified states. See [the 2026-10-04 acceptance record](ticket-383-evidence/merge-preparation-20261004.md).
- PuPu base: `fce580597d2ea59c5e5a8048c3575a7c9f4422df`
- Unchain source: `a7fa15d685b1130bf5678c1e493a51d2551185cf`
- Unchain wheel SHA-256: `27139af8f6bf94b8f6bd1ce219a5da6966e17dc90b20225ace032e0c1a57d8b6`

## Goal and scope

Represent one tool invocation consistently from its original intent through pending interaction, accepted or rejected feedback, execution, result, replay, and reload. Multiple observations of a lifecycle must not increase invocation count. Grouping policy controls presentation only; it cannot change identity, authorization, execution, or result ownership.

The implementation is a bounded cross-boundary repair: a host-owned descriptor resolver will bind validated original-intent metadata to a versioned PuPu display descriptor; frontend adapters will preserve evidence and feed live, replayed, and stored traces to one pure logical-call projection; renderers will consume that projection. Existing request, receipt, authorization, provider, and durable journal identities remain authoritative and unchanged. No database migration or derived-state cache is planned.

Implementation files are expected in the host adapter, durable interaction host, route projection, a small host descriptor module, PuPu runtime-event ingress/replay/storage adapters, and chat-bubble projection/presentation. Run a fresh impact query for each target before editing. Source editing is authorized once the real mounted live-entry RED and required target impacts are complete.

## Identity and state rules

The canonical owner is the original journal tool intent. Logical equality requires the same execution, original attempt, and call ID, validated against the exact intent cursor and tool name. Iteration is included when proven, so calls in different iterations remain distinct owners. Distinct calls may still be visually folded across iterations when their evidence makes them eligible under the selected merge policy and no semantic timeline barrier intervenes; each member retains its own feedback, arguments, and result. Historical toolkit identity participates only when it is present in authoritative evidence; it must not be invented from current configuration. Durable interaction ID, request digest, and accepted receipt bind feedback to the original intent.

A cross-attempt alias is admissible only when existing host/kernel continuation admission validates the exact original intent, source request, and receipt. Parent linkage, reused call ID, or a source-attempt label alone is insufficient. Projection metadata cannot relax current request, continuation, or bundle-attempt checks.

Unknown scope stays unknown. Missing values are never replaced with zero, current settings, or latest state. Invalid explicit references, contradictions, and multiple compatible anchors remain unresolved. For old evidence, a single compatible known-scope anchor may be used within its owning execution; weak or ambiguous evidence remains a visible unqualified fragment. Semantic timeline barriers are preserved.

Keep feedback state separate from execution state: pending, approved, denied, answered, running, completed, error, and stopped are distinct lifecycle facts. Approval is not execution proof. Optimistic feedback is tentative until acknowledged; a canonical receipt supersedes equivalent tentative state without deleting audit evidence. Conflicts remain visible and unqualified. Results belong to one logical member and render once. Retries and new attempts remain separate unless the exact continuation proof above succeeds.

The four merge policies (`never`, `no_feedback`, `approved`, and `always`) apply after identity and evidence ownership have been resolved. They affect only the visual grouping of eligible logical members. They never affect invocation cardinality, authorization, tool execution, retry, feedback, or result association.

The derived per-call policy is a closed discriminated union. A declared policy is exactly `{present: true, status: "present", value: <valid-policy>}`; proven omission is exactly `{present: false, status: "proven_absent"}`; unresolved provenance is exactly `{present: false, status: "unknown"}`. The absent and unknown states have no `value` key. A known legacy adapter default is historical presentation behavior only. It must not qualify an old `call_ref` with missing policy metadata or inherit current toolkit/default settings; missing qualified metadata remains `unknown`.

## Boundary contracts

| Contract | Producer → consumer | Admission | Acceptance |
| --- | --- | --- | --- |
| BC-383-L1 | Canonical intent and durable request/receipt → host descriptor resolver | Closed source records; resolver has no effects | AC-L1, AC-L6, AC-L7 |
| BC-383-L2 | Validated host descriptor beside normalized event → SSE/IPC/runtime-event adapters | Existing open v4 payload carrying a closed typed descriptor | AC-L2, AC-L6, AC-L8 |
| BC-383-L3 | Preserved native/legacy evidence → shared projection and storage hydration | Versioned descriptor or named conservative legacy admission | AC-L3, AC-L4, AC-L5, AC-L8 |
| BC-383-L4 | Logical members and owned evidence → timeline, grouping, details, and controls | Closed derived model | AC-L3, AC-L5, AC-L9 |

**BC-383-L1 — Host ownership.** Resolve original intent once for native events, live confirmation, accepted feedback, and cold reconstruction. Require explicit execution authority, exact intent cursor, call ID, and tool identity; include iteration only when proven. Preserve the canonical policy declaration and its own-property presence. Do not infer omitted historical policy from current toolkit settings. Resolver failure leaves metadata absent/unresolved and has no effect on authorization or execution.

**BC-383-L2 — Display descriptor transport.** Keep three version layers distinct: the HTTP chat-stream endpoint remains v4; the `RuntimeEvent` envelope remains at its existing `schema_version` v4; the PuPu-owned nested `payload.call_ref` descriptor has its exact closed schema `pupu.tool_call_ref.v1`. Its adjacent, closed source-provenance record is `payload.call_ref_metadata`, schema `pupu.tool_call_ref_metadata.v1`, bound to the same canonical `intent_cursor`. That record carries `timeline_merge_policy_declared` and `original_arguments_declared`, with each corresponding value present iff its declaration flag is true. The policy compatibility field at `payload.timeline_merge_policy` mirrors original own-property presence/value; omission stays omission. The outer v4 payload remains OPEN; `source_refs`, request/receipt/journal records, the runtime envelope, `call_ref`, and `call_ref_metadata` remain closed at their respective boundaries. A typed private host sidecar bridges raw adapter events to the V4 route; the route strips it before raw normalization and adds validated public metadata to a copied normalized event afterward. Legacy V2/V3 raw SSE strips the private sidecar and receives no Python object. Do not extend closed `source_refs`, alter the hashed interaction request, or pass unknown metadata through the raw runtime normalizer. A strict consumer checks exact keys, types, version, cursor binding, declaration/value presence, owner constraints, and known contradictions. A producer's absent descriptor remains readable through the named legacy adapter. An old reader may ignore this optional metadata while existing controls and events remain valid. Malformed, unknown-version, or conflicting explicit evidence stays unqualified and does not fall back to heuristics, including during cold replay. The field grants no authority and cannot cause a resend.

**BC-383-L3 — Shared projection and persistence.** A pure projection owns identity admission, lifecycle state, observation/result ownership, provisional-to-known aliases, unresolved evidence, and display timeline for native live ingress, legacy frames, replay, pending overlays, and stored-message hydration. Incremental updates and full hydration use the same reducer. Preserve original evidence; do not rewrite backend canonical events or durable bytes. The frontend sanitizer must retain the descriptor and required provenance through actual save/read. Recompute the derived projection after reload; do not add a persisted derived cache or migrate old databases in this delivery.

**BC-383-L4 — Presentation.** Render logical members, each member's own arguments, controls, and results. Apply the four policies only after identity/ownership resolution. Preserve text, reasoning, retry, error, interaction, and subagent barriers at their original timeline positions. Keep stable member/control aliases through provisional resolution and reload so expansion state and callback identity remain attached to the same member.

Compatibility is versioned at the descriptor and derived-model boundary; no v4 envelope bump is presumed. Qualification must cover the exact PuPu candidate and the one reused Unchain wheel named above, plus the imported runtime protocol manifest. Do not add a host-only display feature to the Unchain runtime manifest. Revisit runtime scope only if the original intent cannot be proven through existing runtime interfaces.

## Sequences

| Sequence | Required lifecycle/state coverage | Acceptance |
| --- | --- | --- |
| SEQ-383-L1 | First and second normal messages; first, second, and third interactions; multiple iterations | AC-L1–AC-L3 |
| SEQ-383-L2 | Pending → accepted/denied/answered → execution/result; tentative feedback, canonical acknowledgment, duplicate and out-of-order observations | AC-L3, AC-L5, AC-L8 |
| SEQ-383-L3 | Stop, storage save/read, fresh module/backend hydration, cold host reconstruction from a genuine request | AC-L4, AC-L6 |
| SEQ-383-L4 | Retry/new attempt versus explicitly admitted durable continuation; reused IDs and scope conflicts | AC-L6–AC-L8 |
| SEQ-383-L5 | Normal, graph, and subagent paths wherever they share the changed resolver/projection | AC-L7, AC-L8 |
| SEQ-383-L6 | Old/new descriptor consumers, exact wheel, and imported runtime-manifest admission | AC-L2, AC-L10 |

Every applicable state must be recorded as PASS, FAIL, or NOT_RUN. A cold display reconstruction does not establish successful kernel resume. No live rollout is complete while an applicable state remains NOT_RUN.

## Acceptance criteria

| ID | Required evidence |
| --- | --- |
| AC-L1 | Exact-wheel production intent and request builder prove descriptor identity, iteration, and policy. Assert unchanged request, receipt, and journal canonical bytes; no model/tool send. |
| AC-L2 | Actual normalized API through SSE/IPC to native projection preserves the descriptor. Strict tests reject extra/malformed keys, unknown versions, and owner conflicts; an older consumer tolerates the additive payload. |
| AC-L3 | Preserve the incident's 24-frame red-before-green control. Execute real mounted `onFrame`, acknowledgment, and renderer paths. Expected: three logical invocations, three approvals, and one eligible x3 group; no manual fixture normalization. |
| AC-L4 | Production sanitizer/store/backend save → fresh module/bootstrap read → actual ChatBubble/TraceChain. Preserve raw frames. Use an isolated test backend; do not rewrite a user database. JSON cloning alone is insufficient. |
| AC-L5 | Exercise pending, approved, denied, answered, running, completed, error, and stopped with all four policies. Cardinality remains policy-independent; controls, output/argument ownership, and once-only callbacks remain correct. |
| AC-L6 | Genuine runtime request with nested original-intent cursor → actual cold host reconstruction and currently admitted host/kernel resume. Malformed cursor and foreign intent fail closed. Cross-attempt alias only with existing exact continuation proof. |
| AC-L7 | Cross-session/run/attempt/toolkit/tool/iteration conflicts, repeated call IDs, multiple anchors, invalid explicit references, and unknown scope never inherit another invocation's feedback or result. |
| AC-L8 | Every live prefix, replay batch size, duplicate event ID, tentative plus canonical feedback, out-of-order arrival, retry, graph, and subagent scope preserves identity/count and causes no execution side effect through projection. |
| AC-L9 | Expand nested details and verify each member's own arguments/results once, stable member keys through resolution/reload, and preserved reasoning/text/retry/error ordering. |
| AC-L10 | Reuse the single wheel above with the exact host candidate; strictly validate the imported runtime manifest. Run relevant host/frontend tests and build, then obtain independent Sol ULTRA review. Actual application/user acceptance remains NOT_RUN until separately coordinated. |

## Delivery checkpoints and limits

Implementation proceeds in bounded slices under the user's authorization: host resolver/descriptor and strict contract tests; transport and shared projection with real lifecycle tests; renderer and production storage cold-read acceptance. Before any commit, run `detect_changes --scope all` in the edited checkout; incomplete or truncated graph results are not a clean check. Preserve red-before-green evidence and keep private incident artifacts out of this public plan.

The reviewed design rejects local hook/renderer fallbacks as the end state because they leave independent identity engines; rejects routing all legacy reconciliation through the activity tree because it would invent v4 envelopes; and defers persisted derived state because it adds migration/rollback work without helping this incident. The selected shared projection plus host-owned descriptor centralizes association while retaining source evidence and authorization boundaries.

## Local acceptance snapshot (2026-10-03, America/Vancouver)

The detailed local evidence index is [`ticket-383-evidence/systematic-local-acceptance.md`](ticket-383-evidence/systematic-local-acceptance.md). The final local matrix, independent checks, and build passed on stable source snapshots. This evidence does not establish actual-HTTP cold resume or manual application acceptance.

- Exact runtime artifact identity remains the reused Unchain wheel SHA-256 `27139af8f6bf94b8f6bd1ce219a5da6966e17dc90b20225ace032e0c1a57d8b6`, imported manifest digest `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`, and source revision `a7fa15d685b1130bf5678c1e493a51d2551185cf`. The wheel was not rebuilt.
- The affected exact-wheel host suites pass **120 tests + 18 subtests** across seven suites. All five production host source hashes matched before and after the run. The audit blocked one `socket.bind` attempt from urllib3's IPv6 availability probe; all tests passed, with no socket connection.
- The final frontend run passed **84/84 suites and 1,032/1,032 tests** with no skipped tests. Its 1,227 source hashes matched before and after. The independent frontend review passed **113/113**; the independent strict-source review passed **46/46**; both verified their source snapshots stayed stable.
- The fresh lifecycle matrix passed **147/147**: projection 79, genuine native lifecycle 10 (covering all 16 prefixes), TraceChain 53, and actual SQLite reopen 5. The isolated SQLite check confirmed integrity, unchanged database hash across close/reopen, and zero mutation counters on the replay/read path. The separate native producer/cold-core checks passed 4/4 for OpenAI and Anthropic argument shapes: canonical original arguments were preserved, request bytes were unchanged, each core resume completed once, and replay redispatch was zero. Local fake-provider transports were used; no external provider request was made.
- The CRA production build compiled successfully with all 1,227 source hashes stable. Its output contained a Node `fs.F_OK` deprecation warning and the CRA bundle-size advisory; no ESLint warning was reported. No app-version build or runtime wheel rebuild was performed.
- Actual HTTP cold pending-resume acceptance remains **NOT_RUN / UNQUALIFIED**. Earlier guarded attempts remained blocked by existing final-model or immutable-registration checks and did not dispatch another model/tool. A preserved-registration core cold resume or SQLite display reopen does not establish successful actual-HTTP resume; no admission guard was relaxed.
- No Electron application/UI launch, external real-LLM call, user-profile check, or manual user acceptance was performed. The complete ticket acceptance matrix and live rollout therefore remain **INCOMPLETE**; no candidate packaging readiness or manual-launch check is claimed.

No deployment, publication, user/production database write, approval action, or authorization change is included. Actual SQLite operations used an isolated private fixture; no user or production database was written.
