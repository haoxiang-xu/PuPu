---
name: org-chart
description: ARCHIVED 2026-08-04 — 已被 pupu-hr-judge/org-chart.md 取代; 本文件描述的是 HR court reorg 之前的组织, 仅作历史档案
metadata:
  type: project
---

> **⚠️ ARCHIVED / 已归档 (2026-08-04)。本文件不再是组织真相源。**
> 现行 source of truth: `/Users/red/Desktop/GITRepo/PuPu/.claude/agent-memory/pupu-hr-judge/org-chart.md`
> 本文件描述的 23 人/双镜头 HR 结构已被 court reorg 取代, 内容仅作历史档案, 引用前先读现行版。(org-court 001 案批次 0.3, 法官勘误动议)

**PuPu 组织真相源。研判前必读。CEO 批准结构变更后由主 Claude 更新本表（HR 只提议、不自改）。**
最后同步: 2026-08-04（CFO 线同日建而复撤——token 成本评估并入 HR 为 pupu-hr-cost-evaluator；HR 现持组织颗粒度双镜头（成本拆/效率剪）+ 招募审批门）。

## 顶层（CEO = Haoxiang Xu, haoxiangxu1998@gmail.com 直接面对 3 条 line + 1 个 advisory 部门）

```
CEO
├─ CTO「帅」      pupu-cto            技术交付总线（含 chief architect）
├─ COO「发」      pupu-coo            业务操盘（盈利/方向提案/GTM）+ 发布 go/no-go
├─ AI「智」       pupu-llm-expert     AI 战略（独立；辖 research arm）
└─ HR（advisory） pupu-hr-head        组织治理（颗粒度双镜头：成本拆/效率剪 + 招募审批门）
```

## 全员表

| subagent_type | 花名 | 归属 | scope | 文件路径 | model |
|---|---|---|---|---|---|
| pupu-cto | 帅 | 顶层·CTO | 技术交付、派活/排序、load-bearing conventions、CEO/跨团队联络；技术方向 defer 给 architect | agents/cto/pupu-cto.md | opus |
| pupu-architect | — | CTO·chief architect | 最终架构技术权威、feature placement、设计切片与交付后 design sign-off；CTO 负责派活 | agents/cto/pupu-architect.md | fable |
| pupu-dev-chat-core | — | CTO·Chat体验组 **lead** | 主聊天页、流式编排、输入面板、side-menu；流契约定义方 | agents/cto/chat-experience/ | opus |
| pupu-dev-chat-bubble | — | CTO·Chat体验组 | 消息气泡渲染（markdown/trace_chain/artifact） | agents/cto/chat-experience/ | opus |
| pupu-dev-settings | — | CTO·配置扩展组 **lead** | 设置modal、模型配置、memory、workspace、localStorage settings | agents/cto/config-extension/ | opus |
| pupu-dev-toolkit | — | CTO·配置扩展组 | toolkit modal、MCP 安装、custom_mcp | agents/cto/config-extension/ | opus |
| pupu-dev-agents | — | CTO·配置扩展组 | characters、recipes、flow_editor | agents/cto/config-extension/ | opus |
| pupu-dev-electron | — | CTO·平台安全组 **lead** | 主进程服务、preload bridges、IPC relay、channel 常量 | agents/cto/platform-security/ | opus |
| pupu-security-expert | 守 | CTO·平台安全组 | 防御性安全；安全裁量权（定级/sign-off/HIGH-CRITICAL）越级直达 CTO/COO | agents/cto/platform-security/ | fable |
| pupu-qa-tester | 验 | CTO·横向直挂 | QA、回归、plumbing 验证 | agents/cto/direct/ | opus |
| pupu-ux-designer | 造 | CTO·横向直挂 | UX/UI 设计、明暗主题 | agents/cto/direct/ | opus |
| mcp-store-curator | 策 | CTO·横向直挂 | MCP 商店条目数据、schema、连通性 | agents/cto/direct/ | opus |
| pupu-dev-backend | 擎 | CTO·横向直挂 | PuPu backend (unchain_runtime/server, 唯一真实副本) + unchain core 库; 跨 repo | agents/cto/direct/ | opus |
| pupu-coo | 发 | 顶层·COO | 业务操盘（盈利/市场牵引/方向提案权/GTM/机会创造）+ 发布 go/no-go 决策、跨仓兼容裁断；完整全测执行下沉给检，专项证据来自验/擎/守 | agents/coo/pupu-coo.md | opus |
| pupu-growth-ops | 巡 | COO 线 | 向内遥测：增长巡检、健康度评分、COO 周报、PuPu P0/P1/P2 下一步（独家）；向 COO 汇报 | agents/coo/ | opus |
| pupu-market-analyst | — | COO 线 | 向外情报：竞品/定价/变现/定位/趋势，产情报与方向选项不产 PuPu 行动清单；向 COO 汇报 | agents/coo/ | opus |
| pupu-release-full-test | 检 | COO 线 | 冻结 release candidate、执行零付费完整门禁与付费 6-cell live long-run、保全证据、向 COO 提 GO/NO-GO/INCOMPLETE 建议；无最终裁决权 | agents/coo/ | opus |
| pupu-llm-expert | 智 | 顶层·AI | 模型/provider 策略、prompt、unchain 编排、RAG、tool-use 语义 | agents/ai/ | fable |
| pupu-ai-researcher | — | AI·research arm | Codex 驱动、零先验/证伪式 AI 与代码调查；无持久记忆、只交报告；由智派发与合成 | agents/ai/ | sonnet |
| pupu-hr-head | — | HR | 组织治理负责人, advisory, 统筹+合成 | agents/hr/ | opus |
| pupu-hr-org-architect | — | HR | 组织架构（怎么长）；建部门/角色 warrant、层级、合并拆分 | agents/hr/ | opus |
| pupu-hr-performance-evaluator | — | HR | 绩效（谁在贡献, 效率镜头/剪）；多信号取证、裁撤双证 | agents/hr/ | opus |
| pupu-hr-cost-evaluator | — | HR | 成本（贵不贵, 成本镜头/拆）；多信号量化 token 成本、找又贵又宽的拆分候选；不编数字 | agents/hr/ | opus |

