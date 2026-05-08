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

Each section can use one of three merge strategies:
- **replace** — overwrites the existing value
- **prepend** — adds before the existing value
- **append** — adds after the existing value

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

PuPu supports two stream models for sub-agent activity:

| Protocol | Shape | Frontend path |
|----------|-------|---------------|
| V3 | `run.started` with `links.parent_run_id`, then typed child-run events | RuntimeEventStore -> ActivityTree -> TraceChain adapter |
| V2 | Legacy TraceFrames with child `run_id` and lifecycle frames | Direct frame handling in `use_chat_stream.js` |

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
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Sub-agent frame handling |
| `src/SERVICEs/runtime_events/` | V3 RuntimeEvent store, ActivityTree reducer, and TraceChain adapter |
| `src/COMPONENTs/chat-bubble/trace_chain.js` | Trace rendering |
| `src/COMPONENTs/agents/` | Agent orchestration UI |
| `src/SERVICEs/feature_flags.js` | Feature flag control |
