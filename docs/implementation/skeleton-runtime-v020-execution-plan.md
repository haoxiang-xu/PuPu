# Skeleton / Agent / Workflow 核心实施计划

日期：2026-09-26。状态：D-01–05、D-07 及排他 DAG 范围已确认，D-06 沿用 Claude 最新 UI；核心实施票为 #356，精确协议待 M0 冻结，未启动代码实施。

设计基础：[统一设计与协议](agent-workflow-v020-contract-plan.md)。该文档负责产品语义，本计划负责模块划分、实施依赖、测试和交付。2026-09-26 完成一次源码交叉审查，修订项见第 13 节；审查不代替实现验证。冲突以负责人最新决定为准；没有把未答问题当作同意。

## 1. 交付目标与已定边界

最终目标：同一份新版 Skeleton 在无 PuPu UI 的 Python 环境中也能加载、验证和运行；PuPu 提供产品资源、本机环境、编辑器、审批交互和状态展示。PuPu 自有工具由 host adapter 注入，测试可用严格 fake 替代，不假设脱离 PuPu 后自动拥有其工具。

已确定，不再要求负责人重新批准：

1. `.skeleton` 取代 `.recipe` 成为完整定义；`.soul` 为轻量模板；旧文件兼容读取并显式迁移。
2. `kind=agent` 至少有一个 Kernel Loop；`kind=workflow` 无任何模型节点/Agent 引用/Pool，平台支持的工具与子流程也不得绕到模型。
3. Agent 外层统一管理运行上下文，WorkflowRunner 调度两种图，KernelLoop 专管模型循环。保留原有直接模型执行入口。
4. Subagent Pool 引用已有 Agent，或内嵌完整 Agent 图；内容通过画布下钻编辑。
5. Hook 是事件与条件绑定，执行内容是非 LLM Workflow，复用同一图执行器。
6. Agent 无用户可见发布版本；所有运行固定定义快照。Workflow 引用固定发布版本。
7. context window 属于每个 Kernel Loop 的当前模型调用，不属于整个 Skeleton；共享原始记忆不等于共享组装后的请求。
8. 节点间业务数据经显式 bindings 传递；End 校验并返回整图结果；执行记录和记忆内容不写回 Skeleton。
9. 负责人再次确认纯 Workflow 不初始化模型、不要求 API key；恢复/重试不从整个模型节点开头重跑。Hook 审批与恢复细节授权 Codex 按第 6.2 节落实，无需逐条产品审批。
10. 根回复与根记忆完成只由 End completion 驱动，不能由最后一个模型节点代替；节点运行记录仍按步骤持久化。对应 BC-010 / AC-010。
11. 迁移必须保留默认 Agent 行为、旧聊天选择和引用身份，正确处理复制的新身份及共享资源保存冲突；显式引用失效不得静默改跑 Default。对应 BC-009 / AC-009。
12. 混合 provider 必测 endpoint、credential profile、请求协议与 factory 隔离；每节点上下文预算和真实 provider 输出上限保持一致。对应 BC-008 / AC-008 / AC-011。

## 2. 本次取证与工作区基线

| 范围 | 已核对 | 对计划的影响 |
| --- | --- | --- |
| PuPu HEAD | `85773ed49b3653d80ea5a39b514e65c77ded086a` | 现有单链图、保存投影、旧模板入口仍在；不从 UI 设计推断 runtime 已实现 |
| unchain HEAD | `1c54e19a5d733ccf5a87e085774b0c42c62dd901` | 有图步骤身份/恢复、ContextRuntime、DurableToolExecutor、ResponseFormat |
| unchain 工作区 | request_factory/coordinator、journal、SQLite 等已有未提交改动，另有 journal_view_cache | 本次只读；这些是他人进行中的工作，不纳入本计划交付或擅自修改。开工从确认的 dev 基线独立 clone，重新核验已合入能力 |
| GitNexus | 两仓按各自 cwd 绑定索引查询，query 未报告 HEAD 落后 | unchain status 实际报告工作区 stale（10 changed / 2 added），PuPu 仅新增计划未索引；审查以源码交叉核对，不在共享工作区并发重建。实施 clone 必须重建索引 |
| 工具 | `unchain/context/tool_executor.py:DurableToolExecutor`，`tool_boundary.py`，`tools/confirmation.py` | 新 Tool Call 要适配现有耐久工具边界，不能另起裸调用路径 |
| 上下文 | `JournalContextRequestFactory._resolve_budget` 从当前 provider state 读窗口；`resolve_context_budget` 已做输出预留与 margin | 复用预算计算；补逐节点配置传递、完整请求计量与隔离测试，不重写一个全局预算系统 |
| 图作用域 | `ContextRuntime.bind_graph_step_scope` 按 execution/attempt 绑定 node/step 身份 | 不能让多个 Kernel Loop 复用同一可变 attempt 后切换 node；需明确每次节点调用的身份 |
| JSON 输出 | `schemas/response.py:ResponseFormat` 已有 provider 转换；parse 主要查 object 和 required；Anthropic helper 目前为提示词后缀 | 不能宣称从零实现，也不能视为已经完整严格校验或四家都原生支持；执行 adapter 与模型能力逐项验证 |
| #341 最新正文 | 已同步图类型与 Skeleton 决定，但 UI 名称记录为保留 Agent，旧 acceptance 仍有面板 inline/template 文案 | 命名有差异待同步；本计划用 Kernel Loop 指技术节点，不主动改 Claude UI。旧验收文本需在开始对应票时修正 |
| #352 最新正文 | 工具确认仍列为 open decision | 见 D-02；不能因确定性调用自动绕过现有确认 |

预备 impact：PuPu `_compile_recipe_graph_for_runtime` 上游 6 个、直接 2 个（durable projection、graph stream），涉及聊天/恢复/子 Agent，图风险 LOW；`parse_recipe_json` 上游 9 个、直接为读文件/保存，图风险 LOW。unchain `AgentBuilder.attach_context_runtime` 消歧后 UNKNOWN；文本确认 `ContextModule.configure` 调用它，不能据 0 调用判安全。以上不是完整变更影响报告，不替代实施时逐符号 impact；项目级风险主要来自持久化和恢复，不由这两个 LOW 评级决定。

## 3. 产品决策清单

