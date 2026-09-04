---
name: memory-agent-settings-orphaned
description: memory_agent_settings.js has a reader but no writer — its Agent Builder card was deleted on 2026-08-04 and the replacement Settings surface was never built
metadata:
  type: project
---

`src/SERVICEs/memory_agent_settings.js` (namespace `memory_agent_v2`) is **a persistence module with no writer**. Its four fields (`displayName` / `additionalInstructions` / `provider` / `modelId`) ship on every Memory V2 turn as compile-time constants.

**Why:** it is the residue of a half-completed removal, not an oversight. `0dc333dc` (2026-08-04) introduced the module **together with** its writer, `src/COMPONENTs/agents/pages/recipes_page/memory_agent_system_panel.js` (370 lines) — a System Agent card in the Agent Builder. `eaf5a296` (same day) deleted the panel, its test card, and `recipe_list.js`, added the `workflow_list.test.js` guard that keeps Memory V2 off the Builder surface, and rewrote this file's header from "a SYSTEM agent surfaced in the Agent Builder" to "It is not an Agent Builder node" — deferring the error surface to "**a future settings surface**" (still in the comment at `:13-14`). That surface is mine and does not exist. The locked architectural consensus "Memory is not an Agent in the Builder" forbids the old home without naming a new one.

**How to apply:**
- **Never repeat the claim that renaming `memory_agent_v2` would drop user data.** It has never had a writer (verified by grep over `src/ electron/ e2e/ scripts/`, by `git log -S` over all history, and by `settings.db` having no such row while `legacy_migration_state = "complete"`). Rename cost is one constant, zero rows, zero migration — and the benefit is likewise zero, so the answer is "not worth doing", not "too expensive".
- `DEFAULT_MEMORY_AGENT_DISPLAY_NAME = "Memory Agent"` (`:24`) is **not user-facing copy and cannot be i18n'd** — no renderer component reads it; its only path is serialization onto the wire, where it becomes an agent identity in the Python sidecar. The backend carries a *different* default (`"Memory Curator"`), reachable only by a non-renderer caller.
- `normalizeMemoryAgentSettings` is a **total function**: every failure mode of settings persistence (SQL unavailable, degraded, migration failed, corrupt record, first run, cleared storage) degrades to the same read path, which always returns a non-empty `displayName`. Useful whenever someone asks whether a "settings missing" branch is reachable — for this module it is not.
- If asked to build the Memory Agent config surface: it lands on me, but **whether it should exist is not mine to decide** (it was removed by an architectural consensus). Also honor the payload rule — the four fields are picked out field-by-field at the send site, never spread wholesale, so no future namespace field can ride upstream.

See [[settings-schema-cto-gated]], [[feature-flags-production-readonly]].
