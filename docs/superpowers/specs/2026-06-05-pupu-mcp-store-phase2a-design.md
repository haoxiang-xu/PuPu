# PuPu MCP Toolkit Store — Phase 2A 需求文档（UI）

> 状态：需求记录（来自 codex），待 brainstorm 收口 + plan + 实施
> 日期：2026-06-05
> 分工：**codex 已完成 backend / runtime / API；本阶段只做 UI，不改 backend/runtime。**
> 基于：Phase 1（read-only Store，已实现）—— 见 `2026-06-05-pupu-mcp-store-phase1-design.md`

## 1. Product Goal

把 Phase 1 的 read-only MCP Store 升级成**可安装 curated MCP** 的体验。UI 要像 PuPu 现有 toolkit 管理，**不是** marketplace landing page。

用户路径：
1. 在 Toolkit Store 看到 MCP entries。
2. 对 Phase 2A 支持的 **no-secret stdio MCP** 点击 **Install**。
3. 安装成功后自动进入 **Installed**、**Chat toolkit selector**、**Agent Builder ToolkitPool**。
4. **Settings** 里能查看 MCP 健康状态、reload、delete。
5. **Installed tab** 也能 delete MCP。
6. 非支持项明确显示 "Coming soon / Needs review"，不要让用户误以为能装。

## 2. Backend API（只用前端 wrapper，不碰 backend）

- `api.unchain.listMcpToolkits()`
- `api.unchain.installMcpToolkit({ entryId, workspaceRoot })`
- `api.unchain.deleteMcpToolkit(toolkitId)`
- `api.unchain.reloadMcpToolkits({ workspaceRoot })`
- `api.unchain.checkMcpToolkitHealth(toolkitId, { workspaceRoot })`
- `api.unchain.listToolModalCatalog()`（已有）
- 默认 toolkit helper（已有）：安装成功后调用 `setDefaultToolkitEnabled("global", toolkitId, true)`

**需处理的稳定 MCP 错误码：**
`unsupported_mcp_entry` · `mcp_workspace_required` · `mcp_already_installed` · `mcp_install_failed` · `mcp_health_failed` · `mcp_toolkit_not_found`

> ⚠️ 实施前先验证这些 `api.unchain.*` wrapper 在 `src/SERVICEs/api.unchain.js` 已存在（codex 称 backend 完成）；不存在则向 codex 确认，不自行实现 backend/IPC。

## 3. Installable Entries

Install button **仅** 对以下启用：
- `browser.playwright`
- `memory.memory`
- `workspace.filesystem`

其余保持可见但**不可安装**（Browser Use / GitHub / Notion / Slack / custom MCP / 所有 HTTP/OAuth/secret entries）。

## 4. Workspace Rule（Filesystem 专属）

Filesystem MCP 需要 agent workspace root。安装 `workspace.filesystem` 时，从 runtime/workspace settings 取**当前 agent workspace root** 作为 `workspaceRoot` 传入。

无 workspace root 时：
- 内联报错："Select an agent workspace before installing Filesystem MCP."
- **不得** fallback 到 PuPu app dir / repo dir / userData / 任何兜底目录。

## 5. Store Page UI

- `ToolkitsPage` 默认 tab 保持 **Installed**（沿用 Phase 1）。
- Store 页：搜索框 + 分类筛选 + 2 列 MCP 卡片。
- **Store 里无 "Add Custom MCP" CTA**（custom MCP 是未来独立 tag/flow）。

> Phase 1 衔接：Add Custom CTA 已移除 ✓；分类筛选 Phase 1 优化后已是 **ollama 风格 pill group**（codex 文中称 "segmented control"，以现状 pill group 为准）。

**卡片视觉**：
- 复用 `Card` + `ToolkitIcon`（Phase 1 优化后卡片已是轻量 div 风格，沿用）
- title、short description
- source chip：`MCP`
- category / tool count / status chips
- 右侧 action：
  - 可装且未装 → 主操作 `Install`
  - 已装 → disabled/subtle `Installed`
  - 不支持 → disabled `Coming soon` 或 `Needs review`
- 无大块装饰性 marketplace 样式

> Phase 1 衔接：当前卡片是"纯信息卡 + 整卡可点进 detail"，无按钮。Phase 2A 要在卡片右侧加 action 按钮（Install/Installed/Coming soon）。需重新协调卡片"整卡可点"与"按钮点击"的交互（按钮 `stopPropagation`）。

