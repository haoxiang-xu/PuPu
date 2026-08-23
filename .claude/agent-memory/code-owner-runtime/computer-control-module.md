---
name: computer-control-module
description: computer_control ("hand") sidecar module for PuPu computer-use — C1 (driver) + C2 (ComputerToolkit + adapter mount + redaction) + C3 (permissions panel) + C4 (media store + /chat/tool-media + /computer-use/status) + F1 (injection-action confirmation gate, SEC-001 P0) DONE; frozen action vocab, DPR handling, coordinate invariant, feature flag, media TTL/auth posture, unchain confirmation_resolver capability boundary
metadata:
  type: project
---

# computer_control — GUI "hand" sidecar (computer-use feature)

New pure library module `unchain_runtime/server/computer_control/` (screen capture
+ keyboard/mouse injection + coordinate mapping). Architecture by pupu-architect,
CEO-approved. Sliced C1/C2/C3.

**Why:** PuPu computer-use feature needs a GUI-control "hand". Architect sliced it
so the pure driver (C1) lands independent of agent wiring — keeps blast radius zero
until it is deliberately consumed.

**How to apply:** When touching computer-use backend, respect the slice boundary and
the frozen contracts below. Do NOT wire this into unchain_adapter as part of C1.

## Slice status (2026-07-13)
- **C1 (DONE, me):** pure module + 91 unit tests. Branch `feat/computer-control` off
  `dev`, committed 5d0a1ba (not pushed), isolated worktree. Zero import of `unchain` core or
  `unchain_adapter`.
- **C2 (DONE, me — 2026-07-13):** `ComputerToolkit` wired + adapter mount + redaction + llm-expert
  review fixes. Committed **778e805** on `feat/computer-control` (parent C1 5d0a1ba), not pushed.
  36 tests, **539 server-suite pass / 2 skip / 0 regression**. Depends on unchain S0/S1 (now
  **merged to unchain dev @52854bd**; scratch worktree `feat/rich-tool-result` still valid).
  **CEO standing exception (2026-07-13):** on isolated-worktree feature branches, dev agents
  SHOULD self-commit regular slice commits (never push); main-tree "never commit" ironclad unchanged.
- **C3 (frontend half, another dispatch):** permission UX. Backend contract already
  shipped by C4 as `GET /computer-use/status` (see below). Security-sensitive (TCC/OS
  grants) → pupu-security-expert sign-off on the UX/permission-guidance flow.
- **C4 (DONE, me — 2026-07-13):** media channel + status endpoint. Committed **283d520**
  on `feat/computer-control` (parent C2 778e805), not pushed. +15 tests, **554 server-suite
  pass / 2 skip / 0 regression** (baseline was 539).

## F1 confirmation gate (2026-07-13, me) — SEC-001 P0 CRITICAL, DONE
- **Committed d664c7a** on `feat/computer-control` (parent e236966), not pushed. +13 tests,
  **567 server-suite pass / 2 skip / 0 regression** (baseline 554). PuPu-side only — NO unchain
  core change (no double-sign needed).
- **Bug 守 found:** `ComputerToolkit` built its `computer` tool via `Tool.from_callable` WITHOUT
  `requires_confirmation` → unchain default False → every left_click/type/key/scroll/drag injected
  to real desktop with zero user gate.
- **unchain confirmation mechanism — CAPABILITY BOUNDARY (key reusable finding):** unchain DOES
  support per-call, argument-aware, action-level confirmation. `Tool` has a `confirmation_resolver:
  (arguments, execution_context) -> ToolConfirmationPolicy|bool|dict|None`. Runtime logic
  (`tools/confirmation.py:execute_confirmable_tool_call`): base `requires_confirmation = bool(tool.requires_confirmation)`;
  if resolver ran, `requires_confirmation = base AND policy.requires_confirmation` — **policy can only
  NARROW, never widen False→True**. So the ONLY correct pattern is **base=True + resolver narrows to
  False for exempt calls**. Fail-closed props: resolver returning None → `from_raw(None)` = confirm;
  resolver raising → call aborts (never dispatches); no confirm callback → `callable(None)` False → no prompt.
