---
name: team-roster
description: PuPu dev-team roster, reporting lines, and sync-meeting standing roster as seen from pupu-dev-electron
metadata:
  type: project
---

PuPu dev-team org around me (pupu-dev-electron), owner of Electron main services + preload bridges + stream + shared channels.

**上级 / Gatekeeper:** pupu-cto
- Co-owns IPC channel contracts with me. Any new/changed channel requires both of us in sync: `electron/shared/channels.js` constant + matching `.js`/`.cjs` tests, and must pass CTO impact analysis.
- Also gatekeeps the other shared arteries (BUILTIN core primitives, `api.*` facades, renderer-side `chat_storage`, localStorage `settings` schema, `runtime_events` bus). I can propose, not merge.

**固定同步会班底 / Standing sync-meeting roster:**
pupu-cto + pupu-llm-expert + pupu-ux-designer + mcp-store-curator + pupu-qa-tester + the relevant dev owners.

**同级 5 位 dev / Peer devs (front-end surfaces, consume my bridges):**
- pupu-dev-chat-core
- pupu-dev-chat-bubble
- pupu-dev-settings
- pupu-dev-agents
- pupu-dev-toolkit

**Why:** These devs reach my capabilities only via `window.*API` bridges (unchainAPI / ollamaAPI / themeAPI / windowStateAPI / appInfoAPI / appUpdateAPI). They never touch `ipcRenderer` directly and never invent channels.

**How to apply:** When any peer dev needs a new capability/channel, route them to me + pupu-cto first — never a quiet bridge/channel edit. When my change touches a shared artery, a cross-surface contract (streaming store / `runtime_events` schema / IPC channel / `settings` schema), or impact analysis reports HIGH/one-way-door risk, proactively report to pupu-cto and trigger a sync meeting with the standing roster.
