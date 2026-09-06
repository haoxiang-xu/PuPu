# Windows Memory V2：恢复机制整体修复方案

日期：2026-09-05。状态：Checkpoint 1 独立验收 **NO-GO**；第一批修复复验仍有 WAL 生命周期及预检到回答写入的竞态缺陷，工作包 B/C 尚未完成。最新证据见 `windows-memory-v2-checkpoint-1-review.md` 第十四节。尚未构建新的固定 wheel、安装候选或启用日常 Active。

**后续执行入口：第十节为 H1/H2 的具体修复方向和实施顺序。** 本次仅更新方案；第九节是历史实施记录，其中 immutable/WAL 分支不能作为后续设计依据。两个原有 checkpoint 和 R01..R08 保留。

## 1. 为什么调整方法

目标仍是原 Windows Memory V2 Active 计划。本方案替换其中 BC-006 / SEQ-003 的恢复实现策略和验收方法，保留已完成的 Windows 存储、Vault、provenance、删除工作及原有两个 checkpoint。工作包 A/B/C 已提交一版实现，但独立验收发现只读事实陈旧、身份拒绝前持久写入、协议准入缺口及并发回归失败；固定 artifact 与安装态验证仍按 Checkpoint 1 后的工作包 D 执行。

已知缺陷依次表现为：同节点第二次交互失败、下一节点交互失败、隔一个普通节点后交互失败、旧格式 binding 恢复失败。它们不是四个互不相关的判断遗漏，而是同一设计问题的不同状态：

1. coordinator、graph step、transport attempt 被混用于 session guard 的归属判定。
2. 恢复起点绑定是不可变的，但被拿来表示不断推进的执行位置。
3. 完成节点的 resume context 会被清理，代码却把该文件当长期身份依据。
4. 新增持久字段后没有定义旧记录如何进入新恢复流程。
5. 测试随着局部补丁追加；总通过数掩盖了未覆盖的状态组合。

前几轮修复和审查都没有先统一这些约束。本次先确定身份与状态模型、列出失败矩阵，再集中实施；不再以“刚发现的一个例子转绿”作为 READY 的依据。

## 2. 固定设计原则

### 2.1 每种身份只承担自己的职责

| 对象 | 作用及生命周期 | 不能代替什么 |
|---|---|---|
| owner chat / generation / execution | 确定数据归属和执行世代；以已验证的持久绑定为准 | 不能只凭相同 chat 放行另一个 execution |
| graph coordinator / plan / scope | 确定本次 graph 的完整运行计划 | 不能把相同 recipe 名称或拓扑摘要当同一执行 |
| graph step attempt | 表示计划中具体的一次节点执行 | 不能作为后续所有节点的固定 source |
| transport attempt | 持有这次运行或恢复的进程执行权；可运行多个节点 | 不能改变其最初恢复 source 来追踪当前位置 |
| interaction / receipt | 标识当前问题与已持久化的回答及消费状态 | 不能用旧回答满足另一个问题 |
| resume context | 保存恢复定位信息和可重建配置；有明确清理时机 | 不能作为完成节点唯一的永久身份凭据 |

### 2.2 以 canonical journal 中的计划和已执行事实为准

优先采用现有入口，而不是再创造一份并行的 graph 真相：

- Unchain `context/graph_checkpoint.py::locate_graph_execution_plan`：按 execution、generation、coordinator 严格定位唯一已 admitted 的计划，文档明确为只读。
- 同文件 `JournalGraphCheckpointRepository.scan`：验证持久计划、step identity 与 checkpoint 序列。需要稳定公开结果时，在 Unchain 中提供窄的只读查询接口，不让 PuPu 依赖私有 `_GraphScan` 布局。
- PuPu `memory_v2_unchain_graph_checkpoint.py::PupuUnchainGraphCheckpointHost.validate_resume_context`：复用已有 plan、step、provider/configuration 和 coordinator 校验语义。
- `session_execution_guard.py` 的 prepare/validate/rollback transfer：继续承担跨进程互斥和执行权转移。

注意：`GraphCheckpointService.recover()` 可能补写 completion/terminal 记录，不能直接冒充只读预检使用。涉及补齐记录的恢复修复必须放到已取得执行权的明确阶段。

只读要求还必须覆盖底层 store 的打开方式：`_cold_context_store()` 构造和 `SQLiteContextV2Store.bind_execution()` 可能初始化目录、schema 或写入执行记录。解析入口应使用已初始化的 store 或 existing-only 读取接口；缺库、缺 execution 时直接返回缺失，不因一次 pending 查询新建权威状态。测试比较预检前后的目录、DB/journal 和 guard 写入，而不只 mock provider 次数。

“允许继续”必须同时证明：当前问题属于正确执行与世代；恢复起点与当前节点处在同一个已 admitted plan/scope；日志证实中间节点按计划完成或按现有运行时语义合法推进；当前 interaction 和 receipt 精确匹配。只比较 `step_index` 大小、直接前驱、节点名称或同 plan 摘要都不够。

### 2.3 一个解析入口，多个调用点共用

在 PuPu host 层集中实现恢复上下文解析，返回内部的明确结果：可恢复、已完成/已消费、需在持锁后补齐、证据缺失/冲突。名称可按项目习惯选定。

该入口负责读取与判定，不自行执行 provider、工具或凭空创建新的 graph。pending 查询、提交 receipt、cold resume、取消路径共用同一套归属判定，动作权限仍分别校验，不能用“能取消”推导“能恢复”。

移除同源和紧邻后继的特殊补丁逻辑。`source_graph_guard_lineage` 不再是是否支持恢复的必需字段或独立权威；如果保留兼容读取，已有值必须与 canonical 事实核对，冲突要明确拒绝。

## 3. 先验证，再推进执行

固定恢复顺序：

1. 读取当前 interaction/receipt、不可变 transport source binding、已验证的 owner/generation、graph plan 和执行快照。
2. 完成版本、身份、source、当前执行位置及旧数据兼容预检。此阶段不能调用 provider/工具、标记运行、消费 receipt 或改变 guard。
3. 使用现有 guard transfer/CAS 获取执行权；核对预检所依据的 revision/cursor 仍有效。变更则重新判定或返回明确冲突，不能使用过期验证结果。
4. 在执行权内完成必要且幂等的 journal 补齐/关联落盘，然后进入已有运行库的 receipt 应用和 step 恢复流程。
5. 遇到下一次 interaction 时，仅更新当前挂起问题及其 source；保持 transport 的原始恢复绑定不变。
6. 完成或取消时按现有执行权协议释放。所有异常路径必须能解释 guard、receipt、journal 各自的状态。

