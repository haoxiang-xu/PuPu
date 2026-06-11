---
name: mcp-store-security-baseline
description: MCP 商店供应链现状基线（curator 口述 2026-06-10）与 vetting 分工——我定标准、curator 执行、我审计
metadata:
  type: project
---

分工：mcp-store-curator（策）管目录数据与连通性；**我定安全 vetting 标准，他执行，我定期审计**。他在等我的第一版 vetting bar，并会先整理 stdio 条目的版本锁定情况给我。

现状基线（curator 口述，2026-06-10，未亲自验证——动手前需对 `mcp_toolkit_store.js` 实地核对）：
- 注册表 15 个条目。
- 8 个 stdio 条目多用 `npx -y @xxx@latest` / `uvx` 运行时拉远端包：`-y` 跳确认、`@latest` 不锁版本 → typosquat / 上游投毒口子。
- `workspace.filesystem` 把整个 `${WORKSPACE}` 读写权交给 filesystem server。
- 7 个 http 远端条目涉及外部域名、OAuth scope、secrets。

**Why:** 这是 vetting bar 设计的输入基线；安装 MCP server = 执行第三方代码，是 app↔第三方内容边界的最热面之一。
**How to apply:** 制定 vetting bar 时优先覆盖：版本锁定（禁 `@latest`）、命令/args 卫生、来源信誉、权限广度（filesystem scope）、http 条目的域名与 scope 审查。审计结论与被拒条目记回本文件或新开 findings 记忆。关联 [[team-roster]]。
