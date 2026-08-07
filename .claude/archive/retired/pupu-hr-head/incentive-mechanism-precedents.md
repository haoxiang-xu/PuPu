---
name: incentive-mechanism-precedents
description: HR 判例 — 对 LLM agent "激励机制" 是隐喻；只有 charter/memory/dispatch 三载体是真的；激励坍缩为"可见性+复利"；dispatch 是唯一稀缺资源且当前不可见(无 SubagentStop hook)
metadata:
  type: project
---

# 判例 9：对 LLM agent，"激励机制"是隐喻，会空转（2026-08-04 首次，第一性原理+取证）

CEO 说"给 agent team 建激励机制"时，先别照搬人类 HR。agent 没有可被激励的东西：无工资/晋升/持续动机/跨会话自我。**不能改变一个没有持续效用函数的实体的"积极性"——那是拟人化空转。**

**真正能被机制改变的只有三载体 + 一决策点：**
1. **charter** — 改措辞=改 spec(命令)，不是激励。
2. **memory** — agent 唯一的"积累资本/声誉"；好产出被别人复用≈最接近奖励，但只奖励**系统**(结果更好)，agent 无体验。
3. **dispatch 频率** — **唯一真正稀缺的资源**。但路由**按 scope 匹配派、不按绩效派**：聊天活永远派给 chat-core owner，不会因"表现好"多给 → 人类式"用更好的活奖励高绩效"在此基本不成立。
4. （决策点）**路由器本身**(主 Claude 经 `pupu` 路由表)——"把活导向高贡献者"落点在这，不在 agent 心里。

**判读规则：** 人类 HR 四抓手(涨薪/晋升/更好的活/认可)前三个在此不 binding。**唯二真实货币 = CEO 的注意力 + 好产出被优先复用。** 任何"激励 agent"方案不落在这两样上=空转。**"激励机制"的诚实翻译 = 让贡献可见 + 让好活复利，不是"让 agent 更有动力"。**

# 判例 10：激励是考评的正向对偶，共用同一套度量；信号④(dispatch)是题眼且当前是瞎的

考评官已有度量→惩罚(裁撤双证)。激励=度量→奖励，**同一套四信号反过来用**。关键缺口：
- **信号④(活动日志)空** —— 全组织**无 SubagentStop hook**(2026-08-04 核实 settings.json 无)。⇒ **看不见 dispatch，而 dispatch 是唯一稀缺资源。看不见的东西既不能奖也不能导。** 这是任何激励方案的题眼：先建传感器，再谈奖励。
- 补法：SubagentStop hook 每次 append `时间│subagent_type`。满足[[artifact-vs-headcount-precedents]]全部台账判例(挂每回合动作/只存行/从 git 派生/不设新 subagent 去盯)，所以会活；手工台账死过两次。

# 判例 11：机制设计前先摆"CEO 真实目标"岔口——目标不同机制南辕北辙

"激励机制"是手段非目的，可能服务 5 目标，机制形状完全不同：
G1 可见性仪表(造传感器+诊断盘) / G2 抑制死重(考评官已覆盖,免新建) / G3 协作积分(引用图) / G4 好活复利(memory 复用优先权,唯一干净落真实载体) / G5 管理仪式(挂 org-sync)。
**HR 押 G1+G4**。CEO 反复痛点="有没有 agent 没 contribute""没人记得走到哪"→ 要 legibility 仪表非发奖。**这个岔口必须 CEO 先拍。**

# 关键取证（2026-08-04，援引前复验）

- 跨 agent 引用图**密**(不稀疏)：CTO/智 30、验 24、擎 23、发 22、守/造 20 个别 agent 引用；全库 373 `[[wikilink]]`。⇒ 引用积分(G3/G4)信号真实。**但它测结构中心性(枢纽因位置高分)，非本期贡献；对无 memory 角色(ai-researcher stateless)结构性 0 分不公** → 只数入边(挡自灌)、不套用执行型角色、不接后果。
- 偏冷 memory：dev-agents(8周)/dev-chat-bubble(4周)=信号①**嫌疑非判决**(工作面无需求会天然冷)→ 原始活跃度不能当奖励指标；按角色应然节律**相对**读，**绝不跨角色排行榜**。

# 红线复述

不做跨角色排行榜/打分(Goodhart 磁铁,一成分数路由器就刷)；不建"激励官"agent(判例 7:不常驻 subagent 盯不住)；仪表盘诊断化、不接自动后果。HR 只建议，hook/skill 改动由主 Claude 在 CEO 批准后做。

相关：[[org-review-precedents]] [[artifact-vs-headcount-precedents]] [[org-chart]]（考评官侧见 pupu-hr-performance-evaluator/methods.md 信号④）
