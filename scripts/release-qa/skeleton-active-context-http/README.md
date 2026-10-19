# Active Context V2 HTTP verification: preparation only

This checkpoint prepares BC-034 / SEQ-034 / AC-034 in
`docs/implementation/ticket-356-active-context-http-prep.md`. It changes no shipped
renderer, Electron, sidecar or core runtime file. These scripts are outside the
package's `build.files` and `extraResources` lists. They are explicit QA commands,
not part of the application or its startup.

## What is ready, and what has not run

The Python command defaults to offline preflight. It verifies the installed wheel
against all its Python source members, observes the real imported manifest and
module origins, imports the real Flask app/routes under an accident guard, and
creates/reads/freezes an Agent through the actual store and credential-requirement
producer. It selects the Memory Agent's model from the actual offered official
profile catalog. It does not bind HTTP, call an SDK or execute the graph.

The Node command defaults to offline preflight. It exercises actual preload
serialization and Main's credential-query helper for two distinct attempts in one
chat. Both caller history arrays remain empty: the eventual second SDK request
must obtain prior history from the server Journal. A synthetic terminal is used
only to release offline listeners, never as execution evidence.

The Node runtime/observation paths and their CLOSED test schemas are prepared
prototypes. There is deliberately **no serving host, native SDK adapter or live
persisted-state observer in this checkpoint**. Python `--serve` refuses. A
synthetic validator fixture is not a root commit or Journal receipt. No CLI in
this preparation may certify the HTTP chain. H1 must implement and inspect those
test-only seams on an explicitly frozen candidate before executing them.

## Offline commands

Use absolute paths and a new external output directory for every invocation.
Do not point any command at a user library, real vault or existing app instance.
For the currently pinned installation:

```sh
TASK_PAIR=/Users/red/.codex/artifacts/pupu-356/embedded-diagnostics-20261017/fixed-pair
TASK_HOST=/Users/red/Desktop/GITRepo/pupu-356
TASK_QA="$TASK_HOST/scripts/release-qa/skeleton-active-context-http"
TASK_OUT=/ABS/new-external-preflight-directory

"$TASK_PAIR/install-venv/bin/python" -I -B "$TASK_QA/active_context_host.py" \
  --preflight --host "$TASK_HOST" --pair "$TASK_PAIR" --sandbox "$TASK_OUT"

node "$TASK_QA/active_context_chain.cjs" --preflight \
  --clone "$TASK_HOST" --agent-id active-context-http-agent \
  --run-id active-http-preparation --chat-id active-http-preparation \
  --memory-agent-config "$TASK_OUT/memory-agent-config.json" \
  --out /ABS/another-new-external-node-directory
```

The fixed wheel SHA256 is
`4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b`.
The actual imported manifest must be
`sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101`.
The wheel is compared with installed source bytes; a fresh bytecode-cache prefix
prevents reuse of stale `.pyc`. Source HTTP, when later run, will not qualify the
packaged Main or sidecar binary.

Run the preparation checks explicitly; no package script or global Jest pattern
was changed to collect these files:

```sh
"$TASK_PAIR/install-venv/bin/python" -I -B -c \
  'import runpy,sys; sys.path.insert(0,sys.argv.pop(1)); runpy.run_module("test_runtime_safety_guard",run_name="__main__")' \
  "$TASK_QA" --out /ABS/new-external-guard-results

node --check "$TASK_QA/active_context_chain.cjs"
node "$TASK_QA/offline_negative_controls.cjs" "$TASK_HOST" /ABS/new-validator-results \
  "$TASK_PAIR/install-venv/lib/python3.12/site-packages"

"$TASK_PAIR/install-venv/bin/python" -I -B "$TASK_QA/test_policy.py" \
  --python "$TASK_PAIR/install-venv/bin/python" --out /ABS/new-policy-results

"$TASK_PAIR/install-venv/bin/python" -I -B "$TASK_QA/test_bootstrap_cli.py" \
  --host "$TASK_HOST" --pair "$TASK_PAIR" --out /ABS/new-cli-results
```

