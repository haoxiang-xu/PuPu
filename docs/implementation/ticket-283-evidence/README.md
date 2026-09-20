# Ticket 283 development evidence

PuPu base: `65811ee3d7bb62cc86f27c681764d7de0bfeef48`, isolated branch `codex/ticket-283-marketplace-integrations`. Checked 2026-09-12. This is development evidence for a catalog change, not feature-audit acceptance or release qualification.

## Subsequent availability decision (2026-09-13)

The owner explicitly allowed the four MCP entries without review. Current catalog values are available/installable, with Unverified display and policySummary.reviewed=false. The results below, including the rejection-oriented verify_catalog.cjs script, preserve the earlier 2026-09-12 subject; reproduce that historical admission run at commit ebffd0d118b83a96f8e595e7749cbd5c0f62c156. They do not assert that the current available entries are blocked. The new admission checks and unchanged validation limits are recorded in ticket-283.md.

## Result

- Four pending-review MCP entries added, with official provenance, pinned package versions or HTTPS endpoint, declared secret keys without values, and conservative tool-preview metadata. Existing entries and July 28 dependency cutoff unchanged.
- Two instruction-only skill packs added with immutable source commits and exact file hashes. Content attribution, Vercel's runtime-fetch dependency, and optional Trail of Bits analyzer dependencies are visible in descriptions. This is a selected subset, not either entire skill collection.
- **182 regression tests passed**: frontend 114 (6 suites), Electron downloader 36, Python registry/skill store 22, MCP validator 10. Schema/invariant validation passes for all 23 registry entries.
- Actual archive/download/scan/import/install passes for both skills; no degraded, rejected or skipped skill. Duplicate install rejects with 409; a new Python process reads the same command/body; uninstall and reinstall pass. Tampered hash rejects with `integrity` without partial output. See [skills-results.json](skills-results.json).
- The actual frontend and Python consumers agree on identities, transports, arguments and secret declarations. All four unreviewed MCP entries reject installation before process creation or durable writes. See [catalog-results.json](catalog-results.json).

## Provider observations

| Candidate | Actual artifact | Initialize / list | Read probe |
| --- | --- | --- | --- |
| Microsoft Learn | Official HTTPS endpoint | PASS, 3 tools | Public documentation search succeeds |
| Brave Search | @brave/brave-search-mcp-server 2.1.0 | PASS, exactly 4 requested tools | Intentionally invalid credential rejected; valid-key success NOT_RUN |
| Tavily | tavily-mcp 0.2.21 | PASS, 5 tools | Upstream keyless search succeeds; catalog-required-key success NOT_RUN |
| Firecrawl | firecrawl-mcp 3.22.4 | PASS, 26 tools | Upstream keyless scrape rejects this IP and requires key; valid-key success NOT_RUN |

[Raw observations](mcp-probes.json) include negotiated server versions, tool names, response/schema digests and short public response/error excerpts. No real keys or private workspace contents were sent. Tests ran with Node v24.18.0; the repository's packaged-runtime pin is v24.11.1, satisfying the Firecrawl package's Node >=22 declaration. That version comparison is not an execution test of the packaged binary.

Microsoft's [human documentation](https://learn.microsoft.com/en-us/training/support/mcp) confirms streamable HTTP, no authentication and no charge. Its MCP endpoint is for protocol access, not browser navigation. Official upstreams: [Brave](https://github.com/brave/brave-search-mcp-server), [Tavily](https://github.com/tavily-ai/tavily-mcp), [Firecrawl](https://github.com/firecrawl/firecrawl-mcp-server).

## Unresolved before activation

`npm audit --json` on the dependencies resolved with the existing cutoff returned advisory matches: Brave and Tavily each have 1 high / 2 moderate packages (`fast-uri`, `hono`, `qs`); Firecrawl has 2 high / 2 moderate (also `axios`). [dependency-review.json](dependency-review.json) preserves dependency versions/integrities, lock digests and advisory links. These are advisory matches, not demonstrated exploitation in the configured stdio paths. No automatic fix, cutoff relaxation or waiver was applied. Remediation or an evidence-backed applicability review is still required.

Tool-preview confirmation flags are metadata, not an allowlist or proof that every runtime call is gated. PuPu `_tool_to_dict` copies discovered tool flags; companion Unchain source at `b98e532f244170e33c9c63f47f5c9ed9ade69567` derives its MCP tool flag from `destructiveHint` with a false initial value. Before promotion, qualify the exact deployed pair's confirmation behavior, including Firecrawl's wider 26-tool surface, against the desired catalog policy. No companion runtime changes are included here.

Maintainer security review, authenticated provider workflows, live model invocation and full packaged PuPu + fixed Unchain-wheel sequence/mode matrix are **NOT_RUN**. MCP rows therefore remain `needs_review` / non-installable. Skill lifecycle checks used actual Electron modules and fresh Python store processes, not a running packaged app or model session. No claim of complete security certification or active rollout is made.

## Reproduce

Run from this clone with its npm dependencies. Set `PUPU_TEST_PYTHON` to a Python interpreter with the sidecar test dependencies. The recorded run used `/Users/red/Desktop/GITRepo/PuPu/.venv/bin/python` only as an interpreter, importing this clone's modules; all stores were temporary and isolated.

```sh
npm run validate:mcp
npm run test:mcp-registry
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/SERVICEs/mcp_toolkit_store.test.js src/SERVICEs/mcp_install.test.js src/SERVICEs/skill_pack_import.test.js src/COMPONENTs/toolkit/utils/skill_pack_store_install.test.js src/COMPONENTs/toolkit/pages/plugins_categories_page.test.js src/COMPONENTs/toolkit/pages/skill_pack_detail_page.test.js
npm run test:electron -- --runTestsByPath electron/tests/main/skill_repo_download.test.cjs
"$PUPU_TEST_PYTHON" -m pytest -q unchain_runtime/server/tests/test_mcp_registry.py unchain_runtime/server/tests/test_skill_packs.py
node docs/implementation/ticket-283-evidence/verify_catalog.cjs
node docs/implementation/ticket-283-evidence/verify_skills.cjs
```

The skill script performs live pinned GitHub downloads. The MCP script performs opt-in network calls using public/invalid credentials, requiring its exact package paths:

```sh
npm install --prefix /tmp/pupu-283-mcp-brave --ignore-scripts --no-fund --no-audit --before=2026-07-28T00:00:00Z @brave/brave-search-mcp-server@2.1.0
npm install --prefix /tmp/pupu-283-mcp-tavily --ignore-scripts --no-fund --no-audit --before=2026-07-28T00:00:00Z tavily-mcp@0.2.21
npm install --prefix /tmp/pupu-283-mcp-firecrawl --ignore-scripts --no-fund --no-audit --before=2026-07-28T00:00:00Z firecrawl-mcp@3.22.4
node docs/implementation/ticket-283-evidence/probe_mcp.mjs
```

External results can change. The probe records failures rather than interpreting process exit 0 as provider success; inspect each record. Advisory resolution is likewise a dated observation. Baseline frontend act/Browserslist and npm peer/deprecation warnings did not fail tests. No product Python code changed; no running sidecar was restarted. Feature audit, commits, push and PR creation await the user's `close` instruction under release-start-ticket.
