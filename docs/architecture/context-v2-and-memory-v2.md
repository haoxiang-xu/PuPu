# Context V2 & Memory V2

> **当前设计总览。** 本文说明 Context V2 和 Memory V2 在运行时各自负责什么、如何协作，以及哪些边界不可跨越。它不是发布清单或历史验收记录；具体字段和状态机以实现与契约测试为准。

---

## 1. 先分清两个组件

| 组件 | 它解决的问题 | 权威数据 | 不负责什么 |
|---|---|---|---|
| **Context V2** | 为一次模型执行构造可恢复、可审计且受预算约束的上下文 | canonical journal（规范化事件日志）及其受权引用 | 不把 provider 请求体或 renderer 临时 payload 当作真相源 |
| **Memory V2** | 决定 V2 能否进入、维护其 durable runtime，并把聊天、交互、语义事件和恢复生命周期接到 Context V2 | chat admission、durable runtime、interaction / semantic-event records | 不把旧版向量检索当作唯一或必需的执行数据面 |

两者是同一条执行链上的不同职责，不是两套互相竞争的“记忆数据库”：

```text
用户输入 / UI 临时 payload
          │
          ▼
Memory V2 admission ──拒绝或降级──► 旧路径
          │
          ▼
Context V2 canonical journal ──► Context compiler ──► provider wire
          │                                │
          └──── durable events / artifacts / interactions / resume ────┘
```

旧的 embedding / Qdrant 记忆仍是可选的语义检索能力；它可以为对话提供召回，但不拥有 V2 的 canonical journal，也不能取代 V2 对一次执行的身份、预算、工具结果或待处理交互的记录。有关该旧能力的配置与集合结构，见 [Memory System](memory-system.md)。

## 2. Context V2：从输入到 provider 的唯一规范链

Context V2 强制区分下面几种表示。相邻表示可以相互投影，但不能混用或反向作为事实来源。

| 表示 | 作用 | 是否可作为后续恢复的事实 |
|---|---|---|
| UI 消息 / 临时 client payload | 让 renderer 发起一次请求 | 否 |
| canonical journal | 规范化的用户、助手、工具、交互和语义事件；带稳定身份与顺序 | 是 |
| canonical model context | 编译器从 journal、受权引用和任务状态得出的模型语义输入 | 是，可重建 |
| provider wire | 针对 OpenAI、Anthropic、Ollama 等的实际请求格式 | 否，只是一次传输投影 |
| presentation / host event | 用于 UI 展示、状态和诊断的输出 | 否，除非显式被接纳为 journal event |

一次 active 执行遵循此顺序：

1. 为准确的 `owner_chat_id`、session、attempt、provider / model 与上下文预算做 admission；缺少关键身份或能力时，不假装 active。
2. 当前用户输入先进入 canonical journal，历史和可继续的交互从 durable state 读取，而不是从浏览器文本“猜回去”。
3. Context compiler 根据真实请求预算、任务状态和已授权的 artifact / durable reference 生成 canonical model context。
4. 仅在最后一步把该 context 投影成 provider-specific wire；provider 返回的事件、工具结果、artifact 和 terminal 结果再以有类型的语义事件写回。
5. 恢复、取消、继续审批和 terminal identity 都绑定原 execution / attempt lineage，避免一个旧请求接管新请求。

### Context V2 的不变量

- **journal 是可恢复性的真相源。** 不能通过拼接 UI 消息、旧 prompt 或 provider wire 来伪造一次恢复。
- **引用必须受权。** artifact、memory、checkpoint 和内容引用采用 durable URI；未知、过期或不属于当前 scope 的引用不能进入编译结果。
- **预算属于此次调用。** Context V2 使用这次 provider / model 的可用 input budget 和输出预留，而不是全局的、猜测的窗口大小。
- **事件有精确身份。** terminal、工具交互与 semantic event 必须以 operation / attempt / generation 等稳定身份去重和排序。
- **输出模型与传输模型分离。** provider 的媒体格式、参数和协议差异只能出现在 wire projection 边界。

完整的 boundary profile、closed shape 和状态序列见 [Context V2 Boundary Contracts](context-v2-boundary-contracts.md)。

## 3. Memory V2：admission 与 durable runtime

Memory V2 是 Context V2 的主机侧生命周期层。它先为 chat 计算一份 sticky admission，再把同一份身份和决策交给编译、流式执行、语义事件持久化与 explicit resume。这样一次请求不会在中途因配置或 renderer 状态改变而切换数据面。

### 3.1 两个互不替代的控制面

| 控制面 | 可选值 | 含义 |
|---|---|---|
| **Rollout** | `off`、`shadow`、`canary`、`all` | 控制一个请求是否可尝试 V2；最终 admission 会落为 `off`、`shadow` 或 `active`。`shadow` 会构建并持久化 V2 envelope，但不改变模型输入；`active` 由单一 V2 compiler 接管 context reduction。 |
| **Context V2 store owner** | `off`、`pupu_legacy`、`unchain` | 选择谁可以打开 Context V2 SQLite 数据面。它不是流量开关，不能用来把一份数据库同时交给两种 schema。 |

两条控制面必须同时满足条件。即使 rollout 选择了 active，缺少真实 context window、owner chat、attempt、完整 runtime 或 core-suppression 能力，也会有原因地停在 shadow，而不会带着不完整的前提进入 active。

