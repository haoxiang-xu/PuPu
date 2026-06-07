# Custom MCP 表单 UI 重设计

> 范围:纯 UI。只改 `custom_mcp_page.js` + tab icon + 翻译。不动 backend / IPC / runtime / install 流程。

**Goal:** 把 codex 实现的功能版 Custom MCP 表单重做成与 Store / Installed 页统一的扁平极简风格(方向 B:分组 + 分割线)。

**已实现的快速改动:** Toolkit modal 的 Custom tab icon 从 `server` 改为 `mcp`(`toolkits_page.js`)。

## 设计(方向 B,已经 visual companion 确认)

表单按三段组织,段间用 1px 分割线 + 小号大写段标题分隔。**去掉外层 panel 的「边框 + 底色」组合**(遵循 PuPu 极简:有 border 就不加 background)。

### 段结构

1. **Identity** — Name、Description (optional)
2. **Connection** — transport 胶囊 segmented(stdio / HTTP);
   - stdio → Command、Arguments
   - HTTP → Server URL(单字段)
3. **Environment**(仅 stdio 显示) — env secrets textarea

### 视觉规范

- **段标题** `.pp-sec`: fontSize 9.5、letterSpacing 0.6、uppercase、muted(light `rgba(0,0,0,0.34)` / dark `rgba(255,255,255,0.34)`),marginBottom 9
- **分割线**: 1px,light `rgba(0,0,0,0.06)` / dark `rgba(255,255,255,0.07)`,margin `14px 0 13px`
- **transport segmented**: 胶囊外框 `1px solid` border(light 0.10 / dark 0.14),内 padding 2,radius 999;选中项浅底(light `rgba(0,0,0,0.06)` / dark `rgba(255,255,255,0.10)`)+ 深字,未选中 muted 字、透明底。**无 accent 边框/底色**(取代现在每个 pill 都带 border+bg)
- **输入框**: 复用 builtin `Input`,纯细边框无填充。段内只用 placeholder,占位文案带提示:
  - Name / Description (optional)
  - Command — e.g. npx / Arguments — space separated
  - Server URL — https://…
  - Environment textarea: `KEY=value, one per line`
- **footer**: 左侧实时「N secret detected」计数(仅 stdio 且有 env 时);右侧 Install 按钮 = 与 Store 一致的**浅底蓝字软胶囊**(light 字 `#2563eb` 底 `rgba(0,0,0,0.055)`;dark 字 `#7c8cf8` 底 `rgba(255,255,255,0.10)`),fontWeight 500、radius 999。取代现在的重黑/紫实心白字按钮
- 字段竖向间距 9;切到 HTTP 时 Connection 段换 URL 字段并整段隐藏 Environment

## 翻译 key 调整(en.json + zh-CN.json)

更新 placeholder 文案为带提示版;新增段标题 key:
- 新增 `custom_section_identity` / `custom_section_connection` / `custom_section_environment`
- 更新 `custom_name_placeholder`、`custom_description_placeholder`、`custom_command_placeholder`、`custom_args_placeholder`、`custom_url_placeholder`、`custom_env_secrets_placeholder`
- footer 计数复用 `custom_env_secrets_count`;按钮复用 `store_install` / `store_installing`

## 追加:自定义 icon 上传(前端 localStorage)

custom MCP 允许用户上传图标。**存储选型:前端 localStorage**(用户拍板),不动后端——后端 `_custom_entry` 仍写死 `server` glyph,但前端解析层会覆盖它。

- **存储** `src/SERVICEs/custom_mcp_icon_store.js`:localStorage key `custom_mcp_icons`,map `toolkitId → {type:"file", content, mimeType}`。仅接受 `mcp.custom.*` 的 id、`image/png`/`image/svg+xml`、content ≤ ~300KB,上限 100 条。`get/set/remove`。
- **解析层覆盖** `mcp_toolkit_store.js`:`resolveMcpIcon` / `mcpStoreIconFor` / `withMcpStoreIcon` 优先级改为 **registry 策展 icon → 用户上传 icon(custom store)→ toolkit 自带 → DEFAULT_MCP_ICON**。非 custom 的 mcp 行为不变(`getCustomMcpIcon` 对非 `mcp.custom.*` 返回 null)。
- **安装/删除** `mcp_install.js`:`installMcpEntry(entry, {..., customIcon})` 装成功后 `setCustomMcpIcon(toolkitId, customIcon)` 再 emit 刷新;`deleteMcpEntry` 调 `removeCustomMcpIcon`。
- **上传 UI** `custom_mcp_page.js`:Identity 段(方案一)左侧 56px 圆角方块 icon picker,`alignSelf:stretch` 与右侧 Name+Description **等高**;空态显示灰 mcp glyph + 蓝「+」角标。接受 PNG/SVG/JPG/WebP:SVG 存原文本,栅格图经 canvas 缩到 ≤128px 重编码为 PNG base64(体积小、统一可渲染)。`onInstall` 仅在有 icon 时附带 `customIcon`(空时对象保持 `{customRecipe, secrets}` 不变,不破坏既有测试)。
- **新增翻译** `custom_icon_upload`(Upload icon / 上传图标)。

### 局限(localStorage 选型的取舍)

icon 是本机本地的,不随 recipe 走、换设备/导出会丢。若日后要跟随 toolkit,改为「存进 recipe + 后端 `_custom_entry` 读取持久化」即可(约 10 行后端改动)。

## 不变项

- install 逻辑、`normalizeCustomMcpRecipe` / `parseCustomMcpEnvSecrets` 调用、`onInstall` payload 完全不变
- 既有 `custom_mcp_page.test.js` 行为(canInstall、handleInstall payload)保持通过
