# PuPu Test API — Design

**Date:** 2026-04-24
**Status:** Approved (brainstorming complete, awaiting plan)
**Scope:** Phase 1 only. Phase 2 items are listed at the bottom for context but not specified here.

---

## 1. Goal

给 PuPu 加一个本地 HTTP REST endpoint，让 Claude Code 当 QA 跑回归测试：每次改完代码自动验一遍 happy path（创建 chat → 选模型/toolkit/character → 发消息 → 收完整回复 → 断言），并通过 logs / state snapshot / screenshot / eval 做 debug。

操作必须真实驱动 React state，使 PuPu UI 与 API 调用完全同步（Claude Code 调 `POST /chats`，UI 真的弹出新 chat）。

## 2. Non-Goals

- 不做生产环境暴露（dev only，bind 127.0.0.1）。
- 不做低层 UI driving（click/type/dom selector）；那是 Phase 2+ 才考虑的 e2e 风格。
- 不做认证 / token（dev only 不需要）。
- 不做 Phase 2 项：stream=true SSE、Flask logs 代理、capability discovery、settings 类高级操作。

## 3. Architecture

```
Claude Code (CLI)
  │ HTTP (curl/fetch)
  ▼
Electron main (dev only)
  electron/main/services/test-api/
    ├─ index.js     lifecycle, gate by NODE_ENV
    ├─ server.js    手写 router on Node http
    ├─ commands.js  路由 → command 表
    ├─ bridge.js    IPC invoke main↔renderer
    └─ logs.js      ring buffer (renderer console + main stdout)
  │ IPC: test-bridge:invoke / :result / :log / :event / :ready
  │ webContents.executeJavaScript() (eval)
  │ webContents.capturePage()       (screenshot)
  ▼
Renderer (React)
  src/SERVICEs/test_bridge/
    ├─ index.js          register + console patch + ready handshake
    ├─ handlers/
    │   ├─ chat.js       create / list / activate / rename / delete
    │   ├─ message.js    sendMessage / cancel
    │   ├─ catalog.js    list / select model|toolkit|character
    │   └─ debug.js      getStateSnapshot
    └─ state_selector.js 读 chat_storage + ConfigContext + modal registry
```

**关键性质**

- HTTP 入口 → IPC bridge → renderer handler 三段，与现有 `unchain_bridge.js` / `ollama_bridge.js` 模式同构。
- 所有"会改 UI"的操作强制经 renderer handler，触发真实的 React state 变化。
- Eval / screenshot 由 main 直接对 webContents 操作，不经 handler；用作探索/逃生口。
- Logs 是 renderer→main 的反向 IPC 流（不阻塞 HTTP 路径）。

## 4. Module Responsibilities

### 4.1 Electron main 侧（`electron/main/services/test-api/`，新建）

| File | 单一职责 | 关键 export |
|---|---|---|
| `index.js` | 决定启不启；写 port file；attach webContents；before-quit 关闭 | `start(mainWindow)`, `stop()` |
| `server.js` | 手写 Node http server，bind `127.0.0.1:0`（系统分配端口）；JSON body 解析；调 `commands.dispatch` | `createServer({onReady})` |
| `commands.js` | 集中表 `{path, method, validator, handler}`；新加命令只改这里 | `dispatch(req, res)`, `register(...)` |
| `bridge.js` | `invoke(command, payload, {timeout})` → IPC → 等 result；requestId 用 nanoid | `invoke()`, `attach(webContents)` |
| `logs.js` | 接 IPC `test-bridge:log`；patch `process.stdout/stderr.write`；导出 `tail({source, n, since})` | `tail()`, `pushFromRenderer()`, `start()`, `stop()` |

**启动 gate**（必须放最顶）：
```js
if (process.env.NODE_ENV === 'production') return;
if (process.env.PUPU_TEST_API_DISABLE === '1') return;
```

### 4.2 Preload 侧（新建 `electron/preload/test_bridge_preload.js`）

仅在非 production 时执行 `contextBridge.exposeInMainWorld('__pupuTestBridge', {...})`，提供：
- `register(command, handler)` — handler 是 `async (payload) => result`，**last-mount-wins**（Map 单 ref，覆盖式）
- `unregister(command)` — return value of register 调它
- `pushLog({ts, level, source, msg})` — 推 renderer console 到 main
- `pushEvent({type, payload})` — Phase 2 stream 用
- `markReady()` — handshake 完成信号

实现细节：监听 `test-bridge:invoke`，按 command 找 handler，结果通过 `test-bridge:result` 回 main。

### 4.3 Renderer 侧（新建 `src/SERVICEs/test_bridge/` + 改动若干组件）

