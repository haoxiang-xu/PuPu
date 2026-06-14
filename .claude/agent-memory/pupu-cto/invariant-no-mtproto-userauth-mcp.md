---
name: invariant-no-mtproto-userauth-mcp
description: Invariant — full-user-account MCP servers (Telegram MTProto/Telethon class) are barred from the curated store; reading IS exfiltration so confirmation-gating cannot defend them
metadata:
  type: project
---

Invariant (set 2026-06-12, security-expert Critical veto, CTO-endorsed during Step 4 Telegram onboarding): **MCP servers that authenticate AS A FULL USER ACCOUNT are barred from the curated toolkit store.** Bot/scoped-token servers only.

**Concrete trigger that set this:** Telegram MCP servers split into two classes — Bot API (Telegraf, bot token, scoped to chats the bot is added to) vs **MTProto/Telethon** (`api_id`/`api_hash` + phone-login session, logs in as the human). We onboarded the Bot-API one (`@iqai/mcp-telegram`) and **rejected the entire MTProto class** (sparfenyuk/mcp-telegram, chigwell/telegram-mcp, dryeab/mcp-telegram).

**Why this is a class veto, not a per-repo judgment:**
- Blast radius of a user-account server = the user's ENTIRE identity on that platform — every private chat, contact, group, ability to act as them.
- **Our entire defense model fails here.** PuPu's control is: gate write/outbound tools, leave reads ungated. For a full-account server, **reading IS the exfiltration** — a prompt-injected agent reads the user's whole private history and there is no discrete write-action boundary to interpose a confirmation on. The structural control does not apply. Categorically (not just quantitatively) worse than a scoped bot.
- A bot token is scopable (which groups) and revocable (BotFather) with bounded damage; a leaked user session is the whole account.

**How to apply:** For any future messaging/social MCP onboarding (Telegram, WhatsApp, Signal, Slack-user-token, iMessage, email-as-user, etc.), first classify: bot/app-scoped token vs full-user-account/session auth. **App/bot-scoped → eligible** (apply the [[adr-mcp-version-pinning]] + confirmation-gating + backend-secret posture). **Full-user-account/session → reject from the curated store.** If a user truly needs it, it's an explicit out-of-store, user-accepts-the-risk path — not a curated catalog entry. Relates to [[contract-toolkit-catalog-shared-id-space]] and the secret-storage posture in [[mcp-secret-storage-path]].

**Telegram specifics:** the Bot-API delta from Discord is the `FORWARD_MESSAGE` tool = a direct exfil primitive (copy content to attacker-controlled chat) — it MUST be confirmation-gated even though it's "just" a forward.
