# #387 development verification

2026-11-13. Development implementation-ready; no PR, feature audit, release
certification or active rollout performed. Both ticket clones remain intact.

| Check | Result | Evidence |
| --- | --- | --- |
| Installed-wheel runtime regression | 304 passed | runtime-tests.txt |
| Host/catalog/manifest/Builder | 155 passed, 220 subtests | host-tests.txt |
| Final added feature-on mount assertions | 40 passed | mount-tests.txt |
| Renderer | 26 passed, 4 suites | renderer.txt |
| Two cold real HTTP hosts, same wheel | PASS | pair-identity.json; verify_pair.py |
| Missing model and wrong computer route reproduced | RED before GREEN | catalog-red.txt; computer-red.txt |
| Existing pinned SDK test defect reproduced | Corrected test; real SDK serialization passes | sdk-baseline-red.txt; runtime-tests.txt |

Wheel and manifest identities are in pair-identity.json. The wheel was built
once and preserved outside the clones. Test-only updates after that build do
not alter wheel production inputs; the installed resources are compared with
both full candidate JSONs by verify_pair.py. All 39 original entries in each
resource remain unchanged. No provider network calls were made.

## Exact commands

Run in `/Users/red/Desktop/GITRepo/unchain-387` (no PYTHONPATH pointing to src):

```sh
/Users/red/Desktop/GITRepo/pupu-387/.venv/bin/python -m pytest \
  tests/test_ticket_387_catalog.py tests/test_ticket_387_replay.py \
  tests/test_september_native_models.py tests/test_september_claude_models.py \
  tests/test_provider_replay.py tests/test_anthropic_text_replay.py \
  tests/test_anthropic_sdk_parsed_output_replay.py tests/test_provider_wire_envelope.py \
  tests/test_provider_wire_preparer.py tests/test_durable_provider_turn_runtime.py \
  tests/test_provider_failure_diagnostic.py -q
```

Run in `/Users/red/Desktop/GITRepo/pupu-387`:

```sh
OLLAMA_HOST=http://127.0.0.1:1 \
UNCHAIN_SOURCE_PATH=/Users/red/Desktop/GITRepo/pupu-387/.venv/lib/python3.12/site-packages \
.venv/bin/python -c 'import numpy,pytest; raise SystemExit(pytest.main([
"unchain_runtime/server/tests/test_ticket_387_catalog.py",
"unchain_runtime/server/tests/test_models_catalog_route.py",
"unchain_runtime/server/tests/test_computer_use_capabilities.py",
"unchain_runtime/server/tests/test_computer_toolkit_adapter.py",
"unchain_runtime/server/tests/test_context_memory_v2_runtime_protocol.py",
"unchain_runtime/server/tests/test_chat_stream_runtime_protocol_gate.py",
"unchain_runtime/server/tests/test_skeleton_kernel_profiles.py","-q"]))'

CI=true node_modules/.bin/react-scripts test --watchAll=false --runInBand --runTestsByPath \
  src/SERVICEs/ticket_387_catalog.test.js src/SERVICEs/reasoning_effort_prefs.test.js \
  src/SERVICEs/api.modelCatalog.test.js src/SERVICEs/september_provider_models.test.js

.venv/bin/python docs/implementation/ticket-387-evidence/verify_pair.py \
  /Users/red/Desktop/GITRepo/ticket-387-artifacts/ac4065ae1cb3/unchain-0.2.0-py3-none-any.whl
```

NumPy preload prevents an existing sys.modules mock rollback from re-importing
its C extension. An unreachable Ollama host keeps actual developer-installed
models out of static catalog fixtures; explicit Ollama test fixtures still run.
`run_tests.sh` refused its stale `import miso` preflight, so the isolated venv's
own pytest was invoked directly (wrapper-limitation.txt). Dependencies in the
paired venv match PuPu requirements including OpenAI 2.7.1/Anthropic 0.87.0.

The graph summaries cover currently tracked hunks only. New tests/docs remain
untracked during start. Stage/index and rerun full graph analysis before any
close-authorized commit; these summaries are not a complete commit gate.

NOT_RUN: real-provider account/retention eligibility, paid calls, packaged
desktop smoke, new-model human-input suspend/resume and full graph/subagent
execution combinations. No active rollout claim is made. Five new models do
pass actual interpreter-restart checkpoint/function replay; generic durable
retry/identity/version matrices also pass.
