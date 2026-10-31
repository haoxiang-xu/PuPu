# #352 incremental delivery and acceptance

This plan resumes the approved Tool Call / Skill Read work. The owner requested
acceptance, normal merge and close of this ticket before the next ticket. Base:
`dev@6e235a029660a09ed51e24623e1b2f53888ac364`. Frozen originals remain read-only.

## Scope and implementation decision

Carry the reviewed `d3f29c8a` UI delta (44 paths, patch SHA-256
`b49139b6e7db1cb2337031ae973b25046951205d6d65583b158fb1622046e0e7`).
Preserve the newer #351 Branch and typed-default fixes during integration.
Carry only the necessary lifecycle dependency from `6ed40b48` (backend patch
`9f8099f7f60f2d8df8c5d21e4a8d32da16f03e1138fe06c2eb0a9d1d9aacd958`)
and re-test against the delivered runtime, rather than re-labeling its old
FINDING assertions as acceptance. Investigate exact selected Skill identity
when a same-name project Skill exists. No #357 UI or whole-release certification.

Existing signed-off UI and repairable-draft policy remain the design. The old
ticket's textual error / empty Continue result conflicts with the measured
typed error / retained result contract. The owner accepted the existing typed-error / retained-result contract on
2026-10-31; the live ticket body records that decision. Explicit failure reasons
and downstream branch behavior remain required, with no negative case waived.

Strong implementation retained: shared renderer, HTTP, durable expiry and
post-effect recovery cross boundaries. The read-only peer review maps the seven
criteria; no weaker worker or second heavy job is assigned implementation.

## Boundary and sequence evidence

- BC-352-01: editor -> facade -> preload -> Main -> authenticated Store HTTP.
  Native documents and binding expressions use the existing closed Skeleton
  contract. Tool schema envelopes and Skill preview envelopes are versioned,
  closed at their declared envelope/identity fields; the tool's JSON Schema
  remains the tool producer's schema. Preserve opaque argument values. Refuse
  wrong identity/version/unknown closed fields; no fallback API or auto-save.
  AC-352-01/02/06 compare real page Save payloads with real Store/read/preflight.
- BC-352-02: saved Tool Call -> existing runtime toolkit/router -> durable
  confirmation -> official handler -> canonical Journal. Use the exact deployed
  runtime wheel and imported protocol manifest; Git identities are provenance.
  AC-352-03/04/05 cover literal/ref arguments, real result, typed failure,
  permission, late/wrong/repeated approval, and no re-execution after uncertainty.
- BC-352-03: selected Skill `{source, source_id, name}` -> trusted registry ->
  immutable run snapshot -> downstream input. Preview is read-only and never
  executed content. Missing/foreign identities fail closed. AC-352-06/07 prove
  selected bytes and run snapshot reuse with same-name workspace controls.
- SEQ-352-01: normal run; first/second approval; approve/reject/expiry; repeat
  receipt/resume; cancel before effect; process death after effect before seal;
  cold recovery. Identity is execution/generation/root/node-attempt/call and
  interaction, as applicable. Proven uncertainty must persist and must never
  invoke the handler again. Do not infer rollback from a cancelled transport.
- SEQ-352-02: preview v1 -> first execution snapshot -> approval wait -> file v2
  -> resume uses v1 -> new run uses v2. Add selected-user / same-name-project
  isolation and invalid identity controls. Parent and child approvals stay
  independently scoped where a deterministic node is nested in a Workflow/Hook.

## Seven acceptance items

1. One real named tool with mixed literal/ref arguments; result reaches consumer.
2. Producer JSON Schema drives required/type/default hints and Value/Variable
   editing. Repairable drafts save and structural preflight may pass; a missing required argument fails when execution reaches the tool, before its handler body runs (owner decision 2026-10-31).
3. Existing permission/confirmation path, including unattended wait and nested
   identity isolation; configuring a node is not advance authorization.
4. Continue/Fail uses explicit error signals, never text parsing. Error is
   null/{code}; Continue preserves the tool result and ok=false. Checked failure
   code/path and safe public explanation remain visible at the failing node.
5. No-receipt uncertain effects are marked honestly; no automatic repeat across
   retry/resume/cold recovery. Expiry before any effect is distinct from unknown.
6. Exact selected Skill is read at runtime, reaches downstream input, missing
   content fails, and the UI offers no input bindings.
7. Same run reuses its Skill snapshot; a new run reads changed content.

## Checks and delivery

Pre-edit index bound to this clone at base6e235a02, offline cached GitNexus1.6.12.
The pending-interaction read is HIGH (19 impacted /5 direct,3 processes); native
and ordinary resume/cancel/cleanup regressions are required, not waived. New JSX
and new helpers are UNKNOWN in the base index; preserved patch references and
post-integration indexing supplement graph evidence. Discovery cuts remain a
lower bound. The contextual `is_path` HIGH result does not authorize changing
its unrelated body. Run detect_changes before each delivery commit.

One local heavy process family, <=4GiB, bounded timeout, private HOME/temp and
OS-denied networking; no real provider/key or local desktop launch. Hosted
disposable real App validation may be used with offline SDK and exact artifact
identity. Changed Python requires a fresh test sidecar process. Final acceptance
must bind the candidate digest, one reused wheel SHA-256 and actual imported
runtime manifest, followed by feature audit and normal protected merge to dev.
Only then close #352 and mark Done. Preserve raw failures and frozen sources.

## Exact-identity dependency update — 2026-10-31

Core PR haoxiang-xu/unchain#69, `66dca350a6c2feff0e145af4f9c554bcc9501497`, fixes the measured same-name project shadowing failure. `SkillRegistry.get_exact` scans only configured sources using the existing parser; it does not open the authored path directly or alter ordinary chat name/alias precedence. Missing and ambiguous identities fail closed; custom/legacy registry paths are preserved. Source tests: red 3 fail / 2 guards pass; green 75/75. The first green run exposed an incorrect test expectation about the existing frontmatter parser stripping trailing newlines; the expected normalized body was corrected, with no producer change. Final acceptance must use the one CI-built wheel from this source and prove the exact imported manifest. Old F-B2 warning text and the old preview test assumption are superseded by positive exact-user/same-name-project coverage plus the retained missing-identity failure.

Ported page tests now use the delivered dev canvas click target. The archived shell used a mouse-down target and is outside this delivery; the test-only helper was adapted without product canvas changes. 19 targeted suites / 282 assertions passed after this integration correction.

Core PR69 merged normally at `74106d668bb1266a024baf96aa526a9e57cf0be1`; full Core CI41219202302: 5552 passed,17 skipped,5 expected failures. CodeQL41219202287 passed. The PuPu pair pins immutable source66dca350, the merged dependency head. Owner additionally accepted runtime-time required-argument refusal on2026-10-31: do not claim structural preflight/publication validates toolkit schema. Negative tests must prove no handler body effect.
