# PuPu Release QA Report

- Mode: lite
- Version: 0.1.13
- Deterministic result: FAIL
- Unchain artifact SHA-256: sha256:d96cf9ac7774f05e4b7615348116ec61913a23c832dc10b1fe5433740fa54c22
- Runtime manifest digest: sha256:c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b
- Unchain source ref: 2e455628b454ce225dd8e813e0ae33a85e56450a
- Unchain source revision (telemetry): 2e455628b454ce225dd8e813e0ae33a85e56450a
- Unchain source dirty: false
- Unchain analysis: not_run

## Checks

| Platform | Check | Status | Command | Details |
| --- | --- | --- | --- | --- |
| deterministic | frontend tests | PASS | npm run test:frontend -- --passWithNoTests |  |
| deterministic | electron tests | PASS | npm run test:electron -- --detectOpenHandles |  |
| deterministic | python backend tests | FAIL | python ../../scripts/release-qa/run-python-tests.py tests/ -vv --tb=short --durations=25 -o faulthandler_timeout=60 |  |
| deterministic | Unchain artifact continuity | PASS | node scripts/release-qa/verify-unchain-artifact.mjs --installed true |  |
| deterministic | Unchain runtime protocol manifest | PASS | node scripts/release-qa/verify-unchain-artifact.mjs --installed true |  |
| deterministic | Context V2 boundary contracts | PASS | npm run test:context-v2-contract |  |
| deterministic | RunBundle v1 boundary contracts | PASS | npm run test:run-bundle-contract |  |
| deterministic | web build and version check | PASS | npm run build |  |
| deterministic | MCP registry validation | PASS | npm run validate:mcp |  |
| deterministic | MCP bundled runtime build tests | PASS | npm run test:mcp-runtime |  |
| deterministic | release QA script tests | PASS | npm run test:release-qa |  |
| deterministic | third-party notice script tests | PASS | npm run test:notices |  |
| unknown | required report deterministic | FAIL |  | required report contains failed, skipped, or zero-evidence checks (INCOMPLETE) |
| unknown | required report playwright-Linux | FAIL |  | required report is missing (INCOMPLETE) |

## Artifacts

No package artifacts were recorded.

## Unchain Advisory

- Status: not_run
- Recommendation: NEEDS-HUMAN-TEST

## Manual Release QA Still Required

- [ ] macOS Gatekeeper/notarization
- [ ] Windows installer launch
- [ ] Linux AppImage/deb install
- [ ] Ollama real local-model path
- [ ] API-key provider smoke
- [ ] workspace attach with real folders
