# Ticket #257: graph seed model-visible input

Ticket: https://github.com/haoxiang-xu/PuPu/issues/257
Release: #203 (open, In Progress). Scope: preserve the actual user request in Memory V2 Active graph step zero without changing durable graph/attempt/source/replay identity or intentional later-step/subagent inputs.
PuPu clone: /Users/red/Desktop/GITRepo/pupu-257
PuPu branch: codex/ticket-257-user-request-handoff
PuPu base: dev @ ccff389d4546577b348f0dc6a64ab6526c042e23
Runtime clone: /Users/red/Desktop/GITRepo/pupu-257-unchain
Runtime base: main @ 846e4387354831e83f7a6043901a2dd8dde3e22b

## Reproduction and causal path

Historical actual Anthropic wire is documented in #195 comment 5576553003: a user `hello` was followed by raw `unchain.derived_handoff_input.v1` as the final user message, and graph input seed history looked like a completed previous agent handoff. Current runtime still has this path: GraphCheckpointService._source_for_step creates a graph_input_seed.v1 artifact from the original input; DerivedHandoffInputIngress persists an official linked input; JournalContextRequestFactory binds that descriptor as current input; the compiler deliberately keeps a bound descriptor for byte-equality. The durable coordinator independently requires the newest receipt to belong to the current attempt. A string replacement or broad descriptor suppression would break those guarantees.

PuPu Active graphs still route through _stream_recipe_graph_events. The durable flat default-recipe path is a different non-Active case. Relevant host regression fixtures are test_memory_v2_unchain_active_graph_interaction_resume.py and test_memory_v2_unchain_graph_root_completion_entry.py.

## Implementation decisions

1. Keep all existing durable event, graph seed artifact, derived input, operation, graph plan and attempt bytes unchanged.
2. In Unchain, recognize only an exact admitted graph's step-zero seed linkage. Validate the closed GraphExecutionPlan, orchestration and step identities, original source cursor, exact derived receipt and handoff envelope, seed artifact SHA/length against canonical original JournalEvent bytes after the producer artifact sanitizer (when bound; verify the stored artifact through read_full), and ordering. A schema-looking user string is not sufficient. Nested graph input that is itself an intentional derived/subagent input must retain that semantics; do not recursively unwrap it as root user intent.
3. Bind the model-visible current message to the original canonical user event/cursor. Keep context build trigger identity and the coordinator's authorization/input_receipt bound to the actual newest derived receipt. The coordinator must independently revalidate any mapping from the source message to that trigger against its own stable snapshot. Source bytes must still match the original event exactly; unrelated/stale/foreign sources remain rejected.
4. Omit only verified graph-seed handoff records from the compiler semantic history, in both the request factory and the coordinator's rebuilt semantic projection. Preserve the records in the durable snapshot and checkpoint provenance. Ordinary later-step/subagent handoffs remain intact. No new journal schema or runtime admission version is planned; evaluate persisted-build compatibility explicitly before claiming restart support.
5. Reuse the current PuPu host flow; add host-level actual provider serializer/wire regressions and delivery documentation. If evidence requires host production changes, parent agent investigates and records impact before editing.

## Boundaries and acceptance

