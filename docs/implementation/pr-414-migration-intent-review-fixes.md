# PR #414 migration-intent review fixes

## Scope and risk

Fix the reviewed Windows symlink admission and POSIX FIFO blocking regressions in the pending migration-intent reader. Keep the intent schema, migration authority and sidecar protocol unchanged. Update #414 and then merge its new head into the stacked #416 branch without rewriting either branch.

GitNexus is bound to `/Users/red/Desktop/GITRepo/pupu-pr414-fix`, initially indexed at `8e7029591cd1be4b6f53e66602d15e3a372d4613`. The reader and producer have HIGH upstream risk: `startMiso`, intent persistence/consumption, restart, boot readiness and installed-runtime QA depend on them. Tests have no resolved graph callers; their `.js` and renderer test entrypoints explicitly require the canonical `.cjs` suite.

## BC-001: main-process migration-intent persistence

- Producer: `persistPendingIntent` in Electron main; atomic rename of a private temporary file.
- Boundary: `.pupu-main/session_guard_migration_intent.json` in the application's data directory.
- Consumer: `readPendingIntent`, used by startup and explicit consumption.
- Canonical and consumer shape: exactly `{schema: "pupu.session-guard-migration-intent", version: 1, state: "pending", protocol_version: 1}`. Admission is CLOSED; unknown keys, wrong values, symlinks and non-regular files are invalid.
- Filesystem admission: open one descriptor, then require the current pathname to be a regular non-symlink with the same bigint device/inode identity as the descriptor. Read JSON only through the checked descriptor. Add nonblocking open on platforms that support it so an existing FIFO, or one swapped in during open, cannot hang startup.
- Failure policy: an absent path is not pending; unreadable state is unavailable; malformed, non-regular or replaced state is invalid. Every opened descriptor closes even on failure. No invalid state authorizes the stop-the-world flag.
- Compatibility: schema and protocol version remain 1. No Unchain or Python change. The changed artifact is Electron main JavaScript; its file producer and strict consumer run together in the real-filesystem tests. Native Windows evidence remains distinct from simulated missing-POSIX-constant coverage. Installed PuPu/Unchain wheel-pair acceptance is NOT_RUN for this PR-only correction; no active rollout is authorized by these tests.

## SEQ-001: durable intent lifecycle

Identity: application data path plus the exact four-field intent. Initial state is absent.

1. Read absent state: false, no migration authority.
2. Persist with the real producer: exact private JSON, read true.
3. Repeat persistence/read: valid and idempotent.
4. Recreate the controller against the same data path: pending state survives a host restart.
5. Consume explicitly: file removed, subsequent read false; repeated consumption is harmless.
6. Replace with symlink, FIFO or another file during open: reject without authorization; close any descriptor.

Mappings: BC-001 → AC-001 through AC-006 below. Chat, interaction, provider and graph/subagent state matrices are N/A because this change is confined to main-process startup intent admission and does not consume a chat/run/interaction identity. Sidecar resume/replay behavior is unchanged.

## Acceptance and evidence

- AC-001: real producer/consumer lifecycle, repeat persistence, controller recreation and repeated consumption work with and without POSIX-only constants.
- AC-002: a symlink to otherwise valid JSON is invalid when `O_NOFOLLOW` is absent.
- AC-003: native POSIX FIFO is rejected promptly in a child process; a FIFO swapped in during open also cannot block.
- AC-004: replacing the path after open is invalid and the descriptor is closed exactly once.
- AC-005: exact schema rejection remains covered by the malformed-state tests; add explicit wrong-version/unknown-key cases.
- AC-006: focused tests fail before the fix, pass afterwards; full Electron suite, real Electron-Node filesystem probe, CodeQL filesystem-race query and full GitNexus change analysis precede commit/push.

## Validation results

- RED on the original #414 head: 4 failures and 13 passes. Missing-`O_NOFOLLOW` symlink admission, post-open path replacement, an existing FIFO and a FIFO swapped in during open all failed their regression assertions.
- GREEN: all 17 migration tests pass. The canonical `.cjs` suite is required by both existing `.js` entrypoints; the renderer test entrypoint also passed all 17 assertions.
- Full `npm run test:electron`: 56 suites pass, 984 tests pass, 5 existing tests remain skipped. No new test is skipped; FIFO scenarios are defined only on POSIX because Windows has no filesystem FIFO at this path.
- The same 17 migration tests pass under the installed Electron binary with `ELECTRON_RUN_AS_NODE=1`, exercising Electron's actual Node/filesystem runtime without launching an application profile.
- CodeQL 2.27.3 / `codeql/javascript-queries@2.4.8`, `Security/CWE-367/FileSystemRace.ql`: zero results in the changed production module. The remaining seven query results are in existing test/harness code; none is on a newly added line.
- Final full GitNexus `detect_changes` is retained with the delivery evidence and must be complete before either commit. Artifacts, RED/GREEN logs and the CodeQL SARIF are in `/Users/red/.codex/artifacts/pupu-pr-review-20261022/`.
- Native Windows and installed PuPu/Unchain application acceptance: NOT_RUN. Missing-constant tests are portable simulations, not native Windows evidence. No Python sidecar or Unchain artifact was changed, and no running instance was restarted.
