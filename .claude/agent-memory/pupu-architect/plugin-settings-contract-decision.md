# Plugin Settings Contract — Computer Use 迁入 plugins 面板设计定案

2026-07-19 · pupu-architect (Fable 5, CEO 豁免 Codex 管线) · 取证基线 origin/dev@5a5a1a6
（原稿写于 architect 会话 worktree，未落主树；此为顶层会话补档的定稿全文摘要）

## CEO 拍板方向
1. Computer use 配置面（开关+consent+权限徽章+能力状态）整体从 settings 迁入 plugins 面板；settings 导航撤出。逻辑：能力都住 plugins，一个地方管完。
2. 立通用模式：per-toolkit 客制化设置面板（未来 MCP 写确认/OAuth 走同一契约）。本次只实现 computer use 一例。

## 呈现方案
- 入口 = `PluginsInstalledPage` **Built-in 区一条前端合成行**（PluginListRow，不进 catalog——沿用 attach 面板 synthetic-entry 先例）。否决：后端 catalog 化（波及 attach reconcile/count/hidden，收益零）；第 4 个 nav 项（三项 nav 是 CEO 签的终态）。
- 行右槽 = **只读状态 pill**（On/Off，getComputerUseStatus 回读，失败→Off = fail-closed 显示），**不放开关**（邻行 SemiSwitch 是 auto-enable 语义，Computer 是 consent 门控 runtime enable，相同控件不同语义会误导；开关只留详情页避免新 enable 路径）。条目永远显示。
- 导航：`plugins_shell.js` 新增 `openDetail({kind:"plugin_settings", toolkitId})` overlay 分支，镜像 custom/import_skills 容器。不走 PluginDetailPage（其 props 面向 install/OAuth/delete 生命周期，Computer 全没有）。
- 嵌套 Modal 先例已证（plugin_detail_page 的两个 Modal）→ consent AgreementModal 无 z-index 新风险。

## 通用契约
`src/COMPONENTs/toolkit/plugin_settings_registry.js`：`toolkitId → {Component, labelKey, icon}`。注册单位是 **React 组件**（prop 契约 `{toolkitId, isDark, onRequestClose}`），非声明式 schema（JS-only/inline-style 现实里 schema 是过度建设）。落位 toolkit 域内非全局。
本次最小子集：静态注册、精确 id 键、一个条目、仅 shell overlay 挂载点。显式不建（未来扩展点）：①PluginDetailPage 内嵌注入（MCP per-tool 权限矩阵/OAuth 届时加一行查找）②`source:mcp` fallback 键 ③后端声明式设置 schema。

## 迁移切片
原则：**搬 UI 不搬血管，文件不搬家**。`settings/computer_use/` 目录原地不动，toolkit 跨域 import（先例：toolkit import ../settings/appearance）。目录物理迁移押后为独立 cosmetic 切片。
- S1（dev-toolkit）：registry+test / shell overlay 分支 / installed 合成行+pill+搜索 / count+1 / 11 locale 加 toolkit.builtin_computer_name|tagline
- S2（dev-settings）：settings_modal_content 撤三处注册 / test mock 调整 / 11 locale 删 settings.computer_use（computer_use.* 面板键保留）
- S3：QA 冒烟（注意旧代码三层假象先 grep bundle）+ 架构验收
- 冲突面：不碰 plugins_discover_page/categories/plugin_detail_page/plugin_presentation（hero 活跃线+冻结件）；触碰 plugins_shell（唯一中等冲突面，最小 diff）/plugins_installed_page/toolkit_modal。

## 安全确认
守门B八条不变量逐条**全部不受影响**（组件只换挂载点、模块不动；pill 只读；后端/IPC/store 零触碰；grep 唯一 call-site 测试与文件位置无关；boot_sync 挂 App.js 与面板解耦）。
信任分区：Computer 行佩 SOURCE_CONFIG.builtin 徽记与 MCP 物理分隔；详情页**禁止渲染 TRUST_CONFIG 词汇**（verified/community/needs_review 是第三方 store 信任语言）；无 install/delete/approve affordance。
可逆性：全部 reversible，无 schema/契约面破坏。
