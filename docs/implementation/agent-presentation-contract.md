# Agent presentation (icon; legacy colour) — cross-boundary contract

Status: **INCOMPLETE** — code and tests are green in both repositories, but the
running sidecar has not been restarted onto the changed runtime, and the cold
restart / live app cells below are `NOT_RUN`.

Gate: `.claude/rules/cross-boundary-contract-gate.md`.

**Frontend is icon-only (2026-11-12).** The stored shape below is unchanged
and `color` stays a valid runtime field, but PuPu no longer offers, writes or
draws a colour: the picker has icons only; every PuPu write is `{ icon }` or
removes the key (choosing the default `bot` icon removes it), so saving drops
a colour an older build stored; readers still accept `color` so such
documents load, and every surface draws in the fixed default colours. Node
identity is independent of resource presentation: an Agent **node** (canvas
tile, detail header, NodeTag chips, add-node menu, finder) always wears the
fixed Agent node identity; only Agent **resource** surfaces (Agents explorer
rows, Subagent Pool rows and library rows) show the chosen icon, and the
Explorer's "Change icon…" is the only place it is changed. No runtime,
sidecar or capture change. Details: `agent-icons.md`.

## Shape (the one rule every boundary below enforces)

`presentation` is an optional top-level key of the version-one Skeleton
document, next to `description`:

```
presentation: absent
            | { "icon"?: str  /^[a-z0-9_]{1,40}$/   (full match, ASCII only)
              , "color"?: str /^#[0-9a-f]{6}$/      (full match, lowercase only) }
```

Decisions:

- **CLOSED.** Any other key inside `presentation` is `unknown_field` at
  `document.presentation.<key>`. The root envelope is not reopened: any other
  new top-level key is still `unknown_field`.
- **Uppercase hex is rejected, not normalised** (`invalid_value`). The writer
  only ever produces lowercase; the runtime never rewrites a stored value.
- **Empty object `{}` is admitted and means "default".** The PuPu writer never
  produces it: `null`/`{}` from the UI is written as an *absent* key, so there
  is one stored representation of the default.
- `null`, string, number, array → `invalid_type` at `document.presentation`;
  a non-string `icon`/`color` → `invalid_type` at `document.presentation.<field>`;
  a string not matching its pattern → `invalid_value` at the same path.
- The runtime knows no icon catalogue. PuPu owns it; an unknown icon id is a
  valid value that PuPu's reader falls back from (`agent_resource_icons.js`).
- **Colour is a stored field PuPu no longer uses; the backend stays
  format-only.** `writeResourcePresentation` writes `{ icon }` only: a
  well-formed `color` handed to it is admitted and not written, a malformed
  one (or any other key) is refused locally (`invalid_presentation`, nothing
  sent). On read, a stored colour (any `#rrggbb`) is kept by the reader and
  never drawn; stored data is never rewritten on read. The palette
  (`AGENT_PRESET_COLORS`) is removed. The recorded producer capture still
  carries `{ icon, color: "#1a2b3c" }` (admitted by the runtime); the consumer
  test hands the writer that same value and asserts the payload equals the
  recorded request with only `presentation` swapped to `{ icon }`.
- **Display-only.** `prepare_workflow` / `prepare_agent_graph` drop the
  top-level `presentation` from the execution snapshot, so it never reaches a
  plan, a definition digest, a run observation, a compiler, a prompt or a
  provider wire. Changing an icon therefore does not create a new Workflow
  revision, does not change `definition_digest` of parked runs, and does not
  trigger a subagent `dependency_conflict`.

## Runtime identity and version binding

- Runtime protocol manifest: `skeleton_execution` **1.8 → 1.9**, new feature
  **`document_presentation_v1`** (precedent: node labels were `1.8` +
  `node_display_label_v1`). PuPu's baseline admission
  (`skeleton_runtime_capability._REQUIRED_FEATURES`, `minor >= 7`) is
  unchanged and still admits 1.9; retained-launch admission (`actual minor >=
  retained minor`) also still holds.
