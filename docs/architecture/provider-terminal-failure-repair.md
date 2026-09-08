# #195 installed provider failure repair

The installed candidate reaches Memory V2 Active and persists the user request,
but its OpenAI provider call fails with an HTTP 4xx whose details are discarded.
The original failure and candidate are retained in the #195 evidence comments.

## Contract and implementation

- BC-201: provider exception -> Unchain failure diagnostic. CLOSED: exact integer
  HTTP status, allowlisted provider code, allowlisted parameter path, and a fixed
  locally generated message. Never serialize raw exception text, response body,
  headers, credentials, or prompt content. Unknown codes/parameters are omitted.
- BC-202: failure diagnostic -> durable request lease -> recovered exception ->
  existing PuPu error string. VERSIONED: legacy diagnostic-free leases retain
  their v2 bytes; diagnostic-bearing failed leases use v3 with a closed nested
  diagnostic schema. Existing started/completed lease hashes remain unchanged.
  Old failures remain readable without invented details. Old binaries cannot
  read v3 failure records; rollback requires the pre-install profile backup.
- SEQ-201: claim request, receive 4xx, atomically record failed lease plus safe
  diagnostic, show error, reopen store, recover identical diagnostic without
  another provider send. Diagnostic persistence failure remains fail-closed.
- AC-201: real OpenAI adapter + strict fake 4xx response reaches the runtime and
  provides the expected safe status/code/parameter in the surfaced exception.
- AC-202: SQLite cold reopen returns the same diagnostic without transport use;
  legacy v2 bytes still round-trip and recover unchanged.
- AC-203: arbitrary secret/body/header strings and unknown diagnostic fields do
  not cross the boundary; malformed persisted diagnostics fail validation.

After these tests, build a new wheel/sidecar/app candidate and bind evidence to
its hashes. Diagnose the actual provider rejection with a user-triggered smoke;
fix its cause before resuming full installed sink qualification. Do not relabel
the frozen 9aeb9302/0680312 candidate or claim CP2 passed.

## Implementation and verification (2026-09-07)

Implemented in the Unchain working tree:

- `providers/failure_diagnostic.py`: closed projection and fixed display text;
  no remote message/body/header/credential text enters a diagnostic.
- `providers/request_lease.py`: diagnostic-bearing failed records use v3;
  diagnostic-free v2 serialization and its digests remain unchanged.
- `providers/durable_turn_runtime.py`: capture before terminal CAS, persist the
  diagnostic in that same CAS, recover on reopen without another send, and
  suppress the raw provider exception in the public traceback.
- PuPu production code requires no change: its existing normalization displays
  the safe detail and maps invalid_api_key to the Settings guidance.

Red-before-green: the real OpenAI adapter/fake HTTP 400 test first failed because
the error contained only `non_retryable`. It now passes including SQLite reopen
and no-second-send assertions. No real-provider requests were made by Codex.

Executed with Python 3.12 pytest and `PYTHONPATH=F:/GIT/unchain/src`:

- Unchain failure diagnostic, durable runtime, request lease, result binding,
  and exact transport suites: **74 passed**.
- Unchain result SQLite/contract/execution, cross-provider execution, schema
  migration, Context V2 repository and read-only journal suites: **84 passed**.
- PuPu provider diagnostic host tests and chat stream v4: **28 passed,
  6 subtests passed**.

The Unchain `run_tests.sh` cannot run on this checkout as written: its required
Unchain `.venv` is absent and the script checks a legacy `miso` import. The above
commands use PuPu's existing Python 3.12 environment and explicitly select the
Unchain source under test; they do not use Jest or a rebuilt wheel.

GitNexus: both repositories were explicitly bound and refreshed. Lease decoding
and serialization affect CAS and provider-result persistence (LOW graph risk);
the terminal error class has MEDIUM graph risk. Dataclass post-init is UNKNOWN
in the graph; its constructor sites and serialization callers were confirmed
directly in source. Receiver-type/process coverage limits remain documented in
the local impact output, so graph zeros are not treated as proof of no impact.

Deployment is **NOT_RUN** at the source commit. The project owner explicitly
authorized committing these repairs and proceeding with build/installation on
2026-09-07. Graph change analysis and a new immutable artifact build/pair test
precede installation; no admission/provenance checks are weakened.

The original real-provider 4xx reason is still unknown: this patch restores
diagnostic evidence for the next user-triggered call; it does not prove the
underlying request rejection is fixed. The installed daily candidate remains
unchanged and its captured failed request is preserved.

## Diagnostic candidate installed (2026-09-07, 15:38 Pacific)

Source pair: PuPu `fbbbfbb52451c8e07c7658c8b967386563b74baa` and Unchain
`6d16434a3e20dccd9dbafd8b494e275372412512`, committed and pushed with the
project owner's explicit authorization. This section is a later documentation
update, not a different candidate payload.

