# Agent detail Timeline — 交互语言

当前落地范围：Process（原生 Agent）详情页。一列到底，只有一种标题。模型与指令是 Agent 的身份，始终展开在最上方；其下是输入、输出两个可折叠配置区；少有人动的上限放在最底部的 Advanced。不再使用 Timeline 的点与连线：两项内容用不着一条轨道，缩进还会挤掉变量行的宽度。

## 分组与交互

- 自上而下：Model → Prompt → Input → Output → Advanced，区与区之间只靠 20px 间距分隔，没有分隔线、卡片或缩进，内容占满面板宽度。
- 五个区用同一种标题：小号大写说明文字（11px、字距 1.5px、40% 不透明度，与侧边菜单的分区标题同款）。
- Prompt 标题行右侧显示指令的字符数（按可见字符计，中文和 emoji 各算一个），随输入实时更新，位置与折叠区的条目数一致。
- 没有自定义名字的 Agent 节点，画布和详情页标题都显示类型名「Agent」，不显示内部 id（如迁移来的 `agent_main`）；改过名则显示自定义名字。
- Model、Prompt 不可折叠。Input、Output、Advanced 可折叠，标题后紧跟上下展开箭头。Input / Output 收起时行尾右对齐显示条目数量，展开后淡出。
- 某个区里有问题时，其标题旁显示红色数字徽标（问题条数），折叠或滚走时仍可见；Input / Output 第一次出现问题时自动展开一次，之后由作者自行折叠。
- Input / Output 的展开状态在本次会话内记住，切换节点不会复位；默认只展开 Input。
- 底色与描边各只表示一件事（`panel_style.js`）：
  - **底色＝区域。** 一段里的若干行共用一块淡底（`Region`，10px 圆角，`REGION_RADIUS`），行与行之间是一条细线（6%），行自身没有底色，不出现块中块。深色下区域是 3.5% 白；浅色下是不透明的 `--pupu-surface`（默认纯白），面板本身是半透明玻璃，所以区域比面板亮。面板自身的底色属于外壳，这里不改。
  - **白底输入框＝可输入、可选择的控件。** Model 选择器、Prompt 输入框、Advanced 的数字框与下拉、分段选择，一律是同一个输入框：浅色下白底（`--pupu-surface`，`fieldBackground`）、深色下 7.5% 白，**无可见边框**（保留 1px 透明边以免尺寸变化），圆角与 Input / Output 区域相同（`FIELD_RADIUS = REGION_RADIUS = 10px`），**hover 不变**——没有 hover 填充、阴影或描边变化（`fieldFill` / `textFieldFill`，经 `PanelInput`、`PanelSelect` 统一）；focus 保留控件自身的 focus 标记。选中项用淡填充（`fillStrong`），不再套第二圈线；开关不描边。
  - **变量行（名字 = 值）两边都不画边框**，也没有 hover 填充；行的底就是所在区域的底。
- Output 里的 JSON Output 是一行设置（12.5px 正文 + 38×20 开关），不是又一个标题。
- Advanced 是「标签在左、值在右」的四行：Max turns、Reply tokens（旁边以 `≤ N` 标出上限）、History、When the window fills。不再用拆开的句子夹输入框。
- 收起时箭头向下，展开后箭头向上；不使用朝右的箭头。
- 只有标题文字和箭头（外加四周约 8px）可点击展开或收起，点击区高 **32px**；这一行其余空白不响应，方便点空白处关掉打开的下拉菜单。
- **标题和整个 section 都没有 hover 高光背景**。无论收起、展开、鼠标停留还是键盘 focus，section 背景始终透明。
- 依靠间距和统一标题区分配置区，不使用 section 卡片的背景、边框或阴影。
- 原生表单控件不画边框、不做 hover 高光，只保留 focus 标记；不能把输入框也当作 section 卡片去掉。

## 说明与选择器

