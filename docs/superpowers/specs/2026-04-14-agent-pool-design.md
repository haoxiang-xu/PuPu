# Agent Pool — Design Spec

**Date:** 2026-04-14
**Status:** Draft (pending review)
**Scope:** `unchain_runtime/server/` (backend) + `electron/` (IPC bridges) + `src/` (React frontend)

## 1. Goal

Introduce a **unified agent registry** so that every agent — built-in (`pupu_developer`, `pupu_analyzer`, `pupu_executor`) and user-created — is described by a single `AgentSpec` data model and assembled through one runtime path (`_build_agent_from_spec`). Users can pick which agent handles a chat session via a toolbar selector; selection is persisted per-session.

The registry is authoritative on the backend. Built-in specs live in `prompts/agents/*.py` (Python source of truth); user specs live as JSON files in a new `agent_store`. The frontend reads a **read-only snapshot** from `GET /agents` at boot time.

## 2. Non-Goals (YAGNI)

- **No user-facing editor UI in v1.** The Agents tab in the Agents modal stays "Coming soon". Users create/edit agents by hand-writing JSON files in the store directory.
- **No backend CRUD endpoints beyond read.** `POST/PUT/DELETE /agents` are deferred until the editor UI lands.
- **No character-model changes.** `character_store` stays untouched; agents are a parallel, independent concept.
- **No nested subagent delegation.** A subagent cannot itself spawn subagents (enforced by `enable_subagents=False` on recursive builds).
- **No per-message agent switching.** Changing the primary agent applies to the next message, not the in-flight stream.
- **No hot-reload of user JSON files.** Registry is populated once at Flask boot; adding a JSON file requires a server restart.

## 3. Architecture Overview

```
┌──── FRONTEND (React) ──────────────────────────────────────────┐
│  Chat toolbar · PrimaryAgentSelector (reads ConfigContext.agents)│
│       │                                                          │
│       │ selection → chat_storage.updateSession(primaryAgentId)   │
│       ▼                                                          │
│  useChatStream → api.unchain.startStreamV2                       │
│       (injectPrimaryAgentIntoPayload)                            │
│                                                                  │
│  ConfigContainer.init() → api.agents.listAgents() (boot-time)    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ IPC (window.agentsAPI / unchainAPI)
┌──────────────────────────────▼───────────────────────────────────┐
│  ELECTRON MAIN                                                   │
│  agents_bridge · HTTP proxy → Flask /agents                      │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│  FLASK SIDECAR · unchain_runtime                                 │
│                                                                  │
│  route_agents.py     GET /agents · GET /agents/:id               │
│          │                                                       │
│          ▼                                                       │
│  agent_service.py   (boot: seed builtin + load user store)       │
│          │                                                       │
│          ▼                                                       │
│  agent_registry.py  (in-memory, single source of truth)          │
│     ├─ pupu_developer    (builtin, from prompts/agents/*.py)     │
│     ├─ pupu_analyzer     (builtin)                               │
│     ├─ pupu_executor     (builtin)                               │
│     ├─ my_translator     (user_json, from agent_store)           │
│     └─ ...                                                        │
│          ▲                                                        │
│          │ registry.get(id)                                       │
│          │                                                        │
│  unchain_adapter.py                                               │
│     _create_agent(payload, ..., registry)                         │
│        spec = registry.get(payload.primary_agent_id)              │
│                 or registry.get("pupu_developer")                 │
│     _build_agent_from_spec(spec, registry, modules, ...)          │
│        assembles ToolsModule / MemoryModule / PoliciesModule /    │
│        SubagentModule (templates sourced from registry)           │
└───────────────────────────────────────────────────────────────────┘
```

### Core invariants

- Built-in agents' authoritative source is `prompts/agents/*.py`. `agent_store` only persists user-created agents.
- Registry is initialized once at Flask boot. Built-ins are permanently registered; user agents are loaded from the store dir during boot.
- Registry is the backend's single source of truth. The frontend fetches a snapshot via `/agents` and never merges locally.
- Built-in agents carry `is_builtin=True`; the frontend treats them as read-only.
- There is no "hardcoded developer path" at runtime — every agent flows through `_build_agent_from_spec`.

