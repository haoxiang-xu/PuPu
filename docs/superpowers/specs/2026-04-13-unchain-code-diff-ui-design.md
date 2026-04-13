# Unchain Code Diff UI — Design Spec (v2)

**Date:** 2026-04-13
**Status:** Draft (pending review)
**Scope:** unchain standalone repo (`~/Desktop/GITRepo/unchain/`) + PuPu (adapter + frontend)
**Supersedes:** v1 of this spec (which targeted `~/Desktop/GITRepo/miso/src/unchain/`, an obsolete path)

## 1. Goal

Let unchain's `CoreToolkit.write` and `CoreToolkit.edit` tools surface a unified-diff preview as the approval UI in the PuPu frontend, reusing the existing tool-confirmation protocol. After approval, the diff card stays in the timeline (de-saturated with a green left edge) as a historical record; after rejection it stays with a red edge. Binary files and oversized payloads fall back to the legacy confirmation UI unchanged.

This is v1 of the feature. A generic "tool-defined custom UI region" is explicitly out of scope and deferred.

## 2. Non-Goals (YAGNI)

- Multi-file / batch code-diff support (no such tool exists in the standalone unchain repo)
- Explicit `delete_file` / `create_file` / `multi_edit` support (those tools don't exist — file deletion happens via the `shell` tool, which is out of scope)
- Language-aware syntax highlighting
- Side-by-side diff view (unified only)
- Partial approval / in-line edits of the diff
- Shell-command parsing to reconstruct a diff (e.g. interpreting `rm foo.py` as a delete)
- Expanding truncated diffs back to full content
- A generic "tool returns UI schema, frontend dynamically renders" system
- Diff UI for non-file tools (DB migrations, config patches, etc.)

## 3. Protocol

Reuse the existing tool-confirmation protocol. Add one new `interact_type`: `code_diff`. No new SSE channels, no new HTTP routes, no new dataclass fields — `ToolConfirmationRequest` already has `interact_type: str = "confirmation"` and `interact_config: dict | list | None = None` in `src/unchain/tools/models.py`.

### 3.1 Event shape

Emitted as a `tool_call` SSE frame (already whitelisted in PuPu's `_UNSANITIZED_EVENT_TYPES`):

```json
{
  "type": "tool_call",
  "tool_name": "write" | "edit",
  "confirmation_id": "<uuid>",
  "interact_type": "code_diff",
  "interact_config": {
    "title": "Edit /abs/path/foo.py",
    "operation": "edit" | "create",
    "path": "/abs/path/foo.py",
    "unified_diff": "--- a/foo.py\n+++ b/foo.py\n@@ -1,3 +1,3 @@\n...",
    "truncated": false,
    "total_lines": 45,
    "displayed_lines": 45,
    "fallback_description": "edit foo.py (+12 -3)"
  },
  "arguments": { /* original tool args */ },
  "requires_confirmation": true
}
```

`operation` is always `"edit"` for the `edit` tool. For the `write` tool, it is `"edit"` when the target file exists (overwrite) and `"create"` when it does not. The schema has **no** `files[]` array and **no** `overflow_count` — if/when a batch file tool is added to unchain in the future, the schema can be extended to wrap the single-file shape in a `files[]` array without breaking the current one.

### 3.2 Lifecycle

1. `write` / `edit` tool pre-execution (inside the tool method body): read old file bytes (already done by existing code for snapshot freshness), compute `new_content` (already done — `content` for `write`, `raw.replace(...)` for `edit`), then call a helper `build_code_diff_payload` to compute the unified diff.
2. The tool wraps the payload into a `ToolConfirmationPolicy` (or whatever the standalone unchain repo's equivalent mechanism is — see §4.3 Step 0) carrying `interact_type="code_diff"` and `interact_config={...}`.
3. `execute_confirmable_tool_call` in `src/unchain/tools/confirmation.py` constructs `ToolConfirmationRequest` and **propagates `interact_type` / `interact_config` from the policy into the request object**. This is the one targeted change in `confirmation.py`.
4. PuPu adapter (`_make_tool_confirm_callback` + `_build_tool_confirmation_request_payload`) already propagates these fields verbatim — no change needed.
5. Frontend `InteractWrapper` looks up `code_diff` in the interact registry and renders `CodeDiffInteract` with approve/reject buttons.
6. User clicks → `POST /chat/tool/confirmation { confirmation_id, approved }` → adapter unblocks `threading.Event` → tool resumes (or short-circuits to `{"denied": True, ...}` on reject, per existing contract).
7. Frame stays in `message.traceFrames`; `CodeDiffInteract` re-renders in `approved` / `rejected` state (D2 style: opacity 0.75, 3px left edge in green or red, buttons replaced by a status badge).

### 3.3 Fallback rules

- If `build_code_diff_payload` returns `None` (binary content, oversize, or any unexpected error), the tool does NOT set `interact_type` / `interact_config` on the policy. The request falls through to the default `interact_type="confirmation"` path with existing arguments+description, and the frontend renders the legacy confirmation UI.
- Thresholds (hard-coded in `build_code_diff_payload`): `max_lines=200`, `max_bytes=1_000_000`. Anything over 200 lines gets `truncated=True` + first 200 lines displayed; combined old+new > 1MB → `None`; UTF-8 decode failure or NUL bytes → `None`.

### 3.4 Invariants

- No change to `ToolConfirmationRequest` / `ToolConfirmationResponse` dataclasses.
- No change to the SSE whitelist (`tool_call` already listed in PuPu).
- No change to `/chat/tool/confirmation` endpoint.
- Reject-path semantics unchanged: `{"denied": True, "tool": ..., "reason": ...}` is emitted just like for any other confirmation rejection. A `tool_denied` event is still emitted.
- `code_diff` never blocks tool execution: any failure in the diff path falls back to the legacy `interact_type="confirmation"`.

## 4. Backend Changes

### 4.1 Standalone unchain repo (`~/Desktop/GITRepo/unchain/`)

**New file — `src/unchain/tools/_diff_helpers.py`:**

Pure function `build_code_diff_payload(path, old_content, new_content, operation, *, max_lines=200, max_bytes=1_000_000) -> dict | None`. Returns either a full payload dict (with `path`, `operation`-derived `sub_operation`, `unified_diff`, `truncated`, `total_lines`, `displayed_lines`) or `None`. Implementation:

- Coerce `old` / `new` to text: `None` if bytes have NUL or fail UTF-8 decode; empty string for `None` input.
- Reject if combined UTF-8 byte length > `max_bytes` → `None`.
- Normalize CRLF → LF on both sides.
- If normalized old == new → return payload with `unified_diff=""` (let frontend show "no changes").
- Otherwise call `difflib.unified_diff(old_lines, new_lines, fromfile=f"a/{path}", tofile=f"b/{path}", lineterm="", n=3)`, collect, truncate to `max_lines` if needed, join with `\n`.
- All exceptions → log WARNING + return `None`.

This is a pure function, dependency-free (stdlib only).

**Modified — `src/unchain/toolkits/builtin/core/core.py`:**

Two tool methods (`write` at ~line 351, `edit` at ~line 406) are modified to compute a code_diff payload and attach it to the tool's confirmation policy. A private helper `_build_code_diff_policy(path, old, new, operation) -> ToolConfirmationPolicy | None` (or whatever the equivalent mechanism is — see §4.3) is added to `CoreToolkit` and called from both tool methods. Shared logic:

1. Call `build_code_diff_payload(...)`.
2. If result is `None` → return `None` (fall back to legacy confirmation).
3. Otherwise build `interact_config = {title, operation, path, unified_diff, truncated, total_lines, displayed_lines, fallback_description}` and wrap it in a `ToolConfirmationPolicy` (exact constructor TBD by Step 0 investigation).
4. The tool methods integrate this at the point where `old_raw` and `content` (or `raw` and `updated`) are both available in memory — no extra file reads.

**Modified — `src/unchain/tools/confirmation.py`:**

In `execute_confirmable_tool_call`, at the point where `ToolConfirmationRequest` is constructed (~line 103-113, per Q2 of Step 0), add 3-5 lines that read `interact_type` / `interact_config` from the active confirmation policy (if any) and copy them onto the request object. This is the one change in `confirmation.py`. Exact lines determined by Step 0.

### 4.2 PuPu (`~/Desktop/GITRepo/PuPu/`)

**Modified — `unchain_runtime/server/unchain_adapter.py`:**

- `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES` (~line 134): replace the stale `{"write_file", "delete_file", "move_file", "terminal_exec"}` with `{"write", "edit", "terminal_exec"}`. The old names do not exist in the standalone unchain repo, so the current list is dead code / a pre-existing bug. `terminal_exec` stays because TerminalToolkit still uses it.
- Any helpers that iterate this list (e.g. `_mark_workspace_tools_for_confirmation`) automatically pick up the new names; no other code changes needed.
- `_make_tool_confirm_callback` and `_build_tool_confirmation_request_payload`: **no code change**. They already propagate arbitrary `interact_type` and `interact_config`. A regression test locks this contract for the new `code_diff` type.

### 4.3 Step 0 open questions (resolved in plan phase, before writing code)

1. **`ToolConfirmationPolicy` location and shape.** Where is this class defined in the standalone unchain repo, what fields does it have, and does it support `interact_type` / `interact_config` directly or does it carry a generic `render_component` dict from which `confirmation.py` should extract them? Shell tool's confirmation resolver is the reference implementation to read.
2. **Confirmation resolver signature.** The standalone repo has a `confirmation_resolver` mechanism (the shell tool uses it). What's the resolver's signature, how is it registered on a tool, and is resolver-at-registration the right integration point for `write` / `edit`, or should the diff computation happen inline in the tool method body?
3. **Current confirmation behavior for `write` / `edit`.** Given that PuPu's legacy tool-name list is broken, does confirmation for `write` / `edit` currently go through at all? If yes, via what path (tool's own `requires_confirmation=True` attribute)? This answer dictates whether the adapter fix in §4.2 is a prerequisite or a cleanup.
4. **Exact line of `ToolConfirmationRequest` construction in `execute_confirmable_tool_call`.** Needed to make the `confirmation.py` patch surgical (3-5 lines).

## 5. Frontend Changes

### 5.1 New — `src/COMPONENTs/interact/CodeDiffInteract.js`

(Path verified during implementation by locating `ConfirmInteract.js` and mirroring its directory.)

**Props** (match existing interact component conventions):

```js
<CodeDiffInteract
  config={interact_config}          // §3.1 schema (single-file, no files[] array)
  onSubmit={(result) => ...}        // result = { approved: bool }
  status="pending" | "approved" | "rejected"
  isDark={bool}
/>
```

**Render tree:**

```
Card
├─ Header: title + operation badge ("Edit" / "Create")
├─ FileHeader row: path + "+X -Y" line stats
├─ DiffBody: parsed unified diff, per-line +/- coloring, two-column line numbers
├─ (if truncated) "truncated, N more lines hidden" notice
└─ Footer
    ├─ pending : [Approve] [Reject]
    ├─ approved: "✓ Approved <ts>"
    └─ rejected: "✗ Rejected <ts>"
```

**DiffBody** (internal sub-component, < 50 LoC):
- Parse unified_diff line by line.
- Classify each line by first character: `+` → added (green bg), `-` → removed (red bg), ` ` → context, `@@ -a,b +c,d @@` → hunk header (muted blue).
- Two-column line numbers (old / new), starting from the `@@` anchor.
- Monospace font, inline styles per PuPu convention (`isDark` from ConfigContext).
- If parse fails (malformed input), fall back to a plain `<pre>` of the raw string. Never crash.

**D2 state styling** (approved / rejected):
- Card wrapper: `opacity: 0.75`, 3px left border (`#22c55e` for approved, `#ef4444` for rejected).
- Footer buttons replaced by status badge with timestamp.
- Diff body remains fully rendered — this is the persistent-history requirement.

PuPu conventions: inline styles only, no CSS modules, no PropTypes, no TypeScript, function component.

### 5.2 Modified — `src/COMPONENTs/interact/interact_registry.js`

One-line addition registering `code_diff: CodeDiffInteract` alongside the existing five types. Keep the exact style (named exports, trailing commas) of the existing file.

### 5.3 Verify — `src/PAGEs/chat/hooks/use_chat_stream.js`

Expected zero code change. Two things to verify during implementation:

1. `tool_call` frame handler dispatches to `InteractWrapper` based on presence of `interact_type` in payload, **not** hard-coded to `tool_name === "ask_user_question"`.
2. After an approve/reject response, the frame is **not** removed from `message.traceFrames` — instead a `status` field (or similar) is mutated so the interact component re-renders in the new state. Required for D2 persistent-history.

If either assumption fails, apply a targeted patch. Do not rewrite the stream handler.

### 5.4 `trace_chain.js`

Expected zero change. `InteractWrapper` is already the dispatch point for `tool_call` frames with `interact_type`; the registry lookup handles everything.

## 6. Testing

### 6.1 unchain unit tests

**`tests/test_diff_helpers.py`** — 11 cases for `build_code_diff_payload`:

1. Normal edit, small file → non-None payload, `truncated=False`.
2. Create mode (old="") → sub-operation-adjacent, all additions.
3. Delete mode (new="") → included for completeness even though no delete tool uses it yet, sanity check.
4. Diff > 200 lines → truncated=True, displayed=200.
5. NUL bytes → `None`.
6. Invalid UTF-8 → `None`.
7. Combined size > 1MB → `None`.
8. old == new → empty diff payload (unified_diff="").
9. CRLF/LF mixed otherwise identical → empty/near-empty diff.
10. bytes input decoded as UTF-8.
11. `difflib.unified_diff` raising → `None` (monkeypatched).

### 6.2 unchain integration tests — `tests/test_core_write_edit_code_diff.py`

Using `CoreToolkit` with a mocked `on_tool_confirm` callback:

- `write` overwriting existing text file → confirmation request has `interact_type="code_diff"`, `interact_config.operation="edit"`, `unified_diff` contains `-old` and `+new`.
- `write` creating new file → `operation="create"`.
- `write` with binary existing content → falls back, `interact_type="confirmation"`.
- `edit` with simple string replace → `operation="edit"`, diff matches expected shape.
- `edit` with > 200 lines of changes → `truncated=True`, `displayed_lines=200`.
- `edit` with `old_string == new_string` or empty diff → empty `unified_diff` in payload.
- Reject path: callback returns `{approved: False}` → tool returns `{"denied": True, ...}`, matches existing behavior unchanged.

### 6.3 unchain confirmation.py dispatch test — `tests/test_confirmation_policy_interact_propagation.py`

Two cases:
- Policy carrying `interact_type="code_diff"` + `interact_config={...}` → `ToolConfirmationRequest` receives both fields.
- Policy without any interact hints → request stays at defaults (`"confirmation"` / `None`).

### 6.4 PuPu adapter regression test

One file: `tests/server/test_adapter_code_diff_propagation.py`. Constructs a fake request object with `interact_type="code_diff"` and a realistic `interact_config`, calls `_build_tool_confirmation_request_payload`, asserts both fields are preserved verbatim. Locks the propagation contract.

### 6.5 Frontend RTL tests — `CodeDiffInteract.test.js`

8 cases (mirrors the component):
1. Pending state renders with Approve / Reject buttons.
2. Diff line classification (`+` / `-` / context / hunk header).
3. Approved state: no buttons, green edge, de-saturated.
4. Rejected state: no buttons, red edge, de-saturated.
5. `truncated=true` → renders truncation notice with hidden-line count.
6. Approve click → `onSubmit({approved: true})`.
7. Reject click → `onSubmit({approved: false})`.
8. Malformed unified_diff → renders as plain `<pre>`, no crash.

### 6.6 End-to-end manual checklist

Run before declaring the feature done:

- [ ] `write` overwriting an existing `.py` file → diff card, approve → D2 green-edge state, diff still visible.
- [ ] `write` creating a new file → create badge, all lines as additions, approve works.
- [ ] `edit` with a small string replace → diff card with one `-old` / `+new` pair, approve works.
- [ ] `edit` producing > 300 lines of diff → truncation notice appears, displayed 200.
- [ ] `write` targeting a binary file (e.g. an existing PNG) → falls back to legacy confirmation UI cleanly.
- [ ] Reject on a diff card → red-edge state, agent receives `{"denied": True}`, no hang.
- [ ] Scroll back after sending more messages → old approved diff card still renders correctly.
- [ ] Regression: `ask_user_question` (single / multi / text_input) → unchanged behavior.

## 7. Edge Cases & Fail-Safe

- `build_code_diff_payload` raises unexpectedly → caught inside the function, WARNING logged, treated as `None`. Tool execution is never blocked by diff failure.
- Frontend cannot parse `unified_diff` → render raw string in `<pre>`, do not throw.
- `confirmation_id` missing or stale → existing adapter semantics unchanged.
- Agent runs headless (no frontend listener): follows whatever current `_make_tool_confirm_callback` does. `code_diff` introduces no new policy.
- Very large single-line diffs (e.g. a 50KB minified JS file changed by one byte): unified_diff will show the whole line; the 1MB byte cap and 200-line cap together keep payload bounded. This is good enough for v1.

## 8. Implementation Order

Each step is independently testable and committable.

- **Step 0 — Investigation.** Read standalone unchain's `confirmation.py`, `core.py`, `models.py` (`ToolConfirmationPolicy`), and shell tool's confirmation_resolver. Resolve the 4 open questions in §4.3. No code. Update this spec inline if any assumption proves wrong.
- **Step 1 — `build_code_diff_payload` + unit tests.** Pure function, zero side effects.
- **Step 2 — `confirmation.py` interact propagation + dispatch test.** Surgical 3-5 line change.
- **Step 3 — `write` / `edit` integration.** `_build_code_diff_policy` helper + call sites in both tool methods. Integration tests.
- **Step 4 — PuPu adapter legacy-list fix + regression test.** Replace `{write_file, delete_file, move_file, terminal_exec}` with `{write, edit, terminal_exec}`. Add propagation regression test.
- **Step 5 — `CodeDiffInteract` component + RTL tests.** Static props only, pending/approved/rejected states.
- **Step 6 — Registry registration + `use_chat_stream` verification.** Targeted fixes if §5.3 assumptions don't hold.
- **Step 7 — End-to-end manual checklist (§6.6).**
- **Step 8 — Documentation, memory update, commit.**

## 9. Future Work (explicitly deferred)

- Generic "tool-defined UI region" protocol. Revisit after v1 is in use.
- Syntax highlighting.
- Side-by-side diff view.
- Multi-file / batch support — schema can be extended by wrapping the current single-file shape in a `files[]` array without breaking existing consumers.
- Shell-tool integration ("reconstruct a diff from `rm foo.py`") — intentionally avoided due to parsing fragility.
- Dynamic truncation thresholds per file type.
