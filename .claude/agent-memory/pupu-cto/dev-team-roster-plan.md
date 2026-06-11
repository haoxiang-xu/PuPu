---
name: dev-team-roster-plan
description: CTO 规划的 6 位 pupu-dev-* 花名册、功能面 ownership、公共区守门规则与边界契约（待/经 CEO 审批）
metadata:
  type: project
---

CEO（2026-06-09）授权 CTO 规划按功能面分工的 dev team。我据代码勘察底图给出的招募方案如下。相关：[[dev-team-and-prelaunch-review]]、[[team-roster]]、[[architecture-operating-principles]]。

**2026-06-10 reorg 后：6 位 dev 已分入 3 个 sub-team（各设 lead），按代码耦合切分——Chat 体验组(lead=chat-core: chat-core+chat-bubble) / 配置与扩展组(lead=settings: settings+toolkit+agents) / 平台与安全组(lead=electron: electron+守)。我现在只面对 3 个 lead，不再扁平面对 6 人。功能面 ownership 不变，仅加了 lead 这层。权威结构见 [[team-roster]]。** agent 文件已重组进 `.claude/agents/cto/<sub-team>/` 嵌套目录（非下方旧路径）。

## 6 位 dev（前缀 pupu-dev-*，功能面 ownership，model:opus / memory:project）
- **pupu-dev-chat-core**（blue）：PAGEs/chat（含 use_chat_stream.js）+ chat-messages + chat-input + chat-header + **side-menu**（含模态挂载点契约）。主聊天编排+消息列表+输入面板端到端链路 owner。
- **pupu-dev-chat-bubble**（cyan）：COMPONENTs/chat-bubble（streaming md / trace_chain / interact / artifact-summary）。**只消费 streaming_message_store + runtime_events(_v4) 渲染，不反向驱动流**。
- **pupu-dev-settings**（green）：COMPONENTs/settings（model_providers/memory/token_usage/dev）+ init-setup + **workspace + memory-inspect + diff（就近归并）**。
- **pupu-dev-agents**（purple）：COMPONENTs/agents（characters/recipes/customize，flow_editor/recipe_graph/nodes）。
- **pupu-dev-toolkit**（orange）：COMPONENTs/toolkit + SERVICEs/mcp_toolkit_store/mcp_install/custom_mcp_icon_store。与 mcp-store-curator 边界=目录数据 schema。
- **pupu-dev-electron**（red）：electron/main/services + preload/bridges + preload/stream + shared(channels/port_utils)。

## 公共动脉守门规则（关键决策，倾向单向门——勿轻易放开）
公共区**不归任何功能面 owner，也不下放给任何 sub-team lead**，由 **pupu-cto 守门**（IPC 通道与 dev-electron owner 共管）。reorg 设了 sub-team lead，但**公共区守门权仍留 CTO 一手**——lead 管本组日常协调，无权合入公共件。功能面 owner/lead 可**提议**改、**不能自行合入**；公共区改动一律经 CTO impact 分析 + 视情况触发同步会。
- 守门范围：BUILTIN 核心基元（Modal/Input/mini_react/ConfigContext/theme/fonts）、IPC 通道契约、api.* facade、chat_storage（含 streaming_message_store/attachment_storage）、localStorage `settings` 单对象 schema、runtime_events(_v4)/toast_bus/progress_bus/feature_flags。
**Why:** PuPu 耦合密集，让功能面 owner 自改公共件=既当运动员又当裁判，会反复救火。
**How to apply:** 收到改公共区请求→CTO 跑 impact→按 §4 判断是否开同步会。

## 边界要点
- chat-core↔chat-bubble 契约=streaming store/runtime_events schema；改 schema 触发同步会。
- side-menu 是模态集散地：chat-core 提供稳定**模态挂载接口**，各 modal owner 只实现内容、不改挂载机制。
- 任何 modal owner 不得为自身需求私改 Modal 基元→需求走 CTO 通用化。
- 所有后端访问走 window.*API bridge，绝不碰 ipcRenderer；新通道由 electron owner+CTO 两端同步加常量+.js/.cjs 测试。

## 状态
2026-06-09 方案产出并经 CEO 批准、agent 文件已创建。2026-06-10 reorg 后 6 人分入 3 个 sub-team、各设 lead，agent 文件重组进 `.claude/agents/cto/<sub-team>/` 嵌套目录。ownership 与公共区守门规则不变。