合计 **23 个 agent**。

## 关键边界与红线（援引时不要凭空判断）

- **守的安全越级权:** 虽挂平台安全组（lead=electron）, 但 severity 定级 / 发版 sign-off（对 COO）/ HIGH-CRITICAL 上报（达 CTO）不下放给 electron lead。避免"被审查方管审查方"。
- **公共区守门权:** 共享原语（如 markdown.js）改动权留 CTO, 不下放任何 sub-team lead。
- **HR advisory-only:** HR 不碰任何 agent/memory 文件, 只出"执行(待 CEO 批准)：…"建议。
- **颗粒度双镜头在 HR 内:** 成本镜头(cost-evaluator, 又贵又宽→拆)与效率镜头(perf-evaluator, 死重/过深→剪)同属 HR, 拉同一根轴=组织颗粒度; head 合成 cut/add/hold 时保留镜头分歧, 入口是 `org-rebalance` skill (skills/hr/)。agent 无恐惧, 评估是测量非威慑。招募请求一律过 HR 审批门; 全程 advisory, CEO 拍板。
- **横向不设组长:** 验/造/策/擎(backend) 直挂 CTO（拍平先例）。backend 起步 1 人不设 lead, 第二人触发后再评估升格 sub-team。COO 线同理拍平：巡/analyst/检直挂 COO, 不成团不设 lead。
- **COO 提案权 ≠ 技术裁决权:** COO 可向 dev/CTO 提产品方向, 架构/技术可行性裁决仍在 architect/CTO; COO 保留 release go/no-go，检只执行全测与交证据；对外发布动作一律 CEO 过手。
- **巡/analyst 接缝:** 自家 repo 指标 + Weekly COO Report + PuPu P0/P1/P2 行动清单独家归巡; analyst 只碰外部数据、只产情报/选项。一份 brief 不出现两个人的 PuPu 行动计划。
- **analyst 利用率复评点:** 建编 4 周后/首 3 份简报后由考评官核利用率, 低则走裁撤双证退回 bounded skill（2026-08-18 前后触发）。同时监控发布逃逸率, 为"release 决策是否升格给验"留触发条件。

