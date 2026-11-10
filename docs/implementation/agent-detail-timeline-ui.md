# Agent detail Timeline — 交互语言

当前落地范围：Process（原生 Agent）详情页。使用 Mini UI Timeline 的点与连线；输入、模型、指令、输出是配置区，不表示运行进度。

## 分组与交互

- 每个 section 是一个独立 disclosure，标题、摘要、展开箭头组成一行。
- 收起时，标题整行可点击，最小高度 **32px**。
- **标题和整个 section 都没有 hover 高光背景**。无论收起、展开、鼠标停留还是键盘 focus，section 背景始终透明。
- 依靠 Timeline 的点、连线、缩进和间距区分配置区，不使用 section 卡片的背景、边框或阴影。
- 原生表单控件继续保留自己的边框、focus 和 hover，不能把输入框也当作 section 卡片去掉。

## 列表与添加

- 列表按「已有条目 → 添加行」排列，添加按钮始终位于最后一项下面，左对齐。
- 使用现有 Mini UI Button 的轻量文本样式：`+ 添加输入` / `+ 添加输出`，不做独立卡片，也不放一个悬在标题右侧的加号。
- 添加行与列表使用同一内容缩进，间距 **8px**。按钮是次级操作，不占满整行。
- 空列表直接呈现添加行，不增加一段重复的空状态说明。
- 添加只走已有的字段创建逻辑；打开、折叠、hover 不改文档、不保存。
- 本次通过显式的 `addAtEnd` 展示参数应用于 Timeline；其他调用方保留原有布局。

## 间距与动效

| 项目 | 规则 |
| --- | --- |
| 标题内边距 | 纵向 6px、横向 9px |
| 标题到内容 | 7px |
| 内容左右内边距 | 9px，与标题文字对齐 |
| 内容底部留白 | 8px |
| 控件组间距 | 12px；列表项与添加行沿用列表的 8px |
| section / 标题背景 | 始终透明，无 hover 高光或背景过渡 |
| 展开与收起 | 自适应高度 200ms；透明度 160ms；箭头旋转 200ms |

启用减少动态效果时，section 过渡关闭。折叠只隐藏内容，编辑器保持挂载；未保存文本、输入到一半的数字和局部诊断继续保留。键盘使用原生按钮和表单控件的 focus；关闭区不进入 Tab 顺序。

## 实现入口

- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/process_timeline.js`
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/input_variables_section.js`
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/output_variables_section.js`

共用 Timeline 的默认 Trace Chain 行为保持原样。
