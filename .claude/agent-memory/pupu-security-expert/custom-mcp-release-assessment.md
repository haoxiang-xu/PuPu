---
name: custom-mcp-release-assessment
description: Custom MCP (user-added arbitrary stdio/http MCP server) release security go/no-go — 2026-06-14. Verdict CONDITIONAL GO with minimal gate.
metadata:
  type: project
---

Custom MCP feature security assessment, 2026-06-14, for CEO release go/no-go (read-only, no code changed). Verdict: **CONDITIONAL GO** — ship only if the install-time risk acknowledgment gate lands; otherwise NO-GO.

**Threat model verified (traced code paths):**
- stdio branch = arbitrary local code execution by design. Install-time `_discover_tools` (mcp_toolkits.py:492) calls `toolkit.connect()` = REALLY spawns the user-typed command at install moment, before any chat.
- **unchain stdio spawn is argv-exec, NOT shell** — MCP SDK `anyio.open_process([command, *args], start_new_session=True)` (mcp/client/stdio/__init__.py:250-258); win32 = create_windows_process. No `shell=True`, no string concat. So NO classic shell-metachar injection via args. The command is still an arbitrary executable at full user privilege — the risk is "user runs attacker-supplied command they were socially-engineered into pasting", not metachar injection.
- **Confirmation gate for MCP tools is server-self-declared and defaults OFF.** unchain `_convert_mcp_tool` (mcp.py:323-328) sets requires_confirmation=True ONLY when the MCP server's own `annotations.destructiveHint is True`. MCP SDK default is `destructiveHint: bool | None = None` (mcp/types.py:1268). A malicious/lazy server simply omits it → tool executes with no user prompt. enforcement itself is sound (confirmation.py:92-96; on_tool_confirm defaults to DENY on channel failure, unchain_adapter.py:618-624) — but it only fires if the tool opted in. This is the same systemic root #3 from SEC-001 (gate is self-declared by the audited party).
- http branch: backend requires http(s):// (mcp_toolkits.py:156) but NO SSRF filter — localhost/127.0.0.1/169.254.169.254/internal all reachable at install probe + every tool call. Same residual-risk class as Fetch/markitdown ([[accepted-risk-fetch-ssrf]]); custom path makes the URL fully user-supplied. Custom http has NO header/auth support (rejected mcp_toolkits.py:158).
- secrets: stdio env secrets stored plaintext in `~/.pupu/mcp_secrets.json` chmod 0600 (mcp_secrets.py:39-46). Better than API keys in localStorage. Injected as subprocess env only.

**Gate inventory (what exists / what's missing):**
- EXISTS: Flask per-route auth token; backend `_custom_entry` validation (transport/command/url/secret-key regex); 409 dup reject; argv-exec (no shell injection); secret file 0600; confirmation defaults-deny on channel break.
- MISSING (the gap): (1) NO install-time risk acknowledgment for custom — `handleInstall` (toolkits_page.js:185) calls installMcpEntry directly; the `acknowledgedRisk` flow exists ONLY for store-entry approval, not custom. (2) NO warning copy on custom_mcp_page — zero "this runs arbitrary code" i18n string (en.json:350-364). (3) NO SSRF egress filter. (4) custom tools get NO trustLevel/vetting that registry entries get (curator vetting bypassed entirely — that's the point of "custom" but means confirmation is the only runtime control, and confirmation is self-declared off).

**Minimal publishable gate (the no-go→go condition):** install-time explicit risk acknowledgment dialog on custom stdio install (checkbox "I understand this runs code on my computer" + the command shown), reusing existing `acknowledgedRisk` plumbing. That converts "arbitrary code exec with one click, no warning" into "informed user consent" = acceptable for a pre-launch local desktop app. SSRF + force-confirm-all-custom-tools = post-launch follow-ups, consistent with [[accepted-risk-fetch-ssrf]] basecase.

**Re SEC-001:** custom MCP activates systemic root #3 (self-declared confirmation) as a fresh attack surface, but does NOT reopen the accepted SEC-001 findings — this is a NEW feature, assessed fresh, not a re-litigation. [[sec-001-final-verdict]].