### 3.2 Durable runtime 的职责

`memory_v2_runtime` 延迟创建并根植于 `UNCHAIN_DATA_DIR/memory_v2`。在 active admission 下，adapter 要求 durable kernel runtime 可用，并让 V2 durability 路径独立于 renderer 上的旧版 memory toggle；这避免“用户关掉向量记忆”意外关闭执行持久化。

它负责的不是泛泛地“保存聊天”，而是把以下可验证状态接到同一条 lineage 上：

- 当前请求和历史的 bootstrap；
- chat admission 与 context build 记录；
- semantic event、artifact、checkpoint 与受权引用；
- pending interaction 的 receipt / application，以及 explicit resume；
- 对会话的 rebase、读取和状态投影。

`context_v2.sqlite3` 的 owner marker 会先以只读 schema 证据检查已有数据库。陌生、部分或混合 schema 视为不兼容；系统不会用“顺手迁移”或覆盖的方式让两个 owner 争用同一个文件。

## 4. 典型执行与恢复

```mermaid
sequenceDiagram
    participant UI as Renderer
    participant Host as PuPu host / adapter
    participant MV2 as Memory V2 runtime
    participant CV2 as Context V2 compiler
    participant P as Provider

    UI->>Host: fresh turn (chat, session, attempt)
    Host->>MV2: resolve and persist admission
    MV2-->>Host: off / shadow / active with stable reason
    alt active
        Host->>CV2: append current input; compile canonical context
        CV2->>P: provider-specific wire projection
        P-->>Host: stream / tool / interaction events
        Host->>MV2: persist semantic events and receipts exactly once
    else shadow or off
        Host-->>UI: retain the admitted fallback path and diagnostics
    end
    UI->>Host: explicit resume, if an interaction is pending
    Host->>MV2: resolve durable interaction by original lineage
    MV2-->>Host: resume options or a typed refusal
```

关键点是“显式恢复”而非“重新发一条看起来相似的消息”。sidecar 重启后可以根据 durable identity 读取已有执行和 pending interaction；它不应自动唤醒模型，也不应把 UI 的缓存当作已完成的 receipt。

## 5. 跨边界责任

| 边界 | 设计责任 |
|---|---|
| Renderer → Electron main | renderer 只提供非敏感请求意图；系统能力、secret 和持久化由 preload / main 负责。 |
| Electron main → Flask sidecar | loopback HTTP / SSE、认证、请求和流式事件是显式协议，不共享内存。 |
| Host adapter → Unchain | adapter 绑定 host admission、执行能力、reference authorizer 与 task-state reader；Unchain 不从 renderer 选项取得 active 的内部证明。 |
| Context V2 → provider | canonical context 只在最后投影为 provider wire；不同 provider 的媒体与参数不可回流为 journal truth。 |
| PuPu store ↔ Unchain store | 同一个 Context V2 SQLite 路径一次只能有一个 schema owner。 |

运行时兼容性由实际 import 的 Unchain runtime protocol manifest 决定，而不是 Git SHA、源码路径或环境变量猜测。发布构建若需要证明“已部署的 artifact pair”，还必须让同一份 wheel 与 manifest 贯穿验证；这是 artifact continuity 的要求，不是把普通功能设计或 ticket 关闭变成 release gate。详见 [PuPu / Unchain Protocol Atlas](pupu-unchain-protocols.md)。

## 6. 维护时从哪里开始

| 变更意图 | 主要入口 |
|---|---|
| 修改 rollout、admission、预算、canonical context 或 semantic event | `unchain_runtime/server/memory_v2_context.py` |
| 绑定 PuPu host 能力到 Unchain ContextModule | `unchain_runtime/server/memory_v2_context_adapter.py` |
| 修改 runtime 生命周期或 store proxy | `unchain_runtime/server/memory_v2_runtime.py` |
| 修改 SQLite owner / schema admission | `unchain_runtime/server/memory_v2_store_boundary.py` |
| 修改流式执行或 legacy / durable runtime 选择 | `unchain_runtime/server/unchain_adapter.py` |
| 修改恢复交互的 host 规则 | `unchain_runtime/server/durable_interaction_host.py` |
| 修改 renderer 可见的 capability 投影 | `electron/main/services/unchain/service.js` 与 preload / shared channel 的对偶实现 |

涉及 renderer、Electron、sidecar、Unchain、provider wire 或持久化的改动都是跨边界改动：先更新对应 `BC-*` / `SEQ-*` / `AC-*` 证据，再验证两端实际运行的组合。不要因这一要求绕过 admission、放宽 closed shape，或把旧版 memory 设置直接当作 active V2 的开关。

## 7. 相关文档

- [Context V2 Boundary Contracts](context-v2-boundary-contracts.md) — 规范表示、边界 profile 与状态序列。
- [PuPu / Unchain Protocol Atlas](pupu-unchain-protocols.md) — 跨进程/运行时协议与 artifact compatibility 的登记表。
- [Request Flow & Streaming](request-flow-and-streaming.md) — chat request、SSE、工具确认与前端消费路径。
- [Memory System](memory-system.md) — 旧版 embedding / Qdrant 语义检索的独立说明。
- [Memory V2 rollout and legacy retirement roadmap](memory-v2-rollout-and-legacy-retirement-roadmap.md) — 历史 rollout / retirement 计划与验收材料。
