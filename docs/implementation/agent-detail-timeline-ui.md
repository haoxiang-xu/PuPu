# Agent detail Timeline — 交互语言

当前落地范围：Process（原生 Agent）详情页。使用 Mini UI Timeline 的点与连线；输入、模型、指令、输出是配置区，不表示运行进度。

## 分组与交互

- 每个 section 是一个独立 disclosure，标题后紧跟上下展开箭头；右侧不显示配置摘要或其他说明文字。
- 收起时箭头向下，展开后箭头向上；不使用朝右的箭头。
- 收起时，标题整行可点击，最小高度 **32px**。
- **标题和整个 section 都没有 hover 高光背景**。无论收起、展开、鼠标停留还是键盘 focus，section 背景始终透明。
- 依靠 Timeline 的点、连线、缩进和间距区分配置区，不使用 section 卡片的背景、边框或阴影。
- 原生表单控件继续保留自己的边框、focus 和 hover，不能把输入框也当作 section 卡片去掉。

## 说明与选择器

- 解释整个 section 的 info icon 紧挨 section 标题，收起时也可查看；点击 info 不展开 section，不写入文档。
- 解释某个 selector 的 info icon 紧挨该 selector，和它在同一行，不单独悬在上方或下方。
- info 和展开按钮是独立的原生按钮，不嵌套交互控件。
- 详情页的 selector 使用统一 **1px** 细边框、沿用控件圆角与主题颜色，和输入框一起界定可编辑区域；section 自身仍无边框、无 hover 背景。
- selector 内的文字与图标作为一组靠右对齐，保留原有内边距；旁边的 info 仍是独立按钮。
- 除下述 Model picker 外，详情页其他 selector 经 `PanelSelect` 使用 Attach Panel 同款 Mini UI `Select` 的 `palette` 菜单：圆角、玻璃材质、选中态、滑动高亮和底部搜索共用现有实现，不另造一套下拉菜单。
- Model picker 与 Attach Panel **共用 `ModelPicker` 组件**：32px 模型胶囊、provider 图标侧栏、固定高度列表、底部 model 搜索、选中后保持打开。Builder 选择并保存宿主提供的完整 Kernel profile。
- 详情页 Model picker 在标题下方左对齐，宽度 220px；窄面板时随可用空间缩小，info 紧跟其后。
- BC-003 · Sidecar 从 wheel catalog 和既有 Ollama 安装模型目录生成本地/原生 profile，Main 用执行时同一个可信注册表和授权规则补齐 DeepSeek、Kimi 与用户配置。既有 `GET /skeleton_kernel_profiles`、IPC 回包与 CLOSED Kernel profile 形状沿用，凭据引用、协议、端点与模型按原身份保留，回包不读密钥。用户自定义组沿用 Settings 的功能开关。缺远程模型额度、非支持鉴权或额外请求头的模型维持不可选。已安装 Ollama 缺上限时使用 PuPu 的本地请求窗口，输出额度以 4096 为宿主预算上限并低于窗口。
- SEQ-003 · 模型目录更新只刷新候选，保存的 Kernel 与既有运行快照保持各自 profile。明确选模型才写草稿，运行时仍以当前注册表校验目标后解析密钥。
- AC-003 · 离线用固定 wheel 的实际验证器、Ollama 安装目录替身、Main 与 preload 回放验证精确 profile、拒绝不支持项、刷新与 UI 选择。打包配对、真实 provider、改后运行的冷进程与恢复另行验收。

## 列表与添加

- 列表按「已有条目 → 添加行」排列，添加按钮始终位于最后一项下面，左对齐。
- 使用现有 Mini UI Button 的轻量文本样式：`+ 添加输入` / `+ 添加输出`，不做独立卡片，也不放一个悬在标题右侧的加号。
- 添加行与列表使用同一内容缩进，间距 **8px**。按钮是次级操作，不占满整行。
- 空列表直接呈现添加行，不增加一段重复的空状态说明。
- 添加只走已有的字段创建逻辑；打开、折叠、hover 不改文档、不保存。
- 本次通过显式的 `addAtEnd` 展示参数应用于 Timeline；其他调用方保留原有布局。

## Process 输入

- 整行使用接近 slider 轨道的中性灰圆角长方形。左侧变量名和右侧值使用无边框 Mini UI Input，中间用静态等号表示赋值。点击右侧打开 Mini UI Context Menu，搜索并选择上游节点输出。未选择候选时，按 Enter 或离开输入框把改动的原文保存为固定值，Esc 放弃未确认的输入。末尾用带圆形底的叉删除。
- BC-001 · Builder 通过现有 Skeleton 草稿保存路径把 `execution.inputs` 交给 Store 与运行时。沿用既有 CLOSED binding 和 expression schema、资源身份及配对协议。新建或明确替换来源时写既有 `missing: "null"`，移除旧 `default`；仅查看、搜索、折叠或改名不改变既有策略。不新增协议字段或失败回退。
- SEQ-001 · 同一草稿中的节点和输入行，从读回已有 binding 到搜索、取消或选择，再到保存重开。取消保留旧文档；选择后重新读取应保持来源及 null 策略。已经选定的旧运行快照沿用原运行定义。
- AC-001 · Process 组件测试检查搜索与取消零写入、选择精确节点与路径、新建与改绑写 null、未编辑旧行原样保留。现有 Store 诊断与执行路径仍负责拒绝不合法的 binding。安装配对的保存重开与运行回归留待交付验收，本次是本地设计预览。

## Process 输出

- 与输入共用圆角长方形、左侧无边框名称编辑器和中间静态等号。右侧菜单只列本节点的输入字段、结果字段和整个对象。已有嵌套地址按原值显示，作者选定另一来源后才替换。
- BC-002 · 输出仍沿用 CLOSED `{name, source: {kind, path}}` 草稿合同和原有保存入口。菜单使用既有的输入名和结果字段清单，无新增字段、版本、身份或运行时投影。
- SEQ-002 / AC-002 · 打开菜单不写草稿。选择来源和改名只更新对应的映射行。组件回归覆盖输入字段和整个结果；安装配对保存重开留待交付验收。

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