- The writer (`src/SERVICEs/agent_resource_presentation_store.js`) reads the
  actual imported runtime's manifest via `getManagedCodeCapabilities()` and
  refuses with `presentation_unsupported` unless `skeleton_execution` is major
  1, minor ≥ 9 and advertises `document_presentation_v1`. No Git ref, path or
  environment variable participates.
- **Old reader** (any unchain without this change, e.g. the current
  `unchain-dev-preview` checkout or wheel 0.2.0): `validate_skeleton_document`
  raises `SkeletonValidationError("unknown_field", ("document",
  "presentation"))`. Every save/import/preparation of a document that carries
  the key is refused (HTTP 400 on save); nothing is stored. Documents without
  the key are byte-for-byte unaffected. Evidence: running the new sidecar
  tests against `UNCHAIN_SOURCE_PATH=…/unchain-dev-preview` fails with
  `SkeletonResourceError: unknown field` (see Evidence).
- Artifact identity: there is no wheel in this loop. The sidecar imports
  unchain **source** through `UNCHAIN_SOURCE_PATH`. The change lives in
  `/Users/red/Desktop/GITRepo/unchain-dev` (base `2e45562`, uncommitted;
  `schema.py` sha256 `62cc83aa…ffb94`). **The running sidecar was observed
  with `UNCHAIN_SOURCE_PATH=/Users/red/Desktop/GITRepo/unchain-dev-preview`**
  (a separate clean clone at the same `2e45562`), so it does not see this
  change until it is pointed at `unchain-dev` (or the same patch lands in the
  preview clone) and restarted.

## BC-AP-001 — renderer document → Electron IPC → sidecar HTTP save

- Producer: `writeResourcePresentation(resourceId, presentation)`
  (`src/SERVICEs/agent_resource_presentation_store.js`).
- Path: the same v2 aggregate the editor and the explorer's
  rename/duplicate (`rewrite_resource`) use — `load_resource` →
  `save_draft` (`recipes_page/skeleton_resources.js`) →
  `api.unchain.getManagedSkeletonResource` / `saveManagedSkeletonResource` →
  Electron `managed_code_transport` → `POST /skeleton_resources/v2`.
- Wire shape (CLOSED, unchanged): `{schema: "pupu.skeleton-edit.v2",
  document, expected_edit_token, managed_sources}`; `document` = the loaded
  document with only `presentation` set (or removed for `null`), every other
  key and the Code text unchanged; `expected_edit_token` = the loaded token
  (compare-and-set).
- Failure: never throws; `{ok:false, code}` with `invalid_presentation`
  (local shape check), `presentation_unsupported` (manifest),
  `presentation_capability_unavailable`, the store's code (`edit_conflict`,
  `invalid_value`, `resource_missing`, …). Managed-Code resources (Default
  included) are written successfully on this path — there is no
  `source_api_required` case.
- Library refresh: `save_draft` emits `resource_saved` on success.
- ACs: AC-AP-01 … AC-AP-06.

## BC-AP-002 — sidecar → unchain `validate_skeleton_document` (CLOSED)

- Producer: any document reaching `SkeletonResourceStore.save_draft`,
  `save_managed_draft`, `import_resource`, managed import, or preparation.
- Consumer: `unchain.skeleton.schema.validate_skeleton_document`
  (`_validate_presentation`), which returns a detached clone preserving the
  object exactly.
- Mirror: `recipes_page/skeleton_document.js` `document_problems` (also
  applied to embedded subagent documents by `subagent_pool_config.js`) admits
  the same shape with the same codes and paths. Its expected behaviour is the
  producer capture `recipes_page/skeleton_document_presentation_capture.json`
  (34 envelope + 34 embedded cases), generated by calling the real validator
  and the real Subagent Pool validator (`prepare_agent_graph` per embedded
  child); compared in both directions by
  `skeleton_document_presentation.test.js`.
- ACs: AC-AP-07 … AC-AP-12.