| ID | 问题 | 建议 | 如果选另一项 | 状态/阻塞范围 |
| --- | --- | --- | --- | --- |
| D-01 | 全套能力是否都进入 0.2.0 | **全部纳入：M0–M8 及对应测试，特别是多模型、多 provider 混合 Agent** | 不以分阶段实施为由缩减本版交付 | 已确认；2026-09-26 |
| D-02 | 确定性工具调用的批准规则 | **沿用工具原有权限与 Approve/Reject；需要确认则暂停，无人值守也等待** | 原本无需确认的直接执行；配置节点不代表提前批准 | 已确认；2026-09-26 |
| D-03 | 任意 Python/venv 下的“禁止 LLM”保证 | **不做任意用户代码/外部工具行为的 LLM 强制封禁**；平台图不提供模型节点或 Agent 调用能力 | 不新增网络隔离/代码扫描来证明非 LLM；保留普通权限、超时、取消和结果校验 | 已确认；2026-09-26 |
| D-04 | 多 Kernel Loop 的默认记忆读取 | 根会话历史可读，节点中间结果只经绑定或明确记忆策略共享；子 Agent 默认临时作用域 | 可做更严格 inputs-only 默认，用户显式开启根历史 | **已定 2026-09-26（负责人）**：采用建议值——节点默认可读根会话历史，中间结果仍只经显式绑定，子 Agent 默认临时作用域 |
| D-05 | 超窗是否可自动调用模型压缩 | 默认仅执行既有获准压缩策略；新能力不自动增加压缩模型调用，必需输入超限报错；显式启用后可压缩当前节点视图 | 默认自动总结可更顺滑，但会增加费用/延迟及信息损失 | **已定 2026-09-26（负责人）**：采用建议值——不默认新增模型压缩调用，由用户显式开启；必需输入超限明确报错、不静默截断 |
| D-06 | 画布名称 Agent 还是 Kernel Loop | 尊重 #341 最新 UI 选择保留 Agent；技术模型仍称 Kernel Loop，wire type 仍为 agent | 若负责人仍希望改名，请与 Claude 一次性统一 | 发现的跨会话差异，非后端阻塞项 |
| D-07 | 未完成草稿是否可保存 | 建议合法结构的草稿可存，缺连线/模型/绑定/资源显示诊断；Run/Publish 必须完整校验 | 旧 #341/协议要求部分缺失直接禁止保存，两者不能同时当规则 | **已定 2026-09-26（负责人）**：草稿可保存并显示诊断；缺连线/模型/绑定不阻止保存，但文件本身必须符合 schema（放宽完整性不放宽格式）；Run/Publish 必须完整校验 |

技术默认不要求逐项审批：首版排他 DAG，不做并行/循环；稳定 ID；严格 schema；错误码与字段路径；固定运行快照；有副作用步骤不自动重试；本机解释器不自动安装依赖；不批量删除旧文件。默认值若影响产品使用，由上述对应决策覆盖。

## 4. 两仓职责与模块落点

以下新增目录/符号为建议落点，不代表已存在的 API；不批量重命名稳定代码。

| 层 | unchain | PuPu |
| --- | --- | --- |
| 定义 | 新 `skeleton/`：严格 schema、graph/IO validation、canonical digest、旧定义转换的纯函数 | 旧文件发现、导入导出、存储与资源 ID 映射；调用 unchain validator |
| 编译 | 新 `workflow/compile.py`：闭合依赖、类型/能力检查、无 UI 的执行计划 | 布局与编辑辅助；只传已解析的资源，逐步移除独立线性执行编译语义 |
| 调度 | `workflow/runner.py` + node handlers；调用现有 KernelLoop/工具/interaction | 启动/取消/恢复 API、事件转发；`unchain_adapter.py` 缩为产品装配，按路径迁移 |
| 持久化 | 延伸现有 journal/checkpoint、execution guard 与 parent/child identity | 本机存储配置、与 chat/run 的关联及展示；不另建一套权威进度日志 |
| 模型上下文 | ContextRuntime、request_factory、budget/compiler；按节点调用身份隔离 | 每节点模型/预算编辑，使用 capability 查询，usage/估算状态投影 |
| 资源 | resolver/profile/skill/tool 的接口与严格消费 | 草稿、Workflow revision、Agent 引用、workspace skill 与本机 Python profile 的实际解析 |
| Python 执行 | 子进程 runner 协议、超时/取消/结果校验 | 打包内置解释器定位、用户 venv 选择与探测、配置持久化 |
| UI | 仅提供能力/错误/事件协议 | Claude 设计并实现界面；前端 JS、inline style、现有 bridge 和 service 约定不变 |

AgentBuilder 需要显式分开 prepare_graph 与现有 prepare_model 路径（名称待实现），不把 graph scheduler 写进 KernelLoop.step_once。现有 Agent 默认 provider/model，build 无条件创建 ModelIO；纯 Workflow 必须在此前分流，不是创建客户端后不发请求。验收在无 API key、禁止 ModelIO/SDK factory 初始化的情况下仍可运行纯图。统一 Agent 外层与具体 graph kind 分开：加载 Workflow 不能因为外层名叫 Agent 就获得模型、subagent 或模型记忆组件。

## 5. 定义、编译与身份合同

### 5.1 Skeleton 逻辑字段

目标 root 字段分组：`schema_version, id, kind, name, description, input_schema, output_schema, graph, runtime, ui`。精确键集合在 M0 固化；这是建议，不是当前 wire。

- graph.nodes 每项含稳定 id/type、类型特定 config、input bindings、output mappings；graph.edges 保留稳定端口 ID，分 flow/attach。
- runtime 保存策略和 profile/resource 引用，不存凭据、本机绝对路径或 live Python 对象。
- ui 保存位置/展示信息，有自己的封闭字段或明确扩展槽；执行摘要排除纯布局，防止拖动节点改变执行 identity。
- 用户 JSON payload 不是协议字段：其开放程度由用户 schema 决定；envelope 和节点 config 默认 CLOSED，未知字段报路径错误。
- 所有业务数据限制为可序列化 JSON，附件/大数据用受控 artifact 引用；NaN、无限值、未受控文件路径不当作普通跨边界结果。
- artifact 是有类型、与 provider 无关的内容引用，不是任意 JSON 对象或模型服务的 file ID；内容持久化、授权与恢复遵守第 6.5 节 / BC-012。Start 的 images/files、节点结果和子图绑定复用同一合同。
- 发布 revision 元数据与 schema_version 分开；Agent 运行快照不是可发布 revision。展示名称可改，引用按 resource ID，不按名称。

### 5.2 编译分阶段

读取/迁移 → 严格结构校验 → 解析资源和固定依赖 → kind/capability 检查 → DAG 与 IO 检查 → 生成 immutable execution plan。

不在编译时调用工具/模型；只读取必要资源元数据。Skill 正文首次节点执行时读取并固定快照，后续 resume 复用；新 run 可读新正文。

同一输入映射在请求前解析一次；缺失与 null 区分；输出通过 schema 校验后才发布。Switch/If 用类型化 AST。M0 固化 strict equality、contains、all/any 短路、default 和 first-present 的真实 fixture，前后端分别消费；禁止一套宽松 helper 自证。

### 5.3 身份映射

逻辑身份包含 root execution/session、root run、parent run、graph invocation、node invocation、attempt、interaction、event sequence、definition digest。实现先映射现有 RunIdentity/AttemptRef/ExecutionGuard，缺什么才加什么；不另造一套互不关联 run_id。

node invocation 由本次图调用身份和 node ID 派生；节点业务 retry 创建新 attempt，provider 物理重试与恢复按第 6 节处理，不能创建新节点 attempt 绕过既有请求/工具凭据；resume 延续已固定的业务 invocation。两次调用同一子 Workflow 必须产生不同 invocation；同一节点不同 attempt 不混结果。资源编辑不能改变在途依赖。

## 6. 调度、工具与恢复

节点 handler 逻辑接口：接收 resolved inputs + scoped runtime services，返回 Completed(outputs, selected_port)、Suspended(interaction/checkpoint) 或 Failed(error)。不用 bool/None 混合表示三种结果。

WorkflowRunner 负责 node 状态、排他选路、cancel propagation 与 End；KernelLoop 仍负责模型轮次。首版一个选中路径，不等待 skipped 分支。first-present 只从可达且已完成输出选值，null 算存在。

每个步骤的记录次序：输入/定义快照 → 意图 → 必要的确认 → 执行 → 结果凭据及输出 → 下一个节点。具体哪些记录需同一事务在 M1/M2 与现有 journal 对齐，不能假设 Python 返回就是已持久化。

工具入口以 DurableToolExecutor/Boundary 为基础：Agent 工具与 Tool Call 都经同一条授权及副作用路径。先验证现有对象对 provider turn/iteration 的要求，补通用执行 subject adapter，不能伪造一轮模型消息来骗过现有校验。

