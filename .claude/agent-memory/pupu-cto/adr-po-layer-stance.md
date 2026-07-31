---
name: adr-po-layer-stance
description: 2026-07-31 CEO 提议在 CEO 与 dev 之间加 project owner 层 — CTO 表态：职能真、层假；台账=交付物非岗位；待 CEO 拍板
metadata:
  type: project
---

**2026-07-31 CEO 提议设 PO 层（例：ollama PO、trace-chain PO）。CTO 表态：有条件支持职能、反对新增 agent 层。待 CEO 拍板。**

## 核心测量（当时为真）
- 项目进度记忆今天在**主 agent 用户级 memory（52 文件）**，不在 CTO memory（38 文件里 ~31 是 ADR/契约/组织件，项目跟进类 ≈2）。PO 职能的现承担者是主 agent + 各 owner 自己的 memory，不是 CTO。
- **subagent 无 Task 工具已第一人称实证**（CTO 运行时工具清单无 Task；ToolSearch 也搜不到）——PO 无法直接派 dev，只能回文本给主 agent 转发 = 纯多一跳。SendMessage 存在但属 agent-teams 模式，org 未采用；若整体转 teams 模式属另案。
- CEO 举的两个 PO 例子在花名册上**已有主**：ollama/model 策略 = 智（spec+veto，含 ai-researcher 舰队孵化力）；trace chain/artifact summary = dev-chat-bubble（code:）+ architect（placement）。设 PO 即在既有权威地里种菜。

## 立场与条件
1. 不新建 PO agent（判例：07-28 "先证明改 charter 不能解决" + "不设新 lead 层" + claim-type 只认 code:；PO 全是 spec:/consumer: 类 claim → 加剧 5/6 动脉"守门人无作者"死锁）。
2. 真缺口 = **CEO 按 project 思考、org 按 line 汇报**的错位 + 无人主动跨会话催办（agent 无常驻，同伪常驻研究结论）。
3. 解法 = **项目台账（交付物非岗位，判例同"事件契约=交付物"）**：每行 project/唯一 owner(既有 agent)/状态/下一步/等CEO?/last-touched；主 agent 路由后随手更新（与其维护 routing table 义务同构），org-sync 全量对账，>30 天未触碰标黄。台账是索引不是真相源（真相源=owner memory）。
4. 想法收纳协议：CEO 想法 → 台账登记 + 路由给 owner 孵化 → 产出「提案 packet」（问题/证据/建议/规模）→ 该不该做=CEO、怎么做=architect、切片派发=CTO。优先级不归任何 PO。

## 证伪触发（重开 PO 议题的条件）
- 台账跑 4-6 周后 CEO 仍需逐项口头唤醒项目（台账未降低记忆负担）；
- 平台/运营模式改变使 subagent 真能驱动 dev 并回收结果（"多一跳"论据失效）；
- 某单一域外部变化频率高到把现有 owner 本职排挤掉（那是该域扩编证据，走 HR 双证，仍非通用 PO 层）。

相关 [[adr-unchain-team-plan]] [[hiring-policy]] [[team_roster]] [[project-agent-teams-governance-research]]
