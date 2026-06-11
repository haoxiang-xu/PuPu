---
name: boundary-pupu-server-vs-unchain
description: PuPu unchain_runtime/server (Flask adapter) vs unchain repo (core lib) — verified boundary, editable link, events_v4 contract
metadata:
  type: project
---

PuPu `unchain_runtime/server/` 与 unchain repo 是**库消费关系，不是镜像**（2026-06-10 实地核实）。

**事实：**
- PuPu server = 70 文件 / 28823 行 Flask 适配层，是该层**唯一真实副本**。unchain repo 内的 `unchain_runtime/` 是空壳（只有空 `tests/`），不要被它误导成"镜像/同步"。
- 边界是干净的 Python import 边界：PuPu server `from unchain.memory.*` / `unchain.agent.*` / `unchain.subagents.*` / `unchain.toolkits.*` 消费 unchain 库（pyproject name=`unchain` v0.2.0）。
- 链接方式：editable install，`.venv-unchain-build/.../__editable__.unchain-0.2.0.pth` 指向 sibling repo `/Users/red/Desktop/GITRepo/unchain/`。改 unchain src 即时反映到 PuPu，无需重装。
- **跨 repo 契约 = `events_v4`**（unchain 发的事件协议，PuPu server 消费）。这是两 repo 的承重接缝，版本要协同。

**Why:** CEO 2026-06-10 扩编会要厘清"一个 dev 组该管两者还是分开"。
**How to apply:** 两者是**不同抽象层**（核心 agent 引擎 vs 应用 Flask 适配/HTTP/SSE/MCP 编排），可由同一 backend 组拥有但要分两个 ownership 面；`events_v4` 事件协议是必须守的跨层契约。unchain repo 自带 CLAUDE.md/AGENTS.md/tests/GitNexus(独立索引 8794 symbols)，是成熟独立 repo。**2026-06-10 起这条跨 repo 承重缝由 pupu-dev-backend（擎）拥有**——跨层接口须双边 impact、禁硬编码 unchain path、unchain core 接口改动智+CTO 双签，详见 [[backend-dev-onboarding]]。相关 [[team_roster]] [[hiring-policy]]。
