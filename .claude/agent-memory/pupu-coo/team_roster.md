---
name: team-roster
description: PuPu agent team roster — COO (me, =发), my direct report growth-ops (巡), and the rest of the org with role boundaries
metadata:
  type: project
---

PuPu org. Know who owns what so you don't duplicate or step on their work.

- **pupu-coo (me / 发)** — COO. **2026-06-10 reorg: 原 pupu-product-ops「发」升格为 COO，agent 改名 pupu-coo，旧路径 agent-memory/pupu-product-ops 已废弃，只读写 agent-memory/pupu-coo/。** 我现在是 CEO 的 3 个直接下属之一（另两位：CTO「帅」、llm-expert「智」）。**下辖 growth-ops「巡」**（原直汇报 CEO，现向我汇报）。职责 = 原有 release engineering / QA validation / 发布门禁 go-no-go（保留）+ 新增对增长运营线（巡）的督导。仍是发布门禁负责人，仍 never commits。Motto: "无证据，不放行 / no evidence, no release."
- **pupu-qa-tester (teammate A)** — PuPu-dedicated QA. Owns end-to-end per-feature verification across React→IPC→Flask→Provider: streaming pipeline, IPC boundary, Flask/persistence, UI regression. Tools: GitNexus + pupu-test-api + Jest. Motto: "绿灯不是终点，链路全通才是 / green isn't the finish line, a fully-connected chain is."
- **mcp-store-curator (teammate B)** — MCP store curator. MCP server entry intake/categorization/dedup, field+transport+env validation, connectivity + tool-discovery checks, metadata collection. Only tests entry connectivity — not the whole app, not releases. Motto: "未经校验，绝不上架 / unvalidated, never listed."

- **pupu-ux-designer (teammate C)** — Frontend/UX designer. Owns UX & visual interface: interaction flows, component design, layout, isDark light/dark parity, spacing/typography, micro-interactions, accessibility. Reuses existing `BUILTIN_COMPONENTs/` primitives and keeps PuPu's design language unified. Does NOT touch feature logic, IPC, or releases. Motto: "与代码同纹理，明暗皆统一 / with the grain of the code, unified across light and dark."

- **pupu-growth-ops（巡 / 我的直接下属）** — Growth/项目运营. Runs the regular health "patrol" (巡船): GitHub traffic/downloads/community/releases/contributors → business judgment, weekly growth report, prioritized next actions. Uses the `pupu-growth-analyst` skill + `gh`. Does NOT touch code, releases, design, or the MCP store. **2026-06-10 reorg: 巡原本直汇报 CEO，现向我（COO）汇报。** 我把巡的增长巡检纳入运营视野；重大增长信号 + 发版决策一起对 CEO 负责。Motto: "数字不说话，巡船人替它说 / numbers don't talk, the patrol speaks for them."

**关键边界（与 growth-ops，易混淆）：** 我管"这版能不能发"（发布前门禁）；巡管"发出去之后表现如何"（发布后下载率/采纳/市场信号）。release 边界首尾相接：我发 → 巡量 → 信号回我。巡发现某 release 下载率回落，把信号回给我评估是否回归或需补发。作为他的上级，我对巡的巡检节奏/优先级督导，重大信号由我汇总上呈 CEO。

- **pupu-llm-expert (teammate E)** — LLM / applied-AI expert (CS-PhD-grade). Owns the AI layer: model/provider strategy, prompt & system-prompt engineering, unchain agent orchestration, memory/RAG, tool-use/structured-output semantics, AI quality + evals. Grounds everything in primary docs (`claude-api` skill for Claude), never fabricates model facts. Motto-style: rigor over vibes. **边界（与我）：** 他不发版；会把 AI 层风险（模型弃用、质量回归）作为发布考量项标记给我。

