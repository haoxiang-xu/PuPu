# #224 — start here on the next computer

**Task: verify the implemented change on a tool-calling model, then merge both PRs
into their dev branches and close PuPu #224 after PASS.** Do not reimplement the
feature, redesign the UI, or start by repairing DeepSeek's local model template.
The issue's current top section contains the authoritative PR links and commit SHAs.

The project owner explicitly authorized this transfer on 2026-09-11: preserve the
work remotely, test on another computer, merge/close after successful verification,
and delete the original computer's ticket clones now. This overrides the generic
no-commit/cleanup-after-PASS rule for this transfer only; it does NOT waive tests,
feature audit, branch protection or release certification. Local clone deletion
is not evidence of acceptance. Release #203 itself must remain open.

## Get the code

Both repositories are required. Both branch names are `codex/ticket-224-free-text`.
Clone haoxiang-xu/PuPu and haoxiang-xu/unchain into separate fresh directories and
check out the issue-linked PR heads. Compare HEAD with the SHAs recorded on #224.
Use the current PR head if testing fixes are later pushed; supersede stale evidence.
Do not assume old paths beginning /Users/red or /tmp exist on this computer.

Read each repo's AGENTS.md, this file, and ticket-224.md (BC-001/SEQ-001 and detailed
acceptance mappings). The old reports ticket-224-audit.md, ticket-224-live-8b.md and
ticket-224-forced-8b.md are history; the instructions here supersede their old
"wait for close" and local-machine setup descriptions. Remote raw evidence is in
`docs/implementation/ticket-224-evidence/`; old absolute paths in raw logs are provenance.

## What is already implemented

- Unchain: `src/unchain/input/human_input.py` admits `options=[]` only with strict
  `allow_other=true`; unknown argument/option keys fail at the advertised closed
  boundary. Tool guidance explains bounded choices versus paths/names, forbids
  fake custom_path/enter_text options and guessed paths, and asks blocking values first.
- PuPu: `single_select_interact.js` and `multi_select_interact.js` reuse the existing
  TextInputInteract directly. No Other click is needed for pure input. Preserve
  draft text on parent rerender, reset on new request_id, display disabled history.
- Both isCanonicalHumanInputPayload predicates in api.unchain.js and
  durable_interaction_recovery.js now admit the new shape with valid counts.
- Wire stays kind=selector. UI returns {value:'__other__',other_text} or
  {values:['__other__'],other_text}; runtime receives selected_values=['__other__']
  plus nonblank other_text and the original request_id. No new wire kind or migration.

Prior evidence: 110 PuPu tests, 156 Unchain tests; audit reran 26 JS + 30 Python.
Prior i18n scan: 733 English keys/10 locales, no gaps/mismatches; 55 dead-key candidates
and 35 dynamic-key sites were informational. UI/static checks passed. Audit overall
is still FAIL because the supported-model real-app/candidate evidence is incomplete.

## Models — important

**Use qwen3:32b for original AC-1.** The previous computer lacked it. qwen3:14b
produced correct tool calls in three supplemental raw probes; use it as an additional
smoke if useful, not as an unapproved replacement for the required 32B run.
Use openai:gpt-4.1 for the audit skill's real-app probe, if configured. Record the
applicable shipped-model matrix for AC-3; ask for a scope/waiver decision only if a
required model cannot be provided, never silently claim a substitute passes.

Do not use the previous local deepseek-r1:8b run as a #224 regression verdict. It
returned prose JSON with zero tool calls. Despite a tools capability flag, its local
model template omitted supplied tool definitions (server-rendered prompt captured).
Stronger prompt produced correct options=[] JSON but still no actual call. Ollama
0.33.3 ignored required/named tool_choice fields; PuPu's own provider wire requires
auto. These are recorded environment/integration limitations, not changes requested
under this ticket. Never parse ordinary assistant JSON and inject a fake tool event
to make the test appear to pass.

## Prepare a reproducible candidate

1. Use Python 3.12, Node compatible with package-lock, and real configured models.
   Install PuPu dependencies with `npm ci` (do not skip Electron install scripts).
   The repos' scripts/init_python312_venv.sh set up their own environments; never
   replace an existing unrelated venv. Unchain tests use its own pytest, not Jest.
2. Build ONE new Unchain wheel from the clean, pinned Unchain PR checkout and reuse
   it for the entire candidate matrix. The old development wheel hash is historical;
   there is no accepted old candidate to preserve. Record that the new candidate
   supersedes it. PuPu has a builder with provenance and manifest evidence:

   ```sh
   node scripts/release-qa/build-unchain-artifact.mjs \
     --source /absolute/path/to/unchain-checkout \
     --source-ref EXACT_UNCHAIN_HEAD_SHA \
     --python /absolute/path/to/pupu-checkout/.venv/bin/python \
     --out-dir /absolute/path/to/new-empty-artifact-directory
   ```

   Record artifact path, wheel SHA-256 and imported runtime manifest digest from the
   generated evidence. Supply UNCHAIN_ARTIFACT_PATH and UNCHAIN_ARTIFACT_EVIDENCE_PATH
   together to build/package commands so they do not build a second wheel.
3. Install that wheel into the test environment. Run the following from PuPu using
   the interpreter that imports the selected installed wheel (verify module.__file__):

   ```sh
   /path/to/test/python scripts/test-api/export-human-input-fixture.py --check
   ```

   Do not regenerate the fixture to hide a contract mismatch. Review/fix any mismatch.
