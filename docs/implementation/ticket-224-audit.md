<!-- release-feature-audit:v2 -->
## Release feature audit — 2026-09-11
Release: #203
Overall: FAIL — required end-to-end evidence incomplete; no new code violation found in checks 1–4.

1. i18n: PASS — full scan of 733 English keys and 10 target locales: no missing keys, orphans, placeholder mismatches, or code keys missing in English. 55 dead-key candidates and 35 dynamic-key sites are informational/static-analysis limits; nothing deleted or edited. Reused Submit wording is existing component behavior, not a new literal in this diff.
2. UI: PASS — new input branches reuse TextInputInteract → builtin TextField/Button. Labels and question come from the canonical request. Existing palette colors have light/dark branches; no new hex colors, shell backgrounds, bare buttons or popovers. Direct input, trim/blank handling, Enter/click, history, draft-preserving rerender and new-question reset have passing real-component tests. This is source/component evidence; full-app visual evidence remains under check 5.
3. model × agent builder: N/A — this feature modifies question-tool admission and prompt guidance, not model/provider/effort selection, model IDs or recipe/character schemas. Upstream tool-builder impact is LOW through CoreToolkit._register_tools and CoreToolkit.__init__; no new builder capability to expose. Model behavior requirements remain applicable under check 5/AC-1 and AC-3.
4. static rules: PASS — changed production files contain no renderer ipcRenderer usage, localStorage writes, react-router-dom imports or new context providers. No TypeScript, CSS modules, class components, overlays or Electron test changes. Existing single/multi branches stay intact. GitNexus detected 4 changed PuPu files/14 symbols, low reported risk; the zero indexed process count is not taken as proof of no dynamic callers. Registry/wrapper and strict-recovery source plus tests corroborate the path.
5. end-to-end: FAIL — NOT_RUN/INCOMPLETE for the required exact-candidate real-app path. The live Test API identifies PID 65813 running /Users/red/Desktop/GITRepo/PuPu, while this change exists in /Users/red/Desktop/GITRepo/pupu-224 and companion unchain-224. It was not used as evidence for the ticket. No probe chats were created; the active application and its sidecar were not changed or restarted.

Candidate digest: NOT_AVAILABLE — no verified runnable/delivered PuPu candidate supplied or created in this audit. A source digest is not substituted for it.
Unchain wheel SHA-256: sha256:f17a41d5b50da559b80c9c935832a74d6017334754eb3702aad6a19c2d860545
Runtime manifest digest: sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc (previously strictly validated from the imported development wheel; no active-app match established)
Source review digest: sha256:5535ac00d2b3db3b576460c183e7f481995a898aa73597a7af7a5c53e32eea38 (identity of the five changed production files, NOT a candidate digest)

### Evidence rerun in this audit
- Full i18n script: node /Users/red/.codex/skills/release-feature-audit/scripts/audit.mjs --root /Users/red/Desktop/GITRepo/pupu-224.
- PuPu react-scripts tests: human_input_free_text.test.js + api.humanInputFreeText.test.js — 26 passed.
- Unchain own .venv pytest: test_human_input_free_text.py + test_human_input_free_text_runtime.py — 30 passed.
- export-human-input-fixture.py --check against the installed, fixed wheel: PASS; actual host projection/response matches the fixture; wheel hash rechecked.
- Existing development record remains 110 PuPu + 156 Unchain tests; not represented as rerun here.
- Ollama inventory rechecked: qwen3:14b, gemma4:e2b, deepseek-r1:8b/14b and embedding model; qwen3:32b absent. The three prior 14B raw probes are supplemental only.
- Local audit artifacts: /Users/red/.codex/artifacts/ticket-224/audit-2026-09-11/ (scan, source hashes, test logs, graph results).

### Required completion before PASS
- Run original three prompts on qwen3:32b, preserving raw tool arguments; AC-1 remains NOT_RUN. Cover the applicable shipped-model guidance matrix for AC-3.
- Run the actual changed PuPu candidate using the same frozen Unchain wheel, start/restart its sidecar, and bind candidate digest, wheel hash and imported runtime manifest to evidence. A local diagnostic/unsigned candidate is acceptable; production rollout, signing and canary duration are not requirements of this feature audit.
- Execute the real-app ask → direct input → submit → resume path with openai:gpt-4.1 as required by the audit reference; verify real persisted output, repeated questions and cold resume under BC-001/SEQ-001. Complete applicable new-form graph/subagent cells or substantiate non-applicability. Delete only probe sessions.

The requested audit has been reported; this is not a waiver or acceptance. Keep issue OPEN and Project In Progress. No commits, PR, issue closure, clone cleanup or product-code edits were performed by the audit.
