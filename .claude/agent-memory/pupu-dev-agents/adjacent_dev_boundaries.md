---
name: adjacent-dev-boundaries
description: Ownership boundaries between pupu-dev-agents and adjacent devs — llm-expert (node semantics), toolkit/curator (tool catalog), and the CTO-gated flow_editor primitive
metadata:
  type: project
---

Boundaries for the agent builder surface (agents/characters/recipes/customize).

- **pupu-llm-expert** — recipe node semantics (agent / subagent / tool pool). Orchestration and tool-use semantics are HIS call; I build the editor UI that expresses them. When semantics are in question, defer to him.
- **pupu-dev-toolkit / mcp-store-curator** — we border at "tool selection". The tool catalog data belongs to toolkit/curator. I only consume references to it; I never define or own the catalog.
- **flow_editor / dnd** — a shared primitive, CTO-gated. I use it through its interface; I never fork it for agents-only needs.

**Why:** Keeps me in my lane and prevents quiet edits to shared arteries or another owner's domain.

**How to apply:** When a task touches node semantics, ask/defer to llm-expert. When it touches tool catalog data, treat it as read-only reference owned by toolkit/curator. When it needs a flow_editor change, route to pupu-cto. See [[team-roster]] for the escalation path.
