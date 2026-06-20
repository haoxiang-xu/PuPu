---
name: adr-v4-doc-and-cross-repo-contract
description: ADR — RuntimeEvents V4 文档化裁决（doc sync 2026-06-19）：建 runtime-events-v4.md 双签、v3 文件不重命名、events_v4 跨仓契约另立工作项
metadata:
  type: project
---

# ADR: RuntimeEvents V4 文档化与跨仓契约（doc sync 收口 2026-06-19）

**Context:** 全员 doc sync diff analysis 暴露 V4 流在两侧 doc 全缺。代码现状已核实(2026-06-19):
- PuPu 侧 V4 全套已落地:`api.unchain.js` 有 `startStreamV4`(1576)/`isRuntimeEventStreamV4Available`(540);`src/SERVICEs/runtime_events_v4/` 服务层存在;`STREAM_START_V4: "unchain:stream:start-v4"` 在 shared/channels.js:91。
- 流优先级实际 V4>V3>V2(doc 旧写 V3 回退 V2)。
- relay 侧 V4 envelope 与 V3 同构(复用 registerMisoStreamV3Listener),唯一差异 renderer 端 `batchRuntimeEvents:true`。
- 真相源 schema 在 unchain core 仓 `events_v4/types.py` `RUNTIME_EVENT_TYPES_V4`(13 类);core 仓**无 unchain_runtime/ 目录**,适配层唯一真副本是 PuPu 的 server/。
- core 已落但 PuPu runtime 0 emit/读的字段:`channel_id`/`team_id`/`plan_id` —— doc 不许写"已启用"。

**Decision:**
1. 建 `docs/architecture/runtime-events-v4.md`,主笔 = electron dev(链路/envelope/relay 侧最熟),RuntimeEvent payload schema 章节由 chat-bubble dev + chat-core dev 共同确认(他们是 V4 帧的渲染/编排消费方)。
2. `runtime-events-v3.md` **不重命名**(electron 倾向,采纳)——保文件名防断链,内容里标注 v3 为历史/回退路径,新增交叉链接指向 v4 doc。
3. unchain core 仓 `events_v4/types.py` 的 API 文档由 backend(擎)补,**契约级须双签**(擎 + chat-bubble/chat-core 任一渲染消费方),不单方落。
4. `channel_id`/`team_id`/`plan_id` 在两侧 doc 一律标注"core 已定义、PuPu runtime 暂未启用(0 emit/read)"。

**Consequences:**
- V4 是 cross-surface 契约,一旦文档化为"权威 schema",后续改 event 类型即跨 PuPu+core+bubble 三方波及 —— 这是单向门倾向,故要求双签固化。
- 跨仓契约文档(core events_v4 API)**不在本轮 doc sync 内**,另立工作项,因需双仓协同+双签,本轮零落盘窗口装不下。
- 见 [[boundary-pupu-server-vs-unchain]](events_v4 跨 repo 契约、core 无 runtime 目录)。

**How to apply:** 任何动 RuntimeEvent 类型/字段的改动,先确认是否触达 v4 契约;触达即要求 backend+渲染消费方双签,不接受单边 PR。