跨文件/数据库操作不能声称天然原子。实现前列清每次持久写之间的崩溃结果；已有 transfer rollback 能覆盖的复用，不能覆盖的通过幂等 operation identity 和重启协调解决。预检到执行之间的并发窗口是必测项。

对于状态不确定的 provider/工具，保留现有 uncertain 语义；不能把“一次效果”承诺扩展成网络外部系统的通用 exactly-once，也不能自动重发已完成或结果不确定的操作。

## 4. 旧数据兼容策略

先从旧 schema 的真实 producer/保留 fixture 建立样本，不仅在新对象上删除一个字段模拟全部历史。

| 旧状态 | 处理方式 | 对用户数据的约束 |
|---|---|---|
| v1 binding 无新增摘要，canonical plan/归属证据完整 | 由 canonical 日志推导恢复关系，可继续；不得强制重新创建 execution | 原 binding/source 保持不变 |
| source resume 文件已正常清理，canonical 日志完整 | 从持久计划和 checkpoint 恢复归属；清理文件不使合法执行失去身份 | 不恢复伪造的旧文件、不重跑完成节点 |
| 老版本留下的 parked guard，当前 pending 已是后续节点 | 使用相同解析入口验证并协调，不能只修“第一次 resume 入口” | 当前问题和已提交回答保留 |
| 新旧字段相互冲突、计划多义、generation/owner 错配 | 执行前明确拒绝，提供静态原因；不尝试猜测 | 不覆盖证据、不清空会话 |
| canonical 权威证据确实缺失或损坏 | 明确标为不可自动恢复；保留既有查看/删除与必要诊断能力 | 不把新会话、删除 guard 或重建历史冒充修复 |

默认不新增持久格式。如果现有日志确实无法表达 transport 关联，才增加独立、versioned、不可变关联记录，并在下述 BC-007 中补齐精确 schema、创建时机、幂等键、兼容及回退测试；不能再次静默向 v1 添加一个必需字段。必要的关联应先持久化，再允许执行推进。

不执行批量改写用户目录。先在隔离副本验证原状态 → 升级 → 恢复 → 再重启；回退候选若无法读取新格式，必须在入口准确拒绝并保留数据，不能降成另一套存储 owner。

## 5. 本次边界与序列补充

原 BC-001..006、AC-001..014 继续适用。以下编号补足原计划对恢复权威和版本兼容描述不足的部分，不增加人工验收点。

### BC-007：canonical graph 恢复事实 → PuPu 恢复判定 → session guard

- Producer：实际 imported Unchain runtime 中的已 admitted plan、typed checkpoint/interaction 事件；PuPu 的不可变 attempt binding。
- Consumer：PuPu 集中恢复解析入口、pending/receipt/resume/cancel 调用点和 guard transfer。
- 边界：运行库 API 与持久 journal/host binding；表示优先用 runtime typed result，若需 DTO 必须定义 CLOSED 精确字段集、schema version 与严格 consumer。
- 身份：owner、execution、generation、coordinator、plan/scope、step、transport/source、interaction/receipt、快照 revision/cursor。既有 binding 中的历史 revision 与当前游标分别处理，不能以所有 revision 强相等误拒绝合法推进。
- 失败语义：缺失、多义、冲突、终态、已消费、暂时不可读分别返回明确结果；未知字段/错版本在边界拒绝；不得自动转成其他 execution。
- 协议与构建：若公开 Unchain API/协议改变，更新相应 runtime manifest 与契约校验；最终仅对固定 wheel/sidecar/app pair 声明验证通过。
- 验收映射：AC-010/011 + 下表 R01..R08，包含真实 producer 和独立严格 consumer、无执行副作用预检与并发拒绝。

### SEQ-007：任意支持路径的反复挂起和推进

同一 owner/execution/generation/plan，从 step A 提问 → 持久 receipt → transport 恢复 → 零个/一个/多个普通 step → step B 提问 → 冷重启 → 第二个 receipt/resume → 完成；在 receipt、guard transfer、checkpoint 写之间插入重复请求、取消和进程退出。每步记录 provider/tool 次数、pending 身份、receipt 应用状态、guard owner/state 和 journal cursor。关联 BC-006/007、AC-010/011。

### SEQ-008：旧绑定升级与回退

用旧格式真实样本初始化待恢复状态 → 当前实现只读预检 → 合法状态恢复或证据不足时入口拒绝 → 第二次挂起 → 重启 → 完成；分别覆盖旧 resume context 存在/正常清理、旧 parked guard、新字段冲突、兼容关联写入中断及回退读取。关联 BC-001/006/007、AC-002/010/011。

## 6. 在实施前固定验收矩阵

所有用例用公共入口、真实 Agent/SQLite/CAS/guard 与确定性本地 provider/工具；仅替换外部网络服务。保留当前失败证据，测试合入正常仓库测试目录，`.release-qa` 临时脚本只作为历史证据。

| 编号 | 固定测试范围 | 必须断言 |
|---|---|---|
| R01 | 同节点、相邻节点、间隔 1/多个普通节点后提问；多次挂起 | 均能提交回答并走到最终完成；原 source 不被改写 |
| R02 | 0/1/2/多次 interaction；同 transport 继续与新 transport 恢复 | 每次问题/回答精确匹配，已消费回答不重放 |
| R03 | 真实旧 v1 binding；完成节点文件已清理；旧 parked guard | 证据完整时成功；缺证据时执行前拒绝，状态不被推入新死路 |
| R04 | owner、generation、execution、coordinator、plan/scope、source 错配；损坏与多义日志；篡改 context 后重算摘要；合法计划内尚未执行的未来节点、逆向或已取消节点 | 在 canonical 权威边界拒绝，provider/tool 调用不增加，不修改他人状态 |
| R05 | 每个持久写边界前后崩溃；真正新 sidecar 进程冷恢复 | 只读预检无写；持锁恢复幂等；没有双 owner、丢失回答或完成效果重放 |
| R06 | 并发 pending/receipt/resume；重复/陈旧 receipt；resume 与 cancel 竞态 | CAS 冲突可解释、最多一个执行者，终态不被复活 |
| R07 | normal、graph、实际 subagent；Memory off/shadow/active | 原有消息/恢复/取消/删除行为不被 graph 修复破坏；不伪造能力 |
| R08 | 新旧 host record、runtime manifest、固定 wheel 与 packaged sidecar 组合 | 不支持的组合入口拒绝；支持组合实际恢复通过 |

