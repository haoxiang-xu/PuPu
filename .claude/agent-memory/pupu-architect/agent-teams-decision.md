---
name: agent-teams-decision
description: Agent teams 战略决策定案——C now / B destination；team=root agent 经 tool 升级进的执行策略(对用户/recipe 都不可见)；team_comm.v1 是 job-store 里的 record 族非独立 ledger；单向门=词汇表+job-store统一
metadata:
  type: project
---

2026-06-20 CEO 战略会:Agent teams 是否未来方向 + 要不要专门做 "Team" 抽象/module。我这条线负责架构判断。grounding 全部一手取证(recipe.py / subagent_loader.py / unchain_adapter.py:4505-4594 直接读 + Explore agent 复核),深推走 codex exec --profile architect(gpt-5.5/xhigh)两轮。

## 决定性代码事实(GitNexus/直读,非推断)
- **整套多 agent runtime 在私有 wheel 里**:SubagentModule + SubagentPolicy(max_depth=6/max_children=10/max_total=50/max_parallel=4/handoff_requires_template=True)全部 import 自 unchain wheel(adapter:4566)。PuPu 只 CONFIG policy,**不 OWN orchestration loop / 路由 / agent 间消息**。wheel 只有两个边缘 hook(读侧 rerank、写侧 long_term_extractor),未知 kwarg 静默丢弃。=> PuPu 永远无法在 wheel 的 agent loop 内部加 inter-agent 通信原语,只能在边缘(tool 层/prompt/module config/recipe 编排)组合。
- **subagent = 严格层级**:父 agent 经 TOOL CALL(delegate/handoff/worker 三模式,保留名 delegate_to_subagent 等)调子 agent,子隔离运行返回 output(summary|last_message|full_trace)。无 peer-to-peer、无 channel、无 blackboard。content 隔离(memory_policy ephemeral|scoped_persistent)和 tool 隔离(子 tools ⊆ 父)**已存在**。
- **recipe graph = 线性管道非 team 拓扑**:1 start/1 end/链式/无环;两种边 flow(控制)+ attach(把 pool 绑到单个 agent);**没有 agent↔agent 通信边**;agent 间数据传递只有 upstream→downstream 变量注入 {{#node.field#}}。但 graph 是 RUNTIME 的(_compile_recipe_graph_for_runtime + _stream_recipe_graph_events),PuPu 已经在自己进程里 wrap 多个 Agent.run —— 这是通信层能物理落脚的地方。
- 现状彻底 ABSENT:channel / ownership 表 / message bus / peer 路由 / shared blackboard 全无。

## 定案:C now,B as committed destination
- **A(继续堆 agent + 一个通信 module)= 死路**。wheel 不让你改隐藏 loop,任何挂在 agent 上的"通信 module"只是围着黑盒的 prompt/tool 约定,ownership 是父代行的虚构。够用于:单 agent 任务/层级委派/隔离 worker/线性 recipe。撑不住:peer 协作/共享产物归属/任务分配/长流程/事件唤醒/部分失败/可强制执行的"谁拥有这个"。
- **B(一等公民 Team,PuPu 进程内、wheel 之上)= 正确终态**。Team 拥有 members/channels/ownership 表/report 契约/调度;members 仍是 unchain Agent,Team 经 Agent.run 把它们当黑盒执行器调用。不要求 wheel 变成 team runtime。战略级单向门。
- **C(先抽通信契约层 team_comm,Team 后做薄编排)= 现在切的**。先把数据模型证对,再上调度,避免在契约没证之前固化调度决策。

## 两个加判(我对 Codex 的收口,CEO 硬约束)
1. **不可见性决策点 = (a) root agent 经 PuPu 内部 tool 升级进 team**(TeamCommPort.form_team/delegate_team)。root agent 正常起,需要时才升级。键于:任务分解压力/并行需求/专才工具需求/context 压力/blocker/job-store 现状/PuPu policy(非用户选择)。**不要** Agent.run 之前的确定性 pre-router(过早单向门 + 重复 wheel 已有的委派逻辑)。**不要**让 recipe 作者声明"team"。=> **team 只是 root agent 经 tool 升级进的执行策略,对用户和 recipe 都永不可见**。这正面满足 CEO"teams 不可见、用户永不选 agent"。
2. **ledger 统一**:team_comm.v1 **不**独立建库,是 [[listener-node-and-boulders]] 那个 job-store ledger 里的 typed record 族(claim/handoff/report/blocker/ownership-change),按 correlation_id/run_id/job_id 关联 flow_event.v1。三分边界:**job store**=执行真相(append-only:events/runs/checkpoints/cursors/claims/handoffs/reports/blockers);**team_comm**=job store 内协调记录的 envelope/动词,非独立 ledger;**memory**=蒸馏的语义知识(无 cursor/ownership/checkpoint/handoff 噪声;team report 可事后汇入 memory 但 ledger 仍是真相源)。filtered view/index over team_comm 可以,第二条 ledger 不行。

## 第一刀(最小、可逆、不废工)
pupu.team_comm.v1 envelope schema + 进程内 append-only recorder + pass-through(零行为变更/零 UI),在 EXISTING 线性 recipe + subagent 委派路径上观测 ownership/handoff/report/blocker。完全镜像 flow_event 的切法(契约+ledger 可观测先行,runtime 行为后做)。验证 correlation/排序/词汇表后再动 orchestration。seam = TeamCommPort 接口:claim_work/handoff_work/report_work/record_blocker/build_member_context。后续 TeamRunner 是 TeamCommPort 之上的薄编排。

## 单向门(改不起)
1. **team_comm 词汇表(claim/handoff/report/blocker/ownership)**:一旦 record 进 ledger 且被消费,append-only、版本化。
2. **job-store 统一**:team_comm 与 flow_event 共库共 correlation。若 team_comm 分叉出第二 ledger → backfill/replay/关联/审计全痛苦。
3. **B 的 Team 边界**:一旦 Team 拥有持久 ownership/channel 语义,不应再塌回 Agent。
可逆:具体 DB、tool 命名、首个 team 策略的 heuristic 阈值、members 调度算法。

## 立场一句话
停止把 Agent 当长期模型来堆;现在就引入通信契约(team_comm.v1,job-store 内);让一等公民 Team 成为 wheel 之上、PuPu 拥有的编排层。team 对用户和 recipe 永不可见,只是 root agent 经 tool 升级进的执行策略。