- **Path chosen = B (action-level, cleanest), zero unchain change.** `_resolve_confirmation` in
  toolkit.py: read-only ALLOWLIST `{screenshot, wait, cursor_position}` → `{requires_confirmation:False}`;
  everything else (all injection + unknown/future actions) → `{requires_confirmation:True, description:<summary>}`.
  Allowlist (not blocklist) = fail-closed: unknown action confirms. `requires_confirmation=True` +
  `confirmation_resolver=self._resolve_confirmation` on the `Tool.from_callable`.
- **Confirmation payload user sees:** `description` (human summary: e.g. "Model wants to left click at
  (123,456)." / "Model wants to type: 'hunter2'" — coords in screenshot pixel space, text truncated
  80ch) + raw `arguments` (action/coordinate/text) both flow through `ToolConfirmationRequest.to_dict`
  → `_build_tool_confirmation_request_payload` → SSE frame.
- **Action classification table (待 llm-expert + 守 复核 — model-visible/security-policy):** CONFIRM =
  left_click/right_click/middle_click/double_click/triple_click/type/key/scroll/left_click_drag/**move
  (mouse_move)**/any unknown. EXEMPT = screenshot/wait/cursor_position. **`move` is the debatable one**
  (moves physical cursor, no click/type) — defaulted to CONFIRM (not on exempt allowlist); llm-expert
  may want it exempt for UX. Backend implemented the fail-closed default.
- **智 review (2026-07-14): action classification PASSED** (move→CONFIRM correct, allowlist fail-closed
  direction right, no misclassification). One must-fix DONE (commit **75711bf**, parent d664c7a): the
  `type` summary truncated preview at 80ch but injected the FULL string → elided tail unconfirmed
  (informed-consent gap). Now annotates `'AAAA…' (+N more chars)`. 智 also ruled: typed-text in the
  confirm summary stays **plaintext** (user must see what's typed; no auto-masking — "让用户看到" is the
  security good), but the summary **must not persist** into history/trace/logs.
- **F3 (SEC-001 P2, 守 MEDIUM) — screenshot base64 off-disk, DONE (commit b9e8d51, 2026-07-14):**
  SSE/SQLite redaction only touches the emit deepcopy; PuPu's `JsonFileSessionStore` (memory_factory)
  persisted the FULL transcript (`state["messages"]` + nested `state["execution_checkpoint"]`
  transcript/replay_frame/pending_model_context) as plaintext JSON on every snapshot/checkpoint
  suspend/complete/commit → screenshot base64 lived on disk forever, past tool_media 30min TTL.
  **Fix = PuPu-side sanitizing store subclass (NO unchain core change), new module
  `session_transcript_media.py`:** `build_sanitizing_session_store` overrides `save`/`save_if_revision`/
  `save_if_revision_and_fence` (strip before write) + `load_with_revision` (rehydrate after read). Strip =
  deep-walk state, flat `{type:image,data_b64}` blocks → stash to C4 `tool_media_store` → replace with
  marker `{type:image, data_omitted:true, byte_len, media_id, media_type, w, h}`. Load = `resolve_media`
  within TTL → restore data_b64; expired → replace block with `{type:text, text:"[screenshot WxH omitted
  ...no longer available]"}` (coherent, never a broken zero-data image). **Single choke:** ALL persistence
  funnels through the store; routed all 4 `JsonFileSessionStore(...)` sites in memory_factory through new
  `_build_session_store(data_dir)`. Strip operates on a deepcopy (caller's live transcript keeps base64 for
  in-run replay); each save re-stashes fresh (bounded dup, TTL-swept — correctness over dedup). **No replay
  conflict** (round-trip fully inside the wrapper; unchain always sees a valid transcript). Frontend history
  unaffected (separate SQLite from SSE). Scope = flat screenshot shape; user-attached canonical
  `{type:image,source:{...}}` images out of scope.
