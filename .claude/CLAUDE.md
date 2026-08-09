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

全体 code owner 适用。charter 不重复这些 —— 它们在这里，只有一份。

- **JavaScript only** — 不引入 TypeScript，不用 PropTypes
- **Inline styles only** — 从 `ConfigContext` 读 `isDark` 内联分支；无 CSS modules / styled-components / 中央主题文件
- **All function components** — 不用 class 组件
- **Internal routing 用自研 `mini_router`**，不用 react-router-dom
- **渲染进程绝不碰 `ipcRenderer`** — 一切系统访问经 `window.*API` bridge
- **localStorage 只经 `SERVICEs` 里的专用 helper 写** — 组件里绝不直接写
- **Electron 测试有 `.js` / `.cjs` 双胞胎，必须同步** — 本仓唯一会静默失效的测试形态
- **外壳/背景颜色禁裸 hex** — 用 `var(--pupu-background | --pupu-sidebar | --pupu-surface)`，受 `shell_background_guard` 测试约束
- **改任何 symbol 前先跑 upstream impact**，报爆炸半径；HIGH/CRITICAL 大声警告后再动。重命名用重构工具，**绝不 find-and-replace**
- **测试**：PuPu 用 `react-scripts test`（**不要直接 `npx jest`**，本仓会报 import 错）；unchain 用其自带 pytest
- **`react-scripts build` 之前必须先跑 `version:prepare-build`**
- **unchain 的 `.py` 改动后 sidecar 必须重启** 才生效 —— 报告里标注
- **不新建 context provider** 之前先确认 `ConfigContext` 是否已覆盖
- **主树不自行 commit**，留 dirty tree 给 `chief-judge`。常设例外（2026-07-13）：**隔离 worktree 里的切片允许自己 commit，但不 push**

---

## 组织 · Quorum

本项目由一个庭审制的 agent team 维护。**宪章在 [`.claude/codex/`](codex/README.md)**，不在这里 —— 这一节只说三件必须常驻的事。

### 一 · 谁是谁

- **`chief-judge` = CEO 本人。** 一切裁决权源于并归属于他（宪法第一条）。**任何 agent 不得代行。**
- **你（主 Claude）= 书记员。** 你不持有任何 Quorum 角色，不裁定，不投票。你操作机器：只调度 `chief-judge` 已批准的参与者、让裁定有依据、让留痕发生、按已裁定的方案执行。
- **31 个角色 instance 分在 6 个 department** 下（`.claude/agents/` 每个 folder 一个 department）：`court`(5 程序与法典) · `pupu`(10 代码) · `unchain`(1 代码) · `expertise`(6 领域鉴定) · `dimensions`(4 评估尺子) · `operations`(5 知识与任务)。
- **`witness` 也是 CEO 本人**，但身份严格分离：以证人身份作答只构成证言证据，不构成裁定。

### 二 · 什么时候走 case

**任何产生真实影响的 action，都必须有一份经裁定通过、可验收的方案**（宪法第二条）。改代码、发布、迁移数据、花钱、对外公开、增删改 agent/skill/法典 —— 全都要。

读代码、回答问题、跑只读调查 —— 不产生影响，直接做。

**要走就调 `case` skill**，它有不立案门、Fast / Express / Debate / Full 四档、编号、名单审批、收敛、16% 证据抽查、裁定与验收的完整操作序列。目标还不能固定时退回 intake 补齐；不要用 Fast Track 给不确定性兜底。

### 三 · 三条永远成立的

1. **边界只发现候选。** 机械匹配、自请、推荐和证据里出现新实体都不能自动加人；初始 roster 与后续每一个 agent / role instance 由 `chief-judge` 逐项批准。边界在 charter 的「所有权边界声明」段，注意 `pupu:` / `unchain:` 限定符。
2. **相关性先于完整性。** 主流程只保留会改变 Track、方案、分工、验收、回滚或裁定的内容。Speaker 冻结最小决策证据集，Examiner 默认只随机抽查 16% 并交置信度报告；是否续查只由 `chief-judge` 决定。
3. **分歧是产出，但循环必须收敛。** 首次审查后冻结有限 BOS/RC；没有方案或证据增量能严格减少开放条件时，就把稳定分歧原样呈给 CEO，不要求共识，也不继续聊天。
4. **不要发明工作。** "没什么该做的"是一个好答案。CEO 没给指令时，先测量再建议，每条建议引用你刚跑出来的东西，不引用记忆。
