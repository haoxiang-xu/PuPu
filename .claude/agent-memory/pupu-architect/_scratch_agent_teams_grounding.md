# GROUNDING: Agent teams decision (scratch, for Codex packaging)

## What "agent" / "subagent" / "recipe" / "team" ACTUALLY are today (code facts)

### Agent
- unchain `Agent` (private wheel) = modular: ToolsModule / MemoryModule / PoliciesModule / OptimizersModule / SubagentModule. PuPu composes these in unchain_adapter.py (~99KB). Agent.run streamed in worker thread.
- PuPu owns: prompt composition (_build_modular_prompt), tool wiring, model/provider, which modules to attach, policy CONFIG. PuPu does NOT own the agent run loop or delegation runtime.

### Subagent (the closest thing to "team" today)
- Loaded from disk at session start (subagent_loader.py) OR materialized from recipe (_materialize_recipe_subagents, adapter:3561).
- Data shape (ParsedTemplate): name, description, instructions, allowed_modes, output_mode, memory_policy, parallel_safe, allowed_tools, model.
- **Invocation = TOOL CALL.** Reserved names: delegate_to_subagent / handoff_to_subagent / spawn_worker_batch. 3 modes only: delegate / handoff / worker.
- **Topology = strict hierarchy.** Parent calls a tool -> child Agent.run in isolation -> returns output shaped by output_mode (summary | last_message | full_trace). NO peer-to-peer. NO shared channel. NO blackboard.
- Content isolation ALREADY exists: memory_policy = ephemeral | scoped_persistent. Tool isolation: child allowed_tools = strict subset of parent (_compute_effective_tools intersection; child can NEVER exceed parent).
- Child gets 1/3 parent max_iterations.

### THE keystone constraint (adapter:4566-4580)
The entire multi-agent runtime lives in SubagentModule + SubagentPolicy, BOTH imported from unchain core (private wheel):
  SubagentPolicy(max_depth=6, max_children_per_parent=10, max_total_subagents=50,
                 max_parallel_workers=4, worker_timeout_seconds=60,
                 allow_dynamic_workers=False, allow_dynamic_delegate=False,
                 handoff_requires_template=True)
=> PuPu CONFIGURES the team policy but does NOT OWN the orchestration loop, the routing, or inter-agent messaging. Changing agent-to-agent runtime behavior requires the wheel, not PuPu.
- Known wheel hook points are only two and both edge-of-pipeline: read-side "923 rerank", write-side long_term_extractor. Unknown kwargs silently dropped. => PuPu can compose at the edges, cannot inject a new runtime communication primitive into the wheel's agent loop.

### Recipe (the authoring model for "teams")
- recipe.py: Recipe = name, model, max_iterations, agent (single root prompt), toolkits[], subagent_pool[], + graph nodes[]/edges[].
- subagent_pool entries: SubagentRef (ref a .soul/.skeleton) | RecipeSubagentRef (recipe_ref -> nest another recipe as subagent) | InlineSubagent. => nesting exists, still strictly hierarchical.
- **Recipe graph = LINEAR PIPELINE, not a team topology.** validate_recipe_graph: exactly 1 start, exactly 1 end, >=1 agent; each agent exactly one flow-in + one flow-out; NO cycles; agents form a single ordered chain start->agent->...->end.
- TWO edge kinds only: `flow` (out->in, control between start/agent/end) and `attach` (agent<->pool, binds tools/subagents to an agent). **There is NO agent<->agent communication edge.**
- Data passing between agents = `{{#nodeId.field#}}` variable refs resolved from UPSTREAM node outputs only (_validate_graph_variables). DAG-style data flow, NOT message passing. No content sync between siblings; only upstream->downstream var injection.
- node types: start, end, agent, toolkit_pool, subagent_pool.

### "Channel / ownership / communication" concept search result
- ABSENT. No channel, no ownership table, no message bus, no peer routing, no shared blackboard anywhere (backend or recipe graph). The only "communication" primitives are: (a) parent->child tool-call delegation, (b) upstream->downstream variable injection in a linear recipe.

### User-facing surface
- Agents modal feature-flagged OFF by default (enable_user_access_to_agents=false, enable_user_access_to_characters=false). Recipe/flow editor exists but gated. Characters = persona layer on top of an agent.
- From user POV today: single agent + optional subagent pool. No "team" concept exposed. CEO wants teams INVISIBLE -> aligned with current default-hidden posture.

## Adjacent in-flight architecture (my prior memory, same CEO arc)
- Always-on/pseudo-presence program: listener_node + pupu.flow_event.v1 envelope; event-ledger-first runtime; job store != memory; two gates (admission, interruption). These are about WAKING UP a flow, orthogonal to but composable with multi-agent.
- ui_surface.v1 generative-UI contract also in flight (third contract face).

## CEO architecture constraints (the ask)
1. Teams INVISIBLE to user; never make user pick which agent. AI: understand intent -> minimal prompting -> minimal mid-task involvement -> done.
2. Design core = inter-agent communication: clear ownership, when-to-communicate-or-not, task allocation, content isolation when unnecessary to sync.
3. Decide: build a dedicated first-class "Team" abstraction/module, or keep stacking on the agent?