before Hook → 参数再校验 → 最终参数授权/审批 → 工具执行 → after Hook → 模型/下游可见结果。after 修改保留原始结果；block/拒绝不应被普通 on_error=continue 偷换成成功。Hook 未触发工具前的动作也可能有副作用，作为 child steps 持久化。

崩溃后：完成 receipt 存在则复用；执行可能发生但结果凭据未落盘，则 outcome_unknown，停止自动重跑并提供明确恢复操作。网络请求、文件写入和任意 Code 不承诺 exactly-once。模型请求也可能已发送/计费而结果未落盘：沿用 DurableProviderTurnUncertainError，不能生成新 node attempt 绕过已有 provider lease 重发。安全物理请求重试（如明确无可见输出且允许重试的 429）与节点业务 retry 分开。Kernel Loop 内工具已完成而下一模型轮失败时恢复具体 turn，不能从节点开头重跑；未知 usage 不显示为零。

### 6.1 图恢复协议不能套用旧线性 checkpoint

这里的“图恢复协议”是流程运行记录的格式与恢复规则，不是模型回复格式，也不是新建一套网络协议。Skeleton 描述“流程应该怎样运行”，执行记录描述“这一次已经运行到哪里”；二者分开保存。

例如 Start → Code → If → 分支 A 的工具等待批准 → End。中断后需要知道本次使用的定义快照、Code 的已保存输出、已选 A 而非 B、等待批准的工具与最终参数、父子调用位置。恢复时读这些记录，从批准处继续；不重跑 Code，不重新求条件。若工具可能已执行但没有结果凭据，则报告结果未知，不能猜测成功或自动再执行。

现有 GraphStepBinding 强制 provider/model，GraphExecutionPlan 强制连续 step index 与直接前驱；旧 completion 是步骤前缀。M0 定义新版本图恢复协议，M2 实现，不能放宽旧校验假装支持分支。

新记录保持静态 topology/definition digest，单独保存动态 selected edge、node invocation、input/output receipt、调用栈、等待 interaction 和 root terminal 状态。非模型节点不填虚假 provider/model；恢复重放已选边，不重新读取可变外部数据求条件。旧线性运行保留原 reader/恢复路径，新运行使用新 manifest capability。

至少覆盖：选路刚提交后崩溃、合流节点提交前后崩溃、连续两次 child invocation、纯 Workflow 无 model 字段、旧 v1 冷恢复、旧 binary 拒绝新记录。循环/并行图不在首版，现有 subagent delegate/handoff/worker 模式不能被这个图限制无意删除；并发 worker 的回调/作用域/取消必须分别绑定调用身份。

现有 terminal handoff 会直接完成父 Kernel 状态，新图中其终止范围只能是**当前 Kernel Loop invocation**。子 Agent 的 End 返回经该调用适用的 after Hook、当前节点输出映射/校验与持久提交后，完成当前节点并继续父图后续 Code/End；不因此提交根回复，也不额外请求父模型续写。child 失败/等待继续通过调用栈传播。M0 固定 handoff 返回到 message/context/结构化字段的映射，不能把任意 child End 对象未经校验冒充模型输出；旧直接 Agent 入口保留原终止行为。

### 6.2 Hook 决策与嵌套审批

负责人已授权 Codex 决定本节执行细节；以下是实施规则，不再作为待定产品选择。基本顺序为 before Hook → 最终参数批准 → 工具 → after Hook → 交付结果；已完成阶段恢复时复用其持久记录。

- before hooks 按 order + 稳定 hook ID 运行；modify 只改参数，不能换 tool ID。每次修改后校验；改后不重新从第一个 hook 开始匹配。
- 最终确认要求 = 原工具策略 OR Hook 的强制要求；需要专门 runtime-owned 字段，现有 requires_confirmation AND resolver 不足以实现强制升级。require_approval 设置本次调用的累积审批要求，不批准、不执行工具、不因后续 continue 清除；其余 before hooks 完成后，对最终参数形成一次父工具审批。block 立即短路，尚未执行的父工具不得产生副作用。
- Hook 内 Tool Call 仍遵守工具原审批：可先暂停 child Workflow，再暂停其父 Kernel/Agent。用唯一 interaction + 调用栈恢复；父工具在 child 完成前不能执行。禁止的是第二套互不关联的审批系统，不是禁止 child 请求批准。
- outer require_approval 与 child Tool Call approval 是不同 intent/interaction，分别批准；批准 child 不等于批准 parent。多层 Workflow/subagent 也按此传播。
- Hooks Pool 的 attach 默认只作用于该 Kernel Loop 发起的工具调用；图上独立 Tool Call、Hook child 内 Tool Call 不继承该 Pool，不能借共用 executor 意外全局触发。
- after hooks 按 order + 稳定 hook ID 串行执行；输入区分只读 raw_result 与累计 current_result（初值为原始结果）。continue 保留 current_result，replace 只替换 current_result；后一条默认处理前一条的结果，不能无意撤销前一条脱敏。每条记录输入摘要、decision 和输出 receipt；工具成功/失败 outcome 不因文本变换改变。可以暂停/失败，工具不因此再执行；全部成功后提交最终可见结果 receipt，原始审计结果不覆盖。
- 最终可见结果是所有后续消费路径的唯一来源：即时投递、下一模型轮、Context 重建、summary、公开 context、bindings 和大结果 artifact 展开。raw receipt/artifact 仅供审计与明确获准的 Hook 读取，不能因从 journal 重建请求或展开 full_output_ref 又流回模型；无 after Hook 时也有明确的等值可见投影。
- 失败默认 fail-closed。block/拒绝返回明确 blocked/denied 的工具错误结果，模型循环可看到拒绝并继续决策；确定性 Tool Call 按 on_error 选择失败停止或 ok=false/error 输出，绝不表现为成功。系统取消、lease/identity 错误和 outcome_unknown 不受 continue 策略吞掉。
- wait 不长期占数据库写锁；恢复重新验证 execution fence、调用身份及最终参数摘要。取消向所有待审批 child 传播，重复/过期批准拒绝或幂等读取已决结果。

### 6.3 调用与输出边界

Workflow-as-tool 必须有产品配置入口：在 Agent 的工具能力配置中显式选择一个已发布 Workflow，通过 adapter 生成名称/输入 schema 和返回契约；只在选中的 Kernel Loop 暴露，不自动把所有 Workflow 都注册成工具。Workflow 图自身不能借该入口获得 Agent/model 能力。

Code 的业务 return object 与节点执行元数据分开，用户可以拥有名为 ok/error 的业务字段；系统状态通过独立 outcome 表达。Tool Call 保留已定 result/ok/error 输出，不把 Code 强行塞入同一输出命名空间。

每个 handler 有有界结果/日志策略，大结果写 artifact；bindings 得到的是声明类型，不能把 artifact handle 静默当文件内容或绝对路径。流式模型 token 是节点进度，不是整图已提交回复；End 校验与根 completion 成功前不能向聊天投影 final，失败/取消需收束 provisional UI。

### 6.4 Code runner 的环境与打包约束

M0 检查现有 MCP bundled Python 是否可作为受支持 Code interpreter 复用；frozen sidecar executable 不当作普通 Python 使用。用户 venv 只需满足声明的 Python 版本，不要求预先安装 unchain；使用随产品分发、仅依赖标准库的 runner bootstrap/protocol，将业务代码和依赖留在所选 venv。不静默 pip install。

