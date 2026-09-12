# Plugin 平台重构评估

日期：2026-09-12。状态：架构评估与建议实施顺序，尚未实施、未排入 Release。

## 结论

值得做。目标应是第三方可独立交付的 Plugin Package + PuPu Host API：一个包可包含多个 skill、Python toolkit、MCP server、attach panel action，以及未来的 mini app。统一身份、安装生命周期与权限；不同贡献类型继续使用各自的官方执行器。

收益来自新增集成无需修改聊天页面、attach panel 和 sidecar 核心分支。成本主要在稳定 API、跨进程调用、安装升级状态和第三方代码隔离。建议渐进迁移，用一个贯通前后端的示范插件验证边界，再宣布公开 SDK；本评估不支持一次重写全部系统。

## 现场证据

本次只调查 PuPu `/Users/red/Desktop/GITRepo/PuPu`，HEAD `32726c0e`，包含现场未提交的 attach panel 改动。GitNexus 已用 `analyze --index-only` 刷新到该 HEAD。图存在覆盖限制：默认大小上限跳过 `use_chat_stream.js`、`memory_v2_store.py`，流程枚举也报告预算截断。因此图的空集合不能解释为没有依赖；关键位置辅以直接源码阅读。本次未调查 Unchain 仓库或验证打包后的 runtime。

| 证据 | 含义 |
| --- | --- |
| `src/SERVICEs/plugin_presentation.js:toPluginPresentation` 用 `toolkitId` 生成 plugin ID | Plugin 目前主要是 toolkit catalog 的展示投影，尚不是独立组合包身份 |
| `unchain_runtime/server/unchain_adapter.py:get_toolkit_catalog_v2` 汇总 builtin、MCP、skillpack | 可以保留 catalog adapter，新增包身份不必立即推翻旧消费者 |
| `_build_selected_toolkits` 按 builtin/MCP 分支与 `unchain.toolkits` 导出构建实例 | 第三方 Python 包的独立安装与 worker 生命周期不能仅靠加一个 TOML 字段解决；文档的工作区发现描述不能代替该执行路径证据 |
| `src/SERVICEs/plugin_skill_sync.js:syncPluginSkills` 注册 `/command`，仅接受 composer phase | 已有官方 skill 接入点；skill 和 owning toolkit 的身份绑定需适配组合包 |
| `src/PAGEs/chat/hooks/use_chat_stream.js:buildComposerSend` 展开命令并临时带入 toolkit | SDK 发消息必须复用官方发送准备逻辑，单独调用底层 stream 并不等价 |
| `src/SERVICEs/skill_pack_import.js` 拒绝 scripts，引用配套文件会 degraded | 当前导入不等于完整 SKILL.md 目录执行；资源包支持要明确版本与范围 |
| `src/SERVICEs/attach_panel_layout.js` 固定六个 widget，丢弃未知 ID；`attach_panel.js` 两套 switch 渲染 | 排序、溢出菜单可以复用；需要动态注册来源和持久化迁移 |
| `src/COMPONENTs/toolkit/plugin_settings_registry.js` 静态 import 内置配置组件 | 内置配置注册表不是第三方 UI 加载机制 |
| `electron/main/services/test-api/bridge.js` 有 requestId、超时、renderer 回执 | 主进程请求前端执行已有机制参考；test API 明确不在 production 开启，不应直接成为公开插件入口 |
| `unchain_runtime/server/mcp_managed_runtime.py` 管理 Node/uv/打包 Python | 可复用运行时定位、下载校验与缓存经验；尚未证明可直接承载通用 toolkit worker |

GitNexus upstream impact：`_build_selected_toolkits` 报 LOW、11 个关联符号，直接调用方为 `_build_requested_toolkits`、`_build_toolkits_by_ids`，间接涉及 normal、graph、recipe subagent、resume。流程结果为空不抵消这些源码依赖。`get_toolkit_catalog_v2` 和 `AttachPanel` 均报 UNKNOWN；文本核对分别确认 `route_catalog.py` 经 routes 模块调用，以及 `chat_input.js` 导入与渲染。这些结果不是整个重构的低风险结论。

## 建议结构

Plugin 是安装、版本、禁用与归属单元；contribution 是能力注册单元。每个包有稳定 `pluginId`，子项使用包内 ID，与 `pluginVersion`、`apiVersion` 分开。旧 toolkit ID 经映射保留，避免损坏选中项、自动批准记录、历史与 skill 归属。

