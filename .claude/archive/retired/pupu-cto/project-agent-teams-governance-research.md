---
name: project-agent-teams-governance-research
description: CEO 战略讨论"agent teams 是否未来方向"，CTO 线产出人类组织治理经验→agent teams 通信治理原则（已交付）
metadata:
  type: project
---

CEO 在做战略级讨论：**agent teams 是否是 PuPu 的未来方向，设计核心是什么**。CTO（本线）负责的子题 = "把人类大组织的沟通治理经验，反哺到 agent teams 设计"。

**CEO 的核心论点（设计约束）：**
- Agent teams 对用户必须**不可见**——用户不该知道调了哪个 agent。
- 设计核心 = 解决 **agent 之间的沟通**：ownership 明确、何时沟通何时不沟通、任务分配、什么任务该有独立 agent。
- transparency 重要，但**每个职级也必须 isolate need-to-know 的信息**；且要**避免体制臃肿拖垮效率**。

**Why:** 这决定 PuPu 是否走多 agent 编排路线；CEO 要的是可直接编码的设计规则，不是管理学综述。

**状态（2026-06-20 已交付给 CEO）：**
派 3 个 pupu-ai-researcher（codex researcher profile, reasoning 高，Fable 停摆期禁用 Fable，Mode R 报告型），各领互不重叠子章程，已全部返回并由 CTO 合成。

**三条研究线收敛出的硬结论（证据级，可直接编码）：**
1. **O(n²) 沟通税真实**（Brooks n(n-1)/2，三线一致 PRIMARY）——但只对全连接/强耦合任务成立；hub-spoke/sequential 拓扑降到线性。规则：禁止 all-to-all，>3 agent 必须有拓扑理由。
2. **单一 DRI 反 bystander effect**（Darley&Latané 1968 85%→31% PRIMARY）——每 task 恰好一个 owner，交接显式转移，"共享 ownership"=问责真空。
3. **隔离 vs 透明是 U 型曲线**，不是"越透明越好"（此 prior 被显式证伪）。**两平面分离**：操作面按角色隔离/限于认知容量；**问责面（决策+安全信号）永不压缩、永不按级过滤、歧义默认上报**。
4. **中层抑制（非底层沉默）才是上行失败主因**（Challenger/Columbia/VW）——sub-orchestrator 不得降级/压制下层标记的安全信号。
5. **感知障碍与真障碍同等致命**（9/11 Grewe 2004）——协议必须正向显式，歧义默认 share 而非 silent。
6. **层级只在"减下游决策量>自身开销"时才值钱**（GE 9→4 层 / frozen middle）——只路由不转换的 orchestrator = 纯开销，删。
7. **Conway 定律 80%+ 实证**（Colfer&Baldwin 142 研究）——先设计通信拓扑再分 agent。
8. 反臃肿红线 7 条 + 任务分配决策树（Williamson TCE：novelty/parallelizable/frequency/specificity 四闸）。子团队 ≤5（Hackman 4.6 / Google scaling 5→10 退化）。

**How to apply（未来这条线被重启时）：**
- 本线只产"沟通治理原则与判定规则"，**不碰代码架构选型**（pupu-architect 线）。若 CEO 决定真做 agent teams，把上述规则交 pupu-architect 落成架构、CTO 落成交付切片。
- 现有人类 agent 团队已是这套原则的实例：DRI=各 ownership owner、横向直挂=扁平减层、越级上报=安全信号不被中层压制。见 [[team_roster]]。
- 完整四份交付物已在 2026-06-20 对话中直接返回 CEO；未落 .md（不入库），需要时从上述硬结论重建。
- 关联：Fable 停摆期 researcher 一律 codex/opus/sonnet，见 [[hybrid-codex-policy]]。
