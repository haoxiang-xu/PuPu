---
name: subagent-and-agent-loop-architecture
description: How unchain core runs the agent loop + subagent model today (verified from code 2026-06-10), and what the A2A central-channel proposal would require. Read before any subagent/channel/multi-agent work.
metadata:
  type: project
---

Verified by reading code on 2026-06-10 (branch `codex/runtime-events-v4`). unchain core repo at sibling path (DO NOT hardcode; discover via config — CEO预告 path 会变). PuPu server `unchain_runtime/server/` is the only real adapter copy.

## Agent run loop (unchain core)
- `agent/agent.py` `Agent.run()` → builds via modules → `kernel/loop.py` `KernelLoop._run_state()`.
- Loop is a synchronous `while True` over iterations. Each `step_once()` = one model turn: dispatch `before_model` harnesses → `fetch_model_turn` (with retry) → `apply_model_turn` → `on_tool_call`/`after_tool_batch` harnesses → `state.iteration += 1`.
- **Iteration boundary = top of the `while` in `_run_state`** (loop.py ~712). That is the natural injection point for "inject message before next iteration": between `iteration_started` emit and `step_once`. Model input is rebuilt from `state.transcript` each step (`rebuild_working_version_from_transcript`), so injecting a message into transcript before `step_once` would surface it to the model next turn.
- Tools execute inside `on_tool_call`/`after_tool_batch` phase via ToolRuntimePlugins (`tools/runtime.py`).

## Subagent model (the "过于简单" one)
- Files: core `subagents/{plugin,executor,runtime_tools,types}.py`; PuPu side `subagent_loader.py` (parses `.soul`/`.skeleton` templates) + `unchain_adapter.py` wires `SubagentToolPlugin` + `SubagentPolicy` (adapter ~4445-4616, 4990).
- Three reserved tools (runtime_tools.py), all no-op stubs intercepted by `SubagentToolPlugin.can_handle`: `delegate_to_subagent`, `handoff_to_subagent`, `spawn_worker_batch`.
- Execution model = **strictly hierarchical tree, blocking nested runs**:
  - delegate/handoff/worker all call `_run_child` → `agent.run(...)` — a **fresh full KernelLoop run** for the child, SYNCHRONOUS, inside the parent's tool-execution phase. Parent's iteration blocks until child returns.
  - `Agent.fork_for_subagent` (agent.py) = `clone()` with an instruction overlay; ephemeral memory_policy strips MemoryModule.
  - worker_batch parallelism = `SubagentExecutor.execute_batch` = `ThreadPoolExecutor(max 4, 30s timeout)`. Each worker is still an isolated `agent.run`.
- **No shared message bus. No peer-to-peer. No mailbox.** Child returns a result dict UP to parent; siblings cannot talk; a child cannot push to a parent mid-run. Identity/lineage tracked in `SubagentState` (lineage_counters, max_depth/max_children/max_total policy caps). This is the gap the A2A channel would fill.

## events_v4 protocol
- `events_v4/types.py`: 13 event types (session/run/turn/step/interaction/artifact). `RuntimeEventLinksV4` ALREADY has `channel_id` and `team_id` fields (also in legacy `events/types.py`). **BUT pure dead scaffolding** — grep shows nothing emits or reads them; no channel/A2A module exists in either repo (2026-06-10). Someone pre-wired the link schema for channels; the runtime is absent.
- Adding new event types (e.g. `channel.message`) = edit `RUNTIME_EVENT_TYPES_V4` frozenset + Literal. **This is a model-visible/frame-semantics change → 智 review + (core interface) 智+CTO 双签.**

## Async / threading reality (PuPu adapter)
- `unchain_adapter.py` runs the agent in a **daemon worker thread** `run_workflow` (~4891) feeding a `queue.Queue` (`event_queue`, ~4863). SSE generator drains the queue → frames. `Agent.run` itself is blocking; the thread is what makes streaming async to Flask.
- So: cross-agent async delivery + iteration-boundary injection is NOT free today. The loop has no inbox poll, no scheduler, no shared registry of live runs. A channel needs a process-level broker + an inbox check the loop performs at the iteration boundary.

## A2A central-channel — engineering verdict (for ADR)
- **Cross repo:** mailbox/inbox-poll-at-iteration-boundary + `send_message_in_channel` tool semantics = **MUST touch unchain core** (`kernel/loop.py`, new channel module, `runtime_tools.py`, `subagents/types.py` state, `events_v4`). NOT adapter-only. → 智+CTO 双签 territory (core interface change).
- **Smallest landable slice:** in-process channel broker + the loop checking an inbox at the iteration boundary (inject queued @-messages into transcript before `step_once`), single run / single process first. `send_message_in_channel` registered as a real Tool (not a stub like the subagent ones). Defer cross-process / cross-run / persistent org.
- **Where it翻车:** (1) injecting mid-tool-batch corrupts provider tool-call/tool-result pairing (see `_sanitize_handoff_messages` — Anthropic rejects orphaned tool_use) — inject ONLY at clean iteration boundary, never between a tool_use and its result. (2) blocking subagent model means a "live" @-able agent must be a concurrently-running loop, not the current run-to-completion child — current executor can't host that. (3) loops/storms: A @ B @ A with no turn budget = infinite injection; need per-channel turn/depth budget like SubagentPolicy. (4) double-edge of events_v4 channel_id being pre-wired but dead — don't assume it's hooked up.
</content>
</invoke>
