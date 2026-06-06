# PuPu MCP Toolkit Store — Phase 1 设计文档

> 状态：设计定稿，待落 implementation plan
> 日期：2026-06-05
> 范围：仅 PuPu 端，只读展示，不安装、不运行 MCP

## 1. 目标与范围

Phase 1 只做一件事：**让 Toolkit modal 的 Store tab 能展示 curated 的 MCP-backed toolkits**。把当前的 Store placeholder 换成真实的 registry UI，并为 Phase 2 的 one-click setup 预留好数据形状。

### In scope
- 静态 curated MCP registry 数据层（service）
- Store 网格卡片、搜索、分类筛选
- Store detail 右滑入面板（command/args/prerequisites/license/source/tools/permission 预览）
- license / source / trust / MCP-backed badges
- disabled 的 **Install** CTA，标注 "coming in Phase 2"
- disabled 的 "Add Custom MCP Server" CTA
- i18n（en + zh-CN）
- 单元测试 + 组件测试

### Out of scope（Phase 1 明确不做）
- 不执行 `npx` / `uvx` / Docker，不连接 MCP，不 `list_tools`
- 不写 encrypted secret store
- 不碰 unchain runtime，不加 IPC handler
- 不让 Store entries 进入 Installed 页 / 默认 toolkit 选择 / chat toolkit selector
- 不把 raw `MCPToolkit` 当普通 store item 展示（保持隐藏）
- 不做 GitHub icon 拉取 pipeline（只预留 `toolkitIcon` 字段，用 builtin/fallback icon）

## 2. 约束（来自 PuPu CLAUDE.md / AGENTS.md）
- JavaScript only，无 TypeScript / PropTypes
- inline styles，无 CSS modules / styled-components
- 全 function component
- 改 symbol 前先跑 GitNexus impact 分析（`ToolkitStorePage`、`ToolkitsPage`、`ToolkitIcon`、`SOURCE_CONFIG` 等）
- 基础组件**优先复用 builtin 现成件**，不自造
- 全程只读，不加 runtime 执行路径

## 3. 数据模型

### 3.1 新增 service：`src/SERVICEs/mcp_toolkit_store.js`

导出：
```js
export const MCP_STORE_CATEGORIES = [...]   // category key 的唯一定义源：all/browser/dev/productivity/workspace/memory
                                            // UI 展示配置（label/icon）另在 constants.js 的 STORE_CATEGORY_CONFIG，名字不重复
export const MCP_STORE_ENTRIES = [...]      // 静态 seed 数组
export function listMcpStoreEntries()       // 返回全部 entries
export function getMcpStoreEntry(id)        // 按 id 取单条
export function searchMcpStoreEntries(entries, query, category)  // 文本 + 分类过滤
```

### 3.2 Entry 形状（最小集，兼容 Installed 字段）
```js
{
  id: "browser.playwright",
  toolkitId: "mcp.browser.playwright",
  toolkitName: "Playwright Browser",
  toolkitDescription: "Browser automation through the official Playwright MCP server.",
  category: "browser",
  source: "mcp",
  trustLevel: "verified",          // verified | community | needs_review
  status: "available",             // available | needs_review
  license: "Apache-2.0",
  sourceRepo: "https://github.com/microsoft/playwright-mcp",
  docsUrl: "https://github.com/microsoft/playwright-mcp",
  toolkitIcon: { type: "builtin", name: "globe", color: "#2563eb", backgroundColor: "#dbeafe" },
  mcp: {
    transport: "stdio",            // stdio | http
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"]
  },
  setupPreview: "npx -y @playwright/mcp@latest",
  prerequisites: ["Node.js >= 18"],
  secrets: [],                     // 如 [{ key: "SECRET_KEY", label: "Service token" }]
  tools: [
    { name: "browser_navigate", title: "Navigate", requiresConfirmation: false },
    { name: "browser_click", title: "Click", requiresConfirmation: true }
  ],
  policySummary: {
    reviewed: true,
    defaultEnabledTools: 0,
    confirmationRequiredTools: 2
  },
  readmeMarkdown: "..."
}
```

