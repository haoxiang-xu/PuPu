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
