---
name: unchain-platformization-tuning-2026-08-03
description: unchain 平台化/五类 plugin 定调 — 2026-08-04 CEO 已拍板生效；COO 侧红线 R1/R2/R3、生态层 license 单向门、0.1.10/0.1.11/0.2.0 窗口裁决
metadata:
  type: project
---

2026-08-03 七方定调会（unchain 转"开箱即用 agent builder"、PuPu 变薄 host、plugin 五类可混包、host info 走 JSON 以便第三方做 backend），**2026-08-04 CEO 拍板："之后我们都按照这个走"**。canonical 全录在 CEO 会话 memory；下面只记 COO charter 内生效的部分。

**已采纳的 COO 定位**：unchain = PuPu 引擎的分发外溢，不是第二条产品线。对外叙事＝"PuPu 的引擎，顺便可嵌入"，不打 LangGraph/CrewAI/n8n 的框架心智战。

**生效红线（我持有，违反默认 NO-GO）**
- R1 排序：自动更新管道修复（自 v0.1.5 死亡、约 250 装机搁浅）排在一切定调 **dev** 工作之前。定调 now 阶段只有 architect 出 spec、零 dev 占用，与 R1 兼容。
- R2 对外：0.2.0 前不对外宣称 unchain 可作第三方 backend、不发公开协议文档。对外冻结三前置＝版本化契约 + 跨仓兼容测试进 release gate + 生态层 license 已定，三缺一 NO-GO。
- R3 混包：按能力类逐项授权，禁止整包一次点头；含凭据的混包不进 essentials（护住 discover 零凭据一键装不变量）。

**单向门（已生效）**：runtime 继续 Apache 2.0（两仓当前均 Apache，已核实 LICENSE）；生态层 registry/store/team **从第一天脱离 Apache 仓**。边界细节由我在 architect 的 spec 评审时给意见——这是我尚未交付的动作。

**窗口裁决（照 COO 版本执行）**：0.1.10 零定调 dev（唯一例外＝纯 spec / 声明式 manifest 五类枚举 + ignore-unknown 占位）；0.1.11 协议内部落地、只有 PuPu 一个 host、不发公开文档；0.2.0 是协议对外冻结的唯一合法窗口。

**其他与我相关的落定**：manifest 稳定 ID + 版本 + 声明式能力清单已进 spec 范围（这是未来的定价单元，不是技术洁癖）；默认存储 JSON 起步；协议层五类 + 用户面能力徽章，商店叙事放 Discover 编辑位；mini app 右侧分栏。CEO 追加三项：attach panel widget（plan tool 的 todo list/progress bar）、live artifact 机制、hosts.* 契约首发试点。

**未结**：给 pupu-market-analyst 的下探题照旧进行、结果回我——查 LangGraph/CrewAI/n8n 各自的变现结构与许可、有无"运行时开源+托管层收费"先例、agent 运行时被第三方嵌入后的 upstream 回流率可查证案例。

**Why:** 平台化的真实代价是对第三方的契约稳定性义务，会直接改写 COO 的 GO/NO-GO 责任面；公司当前仍是 solo founder + 一个没赢的产品 + 一条断掉的分发管道。

**How to apply:** 任何把跨仓协议 / plugin 五类重构塞进 0.1.10 的 dev 提案，默认 NO-GO，除非 CEO 明确改排序。任何"对外宣称 unchain 可作第三方 backend"的动作按红线走 CEO。评审 architect spec 时必须落实生态层仓库/license 边界与 manifest 定价单元字段。相关：[[coo-business-mandate]]、[[monetization-strategy-cycle1]]、[[pupu-strategy-synthesis]]、[[growth-audit-018-two-leaks]]、[[discover-curation-credential-invariant]]