manifest 声明 `skills[]`、`toolkits[]`、`mcpServers[]`、`composerActions[]`、`views[]` 和 `permissions[]`。安装成功、启用、当前会话可用是三个不同状态。MCP 尚未登录可以明确显示不可用，不能伪报整个插件全部 ready。一个子项失败时按 required/optional 规则处理；不要让一半新版本与一半旧版本同时激活。

宿主分为三个职责：

1. Package manager 管身份、文件、版本、配置、安装账本和贡献生命周期。
2. Host API broker 管调用身份、授权、目标、协议和路由；broker 是逻辑边界，不要求所有业务都搬到 Electron main。
3. 现有业务服务执行聊天、skill、MCP、workspace、附件等操作；需要实际 UI 的操作由官方 renderer adapter 执行。

JS SDK 与 Python SDK 使用同一组语义接口，分别走隔离 UI 通道和 worker RPC。第三方不直接 import PuPu 组件，不获得通用 IPC、React state、settings 数据库或 sidecar 全局 token。持久业务尽量下沉到服务层，UI adapter 只处理必须有窗口的动作。

建议第一批能力（命名是草案，不是已存在 API）：

| 能力 | 契约重点 |
| --- | --- |
| `context.read` | 只返回授权会话/workspace 的公开快照及 revision，不直接给全部历史或内部 store |
| `composer.insertText` / `attachments.add` | 指定 conversation 与 composer 实例，写入需校验 revision；返回实际执行结果 |
| `chat.send` | 走官方命令展开、队列、历史、模型配置、工具授权、流式与取消链路 |
| `ai.generate` | 独立推理需求使用官方 provider 服务，有独立 run、用量与取消；不默认改当前对话 |
| `skills.invoke` / `tools.call` | 使用官方解析与工具策略；manifest 申请权限不等于授予，直接调用不能绕过确认 |
| `ui.openPanel` / `browser.open` | 返回 view/tab handle；显式关闭、目标销毁与导航权限语义 |
| `storage.get/set` / scoped events | 每插件命名空间、限定大小；订阅可释放且按授权范围过滤 |

`chat.send` 与 `ai.generate` 是两个使用场景，底层共享官方模型通道。执行中的 toolkit 不得递归往它正在等待的同一 execution 发起同步聊天；先明确 queue/child-run/reject 策略，防止死锁和无限递归。也不能把 SDK 设计成插件任意调用其他插件；跨插件调用需要明确目标与授权。

Python toolkit 建议按插件版本使用独立依赖环境与 worker 进程，sidecar 只挂载工具代理，保留官方 schema、确认、输出处理和审计。worker 通过受限宿主客户端调用前端能力，插件不会获得 provider key。venv 解决依赖隔离，不是文件系统或网络安全沙箱；独立进程也不等于 OS 沙箱。公开本地代码插件之前必须明确支持的平台、信任模型和实际限制，不能宣传未实现的沙箱保证。

Mini tool 第一版采用宿主渲染的声明式按钮、表单、菜单和结果，注册到 attach panel slot。布局注册与贡献生命周期解耦：已安装但暂不可用的 ID 保留位置，卸载清理有明确规则。Mini app 后续使用隔离 Web 内容容器和同一 SDK。普通打开网页与授予网页宿主能力是不同操作；远端导航不能继承原插件权限。具体 WebContentsView/iframe 选型需按布局、平台与官方 Electron 支持验证。

## 建议实施顺序与可验收结果

1. **统一包身份与生命周期。** 新增 manifest/安装账本，适配现有 skill 和 MCP。一个包可以组合安装、查看子项状态、禁用与卸载，旧数据保持可读。先不改官方技能语义。
2. **宿主能力与 attach 扩展点。** 抽取最小服务接口、动态 slot、JS/Python 契约；从内置 link 附件动作验证宿主消费同一接口。采用“读取授权 workspace → Python 生成摘要 → mini tool 展示 → 点击加入输入框”的示范包，不修改聊天页面来适配该包。
3. **第三方 Python worker。** 独立依赖环境、工具代理、双向 RPC、取消、重启、调用回执；示范包可完整安装运行，AI 和用户两种入口共用能力服务。阶段 2 的 Python 端可先用受控示范 worker 验证协议，阶段 3 才开放通用安装。
4. **Mini app 与 SDK 稳定化。** 增加隔离视图、网页导航与资源协议，用至少两类不同插件验证 API 不依赖单个示例；再发布 SDK、模板、兼容策略。完整 skill 资源支持按明确范围加入，不能借打包绕过现有脚本约束。

