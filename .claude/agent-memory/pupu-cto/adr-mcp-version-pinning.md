---
name: adr-mcp-version-pinning
description: ADR — third-party low-trust MCP stdio entries must pin their package version; only verified first-party entries may ride @latest
metadata:
  type: project
---

ADR (2026-06-12, CTO call during Step 3 Discord onboarding): **MCP store stdio entries that are NOT verified-first-party must pin an explicit package version; verified first-party entries may ride `@latest`.**

**Context:** The catalog had an unexamined split — `verified` entries (Playwright `@playwright/mcp@latest`, chrome-devtools `@latest`, official `@modelcontextprotocol/*`) ride `@latest`, while `needs_review`/`community` entries (Slack remote, browser-use) were unpinned but from known sources. Onboarding `@iqai/mcp-discord` (immature third-party: ~5 stars, v0.0.6, individual-org, `needs_review`) forced the question. `@latest` on an immature third-party means every user install silently pulls whatever the maintainer last published — including a hypothetical compromised release — with no human in the loop. That is a live supply-chain exposure.

**Decision:**
- `trustLevel: needs_review` or `community` stdio entry → **MUST pin** an explicit version (e.g. `@iqai/mcp-discord@0.0.6`). Upgrading is then a deliberate curator re-vet, not an automatic event.
- `trustLevel: verified` first-party (official MCP org / first-party vendor) → MAY use `@latest`. The trust is earned by the upstream's provenance.

**Consequences:**
- Reversible. Downside: pinned entries go stale until curator bumps them — acceptable for low-trust entries, and the staleness IS the control (forces re-vet on upgrade).
- New invariant for curator + future onboarding: pin third-party, re-vet on bump.
- Relates to [[adr-toolkitid-stability]] (curator owns entry data discipline) and the Discord vetting in [[contract-toolkit-catalog-shared-id-space]] / SEC basecase [[adr-sec-001-arbitration]].

**Discord specifics this ADR was decided on (security-expert verdict, 2026-06-12):** onboard `@iqai/mcp-discord@0.0.6`, `trustLevel: needs_review`, all write/webhook/DM/moderation tools `requiresConfirmation: true`, `DISCORD_TOKEN` → backend mcp_secrets.py (see [[mcp-secret-storage-path]]), and a least-privilege bot-invite instruction in `readmeMarkdown` (the highest-leverage control, unenforceable in code).