- 解释整个 section 的 info icon 紧挨 section 标题，收起时也可查看；点击 info 不展开 section，不写入文档。
- 解释某个 selector 的 info icon 紧挨该 selector，和它在同一行，不单独悬在上方或下方。
- info 和展开按钮是独立的原生按钮，不嵌套交互控件。
- Process 面板的 selector 与输入框使用上述统一白底输入框（白底、无边框、10px 圆角，无 hover 高光）；section 自身仍无边框、无 hover 背景。
- selector 内的文字与图标作为一组靠右对齐，保留原有内边距；旁边的 info 仍是独立按钮。
- 除下述 Model picker 外，详情页其他 selector 经 `PanelSelect` 使用 Attach Panel 同款 Mini UI `Select` 的 `palette` 菜单：圆角、玻璃材质、选中态、滑动高亮和底部搜索共用现有实现，不另造一套下拉菜单。
- Model picker 与 Attach Panel **共用 `ModelPicker` 组件**：32px 模型胶囊、provider 图标侧栏、固定高度列表、底部 model 搜索、选中后保持打开。Builder 选择并保存宿主提供的完整 Kernel profile。
- 正文字号：指令输入框与 disclosure 标题 12.5px，变量 pill 12px，辅助说明与报错 11.5px。
- 详情页 Model picker 在标题下方左对齐，**固定宽 200px**（`max-width: 100%`，面板很窄时仍可收缩），高 34px、白底、无边框、10px 圆角、无 hover / 按下高光，模型名靠左、箭头靠右，info 紧跟其后。
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
- 已有的嵌套地址按原值显示，不在这里逐级编辑；Code、Tool Call、Skill Read、Workflow Call 的输出行用同一 pill，值一侧可直接输入路径（见下文「Code 面板」）。

实现入口：`detail_panel/start_end_panel.js`、`detail_panel/first_present_pill.js`；共用 `process_timeline.js` 导出的 `Block`。

## Toolkit Pool 与 Subagent Pool

同一套标题、填充行和「标签在左、值在右」，共用样式在 `detail_panel/panel_style.js`。

- Toolkit Pool：三个区 Pool → Workflows as tools → Installed。Pool 里每个 toolkit 是一条 32px 填充行（图标、名称、上下箭头，右侧开启数 `2/5`、All / None、删除），展开后工具以 chip 显示在同一块底里：开启是深一级的底，关闭只留淡色文字，不再用蓝色实心。「Merge with user-selected」是 Pool 区下面的一行设置（38×20 开关），说明收进 info。Installed 是搜索框加单列填充行，每行末尾「+ Add」。原来只写着「即将推出」的 Store 标签页去掉了。
- Workflows as tools：说明收进 info，不可用时标题旁出红色徽标；每个 Workflow tool 是一块填充底，删除是行内的叉，`+ Add Workflow tool` 在列表末尾。
- Subagent Pool：一份可折叠的名册，标题行右侧显示条目数。
  - 收起时每个条目是一条 46px 的填充行：图标、名字、允许的调用方式，第二行是描述（没有描述时淡色提示，条目有问题时这一行变红并写明原因）；右侧是 Open 和折叠箭头，位置在收起和展开时不变。
  - 同时只展开一个。打开文档时所有条目一律收起（只有一个条目、条目有问题也收起，问题数在收起行上），只由作者点开；唯一例外是刚添加的条目自动展开一次，光标落在描述框。面板不卸载期间保留作者自己的展开/收起。折叠只隐藏内容，编辑器保持挂载，未存入的名字不会丢。（2026-11-12）
  - 展开后在同一块底里自上而下：名字（标题行内直接编辑）→ 描述（三行输入框，说明写明「调用方 Agent 会读这段话」）→ 调用方式（三行，每行勾选框、名称、一句解释，选中用 accent 色）→ Reads / Memory（Mini UI `SegmentedButton`）与 Parallel（glass 开关），标签一列、控件一列，控件左右边缘对齐 → 来源与 Remove。
  - Tools 只在不是默认的「every tool」时出现，只读。
  - 开关一律用 `<Switch material="glass">`，保持它自己的 60:38 比例（38×24），状态改动写在 `set_on` 里：glass 开关会拦住点击冒泡，不能靠外层元素接点击。
  - 添加只有一个入口 `+ Add an Agent`：展开后是细边框搜索框加候选 Agent 的填充行，最后一项是 `New embedded Agent`。

## 当前位置与下钻路径（2026-11-12）

