---
name: mcp-store-security-baseline
description: MCP 商店供应链现状基线（curator 口述 2026-06-10）与 vetting 分工——我定标准、curator 执行、我审计
metadata:
  type: project
---

分工：mcp-store-curator（策）管目录数据与连通性；**我定安全 vetting 标准，他执行，我定期审计**。他在等我的第一版 vetting bar，并会先整理 stdio 条目的版本锁定情况给我。

现状基线（registry.json 亲核，2026-06-13）：
- 注册表 **16** 个条目。stdio 6 个（npx/uvx），http 远端 10 个。
- stdio 条目用 `npx -y @xxx@latest` / `uvx` 运行时拉远端包：`-y` 跳确认、`@latest` 不锁版本 → typosquat / 上游投毒口子。
- `workspace.filesystem` 把整个 `${WORKSPACE}` 读写权交给 filesystem server。
- http 远端条目涉及外部域名、OAuth scope、secrets。

**trustLevel 词表（schema 不 enum，additionalProperties，顶层自由串；de-facto 词表已固定）：**
- `verified` = 官方 `modelcontextprotocol/servers` org + 一方厂商远端（GitHub/Figma/Notion/Slack-remote 等）。
- `community` = 个人 uvx 包（如 browser-use-local）。
- `needs_review` = 第三方 npm + 带 token 的（**Slack stdio 即此例**，是第三方+token 的标准类比锚点）。

**写工具确认约定（确认锚点 = Slack `post_message: requiresConfirmation:true`，`list_channels:false`）：** 读=false，任何写/外发=true。

**Why:** 这是 vetting bar 设计的输入基线；安装 MCP server = 执行第三方代码，是 app↔第三方内容边界的最热面之一。
**How to apply:** 制定 vetting bar 时优先覆盖：版本锁定（禁 `@latest`）、命令/args 卫生、来源信誉、权限广度（filesystem scope）、http 条目的域名与 scope 审查。审计结论与被拒条目记回本文件或新开 findings 记忆。关联 [[team-roster]]。
