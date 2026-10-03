# 后移独立工作：验收未通过

日期：2026-09-26。范围：本轮三个服务端文件相对冻结 r7 的改动，以及直接依赖的
主模型完成、记忆候选和后台执行链路。未修改产品代码。

## 发现

### F1 / P1：后台登记故障仍会使已完成的回答失败

位置：`unchain_runtime/server/memory_v2_unchain_root_completion.py:307`，
`memory_v2_unchain_runtime_factory.py:768`。

`before_enqueue()` 在主模型的同步完成 hook 中直接执行数据库登记。写入异常会
向上传播：普通官方 module hook 抛出 `OperationalError`；真实 graph stream
路径将已经完成的 RunBundle 改成 `failed`，再抛出
`graph_root_completion_capture_failed`。此时 canonical journal 已有根运行的
`final_message` 和 `run_completed`，出现了完成记录与最终失败状态不一致。

故障注入后恢复数据库，再用全新的 registry 执行冷恢复：worker 返回 `idle`，
仍有 1 个 pending candidate、0 个 consolidation job。当前 worker 只处理已入队
任务，不会自动重放这次失败的 completion。原测试通过手动调用完成函数第二次
证明了局部可重试，不能证明实际聊天或重启会自动重试。

这是本轮后移引入到“回答完成之后”的故障窗口。修复应让独立登记失败只影响记忆
状态，同时保存可恢复的登记/入队意图，并由后台自动重试。须保留任务与配置的
正确绑定及入队顺序；只捕获并忽略异常会留下未处理候选。

证据：[实际 stream 与冷恢复复现](step3-audit-reproduction.json)、
[复现脚本](step3-audit-reproduce.py)。复现使用真实 SQLite、官方 module 和 graph
执行链，仅注入登记写入失败；模型传输使用已有确定性 fixture。

### F2 / P1：当前 runtime 配对使后台整理任务在调用模型前失败

位置：`unchain_runtime/server/memory_v2_unchain_model_invoker.py:112`，以及
`memory_v2_unchain_agent_factory.py:155` 的同类精确工具集合校验。

实际 Unchain producer 交给整理执行器 9 个工具：4 个 candidate 操作，以及
`context_checkpoint_events_read`、`context_content_read`、`memory_list`、
`memory_read`、`memory_search`。PuPu consumer 精确要求只有 4 个 candidate 工具。
因此真实任务变为 `failed`，错误码 `memory_agent_toolkit_scope_invalid`，候选进入
`isolated`，根本没有构造或请求 Memory Agent 模型。

这不是本轮后移新引入：相关执行器、raw factory、后台 worker/host 与 r7
逐字节相同，使用的也是同一个 wheel。但它是当前候选版本实际交付链路中的阻断。
修复需明确 producer → consumer 的工具范围投影，保留角色限制，不应简单放开
任意额外工具；测试必须使用真实官方 toolkit producer 和严格实际 invoker。

证据：[真实桌面落库任务](step3-audit-live-durable-proof.json)、
[不请求模型的严格消费复现](step3-audit-compatibility.json)、
[脚本](step3-audit-compatibility-probe.py)。复现中模型构造次数为 0。

### F3 / P2：候选保存成功，但工具向模型返回失败

位置：`unchain_runtime/server/memory_v2_unchain_runtime_factory.py:204`–`211`，
`_PupuUnchainReferenceCodec.encode`。

真实 `memory_propose` 已写入 candidate，随后结果中的 `memory_candidate_content`
引用无法被 PuPu codec 表示，抛出 `reference cannot be represented as a PuPu URI`。
模型因此回答“没有保存候选”，但数据库实际已有候选并已生成后台任务。
写入事实与返回结果不一致，会误导用户和后续重试。

该 codec 与 r7 的对应类完全相同，也属于既有兼容问题。修复应增加受约束的
候选内容引用编码/解码，并测试真实保存结果的完整投影和重放行为。

证据：F2 的真实落库结果包含该种类的 `candidate_content_ref`；实际 codec 对
同一引用抛出的异常见 [兼容复现](step3-audit-compatibility.json)。

## 五项检查

1. **i18n：PASS。** 全仓 10 个目标语言无缺失、孤立或占位符不匹配；代码引用
   无缺失英文 key。既有 65 个 dead keys、48 处动态 key 保留报告，没有修改翻译。
2. **UI：N/A。** 本轮无新增或修改 UI。
3. **模型 × agent builder：PASS / compatible。** 选择器及模型配置 schema 未改；
   既有 OpenAI/Anthropic graph fixture、selection 测试及真实 GPT-4.1 路径均执行。
   共享工厂的工具消费问题单独列为 F2，不将它误称为 picker/schema 变更。
4. **静态规则：PASS。** 本轮产品差异仅三个 Python 文件，没有 renderer IPC、
   localStorage、路由、样式或 Electron 测试双入口变更。
5. **端到端：FAIL。** F1 已确定性复现；真实桌面产生了登记、候选和任务记录，
   但任务因 F2 失败，工具返回因 F3 报错，不能作为成功整理证据。

重新运行针对该改动及直接依赖的测试：**90 passed**。它们通过不抵消上述真实
边界问题。旧的 223 项记录仍属于实施验证，不作为本次验收 PASS。

## 真实桌面与 artifact

重新启动隔离 Electron/冻结 Python sidecar，Memory V2 ready，使用真实 GPT-4.1。
第一轮模型选择了无效 `kind=note`；第二轮空 `source_refs` 被拒绝；第三轮使用从
同一测试聊天真实 journal 读取的来源引用，成功产生 candidate 和 job，随后暴露
F2/F3。没有把口头成功宣称当作落库证明。后台配置选择 gpt-5，但在模型请求前
已失败，所以这些结果不衡量后台模型速度。

服务端 digest：`b334d8934a1c215e2fdadbd369ccbcf3e5187e5fcbfc402683670464cbac2168`。
372 个冻结文件与 manifest 一致，工作区对应源文件未漂移；同一 wheel 的
347 个安装文件逐字节核对。Wheel SHA256：
`03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`。
实际导入 manifest：
`sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`。
[身份及前后归属证明](step3-audit-identity.json)、[桌面就绪](step3-audit-desktop-ready.json)、
[测试结果](step3-audit-tests.txt)、[i18n](step3-audit-i18n.json)。

BC-349-06 的前台完成独立性及 SEQ-349-05 实际失败恢复：**FAIL**。此前模型默认
配置、数据完整性和恢复相关的声明不足以覆盖真实工具消费不匹配。没有要求生产
流量、灰度时长、签名或发布；阻断来自可复现的代码/配对行为。

测试聊天已删除，隔离应用已停止，临时凭据配置、依赖链接和功能标记已清理。
日常桌面未修改。按 issue-feature-audit 的 report-first 规则，仅提交问题和证据，
不在本次验收中修复产品代码。#349 保持 In Progress。