## 4. Data Model — `AgentSpec`

### 4.1 Python dataclass

```python
# unchain_runtime/server/agent_spec.py
from dataclasses import dataclass, field
from typing import Optional

PROMPT_SECTION_KEYS = (
    "identity", "capability", "workflow",
    "delegation", "constraints", "fallback",
)

@dataclass(frozen=True)
class AgentSpec:
    # Identity
    id: str                                 # slug, globally unique
    name: str                               # display name
    description: str = ""
    avatar: Optional[str] = None            # abs path or data URL

    # Prompt (6 sections)
    prompt_sections: dict[str, str] = field(default_factory=dict)

    # Capability (hard constraints)
    allowed_toolkits: tuple[str, ...] = ("*",)
    allowed_delegates: tuple[str, ...] = ("*",)
    max_iterations: Optional[int] = None
    default_model: Optional[str] = None

    # Meta
    is_builtin: bool = False
    source: str = "user_json"               # "python" | "user_json"
    tags: tuple[str, ...] = ()
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
```

### 4.2 Field semantics

| Field | Semantics |
|---|---|
| `id` | Slug, regex `^[a-z][a-z0-9_]{1,39}$`. Built-in **must** start with `pupu_`; user agents **must not** use the `pupu_` prefix. On registry conflict, built-in wins and a warning is logged. |
| `prompt_sections` | Dict keyed by one of the six section keys. Missing sections are skipped during assembly. `identity` is **required**; others are optional. |
| `allowed_toolkits` | `("*",)` = allow any toolkit; `()` = disable all; `("workspace",)` = only workspace toolkit. Resolved at runtime as the **intersection** with the session's toolkit selection (hard-constraint direction: the agent's list caps the session's selection). |
| `allowed_delegates` | `("*",)` = may delegate to any agent in the pool; `()` = no delegation; `("pupu_analyzer",)` = whitelist. The `SubagentModule` is built by filtering the registry through this field. |
| `max_iterations` | `None` = inherit `payload.max_iterations`; non-`None` = override. Use for agents like the analyzer that should be short-lived. |
| `default_model` | `None` = inherit `payload.model`; non-`None` = override. **Only the primary agent's `default_model` is honored**; subagents inherit their parent's effective model. |
| `is_builtin` | Frontend read-only flag and delete-guard. `True` for built-in, `False` for user-created. |
| `source` | `"python"` (from `prompts/agents/*.py`) or `"user_json"` (from `agent_store`). Determines frontend icon + backend persistence path. |
| `avatar` | Optional. Absolute path, data URL, or `null`. Built-in agents have no avatar in v1 — frontend falls back to a tag-based default icon. |

### 4.3 Example — user agent JSON

```json
{
  "id": "my_translator",
  "name": "中英互译",
  "description": "专注中英学术文献互译",
  "avatar": "/Users/red/.pupu/avatars/translator.png",
  "prompt_sections": {
    "identity": "You are a bilingual academic translator...",
    "capability": "You can read files in the workspace...",
    "workflow": "- Read source. - Translate. - Review tone.",
    "constraints": "Never paraphrase names...",
    "fallback": "For non-translation chat, answer directly."
  },
  "allowed_toolkits": ["workspace"],
  "allowed_delegates": [],
  "max_iterations": null,
  "default_model": null,
  "is_builtin": false,
  "source": "user_json",
  "tags": ["translation", "writing"],
  "created_at": "2026-04-14T10:20:00Z",
  "updated_at": "2026-04-14T10:20:00Z"
}
```

### 4.4 Example — built-in spec

```python
# prompts/agents/developer.py — original DEVELOPER_PROMPT_SECTIONS kept untouched
from ..agent_spec import AgentSpec

DEVELOPER_PROMPT_SECTIONS = { ... }  # existing

DEVELOPER_SPEC = AgentSpec(
    id="pupu_developer",
    name="PuPu Developer",
    description="全栈编码专家,支持 subagent delegation",
    prompt_sections=DEVELOPER_PROMPT_SECTIONS,
    allowed_toolkits=("*",),
    allowed_delegates=("*",),
    is_builtin=True,
    source="python",
    tags=("coding", "builtin"),
)
```

