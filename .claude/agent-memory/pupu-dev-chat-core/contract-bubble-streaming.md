---
name: contract-bubble-streaming
description: My cross-surface contract with pupu-dev-chat-bubble — the streaming_message_store / runtime_events(_v4) schema; changing it triggers a sync meeting
metadata:
  type: project
---

The boundary with `pupu-dev-chat-bubble` is the **streaming_message_store / runtime_events(_v4) schema**. I *produce/drive* the live stream data; the bubble dev only *consumes* it to render. See [[team-roster]].

Relevant files (verified present 2026-06-09):
- `src/SERVICEs/streaming_message_store.js`
- `src/SERVICEs/streaming_message_chunks.js`
- `src/SERVICEs/runtime_events/` and `src/SERVICEs/runtime_events_v4/` (a v4 schema migration is in flight — branch `codex/runtime-events-v4`).

**Why:** This is a cross-surface contract. A schema change here silently breaks the bubble dev's rendering — it is exactly the kind of one-way / multi-owner change the sync-meeting duty exists for.
**How to apply:** Any change to this schema MUST be reported to `pupu-cto` and trigger a sync meeting before merge. Run `gitnexus_impact` first and report blast radius. Do not change the schema to suit a chat-core feature without bringing the bubble dev in.
