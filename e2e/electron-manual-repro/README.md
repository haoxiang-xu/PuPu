# #389 Electron immediate-send reproduction

`pupu-stop-389.spec.js` is opt-in and launches its own temporary Electron user
profile through `e2e/fixtures/pupu_app.js`. It does not attach to an existing
PuPu process. Since Electron freezes the contextBridge facade, the delayed-ack
cases use the development Webpack runtime to resolve only the cached
`./src/SERVICEs/api.js` module and wrap its mutable `api.unchain.cancelExecution`
method. The original method still calls the real bridge; the wrapper delays
only the promise returned to the hook after the real cancellation response
arrives. The evidence JSON records the exact chunk-global and module id used.

From the `pupu-389` checkout, use the installed verified runtime source shim
and a fresh report directory for each run:

```sh
PUPU_E2E_PORT=2924 PUPU_E2E_RELEASE=1 PUPU_STOP389_UI=1 \
PUPU_STOP389_REPORT_DIR=/path/to/evidence/electron-ui-run \
UNCHAIN_SOURCE_PATH=/path/to/verified-wheel-source \
UNCHAIN_PYTHON_BIN=/path/to/unchain-389/.venv/bin/python \
npx playwright test e2e/pupu-stop-389.spec.js --workers=1
```

The test writes the aggregate Electron report and process log under
`PUPU_STOP389_REPORT_DIR`, plus screenshots and
`electron-manual-repro/stop-immediate-send-evidence.json`. That JSON records
the real cancellation response time, the delayed renderer acknowledgement,
provider-call counts before/during/after the immediate send, and whether a
draft remained unsent after Stop settled. The real pending producer and both
strict consumer outcomes are recorded in
`electron-manual-repro/producer-strict-consumer-evidence.json`, including
identity lineage, field names/types, JSON-string argument parsing shape, and
the graph/tool presentation metadata shape without storing argument values.