- **F2 half① (SEC-001 P1, screenshot prompt-injection) — DONE (commit 204e1af, 2026-07-14):** soft
  defense-in-depth supplementing (NOT replacing) F1. Injects `_COMPUTER_USE_SECURITY_PROMPT`
  (llm-expert final wording, verbatim `<computer_use_security>` block framing on-screen text as
  UNTRUSTED DATA) into the system prompt of any computer-mounted session. **Injection point (智 contract):**
  inside `_build_developer_agent`, AFTER recipe/modular assembly + `{{SUBAGENT_LIST}}` replace, BEFORE
  `UnchainAgent(...)`, appended via `_compose_runtime_instructions` iff `_toolkits_include_computer(toolkits)`.
  **Detection = runtime metadata `toolkit_id == "builtin.computer"`** (`_COMPUTER_TOOLKIT_ID =
  _BUILTIN_TOOLKIT_PREFIX+"computer"`) — NOT a top-level ComputerToolkit import (lazy). Gating purely on the
  mounted toolkit list means **flag-off / model-unsupported / F9-subagent inject nothing structurally**
  (tool absent from list) — no flag re-check; recipe path auto-covered (append after branch merge); lands
  OUTSIDE user-editable system_prompt_v2 (user can't delete). Deliberately omits any mention of the F1 gate
  (智: avoid model relaxing on "something else will catch it"). 2 callers of `_build_developer_agent`
  (main + recipe step) both covered; non-computer sessions byte-identical. GitNexus MCP not wired in
  worktree → call-graph verified via grep. Note: 智's QA item = 8-12 synthetic-injection-screenshot A/B
  eval (compliance rate warning-on/off) is QA-phase, not my scope.
- **3-channel sensitive-transcript map (守/智), F3 = channel ①; ②③ ASSESSED not fixed:**
  - **② durable_interaction_recovery (frontend):** captures confirmation `description`+`arguments` → injects
    durable msg into FRONTEND persisted `messages`. **F3 does NOT cover it** — different store (frontend
    SQLite, not server session store) + different data (confirm summary TEXT/typed text, not base64).
    Current server emits NO durable receipt (no interaction_id/receipt code) → not triggered today. When
    `codex/durable-interaction-receipts` lands, needs its OWN gating (mark computer-confirm receipts
    non-durable OR redact description/arguments pre-persist). Frontend + durable-receipts owner, not me.
  - **③ typed text via tool_call arguments:** the password the model types is in the assistant turn's
    tool_call `{action:type, text:...}` = model's first-class OUTPUT, persisted in BOTH server session store
    AND frontend history. **Technically feasible** to mask `text` at persist (structurally safe, won't 400,
    id-based tool_use/result pairing intact) BUT it is NOT a clean F3-style strip: (a) irreversible OR just
    relocates the secret to another store, (b) model-visible on replay → 智 veto territory, (c) risks
    replay/continuity (model loses what it typed), (d) also in frontend so server masking alone insufficient.
    **Recommend NOT implementing now — needs product/security decision.** Options: secret-vault+token
    rehydrate (F3 pattern, more invasive); **encrypt session store at rest (holistic — subsumes F3+③, but
    CTO/security key-mgmt call)**; accept+rely on OS disk encryption; computer-tool "secure type" protocol.
- **Confirmation-frame persistence — BACKEND-LAYER CONCLUSION (verified 2026-07-14):** the confirm
  path (`_make_tool_confirm_callback.on_tool_confirm`, adapter ~594) is purely transient: builds
  `request_payload` → in-memory `_pending_confirmations[cid]=waiter` → `emit_event(payload)` (ephemeral
  SSE frame) → block on threading.Event → pop on resolve. **NO server-side transcript/SQLite write, NO
  logging of description/arguments.** Server history is frontend-side (per arch). Grep confirmed: no
  `interaction_id`/`durable`/`receipt`/`presentation` code in `unchain_runtime/server/*.py`. So through
  MY layer the summary does NOT persist. **Residual risk (out of my scope, flag to QA + frontend/durable
  owner):** frontend `src/PAGEs/chat/hooks/durable_interaction_recovery.js` (+ in-flight unchain branch
  `codex/durable-interaction-receipts`) captures `description`+`arguments` and injects a durable message
  into the persisted `messages` array — NOT wired into current server, but if durable receipts land for
  tool confirmations the typed text WOULD persist → must be gated (mark computer confirmations
  non-durable OR redact description). Also inherent: the typed text is ALSO in the model's tool_call
  arguments (normal transcript) regardless of the summary — ephemeral summary ≠ "password never persisted".
- **F9 (was the flagged subagent-bypass) — 守裁 HIGH, DONE (commit 504bb96, 2026-07-14):** recipe-subagent
  runs set `confirm_cb=None` at `unchain_adapter.py:~5099` (`if options.get("_recipe_subagent_run")`);
  unchain gate `requires_confirmation and callable(on_tool_confirm)` → None callback skips confirmation
  entirely → F1 gate bypassed on subagent path. 守 adopted **option ② = tool-absent** (守+智 both required
  tool NOT in the subagent tool set, over mount-then-deny — deny path would be a new behavior surface +
  model retries). Impl: `_build_selected_toolkits` reads `options["_recipe_subagent_run"]` (the **single
  funnel** all toolkit-build paths route through: direct calls AND `_build_toolkits_by_ids →
  _build_selected_toolkits(synth)`, both inherit options; recipe-graph step toolkits go via
  `_build_requested_toolkits`/`_resolve_graph_agent_toolkits → _resolve_recipe_toolkits(options)`) → passes
  `is_subagent_run` to `_build_builtin_toolkit`, which returns None for `computer`. **Mount now = flag on
  AND model-capable AND not subagent** (3 conditions). Only the computer tool; same-class hole for OTHER
  confirmable tools in subagent runs = 守's separate unchain double-sign slice ① (NOT my scope).

## C4 wiring facts (2026-07-13, me)
- **`tool_media_store.py`** (NEW, no unchain/adapter import — pure, testable): per-session
  temp store. Root = `<UNCHAIN_DATA_DIR>/tool_media/<safe_session>/` (falls back to
  `<tempdir>/pupu_tool_media` when data dir unset, e.g. tests). Filename = `<media_id>.<ext>`,
  `media_id` = `uuid4().hex` (32 lowercase hex, strict `^[0-9a-f]{32}$` regex = path-traversal
  guard). `store_media(session_id, data_b64, media_type)→media_id`; `resolve_media(media_id,
  session_id=None)→(bytes, media_type)`; `sweep_session(session_id)`.
- **TTL** = `PUPU_TOOL_MEDIA_TTL_SECONDS` env, default 1800s (30min). **No background thread**
  (deliberate — no reaper in Flask sidecar). Enforced at TWO moments: write-time sweep of the
  writing session's dir, AND read-time (`resolve_media` treats a file older than TTL as expired
  → deletes + returns None). Tradeoff accepted: an idle session's last screenshot lingers until
  next write to that session or next read of that file — bounded small PNGs in a temp dir.