画布左上角的浮动面包屑已删除（它在窗口拖拽区里点不到）。当前打开的图与下钻路径改由侧栏搜索框上方的面包屑 `side-menu/side_menu_breadcrumb.js` 显示，编辑器经 `SERVICEs/agents_drill_trail.js` 发布（段由 `recipes_page/drill_trail.js` 从原有 crumbs 生成，导航仍走原来的 `drill_to` / `handleDrillTo`）：

- 没有打开任何东西：`Home › Agents`（Agents 灰、不可点）。
- 选中一个 Agent / Workflow：它替换 Agents 那一段，`Home › Default`，一段灰色的图标 + 名字，不可点。
- 下钻：`Home › Default › Summarizer`（再深一层再加一段）。之前的层级可点、回到那一层；当前层灰、不可点，tooltip 附「Esc 返回上一级」。Subagent Pool / Hooks Pool / Workflow Call 这类说明性 crumb 不再出现。
- 图标：资源 Agent 用它自己的 `AgentAvatar` glyph，嵌入的 Agent 用默认 bot，Workflow 用 workflow 图标，颜色中性。不可点的段没有 hover 底、默认光标、图标和文字都淡。
- 名字超过 140px 省略号；整条超出侧栏宽度时横向滚动（无滚动条），保持末端可见。整条 `WebkitAppRegion: no-drag`。Escape 逐级返回不变。

## 所有节点面板的统一标准（以 Start、End、Agent、Toolkit Pool 为定稿）

2026-11-11 project owner 定稿 Start、End、Agent、Toolkit Pool 四个面板；其余节点面板（If/Else、Switch、Tool Call、Skill Read、Code、Hooks Pool、Workflow Call）只按下列标准统一外观，不改行为、数据、test id、aria、i18n。Subagent Pool 另行重设计，只随共用样式变化。共用实现都在 `detail_panel/panel_style.js`、`panel_input.js`、`panel_select.js` 与 `process_timeline.js` 的 `Block`。