**入口** `src/SERVICEs/test_bridge/index.js`：
```js
if (!window.__pupuTestBridge) return;          // prod / disabled 直接退出
patchConsole();
import('./handlers/chat').then(m => m.register());
import('./handlers/message').then(m => m.register());
import('./handlers/catalog').then(m => m.register());
import('./handlers/debug').then(m => m.register());
window.__pupuTestBridge.markReady();
```

**App.js 挂载点**（build-time guarded import，保证 prod bundle 不带）：
```js
if (process.env.NODE_ENV !== 'production') {
  require('./SERVICEs/test_bridge');
}
```

**Handler 策略 — 两种来源**

每个 command 的 handler 来源于以下两种之一：

1. **Service-source handler**（在 `handlers/*.js` 文件 module load 时 register）：能纯靠 service / storage 完成的操作。例如 `createChat` 调 `chat_storage.createSession()` + 派发自定义 event 让 sidebar 自动 refresh。在 `src/SERVICEs/test_bridge/index.js` 入口里 `import().then(m => m.register())` 注册。
2. **Component-source handler**（组件 mount 时 register）：必须经 hook/Context/in-flight closure 的操作。例如 `sendMessage` 必须经 `use_chat_stream.js` 才能拿到完整流式路径。组件 `useEffect(() => __pupuTestBridge.register('cmd', impl))` 注册，handler `impl` 必须 `useCallback` 稳定 ref（否则每次 re-render 重注册有 race window）。组件 unmount 时 cleanup 反注册。

**只读快照**：`state_selector.js` 读 `chat_storage` + `ConfigContext` + `__pupuModalRegistry`，不需要任何组件配合。

**Day-1 命令分类**：

| Command | 来源 | 备注 |
|---|---|---|
| createChat / listChats / activateChat / renameChat / deleteChat | Service | 全部走 chat_storage |
| sendMessage / cancelMessage | Component (ChatInterface) | 必须 useCallback 稳定 |
| listModels / listToolkits / listCharacters | Service | 走 catalog service |
| selectModel / setToolkits / setCharacter | Service | 写 chat config |
| getStateSnapshot | Service (state_selector) | 纯读 |

**会改的现有组件（侵入面）**

| 组件 | 改动 | 备注 |
|---|---|---|
| `electron/main/index.js` | 加 `testApi.start(win)` 一行 + `before-quit` hook | 极低风险 |
| `src/App.js` | build-time guarded import | 极低风险 |
| `src/PAGEs/chat/chat.js` (ChatInterface) | `useEffect` register `sendMessage` + `cancelMessage` | 要求 `sendMessage` 是 `useCallback` 稳定 ref；写 plan 前先审计 `use_chat_stream.js` |
| 各 modal 组件 | 加一行 `useModalLifecycle('toolkit-modal')` 注册到 `__pupuModalRegistry` | 扫一遍找全 |
| `src/BUILTIN_COMPONENTs/mini_react/` 或新建 `useModalLifecycle.js` | 实现 30 行的 modal 生命周期 hook | |

### 4.4 IPC Channels（加到 `electron/shared/ipc_channels.js`）

```
test-bridge:invoke    main → renderer  {requestId, command, payload}
test-bridge:result    renderer → main  {requestId, ok, data?, error?}
test-bridge:log       renderer → main  {ts, level, source: 'renderer', msg}
test-bridge:event     renderer → main  {type, payload}        (Phase 2)
test-bridge:ready     renderer → main  {}                     (handshake)
```

## 5. Endpoints (Phase 1)

Base: `http://127.0.0.1:<port>/v1`

### 5.1 Chat 生命周期

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats` | `{title?, model?, character_id?, toolkit_ids?}` | `{chat_id, created_at}` |
| GET | `/chats` | — | `{chats: [{id, title, model, message_count, updated_at}]}` |
| GET | `/chats/:id` | — | `{id, title, model, character_id, toolkits, messages: [...]}` |
| POST | `/chats/:id/activate` | — | `{ok: true}` |
| PATCH | `/chats/:id` | `{title?}` | `{ok: true}` |
| DELETE | `/chats/:id` | — | `{ok: true}` |

### 5.2 Message 收发

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats/:id/messages` | `{text, attachments?: [{type, path}]}` | `{message_id, role: 'assistant', content, tool_calls?, finish_reason, latency_ms}` (blocking) |
| POST | `/chats/:id/cancel` | — | `{ok: true, was_streaming}` |

> Phase 1 仅 blocking 模式：HTTP hold 直到 done 才返回。SSE 流式版本是 Phase 2。
> Timeout: bridge.invoke 默认 30s；message send 单独放宽到 5min。