在现有支持的 plan 上加参数化/状态序列测试，例如线性长度 1/2/3/5/8 与不同提问位置；这些数值是测试取样，不是产品长度上限。实际 runtime 支持分支或嵌套路径时纳入合法调度，不为本任务新增 graph 特性。为每条规则指定至少一个正向和一个独立反例。

避免只测 helper 布尔结果。每个关键正向必须推进到第二次回答和最终完成；负向必须证明拒绝前没有 provider/工具执行、receipt 消费或不应发生的持久写。模型重建不等于进程冷重启，二者分别记录。

## 7. 执行顺序和完成条件

### 工作包 A：冻结基线和测试清单

保存两仓当前 HEAD/diff、候选身份、已有通过项与 F1/G1/G2 red；刷新必要索引，明确调用点与上述 API 的读写行为。保留别人的修改。先把 R01..R08 的用例名称、输入状态、断言和证据路径列入跟踪表。

### 工作包 B：确定唯一恢复解析与兼容适配

先完成只读解析入口及必要的 runtime 查询，写清 BC-007 最终 schema/typed result 和并发验证方法，再统一接入 pending、receipt、resume、cancel。以同一规则替换现有分支补丁，不增加第二份独立 graph 状态机。同步处理旧记录和失败语义。

修改每个符号前执行所在仓库 GitNexus impact；HIGH/CRITICAL 说明影响再改，UNKNOWN 明确补证。若跨 Unchain API，producer 与 consumer 两侧分别做 impact 和契约测试。

### 工作包 C：一次跑完整恢复矩阵

R01..R08、此前失败例和受影响回归全部执行。出现失败，先归类为身份规则、状态迁移、持久兼容、并发或装配问题，修改统一规则并补对应类别测试。执行模型自主完成这一内部循环，不把单个例子修好就交给用户重新验收。

停止条件：同一失败类别在完整矩阵中继续出现时，返回设计假设和日志事实定位；不继续向 guard 堆条件。新发现只在确实违反既定职责/状态模型时扩充矩阵；不临时增加无关产品范围。

### Checkpoint 1（沿用原检查点）：恢复实现与边界验收

一次提交最终设计、diff、BC/SEQ/AC 映射、完整矩阵、red/green、旧格式 fixture、并发/崩溃证据和未测项。检查修复是否消除了重复权威/临时文件依赖，而非只看测试数量。适用项失败为 NO-GO，必测项未执行为 INCOMPLETE。通过后才进入最终安装候选验证。

### 工作包 D：固定候选验证

复用原第二阶段。构建并固定一份 wheel，显式设置 artifact/evidence 路径，全程复用；源码或运行库再变即生成新的候选身份。Windows 安装态复跑恢复关键矩阵、Vault 三种 sink、loss/删除、installed Electron parent 与原计划 100 次混合故障循环。源码结果不能替代安装结果，旧 EXE 证据不能给新 EXE 放行。

### Checkpoint 2（沿用原检查点）：确切候选与启用验收

验收实际安装后的 app/sidecar/wheel、旧数据兼容、恢复行为、启用和回退步骤。通过后按用户既有授权和已验收步骤启用该候选；此前日常实例保持现状。无第三个 checkpoint，不公开发布、不提交 Git、不消耗用户真实模型额度。

## 8. 给执行模型的任务说明

> 以本文件为恢复机制的当前实施依据，沿用 windows-memory-v2-active-implementation-plan.md 的其他边界和两个 checkpoint。先完成工作包 A 的身份/状态测试清单，再实施集中恢复解析和旧格式兼容；禁止只修 G1 的直接前驱条件或只给旧记录补一个字段。R01..R08 和历史 red 完整通过后一次提交 Checkpoint 1 材料。最终构建固定 wheel，并按原 Checkpoint 2 完成安装态验证。不要恢复逐个失败、逐次请求用户验收的工作方式。保存用户数据和现有 dirty tree，不提交、不提前启用。

不能预先保证实现后没有新缺陷；可保证验收围绕明确规则和完整已知状态展开，新的失败会归入同一设计模型，而不是不断扩大零散补丁。

## 9. 工作包 A/B/C 实施记录（Checkpoint 1 材料）

以下为实施方提交时的记录，不代表验收通过。第十二节独立验收已否定“B/C 完成”和整组回归全绿的结论；R03/R05/R06 等证据缺口按原第六、七节补齐，不能用下表较窄的用例替换原验收范围。

### BC-007 的实际接口

Producer 侧在实际 import 的 Unchain runtime 中新增两个窄接口：

1. `open_existing_execution_journal_readonly(database_path, execution_id)` 只接受已有数据库和 execution。无 WAL 时使用 immutable read-only SQLite URI；有 WAL 时使用普通 read-only URI 读取最新提交的事实。两种方式都不会创建目录、schema、object directory 或 execution 行。不存在的数据库/execution 明确失败或返回缺失，不能通过 `SQLiteContextV2Store.bind_execution()` 初始化后再读取。
2. `prove_graph_interaction_lineage(...) -> GraphInteractionLineageProof` 是 frozen typed result，字段为 `execution_id`、`generation_id`、`coordinator_attempt_id`、`graph_plan_id`、`graph_scope_id`、`topology_sha256`、`source_step`、`current_step`、`interaction_id`、`request_cursor`、`journal_high_water`、`completed_step_indexes`。它从唯一 `graph.execution.admitted` plan 和 `JournalGraphCheckpointRepository.scan` 取证，拒绝 source/current 不在同一 admitted plan、逆向、非连续完成前缀、终态、已经 resolve/resume 的 interaction、future step、缺失或歧义记录。

