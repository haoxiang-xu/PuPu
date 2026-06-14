---
name: flask-sidecar-posture
description: Flask sidecar (unchain_runtime/server) 安全现状——认证真相、确认门控缺陷、SSRF 面，SEC-001 清单7 深审结论
metadata:
  type: project
---

SEC-INVESTIGATION-001 清单7（Flask sidecar）深审结论（2026-06-10）。范围 `unchain_runtime/server/`，已模块化为 route_*.py。

**认证真相（校正清单旧锚点）：** 打包 app 中 token 不为空。
- Electron `service.js:2008` 每会话 `crypto.randomBytes(24)` 生成随机 token → `UNCHAIN_AUTH_TOKEN` 注入 Flask，所有请求带 `x-unchain-auth` 头。
- `_is_authorized()`（route_auth.py:13，hmac.compare_digest）**逐路由强制**，~55 端点仅 1 个豁免（`GET /mcp/oauth/callback`，by-design，OAuth state 保护 + escape 防反射 XSS）。
- bind 恒 127.0.0.1（Electron 硬编码常量），全仓无 0.0.0.0。`UNCHAIN_HOST` 仅 standalone `python main.py` dev 可覆盖。
- 结论：CSRF/DNS-rebind 被"随机 token + 自定义头"双挡。缺 Origin 校验仅 defense-in-depth note，不单独定级。"token 默认空仅 loopback"只描述开发者手跑 standalone Flask 的处境，非用户处境。

**最重要 finding（决定下一步）：F-FLASK-01 [H] MCP/第三方工具确认门控由工具自声明。**
- 运行时真相源 `unchain/tools/confirmation.py:92`：仅 `tool_obj.requires_confirmation==True` 才弹确认。
- MCP 工具该标志 `unchain/toolkits/mcp.py:324` **默认 False**，仅当 server 自声明 `annotations.destructiveHint=True` 才 True → 被审查对象自己决定要不要被确认。
- PuPu `unchain_adapter.py:2785-2797`（`_mark_workspace_tools_for_confirmation`）只强制内置 workspace/terminal 工具，**对 MCP toolkit 无 server-side 默认拒绝/白名单**。
- 修复契约：服务端对所有非内置可信 toolkit 的工具默认 requires_confirmation=True。红用例：装无 destructiveHint 的 stub MCP server，诱导调用，断言必弹 confirmation frame。
- 这是边界③核心运行时控制对"已安装但被注入劫持的工具"失效——需报 CTO（HIGH 上报硬规则）。

**SSRF 面（两条）：**
- F-FLASK-02 [M] mcp_oauth.py:167-211 出站 URL **无 scheme/内网 IP 校验**（最弱，连 http 都不拦）。
- F-FLASK-03 [M] external_registries/store_metadata fetcher 强制 https（good）但不挡内网/元数据 IP。
- 两者共用修复：统一校验器——https + 拒 loopback/私网/link-local/保留段（比对 resolved IP 防 rebinding）。

**Low 项：** token 经 query-string 入运行时日志（route_auth.py:20-22 + service.js:478，werkzeug 默认请求日志，但临时会话 token）；通用流式错误回灌 provider 原始异常文本（route_chat.py:98-112，suspected 泄漏）；workspace `_resolve_path` 兜底分支无 confinement（adapter_workspace_tools.py:138-142，实际靠 unchain 库挡，session_id 遍历由 qdrant.py:437 sanitizer 挡住）；~/.pupu 目录权限随 umask（仅文件 0600）。

**秘密链路接缝 B：** provider api_key 走 chat payload `options.{provider}_api_key`（unchain_adapter.py:2642），在 POST body（不入 query 日志），服务端未显式打印/落盘。残余泄漏点仅 F-FLASK-05。

统计：C0 / H1 / M2 / L4。
