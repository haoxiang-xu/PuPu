# Ticket #387 — OpenAI and Claude catalog refresh

Ticket: https://github.com/haoxiang-xu/PuPu/issues/387, direct child of open
Release #208 (v0.2.0). Start phase: no commit, push, PR, audit or cleanup.

Workspaces (verified independent regular clones, resumed from the existing start
comment; both initially clean):
- PuPu `/Users/red/Desktop/GITRepo/pupu-387`, branch
  `codex/ticket-387-openai-claude-catalogs`, dev base
  `6582185915a2b8fdb2793b14f40303027cc9b01d`.
- Unchain `/Users/red/Desktop/GITRepo/unchain-387`, same branch, dev base
  `1972e287914d4e1b943613eeaef88c741cfee2f5`.

## Goal and settled decisions

Add exact native chat IDs `gpt-6.1-sol`, `gpt-6.1-terra`,
`claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`.
Preserve every existing catalog record, selected model ID, provider default and
stored conversation; no automatic migration or fallback to a different model.
Keep the existing unavailable-model diagnostic/error path. Do not add audio,
image-generation, restricted/cyber models, new provider transports, billing UI or
computer-toolset implementation.

Official sources fetched 2026-11-13:
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6.1-terra
- https://platform.claude.com/docs/en/models/sonnet-5-5/overview
- https://platform.claude.com/docs/en/models/haiku-5-5/overview
- https://platform.claude.com/docs/en/models/fable-5-2/overview
- Each Claude model's migration-guide; https://platform.claude.com/docs/en/build-with-claude/effort

OpenAI: 1,050,000 context, 128,000 output, text/image input, tools and structured
outputs. Both use the existing Responses transport (tools require Responses).
Sol efforts low/medium/high/xhigh/max; Terra additionally none; default medium.
Copy existing gpt-6-sol capability/default shape, changing only Sol's efforts.
Claude: 1,000,000 context, 128,000 output, existing text/image/PDF projection,
tools, adaptive thinking; output_config.effort low/medium/high/xhigh/max;
Sonnet/Fable default high, Haiku medium. Copy the existing claude-sonnet-5 shape
and defaults. Allowed payload keys max_tokens/output_config only: omit sampling,
manual thinking and forced tool choice. No new output_format capability is
advertised. Fable requires provider-side 30-day retention/account eligibility;
do not hide errors, claim account access or change data-retention arrangements.

Flow: wheel resources → host capability loader → /models/catalog → JS
normalizeModelCatalog → existing model and effort controls → selected model ID
and effort → host _build_payload → native defaults/allowlist → prepared request
and durable wire envelope → Responses/Messages transport → signed tool replay.
The existing implementation already performs model-specific effort fallback and
root payload projection; prove it with tests before adding runtime logic.

UI inventory: chat model selector (available models/active saved selection),
reasoning selector (per-model levels/default), recipe Select (static options).
The user explicitly chose all existing components on 2026-11-13. Add options
only; no layout, new states, new primitive or pending visual choice.

One discovered compatibility defect: COMPUTER_USE_MODEL_PREFIXES contains
claude-sonnet-5, which accidentally admits claude-sonnet-5-5 to the old
computer_20251124 wire tool. New Claude models require computer_toolset_20260801
outside Bedrock. Explicitly keep these three new models out of the legacy
computer route, preserving older model support and normal function tools.

## Files, graph and risk

Fresh GitNexus indexes are bound to the two clones above. Unchain resource-file
impact is UNKNOWN (data edges unresolved), corroborated by runtime/payloads.py
importlib JSON loading, native adapter constructors and PuPu raw catalog loader.
load_model_capabilities: LOW, 3 direct callers (_NativeModelIOBase.__init__,
failure diagnostic replacement lookup, Qdrant registry), 12 upstream nodes,
2 reported build_memory_delta processes. No resource is treated as unused.
PuPu recipe agent_panel.js: LOW, 1 direct importer detail_panel.js, 4 upstream
files through recipes/skeleton resource pages and agents modal; no processes.
resolve_computer_use_capability: LOW, direct model_supports_computer_use and
get_computer_use_status; 2 upstream nodes, no processes. _matches_prefix: LOW,
3 upstream nodes. Host _build_payload/get_capability_catalog are absent from
the graph; text corroboration and real route tests cover them; no edits planned.