## 文件结构（agents/ 镜像组织树）

```
agents/
├── cto/{pupu-cto.md, pupu-architect.md, chat-experience/, config-extension/, platform-security/, direct/}
├── coo/{pupu-coo.md, pupu-growth-ops.md, pupu-market-analyst.md, pupu-release-full-test.md}
├── ai/{pupu-llm-expert.md, pupu-ai-researcher.md}
└── hr/{pupu-hr-head.md, pupu-hr-org-architect.md, pupu-hr-performance-evaluator.md, pupu-hr-cost-evaluator.md}
```

## 近期组织变更史

- 2026-06-09: CEO 定 4 线直汇报（CTO/llm-expert/product-ops/growth-ops）+ dev team。
- 2026-06-10: 引入 security-expert「守」; 首次全面安全调查（findings 被 CEO 接受现状）。
- 2026-06-10: **reorg** — 顶层收敛为 3 线（CTO/COO/智）; product-ops 升 COO 改名 pupu-coo 收编 growth-ops; CTO 下分 3 sub-team 各设 lead + 3 横向直挂; agents/ 重组为镜像组织树。
- 2026-06-10: **HR 部门成立**（advisory, 3 角色）。
- 2026-06-10: **建 backend dev「擎」(pupu-dev-backend)**, 横向直挂 CTO, 拥有 unchain_runtime/server + unchain core, 填补后端 0-owner 真空（HR 首次实战建议 + 三方会, CEO 批准）。第二人触发条件见 agent charter。
- 2026-07-21: **COO 业务操盘手重定义 + 建 market-analyst**（CEO 授权扩编, HR 双报告设计, 最小增量裁决）— COO 升格业务操盘手（盈利/方向提案权/GTM）, release 拆函数不拆角色（决策留 COO、执行下沉验/擎/守, 不新建 release-manager）; 新建 pupu-market-analyst 直挂 COO 管向外情报（不成团/不设 lead/暂不建 marketing 角色, YAGNI）。
- 2026-07-23: **建 release-full-test「检」**（CEO 明确批准）— 新增固定响应 3-parallel/20m agent long-run 与 6-cell 真实模型付费矩阵后，完整发版测试已成为高重复、强证据链的独立执行负担；因此直挂 COO 新建操作型专员。它不是 release-manager，不拿裁决权、不改产品代码、不替代验/擎/守；COO 继续作最终 go/no-go。同期花名册审计补回此前漏记但早已存在的 `pupu-architect` 与 `pupu-ai-researcher`；实际 active charters 21→22（只有检是本次新增）。
- 2026-08-04: **建 CFO/finance 线「财」**（CEO 直接指令）— 新增第 5 条线, 直报 CEO, 与 HR 对向。`pupu-cfo`(head, 财务/token 经济账, 加力=拆分/隔离提案) + `pupu-cfo-cost-analyst`(多信号量化每 agent token 成本、找又贵又宽的拆分候选)。同期重定位 HR 为剪力 + 给 hr-head 加"招募审批门"; 把"加力(CFO) vs 剪力(HR)、裁组织颗粒度"的混合评估写成 CEO 直属 skill `ceo-org-rebalance`。active charters 22→24。
- 2026-08-04 (同日晚些): **CFO 线建而复撤, 并入 HR** — CEO 判定: agent 无恐惧无立场, 对向两线的制衡形式是给人设计的, 两个测量镜头就够。撤 pupu-cfo / pupu-cfo-cost-analyst(从未被派发过), 新建 `pupu-hr-cost-evaluator` 挂 HR 与绩效考评官平行; `ceo-org-rebalance` 降级改名为 HR 部门 skill `org-rebalance`(skills/hr/), 三镜头(成本/效率/结构)全在 HR 内、head 合成。active charters 24→23, 回到 4 线。
