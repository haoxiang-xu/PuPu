# MCP credential encryption — PR #376 follow-up

Scope: eliminate plaintext at rest for MCP manual secrets, OAuth tokens and
OAuth application client secrets. Preserve the Python APIs and normal MCP and
one-shot Vault-worker usage. Provider localStorage migration and CodeQL false
positive suppression are separate work. User authorizes pushing the verified
change to dev; no release/active rollout is authorized by this change alone.

## Contract

- BC-001 (VERSIONED, closed envelope): Python credential writers → durable
  `mcp_secrets.json`, `mcp_oauth_tokens.json`, `mcp_oauth_apps.json` → sidecar and
  one-shot worker readers. V1 `{version:1, toolkits|apps:{...}}` is the legacy
  input. V2 has exactly format/version/profile/store/nonce/ciphertext. AES-256-GCM
  authenticates the format, version, canonical profile identity and filename.
  The decrypted v1 root has a closed key set; record dictionaries retain their
  existing extension fields. Unknown versions/fields, malformed JSON, wrong
  identity or authentication failure reject without overwriting data (AC-001/002).
- BC-002 (CLOSED): Python → explicitly selected native OS credential service.
  A random 32-byte data key is stored only in macOS Keychain, Windows Credential
  Manager or Linux Secret Service. No ambient keyring plugin/config selection,
  plaintext-file backend, environment key or fallback. A per-profile OS file
  lock protects key creation and read/modify/write across processes. Missing key
  for existing ciphertext is an error, never a reason to create a new one
  (AC-003/004). This protects data files at rest, not a compromised OS account.
- BC-003 (VERSIONED artifact): sidecar packaging must include the pinned keyring
  native backends and cryptography. No Electron↔Unchain wire or runtime manifest
  change. Native/frozen OS smoke is required before release. Linux without Secret
  Service (including KWallet-only setups without a Secret Service interface)
  reports unavailable; it must not silently write plaintext (AC-005).
- BC-004 (CLOSED worker environment): Electron forwards the host's
  `DBUS_SESSION_BUS_ADDRESS` to the one-shot worker, so Linux Secret Service
  resolves the same session bus. Backend override variables and unrelated
  secrets remain excluded. The existing `.js` test entry delegates to `.cjs`.

## Sequences

- SEQ-001: no file → first save → second save → cold process read → delete →
  repeated delete. Empty/nonexistent stores need no keystore (AC-001/004).
- SEQ-002: v1 file → native key persistence/readback → AEAD encrypt/decrypt
  verification → ciphertext-only 0600 temp file → fsync → atomic replacement.
  Startup migrates all existing MCP stores; reads retry migration. Failure keeps
  original bytes for retry; no plaintext backup/temp copy is created. Never
  promise secure erasure of filesystem snapshots or external backups (AC-002).
- SEQ-003: concurrent first writers, concurrent different-toolkit updates,
  OAuth refresh/reconnect/cancel/rollback, worker reopen and uninstall after a
  keystore error. Failed credential deletion must not report successful toolkit
  removal (AC-003/004).
- SEQ-004: locked/unavailable keystore, missing key, corrupted envelope,
  cross-store/profile substitution, legacy file after migration, restart and
  retry (AC-002/003). Old binaries cannot read v2; rollback requires the prior
  application plus explicit credential re-entry, not a retained plaintext copy.

Normal/graph/subagent paths use the same Python MCP helper. Chat interaction
protocol and provider replay serialization are unchanged (N/A); repeated MCP
use, OAuth refresh and cold worker reopen are applicable and tested. Whole
candidate + fixed Unchain wheel SHA/manifest digest and native Windows/Linux
packaged qualification remain required before active rollout, not inferred from
source tests. Record NOT_RUN rather than promoting local tests to release proof.

## Acceptance / evidence

- AC-001: existing install/configure/status/runtime/OAuth/delete regressions;
  synthetic credentials absent from every store/temp file while decrypted
  values remain byte-identical (including Unicode/whitespace).
