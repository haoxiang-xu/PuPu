# Agent / Workflow Builder：统一设计交接与运行时协议草案

初稿：2026-09-25；实施计划补充：2026-09-26。供项目负责人、Claude（UI）和 Codex（核心运行时）共同使用。

详细工作包、依赖、决策与验证见 [Skeleton 核心实施计划](skeleton-runtime-v020-execution-plan.md)。2026-09-26 源码交叉审查后的修订见该计划第 6 节与第 13 节；新图恢复协议、Hook 嵌套审批和迁移规则按这些补充实施。

状态：设计交接 + 实施 Plan 草案，未实现、未冻结 wire schema。负责人已确认本文全部能力及对应测试纳入 0.2.0，尤其多模型、多 provider 混合 Agent；核心实施票为 #356。#215 的正式归并及 D-04/05/07 的确认见第 11 节；release 归属以 GitHub 直接父子关系为准。本文第 2 节记录项目负责人后续确认的规则，优先于旧交接稿及 ticket 中冲突的描述；其余未定执行细节仍为建议。正式实现时补齐机器可校验 schema 和证据。

## 1. 依据与范围

已读取 GitHub #208、#215、#341、#351、#352 正文，并核对本地 PuPu dev `85773ed4` 的源码。设计 artifact 的视觉细节未直接核验。以下源码与 ticket 状态是初次交接时的取证，不代表新设计已经实现；后续负责人决定见第 2 节。