首个正式里程碑建议覆盖 1–3 的最小纵向切片；完整 mini app、插件市场、热更新、多插件依赖解析不应成为该切片前提。Unchain 实际代理接口、打包 Python 安装行为与隔离 UI 尚未验证，以下估算保留这些不确定性。

## 工作量估算（2026-09-12 补充）

这是基于现场架构的初步工程估算，不是实测开发速度或交付承诺。人日按一名熟悉 React/Electron/Python 和本仓库、使用 AI 辅助的工程师的有效工作量计；包含设计、实现、相应测试与审查，不含外部审核等待和无关故障修复。不能换算成相同数量的 agent 会话日，也不能按 agent 数量线性缩短。

| 交付层级 | 累计工作量 | 明确范围 |
| --- | --- | --- |
| 受控试用版 | 20–30 人日 | 一个平台、可信本地包、手动安装/升级；组合 skill/MCP/Python toolkit，少量宿主 API、声明式 mini tool、一个贯通示例；插件执行先支持 normal，对未支持的新路径明确拒绝并验证旧路径不回归 |
| 可公开给第三方的 Beta | 45–75 人日 | 上述能力产品化：包生命周期/兼容迁移、独立 worker、JS/Python SDK、权限与错误、升级恢复、文档模板；macOS/Windows/Linux 支持范围内的打包测试，声明支持的 normal/graph/subagent/resume 路径验证 |
| 再加入基础 mini app | 70–110 人日 | 在 Beta 基础上增加隔离视图、限定网页导航、资源加载、视图生命周期与 SDK 接入；增量约 25–35 人日 |

以上是不同交付范围的累计数，不能相加。Beta 细项净工作量约 35–59 人日，加约 25% 的跨边界返工余量后取整为 45–75 人日。试用版不是 Beta 的质量标准减半，而是减少平台、API 与新执行路径范围；基本身份校验、授权、取消和错误处理仍需实现。

| Beta 工作包 | 净人日 | 主要交付与成本来源 |
| --- | --- | --- |
| 技术验证与契约收敛 | 2–3 | 真实打包 Python 跑 worker；官方工具代理反调前端；验证不用重写 agent loop，冻结首批 API |
| 包模型与生命周期 | 4–7 | manifest、独立 pluginId/子项归属、安装账本、启停卸载、升级失败处理 |
| Skill/MCP 与旧数据适配 | 3–5 | 复用现有引擎、旧 toolkit ID 和批准记录映射、组合包与独立安装共存 |
| Host API 与双向调用 | 5–8 | 身份/权限、限定参数、明确目标、请求回执、超时取消、事件释放 |
| 官方聊天与 AI 服务接入 | 4–7 | 从既有调用点抽最小公共入口；发送准备、队列、流式、用量、确认；防同一执行递归等待 |
| Python worker 与工具代理 | 6–10 | 独立依赖、启动/退出/重启、官方工具代理、宿主反调、打包环境接入 |
| Attach panel / mini tool | 3–5 | 动态贡献注册、声明式 UI、布局兼容、可用性与卸载清理 |
| SDK、模板与示范插件 | 2–4 | JS/Python 客户端封装、开发文档和至少两个用途不同的验证示例；共享传输已计入 Host API |
| 集成验收与跨平台回归 | 6–10 | BC/SEQ/AC、固定 candidate/wheel、冷重启/第二次交互、安装升级与现有功能回归；各模块基础测试已计入对应工作包 |

成本最高的不确定性是：官方发送逻辑尚在大型 React hook 中、工具执行横跨多种运行路径，以及打包 Python 的第三方依赖安装。现场 `use_chat_stream.js` 约 1.46 万行、`unchain_adapter.py` 约 1.30 万行；这些数值说明需谨慎抽取入口，不用于按行数计算工期。全面拆分这些大文件未计入本任务。

依赖顺序为“最小契约/运行时验证 → 包身份与 broker → 官方适配和 worker → 示例闭环 → 固定产物验收”。契约稳定后，包管理、UI slot 和 worker 的部分实现可以独立安排，但集成、状态恢复与发布验收仍有串行依赖。建议拆成约 12–16 张可单独验收的票；这里未创建或修改任何 GitHub issue。

