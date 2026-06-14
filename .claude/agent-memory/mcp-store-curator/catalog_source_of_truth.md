---
name: catalog-source-of-truth
description: Where PuPu's MCP store catalog lives, its schema, and the frozen entry contract — the canonical map for any add/check/validate work
metadata:
  type: project
---

PuPu 的 MCP 商店是 **seed-registry 驱动**（不是空的，也不是后端动态拉取为主）。

**单一真相源（前端 seed）**：`src/SERVICEs/mcp_toolkit_registry.json`
- `version: 1`，顶层 `categories` 数组 + `entries` 数组。
- 截至 2026-06-13 工作树有 **18 个条目**（HEAD 仍是 15，Fetch/Discord/Telegram + communication 分类 + Slack 软删都是**未提交的工作树状态**，registry JSON 从未 staged，被 `git checkout` 会丢，无 git 恢复路径——靠 test.js 断言 + tarball 重建）。新加：官方 Fetch `mcp.workspace.fetch`（markitdown 兄弟，uvx mcp-server-fetch，单工具 fetch requiresConfirmation，readme 含 upstream SSRF 警告原文，license "Apache-2.0 / MIT"）、[[discord-entry-and-version-pin-rule]]、[[telegram-entry-2026-06]]。categories：`all, browser, dev, devops, productivity, workspace, memory, communication`。

**Schema**：`src/SERVICEs/mcp_toolkit_registry.schema.json`（JSON Schema draft-07）
- entry required: `id, toolkitId, name, description, mcp`。
- `mcp` 用 `oneOf`：stdio 分支要 `transport:"stdio"+command(+args)`；http 分支要 `transport:"http"+url(+runtimeTransport+headers)`。
- 校验新 entry 必须先过这个 schema 再写入（catalog owner = toolkit 主面，但 seed 由 curator 签发）。

**前端加载/规范化/图标解析**：`src/SERVICEs/mcp_toolkit_store.js`
- `normalizeEntry` 把 camelCase 补成后端要的 snake_case（`runtimeTransport`→`runtime_transport`、`valueFromSecret`→`value_from_secret`）。
- `MCP_STORE_ENTRIES`（frozen seed）+ `setMcpStoreEntriesCache`（后端可覆盖）。
- `searchMcpStoreEntries(entries, query, category)` 做 category 过滤 —— 新增分类要同时改 `registry.categories`。

**后端 MCP 实现**（unchain_runtime/server/）：`mcp_registry.py`, `mcp_toolkits.py`, `mcp_secrets.py`, `mcp_oauth.py`, `mcp_oauth_apps.py`, `mcp_external_registries.py`, `mcp_store_metadata.py`, `route_mcp.py`。

**冻结契约**：toolkitId = `mcp.<server>.<slug>`，发布即冻结、永不复用、软删。

**Why**: CTO 2026-06-12 委托盘点 + 候选时确立。
**How to apply**: 任何 add/check/validate 先读这三个前端文件 + schema，按 schema 校验后再经 toolkit 主面写入；新分类是 catalog-owner 写入，须走 curator。
