# Grounding: Agent Teams one-way-door (2026-06-20)

## What "agent" is in unchain/PuPu (code facts)
- Main Agent = unchain `Agent(name, instructions, provider, model, api_key, modules)`. One per chat session, run in worker thread via Agent.run().
- unchain engine = private wheel. PuPu has only TWO write hooks (memory side: 923 rerank read-hook, long_term_extractor write-hook) and unknown kwargs are silently dropped. We do NOT own the agent loop internals.
- Subagent = `SubagentTemplate(name, description, agent=childAgent, allowed_modes, output_mode, memory_policy, parallel_safe, allowed_tools, model)`. Loaded from .soul (YAML frontmatter) / .skeleton (JSON) files, user_dir + workspace_dir, precedence-deduped. subagent_loader.py.
- Delegation primitives are RESERVED NAMES owned by engine: delegate_to_subagent / handoff_to_subagent / spawn_worker_batch. Modes: delegate | handoff | worker. output_mode: summary|last_message|full_trace. memory_policy: ephemeral|scoped_persistent. parallel_safe flag exists.
- Recipe = user-composable config (recipe.py): main RecipeAgent + ToolkitRef[] + subagent_pool(SubagentRef|RecipeSubagentRef|InlineSubagent) + node/edge GRAPH.
- Graph node types: start, end, agent, toolkit_pool, subagent_pool. Edges: flow (out->in) + attach (agent<->pool). validate_recipe_graph enforces: exactly 1 start, 1 end, >=1 agent, NO cycles, single flow in/out per node => the graph is a LINEAR CHAIN of agents with pools attached. Not a DAG, no fan-out, no branching.

## How inter-agent communication ACTUALLY works today (the de-facto "channel")
- run_workflow() iterates compiled["agents"] SEQUENTIALLY. Each agent's output is written into a `variables` dict keyed by nodeId; the next agent's prompt does `{{#nodeId.field#}}` substitution (_replace_workflow_variables). That string-passing pipe IS the entire inter-agent comms model at the graph level.
- WITHIN one agent: subagent delegation via the engine's delegate/handoff/worker tool-loop (we don't own that loop). Recipe-as-subagent nesting via _WorkflowRecipeSubagentAgent.fork_for_subagent (recursively re-enters _stream_recipe_graph_events).
- ZERO concept of: channel, message_bus, inbox, blackboard/shared scratchpad, ownership table, broadcast, sync/no-sync content isolation policy. grep confirmed empty.

## Constraints that bound any design
- JS-only, inline-style, custom mini_router (frontend). IPC boundary: renderer never touches ipcRenderer.
- Sidecar = request-shaped Flask, dies with GUI parent PID (no daemon, no scheduler) — per prior vision-meeting grounding.
- unchain agent loop is a black box (private wheel); we orchestrate AROUND it at the Flask/adapter layer + the recipe graph layer. We cannot change how an Agent talks to its subagents internally; we CAN change how we compose/sequence agents and what context we feed them.
- Prior decided one-way-doors in play: flow_event.v1 envelope as sole downstream contract; event-ledger-first runtime; memory != job store. ui_surface.v1 generative-UI contract.

## CEO's framing (the actual question)
- Teams must be INVISIBLE to users (no "pick which agent"). AI: understand intent -> minimal prompting -> minimal mid-task user involvement -> done.
- Teams design core = solving inter-agent COMMUNICATION: clear ownership, when-to-talk/when-not, task allocation, content isolation when sync is unnecessary.
- CEO leans: "do we need a dedicated TEAM abstraction / an extra MODULE on the agent, rather than keep piling capability onto the agent?"