## BC-AP-003 — sidecar store → list / get / resolve read path

- Producer: `SkeletonResourceStore._presentation(row)` — derived from
  `draft_json`; no column, no migration (additive only).
- **List** (`list_resources()`, `GET /skeleton_resources`) is the only answer
  that gains a top-level key: every row carries `"presentation": {…} | null`.
  Exact row key set `{id, kind, name, description, archived, edit_token,
  draft_digest, source_identity, presentation}` (+ `published_revisions` for
  Workflows). This is what the Agents explorer reads.
- **Get / resolve / save / import** answers keep their existing exact key set
  `{id, kind, name, description, archived, edit_token, draft_digest,
  source_identity, document, diagnostics}` and carry the value only as
  `document.presentation` (exactly as stored; absent when unset). Reason: the
  managed aggregate's `resource`, the managed import answer and the
  legacy-upgrade answer are exact-key-set wire contracts (Electron
  `managed_code_transport.js`, `managed_transfer_transport.js`,
  `legacy_upgrade_transport.js`, renderer `legacy_upgrade_api.js`), and the
  sidecar's own legacy-upgrade tests assert those answers `==` the v1
  `get_resource`. A first attempt that added the key to `get_resource` broke
  4 of them (`Right contains 1 more item: {'presentation': None}`), so the
  projection was narrowed to the list.
- Rows whose JSON lacks the key (all pre-feature rows, legacy/managed rows)
  list as `null`.
- Parked, unchanged: the graph-only v1 `get_resource`/`resolve` still refuses
  managed rows with `source_api_required`; presentation neither worsens nor
  fixes this (the list reads managed rows fine; the writer uses the v2
  aggregate, which reads them).
- ACs: AC-AP-13 … AC-AP-19.

## BC-AP-004 — export/import file and embedded subagent `source.document`

- Export (`export_managed_resource`) and import (v1 `import_resource`, v2
  managed import) carry the document as-is, so presentation travels; import
  revalidates with the CLOSED validator (an old reader refuses the file with
  `unknown_field`). Import idempotency compares the full draft digest, which
  includes presentation.
- Embedded subagents: `source.document` is a whole document; its
  presentation is admitted by the same rule at
  `…source.document.presentation…`; an invalid one is reported by draft
  diagnostics / refused by preparation at that nested path. Each child's plan
  drops its own presentation. **Residual:** the *parent's* snapshot keeps the
  embedded child's config verbatim, so editing an embedded copy's
  presentation changes the parent's definition digest (same as editing its
  description today). The writer only edits resources, never embedded copies.
- ACs: AC-AP-20 … AC-AP-22.

## SEQ-AP-001 — presentation lifecycle of one resource

Identity key: `resource_id`. Initial state: resource exists without the key.

| Step | Event | Observable result | Cell |
| --- | --- | --- | --- |
| 1 | first save with `{icon,color}` | answer `document.presentation`, list `presentation`, get/resolve `document.presentation` all `==` value | PASS (AC-AP-13) |
| 2 | list | row carries it, exact key set | PASS (AC-AP-13, AC-AP-19) |
| 3 | get | `document.presentation` equal, exact get key set unchanged | PASS (AC-AP-13) |
| 4 | resolve by id | equals get | PASS (AC-AP-13, AC-AP-19) |
| 5 | second save with a new value | value replaced, token & draft digest change | PASS (AC-AP-14) |
| 6 | save with `null` | key removed from document, list reads `null` | PASS (AC-AP-14, AC-AP-03) |
| 7 | invalid value on update | refused with unchain code; previous row intact | PASS (AC-AP-16) |
| 8 | stale token | `edit_conflict`, typed failure in renderer | PASS (AC-AP-05) |
| 9 | run / preflight after icon change | plan + definition digest identical | PASS (AC-AP-10, AC-AP-18) |
| 10 | cold sidecar restart, then list/get | value survives (SQLite `draft_json`) | **NOT_RUN** |
| 11 | old reader (unchain without 1.9) | writes carrying the key refused `unknown_field` (sidecar) / `presentation_unsupported` (writer, before sending) | PASS for writes (AC-AP-06; `old_reader_sidecar.txt`). Expected but unverified: diagnostics/preflight/run of an already-stored document with the key fail `unknown_field` after a downgrade — **NOT_RUN** |
| 12 | live app: pick icon in explorer → avatar updates | — | **NOT_RUN** |

