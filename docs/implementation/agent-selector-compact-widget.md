# Compact movable Agent selector

Owner request (2026-11-10): in this working folder, the composer Agent selector
uses only a circular icon, and can be tucked/restored like tools and workspaces.
No new UI primitive, confirmation, model call, or selection semantics.

Workspace: `/Users/red/Desktop/GITRepo/pupu-legacy-auto-upgrade`, branch
`codex/legacy-agent-auto-upgrade`. Preserve existing automatic migration and
concurrent Builder/UI work. No commit, push or merge in this task.

Use AttachPanel's existing movable widget renderers, arrange mode, keyboard
activation, and anchored Select in both row and More menu. Use the same bot
icon as the Agents sidebar. The icon tooltip/accessibility name carries the
current Agent, unavailable selections remain explicit, and opening refreshes
the same library. Hiding or moving never clears the selected Agent.

BC-ASI-001 (VERSIONED settings boundary): existing attach_panel_layout namespace
keeps `{version:1,order,hidden}`. Add `agent` to known IDs; old v1 layouts retain
their exact known order/hidden choices and append the newly recognized ID using
the existing normalizer. Unknown IDs/versions keep existing semantics. Defaults
place Agent next to the fixed model control; no automatic settings write.
Core/provider/IPC/runtime manifests are unchanged, so an artifact-pair rebuild
is N/A; actual selection identity/callbacks remain covered by component tests.
SEQ-ASI-001 / AC-ASI-001: visible -> arrange/tuck -> More -> choose same/exact
Agent -> restore/reorder -> remount, preserving selection and remembered layout.
AC-ASI-002: old preference normalization, empty library, unavailable Agent,
feature off and character chats, row/menu keyboard activation and dropdown
coordination. Reuse locale strings; test real controls in the offline preview.

Pre-edit GitNexus: AttachPanel UNKNOWN (JSX caller in chat_input.js confirmed
by text); normalization HIGH through read/write/move/hide, drag and keyboard
flows. This risk is reported, not waived. Nested renderer/activation impacts
are recorded in the task artifact directory; UNKNOWN is corroborated by their
actual JSX/ref dispatch sites. The relevant source functions match the indexed
base despite unrelated Builder changes. Tests precede product changes.

The refreshed normalization walk reported CRITICAL / partial at 1,556 affected
symbols. This is unresolved graph coverage, not a clean check. The normalizer
body is unchanged; this task extends only its known-ID list. No commit is made.

Validation: seven new cases failed before implementation. The two changed
suites pass 100 tests and exit 0; product ESLint and diff whitespace checks pass.
A broader six-suite run passed 129 assertions but stayed alive; a diagnostic
rerun also passed all assertions without identifying a handle. Both task-owned
runners were stopped, with their process identities recorded. This is not
reported as a clean six-suite process result.

Native preview at localhost:2912: icon-only Agent button opens the existing
list; keyboard arrange tucks it into More; the menu opens the same list with
the same current selection; arranging restores the button. Final state leaves
the icon visible. No message was sent and no model/provider run was started.
