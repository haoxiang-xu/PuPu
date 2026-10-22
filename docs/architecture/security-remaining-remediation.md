# Remaining security remediation

Baseline: PuPu dev `dbf055d4b71e2a6a7d7844df1490d5357bc4b44b`.
Authorized scope: remediate remaining security findings and vulnerable dependencies;
preserve application behavior, signing and immutable release artifact continuity.
New candidates require review before merge or rollout.

## Cache authority (#440)

Operator-selected Unchain source executes during wheel construction. A pinned SHA
establishes identity, not trust. On default-branch dispatch, the job previously
received cache-write authority that could outlive its read-only GitHub token.

- BC-001: Release QA and its reusable deterministic workflow cap cache tokens at
  `read`. Cache restores remain available; selected code cannot save caches.
  GitHub enforces the caller's cap through reusable workflows. Contents/actions
  permissions and release environment/signing boundaries remain unchanged.
- SEQ-001: Before any checkout, reject effective cache authority other than
  `read` or `none`. Run normal deterministic QA with cold or warm caches, preserving
  the exact wheel, feature snapshot and candidate identity.
- AC-001: YAML contract and actual guard shell reject missing/writable authority.
  Candidate CI must demonstrate the runner's effective authority and complete QA.
  Do not poison a shared cache to test the defense.

The current CodeQL cache-poisoning query models trigger trust, not `cache-mode`.
A surviving alert requires comparison with runtime evidence, not concealment of
the selected source or an unsupported claim that a pinned SHA is trusted.

## Credential boundary (#321, #322)

Pending implementation: retain synchronous renderer reads in volatile memory,
store durable credentials only through the encrypted native write bridge, and
exclude all provider secret fields from settings serialization. Cover migration,
rotation, deletion, concurrent writes, unavailable secure storage and restart.

## Dependencies

Audit both npm's complete lockfile and Python's resolved dependency closure.
Do not force incompatible owner replacements merely to hide advisory nodes.
Preserve the bounded macOS keychain password fix when upgrading app-builder-lib.
