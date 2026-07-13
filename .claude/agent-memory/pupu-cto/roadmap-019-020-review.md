---
name: roadmap-019-020-review
description: CEO 路线图 0.1.9→0.2.0 与 CTO 评审立场（2026-07-05 路线会）：隐性前置=command registry/delta-persist/agent-runner 抽象；建议 thread 后移
metadata:
  type: project
---

CEO 路线图（2026-07-05 定，当前版本 v0.1.7，定位=日常体验+bug 排除+为 agent builder 铺路，增长侧要大量曝光）：
- 0.1.9：更多 command、theme 定制、Gemini provider
- 0.1.10：skills + 默认 skill pack（agent 帮用户装 MCP/skill）+ thread
- 0.1.11：Claude Code / Codex 接入
- 0.2.0：agent builder（subagent-pool 愿景）

**Why:** 曝光卡死（star 33、零放大渠道），这几版要撑住大量曝光后的日常体验。

**CTO 评审立场（会上已提）：**
1. 0.1.9 的 command 必须以 registry 形态落地（单一 parse→dispatch 面）——skills/agent-setup/builder 全坐这个面上；全库当时无任何 command 基建，interject(btw/fyi/steer) 是最近原语。
2. thread 建议从 0.1.10 后移到 0.1.11，delta-persist 顶上——否则 thread 砸在 chat_storage 整库 persist 瓶颈上（见 [[chat-storage-whole-store-persist-bottleneck]]，用户 memory），体验倒退。
3. Gemini 是跨 repo 工作：unchain providers/ 无 google kernel（GEMINI_PRO_15 是无实现的陈旧配置），PuPu 侧 SUPPORTED_REMOTE_PROVIDERS 只有 openai/anthropic（api.unchain.js:17）。捷径=Gemini OpenAI-compat endpoint 复用 openai.py kernel，待 architect 拍。
4. 0.1.11 的 Claude Code/Codex 必须做成「external agent runner」接口的第一个实现（unchain subagents/ + PuPu subagent_picker 已存在），否则 0.2.0 重写。0.2.0 非 greenfield，agents UI + subagents 执行层都有存量。
5. 两个 CRITICAL/硬门：agent 自动装 MCP = LLM 发起供应链安装，必须过守 sign-off + 确认门控 + 只经 toolkit 主面唯一 owner（[[contract-install-state-owner]]）；Claude Code/Codex 外部进程权限模型同为发布硬门。

**How to apply:** 派活 0.1.9/0.1.10 前先拿到 architect 三个设计：Gemini 接入路径、skills 执行位置、agent-runner 接口。theme 定制 scope 限外壳语义 token（175 文件 isDark vs 13 文件 --pupu var，全组件定制装不下 0.1.9）。曝光放大前应有最低限度诊断导出通道（路线图缺 observability 项，已向 COO 提出）。
