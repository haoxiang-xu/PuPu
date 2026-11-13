# Agent 图标与颜色

每个 Agent 可以有自己的图标和颜色，由用户选择，并在列出该 Agent 的地方显示（尤其是侧边栏的 Agents Explorer）。

## 存储

- 存在 Agent 自己的 Skeleton 文档里：可选的顶层键 `document.presentation`。
- 形状封闭：`{ icon?: <目录 id，^[a-z0-9_]{1,40}$>, color?: "#rrggbb" 小写 }`；缺省 = 默认（`bot` 图标、`#4a5bd8`）。
- 颜色只取调色板 `AGENT_PRESET_COLORS`（`agent_resource_icons.js`）：`#4a5bd8`（默认）、`#7c4dd8`、`#3a7bd5`、`#1d8798`、`#2e8f5a`、`#b3820b`、`#d9622b`、`#d23f37`、`#c0398f`、`#b94a74`、`#6e6e73`；每个在深色列表底 `#1e1e1e`、浅色列表底 `#f5f5f5` 与白色字形下对比度都 ≥ 3:1（有测试）。前端收窄到调色板：读取时不在调色板中的颜色按默认绘制（不改写已存数据），写入路径（`writeResourcePresentation` 与编辑器写入）只发送调色板颜色，其它颜色 `invalid_presentation`、不发送。后端 schema 不变，仍只校验 `#rrggbb` 格式。
- 读取：资源摘要（`listSkeletonResources()` 返回的 `presentation`，对象或 null）、打开的编辑器文档的 `document.presentation`、内嵌 subagent 的 `source.document.presentation`。
- `src/SERVICEs/agent_resource_icons.js` 是唯一的形状入口：`normalize_presentation`（丢弃未知键、不在目录中的图标、不合法颜色；什么都不剩则 null；从不抛错）、`resolve_presentation`（补默认值）、`with_document_presentation`（写入文档；null 删除整个键；没有变化时返回原对象）、`set_presentation` / `reset_presentation`（由调用方注入 `write(resourceId, presentationOrNull)`）、`subscribe_presentation`。本模块自己不存任何东西。
- 写入路径：
  - 打开的编辑器：详情面板头部，经编辑器正常的文档修改（变脏，由 Save 保存）。
  - 内嵌 subagent：Subagent Pool 条目设置里的「Agent icon」行，经该条目原有的写入路径（与名称相同）。
  - Explorer 右键「Change icon…」：`writeResourcePresentation(resourceId, presentation|null)`（`src/SERVICEs/agent_resource_presentation_store.js`）；成功后广播 `emitSkeletonLibraryRefresh`；任何失败（含 `source_api_required`、`presentation_unsupported`）都只显示一条通用 toast「Could not change the icon of {name}.」，失败码只写到 `console.warn`。打开且有未保存修改的 Agent 在菜单中禁用（同 Rename，「save first」）。

## 运行时能力与即时反馈

- `usePresentationCapability`（`src/COMPONENTs/agents/use_presentation_capability.js`，每个会话只问一次 `api.unchain.getManagedCodeCapabilities`，复用 writer 导出的 `presentation_capability`；询问失败不缓存）判断运行时是否声明 `skeleton_execution >= 1.9` + `document_presentation_v1`。不支持、无法确认或仍在询问时**静默降级**：图标只是不可编辑——详情头部与内嵌 subagent 行显示普通头像（不是按钮，不会打开选择器），Explorer 菜单里没有「Change icon…」；界面上不出现任何提示文字。原因只通过 `console.warn` 报告给开发者。选择器本身在这种状态下也禁用所有选项与 Save（兜底）。
- 选择器内点选只是预览：选中状态与触发头像（详情头部 / Subagent 行）随之变化，不提交任何东西。底部左侧「Reset to default」只改预览中的选择；右侧主按钮「Save」（`agents.save.save`，与画布控制中心的 Save 同样式，有可保存内容时才是 accent）在预览与当前值不同才可用；选择器内按 Enter 等同 Save。Escape / 点击外部关闭并丢弃预览，头像恢复，不产生任何改动。
  - 编辑器入口（Agent 节点详情头部、内嵌 subagent 的「Agent icon」行）：Save 写入文档草稿（变脏、页面 Save 可用），由编辑器自己的 Save 持久化；不会在草稿打开时直接写资源。
  - Explorer：Save 立即写入资源；行头像乐观显示，写入失败时回滚并以通用 toast 提示；重新读取库后取已存值。打开且有未保存修改的 Agent 在菜单中禁用。

## 目录

`src/COMPONENTs/agents/agent_icons.js`，条目 `{ id, label, group, render }`，id 一经发布不得改名或复用。

- robots：`bot`（默认，即原 Agent 图标）、`robot_dome`、`robot_face`、`robot_bust`（后三者为 owner 提供的 24×24 路径，只在本文件中定义）。
- providers：`open_ai`、`anthropic`、`gemini`、`deepseek`、`kimi`、`ollama`（复用 icon manifest 中已有的 Logo 组件；全部是 `currentColor` 单色，随头像对比色着色）。
- everyday：`storefront`、`bar_chart`、`calendar`、`email`、`chat`、`search`、`code`、`terminal`、`data`、`server`、`folder`、`book_open`、`edit_pen`、`globe`、`map`、`home`、`heart`、`shield`、`education`、`brain`、`key`、`lock`、`target`、`flag`、`tool`、`hammer`、`phone`、`user`（全部为 manifest 中已有的字形）。

## 显示

`AgentAvatar`（`src/COMPONENTs/agents/agent_avatar.js`）：纯色圆角方块，字形按颜色亮度取白色或深色。用在 Explorer 行（`Explorer` 节点新增可选的 `prefix_render(size)`）、Subagent Pool 细条与 Agent library 行、Agent 文档里 Agent 节点的详情头部（可点击打开选择器）与画布上的 Agent 节点。选择器 `agent_icon_picker.js`：body portal、`Z.POPOVER`、Escape / 点击外部关闭，三组图标、11 个预设颜色（无自定义颜色）、「Reset to default」与「Save」。

## 跨边界门禁

PuPu 侧（本次）只读写文档中的 `presentation` 并通过注入的 writer 交出写入；文档 schema、sidecar 校验、本地校验镜像（`skeleton_document.js` 的 `DOCUMENT_OPTIONAL_KEYS` 及其 producer capture）与 `agent_resource_presentation_store.js` 由持久化改动另行声明 BC/AC。

## 已知限制

- Workflow 不显示 Agent 头像（保留流程图标）。Explorer 不再列出旧版 recipe（已删除「Not migrated」分组）。
- 引用的 Agent（agent_ref）只能在该 Agent 自己的页面或 Explorer 中修改，Pool 中只读。
- Explorer 显示的是已保存的值；在编辑器里改了但未保存时，Explorer 要到 Save 之后才更新。
- 聊天输入框的 Agent 选择器选项没有图标，未接入。
- 图标的无障碍名称（`label`）只有英文。
