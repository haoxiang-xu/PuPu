# Unchain Code Diff UI — Design Spec

**Date:** 2026-04-13
**Status:** Draft (pending review)
**Scope:** unchain (tool layer) + PuPu (adapter + frontend)

## 1. Goal

Let unchain file-writing tools (`write_file`, `edit_file`, `delete_file`, `multi_edit`) surface a code-diff preview in the PuPu frontend as part of the existing user-approval flow. After approval, the diff card stays in the timeline as a historical record (de-saturated with a subtle green edge); after rejection it stays with a red edge. Binary files and oversized payloads fall back to the legacy confirmation UI untouched.

This is the minimum viable implementation (v1). A generic "tool-defined custom UI region" is explicitly out of scope and deferred.

## 2. Non-Goals (YAGNI)

- Language-aware syntax highlighting inside the diff
- Side-by-side diff view (unified only)
- In-line comments or suggested edits
- Partial approval of a multi-file change (all-or-nothing)
- Expanding truncated diffs back to full content
- A generic "tool returns UI schema, frontend dynamically renders" system
- Diff UI for non-file tools (DB migrations, config patches, etc.)

## 3. Protocol

Reuse the existing interact protocol. Add one new `interact_type`: `code_diff`. No new SSE channels, no new HTTP routes.

### 3.1 Event shape

Emitted as a `tool_call` SSE frame (already whitelisted in `_UNSANITIZED_EVENT_TYPES`):

```json
{
  "type": "tool_call",
  "tool_name": "write_file" | "edit_file" | "delete_file" | "multi_edit",
  "confirmation_id": "<uuid>",
  "interact_type": "code_diff",
  "interact_config": {
    "title": "Edit foo.py",
    "operation": "edit" | "create" | "delete" | "multi",
    "files": [
      {
        "path": "src/foo.py",
        "sub_operation": "edit" | "create" | "delete",
        "unified_diff": "--- a/src/foo.py\n+++ b/src/foo.py\n@@ -1,3 +1,4 @@\n...",
        "truncated": false,
        "total_lines": 45,
        "displayed_lines": 45
      }
    ],
    "overflow_count": 0,
    "fallback_description": "Edit src/foo.py (+12 -3)"
  },
  "arguments": { /* original tool args */ },
  "requires_confirmation": true
}
```

Single-file ops always have `files.length === 1`. `multi_edit` may have up to 10 entries; anything beyond that bumps `overflow_count`.

### 3.2 Lifecycle

1. Tool pre-execution: unchain tool computes diff payload via `build_code_diff_payload`, then calls the existing confirm callback with `interact_type="code_diff"` and the config above.
2. PuPu adapter forwards the `interact_type` and `interact_config` verbatim into the `tool_call` SSE frame.
3. Frontend `InteractWrapper` looks up `code_diff` in the interact registry → renders `CodeDiffInteract` with approve/reject buttons.
4. User click → `POST /chat/tool/confirmation { confirmation_id, approved }` → adapter unblocks `threading.Event` → tool resumes.
5. Tool executes (or short-circuits on reject, matching whatever the existing reject contract is — to be confirmed in Step 0).
6. Frame stays in `message.traceFrames`; `CodeDiffInteract` re-renders in `approved` / `rejected` state (D2 style: de-saturated, side edge color, buttons replaced by a status badge).

### 3.3 Invariants

- No change to SSE whitelist (`tool_call` already listed).
- No change to `/chat/tool/confirmation` endpoint.
- No change to unchain kernel's `on_input` / confirm-callback signature beyond what's required to propagate `interact_type` (see Step 0).
- `code_diff` never blocks tool execution on its own: any failure in the diff path falls back to the legacy `interact_type="confirmation"`.

## 4. Backend Changes

### 4.1 unchain (`miso/src/unchain/`)

**New file — `unchain/tools/_diff_helpers.py`:**