- AC-002: strict malformed/version/identity/authentication negatives; atomic
  migration failure/retry; corruption never becomes empty state or clobber.
- AC-003: unavailable/missing key fails closed; no key regeneration; concurrent
  processes preserve both records and the same key; native backend selection.
- AC-004: first/second/restart/worker/OAuth cancellation/uninstall sequences.
- AC-005: dependency imports, packaging configuration and native/frozen smoke;
  exact release artifact pair qualification remains separately recorded.

Pre-edit GitNexus index: this isolated worktree at 8753e9e; credential readers and
writers LOW/MEDIUM, no enriched execution processes returned. UNKNOWN dynamic
OAuth app callers confirmed in route_mcp.py and routes.py. Red-before-green:
calling save_mcp_secret_values with a synthetic marker fails the assertion that
the marker must be absent from mcp_secrets.json on the original revision.

### Candidate verification (2026-09-29)

The original plaintext trigger no longer reproduces: manual values, OAuth tokens
and client secrets use the same AEAD boundary; migration and write-failure tests
inspect the real disk bytes. Normal values, OAuth refresh/callback/rollback,
runtime construction and deletion retain their public behavior. Missing-key
uninstall keeps the installed record and succeeds on recovery/retry.

- Syntax/diff: Python imports and pytest collection passed; `git diff --check`
  passed. No frontend API or broker decryption endpoint was added.
- Focused security and compatibility: `python -m pytest` on
  `test_mcp_credential_store.py`, `test_mcp_secrets.py`, `test_mcp_oauth.py`,
  `test_mcp_toolkits.py`, `test_vault_sink_worker.py`: **170 passed, 1 skipped,
  13 subtests passed**. Includes 26 new storage regressions and independent
  processes racing on first key creation. The native keychain alone is replaced
  by a test double in unit tests; AEAD, migration, files and locks are real.
- Full sidecar suite: **2628 passed, 17 skipped, 3597 subtests passed** initially;
  two child-process tests failed because `PYTHONPATH` is intentionally removed.
  Set the absolute `UNCHAIN_SOURCE_PATH` to the same installed wheel, then reran
  both owning modules: **26 passed, 11 subtests passed**, no code changes needed.
- Electron worker environment suite: **35 passed** with the repository's Jest
  runner. Session bus reaches the child; unrelated secrets and keyring backend
  overrides do not. Independent review found this Linux compatibility issue;
  it was confirmed against the actual Jeepney lookup and corrected.
- Real macOS Keychain: synthetic save/read/delete passed. PyInstaller 6.22.1
  onefile smoke using the production credential modules passed save, cold
  process read, ciphertext inspection and native-key cleanup. This is a focused
  frozen-module test, not a whole-app release qualification.
- One fixed Unchain wheel built once from clean revision
  `973ecfef4ba1b35d1a0bab8b757e1b53ea8031d1` and reused for the Python checks:
  artifact SHA256 `994738910b73abcf8bbb817320832398728b8d91742d9659a8853cc54a981f7a`,
  runtime manifest SHA256
  `84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`.
- GitNexus reindexed the candidate and `detect-changes --scope all` covered all
  14 changed files / 67 symbols with no partial/truncated result. The CLI's
  display only prints 15 symbols, so the underlying LocalBackend result was
  also inspected directly. Change summary is LOW; the refreshed upstream
  impact for deletion is CRITICAL (145 processes), so deletion only propagates
  credential-store errors and otherwise preserves its prior compatibility.
- NOT_RUN: native Windows/Linux credential services and complete installed
  application artifact-pair qualification. These remain release gates; no
  active rollout or claim of original PR CodeQL checks passing is made here.

Development runs must install the updated server requirements and restart the
Python sidecar. Existing v1 credentials migrate on startup or first access;
there is no plaintext downgrade or backup. A locked/unavailable native service
keeps legacy bytes untouched for retry and does not report migration success.
