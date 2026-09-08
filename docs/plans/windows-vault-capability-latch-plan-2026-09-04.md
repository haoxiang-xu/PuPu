# Plan · Windows Vault capability latch

## BC-W3-001 — main-only qualification receipt → rollout capability latch

Producer: Electron main assembles an exact installed-sidecar provenance proof,
a no-secret supervisor/Job/worker probe receipt, and an exact broker binding.
Consumer: the Unchain main-only capability latch. The renderer, IPC handlers,
preload bridges, and status payload never receive the proof object.

Admission is `CLOSED / VERSIONED`. The receipt is locally sealed only after
each nested object has its exact keys, protocol `1`, containment
`win32_job_list_v1`, recognised unique sink kinds, `x64` architecture, and
canonical `sha256:<64 lower-case hex>` sidecar, immutable Unchain wheel, and
runtime-manifest identities.
Boolean values, lookalike plain objects, unknown keys, wrong protocol, unknown
sink kinds, malformed digests, and any missing producer proof are unavailable.
The public status contains only `{status, reason}` and never a probe receipt,
path, PID, handle, broker credential, or artifact detail.

This source slice deliberately does not alter W3-07's Windows active-rollout
policy. `ready` is a local prerequisite only; the existing Shadow hard cap and
empty W0 sink allowlist remain authoritative until the installed-candidate,
runtime-loss, P6, W4, and release gates are all green.

## SEQ-W3-001 — one app lifecycle

On Windows a new latch starts `pending`. A single sealed receipt before
sidecar start transitions it to `ready`; malformed or absent configuration
transitions it to terminal `unavailable`. Sidecar start finalizes any remaining
`pending` state as `vault_worker_capability_unconfigured`. A structural
containment/provenance loss transitions only `ready → lost`; neither
`unavailable` nor `lost` can return to pending or ready in the same process.
A complete app restart creates a new latch and is the only reprobe boundary.

## Acceptance

- **AC-W3-001:** exact sealed receipt reaches `ready`, while public status
  reveals no receipt content.
- **AC-W3-002:** Boolean and structurally equivalent unsealed objects end in
  `vault_worker_capability_invalid` before rollout admission.
- **AC-W3-003:** missing configuration and structural loss are terminal until
  app restart.
- **AC-W3-004:** Windows sidecar start finalizes unconfigured capability before
  child launch; non-Windows remains `not_applicable`.
- **AC-W3-005:** the no-secret supervisor probe accepts only the exact READY
  frame, the canonical malformed-worker error, and exit `0`; any other frame,
  timeout, spawn failure, or exit reaps the supervisor and remains unavailable.

The deployed installed-candidate proof and W3-05 startup assembly remain
`NOT_RUN`; this plan does not claim W3 completion or authorize a rollout change.

## Local evidence · 2026-09-04

- `windows_vault_capability`, `windows_vault_supervisor_probe`, Memory V2
  startup/readiness, rollout, Unchain, Vault executor, entrypoint, assembly,
  bridge, chat-storage lifecycle, and Context V2 suites: `243 passed / 1 skipped`.
- The main-only Node probe consumed the current local onefile
  `unchain-server.exe` and observed the exact READY frame, canonical malformed
  worker error, and exit `0`.
- An immutable wheel built once from clean Unchain revision
  `1c01772ae807d5650eb031fae65f82e6c71afec1` verified as
  `sha256:e0ba5eeee54e5b3d4ba8700d00b35f6bd8c90f0c33379f0b7d6d7ffba0fbbcf1`;
  its runtime-manifest digest is
  `sha256:2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`.
  The P6 full-leg matrix consumed that wheel in an isolated wheel-site and
  passed `19` checks.

These are source/local evidence only. Exact package/install attestation,
provenance binding in the application, runtime-loss handling, hosted Windows
qualification, and all release promotion gates remain `NOT_RUN`; ticket #195
therefore remains open and Windows remains Shadow/NO-GO.
