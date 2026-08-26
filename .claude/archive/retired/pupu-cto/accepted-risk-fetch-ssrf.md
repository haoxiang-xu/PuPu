---
name: accepted-risk-fetch-ssrf
description: Fetch MCP server (Step 2) onboarded as markitdown-equivalent — SSRF residual risk CEO-accepted, confirmation-gated, no hard block this round
metadata:
  type: project
---

Fetch MCP server (mcp-server-fetch / @modelcontextprotocol/server-fetch style — URL→markdown/text fetcher) onboarded to the toolkit store on 2026-06-12 in the **same posture as markitdown**: it makes server-side HTTP requests on a model-supplied URL, so it carries the identical SSRF surface (model can be steered to fetch internal/metadata endpoints, file://, localhost, cloud metadata 169.254.169.254, etc.).

**CEO ruling (Haoxiang, 2026-06-12):** accept the SSRF as a documented residual risk this round. Do NOT build a hard SSRF block — that is a dev-backend engineering effort with its own ADR, out of this round's scope.

Entry shape locked by CEO:
- `requiresConfirmation: true`
- `defaultEnabledTools: 0` (off by default, user must explicitly enable)
- `trustLevel: verified`
- `category: workspace`
- no secret
- `readmeMarkdown` MUST explicitly carry the upstream SSRF warning (so the risk is surfaced to the user at install/enable time)

**Why:** consistent with [[adr-sec-001-arbitration]] basecase — Fetch is functionally the same shape as markitdown (see [[mcp-store-current-inventory]]), and gating-by-confirmation + off-by-default + explicit README warning is the agreed interim control until a real SSRF egress filter lands.

**How to apply:** when the future SSRF hardening / egress allowlist work is scoped (dev-backend, separate ADR), **Fetch and markitdown must be closed off together** — they are the same residual-risk class. Don't treat Fetch as a one-off; it joins the markitdown SSRF-deferred bucket. Any new URL-fetching MCP server inherits this same posture by default unless the egress block exists.
