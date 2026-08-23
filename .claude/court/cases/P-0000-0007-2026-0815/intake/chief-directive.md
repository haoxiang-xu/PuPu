# Intake — Chief（CEO）指令与外部诊断报告要点

- **收到时间**: 2026-08-15（本 session 用户消息）
- **指令原文**: 「你看看你有没有办法修复一下」+ 全文诊断报告《Context V2 Rebase 重复失败：完整诊断与修复建议》
- **性质**: Chief 发起修复方向的 direction；**不构成对任何具体 PS 的裁定**。PLAN_RULING 仍待 Chief 对 ruling-ready PS 显式批准。

## 报告主张的结论（已经本案 intake/fact-check.md 逐条核实）

GraphCheckpoint 的正式事件顺序（final_message → run_completed → graph.step.completed）与 Generation Rebase 的 attempt terminal-last quiescence 规则互相矛盾；sidecar 将具体原因压缩为通用 `context_v2_rebase_unavailable`（503, retryable）；renderer 视其为可重试，durable outbox recovery 以指数退避热循环重试。

## 报告建议的修复方向（供 lead owner 参考，非授权）

- **方案 A**：Rebase 增加 attempt quiescence 分类——普通 attempt 保持 terminal-last fail-closed；graph step attempt 要求唯一合法 seal（graph.step.completed/failed/cancelled）为最后一条，terminal_cursor / execution_event_range / attempt / step index / plan / scope 全一致，terminal 与 seal 之间及 seal 之后不得有 model/tool/interaction 事件，duplicate/foreign seal fail closed；crash window（terminal 已写、seal 未写）不得放行，返回 in_progress 或新的 recovery_required，等冷恢复补 seal 后重试 frozen rebase。
- **方案 B**：不修改历史 journal——现有 post-terminal graph seal 是合法 durable 记录；不重排/删除/改写 event rows，不人工改用户数据库；修好 validator 后现有 frozen outbox payload 幂等重放。
- **方案 C**：错误分类细分——`in_progress`（真在跑/等 interaction，可退避）、`recovery_required`（terminal 已写 seal 未恢复）、`journal_incompatible`（确定性不匹配：停热循环、保留 outbox、进 manual-review/quarantine，不自动丢弃用户编辑）、`unavailable`（只留给真正基础设施不可用）。
- **方案 D**：delegated/shadow root 生命周期单独裁定——不能顺手把所有 `graph.execution.completed` 当 terminal 放行。
- **报告明确反对**：改版本 lock / 恢复旧 SHA gate；只重启期待自愈；把 seal 挪到 terminal 前（会破坏冷恢复契约与既有测试）；允许任意 post-terminal event；重写/重排/删除 journal；因 503 重试失败丢弃 outbox；把真未完成的 interaction graph 放行。
- **报告的验收矩阵**（14 条）：真实 producer 成功 step 可 rebase；crash window 返回 recovery/in-progress；冷重启补 seal 后同一 frozen request 成功；cursor/attempt/plan/scope/status 任一不匹配原子 fail closed；seal 后再有事件继续拒绝；completed/failed/cancelled/max-iterations 分别覆盖；普通 attempt 仍 terminal-last；root graph 正常序通过；等待 interaction 的 graph 继续 in_progress；repeated outbox replay 不重复 generation/head revision/receipt/events；用户数据库隔离副本重放、原库只读；quick_check=ok、FK=0、旧 journal rows 字节不变；真实 GraphCheckpoint 输出喂 consumer（禁纯手工 fixture）；新 wheel + PuPu candidate + runtime manifest 做 exact deployed-pair 验证。

## 报告中与本案相关的运行时事实（用户环境，未被本案取证复核的部分）

- 当前 sidecar available=true, store_owner=unchain, runtime_protocol_ready=true（manifest sha256:fdb17e2a…）；请求确实已过 runtime protocol 门进入 Rebase。
- 用户数据库只读检查：quick_check=ok，FK=0，3 active admissions，3 generation heads，duplicate terminal=0；两条 post-terminal 事件均为合法 graph.step.completed（terminal_cursor 精确指向前面的 run_completed）；第三个 graph 真在等 interaction（只有 graph.execution.admitted + interaction request/resolution），应继续 in_progress。
- 未读取 content-bearing localStorage outbox；用户原库未修改。

## 明确不属于本案的报告内容

- 报告 §八/§九（Context Composition / token usage UI、Attach Panel 圆环回退策略）属于 **P-0000-0004-2026-0815**（已裁定、implementing）的实施与验收范围，不入本案。
