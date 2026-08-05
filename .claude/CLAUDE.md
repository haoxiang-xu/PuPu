# PuPu - Claude Code Project Instructions

## Project Overview

PuPu is a cross-platform desktop AI client built with **React 19 + Electron 40** (frontend) and a **Python Flask sidecar** (unchain_runtime) for chat memory, workspace context, and character management.

- **JavaScript only** — no TypeScript, no PropTypes
- **Inline styles** — no CSS modules, no styled-components
- **Custom router** — `BUILTIN_COMPONENTs/mini_react/mini_router.js` (not react-router-dom for internal routing)
- **All function components** — no class components

## Architecture

```
src/
  PAGEs/              — Route-level pages (chat/, demo/)
  COMPONENTs/         — Domain feature components (chat-bubble, settings, toolkit, etc.)
  BUILTIN_COMPONENTs/ — Reusable UI primitives (input/, modal/, card/, icon/, spinner/, etc.)
  SERVICEs/           — API facade, storage, bridges, utilities
  CONTAINERs/         — Context providers (ConfigContainer → isDark, fonts, window size)
electron/
  main/               — Main process: services (runtime, miso, ollama, update), IPC handlers
  preload/            — Bridge factories (contextBridge.exposeInMainWorld), stream client
  shared/             — IPC channel constants
unchain_runtime/
  server/             — Flask backend: routes.py, unchain_adapter.py, memory_factory.py, character_store.py
```

### Request Flow (Chat Streaming)

```
ChatInterface (use_chat_stream.js)
  → api.unchain.startStreamV2(payload, handlers)
    → Electron IPC (unchain_bridge.js → register_handlers.js)
      → unchainService.handleStreamStartV2 (HTTP POST to Flask)
        → routes.py: chat_stream_v2() → SSE stream
          → unchain_adapter.py: stream_chat_events()
            → unchain Agent.run() in worker thread
              → Provider SDK (OpenAI/Anthropic/Gemini/Ollama)
```

SSE frames flow back through the same path: Flask → Electron main → IPC → preload stream client → React onFrame/onToken/onDone handlers.

### IPC Boundary

React code **never** touches `ipcRenderer` directly. All system access goes through:
- `window.unchainAPI` — chat streaming, tool confirmation, model/toolkit catalogs
- `window.ollamaAPI` — Ollama status, model install
- `window.themeAPI` — system theme detection
- `window.windowStateAPI` — minimize, maximize, close
- `window.appInfoAPI` — version info
- `window.appUpdateAPI` — auto-update

## Naming Conventions

| Entity | Convention | Examples |
|--------|-----------|----------|
| Directories | kebab-case | `chat-bubble/`, `side-menu/` |
| Files | snake_case.js | `chat_storage.js`, `unchain_bridge.js` |
| Tests | `*.test.js` co-located | `api.ollama.test.js` |
| Components | PascalCase | `ChatBubble`, `ToolkitModal` |
| Hooks | `useXxx` | `useChatStream`, `useEditableMessage` |
| Callbacks | `onXxx` | `onSend`, `onEditMessage` |

## Styling

Always inline styles with `isDark` from ConfigContext:

```js
const { isDark } = useContext(ConfigContext);
style={{ backgroundColor: isDark ? "#1e1e1e" : "#ffffff" }}
```

No central theme file — palettes defined per component.

## Key Files

| File | Purpose |
|------|---------|
| `src/PAGEs/chat/chat.js` | Main chat page |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Core streaming hook (~1900 lines) |
| `src/SERVICEs/api.unchain.js` | Miso API facade (payload injection, streaming) |
| `src/SERVICEs/chat_storage.js` | Chat persistence to localStorage |
| `src/COMPONENTs/settings/` | Settings UI (model providers, memory, workspace) |
| `src/COMPONENTs/toolkit/` | Toolkit selection and management UI |
| `src/COMPONENTs/chat-bubble/` | Message rendering (markdown, code, trace frames) |
| `src/COMPONENTs/side-menu/` | Conversation tree sidebar |
| `src/BUILTIN_COMPONENTs/mini_react/` | Custom router, storage, hooks |
| `electron/main/services/miso/service.js` | Miso server lifecycle + SSE relay |
| `electron/preload/stream/unchain_stream_client.js` | IPC stream listener |
| `unchain_runtime/server/routes.py` | Flask API endpoints (55KB) |
| `unchain_runtime/server/unchain_adapter.py` | Agent creation + chat orchestration (99KB) |
| `unchain_runtime/server/memory_factory.py` | Memory manager creation + Qdrant setup |

## Dev Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Full dev: React (port 2907) + Electron |
| `npm run start:web` | React-only dev server |
| `npm test` | Jest test runner |
| `npm run build:electron:mac` | macOS ARM64 build |

Python backend standalone:
```bash
cd unchain_runtime/server && python main.py
```

## Documentation

All detailed developer documentation lives in `docs/`. Start with `docs/DEV_GUIDE.md` for the full index.