runner 配置明确 executable/profile、工作目录、允许注入的环境变量、执行超时、日志/结果大小、取消机制。JSON 结果与 stdout/stderr 日志分通道，处理缓冲/大输出/异常退出。macOS/Unix 与 Windows 分别验证子进程树取消、路径含空格、中文输入、无终端、安装目录只读；暂停时不保留需要用户操作才能退出的孤儿 worker。

运行记录固定代码快照和解释器/profile 身份；可变 venv 不能被描述为完整可复现的依赖镜像。恢复已完成节点只读 receipt；需重新执行且检测到 profile/interpreter 或声明的依赖指纹变化时明确报 environment_changed，不静默换环境。任意外部包/服务的未声明变化不作强保证，不把虚假的“全部环境已冻结”写进 UI。

### 6.5 附件与大结果的持久化

Start images/files、Code/工具大结果先进入受控内容存储，记录内容摘要、大小、媒体类型、来源与作用域，再提交引用它的 input/output receipt；禁止先标节点完成、后异步保存唯一结果。引用按声明类型解析，不把 artifact handle 隐式变成字符串/本机路径。Code 确需文件时，通过显式绑定和 host resolver 获得该调用的本地文件映射，映射不成为跨机引用；使用独立 staging copy，不提供可写的内容存储原件或共享 inode，代码修改局部文件不改变已提交 artifact。

已提交的内容不可随源文件变化；有可恢复运行、保留中的会话/receipt 或依赖引用时不能回收。无引用的未提交内容可清理，不能为孤儿清理删除已提交内容。恢复先校验可访问性与摘要，缺失/损坏明确失败，不重读变化的源文件，不自动重跑生产节点。保存配额不足在相应 receipt 提交前失败；仅执行可能发生且缺少可验证的执行 receipt 时才判 outcome_unknown。已有 raw receipt 的后处理/最终 artifact 保存失败不改变已知工具 outcome，只恢复未完成阶段，不重执行工具。

跨节点/子 Agent 通过显式 binding 授权读取同一内容；子图得到派生引用，不能重新 claim 根输入或跨会话猜 ID 读取。每个 provider adapter 根据自身模态能力独立投影/上传，provider 私有 file ID/URL 仅作其 endpoint/profile 范围内的缓存，不是通用引用；不支持图片/文件时明确报错，不能静默丢附件。内容存储的 unchain 接口与 PuPu host 实现一起验证，无 UI host 也须能提供同一协议。

## 7. Memory 与每节点 Context Window

### 7.1 数据归属

- 根 Agent 会话：用户输入、最终整图回复、显式保留的记忆。
- 节点/子 Agent：自己的模型轮次、工具历史、局部上下文投影与压缩状态。
- Workflow：输入输出、步骤和副作用记录；不因为共享 durability 而自动启动模型摘要/长期记忆提取。
- 原始事实与节点压缩视图分开。小窗口节点的压缩不删除根 journal 原文，不覆盖另一节点的视图。

M0/M3 明确 NodeMemoryView：根历史范围、当前 input bindings、节点本地轮次、允许的长期记忆引用、source cursor/snapshot。现有 request factory 会读取 generation 全部事件，仅换 node ID 不能证明内容隔离；必须在真实 compiler/projector 验证视图只含授权来源。

D-04 已确认节点默认可读根会话历史、子 Agent 默认临时作用域；跨节点业务输出仍需显式 binding，不能从共享聊天历史猜最后一条是谁的结果。End 成功后根回复只提交一次；中间模型回复不作为多条根 assistant 回复写入。新图唯一 End completion receipt 驱动根聊天投影与 root memory completion；节点只可提出授权的长期记忆候选，不能获得根完成权限。现有 compiler 按最后 step index 判最终回复、MemoryV2Module 按 KernelRunResult 完成的逻辑只用于旧协议；新图不复用此判断。

**运行中插话兼容**：当前普通/可展平单 Agent 已有 FYI/BTW/Auto，真正多节点 recipe graph 则回退为后续排队。迁移保留这两个能力等级，不把新图一律降级，也不据此承诺所有节点/子 Agent 的实时广播。固定 Skeleton 与 Start bindings 不阻止追加授权交互事件：FYI 按运行身份和 message ID，在既有 before_model 安全边界持久接收/消费，并推进该节点的记忆 source cursor；不改已经固定的请求，不丢弃已确认的消息，不因恢复重复注入。未确认、运行结束竞态和队列 fallback 沿用已有 outbox/ack 规则。BTW/Auto 的既有模型调用只保留在支持的 Agent 入口及其固定配置，不由 Workflow/Hook 复用路由而隐式启动。跨节点分发、附件插话和新的侧问模型选择不由此次迁移顺带新增。

### 7.2 预算构建

每次 provider request 解析当前 node 的 provider/model/capability → 输入预算 override → output reserve/margin → 固定提示词/工具 schema/多模态开销 → 选取记忆与输入 → 计量 → 必要的局部压缩 → 最终检查。

复用 `resolve_context_budget` 的现有规则，不能重复扣 output reserve；实际 provider wire 的 max_tokens/max_output_tokens/推理预算必须与 reserve 对齐（未知隐式默认先解析），不能只改估算器；用户限制只可收紧实际窗口，未知窗口不得当无限。模型切换、工具 schema 变化、压缩后都要更新本次预算。模型窗口与实际 wire 限制以 provider adapter 为准，SDK 版本能力在实施时验证。

节点 override 目标字段：输入预算上限、输出预留、overflow policy；不修改全局模型窗口真值。非必需历史可按明确策略选取；必需输入超限明确失败且不静默截断。D-05 已确认不默认新增模型压缩调用，用户显式开启；保留已有明确授权的压缩策略。

request cache/summary/cache key 至少覆盖当前调用作用域、model/provider、预算、源记忆快照和有效配置；不得复用其他节点或旧模型的压缩结果。恢复时沿用固定模型/预算配置；升级模型从新运行开始。

### 7.3 运行展示

节点显示请求级 estimated input / available input，标明估算；provider 实际 usage 单独显示。整图显示聚合 token/费用和节点分项，不显示一个共同的 context-window 百分比。child run 的 usage 只汇总一次，不能 root 和 child 双算。

最终预算针对实际提交的 provider wire 做检查，工具定义、附件转换、系统提示、结构化输出指令等投影后的开销都纳入；计量误差以明确 margin 处理，不能宣称估算等于服务端精确值。

结构化输出只在成功终止且无待处理 tool call 的最终 assistant 结果上校验；流式片段、工具轮次、refusal、truncation 分别处理。M0 固定 JSON Schema dialect/允许子集与本地 $defs，禁止网络 $ref；完整 JSON Schema validator 校验原始声明，provider schema 转换不得静默丢弃语义；不支持关键字/组合提前报错。direct 与 prepared/durable 两条请求入口分别覆盖，不能只测试 ResponseFormat helper。message 默认保留最终可公开文本，额外 schema 字段由已验证对象导出；structured 模式的解析错误不会留下已发布的部分字段。

验收样例：一个 Agent 图有 128K 与 32K 两个 fake 模型窗口（测试值，不是产品规格）；大窗口节点处理长数据，小窗口节点只接明确的短输出和自身记忆视图；交换执行顺序、重启恢复后预算/压缩也不串。必需输入刻意超限时失败且零 provider call；共享原始记录保持完整。

## 8. 里程碑与建议票边界

