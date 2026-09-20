# Issue #227: explicit context window on every built-in Ollama request

Release parent: #203 (v0.1.11). Implemented in the `dev` working tree on top of
`cc2047a9`; left uncommitted for the project owner per repo rules. Companion
runtime: no Unchain change was needed (the `num_ctx` retention from #265,
Unchain 7569395, already covers catalogued models). Python changes require a
sidecar restart.

## What changed

- `get_max_context_window_tokens("ollama", model)` returns
  `min(declared, 32768)` when the catalog declares a window and `32768` when
  it does not (`_ollama_context_window_tokens`). Custom providers and other
  providers are unchanged.
- `_build_payload` sets `options.num_ctx` to that same value on **every**
  built-in Ollama request that names a model. Before this change only
  uncatalogued models got it; `deepseek-r1:14b` (the one catalogued Ollama
  model, declared 128k) inherited the daemon default while the compiler
  budgeted 128k.
- `docs/data-models/model-and-toolkit-catalog.md` § "Ollama context window"
  records the rule, why 32768, and the per-model KV-cache cost at 16k/32k/64k
  computed from each installed model's layer and KV-head counts
  (`/api/show`, no inference).

## Why 32768 and not 16384

- The ticket's own measurement: a real PuPu prompt with toolkits was 15,750
  tokens. The compiler reserves ~10% for output and ~2% for transport, so a
  16k window leaves ~14.4k for input — the first message with tools already
  does not fit.
- Ollama's own default is VRAM-tiered (4k under 24 GiB, 32k for 24–48 GiB,
  256k above) and its docs recommend ≥64k for agent workloads. 32k is the
  smallest of Ollama's own tiers that works for an agent client.
- Cost on the 18 GiB dev machine (f16 KV cache): 8B-class models stay fully
  resident at 32k (4 GiB KV + ~5 GB weights); 14B-class models need 5–6 GiB
  KV + ~9 GB weights and partially offload to CPU — slower, not broken.
- #265 already documented 32768 as PuPu's Ollama default; one constant now
  governs both the compiler budget and the wire.

## Boundary contracts

