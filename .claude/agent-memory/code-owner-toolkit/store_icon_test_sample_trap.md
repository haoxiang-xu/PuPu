---
name: store-icon-test-sample-trap
description: Tests must never couple their premise to a registry entry's icon state — curation flips it freely, and DEFAULT_MCP_ICON silently makes some assertions pass for the wrong reason.
metadata:
  type: feedback
---

Never let a test's premise depend on whether a specific registry entry carries an icon. When a test needs "an entry WITH a brand icon" or "an id with NO icon", assert that premise explicitly at the top of the test with a comment saying *repoint the sample, do not relax the assertion*.

**Why:** This has now bitten twice in opposite directions. 2026-07-27: three tests used "some registry entry has no icon" as their no-icon sample; filling in icons broke them. 2026-07-28: the CEO reversed the policy ([[store-icon-honesty-policy]]), and the tests written to fit full coverage became landmines — verified empirically by running the HEAD tests against a registry with the 5 candidate icons cleared: exactly 2 failed (`mcp_toolkit_store › every store entry carries its own brand icon`, `use_chat_input_toolkits › store registry brand icon beats a generic catalog icon`, the latter keyed on markitdown).

The nastier half is silent: `DEFAULT_MCP_ICON` is the mcp glyph on a transparent background, which is **byte-identical DOM** to what the "catalog sent a generic tool icon, so render the real mcp glyph" test asserts. Point that test at a registry entry with no icon and it still passes — while proving nothing about catalog-icon rejection. A green suite is not evidence the sample is still valid.

**How to apply:** Prefer synthetic ids (`mcp.custom.*`) or entries injected via `setMcpStoreEntriesCache` for fallback-path tests — those cannot rot. When a real entry is unavoidable, pick one whose logo is unambiguously official (playwright, github, figma, sentry, grafana, chrome-devtools) and assert the premise. Registry-wide icon invariants should be stated as a *total spec* (declared icon -> resolves to exactly that icon; omitted -> resolves to exactly `DEFAULT_MCP_ICON`) with an anti-vacuity guard that the declared bucket is non-empty, rather than as a coverage claim that curation can invalidate.
