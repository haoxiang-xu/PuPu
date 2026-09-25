<!-- release-feature-audit:v2 -->
## Issue feature audit — 2026-09-25

Release: #216
Ticket: https://github.com/haoxiang-xu/PuPu/issues/347
Overall: PASS

1. i18n: PASS — full scan of 815 English keys and 10 target locales: no missing/orphan keys, placeholder mismatches, or missing English code references. The scan reports 65 existing potentially dead keys and 48 dynamic call sites; no deletions or translation edits were made. See [i18n.json](i18n.json).
2. UI: PASS — existing Select rail and registered brand icons are reused. Real candidate screenshots show Kimi and DeepSeek without Custom badges in both dark and light themes. No new widgets, colors, overlays or layer choices were introduced.
3. model × agent builder: PASS — compatible. Upstream impact is LOW/exact and ends at ChatInput; no builder caller. The agent panel has its own model options, and the recipe inspector accepts model strings. This patch changes neither those surfaces nor model IDs/schema. The 18 existing agent-panel/recipe serialization tests pass; asynchronous Icon act warnings remain in that existing suite.
4. static rules: PASS — scoped production/test files contain no renderer IPC access, localStorage use, TypeScript, new router/context, color or z-index additions; no Electron test twins are involved. `git diff --check` passes.
5. end-to-end: PASS — a separate Electron process loaded this clone's actual renderer and main-process code with a disposable profile. Real stored credentials made DeepSeek/Kimi available through the normal bootstrap. Clicking Kimi K2.6 and DeepSeek V4 Pro saved `custom.kimi:kimi-k2.6` and `custom.deepseek:deepseek-v4-pro`. A real `openai:gpt-4.1` request returned `AUDIT_OK`, verified in the rendered chat and screenshot. Probe chats were deleted. No mocked provider data or patched rendering functions were used.

Candidate digest: sha256:d42f8e13812e3dfc78ee6dfab23e142d82b9ffc387e3f1a584b185dfafd6ff86
Unchain wheel SHA-256: N/A — this frontend presentation-only patch changes no runtime/provider boundary; the direct plan marks the boundary gate NOT_APPLICABLE.
Runtime manifest digest: N/A — no runtime compatibility or protocol changes.

Candidate scheme: [candidate.json](candidate.json) records 1,793 sorted source/build input paths and individual SHA-256 hashes. The overall digest hashes `path + NUL + file-digest + newline` for each entry. Documentation/evidence and local dependency installations are excluded. Base `d1bbc0db8f129b788091c805832a2b76a80553f3` is provenance; the digest identifies the dirty candidate bytes.

Evidence:

- [Kimi dark](kimi-dark.png), [Kimi light](kimi-light.png), [DeepSeek dark](deepseek-dark.png), [DeepSeek light](deepseek-light.png).
- [Live reply screenshot](live-reply.png), [live probe and cleanup receipt](live-probe.json).
- [Selector test results](selector-tests.txt): 4 suites, 25 tests passed; final regression failed 3/3 on the original builder before the fix.
- [Builder compatibility tests](builder-tests.txt): 3 suites, 18 tests passed.
- i18n command: `node .agents/skills/issue-feature-audit/scripts/audit.mjs --root /Users/red/Desktop/GITRepo/pupu-347`.
- Real application origin `http://localhost:2947`, clone `/Users/red/Desktop/GITRepo/pupu-347`; temporary test profile separate from the user's existing application profile.

Limits: Kimi China and same-name user-provider identity are covered by the rendered Select regression, not a real China-account request. Live inference smoke used OpenAI, not DeepSeek/Kimi inference, because this patch changes only presentation metadata. No installed-package deployment, PR, commit, merge, ticket closure or Release certification is claimed.

Disposition: #347 remains open and moves to In Review. A change to candidate inputs requires fresh audit evidence.
