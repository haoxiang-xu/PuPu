# Frontend Loading & Decoupling Design

**Date:** 2026-04-19
**Status:** Spec — awaiting user review
**Scope:** PuPu frontend (React 19)

## Goal

让 PuPu 前端所有 UI 交互做到：若操作可瞬时完成就瞬时响应（0ms 感知延迟），若需等待就显示统一的 spinner/progress 反馈，且点击 handler 永远不阻塞主线程。逻辑执行与 UI 加载通过两个 hook + 三个组件 + 一套 toast/progress bus 解耦。

## Background

前端共 ~45 个交互点。现状调研：

- ~18 个有 async 副作用，仅 ~6 个有完整 loading 反馈
- Send button 点击到首个 token 到达前无反馈
- Settings API key 验证、Toolkit install 无 pending 保护，可重复触发
- Lazy modal `<Suspense>` 无 fallback，首次打开可能白屏 1-3s
- 热路径同步调用（`buildHistoryForModel`、`settleStreamingAssistantMessages`、`JSON.parse(JSON.stringify())` 深拷）卡 50-200ms
- 全局无 toast / progress bar / skeleton 基础设施
- 现有 `LoadingDots` 使用不一致，和三个 spinner 原子（ArcSpinner / CellSplitSpinner / StringSpinner）并存

前期 React store perf 优化已确立的好 pattern（`writeStore` microtask 合并 + 去 structuredClone + GC 移 idle）保留并延用。

## Non-Goals

- **虚拟化长列表**（chat messages、side menu tree）单独立项
- **Electron 主进程阻塞**优化（Ollama 启动、Flask 启动）不在此方案
- 新增 skeleton 系统（使用 ArcSpinner 足矣）
- 替换三个现有 spinner 原子（ArcSpinner / CellSplitSpinner / StringSpinner 保留）

## Design Decisions

### 混合反馈模式（A/B/C 三类）

| 类别 | 模式 | 适用 | 视觉 |
|------|------|------|------|
| **A 乐观更新** | 点击 → UI 立刻当已完成 → 后台执行 → 失败 rollback + toast | rename / delete / toggle 等可回滚、低风险 | 无 spinner |
| **B Spinner** | 点击 → pending state → spinner → 完成 | 外部 API / install / validate 等不可回滚 | SpinnerButton 内嵌 spinner；>300ms 叠加顶部 progress bar |
| **C 瞬时** | 纯前端状态切换 | dropdown / tab / copy / window controls | 无反馈 |

### 基础设施优先（建抽象再铺开）

先用 1-2 天建 6 个通用原子（见下），再用它们逐个改 45 处。好处：一致性、未来新 button 免费享受、防重复点击和错误处理一处修复。

### Pending 的视觉形态（两个阈值）

- SpinnerButton 用 **content swap**（文字换成居中 ArcSpinner），尺寸 `min-width` 锁死、无 background 变化（遵守 mini_ui 极简）
- **`pendingDelayMs` 默认 200ms**：action 启动后等待 200ms 才切换按钮为 spinner 态。如果 action 在 200ms 内完成，用户**什么 spinner 都看不到**（避免闪烁一下的不适）
- **`progressThresholdMs` 默认 300ms**：action 运行超过 300ms 后激活顶部 progress bar。300ms 内完成不显示 progress bar
- 两个阈值独立：短操作（<200ms）两者都不显示；中操作（200-300ms）只 button 显示 spinner；长操作（>300ms）两者都显示
- 每个 `useAsyncAction` 调用点可覆盖两个阈值

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  React 组件（45 处交互点）                                │
│    ↓ 调用                                               │
│  ┌────────────────┐  ┌──────────────────┐              │
│  │ useAsyncAction │  │ useOptimistic    │  ← 两个 hook  │
│  │ (B: spinner)   │  │ Update (A)       │              │
│  └────┬───────────┘  └────┬─────────────┘              │
│       │                    │                            │
│       ├─→ pending / 防重点击 / 错误 toast                │
│       ├─→ >300ms 自动激活顶部 progress bar               │
│       └─→ 失败时 rollback（A 模式）                     │
│                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────┐  │
│  │ SpinnerButton │  │ SuspenseFall  │  │ ToastHost  │  │ ← 组件
│  │               │  │ back          │  │            │  │
│  └───────────────┘  └───────────────┘  └────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────┐           │
│  │ TopProgressBar（单例，订阅全局 bus）      │           │ ← 单例
│  └─────────────────────────────────────────┘           │
└────────────────────────────────────────────────────────┘
```

## Core Primitives (P1 + P2)

### 1. `SpinnerButton` — `src/BUILTIN_COMPONENTs/input/spinner_button.js`

```js
<SpinnerButton
  pending={bool}             // 外部可强制 pending
  disabled={bool}
  onClick={fn}               // 返回 Promise 时自动进入 pending
  spinnerSize={14}
  {...buttonProps}