## 5. Backend Components

### 5.1 File layout

```
unchain_runtime/server/
├── agent_spec.py              NEW  — dataclass + codec + validate
├── agent_registry.py          NEW  — in-memory merged registry
├── agent_store.py             NEW  — JSON persistence (user agents)
├── agent_service.py           NEW  — boot/seed/load orchestration
├── route_agents.py            NEW  — Flask blueprint (GET only in v1)
│
├── prompts/agents/developer.py   MOD  — add DEVELOPER_SPEC constant
├── prompts/agents/analyzer.py    MOD  — add ANALYZER_SPEC constant
├── prompts/agents/executor.py    MOD  — add EXECUTOR_SPEC constant
├── prompts/agents/__init__.py    MOD  — export BUILTIN_SPECS tuple
│
├── unchain_adapter.py            MOD  — _build_developer_agent →
│                                         _build_agent_from_spec
│                                       + read primary_agent_id from payload
│
├── app.py                        MOD  — boot registry; register blueprint
│
└── tests/
    ├── test_agent_spec.py        NEW
    ├── test_agent_registry.py    NEW
    ├── test_agent_store.py       NEW
    ├── test_agent_service.py     NEW
    ├── test_route_agents.py      NEW
    └── test_unchain_adapter_*.py MOD  — regression + equivalence tests
```

### 5.2 `agent_registry.py` responsibilities

- `register(spec, *, is_builtin: bool)` — adds to in-memory dict, raises on duplicate (unless overriding with a built-in during the conflict case).
- `get(agent_id) -> Optional[AgentSpec]`.
- `list_all() -> list[AgentSpec]`, stable order (built-ins first by tag order, then user agents by id).
- `resolve_toolkits(spec, session_toolkits) -> list` — returns `session_toolkits` unchanged when `spec.allowed_toolkits == ("*",)`; returns `[]` when `spec.allowed_toolkits == ()`; otherwise returns the intersection of `session_toolkits` with `spec.allowed_toolkits` (comparing by toolkit `name`), preserving `session_toolkits` order.
- `resolve_delegates(spec) -> tuple[AgentSpec, ...]` — filters the registry by `allowed_delegates`; returns the referenced specs.

### 5.3 `agent_store.py` responsibilities