M0–M8 是核心实施票 [#356](https://github.com/haoxiang-xu/PuPu/issues/356) 下的工作包，不是额外 GitHub ticket；#356 为 #208 的直接子票。已有 #341/#351/#352 保留其 UI 范围，不新开重复 UI 票。#215 已按负责人决定由 #351/#356 替代、关为 NOT_PLANNED 并移出 #208，Project 保持 Planning，不计作已交付工作。

| 包 | 交付与具体切入点 | 依赖 | 完成证据 |
| --- | --- | --- | --- |
| M0 协议样例与关键验证 | 两种 Skeleton schema、IO/condition AST、artifact 引用、事件与新图 checkpoint；validator/旧格式转换；provider-free 装配、独立工具 subject 和打包 Python 可行性验证；对齐 Claude | 产品已定边界 | 完整合法/非法 fixtures；真实旧模板/旧图迁移往返；运行身份不混淆 |
| M1 图核心 | unchain WorkflowRunner；Start/End、If/Switch、bindings、结果校验；测试 node handler，无生产副作用 | M0 | Python 无 UI 运行、两支选路、汇合一次、Missing/null/default、拒绝 Workflow LLM |
| M2 耐久执行 | 复用 journal/checkpoint/guard；节点调用身份、图进度、cancel、resume、parent/child 记录；artifact 耐久提交与保留 | M1 | 新版分支/非模型节点恢复、旧线性恢复；内容/receipt 提交窗口冷重启；第二次运行；已完成步骤不重做 |
| M3 模型与 Context | Kernel Loop handler；Agent 根会话、节点预算隔离、结构化输出完整校验、公开 context；既有插话兼容 | M1/M2 | 多窗口/多模型隔离；旧 Agent 直接入口及极简单节点插话回归；图排队不并发；坏 JSON/schema 零下游输出 |
| M4 确定性工具/Skill | Tool Call 经官方 executor；审批/恢复；skill 正文读取、版本快照；接 #352 | M2，D-02 | 同工具经模型调用与节点调用策略一致；批准/拒绝/超时/恢复；Skill 不执行模型 |
| M5 资源与格式切换 | PuPu Skeleton loader/store/routes/bridge/save；Workflow revision；Agent/Workflow 引用；内嵌/引用 subagent 与 handoff 适配，接 #341 | M0/M2/M3 | 旧文件无损迁移、同名冲突、修改定义不改在途；共享 Agent；handoff 后继续父图且不提前根完成 |
| M6 Code runner | JSON runner 子进程、日志通道、取消/超时/限额；内置解释器与 venv profile | M2，D-03 | 真实 venv、打包解释器、进程树退出、非法结果、崩溃窗口、不可用环境 |
| M7 Hooks | Event matcher、Workflow 调用适配、decision validator、before/after 顺序与恢复；最终结果统一投影 | M4/M5；Code 型 Hook 依赖 M6 | 最终参数审批；block；多 after 串联；child 恢复；后续请求/summary 不回流原始结果；不重复副作用 |
| M8 集成与交付 | 真实 UI 保存/运行/状态/审批/下钻，迁移切换，固定 wheel 验证 | M0–M7 全部 | UI→sidecar→实际 wheel→事件→UI；平台安装包 smoke 和兼容矩阵 |

M0–M4 可以先在严格 fixtures/测试 resolver 下运行，M5 才启用产品存储切换；因此独立 Workflow 测试不被 UI/发布页面卡住。M5 的列表与存储实现可在 M0 后先做，子 Agent 执行验收需等 M3；每个包按这条依赖拆小 PR，不做一个跨两仓巨型提交。

实际开发遵循 issue-start-ticket 的独立 clone、正式计划、impact 和必要测试流程；本次仅规划，不调用其 start/close 生命周期、不新建 clone、不发远端评论。本轮计划审查由三个只读子任务分别检查执行恢复、Context 和迁移，代码实现尚未委派。后续若委派，schema/恢复/工具边界保留强审查，UI 或独立 fixture 是较可分离切片。

## 9. Claude 与 Codex 的对接交付物

Claude：M0 fixture 对应的节点面板、侧栏/就地发布与引用信息（沿用最新设计，不新增 Manage 页）、缺失策略、每节点预算、错误定位、能力不可用、审批/暂停与子图状态；不在前端推断 provider 原生支持，不用变量可达性替代必然可用性。

Codex：schema/capability 查询、规范化错误（code + node/path + public message）、资源操作语义、run/interaction/cancel/resume、带父子身份与事件序号的状态。接口名以现有 routes/bridge 为基础落地，不凭本文新建绕过 preload 的访问方式。

双方共同维护六个 fixture：纯 Workflow 分支；双 Kernel Loop Agent；Tool approval；Agent 引用 subagent；Workflow Call；before-tool Hook。Code runner 完成后将其中测试变换节点换成真实 Code。每份 fixture 带预期输出/可见状态，作为设计与 runtime 的共同验收输入。

#341 正文与 acceptance 冲突、显示名差异、旧 recipe/Soul-Skeleton 文案要统一回写，但本次只登记，不修改 Claude 正在工作的远端票。

## 10. 补充边界合同与状态序列

沿用设计文档 BC-001–007、SEQ-001–005、AC-001–007。以下新增合同补齐本次 context/Memory 和替换格式的具体边界；所有证据当前 PENDING，不能据计划宣称准入通过。

### BC-008：节点上下文配置到 provider 请求与用量事件

- Producer：Skeleton Kernel Loop config + 模型能力解析 + scoped journal。Consumer：unchain Context request factory/compiler → provider adapter；事件 consumer 为 PuPu。
- Canonical：VERSIONED `NodeContextPolicy`（预算上限、output reserve、overflow policy）和 scoped request identity；请求 envelope CLOSED，消息/工具按对应 provider schema 投影。
- Identity：definition digest、graph/node invocation、attempt、provider/model、记忆 snapshot、request ID；事件按 request ID 关联估算和实际 usage，实际 artifact pair/digest 同 BC-002。
- 未知 policy/schema/identity 拒绝；预算超窗失败，未知实际 usage 为 unavailable，不当零；不可静默切换模型或输出模式。shared memory 仅构建局部投影。
- AC-008：统一有效输出配置驱动 reserve 与实际 wire cap，覆盖默认/显式 cap、推理预算及 Ollama num_ctx/num_predict；真实保存配置进入 request factory，最终 strict provider fake 检查模型/窗口/请求；大/小模型轮流执行、工具 schema 变化、必需输入超限零调用、缓存不串、重启后身份一致、summary 不删除原 journal。真实 SDK 支持形状在 release pair 集成补测。

### BC-009：旧文件/资源目录到新 Skeleton 存储

- Producer：旧 recipe、旧 template skeleton、Soul、引用索引。Consumer：迁移器 → strict Skeleton validator → 新 store/resolver。
- Canonical：VERSIONED skeleton + migration record（source identity/hash、target ID/hash、mapping、stage）；新 envelope CLOSED，旧格式按旧 reader 的受支持字段集合解析；未知无法保留字段报错。
- 身份：资源 ID 稳定、旧名称/路径显式映射、引用目标 kind 严格校验；源字节 hash 防并发变化。运行快照不跟迁移一起重写。
- 写新文件→校验→原子切换索引；保留旧源。rename、冲突、失败/重启不能产生随机解析副本；旧 app 不理解新格式时不可让它覆盖新版，回滚只读旧源并保护新版数据。
- AC-009：真实三类旧文件迁移；每个切换步骤崩溃、并发编辑源、同名冲突、失效引用、未知版本、重复迁移；输出精确比较配置与引用，源文件保持可恢复。

#### BC-009 实施补充：身份、默认模板与编辑事务

- Default 的 `{{USE_BUILTIN_DEVELOPER_PROMPT}}` 是明确 builtin prompt variant，先于普通 JSON 提取识别；迁移为 builtin source reference，host resolver 保存本次展开内容的快照及摘要，恢复复用快照，不重新展开可能已变更的模板；不得传字面标记、空 prompt 或误判损坏 JSON。未知 sentinel 报错。无 UI Python host 也须能提供该 source，缺失明确报错。
- 迁移范围包含 `selectedRecipeName` 聊天存储、`recipe_name` run options、文件夹映射、图内/模板引用、Default/Explore seeders。旧名称映射绑定来源 scope/path，保留旧解析优先级。显式资源引用失败报错；只有未选择资源时才能采用默认 Agent，不能静默改跑 Default。
- rename 按资源 ID 原子更新名称；duplicate 生成新根 ID，重映射复制的内嵌资源身份/内部引用，保留外部引用。graph 内 node ID 可保持局部身份，不必盲目重写。相同 ID 不同内容导入是冲突；“作为副本”显式分配新身份；同内容重复导入幂等。
- 内嵌图保存父草稿；引用 Agent 保存被引用独立资源；发布 Workflow revision 只读，编辑派生草稿且父引用仍 pin 原版。save 使用 expected edit token/digest（并发检查，不是 Agent 发布版本）。两个窗口冲突拒绝覆盖，父保存不能回写 child 快照，下钻 undo/dirty 按编辑资源归属隔离。
- Workflow 发布时校验并固定子 Workflow revision 闭包；保存/发布与依赖读取使用可重试的一致快照，发现引用资源在解析中变动就重试或报冲突，不接受混合两次读取的定义。删除有引用/运行快照的资源禁止物理清理必要版本，先归档或标记删除。
- 归档后已有固定引用仍可解析、暂停运行仍可恢复；不允许新增指向归档资源的引用，恢复归档后才重新开放选择。物理清理须确认无定义、保留运行/会话的引用，不制造“仍显示引用但不能运行”的正常删除路径；外部手工删坏内容则显式报缺失，绝不换最新版。
- AC-009 补：真实 Default/Explore seed、三类模板的有效工具/委派/记忆行为；旧 chat 迁移后发消息；新 ID copy、rename、跨来源同名、共享 child 双窗口 save conflict、父 undo 不撤销已保存的 child、发布期间编辑、旧 seeder 不复活重复资源。字段相同不是唯一证据，默认值与优先级的有效行为也要相同。
- AC-009 归档：已有 Workflow 固定引用和暂停运行在归档后仍成功解析，新增引用被拒绝；有引用的物理删除被拒绝，显式恢复归档后可再次引用。

### BC-010：根会话/子节点/子 Agent 的记忆与最终结果提交

- Producer：根输入 receipt + 节点/子 Agent 输出 + End。Consumer：ContextRuntime/既有 journal projector 与 chat projection。
- 既有 interjection/outbox 的 producer 另含运行中消息；VERSIONED、CLOSED 的运行身份/message ID/ack/cursor 投影进入该节点视图，重用已有交互协议而非绕过输入身份。未知运行、过期确认、重复 message ID 按原准入拒绝或幂等返回；固定定义不等于忽略新交互事件。
- Canonical：VERSIONED scope binding 与 completion receipt，CLOSED identity/lineage；用户输出由声明 schema 校验。D-04 默认允许节点读根会话历史、子 Agent 临时作用域；D-05 新增模型压缩默认关闭、用户显式开启，保留既有明确授权策略。
- 身份：root session/execution、generation/attempt、child invocation、node、End completion ID；凭据关联 BC-002/006/008。
- 未授权作用域/错父 run/重复 completion 拒绝或幂等复用已确认结果；中间回复仅为步骤记录，不写成根最终回复；取消/失败不伪造成功总结。
- AC-010：Kernel Loop→Code 改写→End 的根回复和记忆必须为 End 值；不同长度分支、End 校验失败、根提交后断电；节点私有工具历史未绑定时不可见，显式 binding 只获得所选值；同一 chat 两次完整运行、多个 Kernel Loop、相同子 Agent 两次调用、两个独立会话隔离、压缩不删共享原文、End 崩溃窗口最多一次根回复、第二次审批恢复不重写上一轮。
- AC-010 handoff：子 Agent End→父节点完成→Code 改写→父 End，根回复只取父 End；覆盖 child 审批/冷恢复、输出契约不匹配、适用 after Hook、跨 provider，以及旧直接 Agent terminal 行为；无额外父模型调用、无提前根 completion。
- AC-010 插话：旧普通/单 Agent→新版极简 Skeleton 的 FYI/BTW 对照；FYI 后第二次请求/冷恢复不丢不重；现有多节点图 new_run→queue 不并发；运行结束竞态和重复 message ID。AC-012 补纯 Workflow/Hook 入口不会为 Auto/BTW 初始化或调用模型。使用真实 route/outbox→runtime→request projection，不只测试队列 helper。

| 序列 | 初始状态/顺序和可观察结果 | repeat / retry / resume / restart / reset / rollback | 边界/验收 |
| --- | --- | --- | --- |
| SEQ-006 | node A 解析大窗口→请求→输出；node B 解析小窗口→独立视图→请求；原始记忆仍完整 | repeat 同 request 去重；节点业务 retry 新 attempt，provider 物理重试/恢复不绕过原凭据；resume/restart 固定配置；reset 新 run 可用新模型；rollback 不允许错预算 schema 恢复 | BC-008/010；AC-008/010 |
| SEQ-007 | 旧文件→校验源 hash→新文件→严格验证→索引切换；只解析一个权威资源 | repeat 幂等；retry 从 stage 继续；resume/restart 不丢源；reset 取消未切换迁移；rollback 保留新版且仅恢复可兼容入口 | BC-009；AC-009 |
| SEQ-008 | 根输入→两个局部 Kernel Loop→End receipt→根回复；后续消息新 generation | repeat 不重复根回复；retry 不混子 attempt；resume/restart 同 lineage；reset 新上下文按策略；rollback 不从中间步骤投影最终回复 | BC-006/008/010；AC-006/008/010 |

### BC-011：新版图调度与持久化恢复

- Producer：WorkflowRunner 的静态 plan 与 node/edge/call-stack 状态；Consumer：既有 journal/store 的新版图 writer/reader、恢复 dispatcher 和 UI event adapter。
- Canonical：VERSIONED graph recovery envelope，CLOSED 字段/状态 variant；provider/model 仅模型调用 variant 有；记录 plan digest、selected edge receipts、invocation/attempt、input/output references、continuation stack 和 End receipt。
- Identity/compatibility：沿用 execution/generation/attempt/guard，新增图调用身份显式映射；实际模块 manifest 声明新版能力，wheel/manifest 绑定同 BC-002。旧线性 schema reader 保持不变，不用宽松字段接收新图。
- 失败与投影：未知 version/kind、错父调用、错误边、跨 plan receipt 拒绝；已选择分支不重求值；after-hook 最终结果凭据之前的 raw receipt 不具消费资格；不能用“跳过步骤成功”伪装分支。
- AC-012：纯 Workflow 无 SDK/client 初始化与无伪 provider 字段；选路/合流/End/嵌套等待各窗口冷重启；旧线性 checkpoint 兼容与新旧 runtime 错版本负例；模型 STARTED 无 receipt 的 uncertain、工具成功后下一模型失败、安全请求重试对照、未知 usage 不计零。
- AC-013：原工具无需批准但 Hook 强制批准；modify 后批准最终参数；两个 before hook 的要求累积；child Tool Call approval→父 Hook decision→父工具 approval 的两次冷重启；after-hook 分阶段 receipt 故障注入；Hook 局部作用域与 Tool Call 不意外继承；拒绝/取消/uncertain 不被继续策略当成功。
- AC-013 结果投影：H1 脱敏→H2 格式化/continue 不恢复被删除字段；中途重启、第二条失败不重调工具/H1，未完成阶段无消费资格；原始结果含 sentinel，经 Hook 删除后，下一模型轮、summary、冷恢复、公开 context、bindings 和 artifact 展开均不含 sentinel，审计记录仍保留原文。关联 BC-005/007/008/010/011，断言真实 journal→compiler→provider consumer，不能只测即时工具返回值。

| 新序列 | 事件与可观察结果 | repeat / retry / resume / restart / reset / rollback | 边界/验收 |
| --- | --- | --- | --- |
| SEQ-009 | child hook tool 等待批准→恢复 child→require_approval→父工具等待批准→执行→after→End | 重复批准幂等；retry 不重做已完成 child；resume/restart 精确恢复栈；reset 新 run 不自动批准；rollback 不兼容则拒绝恢复 | BC-005/006/011；AC-005/012/013 |
| SEQ-010 | 工具 raw receipt→after child receipt→可见结果 receipt→消费 | repeat 不重复消费；retry 只处理未完成阶段；resume/restart 不跳过 Hook/不重调工具；reset 不撤销外部副作用；rollback 不允许旧消费者绕过新凭据 | BC-005/006/011；AC-013 |

### BC-012：附件/大结果到耐久内容存储、子作用域与 provider

- Producer：入口附件接收器、Code/工具结果 writer；Consumer：artifact store → scoped resolver → Code/child binding/provider adapter。canonical 为 VERSIONED、CLOSED 的 ArtifactRef（类型、content ID/digest、size、媒体类型、来源/授权作用域），精确字段 M0 冻结；文件字节与协议元数据分开。
- 身份/兼容：root execution/session、source receipt、content digest、授予的 child invocation；运行适配按 BC-002 的实际 manifest 与发布 artifact pair，未知 ref 版本/字段、跨作用域、错摘要拒绝。provider wire 按对应媒体协议生成，不跨 endpoint/profile 复用私有 file ID；公开引用不含凭据或源本机绝对路径。
- 投影/失败：先耐久保存内容再提交 receipt，引用保留与回收须覆盖运行/会话寿命；已提交结果不可重读可变源文件。缺内容、损坏、配额、模态不支持均明确失败，无静默文本降级；具体副作用不确定性按第 6 节处理。
- AC-014：真实入口/大 Code 输出→存储→严格 ref consumer；内容写入/receipt 提交两处崩溃、清理与暂停恢复并发、源文件修改/删除后固定内容可用；缺失/损坏内容、错误版本/作用域、无授权子引用负例；image-only、混合 provider 图片/文件绑定、子 Agent、真实 Code 文件映射及冷重启。与 AC-010/011/012 共验；断言子图未重占根输入、unsupported 模态不发模型请求、provider 私有引用不跨地址；Code 修改 staging copy 不改原件，已有 raw receipt 后配额失败不改判工具结果未知。

| 序列 | 初始状态/顺序和可观察结果 | repeat / retry / resume / restart / reset / rollback | 边界/验收 |
| --- | --- | --- | --- |
| SEQ-011 | 附件/大结果内容提交→引用 receipt→child/provider 投影→暂停→源文件变化→恢复固定内容 | repeat 内容写入可幂等且不扩权；retry 不重做生产副作用；resume/restart 验摘要与授权；reset 新输入独立快照，旧引用按保留规则存续；rollback 不允许旧 reader 忽略 ref 版本 | BC-006/012；AC-012/014 |
| SEQ-012 | 支持插话的 Agent 运行→FYI intent→持久接收/ack→before_model 消费→新的请求视图；不支持的图沿用 queue | repeat message ID 幂等；retry 不创建第二条消息；resume/restart 按消费 cursor 不丢不重；reset 不把旧运行消息注入新 run；rollback 不忽略未确认 outbox | BC-006/008/010；AC-010/012 |

## 11. 测试与逐步切换

测试层次：纯 schema/AST/bindings → unchain handler/runner → 严格 host/provider consumer 契约 → sidecar 集成 → UI 往返 → 同一 wheel 的安装包 smoke。只做与行为有关的断言，不为文档写镜像测试。

必测运行矩阵：normal Agent、Agent graph、纯 Workflow、subagent、Hook child；首次/第二次正常消息、首次/第二次审批、retry/resume、冷重启、取消、资源编辑、provider/profile/manifest 变化。普通纯 Workflow 的模型请求项应为 N/A（该路径禁止模型），需用“平台运行时实际零模型调用”负向证据证明（不包含受信用户代码自行发起的外部请求），而不是写“没测”。

### 多模型、多 provider 混合 Agent：0.2.0 必交测试（AC-011）

该矩阵关联 BC-002/005/006/007/008/010/012 及 SEQ-002/006/008/011，不只测试各 provider 的独立单节点。

| 组合/场景 | 核心断言 |
| --- | --- |
| 同 provider 不同模型，大窗口→小窗口及反向 | 每节点模型、预算、输出预留正确，消息/压缩缓存不串 |
| 所有正式支持 provider 的有向两两组合 A→B | 请求各走对应 adapter/配置；只传标准输出，不透传另一 provider 的私有消息、replay handle 或工具 call ID |
| 同协议/同模型名、不同 endpoint/profile/认证方式；native→custom→native | 每节点固定 endpoint/profile 与 factory；凭据只从绑定 profile 解析，不沿用父/上一节点 secret；记录不含密钥 |
| 至少三种 provider 的 A→B→C→A 长链 | 回到 A 不复用错误会话或其他节点状态；节点与根用量准确且不重复计数 |
| 父 Agent A → 子 Agent B → 父 Agent A 继续 | 父子身份、记忆作用域、结果回传与模型配置隔离 |
| Start 图片/文件 → 节点 A → 节点或子 Agent B | 显式绑定传中立 artifact 引用；各 adapter 独立投影，能力不足显式失败；不跨 profile 传私有 file ID，冷恢复不依赖原始文件仍在 |
| 混合 provider + Tool Call + before/after Hook | Hook 使用非 LLM Workflow；工具原有确认生效，批准最终参数，结果交回正确节点/provider |
| 第一次/第二次审批、暂停、冷重启恢复 | 不重复已完成模型/工具/Hook；恢复固定 provider/model/参数，拒绝错误凭据和错运行身份 |
| 一个节点 JSON 输出、下一个节点消费绑定 | 严格 schema 校验；不支持原生结构化输出时明确拒绝；坏输出不发布下游 |
| 某 provider 超时/限流/失败，其他步骤已完成 | 不静默换 provider/model；retry 仅针对允许重试的 attempt；已完成步骤不重跑 |
| 分支跳过某模型节点、并存多会话 | 未选分支零调用；不同会话不串 memory、credential profile、事件或预算 |
| UI 与安装包完整运行 | 图保存/迁移→实际 wheel→混合模型运行→状态/usage/审批展示一致 |

范围由 M0 从 native + shipped + custom 注册目录固化：除 OpenAI、Anthropic、Gemini、Ollama，还包括现有 Hyperspace、DeepSeek、Kimi global/CN 及支持的 custom transport。品牌不等于协议；OpenAI Responses/Chat 路由按实际支持分别测试。不是凭名称声称每种模型支持所有能力。完整有向组合和异常矩阵用真实 adapter + 严格 provider fake；每个正式支持 provider 及代表性三方混合链另做真实服务集成。记录模型 ID、endpoint profile、SDK/adapter 版本、能力、wheel/manifest digest；不记录密钥。完整协议组合用 strict fake；无法穷举任意用户 endpoint，按支持的 transport/profile contract 类别覆盖，不把无限 endpoint 笛卡尔积当交付承诺。缺凭据/服务不可用记 NOT_RUN，不可用 mock 通过替代或宣称必需真实集成已完成。

Python unchain 测试按自身 pytest；PuPu sidecar 用 run_tests.sh，前端用 react-scripts test。Electron .js/.cjs 变更保持同步。每次 .py 改动后运行验证要重启 sidecar。

切换规则：旧图先经新 compiler 做只读对照，不为 shadow 比较重复执行有副作用节点。模型/工具运行也不双发。按实际模块 manifest 能力开启新格式；旧运行继续走可兼容恢复路径，新 run 使用新计划。不要在失败后偷偷降级为旧线性图而丢分支/Hook。

发布候选必须为同一 PuPu candidate + 一次构建后复用的 unchain wheel；记录 wheel SHA-256、manifest digest、平台与 runtime profile。任何重建 wheel 后原组合证据失效，必须重跑相关组合验证。开始 active rollout 前所有适用 AC 已执行；本计划当前状态 INCOMPLETE。

## 12. 首个可开始的工作包

建议先做 M0：先验证 provider-free 装配、新图恢复协议、独立工具执行 subject 与安装包 Python，再冻结最小 Skeleton/IO/事件 fixtures、旧格式迁移器和 validator，给 Claude 可消费的真实样例；随后 M1/M2 建立不依赖模型的图调度与恢复。D-01–05、D-07 已确认，M0–M8 全部属于 0.2.0 必交范围；按依赖分阶段实施，不分阶段删减交付。

M0 的完成标准是一个开发者能从文档和 fixtures 明确写出、保存、拒绝非法的 Skeleton，且旧 Agent 配置无损迁移；不是“已经画了所有节点”，也不是“所有运行能力已上线”。本计划阶段无生产代码改动或提交；后续已创建 #356，并将负责人确认的决策同步到该票。

## 13. 计划审查记录（2026-09-26）

本轮采用三个独立只读审查切片与主任务交叉核对；没有变更产品代码，没有运行发布验收。以下问题已在计划中修订，状态是“设计缺口已补”，不是“功能测试通过”。

| 发现 | 证据落点 | 修订与实施检查点 |
| --- | --- | --- |
| P1 旧 checkpoint 是线性模型链 | unchain `context/graph_checkpoint.py:223,328,1123,1853` | 第 6.1 节、BC-011、M0/M2；新协议+旧恢复 reader |
| P1 纯 Workflow 也会默认创建模型客户端 | unchain `agent/agent.py:35,115`、`agent/builder.py:1427` | provider-free prepare，AC-012 禁止 factory 初始化 |
| P1 Hook force approval 与 child wait 未闭合 | unchain `tools/confirmation.py:159`、`context/runtime.py:1786` | OR 累积批准要求、完整 continuation stack，AC-013 |
| P1 原工具 receipt 会被直接当可消费结果 | unchain `context/tool_executor.py:1066,1203,1228` | after Hook 独立最终结果凭据与恢复，SEQ-010 |
| P1 节点重试可能重复已完成模型/工具 | unchain `providers/durable_turn_runtime.py:647,672,754` | 区分 provider retry/node attempt，未知结果不重发 |
| P1 根回复仍按最后模型步骤判断 | unchain `context/compiler.py:1452,1689,1772`、`memory/module.py:255` | End receipt 是新版唯一根完成依据，AC-010 |
| P1 默认模板被当坏 JSON、引用失效改跑 Default | PuPu `recipe_seeds.py:144,169`、`unchain_adapter.py:7571,7594` | builtin prompt variant；全入口 ID 映射；显式引用不 fallback |
| P1 复制旧保存逻辑会复用稳定 ID | PuPu `src/SERVICEs/api.unchain.js:2432,2458`、`recipe_loader.py:66` | ID-based rename/copy/import 与保存 CAS，AC-009 |
| P1 预算预留与真实输出 cap、结构化输出不一致 | unchain `context/request_factory.py:743`、`providers/prepared_request_factory.py:101`、`schemas/response.py:57` | 同一有效配置驱动 budget/wire；最终成功结果完整 schema 校验 |
| P1 仅节点身份隔离不能隔离记忆内容 | unchain `context/request_factory.py:630,689`、`context/runtime.py:2216` | NodeMemoryView 源 cursor/授权合同，AC-008/010 |
| P1 混合 provider 不能只按品牌测试 | PuPu `shipped_provider_registry.js`、`test_custom_provider_graph_step_leak.py` | 补 native/custom、同模型不同 endpoint/profile、凭据/factory 隔离 |
| P2 打包 Python 可行性验证太晚 | PuPu `build_unchain_server.sh:319`、`mcp_managed_runtime.py:447` | M0 验证现有 bundled Python 是否可复用；不能把 frozen sidecar 当 Python；M6 覆盖 macOS/Windows 支持目标 |
| P2 草稿保存与严格可运行保存冲突 | 本计划草稿/发布语义与旧 #341 binding 保存要求 | **已解**：D-07 定为草稿可存+诊断，Run/Publish 完整校验；#341 的严格要求只适用于 Run/Publish |
| P1 多 after Hook 会覆盖前一条结果，后续 Context 可能回流 raw | 本计划第 6.2 节旧措辞；unchain `context/runtime.py:2078`、`context/compiler.py:2691` | raw/current 分开、逐条 receipt；所有消费路径使用最终可见结果，AC-013 |
| P1 terminal handoff 可能提前结束根图 | unchain `subagents/plugin.py:2366–2375` | 只结束当前 Kernel invocation，继续父图；映射校验与 after Hook 不跳过，AC-010 |
| P1 artifact 引用缺少内容耐久/保留与附件跨模型合同 | 第 5.1/6.3 节；PuPu `memory_v2_unchain_graph_identity.py:87` 及其 nested attachment 测试 | 第 6.5 节、BC-012、SEQ-011、AC-014；内容先于 receipt，子引用不重占根输入 |
| P2 删除被引用 Workflow 的两份规则冲突 | 设计第 7 节与本计划 BC-009 | 统一为归档保留既有引用，新增引用需先恢复；AC-009 |
| P2 UI 将“不交付”写成“空结果”，可能误发空成功消息 | 设计第 8 节恢复场景 | 明确 withholding、provisional 和 outcome_unknown 的证据边界；不把 End 失败抹成上游从未完成 |
| P1 统一图入口/冻结上下文可能退化既有插话 | PuPu `unchain_adapter.py:11480,11594`、`use_chat_stream.js:12988`；unchain `interaction/fyi.py:94` | 保留普通/单 Agent 的 FYI/BTW 和多节点图 queue fallback；授权事件更新视图；BC-010、SEQ-012 |

需实现时专门收敛的有限项：~~D-04/05 默认记忆/压缩策略、D-07 保存行为~~（2026-09-26 已由负责人定案，见本表）、精确 schema/manifest 字段、provider capability 与模型真实集成清单。命名 D-06 沿用 Claude 最新 UI 不阻塞核心。0.2.0 全范围、工具原审批、任意代码不做 LLM 强制封禁不再重新打开讨论。
