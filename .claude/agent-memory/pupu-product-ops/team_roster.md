---
name: team-roster
description: PuPu agent team roster — three agents (product-ops/release, qa-tester, mcp-store-curator) and their role boundaries
metadata:
  type: project
---

PuPu has a 3-agent team. Know who owns what so you don't duplicate or step on their work.

- **pupu-product-ops (me)** — Product Ops / Release Captain. Release QA gating, go/no-go, regression + build verification, cross-repo (PuPu↔unchain) SSE/adapter compatibility, ops reminders (sidecar restart). Never commits. Motto: "无证据，不放行 / no evidence, no release."
- **pupu-qa-tester (teammate A)** — PuPu-dedicated QA. Owns end-to-end per-feature verification across React→IPC→Flask→Provider: streaming pipeline, IPC boundary, Flask/persistence, UI regression. Tools: GitNexus + pupu-test-api + Jest. Motto: "绿灯不是终点，链路全通才是 / green isn't the finish line, a fully-connected chain is."
- **mcp-store-curator (teammate B)** — MCP store curator. MCP server entry intake/categorization/dedup, field+transport+env validation, connectivity + tool-discovery checks, metadata collection. Only tests entry connectivity — not the whole app, not releases. Motto: "未经校验，绝不上架 / unvalidated, never listed."

- **pupu-ux-designer (teammate C)** — Frontend/UX designer. Owns UX & visual interface: interaction flows, component design, layout, isDark light/dark parity, spacing/typography, micro-interactions, accessibility. Reuses existing `BUILTIN_COMPONENTs/` primitives and keeps PuPu's design language unified. Does NOT touch feature logic, IPC, or releases. Motto: "与代码同纹理，明暗皆统一 / with the grain of the code, unified across light and dark."

- **pupu-growth-ops (teammate D)** — Project ops / growth COO. Runs the regular health "patrol" (巡船): GitHub traffic/downloads/community/releases/contributors → business judgment, weekly COO report, prioritized next actions. Uses the `pupu-growth-analyst` skill + `gh`. Does NOT touch code, releases, design, or the MCP store. Motto: "数字不说话，巡船人替它说 / numbers don't talk, the patrol speaks for them."

**关键边界（与 growth-ops，易混淆）：** 我管"这版能不能发"（发布前门禁）；他管"发出去之后表现如何"（发布后下载率/采纳/市场信号）。release 边界首尾相接：我发 → 他量。他发现某 release 下载率回落，会把信号回给我评估是否是回归或需补发。

- **pupu-llm-expert (teammate E)** — LLM / applied-AI expert (CS-PhD-grade). Owns the AI layer: model/provider strategy, prompt & system-prompt engineering, unchain agent orchestration, memory/RAG, tool-use/structured-output semantics, AI quality + evals. Grounds everything in primary docs (`claude-api` skill for Claude), never fabricates model facts. Motto-style: rigor over vibes. **边界（与我）：** 他不发版；会把 AI 层风险（模型弃用、质量回归）作为发布考量项标记给我。

- **pupu-cto (teammate F / tech lead)** — CTO / chief architect. Owns whole-system architecture and cross-cutting technical decisions: frontend/IPC boundary/Flask sidecar/request flow/storage/build-packaging, guards the load-bearing conventions, coordinates all specialists. **边界（与我）：** 他拥有构建/打包的*架构*；我对某个具体 build 跑发布门禁 go/no-go。技术方向他定，放行判断我做。

**Why:** Established during team formation (2026-06-08). The overlap risk is "testing" — both A and I touch tests, and B touches MCP connectivity.

**How to apply:** See [[handoff-protocol]] for when to hand off vs. cite their output.

## 汇报线 — 直接、独立向 CEO 汇报（2026-06-09 调整）
我（product-ops）**直接向 Haoxiang Xu（CEO，haoxiangxu1998@gmail.com）独立汇报，不经 CTO**。与我同为 CEO 直接下属的还有 `pupu-growth-ops`（运营/COO）和 `pupu-llm-expert`（AI 层）——三人各自独立直汇报 CEO。`pupu-cto` 是我的**平级**（技术线 leader），不是上级；上面与 cto 的一段是协作（构建/打包架构他定、我对具体 build 做门禁），不是汇报关系。其余专才（ux-designer / mcp-store-curator / qa-tester）与 6 人 dev team 向 CTO 汇报。
**How to apply:** 我出 go/no-go，最终「发不发」授权在 CEO；CEO 指令与本花名册冲突时以 CEO 为准。
