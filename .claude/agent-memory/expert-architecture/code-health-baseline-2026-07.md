---
name: code-health-baseline-2026-07
description: 2026-07-24 全库架构健康评估基线:三大巨物实测数据、refactor 优先级定案、显式"不动"名单、GitNexus 动态 import 盲区
metadata:
  type: project
---

# 2026-07-24 全库健康评估基线(CEO 触发,0.1.9 收敛期)

**Why:** CEO 要求全库评估;本次按 2026-07-13 常设豁免令推理留 Fable 5,未走 Codex。GitNexus 索引先重建(此前 stale)。

## 实测基线(与旧认知的偏差)
- `use_chat_stream.js` = **12,174 行**(CEO/CLAUDE.md 记忆中的 ~1900 行严重过时):32 参数、81 useCallback、43 useRef、25 键返回面;90 天 churn 27 次。卫星提取模式已存在(persister/batcher/outbox/interject/durable_recovery 等 9+ 模块含测试),但主 hook 仍持续吸积。
- `unchain_adapter.py` = **7,264 行、182 个顶层 def/class**,churn 33 次(全库第一)。可分簇:toolkit catalog/icon(~1540-3016,约1500行)、recipe graph 编译(~3975-5200)、system prompt v2(~3046-3227)、capability catalog、核心流式(stream_chat_events 6372 起)。
- `routes.py` 已拆完(136 行 shim + 13 个 route_*.py)——"55KB routes.py"是旧状态,勿再立项。
- `electron/main/services/unchain/service.js` = 4,052 行,单 createUnchainService 工厂内 ~135 个闭包。

## 定案(优先级)
1. use_chat_stream 分解计划(0.1.9 后第一批,可逆卫星提取,沿既有 pattern)
2. unchain_adapter 拆分:先 toolkit catalog(耦合最低)→ recipe graph → prompt 组装;llm-expert 持 eval 基线保模型可见行为不变
3. electron unchain/service.js 工厂拆分(触发条件:下次大动流式协议时顺手做)
4. api.unchain.js 注入管线:**等 settings→SQLite Phase 1B 一起做**(injector 内嵌 localStorage 读取,先拆会白做)
5. 增长闸门:发布后立规——chat 新特性必须落卫星模块,主 hook 净行数不增(ratchet)

## 显式"不动"名单
chat_storage_store(V3 刚落地)、BUILTIN 大件(explorer/select/slider,与 mini_ui 同源,拆了会漂移)、trace_chain+activity_tree(单一职责渲染器)、memory_factory/durable_interaction_host/mcp_*(内聚单域)、channels.js 高 churn(动脉加法性增长非腐化)。

## 工具盲区(重要)
GitNexus 对 `stream_chat_events` upstream 报 0:route_chat.py 经 `import routes as routes_module` 惰性动态 import,调用图断链。**后端 impact 数字一律当下界**,补 grep+测试验证。CLI 需 `--repo` 参数(多仓库注册)且无 clusters 子命令。

**How to apply:** 后续任何针对这五项的设计/验收引用本基线;0.2.0 特性(teams/listener/threads)评审时检查是否往 use_chat_stream 里塞。