- **分区标题**：`Block`（11px 大写、1.5px 字距、40% 不透明度；可带问题数徽标、info、右侧数量）。不再有各自的 `LABEL` / `SECTION_LABEL` 标题文字。
- **分区间距**：20px；标题到内容 6px。
- **一组行 = 一个 `Region`**：一块淡底（浅色 `--pupu-surface`，深色 3.5% 白），10px 圆角（`REGION_RADIUS`），无边框，行与行之间一条细线，行自身不带底色、不画卡片、不画彩色侧线。
- **输入框与下拉**：`PanelInput` / `PanelSelect` / `fieldFill`，多行 `TextField` 用 `textFieldFill`。浅色白底、深色 4.5% 白，无边框，10px 圆角（`FIELD_RADIUS = REGION_RADIUS`），静止、hover、focus 外观一致（只靠光标表示 focus）。
- **变量行（名字 = 值）**：两侧都无边框、无 hover 填充，底色就是所在 Region。
- **Input / Output Variables 在每个节点上同一外观**（2026-11-11）：`Block`「Input Variables」/「Output Variables」标题（问题徽标 = 该区诊断数，右侧条目数，与 Start/End 一致），输入行是 `InputValuePill`（`name = value ×`）放在一个 `Region` 里，列表末尾「+ Add input」。外观与语义分开：`breadcrumb`（Agent、End）= 缺值一律读 null、行上没有缺值策略；其他节点（If/Else、Switch、Code 等）传 `look="pill"`，只借外观，仍保存自己的缺值策略（新行默认 `error`），行内删除叉左侧多一个「…」（aria-label「名字 · If missing」）展开原来的 `MissingPolicySelect`。Output Variables 在这些节点上同样传 `look="pill"`（2026-11-12）：行是 `OutputValuePill` 加 `typedPath`，值一侧是一个可输入的路径（`result.items[0].name`、`inputs.diff`，或只写字段名沿用当前一侧），输入时菜单按第一段过滤列出可选字段，Enter 或离开确认，Esc 放弃，不是路径的文字不写入；显示仍是中性 `NodeRefTag`（「Result · items[0].name」）。这样保留了 `OutputRow` 的多级路径与手写字段名，Agent / Start / End（`breadcrumb`）不受影响。Tool Call 的参数、Workflow Call 的输入由 schema 决定名字，仍是各自的行。
- **节点标签 `NodeTag`**（`detail_panel/node_tag.js`，2026-11-11 改版）：指向画布上某个步骤时用它。圆角矩形（高 22px、圆角 6、左右内边距 6 / 8、字号 11.5px、字重 500），**整块填该步骤的纯色**（`node_identity` 的颜色，与画布节点一致；Agent 文档里的 Agent 节点用该 Agent 自己的 presentation 颜色与图标），不再有单独的图标方块。图标（13px）与名字用同一种字色，按底色亮度从白色 / 近黑 `#1d1d1f` 中取对比更高者（`avatar_glyph_color`）。名字最长 180px，超出省略号，完整名字在 title。可传 `node`，或直接传 `{icon, color, name}`；`node` 旁再传 `name` 时保留调用方的文字。未连接、已删除的步骤仍是原来的文字样式，不是标签。
- **变量引用标签 `NodeRefTag`**（同文件）：变量行的值读自某个步骤时，`VariablePillValue` 把它画成**一个**标签，两半无缝拼接、外面一圈圆角 6 的描边（该色 40% / 暗色 50%）：左半是该步骤的 `NodeTag`（纯色底、图标 + 名字），右半是读取的字段路径（等宽 11.5px，正文字色），底是同色淡染（亮色 18%、暗色 22%）。两半之间不加箭头，颜色台阶本身就是分隔。左半最多占 62%，两半各自省略号。来源不是步骤（调用方输入、Inputs / Result）或步骤已被删除：同一形状的中性版（左半 `fillStrong` + 淡色字）。没有字段的值（如「First of several」、未选择）仍是淡色文字；固定值仍是行内无框文字。Start / End / Agent / If-Else / Switch / Code 等节点的 Input Variables 行、First of several 的各来源行、Output Variables 的值、以及选来源的菜单项都用它。
- **问题数徽标**（`ProblemCount`）：16px 高、全圆角、10.5px 600。Jost 的行框让数字比正中高约 1px（实测墨迹距上 3.3px、距下 5.3px），所以内边距是 `2px 5px 0`（上 2、下 0），实测上下各约 4.3px。
- **设置行**：`SettingRow`，标签在左、控件在右；开关用 `SemiSwitch` + `PANEL_SWITCH`。
- **按钮**：列表末尾的添加用 `addButtonStyle`，行内删除用 `removeButtonStyle`。
- **文字**：正文 12–12.5px；说明 `note`，报错 `problem` / `errorColor`；不写裸色值。
- **选中的 chip**：成功绿（浅色 `--pupu-success` #22c55e + 白字，深色 #4ade80 + #052e16 字），600 字重。
- **头部**：macOS 停靠面板里节点图标距面板上、左各 16px，标题右侧给开关留 44px，下方一条细线分开固定头部与滚动区。
- 不加卡片底、描边、阴影；两种主题都按上述 token。
- **条目列表的统一模型（Toolkit Pool 与 Subagent Pool 共用）**：
  - 收起时每个条目是一条细条：图标、名称、折叠箭头、右侧摘要（数量或调用方式），整条（除行内按钮外）是一个 `aria-expanded` 按钮。
  - 删除只有一个位置：细条最右侧的叉（`removeButtonStyle`，22×22，无文字）。
  - 添加：每个列表末尾只有一个统一的 `AddButton`（`detail_panel/add_button.js`：加号图标 + 文字）。Toolkit Pool 的「Add」打开一个小菜单（`BUILTIN_COMPONENTs/context_menu`，`Z.POPOVER`）：Toolkit（第二级列出尚未加入的已安装 toolkit）与 Workflow（新增一个 Workflow tool）。Subagent Pool 的「New embedded Agent」就在最后一个 subagent 下面；已有 Agent 在下方「Agent library」区（搜索框 + 每行「+ Add」）。
  - Toolkit Pool 自上而下：「Merge with user-selected」开关（独立一块，面板第一项）→「Tools and Workflows」一个列表（先 toolkit，后 Workflow tool，同一种可折叠细条，右侧删除叉；标题旁数量 = 两者之和）→ Add → Installed。
  - 展开内容在同一块底里、细条下方，每个设置行之间一条细线，行自带内边距、不带底色。
  - Subagent 细条高 36px，图标 22px，图标距细条上、下、左都是 7px；每个 subagent 一块独立 Region，块间 8px。Subagent 同时只展开一个（条目内容较长），Toolkit 可同时展开多个。
