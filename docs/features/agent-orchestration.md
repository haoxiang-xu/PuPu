# Agent Orchestration

> Sub-agent delegation, event flow, and prompt composition.

---

## Overview

PuPu's agent system is built on the **Unchain SDK**. The main agent can delegate tasks to sub-agents, each running in isolation with their own tools and context.

---

## Agent Modules

The Unchain agent uses modular composition:

| Module | Purpose |
|--------|---------|
| `ToolsModule` | Tool registration and execution |
| `MemoryModule` | Memory read/write integration |
| `PoliciesModule` | Behavioral policies and guardrails |
| `OptimizersModule` | Response optimization |
| `SubagentModule` | Sub-agent delegation |

---

## Agent Orchestration Modes

Stored per-chat as `agentOrchestration.mode`:

| Mode | Description |
|------|-------------|
| `default` | Standard agent behavior |
| `developer_waiting_approval` | Requires user approval before tool execution |

---

## Prompt Composition

### Section Order

The backend composes the agent prompt from sections in this fixed order:

```
identity → personality → capability → rules → workflow →
delegation → style → output_format → context → constraints → fallback
```

### Merge Strategies

The per-module merge strategy is a **fixed mapping** (`PROMPT_MODULE_MERGE` in `prompts/module_config.py`), not chosen per request. Only two modules are non-`replace`:

- `rules` → **prepend** (builtin → user → agent)
- `constraints` → **append** (agent → user)
- the other 9 modules → **replace** (first non-empty wins, preference user > agent > builtin)

