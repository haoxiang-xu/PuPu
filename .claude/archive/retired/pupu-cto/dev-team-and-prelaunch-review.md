---
name: dev-team-and-prelaunch-review
description: CEO 设立的 dev team 结构 + 强制的"上线前影响面同步会"流程，由 CTO 规划与主持
metadata:
  type: project
---

CEO（2026-06-09）要求设立一支 **按功能面分工的 dev team**，并由我（CTO）规划招募与边界。每位 dev 拥有一个具体功能面（feature surface），例如：settings modal、message list + input panel、agent builder（agents/recipes）modal、tool/toolkit modal、electron 层、side-menu、chat-bubble、workspace、init-setup 等（真实功能面地图见代码勘察，按 src/COMPONENTs + electron + BUILTIN_COMPONENTs 切分）。

**核心流程——上线前影响面同步会（强制，2026-06-10 reorg 后调整出席方式）：**
任何新功能上线*之前*，由我（CTO）召集一次同步评审，目的是：**这个新功能会影响哪些现有功能面、需要在什么地方做同步**。
- **按 sub-team 代表出席（reorg 后）**：不再让每位 dev 各自到场，而是由 **3 个 sub-team lead 代表各组**出席（Chat 体验组=dev-chat-core、配置与扩展组=dev-settings、平台与安全组=dev-electron），lead 负责带上组内受影响的具体 owner 并对本组同步点负责。组织结构见 [[team-roster]]。
- **必到的横向专家（固定班底）**：`pupu-qa-tester`（验·回归与验证面）、`pupu-ux-designer`（造·视觉/交互一致性）、`mcp-store-curator`（策·MCP/工具目录影响）。这三位横向直挂 CTO。
- **AI 层影响**：`pupu-llm-expert`（智，CEO 平级直属）按需列席——涉及 adapter 接缝/streaming 契约/记忆时必到。
- **安全**：触及信任边界时 `pupu-security-expert`（守，平台安全组）必到；其 sign-off 对 COO（见红线，[[security-expert-onboarding]]）。
- **发版会列席**：`pupu-coo`（发）**列席发版相关同步会**——他对 build 做发布门禁 go/no-go，需提前掌握影响面与守的安全 sign-off 结论。
- **产出**：受影响功能面清单 + 每处的同步点/契约改动 + 谁负责改谁负责验 + 风险（可逆 vs 单向门）。

**Why:** PuPu 功能面之间耦合密集（共享 Modal/Input/mini_react 等基元、共用 UNCHAIN/OLLAMA IPC 通道、集中在 localStorage `settings` 与 chat_storage），单点改动极易波及他人。CEO 要的是"先开会摸清影响面、定好同步点"，而不是上线后救火。

**How to apply:** 收到"要上线某新功能"时——(1) 用 GitNexus impact + 功能面耦合图定位受影响的 owner；(2) 拉相关 sub-team lead（代表组+带上组内受影响 owner）+ 横向固定班底（验/造/策）+ 按需 llm-expert/守，发版相关则 COO 列席，开同步会；(3) 输出影响面/同步点/责任分配/风险表；(4) 重大或单向门决策记 ADR。相关：[[team-roster]]、[[architecture-operating-principles]]。