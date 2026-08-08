---
name: contract-bubble-streaming
description: What I actually hand chat-bubble — message.meta.bundle + traceFrames, NOT a streaming_message_store schema; the frame vocabulary belongs to shared-arteries, not to me
metadata:
  type: project
---

**方向不变，标的物变了。** 我产生并驱动流，`code-owner-chat-bubble` 只消费它来渲染，方向不可逆。**但「契约」这个词过去挂错了文件，我自己挂错过两次，还把错的说法带进了法庭。**

## 2026-08-07 更正（法庭 `0000-0002-2026-0807` S-0012，实读全文核实）

**`streaming_message_store.js` 不是与 bubble 的 schema，它承载不了任何结构化数据。** 全文 224 行，存储的唯一值形状是 `{version, textLength, chunks: string[], updatedAt}`，按 `(chatId, messageId)` 键控，API 全是 `begin/append/replace/getText/materializeMessages/clear/subscribe`。**它是助手文本的环形缓冲。** 说「让它承载新数据」不是 schema 扩展，是类型错误。

**`src/SERVICEs/runtime_events_v4/` 目录不存在**（旧记忆写它「in flight」，实际迁移落进了 `src/SERVICEs/runtime_events/`；`codex/runtime-events-v4` 分支还在但已无对应目录）。`runtime_events_v4` 这个字面量全仓只剩 2 处：`electron/main/services/unchain/service.js:930`（**capability 名，不是帧信封名**）与我的 `use_chat_stream.runtime_event_batching.test.js:24` 的负向断言 —— 后者与 `not.toMatch(/startStreamV3/)` 同组，意思是 **hook 里不许残留 v3 回退、不许自己拿 capability 字符串判版本**，不是「渲染层不得知晓 v4 协议」（我主动选 v4：`use_chat_stream.js:5860-5873` → `api.unchain.startStreamV4`）。

## 我实际交给 bubble 的两样东西

1. **`message.meta.bundle`** —— 三条入口，不是「终局帧独家」：
   - `done.bundle`（SSE `done` 信封）→ `use_chat_stream.js:7538-7541` → `:7563-7565`。**主路径**
   - `adaptTree(activityTree).bundle` ← `activity_tree.js:491` `completionBundle = payload.usage` ← unchain `run.completed`。**仅当 `done.bundle` 不是对象时兜底**（`:5766-5771`）
   - `stream_replay_projector` 的 `projection.bundle` → `applyLatestProjection`（`:9438-9443` → `:9487-9491`）。附着流 / durable resume
   > **坑**：后两条源自 unchain kernel 自己的 bundle，**与 PuPu `_build_bundle_from_result` 产的那个同名不同源**。今天无害（kernel 那个不含 `memory_v2`），但它们在 `message.meta.bundle` 这一个字段上竞争写入，而我的逻辑是「A 缺席才用 B」**不是合并**。
2. **`traceFrames` / `subagentFrames`** —— 由 runtime event 归约产出。

## 帧词汇表不是我的，是 `code-owner-shared-arteries` 的

我的 `onRuntimeEvent`（`use_chat_stream.js:5718-5738`）**全程不读 `runtimeEvent.type`**，只做 run 判定、seq 推进、队列受理确认、入 batcher。过滤在下游。详见 [[runtime-event-vocabulary-closed-set]]。

**净结果：runtime event 总线上新增任何类型，我这边改动 0 行。** 唯一属于我的成本是 `RUNTIME_EVENT_BATCH_FLUSH_MS = 64` 的批窗频率预算。

**Why:** 2026-08 之前我一直以为「流的 schema」是我和 bubble 之间的双边契约，据此在 `0000-0001-2026-0807#S-0006` 主张「让 schema 承载新数据是跨面契约变更、强制 Full track」。那句话催生了整个 Q1-前段，而它点名的两个实体都不是承载体。**代价是两个 case 里两名 owner 各自花了一轮取证才把矛盾解开。**

**How to apply:** 再被问「流能不能承载 X」时，**先问是哪条通道**：往 `bundle` 里加键（后端 allowlist 已放行 `memory_v2`，presenter 白名单是唯一门）→ 跨 2 名 owner、我 0 行；新增 runtime event 类型 → 跨 5 名 owner、含跨仓协议与两道静默门。**成本差一个数量级，别再一律答「跨面契约变更」。** 相关：[[runtime-event-vocabulary-closed-set]] · [[memory-v2-wire-path]] · [[team_roster]]