- **BC-227 — CLOSED, extends BC-265.** Producer `_build_payload` (PuPu Flask
  host) → consumer `OllamaModelIO._merged_payload` (Unchain) → Ollama
  `POST /api/chat`. Wire `options` is exactly the catalog's allowlisted
  defaults plus `num_ctx: int > 0`; Unchain filters unknown keys and retains
  `num_ctx` as a native option even when `allowed_payload_keys` omits it.
  Admission CLOSED (exact key set asserted by a strict HTTP fake). Failure
  semantics: non-positive / non-integer `num_ctx` raises before any HTTP call
  (#265); a prompt that cannot fit fails in the compiler naming model and
  window (AC-269). Identity: the wire value and the compiler budget are the
  same function result. Runtime protocol manifest unchanged
  (`sha256:ab00567f…`, identical to #265's).
- **SEQ-227.** Catalogued model selected → first message → second message →
  toolkit on / off → retry/resume through the prepared payload → sidecar
  restart. The window is a pure function of the catalog entry and the
  constant, so restart cannot change it. Normal, graph and subagent runtime
  construction all resolve the window through `get_max_context_window_tokens`
  (7 direct callers).

| AC | Evidence | Status |
| --- | --- | --- |
| AC-227-1 every built-in Ollama request carries `num_ctx` (uncatalogued, declared 16k, declared 64k–1M; with/without `maxTokens`) | `test_builtin_request_carries_the_compiler_window`, `test_catalogued_window_above_pupu_window_is_capped` | PASS |
| AC-227-2 wire value == compiler budget | same tests, explicit equality assertion | PASS |
| AC-227-3 real producer → strict consumer with the **real packaged catalog**, two compiled turns, tools on/off | `test_real_catalogued_model_wire_carries_window_with_catalog_defaults` | PASS |
| AC-227-4 durable prepared payload keeps `num_ctx`, drops unknown option | `test_durable_prepared_payload_keeps_window_and_drops_unknown_options` | PASS |
| AC-227-5 negative: custom `ollama`-protocol provider untouched; OpenAI/Anthropic/Gemini never get `num_ctx`; invalid windows rejected (#265) | `test_custom_ollama_protocol_provider_keeps_its_own_contract`, `test_other_providers_never_receive_num_ctx`, `test_invalid_ollama_wire_window_is_rejected` | PASS |
| AC-227-6 window written down with rationale and cost | catalog doc section | DONE |
| SEQ-227 live first/second message, toolkit on/off, restart on a real daemon | excluded: the project owner does not run local models on the dev machine | NOT_RUN |
| Packaged application / release wheel qualification | not requested | NOT_RUN |

## Impact analysis

GitNexus CLI (MCP server was down this session), PuPu index at `cc2047a9`:
`get_max_context_window_tokens` MEDIUM (7 direct callers, 11 upstream,
`run_workflow`); `_build_payload` MEDIUM (5 direct callers, `run_agent` and
`run_workflow`); `_catalog_model_context_window` LOW. No HIGH/CRITICAL.
`detect-changes --scope all`: 1 file, 4 symbols, risk low, not partial.
Unchain side was read, not edited; `OllamaModelIO._merged_payload` retained
behaviour verified from source and from the wheel (identical SHA-256 of
`providers/ollama.py` in source and wheel).

## Verification

Evidence directory: `.release-qa/issue-227/` (ignored local artifacts).

- Red before green: `red-before-green.log` — 11 failed / 4 passed with the
  new tests against the pre-change adapter (failures are exactly the capped
  window and the missing `num_ctx`; the 4 passes are the negative guards).
- Development run (Unchain from the sibling source checkout):
  `pupu-dev-tests.log` — **2354 passed, 9 skipped, 3559 subtests passed**
  (108.7 s).
- Fixed-wheel run: `pupu-final-tests.log` — **2354 passed, 9 skipped,
  2 warnings, 3559 subtests passed** (107.8 s), `FIXED_RUNTIME_IMPORT_AUDIT_OK`.
  One warning is the expected `anyio` assert-rewrite notice from preloading;
  the other is a `PytestUnhandledThreadExceptionWarning` attributed to
  `test_unchain_adapter_recipe_graph_runtime.py::RecipeGraphRuntimeTests::test_memory_v2_failure_reason_preserves_only_safe_context_reason`:
  the `unchain-workflow-runner-events` thread called
  `session_execution_guard._release` after the test had already unset
  `UNCHAIN_DATA_DIR` ("UNCHAIN_DATA_DIR is not configured"). It did not occur
  in the development run of the same suite, the test itself passed, and it is
  a teardown ordering race unrelated to the Ollama window; noted here rather
  than hidden.
- Wheel: one build from Unchain `b98e532` (clean tree), reused for the whole
  run. SHA-256
  `d2644f38c3a9cad5b3fa76b150e84ec5c38e462d7646265dca4446621986ca2a`.
  Imported manifest digest
  `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
  `artifact.json` records the wheel, imported path, changed-file hashes and
  the identical `providers/ollama.py` hash in source and wheel.
- Runner note: the #265 evidence runner called `pytest.main()` at module top
  level. Tests that spawn child processes with multiprocessing's `spawn`
  context re-import the main module, so five cross-process tests
  (`test_execution_control`, `test_session_execution_guard`) failed under it
  with "start a new process before the current process has finished its
  bootstrapping phase". `run_fixed_wheel.py` in this directory adds the
  `if __name__ == "__main__"` guard; with it the full suite is green. Reuse
  this copy for future fixed-wheel runs.
- `git diff --check` clean. No JavaScript changed; `npm test` not run.

## Round 2: the user picks the window in the attach panel

The project owner widened the ticket after round 1: PuPu needs a place to
change the window, in the attach panel's model selector. Chosen form: V2
"notched slider" (V3 stepper is the fallback; both share the same props, so
swapping is one component). Mockups: https://claude.ai/code/artifact/f82dac4d-08b9-437c-9dbb-5515e3e99fa9

### What changed

- Sidecar: `get_model_capability_catalog` declares `default_context_window_tokens`
  (32768) for every built-in Ollama model, catalogued or live; other
  providers and custom providers never get it. `options.contextWindow` is
  validated by `_requested_context_window` (integer, 2048–1048576, else
  `InvalidContextWindowError` with code `invalid_context_window`, surfaced by
  `_normalize_stream_error`), scoped to the chat's selected model by
  `_host_context_window`, and folded into `_ollama_context_window_tokens`:
  user value → else PuPu default, then capped by a catalog maximum. All
  seven `get_max_context_window_tokens` call sites pass `options=` so the
  compiler budget and `num_ctx` stay one number for normal, graph and
  subagent construction.
- Renderer: `normalizeModelCapabilities` carries `default_context_window_tokens`;
  `sanitizeModel` keeps `chat.model.contextWindow` (positive integer);
  `SERVICEs/context_window_prefs.js` remembers the pick per model;
  `useChatSessionState` resolves chat record → model memory, restores on model
  switch and writes both effort and window on every `setChatModel` (the record
  is replaced wholesale); `useChatStream` sends `options.contextWindow` only
  when picked and never for character chats; `chat.js` derives
  `defaultContextWindow` / `maxContextWindow` from the active capabilities and
  passes `CONTEXT_WINDOW_PRESETS`; `AttachPanel` renders
  `ContextWindowSliderRow` in the palette footer (stacked under the effort row
  when both exist), with notch buttons, a draggable puck (pointer capture,
  snaps to notches), keyboard stepping (arrows, Home, End), unreachable notches
  above the catalog maximum, and a read-only value well.
- i18n: `chat.attach.context`, `context_default_hint`, `context_beyond_max_hint`
  in all 11 locales.
- The track is the BUILTIN `Slider` in its **glass material** (project owner's
  call: use our own slider, glass). PuPu's port of mini_ui's slider had left
  `Slider` plain-only (only `GradientSlider` was material-aware), so the glass
  branch was ported from `mini_ui/src/BUILTIN_COMPONENTs/input/slider.js`:
  `material` prop resolution, the 10px cap-radius travel inset, the channel
  that rests as a 3px hairline and wakes to a 20px groove, the cap-aligned
  progress (tinted by `style.activeColor` when given), the 28px frosted ring
  thumb with an 8px core, the centre label hidden for glass; snap marks are
  drawn in glass too (3px dots) so the notches stay visible. Plain sliders
  render byte-for-byte as before. The capsule passes the measured width,
  `material="glass"`, `show_tooltip={false}`, and shows the value in a
  read-only well at the capsule's end (glass has no centre label and a
  tooltip would be clipped by the footer). Tests ported from mini_ui's
  "Linear Slider glass material" suite plus marks/label/tint cases.

### Boundary contracts (added)

- **BC-227b — CLOSED, renderer → sidecar request option.** Producer
  `useChatStream` (`options.contextWindow`, integer, only when picked).
  Consumer `_requested_context_window` / `get_max_context_window_tokens` /
  `_build_payload`. Admission CLOSED: wrong type, bool, float, out of range
  or non-scalar fails the message with `invalid_context_window` before any
  provider call; absent means PuPu default. Projection: the same integer
  becomes the compiler window and `options.num_ctx`, capped by the catalog
  maximum; it never applies to a model other than the chat's selected one.
- **BC-227c — OPEN (additive), sidecar → renderer capability catalog.**
  `default_context_window_tokens` is a new optional key on
  `model_capabilities`; the renderer normalizer admits only a positive safe
  integer and hides the picker otherwise. Extension policy: capability keys
  are additive; unknown keys are dropped by the normalizer.
- **BC-227d — persistence.** `chat.model.contextWindow` (chat store, sanitized)
  and `context_window_prefs` v1 (`localStorage`, capped at 200 models; a
  foreign version or corrupted record reads as empty).
- **SEQ-227b.** Pick on chat A → message → second message (same value) →
  switch model (window cleared unless that model remembers one) → switch back
  (restored) → reload (chat record wins; model memory fills fresh chats).
  Covered by the session-hook tests and the end-to-end payload test; live
  first/second message against a daemon: NOT_RUN (owner excludes local-model
  runs on this machine).

| AC | Evidence | Status |
| --- | --- | --- |
| AC-227-7 catalog declares the default window for built-in Ollama only | `test_capability_catalog_declares_a_default_window_for_builtin_ollama_only`; capabilities test updated | PASS |
| AC-227-8 requested window reaches wire and budget together; catalog caps it; only the selected model | `test_requested_window_*`, `test_real_catalogued_model_wire_carries_the_requested_window` | PASS |
| AC-227-9 invalid values fail closed with a coded error | `test_invalid_requested_window_fails_closed`, `test_invalid_requested_window_is_reported_with_its_code` | PASS |
| AC-227-10 renderer normalizer / sanitizer / per-model memory | `api.modelCatalog.test.js`, `chat_storage_sanitize.model.test.js`, `context_window_prefs.test.js` | PASS |
| AC-227-11 session hook: restore on switch, effort and window coexist, unusable value is unset | `use_chat_session_state.test.js` (#227 block) | PASS |
| AC-227-12 slider: renders only with a declared default, notches, readout, dashed default, one-way pick, keyboard, unreachable beyond max, stacks with effort | `attach_panel.test.js` (#227 block) | PASS |
| AC-227-13 request carries `contextWindow` only when picked; hidden for a model without a default | `use_chat_stream.memory_v2_payload.test.js` (#227 tests) | PASS |
| In-app check in the running app (fresh `npm start`, new sidecar) | test-api probe chat on `ollama:deepseek-r1:14b`: palette footer shows the CONTEXT glass row, untouched = `32k`, `data-picked=false`, channel 3px; ArrowRight → `64k`, `data-picked=true`, `context_window_prefs` = 65536; screenshots `glass-untouched.png` / `glass-picked.png` in the session scratchpad; probe chat deleted | PASS |

### Impact analysis (round 2)

Sidecar: `get_model_capability_catalog` UNKNOWN in the graph (callers are
route modules and tests; confirmed by text search and the capabilities test).
Renderer: `sanitizeModel` **CRITICAL** (25 impacted, 2 direct) — the edit is
additive (one optional key kept only when it is a positive integer) and the
full renderer suite passed; `useChatSessionState` LOW; `AttachPanel`,
`useChatStream`, `normalizeModelCapabilities` UNKNOWN (React components and
hooks are not resolvable by the index; covered by their suites).
`detect-changes --scope all` reports critical, but the working tree also
carries the project owner's concurrent `.claude/` cleanup and CLAUDE.md /
AGENTS.md edits, which dominate that listing.

### Verification (round 2)

- Red before green for every unit: sidecar 18 failed / 15 passed; prefs,
  sanitizer and normalizer suites failed on import or assertion; session hook
  and attach panel 10 failed / 42 passed — all before implementation.
- Renderer full suite: **387 suites, 4582 passed, 5 skipped** (`pupu-js-tests.log`).
- Sidecar development run: **2372 passed, 9 skipped, 3559 subtests** (`pupu-dev-tests-2.log`).
- Sidecar fixed-wheel run (same wheel `d2644f38…`, same manifest
  `ab00567f…`): **2372 passed, 9 skipped, 1 warning, 3559 subtests**,
  `FIXED_RUNTIME_IMPORT_AUDIT_OK` (`pupu-final-tests-2.log`). The one warning
  is the expected `anyio` assert-rewrite notice.
- `git diff --check` clean. Sidecar restart required to load the Python change.

### Round 2 addendum (glass, in-app)

- Renderer full suite after the glass port: **387 suites, 4589 passed, 5 skipped** (`pupu-js-tests-3.log`).
- In-app: the owner's running instance was stopped and `npm start` relaunched so the new sidecar exposes `default_context_window_tokens`. Verified through the test API on a probe chat (`ollama:deepseek-r1:14b`, deleted afterwards): untouched → `32k`, no accent, hairline channel; one ArrowRight → `64k`, accent, per-model memory written. A pick of 128k seen earlier on the owner's own chat (`ollama:gemma4:e2b`) was a real drag by the owner while looking at the first build, not a spontaneous write: with `localStorage.setItem` traced, opening the palette twice and switching models wrote nothing.
- Two CRA "Uncaught runtime errors" overlays appeared during probing; both were thrown by my own `/debug/eval` scripts (a two-statement eval, then an unguarded `.focus()` on a missing element), not by the product. Cleared by reload.

### Round 2 addendum 2: fluid width, the model's own top notch (owner feedback)

The owner reported the thumb sitting off the notches and a drag that lagged a
notch behind the pointer. Measured in the running app through the test API:
the capsule handed the Slider a width measured by its own ResizeObserver, and
that hand-off went stale (the Slider drew thumb and marks on a 160px scale
while its rail was 132px wide and hit-tested on 132px). Fix, ported from
mini_ui: the BUILTIN `Slider` now accepts `style.width: "100%"` and measures
its own rail (`offsetWidth` + ResizeObserver, block-level full-width wrapper
so the percentage resolves); numeric widths are byte-for-byte as before. The
capsule no longer measures anything. The glass progress at rest now ends on
the current notch instead of past it.

Also found: `deepseek-r1:14b` declares 128000, 2.4% under the 131072 preset,
so the strict "notches above the maximum are unreachable" rule dropped the
128k notch on the one model PuPu ships a catalog entry for. Rule now: when
the declared maximum sits above the last preset that fits, it becomes the
track's own last notch and the request carries it exactly (128000 → "128k",
40960 → "40k"; a maximum equal to a preset adds nothing). Labels: a
round-thousand value reads in decimal k, everything else rounds on the 1024
grid.

Verification: `slider.test.js` (fluid width, wrapper, rest-fill alignment) and
`attach_panel.test.js` (top-notch rule, labels) red before green; both files
green (68). In-app drag trace on a probe chat (`ollama:deepseek-r1:14b`, rail
147px, 6 notches): pointerdown and every pointermove landed on the exact
notch — 8k, 16k, 32k, 64k, 128k — the memory recorded 128000, then the probe
chat and its memory entry were removed. Screenshots `glass-fluid-pair.png`
(rest vs. dragged) and `glass-final-128k.png` in the session scratchpad.
Renderer full suite: see `pupu-js-tests-5.log`.

### Round 2 addendum 3: drag feel and the clipped thumb (owner feedback)

Measured in the running app before the change: the pressed glass thumb was
39px tall (28 × 1.35) inside a 36px palette-footer clip (7px padding + the
28px capsule), so its bottom 5px were cut; and every notch crossing cost a
chat-store write, a memory write and a full chat-page re-render before the
thumb moved (≈34 ms per crossing, nothing between crossings).

- **Local-first drag.** `ContextWindowSliderRow` keeps the live notch in its
  own state while the pointer is down (thumb, accent and value well follow
  the hand at once) and commits exactly once on release (`pointerup`,
  `mouseup`, `touchend`, `pointercancel`, `blur`); keyboard steps commit
  immediately; unmount mid-drag commits nothing. Committing reads the latest
  render's track and selection through a ref.
- **Scalable glass geometry (BUILTIN `Slider`).** `style.channelHeight`
  (default 20), `style.thumbSize` (glass ring, default channel + 8) and
  `style.pressScale` (default 1.18 for glass — mini_ui's value, which the
  port had at 1.35 — 1.35 for plain) scale the channel, the cap-radius
  travel inset, the progress (0.4 × channel) and the ring together. The
  capsule uses 16 / 24 / 1.15, so the pressed ring is 27.6px inside the
  28px capsule.

Measured after: pressed thumb 28.2px, bottom edge exactly on the clip's
bottom edge (no clipping); zero memory writes during the press; thumb moves
3–5 ms after each pointermove; one write on release with the final notch.
Tests: `slider.test.js` glass geometry / press scale, `attach_panel.test.js`
local-first drag (red before green; 72 passing across the two files).
Renderer full suite: `pupu-js-tests-6.log`.

### Round 2 addendum 4: effort becomes the same slider; the first notch (owner feedback)

- **First notch missing.** The port kept plain's rule "do not draw the mark
  under the current value" for glass too. Plain hides it because its value
  label sits there; glass has no label at rest and hides its thumb, so the
  current notch simply vanished — the first one whenever the window was 4k,
  the 32k one on an untouched track. Glass now draws every notch (test:
  6 marks for 6 notches at the minimum; plain still 5). Verified in-app: at
  4k all six dots show.
- **Effort is a slider now.** The effort row and the context row are one
  component, `NotchSliderRow` (label well · glass Slider over an ordered list
  of notches · value well), with two thin wrappers: `EffortSliderRow` (levels
  from the capability declaration, short labels, rests on the model's
  default) and `ContextWindowSliderRow` (presets cut at the declared maximum,
  rests on PuPu's default). Both share the local-first drag, one-way
  commits, untouched = no accent + default tooltip, and — so their tracks
  line up when stacked — one floor width for the label wells and one for the
  value wells. The old `EffortCapsuleRow` (labelled cells, ladder fill,
  dashed default) is gone; its tests were rewritten to the slider contract
  and kept for the two palette-behaviour cases. Verified in-app on
  `openai:gpt-5.4`: EFFORT row, four notches, remembered "low", per-model
  effort memory untouched.

Tests: `slider.test.js` 28, `attach_panel.test.js` 47 (red before green);
renderer full suite `pupu-js-tests-7.log`. Screenshot `rows-pair.png` in
the session scratchpad.

### Round 2 addendum 5: the resting channel is as long as the longest progress (owner feedback)

At rest the glass channel ran edge to edge while the progress could only reach
the last notch (one cap radius short of the edge), so a full progress showed
a grey stub past "max". Now, at rest, the channel runs from the first notch
to the last (`left: pad, width: travel`) and the progress from the first
notch to the value's notch, so a full progress and the channel coincide;
awake, the channel still grows to the full-width groove (left/width morph on
the same curve as height/radius). Measured in-app at 128k: channel and
progress both `[491.5, 132]`, first mark 490, last mark 622. Tests:
`slider.test.js` rest/wake geometry and full-progress cases (red before
green; 29 + 47 passing). Renderer full suite `pupu-js-tests-8.log`.