4. Start the actual PuPu candidate from THIS checkout, in a separate user-data profile,
   and start/restart its Python sidecar after changing/installing runtime code.
   Check app path, sidecar path, actual imported wheel and runtime manifest. Development
   launch defaults to a sibling ../unchain source checkout: do not accidentally let it
   override your installed wheel. Use the exact-artifact packaging path, or explicitly
   select a dev layout whose `src/unchain` resolves to the installed wheel and verify it.
   A local unsigned/diagnostic candidate is allowed; public release/signing/canary traffic
   is NOT a feature-audit prerequisite. Record the actual candidate digest and package
   smoke; a Git SHA or digest of five source files is not a packaged-candidate digest.

## Run the tests in this order

1. **Targeted regressions.** From Unchain:
   `.venv/bin/python -m pytest -q tests/test_human_input_free_text.py tests/test_human_input_free_text_runtime.py tests/test_human_input.py tests/test_kernel_runtime.py tests/test_kernel_agent.py tests/test_interaction_effects.py tests/test_durable_tool_exposure_replay.py`
   Additional relevant existing paths: test_durable_human_interactions.py,
   test_durable_interaction_runtime.py, test_durable_interactions.py,
   context_v2/test_graph_interaction_resume_checkpoint.py,
   context_v2/test_context_interaction_resume_input.py and test_kernel_subagents.py.

   From PuPu:
   `CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/COMPONENTs/chat-bubble/interact/human_input_free_text.test.js src/COMPONENTs/chat-bubble/interact/confirm_interact.test.js src/COMPONENTs/chat-bubble/interact/code_diff_interact.test.js src/SERVICEs/api.humanInputFreeText.test.js src/SERVICEs/api.memoryProvider.test.js src/PAGEs/chat/hooks/durable_interaction_recovery.test.js src/COMPONENTs/chat-bubble/trace_chain.test.js src/SERVICEs/runtime_events/trace_chain_adapter.test.js`
2. **Original three Qwen3 32B prompts.** Use a disposable test workspace/chat, core
   toolkit enabled and real provider calls. Capture full input, raw tool arguments,
   actual runtime events and screenshots. Record any added safety/test instructions.
   - 帮我做一个简单的 todo app — if asking choices, real concrete answers only.
   - 帮我做一个 todo app，放到我电脑上的一个文件夹里 — ask the blocking folder path,
     do not dodge it with feature-scope questions.
   - 我要你在我电脑上创建一个项目。动手之前，先问我具体要放在哪个文件夹路径。
     — expect actual ask_user_question with options=[], allow_other=true, meaningful
     label/placeholder; no fake choices and no guessed OS-specific path.
3. **Real UI round trip / AC-2, AC-4, AC-5.** Bare input appears directly; blank
   submission stays blocked. Enter a real disposable test path (include Unicode/spaces),
   submit by button/Enter, verify exact normalized text reaches the tool_result and the
   same run resumes. Test ordinary single/multi choices and Other still work. Verify
   malformed/unknown requests become error tool_results, not broken pending prompts.
4. **SEQ-001.** Ask a second question in the same chat; IDs must differ, stale reply
   must fail, old text must not leak. Normal next message works. While pending, restart
   this candidate's sidecar and recover the same input; submit once and verify no replay
   or duplicate effects. Check disabled/historical response rendering. Exercise applicable
   new-form graph/subagent paths or record a concrete reason they are not reachable;
   existing generic graph tests alone are not new-form evidence.
5. **Feature audit.** Use release-feature-audit if installed; otherwise execute its
   equivalent checks: full i18n scan; new UI primitive/theme consistency; model-builder
   compatibility (N/A here unless scope changes); diff-only static rules; real-app
   end-to-end using real LLM and exact candidate/wheel/manifest evidence. For a portable
   read-only copy of the scanner used here:
   `node docs/implementation/ticket-224-evidence/i18n-tooling/audit.mjs --root .`
   Preserve raw evidence then delete only probe sessions. Post a fresh
   `<!-- release-feature-audit:v2 -->` comment on #224 with all five verdicts,
   candidate digest, wheel hash, imported manifest digest, BC-001/SEQ-001/AC results,
   model/version, commands and durable evidence links. No mock-only PASS.

PuPu Test API: `docs/api-reference/test-api.md`, `test-api-debug.md`,
`scripts/test-api/client.mjs`. With an isolated profile, read THAT profile's
`test-api-port` and pass an explicit baseUrl; the helper's default discovers the
normal user profile and may target the wrong app. Use POST /v1/chats, select model/core,
POST /v1/chats/:id/runs and GET /v1/chats/:id/runs/:attempt_id. Inspect real pending
interaction and submit through the rendered UI. For /v1/debug/eval, async code needs
an explicit return. Complete/skip first-run onboarding before screenshots. No need
to change the user's normal profile or force production rollout flags.

## After PASS — already authorized by the project owner

- Fetch current dev in both repos; resolve conflicts and rerun affected checks if the
  candidate changes. Re-audit candidate-changing fixes. Run GitNexus impact before
  edits and full non-partial detect_changes before commits. Push only ticket branches.
- Confirm both PRs target dev and required CI/review checks pass. Merge Unchain PR
  first, then PuPu PR; do not use admin bypass or waive failed checks. Confirm both
  actual merged SHAs remotely. Do not auto-merge before the successful test/audit evidence.
- Record model/candidate/wheel results, both PRs and merge SHAs on #224. Close #224
  explicitly after merged delivery, then discover the live PUPU Project fields/item and
  set its Status to Done. Read back both issue CLOSED and Project Done. A PR merged to
  dev may not auto-close an issue linked with Closes, so verify rather than assume.
- Keep Release #203 open; this is one child, not version certification/closure.
- On failure, post concrete reproduction and preserve evidence; leave #224 Open/In
  Progress. Fix in-scope issues with the normal checks, or report a real blocker.
