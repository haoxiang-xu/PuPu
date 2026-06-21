---
name: project-agent-teams-governance-research
description: CEO 战略讨论"agent teams 是否未来方向"，CTO 线负责人类组织治理经验→agent teams 通信治理设计原则
metadata:
  type: project
---

CEO 在做战略级讨论：**agent teams 是否是 PuPu 的未来方向，设计核心是什么**。CTO（本线）负责的子题 = "把人类大组织的沟通治理经验，反哺到 agent teams 设计"。

**CEO 的核心论点（设计约束）：**
- Agent teams 对用户必须**不可见**——用户不该知道调了哪个 agent。
- 设计核心 = 解决 **agent 之间的沟通**：ownership 明确、何时沟通何时不沟通、任务分配、什么任务该有独立 agent。
- transparency 重要，但**每个职级也必须 isolate need-to-know 的信息**；且要**避免体制臃肿拖垮效率**。

**Why:** 这决定 PuPu 是否走多 agent 编排路线；CEO 要的是可直接编码的设计规则，不是管理学综述。

**How to apply:**
- 本线只产出"沟通治理原则与判定规则"，**不碰代码架构选型**（那是 pupu-architect 的线）。
- 2026-06-20 派出 3 个 pupu-ai-researcher（codex researcher profile, reasoning 高，**禁用 Fable**——当时 Fable 5 停摆，Mode R 报告型）研究：①信息隔离 vs 透明 ②沟通效率机制（含 O(n²)/Brooks/DRI）③科层臃肿+ownership 边界。
- 合成交付物：(1) 5-8 条通信治理原则 (2)"何时隔离/同步/上报"判定表（CEO 最想要）(3) 反臃肿红线 (4) 区分依据 vs 推断。
- 关联运行约束：Fable 停摆期 researcher 一律用 codex/opus/sonnet，见 [[hybrid-codex-policy]]。
