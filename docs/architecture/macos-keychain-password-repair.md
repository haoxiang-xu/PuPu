# macOS signing password repair — Release #194

Failure: Release QA 33937729249, immutable rc.7 / be6e0cba4603af7de8827ab12989ad82cf3e4ed4.
The actual app-builder-lib 26.8.1 implementation creates a random keychain password,
but passes the P12 import password to set-key-partition-list. Import succeeds before
SecKeychainUnlock fails. Success on another runner does not establish correctness.

## BC-001 — packaging library → macOS security process

Producer: installed app-builder-lib createKeychain/importCerts; consumer: /usr/bin/security.
CLOSED argv contract: import -P receives each certificate's password;
create/unlock-keychain -p and set-key-partition-list -k receive the generated keychain
password. Preserve apple-tool:,apple: partitions and all existing import/signing failures.
No password values or certificate bytes are written to the implementation report.
The dependency patch accepts only version 26.8.1 and exact original/patched source
bytes. Unknown versions/bytes and partial patches fail installation; no fuzzy fallback.
Root postinstall applies it on dependency installation for both macOS targets.

## SEQ-001 / AC-001

Each build creates and unlocks its temporary keychain, imports application and optional
installer certificates with their distinct P12 passwords, then grants signing access
using the keychain password. Reinstallation is idempotent. Certificate-import failures
still abort; no retry suppresses errors. The library retains its existing lifecycle.
Regression executes the actual dependency module with a strict security-command fake:
original source must reproduce the password mismatch; patched source must pass for two
different P12 passwords; changed bytes/partial patches must be rejected.

Local result: postinstall applied and verified the bounded patch. All 12 focused
tests passed (dependency regression, signing boundary and publication workflow).
GitNexus refreshed at be6e0cb; dependency symbols createKeychain/importCerts are
outside its index (UNKNOWN). Direct source inspection confirms MacPackager's call
to createKeychain and its call to importCerts. The graph diff finds no indexed
symbol edits: the repository changes add a patch/test/plan and package metadata.

## AC-002 — delivered artifact evidence

NOT_RUN until the owner commits/pushes this repair and selects an immutable candidate.
Run the macOS ARM/Intel signed candidate jobs with the same immutable Unchain wheel
and runtime manifest used by that candidate. Retain candidate/sidecar identities and
signing/notarization results. Existing rc.7 success does not test this new repair.
Chat, interaction, resume, graph and deletion state matrices are N/A for this
build-tool-only credential projection; no app runtime behavior changes.