- **节点图标**：一律纯色（原渐变的深色端），不再使用渐变；画布节点、详情头部与 Subagent 头像相同。

落地情况（2026-11-11）：If/Else 与 Switch（`branch_section.js`）、Tool Call（`tool_call_section.js`）、Skill Read（`skill_read_section.js`）、Code（`code_section.js`）、Hooks Pool（`hooks_pool_section.js`、`hook_workflow_source.js`）、Workflow Call（`workflow_call_section.js`、`workflow_pin_control.js`）已按此标准改为 `Block` 标题、20px 分区间距、`Region` 行组、共用输入框与按钮、`note` / `problem` 文字色。尚未决定、暂按原样保留的：

- `SegmentedButton` / `SegmentedControl`（Tool Call 的 On error 与 Approval、Hooks 的 Runs 等）是否改为下拉或开关。
- If/Else 嵌套条件组去掉了青色侧线，只留 10px 缩进；是否需要更明显的分组。
- 带文字的删除类按钮（Remove、Unset、Remove setting）沿用 `addButtonStyle` 的文字按钮，是否改为图标按钮。
- Code 的 Result 开关行（标签是随状态变化的一句话）保留手写布局。
- Switch 节点不再有外层「Switch」标题，直接是「Switch on」「Cases」两段。

### Code 面板（2026-11-12）

只改界面；`config.code` 的形状不变，运行时不变。从上到下：Input Variables（pill）→ Code → Limits → Result → On error →（有时）Stored artifacts / 不支持的设置 → Output Variables（pill，可输入路径）。

- **只有 Python**：不再有 Runtime 区、Python 选择器、「Name a Python…」表单和探测按钮（后端/API 未删）。头部副标题：内置或未指定为「Python」，其他 profile 为「Python · id」。只有存的 Python 本机没有/不可用/不可读时，Code 区出现一条问题和「Use the built-in Python」。
- **默认值（2026-11-12 修订）**：Python 与三个限制有默认值 `CODE_DEFAULTS`（`builtin`、30 s、1 MiB、1 MiB）。未设置 = 用默认值：面板不报问题，占位符显示默认值；清空输入框回到默认。运行时要求显式写出这些键，所以唯一的规范化函数 `with_code_defaults`（`code_config.js`，沿用 `owned_code_nodes` 的遍历，含嵌入图）在 `save_draft` 与 `diagnose` 里对整份文档补上缺的键；已存的值（无论是什么）不动；打开文档不会变脏，旧节点在下一次保存时写入。Preflight 与运行只传 resource id、读的是已存草稿，所以从未重新保存过的旧节点在保存前仍会被运行时拒绝（见开放问题）。
- **新节点即可用**：画布添加 Code 节点时带一个 starter：`def main(input, context): return dict(input)`（原样传出输入，没有输入时返回 `{}`）作为面板写入的托管源 `__pupu_code__/sha256/<sha>.py`，加上一个封闭、没有字段的 Result 和默认值，所以零问题。文字随添加命令的 `sources` 进入会话表（`add_node` → `apply_graph_command` → `editCurrent` 的第三个参数），撤销即释放。
- **问题文案**：没有设置的旧节点只有一条「Write the code for this step.」；有代码没有 Result 只有一条「Add the fields your code returns.」，在 Result 区显示并带徽标；每条问题显示在它所属的区（Code / Limits / Result），其他（不使用的设置、读不了的附件）在面板底部。
- **Code 编辑器**（`code_editor.js`）：原生 textarea（文字透明、光标可见）叠在 highlight.js 高亮的 `<pre>` 上，字体/行高/内边距一致，随滚动同步；行号栏随纵向滚动；不换行，长行横向滚动；高度 = 行数夹在 8–24 行；内边距四边 10px，宽度与上下 Region 对齐；底色仍是 `textFieldFill`；配色与聊天代码块相同（vs2015 / atom-one-light，共用 `loadHighlightTheme`）；Tab 插入四个空格（浏览器编辑命令，可撤销），Shift+Tab 仍离开；输入法组字时隐藏高亮层。
- **Limits**：一个 `Region`，三行「Run time ≤ __ seconds」「Result size ≤ __ bytes」「Printed output kept ≤ __ bytes」；数字在行内无框、无底、无悬停/聚焦高亮（`variablePillField`）。三者都是上限：运行到该秒数即停止进程（结果未知）；结果 JSON 超过该字节数节点失败；print/错误输出各保留该字节数，其余丢弃、运行继续。占位符是默认值（30、1048576、1048576）；清空输入框即删除该键（= 默认值，保存时写入）；非整数或越界的文字留在框内不写入并显示原因。
- **画布卡片**：Code 节点在画布上只是共用头部（图标、名字、「Python」），最小高 63，端口/凸起/凹口与其他步骤相同；不显示代码、预览、查看器或展开按钮，也不再有低缩放特例。
- **On error**：运行时没有可选策略，所以不放开关或下拉，只用两行只读 `SettingRow`：「Error or time limit → Run stops」「Result doesn't match → Run stops」，细节在标题 info。
- Stored artifacts 与不支持的设置：行尾为 `removeButtonStyle` 的 ×，artifact 行放在 `Region` 里。各区标题带问题徽标（Code：源与 Python；Limits：缺失/越界；Result：schema）。

