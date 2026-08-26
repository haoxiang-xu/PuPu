---
name: stream-relay-filtering-granularity
description: 流中继的过滤发生在「IPC 频道」粒度而不是「帧」粒度 —— 未知 data.type 完全透传，未知 envelope.event 名静默丢弃且零计数；main 中继一道过滤都没有
metadata:
  type: project
---

问「Electron 会不会丢掉后端新增的帧」时，**必须先问是哪个粒度** —— 三个粒度答案不同，混问必答错。

| 粒度 | 机制 | 未知者的命运 | 有无反馈 |
|---|---|---|---|
| **IPC 频道** | `electron/preload/channels.js` 的 `PRELOAD_EVENT_CHANNELS`（冻结 8 项） | **白名单。** 所有流帧只从 `UNCHAIN.STREAM_EVENT` 一个洞过 | — |
| **`envelope.event`（信封名）** | preload V4 三分支 / V2 三分支，**无 else、无 default** | **静默丢弃** | **零。零计数、零日志、零 diagnostic** |
| **`data.type`（帧类型）** | **V4 一次都不读**；V2 读，但已 **无条件先调** `onFrame(data)` | **不丢弃，原样透传** | — |

**main 中继（`service.js` 的 `streamMisoSseToRenderer`）一道过滤都没有。** 对每个 SSE 块只做「`parseSseBlock` → `parseSsePayload`(JSON.parse) → 无条件 `emitMisoStreamEvent`」。唯一读 `payload?.type` 的地方是 **终止判定**（决定什么时候停止读 SSE），被判终止的那一帧 **已经先转发出去了**。**V2 与 V4 共用这一段**，`startMisoStreamV2` / `startMisoStreamV4` 只差一个 endpoint。

**推论 —— 后端加东西的成本表**（2026-08-07 实测，两条独立取证：本 owner 全文读 + `code-owner-chat-core` 在 `0000-0002-2026-0807#E-0028` 独立读 preload）：

- 往 `done.bundle` 加键 → **Electron 0 行**。`bundle` 这个词在 `electron/preload/` 命中 **0**、在 `service.js` 命中 **2 且全是打包 runtime 的注释**。**本层不知道 `done.bundle` 存在，因此结构上不可能裁剪/封顶/改形它**
- 在既有 `runtime_event` 信封内加新 `data.type` → **Electron 0 行**
- **新增一个 SSE `event:` 名 → preload 必改一处，不改就是静默丢弃**，而且被它吃掉的帧连 `src/SERVICEs/runtime_events/event_store.js` 的 `unknownEvents` 都进不去 —— **它是全链路最早的一道静默门**

**两条今天不可达、但「让主进程参与拼装载荷」会打开的静默失败模式**：`sendMisoStreamEnvelope` 把 `webContents.send` 包在裸 `try/catch` 里、失败只 `return false` 并把 renderer 标为脱离（**结构化克隆失败 = 整条信封无声消失**）；`measureMisoStreamReplayEnvelope` 对 `JSON.stringify` 抛错的处理是返回 `maxBytes+1`（= 立刻逐出 replay）。今天来的都是 `JSON.parse` 的产物、天然可克隆。

**replay buffer 的三个上限只作用在 durable resume / `attachStreamV4` 上，不截断 live 路径**：100,000 事件 / 32 MB / 30 分钟 TTL，均可由 `createUnchainService({streamReplayConfig})` 覆盖；`trimMisoStreamReplay` 从 head 逐出，`done` 在 tail。

**Why:** 2026-08-07 案 `0000-0002-2026-0807` 用整整两批人力在问「流承不承载 Memory V2 帧」，而立案原文点的两个实体（`streaming_message_store` / `runtime_events_v4`）**都不是承载体** —— 前者是文本环形缓冲，后者是 capability 名。真正的答案要按上面三个粒度分开答。

**How to apply:** 有人问「新帧会不会被 Electron 丢」，先确认他说的是 `data.type` 还是新 `event:` 名 —— 前者答「不会，本层不读它」，后者答「会，且零反馈，我这边必须同一次改」。**永远不要笼统答「Electron 是透传的」**，那句话只在 `data.type` 这一个粒度上成立。相关：[[runtime-contract-capability-gate]]、[[context-v2-p0-contract]]。
