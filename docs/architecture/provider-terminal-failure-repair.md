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
