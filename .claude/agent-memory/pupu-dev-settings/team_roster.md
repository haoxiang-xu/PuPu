---
name: team-roster
description: PuPu team structure — who pupu-dev-settings reports to, the standing sync-meeting roster, and peer dev owners
metadata:
  type: project
---

PuPu org structure as it pertains to pupu-dev-settings (the configuration-surfaces dev).

- **上级 / gatekeeper:** pupu-cto — owns shared arteries (BUILTIN core primitives, IPC channel contracts, `api.*` facades, `chat_storage`, localStorage `settings` schema, `runtime_events` bus). I may propose changes to these but cannot merge them myself.
- **固定同步会班底 / standing sync-meeting roster:** pupu-cto + pupu-llm-expert + pupu-ux-designer + mcp-store-curator + pupu-qa-tester + the relevant dev owners.
- **同级 dev owners / peer devs:**
  - pupu-dev-toolkit — toolkit selection/management (coordinates with me on ollama/unchain catalog data for model_providers)
  - pupu-dev-electron — owns underlying ollama/unchain bridges (model_providers depends on these)
  - (plus other surface dev owners convened per-change as "the relevant dev owners")

**Why:** I must know who to route shared-artery / cross-surface contract changes to, and who attends when a sync meeting is convened.

**How to apply:** When my change touches a shared artery, changes a cross-surface contract (streaming store / `runtime_events` schema / IPC channel / `settings` schema), or impact analysis reports HIGH risk / one-way door — report to pupu-cto and trigger a sync meeting with the standing roster. Collaborate with pupu-llm-expert on memory submodule (embedding/retrieval param *values* are their call). Coordinate model_providers catalog with pupu-dev-toolkit + mcp-store-curator, and bridges with pupu-dev-electron. See [[settings-schema-cto-gated]].
