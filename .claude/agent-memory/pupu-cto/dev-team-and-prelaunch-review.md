---
name: dev-team-and-prelaunch-review
description: CEO 设立的 dev team 结构 + 强制的"上线前影响面同步会"流程，由 CTO 规划与主持
metadata:
  type: project
---

CEO（2026-06-09）要求设立一支 **按功能面分工的 dev team**，并由我（CTO）规划招募与边界。每位 dev 拥有一个具体功能面（feature surface），例如：settings modal、message list + input panel、agent builder（agents/recipes）modal、tool/toolkit modal、electron 层、side-menu、chat-bubble、workspace、init-setup 等（真实功能面地图见代码勘察，按 src/COMPONENTs + electron + BUILTIN_COMPONENTs 切分）。

**核心流程——上线前影响面同步会（强制）：**
任何新功能上线*之前*，由我（CTO）召集一次同步评审，目的是：**这个新功能会影响哪些现有功能面、需要在什么地方做同步**。
- **必到的 dev**：所有 ownership 与该改动有耦合的功能面 owner（通过共享 BUILTIN 基元、共用 IPC 通道、读写同一 storage 判断耦合）。
- **必到的跨职能专家（固定班底）**：`pupu-llm-expert`（AI 层影响）、`pupu-ux-designer`（视觉/交互一致性）、`mcp-store-curator`（MCP/工具目录影响）、`pupu-qa-tester`（回归与验证面）。
- **产出**：受影响功能面清单 + 每处的同步点/契约改动 + 谁负责改谁负责验 + 风险（可逆 vs 单向门）。

**Why:** PuPu 功能面之间耦合密集（共享 Modal/Input/mini_react 等基元、共用 UNCHAIN/OLLAMA IPC 通道、集中在 localStorage `settings` 与 chat_storage），单点改动极易波及他人。CEO 要的是"先开会摸清影响面、定好同步点"，而不是上线后救火。

**How to apply:** 收到"要上线某新功能"时——(1) 用 GitNexus impact + 功能面耦合图定位受影响的 owner；(2) 拉上述固定班底 + 相关 owner 开同步会；(3) 输出影响面/同步点/责任分配/风险表；(4) 重大或单向门决策记 ADR。相关：[[team-roster]]、[[architecture-operating-principles]]。