---
name: org-chart
description: PuPu 跨部门 agent 花名册（source of truth）— 24 agent / 4 线; HR 已重组为法庭模式
metadata:
  type: project
---

**PuPu 组织真相源。研判前必读。CEO 批准结构变更后由主 Claude 更新本表（HR 只提议、不自改）。**
最后同步: 2026-08-04（HR court reorg — 旧 HR 四人全员退役, 新建法庭模式五人: 法官 + 四维评估官; `org-rebalance` skill 退役, 由 `org-court` 取代）。

## 顶层（CEO = Haoxiang Xu, haoxiangxu1998@gmail.com 直接面对 3 条 line + 1 个 advisory 部门）

```
CEO
├─ CTO「帅」      pupu-cto            技术交付总线（含 chief architect）
├─ COO「发」      pupu-coo            业务操盘（盈利/方向提案/GTM）+ 发布 go/no-go
├─ AI「智」       pupu-llm-expert     AI 战略（独立；辖 research arm）
└─ HR（advisory） pupu-hr-judge       组织法庭（四维评估 + 判例法；CEO 终审, 主 Claude 执行）
```

## 全员表

| subagent_type | 花名 | 归属 | scope | 文件路径 | model |
|---|---|---|---|---|---|
| pupu-cto | 帅 | 顶层·CTO | 技术交付、派活/排序、load-bearing conventions、CEO/跨团队联络；技术方向 defer 给 architect | agents/cto/pupu-cto.md | fable |
| pupu-architect | — | CTO·chief architect | 最终架构技术权威、feature placement、设计切片与交付后 design sign-off；CTO 负责派活 | agents/cto/pupu-architect.md | fable |
| pupu-dev-chat-core | — | CTO·Chat体验组 **lead** | 主聊天页、流式编排、输入面板、side-menu；流契约定义方 | agents/cto/chat-experience/ | opus |
| pupu-dev-chat-bubble | — | CTO·Chat体验组 | 消息气泡渲染（markdown/trace_chain/artifact） | agents/cto/chat-experience/ | opus |
| pupu-dev-settings | — | CTO·配置扩展组 **lead** | 设置modal、模型配置、memory、workspace、localStorage settings | agents/cto/config-extension/ | opus |
| pupu-dev-toolkit | — | CTO·配置扩展组 | toolkit modal、MCP 安装、custom_mcp | agents/cto/config-extension/ | opus |
| pupu-dev-agents | — | CTO·配置扩展组 | characters、recipes、flow_editor | agents/cto/config-extension/ | opus |
| pupu-dev-electron | — | CTO·平台安全组 **lead** | 主进程服务、preload bridges、IPC relay、channel 常量 | agents/cto/platform-security/ | opus |
| pupu-security-expert | 守 | CTO·平台安全组 | 防御性安全；安全裁量权（定级/sign-off/HIGH-CRITICAL）越级直达 CTO/COO | agents/cto/platform-security/ | fable |
| pupu-qa-tester | 验 | CTO·横向直挂 | QA、回归、plumbing 验证 | agents/cto/direct/ | fable |
| pupu-ux-designer | 造 | CTO·横向直挂 | UX/UI 设计、明暗主题 | agents/cto/direct/ | opus |
| mcp-store-curator | 策 | CTO·横向直挂 | MCP 商店条目数据、schema、连通性 | agents/cto/direct/ | opus |
| pupu-dev-backend | 擎 | CTO·横向直挂 | PuPu backend (unchain_runtime/server, 唯一真实副本) + unchain core 库; 跨 repo | agents/cto/direct/ | opus |
| pupu-coo | 发 | 顶层·COO | 业务操盘（盈利/市场牵引/方向提案权/GTM/机会创造）+ 发布 go/no-go 决策、跨仓兼容裁断；完整全测执行下沉给检，专项证据来自验/擎/守 | agents/coo/pupu-coo.md | opus |
| pupu-growth-ops | 巡 | COO 线 | 向内遥测：增长巡检、健康度评分、COO 周报、PuPu P0/P1/P2 下一步（独家）；向 COO 汇报 | agents/coo/ | opus |
| pupu-market-analyst | — | COO 线 | 向外情报：竞品/定价/变现/定位/趋势，产情报与方向选项不产 PuPu 行动清单；向 COO 汇报 | agents/coo/ | opus |
| pupu-release-full-test | 检 | COO 线 | 冻结 release candidate、执行零付费完整门禁与付费 6-cell live long-run、保全证据、向 COO 提 GO/NO-GO/INCOMPLETE 建议；无最终裁决权 | agents/coo/ | opus |
| pupu-llm-expert | 智 | 顶层·AI | 模型/provider 策略、prompt、unchain 编排、RAG、tool-use 语义 | agents/ai/ | fable |
| pupu-ai-researcher | — | AI·research arm | Codex 驱动、零先验/证伪式 AI 与代码调查；无持久记忆、只交报告；由智派发与合成 | agents/ai/ | sonnet |
| pupu-hr-judge | — | HR·法官 | 主持 org-court：受理建制提案、验证证据、合成判决建议；持 org-chart 与判例库；advisory | agents/hr/ | opus |
| pupu-hr-comm-assessor | — | HR·评估官 | 维度1 沟通效率：hop、信息损失、边界双侧承认、scope 重叠歧义 | agents/hr/ | opus |
| pupu-hr-context-assessor | — | HR·评估官 | 维度2 context 纯净度：per-call 载荷账、isolation 收益、co-change 内聚、模型档相关性 | agents/hr/ | opus |
| pupu-hr-signal-assessor | — | HR·评估官 | 维度3 有效信息比例：charter 信噪比、样板占比、唤醒相关性、memory 索引聚焦 | agents/hr/ | opus |
| pupu-hr-route-assessor | — | HR·评估官 | 维度4 路由成本：description 判别性、路由面常驻账、路由模式适配、路由命中审计 | agents/hr/ | opus |

