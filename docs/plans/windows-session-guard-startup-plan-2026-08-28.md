# Plan · Windows session guard startup recovery

## BC-010 — Electron userData → Python session-guard protocol marker

Producer: Electron passes `UNCHAIN_DATA_DIR` to the Python sidecar. Consumer:
the Python session guard creates and strictly validates its closed v1 protocol
marker. The durable marker shape and migration receipt are unchanged. Windows
must establish its own process identity with a handle-sized Win32 API result
before it can write the marker; for the current sidecar process it uses the
non-closeable `GetCurrentProcess` pseudo-handle, while foreign-PID checks still
use `OpenProcess`; failure remains fail-closed.

Admission is **CLOSED**. The protocol marker must have exactly `schema`,
`protocol_version`, and `compatibility`; the launcher receipt must have exactly
`schema`, `version`, `status`, and `protocol_version`. Unknown fields, an
incompatible version, unreadable durable state, unavailable Win32 identity, or
an unavailable lock all fail closed; the public receipt remains content-free and
uses only `ready`, `migration_required`, or `unavailable`.

The evidence binds the exact PuPu candidate to the one deterministic Unchain
wheel SHA-256 and imported runtime-manifest digest recorded in the same Release
QA report. The Windows smoke runs under the same Python interpreter installed
from that wheel and is itself a required reported check; source revision is
provenance only.

## SEQ-010 — fresh start and restart

With a fresh `UNCHAIN_DATA_DIR`, the actual `main.py` sidecar starts, exposes
an authenticated `/health` receipt, and creates the exact protocol marker. A
second registry in the same data directory validates the existing marker
without migration. A Windows release runner executes this sequence with the
same Python environment used by Electron Playwright.

The required matrix is: fresh start; existing marker/repeat start; unavailable
identity or lock (fail closed); a cold sidecar restart with durable resume/replay
covered by the Windows Electron Playwright suite. The startup-only smoke is not
evidence for a successful retry, resume, or external effect by itself.

## Acceptance criteria

- **AC-021:** Windows process identity binds `OpenProcess` and `CloseHandle`
  as `HANDLE` APIs and successfully derives a stable identity token.
- **AC-022:** A fresh Windows user-data directory produces the exact v1 marker;
  restarting validates that marker and does not require migration.
- **AC-023:** Invalid or unavailable Win32 identity/lock operations remain
  fail-closed and do not loosen the receipt contract.
- **AC-024:** Windows Playwright proves a cold app restart can restore pending
  durable state after the startup smoke has passed, using the exact candidate,
  wheel SHA-256, and imported runtime-manifest digest reported by Release QA.
- **AC-025:** The startup smoke invokes the same `main.py` entrypoint and
  authenticated health boundary as the sidecar; a direct registry import alone
  is not accepted as release evidence.

## BC-011 — transient health receipt → Electron startup admission

Producer: the Python sidecar publishes the existing exact four-field
`session_guard_migration` receipt through authenticated `/health`. Consumer:
Electron validates the closed receipt and decides whether the sidecar may enter
the ready state. The wire shape and status vocabulary remain unchanged.

Admission remains **CLOSED**. `ready` admits startup, `migration_required`
enters the existing one-shot stop-the-world sequence, and invalid shape/version
fails immediately. A well-formed `unavailable` observation is fail-closed but
retryable only inside Electron's bounded 60-second startup window; it never
admits the runtime and a persistent failure remains terminal after the budget.

## SEQ-011 — transient unavailable receipt recovery

Starting from one live managed sidecar, Electron may observe a well-formed
`unavailable` receipt while the durable guard marker/lock is temporarily not
ready. Electron keeps the same process and identity, retries authenticated
health, and admits only a later exact `ready` receipt. Invalid receipts and
`migration_required` do not use this retry branch. If every receipt remains
`unavailable` until the startup deadline, Electron stops the sidecar and keeps
any durable migration intent for a later safe retry.

- **AC-026:** `unavailable → ready` performs at least two health reads, spawns
  exactly one sidecar, and reaches `ready` without creating migration intent.
- **AC-027:** a permanently `unavailable` flagged start exhausts the bounded
  budget, remains fail-closed, and retains the exact durable intent.
- **AC-028:** malformed, unknown-field, wrong-version, and
  `migration_required` receipts retain their existing immediate closed
  handling; transient retry cannot loosen their admission policy.
- **AC-029:** the cross-platform startup smoke uses a 60-second cold-start
  budget matching Electron and reports only content-free last receipt status
  on timeout.

## Local evidence · 2026-08-28

- AC-026/027/028: Electron handshake tests passed (93/93), including red-before-
  green evidence for `unavailable → ready` and bounded permanent-unavailable
  failure.
- AC-029 and the Python producer boundary: health/guard tests passed (19/19).
- Exact UI consumer path: the two release Playwright targets passed locally
  (2/2).
- Release reporting/workflow contracts passed (155/155). Remote Windows and
  macOS runner evidence remains `PENDING` until the patched commit is pushed
  and a new Release QA run completes.
