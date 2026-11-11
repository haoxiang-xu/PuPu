# Agent detail Timeline — 交互语言

当前落地范围：Process（原生 Agent）详情页。一列到底，只有一种标题。模型与指令是 Agent 的身份，始终展开在最上方；其下是输入、输出两个可折叠配置区；少有人动的上限放在最底部的 Advanced。不再使用 Timeline 的点与连线：两项内容用不着一条轨道，缩进还会挤掉变量行的宽度。

## 分组与交互

- 自上而下：Model → Prompt → Input → Output → Advanced，区与区之间只靠 20px 间距分隔，没有分隔线、卡片或缩进，内容占满面板宽度。
- 五个区用同一种标题：小号大写说明文字（11px、字距 1.5px、40% 不透明度，与侧边菜单的分区标题同款）。
- Prompt 标题行右侧显示指令的字符数（按可见字符计，中文和 emoji 各算一个），随输入实时更新，位置与折叠区的条目数一致。
- Model、Prompt 不可折叠。Input、Output、Advanced 可折叠，标题后紧跟上下展开箭头。Input / Output 收起时行尾右对齐显示条目数量，展开后淡出。
- 某个区里有问题时，其标题旁显示红色数字徽标（问题条数），折叠或滚走时仍可见；Input / Output 第一次出现问题时自动展开一次，之后由作者自行折叠。
- Input / Output 的展开状态在本次会话内记住，切换节点不会复位；默认只展开 Input。
- 面板内所有可编辑控件用同一种安静的填充底（深色 7.5% 白、浅色 4.5% 黑）、8px 圆角、无描边：Model 选择器、Prompt 输入框、变量行、Advanced 的数字框与下拉。
- Output 里的 JSON Output 是一行设置（12.5px 正文 + 38×20 开关），不是又一个标题。
- Advanced 是「标签在左、值在右」的四行：Max turns、Reply tokens（旁边以 `≤ N` 标出上限）、History、When the window fills。不再用拆开的句子夹输入框。
- 收起时箭头向下，展开后箭头向上；不使用朝右的箭头。
- 只有标题文字和箭头（外加四周约 8px）可点击展开或收起，点击区高 **32px**；这一行其余空白不响应，方便点空白处关掉打开的下拉菜单。
- **标题和整个 section 都没有 hover 高光背景**。无论收起、展开、鼠标停留还是键盘 focus，section 背景始终透明。
- 依靠间距和统一标题区分配置区，不使用 section 卡片的背景、边框或阴影。
- 原生表单控件继续保留自己的边框、focus 和 hover，不能把输入框也当作 section 卡片去掉。

## 说明与选择器

- 解释整个 section 的 info icon 紧挨 section 标题，收起时也可查看；点击 info 不展开 section，不写入文档。
- 解释某个 selector 的 info icon 紧挨该 selector，和它在同一行，不单独悬在上方或下方。
- info 和展开按钮是独立的原生按钮，不嵌套交互控件。
- Process 面板的 selector 与输入框使用上述统一填充底，无描边；section 自身仍无边框、无 hover 背景。
- selector 内的文字与图标作为一组靠右对齐，保留原有内边距；旁边的 info 仍是独立按钮。
- 除下述 Model picker 外，详情页其他 selector 经 `PanelSelect` 使用 Attach Panel 同款 Mini UI `Select` 的 `palette` 菜单：圆角、玻璃材质、选中态、滑动高亮和底部搜索共用现有实现，不另造一套下拉菜单。
- Model picker 与 Attach Panel **共用 `ModelPicker` 组件**：32px 模型胶囊、provider 图标侧栏、固定高度列表、底部 model 搜索、选中后保持打开。Builder 选择并保存宿主提供的完整 Kernel profile。
- 正文字号：指令输入框与 disclosure 标题 12.5px，变量 pill 12px，辅助说明与报错 11.5px。
- 详情页 Model picker 在标题下方占满整行（高 34px、8px 圆角，模型名靠左、箭头靠右），info 紧跟其后。
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

- 整行使用接近 slider 轨道的中性灰圆角长方形。左侧变量名和右侧值使用无边框 Mini UI Input，中间用静态等号表示赋值。点击右侧打开 Mini UI Context Menu，搜索并选择上游节点输出。未选择候选时，按 Enter 或离开输入框把改动的原文保存为固定值，Esc 放弃未确认的输入。删除用的叉在行内最右侧，和这一行同属一块底。
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
| 标题行 | 点击区只包住文字与箭头，高 32px，文字与内容左对齐 |
| 标题到内容 | 8px |
| 区与区 | 20px |
| 控件组间距 | 12px；列表项与添加行沿用列表的 8px |
| section / 标题背景 | 始终透明，无 hover 高光或背景过渡 |
| 展开与收起 | 自适应高度 200ms；透明度 160ms；箭头旋转 200ms |