- **Redaction choke now stashes-then-strips:** `_stash_tool_result_media(result, session_id)`
  runs INSIDE `_redact_tool_result_images` BEFORE `_redact_result_image_data` (needs the base64).
  Iterates `iter_result_image_blocks` (unchain host hook), stores each block's `data_b64`, stamps
  `block["media_id"]`. **Fail-closed unchanged:** the strip is still unconditional & best-effort
  storage never gates it → SSE/SQLite red line held (hard-assertion tests still green). `session_id`
  threaded: `_enrich_tool_event_with_toolkit_metadata(event, meta, session_id="")` → both call
  sites updated (on_event in stream_chat_events; step_emit in `_stream_recipe_graph_events`).
- **Marker shape (frontend contract):** `{type:"image", media_type, width, height,
  data_omitted:true, byte_len:N, media_id:"<32hex>"}`. base64 (`data_b64`) never present.
- **Two endpoints (`route_computer_use.py`, registered in routes.py; loopback + `_is_authorized`
  token gate like all `/chat/*`):**
  - `GET /chat/tool-media/<media_id>[?session_id=...]` → `image/png` bytes, `Cache-Control:
    no-store`. Optional `session_id` scopes lookup to one session dir (stronger binding); absent
    → globs all sessions. 404 `media_not_found` for missing/expired/malformed. **v1 auth posture
    (FLAG to pupu-security-expert):** no per-session bearer token exists in current auth model;
    `media_id` uuid4 (122 bits) is the unguessable capability token. Confirm acceptable.
  - `GET /computer-use/status` → `{enabled: <PUPU_COMPUTER_USE flag>, capabilities:
    get_capabilities()}` (full C1 struct: platform/display_server/screenshot/injection/
    permissions/degradation_reason/action_set/caveats). **No probe param needed** — C1's macOS
    probes are preflight (`CGPreflightScreenCaptureAccess`/`AXIsProcessTrusted`), never capture
    or prompt, and `get_capabilities` takes no screenshot → already cheap/lazy. This is the C3
    frontend permission-guidance contract.

