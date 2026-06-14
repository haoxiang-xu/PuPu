---
name: release-security-gates
description: 与 pupu-coo 的发版门禁——安全 sign-off 规则、no-go 硬门、自动触发审查的变更类型
metadata:
  type: project
---

发版安全门禁（与 pupu-coo（发）约定，2026-06-10）：

1. 每次 release 需我的安全 sign-off：我出 blocker 清单 + 签字，product-ops 跑 release。
2. **硬性 no-go 门**：自动更新 + 签名/公证完整性——更新通道被绕过 = 全量 RCE，无条件 blocker。
3. **自动触发审查**：凡动 IPC channel 或 MCP 安装流的 release，自动触发我的安全审查，不依赖人记得叫我。

**Why:** product-ops 在见面会主动提出把安全嵌入发版流程，避免安全审查靠临时记忆。
**How to apply:** 收到 release 审查请求时按此清单走；diff 触及 `electron/shared/`（channel 常量）、`register_handlers.js`、`mcp_install.js`、更新服务时视为自动触发条件。关联 [[team-roster]]。