启用减少动态效果时，section 过渡关闭。折叠只隐藏内容，编辑器保持挂载；未保存文本、输入到一半的数字和局部诊断继续保留。键盘使用原生按钮和表单控件的 focus；关闭区不进入 Tab 顺序。

## 实现入口

- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/process_timeline.js`
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/input_variables_section.js`
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/output_variables_section.js`

`process_timeline.js` 保留文件名，但已不再使用 Timeline 组件；共用 Timeline 的默认 Trace Chain 行为保持原样。

## Start 与 End

两端节点沿用同一套语言：一列到底，同款分区标题，同款 32px 填充行（8px 圆角、无描边），删除叉在行内。

- 两个区：Input Variables、Output Variables。各只有一两条短列表，所以都**不折叠**；条目数放在标题行右侧，与折叠区收起时的位置一致。说明文字一律收进标题旁的 info。
- Start · Input：调用方提供的字段，只读。行内是字段名、右侧类型和一把小锁，没有可编辑控件；库视图里调用方未知时只有一行「调用方输入 · object」。字段无法确定时标题旁出红色徽标，正文用 11.5px 红字说明。
- Start · Output：值一侧显示为「调用方输入 · 字段」。调用方的形状没有声明，所以字段名直接在值一侧输入（Enter 或离开输入框确认，Esc 放弃，未改动不写入）；菜单另有「收到的全部值」。
- End · Input：与 Agent 的输入行完全相同。上游有分支时，来源菜单末尾多一项「多个来源中的首个可用值」：把这一行变成首个可用值列表，可能没运行的分支来源排第一，原来的来源作为兜底。
- 首个可用值列表：行头只写名字和「多个来源中的首个可用值」，下面按尝试顺序列出来源，每个来源是一条 28px 填充行（序号、来源、删除；至少保留两条），末尾「+ 添加来源」。
- End · Output：与 Agent 的输出行相同，菜单只列本节点的输入和「收到的全部值」。
- 已有的嵌套地址按原值显示，不在这里逐级编辑；逐级路径编辑器仍用于 Code、Tool Call 等其他节点。

实现入口：`detail_panel/start_end_panel.js`、`detail_panel/first_present_pill.js`；共用 `process_timeline.js` 导出的 `Block`。

## Toolkit Pool 与 Subagent Pool

同一套标题、填充行和「标签在左、值在右」，共用样式在 `detail_panel/panel_style.js`。

- Toolkit Pool：三个区 Pool → Workflows as tools → Installed。Pool 里每个 toolkit 是一条 32px 填充行（图标、名称、上下箭头，右侧开启数 `2/5`、All / None、删除），展开后工具以 chip 显示在同一块底里：开启是深一级的底，关闭只留淡色文字，不再用蓝色实心。「Merge with user-selected」是 Pool 区下面的一行设置（38×20 开关），说明收进 info。Installed 是搜索框加单列填充行，每行末尾「+ Add」。原来只写着「即将推出」的 Store 标签页去掉了。
- Workflows as tools：说明收进 info，不可用时标题旁出红色徽标；每个 Workflow tool 是一块填充底，删除是行内的叉，`+ Add Workflow tool` 在列表末尾。
- Subagent Pool：标题行右侧显示条目数。每个条目由一条填充的身份行（图标、名字、来源、Open、删除）、一个描述输入框和五行「标签在左、值在右」的设置（Mode chip、Reads、Memory、Parallel、Tools）组成，条目之间只靠间距分隔，没有卡片。`+ Add an Agent` / `+ Embedded` 在列表末尾，选择 Agent 时候选项是同款填充行。

## 其余节点（Code、If/Else、Switch、Tool Call、Skill Read、Workflow Call、Hooks Pool）

这些节点不改结构，只统一外观：

- 分区标题一律用 `CAPTION_TEXT`（`panel_style.js`），与左侧菜单分区标题同款小号大写，不再有各自的 LABEL 常量。
- 输入框统一用 `PanelInput`（`panel_input.js`），下拉统一用 `PanelSelect`：浅色填充、8px 圆角、透明描边。
- 分区之间不画分隔线，只留间距；去掉蓝色、绿色强调色，状态文字用 `--pupu-text-muted`，错误仍是红色。
- 装控件的卡片（条件组、case 行、hooks 编辑器等）去掉底色和描边，只有 Switch 的 Default 保留一块填充底，因为它是一条固定出口而非可编辑行。
- 输入/输出行展开后的设置区不再是带描边的卡片；标签统一 64px 宽、12px。
- 字号收敛到 12.5 / 12 / 11.5 / 11px，圆角统一 8px，面板内开关 38×20。
- 通用节点的输入、输出列表也把「+ Add」放在列表末尾。