合计 **24 个 agent**。

## 关键边界与红线（援引时不要凭空判断）

- **守的安全越级权:** 虽挂平台安全组（lead=electron）, 但 severity 定级 / 发版 sign-off（对 COO）/ HIGH-CRITICAL 上报（达 CTO）不下放给 electron lead。避免"被审查方管审查方"。（2026-08-04 org-rebalance 判决建议书建议守转横向直挂, CEO 未批, 维持现状待裁——见判例库 pending docket）
- **公共区守门权:** 共享原语（如 markdown.js）改动权留 CTO, 不下放任何 sub-team lead。
- **HR advisory-only:** HR 不碰任何 agent/memory 文件（自己拥有的 memory 除外）, 判决建议书以"执行(待 CEO 批准)：…"结尾。
- **HR 法庭模式（2026-08-04 court reorg）:** 一切建制变更（加/减/重组/组织规则）一律过 `org-court`, 无旁路（招募门并入）。四维评估（沟通效率/context 纯净度/有效信息比例/路由成本）+ 法官验证证据合成 + CEO 终审 + 主 Claude 执行。**贡献度不是维度**（agent 无工资, 闲置只作路由缺陷诊断信号）; 裁撤双证/two-signal rule 随旧维度一并废除。HR 全员程序化传唤, 不走常规路由。执行是 skill 程序段, 不设执行 agent。
- **横向不设组长:** 验/造/策/擎(backend) 直挂 CTO（拍平先例）。backend 起步 1 人不设 lead, 第二人触发后再评估升格 sub-team。COO 线同理拍平：巡/analyst/检直挂 COO, 不成团不设 lead。
- **COO 提案权 ≠ 技术裁决权:** COO 可向 dev/CTO 提产品方向, 架构/技术可行性裁决仍在 architect/CTO; COO 保留 release go/no-go，检只执行全测与交证据；对外发布动作一律 CEO 过手。
- **巡/analyst 接缝:** 自家 repo 指标 + Weekly COO Report + PuPu P0/P1/P2 行动清单独家归巡; analyst 只碰外部数据、只产情报/选项。一份 brief 不出现两个人的 PuPu 行动计划。
- **analyst 利用率复评点（经 court reorg 修订）:** 原定 2026-08-18 前后由绩效考评官核利用率+裁撤双证——该机制已废。修订为: 到期走 `org-court`（route-assessor 出路由命中审计）, 判据按宪法第 3 条（它让市场情报这件事更准还是更便宜）, 可选处置含"退回 bounded skill"（符合宪法第 4 条）。COO 的在途下探题（LangGraph/CrewAI/n8n 变现）应在复评前完成, 否则复评无真实数据。