建议先安排已包含在总量中的 2–3 人日技术验证，再承诺试用版里程碑。若验证发现必须修改 Unchain 执行协议、无法复用打包 Python，或官方聊天入口需要大规模搬迁，则应重新估算，不能把重大新增范围默认为返工余量已覆盖。

不包含：跨平台 OS 级恶意代码沙箱、插件市场/审核/签名分发体系、任意远程网页的浏览器自动化、插件间依赖解析和热更新、完整 skill 脚本执行生态、所有内置功能改造成插件。第三方 Python Beta 的信任模型是用户明确安装的本地代码插件；API 授权不意味着限制了该 Python 进程全部 OS 权限。

## 跨边界计划记录

遵循 `.claude/rules/cross-boundary-contract-gate.md`。以下为设计期技术边界与证据计划；全部 AC 当前为 NOT_RUN，active rollout 为 INCOMPLETE。字段是待实现的规范草案，实施前仍需双方 impact、精确 schema 文件和真实产物验证。

共同调用 envelope 草案：`schema/version/requestId/method/target/params/deadline`，宿主从认证连接绑定 `pluginId/pluginVersion/installGeneration/grantRevision`，不信任调用方自报身份。执行衍生调用还绑定 `executionId/attemptId/toolCallId`。canonical command 携带授权后的明确 target；响应是封闭 `ok/result` 或 `ok/error` 分支并关联 requestId。各 method 的 params、target、result、error 需独立 CLOSED schema；协议整体 VERSIONED，不支持的版本 fail closed。

| 边界 | Producer → consumer / transport | Shape、准入与投影 | Identity、失败与证据 |
| --- | --- | --- | --- |
| BC-001 包安装 | 第三方包 → package manager → 持久账本/各贡献注册器；文件与存储 | manifest → 规范 PluginRecord + ContributionRecord → 旧 toolkit/skill/MCP 投影；VERSIONED，未知字段拒绝，预留扩展仅在明确 namespace 内 | pluginId/version/content digest/installGeneration；路径必须局限包根；required 子项失败不切换 active generation，optional 子项显式 unavailable；AC-001/006 |
| BC-002 UI 调用 | 隔离 plugin UI → broker → 官方业务服务；限定消息通道/IPC | 共同 envelope → 授权 canonical command → method response；VERSIONED + CLOSED 参数，不暴露内部对象 | 连接、frame、origin、view generation 绑定包身份；错来源/权限/字段/版本拒绝，导航撤销通道；AC-002/005 |
| BC-003 工具与反向调用 | sidecar 工具代理 ↔ Python worker ↔ broker；独立双向 RPC | 官方工具调用 → 明确 tool schema 与运行上下文 → 官方工具结果；宿主请求复用共同 envelope；VERSIONED | toolkitId 到 contributionId 映射；worker generation、execution/attempt/toolCall 与安装版本绑定；超时/取消/崩溃明确终止，不能编造成功或无条件重放；AC-003/005 |
| BC-004 AI/skill 路径 | plugin SDK → 官方发送/推理服务 → Electron/sidecar → 实际 Unchain runtime | SDK 输入 → 官方命令展开、公开运行配置和凭据 descriptor → 现有 runtime/provider wire；VERSIONED，SDK 禁止注入内部覆盖字段 | conversation/run 与能力授权绑定；密钥仍只由官方服务注入；当前 execution 重入按明示策略拒绝或排队；协议不支持时拒绝；AC-004/005/007 |
| BC-005 renderer 与状态 | broker → 官方 renderer adapter → composer/附件/视图；IPC 与状态服务 | canonical command → 指定 target/revision 操作 → acknowledged result；VERSIONED，CLOSED 结果 | window/conversation/composer/view generation；旧 revision 返回 conflict，窗口关闭返回 target_unavailable；结果不明时先查回执，禁止盲重放写操作；AC-002/005 |
| BC-006 现有引擎适配 | plugin manager → skill/MCP stores 与官方 registries；持久化与运行时激活 | contribution descriptor → 官方规范 skill rows/MCP install record → 现有 catalog/command/runtime；VERSIONED 投影，禁止将任意字段透传 runtime | 所有权按 contribution 记账；重复安装不重复注册，卸载不删除包外用户 MCP；授权未就绪报告 unavailable；AC-001/004/006 |

