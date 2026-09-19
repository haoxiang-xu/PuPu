# Ticket #226: web_fetch signal, in-band truncation and continuation guidance

Ticket: https://github.com/haoxiang-xu/PuPu/issues/226
Release: #216 Release v0.1.12 (open, Planning). Labels: bug, Unchain, good first issue. Size M.
PuPu clone: /Users/red/Desktop/GITRepo/pupu-226 (plan + evidence only; no PuPu production change planned)
PuPu branch: codex/ticket-226-web-fetch-signal
PuPu base: dev @ 395992628d310fe1b6730b2c2b99dea9882a88ff
Runtime clone: /Users/red/Desktop/GITRepo/pupu-226-unchain (all product edits happen here)
Runtime branch: codex/ticket-226-web-fetch-signal
Runtime base: dev @ e583e9a70a6e84f2f52c47911595315f664065d2 (includes #267 fix 4235462)

Goal: a model fetching a boilerplate-heavy page receives usable text inside the
default budget; a truncated fetch tells the model, inside the text it reads, how
to continue; the tool's own description says a partial page is not a basis for
a final answer. Non-goals: changing the default `mode`, wiring an extract model
in PuPu, readability-style main-content heuristics, dropping nav/header/footer,
any PuPu UI change, any change to the #267 error path or the fetch guard.

## Reproduction and causal path

`WebFetchService.fetch` → `_request` → `decode_response_body(body, "text/html")`
→ `html_to_markdown` → `_MarkdownHTMLParser` → cleaned text cached by URL →
`CoreWebBackend.fetch` → `_raw_page(offset, max_chars)` → dict → provider
builder `json.dumps(tool_result)` → model.

Measured on Unchain dev e583e9a (2026-09-18, scripts in this session's scratchpad
`t226/repro.py`, `t226/proto.py`, `t226/proto2.py`):

| page | converter today | skip non-content elements | +nav/footer (rejected) |
|---|---|---|---|
| github.com/haoxiang-xu/PuPu | 67,451 chars; description @7,041; `v0.1` @21,081 | 16,405; @27; @10,463 | 10,357 |
| github.com/haoxiang-xu/unchain | 103,123 | 20,057 | 14,363 (loses "stars") |
| MDN `<script>` element page | 102,233 | 49,901 | 25,373 |
| docs.python.org html.parser | 15,775 | 14,654 | 14,032 |
| pypi.org/project/httpx | 20,193 | 20,088 | 18,085 |

Root causes: (1) `_MarkdownHTMLParser.handle_data` never skips `script`, `style`,
`noscript`, `template`, `svg`, `iframe`, `object`, `canvas`, `audio`, `video`
bodies; (2) `_raw_page` reports truncation only in sibling fields; (3) the tool
description and Args docstring carry no continuation guidance. `mode="extract"`
requires `tool_runtime_config["web_fetch"]["extract_model"]`, which PuPu does
not configure, so it cannot become the default here.

## Decisions already made (worker must not revisit)

1. Skip set is exactly the ten elements above. They all have mandatory end tags;
   void elements are never depth-tracked. `<title>` stays. Landmarks stay.
2. The notice is appended to `result` only when `next_offset` is not null, or
   when `offset >= content_length`. Wording (single line, no Markdown heading):
   `\n\n[web_fetch notice: this page has {content_length} characters; you received characters {offset}-{end}. Call web_fetch again with offset={next_offset} to read the rest. Do not treat this partial page as the whole page or answer from it alone.]`
   and for past-the-end: `[web_fetch notice: offset {offset} is beyond the end of this page ({content_length} characters); nothing more to read.]`.
3. `returned_chars` = `len(chunk)` (content only). `content_length`,
   `next_offset`, `truncated`, `cached` semantics unchanged. No new keys.
4. Tool description (`core.py:90`), Args docstring lines for `mode`, `offset`,
   `max_chars`, a `ToolPromptSpec` on the `web_fetch` registration (purpose /
   when_to_use / when_not_to_use / advanced_tips), and `toolkit.toml`
   `web_fetch.description` all say: raw mode returns page text converted to
   Markdown with scripts, styles and embedded data removed; a truncated result
   ends with a notice and `next_offset`; continue with `offset=next_offset`
   before answering; never answer from a truncated page as if it were complete.
5. The error path, redirect path, skipped-binary path, `mode=extract`,
   `compact_result`, `web_fetch_guard` and `execution.py` are not edited.
6. Prompt-cache prefix change caused by the description edit is accepted.

## Files and reference patterns

- `src/unchain/toolkits/builtin/core/web_fetch.py` — `_MarkdownHTMLParser`
  (`handle_starttag` / `handle_endtag` / `handle_data`; add `handle_startendtag`
  passthrough), `html_to_markdown`, `decode_response_body` unchanged.
- `src/unchain/toolkits/builtin/core/web_backend.py` — `CoreWebBackend._raw_page`.
- `src/unchain/toolkits/builtin/core/core.py` — `_register_tools` web_fetch entry
  (`register(..., prompt_spec=ToolPromptSpec(...))`, see
  `tools/discovery.py:136` and `tests/test_toolkit_design.py:227` for the shape)
  and the `web_fetch` docstring (Args block is parsed by `tools/models.py:118`).
- `src/unchain/toolkits/builtin/core/toolkit.toml` — `[[tools]] name="web_fetch"`.
- Tests to follow: `tests/test_web_fetch_failures.py` (MockTransport + exact key
  set), `tests/test_core_toolkit.py:725` (`_request` monkeypatch + pagination),
  `tests/test_web_fetch_retry_limit.py` (real builders via
  `get_provider_message_builder`).

Impact (GitNexus, fresh index of the runtime clone, all `epistemic: exact`):
`_MarkdownHTMLParser` LOW (1 direct importer: web_backend.py), `html_to_markdown`
LOW (process `fetch`, 6 flows), `decode_response_body` LOW (same), `_raw_page` LOW
(caller `CoreWebBackend.fetch`), `web_fetch` tool method UNKNOWN (dynamic
dispatch; text search confirms callers are `toolkit.execute("web_fetch", …)` in
tests/kernel and name-only references in PuPu `subagent_seeds.py` /
`recipe_seeds.py`; signature unchanged). No PuPu server module imports these
symbols.

## Boundary contract

- **BC-226 (OPEN diagnostics, no new key)** — producer `WebFetchService` /
  `decode_response_body`; consumers `_raw_page`, TTL cache, provider builders,
  model. Success-path key set pinned by a new exact-set test; #267 error-path
  key-set test unchanged; manifest digest of the fixed wheel must equal dev's
  `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
- **SEQ-226 (cache)** — first fetch stores cleaned content → second call with
  another offset is `cached: true` with its own notice → restart clears. Persisted
  transcripts are never re-cleaned.
- PuPu state matrix: first/second message exercised by the live probe;
  interactions unchanged (`requires_confirmation` test); retry/resume/cold restart
  N/A (no persisted shape change, #267 kernel suites re-run on the wheel);
  normal/graph/subagent share the tool object; provider wire covered by AC-226-5.

## Acceptance (see issue body for full text)

AC-226-1 skip set + void negative · AC-226-2 GitHub-shaped fixture · AC-226-3
notice/returned_chars/past-end/cached · AC-226-4 exact success key set + #267
error set untouched · AC-226-5 notice on real OpenAI/Anthropic/Gemini/Ollama wire ·
AC-226-6 description + prompt block guidance · AC-226-7 live fetch (GitHub
untruncated, MDN truncated with notice) · AC-226-8 cloud-model probe via test-api
(`openai:gpt-4.1`); qwen3:32b NOT_RUN under the no-local-model instruction.

## Ordered slices, tests and checkpoints

Environment: run runtime tests as
`PYTHONPATH=/Users/red/Desktop/GITRepo/pupu-226-unchain/src /Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest <files> -q -p no:cacheprovider`
from the runtime clone and confirm `unchain.__file__` points into the clone.
Baseline before edits: `test_web_fetch_failures.py test_core_toolkit.py test_web_fetch_retry_limit.py` = 44 passed.

**Slice 1 — parser skip set (AC-226-1, AC-226-2).** Add
`tests/test_web_fetch_content.py` with the skip-set cases, the void-element
negative, the CDATA `<script>`/`<style>` case and the GitHub-shaped fixture; run
red (save `226-red-parser.log`), implement in `_MarkdownHTMLParser`, run green.
Edit scope: `web_fetch.py` parser class + the new test file. → **Checkpoint 1**
(strong review: diff, red/green logs, prototype numbers re-measured through
`html_to_markdown` on the saved GitHub HTML).

**Slice 2 — in-band notice (AC-226-3, AC-226-4).** Tests first: truncated /
untruncated / past-the-end / cached second call / exact success key set; run red
(`226-red-notice.log`); implement in `_raw_page`; update the pagination
assertions in `tests/test_core_toolkit.py:725` (`result` now starts with the chunk
and ends with the notice; `returned_chars` unchanged). Edit scope:
`web_backend.py`, the new test file, that one existing test.

**Slice 3 — guidance (AC-226-5, AC-226-6).** Description, docstring, `ToolPromptSpec`,
`toolkit.toml`; tests: provider-json description assertion, rendered prompt block
assertion, and the real-builder wire test for all four providers using a real
`CoreToolkit.execute` result. Edit scope: `core.py`, `toolkit.toml`, test file.
→ **Checkpoint 2** (strong review + full `tests/` run in the clone).

**Slice 4 — evidence (strong agent).** Build one wheel from the clean runtime
clone (`node scripts/release-qa/build-unchain-artifact.mjs --source <runtime clone> --source-ref codex/ticket-226-web-fetch-signal --out-dir .release-qa/ticket-226/wheel`),
record SHA-256 + manifest digest; run Unchain full suite and PuPu
`unchain_runtime/server` pytest against that wheel; live fetch probes (AC-226-7);
sidecar restart with the clone/wheel, then the test-api model probe (AC-226-8)
with a throwaway chat deleted afterwards. Write results below and post
implementation-ready.

## Delegation assessment

**Suitable** for slices 1–3 with a weaker model: root cause and repair are
settled by measurement, every edit has an exact file/symbol, the tests give an
observable red→green signal with negatives, and no interface, schema or product
choice remains. Slice 4 (artifact identity, live probes, sidecar restart, issue
comments) stays with the strong agent. Worker: Claude Sonnet via the Agent tool,
dispatched one checkpoint at a time (slice 1 → CP1; slices 2–3 → CP2). Stop
conditions: any existing test outside the listed files goes red, a result key
must be added, the notice wording needs to change, or the fixture cannot be made
to fail on the unfixed parser. No commit or push during start.

## Evidence

### Delegated slices (worker: Claude Sonnet via Agent tool; reviewer: strong agent)

- Checkpoint 1 (slice 1, parser): red 12 failed / 2 passed → green 14 passed
  (`ticket-226-evidence/226-red-parser.log`, `226-green-parser.log`). Reviewer
  tightened two `find() < 300` assertions to `0 <= find() < 300` and removed the
  session-sample block from the durable test. Unfixed baseline for the GitHub-shaped
  fixture (11,861 chars, description at 8,749) verified against the untouched
  sibling dev checkout. Saved live GitHub page through the fixed converter:
  67,451 → 16,405 chars, description at 27, first `v0.1` at 10,463, no `featureFlags`.
- Checkpoint 2 (slices 2–3): notice red 5 / green 44 (`226-red-notice.log`,
  `226-green-notice.log`); guidance red 2 / green 26 (`226-red-guidance.log`,
  `226-green-guidance.log`; worker stashed only core.py/toolkit.toml to recover
  an honest red after writing code first). Exact success key set (17 keys) pinned;
  #267 error-path key-set test unchanged. Five-suite run 87 passed; full Unchain
  suite from clone source 3436 passed, 16 skipped, 5 xfailed
  (`226-full-runtime-after-slice3.log`).
- Reviewer addition after CP2: the `web_fetch` docstring summary line updated,
  because PuPu's toolkit catalog (`unchain_adapter._enumerate_toolkit_tools`,
  strategy 3) shows `__doc__`, not the registered description. Verified in the
  running app catalog after a sidecar restart.

### Fixed-wheel identity (one build, reused)

- Final wheel built by `scripts/release-qa/build-unchain-artifact.mjs` from the
  committed, clean runtime clone at `f6fa0c4a22018086f5b7544787c88808bc0f8e69`
  (`codex/ticket-226-web-fetch-signal`, haoxiang-xu/unchain#32); evidence JSON
  copied to `ticket-226-evidence/226-unchain-artifact.json`.
- Wheel SHA-256: `c0e1c75302893cf6b5df5436747ea8d93fc55845f237efb16ecb48803c617af5`.
- Imported runtime manifest digest:
  `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc` — equal
  to dev, as BC-226 requires (no protocol feature added).
- Test processes preload the wheel with `UNCHAIN_SOURCE_PATH` unset and a session
  plugin that fails if any `unchain.*` module is imported from outside site-packages
  (`FIXED_RUNTIME_IMPORT_AUDIT_OK` / `FIXED_RUNTIME_MODULE_AUDIT_OK` in the logs).
- Unchain full suite on that wheel: **3435 passed, 1 failed, 16 skipped, 5 xfailed**
  (`226-wheel-unchain-full.log`). The one failure is a known non-regression:
  `tests/test_unchain_imports.py::test_unchain_common_subpackages_are_available`
  asserts a `/src/unchain/` path and cannot pass on an installed wheel (same
  expected failure as the #267 evidence).
- PuPu `unchain_runtime/server` suite on the same wheel: **2390 passed, 9 skipped,
  3583 subtests passed** (`226-wheel-pupu-server.log`).
- An earlier development wheel (`9b73cab9…`, built from the then-uncommitted but
  byte-identical tree) produced the same results; superseded by the bound build.

### Live probes

- AC-226-7 (`226-live-fetch-ac7.log`, bound-wheel venv, no model): GitHub repo page
  `content_length 16405`, `returned_chars 16405`, `truncated false`, description at
  char 27, no `featureFlags`; MDN reference page `content_length 49901`,
  `returned_chars 20000`, `truncated true`, `result` ends with the notice. PASS.
- AC-226-8 (`226-ac8-gpt41-run1.json`, `-run2.json`; dev app restarted with
  `UNCHAIN_SOURCE_PATH` = runtime clone, sidecar verified via catalog, model
  `openai:gpt-4.1`, toolkit `core`, throwaway chats deleted): one `web_fetch` call
  each, answer states the correct project description, and explicitly says the page
  does not state the language or the release. No fabrication, no unfetched URL cited.
  qwen3:32b NOT_RUN (owner instruction 2026-09-09, no local models).

### Finding during AC-226-8: a second, deeper silent truncation (decision required)

The model declined on the release question although `v0.1.10` sits at char 10,463
of the 16,405-char untruncated result. The exact OpenAI request
(`226-ac8-openai-wire-iteration1.json`, decoded from journal artifact
`49a8b76f…`) shows the `function_call_output` is 2,917 bytes: Context V2 tool
output management projected the result with policy `head_tail`
(`preview` = first 1,200 chars of the serialized JSON, of which 966 are page text;
`tail_preview` = last 1,200 chars; `content_chars 17292`; `full_output_ref`;
`projection_policy head_tail`, `projection_version v1` — journal event 19 in
`226-ac8-journal-tool-events.jsonl`). Neither `Get PuPu` nor `v0.1.10` was in the
request. The projection carries no in-band text saying it is a preview or that
`context_content_read` can page the full artifact; `preview_chars` = 1,200 comes
from PuPu `memory_v2_context._TOOL_RESULT_PREVIEW_CHARS`, the policy from
`core.py` `output_policy="head_tail"` on the `web_fetch` registration, and the
manager runs `mode: active` for ordinary PuPu chats (event 14). So in PuPu today a
model sees at most ~2.2k chars of any fetched page regardless of `max_chars`, with
no signal — the same failure class as the ticket, one layer up, and outside the
declared BC-226 (that projection is the versioned `tool_output_management_v1`
contract shared by read/grep/shell/glob/lsp). The tool-layer fix delivered here is
still necessary (it is what the projection previews and what non-managed paths
inline) but cannot make AC "usable signal reachable" true on that path by itself.
Options for the project owner are listed in the ticket comment; no product change
was made to the projection layer.

### Feature audit end-to-end probe (2026-09-19)

Dev app restarted with `UNCHAIN_SOURCE_PATH` = runtime clone at f6fa0c4 (sidecar
verified through the toolkit catalog), `openai:gpt-4.1`, toolkit `core`, one
`web_fetch` with one confirmation. Persisted journal `tool_result`
(`226-audit-e2e-tool-result.jsonl`): `result_bytes 17325`, preview begins with the
repo description, `content_length 16405`, no `featureFlags`. Model answer
(`226-audit-e2e-gpt41.json`): correct description; language and release
explicitly reported as not stated on the page; no fabrication, no unfetched URL.
Probe chat deleted; app restored to its default runtime source.
