# Add or Modify an Agent Prompt

Create or update an agent's system prompt using the standard sectioned template.

## Arguments
- $ARGUMENTS: Agent name and description (e.g. "reviewer Read-only code review specialist")

## Template System

Every agent prompt is composed from **6 ordered sections**. This is the canonical pattern for all PuPu agents.

```
┌─────────────┬────────────────────────────────────────────────────┐
│ Section     │ Purpose                                            │
├─────────────┼────────────────────────────────────────────────────┤
│ identity    │ Who the agent is. One sentence. Sets the persona.  │
│             │ No [Header] — first line IS the identity.          │
├─────────────┼────────────────────────────────────────────────────┤
│ capability  │ What tools/resources the agent has access to.      │
│             │ Factual list. No aspirational claims.              │
├─────────────┼────────────────────────────────────────────────────┤
│ workflow    │ How the agent should approach tasks.               │
│             │ Step-by-step rules. Use bullet points.             │
├─────────────┼────────────────────────────────────────────────────┤
│ delegation  │ When and how to use subagents.                     │
│             │ Trade-off rules + available subagent catalog.      │
│             │ Only for agents with SubagentModule.               │
├─────────────┼────────────────────────────────────────────────────┤
│ constraints │ Hard rules the agent must never violate.           │
│             │ "Never X", "Do not Y", "Always Z".                 │
├─────────────┼────────────────────────────────────────────────────┤
│ fallback    │ What to do for out-of-scope requests.              │
│             │ Usually one sentence.                              │
└─────────────┴────────────────────────────────────────────────────┘
```

Not every agent needs all sections:
- **Main agent** (developer): all 6 sections
- **Subagent** (analyzer, executor): identity + capability + constraints only
- **Simple agent** (no tools): identity + workflow + fallback only

## Steps

1. Read `unchain_runtime/server/unchain_adapter.py` — look for `_DEVELOPER_PROMPT_SECTIONS` as the reference implementation
2. Read `_compose_agent_prompt()` to understand how sections are assembled

3. Create the prompt sections dict:
   ```python
   _MY_AGENT_PROMPT_SECTIONS = {
       "identity": "You are PuPu's [role] agent.",
       "capability": "You have access to [tools]. You can [actions].",
       "workflow": "- Step 1\n- Step 2\n- Step 3",
       "constraints": "- Never do X.\n- Always do Y.",
       "fallback": "For unrelated requests, [behavior].",
   }
   ```

4. Compose with: `_compose_agent_prompt(_MY_AGENT_PROMPT_SECTIONS)`

5. Rules for each section:
   - **identity**: Max 1-2 sentences. No instructions here.
   - **capability**: Only state facts. "You have X" not "You should use X".
   - **workflow**: Ordered steps or prioritized bullet list. This is where behavioral instructions go.
   - **delegation**: Must include the CRITICAL trust rule, decision threshold, and subagent catalog.
   - **constraints**: Only hard negatives. Keep it short — every constraint costs attention.
   - **fallback**: One sentence for graceful degradation.

6. Test that `_compose_agent_prompt()` produces clean output
7. Run adapter tests: `python -m pytest tests/test_unchain_adapter_capabilities.py -q`
