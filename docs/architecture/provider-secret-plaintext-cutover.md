# Provider credential plaintext cutover

Scope: CodeQL #321/#322; baseline dev dbf055d4b71e2a6a7d7844df1490d5357bc4b44b.

- BC-001 (VERSIONED existing write bridge): renderer session mirror produces
  `{kind, ownerId, plaintext}` through preload to the native encrypted SQL setter.
  Existing target allowlists, validation and response metadata remain closed;
  no read/decrypt IPC is introduced. Only `stored` acknowledges a durable save.
  Unavailable encryption throws without deleting prior ciphertext. An absent
  native bridge permits volatile session use but returns `ok:false`, session-only.
- BC-002 (CLOSED settings persistence): the four provider secret fields never
  enter a newly serialized settings root. Synchronous readers use session memory.
  Legacy fields are removed only after every owner has a durable acknowledgement.
  A pending legacy migration blocks a fallback root rewrite rather than losing a
  user's only recoverable credential or reserializing plaintext. Other namespaces
  and provider definitions remain unchanged. Corrupt roots are not overwritten.
- SEQ-001 / AC-001: import old plaintext → same-identity FIFO encrypted writes →
  live identity authority → scrub old root → cold restart from encrypted SQL.
  Already-configured SQL owners win over stale legacy mirrors. Completed old
  migration metadata with missing SQL owners must still recover those owners.
- SEQ-002 / AC-002: rotate/clear during migration, concurrent edits, failed write,
  unavailable keychain, reset, quit drain and restart. Newer writes retain queue
  precedence. Failed encryption preserves old ciphertext and reports failure;
  unacknowledged legacy data remains for a later healthy native launch.
- BC-003 (OPEN bootstrap response extension): `clearedCredentials` is an optional
  identity-only array. Native deletion writes its tombstone in the same SQL
  transaction as row deletion; a verified replacement clears the tombstone in
  its write transaction. Preload transports the existing bootstrap response;
  renderer defaults a missing field to an empty array. No secret or ciphertext
  is exposed. SEQ-003 / AC-004: migration succeeds for A but fails for B → clear A
  → restart while legacy root still contains both → do not read/reimport A;
  recover B when healthy. Also cover clear during pending migration, clear then
  replace, and crash after native commit before renderer cleanup. Browser-only
  clear succeeds only if its legacy bytes can actually be removed.
- BC-004 (VERSIONED existing migration channel): `migrationVersion:2` accepts
  exactly one official or custom credential in the existing envelope. It
  verifies an existing ciphertext without replacing authoritative SQL with a
  stale mirror, or encrypts/verifies a missing owner. Tombstones return deleted.
  Results contain only identity/status, never plaintext/ciphertext. Unknown
  fields, multiple targets, invalid identities and empty values are rejected.
  V1 bulk replay remains supported; an older main rejects V2 and keeps the
  legacy backup. SEQ-004 / AC-005 cover existing valid SQL, unreadable SQL,
  missing SQL, stale mirrors and unsupported/invalid versions. Only V2-verified
  owners, newly verified writes and durable clears authorize legacy removal.
- AC-003: synthetic sentinel keys must be absent from every observed settings
  write. Test official/Gemini/custom identities, injected fields through unrelated
  namespace writes and deletes, invalid values, detached custom clones and failed
  migration. Prove normal request injection and existing descriptor behavior.

Rollout remains INCOMPLETE until candidate frontend/main tests and hosted QA pass.
No Python wire or Unchain capability changes: existing immutable release wheel
continuity applies to candidate QA; no local model inference is needed.
If secure storage cannot be made available, historical plaintext remains
migration-pending rather than being discarded. New plaintext is never durably
written and the UI must not claim a secure save.
