---
name: memory-v2-read-plane-consumers
description: chat-bubble 的三个 Context V2 读消费者——ownerChatId 来自 StreamingMessageStoreContext 故对 character-session-id 多态免疫但不可被 Inspector 复用；错误码处理是六站点四纪律、两个自造码、两处与服务端字面碰撞
metadata:
  type: project
---

2026-08-08 于 PuPu `b2385d5d` 逐文件核实（`0000-0008-2026-0808` 庭审取证，代码 + 测试断言 + 实跑 4 suite/23 test 三路独立佐证）。三个消费者：`memory_v2_journal_reload.js` · `memory_v2_pending_reviews.js` · `memory_v2_trace_audit.js`。

**1. `ownerChatId` 的来源链，以及它为什么不能被别人复用。**

```
chat_storage 的 activeChatId
  → use_chat_session_state.js:202/237/412   activeChatId(state) + activeChatIdRef
  → chat.js:1130                            <ChatMessages chatId={session.activeChatId}>   ← 全仓唯一挂载点
  → chat_messages.js:73-81, :212            StreamingMessageStoreContext.Provider          ← 全仓唯一 provider
  → trace_chain.js:647                      const { chatId } = useStreamingMessageStoreContext()
  → trace_chain.js:1954 / :1984             ownerChatId={chatId}                           ← 本面唯一赋值来源
```

- **与生产写侧同一个值**：`use_chat_stream.js:11874/11985` 的 `ownerChatId` 也是 `activeChatId`（ref 副本）。不是巧合，是同一 store 字段。
- **对 E-0016 那个多态 id 免疫**：`buildCharacterMemorySessionId`（→ `character_<x>__dm__<y>`，语法合法但语义错误，能穿过 main 的 `CONTEXT_V2_OWNER_ID_PATTERN`）在全 `src/` **只有一个消费者** `side_menu_context_menu_items.js:198`，那是 Inspector 的右键路径。character chat 在 store 里是一 **种** chat，`characterId` 是另一个字段，`id` 仍是普通 chat id。
- **但正因如此，这条路径 Inspector 复用不了**：provider 的值恒为 **活跃会话**；Inspector 的 side-menu 入口是对任意（可能非活跃）节点右键，没有 context 覆盖。**"chat-bubble 已经拿得到，照做就行" 是错的推论**——一个法庭在此翻过车。处方仍是挂载点显式传参。
- **fail-closed 与全链传递被测试锁住**：`trace_chain.memory_v2.test.js:50-71` 自搭 provider，`:196…:690` 逐次断言 bridge 收到 `ownerChatId`，`:229-240` 断言 `chatId:""` 时五个方法一个都不调。**别破坏这条 prop 契约**——今天对"静默错主"的免疫只来自它。

**2. 错误码处理：六个站点、四种纪律、两个自造码、两处碰撞。**

| 站点 | 纪律 |
|---|---|
| `journal_reload.js:274` | `parseContextV2ErrorCode(e) \|\| "context_v2_journal_unavailable"` ← **服务端零出处** |
| `journal_reload.js:294` · `:521` | 硬编码 `"context_v2_unavailable"` ← 与 sidecar 11 点 + facade `:69-75` **三方碰撞** |
| `journal_reload.js:391` | 硬编码 `"context_v2_invalid_cursor"`（客户端自判）← 与 `memory_v2_store.py:3604` **字面碰撞、条件不同** |
| `pending_reviews.js:179-186`（2 catch 用） | `code \|\| "context_v2_request_failed"` ← **服务端零出处** |
| `trace_audit.js:120-129` | **不解析码**，`error.message.slice(0,1000)` 直接上屏 |
| `pending_reviews.js:397-407` | **不解析码**，`boundedText(error?.message,700)` 直接上屏 |

后果：**`context_v2_store_disabled` 在整个 `src/` 出现 0 次**——"V2 未启用"这一态到得了渲染层但没人看，在本面被渲染成红色 `role="alert"` 报错块（`pending_reviews.js:1027-1044`）。唯一的启用态门 `isAvailable()`（4 处）是 **preload 存在性探针**，`store_owner=off` 时照样返 true。无码出口（main 的 `ensureMisoReady` 抛自由格式串）会把内部服务代号原文 `Miso service is not ready (…)` 渲染进 chat bubble。

**3. 三重门：这三个消费者不是通用 V2 浏览器。**
`chat_bubble.js:107-108` 要求 `isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2)`（**必须有已完成回合的 bundle**）→ `trace_chain.js:1936` `if (memoryV2Audit)` → `:1950 unmountDetailsWhenClosed: true`（折叠即卸载，issue #168 B 阶段）。**净效果：V2 关着时它们一次也不挂载，所以"chat-bubble 没炸"证明不了别的面不会炸。** 也是"V2 读平面零轮询"的真实成因（是结构，不是纪律）。
封顶先例在 `journal_reload.js:6-8`（`PAGE_SIZE=500`/`MAX_PAGES=20`/`MAX_EVENTS=10000`）+ `:257 slice(-128)` + `:480 slice(0,512)`——全仓 V2 读方法里只有本面有上界，`getTree` 无任何分页参数。

**Why:** 这三条是本面在 Memory V2 读平面上的全部真实处境。不知道 1 就会把本面当成别人可以接线的样板（已发生）；不知道 2 就会以为码处理是封闭的（它不是，而且是本面自己在造假码）；不知道 3 就会拿本面的绿测试与"没出过事"去论证别处的可行性。

**How to apply:** 动三个文件任何一个、或被问到"V2 在渲染层能不能判态"之前先看这条。改错误处理必须六处一起改并先过 `parseContextV2ErrorCode`（facade A4 的加强）。**不得再自造服务端不存在的码**——新码按单向契约向产帧端提议。配合 [[memory-v2-trace-contract]]（载荷形状/绿测试陷阱）与 [[trace-status-vocabulary-collision]]（三套 status 词汇）一起读。
