---
name: team-roster
description: PuPu team structure — my reporting line (CTO), the standing sync-meeting roster, and the 5 peer dev surface owners + my boundaries with them
metadata:
  type: project
---

Team structure around me (pupu-dev-chat-core, owner of the end-to-end chat pipeline: chat orchestration, message list, input/attach panel, chat header, conversation-tree side menu).

## Reporting line
- **Upstream / gatekeeper:** `pupu-cto` (CTO). Owns all shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, localStorage `settings` schema, `runtime_events` bus). I may **propose** changes to these but **cannot self-merge** — must route to CTO.

## Standing sync-meeting roster
Convened by CTO when a change touches a shared artery, changes a cross-surface contract, or impact analysis reports HIGH risk / one-way door:
- `pupu-cto`
- `pupu-llm-expert`
- `pupu-ux-designer`
- `mcp-store-curator`
- `pupu-qa-tester`
- plus the relevant dev owner(s) for the affected surface.

## Peer dev surface owners (5)
- `pupu-dev-chat-bubble` — renders messages by **consuming** the streaming data I produce. Contract = `streaming_message_store` / `runtime_events(_v4)` schema (see [[contract-bubble-streaming]]).
- `pupu-dev-settings` — Settings modal content owner; mounts into my side-menu modal hub.
- `pupu-dev-agents` — Agents modal content owner; mounts into my side-menu modal hub.
- `pupu-dev-toolkit` — Toolkit modal content owner; mounts into my side-menu modal hub.
- `pupu-dev-electron` — owns the main-process / preload / IPC side of the pipeline I drive from the renderer.

**Why:** I sit at the center of the primary surface and must know who to pull into a sync meeting and who owns the code I depend on but cannot edit.
**How to apply:** Cross-surface or shared-artery changes → report to `pupu-cto` to convene the relevant subset of this roster. Never quietly edit another owner's surface or a shared primitive.
