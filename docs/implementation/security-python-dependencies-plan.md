# Python dependency security maintenance

Candidate baseline: `dbf055d4b71e2a6a7d7844df1490d5357bc4b44b`.
Scope: patch the six vulnerable sidecar dependencies and the separately resolved
Fetch, SQLite and local Zotero MCP recipes. Keep the supported MCP 1.x API,
credential ciphertext format and existing tool permissions. Unrelated recipes
retain their original dependency cutoff.

## Contracts

**BC-001 — sidecar dependencies and Unchain runtime.** Producer: the pinned
sidecar requirements plus the single immutable CI wheel. Consumer: Python 3.12
sidecar, including the installed Unchain MCPToolkit and runtime protocol module.
Admission is VERSIONED: the imported runtime manifest remains authoritative;
the source revision is provenance only. MCP remains 1.x. AESGCM ciphertext,
nonce, profile/store AAD and encrypted-store schema do not change. SDK schema
references outside the server-supplied document must fail before file/network
access; local references continue to work. Map to AC-001 through AC-004.

The exact wheel is `unchain-0.2.0-py3-none-any.whl`, from PuPu CI artifact
`12456171375`, run `39847751620`, built from Unchain
`4e9d8c3bb228874bd81e4d80ea1905d4aa71110c`:

- Wheel SHA-256: `0a04b5ef427fe7bfe8b0e024b3f4264519614b000834d4419fbd372362d9d00c`.
- Imported manifest digest: `sha256:b163345c68666cc2dbe766a3a8e75da0246748def8fa9b1be75f446d9148da3f`.

**BC-002 — curated recipe to stdio runtime.** Producer: the built-in registry
and local Zotero profile. Consumer: managed uv/uvx executing their literal
argument arrays. The optional per-entry `dependencyPolicy` is CLOSED, accepts
only a canonical UTC `cutoff`, and requires exactly one matching execution
flag. Existing entries remain compatible without this field. Schema, build
validator and sidecar normalizer reject unknown policy fields, malformed dates
and conflicting cutoff flags. No fallback to unpinned MCP 2.x is permitted.
Map to AC-005 and AC-006.

**SEQ-001 — cold sidecar restart.** Identity: the same isolated profile and
immutable wheel. Start the real `main.py`, verify authenticated health and
anonymous rejection, terminate normally, then start a second fresh process
against the same state. The imported runtime manifest and ready session-guard
receipt must remain identical. No migration or ciphertext reset is introduced;
existing credential migration/reset/concurrency tests remain applicable.
Map to AC-002 and AC-004.

Chat first/second-message, interaction, retry and graph state transitions are
unchanged by these package pins; the full sidecar regression suite exercises
their existing contracts. Real-provider inference is not part of this change.

## Acceptance evidence

- **AC-001:** all marker-resolved runtime closures audit with zero known
  advisories: macOS ARM64 77 packages, Linux x64 76, Windows x64 75. All direct
  pins install with the wheel, `pip check` passes, and the actual imported
  wheel/manifest match the identities above.
- **AC-002:** full sidecar suite: 2,814 passed, 17 skipped, 3,612 subtests.
  Focused dependency, credential, TLS, registry and managed-runtime checks:
  134 passed, 27 subtests. These use the installed wheel with explicit
  `UNCHAIN_SOURCE_PATH` pointing to the isolated venv's site-packages.
- **AC-003:** the public MCP `call_tool` boundary rejects both malicious HTTPS
  and file schema references without URL reads; a valid document-local `$ref`
  succeeds and invalid structured content fails. The same regression fails
  with the old MCP 1.26.0 installed separately. Real RGB screenshot resize and
  PNG encode/decode preserve color and dimensions with Pillow 13.
- **AC-004:** after Python changes, two isolated real sidecar starts completed;
  each returned authenticated `/health` 200, anonymous 401 and a ready
  session-guard receipt. Both used the same manifest digest above and shut
  down normally. Only the test harness substitutes `Path.home()` to a temporary
  directory so seed writes cannot touch the developer's profile. No GUI
  instance or model/provider inference was used.
- **AC-005:** build registry validator 13 tests passed; frontend registry
  34 tests passed. Negative cases cover malformed dates, unknown policy fields,
  mismatched and duplicate cutoff flags; existing unaffected recipes pass.
- **AC-006:** exact recipe commands negotiated MCP `2025-11-25`: Fetch read a
  local ephemeral HTTP fixture, SQLite read a synthetic row from its temporary
  database, and Zotero exposed exactly two read-only tools. The pinned Zotero
  profile tests passed 9 tests and 20 subtests. Complete recipe closures audit
  with zero known advisories for macOS/Linux/Windows respectively: Fetch
  43/43/44 packages; SQLite 37/37/39; Zotero 82/84/86.

Local evidence covers dependency resolution for all target markers and actual
macOS processes. Native Windows/Linux frozen executable and packaged artifact
checks remain CI requirements before rollout. The notices generator enumerated
the installed packages, but bundled MCP runtime staging was absent locally;
that section was explicitly skipped and must be generated in packaging.

Delivery is a candidate for review. Active rollout remains INCOMPLETE until the
required CI and packaged-platform checks pass; this plan does not authorize a
merge or release publication.
