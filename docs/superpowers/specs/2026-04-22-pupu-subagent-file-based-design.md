# PuPu File-Based Subagent System — Design Spec

**Status:** Draft
**Date:** 2026-04-22
**Scope:** Tier 1 — file loader + built-in Explore + unchain `missing_tool_policy` tweak. No UI in this spec.

---

## 1. Goal

Give PuPu a Claude Code-style subagent system where:

- The main agent keeps all its tools and gains subagent-spawning capability (additive, not restrictive).
- Users define custom subagents by writing files under `~/.pupu/subagents/` (user scope) or `<workspace>/.pupu/subagents/` (workspace scope).
- One built-in subagent — `Explore` — is seeded on first launch as a reference implementation for codebase exploration.
- The existing hardcoded `analyzer` and `executor` Python subagents are deleted.

Non-goals for Tier 1: UI, hot reload, plan mode, todo tool, skills system, additional built-in templates, background tasks.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User — edits .soul / .skeleton files in a text editor      │
└───────────────┬─────────────────────────────────────────────┘
                │  filesystem
                ▼
┌─────────────────────────────────────────────────────────────┐
│  ~/.pupu/subagents/*.soul, *.skeleton        (user scope)    │
│  <workspace>/.pupu/subagents/*.soul, *.skeleton  (workspace) │
└───────────────┬─────────────────────────────────────────────┘
                │  scanned each time _create_agent() runs
                ▼
┌─────────────────────────────────────────────────────────────┐
│  PuPu Adapter  (unchain_runtime/server/subagent_loader.py)   │
│    · scan + parse (.soul YAML frontmatter, .skeleton JSON)   │
│    · precedence merge (user.skeleton > user.soul > ws...)    │
│    · allowed_tools intersection vs main agent's tools        │
│    · build UnchainAgent + SubagentTemplate                   │
└───────────────┬─────────────────────────────────────────────┘
                │  templates=(...)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  unchain.agent.modules.SubagentModule                        │
│    injects delegate / handoff / spawn_worker_batch tools     │
└─────────────────────────────────────────────────────────────┘
                │  tool_call from main agent
                ▼
┌─────────────────────────────────────────────────────────────┐
│  unchain.subagents.plugin (SubagentToolPlugin)               │
│    · spawns child agent, runs KernelLoop, returns result     │
│    · child built with missing_tool_policy="warn_skip"        │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Invariants

- **Main agent always has the full tool set.** Subagents are additive capability, never a restriction.
- **Subagents do not recurse by default.** Child agents are not granted `SubagentModule`, so they cannot spawn their own subagents. `max_depth=6` in `SubagentPolicy` is a future-proof ceiling, not an active nesting mechanism.
- **Files are the single source of truth.** No database, no localStorage, no session-scoped persistence for subagent definitions.
- **Loader is stateless.** It's a pure function: `(filesystem, toolkits) → tuple[SubagentTemplate, ...]`.

### 2.2 Data Flow (new chat)

```
user opens new chat
  → routes.py /chat
  → _create_agent(options, session_id)
    → _build_developer_agent(...)
      → toolkits = main agent's tools
      → templates = subagent_loader.load_templates(
          toolkits=toolkits,
          user_dir=~/.pupu/subagents,
          workspace_dir=<workspace>/.pupu/subagents,
          ...
        )
      → SubagentModule(templates=templates, policy=SubagentPolicy(...))
      → build main agent
```

## 3. File Formats

### 3.1 `.soul` — lightweight markdown

Frontmatter + markdown body. Exposes 4 frontmatter fields; the body becomes the agent's `instructions` (system prompt).

```yaml
---
name: Explore
description: Fast agent specialized for exploring codebases...
tools: [read, grep, glob, lsp, web_fetch, shell, ask_user_question]
model: claude-haiku-4-5
---
You are a codebase exploration specialist...
(markdown body)
```

**Frontmatter fields:**

| Field | Required | Semantic |
|---|---|---|
| `name` | yes | Template identifier. Must match `^[A-Za-z][A-Za-z0-9_-]{0,63}$` |
| `description` | yes | One-line description; shown to main agent in prompt |
| `tools` | no | List of tool names. Omit ⇒ inherit all main agent tools |
| `model` | no | Override child's model. Omit ⇒ inherit main agent's model |

**Hardcoded defaults (`.soul` only):**

- `allowed_modes = ("delegate", "worker")` — no handoff. Users who need handoff must use `.skeleton`.
- `output_mode = "summary"`
- `memory_policy = "ephemeral"`
- `parallel_safe = True`

### 3.2 `.skeleton` — JSON full-field

Directly 1:1 with `unchain.subagents.types.SubagentTemplate` plus an `instructions` field for the system prompt.

```json
{
  "name": "Explore",
  "description": "...",
  "instructions": "<full system prompt>",
  "allowed_modes": ["delegate", "worker"],
  "output_mode": "summary",
  "memory_policy": "ephemeral",
  "parallel_safe": true,
  "allowed_tools": ["read", "grep", "glob", "lsp", "web_fetch", "shell", "ask_user_question"],
  "model": null
}
```

**Fields:**

| Field | Required | Type | Default |
|---|---|---|---|
| `name` | yes | string | — |
| `description` | yes | string | — |
| `instructions` | yes | string | — |
| `allowed_modes` | no | array of `"delegate"\|"handoff"\|"worker"` | `["delegate", "worker"]` |
| `output_mode` | no | `"summary"\|"last_message"\|"full_trace"` | `"summary"` |
| `memory_policy` | no | `"ephemeral"\|"scoped_persistent"` | `"ephemeral"` |
| `parallel_safe` | no | boolean | `true` |
| `allowed_tools` | no | array of strings OR `null` | `null` (inherit all) |
| `model` | no | string OR `null` | `null` (inherit main agent) |

### 3.3 Precedence

Same-name conflicts resolve by this strict ranking:

1. `user.skeleton` — highest
2. `user.soul`
3. `workspace.skeleton`
4. `workspace.soul` — lowest

The highest-ranked file wins; others are logged as `shadowed by <path>` and discarded. This means a user-level `.skeleton` is never overridden by workspace-level files, reflecting the principle that user-level files represent the user's explicit global choice.

Different-name files coexist regardless of scope/format.

### 3.4 Scope Directories

- **User scope:** `~/.pupu/subagents/` — always scanned.
- **Workspace scope:** `<workspace_path>/.pupu/subagents/` — scanned only when the chat session has an associated workspace. Workspace path resolved via existing PuPu workspace mechanism (`options["workspace_id"]` lookup).

When workspace scope is unavailable (no workspace selected, directory doesn't exist, permissions denied), loader silently falls back to user scope only.

## 4. Components

### 4.1 `unchain_runtime/server/subagent_loader.py` (new)

Stateless module with one public function.

```python
def load_templates(
    *,
    toolkits: tuple[Toolkit, ...],
    provider: str,
    model: str,
    api_key: str | None,
    max_iterations: int,
    user_dir: Path = Path.home() / ".pupu" / "subagents",
    workspace_dir: Path | None = None,
    UnchainAgent: type,
    ToolsModule: type,
    PoliciesModule: type,
    SubagentTemplate: type,
) -> tuple[SubagentTemplate, ...]:
    ...
```

**Algorithm:**

1. **Discover** — glob `*.skeleton` and `*.soul` in user_dir and workspace_dir (if present).
2. **Parse** — `parse_soul(path)` or `parse_skeleton(path)`. Failures log warning + skip, never abort the whole load.
3. **Dedupe by precedence** — group by `name`, keep the highest-ranked, shadow the rest with a log entry.
4. **Tool intersection** — for each survivor with `allowed_tools` specified, intersect with the main agent's tool-name set:
   - Intersection empty → skip template + log warning.
   - `allowed_tools=None` → pass through (inherits all tools).
5. **Build `UnchainAgent` + `SubagentTemplate`** — child agent gets:
   - `modules = (ToolsModule(tools=toolkits), PoliciesModule(max_iterations=max(2, max_iterations//3)))`
   - `instructions = parsed.instructions`
   - `model = parsed.model or <main agent model>`

**YAML frontmatter parser (hand-rolled, no PyYAML dependency):**

- Only supports the 4 `.soul` fields.
- Forms: `key: value` (string) or `key: [a, b, c]` (list of bare strings).
- No multi-line strings, no escape sequences, no nested objects, no quote-aware parsing.
- Multi-line instructions go in the body, not the frontmatter.
- Malformed frontmatter → skip file + log warning.
- ~30 lines of code.

**Validation rules (all failures → skip + warning, never fatal):**

- `name` matches `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.
- `name` is not `delegate_to_subagent`, `handoff_to_subagent`, or `spawn_worker_batch` (reserved).
- `allowed_modes` ⊆ `{"delegate", "handoff", "worker"}`.
- `output_mode` ∈ `{"summary", "last_message", "full_trace"}`.
- `memory_policy` ∈ `{"ephemeral", "scoped_persistent"}`.
- `instructions` non-empty.
- `.skeleton` root is a JSON object (not array/primitive).
- `.soul` body non-empty after stripping.

### 4.2 `unchain_runtime/server/subagent_seeds.py` (new)

Ships the built-in `Explore.skeleton` on first launch.

```python
EXPLORE_SKELETON = {
    "name": "Explore",
    "description": (
        "Fast agent specialized for exploring codebases. Use this when you need "
        "to quickly find files by patterns, search code for keywords, or answer "
        "questions about the codebase. Specify desired thoroughness level in "
        "the task: 'quick', 'medium', or 'very thorough'."
    ),
    "instructions": EXPLORE_SYSTEM_PROMPT,  # see Section 5
    "allowed_modes": ["delegate", "worker"],
    "output_mode": "summary",
    "memory_policy": "ephemeral",
    "parallel_safe": True,
    "allowed_tools": ["read", "grep", "glob", "lsp", "web_fetch", "shell", "ask_user_question"],
    "model": None,
}

def ensure_seeds_written(user_dir: Path) -> None:
    """Write Explore.skeleton to user_dir if absent. Idempotent.
    Never overwrites existing files. If user deletes the file, it is not regenerated."""
    user_dir.mkdir(parents=True, exist_ok=True)
    target = user_dir / "Explore.skeleton"
    if target.exists():
        return
    target.write_text(json.dumps(EXPLORE_SKELETON, indent=2, ensure_ascii=False))
    logger.info("[subagent_seeds] wrote default Explore.skeleton to %s", target)
```

**Trigger:** called once on PuPu server startup (in `main.py` / Flask app init), not on every chat.

### 4.3 `unchain_runtime/server/unchain_adapter.py` (modified)

**Delete:**

- `_SUBAGENT_ANALYZER_TEMPLATE_NAME` constant.
- `_SUBAGENT_EXECUTOR_TEMPLATE_NAME` constant.
- `_ANALYZER_READ_ONLY_TOOLS` constant (if present).
- The entire `if enable_subagents and ...` block in `_build_developer_agent` that constructs `analyzer_agent`, `executor_agent`, and their `SubagentTemplate`s (approximately lines 3080-3152 at time of spec).

**Add:**

- `_resolve_workspace_subagent_dir(options)` helper that returns `<workspace>/.pupu/subagents` or `None` given the chat options.
- Replacement block in `_build_developer_agent`:

```python
if (
    enable_subagents
    and SubagentModule is not None
    and SubagentTemplate is not None
    and SubagentPolicy is not None
):
    try:
        from .subagent_loader import load_templates
        workspace_dir = _resolve_workspace_subagent_dir(options)
        templates = load_templates(
            toolkits=tuple(toolkits),
            provider=provider,
            model=model,
            api_key=api_key,
            max_iterations=max_iterations,
            user_dir=Path.home() / ".pupu" / "subagents",
            workspace_dir=workspace_dir,
            UnchainAgent=UnchainAgent,
            ToolsModule=ToolsModule,
            PoliciesModule=PoliciesModule,
            SubagentTemplate=SubagentTemplate,
        )
    except Exception as exc:
        logger.warning("[subagent] loader failed; continuing without subagents: %s", exc)
        templates = ()

    if templates:
        modules.append(
            SubagentModule(
                templates=templates,
                policy=SubagentPolicy(
                    max_depth=6,
                    max_children_per_parent=10,
                    max_total_subagents=50,
                    max_parallel_workers=4,
                    worker_timeout_seconds=60.0,
                    allow_dynamic_workers=False,
                    allow_dynamic_delegate=False,
                    handoff_requires_template=True,
                ),
            )
        )
```

**Prompt template replacement:**

Replace the hardcoded `Available subagents:` block with a runtime-substituted placeholder. Before `UnchainAgent(..., instructions=instructions)`:

```python
subagent_list_md = "\n".join(
    f"- {tpl.name}: {tpl.description}" for tpl in templates
) or "(no subagents registered)"
instructions = instructions.replace("{{SUBAGENT_LIST}}", subagent_list_md)
```

### 4.4 `unchain_runtime/server/prompts/agents/developer.py` (modified)

- Delete the hardcoded `delegate_to_subagent(target="analyzer", ...)` and `delegate_to_subagent(target="executor", ...)` lines.
- Replace with `{{SUBAGENT_LIST}}` placeholder.
- Add a clause: "If the list above is empty, subagent tools are unavailable — proceed without them."

### 4.5 `unchain_runtime/server/prompts/agents/analyzer.py` + `executor.py` (delete)

Remove entire files.

### 4.6 `unchain_runtime/server/prompts/agents/__init__.py` (modified)

Remove `analyzer` / `executor` exports.

## 5. Explore System Prompt

Drives Explore's behavior as a read-only exploration specialist. Stored as `EXPLORE_SYSTEM_PROMPT` constant in `subagent_seeds.py`.

```
## Identity
You are Explore — a read-only codebase exploration specialist. You find files,
search code, answer questions about the codebase. You do not edit, write, or
execute mutations. Your output feeds a parent agent that relies on you for
accurate, well-cited findings.

## Capabilities
You have these tools: read, grep, glob, lsp, web_fetch, shell, ask_user_question.
Treat shell as read-only: ls, file, wc, du, find -type f, head, tail. Never run
commands that mutate filesystem, network, or process state (rm, mv, cp, git
commit, npm install, curl with POST, etc.).

## Thoroughness Levels
The parent agent will tell you one of:
- "quick" — single-pass. 1-3 tool calls. Return best-effort answer.
- "medium" — iterate until confident. 3-10 tool calls. Cross-check with one
  alternate search.
- "very thorough" — exhaustive. 10+ tool calls. Multiple search strategies,
  cross-reference naming conventions, verify by reading actual file content,
  check tests/docs.

If unspecified, default to "medium".

## Workflow
1. Parse the task. Identify key symbols, concepts, file patterns.
2. Start broad with grep/glob to map the territory.
3. Narrow to candidate files. Read them in full when relevant.
4. For code understanding: use lsp to find definitions/references.
5. For conceptual questions: cross-reference at least 2 different search angles
   before concluding.
6. Before returning: re-check your claim against at least one primary source.

## Output Format
Return a markdown report with these sections (omit sections that don't apply):

### Summary
One to three sentences directly answering the task.

### Key Findings
- path/to/file.py:42 — what's there, why it matters
- path/to/other.ts:17-31 — ...
(cite specific line ranges; never cite without line numbers)

### Relevant Files
- path/to/file.py — one-line description of relevance
(comprehensive list, ranked by relevance)

### Uncertainty
- Anything you couldn't verify
- Assumptions you had to make
- Questions the parent agent should clarify before acting

## Constraints
- NEVER write, edit, or mutate files.
- NEVER run shell commands that can change state.
- NEVER fabricate file paths or line numbers. If unsure, say so in Uncertainty.
- NEVER invoke another subagent. You are a leaf.
- Use absolute paths when possible; relative paths only within reports where
  clarity wins.
- If the task is genuinely ambiguous, ask_user_question BEFORE exploring —
  don't burn tools on guesses.

## Anti-Patterns (what to avoid)
- Returning only a summary without Key Findings citations.
- Claiming "X doesn't exist" without showing the grep / glob queries tried.
- Over-reading: if grep narrows you to one file, don't read the whole directory.
- Under-reading: if a function name matches but you didn't open the file, you
  don't actually know what it does — open it.
- Infinite exploration: at "quick" level, stop after the first confident answer.
```

### 5.1 Thoroughness Framing

Thoroughness is **Explore-specific prompt design**, not a platform feature. Other subagents (planner, reviewer, writer) design their own control dimensions (granularity, strictness, focus) as suits their profession. The platform does not provide a generic "levels" mechanism, does not add parameters to `delegate_to_subagent` schema, does not impose any required control surface. Each subagent's control surface lives entirely in its own prompt.

### 5.2 Shell Safety

`shell` is granted to Explore but its scope is enforced only via prompt constraints, not runtime filtering. LLM may occasionally run a mutating command; accepted risk for Tier 1. A command-level blocklist (e.g. intercepting `rm`, `mv`, `git commit`) is out-of-scope — it would require deep escape-hatch work (e.g. blocking `bash -c`, `eval`, `echo > file`, shell pipelines) for incremental safety gain.

## 6. unchain Changes

Four files, all backward-compatible.

### 6.1 `src/unchain/agent/spec.py`

Add `missing_tool_policy` to `AgentSpec`:

```python
from typing import Literal

MissingToolPolicy = Literal["raise", "warn_skip"]

@dataclass(frozen=True)
class AgentSpec:
    name: str
    ...existing fields...
    allowed_tools: tuple[str, ...] | None = None
    missing_tool_policy: MissingToolPolicy = "raise"  # new, default preserves current behavior
```

### 6.2 `src/unchain/agent/agent.py`

`UnchainAgent.__init__` and `clone`/`with_overrides` accept + forward the new field as passthrough (same pattern as `allowed_tools`).

### 6.3 `src/unchain/agent/builder.py`

Branch `_apply_allowed_tools_filter` on the policy:

```python
def _apply_allowed_tools_filter(self) -> None:
    if self.spec.allowed_tools is None:
        return
    allowed_names = [str(n).strip() for n in self.spec.allowed_tools if str(n).strip()]
    configured_names = list(self.toolkit.tools.keys())
    missing = [n for n in dict.fromkeys(allowed_names) if n not in self.toolkit.tools]

    if missing:
        if self.spec.missing_tool_policy == "raise":
            raise ValueError(
                f"agent {self.spec.name!r} allowed_tools contains unknown tool names: {', '.join(missing)}"
            )
        logger.warning(
            "agent %r allowed_tools contains unknown tool names (skipped): %s",
            self.spec.name, ", ".join(missing),
        )
        allowed_names = [n for n in allowed_names if n not in missing]

    allowed_name_set = set(allowed_names)
    self.toolkit.tools = {
        name: self.toolkit.tools[name]
        for name in configured_names
        if name in allowed_name_set
    }
```

### 6.4 `src/unchain/subagents/plugin.py`

`_build_subagent` passes `missing_tool_policy="warn_skip"` when constructing the child. The exact call site depends on whether it's via `clone`, `with_overrides`, or direct construction — implementer matches current code shape.

### 6.5 Backward Compatibility

- Default `missing_tool_policy="raise"` preserves current behavior for every existing caller — main agents, tests, examples. Zero existing test changes required.
- `AgentSpec` remains frozen.
- No public API break.

## 7. Error Handling & Edge Cases

### 7.1 File & Path Layer

| Case | Behavior |
|---|---|
| `~/.pupu/subagents/` missing | `mkdir(parents=True, exist_ok=True)` on seed write |
| `~/.pupu/` is a file, not dir | log critical, skip entire subagent system; main agent still builds |
| Workspace dir missing / no permission | log warning, fall back to user scope only |
| Editor tempfiles (`*.swp`, `*~`, `.bak`) | not matched — glob uses exact `*.skeleton` / `*.soul` |
| Symlinks / hardlinks | treated as normal files via `Path.is_file()` |
| Non-UTF-8 encoding | `UnicodeDecodeError` caught, skip + warning |

### 7.2 Parse Layer

| Case | Behavior |
|---|---|
| `.soul` empty body | reject + warning |
| `.skeleton` root not JSON object | reject + warning |
| `.soul` `tools:` value not a list | reject + warning |
| `.skeleton` `allowed_modes` contains invalid value | reject + warning (list valid values) |
| Large file (~1MB+ instructions) | no hard limit; log info |
| Partial-write while user is editing | parse fails, skip + warning, other templates unaffected |

### 7.3 Runtime Layer

| Case | Behavior |
|---|---|
| Main agent toolkits empty | templates with `allowed_tools` all skip via intersection-empty rule; templates with `allowed_tools=None` still register (child has no tools either) |
| Loader throws unexpected exception | adapter catches + logs + continues without subagents |
| User deletes seeded `Explore.skeleton` | never regenerated on subsequent launches (user sovereignty) |
| Template `name` conflicts with `delegate_to_subagent` | reject + warning |
| Template `name` contains path-injection chars | rejected by regex validation |

### 7.4 Graceful Degradation Chain

If subagent system breaks at any layer:

1. Loader crashes → adapter catches → `templates=()` → no `SubagentModule` added → main agent builds with all tools, no subagent capability.
2. Individual template parse fails → that template is skipped → other templates load normally.
3. `unchain.subagents` module unavailable → adapter's existing `_SubagentModule = None` fallback kicks in → no subagent capability, no crash.

User impact on any failure is "no subagent", never "chat doesn't work".

## 8. Testing

### 8.1 unchain (new test files)

**`tests/agent/test_builder_missing_tool_policy.py`**

| Case | Assertion |
|---|---|
| `allowed_tools=["read", "nonexistent"]` + `policy="raise"` | raises `ValueError` |
| `allowed_tools=["read", "nonexistent"]` + `policy="warn_skip"` | builds; toolkit filtered to `["read"]`; warning logged |
| `allowed_tools=None` + `policy="warn_skip"` | builds; toolkit unfiltered |
| `AgentSpec` constructed without specifying `missing_tool_policy` | default is `"raise"`; regression test |

**`tests/subagents/test_warn_skip_passthrough.py`**

| Case | Assertion |
|---|---|
| `SubagentTemplate.allowed_tools` contains missing tool, `_delegate` invoked | child builds; only existing tools present |

### 8.2 PuPu (new test files)

**`unchain_runtime/server/tests/test_subagent_loader.py`**

| Case | Assertion |
|---|---|
| Empty dirs | returns `()` |
| Only `~/.pupu/subagents/Explore.skeleton` | returns 1 template, `name="Explore"` |
| User + workspace same-name conflict | user wins; workspace logged as shadowed |
| Same-name `.skeleton` + `.soul` (same scope) | skeleton wins |
| `.soul` missing `name` in frontmatter | skip + warning |
| `.skeleton` JSON parse failure | skip + warning, other templates unaffected |
| `allowed_tools` all missing from main agent | skip + warning |
| `allowed_tools` partially missing | register; template's `allowed_tools` filtered to intersection |
| `allowed_tools=None` omitted | register; inherits all |
| `name` contains illegal chars | skip + warning |
| `name == "delegate_to_subagent"` | skip + warning |
| All 4 precedence permutations | highest-ranked wins |
| `workspace_dir=None` | user scope only, normal |

**`unchain_runtime/server/tests/test_adapter_subagent_integration.py`**

| Case | Assertion |
|---|---|
| `enable_subagents=True` + seeded Explore exists | `_build_developer_agent` returns agent with `SubagentModule` containing Explore template |
| Loader raises | adapter catches + logs; main agent builds |

### 8.3 Manual Regression Checklist

- [ ] Fresh machine first launch → `~/.pupu/subagents/Explore.skeleton` written.
- [ ] User edits `Explore.skeleton`, restarts PuPu → edits preserved (no seed overwrite).
- [ ] Open chat, prompt: "Find the file that defines ChatBubble. Thoroughness: quick" → main agent calls Explore → `trace_chain` UI shows `delegate_to_subagent` with `Explore` label → Explore returns markdown report citing file:line.
- [ ] Edit `Explore.skeleton` `allowed_tools` to `["nonexistent_tool"]`, restart, open new chat → log contains `Explore: no allowed_tools available, skipping` → main agent prompt's subagent list omits Explore.
- [ ] Create `~/.pupu/subagents/MyHelper.soul` with valid frontmatter + markdown body → open new chat → main agent prompt includes `- MyHelper: ...` → can be invoked.

### 8.4 Log Convention

All subagent-system logs prefixed with `[subagent_loader]` or `[subagent_seeds]` for easy filtering:

```
[subagent_loader] Explore: loaded from ~/.pupu/subagents/Explore.skeleton
[subagent_loader] MyHelper: allowed_tools filtered (dropped: shell) — not in main agent
[subagent_loader] OldAgent: shadowed by ~/.pupu/subagents/OldAgent.skeleton
[subagent_seeds] wrote default Explore.skeleton to ~/.pupu/subagents/
```

On load completion: `logger.info("[subagent_loader] loaded %d templates: %s", count, names)`.

## 9. Migration & Rollout

### 9.1 Backward Compatibility

- **unchain:** `missing_tool_policy` default `"raise"` → zero-impact for every existing caller. No API break.
- **PuPu:** Deleting `analyzer`/`executor` Python code is a semantic break for any hardcoded references. Since subagent tool calls are runtime outputs (not stored chat shape), historical chats replay fine. Frontend `trace_chain.js` retains its analyzer/executor string constants for rendering historical traces — no change needed there.

### 9.2 Rollout Steps

1. unchain: add `missing_tool_policy` — spec / agent / builder / plugin + tests. CI green, merge.
2. PuPu: update unchain dependency to include the new version.
3. PuPu: add `subagent_loader.py` + `subagent_seeds.py` + tests.
4. PuPu: modify `_build_developer_agent` to call loader; modify `developer.py` prompt to use `{{SUBAGENT_LIST}}` placeholder.
5. PuPu: delete `prompts/agents/analyzer.py`, `prompts/agents/executor.py`, and their exports. Remove adapter constants.
6. Run manual regression checklist.
7. Ship.

**Ordering matters:** loader must land before deleting analyzer/executor. Reversed order creates a commit with no subagent capability, hurts bisect.

### 9.3 Rollback

- **Fast rollback:** set `enable_subagents=False` in `_build_developer_agent` default. Main agent runs with full tools; `trace_chain.js` still renders non-subagent traces normally.
- **Full rollback:** revert PuPu commits. unchain changes are backward-compatible, so no need to revert unchain.

### 9.4 User-Facing CHANGELOG

```
BREAKING: Built-in `analyzer` and `executor` subagents removed. Replaced by
file-based subagent system at ~/.pupu/subagents/. Default Explore agent
seeded on first launch. To recreate analyzer/executor behavior, create .soul
or .skeleton files.
```

### 9.5 Out-of-Scope (explicit)

Following are Tier 2/3 and deliberately excluded from this spec:

- UI for managing subagents (settings page, forms)
- Hot reload (filesystem watcher)
- Plan mode, todo tool, skills system
- Additional built-in templates (planner, code-reviewer, general-purpose, etc.)
- Workspace directory UI bootstrap — users run `mkdir` themselves
- End-to-end handoff flow testing (the mode is supported but not blessed in Tier 1)
- Frontend subagent metadata display (template list, description tooltips)

## 10. File Change Summary

| File | Action |
|---|---|
| `src/unchain/agent/spec.py` | modify: add `missing_tool_policy` field |
| `src/unchain/agent/agent.py` | modify: passthrough `missing_tool_policy` in `__init__` / `clone` |
| `src/unchain/agent/builder.py` | modify: branch `_apply_allowed_tools_filter` on policy |
| `src/unchain/subagents/plugin.py` | modify: `_build_subagent` passes `"warn_skip"` |
| `tests/agent/test_builder_missing_tool_policy.py` | new |
| `tests/subagents/test_warn_skip_passthrough.py` | new |
| `unchain_runtime/server/subagent_loader.py` | new |
| `unchain_runtime/server/subagent_seeds.py` | new |
| `unchain_runtime/server/unchain_adapter.py` | modify: remove analyzer/executor, add loader integration, add seed-ensure call |
| `unchain_runtime/server/main.py` | modify: call `ensure_seeds_written` on startup |
| `unchain_runtime/server/prompts/agents/developer.py` | modify: replace hardcoded list with `{{SUBAGENT_LIST}}` placeholder |
| `unchain_runtime/server/prompts/agents/analyzer.py` | delete |
| `unchain_runtime/server/prompts/agents/executor.py` | delete |
| `unchain_runtime/server/prompts/agents/__init__.py` | modify: remove analyzer/executor exports |
| `unchain_runtime/server/tests/test_subagent_loader.py` | new |
| `unchain_runtime/server/tests/test_adapter_subagent_integration.py` | new |
| `~/.pupu/subagents/Explore.skeleton` | seeded on first launch |
