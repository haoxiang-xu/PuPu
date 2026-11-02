# #357 offline execution environment qualification (QA only)

This branch never merges into dev. Product source, credential policy, frozen
guards, original workspaces and accepted candidates remain unchanged. It repairs
the missing QA environment, not production admission. No local App/Main launch.
Only a disposable hosted Linux user may run the probes. One heavy family at a
time; wait for Claude's explicit release before build/hosted dispatch.

## Artifacts

Reuse Core e0d2eb5e09976def467da7f32f2b0482b48c2ffd, wheel
17b04aea25489e72eb4e6ab03a131f470bdcddf65f9e8a4eec757d9bfcbfe47c
(run41262234256), and sidecar
e0162fc116e3f2970c67bc6c5458d1a305e6404dbb11b6e22db25897cad77ff6
(run41263562114). The manifest is
sha256:827adc5644e00dbb8e67fe5ecf6f7e88d9f542b1c4aff37744e0311c0acc2fe3.
No rebuild or silent pair replacement. Source revision is provenance, never
runtime admission. The first qualification does not run an Agent or replace the
pending real App execution criteria.

## BC-QA357-001: real SDK to local protocol fixture

Producer: installed openai==2.7.1 SDK, later the unchanged sidecar's native
transport. Consumer: an explicit HTTPS fixture at 127.0.0.1:443 inside a new
Linux network/mount namespace, using a temporary CA/leaf for api.openai.com.
The namespace shadows only its own hosts/resolver files; no external interface
or route exists. TLS verification stays enabled. No real key or provider.

Fixture configuration is CLOSED and versioned. The SDK body is OPEN: preserve
the complete original bytes and digest, validate only the scenario's explicit
method/path/authority/sentinel/model/output reservation/marker/stream identity,
and do not invent a closed provider-request schema. Unknown body extensions
remain opaque. Wrong identity or malformed wire is refused before a response.
Only the fixed non-key sentinel is accepted; never accept an arbitrary secret.

AC-QA357-01: the real SDK consumes a finite JSON response and a finite Responses
SSE sequence, receiving the exact declared text and consistent response/item
identity. AC-QA357-02: wrong authority, method, path, credential, model, output
budget, marker and malformed JSON fail at their intended boundary. Wrong TLS
hostname fails TLS verification. Off-namespace connections have no route.

## BC-QA357-002: real Linux secret service to production settings storage

Producer: one private D-Bus session and a tracked gnome-keyring process belonging
to the disposable user. Consumer: unchanged Electron safeStorage and unchanged
createSettingsStorageService, with real app/fs/path/node:sqlite dependencies.
The real provider writer stores only ciphertext. The private sentinel round trip
must succeed before App execution; basic_text/unknown stay refused. No plaintext
fallback, mocked readSecret, new IPC or altered production security control.

AC-QA357-03: secret-tool's real private-service write/read control succeeds;
production settings writer and main-internal reader agree; a second Electron
process cold-reads the same value; bootstrap and database bytes contain no
sentinel. A separate basic-backend profile is rejected by the real producer.
Receipts contain booleans and identities, not the plaintext or ciphertext.

## Sequences and scope

SEQ-QA357-001: empty private profile -> write -> close -> new Electron process
read -> close; separate basic-backend refusal leaves the positive profile alone.
SEQ-QA357-002: JSON response -> streamed response -> explicit negative requests;
no unexpected extra accepted calls. All children are tracked and cleaned up.
App send/resume/cold-run retention remain NOT_RUN in this foundation. Earlier
140-case and32-request evidence is reused only for its declared scope.

All new tool symbols and the QA workflow have UNKNOWN index impact (new files or
non-code workflow). Text binding is explicit: only this branch's dispatch-only
workflow consumes tools/qa357. No existing product consumer imports them.
Fresh graph change analysis is still required before a QA delivery commit.

## BC-QA357-003: finite native function-call protocol qualification

The frozen environment foundation remains on branch
codex/ticket-357-execution-control@865a6543215aadaa1fa78039037843caeae03840.
This separate QA branch adds a tool protocol qualifier before any App execution.
Producer is the installed openai==2.7.1 SDK. Consumer is tool_fixture.py in the
same disposable Linux-only TLS namespace; credential storage is still the real
unchanged production writer/private GNOME service. No production file changes.

The scenario is CLOSED qa357.tool-fixture.v1, including the exact function name,
call id, JSON argument object and expected output string. The provider request
remains OPEN; unknown extensions are retained verbatim. The offered function
must be unique and match. After the finite function-call SSE, only one matching
function_call_output advances to the final response. Wrong, missing, duplicate,
premature or replayed results are refused without advancing state. Optional SDK
defaults may be added by its typed models; every emitted wire field must match.
Raw request AND response bytes, digests, timestamps and phase transitions are
retained before the response is sent. TLS trust/hostname checks remain enabled.

SEQ-QA357-003: initial -> function call -> awaiting output -> rejected missing,
wrong-id, wrong-output and wrong-tool requests (state unchanged) -> exact output
-> completed -> replay refusal. No reset/retry/restart claim for this in-memory
QA conversation; those product paths retain their existing evidence boundaries.

AC-QA357-04: pure controls first fail before implementation, then pass, including
opaque extension preservation, exact negative reasons, unique call identity and
argument event consistency. AC-QA357-05: real installed SDK consumes function
SSE then sends matching output and decodes the exact final JSON; independent
qualifier rehashes both directions and binds raw events to SDK decoded values.
Wrong hostname and no-route controls stay mandatory. Original foundation's
real credential write/cold read/basic refusal controls also run unchanged.
Actual App/Kernel/Code/Workflow/Hook execution remains NOT_RUN until its separate
exact-pair run. No simulated protocol result is counted as application success.
