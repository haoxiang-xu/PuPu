# SEC-INVESTIGATION-001 — Flask sidecar findings（守直审）

区域：`unchain_runtime/server/`（已模块化为 route_*.py）
审查者：守（pupu-security-expert）
范围：边界② main↔Flask 本地 HTTP / 边界③ app↔第三方 MCP/LLM 内容
状态：只读调查，未改任何代码

## 统计

| Severity | 数量 | 编号 |
|---|---|---|
| Critical | 0 | — |
| High | 1 | F-FLASK-01 |
| Medium | 2 | F-FLASK-02, F-FLASK-03 |
| Low | 4 | F-FLASK-04 ~ 07 |

## 校正清单 7 的旧锚点（重要）

清单原写"token 默认空 → 仅 loopback、CSRF/DNS-rebind 可达"。**打包 app 中不成立**：
- `electron/.../unchain/service.js:2008` 每次启动 `crypto.randomBytes(24)` 生成随机 token，注入 `UNCHAIN_AUTH_TOKEN`，所有请求带 `x-unchain-auth` 头。
- `route_auth.py:13 _is_authorized()`（hmac.compare_digest）**逐路由强制**，~55 端点仅 1 个豁免（`GET /mcp/oauth/callback`，by-design，由 OAuth state 防 CSRF + `escape()` 防反射 XSS）。
- bind 恒 `127.0.0.1`（Electron 硬编码），全仓无 `0.0.0.0`；`UNCHAIN_HOST` 仅 `python main.py` standalone dev 可覆盖。
- → CSRF/DNS-rebind 被"随机 token + 自定义头"双挡。**缺 Origin 校验**仅作 defense-in-depth note，不单独定级。清单设想的几条 High 据此降级。

## F-FLASK-01 [H][verified][③] MCP/第三方工具确认门控由工具自声明，服务端无默认拒绝

- 运行时真相源 `unchain/tools/confirmation.py:92`：仅 `tool_obj.requires_confirmation==True` 才回调弹确认。
- MCP 工具该标志 `unchain/toolkits/mcp.py:324` **默认 False**，仅当第三方 server 自声明 `annotations.destructiveHint=True` 才 True——**被审查对象自己决定要不要被确认**。
- PuPu `unchain_adapter.py:2785-2797`（`_mark_workspace_tools_for_confirmation` / `_LEGACY_CONFIRMATION_REQUIRED_TOOL_NAMES`）只对内置 workspace/terminal 工具强制确认，**对 MCP toolkit 无任何 server-side override / 白名单 / 默认拒绝**。
- **exploit**：用户装了某 MCP server（fetch/filesystem/shell 类）→ 攻击者经 workspace 文件 / 工具输出 / 会话内容做间接 prompt 注入诱导模型调用它 → 工具未声明 destructiveHint → **确认框完全不弹，静默执行**。边界③的核心运行时安全网对"已安装但被注入劫持的工具"形同虚设。
- **mitigation**：服务端对所有非内置可信 toolkit 的工具默认 `requires_confirmation=True`。红用例：装无 destructiveHint 的 stub MCP server，发诱导消息，断言**必收** confirmation frame。**建议报 CTO 仲裁（HIGH）**。

## F-FLASK-02 [M][verified][②] MCP OAuth 出站请求无 scheme/内网地址校验（SSRF）

- `mcp_oauth.py:167-211`（`_default_http_get/post`）对 URL **无任何 scheme/host/内网 IP 校验**，直接 urlopen。discovery URL 由 MCP server 的 `mcp_url` 拼出（228-237），token/authorize 端点来自 server 可控的 discovery doc。
- **exploit**：用户对恶意 MCP server 发起 OAuth，discovery doc 把 token_endpoint 指向 `http://169.254.169.254/...` 或内网服务，Flask 当跳板发请求并回灌。
- **mitigation**：统一出站校验器——强制 https + 拒 loopback/私网/link-local/保留段（比对 resolved IP 防 rebinding）。

## F-FLASK-03 [M][verified][②] 注册表/元数据/图标 fetch 仅限 https，不挡内网/元数据 IP

- `mcp_external_registries.py:116-154` / `mcp_store_metadata.py:108-135`：`_require_https_url` 正确强制 https + `max_bytes`+timeout（挡掉 http IMDS、file://、超大 payload），**但无内网/保留 IP 过滤**——`https://10.x`、内网 https 管理面仍可达。
- **mitigation**：与 F-FLASK-02 共用同一校验器。

## F-FLASK-04 [L][verified][②] 会话 auth token 经 query-string 落运行时日志

`route_auth.py:20-22` 接受 `unchain_auth` query 参数 + `service.js:478` 流式 URL 追加 `?unchain_auth=<token>`；werkzeug 默认请求日志把 path+query 打 stderr → Electron 收进日志。影响有限（每会话临时 token，非 provider key）。**与 dev-electron findings 的 token-via-avatar-URL 同源，守在接缝 B 拼接。**

## F-FLASK-05 [L][suspected][②③] 通用流式错误回灌 provider 原始异常

`route_chat.py:98-112` 仅 invalid-key/memory 两类归一化，其余 `message=str(stream_error)` 原样进 SSE error frame；若 SDK 异常含敏感串则泄漏。

## F-FLASK-06 [L][suspected][②③] workspace `_resolve_path` 兜底分支无 confinement

`adapter_workspace_tools.py:138-142`，实践靠 unchain 库 `_resolve_workspace_path` 挡；session_id 路径遍历由 `unchain/memory/qdrant.py:437 JsonFileSessionStore._path` 的 `isalnum/-_.` sanitizer 挡住（已 verified 安全）。风险=防御全靠第三方库，本仓无独立断言。

## F-FLASK-07 [L][verified][②] `~/.pupu` 目录权限随 umask

secrets/approval 文件本身 `chmod 0600`（mcp_secrets.py:44 / external_registries:107，best-effort），但父目录仅 `mkdir(parents=True)`。文件 0600 故内容仍不可读，影响小。

## 已查 · 无 finding

- bind 放宽：无。secrets 进诊断/导出：无（character 导出仅打包 characters）。密钥进日志：无（全部 logger/print 无打印 key/token/headers/payload；adapter 5182/5519 仅 traceback 栈文本，不含局部变量值）。唯一 auth 豁免端点 oauth/callback：state 保护 + escape，无 finding。
- 秘密链路接缝 B：provider api_key 走 chat payload `options.{provider}_api_key`（`unchain_adapter.py:2642`），在 POST body（不入 query 日志），服务端未显式落盘/打印——残余泄漏点仅 F-FLASK-05。
- 接缝 A（路径双侧校验）：route 层对 session_id/path **不自校验**，全靠 unchain 库——需与清单 1 的 main 侧对账，确认非"双方互相假设对方已校验"。