### 3.2b Transport 变体

`mcp` 字段按 `transport` 分两种形状：

```js
// stdio（本地进程）
mcp: { transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp@latest"] }

// http（remote server，如 GitHub / Notion）
mcp: { transport: "http", url: "https://api.githubcopilot.com/mcp/", headers: [] }
//   headers 为可选 header 模板；需 PAT 时用 headers/secrets 表达，Phase 1 只展示不录入
```

`setupPreview` 对 stdio = 拼好的命令行字符串；对 http = server URL。

### 3.3 Seed entries
| id | repo | license | transport | icon | setupPreview | status |
|----|------|---------|-----------|------|--------------|--------|
| `browser.playwright` | microsoft/playwright-mcp | Apache-2.0 | stdio | `globe` | `npx -y @playwright/mcp@latest` | available |
| `browser.browser-use-local` | browser-use/browser-use | MIT | stdio | `globe` | `uvx --from browser-use[cli] browser-use --mcp` | available |
| `dev.github-remote` | github/github-mcp-server | MIT | http | `github` | `https://api.githubcopilot.com/mcp/` | available |
| `productivity.notion-remote` | Notion MCP (hosted) | hosted | http | `server` | `https://mcp.notion.com/mcp` | available |
| `workspace.filesystem` | modelcontextprotocol/servers | Apache-2.0 / MIT | stdio | `folder` | recipe（workspace 占位） | available |
| `memory.memory` | modelcontextprotocol/servers | Apache-2.0 / MIT | stdio | `server` | recipe | available |
| `productivity.slack` | @modelcontextprotocol/server-slack | 待核 | stdio | `link` | recipe | **needs_review** |

**Icon 白名单**：`toolkitIcon.name` 仅取已验证存在的 builtin icon —— `globe / github / folder / server / link / tool`。其它一律 fallback，不引入新 SVG（Phase 1 不做 GitHub icon 拉取）。

**Secrets / prerequisites 补充**：
- `browser.browser-use-local` → `secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }]`，`prerequisites: ["uv / uvx", "Python >= 3.11"]`
- `dev.github-remote` → remote http，支持 OAuth 或 PAT header。secret 用 `[{ key: "GITHUB_MCP_PAT", label: "GitHub Personal Access Token", optional: true }]`（特意不叫 `GITHUB_TOKEN`，避免和本地 GitHub server 的 token env 混淆）
- `productivity.notion-remote` → hosted remote，OAuth/connect（Phase 1 仅展示，不录入）

## 4. UI 设计（已定稿）

整体沿用现有 Toolkit modal 风格（Jost 字体、isDark 配色、pill badge、圆角），走苹果式克制设计语言——「有 border 就别加 background，能不加 styling 就不加」。

### 4.1 Store 页布局
`ToolkitModalContent` → `ToolkitsPage`（子 tab: Store/Installed）→ Store 页：
1. **顶部一行**：搜索框（builtin `Input`，`prefix_icon="search"`）+ 右侧 disabled "Add Custom MCP" CTA（虚线边框 ghost 样式，点击无反应，副标 "Custom setup arrives later"）
2. **分类筛选**：builtin `SegmentedControl`，段 = All / Browser / Dev / Productivity / Workspace / Memory。section 须传**已翻译的 label**（照 `toolkit_modal_content.js` 里 `translatedSections = SECTIONS.map(s => ({ ...s, label: t(s.labelKey) }))` 的模式，用 `STORE_CATEGORY_CONFIG` 的 `labelKey` 经 `t()` 翻译后再传入）
3. **网格**：2 列卡片（`grid-template-columns: 1fr 1fr`）
4. **空状态**：搜索无结果时居中提示（复用 Installed 页的空态文案模式）

### 4.2 Store 卡片（网格，**纯信息卡**）
复用 builtin `Card` + `ToolkitIcon`。决策：**卡片不放任何按钮**，整卡可点进 detail（hover 时右下角出现 `›`，border 加深 + 轻微 shadow）。
- **顶部**：左 44×44 圆角 icon wrap，右上角 muted `N tools`
- **名称**：12.5px / weight 500
- **描述**：11.5px muted，2 行 clamp
- **footer（三个 tag）**：
  - `mcp · {transport}`（紫色 badge，见 §4.5）
  - `✓ verified`（绿）/ 或 `⚠ review`（橙，needs_review 时）
  - `{license}`（灰 tag；needs_review 无 license 时省略）
