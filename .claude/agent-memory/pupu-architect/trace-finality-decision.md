---
name: trace-finality-decision
description: 2026-06-20 trace #155/#66 finality 重评定案——partial-yes:NOW finality 字段是重构真子集(保留95%),前端 typed-tree 与后端 snapshot 押后(与timeline无关的硬理由),后端OWN terminal=单向门
metadata:
  type: project
---

2026-06-20 CEO 直接重评昨天的 trace chain #155/#66 分步决策(只有架构师参与)。新约束:① 项目无 release timeline("先修后重构以尽快交付"理由失效);② CEO 反对白烧 token 做会被重构吃掉的中间工作;③ llm-expert 当天已签 v4-兼容 finality 契约(见 [[finality-ownership-contract 在 pupu-llm-expert 目录]])。

**定案 = PARTIAL YES,不是 one-shot 全重构。**

**经济账(推翻 CEO"白烧 token"前提):** NOW-fix 的核心产物——显式 `finality` 字段 + settle 时打标 + segment 级 terminal 命中判据(替换 line-727 `frames.some(type==="tool_call")` 启发式)+ cancel→draft 规则——是重构的**真子集**,不是废工。因为 llm-expert 把 `terminal` 设计成 v4 前向兼容锚点(v4 必须 1:1 映射、只加不改),NOW 的 finality 字段**本就是重构的第一刀**。估计 NOW-work ~90-95% 被后续 typed-view-model 重构保留(数据契约层全留),仅渲染消费方式从"读 frames"换成"读 typed model"——那部分本来分步/一步都要写一次,不构成重复。故分步并不更费 token,CEO 前提**不成立**。

**哪些分步理由失效 vs 仍成立(Codex run3 分类,我背书):**
- 失效(timeline 依赖):J1 尽快交付;J4 契约未签(现已签)。
- 仍成立(与 timeline 无关):J2 小 diff 易审易回滚;J3 A2A 未上 roadmap 前建 typed-TREE 有过度设计风险(模型正确性问题,非时间问题);J5 灰度保留 legacy trace_chain.js 降迁移风险;J6 后端 OWN terminal 归属是难逆转的权威迁移,应等 A2A 定因果模型再动。

**一步到位做到哪层(范围边界):**
- 做 NOW finality 数据契约(字段+打标+segment命中+cancel→draft)——可逆,这是真子集,现在做。
- 渲染层只做**最小权威结构**:让 chat-bubble 读 segment 级 finality 选终答,**不建完整 typed-TREE**。PuPu 当前是 parent→worker TREE 且子链 `bubbleOwnsFinalMessage=false`,无 many-to-many;A2A 未上 roadmap,建 typed-tree=押注未设计的形状=过度设计。可逆。
- 后端:**最多发 finality SIGNAL(便宜、可逆)**;**禁止现在让后端 OWN 权威 terminal snapshot**——那是单向门(权威一旦移到后端,前端退化为哑渲染,A2A 因果模型未定前不可逆)。
- 完整 A2A typed-tree + 后端 snapshot 权威:押后,触发线=真·A2A/多对多上 roadmap。

**单向门登记:** "后端 OWN 权威 terminal 归属/per-turn snapshot" = ONE-WAY-DOOR,A2A 因果模型签字前不得跨。NOW 全部工作 = 可逆。

**取证质量警示:** 本次三路 Codex 5.5 并行严重退化——codex `architect` profile 的 MCP server 持续 `Auth(AuthorizationRequired)` 传输失败,多次重试仅 run3(timeline 分类)产出干净答案,其余 die-on-startup 或被 superpowers skill 带偏成 repo-grep。结论靠 run3 + 我自取的一手代码取证(line727 启发式、settleStreamingAssistantMessages 纯函数2调用方、递归子链 bubbleOwnsFinalMessage=false)。下次跑 codex 前先确认 MCP auth;GitNexus CLI 本次也因 npx 缓存冲突不可用,blast radius 为手工评估。
