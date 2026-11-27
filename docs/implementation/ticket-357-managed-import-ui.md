# #357 import with local Python rebinding — UI slice

Base: the managed-import producer tree f0292e80 (on host 99f40921). This slice is renderer-only. It consumes BC-IMP-002 and BC-IMP-004 exactly as handed off:
- no new route, IPC call, wire field or fallback;
- no export UI;
- no import of embedded Hook Code (not qualified on this pair).

## Entry and flow

The Agents explorer header has an upload button, and its background menu has "Import…". Both open `ImportResourceModal`, which works as follows.

1. It reads the transfer capability through the strict facade. An old, mismatched or unavailable host shows the reason it was given, and the file picker stays disabled.
2. It reads the chosen file as strict UTF-8 (`fatal`, BOM kept) and checks it against the host's advertised `file_bytes` before reading. The text is parsed only to show what it holds and to list the owned Code occurrences by typed address (`owned_code_nodes`). `source_json` is the file text itself and is never reserialized.
3. Each Code occurrence has its own Python choice from the local profile list. Nothing is preselected, including builtin and a local profile with the exported name. Import is enabled only when every occurrence has a choice.
4. "Name a Python…" uses the existing `saveSkeletonPythonProfile`. It refreshes the list and selects nothing.
5. On success the library is told through `emitSkeletonLibraryRefresh`. The result says that stored does not mean runnable.
6. A refusal keeps the host's code, path and message. `import_conflict` and `profile_missing` each get a sentence explaining them. Nothing is retried, renamed or overwritten.

Choosing another file, clearing, closing or unmounting voids the intent ticket. A late read or a late import answer for an earlier intent changes nothing on screen.

## AC (tests in `import_resource_modal.test.js`, NOT_RUN in this checkpoint)

- AC-IUI-01: the exported text is sent byte-identical, together with the chosen binding. It equals the producer's sealed request. The library refresh is announced.
- AC-IUI-02: Python number lexemes (`1.0`, `-0.0`, 9007199254740993) survive.
- AC-IUI-03: nothing is chosen for the author, including a local profile with the exported name.
- AC-IUI-04: `import_conflict` and `profile_missing` are shown as the binary run returned them. Each is sent once and nothing else is written.
- AC-IUI-05: a late success after another file was chosen, a late refusal after Clear, and a late answer after Close all have no effect.
- AC-IUI-06: open, read, choose and cancel write nothing.
- AC-IUI-07: non-UTF-8, non-JSON, an unknown schema and an oversize file are each refused with their reason.
- AC-IUI-08: a missing capability method and a capability the strict reader refuses both leave import unavailable.
- AC-IUI-09: registration selects nothing.
- AC-IUI-10: identical ids at different addresses are distinct choices, and a payload exists only when every choice is made.

NOT_RUN: these tests, any desktop or visual run, real file-chooser behaviour, light/dark rendering and panel width, embedded Hook Code import, and export UI.

## Increment on the combined pair (c5c01351)

The candidate above (d6d98668) was composed onto c5c01351, the combination that adds Hook-owned Code. Two corrections follow, and nothing else changes.

1. **Address walk.** `import_occurrences` now names an embedded graph only for one of these two exact shapes:
   - `subagent_pool / subagents / source / document`;
   - `hooks_pool / hooks / workflow / document`.
   Any other shape is described as one this build cannot name; it is never guessed. Subagent behaviour is unchanged.
2. **`import_conflict` wording.** The sentence no longer suggests renaming or archiving, because neither frees an id. It still says that nothing was replaced and no new id was made. The host's code, path and message stay as they came.

Tests use `owned_import_producer_capture.json`, a verbatim copy of managed-import-execution-01-20261030 `out/owned-producer.json`. It has three real cases: root Code, Code owned by a Hook, and two embedded Agents each holding a Hook step with the same id. Red runs on the composed d6d98668 source and green runs on this increment.

Support for Hook Code is claimed only on c5c01351; it is not claimed on the older f0292e80 pair.

## Increment: reply ownership (R-IUI-01 / R-IUI-02), base 3b3ad33e

- **R-IUI-01:** a Python registration belongs to the form that sent it, as it stood when sent. Opening the form, cancelling it, or editing either field voids that pending intent. A stale reply therefore never closes, clears or labels the current form; this holds even when the same values are typed again.
  - Any registration success refreshes the list, since the store kept that Python.
  - Nothing is ever selected for the author.
  - The current registration still closes its own form on success and still says its own failure.
- **R-IUI-02:** reads of the Python list are numbered, and only the newest read asked may set the list. An earlier success or failure that answers late is dropped.

Tests:
- The independent probe (`managed-import-ui-independent-01-20261030/tools/independent_import_lifecycle.test.js`) is run as an unmodified copy. It is not part of this patch.
- Five own controls were added, including old-failure-after-Cancel and old-failure-after-edit.
- One existing case ("an import answering after another file…") raced the new file's read. It now waits for the preview.