>Send</SpinnerButton>
```

行为：
- `pending=true` 或 onClick 返回的 Promise 未 resolve：文字替换为居中 `ArcSpinner`，尺寸用 `min-width` 锁死（mount 时 measure），`cursor: wait`，**无 background 变化**
- pending 期间 onClick 被 swallow（防重复）
- 继承现有 `button.js` 的 disabled 样式（`opacity: 0.4`）

### 2. `useAsyncAction` — `src/BUILTIN_COMPONENTs/mini_react/use_async_action.js`

```js
const { run, pending, error, reset } = useAsyncAction(
  async (args, { signal }) => { /* async work; 可 check signal.aborted */ },
  {
    label: "验证 API Key",           // progress bar / toast 人类可读名
    pendingDelayMs: 200,             // action 启动后多久才 pending=true（防闪烁）
    progressThresholdMs: 300,        // 超此时长激活顶部 progress bar
    onError: (err) => { /* 覆盖默认 toast；可接 AbortError */ },
    onSuccess: (result) => { /* optional */ }
  }
);
```

内部：
- 内部维护两个 state：`running`（action 是否在跑）和 `pending`（是否应显示 pending UI）
- `run()` 调用后：`running=true` 立刻、`pending` 由一个 `setTimeout(pendingDelayMs)` 切换。若 action 在此之前 resolve，定时器被取消，`pending` 始终是 false（不闪烁）
- `running=true` 期间再次 `run()` 被忽略（返回已完成的空 Promise，防重复点击）
- 超过 `progressThresholdMs` 未完成：`progressBus.start(id, label)`；完成/错误时 `.stop(id)`
- 错误默认 `toast.error(label + ": " + err.message)`，可被 `onError` 覆盖；`AbortError`（unmount/新 run 取消）**不 toast**
- unmount 或重新 `run()` 时 abort：通过 `AbortController` 透传给 action 的第二参数 `{ signal }`
- `reset()` 清 error state（用户修正后重试用）
- 暴露的 `pending` 是"延迟过的 pending"（已减去 pendingDelayMs 内完成的情况），`SpinnerButton` 直接用它即可

### 3. `useOptimisticUpdate` — `src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.js`

```js
const { apply } = useOptimisticUpdate();
apply({
  optimistic: () => { /* 同步立刻跑，UI 立刻更新 */ },
  commit:     () => Promise /* microtask 排队跑，不阻塞点击 */,
  rollback:   (err) => { /* 失败时回滚 */ },
  label: "重命名对话",
  guard:     () => bool  // 可选：rollback 前 check，false 则跳过（race 保护）
});
```

行为：
- `optimistic()` 同步执行
- `commit()` 在 `queueMicrotask` 排队
- 失败：若 `guard()` 返回 true（或没定义），跑 `rollback()` + `toast.error(label)`
- 不显示 spinner

### 4. Toast 系统 — `src/SERVICEs/toast_bus.js` + `src/SERVICEs/toast.js` + `src/BUILTIN_COMPONENTs/toast/toast_host.js`

- `toast_bus.js`：轻量 event bus（`subscribe/emit`）
- `toast.js`：API `toast.success(msg)` / `toast.error(msg)` / `toast.info(msg, { duration })`
- `toast_host.js`：挂根组件；右下角 stack；默认 4s 消失；点击关闭；dark/light 由 ConfigContext 驱动
- 同 label 错误 2s 内去重（去重 key = `type:label`）

### 5. TopProgressBar — `src/SERVICEs/progress_bus.js` + `src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.js`

- `progress_bus.js`：`start(id, label)` / `stop(id)` / `getActive() → { count, labels }`
- `top_progress_bar.js`：挂根；`count > 0` 时显示 2px 顶部条（宽度 0→80% 渐进动画，stop 后跳到 100% 再淡出 200ms）
- 多并发 action：bar 亮到最后一个 stop
- 样式：`position: fixed; top: 0; height: 2px`，颜色跟主题

### 6. SuspenseFallback — `src/BUILTIN_COMPONENTs/suspense/suspense_fallback.js`

极简居中 `ArcSpinner`，props `{ minHeight?: number }`。用于 `<Suspense fallback={<SuspenseFallback />}>`。

## Phase Structure

| Phase | 内容 | 可独立 merge |
|-------|------|----------|
| **P1: 基础设施组件** | ToastBus + ToastHost + ProgressBus + TopProgressBar + SuspenseFallback + SpinnerButton | ✅ |
| **P2: 两个 hook** | useAsyncAction + useOptimisticUpdate（含单元测试） | ✅ |
| **P3: B 类迁移** | Send / Stop / API 验证 / Toolkit install / Catalog load / Ollama pull / Lazy modal fallback / Attachment resolve | ✅ |
| **P4: A 类迁移** | Chat rename/delete / Tree node rename/delete / Message delete/edit / Toolkit auto-approve toggle | ✅ |
| **P5: 热路径解阻塞** | buildHistoryForModel 增量 / settleStreamingAssistantMessages 去全遍历 / 深拷替换为引用 / attachment structuredClone / "onClick 不 block" 规则 | ✅ |
| **P6: 长尾清理** | LoadingDots 全替换 / alert() 迁 toast / 补齐边角 / docs/conventions/async-actions.md | ✅ |

## P3 — B 类迁移详单

### B1. Send button（`chat_input.js` / `input_action_buttons.js`）

```js
const sendAction = useAsyncAction(
  async (payload) => { await startStreamAndWaitForFirstToken(payload); },
  { label: "发送消息", progressThresholdMs: 300 }
);
<SpinnerButton pending={sendAction.pending} onClick={() => sendAction.run(payload)}>Send</SpinnerButton>
```

`pending` 只持续到**首个 token 到达或错误**，之后 `isStreaming` 接管（按钮切 "Stop"）。

### B2. Stop button

```js
const stopAction = useAsyncAction(
  async () => { await stopStream(); },
  { label: "停止流", pendingDelayMs: 0, progressThresholdMs: 150 }
);
```

Stop 要"点了立刻反馈"：`pendingDelayMs: 0` 让 button 瞬时进 pending；`progressThresholdMs: 150` 让仍超 150ms 的 stop 也显示顶部 bar（P5.2 优化之前的兜底）。

### B3. API Key validate（Settings / model_providers）

```js
const validate = useAsyncAction(
  (key) => api.unchain.validateApiKey(provider, key),
  { label: "验证 API Key", onSuccess: () => toast.success("API Key 有效") }
);
```

### B4. Toolkit install / enable / disable / configure（`toolkit_detail_panel.js`）

每个 action 一个 `useAsyncAction` 实例，label 区分。解决现有"可重复点击"缺陷。

### B5. Toolkit catalog load（`toolkit_installed_page.js`）

替换现有 `useState(loading)` 为 `useAsyncAction` 在 useEffect 中 `run()`；`LoadingDots` 替换为 `ArcSpinner`。

### B6. Ollama model pull（`active_downloads.js`）

保留业务进度 UI，将"开始下载"点击包装 `useAsyncAction`，防重复 + 顶部 progress bar 正确。

### B7. Memory embedding 模型测试按钮

迁 `isLoading` state 到 `useAsyncAction`。

### B8. Lazy modal Suspense fallback（`side_menu.js:43-54` 等处）

```js
<Suspense fallback={<SuspenseFallback />}>
  <ToolkitModal ... />