| Area | Doc |
|------|-----|
| Architecture | `docs/architecture/` — request flow, IPC boundary, system prompt, memory, storage |
| Data Models | `docs/data-models/` — chat session, messages, catalogs, characters, tree |
| API Reference | `docs/api-reference/` — Flask endpoints, IPC channels, window APIs, facades |
| Features | `docs/features/` — characters, toolkits, workspaces, agent orchestration |
| Conventions | `docs/conventions/` — naming, styling, build, testing, pitfalls |
| Test API (dev only) | `docs/api-reference/test-api.md` — local HTTP endpoint for Claude Code QA |

**Read these before making architectural changes.** They are the source of truth for patterns and conventions.

## The Agent Org — Routing (always in context)

PuPu is maintained by a **22-agent organization across 4 lines** (CTO / COO / AI / HR), defined in `.claude/agents/`. The routing table below **is the index the CEO doesn't have** — it lives here, always in context, so there is no separate routing skill to invoke.

**Route, then execute.** Read the intent, pick the owner, pull them in, report back. Don't narrate ("COO owns this") — launch the owner. When several lines are involved, launch them in parallel in one message.

**Route and dispatch** for anything touching PuPu's code, release, growth, model behavior, or the org itself. **Handle inline** only for trivia no specialist owns: a one-line factual lookup, a direct question about this conversation, or a mechanical edit the CEO already scoped to a specific file. **Never create, delete, or modify agent files while routing** — that is a separate, explicitly approved step.

### No instruction given?

If the CEO gives no instruction — or asks "what should I be doing" — **measure the state first, then recommend.** Never recommend from memory.

```bash
gh release list --limit 3                                    # 悬置 Draft?
git rev-list --count $(git describe --tags --abbrev=0)..HEAD # 积压多少
git log -1 --format=%cd                                      # 最后一次改动
ls -lt .claude/agent-memory/*/[0-9]* 2>/dev/null | head -3   # 各线最近产出
gh run list --limit 5 --json conclusion,name,createdAt       # CI 有没有红的
```

Then match against the cadence table and give **at most three** recommendations, highest-value first, each citing the trigger you actually measured. If nothing is due, say so — "没什么该做的" is a valid and good answer.

### Cadence — when things are due

| Signal you measured | What's due | Route to |
|---|---|---|
| A release Draft is sitting unreleased | Decide the release path | `pupu-coo` (owns GO/NO-GO) |
| A `gh run` failed and nobody triaged it | Triage before anything ships | `pupu-coo` + `pupu-cto` |
| Commits piling up since the last tag | Release readiness | `pupu-coo` |
| A week since the last patrol snapshot | Growth patrol / weekly report | `pupu-growth-ops` |
| Two-plus weeks since the last org sync, or org feels unclear | `/org-sync` | 4 lines in parallel |
| A new agent hasn't appeared in any In-flight for 2 syncs | Routing review (**not** retirement) | `pupu-hr-head` |
| Code landing on a surface no charter claims | Ownership gap | `pupu-cto` → `pupu-hr-head` |
| Before a release, after a big merge | Full pre-release certification | `pupu-release-full-test` (paid cells need explicit CEO cost approval) |

**Cadence ownership:** the patrol rhythm itself belongs to `pupu-growth-ops` (its charter owns 巡船策略). Release rhythm is COO's. This table routes; it does not set policy.

### Who owns what

**Lines:** CTO (12) · COO (4) · AI (2) · HR (3). Verify with `find .claude/agents -name "*.md" ! -name "HYBRID*"` — the count moves.

**CTO line — code, architecture, security**

| Intent | Agent |
|---|---|
| Cross-cutting architecture, "how should we build X", high-risk change review | `pupu-cto` |
| Final architecture authority, feature placement, work slicing, design sign-off | `pupu-architect` |
| Chat page, streaming hook, message list, input panel, side-menu tree | `pupu-dev-chat-core` |
| Message rendering: markdown, trace chain, artifact summary | `pupu-dev-chat-bubble` |
| Settings modal, model providers, init wizard, workspace, memory-inspect | `pupu-dev-settings` |
| Toolkit modal, MCP install/store UI, toolkit cards | `pupu-dev-toolkit` |
| Characters, recipes, flow editor, subagent picker | `pupu-dev-agents` |
| Electron main process, preload bridges, IPC channels, SSE relay | `pupu-dev-electron` |
| Flask backend, `unchain_adapter`, MCP backend, memory factory, **unchain core** | `pupu-dev-backend` (擎) |
| Electron hardening, IPC validation, secrets, MCP supply chain, prompt injection | `pupu-security-expert` |
| QA on chat streaming, IPC, settings, characters, memory persistence | `pupu-qa-tester` |
| UX/UI design, layout, theming, isDark parity, accessibility | `pupu-ux-designer` |
| MCP store catalog: add/validate/organize entries | `mcp-store-curator` |

**COO line — release, growth, market**

| Intent | Agent |
|---|---|
| Release GO/NO-GO, profitability, business direction, PuPu↔unchain compatibility | `pupu-coo` |
| GitHub traffic/downloads/community, growth patrol, weekly COO report | `pupu-growth-ops` |
| Competitor teardowns, pricing/monetization research, market positioning | `pupu-market-analyst` |
| Pre-release full certification, deterministic soak, paid model matrix | `pupu-release-full-test` |

