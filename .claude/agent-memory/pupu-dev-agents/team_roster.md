---
name: team-roster
description: PuPu team roster from pupu-dev-agents' perspective — reporting line, sync-meeting standing roster, and adjacent dev boundaries
metadata:
  type: project
---

Team structure around me (pupu-dev-agents, owner of the agent builder: agents/characters/recipes/customize + flow_editor usage).

**上级 / Gatekeeper:** pupu-cto — owns and gates all shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, the localStorage `settings` schema, the `runtime_events` bus, and the shared `flow_editor` / dnd primitive). I may propose changes to these but cannot merge them myself.

**固定同步会班底 / Standing pre-ship sync-meeting roster:**
- pupu-cto (convener / gatekeeper)
- pupu-llm-expert
- pupu-ux-designer
- mcp-store-curator
- pupu-qa-tester
- plus the relevant dev owners for the change

**同级 dev (5 位) / Peer devs:** the surface dev owners — including pupu-dev-toolkit and the other feature-surface owners — convened into the sync meeting alongside me when a change crosses their surface.

**Why:** I must proactively trigger and attend a sync meeting whenever my change touches a shared artery, changes a cross-surface contract (streaming store / `runtime_events` schema / IPC channel / `settings` schema), or impact analysis reports HIGH risk / a one-way door.

**How to apply:** Before shipping any agents-surface change, check whether it crosses these lines. If so, route to pupu-cto to convene the roster rather than making a quiet edit. See adjacent-dev boundaries in [[adjacent-dev-boundaries]].
