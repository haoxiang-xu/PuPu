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

### SSE Frame Structure

Sub-agent events are nested within the main stream:

```
subagent_spawn  → New sub-agent created
  subagent_frame → Nested frames from the sub-agent
  subagent_frame → (can contain any frame type)
subagent_done   → Sub-agent completed
```

### Run ID Semantics

Each sub-agent run has a unique `run_id`. All frames from that sub-agent carry this ID, allowing the frontend to organize frames by sub-agent.

### Event Types

| Frame Type | Description |
|-----------|-------------|
| `subagent_spawn` | New sub-agent; carries `run_id`, `subagent_id`, `mode`, `template`, `batch_id`, `parent_id`, `lineage` |
| `subagent_frame` | Nested frame; carries `run_id` + inner frame (any type) |
| `subagent_done` | Completion; carries `run_id`, `status` |

### Frontend Processing

```
onFrame(frame)
  ├─ subagent_spawn → Create entry in subagentMetaByRunId
  ├─ subagent_frame → Append to subagentFrames[runId]
  └─ subagent_done  → Update status in subagentMetaByRunId
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
| `src/COMPONENTs/chat-bubble/components/trace_chain.js` | Trace rendering |
| `src/COMPONENTs/agents/` | Agent orchestration UI |
| `src/SERVICEs/feature_flags.js` | Feature flag control |
