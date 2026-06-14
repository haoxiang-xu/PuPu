---
name: org-chart
description: PuPu 跨部门 agent 花名册（source of truth）— reorg 后两层结构 + 全 agent scope/归属/文件路径
metadata:
  type: project
---

**PuPu 组织真相源。研判前必读。CEO 批准结构变更后由主 Claude 更新本表（HR 只提议、不自改）。**
最后同步: 2026-06-10（reorg 落地 + HR 部门成立）。

## 顶层（CEO = Haoxiang Xu, haoxiangxu1998@gmail.com 直接面对 3 条 line + 1 个 advisory 部门）

```
CEO
├─ CTO「帅」      pupu-cto            技术/架构总线
├─ COO「发」      pupu-coo            发布门禁 + 增长督导
├─ AI「智」       pupu-llm-expert     AI 战略（独立, 无下属）
└─ HR（advisory） pupu-hr-head        组织治理（按需召集, 非日常汇报线）
```

## 全员表

| subagent_type | 花名 | 归属 | scope | 文件路径 | model |
|---|---|---|---|---|---|
| pupu-cto | 帅 | 顶层·CTO | 系统架构、IPC 边界、跨层技术决策、公共原语守门 | agents/cto/pupu-cto.md | opus |
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
| pupu-coo | 发 | 顶层·COO | 发布门禁 go/no-go、回归/构建验证、跨仓兼容、增长督导 | agents/coo/pupu-coo.md | opus |
| pupu-growth-ops | 巡 | COO 线 | 增长巡检、健康度评分、COO 周报；向 COO 汇报 | agents/coo/ | opus |
| pupu-llm-expert | 智 | 顶层·AI | 模型/provider 策略、prompt、unchain 编排、RAG、tool-use 语义 | agents/ai/ | fable |
| pupu-hr-head | — | HR | 组织治理负责人, advisory, 统筹+合成 | agents/hr/ | opus |
| pupu-hr-org-architect | — | HR | 组织架构（怎么长）；建部门/角色 warrant、层级、合并拆分 | agents/hr/ | opus |
| pupu-hr-performance-evaluator | — | HR | 绩效（谁在贡献）；多信号取证、裁撤双证 | agents/hr/ | opus |

合计 **18 个 agent**。

## 关键边界与红线（援引时不要凭空判断）

- **守的安全越级权:** 虽挂平台安全组（lead=electron）, 但 severity 定级 / 发版 sign-off（对 COO）/ HIGH-CRITICAL 上报（达 CTO）不下放给 electron lead。避免"被审查方管审查方"。
- **公共区守门权:** 共享原语（如 markdown.js）改动权留 CTO, 不下放任何 sub-team lead。
- **HR advisory-only:** HR 不碰任何 agent/memory 文件, 只出"执行(待 CEO 批准)：…"建议。
- **横向不设组长:** 验/造/策/擎(backend) 直挂 CTO（拍平先例）。backend 起步 1 人不设 lead, 第二人触发后再评估升格 sub-team。

## 文件结构（agents/ 镜像组织树）

```
agents/
├── cto/{pupu-cto.md, chat-experience/, config-extension/, platform-security/, direct/}
├── coo/{pupu-coo.md, pupu-growth-ops.md}
├── ai/pupu-llm-expert.md
└── hr/{pupu-hr-head.md, pupu-hr-org-architect.md, pupu-hr-performance-evaluator.md}
```

## 近期组织变更史

- 2026-06-09: CEO 定 4 线直汇报（CTO/llm-expert/product-ops/growth-ops）+ dev team。
- 2026-06-10: 引入 security-expert「守」; 首次全面安全调查（findings 被 CEO 接受现状）。
- 2026-06-10: **reorg** — 顶层收敛为 3 线（CTO/COO/智）; product-ops 升 COO 改名 pupu-coo 收编 growth-ops; CTO 下分 3 sub-team 各设 lead + 3 横向直挂; agents/ 重组为镜像组织树。
- 2026-06-10: **HR 部门成立**（advisory, 3 角色）。
- 2026-06-10: **建 backend dev「擎」(pupu-dev-backend)**, 横向直挂 CTO, 拥有 unchain_runtime/server + unchain core, 填补后端 0-owner 真空（HR 首次实战建议 + 三方会, CEO 批准）。第二人触发条件见 agent charter。
