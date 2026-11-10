# PuPu Release QA Report

- Mode: lite
- Version: 0.1.13
- Deterministic result: PASS
- Unchain artifact SHA-256: sha256:2c41b4e915f6466d410a48723c10fbc91e6f10751869b8421693bf1022701685
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
| deterministic | python backend tests | PASS | python ../../scripts/release-qa/run-python-tests.py tests/ -vv --tb=short --durations=25 -o faulthandler_timeout=60 |  |
| deterministic | Unchain artifact continuity | PASS | node scripts/release-qa/verify-unchain-artifact.mjs --installed true |  |
| deterministic | Unchain runtime protocol manifest | PASS | node scripts/release-qa/verify-unchain-artifact.mjs --installed true |  |
| deterministic | Context V2 boundary contracts | PASS | npm run test:context-v2-contract |  |
| deterministic | RunBundle v1 boundary contracts | PASS | npm run test:run-bundle-contract |  |
| deterministic | web build and version check | PASS | npm run build |  |
| deterministic | MCP registry validation | PASS | npm run validate:mcp |  |
| deterministic | MCP bundled runtime build tests | PASS | npm run test:mcp-runtime |  |
| deterministic | release QA script tests | PASS | npm run test:release-qa |  |
| deterministic | third-party notice script tests | PASS | npm run test:notices |  |
| playwright-Linux | Unchain artifact continuity | PASS | node scripts/release-qa/verify-unchain-artifact.mjs --installed true |  |
| playwright-Linux | Session guard startup smoke | PASS | python scripts/release-qa/windows-session-guard-smoke.py |  |
| playwright-Linux | Windows Vault supervisor native probe | SKIPPED | python scripts/release-qa/windows-vault-supervisor-native-probe.py |  |
| playwright-Linux | Playwright Electron release smoke | PASS | npm run test:e2e |  |

## Artifacts

- playwright-Linux: 1e10d538d8b7240f84909f3064b51f5a11289a6f.png
- playwright-Linux: 4bf306b4a0de62842295bd94fa7f35a97d6c4b33.png
- playwright-Linux: 9c7b2b62442e9f644094f58fc98c77ed6962ff27.png
- playwright-Linux: index.html
- playwright-Linux: .last-run.json
- playwright-Linux: Onboarding-1ed598ae25bdb6c0f3134050b3e551caf3494373.png
- playwright-Linux: Settings-51d99fb4a28d9b6773106c73b41de75a768e1919.png
- playwright-Linux: onboarding.png
- playwright-Linux: settings.png
- playwright-Linux: results.json
- playwright-Linux: session-guard-smoke.json

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