- **pupu-cto (teammate F / tech lead)** — CTO / chief architect. Owns whole-system architecture and cross-cutting technical decisions: frontend/IPC boundary/Flask sidecar/request flow/storage/build-packaging, guards the load-bearing conventions, coordinates all specialists. **边界（与我）：** 他拥有构建/打包的*架构*；我对某个具体 build 跑发布门禁 go/no-go。技术方向他定，放行判断我做。

- **pupu-security-expert（守 / teammate G）** — Security expert. 默认模型 Fable 5。严格防御性。Owns: Electron 加固、IPC 边界安全、Flask sidecar 攻击面、秘密处理、MCP 工具供应链审查、LLM 层威胁防御、依赖审计与自动更新/签名公证完整性。**边界（与我，发版协作线）：** 他出 security blocker 清单 + sign-off 签字，我跑 release。涉及信任边界的变更（IPC channel、MCP 安装流、自动更新）在我的 release checklist 里**触发他的审查**；依赖审计 + 签名/公证完整性进入我的发版门槛。详见 [[handoff-protocol]]。

**Why:** Established during team formation (2026-06-08). The overlap risk is "testing" — both A and I touch tests, and B touches MCP connectivity.

**How to apply:** See [[handoff-protocol]] for when to hand off vs. cite their output.

## 汇报线 — COO 直接下属（2026-06-10 重组，覆盖 06-09 旧线）
我（COO「发」）**直接向 Haoxiang Xu（CEO，haoxiangxu1998@gmail.com）汇报**，是 CEO 的 3 个直接下属之一：CTO「帅」、COO「发」=我、llm-expert「智」。`pupu-cto` 是我的**平级**（技术线 leader），不是上级；与 cto 的协作是构建/打包架构他定、我对具体 build 做门禁。**我的下辖：growth-ops「巡」**（06-09 时是 CEO 直属，06-10 改为向我汇报）。其余专才（ux-designer / mcp-store-curator / qa-tester）与 dev team 向 CTO 汇报。
**How to apply:** 我出 go/no-go，最终「发不发」授权在 CEO；巡的增长信号经我汇总上呈。CEO 指令与本花名册冲突时以 CEO 为准。
---

## 2026-06-10 reorg 首次全员见面会同步（新成员认识一下）

reorg 后首次全员见面会补录。组织真相源以 HR `pupu-hr-head/org-chart.md` 为准（共 **18 个 agent**）。本次新增两拨成员，全员需认识：

**① 后端 dev「擎」= pupu-dev-backend**（2026-06-10 加入，横向直挂 CTO，与验/造/策同列，起步 1 人不设 lead）
- 拥有：PuPu backend `unchain_runtime/server/`（该适配层**唯一真实副本**）+ unchain core 独立 repo 库。填补后端长期 **0-owner 真空**。
- 起步使命：建立后端架构看护 + 执行 SEC-001 P1/P2 整改，**非重写**。
- 三权边界：vs 智=智定 spec / 模型可见行为否决权、擎定实现（纯工程重构 eval 不回归则自主 merge）；vs 守=擎是 SEC-001 整改**执行人**、守是**定级人**；vs 验=擎补后端单测、验做端到端。
- **找擎：** 任何 `unchain_runtime/server/` 后端逻辑、Flask 路由、unchain_adapter、SSE 服务端半程、MCP 后端、memory/Qdrant 接线、unchain core 改动。跨层接口（events_v4 等）须双边 impact。

**② HR 部门（advisory，3 角色，2026-06-10 成立，按需召集非日常汇报线）**
- **pupu-hr-head：** 组织治理负责人，统筹 + 合成，对 CEO 出一个声音。
- **pupu-hr-org-architect：** 组织"怎么长"——建部门/角色 warrant、层级是否过度设计、合并/拆分。
- **pupu-hr-performance-evaluator：** 绩效"谁在贡献"——多信号取证（memory-growth + git + CEO 证言 + scope-overlap），守**裁撤双证**。
- **红线：HR advisory-only，不碰任何 agent/memory 文件，只出建议（CEO 批准、主 Claude 执行）**。涉及建部门/加角色/裁撤/组织优化/协作低效找 HR。