共同版本规则：插件内容 digest、worker 包 digest、PuPu candidate identity 用于归属与证据追踪；runtime capability/admission 必须读取实际 import 的 Unchain runtime 导出的严格 protocol manifest，不能由 Git SHA、路径或版本字符串替代。最终对同一 PuPu candidate 与一次构建后复用的同一 Unchain wheel SHA-256、runtime manifest digest 测试，再加上示范插件的固定包/worker/UI digest。

## 状态序列与验收矩阵

| 序列 | Identity / 初态 → 事件 → 可观察结果 | 持久边界与关联 |
| --- | --- | --- |
| SEQ-001 安装与升级 | pluginId/installGeneration；absent → staged → validated → active；重复安装无重复贡献；失败升级保留旧 active；disable 拒绝新调用并撤销挂载；重启恢复一致 generation；rollback 不扩大授权 | 包账本、贡献所有权、配置；BC-001/006，AC-001/006 |
| SEQ-002 操作与重试 | installGeneration/execution/attempt/requestId + target generation；首次调用 → 执行 → 回执；相同请求查回执，第二个新请求正常执行；取消后迟到结果不再生效；切换聊天不改变显式目标 | 宿主操作回执及对应业务持久状态；BC-002/003/005，AC-002/003/005 |
| SEQ-003 推理与恢复 | conversation/execution/attempt/interaction + plugin generation；首次消息 → 第二次消息 → 首次/第二次 interaction → retry/resume → sidecar 冷重启 replay；工具身份与权限一致，撤权/升级不能继承旧授权 | 官方执行日志、interaction 与插件授权记录；BC-003/004/006，AC-004/005/007 |
| SEQ-004 视图和重置 | view/frame generation + pluginId；open → subscribe → navigate/close → reopen；旧订阅释放、旧回调失效；reset 撤销授权并清理对应偏好，无自动复活 | 视图会话、授权与布局偏好；BC-001/002/005，AC-002/005/006 |

| AC | 正向与负向证据计划 | 状态 |
| --- | --- | --- |
| AC-001 | 真实组合包安装到真实官方 registries；拒绝路径越界、同名冲突、未知字段、错版本；required 失败无半激活；重复安装一致 | NOT_RUN |
| AC-002 | JS SDK 真实消息经 broker 到 renderer，插入指定聊天；校验 exact keys；错 origin/frame/权限/target/revision 均在目标操作前失败，切换聊天不串写 | NOT_RUN |
| AC-003 | 实际独立 Python worker 执行官方工具代理并反调前端；真实输出喂严格 consumer；坏 schema、伪造身份、超时、崩溃、取消均返回明确结果；依赖冲突不改变官方环境 | NOT_RUN |
| AC-004 | plugin 发消息/skill 与内置入口语义一致：命令展开、临时工具选择、授权、历史、流、用量与取消；拒绝内部字段、递归自等待；插件结果中无 provider key | NOT_RUN |
| AC-005 | SEQ-002/003/004 逐步执行，包含第二次调用、第二次 interaction、重复请求、reply 丢失、冷重启、关闭窗口、晚到结果；无法确认的副作用不能当作未执行自动重放 | NOT_RUN |
| AC-006 | 含现有 toolkit IDs、批准记录、布局与用户 MCP 的真实升级 fixture；disable/remove/reset/rollback 后没有僵尸贡献或权限扩大，不删非所属资源 | NOT_RUN |
| AC-007 | 同一 candidate + wheel + 插件产物跑 normal、graph、subagent、retry、durable resume、冷启动及所有声明支持的 provider/平台组合；错 runtime manifest 拒绝；不支持路径显式拒绝而非静默降级 | NOT_RUN |

尚无状态标为 N/A。若实施阶段缩小路径支持，需说明该状态为何不能到达并测试拒绝路径。测试必须来自真实 producer，由独立严格 consumer 验证；不能双方复用宽松 helper 互相证明。schema 修复保留 red-before-green 证据。变更 Python 后需重启 sidecar；本次未修改 Python。

## 外部依据

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)：远程内容禁用 Node integration、启用隔离，并验证 IPC sender。
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)：按能力暴露明确方法，不开放通用 IPC。
- [Python venv](https://docs.python.org/3/library/venv.html)：提供独立 Python 包环境，不能据此推导 OS 级隔离。

本次产出仅此评估文档；未改业务代码、未运行实现测试、未提交。
