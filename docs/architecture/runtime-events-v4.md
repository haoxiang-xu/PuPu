# Runtime Events V4 — PuPu 侧链路

> 状态: **当前默认流协议**(优先级 `V4 > V3 > V2`)。
> 本文档主笔 PuPu 侧(envelope / relay / 服务层)。RuntimeEvent **payload schema** 章节以 unchain core 为真相源,待双签确认(见 §7)。
> 历史/回退路径见 [runtime-events-v3.md](./runtime-events-v3.md)(v3 不重命名、不下线,保留为回退路径)。

---

## 1. 状态与定位

V4 是 PuPu 当前的**默认运行时事件流协议**。`use_chat_stream.js` 按 `V4 > V3 > V2` 顺序择优:只要 `isRuntimeEventStreamV4Enabled()` 为真(当前硬编码 `true`)且 bridge 暴露了 `startStreamV4`,即走 V4;否则降级 V3,再降级 V2。

V4 与 V3 的关系是 **envelope 同构、差异在 renderer**:

| 维度 | V3 | V4 |
|------|----|----|
| 传输通道 | `STREAM_EVENT` | `STREAM_EVENT`(同) |
| 帧判定 | `envelope.event === "runtime_event"` | 同 |
| 启动通道 | `STREAM_START_V3` | `STREAM_START_V4` |
| preload listener | `registerMisoStreamV3Listener` | `registerMisoStreamV4Listener`(**直接委托 V3**) |
| renderer flush | 逐帧 `reduce` | **批量 flush**(`batchRuntimeEvents: true`,`batchFlushMs ≈ 64ms`) |
| 事件 schema | v3 | v4(`schema_version: "v4"`) |
| 新增产物 | — | `artifact.*` 事件 + run artifact summary |

一句话:**V4 在传输层是 V3 的同构复用,真正的增量在 renderer 服务层(批量 flush + v4 schema 校验 + artifact 汇总)与 core 事件契约(`step.*` / `interaction.*` / `artifact.*`)。**

---

## 2. 事件类型表

> **Source of truth: `unchain/src/unchain/events_v4/types.py` @ `d1e8fe1`**
> (commit `d1e8fe1` — "feat: Introduce Workspace Change Tracking and Artifacts";`RUNTIME_EVENT_TYPES_V4` 为权威清单。本表若与该文件冲突,以该文件为准。)

`RUNTIME_EVENT_TYPES_V4` 共 **13 类**:

| # | 事件类型 | 含义 | 迁移/来源 |
|---|----------|------|-----------|
| 1 | `session.started` | 会话级开始 | — |
| 2 | `run.started` | 一次 run 开始 | — |
| 3 | `run.completed` | run 正常完成 | — |
| 4 | `run.failed` | run 失败终止 | — |
| 5 | `turn.started` | 单轮开始 | — |
| 6 | `turn.completed` | 单轮结束 | — |
| 7 | `step.started` | 步骤开始(模型/工具步) | **取代旧 `model.*`** |
| 8 | `step.delta` | 步骤增量(token / 中间产出) | **取代旧 `model.*`** |
| 9 | `step.completed` | 步骤结束 | **取代旧 `model.*`** |
| 10 | `interaction.requested` | 请求用户交互(确认/输入) | **取代旧 `input.*`** |
| 11 | `interaction.resolved` | 交互被解决 | **取代旧 `input.*`** |
| 12 | `artifact.created` | 产物创建 | **V4 新增** |
| 13 | `artifact.updated` | 产物更新 | **V4 新增** |

**迁移说明:**
- `model.*` → `step.*`(`step.started` / `step.delta` / `step.completed`)。
- `input.*` → `interaction.*`(`interaction.requested` / `interaction.resolved`)。
- `artifact.*` 为 V4 全新增,伴随 core 的 Workspace Change Tracking 引入(见上文 commit subject)。

> renderer 侧 `activity_tree.js` 会把 v4 的 `step.*` / `interaction.*` 事件**降解为 legacy frame effects** 复用 V3 的 TraceChain 渲染(例如 `interaction.requested` 经 `interactionRequestedToLegacy` 读 `links.tool_call_id` / `links.interaction_id` 映射回 v3 的 tool_call 帧)。这是 V4 能复用 V3 渲染管线的关键。

---

## 3. 链路图