Edit scopes: Unchain two runtime resource JSONs and new focused tests; PuPu
recipe MODEL_OPTIONS, computer_use_capabilities.py, new host/JS contract tests,
fixture and this plan/evidence. No unrelated refactoring or dependency bump.

## Boundary contracts

BC-387-001 OPEN resource/catalog boundary: producer is the installed candidate
Unchain wheel's two model-keyed JSON resources, consumer is host catalog and JS
normalizer. Extension policy permits other model IDs and existing optional
capability fields, while the five exact records/efforts/defaults/limits and
normalized model IDs are asserted. Older wheel absence stays absent; no host
invented new model. Unknown root payload keys are dropped by existing allowlist.
Existing IDs and defaults must match the base verbatim. AC-387-001/002.

BC-387-002 CLOSED host/provider projection: host _build_payload produces
reasoning.effort (OpenAI) or output_config.effort (Claude); canonical prepared
request v1 and existing Responses/Messages wire profiles remain unchanged.
Independent strict consumers assert exact full key sets, exact selected model,
effort and token limits for valid settings; sampling/manual thinking/forced
Claude tool choice/unknown root settings cannot escape allowlist projection.
No arbitrary nested extensions are introduced. AC-387-003/004.

BC-387-003 CLOSED computer route: host resolver produces the existing exact
unsupported record for the three new Claude models, consumed by catalog/status
and toolkit admission. Preserve known legacy routes; no fallback to a legacy
tool or another provider. Model identity is the exact ID or its snapshot suffix.
AC-387-005 covers new models, suffixes, old routes and feature-on mounting.

BC-387-004 VERSIONED artifact boundary: actual imported runtime exports the
manifest, independently validated by existing host strict protocol checks.
Protocol schema/capability negotiation is unchanged. Build the candidate wheel
once, reuse that same file for isolated installed-wheel tests, host/renderer
fixtures and cold imports; record wheel SHA256 + runtime manifest digest and
verify actual module path is site-packages. Source SHA is provenance only,
never runtime admission. AC-387-006.

SEQ-387-001 identity = model/chat/execution: first message → second message →
first/second function interaction → retry/durable resume → cold restart replay.
Preserve signed thinking/tool blocks within the same model/account; do not
implement cross-account reasoning migration. Run installed-wheel existing
OpenAI/Claude replay suites plus new-model parameter cases. Normal/native and
durable preparation share resources; graph/subagent paths use the same factory.
Any unrun applicable state is NOT_RUN and keeps active rollout INCOMPLETE.
No active rollout or paid provider access is authorized by this start operation.

## Acceptance and execution slices

- AC-387-001: resource records have exact IDs, providers, token limits, efforts,
  defaults/modalities and payload key sets; all pre-existing records unchanged.
- AC-387-002: real installed-wheel host /models/catalog and JS normalization
  agree; selection/model parsing/effort fallback and static recipe options work;
  existing selections and defaults remain unchanged, older catalog omits new IDs.
- AC-387-003: every supported effort reaches strict provider/prepared consumer,
  exact model retained, no rejected sampling/manual thinking/unknown keys.
- AC-387-004: signed function-call continuation and second normal message work
  for each new model; existing unavailable-model errors remain explicit.
- AC-387-005: new Claude models never mount computer_20251124 (including Sonnet
  prefix collision), existing supported models retain route behavior.
- AC-387-006: one wheel SHA/manifest binds all pair tests; fresh process imports,
  version/identity rejection tests and applicable replay/retry matrices pass.

Weaker-model suitability: PARTIALLY SUITABLE. Resource additions and their strict
tests are bounded by verified existing shapes and official IDs; suitable worker
gpt-6-luna. Strong parent retains host prefix bug, wheel qualification, replay
coverage and compatibility judgment. No unresolved architecture is delegated.