```python
def build_code_diff_payload(
    path: str,
    old_content: str | bytes | None,
    new_content: str | bytes | None,
    operation: str,
    max_lines: int = 200,
    max_bytes: int = 1_000_000,
) -> dict | None:
    """
    Build a single file entry for interact_config.files.

    Returns None when code_diff is NOT appropriate — caller must fall
    back to the legacy confirmation path:
      - binary content (utf-8 decode fails, or contains NUL bytes)
      - combined old+new byte size exceeds max_bytes
      - any unexpected exception (logged as warning)

    Returns empty diff entry (unified_diff="") when old == new.
    Truncates unified diff to max_lines and sets truncated=True
    when the full diff would exceed that.
    """
```

Uses `difflib.unified_diff` with `n=3` context. CRLF/LF normalization: `.splitlines(keepends=False)` on both sides, which naturally absorbs line-ending differences (verify with test case #8 in §6.1).

**Modified tools** (exact file paths and tool names confirmed in Step 0):

- `write_file`: read existing file if present (old_content=""  if not), compute payload, call confirm callback with `interact_type="code_diff"` and `interact_config={files:[payload], operation, title, ...}`. On `build_code_diff_payload` returning `None`, fall back to `interact_type="confirmation"` with the original arguments.
- `edit_file` / `str_replace`: same, with `new_content` derived from applying the patch to `old_content` in-memory.
- `delete_file`: `new_content=""`, `operation="delete"`.
- `multi_edit` (or `apply_patch`, whichever is canonical): compute payload for every sub-op up front. If **any** returns `None`, fall back the entire batch to legacy confirmation. Otherwise assemble the first 10 into `files`, set `overflow_count = max(0, len(files_total) - 10)`, and emit a single `code_diff` event.

Reject handling must match whatever the existing confirmation path does for these tools — do not introduce new semantics.

### 4.2 PuPu (`PuPu/unchain_runtime/server/`)

**`unchain_adapter.py`:**

- `_make_tool_confirm_callback()` must propagate `interact_type` and `interact_config` from the unchain-side call through to the SSE `tool_call` frame payload. If it currently hard-codes `interact_type="confirmation"` for non-`ask_user_question` tools, change that to respect the caller's value.
- No other semantic change — `_pending_confirmations` / `threading.Event` / `submit_tool_confirmation()` all unchanged.

**`route_chat.py`:**

- No change. `tool_call` is already in `_UNSANITIZED_EVENT_TYPES`; the endpoint already passes `modified_arguments` through opaquely.

**`_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES`:**

- No change. The *trigger* for confirmation stays the same; we only change what *payload* is emitted inside that confirmation event.

### 4.3 Step 0 open questions (resolve in plan phase, before writing code)

1. Current signature of unchain's confirm callback / `on_input` — is `interact_type` a caller-specified field or framework-assigned? If the framework currently forces `confirmation`, the kernel contract needs a small extension to let tools specify their own type.
2. Exact tool names and module paths in unchain for file writes — is there one `write_file` and one `edit_file`, or are there variants? Is there a `multi_edit` / `apply_patch`?
3. Current reject-path behavior for file tools — does rejection raise an exception that the agent sees as a `ToolError`, or return a dict with `{"rejected": true}`? `code_diff` must preserve whichever contract exists.
4. Current behavior of `_make_tool_confirm_callback()` in PuPu — does it already pass `interact_type` through, or does it currently hard-code?

## 5. Frontend Changes

### 5.1 New: `CodeDiffInteract.js`

Lives alongside the existing interact components (exact path confirmed during implementation; mirrors `ConfirmInteract` / `SingleSelectInteract`).

**Props** (matching existing interact component conventions):

```js
<CodeDiffInteract
  config={interact_config}          // §3.1 schema
  onSubmit={(result) => ...}        // result = { approved: bool }
  status="pending" | "approved" | "rejected"
  isDark={bool}
/>
```

**Render tree:**

```
Card
├─ Header: title + operation badge
├─ FileList (vertical stack, no folding in v1)
│   └─ FileBlock (per file)
│       ├─ Path row: path + sub_operation pill + "+X -Y" stats
│       ├─ DiffBody: parsed unified diff
│       └─ (if truncated) "truncated, N more lines hidden"
├─ (if overflow_count > 0) "+ N more files not shown"
└─ Footer
    ├─ pending : [Approve] [Reject]
    ├─ approved: "✓ Approved <ts>"
    └─ rejected: "✗ Rejected <ts>"
```

**DiffBody** (internal sub-component, < 50 LoC):
- Parse unified_diff line by line.
- Classify each line by first character: `+` → added (green bg), `-` → removed (red bg), ` ` → context (normal), `@@ ... @@` → hunk header (muted blue).
- Two-column line numbers (old / new), starting from the `@@ -a,b +c,d @@` anchor.
- Monospace font token from PuPu theme; no external diff library.
- If parse fails (malformed input), fall back to a plain `<pre>` of the raw string. Never crash.

**D2 state styling** (approved / rejected):
- Card wrapper: `opacity: 0.75`, 3px left border (green `#22c55e` or red `#ef4444`).
- Footer buttons replaced by a status badge with timestamp.
- Diff body remains fully rendered — this is the persistent-history requirement.

### 5.2 `interact_registry.js`

One-line addition:

```js
import { CodeDiffInteract } from './CodeDiffInteract';

const interactRegistry = {
  confirmation: ConfirmInteract,
  single: SingleSelectInteract,
  multi: MultiSelectInteract,
  text_input: TextInputInteract,
  multi_choice: MultiChoiceInteract,
  code_diff: CodeDiffInteract,  // new
};
```

### 5.3 `use_chat_stream.js`

Expected to need zero changes. Two things to verify during implementation:

1. The `tool_call` frame handler currently dispatches to interact rendering based on presence of `interact_type` in payload — not hard-coded to `tool_name === "ask_user_question"`. If it's hard-coded, generalize the check.
2. After an approve/reject response, the frame is **not** removed from `message.traceFrames`, so the D2 de-saturated state persists in the timeline. If it currently removes the frame, keep it and instead mutate a `status` field on the frame.

Either discovery leads to a small, targeted patch — not a rewrite.

### 5.4 `trace_chain.js`

Expected zero changes. `InteractWrapper` is already the path through which `tool_call` frames with `interact_type` render, and registry lookup handles dispatch.

## 6. Testing

### 6.1 unchain unit tests — `test_diff_helpers.py`

Cases for `build_code_diff_payload`:

1. Normal edit, small file → non-None payload, `truncated=False`, `sub_operation="edit"`.
2. Create (old_content="") → `sub_operation="create"`, diff shows all lines added.
3. Delete (new_content="") → `sub_operation="delete"`, diff shows all lines removed.
4. Diff > 200 lines → `truncated=True`, `displayed_lines=200`, `total_lines=<full>`.
5. Binary content (bytes with NUL / invalid UTF-8) → `None`.
6. Combined size > 1 MB → `None`.
7. old == new → empty `unified_diff`, non-None payload (let frontend show "no changes").
8. Mixed CRLF / LF line endings, otherwise identical → empty or near-empty diff (verify no noise).

### 6.2 unchain integration tests — per tool

With a mocked confirm callback:

- `write_file` / `edit_file` / `delete_file` each emit `interact_type="code_diff"` with the expected `files[0]` shape.
- `multi_edit` with 3 clean text files → single event, `files.length === 3`, `overflow_count === 0`.
- `multi_edit` with one binary mixed in → falls back entirely to `interact_type="confirmation"`.
- `multi_edit` with 12 files → `files.length === 10`, `overflow_count === 2`.
- Reject path: callback returns reject, tool behaves exactly like legacy rejection (same exception type or return shape).

### 6.3 PuPu adapter test

`_make_tool_confirm_callback()` given an input with `interact_type="code_diff"` → emitted SSE frame preserves both `interact_type` and `interact_config` verbatim (no rewrite to `"confirmation"`).

### 6.4 Frontend unit tests

- Snapshot the three states (pending / approved / rejected) of `CodeDiffInteract`.
- DiffBody line classification: a small fixture with one `+`, one `-`, one context, one hunk header → correct class names on each row.
- `truncated=true` → renders the truncation notice.
- `overflow_count > 0` → renders "+N more files".
- Clicking Approve → `onSubmit` called with `{ approved: true }`.
- `interactRegistry.code_diff === CodeDiffInteract`.

### 6.5 End-to-end manual checklist (run before declaring done)

- [ ] Agent edits a small `.py` file → diff card appears; approve → de-saturated, green edge, buttons gone, diff still visible.
- [ ] Agent creates a new file → create-mode card renders, all lines as additions.
- [ ] Agent deletes a file → delete-mode card, all lines as removals.
- [ ] Agent edits a file with > 300 lines of diff → truncated notice shows, displayed lines = 200.
- [ ] Agent tries to "edit" a PNG → falls back cleanly to legacy confirmation UI.
- [ ] Agent calls `multi_edit` on 3 files → single card with 3 file blocks, one approve button, one approval persists all three.
- [ ] Agent calls `multi_edit` on 12 files → 10 blocks + "+2 more files not shown".
- [ ] Agent's write is rejected → red edge state, agent receives the existing reject signal (no hang, no crash).
- [ ] Timeline scrollback: an approved diff card from earlier in the conversation still renders correctly after new messages arrive.

## 7. Edge Cases & Fail-Safe

- `build_code_diff_payload` raises unexpectedly → caught, logged at WARNING, treated as `None`, caller falls back to legacy confirmation. Tool execution must never be blocked by a diff-rendering failure.
- Frontend cannot parse a `unified_diff` string → render it as plain `<pre>`, do not throw.
- `confirmation_id` missing or stale on the callback → uses existing adapter semantics unchanged.
- Agent runs headless (no frontend listener for this session): follow whatever `_make_tool_confirm_callback` currently does (auto-approve / auto-reject / wait) — `code_diff` introduces no new policy.
- Multi_edit mid-batch failure: since the batch is emitted as a single up-front event, per-file execution errors after approval are not a diff-layer concern; existing tool error handling applies.

## 8. Implementation Order

Each step is independently testable and committable.

- **Step 0 — Investigation.** Answer §4.3 open questions by reading unchain and PuPu source. No code. Update this spec inline with findings if any assumptions turn out wrong.
- **Step 1 — `build_code_diff_payload` + unit tests.** Pure function, zero side effects.
- **Step 2 — Single-file tool integration.** `write_file`, `edit_file`, `delete_file` wire in `build_code_diff_payload` and the new confirm-callback payload. Integration tests.
- **Step 3 — Multi-file tool integration.** `multi_edit` (or equivalent), including overflow / binary fallback. Integration tests.
- **Step 4 — PuPu adapter verification.** Confirm `interact_type` propagates end-to-end; add a regression test.
- **Step 5 — `CodeDiffInteract` component + unit tests.** Static props only, three states.
- **Step 6 — Registry registration + `use_chat_stream` verification.** Targeted fixes if §5.3 assumptions don't hold.
- **Step 7 — End-to-end manual checklist (§6.5).**
- **Step 8 — Documentation + commit.**

## 9. Future Work (explicitly deferred)

- Generic "tool-defined UI region" (the broader question the user asked). Revisit after v1 is in use and we have data on how often non-diff display components are actually needed.
- Syntax highlighting.
- Side-by-side diff view.
- Fold/expand file blocks when `multi_edit` card exceeds a comfortable height.
- Dynamic truncation thresholds per file type.