```
Flask  /chat/stream/v4  (SSE: event: runtime_event)
  │
  ▼  electron/main/services/unchain/service.js
     ├─ UNCHAIN_STREAM_V4_ENDPOINT = "/chat/stream/v4"
     ├─ parseSseBlock()  解析 SSE 块 → { eventName, dataText }
     └─ emitMisoStreamEvent(webContentsId, requestId, eventName, payload)
            target.send(CHANNELS.UNCHAIN.STREAM_EVENT, { requestId, event, data })
  │
  ▼  IPC: STREAM_EVENT ("unchain:stream:event")
  │
  ▼  electron/preload/stream/unchain_stream_client.js
     ├─ startStreamV4(payload, handlers)  ← bridge: window.unchainAPI.startStreamV4
     │     (启动通道 STREAM_START_V4 = "unchain:stream:start-v4")
     └─ registerMisoStreamV4Listener(requestId, handlers)
            └─ 直接委托 registerMisoStreamV3Listener
               监听 STREAM_EVENT,envelope.event === "runtime_event"
               → handlers.onRuntimeEvent(data)
  │
  ▼  src/PAGEs/chat/hooks/use_chat_stream.js
     startRuntimeEventStream({
       createStore: createRuntimeEventStoreV4,
       reduceTree:  reduceActivityTreeV4,
       adaptTree:   adaptActivityTreeToTraceChainV4,
       startStream: api.unchain.startStreamV4,
       batchRuntimeEvents: true,
       batchFlushMs: RUNTIME_EVENT_BATCH_FLUSH_MS,  // ≈ 64ms
     })
  │
  ▼  src/SERVICEs/runtime_events_v4/
     event_store.js          → 校验 schema_version:"v4" / dedupe by event_id / sort by seq
       (批量帧经 batcher 每 ~64ms flush 一次后 append)
     activity_tree.js        → reduceActivityTreeV4: 事件快照 → 状态树(+ run artifact summary)
     trace_chain_adapter.js  → adaptActivityTreeToTraceChainV4: 状态树 → TraceChain props
  │
  ▼  TraceChain 渲染(chat-bubble 渲染端)
```

---

## 4. Envelope 与传输

V4 帧的传输层与 V3 **完全同构**:

- 所有 SSE 帧(无论 V1/V2/V3/V4)都走**同一条** IPC 通道 `STREAM_EVENT`(`"unchain:stream:event"`)。
- main 进程 `emitMisoStreamEvent` 发送的 envelope 形状固定为:

  ```
  { requestId, event, data }
  ```

  其中 `event` 取自 SSE 的 `event:` 行(对运行时事件即 `"runtime_event"`),`data` 为 `data:` 行解析出的 payload。
- preload listener 以 `envelope.event === "runtime_event"` 判定运行时事件,派发到 `handlers.onRuntimeEvent(data)`。
- V4 与 V3 的**启动通道**不同(`STREAM_START_V4` vs `STREAM_START_V3`),但**回流通道相同**(都是 `STREAM_EVENT`)。版本 demux 发生在 preload listener / renderer,而非通道层面。

> **契约要点(IPC artery,co-owned by electron-dev + CTO):** `STREAM_EVENT` 是所有流版本共享的回流动脉。任何对 envelope 形状(`requestId` / `event` / `data` 三字段)的改动都是跨面契约变更,须走 CTO 影响分析 + 同步会,并保持 `channels.js` 与 `.js`/`.cjs` 测试同步。

---

## 5. RuntimeEventLinksV4 — 契约已留位、行为未启用

core 的 `events_v4/types.py` 定义了 `RuntimeEventLinksV4`(envelope 级关联字段,全部默认 `None`):

```python
@dataclass(frozen=True)
class RuntimeEventLinksV4:
    parent_run_id: str | None = None
    parent_event_id: str | None = None
    caused_by_event_id: str | None = None
    step_id: str | None = None
    tool_call_id: str | None = None
    interaction_id: str | None = None
    artifact_id: str | None = None
    workspace_change_set_id: str | None = None
    plan_id: str | None = None
    channel_id: str | None = None
    team_id: str | None = None
```

PuPu 侧现状(以 `src/SERVICEs/runtime_events_v4/` 为准):

- 事件对象上有通用 `links` 字段:`event_store.js` 保留 `links: isObject(event.links) ? event.links : {}`;`activity_tree.js` 用 `linksOf(event)` 读取。
- **实际被读取的 link 字段只有** `tool_call_id` 与 `interaction_id`(用于把 v4 interaction 事件映射回 v3 tool_call 帧)。
- `channel_id` / `team_id`(以及大部分 link 字段)在 PuPu 侧 **0 emit、0 读取** —— 纯死脚手架(reserved; A2A scaffolding);`plan_id` 仅在 `artifact.created` / `artifact.updated` 两类事件由 core normalizer 在上游 emitter 提供时填充,其余事件恒 `null`。PuPu 也**没有** `RuntimeEventLinksV4` 这个符号 —— 这些字段只存在于 core 的 dataclass 中。

> ⚠️ **`channel_id` / `team_id`:契约已在 core 留位,但 runtime 端 0 emit / PuPu 端 0 读 —— 纯死脚手架(A2A 预留)。`plan_id`:仅 artifact 事件上窄接线,其余恒 null。** 这与 v3 文档中提到的「未来 permission / sandbox / channel / team / plan 能力」一脉相承:**字段先落契约位,功能后启用**。在这些链路接入前,渲染端不应假设其有值。

