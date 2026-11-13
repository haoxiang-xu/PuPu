# Agent 图标

每个 Agent **资源**可以有自己的图标，由用户在 Agents Explorer 中选择，并在列出该 Agent 资源的地方显示。前端只有图标，没有颜色选项。

## 资源与节点：两种身份

- **Agent 资源**（Explorer 里列出的那一项）有自定义图标，存在它自己的文档里。
- **Agent 节点**是一种节点类型，节点的属性与图标是固定的：永远是默认 `bot` 图标、Agent 节点蓝 `#4a5bd8` 底、白色字形，与没有 `presentation` 的 Agent 完全一样。节点身份独立于资源的 presentation——在 Explorer 里改图标绝不改变任何 Agent 节点。
- 显示面分类：
  - 资源面（显示自定义图标）：Agents Explorer 行；Subagent Pool 的条目行（引用的 Agent 取其资源摘要，内嵌的 Agent 取其 `source.document.presentation`）；Subagent Pool 的 Agent library 行。
  - 节点面（固定节点身份）：画布上的 Agent 节点、Agent 节点的详情面板头部、指向 Agent 节点的 NodeTag / NodeRefTag（Branch/Switch 的目标、输入/输出值的来源标签）、添加节点菜单、Find node、面包屑。
- 聊天输入框的 Agent 选择器选项没有图标，未接入。

## 存储

- 存在 Agent 自己的 Skeleton 文档里：可选的顶层键 `document.presentation`。
- 存储形状（运行时合同，未变）：`{ icon?: <目录 id，^[a-z0-9_]{1,40}$>, color?: "#rrggbb" 小写 }`；缺省 = 默认（`bot` 图标）。
- PuPu 只写 `{ icon }`：选择非默认图标写 `{ icon }`；选择默认图标 `bot` 或「Reset to default」删除整个键。任何写入都不带 `color`，因此保存会丢弃旧版本写下的颜色。
- 旧文档里的 `color` 仍可读取（`normalize_presentation` 保留格式合法的颜色，不改写已存数据），但任何地方都不绘制它：列表字形用行的文字颜色（`currentColor`），方块（`AgentAvatar` 的 tile 变体）固定用 `#4a5bd8` 底、白色字形。只有图标的文档和带图标+颜色的旧文档都能加载并显示其图标。
- 读取：资源摘要（`listSkeletonResources()` 返回的 `presentation`，对象或 null）、内嵌 subagent 的 `source.document.presentation`。
- `src/SERVICEs/agent_resource_icons.js` 是唯一的形状入口：`normalize_presentation`（丢弃未知键、不在目录中的图标、格式不合法的颜色；什么都不剩则 null；从不抛错）、`resolve_presentation`（存储的图标或默认图标，颜色恒为默认）、`presentation_to_store`（要写的值：`{ icon }` 或 null）、`set_presentation` / `reset_presentation`（由调用方注入 `write(resourceId, presentationOrNull)`）、`subscribe_presentation`。本模块自己不存任何东西。已删除调色板 `AGENT_PRESET_COLORS`、`normalize_color` 与 `with_document_presentation`。
- 唯一写入路径：Explorer 右键「Change icon…」→ `writeResourcePresentation(resourceId, presentation|null)`（`src/SERVICEs/agent_resource_presentation_store.js`）。它只写 `{ icon }`（传入格式合法的 `color` 会被接受但不写出；格式不合法或未知键仍 `invalid_presentation`、不发送）；成功后广播 `emitSkeletonLibraryRefresh`；任何失败（含 `source_api_required`、`presentation_unsupported`）都只显示一条通用 toast「Could not change the icon of {name}.」，失败码只写到 `console.warn`。打开且有未保存修改的 Agent 在菜单中禁用（同 Rename，「save first」）。
- 编辑器与节点侧没有任何改图标的入口：详情面板头部与 Subagent Pool 内嵌条目的「Agent icon」行已删除（`agent_icon_button.js` 已删除）。

## 运行时能力与即时反馈

- `usePresentationCapability`（`src/COMPONENTs/agents/use_presentation_capability.js`，每个会话只问一次 `api.unchain.getManagedCodeCapabilities`，复用 writer 导出的 `presentation_capability`；询问失败不缓存）判断运行时是否声明 `skeleton_execution >= 1.9` + `document_presentation_v1`。不支持、无法确认或仍在询问时**静默降级**：Explorer 菜单里没有「Change icon…」；界面上不出现任何提示文字。原因只通过 `console.warn` 报告给开发者。选择器本身在这种状态下也禁用所有选项与 Save（兜底）。
- 选择器内点选只是预览，不提交任何东西。底部左侧「Reset to default」只改预览中的选择；右侧主按钮「Save」（`agents.save.save`，与画布控制中心的 Save 同样式，有可保存内容时才是 accent）在预览图标与当前图标不同时才可用；选择器内按 Enter 等同 Save。Escape / 点击外部关闭并丢弃预览。
- Save 立即写入资源；行头像乐观显示，写入失败时回滚并以通用 toast 提示；重新读取库后取已存值。

## 目录

`src/COMPONENTs/agents/agent_icons.js`，条目 `{ id, label, group, render }`，id 一经发布不得改名或复用。

- robots：`bot`（默认，即 Agent 节点图标）、`robot_dome`、`robot_face`、`robot_bust`（后三者为 owner 提供的 24×24 路径，只在本文件中定义）。
- providers：`open_ai`、`anthropic`、`gemini`、`deepseek`、`kimi`、`ollama`（复用 icon manifest 中已有的 Logo 组件；全部是 `currentColor` 单色）。
- everyday：manifest 中已有的字形与 Remix Icon 路径（见文件）。

## 显示

`AgentAvatar`（`src/COMPONENTs/agents/agent_avatar.js`）：`glyph` 变体（无底色，字形取行的文字颜色）用于 Explorer 行（`Explorer` 节点的可选 `prefix_render(size)`）、Subagent Pool 条目行与 Agent library 行；`tile` 变体（`#4a5bd8` 圆角方块、白色字形）保留但当前没有调用方。选择器 `agent_icon_picker.js`：body portal、`Z.POPOVER`、Escape / 点击外部关闭，三组图标、「Reset to default」与「Save」，没有颜色控件。已删除的 i18n 键（11 个 locale）：`agents.icon_picker.color`、`agents.icon_picker.change`。

## 跨边界门禁

本次改动只在 PuPu 前端：运行时合同（文档 schema、sidecar 校验、`DOCUMENT_OPTIONAL_KEYS` 本地校验镜像及其 producer capture）不变，`color` 仍是合法的存储字段；前端只是不再写、不再画它。见 `agent-presentation-contract.md`。

## 已知限制

- Workflow 不显示 Agent 头像（保留流程图标）。
- 引用的 Agent（agent_ref）与内嵌 Agent 在 Pool 中只读；内嵌 Agent 没有 Explorer 项，因此其图标在 PuPu 中不再可改（已存的图标照常显示）。
- 聊天输入框的 Agent 选择器选项没有图标，未接入。
- 图标的无障碍名称（`label`）只有英文。