- footer 用 `flex-wrap` 防窄卡溢出
- **不显示** auto-enable switch（那是 Installed 页的东西）

### 4.3 Store detail 面板（**扁平分区 + 分隔线**）
新增 `store_toolkit_detail_panel.js`，从 Store 页右滑入（复用 `ToolkitsPage` 现有滑入动画）。结构自上而下：
1. `← Store` 返回按钮（复用现有 back 按钮样式）
2. **Header**：左 52×52 icon + (title 17px/600, 描述, badges 行：`mcp · stdio` / `✓ verified` / `{license}`)；**右上角 Install 按钮**（App Store 式，disabled，下方小字 "coming in Phase 2"）
3. **Repository / Docs** 外链（蓝色，带 ↗）—— 普通 `<a target="_blank" rel="noreferrer">`，Electron 已有外链拦截 + `shell.openExternal`，无需自造 handler
4. divider
5. **Setup command**：builtin `Code` 组件（`language="bash"`，自带 Copy；remote entry 显示 URL）
6. **Requirements**：prerequisites 列表
7. **N Tools**：tool chips，`requiresConfirmation` 的加 🔒 前缀（橙）
8. **Permissions**：两个统计 —— `defaultEnabledTools` auto-enabled · `confirmationRequiredTools` ask-before-run
9. divider
10. **About**：`readmeMarkdown` 经 builtin `Markdown`，用 `content` prop 渲染 —— `<Markdown content={entry.readmeMarkdown} />`（照现有 `toolkit_detail_panel.js` 的用法）
11. **needs_review 警告条**：status 为 needs_review 时，header 下方插入橙色提示条

### 4.4 CTA 语义
- 主 CTA 文案 = **Install**（非 Setup），Phase 1 全程 disabled
- "Setup command" 区块标题保留（指"运行这条命令来配置 server"），与 Install 按钮文案分工
- Add Custom MCP CTA disabled

### 4.5 MCP source badge 配色
现有体系：builtin=绿 / local=蓝 / plugin=橙。新增 **mcp = 紫**：
```js
mcp: { labelKey: "toolkit.source_mcp", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" }
```

## 5. 组件边界与文件清单