### 变量继承（2026-11-12，只开 Code）

`recipes_page/variable_inheritance.js`：与节点类型无关的共用部分 + 每类一个适配器（`INHERITANCE_ADAPTERS`），目前只启用 `code`。

- **触发**：只有用户在画布上的 `connect` / `reconnect` 命令（`skeleton_graph_commands.apply_graph_command`）。加载、粘贴、复制、导入都不走这条路径，所以不触发。新出现的 flow 边的目标节点才会被考虑；attach 边不看。边和继承的变量是同一次编辑，一次撤销。
- **继承什么**：目标节点的直接 flow 前驱的 Output Variables（不含运行时自己的 context），每个一条输入：同名、`ref` 到该前驱的 `[name]`、缺值 `error`（与输入选择器写入的完全相同）。多个前驱时先到者保留同名。
- **只填没动过的节点**：没有存储标记（形状是封闭的），用比较判断：把节点现在的输入按它们引用的节点重新生成一遍，Result 和 Output Variables 按这些输入重新生成，源码仍是 starter——全部一致才算没动过，在连接前的文档上判断。没动过的节点重连到新上游时整体替换；用户改过输入、Result、输出或代码中任何一项后不再改写。
- **Code 适配器**：输入 = 继承；Output Variables = 每个输入一条 `result.<name>`；Result = 上游声明了类型的字段（Agent 的 `message`、Agent JSON Output 字段、Code Result 字段、Tool Call 的 `ok`）为同类型 required 字段，类型未知的（Start 调用方输入、工具结果、Skill、Workflow Call、多级路径）不声明并让 Result 保持开放，这样字段行仍能显示，运行时也会发布这些键；全部已知或没有输入时 Result 封闭。starter 的 `return dict(input)` 正好返回这些。
- **断开**：什么都不清除。输入仍引用原节点，商店的检查在该行报「reference must name an upstream flow node」（运行时要求引用来自任意上游 flow 节点，不必直接相连），缺值策略为 `error` 的输入在运行时失败。

### Switch（`switch_case`）面板（2026-11-11 project owner 定稿）

只改界面；存储形状仍是 `{inputs, value, cases: [{id, value}]}`，运行时不变。匹配是严格相等、取第一个相等的 case，值互不相同，所以顺序只决定画布上出口的排列（`branch_ports` 按列表顺序，标签即 `case_display`）。

