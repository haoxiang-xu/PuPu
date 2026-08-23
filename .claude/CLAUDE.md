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
| `src/SERVICEs/chat_storage.js` | Chat persistence |
| `src/COMPONENTs/settings/` | Settings UI (model providers, memory, workspace) |
| `src/COMPONENTs/toolkit/` | Toolkit selection and management UI |
| `src/COMPONENTs/chat-bubble/` | Message rendering (markdown, code, trace frames) |
| `src/COMPONENTs/side-menu/` | Conversation tree sidebar |
| `src/BUILTIN_COMPONENTs/mini_react/` | Custom router, storage, hooks |
| `electron/main/services/miso/service.js` | Miso server lifecycle + SSE relay |
| `electron/preload/stream/unchain_stream_client.js` | IPC stream listener |
| `unchain_runtime/server/routes.py` | Flask API endpoints |
| `unchain_runtime/server/unchain_adapter.py` | Agent creation + chat orchestration |
| `unchain_runtime/server/memory_factory.py` | Memory manager creation + Qdrant setup |

## Dev Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Full dev: React (port 2907) + Electron |
| `npm run start:web` | React-only dev server |
| `npm test` | Jest test runner |
| `npm run build:electron:mac` | macOS ARM64 build |

Python backend standalone: `cd unchain_runtime/server && python main.py`

## Documentation

All detailed developer documentation lives in `docs/`. Start with `docs/DEV_GUIDE.md` for the full index. Architecture, data models, API reference, features, conventions — **read these before making architectural changes.** They are the source of truth for patterns.

---

## 工程铁律 (Engineering Ironclad Rules)

全体实现者适用。这些规则只有一份，不依赖任何 owner 或角色机制。

- **JavaScript only** — 不引入 TypeScript，不用 PropTypes
- **Inline styles only** — 从 `ConfigContext` 读 `isDark` 内联分支；无 CSS modules / styled-components / 中央主题文件
- **All function components** — 不用 class 组件
- **Internal routing 用自研 `mini_router`**，不用 react-router-dom
- **渲染进程绝不碰 `ipcRenderer`** — 一切系统访问经 `window.*API` bridge
- **localStorage 只经 `SERVICEs` 里的专用 helper 写** — 组件里绝不直接写
- **Electron 测试有 `.js` / `.cjs` 双胞胎，必须同步** — 本仓唯一会静默失效的测试形态
- **外壳/背景颜色禁裸 hex** — 用 `var(--pupu-background | --pupu-sidebar | --pupu-surface)`，受 `shell_background_guard` 测试约束
- **浮层 z-index 禁裸数字** — 任何 body portal 或 `position: fixed` 浮层从 `BUILTIN_COMPONENTs/layer/z_layers.js` 的 `Z` 取值，受 `z_layers_guard` 测试约束。该 guard 只抓 ≥1000 的字面量（`CONTENT_RAISED: 10`、`SCROLL_OVERLAY: 500` 本身就是小值，不能一刀切），所以**更小的裸值和「层选错了」只能靠 review**——`Z.MODAL` 用在本该是 `Z.POPOVER` 的地方，guard 全绿而层级是错的
- **改任何 symbol 前先跑 upstream impact**，报爆炸半径；HIGH/CRITICAL 大声警告后再动。重命名用重构工具，**绝不 find-and-replace**
- **跨 repository/process/provider/serialization/persistence/state 边界必须走 [`cross-boundary-contract-gate`](rules/cross-boundary-contract-gate.md)**：直接在 Release issue 或实施 Plan 声明 `BC-###` 与适用 `SEQ-###`，逐项映射 `AC-###`；真实 producer → 严格 consumer、第二次使用与冷重启证据不完整时不得 active rollout
- **测试**：PuPu 用 `react-scripts test`（**不要直接 `npx jest`**，本仓会报 import 错）；unchain 用其自带 pytest
- **`react-scripts build` 之前必须先跑 `version:prepare-build`**
- **unchain 的 `.py` 改动后 sidecar 必须重启** 才生效 —— 报告里标注
- **不新建 context provider** 之前先确认 `ConfigContext` 是否已覆盖
- **主树不自行 commit**，留 dirty tree 给 project owner。常设例外（2026-07-13）：**隔离 worktree 里的切片允许自己 commit，但不 push**

---

## 协作与 Release 工作流

### 已退役并禁止的新工作机制

- 不使用 code-owner 路由、owner 确认、Quorum/庭审角色、case、hearing、proposal、ruling、HS/RS/AT 或其他案卷流程。
- 不调用 `.claude/skills/case`，不在 `.claude/court/cases/` 下创建新目录，也不把 `.claude/court/`、`.claude/codex/`、`.claude/agents/` 中的历史内容当作授权、阻断条件或当前流程。
- 历史文件保持只读，只能用于理解旧决策和事故，不得继续、继承或扩展其中的程序。

### Release-first

- 版本流程优先使用最小匹配的 skill：`release-open-sprint`、`release-draft-ticket`、`release-refine-ticket`、`release-feature-audit`、`release-close-sprint`。
- direct Release child 当前实施 agent 可在不改变 project owner 已定结果和 release scope 的前提下直接细化 issue body；资格来自当前任务，不来自 owner 角色或 GitHub assignee。
- title、labels、Size、Status、Iteration、assignee、父子关系、release 归属、延期/取消和关闭仍由 project owner 决定或由对应 release skill 按其明确授权执行。
- 对应 skill 不可用时，使用等价的直接工作流；禁止回退到已退役机制。

### 直接工程门禁

- 明确的用户指令、Release issue 和必要时的直接实施 Plan 构成工作范围；不需要另行裁决或角色确认。
- 涉及架构或跨边界时保留技术性 `BC-### / SEQ-### / AC-###`、严格 consumer、负向测试、状态矩阵和固定 artifact 证据，但不得加入 owner、proposal、ruling 或案卷字段。
- 实施 agent 对范围内的代码、测试和报告负责；发现需要改变用户结果、release scope 或外部状态权限时，直接向 project owner 请求决定。
- 完成功能后使用 `release-feature-audit`；版本收尾使用 `release-close-sprint`。测试或适用状态单元格未通过时不得把 ticket 或 release 报为完成。
- 不要发明工作。project owner 未给指令时先测量再建议，每条建议引用现场证据。