### 新增文件
| 文件 | 职责 |
|------|------|
| `src/SERVICEs/mcp_toolkit_store.js` | 静态 registry + list/get/search |
| `src/SERVICEs/mcp_toolkit_store.test.js` | service 单测 |
| `src/COMPONENTs/toolkit/components/store_toolkit_card.js` | 网格信息卡 |
| `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js` | detail 滑入面板 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/COMPONENTs/toolkit/constants.js` | 加 `SOURCE_CONFIG.mcp`、`STORE_CATEGORY_CONFIG`（UI label/icon 配置；分类 key 仍以 service 的 `MCP_STORE_CATEGORIES` 为准，**两名不重复**） |
| `src/COMPONENTs/toolkit/pages/toolkit_store_page.js` | placeholder → 真实 Store（搜索 + 分类 + 网格 + 空态 + Add Custom CTA） |
| `src/COMPONENTs/toolkit/pages/toolkits_page.js` | 让滑入 detail 能区分 store / installed 两类（见 §6） |
| `src/locales/en.json`、`src/locales/zh-CN.json` | 新增 i18n keys |

### 复用的 builtin 组件
`Card`、`Input`、`SegmentedControl`、`Code`、`Markdown`、`Tooltip`、`Button`、`ToolkitIcon`、`PlaceholderBlock`。**不自造基础组件。**

## 6. 架构接入点（关键）

当前 `ToolkitsPage` 的右滑入 detail 写死渲染 Installed 用的 `ToolkitDetailPanel`，只接 Installed 页的 `onToolClick`。Phase 1 需让它能区分**打开的是哪类 detail**：

- 在 `ToolkitsPage` 的 `selectedToolkit` state 上增加一个判别字段（如 `kind: "store" | "installed"`），或用独立的 `selectedStoreEntry` state。
- `renderPage()` 给 `ToolkitStorePage` 传入 `onEntryClick(entryId)` 回调 → 设置 store detail 并触发同一套滑入动画。
- detail 覆盖层按 kind 渲染 `StoreToolkitDetailPanel` 或 `ToolkitDetailPanel`。
- 切换子 tab 时关闭 detail（现有逻辑已有）。
- **不改默认 tab**：`ToolkitsPage` 的 `activeTab` 初值保持 `"installed"`。Store 只在用户主动点进时展示，避免 Store 变成 modal 首页。

> 改 `ToolkitsPage` 前跑 `gitnexus_impact({target: "ToolkitsPage"})`，报告 blast radius。

## 7. i18n keys（新增）
命名空间 `toolkit.*`，至少覆盖：
- `store_search_placeholder`、`store_category_all/browser/dev/productivity/workspace/memory`
- `store_add_custom`、`store_add_custom_subtitle`
- `store_install`、`store_install_coming`
- `store_setup_command`、`store_requirements`、`store_permissions`、`store_auto_enabled`、`store_ask_before_run`
- `store_tools_count`、`store_about`、`store_repository`、`store_docs`
- `store_needs_review_title`、`store_needs_review_desc`
- `store_empty_search`
- `source_mcp`、`trust_verified`、`trust_community`、`trust_needs_review`
- 其它 locale 走现有 `useTranslation` 回退到英文

## 8. 测试

### service（`mcp_toolkit_store.test.js`）
- 分类过滤正确
- 文本搜索命中 name / description / tool 名
- `getMcpStoreEntry` 取到 / 取不到
- 输出字段名稳定（防回归）

### 组件
- `ToolkitStorePage`：渲染 seed entries；搜索 "browser"/"github"/"notion"/"filesystem" 返回预期卡片；分类过滤无布局抖动；**Add Custom CTA 可见但 disabled**（卡片本身**无按钮**，故此层不测 Install）
- `StoreToolkitDetailPanel`：点卡片打开后，**Install 按钮可见但 disabled**；含 setup 命令预览、tools/permission 预览、markdown、repo/docs 外链
- `needs_review` 徽标 / 警告条渲染
- **`ToolkitsPage` 集成测试**（§6 的接入点）：
  - 在 Store tab 点 store 卡片 → 滑入渲染的是 `StoreToolkitDetailPanel`（出现 Install/setup 命令），**不是** `ToolkitDetailPanel`
  - 在 Installed tab 点 toolkit 行 → 滑入渲染的是 `ToolkitDetailPanel`（出现 auto-enable/delete），**不是** store 面板
  - 切换子 tab 时已打开的 detail 关闭
- 现有 Installed toolkit 测试保持通过

## 9. 验收标准
- 打开 Toolkit modal → Store tab 显示真实 MCP entries，非 placeholder
- 搜索 "browser"/"github"/"notion"/"filesystem" 返回预期卡片
- 分类筛选收窄卡片且无布局抖动
- 点卡片打开 detail，含 setup 命令预览 + tool/permission 预览
- Install 按钮可见但 disabled
- Add Custom MCP CTA 可见但 disabled
- raw `MCPToolkit` 不作为 store 卡片出现
- Store entries 不影响 Installed 页 / 默认 toolkit 选择 / chat toolkit selector
- `npm test -- --watchAll=false src/SERVICEs/mcp_toolkit_store.test.js src/COMPONENTs/toolkit` 通过（或记录已存在的无关失败）

## 10. Phase 2 衔接（仅预留，不实现）
- entry 的 `mcp.transport`、stdio 的 `command/args`、http 的 `url/headers`、`secrets`、`prerequisites`、`policySummary` 字段即 Phase 2 one-click setup 的输入
- `toolkitIcon` 形状兼容未来 remote icon 拉取
- Install 按钮位置 / detail 结构已为「真正安装 + secret 录入 + permission review」留好落点