Slice 1 (worker, next authorized checkpoint ONLY): read this plan and both repo
instructions; run own GitNexus impacts on JSON resources/consumers; add
tests/test_ticket_387_catalog.py first, capture missing-model RED; add only the
five records to model_capabilities.json/model_default_payloads.json; add exact
resource and prepared-payload checks across each effort and rejected root keys.
Use .venv/bin/python -m pytest tests/test_ticket_387_catalog.py -q with
PYTHONPATH=src. Preserve existing JSON formatting/records. No commits/push or
provider production-code changes. Stop and return diff, RED/GREEN, deviations.

Checkpoint 1 (strong parent): inspect actual diff and rerun focused tests; decide
continue/correct/takeover before building wheel. No worker authorizes itself.

Slice 2 (strong parent): regression-test and fix legacy computer route admission;
add recipe options and host catalog/payload/normalizer contract fixture checks.
Use installed wheel after checkpoint, not mutable sibling source for evidence.

Checkpoint 2 (strong parent): strict producer/consumer pair and replay review;
run relevant resource/provider/prepared/durable replay tests, host model catalog,
reasoning and computer suites; react-scripts test with CI=true --watchAll=false.
Record failures honestly; no feature audit during start. Restart task sidecar
after host Python changes before runtime validation. Verify graph diff before
any future close-authorized commit. Leave open/In Progress at implementation-ready.

## Implementation-ready evidence — 2026-11-13

Checkpoint 1: CONTINUE after actual worker diff review and independent 31-test
rerun. Worker used gpt-6-luna only for the agreed JSON/resource-test slice.
No existing capability/default records changed (39 originals in each file).

Checkpoint 2: CONTINUE / development implementation-ready. Added real host →
strict transport checks for every new effort, exact durable wire envelopes,
two function interactions, second normal messages, signed replay and five
actual interpreter-restart cases without duplicate tool effects. Fixed the
Sonnet prefix defect with RED-before-GREEN evidence; actual feature-on toolkit
mounting is absent for every new Claude ID and tested suffix. Recipe/model and
reasoning UI reuse is as selected by the user.

Pinned SDK test compatibility correction: existing September tests rejected
documented none/xhigh levels using the old OpenAI 2.7.1 typing Literal. Same
four failures reproduced against the unchanged original repository test. The
existing max exception now also covers none/xhigh, preserving exact payload
assertions. Eleven new actual OpenAI SDK + HTTP MockTransport cases prove all
documented new-model levels serialize unchanged; no dependency/product change.
Test symbol impact UNKNOWN: pytest parametrized discovery confirmed by source.

One wheel was built, with SHA256
`ac4065ae1cb3a703a4b774f5384272ce0d5b59320fcf2bd1db2882d6fd93618c`.
Every installed-pair test used PuPu's isolated `.venv`, Anthropic 0.87.0 and
OpenAI 2.7.1. Runtime manifest digest:
`sha256:8bb1c7d474eed7bd82f906ac6cd88a6b7e073a23f46319cf500ebbd6b50ff17b`.
Actual module path, preserved wheel location, strict host validation and two
cold HTTP hosts are recorded in `ticket-387-evidence/pair-identity.json`.
The preserved wheel is outside both clones under
`/Users/red/Desktop/GITRepo/ticket-387-artifacts/ac4065ae1cb3/`.

Verification (all final commands passed):
- Installed-wheel Unchain: **304 passed**, including new catalog/replay,
  prior models, wire preparation/envelope, provider failure diagnostics and
  durable retry/cold-resume suites; see `runtime-tests.txt`.
- PuPu host: **155 passed + 220 subtests**, including catalog, computer route,
  runtime-manifest rejection and Builder profiles; see `host-tests.txt`.
- Additional final mount assertion pass: **40 passed**; see `mount-tests.txt`.
- Renderer react-scripts: **26 passed / 4 suites**; see `renderer.txt`.
- Resource comparison: all 39 original records in each file unchanged; exactly
  five additions to each file. Both repository `git diff --check` passed.
