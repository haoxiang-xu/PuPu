---
name: slack-dual-entry-and-tool-name-qualification
description: Slack has two store entries (one is a needs_review placeholder); and the {server}__{tool} qualified name is added by backend, NOT by curator in the seed
metadata:
  type: project
---

**两件 2026-06-12 盘点发现的、影响未来 add 决策的事**：

1. **Slack 当前有两个条目**（都在 productivity 分类下）：
   - `mcp.productivity.slack-remote` — Slack 官方 hosted, http+OAuth(user_credentials, 25 scopes), trustLevel verified。**成品。**
   - `mcp.productivity.slack` — local stdio, `@modelcontextprotocol/server-slack`（**上游已归档**），env `SLACK_BOT_TOKEN`+`SLACK_TEAM_ID`, trustLevel **needs_review** / license "Unverified" / policySummary.reviewed=false。**半成品占位。**
   - **已执行（工作树，2026-06-13）**：两条都移到 `communication` 分类；local `mcp.productivity.slack` 软删 = `status:"deprecated"` + `installable:false` + `supersededBy:"mcp.productivity.slack-remote"`，secrets 保留（已装实例保真）。id 永久退役不复用。store browse 路径靠 mcp_toolkit_store.js 的 deprecated 过滤隐藏，已装实例走 installed-toolkit/api catalog 路径不受影响。

2. **`tool_name = {server}__{tool}` 限定前缀不在 registry seed 里**。seed 里 tools 是裸名（`post_message`/`send_message`）。限定前缀由 **backend 注册时**生成，未在 `mcp_toolkits.py`/`mcp_registry.py`/`unchain_adapter.py` 明确找到，可能在 unchain core 库（独立仓库）。
   - **风险**：两个 Slack 条目若都注册成 `slack__send_message` 会工具名撞名。
   - **How to apply**: 同一 server 出多条目、或新增聊天类条目时，先跟 backend dev（擎）对齐前缀生成规则，避免全局 tool_name 冲突。

**Why**: 这俩是 curator 决策依赖的非代码事实，且涉及跨 backend 协作。
**How to apply**: CTO 让"把 Slack 加进商店"时 —— Slack 其实已收录，真正动作是 remote 转正 + local 软删，不是新增。
