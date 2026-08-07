---
name: mcp-store-current-inventory
description: MCP 商店 catalog 真相源——种子 registry 在 src/SERVICEs/mcp_toolkit_registry.json（v1，15 条，6 实分类），Slack 已双收录；安装态机 mcp_install.js
metadata:
  type: project
---

**MCP 商店的种子 catalog 真相源 = `src/SERVICEs/mcp_toolkit_registry.json`**（schema: `mcp_toolkit_registry.schema.json`，store 服务 `mcp_toolkit_store.js`）。

截至 2026-06-12 盘点（version=1，**15 条 entry**）：
- 分类（categories）：`all` + 6 个实分类 `browser / dev / devops / productivity / workspace / memory`。**没有 communication / data 分类**——聊天类目前塞在 `productivity` 下。
- browser：playwright(stdio)、browser-use-local(stdio, OPENAI_API_KEY)、chrome-devtools(stdio)
- dev：github-remote(http, OAuth, GITHUB_MCP_PAT)、figma-remote(http, OAuth)
- devops：sentry-remote / vercel-remote(http, OAuth)、grafana(stdio, token)、netdata-cloud(http, token)
- productivity：notion-remote(http, OAuth)、**slack(stdio, SLACK_BOT_TOKEN+SLACK_TEAM_ID)**、**slack-remote(http, OAuth)**
- workspace：filesystem(stdio)、markitdown(stdio)
- memory：memory(stdio)

**关键事实：Slack 已收录两条**——`mcp.productivity.slack`(stdio+bot token) 与 `mcp.productivity.slack-remote`(http+OAuth)。所以"加 Slack"实际是**整理已有双条目**，不是新增。

**安装态机在 `src/SERVICEs/mcp_install.js`**：`setupKindForEntry` 把条目分流成 `oauth / http_secret / secrets / workspace / direct / custom`；`entryInstallState` 出 `installed/installable/needs_review/oauth/coming_soon`。OAuth 走 `connectMcpOAuthEntry`(轮询 startMcpOAuth→getMcpOAuthStatus)，secret 型走 `installMcpEntry` 带 secrets payload。custom MCP 仅 stdio 支持 env secret（backend `mcp_toolkits.py` 强制：`custom secrets are supported only for stdio env`）。

相关：[[mcp-secret-storage-path]]、[[adr-toolkitid-stability]]、[[contract-install-state-owner]]、[[contract-toolkit-catalog-shared-id-space]]。