### 5.3 Catalog 和切换

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/catalog/models` | — | `{models: [{id, provider, label}]}` |
| GET | `/catalog/toolkits` | — | `{toolkits: [{id, name, enabled_by_default}]}` |
| GET | `/catalog/characters` | — | `{characters: [{id, name}]}` |
| POST | `/chats/:id/model` | `{model_id}` | `{ok: true, model_id}` |
| POST | `/chats/:id/toolkits` | `{toolkit_ids: [...]}` | `{ok: true}` （**整体覆盖，非增量**） |
| POST | `/chats/:id/character` | `{character_id \| null}` | `{ok: true}` （null = 清除） |

### 5.4 Debug

| Method | Path | Query/Body | Returns |
|---|---|---|---|
| GET | `/debug/state` | `?chat_id=` | `{active_chat_id, active_chat, current_model, modal_open, toolkits_active, character_id, is_streaming, route, window_state, catalog_loaded}` |
| GET | `/debug/logs` | `?source=renderer\|main&n=200&since=<ts>` | `{entries: [{ts, level, source, msg}]}` （Phase 1 不含 flask） |
| GET | `/debug/screenshot` | `?format=png\|jpeg&quality=` | binary image (`Content-Type: image/png`) |
| POST | `/debug/eval` | `{code, await?: true}` | `{ok, value \| error}` （value 必须 JSON serializable） |
| GET | `/debug/dom` | `?selector=` | `{html}` （省 selector 给 `<body>`） |

### 5.5 错误约定

HTTP status + body `{error: {code, message, hint?}}`：

| Status | Code | 触发 |
|---|---|---|
| 400 | `invalid_payload` | schema validator fail |
| 404 | `chat_not_found` | id 不存在 |
| 408 | `ipc_timeout` | renderer 没在 timeout 内回 |
| 409 | `no_handler` | command 没人 register |
| 500 | `handler_error` | handler 抛错 |
| 503 | `not_ready` | renderer 还没 markReady（启动 race） |

## 6. Lifecycle & Discovery

### 6.1 启动顺序（含 race 处理）

```
electron main app.whenReady
  → testApi.start(mainWindow)
    → server.listen(0, '127.0.0.1') → got port
    → 写 port file
    → server 标记 ready=false (任何 HTTP 请求返 503 not_ready)
    → bridge.attach(webContents)，等待 IPC 'test-bridge:ready'
  → mainWindow loadURL → preload 跑 → 暴露 window.__pupuTestBridge
  → React App.js mount → import test_bridge → 注册 handlers → patchConsole → markReady
  → IPC 'test-bridge:ready' 到达 main → server 标记 ready=true
```

后续 HTTP 请求才进入正常路径。客户端拿到 `503 not_ready` 应该 retry（client helper 内置）。

### 6.2 Port file

路径 `app.getPath('userData')/test-api-port`：
```json
{"port": 49231, "pid": 12345, "started_at": 1714000000000}
```

`scripts/test-api/client.mjs` 读这个文件、`process.kill(pid, 0)` 校验存活、构造 base URL。死 PID 时报错让用户重启 PuPu。

### 6.3 Shutdown

`app.on('before-quit', testApi.stop)`：close server、解 patch、删 port file（best-effort）。

## 7. Debug 实现细节

### 7.1 Logs

- **Renderer**: `console.log/info/warn/error` 替换为 `(...args) => { orig(...args); push({source:'renderer', level, msg: serialize(args)}) }`，加 `window.error` / `unhandledrejection` listener。
- **Main**: 包 `process.stdout.write` 和 `process.stderr.write`，写 ring buffer 后调原 write。
- **Ring buffer** 在 main 侧（`logs.js`），`Map<source, CircularBuffer<2000>>`。
- 统一 schema: `{ts, level, source, msg, ctx?}`，`since` 参数支持增量轮询。

### 7.2 State Snapshot

`state_selector.js` 收集（无侵入读）：
```js
{
  active_chat_id: chat_storage.getActiveChatId(),
  active_chat: { id, title, model, message_count, last_message_role },
  current_model,
  toolkits_active,
  character_id,
  modal_open: window.__pupuModalRegistry?.openIds() ?? [],
  is_streaming: <test_bridge 维护的 in-flight 标志>,
  route: window.location.hash,
  window_state: { width, height, isDark, locale },
  catalog_loaded: { models, toolkits, characters }   // counts
}
```

### 7.3 Modal Registry

新建 `src/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle.js`：
```js
window.__pupuModalRegistry = window.__pupuModalRegistry || {
  _open: new Set(),
  open(id) { this._open.add(id); },
  close(id) { this._open.delete(id); },
  openIds() { return [...this._open]; }
};

