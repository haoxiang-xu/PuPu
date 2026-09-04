---
name: discord-entry-and-version-pin-rule
description: Discord MCP store entry (mcp.productivity.discord, needs_review) + the CTO standing rule that needs_review/community stdio entries get a pinned version
metadata:
  type: project
---

**Discord entry added 2026-06-13** (CEO onboarding round 2026-06-12, Step 3).

- id `productivity.discord` / toolkitId `mcp.productivity.discord` / category `communication`.
  Filed under `productivity.*` id-prefix + `communication` category to mirror Slack exactly.
- Package: `@iqai/mcp-discord` (IQAI, MIT, repo `IQAIcom/mcp-discord`; npm metadata says `IQAICOM` but canonical/redirect is `IQAIcom` — metadata http_json points at canonical).
- **NOT the Java SaseQ one** (Docker/JAR doesn't fit stdio model).
- mcp: `npx -y @iqai/mcp-discord@0.0.6`. **No `--config` arg** — package reads `DISCORD_TOKEN` from env via dotenv (`parseDiscordToken(args, env.DISCORD_TOKEN)`; `--config <token>` is only an optional override). Backend injects the secret as env.
- `trustLevel: needs_review`, `installable: true`, `license: MIT`.
- Secret: `DISCORD_TOKEN` declared in `secrets` array (backend mcp_secrets.py path, NOT localStorage). Stdio secret-array shape mirrors Grafana/Netdata/old-Slack-stdio, not the OAuth remote entries (those use `secrets: []`).
- **22 tools** (verbatim from package `dist/tool-list.js`). 4 read-only (`requiresConfirmation: false`): `discord_get_server_info`, `discord_read_messages`, `discord_get_forum_channels`, `discord_get_forum_post`. 18 gated (`true`): every send/create/edit/delete/reaction/webhook + `discord_login`. policySummary.confirmationRequiredTools=18, reviewed=true, defaultEnabledTools=0.
- readmeMarkdown carries the security-expert's **least-privilege bot-invite** instruction (no Administrator; minimum guild/channel perms; single-guild scope) + **third-party / pending-review** note. This is the single highest-leverage control and is not code-enforceable.

**STANDING RULE (CTO arbitration 2026-06-12)**: needs_review / community **stdio** entries get a **pinned version** (e.g. `@0.0.6`), NOT `@latest`. Only verified first-party may ride `@latest`. Reason: immature third-party releases must be re-vetted, not silently auto-pulled.
- Note: existing verified entries already follow this — Playwright/Chrome use `@latest` (verified first-party); Grafana/MarkItDown/Fetch pin implicitly via uvx package name.

**Why**: load-bearing for future communication/third-party adds.
**How to apply**: when adding any third-party stdio server, pin the version, declare backend secret in `secrets[]`, gate every write/DM/webhook/moderation tool, and put a least-privilege provisioning instruction in readmeMarkdown. See [[catalog-source-of-truth]] and [[slack-dual-entry-and-tool-name-qualification]].