## 文件结构（agents/ 镜像组织树）

```
agents/
├── cto/{pupu-cto.md, pupu-architect.md, chat-experience/, config-extension/, platform-security/, direct/}
├── coo/{pupu-coo.md, pupu-growth-ops.md, pupu-market-analyst.md, pupu-release-full-test.md}
├── ai/{pupu-llm-expert.md, pupu-ai-researcher.md}
└── hr/{pupu-hr-judge.md, pupu-hr-comm-assessor.md, pupu-hr-context-assessor.md, pupu-hr-signal-assessor.md, pupu-hr-route-assessor.md}
```

## 近期组织变更史

- 2026-06-09: CEO 定 4 线直汇报（CTO/llm-expert/product-ops/growth-ops）+ dev team。
- 2026-06-10: 引入 security-expert「守」; 首次全面安全调查（findings 被 CEO 接受现状）。
- 2026-06-10: **reorg** — 顶层收敛为 3 线（CTO/COO/智）; product-ops 升 COO 改名 pupu-coo 收编 growth-ops; CTO 下分 3 sub-team 各设 lead + 3 横向直挂; agents/ 重组为镜像组织树。
- 2026-06-10: **HR 部门成立**（advisory, 3 角色）。
- 2026-06-10: **建 backend dev「擎」(pupu-dev-backend)**, 横向直挂 CTO, 填补后端 0-owner 真空。
- 2026-07-21: **COO 业务操盘手重定义 + 建 market-analyst**（不成团/不设 lead, YAGNI）。
- 2026-07-23: **建 release-full-test「检」**（直挂 COO 的操作型专员, 非 release-manager）; 同期花名册审计补回 architect 与 ai-researcher, active 21→22。
- 2026-08-04: **建 CFO 线而复撤, 并入 HR** — agent 无恐惧, 对向制衡是给人设计的; 成本镜头并入 HR 为 pupu-hr-cost-evaluator, `org-rebalance` 定为 HR skill。22→23（当日先 24 后 23）。
- 2026-08-04: **首轮 org-rebalance 全量运行** — 三镜头 + 交叉 + 合成; 结论: 零编制变化、23 人无一达旧裁撤门槛、无一达拆分门槛; 主要发现全在文档真相与路由面。判决建议书 CEO 未批（转向 court reorg）, 未决事项入法官判例库 pending docket。
- 2026-08-04: **HR court reorg（本次）** — CEO 立四维评估哲学（沟通效率/context 纯净度/有效信息比例/路由成本）, **显式废除贡献度维度**; 推翻 F7"HR 封顶 4 人"判例（其豁免条款被满足: 路由成本被证明是第四个正交镜头）。旧 HR 四人（pupu-hr-head / pupu-hr-org-architect / pupu-hr-performance-evaluator / pupu-hr-cost-evaluator）全员退役, 旧 memory 目录保留为档案; 昨日 A5 复评点（cost-evaluator 09-01 / org-architect 09-04）随角色退役失效。新建法庭五人: `pupu-hr-judge` + comm/context/signal/route 四评估官。`org-rebalance` skill 退役, `org-court` 接任（执行定为 skill 程序段, 不设执行 agent）。本部门若运行良好, 将作为样本推广到其他 agent teams。23→24。