Consumer 侧 `pupu_unchain_cold_graph_interaction_lineage_proof` 只将已验证的 graph resume context 用作 generation/coordinator/step locator；它消费上述 typed proof。`_graph_step_follows_bound_interaction_source` 不再读取已经完成节点的 resume 文件，也不再要求直接前驱等于 transport 的初始 source。若 v1 binding 有 `source_graph_guard_lineage`，它必须与 current context 和 canonical proof 的 session/owner/coordinator/plan/scope/topology 摘要一致；不存在该可选字段的历史 binding 走同一 canonical proof，原 binding 不被改写。

### SEQ-007 / SEQ-008 的已运行证据

| 编号 | 真实入口与状态 | 结果 |
|---|---|---|
| R01 | `test_active_graph_two_interactions_cold_resume_once_each_without_reexecution`（同节点）；`test_active_graph_cross_node_interactions_preserve_verified_guard_lineage`（相邻）；`test_active_graph_interaction_after_completed_intermediate_step_recovers[1,2]`（1 与 2 个普通中间节点） | 通过第二次 receipt/resume 并结束 graph；初始 transport source 未改写 |
| R02 | 同一 graph step 两次 interaction，和跨 node 的两次 interaction | 每次 interaction/receipt 精确匹配；旧 receipt 重试为 `interaction_not_found`，provider 不增加 |
| R03 | `test_active_graph_legacy_v1_transport_binding_recovers_second_interaction` | 删除 `source_graph_guard_lineage` 的真实 schema v1 binding 仍能在 source context 清理后完成第二次恢复 |
| R04 | Unchain proof 对外来 source、已 resolve/current 非挂起拒绝；PuPu 现有跨 node 用例篡改 coordinator/plan/scope/topology 和 foreign session 后拒绝 | canonical 边界失败关闭；不以相同拓扑或名称放行 |
| R05 | proof 前后精确 journal snapshot 相同；`test_existing_readonly_journal_*` 与 `test_cold_interaction_probe_uses_existing_only_journal_read` | 预检不创建 absent data plane，不创建 execution/object；现有 WAL 冷取消路径读取最新事实 |
| R06 | `test_session_execution_guard.py`、`test_durable_interaction_host.py`、`test_durable_graph_step_resume_context.py` | CAS、重复 receipt、取消及 parked/active guard 回归已运行 |
| R07 | Active bridge 的 normal 第二消息/foreign chat，graph interaction，subagent 和 Memory mode 既有受影响集合 | 本次 source 回归覆盖 normal 与 graph，未改变 capability/rollout admission |
| R08 | 固定 wheel、sidecar、installed Electron parent 和受控 Active profile | **工作包 D 待运行**；不得以 source 结果或旧 candidate 代替该证据 |

本次 source 验证使用 PuPu 的 Python 3.12 test runtime 和 sibling Unchain 的实际 source import；它证明实现逻辑，不能代替一次构建后固定 wheel 的验收。新的 wheel 只能从这份验收后的确定源码生成；所有随后 package/sidecar/probe 测试必须复用同一 SHA-256 pair。由于本仓库规则禁止提交，官方 `build-unchain-artifact.mjs` 的 clean-source provenance 步骤保留到 Checkpoint 1 通过后由项目所有者的选定提交/快照执行，不能伪造 clean provenance 来绕过它。

## 10. H1/H2 修复方向与执行 Plan — 2026-09-05

### 10.1 设计结论与尚未验证的部分

推荐方向：**Unchain 提供一致的事实快照，并在 canonical SQLite 中原子裁定回答是否被接受；PuPu 持久会话中的 receipt 是这一裁定的可恢复投影。** 现有 guard 继续管理执行权，不能用一次 guard 查询取代数据库提交约束。

这比移动一个校验调用改动更大，但直接消除两个权威存储先后各自决定“回答是否有效”的窗口。这里只收拢 interaction 的接受事实，不迁移所有会话状态，不新建独立 graph 调度状态机。

