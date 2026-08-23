---
name: unchain-drop-silently-whitelists
description: unchain 多处用白名单构造 dict，未列出的字段被静默丢弃——新增透传字段必须配"丢弃即失败"契约测试（2026-08-04 已成定调会条款）
metadata:
  type: feedback
---

在 unchain 里新增任何"应当端到端透传"的字段时，必须同时写一条断言该字段抵达终点的契约测试；不要假设 dict 会原样流过。2026-08-04 定调会已把这条写进 hosts.* 契约条款。

**Why:** 这个仓有一类反复出现的静默丢弃病（历史上的 kwarg 漂移、custom provider 的 C8 白名单外键丢弃都是同一类）。核实过的白名单构造点（2026-08-03，unchain dev@a54050d）：`src/unchain/events/normalizer.py` 的 artifact payload 组装只 copy 固定 key 集合；`src/unchain/tools/registry.py` 的 toolkit summary 逐字段显式构造，manifest 里的未知顶层 section 到不了消费方。两处都不报错、不告警，字段就是没了。相对地 `RuntimeEvent.metadata` 是自由 dict 且深拷贝往返 —— 这正是 [[unchain-externalization-charter]] 选它做 host hint 通道的原因。

**How to apply:** 设计 host 扩展 / 新 manifest 段 / 新事件附加信息时优先挂 `metadata`；若必须进白名单结构，改解析处 + 改 summary 处 + 一条端到端测试，三件一起做，缺一视为没做。