</Suspense>
```

### B9. Attachment resolve（`use_chat_attachments.js`）

如 resolve 是 async，包装 `useAsyncAction` 防止解析期间再点 Send。

## P4 — A 类迁移详单

### A1. Chat/Tree 节点重命名（`side_menu_components.js` `RenameRow`）

```js
apply({
  optimistic: () => updateTreeNode(id, { name: newName }),
  commit:     () => Promise.resolve(),  // 仅 localStorage；未来若加远端 sync 换 commit
  rollback:   () => updateTreeNode(id, { name: oldName }),
  label: "重命名"
});
```

### A2. Chat/Tree 节点删除（`side_menu_context_menu_items.js`）

```js
const snapshot = getTreeNode(id);
apply({
  optimistic: () => deleteTreeNode(id),
  commit:     () => Promise.resolve(),
  rollback:   () => restoreTreeNode(snapshot),
  label: "删除对话"
});
```

### A3. Message delete / edit（`chat_bubble.js` message action bar）

Delete 和保存 edit 都走 `apply`；edit mode 切换仍然是瞬时纯前端。

### A4. Toolkit auto-approve toggle（`toolkit_detail_panel.js`）

```js
apply({
  optimistic: () => setToolkitAutoApprove(id, true),
  commit:     () => Promise.resolve(),
  rollback:   () => setToolkitAutoApprove(id, false),
  label: "自动批准"
});
```

### A5. Copy button（小加分项）

```js
navigator.clipboard.writeText(text);
toast.success("已复制");
```

不走 optimistic hook，直接 toast。

### 保持现状（C 类）

Model picker、Workspace selector、Edit mode toggle、Tab/collapse 切换、Window controls、Tree 节点选中、New chat 创建。

## P5 — 热路径解阻塞

### P5.1 `buildHistoryForModel` 增量维护

在 `chat_storage_store.js` 的消息写入路径（`setChatMessages` 等）附带维护一个 model-ready snapshot（懒生成 + 标脏位），send 时直接读。消除 send 点击时的同步全量序列化。

**验证**：500-turn chat 的 send 点击到 payload 就绪 <5ms（当前 ~120ms）。

### P5.2 `settleStreamingAssistantMessages` 去全遍历

在 `use_chat_stream.js` 维护 `streamingMessageIds: Set<id>`，settle 时只动索引里的 message，通过 `writeStore` 合并 persist。

**验证**：Stop 点击到 UI 反应 <16ms。

### P5.3 深拷替换

审计剩余 `JSON.parse(JSON.stringify())` 和 `structuredClone`：

- 读路径不 mutate → 引用传递
- 真需深拷 → `structuredClone`
- 目标：profile 无 >16ms 的 clone 栈帧

### P5.4 Attachment structuredClone 优化

Attachment payload 改"一次构造、不 mutate、共享引用"。transform 分片或移 worker。

### P5.5 编码约定 —— 写入 `docs/conventions/async-actions.md`

- onClick 内禁止同步 `JSON.stringify` > 10KB payload
- onClick 内禁止同步遍历 length > 100 的列表
- onClick 内禁止 structuredClone 整 store
- onClick 同步部分必须 <5ms，重活推 `useAsyncAction` 或 microtask

## P6 — 长尾清理

1. **LoadingDots 全替换** 为 `ArcSpinner` 或 `SuspenseFallback`，删 LoadingDots 文件
2. **alert() / window.confirm()** → toast.error / MiniModal 确认框
3. **边角 onClick** 第二遍扫描，凡含 `await` 但未接 useAsyncAction 的接入
4. **文档** `docs/conventions/async-actions.md`；更新 `CLAUDE.md` 的 "High-Risk Pitfalls" 加 "Do NOT put heavy sync work in onClick"

## Testing Strategy

### 单元测试（TDD，每个 hook/组件先写测试）

- **use_async_action.test.js**：pending 切换、错误 toast、重复点击忽略、unmount abort、progressThresholdMs 内完成不触发 progress bar
- **use_optimistic_update.test.js**：optimistic 立即跑、commit 失败触发 rollback + toast、guard=false 跳过 rollback
- **spinner_button.test.js**：pending=true 时 disabled + spinner、min-width 锁尺寸、onClick 返回 Promise 时自动进入 pending
- **toast_bus.test.js / progress_bus.test.js**：subscribe/emit、多订阅、unsubscribe 清理

### 集成测试（Jest + jsdom）

- Chat input send：mock stream，SpinnerButton pending 持续到首个 token
- API key validate：mock 失败，toast.error 出现、button 恢复
- Tree rename rollback：mock commit 失败，name 回到 oldName + toast

### 手动验证（每 Phase 结束前）

- P3：点一遍 Send/Stop/API 验证/Install/Settings modal，截图每个状态
- P4：重命名/删除 chat/message/tree node，拔网线验证 rollback
- P5：DevTools Performance，500-turn chat 里点 Send/Stop，确认无 long task >50ms

### GitNexus 检查（PuPu 项目规范）

改任何已有 symbol 前：`gitnexus_impact({target, direction: "upstream"})`；commit 前：`gitnexus_detect_changes()`。

## Risks & Mitigations

| 风险 | 概率 | 缓解 |
|------|------|------|
| P5.1 增量 history 维护引入 bug（历史错乱）| 中 | Feature flag 切换新旧路径，新路径出错 fallback 到老路径；集成测试覆盖 |
| 乐观更新 rollback race（commit 先失败后用户又改）| 低 | `guard()` 回调 check 当前值是否仍是 optimistic 值 |
| Toast 过多骚扰 | 低 | 同 label 错误 2s 内去重 |
| SpinnerButton min-width 在不同 font 下不稳定 | 低 | mount 时 measure offsetWidth；resize 时重新 measure |
| SSR / jsdom 环境 `AbortController` 兼容性 | 极低 | PuPu 是 Electron，无 SSR；jsdom 已支持 |

## File Manifest

### 新增

- `src/BUILTIN_COMPONENTs/input/spinner_button.js` + `.test.js`
- `src/BUILTIN_COMPONENTs/mini_react/use_async_action.js` + `.test.js`
- `src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.js` + `.test.js`
- `src/BUILTIN_COMPONENTs/toast/toast_host.js` + `.test.js`
- `src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.js` + `.test.js`
- `src/BUILTIN_COMPONENTs/suspense/suspense_fallback.js`
- `src/SERVICEs/toast_bus.js` + `.test.js`
- `src/SERVICEs/toast.js`
- `src/SERVICEs/progress_bus.js` + `.test.js`
- `docs/conventions/async-actions.md`

### 修改（高层次；具体 file:line 在 plan 中）

- `src/PAGEs/chat/chat.js` — 挂 ToastHost / TopProgressBar
- `src/PAGEs/chat/input/input_action_buttons.js` — Send / Stop 用 SpinnerButton
- `src/PAGEs/chat/hooks/use_chat_stream.js` — expose "等首 token" 的 promise；settle 去全遍历；增量 history
- `src/PAGEs/chat/hooks/use_chat_attachments.js` — resolve 包装
- `src/COMPONENTs/side-menu/side_menu.js` — 所有 `<Suspense>` 的 fallback
- `src/COMPONENTs/side-menu/side_menu_components.js` — RenameRow 用乐观更新
- `src/COMPONENTs/side-menu/side_menu_context_menu_items.js` — delete 用乐观更新
- `src/COMPONENTs/side-menu/hooks/use_side_menu_actions.js` — 辅助
- `src/COMPONENTs/chat-bubble/message_action_bar.js` — delete / edit 用乐观更新；copy + toast
- `src/COMPONENTs/settings/model_providers/**` — API key validate
- `src/COMPONENTs/settings/memory/**` — embedding 模型
- `src/COMPONENTs/toolkit/toolkit_detail_panel.js` — install/enable/configure/auto-approve
- `src/COMPONENTs/toolkit/toolkit_installed_page.js` — catalog load
- `src/COMPONENTs/settings/ollama/active_downloads.js` — pull 点击
- `src/BUILTIN_COMPONENTs/chat-bubble/loading_dots.js` — 删除（迁移后）
- `src/BUILTIN_COMPONENTs/mini_react/chat_storage_store.js` — 深拷审计；写路径维护 history snapshot
- `CLAUDE.md` — 新增 pitfall

## Open Questions

无（所有决策已在 brainstorming 中确认）。