**Install 交互**：
- 安装中按钮显示 loading spinner/text
- 成功：
  - 刷新 installed MCP 列表
  - 刷新 toolkit catalog / `listToolModalCatalog`（若现有代码有缓存）
  - 调用 `setDefaultToolkitEnabled("global", toolkitId, true)`
  - 立即显示 installed 状态
- 失败：
  - 内联紧凑 card error
  - 保留 error code 行为

## 6. Detail Panel UI（install-aware）

顶部：
- icon、name、source chip `MCP`
- status chip：Installed / Available / Coming soon / Needs review / Error

主操作区：
- 可装未装 → Install 按钮
- 已装 → disabled `Installed`
- 不支持 → disabled `Coming soon` / `Needs review`

> Phase 1 衔接：现 detail 顶部已有 disabled `Install` + "coming in Phase 2" 副标、状态徽章、固定 header 区。Phase 2A 把 Install 变为**真实可点**（installable 时），并加 status chip 状态机。

可装 entry 展示：setup preview、requirements、permission summary、**安装后 discovered tools**、repo/docs links、markdown readme。

needs-review entry：warning block 说明"Phase 2A 故意不可安装，因需 secret/OAuth/review/custom setup"。

## 7. Settings Modal — MCP Section（新增）

操作型、紧凑布局：
- section header：`MCP Toolkits`
- 右上 `Reload all` 按钮
- 已安装 MCP 行/卡列表

每行：
- icon + toolkit name
- status chip：available / error / unknown
- tool count、last checked time
- workspace root（filesystem 才有）
- last error（若有）
- actions：Reload、Delete

Delete：确认对话框；删后刷新 installed MCP 列表 + toolkit catalog/`listToolModalCatalog` + 可见时的 Installed tab 数据。

启动：安全地调用一次 `api.unchain.reloadMcpToolkits({ workspaceRoot })`；**无后台轮询**。

> **用户决策（2026-06-05）**：MCP 管理面**挂在 Settings 的 Local Storage 页**（`src/COMPONENTs/settings/local_storage/`），新增一个 `SettingsSection`，**styling 与该页一致**，职责**聚焦 list + delete**（reload/health 可轻量带上，不喧宾夺主）。**不单独开 settings 页**。

## 8. Installed Tab

已安装 MCP 像现有 installed toolkit 一样出现，但带 `source: mcp`。

仅对 MCP installed entries 加 **Delete** action（**不要**给普通 builtin/local toolkit 加 delete）。删后刷新 catalog + installed 列表。

> Phase 1 衔接：Installed 页用 `ToolkitRow` + `ToolkitDetailPanel`（其 delete 当前对 builtin disabled）。Phase 2A 让 `source: mcp` 的项 delete 可用，走 `deleteMcpToolkit`。

## 9. Chat Toolkit Selector

无特殊协议。Installed MCP 通过 **catalog v2** 进入。确保 selector 在 install/delete 后刷新，并以 source chip/icon 显示 MCP entries。

## 10. Agent Builder

无新协议。Agent Builder ToolkitPool 通过 `api.unchain.listToolModalCatalog()` 读 installed MCP。

行为：
- installed MCP 出现在 ToolkitPool
- 用户可添加
- saved recipe 用 `{ id: "mcp.*", enabled_tools }`
- enabled tools UI 用缓存的 discovered tools

## 11. Visual Direction

安静、实用、贴近现有 PuPu toolkit UI：
- 无 marketplace hero、无大插画、无嵌套卡
- status chips 小而可扫读
- install/delete/reload 操作明显但不张扬
- error 状态内联且可操作

## 12. Tests（本阶段负责）

- Store install 成功 → 自动 auto-enable 默认 toolkit
- Store install 错误态，尤其 `mcp_workspace_required`
- 不支持项渲染 disabled action/copy
- Settings MCP section 渲染 installed entries / status / reload / delete
- Installed tab delete 移除 MCP 并刷新 catalog
- Chat toolkit selector 在 catalog 刷新后看到 installed MCP
- Agent Builder ToolkitPool 能添加 installed MCP 并保存 `{ id, enabled_tools }`

## 13. 约束（沿用 Phase 1）

- JS only、inline styles、no PropTypes、全 function component
- 复用 builtin 组件，不自造基础件
- 改 symbol 前跑 GitNexus impact（`ToolkitsPage`、`ToolkitStorePage`、`ToolkitInstalledPage`、`ToolkitRow`、settings 相关）
- 只做 UI，不加 backend/IPC/runtime
- 不自动 commit，停 dirty