The validator controls use deliberately synthetic objects. Their acceptance is a
test of the validator, not a measured provider count, HTTP response, completed
graph or canonical Journal. Preserve the tool version and all before/after
source fingerprints with the eventual run.

## H1 execution checklist, after Claude's recovery checkpoint

1. Freeze the exact integration candidate; record HEAD, clean tracked state,
   source hashes, interpreter, wheel and actual manifest in every fresh process.
   Keep Claude's original and the existing frozen checkpoints unchanged.
2. Install the guard before app/core/SDK imports; substitute only the external
   native SDK factory with a finite, sentinel-only implementation. Retain real
   app/routes, runtime protocol/admission, profile binding, scope fence, Context
   compiler, graph runner, Journal and End commit. Do not invoke `main.main` and
   its migration/background-worker startup for this bounded source-app test.
3. Add the host-side observer using the unchanged `load_launch(...,
   allow_terminal_stale=True)` reader. Check actual state `completed` and
   `root_committed`, actual final End output, original root identity, ordered
   unique final/terminal Journal receipts, and SDK input. Do not fill these fields
   from the client's expected text. Complete the raw receipt identity/cursor
   assertions before enabling an integration PASS.
4. Start one explicit numeric loopback port and emit the test readiness record
   only after the fake SDK and guards exist. Use actual preload/Main discovery
   and V4 dispatch with fresh Main scope. No renderer-supplied keys or composer
   model can choose the Kernel target.
5. First ordinary message must reach durable End once. Second ordinary message
   must have a different attempt, the same Agent/chat, empty caller histories,
   and actual SDK input containing the first user message, first End reply and
   second user message. Each must have exactly one matching root final and
   terminal event. SDK call count is observed and may be nonzero; real provider
   network/API count must be zero. HTTP 200 or an error/done frame is not success.
6. Preserve raw envelopes and independently measured durable/SDK observations,
   then compare them. Scan renderer/preload/launch/Journal evidence for sentinel
   leakage. Stop and join the test server before releasing the guard. An early
   refusal remains FAIL/INCOMPLETE; never replace an admission or completion
   answer with a test stub.

Ordinary two-turn success does not certify approval, refusal settlement,
cancellation, process-cold resume, shared-reference CAS, desktop appearance,
frozen Main HTTP, live providers or complete Builder/CP17. Those keep separate
H2/H3 cells and depend on their own evidence.

## Guard limits and preparation disclosure

`RuntimeSafetyGuard` is a process-local accidental-access guard, **not an OS
sandbox**. It cannot contain hostile Python, arbitrary native extensions or
already open handles. It allows only explicit source/runtime reads, disposable
writes/SQLite, numeric loopback destinations approved by the test, and fake
credentials. It rejects private files, real PuPu data, unexpected subprocesses
and provider networking. All SQLite ATTACH is forbidden; it is not silently
reparsed. HOME's value is never repurposed; process-local `Path.home()` and XDG/
UNCHAIN data paths supply isolation.

The first external guard draft's negative network test relied on a late CPython
audit event and may have attempted DNS for `api.openai.com`. It did not make a
provider TCP/HTTP/model request or use a real key. The final method-entry guards
and negative tests have independent inert lower-level socket/resolver functions,
so their negative controls cannot issue a real DNS/connect/send even if the guard
regresses. Preserve that initial failure; final controls do not retroactively
make the first run a zero-DNS run.

The real app's initial preflight was blocked at stdlib `ctypes` initialization,
before HTTP or SDK activity. Its original receipt is preserved externally. Any
narrow guard accommodation and successful rerun must be reported separately; a
guard refusal must never be hidden as an application-ready result.

The current POSIX accommodation permits the fixed interpreter's genuine stdlib
`ctypes` initialization of `pythonapi = PyDLL(None)` once, while that module is
being imported. It permits no pathname library load or later process-handle
request, and all `dlsym` lookups remain refused. The policy tests use a fresh
interpreter for this positive control and inert underlying functions for the
negative controls. This is a Darwin/CPython preparation result, not Windows
native-lock qualification.