The module order and merge map are sourced from the `unchain_runtime/server/prompts/` package, the same source as [System Prompt V2](../architecture/system-prompt-v2.md#backend-compilation). Composition runs through `_build_modular_prompt()` in `unchain_adapter.py`.

### Prompt Section Template

```python
_MY_AGENT_PROMPT_SECTIONS = {
    "identity": "You are PuPu's [role] agent.",
    "capability": "You have access to [tools].",
    "workflow": "- Step 1\n- Step 2\n- Step 3",
    "constraints": "- Never do X.\n- Always do Y.",
    "fallback": "For unrelated requests, [behavior].",
}

prompt = _compose_agent_prompt(_MY_AGENT_PROMPT_SECTIONS)
```

### Agent Types and Required Sections

| Agent Type | Sections Used |
|-----------|---------------|
| Main (developer) | identity, capability, workflow, delegation, constraints, fallback |
| Sub-agent (analyzer) | identity, capability, constraints |
| Simple (no tools) | identity, workflow, fallback |

---

## Sub-Agent Event Flow

### Stream Models

PuPu supports several stream models for sub-agent activity:

| Protocol | Endpoint | Shape | Frontend path |
|----------|----------|-------|---------------|
| V4 | `POST /chat/stream/v4` | Normalized runtime events via `RuntimeEventBridge` (from `unchain.events`): `emit_session_started()` → `normalize(raw_event)` → `diagnostics()`; transport errors via `emit_transport_failure()` | RuntimeEventStore -> ActivityTree -> TraceChain adapter |
| V3 | (frame protocol) | `run.started` with `links.parent_run_id`, then typed child-run events | RuntimeEventStore -> ActivityTree -> TraceChain adapter |
| V2 | `POST /chat/stream/v2` | Legacy TraceFrames built manually (`_build_trace_frame()`) with child `run_id` and lifecycle frames | Direct frame handling in `use_chat_stream.js` |

> V4 is driven server-side by `chat_stream_v4()` in `route_chat.py`. The bridge (`RuntimeEventBridge`) is imported from the unchain core library; if it is unavailable the route returns `500` with error code `runtime_events_unavailable`. There is no `/chat/stream/v3` HTTP route — V3 refers to the runtime-event frame protocol consumed by the frontend, served over the V4 transport.

### Run ID Semantics

Each sub-agent run has a unique `run_id`. In V3, the child run links back to the parent through `links.parent_run_id`. In V2, child frames carry the child run id directly. The frontend keeps child-run frames separate from the main message so TraceChain can render them as nested branches.

### V3 Runtime Events

| Event | Description |
|-------|-------------|
| `run.started` | Creates the sub-agent entry when `links.parent_run_id` is present |
| `model.delta` | Streams child model text into that child run |
| `tool.started` / `tool.completed` | Renders child tool calls and results on the child branch |
| `input.requested` / `input.resolved` | Renders Ask User or confirmation UI on the child branch |
| `run.completed` / `run.failed` | Updates sub-agent status and completion metadata |

The V3 reducer also preserves one compatibility behavior: if an old backend emits an Ask User request with the root `run_id` while exactly one child run is active, PuPu routes that request to the active child branch.

### V2 Compatibility Frames

| Frame Type | Description |
|-----------|-------------|
| `subagent_started` | New sub-agent; carries `child_run_id`, `subagent_id`, `mode`, `template`, `batch_id`, `parent_id`, `lineage` |
| child frame with `run_id` | Appended to `subagentFrames[runId]`; can be tool, model, reasoning, final, or confirmation UI |
| `subagent_completed` | Completion; carries `child_run_id`, `status` |
| `subagent_failed` | Failure; carries `child_run_id`, error details |

### Frontend Processing

V3 first reduces events into an ActivityTree, then adapts that tree into the legacy TraceChain props:

```
runtime_event
  ├─ RuntimeEventStore.append(event)
  ├─ reduceActivityTree(snapshot)
  └─ adaptActivityTreeToTraceChain(...)
       ├─ frames
       ├─ subagentFrames[runId]
       └─ subagentMetaByRunId[runId]
```

V2 keeps the direct frame path:

```
onFrame(frame)
  ├─ subagent_started → Create entry in subagentMetaByRunId
  ├─ child run frame → Append to subagentFrames[runId]
  ├─ subagent_completed → Update status in subagentMetaByRunId
  └─ subagent_failed → Update status and error metadata
```

Sub-agent frames are stored separately from the main message's trace frames:

```javascript
{
  // Main message
  traceFrames: TraceFrame[],
  subagentFrames: { [runId]: TraceFrame[] },
  subagentMetaByRunId: { [runId]: SubagentMeta },
}
```

---

## Subagent & Recipe Loading (Backend)

Subagents and recipes are loaded from disk at chat-session start, on the backend.

### Subagents (`subagent_loader.py`)

`load_templates()` scans `.soul` and `.skeleton` files in the user dir (`~/.pupu/subagents/`) and the workspace dir, parses them, validates, applies precedence, and returns ready-to-register `SubagentTemplate` instances.

| File format | Parser | Carries |
|-------------|--------|---------|
| `.soul` | `parse_soul()` | YAML frontmatter (`name`, `description`, `tools`, `model`) + body instructions |
| `.skeleton` | `parse_skeleton()` | Full JSON config (`allowed_modes`, `output_mode`, `memory_policy`, `parallel_safe`, `allowed_tools`, `model`) |

Precedence on name conflict (`_dedupe_by_precedence()`): `user.skeleton` > `user.soul` > `workspace.skeleton` > `workspace.soul`. A subagent's declared `allowed_tools` is intersected against the main agent's toolset (`_compute_effective_tools()`) so a subagent can never exceed the parent's tools.

### Recipes (`recipe_loader.py`)

Recipes live as `<Name>.recipe` JSON files under `~/.pupu/agent_recipes/`. Invalid files are skipped with warnings, never raised.

| Function | Purpose |
|----------|---------|
| `list_recipes()` | List recipe metadata (name, description, model, toolkit_ids, subagent_count) |
| `load_recipe(name)` | Load a single recipe (or `None`) |
| `save_recipe(data)` | Validate + write a recipe |
| `delete_recipe(name)` | Delete a recipe file (the `Default` recipe is protected) |
| `list_subagent_refs()` | Enumerate available subagent source files for referencing |

A recipe carries a `subagent_pool` (see `recipe.py`) — a tuple whose entries are one of:
- `SubagentRef` (`kind="ref"`) — references a `.soul`/`.skeleton` template by `template_name`
- `RecipeSubagentRef` (`kind="recipe_ref"`) — references another recipe by `recipe_name`
- `InlineSubagent` (`kind="inline"`) — defines a subagent inline

Each pool entry supports `disabled_tools` to selectively restrict tool access. These backend loaders serve the `/agent_recipes/*` routes (see [Flask Endpoints](../api-reference/flask-endpoints.md#agent-recipes)).

---

## Trace Chain Rendering

The chat bubble renders trace frames as a "trace chain" — a visual timeline of tool calls, reasoning steps, memory operations, and sub-agent activities.

Sub-agent frames are rendered as nested chains within the main trace.

---

## Feature Flags

Agent orchestration UI is gated by two independent flags — one for the Agents tab, one for the Characters tab:

```javascript
FEATURE_FLAG_DEFINITIONS = {
  enable_user_access_to_agents: {
    description: "Show the Agents tab inside the Agents modal.",
    defaultValue: false,
  },
  enable_user_access_to_characters: {
    description: "Show the Characters tab inside the Agents modal.",
    defaultValue: false,
  },
}
```

The side-menu entry appears whenever **either** flag is enabled. When only one is enabled, the modal opens to that tab and the other tab shows a "Coming soon" placeholder. When both are disabled, the entry is hidden entirely.

---

## Key Files

| File | Role |
|------|------|
| `unchain_runtime/server/unchain_adapter.py` | Agent creation, prompt composition, sub-agent delegation |
| `unchain_runtime/server/prompts/` | Prompt module config + agent sections (`module_config.py`, `agents/developer.py`) |
| `unchain_runtime/server/subagent_loader.py` | Loads `.soul`/`.skeleton` subagent templates |
| `unchain_runtime/server/recipe_loader.py` | Loads `.recipe` agent recipes + subagent refs |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Sub-agent frame handling |
| `src/SERVICEs/runtime_events/` | V3 RuntimeEvent store, ActivityTree reducer, and TraceChain adapter |
| `src/COMPONENTs/chat-bubble/trace_chain.js` | Trace rendering |
| `src/COMPONENTs/agents/` | Agent orchestration UI |
| `src/SERVICEs/feature_flags.js` | Feature flag control |