- BC-257-1, CLOSED: GraphCheckpointService/DerivedHandoffInputIngress durable records -> JournalContextRequestFactory/ContextCompileCoordinator -> compiler. Canonical record shapes and source byte equality remain authoritative. Unknown fields, wrong schema/version, attempt/cursor/artifact mismatches must fail at the projection/admission boundary; never weaken them to make the wire test pass. Source cursor may represent the verified original message while authorization retains the newest derived receipt. AC-257-1 first root graph user request appears exactly once on compiled/provider wire, with no seed descriptor or synthetic seed handoff history. AC-257-2 durable seed/handoff/input/plan identities and bytes remain unchanged and replay stays idempotent. AC-257-3 wrong cursor/attempt/artifact/unknown field/version and ordinary schema-looking text cannot obtain an unauthorized projection.
- BC-257-2, CLOSED: PuPu active graph host -> imported Unchain -> actual OpenAI/Anthropic serializer -> strict deterministic HTTP/client fake. Assert exact allowed wire key sets and final user text; use real host/compiler products, no hand-built replacement messages. Preserve configured provider/model and actual prior-step output. AC-257-4 first message, second ordinary message and cold reopen keep conversational context and request intent. AC-257-5 real later-step and subagent handoffs retain necessary content and durable bindings; existing first/second interaction, resume and graph recovery regressions remain passing.
- BC-257-3, VERSIONED: PuPu candidate paired with one once-built Unchain wheel, verified by SHA-256 and imported runtime protocol manifest digest. No Git/source-path admission shortcuts. AC-257-6 targeted host/runtime matrix uses that same wheel; package smoke and real-app audit, if unavailable, remain explicitly NOT_RUN/INCOMPLETE and do not authorize active rollout or cleanup.
- SEQ-257-1: one chat/generation, first root user message -> graph first step -> completion -> second ordinary message -> cold process/store reopen -> next message; each current request remains canonical, prior conversational context retained. Retry/durable resume must not duplicate provider side effects or mutate existing input receipts. AC-257-1/2/4/5.
- SEQ-257-2: graph step zero -> intentional later step; root -> subagent -> nested recipe where reachable; first/second interaction -> suspend -> resume after cold reopen. Preserve predecessor output, source bindings and graph step identity. AC-257-2/3/5.

## Impact and risks

Fresh per-clone GitNexus indexes. Runtime JournalContextRequestFactory.__call__: UNKNOWN (dynamic call); text confirms ContextRuntime.build_request calls request_factory(context), used by active graph/normal/subagent contexts. _prepare_journal_view: LOW, caller ContextCompileCoordinator.compile, seven reported compile flows. project_canonical_journal_messages: LOW, three direct callers through coordinator/compiler, six impacted symbols. Host bootstrap_pupu_unchain_recipe_graph_input: LOW, two direct callers; _stream_recipe_graph_events: LOW, four direct callers. Index flow enumeration has budget limits, so absence of a listed flow is not proof of absence. Current intended changes avoid the compiler's byte-equality check and persistence schemas.

## Formal-ticket delegation assessment

Partially suitable. Core authorization/projection and persisted-build compatibility require strong-agent implementation because a superficially green output can bypass receipt admission. A bounded new host regression file is suitable for gpt-5.6-sol: the user outcome, real producer fixture, allowed edit scope, and exact negative observable are specified. Root agent handles core runtime changes and final integration/audit. No UI changes or visual choices are needed.

Delegated slice: create a new PuPu host regression file tests/test_graph_seed_user_request.py under unchain_runtime/server/tests only. Reuse existing official active graph fixtures and real provider serialization, assert first/current ordinary request exactly once and no graph-input-seed/derived input plumbing on step-zero wire; include second ordinary message and cold reopen when fixture supports it. Preserve and inspect later-step output. Do not modify production code or existing fixture files, do not commit/push, and do not change unrelated tests to fit behavior. Stop at the first checkpoint with the diff, pre-fix failures, and exact commands; parent reviews before further work. Do not invoke real paid providers or use user application state.

## Verification commands and checkpoints

Runtime: its own .venv pytest, first new regressions (red-before-green), then tests/context_v2/test_graph_bootstrap_harness.py, test_derived_handoff_input.py, test_graph_checkpoint.py, request-factory/coordinator and graph interaction/restart suites. Existing run_tests.sh currently imports obsolete `miso`; if that runner cannot run, report it and use its own .venv Python pytest directly, never Jest.
PuPu: own Python environment, UNCHAIN_SOURCE_PATH pointing only to the dedicated runtime clone for development; then a separate fixed-wheel environment with no mutable source import. Host active graph and interaction/recovery tests. Record actual commands/results below.
Checkpoint 1: reproduced failing wire and validated repair design. Checkpoint 2: core + strict negative/replay tests pass, host regression reviewed. Checkpoint 3: same-wheel integration evidence, exact delivery diff and graph-change checks before PR. A PR goes to dev and waits for the user; no automatic merge, issue closure or Done.

## Evidence

