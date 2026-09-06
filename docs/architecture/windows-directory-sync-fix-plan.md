# Windows object-store directory sync repair

Scope: repair `PermissionError: [Errno 13] ... production_runs_v1/objects`
in the imported sibling unchain runtime. No database schema, wire format,
protocol manifest or ownership identity changes. No production release requested.

## Contracts and sequences

- BC-001: PuPu production ownership factory -> unchain SQLiteContextV2Store
  through the Python package boundary. CLOSED admission remains the existing
  strict runtime/identity validation. Paths remain Path values; run identities,
  canonical serialized provider requests/results and receipts remain unchanged.
  Unknown fields/versions/identities retain existing rejection behavior. Runtime
  manifest must come from the actual imported wheel, with its digest recorded
  alongside the one reused wheel SHA-256. AC-001: real PuPu ownership/replay tests
  against that wheel. AC-002: existing negative identity/admission tests.
- BC-002: the three unchain SQLite stores -> filesystem CAS objects and SQLite
  references. CLOSED format: exact bytes, SHA-256 names and recorded byte lengths;
  corrupt or missing content is rejected. File flush/fsync, hard-link publication,
  SQLite FULL synchronization, validation and error propagation remain intact.
  Windows skips only the unsupported POSIX directory-open/fsync operation;
  POSIX directory-sync failures still propagate. This does not claim a new
  Windows power-loss/directory-metadata durability guarantee. AC-003: native
  Windows first/repeated/second write and reopened-store byte verification for
  all three stores. AC-004: file-sync failure propagates without publishing an
  object; POSIX descriptor closes on success/failure; Windows never opens a
  directory through os.open. AC-005: existing integrity and scope tests.
- SEQ-001 (BC-002, AC-003/004/005): empty temporary store -> first bytes -> repeat
  same digest -> different second bytes -> reopen -> exact original bytes.
  Corruption and sync failure must not be acknowledged as success.
- SEQ-002 (BC-001, AC-001/002): execution/attempt/run identity -> first provider
  result and receipt -> discard factory -> cold reconstruction -> replay with
  zero provider resend and one canonical receipt. Normal/graph ownership paths
  use existing wiring tests; retry/resume covered where selected tests exercise
  them. Interaction-specific state and reset are outside this file-sync-only
  change; no interaction routing/schema changes. Physical power-loss testing is
  NOT_RUN and no stronger crash-durability claim is made.

## Evidence

GitNexus unchain index rebuilt at current HEAD. All three `_fsync_directory`
methods have LOW risk and one direct `_install_object` caller each. Context has
5 impacted symbols (provider wire/result persistence), memory 3 (workspace apply),
curator 3 (candidate persistence). PuPu factory impact reports LOW, direct importer
unchain_adapter.py; PuPu index was one commit behind, source wiring inspected.
The index reports global process enumeration limits; no absent process is treated
as evidence that a path is unused.

Before fix: the new regression file reports 6 failed / 9 passed on Windows;
three real object writes reproduce Errno 13 and three Windows API checks fail.
Post-fix and fixed-wheel integration results will be recorded below.

- Post-fix native Windows regression + context/memory/curator repository suites:
  **68 passed** (34.68s), using PuPu `.venv/Scripts/python.exe -m pytest`.
  The new regression file contributes 15 cases; before repair 6 failed.
- Built once with `pip wheel --no-deps --no-build-isolation F:/GIT/unchain`:
  `unchain-0.2.0-py3-none-any.whl`, SHA-256
  `e1dad3cd135d814cef3bba55c6f19877e3d0f1925c7797701e68f2de3774bc49`.
  Installed in an isolated temporary target under
  `C:/Users/Haoxiang Xu/AppData/Local/Temp/pupu-directory-sync-20260905/runtime`.
  Actual import path verified there; PuPu independently normalized/validated
  the imported runtime manifest, digest
  `sha256:2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`.
- Same fixed wheel + current PuPu source: **33 passed** (3.64s) across
  `test_production_run_ownership.py`, `test_production_run_ownership_wiring.py`,
  and `test_context_memory_v2_runtime_protocol.py`. Includes cold replay without
  provider resend, canonical receipts, graph ownership, and negative admission.
- Original read-only directory-sync reproducer against the user's actual
  `production_runs_v1/objects` now passes using the normal editable runtime.
- GitNexus change analysis: 3 production files, 6 symbols (3 methods plus
  containing classes), 3 expected persistence flows, aggregate MEDIUM risk.
  New test file inspected separately (untracked files not included by analysis).
  `git diff --check` passes. No commit created.
- Running application sidecar has not been restarted; restart PuPu to load the
  repaired editable runtime. Packaged release validation remains outside this
  local repair; no release artifact or live account request was published/sent.

Active packaged rollout is not performed by this repair task. A packaged release
still requires the release contract matrix and package smoke on its exact pair.