**AI line — model behavior**

| Intent | Agent |
|---|---|
| Model/provider strategy, prompt engineering, RAG/embeddings, tool-use semantics, eval, token cost | `pupu-llm-expert` (智) |
| Evidence-driven investigation of an OSS AI project or a local workflow (dispatch as a fleet) | `pupu-ai-researcher` |

**HR line — organization (advisory only; CEO decides)**

| Intent | Agent |
|---|---|
| Should we add/retire a role, is the org structure right, board-level org recommendation | `pupu-hr-head` |
| Whether a proposed team is warranted, role boundaries, hierarchy complexity | `pupu-hr-org-architect` |
| Who is contributing, dead weight, scope overlap, collaboration friction | `pupu-hr-performance-evaluator` |

### Skills

Skills now live under department folders in `.claude/skills/` (`cto/`, `coo/`, `org/`), mirroring `.claude/agents/`. Invoke by name via the Skill tool.

| Intent | Skill |
|---|---|
| Org-wide sync, "各部门什么情况", "有什么要我拍板的" | `org-sync` (add `--brief` for anomalies only, or a line name for one org) |
| Growth/health analysis, weekly COO report | `growth-analyst` |
| QA against the running app, verify a change actually works | `test-api` |
| Turn a rough idea into a GitHub issue for someone with zero context | `create-issue` |
| i18n coverage after UI string changes | `i18n-coverage` |
| Understand code / blast radius / trace bug / refactor safely | `gitnexus-*` (see the CLI table in `CLAUDE.md`) |
| Run/launch the app to see a change working | `run` |
| Review the working diff | `/code-review` · a GitHub PR | `/review` · security | `/security-review` |
| Anything about Claude models/API/pricing | `claude-api` (never answer from memory) |

### Where findings go

| Finding | Goes to |
|---|---|
| Security issue, any severity | `pupu-security-expert` → CTO/COO direct on HIGH/CRITICAL |
| Anything changing **model-visible behavior** (prompt, retrieval params, tool schema, frame semantics) | `pupu-llm-expert` holds spec + veto |
| Cross-repo interface (`events_v4`, `Agent`, memory) | `pupu-architect` rules; both-side owners give evidence |
| Release risk | `pupu-coo` (only holder of GO/NO-GO) |
| Org/headcount/scope | `pupu-hr-head` (advisory — CEO decides) |
| Architecture debt | `pupu-cto` |

### Keeping this routing true

This table is a hand-written index of things that change on their own. **You own keeping it true** — nobody else is watching it. Run this at the **end** of a routing turn (after dispatch, never before — routing stays instant):

```bash
# Agents that exist but aren't represented in the routing table above
diff <(find .claude/agents -name "*.md" ! -name "HYBRID*" -exec basename {} .md \; | sort) \
     <(grep -oE '`(pupu-[a-z-]+|mcp-store-curator)`' .claude/CLAUDE.md | tr -d '`' | sort -u)
# Skill inventory (nested under dept folders) — compare against the Skills table
find .claude/skills -name SKILL.md | sed -E 's#.*/([^/]+)/SKILL\.md#\1#' | sort
```

Skills are no longer named `pupu-*`, so they no longer collide with the agent-drift diff — the old `grep -vxF` filter is gone.

**On a clean diff, say nothing** — silence is the correct output. **On drift, fix it in the same turn**, then tell the CEO in one line what changed. Read the new or changed agent's `description` frontmatter and write its row from that — never invent a row. A removed agent's row goes away with it. Two things this check cannot see: a row that is *stale* rather than missing (charter ownership moved — update it when you change an agent's scope), and the cadence table + rules (judgment, not inventory — re-examine during `/org-sync`).

### Rules

- **Route, then execute.** Don't hand the CEO a list of who he could ask — ask them.
- **Measure before recommending.** Every "this is due" cites something you just ran, not something you recall. A department's own report is testimony, not an independent signal — and that includes HR's.
- **Don't invent work.** "Nothing is due" is a good answer. Never manufacture a task to look useful.
- **Don't collapse the org into your own summary.** When several lines report, let the CEO see them challenge each other.
- **Respect the gates that are not yours:** release GO/NO-GO is COO's, model-visible behavior is 智's, cross-repo interfaces are architect's, paid test runs need the CEO's explicit cost approval, and HR only advises.

## High-Risk Pitfalls

- Do NOT introduce TypeScript files
- Do NOT use CSS modules or styled-components — inline styles only
- Do NOT access `ipcRenderer` from renderer code — use bridges
- Do NOT create new context providers without checking if ConfigContext already covers it
- Do NOT run `react-scripts build` without `version:prepare-build` first
- Electron tests have both `.js` and `.cjs` variants — keep them in sync
- localStorage writes must go through dedicated helpers in SERVICEs, never direct from components
- 外壳/背景颜色禁止裸 hex —— 用 `var(--pupu-background|sidebar|surface)`；受 shell_background_guard 测试约束，owner 为 pupu-ux-designer
