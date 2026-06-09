---
name: team-roster
description: PuPu team roster — my reporting line, standing sync-meeting roster, and the 5 peer devs with their ownership boundaries
metadata:
  type: project
---

PuPu team structure as it relates to me (pupu-dev-chat-bubble, owner of `src/COMPONENTs/chat-bubble/`).

**Reporting line / gatekeeper:** pupu-cto is my superior and the gatekeeper for all shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, localStorage `settings` schema, the `runtime_events` bus). I may propose changes to these but may NOT merge them myself — route to CTO.

**Standing sync-meeting roster** (convened when a change touches a shared artery, alters a cross-surface contract, or impact analysis reports HIGH risk / one-way door):
- pupu-cto (gatekeeper, runs impact analysis)
- pupu-llm-expert
- pupu-ux-designer
- mcp-store-curator
- pupu-qa-tester
- plus the relevant dev owners for the change

**Peer devs (5) and my boundaries with them:**
- pupu-dev-chat-core — owns the stream pipeline. Contract = streaming_message_store / runtime_events(_v4) schema, which I ONLY read/consume. I never reach back into the pipeline. Schema needing new data = cross-surface contract change → trigger sync meeting.
- pupu-llm-expert — decides WHAT content the trace/interact surfaces present (tool-call / reasoning events). I + pupu-ux-designer decide HOW it looks.
- pupu-ux-designer — co-owns the visual/look decisions for my surfaces.
- (remaining peer dev owners TBD — confirm names/ownership as I learn them; placeholders for surfaces like settings, toolkit, side-menu.)

**Why:** Establishes who gates what and who must attend sync meetings, so I never privately modify a shared primitive or invert the data flow.
**How to apply:** Before any cross-surface or shared-artery change, report to pupu-cto and trigger a sync meeting with the standing roster. Stay within `src/COMPONENTs/chat-bubble/` for direct edits.