## C2 wiring facts (2026-07-13, me)
- **ComputerToolkit** = `unchain_runtime/server/computer_control/toolkit.py`. The ONLY file
  in `computer_control` that imports `unchain` (keep it out of `__init__.py` to preserve
  C1's unchain-free purity + tests). Single tool `computer`, `provider_native_specs["anthropic"]
  = {type: computer_20251124, name: computer, display_width_px/height_px}`, `required_betas
  ["anthropic"] = ["computer-use-2025-11-24"]` (architect-frozen literals).
- **Coordinate invariant (proven on real hw):** declared display W/H == returned screenshot
  model W/H. Achieved WITHOUT a construction-time grab: no-grab geometry probe (mss `.monitors`
  enumeration, no TCC) gives primary-display logical size; `budget = min(long_edge, DEFAULT_MAX_LONG_EDGE=1568)`;
  declared = `compute_target_size(probe, budget)`; screenshots captured with `max_long_edge=budget`.
  Since DPR≥1 ⇒ physical_long≥probe_long≥budget, both declared & screenshot long-edge collapse to
  budget w/ identical aspect ⇒ exact match. Verified real: this Mac declared==returned==PNG==(1568,656).
- **Anthropic action vocab ≠ C1 ACTIONS** — native `computer_20251124` makes the model emit
  Anthropic names (`mouse_move`, `screenshot`, `wait`, `hold_key`, ...); toolkit's `_normalize_action`
  translates (alias `mouse_move`→`move`; `screenshot`/`wait` special; unresolved → structured
  `unsupported_action`, not raise). **FLAG to pupu-llm-expert:** exact action-name mapping is
  model-visible / provider-contract; layer is tolerant of both names, but authority is llm-expert's.
- **Feature flag** = env `PUPU_COMPUTER_USE` (truthy in {1,true,yes,on,enabled}); follows PuPu
  `PUPU_*` precedent (cf. `PUPU_MCP_REGISTRY_PATH`). Off ⇒ `builtin.` branch skips + ComputerToolkit
  never in any catalog (lives outside `unchain.toolkits.builtin` walk) ⇒ zero exposure.
- **Adapter mount** = `_build_selected_toolkits`: new `builtin.` prefix branch BEFORE `mcp.` (calls
  `_build_builtin_toolkit`, lazy-imports ComputerToolkit). Adapter diff purely additive (+82/-0) ⇒
  existing mcp./generic branches untouched (CRITICAL red line held; source-diff authoritative).
- **Redaction choke (fail-closed, gate #6)** = `_redact_tool_result_images` called at the TOP of
  `_enrich_tool_event_with_toolkit_metadata` (BEFORE its early returns), which is the shared choke for
  BOTH emit paths (`on_event` main + `step_emit` subagent). Uses unchain `redact_result_image_data`
  (strips `data_b64`→`data_omitted`+`byte_len`). Model transcript untouched (event holds a deepcopy);
  raw base64 stays in-memory only and is discarded post-run — no server-side persistence; PuPu SQLite
  history is frontend-side from redacted SSE frames. `_build_bundle_from_result` = counters only, no image.
- **Model gating (llm-expert-owned):** native spec only declared for an **Anthropic** session on a
  computer_20251124-capable model — prefix list (llm-expert authored) `claude-sonnet-5 / opus-4-8 /
  4-7 / 4-6 / sonnet-4-6 / opus-4-5` (prefix match tolerates date/@ suffix). Older Anthropic (Sonnet 4.5,
  Haiku 4.5, Opus 4.1) need the OLD tool type + `computer-use-2025-01-24` beta → would 400 on ours →
  **tool not mounted + logged** (generic-schema fallback is untested M3, deliberately not opened).
  Gate lives at adapter `_build_builtin_toolkit` (knows session model via `get_runtime_config(options)`),
  NOT in the toolkit/unchain. `_model_supports_computer_use(provider, model)`.
- **llm-expert review (2026-07-13, all applied in 778e805):** `wait` really `time.sleep(min(duration or 1, 5))`
  (no-op was a model-visible lie); screenshot `content_blocks` = **text-first, image-second** (DP2 +
  Anthropic guidance); `always_load=True` on the tool (exposure optimizer must not defer the "hand";
  turn-varying tool set busts prompt cache); `unsupported_action` msg lists supported actions;
  docstring drops `cursor_position` (20250124 legacy, not in 20251124). Left-as-M3-gap:
  `left_mouse_down/up`/`hold_key` → unsupported_action (acceptable).
- **Test env (reusable):** `UNCHAIN_SOURCE_PATH=<rich-tool-result wt> PYTHONPATH=<wt>/src:<c2-deps>
  <PuPu/.venv-unchain-build>/bin/python -m pytest tests/`. `.venv-unchain-build` has flask+unchain+all
  server deps but NOT mss/PIL/pynput/pytest → installed those 4 via `pip install --target=<scratch>/c2-deps`
  (non-destructive, reuses the venv's heavy deps). Suite is mixed unittest+pytest, needs real PIL.

## F6 pynput LGPL notices compliance (2026-07-14, me) — 守 LOW, DONE (commit 4bb49fd)
- C1 sidecar deps: mss (MIT/ISC), Pillow (HPND) permissive; **pynput 1.8.1 = LGPL-3.0** (requirements.txt
  `unchain_runtime/server/requirements.txt`, dynamic import only). Sidecar frozen via PyInstaller
  `--onefile` (opaque) → LGPL §4/§6 replaceability/source-availability needs a written offer.
- **Notices pipeline = `scripts/generate-third-party-notices.cjs`** (npm `notices` / `notices:check`,
  runs in every `build:electron*`). **DOES cover Python sidecar deps** (not just npm): `collectPython`
  runs `pip-licenses --with-license-file` over the build venv (`.venv-unchain-build` / `UNCHAIN_BUILD_VENV`),
  writes `THIRD_PARTY_NOTICES.txt` (build artifact, NOT git-committed). First-party `unchain` + build tools
  (`PY_IGNORE`) excluded. **Verified pynput text IS captured:** pip-licenses 5.5.5 yields License "GNU Lesser
  General Public License v3 (LGPLv3)" + **7636-char** LGPL-3.0 body (from dist-info `COPYING.LGPL`, declared
  `License-File`). Gap was NOT the text — it was zero copyleft/written-offer handling.
- **Fix (minimal norm added):** `COPYLEFT_LICENSE_RE=/gpl|mpl|epl|cddl|eupl/i` + `COPYLEFT_SOURCE_OFFERS`
  map (pynput→github.com/moses-palmer/pynput). `resolveSourceOffer` attaches a written offer (upstream
  source + version + obtain/modify/replace/relink rights, §4/§6) rendered ABOVE the license text; a copyleft
  dep with NO registered source **fails `--check`** (future copyleft can't ship silently). `main()` guarded
  behind `require.main`; helpers exported + unit-tested (`generate-third-party-notices.test.mjs`, npm
  `test:notices`, +5). **Nuance:** pynput ships only the LGPL-3.0 addendum (incorporates GPL-3.0 by
  reference), not the GPL-3.0 base text; offer points upstream for complete terms — standard practice,
  acceptable for LOW. **No escalation needed** (pipeline covers Python; onefile packaging untouched per
  守 instruction). Build-time tooling only — no sidecar restart.

## Frozen contracts (single-direction doors — do not renegotiate in backend)
- **Action vocabulary** = Anthropic `computer_20251124` subset, architect-frozen in
  `actions.ACTIONS`: move / left_click / right_click / middle_click / double_click /
  triple_click / left_click_drag / type / key / scroll / cursor_position. Renaming or
  reinterpreting = model-visible change → llm-expert veto, not a backend edit.
- **Coordinate spaces:** model coords (what the model sees in the screenshot) are the
  public input; `ScaleMap` maps physical↔model↔logical. macOS CGEvent injects in
  **logical** coords (= physical / DPR); Windows/X11 inject in **physical**. Backend
  picks the space; base layer converts.
- **DPR handling:** measured, not assumed — `detect_device_pixel_ratio` = grab_width /
  mss monitor_width. Verified on real 14" MBP Retina: physical 3024x1964, monitor 1512
  wide → DPR 2.0. Default screenshot long-edge budget 1568 (tunable to 2576 for newer
  models).
- **Windows UIPI:** injection into higher-integrity windows fails silently and is
  undetectable post-hoc → surfaced as structured caveat `uipi_may_block` in capabilities
  and in every action result envelope on Windows.
- **Wayland:** screenshot=False, injection=False, degradation_reason points to phase-2
  portal plan. X11 = fully open.

## C2 consumption entry points (public API)
`ComputerController().capabilities()/screenshot()/act(action, coordinate=, text=,
scroll_direction=, scroll_amount=, scale_map=)`; or `capture_screenshot()` +
`build_backend(caps)` + `backend.dispatch(...)`. Deps added to sidecar
`requirements.txt`: mss, pynput (LGPL-3.0, dynamic import only), Pillow. `.py` changes
here need **sidecar restart** to take effect once wired.
