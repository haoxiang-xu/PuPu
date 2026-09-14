# #202 — real-key verification, 2026-09-14

## Result

DeepSeek and Kimi global now have successful real-app conversation evidence.
The run also found a real Kimi tool/replay incompatibility which fake-key
verification could not expose. The ticket is not ready for Done.

- DeepSeek V4 Flash: first and second messages returned `OK` and `OK2`;
  a tool round-trip read a probe file and returned its unique value.
- DeepSeek V4 Pro: returned `RESTART_OK` after a cold app/sidecar restart.
- Kimi K3: first and second messages returned `OK` and `OK2`.
- Kimi K3 and K2.6: with the local preset fix below, real `read` calls returned
  the first line of `unchain_runtime/server/main.py` (`import os`). Persisted
  traces contain matching tool-call/result IDs and successful read results.
- Kimi K3: returned `RESTART_OK` after the final cold restart with the fix.
- Kimi China: the supplied global credential returned HTTP 401 at the China
  host. A completed China conversation remains NOT_RUN; a separate China key
  is required. Local platform switching/save/clear isolation passed using a
  disposable, nonfunctional China probe credential.

## Discovered incompatibility and bounded fix

The real Kimi Anthropic-compatible response contains an unsigned `thinking`
block. The shared Unchain adapter raises `ProviderReplayFrameError: Anthropic
thinking block is missing the replay signature` when that response also has a
tool call. PuPu exposes this as `durable_provider_turn_uncertain`.

This was reproduced both through PuPu and through the actual
`HyperspaceModelIO.fetch_turn` against Kimi K2.7 Code. It is not an authentication
or invalid-model-ID failure.

Local fix: K3 and K2.6, on both site presets, declare the existing per-model
`default_payload: { thinking: { type: "disabled" } }`. This changes no wire
schema, validator, ModelIO class, or Unchain source. BC-002 already admits this
field. Their tools then work through the real app without re-saving a key.
This is a non-thinking-mode workaround; support for Kimi thinking plus tools
still needs a compatible replay implementation.

K2.7 Code explicitly rejects disabled thinking with HTTP 400:
`invalid thinking: only type=enabled is allowed for this model`.
That attempted default was removed again. Its preset remains as before, and its
tool/replay issue remains unresolved. The user has been asked to choose between
extending work into Unchain, removing that model from the shipped list, or
retaining the current scope and recording the blocker. No choice is assumed.

The `/models` response is not sufficient evidence to delete a model: it omitted
K3 even though a real K3 conversation succeeded. DeepSeek's older Flash ID is
still accepted by its [official API](https://api-docs.deepseek.com/).
[Kimi Messages API](https://platform.kimi.ai/docs/api/messages) is the official
Anthropic-compatible endpoint reference.

## Persistence and lifecycle evidence

All checks used `enable_custom_model_providers=false`.

- UI saves wrote credentials without inserting shipped definitions.
- Both keys and model availability survived two cold Electron/sidecar restarts.
- Pre-#202 copied DeepSeek/Kimi definitions were seeded through the real settings
  repository, then removed at boot. Secrets survived. A second cleanup was a no-op.
- A `config_version:999` entry under `kimi-cn` survived unchanged (AC-10).
- A controlled in-memory preset change reached the next real catalog read and
  producer wire object with no settings write, then was restored in `finally`.
  This proves the live resolution path; a packaged-app upgrade was NOT_RUN.
- Saving and clearing a separate China probe credential never changed the global
  credential or global model availability.
- Cleanup removed all probe credentials and seeded definitions. No shipped model
  remained available after clearing the credentials. Probe chats were deleted.

## Tests and audit

- Producer regression: red before the preset change, green afterward.
- Producer/default propagation and related suites: 48 tests passed.
- Final full frontend run: 398 suites / 4843 tests passed; 5 skipped.
  One pre-existing `plugin_trust_locales` assertion remains failed, the same
  failure documented on this branch and `dev` before this run.
- Backend custom-provider suites: 96 passed. Updated strict-consumer artifact
  suite: 9 passed. It explicitly verifies the K3/K2.6 defaults survive parsing.
- i18n: 778 source keys, 11 locales, zero missing/orphan/placeholder mismatches,
  zero statically referenced keys missing from English. Existing dead/dynamic
  key limitations remain; no locale deletion was made.
- Static diff checks: no production renderer IPC/storage/router violations.
- Model/agent-builder compatibility: unchanged. Graph walks of the three shared
  resolution functions contain no agent-builder or character file.
- New-change graph report: 4 files, 3 symbols, low risk, no affected processes;
  the changed production input is preset JSON, not a runtime function.
- UI: saved provider rows share the existing component; inspected the Kimi
  platform control in the real app. No new UI component was introduced.

Overall audit remains **FAIL / INCOMPLETE**, because K2.7 Code tool use is not
working and its disposition is pending. No merge, closure, or Done transition.

## Candidate and provenance

Base/head: `7573f83484862f33635f08553c9bdc4e726c1cb3` (PR #286).
Local input snapshot tree: `973b7d303e90da4db431a6166c550cabc1c48bd2`.
Candidate archive SHA-256:
`4ea68f774e8984f129a68e7f3382e32ed0ea326c3948109b0efdaafb411f429e`.

The snapshot is the branch HEAD plus the four changed source/test/producer-artifact
files; this report, live JSON and screenshots are evidence-only. It was created
with a temporary Git index and `git archive`, without a commit. Changes are local
and uncommitted, as required by AGENTS.md; PR #286 has not been updated.

Electron and its development server were launched from
`/Users/red/Desktop/GITRepo/pupu-202`, using web port 2931 and a new isolated
profile at `/tmp/pupu-202-live-profile`. The existing user's PuPu process was not
used or stopped. The sidecar used the existing development Unchain source at
revision `e583e9a70a6e84f2f52c47911595315f664065d2` (clean before the run).
Unchain wheel SHA-256 / imported-runtime manifest digest: NOT_RUN; this is a
source development probe, not packaged release certification.

Machine-readable evidence: [live-verification-2026-09-14.json](live-verification-2026-09-14.json).
Screenshot: [live-provider-keys-saved.png](live-provider-keys-saved.png).
No credentials are included in these artifacts.

## Owner-directed merge

After reviewing the results above, the project owner explicitly requested
"合并" (merge). The tested K3/K2.6 preset fix, regression tests and evidence
are therefore being committed to PR #286 and merged into `dev`. This supersedes
the earlier uncommitted/no-merge disposition, not the recorded test results.
K2.7 Code remains unresolved, and #202 remains open; this merge does not turn
the incomplete feature audit into PASS or certify a release.
