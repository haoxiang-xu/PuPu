---
name: icon-brand-attribution-doctrine
description: CEO's 2026-07-29 icon rule (icon must be the server publisher's own official mark), the three criteria, the audited verdicts for all 18 entries, and the CC-BY licensing path for bundled logo assets
metadata:
  type: project
---

CEO 2026-07-29 拍板的商店图标准则：**图标必须是这个 MCP server 本身的发布方的官方品牌标识**；否则不设 icon，显示默认 mcp 图标。宁可统一默认图标，也不伪造品牌感。

三条推论：1) 上游有官方 logo 且用的就是它 → 保留；2) 上游无品牌标识、我们自画 → 清空；3) **借第三方品牌代表非官方 server → 也清空**（最隐蔽的一类）。

**Why:** 自制彩色圆角砖会被用户读成官方品牌标识 = 误导。这条主动推翻了 2026-07-27 那次"图标 100% 覆盖"的收口。

**How to apply:**
- 判据 3 有个真实的产品张力：它把「伪造出处」和「如实指示功能」混在一起。Discord/SQLite 这类条目在功能指示上是真的。CEO 选了双重保险（清空 + `needs_review` + readme 披露）。别再把这当成漏洞重提，那是他知情下的取舍。
- **保真度是第四类**，不在三条判据里：发布方对、标也对、但配色不是官方配色。全表只有 Browser Use 落这一类（官方 orbit 标，但 `#FE750E` 只是他们 docs 站 Mintlify 主题色，官方标所有渲染都是 `#18181B`/白单色）。裁决=保标改色，不清空。
- 判据 1 靠"发布方本人"成立，**不是**靠图标 license。CC BY 4.0 §2(b)(2) 明确不授予商标权。
- 证据方法见 [[methodology-brand-evidence]]。

**2026-07-29 审计结论（18 条）**
- 清空 7 条：Filesystem / Memory / Fetch（判据 2，`modelcontextprotocol/servers` 全树零图片，reference server 本就无品牌）、MarkItDown（判据 3，字形与 simple-icons `markdown.svg` 逐字节相同=通用 Markdown 标；`microsoft/markitdown` 全仓唯一图片是两个测试 jpg）、SQLite（判据 3，SQLite 自己的羽毛）、Discord + Telegram（判据 3 + 上游明文禁止：Telegram ToS §2.4「You must not use the official Telegram logo for your app」；两个仓库 README 自述 unofficial）。
- 保留：Playwright（7/7 path 与 playwright.dev 官方 logo 逐字节相同）、Figma、GitHub、Notion、Slack、Sentry、Vercel、Grafana、Netdata。
- 改动：Browser Use 改 `#18181B`；Chrome DevTools 换成真正的 DevTools 标（原用的是 Chrome 浏览器标）。

**图标层机制（易踩）**
- 删 `icon` 键是 schema 合法的（`icon` 不在 required 里）。删后 `resolveMcpIcon` 返回 `DEFAULT_MCP_ICON`（灰 `mcp` glyph、透明底）——所有被清条目**渲染成同一块砖**，这是已知代价（7/18=39%）。
- `metadata.icon.urlPath: owner.avatar_url` + `iconPolicy:"fallback"` **不会**在清空后浮出 GitHub 组织头像；只有 `iconPolicy:"replace"` 才会。
- `displayScale` 语义：**自带底板的整砖 → 不设**（满幅出血，Playwright/Figma/Browser Use/DevTools-square 都是）；**裸单色字形 → `0.82`**（7 条 simple-icons 字形）。设反了会把底板缩进去留一圈中性边。
- 曾有过 per-entry 派生身份色片方案（`mcp_identity_icon.js`，避免灰墙），2026-07-29 被并发进程回滚。若重提：它的 test gate 只查精确相等，抓不到"同 glyph + 近似色相"——MarkItDown 与 SQLite 会撞（ΔH=0.2°、ΔL=0），需 `iconTint` 分开。

**内联 logo 的 license 通路（发布门相关）**
- `THIRD_PARTY_NOTICES.txt` **不可手改**（文件头自述 generated），`notices:check` 串在 `build:electron:*` 里。手贴的条目下次 `npm run notices` 会被整文件覆盖。
- 正确入口 = `scripts/generate-third-party-notices.cjs` 的 `collectVendored()`（硬编码条目 + 读盘上 notice 文件，先例 `CLICK3_NOTICE.md`）。
- 门只在三处失败：npm/python license 解析不出、匹配 `/gpl|mpl|epl|cddl|eupl/i` 的 copyleft 未登记 source offer、vendored notice 文件缺失。**没有许可证白名单**，所以 `CC-BY-4.0` 不会被拦。