State-matrix baseline: normal message / second message / interaction /
resume — `N/A` for the write path (presentation is not runtime state); run
paths are covered by "plan identical" (AC-AP-10). Retry/durable resume across
an icon change: covered by digest identity (AC-AP-10/18); live **NOT_RUN**.

## AC list → tests

unchain-dev `tests/test_skeleton_presentation.py`:

- AC-AP-07 valid presentations preserved exactly and detached — `test_valid_presentation_is_preserved_exactly_and_detached` (incl. `{}`)
- AC-AP-08 document without it unchanged — `test_document_without_presentation_is_unchanged`
- AC-AP-09 non-object / extra key / non-string / bad icon / bad or uppercase colour rejected at `("document","presentation",…)` — `test_non_object_…`, `test_extra_presentation_key_…`, `test_non_string_…`, `test_bad_icon_pattern_…`, `test_bad_or_uppercase_color_…`, `test_presentation_does_not_reopen_the_root_envelope`
- AC-AP-10 prepared Agent/Workflow plan and digest identical with/without — `test_presentation_is_dropped_from_the_prepared_agent_plan_and_digest`, `…workflow_plan_and_digest`, `test_invalid_presentation_blocks_preparation_with_the_schema_error`
- AC-AP-11 embedded subagent admits / rejects at nested path — `test_embedded_subagent_…` (2), `test_draft_diagnostics_report_invalid_presentation`
- AC-AP-12 manifest 1.9 + `document_presentation_v1` — `test_manifest_advertises_presentation_in_minor_nine_…` (+ updated exact-manifest tests in `test_skeleton_runtime_protocol.py`, `test_skeleton_node_labels.py`, `test_skeleton_subagent_observation.py`)

PuPu sidecar `unchain_runtime/server/tests/test_skeleton_resource_presentation.py`:

- AC-AP-13 first save → list → get → resolve exact — `test_first_save_list_get_resolve_return_presentation_exactly`
- AC-AP-14 second save changes, then removes — `test_second_save_changes_and_then_removes_it`
- AC-AP-15 absent → `null` — `test_document_without_presentation_reads_null_everywhere`
- AC-AP-16 invalid → unchain code, nothing stored / previous row intact — `test_invalid_presentation_is_refused_…` (7), `test_invalid_presentation_on_update_keeps_the_previous_row`
- AC-AP-17 managed aggregate keeps its CLOSED resource keys, carries it in `document`, second managed save, list reads managed rows, v1 get still `source_api_required` — `test_managed_aggregate_…`; legacy row → `null` — `test_legacy_row_without_the_key_lists_as_null`
- AC-AP-18 plan/digest identical through the sidecar's imported runtime — `test_presentation_never_changes_the_prepared_plan_or_definition_digest`; imported runtime advertises the feature — `test_imported_runtime_advertises_the_presentation_feature`
- AC-AP-19 real HTTP save/list/get/resolve/refusal with exact key sets — `test_real_http_save_list_get_resolve`
- AC-AP-20 import preserves it, idempotent — `test_import_preserves_presentation_and_is_idempotent`
- AC-AP-21 embedded subagent document stored with it; invalid one diagnosed at nested path — `test_embedded_subagent_documents_carry_it`
- `test_skeleton_runtime_capability.py` actual-producer pin updated to 1.9;
  `test_skeleton_legacy_upgrade_http.py` / `test_skeleton_legacy_upgrade_save.py`
  pinned runtime manifest digest updated `sha256:c172bc02…` → `sha256:9f7a31a7…`
  (the manifest bump changes the digest; the old value is the 1.8 producer's).

PuPu renderer:

- AC-AP-01 exact edit payload key set + document key set (`presentation` keys exactly `["icon"]`), equal to the request the real store accepted with only `presentation` swapped to `{ icon }` — `src/SERVICEs/agent_resource_presentation_store.test.js` "writes { icon } alone through the v2 aggregate…"; saving over a stored `{icon,color}` drops the colour — "saving an icon over a stored icon and colour drops the colour"
- AC-AP-02 Code text round-trips (managed resource) — same test (`payload == producer.save_request`)
- AC-AP-03 `null` / `{}` removes the key — "null removes the key…", "an empty object…"
- AC-AP-04 local shape refusal sends nothing — `test.each` invalid presentations
- AC-AP-05 conflict / store refusal → `{ok:false, code}` — "an edit conflict…", "the store's own refusal…", "a resource that cannot be read…"
- AC-AP-06 older runtime manifest → `presentation_unsupported`, nothing sent — "an older runtime…"
- AC-AP-23 (icon-only frontend) picker has no colour controls and Save hands `{ icon }` (legacy colour dropped) — `agent_icon_picker.test.js`; Explorer writes `{ icon }` over a legacy colour and draws rows in `currentColor` — `agent_explorer.icons.test.js`, `recipes_page_agent_icon.test.js`; a stored colour is never drawn — `agent_avatar.test.js`, `SERVICEs/agent_resource_icons.test.js`
- AC-AP-24 (node identity) an Agent node with a resource presentation draws the fixed node icon and tile — `detail_panel/detail_panel.agent_icon.test.js` (canvas node + detail header), `detail_panel/node_tag.test.js`, `detail_panel/switch_case_rows.test.js`, `recipes_page_agent_icon.test.js` "in the editor"
- AC-AP-22 mirror ≡ producer capture, both directions, envelope + embedded — `recipes_page/skeleton_document_presentation.test.js` (125 tests)

Producer captures (generated, not hand written):

- `src/COMPONENTs/agents/pages/recipes_page/skeleton_document_presentation_capture.json`
- `src/SERVICEs/agent_resource_presentation_producer.json` (real Flask routes over a temp HOME)

## Evidence (red before green)

Scratchpad `/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/bbc3560e-3480-408f-b2d0-6289f2930ded/scratchpad/`:

- `red_unchain.txt` — new unchain tests on unchanged code: 63 failed, 1 passed
  (`assert 'unknown_field' == 'invalid_value'`, `assert (1, 8) == (1, 9)`).
- `red_mirror.txt` — mirror tests on HEAD `skeleton_document.js`: 66 failed, 59 passed.
- `red_sidecar.txt` — sidecar tests on HEAD `skeleton_resource_store.py`: 8 failed, 10 passed.
- `baseline_failures.txt` — the 9 sidecar skeleton tests that also fail with HEAD store + old runtime (cold-subprocess `No module named 'unchain'`, local Ollama model list): pre-existing, environmental.
- `old_reader_sidecar.txt` — sidecar tests with the old runtime
  (`unchain-dev-preview`): 16 failed (`SkeletonResourceError: unknown field`).
- `red_frontend.txt` — writer tests against the placeholder module: 13 failed, 1 passed.

## Open items

- Restart the sidecar with `UNCHAIN_SOURCE_PATH` pointing at a checkout that
  has this change; then run SEQ steps 10–12.
- Legacy upgrade documents are CLOSED to `{…, description}` in
  `electron/main/services/unchain/legacy_upgrade_transport.js` and
  `src/SERVICEs/legacy_upgrade_api.js`; a legacy-sourced Agent that is given
  an icon *before* its upgrade would make the upgrade answer fail closed there
  (no data loss). Not changed here — needs a decision.
- `skeleton_run_observation` (Electron + renderer) is also CLOSED to
  `description`, but receives `plan.snapshot()`, from which presentation is
  dropped — safe by construction.
