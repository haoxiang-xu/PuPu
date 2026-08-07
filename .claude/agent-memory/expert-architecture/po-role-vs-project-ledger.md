---
name: po-role-vs-project-ledger
description: 2026-07-31 PO 提案的特性放置裁定草案:CEO 三诉求拆成 ledger 工件+DRI 字段+cadence 盯梢,不新增 agent;PO 作为角色会吃掉架构师/CTO 职责且物理上无法"联系 dev"
metadata:
  type: project
---

# PO 是角色还是工件 —— 2026-07-31 裁定草案(待 CEO 拍板)

**结论:CEO 要的 "project owner" 能力,正确承载物是一份入库的 project ledger(`.claude/projects/`,每项目一文件+索引)+ pupu 路由技能的读写收尾职责 + 既有 agent 充当每项目 DRI。不新增 agent 类。**

**Why:** 三诉求逐个放置后,"纵向跟进"是状态问题(工件),"想法收纳"是路由+记录问题(pupu skill 已有一半),"单点沟通"在物理上只能由主 agent 承担(实测:subagent 无 Task 工具,PO 不可能派 dev)。PO-as-agent 会:(1) 每个 PO memory 成为新的状态孤岛,加剧四处散落;(2) "想象怎么做+切片"直接与我(feature placement/design/slicing)和 CTO(dispatch)重叠——全须 PO 会吃掉我一半职责,且不带 GitNexus 取证义务;(3) 违背 07-28 HR 判例"一次性项目不设常设岗/人已在升格即可/不设新 lead 层"。

**关键实证(2026-07-31):**
- 我作为 subagent 的工具清单里没有 Task/Agent 启动工具 → 嵌套派活物理不可行;SendMessage 是 teammates/background 通道,不是当前 org 运行时。
- GitHub issue 作为 ledger 已被证伪:#42 周发布例行票 2026-03-14 开着至今,#45/#102 同类僵尸。
- agent-memory 按调用更新:dev-agents 最新记忆 2026-06-14(六周未动)→ "PO 盯着"是幻觉,subagent 只在被调用的回合存在。
- `.claude/`(含 agent-memory 209 个文件)已在 origin/main 上公开——旧记忆"agents 不在 main"已过期;ledger 入库不比 issue 更公开。
- 真正的"盯"(如 ollama 新模型)= cadence 表条目或 schedule routine,归 llm-expert 等既有 owner。

**单向门:** ledger 方案基本可逆;唯一要守的是 schema 字段语义一旦被其他工具解析即冻结(保持最小 schema)。PO-as-agent 的单向门在组织语义:CEO 习惯对 PO 说话后,PO memory 变事实真相源,退场需状态迁移+权威回收。

**若 CEO 坚持 PO:** 最小章程骨架已交(单 pilot、claim type=project: 绝不含 code:、产出物白名单=ledger 更新/dispatch request/设计问题单、明写不能派 dev、落日条款、与 07-28 判例冲突处须 CEO 显式豁免)。

**什么证据推翻我:** (1) ledger 跑 4-6 周后 CEO 仍不能一回合得到"X 到哪了"(写入纪律靠约定失败);(2) 测得瓶颈在孵化判断而非记账(想法有记录但无人推进);(3) org 迁到常驻 agent-teams 运行时(SendMessage 互联),嵌套约束消失。

相关:[[onboarding-contract]] [[agent-teams-decision]]
