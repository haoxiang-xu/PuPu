---
name: ref-durable-execution-c2
description: 愿景研究 C2;durable execution 框架(Temporal/LangGraph/Inngest/Restate/DBOS/OpenHands SDK)如何让长流程"可恢复而非常驻",取证位置与核心原语
metadata:
  type: reference
---

愿景研究集群 C2:durable execution / 可恢复长流程引擎。证明"长多步流程"与"不做真 daemon/真 heartbeat"可共存——状态外置+事件唤醒+空闲归零。直接解 PuPu 矛盾(见 [[a2a-channel-direction]] 的 daemon 参照 [[ref-openclaw-heartbeat]] 是另一面)。

核心结论一句话:PuPu 要的不是活着的 loop,是"睡得着、叫得醒、记得住"的流程。"忙"=状态是活的可被续上,≠ 一直在跑。

**框架与核心原语(取证 URL):**
- Temporal — Event History + deterministic replay(replay 重跑代码但跳过已成功 activity);Signal 注入外部事件/人工审批。代码必须确定性,偏重(需独立 service)。docs.temporal.io/workflow-execution/event
- LangGraph — checkpointer + thread_id;`interrupt(value)` 抛可恢复异常暂停、`Command(resume=...)` 同 thread_id 续(从被中断节点开头重跑,注意副作用幂等);durability 三档 exit/async/sync。官方语义:"月级 workflow 睡一周再续,两动作间 holding zero compute"。reference.langchain.com/python/langgraph/types/interrupt
- Inngest — step.run 每步 memoize;step.waitForEvent "以零成本等待"外部事件。inngest.com/blog/ai-agents-inngest-durable-steps
- Restate — journal+replay;ctx.run() 包非确定性操作;ctx.sleep()/awakeable(durable promise,ctx.promise() 创建、外部带 id 回调 resolve)"sleeping 期间 consume no resources"。docs.restate.dev/concepts/durable_building_blocks/
- DBOS — 最轻量;纯库把每个 step checkpoint 进 Postgres,无独立编排服务器,崩溃自动从最后 step 恢复。github.com/dbos-inc/dbos-transact-py
- OpenHands SDK(V1,2025-11) — event-sourcing;不可变 Action/Observation 事件追加进 log,唯一可变 ConversationState;agent=「event history→next event 的纯函数」在 loop 跑;pause/resume/fork/确定性 replay/审计"免费"。arXiv 2511.03690。**离 PuPu 最近的心智模型**。

**对 PuPu 的落地判断(需读 unchain_adapter.py 后复核):**
- 最贴 PuPu = OpenHands event-sourcing 心智 + DBOS/SQLite 级本地 checkpoint(桌面端/单写者/无外部 server)。Temporal 偏重不合适。
- action-triggered 完美映射 advance-in-bursts:用户交互/durable timer 到点/外部 tool 回调把流程推进一格 = 按需唤醒,非 heartbeat 轮询。契合"打扰门槛高"。
- "值得打扰"= interrupt-as-escalation:流程后台跑 step,只在真正值得打扰的节点 interrupt 升级给用户。
- 可在不改 unchain 内核(私有 wheel)前提下,Flask 侧加"流程状态表+唤醒入口",把 100% 请求驱动升级为请求/事件驱动,不引常驻线程。具体挂点+wheel 边界待核。