export function useModalLifecycle(id, isOpen) {
  useEffect(() => {
    if (!isOpen) return;
    window.__pupuModalRegistry.open(id);
    return () => window.__pupuModalRegistry.close(id);
  }, [id, isOpen]);
}
```

每个 modal 加一行 `useModalLifecycle('toolkit-modal', isOpen)`。

### 7.4 Screenshot

```js
const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
const img = await win.webContents.capturePage();
return format === 'jpeg' ? img.toJPEG(quality) : img.toPNG();
```

### 7.5 Eval

```js
const wrapped = isAsync
  ? `(async () => { ${code} })()`
  : `(() => { return (${code}); })()`;
const value = await mainWindow.webContents.executeJavaScript(wrapped, true);
```

`code` 长度上限 64KB；返回值必须 structured-cloneable（DOM 节点要 `el.outerHTML`）。

### 7.6 DOM

包装在 eval 之上：
```js
evalInRenderer({code: `document.querySelector(${JSON.stringify(selector)})?.outerHTML ?? null`})
```

## 8. Production / Dev / 性能影响

### Production build (普通用户)
- HTTP server 不启（NODE_ENV gate）
- Port file 不写
- Console 不 patch（`window.__pupuTestBridge` 不存在）
- Bundle 体积：通过 `if (process.env.NODE_ENV !== 'production')` 包住 `require('./SERVICEs/test_bridge')`，CRA 在 build 时整块剥掉，**理论增量 0**

### Dev mode
- 启动多 listen 一个端口 + 写 port file（+几十 ms）
- `console.log` 多走一次 IPC + 写 ring buffer（~0.1ms 量级）
- HTTP server idle 时零开销

### 性能
- Ring buffer 固定 2000 条 O(1)
- IPC 流量是 log/event/result，量级与平时 chat 流可比

## 9. Testing

| 类型 | 位置 | 内容 |
|---|---|---|
| Unit | `electron/tests/test-api/commands.test.js` | 路由表、validator、错误码 |
| Unit | `electron/tests/test-api/bridge.test.js` | mock IPC，验 requestId 配对、timeout |
| Unit | `electron/tests/test-api/logs.test.js` | ring buffer、since 过滤 |
| Integration | `electron/tests/test-api/integration.test.js` | 起真 server + mock webContents，全路径走 createChat / sendMessage / screenshot / eval |
| Renderer | `src/SERVICEs/test_bridge/handlers/*.test.js` | mock chat_storage / window registry |
| Smoke | `scripts/test-api/smoke.mjs` | 真起 PuPu (`npm start`)，跑 create→model→send→done→screenshot→delete 全流程 |

`.cjs` 镜像按现有 `electron/tests/` 约定同步。

## 10. Documentation

- `docs/api-reference/test-api.md` — endpoint 表 + 示例 curl
- `docs/api-reference/test-api-debug.md` — logs/state/screenshot/eval 详解
- `docs/conventions/test-api.md` — 加新 endpoint 的步骤、加新 modal 时的 `useModalLifecycle` 约定
- `CLAUDE.md` 顶部加一句 "Test API (dev only) — see docs/api-reference/test-api.md"

## 11. Phase 2 (out of scope, listed for context)

- `stream=true` SSE 模式（用 `test-bridge:event` channel 转发 SSE 帧）
- `unchain_runtime` 加 `/internal/logs/tail` + main 代理到 `/v1/debug/logs?source=flask`
- `GET /v1` capability discovery（已 register 的 handlers + version）
- 高级操作：settings 改 system prompt、memory 开关、import/export chat、theme 切换
- Multi-window 支持：把 last-mount-wins 升为 keyed map，path 加 `?window=`

## 12. Known Risks / Follow-ups

- **`use_chat_stream.js` 现状**：~1900 行，`sendMessage` 是否已经是稳定 `useCallback` 引用？plan 阶段第一步必须先 audit；如果不是，要在 plan 里加 refactor 任务。
- **Last-mount-wins**：多窗口语义会被覆盖，是已知限制。Phase 2 升级 keyed map。
- **Modal registry 覆盖率**：现有 modal 数量未盘点；plan 需 grep 找全（搜 `Modal`、`Dialog` 等关键字）。
- **CRA dead-code elim 可靠性**：`if (process.env.NODE_ENV !== 'production')` 应该被 CRA inline+剥除；plan 末尾加一步 `npm run build:electron:mac` 后 grep bundle 里有没有 `__pupuTestBridge`，confirm 真的没漏。