- **Switch on**：`Block` 标题，匹配规则写在 info 里。一个 `Region`，一行 `SettingRow`「Value」+ 本节点输入变量的 `PanelSelect`。下面一行是「Read inside」路径编辑（`PathEditor`，只编辑输入名之后的步骤，按需「+ Read inside it」添加）。没有「An input / A fixed value」选择：新节点只能按输入分支。已存的固定值（`kind: "literal"`）或读不懂的值原样显示、原样保存，下一行「Use an input instead」选一个输入后才替换。没有输入时只显示「先在上面添加输入」的说明。未选值、或选的输入不存在，是红字问题并计入标题徽标。
- **Cases**：`Block` 标题，右侧是 case 数，问题徽标 = 每个 case 的问题（重复值、缺值等）+ 每个未连接的 case + 未连接的 Default。一个 `Region`，每个 case 是一条平铺行（不折叠），行间细线：
  - 行的布局与变量行相同（`variable_pill` 的 5 : 18px : 6 三列、32px 高、右侧删除叉）：`值  →  [去向标签]  ×`。
  - 左：值直接在行内编辑，用变量行的无框输入（`variablePillField`：无边框、无底色、hover/focus 无变化、空时占位符淡色、12px），没有逐行的类型选择。框的类型就是该 case 已存值的类型：文本 → 输入框，数字 → 同样无框的文本框（不是 number 输入，没有上下箭头；未成数字时不写入，行下淡色提示），true/false → `role="switch"` 包裹的 `SemiSwitch` 加 True/False 文字。null 等其他类型只读显示（null 显示为「Empty (no value)」），原样保存；类型与 Switch on 不一致的 case 只显示，不报错（运行时不会拒绝它，只是不会被选中）。
  - 中：淡色箭头，然后去向的 `NodeTag`（`node_identity` 的图标与标题，与画布一致，从不显示节点 id）；连到已删除的步骤是淡色文字「A step that was removed」；未连接是红字「Not connected」（计入徽标）。
  - 右：删除叉（`removeButtonStyle`）。已连接的 case 先在行下确认「Remove case and connection / Keep it」，确认后连同那条边一起删除。
  - 没有上移/下移，也没有拖拽：顺序不影响走哪条分支。
  - 每个 case 的问题以红字写在该行下方。
  - **Default** 是同一 `Region` 的最后一行，同一布局：淡色「Default」+ 箭头 + 去向标签或红字「Not connected」，不可删、不可编辑，删除叉的位置留空以对齐。「When nothing matches」移进 Cases 标题的 info（「Default: When nothing matches」）。
- **Switch on** 的下拉与 Kernel 的设置下拉同尺寸（12px，上下 5、左右 8），文字与左侧标签同一基线。
- Region 下面是共用 `AddButton`「Add」（aria-label「Add a case」）。新值不与已有值重复：类型取 Switch on 输入已声明的类型（未知按文本）；文本先给空值，再给「case 2」「case 3」…；数字给最小未用的整数（从 0 起）；true/false 给未用的那个，两个都用了时 Add 置灰。
- 面板顶部的提示（未知设置、只读、两个步骤无法区分）用不含开发术语的说法；If/Else 共用这几条提示。

## Agent 图标与颜色

Agent 节点详情头部的头像即该 Agent 的图标与颜色，可点击修改；目录、存储与显示位置见 [agent-icons.md](agent-icons.md)。

## 节点命名（2026-11-12）

- 画布节点的大标题是作者给节点起的名字（节点信封里可选的 `label`）；没起名时显示该类型原来的默认标题（Agent、Start、工具名、Code 节点的 id……）。
- 标题下的灰字先写我们对这个类型的叫法（Agent、Switch / Case、Tool call、Code……，取自 `agents.nodes.*`），再接该类型原有的摘要（模型、工具名、`Python`、计数、分支条件、修订号），用 `agents.nodes.caption_join`（`{first} · {second}`）连接，单行省略号截断。与标题相同的部分不重复：未命名节点的标题本身就是类型名时只显示摘要，没有摘要就空着。实现在 `nodes/node_caption.js`，所有节点经共用的 `NodeHeader` 绘制，高度仍是 63px 的共用最小值。
- 重命名就地进行：双击标题、右键菜单 Rename 或 F2，标题原位变成同字体、同字号、无边框的输入框，文字全选。Enter 或失焦提交，Escape 取消；空白名字恢复为未命名（`reset_node_label` 去掉 `label`）；名字不变不写。一次提交是一个命令，即一步撤销。被拒绝时留在输入框里，原因以问题样式显示在框下（位于节点下内边距中，不改变节点高度，因此不会触发尺寸动画）。
- 输入时画布快捷键（Delete/Backspace、空格平移、撤销、F2、Home、⌘F）、页面的 Escape、节点拖动和画布双击都不会收到事件。
- 运行时不支持节点名（能力检查 `node_display_label_v1` 未通过）时，双击无反应，右键菜单不出现 Rename，也不提示。
- 名字没有唯一性要求和长度上限，规则只有「不能全是空白」；节点 id 不变，引用不需要改写。Start 与 End 也可以命名。
