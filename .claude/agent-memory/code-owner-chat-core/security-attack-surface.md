---
name: security-attack-surface
description: Security attack-surface notes for my chat-core territory from SEC-INVESTIGATION-001 — confirmation-gate trust model, storage-as-time-machine, and the avatar <img src> sink
metadata:
  type: project
---

My chat-core territory's attack surface (from SEC-001, 2026-06-10). I own the consumption of ② SSE frames and the rendering/persistence of ③ model/MCP output. See [[contract-bubble-streaming]].

**Core lesson: type-checking a frame field ≠ trusting it.** `use_chat_stream.js` validates the *shape* of every `frame.payload.*` field well, but the *trust model* assumes the backend frame is the source of truth for security decisions. It isn't — the frame ultimately carries ③ (MCP/LLM) content.

**Confirmation gate (the hot spot):**
- `use_chat_stream.js:2342-2344, 2619-2621`: `requiresConfirmation = frame.payload?.requires_confirmation === true || Boolean(confirmationId)`. A tool_call frame that simply omits these fields is treated as "no confirmation needed."
- `:1001-1022` `isToolCallAutoApprovable` keys auto-approve on frame-self-reported `toolkit_id:tool_name` (`:1006-1009`, `:1014-1016`). Client can't verify the frame's claimed identity matches the real action → a malicious orchestration can impersonate a previously-approved `toolkit_id:tool_name`.
- **The gate's true source of truth MUST be server-side (unchain_adapter, llm-expert's domain).** Front-end should at most add a defense-in-depth fallback whitelist for known-dangerous tools.

**Storage = injection time-machine.** Persisters (`background_stream_persister.js`, `finalize_stream_persist.js`) go through `setChatMessages` (compliant). `chat_storage_sanitize.js sanitizeMessage` only does structural/length cleaning — message `content` HTML is stored verbatim by design (fidelity). The XSS risk lands in chat-bubble's markdown renderer on replay (sanitize_html defaults false — bubble dev's checklist 3). Don't sanitize at the storage layer; align the "store raw / sanitize at render" boundary with bubble dev.

**Non-obvious sink I had overlooked:** `side_menu.js:57-77 resolveCharacterAvatarSrc` returns a character avatar URL verbatim into `<img src>` (`:148`) with NO scheme filtering — accepts `http:`/`file:`/`data:`. `chat_storage_sanitize.js:349 sanitizeCharacterAvatar` only trims, doesn't check scheme. A malicious imported character card (③) → outbound beacon / local-file read / data-exfil, no XSS needed. **Any place ③ content enters a DOM attribute (src/href/style-url) is a sink, not just HTML-injection points.**

**Why:** CEO-mandated educational goal of SEC-001; these are the structural trust gaps in my surface, not one-off bugs.
**How to apply:** When touching confirmation logic, never treat a frame field as a security decision — defer to server + add fallback. When touching any render sink for ③ content (avatars, links, embeds), apply a scheme/URL whitelist at the sink even if upstream "should" have. Confirmation/auto-approve changes are cross-layer (llm-expert + toolkit + CTO) → sync meeting.