| 来源 | 已确认内容 | 本次如何衔接 |
| --- | --- | --- |
| [#208](https://github.com/haoxiang-xu/PuPu/issues/208) | v0.2.0：稳定运行基础 + 基础 Builder，scope 未冻结 | 不把所有远期节点自动塞入本版 |
| [#341](https://github.com/haoxiang-xu/PuPu/issues/341) | 固定面板头、统一 IO、Agent JSON 输出、Subagent Pool、内嵌子图下钻 | 保留布局；Kernel Loop 为技术名称，UI 按第 2 节最新记录保留 Agent；Subagent Pool 按第 2/7 节更新；旧票待同步 |
| [#351](https://github.com/haoxiang-xu/PuPu/issues/351) | If/Else、Switch/Case、无 Merge 节点汇合 | 统一条件、缺失值和排他路由 |
| [#352](https://github.com/haoxiang-xu/PuPu/issues/352) | Tool Call、Skill Read、工具失败策略；确认行为待决定 | 工具执行接现有确认/恢复机制 |
| [#215](https://github.com/haoxiang-xu/PuPu/issues/215) | 早期非线性图占位票 | 后续已由 #351/#356 替代、关为 NOT_PLANNED 并移出 #208；不计作交付完成，见第 11 节 |
| 本次对话 | Code Node、用户 venv、Hooks Pool、独立保存/引用 Workflow | 新增设计范围，尚未由上述票完整覆盖 |

Claude 交接中还列出 #339（已关闭）、#210–214（v0.1.13）、#19、#21、#149；本次未重新核验这些票的状态/归属。执行状态与活动展示应复用其成果，避免重复设计。

当前源码证据：
- `src/COMPONENTs/agents/pages/recipes_page/recipe_graph.js` 与 `unchain_runtime/server/recipe.py` 均只接受五类节点，限制单链，并要求至少一个 Agent。
- `recipe_save_payload.js` 从图导出旧顶层 agent/toolkits/subagent_pool；新图不能继续以首个 Agent 的投影代表全部执行语义。
- `variable_scope.js` 当前只做上游可达性分析，不能证明某个输出在所有执行路径上都有值。
- `unchain_adapter.py` 当前图编译仍有单出边遍历，Agent 输出写作 `{output: final_text}`。
- 前次已核验 unchain 有 RuntimeHarness/RuntimeHook、阶段分发和 RunHook；新实现必须重新核对当前 unchain HEAD，不能把通用 `on_tool_call` 直接等同于完整的执行前后拦截协议。
- sidecar 尚未接 Agent JSON 输出，不代表 unchain 各 provider 完全没有相关能力；实施时复用已有能力并逐 provider 验证，不据字符串零命中重写 provider。

## 2. 已确认的产品模型与执行架构

### 2.1 升级 Skeleton，替代 Recipe，统一承载两种图

**最新已确认决定：升级 `.skeleton` 为完整的可执行定义文件，替代 `.recipe`，统一保存 Agent 图和 Workflow 图。** 产品资源仍称 Agent / Workflow；Skeleton 是存储与交换格式，不增加第三种产品资源。此前“Recipe 统一承载两种图”的方案被本决定替代，执行器架构保持不变。

- `.soul` 保留为偏文本的轻量角色模板：提示词与基础配置，可导入为极简 Agent。
- 新版 `.skeleton` 保存完整图、能力配置、输入输出与引用，明确包含 `schema_version` 和 `kind: agent | workflow`；精确 schema 版本值及其他 wire 字段待实现冻结。
- `schema_version` 仅表示文件格式版本，与 Workflow 的发布 revision、Agent 的运行快照不同；Agent 仍不提供 Publish/Versions。
- Builder 新建、保存和导出统一写新版 Skeleton；旧 `.recipe` 与旧 `.skeleton` 继续通过兼容加载器读取并转换。详细迁移规则见第 2.5 节。

- **Agent 图**：面向聊天与委派，有一个 Start 和一个 End，至少包含一个 Kernel Loop 节点；可以使用模型、记忆、工具、Subagent Pool、Hooks Pool 和纯流程步骤。
- **Workflow 图**：面向声明的参数调用，有一个 Start 和一个 End，是纯确定性编排，**禁止 Kernel Loop、Subagent Pool、Hooks Pool 及其他 LLM 执行能力**。不是“可有零个或多个模型节点”，而是必须为零。
- “确定性”指执行路径由显式图、条件和代码决定，不代表工具外部数据、文件内容或用户代码每次返回相同值。
- 技术上画布原来的 Agent 节点是 **Kernel Loop**；显示名存在后续差异：本对话此前拟改为 Kernel Loop，而 2026-09-26 的 #341 正文记录 UI 仍称 Agent，待与负责人/Claude 同步，不据本文擅自重命名界面。兼容现有 recipe 的节点 `type: agent`。资源 `kind: agent` 表示整张 Agent 图，节点 `type: agent` 表示模型循环节点，两者不能混用。
- Skeleton 保存图、配置、IO、资源引用和记忆策略；执行变量、实际记忆内容、checkpoint、日志另存，不写回定义文件。

### 2.2 引用规则

| 调用方 | 被引用资源 | 规则 |
| --- | --- | --- |
| Agent 图 | Agent 图 | 通过 Subagent Pool 引用已有 Agent，或在 Pool 内 build 内嵌 Agent 图 |
| Agent 图 | Workflow 图 | 通过 Workflow Call、工具适配器或 Hook 调用 |
| Workflow 图 | Workflow 图 | 通过 Workflow Call 引用固定版本 |
| Workflow 图 | Agent 图 | 禁止，包括工具包装或其他间接路径 |

Subagent 是完整 Agent 图，具有 Start/End 且至少一个 Kernel Loop。内嵌图随父 Skeleton 保存；侧栏已有 Agent 是独立资源引用。Workflow 不加入 Subagent Pool。

Workflow 的非 LLM 限制是平台图与能力的规则：保存、编译、依赖解析和运行入口拒绝模型节点、Agent 引用及平台管理的模型包装调用。负责人已明确不做任意 Python/venv/第三方工具外部行为的 LLM 强制封禁；用户代码按受信代码执行，不新增网络隔离或代码扫描来证明其不会调用外部模型。普通工具权限、进程超时/取消和结果校验仍保留。

### 2.3 Agent 外层与两个执行器

unchain 是统一执行核心，PuPu 负责图编辑、资源与本机环境管理、审批交互及状态展示。保留统一 Agent 运行外层（运行身份、Context/Memory 配置、能力与最终结果），内部区分执行器：

```text
Skeleton(kind=agent 或 workflow)
             ↓
统一运行外层：身份、作用域、事件、交互、取消、持久化
             ↓
WorkflowRunner：调度完整图、变量绑定、条件选路、子流程
             ↓ 仅 Agent 图允许
Kernel Loop 节点 → KernelLoop：模型轮次与模型发起的工具调用
```

两种图都由 WorkflowRunner 调度；禁止按“Agent 图只用 KernelLoop、Workflow 图只用 WorkflowRunner”来区分。现有直接模型驱动的 Agent.run 入口可以保留。Workflow 装载到统一运行外层不赋予它 Agent 图的模型能力，不要求配置模型。

记忆与执行状态分开：Agent 图拥有根会话和记忆作用域，Kernel Loop/子 Agent 获得明确作用域，节点间数据通过 bindings 传递，根回复经 End 统一提交。Workflow 的变量、执行记录、恢复仍可持久化；不得借记忆组件隐式引入 LLM 摘要、提取或模型检索。哪些纯存储/读取记忆操作向 Workflow 开放尚待接口精化，默认不启用模型能力。

### 2.4 版本、快照与连线

- Agent **不提供用户可见的发布版本**，没有 Publish/Versions；修改供后续新运行使用。运行开始固定定义及依赖快照，已开始/暂停的任务不随编辑改变。运行快照不是 Agent 产品版本。
- Workflow 按固定发布 revision 引用，显式升级；草稿测试生成本次运行快照。版本固定其定义，资源内容、环境等依赖仍须解析并记录，不能宣称所有外部行为永远不变。
- `flow` 控制执行顺序；bindings 单独映射数据。`attach` 为 Agent 图中的 Kernel Loop 挂能力/配置，不推进执行。
- 上下 attach 端口只表示布局，不表示 before/after；Hook 条目明确触发时机。Toolkit Pool、Subagent Pool、Hooks Pool 不进入 Workflow 图。
- Hook 是事件与匹配条件到 Workflow 的绑定，不是第三种资源类型；被调用的流程仍为非 LLM Workflow，输入输出必须匹配该事件契约。

### 2.5 格式兼容与迁移

这是定义格式升级，不是简单更换文件后缀；当前加载实现尚未改变。

| 来源 | 新版读取/转换目标 |
| --- | --- |
| 旧 `.skeleton` 角色模板 JSON | `kind: agent`，构建 Start → Kernel Loop → End；保留 instructions、模型、工具、委派模式、输出模式、记忆策略与 parallel_safe |
| 旧 `.recipe` Agent 配置或图 | `kind: agent`，保留已有节点/边/绑定/能力引用；无图配置构建极简图；不把旧 Agent 图误判成纯 Workflow |
| `.soul` | 作为轻量模板导入极简 Agent；保留正文与支持的元数据及明确默认值 |
| 新版 `.skeleton` | 按 schema_version 严格解析，再按 kind 执行节点与能力校验；未知版本拒绝，不回退成旧模板 |

- 新 Kernel Loop 直接存提示词字段，不再提供 `prompt_format: skeleton` 的提示词模式。旧文本模式保留提示词，旧 JSON 模式先识别 Default 使用的 `{{USE_BUILTIN_DEVELOPER_PROMPT}}` 特例，迁移为 builtin prompt source，由 host 保存本次展开内容快照及摘要，恢复时复用快照，不重新展开可变模板；普通 JSON 再提取 instructions，其余配置按真实来源映射；损坏 JSON 或无法无损迁移的内容显式报错，不能静默丢弃。
- 旧 template loader 必须区分旧模板 Skeleton 和新版完整 Skeleton；不能把所有 `.skeleton` 当作 ParsedTemplate。新版 Workflow 禁止进入 Subagent Pool。
- 迁移保留资源身份、节点 ID 和引用关系，更新旧路径/名称引用或建立明确兼容映射；覆盖已有聊天选择 selectedRecipeName、启动 recipe_name、文件夹映射与 Default/Explore seeders。显式引用失效必须报错，不得静默退回 Default；只有未选择资源时才用默认 Agent。旧新同名资源冲突不得静默覆盖，也不得出现两个可被随机解析的副本。
- 新保存写入 Skeleton，旧文件保留为迁移来源直到确认新文件可加载、引用可解析；不批量删除或直接覆盖旧源文件。精确存储目录与原子切换方案在实现中定义。rename 保持 ID，duplicate 分配新根/内嵌资源 ID，外部引用保留；save 使用内部 edit token 防止覆盖其他编辑，token 不是 Agent 发布版本。
- Skeleton 定义固定与资源依赖快照固定仍分开；改格式不改变根会话、节点运行身份、审批/恢复位置。迁移前开始的运行继续用原执行快照，无法兼容时明确拒绝恢复，不能改用新定义重跑。

## 3. 节点全集与图类型准入

以下新增 type 名称在 wire schema 冻结前与 Claude 对齐，已有 type 保留。两种图都必须有 Start/End。

| 节点显示名 | type | 连接 | Agent 图 | Workflow 图 | 职责 / 来源 |
| --- | --- | --- | --- | --- | --- |
| Start | start | 一个 flow out | 支持 | 支持 | 入口输入，选择导出 / #341 |
| Agent（Kernel Loop） | agent | flow in/out + attach | 至少一个 | 禁止 | 模型生成 message/context、可选 JSON / #341 |
| End | end | 一个 flow in | 支持 | 支持 | 映射并校验整图返回值 / #341 |
| Toolkit Pool | toolkit_pool | attach | 支持 | 禁止 | Kernel Loop 的工具集合 / 已有 |
| Subagent Pool | subagent_pool | attach | 支持 | 禁止 | 引用 Agent 或内嵌 build Agent / 最新决定 |
| If / Else | if_else | in + true/false | 支持 | 支持 | 条件 AST，排他选路 / #351 |
| Switch / Case | switch_case | in + case ID/default | 支持 | 支持 | 严格匹配 / #351 |
| Tool Call | tool_call | in/out | 支持 | 仅非 LLM 能力 | 工具参数与 result/ok/error / #352 |
| Skill Read | skill_read | in/out | 支持 | 支持 | 只读取正文，content/name，不执行 skill / #352 |
| Code | code | in/out | 支持 | 仅非 LLM 能力 | Python 加工，结果 schema / 新增 |
| Workflow Call | workflow_call | in/out | 支持 | 支持 | 调用固定版本的非 LLM Workflow / 新增 |
| Hooks Pool | hooks_pool | attach | 支持 | 禁止 | 事件与 Workflow 绑定 / 新增 |

首版按排他 DAG 实施，不引入任意循环、并行 fork/join、递归调用或独立 Merge 节点；不因此移除已有 subagent delegate/handoff/worker 能力。M0–M8 中约定的全部节点仍属于 0.2.0 交付。

## 4. 统一 IO 与变量协议

### 4.1 保留 UI 规则，澄清“产新值”

flow 节点面板固定 Input Variables 在顶、Output Variables 在底；输出行从可用来源中挑选并继承类型，不再手填类型。

#341 的“只有 Agent 产新值”应限定为原三类节点中的生成式输出规则。扩展后 Tool Call、Skill Read、Code、Workflow Call 也有自身结果。**所有节点都只能导出自身输入或声明过的结果；Output Variables 不能凭空创建字段。** Code 的类型在结果 schema 中声明，输出映射行仍继承它。

Start 的输入由调用场景决定：聊天 Agent 为固定 message/images/files（锁定）；独立 Workflow 按输入 schema；Hook 调用的 Workflow 按事件契约映射输入。不存在第三种“Hook Workflow”资源。内嵌 Hook 流程可直接显示锁定的事件字段；引用已有 Workflow 时必须校验输入输出兼容。Skill Read 输入区显示“无输入”，不提供任意绑定。

images/files 和大结果采用有类型、与 provider 无关的 artifact 引用。内容先耐久保存，再提交输入/结果记录；暂停恢复使用固定内容，不依赖原文件仍存在。跨节点/子 Agent 经显式 binding 授权，每个 provider 单独投影，不能跨模型服务复用私有 file ID，也不能静默丢弃不支持的模态。完整保留/校验/回收规则见实施计划第 6.5 节和 BC-012。

### 4.2 建议逻辑形状（非已部署 wire）

```json
{
  "inputs": [
    {"name": "text", "value": {"kind": "ref", "node_id": "start", "path": ["message"]}, "missing": "error"}
  ],
  "outputs": [
    {"name": "answer", "source": {"kind": "result", "path": ["message"]}}
  ]
}
```

- 字段访问用路径数组；引用用稳定 node ID，不用可编辑标题。
- `value.kind` 为 literal/ref；输出来源为 input/result。每种 variant 都使用封闭 schema，字段拼写不接受静默猜测。
- 执行节点前解析并校验 input；节点完成后校验结果，再映射并发布 output。未通过校验的部分结果不得流到下游。
- 标量保持 JSON 类型；字符串模板才序列化对象。禁止把所有绑定先转字符串。
- Missing 与 JSON null 不同。缺失默认报错；可显式设 default，或 nullable 绑定将缺失映射为 null。不得自动把缺失变为空字符串。
- 分支上游变量在选择器中标注“条件可用”。缺少必需绑定/策略时完整执行校验失败；这种未完成状态**可以保存为草稿并显示诊断**（D-07 已定，见 §11.7），Run/Publish 始终拒绝；汇合可提供“首个存在值”绑定表达式选取两支结果，无需 Merge 节点，null 仍视为存在。
- 节点业务变量只能通过声明的 input 读取；Kernel Loop 的授权记忆另按 NodeMemoryView 提供；跨子图不能引用内部 node ID。子图通过 Start/End 传值。
- `{{#input.x#}}` 是新提示词入口。旧 `{{#start.text#}}`、`{{#node.output#}}` 由版本化迁移转换/兼容；新旧语法共存时各自按命名空间解析，绝不设置模糊的覆盖优先级。新图保留 input 为保留命名空间。
- 旧 start.text 映射为入口 message，旧 agent.output 映射为 message；迁移必须同时处理已有引用，不只改字段标签。

### 4.3 Kernel Loop 与 End

Kernel Loop 节点永远提供 `message: string` 和 `context: object`。context 是允许暴露的执行记录（最终回复、工具调用/结果、provider 可公开的摘要等），不承诺隐藏思维链、不包含凭据/内部系统提示词。需单独声明字段和大小策略。

JSON 输出 schema 顶层限定 object；M0 固定 dialect/受支持子集和本地引用，不支持网络 $ref；顶层字段成为额外来源，禁止与 message/context 撞名。模型能力由 runtime manifest/provider capability 判断；支持原生约束时使用原生路径，不支持时明确显示不可用，不能静默变成普通文本。提示词模拟和修复重试如要加入，必须作为显式策略。只在成功终止的最终模型结果完整校验，工具中间轮次、流片段、refusal、truncation 另行处理；direct 与 durable prepared-wire 都要覆盖。校验失败默认为节点失败，禁止把不合格对象发布给下游。

End 的输出映射就是整张 Agent/Workflow 图的返回值；声明的 output schema 必须实际校验。聊天入口另明确哪个返回字段显示为回复，不能默认拿最后一个 Kernel Loop 文本代替整图结果。新图根回复与 memory completion 只消费 End receipt，模型节点输出仅为步骤记录；旧“最后模型序号即最终回复”只保留在旧协议恢复中。

### 4.4 每个 Kernel Loop 的 Context Window

窗口上限属于节点当前模型请求，不属于 Skeleton 整图。根层管理记忆，节点按作用域、输入绑定和自身预算构建上下文视图；不把上个节点完整模型上下文自动交给下一个。

预算覆盖提示词、工具 schema、绑定输入、记忆和多模态开销，并按 provider 规则预留输出；同一有效输出配置同时驱动 reserve 和真实 wire 的输出 cap/推理预算，不能两边各算各的。复用现有预算机制，避免重复扣减；模型或工具变化后重新计量。估算与 provider 实际 usage 分开展示，整图只汇总用量，不给出共同窗口占比。

压缩只改变节点视图，不删除共享原始记录，也不污染其他节点的缓存/summary。必需绑定输入不得静默截断，仍超限时失败。默认历史读取范围与新增自动 LLM 压缩策略**已定**（D-04/05，见 §11.5–11.6）：节点默认可读根会话历史，新增模型压缩默认关闭、由用户显式开启。新增 BC-008/010、SEQ-006/008 和对应验收记录于实施计划。

迁移须保留既有插话能力：普通/可展平单 Agent 的 FYI/BTW 与多节点图的后续排队各按现有规则处理。固定定义和初始输入不等于冻结所有后续交互；已确认的 FYI 按运行身份与消息 ID 进入对应节点视图，恢复不丢不重。不向所有节点/子 Agent 广播，也不让纯 Workflow/Hook 因 Auto/BTW 路由初始化模型；详见实施计划第 7.1 节和 SEQ-012。

## 5. 分支执行语义建议

- 首版图为 DAG；普通节点一个 out，只有条件节点有多 out。多入边允许来自排他分支，运行中仅一个控制 token 沿选中路线前进，汇合执行一次，不等待未选择分支。
- If/Else 必须有 true/false；Switch 必须有 default，case ID 不随标签或排序改变，重复 case 值拒绝保存。
- 条件保存为类型化 AST，禁止 eval 字符串代码。all/any 显式嵌套并短路，UI 对应 And/Or 分组，没有隐含优先级。
- equality 不做字符串/数值/布尔隐式转换；数值按 JSON number 语义，true 不等于 1。Switch 首版只接标量，严格匹配。
- contains：字符串包含子串；数组按严格元素等值判断；其他类型报错。null 只可做显式 null 判断/等值；Missing 先经绑定策略处理，不能悄悄当 false。
- 非选中边记为 skipped；汇合节点仍可执行，不能把另一支可达的所有节点一并标 skipped。
- 完整执行校验拒绝环、悬空端口、无 default、不可达 flow 节点和不能到达 End 的路径；未完成草稿**可以保存**并显示诊断（D-07，§11.7）；放宽的是完整性不是格式，损坏或未知版本的文件仍拒绝。删除/修改出口必须同步提示受影响连线。

## 6. Tool Call / Skill Read / Code

**Tool Call**：使用稳定 toolkit/tool ID 和实际工具 schema，支持 literal/input 参数。与 Agent 发起的工具调用共用工具路由、权限、确认和结果规范化路径，不做第二套裸调用。

已确认策略：确定性调用遵循工具原有权限与 Approve/Reject；原本无需确认的直接执行，需要确认时进入 waiting_approval，无人值守也等待。配置节点不等于提前批准。拒绝不是自动重试的普通异常；取消停止运行。#352 原 open decision 已由负责人在本对话定案，远端票待同步。

输出语义建议：成功 `ok=true,error=""`，result 为 JSON 可表达值或受控 artifact 引用；失败 continue 时 `ok=false,result=null,error=公开错误消息`。详细错误码放运行记录；fail_run 终止。区分工具返回的错误信号和普通文本结果，不靠文本猜失败。超时不证明外部副作用没发生，默认不自动重试。

**Skill Read**：按选定 skill ID 在执行时读取正文，输出 content/name；预览不作为执行正文。运行开始解析资源，节点首次读取时记录内容摘要/快照，恢复时复用该次读到的内容；新的运行重新读取。未找到/读取失败是节点失败。Agent 图可将正文绑定给后续 Kernel Loop；Workflow 图只读取/加工/返回内容，不解释或执行其中的模型指令。

**Code**：固定入口 `main(input, context)`；input 为 JSON object，return 为符合结果 schema 的 JSON object。context 仅暴露声明的 run/node 身份与工作目录等数据，不给 live Kernel/Agent 对象。日志与协议结果使用不同通道，print 不破坏结果解码。

- runtime 选择：内置受支持 Python runner / 用户指定 Python executable（如 venv/bin/python）。不执行 activate，不用 shell 拼接命令。
- 两者都以独立进程运行，支持超时、取消、输出上限及进程树回收。内置解释器在打包应用中是否可直接启动须先验证，不能假定开发机 sys.executable 可用。
- 环境路径属于本机 runtime profile；Workflow 引用 profile ID。分享/导入时重新绑定，不把用户绝对路径视为跨机有效配置。
- 独立进程不是沙箱；代码以当前用户权限运行，不自动安装依赖或更换环境。负责人已确认不对任意用户代码调用 LLM 做强制封禁；不以沙箱或扫描作为本项交付条件。
- 错误元数据独立于用户 return 字段，用户可返回名为 ok/error 的业务字段；系统使用单独 outcome。continue/fail_run 不得吞掉取消、身份错误或结果未知，具体 wire 在 M0 冻结。

## 7. Hooks Pool 与 Workflow 复用

Hooks Pool 只存在于 Agent 图，挂到 Kernel Loop 的运行阶段；处理流程是内嵌或引用的非 LLM Workflow。Hook 是触发器，Workflow 是执行内容，二者不能混为节点类型。

一条 hook：稳定 hook ID、启用状态、event、工具匹配器、顺序、Workflow 固定版本引用或内嵌 graph、失败策略。内嵌图仍使用相同 graph schema，可显式“另存为 Workflow”。

**已定（负责人 2026-09-26）：不把「用模型判断」做成 hook 的一等公民。** hook 只能用 Code、非 LLM Tool Call、Skill Read、分支和 Workflow Call；builder 不提供在 hook 流程里选模型、挂 Kernel Loop 或引用 Agent 的入口。规则判不准的情况返回 `require_approval`，把模糊交给用户，不是交给第二个模型。理由：拦截器的依据必须可解释、每次 tool call 多一个模型往返的延迟与成本不可接受、以及避免 hook 内模型自身发起工具调用造成的递归。

**措辞收紧（Codex 2026-09-26）：不要写「hook 的判断保持确定性」或「同一次输入永远得到同一个决定」。** 即使没有模型，hook 里的代码也可以读取会变的文件、时间和网络数据，平台保证不了纯度。可保证的是重放语义，准确说法是：**hook 按明确流程执行，平台不替它增加模型判断；记录本次输入与处理决定，暂停恢复时复用已提交结果，不重新判断。**

这条是**平台能力边界，不是物理保证**：按 §11.3，Code 节点里的用户代码可以自行访问外部模型 API，PuPu 不做强制封禁、不做网络隔离、不做代码扫描。因此 wire 与 validator 只需拒绝平台管理的模型能力（模型节点、Agent 引用、Subagent/Hooks Pool），不得宣称 hook 路径上不可能出现 LLM。

首批建议事件：before_tool_call、after_tool_call。before_model/after_model/run_finalizing 为后续可设计的扩展，不应因内核有同名阶段就宣称全部可用。

before_tool_call 输入含调用身份、tool ID、参数；返回 discriminated decision：continue / modify（新参数）/ block（公开原因）/ require_approval（公开原因）。after_tool_call 区分只读 raw_result 与累计 current_result（初值为原始结果）；按顺序 continue 保留累计值、replace 替换累计值，后一条默认处理前一条的结果；原始审计记录和工具成功/失败 outcome 不被覆盖。每条 Hook 单独持久化，全部完成才提交最终可见结果；after 失败或恢复不得跳过它或重新执行工具。

最终可见结果同时约束即时投递、下一模型轮、Context/summary 重建、公开 context、bindings 和大结果展开。raw 仅供审计与获准 Hook 读取，不能在后续读 journal/full_output_ref 时重新回流；例如脱敏后的内容不能在下一次请求又变回原文。

执行次序建议：解析工具和参数 → before hook 顺序执行 → 再次 schema 校验 → 对最终参数做权限/确认 → 执行工具 → after hook → 消费结果。已确认的参数若改变，旧批准失效，不能复用。

- 多 hook 按 order + 稳定 ID 排序；modify 只能改参数且不重新开始匹配，block 短路。require_approval 单调累积，最终确认要求为原策略 OR Hook 要求；全部 before hooks 完成后对最终参数发父工具审批。暂停保存位置和参数，恢复不重跑已完成 hook。
- 匹配使用规范 tool ID；第一版所有工具或明确 ID 集合，避免先引入难以解释的正则。
- before/after hook 失败默认终止当前操作，after 失败不能把原始结果发给模型。0.2.0 按实施计划第 6.2 节的 fail-closed 规则执行，不把未定义的 fail-open 当作可选 UI 功能。
- 被 Hook 调用的 Workflow 本身禁止 Hooks Pool，也不继承外层 Hooks Pool；禁止调用环，设置总深度/步数/超时预算。require_approval 由外层统一生成父工具审批；Hook 内 Tool Call 仍可正常请求自己的批准，等待通过 continuation stack 逐级传到根，批准子工具不等于批准父工具。不另造互不关联的审批系统。
- attach Pool 默认只拦截其 Kernel Loop 发起的工具调用；独立 Tool Call 和 Hook child 内工具不自动继承外层 Pool。
- 无副作用的变换容易恢复；含工具/代码的 hook 必须遵循下述 durable 规则。

独立 Workflow 提供草稿编辑、运行测试、发布不可变 revision、引用更新提示。引用使用 workflow_id + revision_id，首次运行解析并固定完整依赖集合；嵌套调用也固定。被引用或保留运行所需的版本不得物理清理，只能先归档；已有固定引用仍可解析、暂停运行仍可恢复。归档资源不得新增引用，恢复归档后才重新开放；禁止静默改指向最新版。意外丢失资源要显式报错，不把制造失效引用作为正常删除行为。

子流程只收显式输入、只回传 End 输出；拥有 child run identity、parent run/node/call identity。取消向子运行传播；错误在调用节点按策略处理；节点状态可下钻展示。Workflow-as-tool 与 Workflow Call 共用执行器，前者经工具确认入口，后者按图确定执行。

现有 subagent handoff 在新图中只结束当前 Kernel Loop 节点：子 Agent End 经适用 after Hook、当前节点输出映射/校验后继续父图后续步骤；不提前结束父图、不额外调用父模型续写。父图仍须经自己的 End 才提交根回复，delegate/worker 的既有模式亦须保留。

Subagent Pool 按负责人最新决定提供两种入口：从侧栏拖入/选择已有 Agent 引用，或在 Pool 中 build 内嵌完整 Agent 图并下钻编辑。每个子 Agent 都有 Start/End 且至少一个 Kernel Loop。旧 inline/template 可作为创建极简 Agent 图的迁移/快捷来源，不能继续作为唯一产品模型。旧 ref/recipe_ref 必须检查目标实际类型并显式迁移：目标为 Agent 才能用于 Subagent Pool，目标为 Workflow 不允许作为 subagent 运行；不得仅凭旧 kind 名称判断。新 wire 引用类型由版本化 schema 定义，不复用歧义字段偷换含义。Agent 引用不 pin 产品 revision，但首次运行固定完整定义快照；编辑后不改变在途子运行。下钻引用 Agent 保存该独立资源，内嵌图保存父草稿；发布 Workflow revision 下钻只读，编辑派生草稿且父引用不自动升级。保存与 undo/dirty state 按编辑资源身份隔离。

## 8. Claude 需要补齐的设计

1. **不做独立 Manage 页**（负责人 2026-09-26 决定）。它曾被设计成 Detail Page 里的 Agents/Workflows 两列表，但列表与侧栏重复，输入输出声明与 Start/End 重复，旧讨论曾担心 Publish 在 0.2.0 无引用方；最新范围已明确包含 Workflow 引用，因此发布入口本版必须可用。三样仍需要的能力改为就地承载：
   - **发布 Workflow revision** 在 control center 的保存动作旁，不另开页面；Agent 依旧没有 Publish/Versions，文案写“修改用于后续新运行”，不写“改了处处立即生效”。
   - **“谁在引用它”** 出现在打开被引用资源时（Detail Page 顶部一行 + 计数），不做需要主动打开的总览页。Agent 无版本，改动影响全部引用方，这条提示是它唯一的安全网。
   - **列表、创建、切换** 沿用现有侧栏。
   Control center 因此只保留 Run 一个新按钮（menu 形态 C）。
2. Code 面板：输入绑定、代码编辑、runtime profile/venv 选择、输出 schema、日志、错误与超时显示。
   - **画布节点形态已定（负责人 2026-09-26）**：节点体显示代码前 3 行 + `+N lines` 计数，**固定高度**（编辑不移动图），右侧裁切不折行。代码块右上角一个 **expand 按钮**，node hover 才出现；**hover 该按钮即打开**只读代码 viewer，不需要点击（Tooltip 引擎本身 hover 驱动：`trigger` 含 hover、`open_delay`/`close_delay` 各 80ms，指针可从按钮移入面板不闪断；click 仍然 pin 住，Esc 或移开关闭）。viewer 是锚定节点的 popover（取 `Z.POPOVER`，不是 modal，也不是节点就地长高），带行号、`Edit in panel` 回到 detail page。**拖拽节点时必须立即关闭并抑制到拖拽结束**，否则平移画布会闪出代码面板。缩放低于约 0.5 时代码块与按钮一起隐藏，节点退回只剩头部（节点自行读 flow-editor context 的 `viewport.zoom`）。
   - 高节点的 flow in/out 端口与**头部对齐**而非居中，否则高矮混排的链路连线会上下跳。这是节点声明端口的方式，不改 flow-editor。
3. Workflow Call 面板：资源与固定版本、输入映射、输出来源、升级提示、下钻与只读版本预览。
4. Hooks Pool 面板：事件、工具范围、排序、启停、小流程编辑/引用、各 decision 的返回配置；不用 attach 位置表示触发时机。
5. 分支条件编辑器**已出设计（2026-09-26，画布第 13 行 Cond_Groups / Cond_Strict / Cond_Missing / Cond_Merge）**：
   - **And/Or 是分组不是行属性**：每条竖轨 = 一个分组 + 一个 joiner，分组可嵌套并短路。优先级是看出来的不是记出来的，没有任何条件的含义依赖求值顺序。**顺带定掉旧未决项**：轨道在 300px 面板最小宽度下只容得下两行式条件行，所以 #351 的「紧凑单行 vs 变量独占一行」取**两行式**。
   - **算子菜单按左侧声明类型过滤**，不可能的比较根本不提供。拒绝项：`true` 不等于 `1`、`"2"` 不等于 `2`，跨类型比较**保存时**就拒绝而非运行时强转；`contains` = 字符串子串 / 数组严格元素等值，用在数字上是**错误**不是 `false`；`null` 只能经 *is null* / *is not null* 到达。Switch 的 case 在改标签和拖动排序后保持同一个 ID，重复值拒绝保存，Default 不可删。
   - **每个绑定行带缺失值策略**：Required 让节点失败 / Default 在读取时替换一次 / Nullable 把缺失映射为 `null`；必需绑定无策略阻止 Run 与 Publish。**Missing 不是 null**，任何一方都不得变成空字符串。
   - **分支下游的变量选择器用空心点标注「条件可用」**：该值只在它那一支跑过时存在，可达性分析本身证明不了它在每条路径上都有值。
   - **汇合仍不需要 merge 节点**，但下游要能绑两个都不保证存在的值：用普通绑定行里的 **first present of** 表达式，`null` 视为存在，只有缺失才继续往下找。未选中的边记为 `skipped`，不牵连它那一侧的其他节点。
6. 原 Agent 节点技术上为 Kernel Loop，UI 名称按 #341 最新选择核对（wire type 暂保留 agent）；其 JSON schema 与 provider 不支持/校验失败状态；context 只显示可公开执行记录。
7. 运行态**已出设计（2026-09-26，画布第 12 行 Run_States / Run_Stack / Run_Cases）**：八个状态在节点上用**环 + 图标**成对表达，不靠颜色单独区分；`waiting_approval` 与 `suspended` 必须长得不一样——前者是某一次交互欠一个人的答复、运行其余部分仍活着，后者是整条运行被停住；`skipped` / `cancelled` 用淡出而非上色（它们是缺席不是失败）。最终枚举仍需与已有事件协议对齐。
   下列四个恢复场景决定 journal 形状，不只是面板样式：
   - **hook 内工具等待批准 → 回到父工具等待批准**：批准逐级嵌套，每一次只授权它自己那一次调用；批准子工具不等于批准父工具，运行面板必须显示这条链，否则第二张卡片看起来像重复询问。before hook 返回 `modify` 后，针对旧参数收集的批准作废、禁止重放；恢复回到同一张卡片，已跑完的 hook 不重跑。
   - **工具已执行但 after hook 失败**：暂不向模型/下游投递结果，不能发送空字符串冒充成功。原始 receipt 已持久化且不可覆盖，恢复不重跑工具；可从 Hook 未完成位置安全继续，或结束为失败。不能一律从 Hook 开头重试，有不确定副作用时仍须显式处理。
   - **执行结果未知**：只有执行可能发生但无结果凭据时标 outcome_unknown，超时/取消/进程被杀是可能的原因，不是充分条件。执行前取消仍是 cancelled，已有完整 receipt 可复用。unknown 关闭自动重试，显式重执行须说明可能重复副作用，不能退化成普通 failed。
   - **节点已产出但 End 校验失败**：不提交根回复/根记忆完成，聊天不取最后一条模型消息，也不发送空回复。已完成节点的输出仍是有效步骤记录，可已被图内后续步骤消费；根最终投影失败不抹掉它们，流式预览须显示未完成。
   若 journal 每个节点只存 succeeded/failed，上述第二种恢复会把文件写两次、第三种变成重试循环、第四种丢掉它拒绝的结果。
8. Start 按聊天、参数调用、Hook 事件显示对应输入；Hook 不是第三种资源。Skill Read 无输入例外，End 真实返回值与聊天展示映射。
9. Subagent Pool 重画为已有 Agent 引用/内嵌完整 Agent 图；侧栏拖入、原地下钻和父 Skeleton 保存；旧 inline/template 兼容入口单独标明。
10. 文件操作统一展示 Skeleton 导入/保存/导出；Soul 为模板导入，旧 Recipe/旧 Skeleton 提供兼容加载。移除新节点的 Soul/Skeleton 提示词格式切换，Kernel Loop 使用直接提示词编辑；旧数据按迁移规则转换。
11. Workflow 节点菜单隐藏 Kernel Loop 及所有 attach Pool；工具和 Code 能力选择服从非 LLM 规则；导入不合法图时显示后端校验错误，不能只靠菜单约束。

### 8.12 图标：一律取自 Remix Icon，写进 manifest，禁止自造

负责人 2026-09-26 定：**不自己画 SVG**。缺图标去 <https://remixicon.com/> 找，把 SVG 放进 `src/BUILTIN_COMPONENTs/icon/icon_manifest.js`（该文件本来就是 Remix 格式：`viewBox="0 0 24 24"` + `fill="currentColor"` + 单 path），用 `<Icon src="key" />` 取用。Remix 里确实没有的，报给负责人，不要用近似形状糊过去。

设计稿里的手绘字形与 manifest key 的对应（同日已补入 manifest 的标 **新增**）：

| 用途 | manifest key | 来源 |
| --- | --- | --- |
| If / Else | `branch` **新增** | Development/git-branch-line |
| Switch / Case | `switch_case` **新增** | Editor/organization-chart |
| Skill Read | `book_open` **新增** | Document/book-open-line |
| Workflow Call | `flow_chart` **新增** | Editor/flow-chart |
| Hooks Pool / 单条 hook | `anchor` **新增** | Map/anchor-line |
| hook 拖拽排序手柄 | `draggable` **新增** | Editor/draggable |
| 运行态 cancelled | `forbid` **新增** | System/forbid-line |
| 运行态 waiting_approval | `hand` **新增** | Editor/hand |
| 运行态 running | `loader` **新增** | System/loader-4-line |
| Start / Agent / End | `flag` / `bot` / `target` | 已有 |
| Toolkit Pool / Tool Call | `tool` | 已有 |
| Subagent Pool | `shapes` | 已有 |
| Code / 展开查看代码 | `code` / `fullscreen` | 已有 |
| 运行态 pending / succeeded / failed | `circle` / `check` / `close` | 已有 |
| 运行态 suspended / skipped / 结果未知 | `pause` / `subtract` / `question_mark` | 已有 |
| 菜单 Open / Rename / Duplicate | `eye_open` / `rename` / `copy` | 已有 |
| 菜单 Disconnect / Delete / Paste | `unlink` / `delete` / `paste` | 已有 |
| 菜单 Add / Edit graph / Fit to view | `add` / `enter_key` / `fullscreen` | 已有 |

**Reset zoom 没有合适图标**（Remix 只有 zoom-in / zoom-out，没有 1:1），该行不放图标，由快捷键 `⌘0` 承担识别。

### 8.13 Context menu：按目标区分，分组固定

负责人 2026-09-26 定。当前 `onContextMenu` 挂在画布容器（`flow_editor.js:859`）且只回坐标，所以右键节点、连线、空白开的是同一个菜单。**不需要新的 editor API**：节点已带 `data-flow-node-id`，连线已有 16px 透明命中路径，在现有 handler 里用 `closest()` 判定目标即可。右键节点或连线**必须先选中它**，否则菜单作用在画布未显示为选中的对象上。

- **空白**：Add node… / Paste / Select all / Fit to view / Reset zoom。
- **节点**：组固定、组内项随类型变——组 1 本节点（Open detail + 仅该类型能做的，如 pool 的 Edit graph、Code 的 View code）；组 2 身份（Rename / Duplicate）；组 3 接线（Insert node after… / Disconnect|Detach）；组 4 Delete，**单独一个分隔线之后**。做不了的项**保留并置灰**，不改变菜单形状。
- **连线**：Insert node here… / Delete connection。

**`ContextMenu` 需两处改动**：① 行增加**尾部槽位**，启用行放快捷键、禁用行放原因（Start 的 Duplicate 写 *one only*、Delete 写 *required*）——组件在禁用行上没有 tooltip，没有这个槽位灰行就只是看起来坏了；② `menuH = items.length * 32`（`context_menu.js:104`）在有分隔线时算错（分隔线 9px 不是 32px），靠近底边打开的菜单会被上推过头。

**Add 形态已定（负责人 2026-09-26）：方案 B —— 单条 `Add node…` 打开可搜索调色板。** 菜单保持 166px；11 种节点内联分组后仅 Add 段就 408px，在 640px modal 里几乎占满且从底部右键要向上翻。调色板同时就是双击画布搜索（不是第二套机制），也是图类型门控唯一不留可见缺口的形态——Workflow 禁 Agent/Subagent Pool/Hooks Pool 时它只是列表短一截，而不是一个要用户自己注意到的空位。

**Delete 的禁用要读已有机制**：`flow_editor` 的删除键已按 `node.deletable !== false` 过滤（`flow_editor.js:740-744`，`flow_editor.test.js` 有覆盖）。菜单里 Start/End 的 Delete 置灰必须读同一个 `deletable` 标志，不得另立一套判断。

UI 不再承载独立执行编译器语义。前端做编辑即时提示，后端 validator 是保存与运行的权威；二者共享契约样例测试。新增尚未可运行节点要明确显示能力未就绪，不能保存时被旧投影静默丢弃。

## 9. Codex 实施顺序与 ticket 接口

核心运行时实施票 [#356](https://github.com/haoxiang-xu/PuPu/issues/356) 已创建，为 #208 的直接子票，与 #341/#351/#352 关联并分工；#215 已按负责人决定由 #351/#356 替代，不再保留重复验收票。

实施顺序：
1. 版本化 Skeleton schema_version/kind/graph/IO、资源身份、旧 Recipe/旧 Skeleton/Soul 导入迁移、前后端往返；Agent 图至少一个 Kernel Loop，Workflow 图禁止全部 LLM 能力及相关 Pool。
2. unchain 中共用的 WorkflowRunner、输入绑定、排他分支、End 返回、durable node journal 与可观察事件；仅 Agent 图可调 KernelLoop，保留原有直接模型运行入口。
3. Kernel Loop JSON 输出及公开 context；Tool Call 的统一工具路径/审批恢复；Skill Read。
4. Skeleton 统一存储两种图：Workflow 固定版本调用、Agent 无发布版本但有运行快照；完整 subagent 图引用/内嵌、根记忆与子作用域。
5. Code runner 和本机环境 profile；Hooks Pool adapter 与参数确认顺序。

步骤 1–5 全部随 0.2.0 发布，并交付对应测试；完整工作包 M0–M8 和混合 provider 测试 AC-011 见实施计划。Claude 可继续完整设计；不以 UI 已画好代表 runtime 已支持。

## 10. 跨边界合同与验收计划

以下为实施 Plan 的合同登记。当前证据均为 PENDING；精确 schema、manifest capability 名称与限制值将在实现前填入对应条目，不允许依据此草案 active rollout。

| 合同 | producer → consumer / 边界 | canonical 与 admission | 失败、身份与投影规则 | 验收 |
| --- | --- | --- | --- | --- |
| BC-001 | UI 保存 JSON → sidecar validator → 持久化 graph | VERSIONED；Skeleton schema_version/kind + graph version + CLOSED 各节点 variant；layout 单独声明 | resource/kind/node ID、Workflow revision 或 Agent snapshot；未知版本/type/config 拒绝，旧 Recipe/旧 Skeleton 显式迁移、Soul 导入；不丢未知执行字段 | AC-001 |
| BC-002 | sidecar compiled plan → 实际导入 unchain runtime | VERSIONED plan + manifest capability；CLOSED execution payload | invocation/Skeleton kind/dependency snapshot/graph version；不支持节点/provider 或 Workflow 的平台管理直接/间接 LLM 能力明确拒绝，无静默降级；最终绑定 wheel/manifest digest | AC-002 |
| BC-003 | runtime JSON request → Python 子进程 → JSON result | VERSIONED runner envelope，CLOSED envelope + 按用户 schema 校验业务值 | run/node/attempt/profile identity；代码/环境指纹固定；非 JSON、超限、超时、错 identity 失败；日志独立 | AC-003 |
| BC-004 | Skeleton 引用/内嵌图 → resolver → child execution | VERSIONED resource kind + IO schema；Workflow revision / Agent snapshot；CLOSED 调用包 | 父子身份及完整依赖固定；Workflow→Agent、错类型/版本/循环/深度超限/缺资源拒绝；输出只经 End | AC-004 |
| BC-005 | Agent 工具事件 → 非 LLM Workflow → 工具/审批 runtime | VERSIONED event/result；CLOSED decision variants | tool_call/hook/attempt/args digest；未知决策/非法参数失败；最终参数决定批准有效性；原始结果独立持久化 | AC-005 |
| BC-006 | journal/checkpoint → restart/resume；runtime event → UI | VERSIONED 持久记录与事件 envelope，payload 按 kind 封闭 | run/node/attempt/event sequence/interaction 身份；去重排序；已完成节点不重做，不确定副作用阻断自动重跑；兼容性改变拒绝恢复 | AC-006 |
| BC-007 | Kernel Loop request → provider SDK → typed outputs；skill 文件 → 节点输出 | VERSIONED adapter/公开 context schema；业务 JSON 按声明 schema；skill 内容为显式字符串 | model/provider/schema digest 与 run 绑定；原生能力不支持拒绝；skill 首次读取固定快照；公开投影剔除秘密与内部字段 | AC-007 |

runtime compatibility 由实际导入模块的严格 manifest 决定；业务身份与 schema 按各边界合同独立校验。Git SHA 和路径只作取证，不能当运行准入机制。新增 BC-008–012、AC-008–014 及状态序列见实施计划；BC-012 覆盖附件与大结果的内容持久化及跨作用域/provider 投影。

| 序列 | 初始状态与顺序 | repeat / retry / resume / restart / reset / rollback | 持久边界与验收 |
| --- | --- | --- | --- |
| SEQ-001 | 新 run → Start → 条件选路 → 下游 → End；同一 chat 第二条消息新 run | repeat 去重事件；retry 独立 attempt；resume/restart 复用已提交输出/选路；reset 新 run；rollback 不改既有记录 | BC-001/002/006，AC-001/002/006 |
| SEQ-002 | tool intent → before hook → approval → execute → after hook → commit；同 run 第二次审批 | 每个 interaction 唯一；重复批准不重执行；retry 仅在幂等性成立时；resume/restart 从存档位置；reset 不隐式批准；rollback 拒绝不兼容恢复 | BC-005/006，AC-005/006 |
| SEQ-003 | parent resolve Workflow revision / Agent snapshot → child start → child End → parent continue | repeat 使用调用身份；retry 保留定义快照；resume/restart 保持依赖/作用域；reset 新 child；rollback 仍绑定原定义或明确拒绝 | BC-002/004/006，AC-004/006 |
| SEQ-004 | code/tool intent persisted → 外部执行 → receipt/output persisted | receipt 完成则复用；无 receipt 且可能有副作用则标 outcome_unknown，需恢复决策，绝不宣称 exactly-once；reset/rollback 不撤销外部副作用 | BC-003/005/006，AC-003/005/006 |
| SEQ-005 | 本次运行首次 skill read/provider request → 输出校验 → 下游 | repeat/resume 使用已提交快照；retry 按明确策略；restart 保留引用；新 run 重读 skill；provider/profile/revision 变化不得悄悄替换本次运行依赖 | BC-002/006/007，AC-002/006/007 |

- **AC-001**：真实前端新版 Skeleton 保存产物经严格后端消费再加载；旧 Recipe（有图/无图）、旧 Skeleton、Soul 转换保留提示词与全部受支持配置/引用；新旧同名冲突、损坏旧 JSON、未知新版 schema_version 拒绝且不覆盖源文件，新版 Workflow 不被旧模板入口当成 subagent；旧 Agent 直链、纯 Workflow、分支、子图正例；Agent 图无 Kernel Loop、Workflow 含 Kernel Loop/任一 Pool、未知 kind/key/type/version、失效引用、错误端口负例；精确 key set，不用宽松包含断言。
- **AC-002**：真实编译计划进入实际 runtime；只执行选中分支、汇合一次、类型不漂移；缺失变量、未支持 capability/manifest、错 identity 阻断。覆盖 normal/Agent graph/Workflow graph/subagent 路径；Workflow 经平台管理的子流程、模型工具包装或 runtime 隐式摘要调用模型的负例必须阻断；不延伸为任意用户代码封禁。
- **AC-003**：内置打包 runner 和真实 venv 两条路径；正常 JSON、含日志、异常、超时取消、超限、缺依赖、错误版本/identity；崩溃窗口不自动重复副作用；平台图的非 LLM 准入按类型与受管理能力测试，不要求证明任意用户代码不调用外部模型。
- **AC-004**：Workflow Call、Workflow-as-tool、内嵌 subagent、Hook 调用的真实父子往返；Workflow 升级及 Agent 编辑不改变旧运行，新运行可解析更新的 Agent；Workflow→Agent 直接/间接引用、错资源类型、跨作用域引用/递归/缺版本拒绝；取消传播与子图定位。
- **AC-005**：最终参数审批、修改后重新确认、block、require_approval、after 结果投影；未知 decision 拒绝；第一次/第二次审批、重复批准、暂停恢复、冷重启均不重复执行。
- **AC-006**：事件从真实运行产生到前端状态消费；repeat/retry/resume/restart/reset/rollback 的适用格逐项有断言；记录 seq 去重；失去结果凭据时明确 outcome_unknown。
- **AC-007**：每个支持 provider 的结构化输出按同一 schema 走严格 consumer，覆盖坏 JSON/缺字段/不支持 schema；context 不泄露内部字段；skill 首次读取、修改后新运行、恢复读快照分别验证。

schema/allowlist 修复保留 red-before-green。最终验收必须使用 **PuPu candidate + 一次构建并复用的同一个 unchain wheel**，记录 SHA-256 与实际 manifest digest；mutable sibling checkout 的测试不能替代发布证据。跨两个仓库改符号前分别做 GitNexus impact，提交前做完整 detect_changes。修改 sidecar Python 后重启 sidecar。

当前 rollout：**INCOMPLETE**，原因是合同为草案且 AC 未执行，不代表已经发现实现缺陷。

## 11. 已确认决策与剩余体验选择

负责人 2026-09-26 已确认第 1–3 项与第 5–8 项（D-04/05/07 及 #215 范围）；D-06 名称沿用 Claude 最新 UI：
1. 全部能力纳入 0.2.0，包括 Code、Hooks Pool、独立 Workflow、Skeleton 升级及对应测试；多模型、多 provider 混合 Agent 为重点必验场景。
2. #352 确认策略：沿用工具原有权限与确认，无人值守需要批准时也暂停等待。
3. 不做任意 Code/venv/第三方工具外部 LLM 调用的强制封禁；平台不提供 Workflow 模型节点或 Agent 调用能力。
4. 不支持原生 JSON 输出的 provider：建议明确不可用；如要提供提示词模拟，作为显式可见的降级模式另定验收。

5. **D-04 默认记忆读取范围：节点默认可读根会话历史。** 节点之间的中间结果仍只经显式绑定传递，不得从共享聊天历史里猜「最后一条是谁的结果」；子 Agent 默认使用临时记忆作用域。
6. **D-05 自动压缩：不默认新增模型压缩调用。** 保留已有明确授权的压缩策略；新增的模型压缩由用户显式开启。必需绑定输入超限时明确报错，**不静默截断**。
7. **D-07 未完成草稿：可以保存并显示问题。** 缺连线、缺模型、缺绑定不阻止保存，界面显示诊断。放宽的是**完整性**不是**格式**——文件本身必须符合 schema，损坏或未知版本仍拒绝。Run 与 Publish 始终要求完整校验通过。
8. **#215 已于 2026-09-26 关为「被 #351/#356 替代」并移出 #208**（未记为实现完成，Project Status 保持 Planning）。随之记录的范围决定：**0.2.0 采用排他 DAG，不包含任意循环、并行 fork/join、递归**；这只约束图上的 flow 边，**已有 subagent delegate/handoff/worker 并发能力保留**。要重开其中任何一项须另立新票。

负责人随后明确确认：End 才提交根回复与根记忆完成；迁移保留默认 Agent、旧聊天选择及身份并防止共享保存覆盖，不得静默改跑 Default；混合 provider 测试覆盖地址、凭据与请求协议隔离，预算与实际输出上限一致。对应实施计划已确认边界第 10–12 项及 AC-008/009/010/011。节点步骤记录仍实时持久化，不等到 End 才保存。

其他分支/类型/作用域/恢复语义按本文默认建议推进精化；这些不是要求负责人逐项做技术审批。