- `load_all() -> list[AgentSpec]` — scans the store directory, parses each `*.json` file via `AgentSpec.from_dict`, logs (and skips) files that fail validation without crashing boot.
- `store_dir` defaults to `<app_data>/agent_store/` (resolved via existing `appdata_path` helper) and is overridable via env var for tests.
- Write/delete methods exist but are not wired to any route in v1 (they're used by tests).

### 5.4 `agent_service.py` responsibilities

- `boot(registry)` — orchestrates `seed_builtin()` (from `BUILTIN_SPECS`) then `load_user_agents()` (from `agent_store`). Called exactly once from `app.py::create_app()`.
- Logs a summary line: `"registered N agents (B builtin + U user)"`.

### 5.5 `route_agents.py` endpoints (v1)

| Method | Path | Returns |
|---|---|---|
| `GET` | `/agents` | `{"agents": [AgentSpec.to_dict() for spec in registry.list_all()]}` |
| `GET` | `/agents/<id>` | `AgentSpec.to_dict()` or 404 |

`POST/PUT/DELETE` are deferred.

### 5.6 Adapter refactor — `_build_agent_from_spec`

```python
def _build_agent_from_spec(
    *,
    spec: AgentSpec,
    registry: AgentRegistry,
    # unchain SDK modules (injected)
    UnchainAgent, ToolsModule, MemoryModule, PoliciesModule,
    SubagentModule, SubagentTemplate, SubagentPolicy,
    # session context
    provider: str,
    model: str,
    api_key: str,
    user_modules: dict[str, str] | None,
    session_toolkits: list,
    memory_manager,
    max_iterations: int,
    enable_subagents: bool = True,
) -> UnchainAgent:
    # 1. Resolve capability intersection
    toolkits = registry.resolve_toolkits(spec, session_toolkits)
    delegates = registry.resolve_delegates(spec) if enable_subagents else ()
    effective_max_iters = spec.max_iterations or max_iterations
    effective_model = spec.default_model or model

    # 2. Build modules (shared across all agents)
    modules = []
    if toolkits:
        modules.append(ToolsModule(tools=tuple(toolkits)))
    if memory_manager is not None:
        modules.append(MemoryModule(memory=memory_manager))
    modules.append(PoliciesModule(max_iterations=effective_max_iters))
    modules.append(_optimizers_module(...))  # existing

    # 3. Subagent templates — from registry, not hardcoded
    if delegates:
        templates = tuple(
            SubagentTemplate(
                name=d.id,
                description=d.description,
                agent=_build_agent_from_spec(
                    spec=d,
                    registry=registry,
                    enable_subagents=False,  # no nested delegation
                    max_iterations=max(2, effective_max_iters // 3),
                    ...
                ),
                allowed_tools=registry.resolve_toolkits(d, session_toolkits),
                allowed_modes=("delegate", "worker"),
                output_mode="last_message",
                memory_policy="ephemeral",
                parallel_safe=True,
            )
            for d in delegates
        )
        modules.append(SubagentModule(templates=templates, policy=_DEFAULT_POLICY))

    # 4. Compose instructions from prompt_sections
    instructions = _compose_agent_prompt(
        spec.prompt_sections,
        user_modules=user_modules or {},
    )

    return UnchainAgent(
        name=spec.id,
        instructions=instructions,
        provider=provider,
        model=effective_model,
        api_key=api_key or None,
        modules=tuple(modules),
    )


def _create_agent(payload, ..., registry):
    agent_id = payload.get("primary_agent_id") or "pupu_developer"
    spec = registry.get(agent_id) or registry.get("pupu_developer")
    if spec is None:
        raise RuntimeError("pupu_developer missing from registry")
    return _build_agent_from_spec(spec=spec, registry=registry, ...)
```

**Refactor policy:** one-shot replacement. `_build_developer_agent` is removed in the same PR (P4). Safety comes from the equivalence test (§7.4), not from a runtime shim.

### 5.7 Flask boot order

```
app.py::create_app():
  1. Flask() instance
  2. agent_service.boot(registry)          # ← new
       ├─ agent_service.seed_builtin()     # register BUILTIN_SPECS
       └─ agent_service.load_user_agents() # scan store dir
  3. register blueprints (routes.py, route_chat.py, ..., route_agents.py)
  4. memory_factory lazy-init
  5. return app
```

## 6. Frontend Integration

### 6.1 File layout

```
src/
├── SERVICEs/api.agents.js                        NEW  — listAgents / getAgent (read-only)
├── SERVICEs/bridges/agents_bridge.js             NEW  — renderer-side wrapper
├── SERVICEs/api.unchain.js                       MOD  — + injectPrimaryAgentIntoPayload
├── SERVICEs/chat_storage/chat_storage_store.js   MOD  — session.primaryAgentId field
├── SERVICEs/chat_storage/chat_storage_sanitize.js MOD — default null + validate
├── CONTAINERs/config/container.js                MOD  — boot-load agents snapshot
├── CONTAINERs/config/context.js                  MOD  — expose agents field
├── PAGEs/chat/components/primary_agent_selector.js NEW — toolbar dropdown
├── PAGEs/chat/hooks/use_chat_stream.js           MOD  — wire primary_agent_id
└── PAGEs/chat/chat.js                            MOD  — place selector in toolbar

electron/
├── shared/channels.js                            MOD  — + AGENTS.LIST, AGENTS.GET
├── main/services/agents/service.js               NEW  — HTTP proxy to Flask /agents
├── main/ipc/agents_handlers.js                   NEW  — list/get only
├── main/ipc/register_handlers.js                 MOD  — register agents handlers
├── preload/bridges/agents_bridge.js              NEW  — contextBridge exposeInMainWorld
└── preload/index.js                              MOD  — register agentsAPI
```

The Agents tab in `COMPONENTs/agents/agents_modal.js` stays "Coming soon". No editor UI ships in v1.

### 6.2 Selector UX

- Rendered as a compact pill in the chat toolbar next to the active toolkit chips.
- Default label: `🧑‍💻 PuPu Developer` when `session.primaryAgentId` is null.
- Dropdown groups items under `BUILTIN` then `USER`, each row showing avatar/emoji, name, and description.
- Selection writes `session.primaryAgentId` via `chat_storage.updateSession`. The in-flight stream (if any) is **not** interrupted; the change applies to the next user message.

### 6.3 Data flow

```
Boot time:
  ConfigContainer.init():
    agents = await api.agents.listAgents()
    context.agents = { byId: {...}, ordered: [...] }

User clicks selector:
  PrimaryAgentSelector opens dropdown → renders context.agents.ordered
  onChange("pupu_analyzer"):
    chat_storage.updateSession(sessionId, { primaryAgentId: "pupu_analyzer" })

Next user message:
  useChatStream.startStreamV2(sessionId, text):
    payload = buildPayload(session, ...)
    payload = normalizeMisoV2Payload(payload)
      ├─ injectPrimaryAgentIntoPayload(payload, session)
      │     payload.primary_agent_id = session.primaryAgentId || "pupu_developer"
      ├─ injectSystemPromptV2IntoPayload
      ├─ injectMemoryIntoPayload
      ├─ injectWorkspaceRootIntoPayload
      └─ injectProviderApiKeyIntoPayload
    → unchainBridge.startStreamV2(payload)
    → Flask _create_agent reads payload.primary_agent_id
    → registry.get(id) or fallback to pupu_developer
    → _build_agent_from_spec(spec, ...)
```

### 6.4 Session persistence

`session.primaryAgentId`:
- Type: `string | null`.
- Default: `null` for both new sessions and legacy sessions loaded from existing localStorage (sanitize adds it as `null`).
- Validation: pass-through (unknown agent IDs are allowed at write time; the backend falls back to `pupu_developer` if the ID is missing from the registry, so stale IDs never break chat).

## 7. Testing Strategy

### 7.1 Test pyramid

```
E2E (smoke)                       2–3 cases
  · Default flow (no agent selected) → pupu_developer → subagent delegate works
  · Switch to pupu_analyzer → read-only toolkit enforced
  · Minimal user JSON fixture → chat flows

Integration                       ~15 cases
  · route_agents — list / get / 404
  · _build_agent_from_spec — builtin + user spec paths
  · payload.primary_agent_id injection + fallback
  · registry boot — seed builtin + load user store + corrupt JSON tolerance

Unit                              many
  · agent_spec.validate() — id regex, prompt section keys, toolkit format
  · agent_spec.to_dict / from_dict round-trip
  · agent_store — read/write + corrupt-JSON tolerance
  · agent_registry — conflict (builtin vs user) / resolve_toolkits / resolve_delegates
  · chat_storage_sanitize — primaryAgentId default + invalid ID handling
  · api.agents.js — mock bridge + snapshot cache
```

### 7.2 Regression gates (per PR)

Every PR must keep the following existing suites green:

```
unchain_runtime/server/tests/
  test_unchain_adapter_*.py          ← CRITICAL for P4
  test_routes_chat.py                ← CRITICAL for P4
  test_memory_factory.py             ← spot-check

src/
  SERVICEs/chat_storage/*.test.js    ← CRITICAL for P7
  SERVICEs/api.unchain.test.js       ← CRITICAL for P7
  PAGEs/chat/hooks/*.test.js         ← CRITICAL for P7

electron/
  tests/ipc/*.test.cjs               ← spot-check P6 + P7 bridge registration
```

Manual smoke (after each PR): launch app → send one message → no errors. After P7: toggle primary agent → send message → verify log shows correct agent id.

### 7.3 E2E timing

E2E smoke tests are added in a follow-up PR **after P7**, once the full UI path exists. Earlier PRs rely on unit + integration tests plus the existing chat test suite.

### 7.4 P4 equivalence test (mandatory)

P4 introduces the highest regression risk because it rewrites the hot path every chat message traverses. To pin down "behavior unchanged when no `primary_agent_id` is passed", P4's PR **must** include an equivalence test in `test_unchain_adapter_*.py`:

- **Shape:** call `_build_agent_from_spec(spec=DEVELOPER_SPEC, registry=..., enable_subagents=True, ...)` with SDK modules mocked. Assert the resulting `UnchainAgent` has:
  1. `name == "pupu_developer"`
  2. `instructions` string matches a golden string captured from the pre-refactor `_build_developer_agent` output. The golden capture is committed in the same PR as a fixture file (`tests/fixtures/developer_agent_instructions.txt`), generated by running the old code path once before the refactor lands.
  3. `modules` contains, in this order: `ToolsModule`, `MemoryModule` (when memory manager provided), `PoliciesModule(max_iterations=...)`, optimizers module, `SubagentModule`.
  4. `SubagentModule.templates` contains the same agent names as the pre-refactor hardcoded list (`pupu_analyzer`, `pupu_executor`) in the same order, each with `enable_subagents=False` recursively.
  5. `effective_model == payload.model` and `effective_max_iters == payload.max_iterations` (no spec overrides).

The point of the test is **structural and ordering equivalence** with the old `_build_developer_agent`, not end-to-end correctness (which the existing `test_routes_chat.py` covers).

## 8. Implementation Order — 7 PRs

| # | Title | Scope | Risk | Regression surface |
|---|---|---|---|---|
| P1 | `agent_spec` base | `agent_spec.py` + unit tests. Pure dataclass; no existing code touched. | Low | None |
| P2 | Built-in spec export | `prompts/agents/{developer,analyzer,executor}.py` gain `*_SPEC` constants; `__init__.py` exports `BUILTIN_SPECS`. Original prompt dicts untouched. | Low | Read-only additions; runtime behavior unchanged |
| P3 | Registry + store + service skeleton | `agent_registry.py`, `agent_store.py`, `agent_service.py` + tests. `app.py` calls `agent_service.boot(registry)`. Nothing consumes the registry yet. | Low | Extra boot step; adapter still untouched |
| P4 | **Adapter refactor** | `_build_developer_agent` → `_build_agent_from_spec`. `_create_agent` reads `payload.primary_agent_id`. **One-shot replacement** — old function is removed. Must include the §7.4 equivalence test. | **High** | All existing adapter unit tests + chat integration tests must stay green |
| P5 | `route_agents` read endpoints | `GET /agents`, `GET /agents/<id>`. Registers blueprint in `app.py`. | Low | New blueprint is isolated |
| P6 | Frontend bridge + boot load | `electron/` IPC + preload + `SERVICEs/api.agents.js` + `ConfigContainer` boot-load snapshot. **No UI wired yet.** | Low | Startup makes one extra HTTP call; failure silently falls back to empty map |
| P7 | `PrimaryAgentSelector` + payload injection | `PAGEs/chat/components/primary_agent_selector.js`, `chat_storage` gains `primaryAgentId`, `api.unchain.injectPrimaryAgentIntoPayload`, toolbar placement. | Medium | `chat_storage` sanitize + existing chat flow |

After P7 merges, a follow-up PR adds the E2E smoke cases described in §7.1.

### Locked decisions

- **One-shot adapter replacement (no shim).** Safety is delegated to the equivalence test + existing suites, not runtime fallback.
- **E2E delayed to post-P7.** Earlier PRs rely on unit + integration + existing chat regression.
- **P6 and P7 are split.** P6 gets the data path working (visible in devtools) before UI lands in P7.
- **P3 lands the registry before it has a consumer.** This lets boot-order and store-loading bugs be caught in isolation without chat risk.

## 9. Out of scope / Future work

- Backend `POST/PUT/DELETE /agents` + Agents tab editor UI.
- Agent avatar upload (parallel to `character_avatars`).
- Hot-reload of `agent_store` JSON files.
- Nested subagent delegation (`enable_subagents=True` recursively).
- Per-message agent override (right now the change applies to the next message).
- Model-per-subagent overrides (subagents currently inherit the parent's effective model).
