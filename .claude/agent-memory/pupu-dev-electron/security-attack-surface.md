---
name: security-attack-surface
description: dev-electron 地盘的攻击面认知（SEC-001 自查产出）——bridge 出口、秘密链路泄漏点、relay 不设防、dev-gate 强度
metadata:
  type: project
---

我的 electron 地盘最关键的安全认知（SEC-INVESTIGATION-001 自查,findings 在 .claude/security/sec-001/findings-electron.md）。威胁模型: renderer 渲染边界③不可信内容,一旦被注入(XSS / test-api /v1/debug/eval),它能调用所有 window.*API bridge。

**Why（为什么这些是热点）:** 我过去把 "bridge 是白名单具名方法" 当安全终点,但具名 != 安全——具名地暴露一个无约束的本机原语 == 透传该原语。

**How to apply（改我地盘的代码时必查）:**
- **任何接 path/dirPath 的 main handler 必须强制 root 约束。** `runtime/service.js` 的 `writeFile`/`readFile`/`clearRuntimeDir`/`getRuntimeDirSize`/`openRuntimeFolder` 当前零 root 约束(H/M)。修复范本就在同文件的 `deleteRuntimeEntry`(basename + `full.startsWith(dir+path.sep)` 逃逸检查)——照它写。新增任何文件类 IPC 一律 path.resolve 后落白名单 root 才放行。
- **秘密(unchain auth token)不得出现在 renderer 可达处。** `buildMisoAssetUrl`(service.js:473)把 token 拼进 avatar.url query-string 漏进 renderer DOM——这是秘密链路接缝B 在 electron 段的凿穿点。改 avatar/asset 流时,token 走 main↔Flask header,不进 URL/payload/帧/日志。理想:main 代理字节经 IPC 返回。
- **SSE relay 要对 Flask 帧做结构 sanitize。** `emitMisoStreamEvent`(service.js:2196)+ preload listener 原样转发帧、按 data.type 分发,零校验。帧源头是 MCP/LLM(边界③)。改 relay/stream_client 时加 event/type 枚举白名单、丢弃未知/超大字段。relay 不是唯一防线但不该是零防线。
- **dev-only gate 用 `app.isPackaged`,不用 `NODE_ENV` 字符串。** `__pupuTestBridge`(test_bridge_preload.js)、test-api server(test-api/index.js:23)、`/v1/debug/eval`、`setChromeTerminalOpen` 都用 NODE_ENV——构建回归即破防。/v1/debug/eval = renderer 任意 JS 执行后门,gate 强度至关重要。

**已确认 good(别误删):** host 硬编码 127.0.0.1 无 override; deleteRuntimeEntry/deleteCharacterStorageEntry 路径约束正确; stream payload 的 workspaceRoot 在 main 经 validateWorkspaceRootPath 校验(接缝A,Flask 侧另说); index.js:30-43 过滤 HTTP access log 防 token 进 renderer console; bridge 无 ipcRenderer/Node 透传; contextIsolation 未被 sandbox:false 自我绕过。

关联: [[team-roster]](报 CTO 的 token finding 走 gatekeeper)、秘密链路接缝B(settings存→payload带→我转发→Flask用)、清单2/3(SSE 帧消费 + markdown sanitize_html 默认 false 是本区所有假设的前提)。
