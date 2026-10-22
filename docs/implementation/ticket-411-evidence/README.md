# #411 development verification

Scope and BC/SEQ/AC: [implementation plan](../ticket-411.md).
This is implementation-ready evidence, not a feature audit or release GO.

## Candidate identities

- PuPu branch `codex/ticket-411-gemini-4-argon`, base `b2700372578b0fa8837c173b2b44ae2acbfdf96b`.
- Unchain branch with the same name, base `8cd825239a6d14b7fdee17b7912562c3810f2677`.
- Single development wheel and imported manifest: [pair.json](pair.json).
- Frozen PuPu development sidecar and two cold boot identities: [frozen-smoke.json](frozen-smoke.json).
- Wheel and frozen binary are retained under the ticket clone's ignored
  `.release-qa/ticket-411/`. Preserve them outside the clone before close cleanup.
  Dirty development provenance must not be relabeled as clean release evidence.

## Results

| Evidence | Result | Acceptance |
| --- | --- | --- |
| unchain-red.log | Corrected new tests against archived untouched dev: 38 failed, 1 passed | AC-411-003/004/005 |
| unchain-focused.log | 163 passed | provider admission and signed/native replay |
| unchain-full.log | 4,332 passed, 16 existing skips, 5 xfails | source regressions |
| pair-gemini.log | 161 passed with the fixed installed wheel and pinned PuPu SDKs | AC-411-003..006 |
| pair-durable-matrix.log | 110 passed with that same wheel | SEQ-411-001, graph/subagent/interaction/retry/reopen |
| pair-host.log | 91 passed with NumPy preloaded | AC-411-001/002/006 |
| renderer.log | 20 passed | host fixture → real JS normalizer |
| browser.json and browser-argon-*.png | Argon appears and is selected; no page errors | AC-411-001/002 |
| frozen-smoke.json | 2 cold boots, same data dir, catalog + manifest checks | AC-411-006 |
| graph-unchain.json, graph-pupu.json | Complete raw results; both low, no degradation/truncation | final diff review |

Host fixture: `src/SERVICEs/__fixtures__/gemini_argon_catalog.json`, exported by
the real Flask route using the installed candidate wheel and then independently
consumed by the renderer test. Only the Argon route slice is retained so unrelated
model additions do not invalidate it. Provider fakes compare exact final key sets;
SDK defaults are excluded with exclude_unset, not assumed to be request fields.

## Commands and limitations

From Unchain: `.venv/bin/python -m pytest tests/ -q` (source suite).
For wheel tests, use PuPu's `.venv/bin/python` and set `PYTHONPATH` and
`UNCHAIN_SOURCE_PATH` to its site-packages, not either sibling source checkout.
For host tests set only `UNCHAIN_SOURCE_PATH` to site-packages. The selected host
group was run through `pytest.main` after importing NumPy once, because existing
module-cache mocks otherwise unload its native extension between projection tests.
`numpy-order-limitation.log` and `numpy-isolated.log` retain the diagnosis.

`pinned-openai-baseline-limitation.log` is the initial wider pinned-SDK run;
`pinned-openai-unchanged-baseline.log` reproduces the same four none/xhigh Literal
failures on untouched archived Unchain dev. No unrelated fix or dependency bump.

Renderer command: `CI=true npm test -- --watchAll=false --runInBand
src/SERVICEs/gemini_argon_catalog.test.js src/SERVICEs/api.modelCatalog.test.js
src/SERVICEs/reasoning_effort_prefs.test.js`.
Browser: isolated Playwright Chromium against this clone's dev server, with the
actual host fixture and non-sensitive fake preload presence/status APIs. No real
API credential or provider request. DevTools MCP was unavailable; Playwright was
used for the real-browser check.

Development freeze: PyInstaller 6.22.1, actual `unchain_runtime/server/main.py`,
collecting the installed Unchain wheel, Gemini SDK, TLS data and Qdrant modules.
Frozen smoke reproduction: `.venv/bin/python
docs/implementation/ticket-411-evidence/check_frozen_pair.py`.
The canonical release builder requires committed clean provenance and was not
bypassed or reported successful. This development smoke used a separate output
name and is not a signed Electron application.

An intermediate incremental graph had missing symbol UIDs and spuriously joined
MODEL_OPTIONS to almost every process. `graph-pupu-superseded-warning.txt` preserves
the CRITICAL warning. The local index was deleted and fully rebuilt; complete raw
backend output (avoiding CLI display caps) then reported low without partial or
truncated flags. No product code was edited to make this graph result change.

Live/paid Google API, signed Electron release and acceptance audit: NOT_RUN.
Keep the issue open and In Progress pending requested close, PR and audit.

## Requested close

The maintainer requested close and waived successful live Gemini completion
after the real app returned provider HTTP 429. See [audit.md](audit.md),
[candidate.json](candidate.json), and [audit-i18n.json](audit-i18n.json).
A real OpenAI gpt-4.1 regression returned the requested token in the same app.
The earlier NOT_RUN statements describe the implementation-ready checkpoint.

Companion Unchain delivered source: `4e9d8c3bb228874bd81e4d80ea1905d4aa71110c`.
The wheel was built before the authorized delivery commit; the recorded 338-file
byte comparison binds that wheel to the unchanged source.

Committed test logs retain all output with trailing whitespace normalized.
Original byte logs are preserved in the private local ticket archive.

## CI source selection correction

[Correction evidence](ci-pair-correction.md) records the wrong-runtime CI failure
and scope-preserving workflow source pin correction. [candidate.json](candidate.json)
now includes the CI build input; prior runtime bytes and wheel remain unchanged.
