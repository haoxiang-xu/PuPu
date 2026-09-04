---
name: telegram-entry-2026-06
description: Telegram MCP store entry (mcp.productivity.telegram, needs_review, @0.1.4) — Discord's direct sibling, Bot-API-only, FORWARD_MESSAGE gated as exfil primitive
metadata:
  type: project
---

**Telegram entry added 2026-06-13** (CEO onboarding round, Step 4). Direct sibling of [[discord-entry-and-version-pin-rule]] — same IQAI org, same npx/stdio model, same posture.

- id `productivity.telegram` / toolkitId `mcp.productivity.telegram` / category `communication` (productivity.* id-prefix + communication category, mirrors Discord/Slack).
- Package `@iqai/mcp-telegram@0.1.4` — **Telegram Bot API (Telegraf)**, NOT MTProto/user-account (security rejected that whole class outright; see security memo [[mcp-vetting-telegram-2026-06]]). Repo IQAIcom/mcp-telegram, MIT.
- mcp: `npx -y @iqai/mcp-telegram@0.1.4`. **Version pinned** per the standing CTO rule (needs_review third-party stdio never @latest).
- Token: `TELEGRAM_BOT_TOKEN` read from env via dotenv+zod (verified in tarball `dist/config.js`, required, min(1)). No CLI arg — bin `mcp-telegram→dist/index.js`. Declared in `secrets[]` (backend mcp_secrets.py path, NOT localStorage).
- **5 tools** (verbatim from tarball `dist/index.js` AVAILABLE_TOOLS + each `dist/tools/*.js` name). 2 read ungated: `GET_CHANNEL_INFO`, `GET_CHANNEL_MEMBERS`. 3 gated: `SEND_MESSAGE`, `PIN_MESSAGE`, and **`FORWARD_MESSAGE`** (critical: copies content to another chat = exfiltration primitive, must stay gated). policySummary confirmationRequiredTools=3, reviewed=true, defaultEnabledTools=0.
- Package supports **mention-only mode** (`SAMPLING_MENTION_ONLY`, default true) + a large `SAMPLING_*` env surface (allow/block chats/users, rate limits). readmeMarkdown carries: @BotFather least-privilege bot setup (membership = blast radius, not code-enforceable), enable mention-only, FORWARD_MESSAGE exfil warning, third-party/pending-review note.
- Test: "telegram is registered as a needs-review communication MCP" in mcp_toolkit_store.test.js, Discord-style (asserts ids, @0.1.4 recipe, TELEGRAM_BOT_TOKEN, 5 tools / 3 gated incl. FORWARD_MESSAGE explicitly, policySummary, mention-only + pending-review readme strings).

**Why**: completes the communication-category third-party IM trio (Slack/Discord/Telegram).
**How to apply**: pattern-template for the next IM/bot-token third-party add; always pin version, gate every send/forward/pin/state tool, FORWARD-type tools are exfil and non-negotiably gated. See [[catalog-source-of-truth]].
