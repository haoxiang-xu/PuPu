---
name: contract-toolkit-catalog-shared-id-space
description: 跨功能契约——toolkit/MCP catalog 的 toolkitId + enabled_tools 是 chat-input、recipe tool pool、settings 共用的 ID 空间，改它会跨面波及
metadata:
  type: project
---

**跨层契约：toolkit catalog 的 `toolkitId` + `enabled_tools` 是一个被多个功能面共用的 ID 空间。**
catalog 通过 `api.unchain.listToolModalCatalog()`（及 getToolkitCatalog）暴露 `{ toolkits:[{toolkitId, ...}], artifactKinds, count, source }`，由 `window.unchainAPI` 经 ~25 个 UNCHAIN.*MCP* IPC 通道供给（见 electron/shared/channels.js 与 unchain_bridge.js）。

**共同消费者（改 catalog/ID/tool 名即跨面波及）：**
- chat-input：`hooks/use_chat_input_toolkits.js` + `utils/build_toolkit_options.js`/`filter_toolkits.js`（聊天里选工具）。
- chat-bubble：tool-confirmation + trace 帧（`pending_confirmation_trace_frames.js`，runtime_events_v4），按 tool_call/tool_name 渲染。
- settings：`local_storage/components/mcp_toolkits_section.js` + `dev/components/mcp_registries_modal.js`。
- toolkit modal：installed/store/custom_mcp 页 + `mcp_toolkit_store.js`（`withMcpStoreIcon`）。
- **agents/recipes（关键、易被忽略）：** `pages/recipes_page/detail_panel/toolpool_panel.js` 直接调 `api.unchain.listToolModalCatalog()` 与 `withMcpStoreIcon`，节点类型 `toolkit_pool` 按 `{id, enabled_tools}` 引用 toolkit。**所以 agent builder 即使延期，recipe 仍按同一 toolkitId/tool 名持久化引用——MCP 改 ID/卸载工具会让已存 recipe 引用悬空。**

**Why:** MCP 上线在重塑这套 catalog 与 ID/批准语义，而它被 6+ 个面共用，单点改动易跨面破坏；recipe 把引用*持久化*进 recipe 数据，是延期功能里唯一会被 MCP 改动“反向打到”的存量数据。

**How to apply:** (1) 任何 catalog schema / toolkitId / tool 名 / 批准语义改动 → 触发上线前同步会，必拉 toolkit+chat-input+chat-bubble+settings owner + llm-expert + curator。(2) MCP 上线务必定义 toolkitId **稳定性/迁移**策略（删除/改名→存量 recipe 引用怎么办），否则是单向门——**该策略已于 2026-06-09 同步会落定，见 [[adr-toolkitid-stability]]**（全局稳定·发布即冻结·永不复用·软删·迁移须带回归测试，单向门 CTO+curator 双签）。相关：[[dev-team-and-prelaunch-review]]、[[dev-team-roster-plan]]、[[meeting-mcp-launch-2026-06-09]]。