Development evidence (2026-09-12):
- Pre-fix host wire regression failed on baseline runtime 846e438; core baseline had three positive tests fail and the source-byte-forgery rejection pass.
- Source runtime: 1,454 passed, 1 skipped, 1 xfailed. Source host: 11 passed, including opaque Vault-handle cold-resume.
- Bound the same ArtifactService into PuPu's runtime request factory and coordinator. The general sanitizer redacts a Vault handle inside the graph seed artifact while the canonical user receipt preserves its provenance; prepare_json_value + read_full now verifies that exact producer transformation.
- Added persisted SQLite coordinator/reopen and durable provider replay regression: compiled source is the original user cursor, build trigger remains the derived receipt, and provider dispatch happens once across repeat and store reopen.
- Built one wheel and reused it for both matrices: SHA-256 2802701f2b672395556dc3802f4e59faac2daa203e02e14d4b83d9474e3bd779. Runtime manifest digest sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc. A separate venv runner preloads the installed wheel and verifies every loaded unchain module remains in its site-packages directory. No mutable source import is accepted.
- Fixed-wheel runtime: 1,455 passed, 1 skipped, 1 xfailed. Fixed-wheel host: 54 passed and 8 subtests (Active graph, first/second message, interaction resume, graph recovery, downstream handoff, subagent integration, ownership and recipe runtime).
- Remote dev advanced during work; fast-forwarded the dedicated clone from ccff389 to d866265498f45b4be746a7c94bc0693dce26b69d before the fixed-wheel host matrix. Runtime base unchanged.
- Compatibility limitation: a pre-fix already persisted context build has the same trigger/build identity but a different model-visible source range. Recompiling that exact in-flight build fails closed with ContextConflictError rather than rewriting its durable receipt. New builds and their reopen/replay pass. No old-build migration or resume compatibility PASS is claimed.
- Runtime final graph diff: HIGH, shared compile path; seven affected compile processes. Class impact LOW; dynamic compile and host bundle callbacks UNKNOWN were confirmed at ContextRuntime.compile_context and the bundle_builder binding. Full-scope graph checks include the staged regression files.
- Candidate source, wheel, runner, logs, and compatibility probe are preserved outside the clones at /Users/red/Desktop/GITRepo/pupu-257-evidence. Package smoke and a real-app probe with a restarted sidecar and real openai:gpt-4.1 are NOT_RUN. Unit/client-fake tests do not satisfy this audit gate. No active rollout or clone cleanup is authorized by this evidence.
- Delivery requires the companion Unchain revision/wheel; older installed Unchain lacks the new optional artifact parameter. The manifest's existing feature set is unchanged, so release artifact selection must bind the exact wheel above; the manifest digest alone does not identify this fix.

## Default PR CI dependency correction

The first PR run selected floating Unchain dev and failed with an unsupported artifacts constructor argument. A successful manual workflow_dispatch did not replace that pull_request check. The companion runtime PR now targets dev and its reviewed candidate includes dev baseline 8cd7759; its current head is 4986ad4a42d81d728a3fac250be83a81c20c586d.

BC-257-3 now also binds Release QA's default source selection to that exact runtime revision. Both the workflow_dispatch default and all four shared deterministic/package callers use the same full SHA. Explicit dispatch overrides remain supported. This is build dependency selection, not runtime capability admission: the imported protocol manifest and once-built wheel digest remain authoritative for validation. Existing admission, artifact continuity, tests and report requirements remain enforced. AC-257-6 requires a fresh pull_request run associated with this PuPu head to pass, including its actual wheel identity and final report; manual-run success alone is insufficient.

Graph impact for release-qa.yml is UNKNOWN because YAML is not indexed. Text inspection confirms the four parameter consumers, the exact checkout in _shared-release-deterministic.yml, and package reuse of the uploaded wheel. Existing Release QA workflow/continuity tests cover these paths. The previously successful paired run 34704003338 used the same runtime source revision, with wheel sha256:968e3a238f5d377bb6ac8d93795d25ed737311b8715412ee3eecdc55b7f53344. A fresh PR run creates fresh candidate evidence. No PR merge or gate waiver is part of this correction.