New artifacts (SHA-256):

| Artifact | Digest |
| --- | --- |
| wheel | `f594257543010e903a89bda81aa6cf3d71501012b0cff162aca86660aeb05775` |
| sidecar | `c25ba800164677212c2bd49e5c5df0a2e978b9f7fcdc63401e6b34650b2167cc` |
| app.asar | `cc366f4aa14e6286de6d83a76b62a0efe054366304d3935456caaef17ee1ba05` |
| installer | `45789d7ba44e19111d186b183e8cfc3ffcea2840ea26c32afa166f68d8e26723` |

The unchanged runtime manifest digest is
`sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
Artifact identity is established by the new wheel/sidecar digests, not by this
unchanged protocol digest. The previous all/all snapshot is reused unchanged.

Using the single new wheel (not the source checkout), the diagnostic suites
passed 74 tests, the PuPu host suites passed 28 tests plus 6 subtests, and the
Context V2 contract runner passed 71 core tests, 24 adapter tests plus 3
subtests, and 2 Node strict-provider tests. All exit codes were 0. Web build,
license check, PyInstaller sidecar and NSIS installer also exited 0.

Both the unpacked candidate and the installed executable were exercised through
real preload -> Electron -> packaged sidecar -> local deterministic provider.
Each produced exactly one HTTP 400 call and surfaced
`invalid_function_parameters` / `tools[3].parameters`; simulated private response
text was absent from the UI result and scanned profile/log files. The first
installed harness run failed during post-exit scanning because Chromium removed
its transient `lockfile`; the helper now tolerates ENOENT only for that file.
The second installed run passed without changing candidate bytes.

Before installing, daily PuPu was closed and all 1,029 profile files (167,033,703
bytes) were copied and SHA-256 verified. Backup:
`.release-qa/windows-memory-v2-active/daily-backup-pre-diagnostic-20260907-153534`.
An orphaned OLD-candidate sidecar whose parent had exited was recorded and
stopped before copying; this is an outstanding lifecycle observation, not a
claim that the full sink matrix has passed. Installer exit 0; installed main
executable, app.asar, sidecar and provenance JSON all match the new candidate.
Daily profile startup reports service ready, Memory V2 ready/all and Windows
capability ready. A loopback diagnostic launch is temporarily open for the
owner's real-message smoke; no real-provider request was sent by Codex.

Evidence root:
`.release-qa/windows-memory-v2-active/20260907-provider-diagnostic/`.
Index: `candidate-build-evidence.json`, `installation-evidence.json`,
`daily-startup-status.json`, `wheel-diagnostic-tests.log`, `wheel-host-tests.log`,
`context-contract.log`, `diagnostic-probe-0X0CJ6/evidence.json` (unpacked),
`diagnostic-probe-ydtyUy/evidence.json` (installed), `old-candidate-orphan.json`.
The frozen previous installer and pre-diagnostic backup remain the rollback
pair. Restore that backup when rolling back; the old runtime cannot consume new
v3 diagnostic-bearing failure records.

Disposition: diagnostic repair **installed and locally verified**; actual
provider rejection **awaiting a new owner-triggered message**. Full CP2 remains
INCOMPLETE. No previous candidate evidence was relabelled as this candidate.

## Development versus installed startup (2026-09-07, 15:47 Pacific)

Historical state: the later [development Vault repair](windows-memory-v2-development.md)
removes the development packaged-identity prerequisite. `npm start` now supports
Memory V2 Active after containment and runtime protocol checks; the installed
launcher below remains optional.

The repeated Vault warning was traced to the live parent chain `npm start` ->
`start:electron` -> `start-dev.cjs` -> repository Electron, not to an installed
candidate reverting. That process reported `vault_worker_capability_unconfigured`
and effective shadow. The packaged-only Vault provenance gate remains unchanged.

BC-203: `npm run start:installed` launches the existing per-user Windows install,
with its installation directory as cwd and Electron development entry variables
removed. Missing installation or unsupported platforms fail explicitly. Default
`npm start` remains development; its Windows startup now prints the Vault limit
and the installed command. These scripts do not change the installed payload.

SEQ-203: close development PuPu before launching the installed executable, so
the single-instance mechanism cannot redirect the launch to development.

AC-204: both launcher scripts passed Node syntax checks. After closing the
development window, the actual installed command exited 0; the running main
executable resolved to `%LOCALAPPDATA%/Programs/PuPu/PuPu.exe`. Preload status
reported service ready, Memory V2 ready/all, Windows capability ready, and no
platform block. Evidence: `start-installed-status.json` under the diagnostic
candidate evidence root. A previously orphaned installed sidecar was stopped
only after verifying its executable and absent parent. No real-provider request
was sent; the provider rejection remains awaiting owner reproduction.