需要先验证的技术点是 H1 的无副作用读取。SQLite 普通 `mode=ro` 可能创建 WAL/SHM；`immutable=1` 跳过锁与变化检测，只适用于真正不变的数据。不能把连接参数切换当修复方案。依据：[SQLite WAL 只读条件](https://www.sqlite.org/wal.html#read_only_databases)、[immutable 参数](https://www.sqlite.org/uri.html#uriimmutable)。

本轮只在系统临时目录做过一个可行性探针：Windows、Python 3.12、SQLite 3.51.2 下，`mode=ro + locking_mode=EXCLUSIVE + BEGIN` 在“最后写连接已关闭”和“写连接仍存在”两种情况下均得到 `disk I/O error`，源文件未变化。这条参数组合不能作为已验证方案；该探针不是产品回归证据。本轮 GitNexus query/context 显式绑定 PuPu，索引行号落后于当前源码且报告 lower-bound；它只提供调用导航，不是完整影响结论。

### 10.2 先固定五条不变量

1. **一次预检只使用一个快照。** plan lookup、checkpoint scan、event/operation 完整性验证和 high-water 必须来自同一 SQLite 读事务捕获的 `JournalSnapshot`，后续解析只读这份冻结结果，不能再开第二次查询拼接事实。
2. **预检结果不是写许可。** proof 必须携带 execution/generation、计划与 interaction 身份、请求 cursor 和快照 high-water。快照可反映并发修改之前的合法时点；最终提交必须在受保护事务内重读当前事实。不能承诺“返回瞬间永远最新”。
3. **每个问题只有一份被接受的回答。** 完整身份键定位问题，规范化回答摘要判断相同重试或冲突。换一个 operation ID 不能绕过问题级唯一性。同一回答重试返回原 receipt ID；不同回答冲突且不保存输掉竞争的回答。
4. **接受与应用是不同事实。** durable acceptance 不代表 provider 已继续，也不能提前把已有 `interaction.resolved` 事件改造成另一种语义。使用既有可表达的 receipt/operation 原语；若不足，新增严格 versioned acceptance 记录并同步消费端。
5. **拒绝和已提交后的故障必须区分。** 接受事务提交前的身份/状态冲突不得写 receipt、推进 guard 或执行 provider；提交后会话投影失败属于“已接受，待协调”。重试/重启必须找回同一回答，不能把它伪装成一次无副作用的拒绝。

### 10.3 执行步骤

| 顺序 | 工作与涉及位置 | 必须交付的完成证据 |
|---|---|---|
| P0：冻结基线和写入者清单 | 保留三个 H1/H2 反例；列出 SQLite append/ingress、receipt、live confirmation、resume、cancel、guard transfer、连接关闭/checkpoint 的真实入口和锁顺序；记录两仓当前 diff | 每个写入者如何参与最终裁定有明确映射；没有未解释的直写入口；修改符号前两仓分别 impact，HIGH/CRITICAL 先报告 |
| P1：先做 H1 小原型 | 在 Unchain `sqlite_v2.py` 验证受 runtime 生命周期管理的 existing-only 读取；显式读事务一次捕获 snapshot；`graph_checkpoint.py` 的 plan/scan 消费同一 snapshot | 冷态无 WAL、有未 checkpoint 提交、WAL 创建/清理、并发提交、连接关闭和新进程均有正向与反例；读前后源目录/业务状态不变化，合法冷恢复可成功 |
| P2：实现原子接受原语 | 在 Unchain 持久层提供窄的事务接口：重新验证当前身份/终态/问题、核对读取版本、按完整问题身份唯一地保存接受结果；真实 ingress 和取消/推进路径遵守同一规则 | 两个进程提交相同回答得到同一 ID；不同回答至多一个被接受；预检后 canonical 已回答或取消时，当前提交在投影前拒绝；没有绕过接口的冲突写入 |
| P3：接入 host 与恢复 | `memory_v2_unchain_active_bridge.py` 严格消费结果；`durable_interaction_host.py` 改为接受结果驱动 receipt 投影和 guard 关联；pending/live/resume/cancel 共用身份规则；更新 guard/会话锁的使用方式 | 不再执行“先写 host receipt、再判定是否合法”；每个持久边界中断后可重新协调；原 source binding 不变；恢复不会重新接受或应用另一份回答 |
| P4：兼容与完整回归 | 定义旧 receipt、旧 v1 binding、已有 resolved 但无新 acceptance 的恢复规则；同步实际 runtime manifest、Python/Node/Electron 校验；执行原 R01..R08 的阶段一适用项 | 真实旧 producer fixture；真实 sidecar 进程冷启动；并发/取消/崩溃矩阵；normal/graph/实际 subagent × Memory mode；逐格结果及未测项 |
| P5：固定候选和安装验证 | Checkpoint 1 通过后，构建并固定同一 wheel/sidecar/app 候选，记录 SHA-256 与 manifest digest；重启测试 sidecar并复跑安装态恢复、Vault 和原 100 次混合故障循环 | 全程同一候选身份；Python 修改实际进入新 sidecar；满足原 Checkpoint 2 的安装态通过条件 |

P1 是执行模型自己的内部可行性验证，不增加人工 checkpoint。优先由已有 runtime/store 管理连接寿命，在其提供的稳定读取能力上捕获快照，避免预检自行初始化 writable store。冷态若确实需要初始化/修复，应返回明确 `needs_recovery` 并交给已有受保护恢复阶段，不能在只读入口偷偷执行；必须验证正常启动后能获得快照，不能把所有合法请求都变成暂时不可用来通过负向测试。

**P1 的停止条件：** 若上述方案不能同时满足一致性、源目录无预检写入和合法冷恢复，暂停业务接线，在本节记录反例与替代机制；不能继续增加文件存在性、mtime、sleep 或重试条件。隔离快照是可评估的替代机制，但必须证明获取副本本身一致；普通复制 DB/WAL、仅对副本加 immutable、对正在变化的源文件做前后 stat 均不构成证明。需要改变读取副作用契约时明确写出差异，不能默默削弱既有验收。

### 10.4 H2 的事务与崩溃处理

提交的目标顺序为：

1. 规范化请求并做无副作用身份预检。
2. 取得能覆盖 owner/取消状态的现有跨进程执行权保护；P0 必须列出全体参与者和统一锁顺序，不能仅加 Python 线程锁。
3. 进入 canonical SQLite 写事务，在同一事务中读取当前事实并接受回答。可复用已有 `BEGIN IMMEDIATE` 事务能力，但必须让校验和写入使用同一个 connection；外层事务内再调用另开连接的 append 不算原子实现。
4. 检查 operation 重放和问题级已接受状态。同一身份/同一规范化回答返回原结果；冲突、错身份或终态拒绝。high-water 改变时重新判定或返回可重试冲突，不能盲用旧 proof，也不能把任何无关日志增长都永久判为不可恢复。
5. 提交 canonical acceptance。这是“系统已接受这份回答”的唯一提交点。receipt 与取消的胜负应在同一权威规则下确定；取消先完成则不接受，接受后取消则保留已接受事实并禁止继续执行，不能复活终态。
6. 依据接受记录幂等同步 host receipt、guard 关联，再按既有执行权协议应用回答。记录中的回答本体或已有持久 artifact 引用必须足以在 host 文件丢失时恢复；只有一个摘要不够。

canonical acceptance 不会使跨库/跨文件操作天然原子。实施必须按以下表证明中断结果：

| 中断位置 | 持久结果与重试要求 |
|---|---|
| canonical 接受事务提交前 | 本次没有被接受的回答；可用同一请求重试；预检冲突无业务写入 |
| 提交后、host receipt 同步前 | 从 canonical 结果找回原 receipt/回答，补齐投影；不能再接受相反回答 |
| host receipt 后、guard 关联前 | 重复同步无害，取得正确执行权后补齐关联；不能产生双 owner |
| guard 关联后、回答应用前 | 只应用已经接受的同一 receipt；取消终态仍阻止继续 |
| 应用记录之后或 provider 结果不确定 | 按已有已应用/uncertain 事实恢复，不自动重放已完成或不确定的外部效果 |

如果旧 host receipt 与 canonical 事实矛盾，应明确冲突并保留两侧证据；如果旧记录合法且尚未有 canonical acceptance，只能在相同受保护接受流程中导入。不能按新路径“先写 SQLite”就忽视旧路径“先写 JSON”留下的中断状态。

### 10.5 边界、序列与具体验收补充

本节补足 BC-007 的最终设计义务，新增编号仅作工程映射，不增加产品范围和人工验收点。

**BC-008：SQLite 一致快照 → graph proof → host 预检。** Producer 为实际 imported Unchain 的 existing-only snapshot 接口；consumer 为 graph 解析和 PuPu bridge。跨 SQLite 连接/API 边界；canonical 表示是一个读事务内的已校验 journal 事件集和 high-water，consumer 为 frozen typed result，准入 CLOSED；保留现有 execution/generation/coordinator/plan/scope/source/current step/interaction/request cursor 字段，并精确区分快照版本与历史 binding revision。未知字段、错类型/错身份/不可读均在边界拒绝，无其他 execution 降级。若结果形状变更必须版本化并由实际 runtime manifest 宣告；部署身份绑定固定 wheel SHA-256 与 manifest digest。对应 AC-015/016、SEQ-009、原 R04/R05/R06。实施时把最终精确字段集和严格 consumer 测试写回本节。

**BC-009：canonical 接受结果 → host receipt/guard → 回答应用。** Producer 为 Unchain 的原子接受事务；consumer 为 PuPu host 和 runtime 应用入口。跨 repository、SQLite/JSON/guard 持久化边界，准入 VERSIONED；canonical 是按完整问题身份唯一约束的不可变接受记录，host receipt 是投影。候选记录必须覆盖 schema version、operation/receipt identity、owner/execution/generation、计划/step/interaction/request identity、规范化回答或持久引用及摘要、接受 cursor；锁/fence 校验依据必须可追溯。结果精确区分新接受、同一回答重试和拒绝；新增记录版本、字段、未知值均由严格 validator 校验。终态/相反回答拒绝，不回退到无保护的旧写法；已提交后的投影故障可恢复。旧 host 数据由受保护迁移/兼容路径读取，不批量改写；未知新格式的旧 runtime 应拒绝而保留数据。实际 manifest 新特性与 Python/Node/Electron/发布校验同步，固定 artifact pair 方可 rollout。对应 AC-016/017/018、SEQ-010、原 R03/R05/R06/R08。最终 schema、幂等键及错误 wire 必须在实现前冻结并用真实 producer → 独立严格 consumer 验证。

**SEQ-009：快照与 WAL 生命周期。** identity 为 execution/generation/interaction/request cursor；初始为已有 pending。依次覆盖开启读取 → writer 提交/取消 → WAL checkpoint/最后连接关闭 → 预检返回 → 提交回答。观察 snapshot 的一致性、游标和接受事务结果；repeat/retry 不能使用旧 token 盲写，restart 使用真实新进程，删除/reset 后旧 identity 拒绝。纯只读无回滚写；相关部署回退见 SEQ-010。关联 BC-008/009、AC-015/016。

**SEQ-010：接受、投影和应用之间崩溃。** identity 为 owner/execution/generation/interaction/request 与 receipt/operation；初始为未回答或真实旧格式已有 receipt。依次执行只读预检 → 事务接受 → receipt 投影 → guard 关联 → 应用；在每条持久边界前后退出进程，并发相同/不同回答和 cancel。每次检查 canonical/host/guard 三侧身份、状态和 provider/tool 次数；retry/restart/replay 保持相同答案与 receipt；reset/删除后旧 token 拒绝；回退到不兼容 runtime 时入口拒绝且不损坏记录。关联 BC-009、AC-016/017/018。

| AC | 正向与负向通过条件 |
|---|---|
| AC-015（H1） | 正常/冷态快照完整可用；plan/scan/operations 属于同一时点；WAL 无→有→无与有→无期间不产生混合事实；预检不在源目录新建 WAL/SHM/业务文件、不改 DB/journal/guard/receipt；缺库不创建库；不可获取一致快照时明确拒绝 |
| AC-016（H1+H2） | 持有合法快照可提交；快照后另一进程 resolve/cancel 时，本请求不保存冲突回答、不执行 provider；同回答重试得到同一 ID，不同回答仅一个接受；同 ID 不同 generation/owner 必须拒绝 |
| AC-017（H2） | 上表每个中断点均以真实进程退出和新进程恢复验证；已提交答案可找回并补齐，未提交答案不冒充成功，无双 owner、错误答案、终态复活和已完成效果重放 |
| AC-018（兼容） | 真实旧 producer receipt/binding 能合法恢复；冲突旧记录保留并拒绝；真实新 producer 经 Python/Node/Electron 严格 consumer 校验；错字段/版本/能力失败关闭；源码阶段与固定 artifact 阶段证据分别标记 |

保留三条原反例的时序和业务断言。底层实现改动使 `_wal_exists` 等 hook 消失时，把同步点迁到真实读事务/提交边界，并断言并发动作实际发生，禁止通过“hook 没执行”让测试空转转绿。对于返回旧时点的一致快照，测试应验证其准确游标及提交时拒绝过期授权；不能错误要求快照包含读取开始后的所有未来提交。这是在区分快照一致性和提交有效性，不能据此放过旧实现的混合读取或盲写。

### 10.6 交付与验收安排

- **Checkpoint 1：** P0..P4、三个已知反例对应机制、AC-015..018 的源码适用项和原 R01..R08 第一阶段缺口一次提交。材料包含最终事务/快照设计、所有写入者接线、red/green、旧格式与崩溃证据。不能只报告“330 项通过”；有失败为 NO-GO，适用必测缺失为 INCOMPLETE。
- **Checkpoint 2：** P5 与原安装矩阵。固定 artifact pair、真实安装/sidecar 重启及 100 次混合循环通过后才进入已授权的日常启用步骤。没有第三个 checkpoint。

H3 已通过的源码特性校验复用，但不能用旧的 `graph_interaction_lineage_preflight_v1` 特性冒充此次原子接受能力。H4 继续作为既有回归和实际句柄问题跟踪，有限退避的通过不等于根因闭环；本节不把它隐去，也不因此扩展成全库重构。

交给执行模型的指令：按第十节顺序完成内部设计验证、实现和整个已知矩阵，再集中提交原 Checkpoint 1；P1 未证明可行前不要改 host 业务路径，P2 未有原子性证据前不要发布 capability。保持现有数据和 dirty tree，不提交 Git，不提前启用日常 Active；每次新失败回到相应不变量定位，而不是追加一个身份例外。

## 11. H1/H2 实施记录 — 2026-09-05（Claude, Mac）

本节是第十节 Checkpoint 1 材料的实际交付记录。范围：J1/J2/J3 的根因修复与其 red→green 证据。**未做**：P5、固定 artifact/安装矩阵、Windows 真实进程/命名互斥/`PermissionError`（H4）——这些仍需 Codex 在真实 Windows 上验证。

### 11.1 最终 commit 对（两仓分别在隔离 worktree 内提交，未合并 dev、未 push）

| 仓 | 起点（原 wip 提交） | 终点（本轮 HEAD） |
|---|---|---|
| unchain | `3c3b76e` | `7d2b7bb` |
| PuPu | `fe4d4393` | `f1c3c847` |

工作目录：`/Users/red/Desktop/GITRepo/recovery/{unchain,PuPu}`（相邻 sibling worktree，PuPu 用 `/Users/red/Desktop/GITRepo/PuPu/.venv`，`PYTHONPATH` 指向 worktree 的 unchain `src`）。

### 11.2 P0 写入者清单核实结论

- unchain `context_v2.sqlite3` 的全部直连点（`sqlite_v2.py` 自身 + `sqlite_context_compiler_v2.py` / `sqlite_generation_lifecycle_v2.py` / `sqlite_legacy_bootstrap_v2.py` / `sqlite_chat_deletion_v2.py` / `sqlite_context_memory_bootstrap_v2.py` / `sqlite_read_v2.py` 共 16 处历史未受保护点）已全部纳入 `serialized_context_v2_database_access`；`sqlite_curator_query_v2.py`/`sqlite_memory_v2.py`/`sqlite_long_term_memory_v2.py`/`sqlite_curator_review_decision_v2.py` 经模块 docstring 与代码确认"deliberately shares the Context V2 database"——**非 N/A**，同批纳入。
- PuPu 侧 `memory_v2_unchain_active_bridge.py` 两个 admission 读者、`memory_v2_store_boundary.py` 的 schema 分类器、`memory_v2_unchain_ownership_adapter.py` 全部 5 处 `_connect()` 调用点同样纳入。
- **确认 N/A**：PuPu `memory_v2_store.py`（`MemoryV2Store`，`STORE_OWNER_PUPU_LEGACY` 实现）。核实 `memory_v2_runtime.py:718`：`get_memory_v2_runtime()` 在 `configured_owner in {STORE_OWNER_OFF, STORE_OWNER_UNCHAIN}` 时直接返回 `None`，从不构造 `MemoryV2Store`——owner=unchain 时它不会被实例化，互斥由 store-owner admission 保证，不需要参与 `context_v2.sqlite3` 的连接互斥。
- 新增 AST 静态守卫 `tests/context_v2/test_context_v2_connection_lifecycle_inventory.py`：扫描 7 个 unchain 持久化模块，任何 `sqlite3.connect(` 或对 `_connect`/`self._connect()` 的调用若不在 `with serialized_context_v2_database_access(...)` 或 `existing_context_v2_readonly_connection(...)` 块内即失败。已验证：对 `3c3b76e` 原始基线跑该守卫，精确列出全部 16 个未受保护点；对修复后的 HEAD 跑，0 个。

### 11.3 BC-008 / BC-009 最终字段与幂等键

- **BC-008**（快照 → graph proof → host 预检）：producer 是 `JournalSnapshot{execution_id, events: tuple[JournalEvent], high_water}`（`unchain.journal.snapshot`，未变）；新增 consumer 用法是 `prove_graph_interaction_lineage(journal, ..., snapshot=)` 与 `assert_interaction_unresolved(snapshot, attempt=, interaction_id=)` 直接复用调用方已持有的 in-transaction snapshot，而不是各自重新 `capture_snapshot()`。`snapshot.execution_id != journal.execution_id` 时 `prove_graph_interaction_lineage` 显式拒绝（`GraphCheckpointError`）。
- **BC-009**（canonical 接受 → host receipt/guard）：canonical 接受记录**就是**既有 `interaction.resolved` 事件 + 其 `content_ref` artifact，**没有新建事件 schema**。原子性由新增 `BoundExecutionJournal.append_with_artifacts(*, request, artifacts: tuple[PendingArtifact,...], precondition=None)` 保证：同一个 `BEGIN IMMEDIATE` 连接内，先做 exact operation replay 判定（重放命中则跳过 precondition 与 artifact 重新声明，只做 replay 一致性校验），未命中则在同一连接上执行 `precondition(in_transaction_snapshot)`（拒绝则整体回滚、不留痕迹），再写 artifact 行，最后写事件行。
  - 幂等键：事件侧 `operation_id = "operation-" + digest(attempt, event_type, interaction_id)`（不含回答内容，identity-only）；artifact 侧 `operation_id = "artifact.interaction-resolution." + digest(同一 identity)`。两者的 `payload_sha256` 都包含回答内容，因此"同一身份、不同回答"必然在 `operation_row` 重放校验处冲突。
  - 错误 wire：`persist_pupu_unchain_cold_interaction_resolution` 内部 precondition 抛 `InteractionAcceptanceConflict(reason)`（`reason ∈ {not_pending, already_resolved}`）或 `GraphCheckpointError`；`record_interaction_receipt` 用 `_canonical_rejection_reason(exc)` 归一化为 `not_pending / already_resolved / graph_lineage_rejected / already_accepted_different_answer / transient_failure`，只有 `transient_failure` 标 `retryable=True`。
  - **例外口子**：`persist_pupu_unchain_cold_interaction_resolution(..., require_unresolved=False)`——仅 `_reconcile_cancelled_interaction_to_context`（取消清理路径）使用，用于故意用规范 `interaction.resolved` 覆盖/补充一个历史非规范或畸形的旧式 resolution 标记（`test_cold_cancel_supersedes_historical_malformed_generic_resolution` 等既有测试要求这一行为）；该路径仍走同一原子 `append_with_artifacts`，只是跳过"必须仍未解决"这一层校验。
  - Manifest feature：`durable_interaction` 协议新增 `interaction_resolution_atomic_acceptance_v1`，已同步 unchain `runtime_protocol.py` 与 PuPu 全部三个独立 strict consumer（`context_memory_v2_capability.py` / `electron/main/services/unchain/memory_v2_rollout.js` / `scripts/release-qa/unchain-artifact.mjs`）及其各自测试固件（含 `contracts/memory-v2/windows-required-protocol-and-sink-contract.v1.json`、两个 Electron 本地 fixture manifest）。

### 11.4 SEQ-009 / SEQ-010 证据范围

| 单元格 | 状态 | 证据 |
|---|---|---|
| 快照单点一致（同一读事务捕获 plan/scan/operations） | **PASS** | `test_graph_wal_cycle_review.py::test_single_snapshot_cannot_mix_plan_before_and_checkpoint_after_resolution`（沿用原反例，未减弱断言） |
| 预检零文件副作用（existing-only，WAL 存在/不存在两态） | **PASS** | `test_graph_readonly_lock_boundary_review.py` 三条用例（迁移后的跨线程版本 + 新增 WAL-without-SHM 拒绝） |
| 提交前拒绝（precondition 在同一事务内重判） | **PASS** | `test_journal_atomic_append.py::test_precondition_rejection_persists_nothing`、`test_interaction_resolution_atomic_ingress.py::test_precondition_rejects_after_concurrent_resolution` |
| 提交后、host receipt 前中断 → 新调用找回 | **PASS** | `test_memory_v2_acceptance_boundary_review.py::test_pending_recovers_second_interaction_after_host_receipt_interruption`（同进程内新 runtime 实例，非新操作系统进程） |
| artifact 已写、事件未写时中断 → 不占位 | **PASS** | `test_memory_v2_acceptance_boundary_review.py::test_failed_canonical_event_does_not_permanently_claim_unaccepted_answer`（断言 artifact 行确实已在同事务内暂存、失败后 operations 计数不变、换答案可成功） |
| 同答案重放幂等 | **PASS** | `test_journal_atomic_append.py::test_same_answer_replays_and_different_answer_conflicts`、`acceptance boundary` 用例末尾 |
| 不同答案冲突拒绝 | **PASS** | 同上 + `record_interaction_receipt` 二次提交不同答案得 `interaction_canonical_conflict` |
| **真实新操作系统进程冷启动恢复** | **NOT_RUN** | 仅同进程内新 runtime 实例验证；真实 `subprocess`/sidecar 重启未做 |
| **跨线程/跨进程并发提交竞争** | **NOT_RUN** | 未做多线程同时提交同/不同答案的竞态测试 |
| **cancel 与 accept 先后顺序矩阵** | **NOT_RUN** | 未新增专门用例；仅确认现有取消回归套件（`test_memory_v2_unchain_active_host_event_boundary.py` 等）全绿 |
| Windows 命名互斥跨进程 | **NOT_RUN**（Mac 环境） | 非 Windows 分支是进程内 `threading.RLock`，不能验证跨进程互斥 |
| H4 `PermissionError` 根因 | **NOT_RUN** | 未涉及，保留原有限退避 |

上表标 NOT_RUN 的格是本轮 Checkpoint 1 的已知缺口，不是"未测=已通过"。

### 11.5 全量回归结果（本轮 Mac 环境，2026-09-05）

```
Python: 3.12.3 (CPython, /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python)
SQLite: 3.45.1
PYTHONPATH: /Users/red/Desktop/GITRepo/recovery/unchain/src
```

- unchain `pytest tests -q`：**3242 passed, 3 skipped, 5 xfailed**（0 failed）。
- PuPu `unchain_runtime/server` `pytest tests -q`：**2277 passed, 4 skipped, 3556 subtests passed**（0 failed；1 个与本次改动无关的既有后台线程 `PytestUnhandledThreadExceptionWarning`，非失败）。
- PuPu Electron `jest --testMatch="**/electron/tests/**/*.test.cjs"`：**893 passed, 1 failed, 4 skipped**。唯一失败 `windows_vault_provenance.test.cjs::accepts a packaged exact sidecar pair`——已核实对 `fe4d4393`（本轮改动前）跑同一命令**结果相同**，与本次修复无关（该用例需要真实打包的 Windows sidecar artifact，本机 dev checkout 不具备）。
- PuPu `node --test scripts/release-qa/unchain-artifact.test.mjs` 与 `scripts/release-qa/windows-memory-v2-contract-fixture.test.mjs`：全绿。

### 11.6 GitNexus detect-changes（两仓对本轮 commit 范围重新索引后跑 `--scope compare`）

- unchain（`base-ref 3c3b76e`）：27 files / 155 symbols / **60 affected processes / risk: CRITICAL**。符合预期——`sqlite_v2.py` 是共享持久层核心。未见 `partial`/`truncated` 标记。
- PuPu（`base-ref fe4d4393`，即相对于已有 40 文件快照的**增量**）：14 files / 39 symbols / 0 affected processes / risk: LOW。未见 `partial`/`truncated` 标记；0 processes 与 Python 跨模块动态 `from X import Y` 无法被静态图追踪一致（早前 impact 分析已将这类符号标为 `UNKNOWN`，本次改前已用 grep 逐一确认调用者）。

### 11.7 已知限制与后续交接

1. 非 Windows 环境的 `serialized_context_v2_database_access` 是进程内 `threading.RLock`，只验证了跨线程正确性；Windows 命名互斥的跨进程行为、`PermissionError`（H4）根因、PyInstaller 打包拓扑仍需 Codex 在真实 Windows 上验证。
2. `test_failure_after_artifact_rows_rolls_back_the_claim` 等测试确认对象文件（`objects/` 目录）本身**不做 GC**（既有设计），一次被回滚事务写入的孤儿对象文件可能残留，但不会被任何 SQLite 行引用，不影响正确性，与既有 `sqlite_chat_deletion_v2.py` 文档的说明一致。
3. `graph_lineage` 参数目前只在 `_graph_step_follows_bound_interaction_source`（既有的 resume 校验路径，未改）与 `record_interaction_receipt` 尚未接线——当前 J2/J3 红测试覆盖的是简单两步图（无 rebind），`record_interaction_receipt` 提交时依赖的是 `assert_interaction_unresolved` + 既有 operation-identity 冲突机制，已足以通过全部已知反例；把 `GraphLineageLocator` 接进 `record_interaction_receipt` 的提交路径（覆盖 resume/rebind 场景下的成功者校验）留作后续，不在本轮范围内新增。
4. Task 10（SEQ-010 完整崩溃矩阵：真实新进程、并发竞争、cancel 排序）本轮**未做**，见 §11.4 NOT_RUN 行；建议作为 Checkpoint 1 之后、Checkpoint 2 之前的独立后续工作。