- GitNexus tracked-hunk detect-changes summaries report LOW/no affected indexed
  processes. They do not map the new untracked tests/docs; before close/commit,
  stage/index the complete delivery diff and rerun the required graph analysis.

Reproduction commands are in the evidence logs and test source. Runtime suite:
from unchain-387, use PuPu `.venv/bin/python -m pytest` with the 11 files named
in `runtime-tests.txt` / the report. Host suite uses `UNCHAIN_SOURCE_PATH` set to
PuPu `.venv/lib/python3.12/site-packages`, `OLLAMA_HOST=http://127.0.0.1:1` to keep
developer-installed local Ollama models out of catalog-only fixtures, and
pre-imports NumPy before pytest to avoid mock sys.modules rollback reloading its
C extension. Installed-wheel runtime imports never use the mutable sibling src.
`run_tests.sh` has a stale `import miso` preflight and refused this Unchain venv;
used this clone's Python/pytest directly, with failure saved in
`wrapper-limitation.txt`. The wrapper was not changed.

State matrix: first/second normal message and function interaction PASS on all
five IDs; saved checkpoint resume and real process restart PASS on all five;
generic durable retry, invalid identity/version, replay and nonduplicate effect
suites PASS; Builder profile admission PASS for every exported profile, including
the five new IDs. New-model-specific human-input suspend/resume and a full
graph/subagent provider execution matrix are NOT_RUN (their control paths are
unchanged). No paid/live provider requests, account availability, Fable retention
eligibility or packaged desktop installer smoke was run. Active rollout remains
INCOMPLETE; this is development evidence, not release certification or an audit.
The task's fresh Flask hosts were stopped after verification; no user sidecar
was restarted or modified. Python changes take effect on the next sidecar start.

Keep ticket open/In Progress. User `close` is the next lifecycle step: commit/
push companion changes and host changes, PR(s) to dev, feature audit, and safe
cleanup only with fresh delivered-candidate evidence.

## PR delivery — 2026-11-13

The user finished testing the running instance and explicitly requested PRs.
Both origin/dev bases were fetched and still equal the recorded bases, so no
integration code changed. Companion runtime PR:
https://github.com/haoxiang-xu/unchain/pull/80, head
`2458c3c6e142b6996b33bc34a14487f554f8eb87`, base dev. Runtime must accompany
the PuPu release; neither PR is merged by this workflow.

All new files were staged and both clone indexes refreshed before pre-commit
analysis. Full raw detect_changes results (not the CLI's 15-row display) show
no partial/truncated/error flags, LOW risk, 21 changed Unchain symbols and
29 changed PuPu symbols at this point. See the precommit graph JSONs. New docs
may add documentation symbols on the final check; no production behavior has
changed since the user-tested instance.

The real Electron diagnostic candidate completed a gpt-4.1 probe with exact
`PUPU387_AUDIT_OK` output. The persisted assistant message was read back, the
disposable chat deleted and the user's previous chat restored. This is actual
provider evidence for the app flow; account-specific coverage of every new
provider ID is not inferred from this probe. The user separately reported
manual testing complete. See `live-app-probe.json`.

`candidate.json` defines the content digest over 1119 production files and the
same wheel SHA256. Full per-file input hashes, the unchanged wheel, original
full RED logs and actual-app screenshot are preserved outside both clones in
`/Users/red/Desktop/GITRepo/ticket-387-artifacts/ac4065ae1cb3/`. Evidence excerpts
in Git retain original log hashes; repeated failures/build file lists were
trimmed and trailing whitespace normalized. No product inputs were changed.

Independent read-only checks: i18n PASS (10 locales, zero missing/orphan/
placeholder mismatches and missingInEn); UI N/A (only existing options added);
model x Builder PASS/compatible; static rules PASS. Reviewer independently ran
85 installed-wheel catalog/replay/profile tests and 63 host/profile tests plus
199 subtests. Existing dead-key/dynamic-reference scan findings are reported,
not deleted. Final audit verdict is bound to the PR candidate in the issue.
