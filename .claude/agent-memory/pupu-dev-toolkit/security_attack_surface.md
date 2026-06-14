---
name: security-attack-surface
description: My territory's attack surface (boundary ③ MCP supply chain) — the load-bearing security facts from SEC-001
metadata:
  type: project
---

我的地盘对应**边界③：装一个 MCP server = 执行第三方代码**。SEC-INVESTIGATION-001（2026-06-10，CTO 组织、安全专家「守」主导）我自查的核心认知。

**Why:** 首次全面安全调查，CEO 点名教育目标，让每个 dev 理解自己地盘攻击面。
**How to apply:** 改 toolkit UI / mcp_install / store 渲染时，把下面四条当默认威胁模型。

1. **前端不是执行闸，是采集+渲染+知情提示层。** spawn/路径/SSRF 的 enforcement 在 Flask（清单7）。custom MCP 的 command/args 前端只分词透传（`mcp_install.js` parseCustomMcpArgs），不做白名单——这不是前端 RCE 漏洞，执行落点在后端。前端的安全价值：不把第三方内容当可信渲染 + 给用户充分知情提示（workspace 全量授权、命令运行警告）。

2. **F-1（High，真实存在）：store/installed 详情的 README markdown 未清洗 HTML。** `store_toolkit_detail_panel.js:989` 和 `toolkit_detail_panel.js:668` 用 `<Markdown content={readmeMarkdown}/>`，而 `markdown.js` 默认 `sanitize_html=false`（共享 primitive，CTO 守门）。外部 registry（`importMcpStoreRegistry` 用户填 URL 拉取）的 README 是 attacker-controlled → `<img onerror>`/`<script>` 在 renderer 执行 → 读 localStorage(API key)、调 bridge。**修法我可独立落地：两处显式传 `sanitize_html={true}`，不动 primitive 默认值。** 与 chat-bubble 是同一底层缺陷的两个落点。

3. **auto-approve 是纯前端 localStorage 判定，安全 == renderer 安全。** `toolkit_auto_approve_store.js` 本身写得稳（无条目自声明撑大范围的路径，全靠用户 UI 勾选）。但 F-1 XSS 后可直接写 `toolkit_auto_approve` 静默关闭工具确认门控 → 链式风险。服务端必须是确认门控真相源（不能信前端 approve 标志）。

4. **图标字段是隐蔽注入面。** custom SVG icon 原文存 localStorage（`custom_mcp_icon_store.js` 有 VALID_MIME 但 SVG 是可执行文档），metadata icon（`mcp_toolkit_store.js` isFileIcon）无 mime 白名单。可利用性取决于 `toolkit_icon.js` 渲染方式（内联 SVG vs `<img src=data:>`）——这是值得继续挖的 suspected 点。

**边界归属提醒：** registry schema/外部 registry 完整性归 mcp-store-curator；命令 spawn/SSRF/路径归 Flask(清单7/守)；markdown primitive 默认值归 pupu-cto。我能独立修的只有"两处 Markdown 调用点传 sanitize_html"。