---

## 6. V4 服务层(`src/SERVICEs/runtime_events_v4/`)

| 文件 | 主要导出 | 职责 |
|------|----------|------|
| `event_store.js` | `createRuntimeEventStoreV4()` / `isRuntimeEventV4()` / `appendRuntimeEventToStoreStateV4()` / `RUNTIME_EVENT_TYPES_V4` | 校验 v4 事件(`schema_version:"v4"`)、按 `event_id` 去重、按 `seq` 排序、记录诊断 |
| `activity_tree.js` | `reduceActivityTreeV4()` / `createInitialActivityTreeStateV4()` | 将 v4 事件快照 reduce 成状态树;把 legacy step/interaction 类型转成 frame effects;构建 run artifact summary |
| `trace_chain_adapter.js` | `adaptActivityTreeToTraceChainV4()` | 把 ActivityTree 状态克隆成 TraceChain props(在 V3 adapter 基础上扩展 `runArtifactSummary`) |
| `runtime_event_stream_gate.js` | `isRuntimeEventStreamV4Enabled()` | V4 默认启用开关,当前恒返回 `true` |

renderer 批量 flush:V4 在 `startRuntimeEventStream` 传入 `batchRuntimeEvents: true` + `batchFlushMs ≈ 64`,内部 batcher 把事件入队、每 ~64ms 合并 flush 一次后再 append 进 store —— 这是 V4 相对 V3 在 renderer 的核心差异(降低高频 `step.delta` 的渲染抖动)。

---

## 7. RuntimeEvent payload schema(待双签)

> ⚠️ **本章 payload 细节待 chat-bubble(渲染端)+ 擎(core 契约)双签确认。**
> 本文已确定的是 **envelope 层**(§4)与 **links 留位**(§5);**各事件类型的 payload 内部字段** schema 占位待补。

**已知(envelope 层,本面权威):**

- envelope 形状:`{ requestId, event, data }`(§4)。
- `event === "runtime_event"` 判定运行时事件。
- `data`(即 RuntimeEvent)在 PuPu 侧被 `event_store.js` 校验:必须 `schema_version: "v4"`,带 `event_id`(去重键)、`seq`(排序键)、`type`(∈ `RUNTIME_EVENT_TYPES_V4`)、可选 `links`(object)、可选 `payload`(object)。
- core `RuntimeEventV4.payload` 当前定义为 `dict[str, Any] | None` —— **core 不约束 payload 内部结构**,故各事件的 payload 字段需由渲染端与 core 共同钉死。

**占位待补(双签后填写):** 下列各事件的 `payload` 字段表待定。

| 事件类型 | payload 字段 | 状态 |
|----------|--------------|------|
| `session.started` | _TBD_ | ⬜ 待双签 |
| `run.started` / `run.completed` / `run.failed` | _TBD_ | ⬜ 待双签 |
| `turn.started` / `turn.completed` | _TBD_ | ⬜ 待双签 |
| `step.started` / `step.delta` / `step.completed` | _TBD_ | ⬜ 待双签 |
| `interaction.requested` / `interaction.resolved` | _TBD_ | ⬜ 待双签 |
| `artifact.created` / `artifact.updated` | _TBD_ | ⬜ 待双签 |

**签署人:**
- **擎(unchain core)** —— payload 字段以 `events_v4/types.py` 及其衍生 schema 为真相源。
- **chat-bubble(渲染端)** —— 确认 TraceChain 渲染对各 payload 字段的实际消费。

---

## 附录:关键符号速查

| 层 | 符号 | 位置 |
|----|------|------|
| 通道 | `STREAM_START_V4 = "unchain:stream:start-v4"` | `electron/shared/channels.js` |
| 通道 | `STREAM_EVENT = "unchain:stream:event"`(共享回流) | `electron/shared/channels.js` |
| relay | `UNCHAIN_STREAM_V4_ENDPOINT = "/chat/stream/v4"` / `emitMisoStreamEvent` | `electron/main/services/unchain/service.js` |
| preload | `startStreamV4` / `registerMisoStreamV4Listener`(委托 V3) | `electron/preload/stream/unchain_stream_client.js` |
| renderer | `createRuntimeEventStoreV4` / `reduceActivityTreeV4` / `adaptActivityTreeToTraceChainV4` / `isRuntimeEventStreamV4Enabled` | `src/SERVICEs/runtime_events_v4/` |
| renderer | V4>V3>V2 择优 + `batchRuntimeEvents:true` | `src/PAGEs/chat/hooks/use_chat_stream.js` |
| core 真相源 | `RUNTIME_EVENT_TYPES_V4` / `RuntimeEventLinksV4` / `RuntimeEventV4` | `unchain/src/unchain/events_v4/types.py` @ `d1e8fe1` |
