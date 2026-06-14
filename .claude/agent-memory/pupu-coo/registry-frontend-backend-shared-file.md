---
name: registry-frontend-backend-shared-file
description: Frontend src/SERVICEs/mcp_toolkit_registry.json is ALSO read by the Python backend — editing it can break backend pytest
metadata:
  type: project
---

The MCP store registry JSON is a SHARED cross-layer contract, not a frontend-only file.

**Fact:** `src/SERVICEs/mcp_toolkit_registry.json` is loaded by the Python backend at
`unchain_runtime/server/mcp_registry.py` (REGISTRY_FILENAME, resolves via
`server_path.parents[2] / "src" / "SERVICEs" / mcp_toolkit_registry.json`). The backend's
`INSTALLABLE_MCP_REGISTRY` comes from this same file. So a frontend curator edit to the
registry directly changes backend behavior.

**Why this matters for QA:** Any add/remove/rename of a registry entry must be validated on
BOTH sides:
- Frontend: `CI=true npx react-scripts test src/SERVICEs/mcp_toolkit_store.test.js` and
  `src/COMPONENTs/toolkit/constants.test.js` (category parity).
- Backend: `.venv/bin/python -m pytest tests/test_mcp_toolkits.py tests/test_mcp_registry.py
  tests/test_mcp_store_metadata.py` (run from `unchain_runtime/server`).

**Known trap (seen 2026-06-14):** Hard-deleting the stdio `productivity.slack` entry from the
registry broke 9 backend `test_mcp_toolkits.py` tests that hard-code `productivity.slack` as a
generic stdio-secret fixture, including `test_slack_remote_requires_oauth_and_preserves_stdio_slack_entry`
which explicitly asserts BOTH `mcp.productivity.slack` and `mcp.productivity.slack-remote`
remain installable. Frontend store browse now hides deprecated entries via a new guard in
`searchMcpStoreEntries` (mcp_toolkit_store.js), but the backend still treats the deleted entry
as supported → `McpToolkitError: unsupported_mcp_entry`.

**How to apply:** When a registry-entry removal/deprecation lands, before go: run the backend
pytest. If backend tests reference the removed entry_id, the curator's removal and the backend
fixtures/contract must be reconciled in the same release. Removing a frontend entry without a
matching backend change is a release blocker. The validation script
`scripts/validate-mcp-registry.cjs` only checks frontend schema/invariants — it does NOT catch
this cross-layer break. See [[handoff_protocol]] (curator owns entry schema, but COO owns
cross-repo release gating).
