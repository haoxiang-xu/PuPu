---
case_id: P-0000-0007-2026-0815
boundary_revision_set: PENDING_CANDIDATE_FREEZE
updated_at: 2026-08-16T09:06:00-07:00
---

# 方案

## P-0000-0007-2026-0815
- **主 owner**: code-owner-unchain
- **目标结果**: 在 Unchain durable journal 上建立一份 producer 与 consumer 共用一套词汇的 attempt quiescence 契约：合法完成的 graph step attempt 与 orchestration attempt 能通过 generation rebase preflight；crash window（run terminal 已落盘、seal 未写）取得确定的 `recovery_required` 分类而不是静默放行；delegated / shadow orchestration attempt 取得确定分类而不是永久 Blocked；真正等待 interaction 的 graph 继续 Blocked；失败语义由 Unchain 侧结构化 `reason` 产出，供 sidecar 与 renderer 精确分类，从而停止不可恢复状态的热循环重试且不丢用户 outbox。
- **non_goals**: 不修改、重排、删除或重写任何历史 journal 事件行，用户原库全程只读，验证只在隔离副本上进行；不改动 GraphCheckpoint 的 seal-after-terminal 契约本身，包括 `recover()` 冷恢复补 seal 路径与 `tests/context_v2/test_graph_checkpoint.py` 中保护它的既有测试；不改 runtime protocol 版本 lock、不恢复 Git SHA allowlist、不以 source / revision / checkout cleanliness 作 capability admission；不因 rebase 失败丢弃、静默清空或降级用户的 turn-mutation outbox 条目；不为任意 post-terminal 事件开通用口子；不放行真正未完成（等待 interaction）的 graph；不让 rebase validator 取得任何写权限或调用 `recover()`；不修正 GraphCheckpoint 把 `run_max_iterations` 归入 failed 家族这一既有 producer 判断（记为残留项 K-5）；不迁移或重判 P-0000-0004-2026-0815 与 P-0000-0005-2026-0815 的对象。
- **contract_set**: BC-001, BC-002, BC-003, BC-004
- **state character**: STATEFUL
- **实施范围**: **含一处待授权的生产文件改动** —— `src/SERVICEs/bridges/context_v2_bridge.js:53-56` 的契约注释补写（纯注释、零行为，见「SLOT-007 交付正文」§L），由 PLAN_RULING 一并授权；除此之外 PuPu 侧 renderer / 载体 / 反解段的产出全部是测试与契约正文。Unchain 侧新增单一共享词汇模块 `src/unchain/journal/graph_attempt_quiescence.py`（含 seal descriptor 严格 parser 与只读 plan 定位辅助）；改写 `src/unchain/persistence/sqlite_generation_rebase_v2.py` 的 `_assert_no_open_attempt_or_tool` 为分类式 attempt quiescence validator，并为该模块**每一个** raise 点补结构化 `reason`（含 operation / payload / head revision / source generation 四个 conflict 族）；`src/unchain/context/graph_checkpoint.py` 只做词汇常量的定义搬迁（语义逐字不变）；新增真实 producer → 严格 consumer 的契约测试。PuPu sidecar 的 reason→code 三级分类器、有界 recovery 编排与出网 code allowlist 由 SLOT-002 交付（HS-001 已返回）。renderer outbox retry / quarantine 分类、Electron 转发确认、release artifact provenance 三块留空白，由后续串行 HS 交付。
- **owner slots**:
  - SLOT-001 | code-owner-unchain | 共享词汇模块、只读 plan 定位辅助、attempt quiescence 分类 validator、结构化失败 detail、真实 producer→consumer 契约测试与隔离副本重放 | FILLED | LEAD
  - SLOT-002 | code-owner-runtime | sidecar `reason` → error code 三级分类器与七 code 全表、出网 code allowlist、`route_memory_v2.py` message 覆写处置、内联有界 recovery 编排 | FILLED | HS-001
  - SLOT-003 | code-owner-chat-core | terminal 处置分叉（discard / quarantine）、`recovery_required` 独立退避与专属上界、outbox 四字段持久化计数与阶梯恢复、quarantine 用户出口 | FILLED | HS-002
  - SLOT-004 | code-owner-electron | BC-004 载体段确认与 AC-012 位置 (E) 九格；载体侧生产代码零改动，全部产出为测试与契约正文 | FILLED | HS-003
  - SLOT-007 | code-owner-shared-arteries | BC-004 第三跳反解段确认、行为式锚定义务的接受、三层防护形状与 AC-012 位置 (F) 的 G1–G8；唯一生产改动是待授权的契约注释补写 | FILLED | HS-004
  - SLOT-005 | code-owner-runtime | delegated / shadow 不补写 root terminal，接受 orchestration 形态 (b) 为长期合法形态 | FILLED | HS-001
  - SLOT-006 | code-owner-devtools | release artifact provenance：三处覆盖核对结论、AC-014 artifact 段正文、V-1a/V-1b/V-2/V-3/V-4 四条补齐义务与 V-7/V-8 两条协作义务；全部零生产代码改动 | FILLED | HS-005
- **关键步骤与依赖**:
  1. 建立共享词汇模块（BC-002），把 terminal 家族、graph 事件类型、seal↔terminal status 映射、严格 descriptor parser 与只读 plan 定位辅助收敛到一处；`graph_checkpoint.py` 与 rebase validator 改为 import 该模块，语义逐字不变（AC-015、AC-016）。
  2. 为异常族加结构化 `detail`，枚举对本模块每一个 raise 点满射，同时冻结全部既有 reason 的 `str(error)` 逐字不变（AC-009、AC-010）。这一步独立可部署，未升级的 sidecar 行为不变。
  3. 改写 validator 为三类 attempt 的分类判定与四值聚合（AC-001 至 AC-008）。
  4. 补真实 producer → 严格 consumer 的契约测试；`:1464` 分支先取 red-before-green 记录（AC-006）。
  5. 隔离副本重放取证（AC-013）。
  6. sidecar 侧按 SLOT-002 实施三级分类器、code allowlist 与内联有界 recovery（AC-011）；依赖第 1 步的 plan 定位辅助与第 2 步的枚举。
  7. 串行交棒 SLOT-003（chat-core）、SLOT-004（electron）、SLOT-006（devtools）。
  8. exact deployed pair 证据与 rollout（AC-014、SEQ-006、SEQ-007）。
  依赖顺序：1 → 2 → 3 → 4 可在 Unchain 内闭合；6 严格依赖 1 与 2；5 需要 Chief 授权提供用户库只读副本；7/8 依赖交棒返回。
- **关键实施约束**: validator 保持严格只读，运行在 `rebase()` 的 `BEGIN IMMEDIATE` 事务内、任何写入之前（现状 `sqlite_generation_rebase_v2.py:1670` 调用 `_assert_durable_preflight`，其后才是第一处写入），绝不调用 `GraphCheckpointService.recover()` 或任何 journal append —— 那会在同一数据库上开第二条写路径并与本事务互锁；`GenerationRebaseKind.CREATE` 继续完全跳过 preflight（:1312-1313），本案不改；不引入 feature flag 关闭新分类逻辑（关掉就等于保留缺陷与既有的 crash-window 误放行），能力只在 runtime protocol manifest 中作遥测与 sidecar 分类器选择，绝不参与 admission；不新增 SQLite schema、不做数据迁移。
- **风险**:
  - R1 收紧风险：orchestration attempt 的新校验会把"root terminal 已写但某个 step seal 缺失"从今天的静默通过改判为 `recovery_required`。这是刻意修正误放行，但确实是行为变化，必须由 AC-007 覆盖。
  - R2 放宽风险：delegated / shadow 的 `graph.execution.completed`-last 通过规则若写宽，等于把任意 `graph.execution.completed` 当 terminal。缓解：必须同时满足零 run terminal、plan 可解析、全部 plan step 已合法 sealed-completed、`final_step_index` 等于末位 index、seal 为组内最后一条（AC-007）。
  - R3 死角：graph step attempt 内出现多于一条 terminal 候选（canonical ∪ max_iterations）时，producer 的 `_terminal_after_start`（`graph_checkpoint.py:1127`）自己就会拒绝，`recover()` 也无法补 seal。此时若判 `recovery_required` 会造成新的无限循环，故判为不可恢复的 `UNAVAILABLE`（AC-005）。
  - R4 部署顺序：Unchain 先行、sidecar 未升级时，新增 reason 会落入既有的 `context_v2_rebase_in_progress` 或 `context_v2_rebase_unavailable` 分支（AC-010）；反方向（sidecar 先行、unchain 回滚 wheel）由 SLOT-002 的三级分类器降级到 L2/L3 覆盖（SEQ-005）。两个方向都不更差，但热循环在 renderer 侧修好之前不会完全消失。
  - R5 取证依赖：AC-013 需要用户库的只读副本，涉及用户内容，须 Chief 明确授权后由本 owner 在隔离目录执行。
  - R6 失败路径成为写者：采纳 SLOT-002 的内联 recovery 后，`rebase_session` 今天"任何失败零写入"的不变量在且仅在 `recovery_required` 路径上被打破（至多一条 seal + 一个 artifact）。缓解：不变量改写为可验收形式并进入 AC-011 子例 8；unchain 侧 `SQLiteGenerationRebaseV2Service.rebase()` 自身的零写入不变量**不变**（AC-002）。**退路（新 endpoint）的完整代价（含 SLOT-003 的 M-15 与 SLOT-004 的 U-16 实测修正）**：一、**electron 侧是"加三格、零返修"**（U-16，由载体 owner 实测给出）—— 新 channel 的双侧分类格、preload bridge 的 allowlist 重建格、recovery endpoint 失败码的 E1/E8/E9 同形三格；AC-012 位置 (E) 既有九格**全部继续有效、无一需重写**。此处刻意收窄了 PS-003 原文"从确认透传升级为新增 channel + preload bridge"所暗示的整段重做；二、恢复的触发者从 sidecar 变为 renderer，SLOT-003 已交付的 `recovery_required` 退避与上界**必须返修**（chat-core 侧代价不受 U-16 影响，仍成立） —— 它会从"退避重放同一个 rebase 请求"变成"先调 recovery endpoint、再重放，并对 recovery 调用自身另建有界上限与失败分类"，需要 `replayAttempts` / `recoveryRequiredAttempts` 之外的第三个计数，AC-012 子例 5 需重写；三、因此该取舍**同时影响 SLOT-003 与 SLOT-004**，若 Chief 选退路，需在同一次裁定中安排 code-owner-chat-core 的第二次交棒。宜在 SLOT-004 交棒之前定下。
  - R8 锚定正则陷阱（**经 SLOT-007 实测扩面并定界，M-25 / M-26**）：BC-004 第三跳的反解正则若被后来者写成任何位置依赖的形式，在 Electron 包裹形式下恒返回 null。**爆炸半径实为 5 个 call site / 4 个文件 / 3 个 owner**（本案 rebase 路径只占 2 个）：`use_chat_stream.js:4072`（本案路径）与 `:3979`（`getSessionHead` 失败码，chat-core）、`memory_v2_journal_reload.js:274` 与 `memory_v2_pending_reviews.js:180`（chat-bubble）、`memory_v2_tree_state.js:106/114/445`（shared-arteries 残余条款）。**两项此前未记载的退化**：其一，**既有九个 terminal-discard code 一并失效**，从"立即删除条目"退化为"12 次无谓重试后 paused"，陈旧条目开始堆积；其二，`memory_v2_tree_state.js:114` 的 `=== STORE_DISABLED_CODE` 严格相等在 null 下恒 false，使一个**关着**的 store 被渲染成 **ERROR** 而不是 DISABLED。**定界（同样重要，防止日后被误判为 P0 数据丢失）**：两个 rebase call site 均为 `parseContextV2ErrorCode(error) || "context_v2_failed"`，而 `context_v2_failed` **不在** `TERMINAL_REBASE_ERROR_CODES` 的九个 conflict code 内，故解析失败 → 非 terminal → 有界重试 → `paused`，**frozen payload 被保留**。R8 是**语义退化 + 每条至多 12 次无谓重试（60s 退避上限），不是数据丢失**。**"今天没有任何测试会因此变红"须补一句**：存在一个**看上去覆盖了该解析器、而在回归下仍保持绿**的测试 —— `trace_chain.memory_v2.test.js:23-26, :101-104` 以 `jest.mock` 替换整个 bridge 并在工厂内就地重实现一份**正确的未锚定**正则（因 CRA `resetMocks: true` 在 `beforeEach` 再次重建）；该 mock 本身是正确做法，问题只在于按函数名 grep 审计覆盖会得到**假阳性**，**chat-bubble 边界内无需任何动作**，位置 (F) 的 G1–G8 落地后该盲区即闭合。缓解：BC-004 第三跳义务已按行为重述，位置 (E) 的 E1 与位置 (F) 的 G1–G8 双侧取证，其中 G2/G3/G8 的 red-before-green 把 R8 从推演升级为实测。
  - R9 既有三槽漂移（报告项，不在本案 write_set 内；**口径与归属经 devtools 复核修正，M-31**）：载体 owner 对 `electron/tests/**` 做三槽全量审计（更正一次方法学假阳性后 —— shim 文件名不必与 body 同名，须解析 `require()` 实际目标），在其口径下为 43 body / CRA 可达 40 / 缺 S3 **3 处**：`main/chat_storage_lifecycle`、`main/ollama_service`、`main/settings_quit_coordinator`。**口径说明**：43 = 全量 49 减去合理排除的 6 个 `test-api/`；若按 repo 全量计，缺 CRA shim 为 **9 处**（3 个 `main/` + 6 个 `test-api/`）。**归属修正**：HS-003 称「修它会把 electron 的 write_set 从零扩到 3 个文件」**是错的** —— 补 S3 的写入点是 `src/electron/tests/main/*.test.js`，属 `pupu:src/electron/**` = **devtools** 边界，不是 electron 的；日后为它立案须找 devtools。**非发布风险**（CI 与本地门同时跑 `test:frontend` 与 `test:electron`，这几处仍被后者执行，真实损失只在开发回路），两位 owner 均同意本案不修，只显名。
  - R7 conflict 族补 reason 的一处静默重分类：`generation source revision is already imported`（:1694）今天因 message 含 `revision` 被关键词分类器判为 `context_v2_revision_conflict`，按语义它属 source generation 族。新分类器会把它归到更准确的 code。两个 code 今天都在 renderer 的 `TERMINAL_REBASE_ERROR_CODES` 内，用户可见行为不变；此处记录以免被当作回归。
- **可逆性**: 全部改动是纯读逻辑与异常字段，无 schema、无迁移、无持久化格式变化；回滚 = 回退 wheel。既有 journal 行不被读之外的任何方式触碰，回滚后旧 validator 对同一 journal 的判定与今天完全一致。
- **回滚/补救方式**: 以 wheel artifact 为单位回滚 Unchain；sidecar / renderer 的新 code 分支在未升级侧自然退化为既有分类（BC-003 / BC-004 的 unknown input behavior 已规定保守回退）；任何阶段失败都不得清空 outbox，frozen payload 保留待重放；rollout 结论在适用状态单元格未跑完前只能是 `INCOMPLETE`，保持 shadow / off。
- **验收标准**:
  - AC-001 | 真实 producer 正常 graph step 放行：用真实 `SQLiteContextV2Store` + `BoundExecutionJournal` + `CanonicalSemanticEventProjector` + `DurableEventSink` + `GraphCheckpointService` 生成 `derived handoff → graph.step.started → … → final_message → run_completed → graph.step.completed` 的 journal，同一个 store 上 `SQLiteGenerationRebaseV2Service.rebase()` 的 EDIT / REGENERATE preflight 通过并恰好产出一次 receipt；禁止用手工 `_append_event` 构造 seal 或 terminal
  - AC-002 | crash window 不放行：真实 producer 写到 `run_completed` 后不调用 `complete_step`，`SQLiteGenerationRebaseV2Service.rebase()` 返回 `recovery_required` 分类（reason `graph_step_seal_missing`），数据库零写入（events、host_generation_records、legacy_bootstrap_manifests、host_generation_attempt_bindings 行数与内容前后一致），且 validator 在整个调用中未产生任何 append。本 AC 的零写入范围**精确限于 unchain 的 `rebase()` 调用**；sidecar `rebase_session` 在采纳内联 recovery 后的写入不变量另由 AC-011 子例 8 约束，二者不冲突
  - AC-003 | 冷重启补 seal 后同一 frozen 请求成功：连接与服务实例冷重开后 `recover(plan)` 恰好追加一条 `graph.step.completed`，随后用同一个 frozen `GenerationRebaseRequest`（同 operation_id、同 payload_sha256、同 expected_head_revision）重放成功；第三次重放为幂等，不新增 generation、不改 head revision、不产生第二份 receipt、不新增 events
  - AC-004 | seal 完整性负向矩阵，逐项独立 reason、fail closed、零写入：duplicate seal；foreign seal（seal payload 的 `step.attempt` 与事件自身 attempt 不一致，或 seal 落在没有 `graph.step.started` 的 attempt）；`terminal_cursor` 与 run terminal 的 `(store_seq, event_id)` 不一致；`execution_event_range.end` 不等于 `terminal_cursor`；`execution_event_range.start` 不等于 `graph.step.started` 的 cursor；`graph_plan_id` / `graph_scope_id` / step `index` / `node_id` / `attempt` 任一不一致；terminal 与 seal 之间存在任何其它事件；seal 之后存在任何事件；seal payload 缺必需 key 或含未知 key
  - AC-005 | terminal 家族与 seal status 一致性：`graph.step.completed` 只接受 completed 家族 terminal，`graph.step.failed` 只接受 failed 家族，`graph.step.cancelled` 只接受 cancelled 家族，错配 fail closed。`run_max_iterations` 规则：普通 attempt 在零 canonical terminal 且组内最后一条为 `run_max_iterations`（含点号变体）时视为 terminal-equivalent 放行；`run_max_iterations` 之后仍有事件且存在唯一 canonical terminal 时按 canonical terminal 判定，与今天逐字一致；graph step attempt 内 terminal 候选多于一条时判 `graph_step_terminal_ambiguous` 的 UNAVAILABLE，与 producer 自身的拒绝一致
  - AC-006 | 普通 attempt 语义不回归且补齐盲区：terminal-last 通过；terminal 非最后一条仍 `attempt_continued_after_terminal`；零 terminal 仍 Blocked；重复 terminal 仍 fail closed；与 graph step 同 generation 的 subagent / nested child attempt 仍按普通 attempt 规则判定。`sqlite_generation_rebase_v2.py:1464` 分支必须保存 red-before-green 记录（现两仓零覆盖），且 `tests/context_v2/test_sqlite_generation_rebase_v2.py` 既有全部用例不改动并保持绿
  - AC-007 | orchestration attempt 分类确定：(a) 授权 root graph（`graph.execution.completed` → `final_message` → `run_completed` 且 terminal 为最后一条）通过；(b) delegated / shadow（零 run terminal、`graph.execution.completed` 为组内最后一条）仅当 plan 可解析、全部 plan step attempt 均已合法 sealed-completed、`final_step_index` 等于末位 index 时通过，任一不满足即 fail closed；(c) 仅有 `graph.execution.admitted` 且存在未 terminal 或未 sealed 的 step → Blocked；(d) 全部 step 已 sealed-completed 但 orchestration 既无 `graph.execution.completed` 也无 root terminal → `graph_execution_seal_missing` 的 recovery_required；(e) 存在 `graph.step.failed` / `graph.step.cancelled` seal 的图，其 orchestration 组以 `graph.execution.admitted` 结尾且不存在更高 index 的 step 事件 → 判定为 durably terminal 并通过，不永久 Blocked；(f) **父 run 活跃性由聚合承担**：构造一个 (b) 形态的 delegated 图，同时让同 execution 同 generation 内的父 run attempt 处于无 terminal 状态，整体 preflight 必须为 Blocked —— 证明 (b) 放行 orchestration 组不会放行一个仍在运行的 chat，且该保证来自聚合优先级与 generation 范围的扫描，不依赖任何 PuPu 侧的 attempt 编号约定
  - AC-008 | 等待 interaction 的 graph 永不放行：request 无 resolution；resolution 已写但 `graph.step.resume.admitted` 未写；resume 已 admitted 但无 run terminal；同一 execution 的第二次 interaction 处于上述任一状态 —— 四格全部 Blocked，均不得返回 pass 或 recovery_required
  - AC-009 | 结构化失败语义：异常族携带 `detail`，canonical 形状为 CLOSED exact key set `{schema, reason, subject}`；`reason` 取自封闭枚举；`subject` 只含 identity 形状的有界字段（attempt_id、call_id、interaction_id、step index、event_type、cursor 的 store_seq 与 event_id），上限为**每个字符串值 ≤ 256 字符、键数 ≤ 12、canonical JSON 序列化后 ≤ 2048 字节**；不含 message 文本、用户内容、artifact bytes 或 secret；未知 reason 或超限 subject 在构造点 fail closed。另有一条**满射断言**：以反射枚举 `sqlite_generation_rebase_v2.py` 模块内全部 `raise GenerationRebase*` 点，证明每一个都携带 `detail` 且其 reason 属于封闭枚举，不存在无 reason 的 raise 点 —— 这是 sidecar 得以彻底删除 `str(error).casefold()` 关键词分类的充分条件
  - AC-010 | 未升级 consumer 向后兼容：全部既有 reason 的 `str(error)` 与改动前逐字节相同；用改动前的 `_translate_rebase_error` 关键词分类器对每个既有 reason 回放，得到的 code 与今天完全一致；新增 reason 在未升级分类器下只落入 `context_v2_rebase_in_progress` 或 `context_v2_rebase_unavailable`，不落入任何会丢弃 frozen outbox 的分支
  - AC-011 | sidecar `reason` → error code 映射与有界 recovery 编排（SLOT-002 交付，正文见「SLOT-002 交付正文」§A）：取证位置 `unchain_runtime/server/tests/test_memory_v2_unchain_generation_api.py` 与 `tests/test_route_memory_v2.py`，以 `PYTHONPATH` 指向 AC-014 冻结的那一个 wheel 的安装路径执行 `python -m pytest tests/ -q --tb=short`；全部用例跑在真实 `SQLiteContextV2Store` + 真实 `SQLiteGenerationRebaseV2Service` 上，graph 事件由真实 `GraphCheckpointService` 写入，禁止手工伪造 seal 或 terminal，断言 `code` / `status_code` / `retryable` 三者精确值且 producer 与 consumer 不共享宽松 helper。八个子例：1 枚举反射驱动的逐 reason 正向穷举（任一枚举成员未配即失败）；2 未知 reason 落回 L2 阶梯且发结构化 warning；3 错 schema 整体忽略 detail；4 缺 detail 时与改动前逐字相同（冻结快照表比对）；5 detail 形状五种违规全部落回阶梯、零异常逃逸；**6 出网信封封闭性与不泄漏（BC-004 producer 侧自证，取证位置 `tests/test_route_memory_v2.py`，用 Flask 测试客户端对 `POST /context/v2/session/rebase` 取真实响应）—— 正向对七个 code 各取一个真实触发路径，断言顶层 key set 精确为 `{"error"}`、`error` 的 key set 精确为 `{code, message, retryable}`（仅 `context_v2_revision_conflict` 与 `context_v2_generation_conflict` 额外出现 `expected_revision` 与 `actual_revision`）、`code` 逐字等于表值且属封闭集合 `CONTEXT_V2_REBASE_ERROR_CODES`、HTTP status 逐字等于表值、`message` 逐字等于常量 `"Unchain-owned generation request failed"`；负向三项 —— 表外 code 被降级为 `context_v2_rebase_unavailable`（503）并记 error 日志且原始 code 字符串不出现在响应体任何位置，对每个正向用例断言响应体全文不出现 reason 枚举值、`subject` 的任何字段名或取值、attempt_id / event_id / interaction_id / call_id 的任何取值、unchain 原始异常 message 的任何子串，以及信封 key set 与 `_error_response` 定义一致使任何新增字段令断言失败；**该子例另须把七个 code 的真实响应写出为 `[{code, http_status, message}]` 的 fixture 文件，**并将该文件提交入库**（U-14 定案：renderer 的 jest 与 electron 的 jest 都不会跑 pytest，不入库会使 `test:frontend` 与 `test:electron` 在未跑过 pytest 的环境里变红；入库后由本子例负责重新生成并 diff 校验，diff 不一致即失败，从而既保证真实性又保证可离线消费），供 AC-012 位置 (D) 与位置 (E) 只读消费 —— 这是 U-8 的定案：由已经在真实 Flask 客户端取到这些响应的这条 pytest 顺带产出，是零增量，且是唯一能让 renderer 侧"真实 producer → 严格 consumer"成立的来源；renderer 侧不得手抄该集合**）；7 有界 recovery 编排八格（7a 首次 crash window 精确 delta、7b 立即重复幂等、7c 同 chat 第二个独立 crash window、7d 不收敛第二次转 `context_v2_rebase_journal_incompatible` 且无第三次恢复、7e 冷重启同结论、7f live-execution 闸：把该 `execution_id` 注册为活跃后触发 rebase，断言**返回 `context_v2_rebase_in_progress`（409, retryable）且零写入**；**注销 / 释放后同一 frozen 请求恢复成功** —— 两项断言同时锁住码与瞬时性；只断言零写入无法区分「闸拒绝后可重试并自愈」与「闸拒绝即永久不兼容」，对两种相反实现都会通过、7g sanitizer parity 逐字节相同、7h fail-closed ingress 从未被调用）；8 写入不变量 —— 除 `recovery_required` 路径外每个失败用例 `_counts(store)` 前后完全相等，`recovery_required` 路径至多追加一条 seal 与一个 artifact，且重放仍失败时 `host_generation_records` / `legacy_bootstrap_manifests` / `host_generation_attempt_bindings` 与 head revision 逐行不变。子例 1、4、7d 三项必须保存 red-before-green 记录
  - AC-012 | renderer 分类、跨重挂载持久化的重试上界、quarantine 处置与传输保真（SLOT-003 交付，正文见「SLOT-003 交付正文」§C；载体段落待 SLOT-004）：**取证位置** (A) `src/SERVICEs/turn_mutation_outbox.test.js` schema / 迁移 / clamp / CAS；(B) `src/PAGEs/chat/hooks/context_v2_turn_mutation.test.js` 纯分类与决策表、封闭集合穷举、divergence；(C) 新增 `src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_retry.test.js` render 级计时器 / 重挂载 / 锁 / 用户动作；(D) producer 信封 fixture `src/PAGEs/chat/hooks/__fixtures__/context_v2_rebase_error_envelopes.json`；(E) Electron 载体段，追加于 `electron/tests/main/context_v2_service.test.cjs` 的新 describe `"context v2 rebase error transport — carrier fidelity"`（E1–E4、E6–E9）与 `electron/tests/main/ipc_channels.test.cjs` 的一个新 test（E5），**零新增双胞胎槽位**。**三槽规则**（本仓实为三槽而非两槽）：S1 `electron/tests/<area>/X.test.cjs` 权威 body，由 `npm run test:electron` 收集；S2 `electron/tests/<area>/X.test.js` 同目录 shim，实测**无人收集**；S3 `src/electron/tests/<area>/X.test.js` CRA shim，由 `react-scripts test` 经固定 `roots=<rootDir>/src` 收集 —— 真正承载"不静默失效"的是 S1↔S3。本项涉及的两组三槽今天已齐备且因采用追加而无需改动。**执行与同步验证四步**：(1) `npm run test:electron` 且总用例数相对改动前**严格增加**预期格数，不接受"全绿"作为已运行的证据；(2) `CI=true npx react-scripts test --watchAll=false --listTests | grep -c "/src/electron/tests/"` 的值必须**等于 40**。**该值是判定阈而非记录值（M-30）**：实施后若不等于 40，即判定为需要新增或改动 S3 CRA shim，而 `src/electron/tests/**` 属 **devtools** 边界、不在 electron owner 手上，**实施必须就地停止并按程序向 devtools 补一棒，不得由实施者直接在该目录下写文件**。常量 40 已由两种互不依赖的方法交叉验证（`--listTests | grep -c` 数 CRA 实际收集面、`find src/electron/tests -name '*.test.js' | wc -l` 数文件系统），可直接冻结；(3) `npm run test:frontend -- --passWithNoTests -t "carrier fidelity"` **必须匹配到并跑过**，这是唯一能证明 S3 链路把新代码带进 CRA runner 的一步；(4) 若改用独立文件方案，另断言两个 shim 的内容逐字等于其规定的单行且 require 目标存在。**执行方式** `npx react-scripts test --watchAll=false`，不得直接 `npx jest`。**producer 真实性**：位置 (D) 由 AC-011 子例 6 的 pytest 在真实 Flask 测试客户端取到七个 code 的真实响应后写出，renderer 只读消费，两侧不共享任何 helper。**正向八子例**（逐格映射 SEQ-004 七个 REQUIRED 单元格）：1 首次替换成功且四字段全程 `0/0/""/""`；2 已带 `v2Ack` 的条目触发两次替换而 `rebaseSession` 零次调用；3 同一 chat 第二次 mutation 从 0 起算不继承记账；4 非 terminal code 连续失败时 `replayAttempts` 精确 +1 且 `delayMs` 逐项等于 `min(60_000, 250·2^(n-1))`，第 12 次后 `paused` 且此后任意推进假时钟不再产生请求，payload 深比较不变；5 `recovery_required` 第一次 `delayMs===250`、第二次 `750` 且到界 `quarantined`、无第三次调用、共享计数同步递增；6 在 `replayAttempts===5` 时卸载重挂载并重读 localStorage，首次替换须延迟 `delay(5)===4000ms` 而非立即、计数从 5 续、跨两次挂载总调用 ≤ 12；7 对 `paused` 与 `quarantined` 各一条触发用户 Retry 使两计数归零并恰一次新尝试，且断言重挂载 / 切换 chat / version 递增均不重置；8 双向 schema skew，旧条目归一为 `0/0/""/""` 且其余字段逐字不变，新条目交给旧 allowlist 语义时四字段被丢弃而 payload / ack / mirror 深比较不变且 `available===true`。**负向六子例**：9 fingerprint 仍等于 `originalFingerprint` 时收到 `context_v2_rebase_journal_incompatible`，条目仍在、payload 逐字节相同、`quarantined`、其后无调用，foreground 三处与 recovery 各一格共四格；10 九个既有 code 的处置全部为 `discard` 且既有 `test.each` 不修改并保持绿；11 对 fixture 中每个 code 断言决策函数返回四个 action 之一且非缺省分支，fixture 出现未显式归类的 code 即失败，反向一个不在 fixture 中的 code 必须走 retry 到共享上界转 `paused` 而不得被 quarantine 或 discard；12 四个计数字段取各类非法值时 `normalizeTurnMutationOutboxEntry` 不返回 null、`available===true`、无关 chat 不被阻塞、数值 clamp 到 `[0, 上界]`；13 渲染输出中出现的字符串逐字属于静态文案集合，且常量 message、任何 `[code]` 前缀原文、任何 attempt_id / event_id / generation_id 取值均不出现；14 带 `v2Ack` 且 mirror pending 的条目 `canDiscard===false` 且 `removeTurnMutation` 零调用。**子例 6、9、12 必须保存 red-before-green 记录**。**位置 (E) 的九格（SLOT-004 交付，编号刻意用 `E1`–`E9` 而不续接"子例 15+"，以免"子例"一词在同一 AC 内指两类对象并扰动 SEQ-004 已冻结的 cell 到子例映射；同样不新增 AC 编号）**：**严格 consumer 规则（本规则仅适用于位置 (E) 的载体格，M-27）** —— 反解正则必须是写在 electron 测试文件内的**就地字面量** `/\[([a-z0-9_]+)\]\s/`，**不得** import `src/SERVICEs/bridges/context_v2_bridge.js`，并在注释中标注镜像来源行号；不 import 任何 `src/**` 生产代码。**该禁令的立法意图只针对载体**：位置 (E) 的被测对象是载体，若 import 反解段实现就成了 producer 与 consumer 共用一份实现互证。**位置 (F) 适用相反规则**（见该段），因为那里的被测对象**就是**反解段本身，禁 import 会使测试与生产代码彻底脱钩、防护归零。message 断言一律 `toBe` 全等，禁 `toContain` / `toMatch` / snapshot。**E1** 两个新 code 各一格端到端，六项断言：rejection 是 `Error`；`rejection.code` 逐字等于该 code；`rejection.message` 逐字等于 `` `[${code}] context v2 request failed` ``；就地正则对其第一个捕获组逐字等于该 code；对 Electron **包裹形式**（本仓已断言的 `` `Error invoking remote method '<channel>': [<code>] <message>` `` 与 HS-003 观察到的含 `Error: ` 变体，两种都要过）反解仍得同一 code；信封中 `message` / `retryable` / `expected_revision` / `actual_revision` 的任何取值都不出现在 `rejection.message` 中。**E2** producer 真实性：E1 与全表输入**不得手抄**，逐条读取位置 (D) fixture 并对每个 `{code, http_status, message}` 驱动一次载体作 E1 六项断言；**fixture 缺失、为空数组或缺任一必需 key 时必须 FAIL 而非 skip**；另断言 fixture 的 code 集合与七 code 表加出网 allowlist 的并集一致。**E3** 字符集与长度属性锁：`"a"` / `"0"` / `"_"` / `"a0_"` / 64 字符 / 两个新 code 各一格，64 字符格是硬边界格证明载体不截断；追加 65 字符格断言载体同样逐字透传，并明确标注为**遥测格而非准入格**（`{1,64}` 是 producer 义务，载体按契约恰恰不得守门）。**E4** 分隔符结构锁：`startsWith(\`[${code}] \`)`、`indexOf("]") === code.length + 1`、`charAt(code.length + 2) === " "`，使对 `service.js:185-189` 模板的任何改写立刻变红。**E5** IPC handler 不改写（落 `ipc_channels.test.cjs`）：rejection 与注入的是**同一个 Error 实例**（`toBe`）、message 逐字节相同、`console.warn` 恰一次且含方法名与 code、不含 message 哨兵串或 payload 任何取值。**E6** 表外 code 不被载体拦截或改写（对"载体不得做 allowlist"的正面证明）。**E7** 非法字符集 fail-closed：`"CONTEXT_V2_UPPER"` / `"has space"` / `"has-dash"` 三格断言载体逐字透传且严格正则返回 **null**（落未知 code 进 `paused`，而非被误解析为某个已知 code）；追加 `"x] [context_v2_rebase_journal_incompatible"` 一格断言反解得 `"x"` —— **`]` 夹带无法把条目伪造成 quarantine**。**E8** 缺 code 的 409 四格降级为 `context_v2_failed`。**E9** 异常 body 四格降级且 `bodyText.slice(0, 200)` 的哨兵不泄漏。**E1 两格、E6、E7 必须保存 red-before-green 记录**（取红方法：E1 注入 `code.toUpperCase()`、E6 注入临时 allowlist、E7 注入字符替换；E3 与 E9 的取红为建议项）。**本段明示不保证**：不保证封闭性（守门在 AC-011 子例 6 的出网 allowlist）、不保证 `{1,64}`（producer 义务）、不覆盖 Electron 自身的 IPC 包装（E1 的包裹格是对已知形式的建模断言，真实证据只能来自 e2e）、不覆盖第三跳反解器的真实实现（属位置 (F)）。**位置 (F) · 第三跳反解段（SLOT-007 交付，八格，编号 `G1`–`G8`，同样不新增 AC 编号）**：取证位置 `src/SERVICEs/bridges/context_v2_bridge.test.js` 新增 `describe("BC-004 third hop — error code recovery across the Electron IPC wrapper")`；该文件在 `src/**` 内由 `react-scripts test` 收集，**不涉双胞胎规则**（那是 `electron/**` 专有）；执行 `npx react-scripts test --watchAll=false --testPathPattern context_v2_bridge`，不得直接 `npx jest`；同步验证一步 —— `npm run test:frontend` 总用例数相对改动前**严格增加 8**，不接受"全绿"为已运行证据。**严格 consumer 规则在本位置的相反适用（M-27）**：G1–G7 **必须调用真实导出的 `parseContextV2ErrorCode`**，禁止在测试内重实现正则 —— 本位置的被测对象就是该解析器；就地字面量只在 G8 作为源码文本的期望值出现。**producer 真实性**改由「G2/G3 的输入 code 逐条读自位置 (D) fixture、不手抄」保证（与 E2 同法）。**G1** 裸形式回归锁：对两个新 code 与至少一个既有 terminal code 断言逐字还原；**本格在锚定回归下仍绿 —— 这正是它的价值**，它与 G2/G3 的对比构成 R8 的直接经验证据。**G2** 包裹变体 A（`Error invoking remote method '<channel>': [<code>] <message>`），由 fixture 驱动逐条断言；**fixture 缺失、非数组、为空或任一元素缺 `code` 键时必须 FAIL 而非 skip**。**G3** 包裹变体 B（含 `Error: ` 前缀），同一 fixture 驱动；G2 与 G3 合起来覆盖两种记载变体，**不硬编码任一种**。**G4** 首 token 胜出与 `]` 夹带不可伪造：`[x] [context_v2_rebase_journal_incompatible] …` → `toBe("x")` 且显式 `.not.toBe` 该 quarantine code；另镜像 settings bridge 已锁形态，后出现的方括号数字段永不覆盖首 token。本格是 E7 走私格在**真实决策点**上的对应格。**G5** 非法字符集 fail-closed：三个 token × 裸/包裹两形式共六断言全部 `toBeNull()`。**G6** 分隔符承重性：`"…: plain wrapped failure"` → null、`"no code here"` → null、**`"[context_v2_failed]"`（无尾随空白）→ null**；**本格与 E4 是同一不变量的两半** —— E4 锁载体恒发射含空格的 `` `[code] ` ``，G6 锁解析器要求该空格，两格同生共死。**G7** 防御性输入（`null` / `undefined` / `{}` / `{message:123}` / 空 message）全部 null。**G8** 源码形状守卫：`fs.readFileSync` 断言源码不出现锚定式方括号解析，且正则字面量赋值恰一次并逐字为 `/\[([a-z0-9_]+)\]\s/`；失败信息**必须逐字含** `BC-004`、`P-0000-0007-2026-0815` 与行为式义务原文，使失败者被导向契约而非导向改掉测试。形制沿用 `shell_background_guard.test.js`。**G2、G3、G4、G8 必须保存 red-before-green 记录**，统一取红方法为把生产正则临时改为 `/^\[([a-z0-9_]+)\]\s/` 并记录 **G1 保持绿而 G2/G3/G8 变红** —— **该 red 记录本身即本案对 R8 的直接经验证据**，现场证明今日覆盖对该退化完全盲，把 R8 从推演升级为实测。**关于 G8 的诚实定性**：它**不增加检出能力**（G2/G3 已覆盖全部六种改法），买的是三样东西 —— 失败信息可指名契约而非让人顺手改测试、对尚未写出的第七种位置依赖写法仍会红、使"这行不能随便动"成为源码级事实；其代价是**脆性**（任何对该字面量的改动都会红），而**该脆性正是机制本身**：它是一道理解闸不是回归闸。**G1、G4、G5、G6、G7、G8 六格只依赖今日已存在的实现，立刻可跑；仅 G2、G3 待 fixture**
  - AC-013 | 用户库隔离副本重放：只对副本操作，原库以只读模式打开并以 mtime 与文件 SHA-256 前后比对证明未变；副本 `PRAGMA quick_check` 为 ok、`PRAGMA foreign_key_check` 零行；重放前后 events 表全部行的 `(store_seq, event_id, event_type, attempt_id, payload)` 字节不变；三个真实 graph 的分类与预期一致，即两条合法 post-terminal `graph.step.completed` 对应的 attempt 放行、等待 interaction 的图保持 Blocked
  - AC-014 | exact deployed pair：一次构建产出的单个 unchain wheel 的 SHA-256 在契约矩阵、package smoke 与 release report 三处逐字相同；runtime protocol manifest digest 在同一 pair 下一致；PuPu candidate revision 固定；任一不一致时结论为 INCOMPLETE 而非 GO；不得以可变的相邻 checkout 顶替该 artifact。运行时侧取证（SLOT-002 交付）：manifest 只取自实际 import 的 `unchain.runtime.runtime_protocol.runtime_protocol_manifest()`，由 sidecar 既有的独立重算校验把关，运行中的读数取自 `GET /health` 的 `context_memory_v2.runtime_protocol_manifest.manifest_digest`；同一响应中的 `unchain_revision` 与 `unchain_runtime_source` 只作遥测，取证脚本须有一条断言证明它们未参与任何 pass/fail、capability 或 admission 判据。AC-011 的 pytest 增加一条 session 级断言：被测进程内的 manifest digest 等于 evidence 文件中的 `runtime_manifest.manifest_digest`。**artifact 侧（devtools 段，SLOT-006 交付）**：**A 一次构建全程复用同一 wheel 的四层证明** —— workflow 静态断言 `build-unchain-artifact.mjs` 与 `repository: haoxiang-xu/unchain` 各恰出现一次；构建器拒绝增量输出与 dirty 源；evidence 的 `{wheel_count:1, built_once:true}` 每次经 `validateEvidenceShape` 强校验；package job 以 `--bytes-only true` 重算下载物字节。**B 三处逐字核对** —— 契约矩阵（观测者 `run-context-v2-contract.mjs` / `run-run-bundle-contract.mjs`，观测量为重算的 wheel 字节 sha 与**真实 import 回来的** manifest digest）、package smoke（观测者 `package-sidecar-smoke.mjs`，观测量为重算的下载物字节 sha 与 **`/health` 投影的** manifest digest）、release report（观测者 `reporting.mjs`）。**当前实测缺口：三处各自的自校验齐备 3/3，但三处观测到的值一条都没有进入 release report** —— 报告上唯一的一致性断言（`reporting.mjs:390-395`）比的是**同一份 evidence 文件被 upload/download 搬运后的两个副本**，不是任何 runner 的观测值；可证伪路径已实测存在（把矩阵两步指向另一对自洽的 wheel+evidence，矩阵对 wheel B 自洽通过、报告印 wheel A、merge 拿 A 比 A 判绿，**全绿无一处变红**），且 `run-with-unchain-artifact.mjs:46-48` 在 env 未设时会就地从**可变的相邻 checkout** `../unchain` 重新构建 wheel，正是铁律禁止的顶替形态。**因此以下四条为本 AC 的实施义务，全部落在 devtools 边界、零生产代码改动**：**V-1a** 把 `artifact-continuity-workflow.test.mjs` 从「该模式在文件中出现过」升级为**枚举式排他断言**（`deterministic-checks` 内全部 artifact 相关 env 含 `Python backend tests` 的 `PYTHONPATH` 逐字取自 `steps.unchain_artifact.outputs.*`，`package-matrix` 内逐字取自 `steps.artifact_verify.outputs.*`，两 job 内不出现其他来源）；**V-1b** 两个矩阵 runner 与 package smoke 把**观测值**写入 `GITHUB_OUTPUT` 并经 `QA_CHECKS_JSON` 进 job report，`reporting.mjs` 新增「携带观测值的 check 与本 job `unchain` 块不逐字相等即 `failed`」判定 —— 这是把「三处逐字相同」从声明变成报告上可核验事实的唯一途径；**V-3** 修正 `package-sidecar-smoke.mjs:198` 上报的 `runtime_manifest_digest` 取自 `expectedManifest` 的同义反复（须改取 `/health` 投影值）；**V-4** `packaged-sidecar-smoke.json` 目前内容从不解析、只按文件名与大小登记，须真正解析。**V-2（最高优先，本 AC 运行时段的前置条件）**：本 AC 运行时段要求「AC-011 的 pytest 增加一条 session 级断言，比对被测进程内的 manifest digest 与 evidence 文件中的 `runtime_manifest.manifest_digest`」，该断言**今天物理上不可写** —— CI 的 `Python backend tests`（`release-qa.yml:142-148`）与本地门的 `python backend tests`（`local-gate-checks.mjs:28-33`）**都只给 `PYTHONPATH`、不给 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`**（本 owner 已实测复核：同文件 :156 / :166 等其他步骤都给了，唯独 pytest 步没有）。补法是纯 env 追加、零风险，须在两处同时加；**V-2 应最先落地**。**C 「不得以可变相邻 checkout 顶替」的唯一执行点 = 已安装 dist 的 `direct_url.json` 比对**，四项断言：拒 `dir_info.editable`、要求 `archive_info` 存在、basename 逐字等于 `evidence.artifact.name`、`archive_info.hashes.sha256` 逐字等于 evidence sha 去前缀值；调用点三处（`release-qa.yml:91-101` 与 `build_unchain_server.sh` / `.ps1`，后两者在 runtime owner 边界，本段只引用不修改）；另加打包侧独立护栏 `unchain_runtime_source` 不得匹配 `editable|checkout|/src/unchain/`。明示 `source.*` 与 `unchain_revision` 只作 provenance 与遥测，`verifyUnchainTestSourceProvenance` 属 **test-source 选择门**而非 runtime compatibility 门。**D 显名 `playwright-electron` job 不绑定 artifact、不在三处之内**（设计如此，防止验收人去找不存在的第四条链）。**E `INCOMPLETE` 的机械表达（M-32）** —— job report schema **没有** `INCOMPLETE` 状态值，`deterministic_result.status` 只有 `passed` / `failed`，`INCOMPLETE` / `GO` / `NO-GO` 是 release certification 的结论词汇而非报告字段；故本 AC 的 `INCOMPLETE` 表达为四条可观察后果的约定：相应 check `failed` 且 details 逐字含 `(INCOMPLETE)`、`deterministic_result.status !== "passed"`、`merge-reports --fail-on-deterministic-failure true` 非零退出、workflow `Enforce final deterministic result` 失败；并保留 `NONZERO_EVIDENCE_CHECKS` 使「没跑」与「跑挂了」同等阻断 —— 那正是 `NOT_RUN / PENDING` 不得冒充覆盖的执行点。**不为此改报告 schema**（增设第三状态会波及全部既有消费点，收益只是词汇对齐）。**F red-before-green**：V-1a 与 V-1b 必须保存红档，取红方法即上述可证伪路径（指向另一对自洽 wheel+evidence，V-1b 落地后该路径必须变红）
  - AC-015 | 单一词汇定义：producer 与 consumer 的 terminal 家族、graph 事件类型与 seal↔status 映射全部从同一共享模块导出；存在一个 divergence 测试，在任一侧本地重定义时失败；`tests/context_v2/test_graph_checkpoint.py` 全部既有用例（含冷恢复补 seal 用例）不修改并保持绿
  - AC-016 | 只读 plan 定位辅助（SLOT-001 交付，BC-002 的一部分）：该 helper 纯读 —— 在其任意调用路径上断言零 `append`、零 artifact 写、零 `admit`；输入 `(journal 或 store, execution_id, orchestration_attempt_id 或 generation_id)`，输出 exact `GraphExecutionPlan`；对「零条或多于一条匹配的 `graph.execution.admitted`」「payload 不可解析」「plan 的 `execution_id` 与绑定不符」一律 fail closed 抛 reason 为 `graph_plan_descriptor_invalid` 的结构化异常；与 `graph_checkpoint.py` 的 `scan()` admission 唯一性检查**共用同一判据函数**，divergence 测试在两者分叉时失败；重建出的 plan 与 producer 原始 `plan.to_dict()` 逐字相同（用真实 `GraphCheckpointService.admit()` 写入的 journal 取证）
- **boundary obligations**: BC-001, BC-002, BC-003, BC-004
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007
- **state sequence N/A reason**: NOT_APPLICABLE

## 设计正文

### 一 · attempt quiescence 分类

`_assert_no_open_attempt_or_tool`（`sqlite_generation_rebase_v2.py:1326`）今天把 receipt import 区间之外的全部 runtime events 按 `attempt_id` 分组后一视同仁地套 terminal-last 规则（:1447-1467），对 graph 事件完全无感知 —— 整个 `src/unchain/persistence/` 目录对 `graph` 大小写不敏感 grep 零命中。本方案把这一步改为三类分类。

**分类判据（组内自证，不信任 producer）**

| 类别 | 判据 |
|---|---|
| `GRAPH_STEP` | 组内恰有一条 `graph.step.started` |
| `GRAPH_ORCHESTRATION` | 组内恰有一条 `graph.execution.admitted` 且零条 `graph.step.started` |
| `PLAIN` | 组内零条 `graph.*` 事件 |
| 其余组合 | `graph_attempt_kind_ambiguous`，UNAVAILABLE |

`graph.step.started` 不是组内第一条事件：`start_step` 先经 `DerivedHandoffInputIngress.persist` 在同一 step attempt 上写 handoff / input 事件，再 append `graph.step.started`（`graph_checkpoint.py:1524-1538`）。因此判据用"唯一存在"而不是"位置"。

**PLAIN**：维持今天的 terminal-last fail-closed 不变，只增加一条 `run_max_iterations` 的 terminal-equivalent 规则（见下节 K-4）。

**GRAPH_STEP** 的 quiescence 要求（全部满足才 PASS）：

1. terminal 候选集合 `TE` = 组内位于 `graph.step.started` 之后、类型属于 canonical terminal 家族或 max-iterations 家族的事件，与 producer 的 `_terminal_after_start`（`graph_checkpoint.py:1111-1129`）取同一窗口。`|TE| == 0` → BLOCKED；`|TE| > 1` → UNAVAILABLE（`graph_step_terminal_ambiguous`，producer 自己也拒绝，`recover()` 无法修复，不能判 recovery_required）；`|TE| == 1` → 记为 `T`。
2. seal 集合 `SK` = 组内类型属于 `{graph.step.completed, graph.step.failed, graph.step.cancelled}` 的事件。`|SK| > 1` → UNAVAILABLE（`graph_step_seal_duplicated`）；`|SK| == 0` → 见第二节 crash window；`|SK| == 1` → 记为 `K`。
3. `K` 必须是组内最后一条事件（`graph_step_seal_not_last`）。
4. `T` 与 `K` 之间在组内不得有任何其它事件，即 `K` 是 `T` 在本组顺序上的直接后继（`graph_step_seal_not_adjacent`）。这条比"seal 之后无事件"更强，堵住 terminal 后继续跑模型 / 工具再补 seal 的形态。
5. status 一致：`graph.step.completed` ↔ `{run_completed, run.completed}`；`graph.step.failed` ↔ `{run_failed, run.failed, run_max_iterations, run.max_iterations}`；`graph.step.cancelled` ↔ `{run_cancelled, run.cancelled, run_canceled, run.canceled, run_aborted, run.aborted}`。错配 → `graph_step_seal_mismatched_terminal`。
6. `K.payload["terminal_cursor"]` 严格解析为 `{store_seq, event_id}` 且逐字等于 `(T.store_seq, T.event_id)`。
7. `graph.step.completed` 另外要求 `K.payload["execution_event_range"]["end"]` 等于同一 terminal cursor，`["start"]` 等于唯一 `graph.step.started` 的 cursor —— 这正是 producer `_step_execution_range`（`graph_checkpoint.py:1081-1109`）的构造方式，因此可以对称断言。
8. `K.payload["step"]` 解析出的 `attempt` 逐字等于本组 attempt（foreign seal 检查），`index` / `node_id` / `provider` / `model` / `configuration_sha256` 与 `graph.step.started` 的 `step` 一致，`graph_plan_id` 与 `graph_scope_id` 与 `graph.step.started` 一致。
9. seal payload 的 key set 精确匹配（CLOSED）：多出未知 key 或缺必需 key → fail closed。

**GRAPH_ORCHESTRATION** 的 quiescence（见第三节）。

**聚合优先级**：`UNAVAILABLE > RECOVERY_REQUIRED > BLOCKED > PASS`。确定性错误优先于"再等等"，因为等待不可能改变确定性错误，而热循环正是要消除的症状。

### 二 · crash window 语义（推荐：新分类 `recovery_required`，作为 Blocked 的子类型）

现状是双向错误：合法 seal 被 `:1464` 拒为 UNAVAILABLE，而 seal 尚未写入的 crash window 反而三条件全过被静默放行 —— preflight 链（`_assert_no_prepared_checkpoint` :1132 / `_assert_no_pending_interaction` :1029 / `_assert_no_open_attempt_or_tool` :1326）没有任何 graph checkpoint 完整性检查。

**推荐（K-1）**：引入 `GenerationRebaseRecoveryRequired`，**继承 `GenerationRebasePreflightBlocked`**（后者已是 `GenerationRebaseConflict` 的子类），reason 为 `graph_step_seal_missing` / `graph_execution_seal_missing`。

理由：

- 不能判 PASS。terminal 已落盘但 seal 未写时，graph checkpoint 尚未完成，放行会让 rebase 在一个未封口的 graph 上切 generation。
- 不能判 `GenerationRebaseUnavailable`。该类语义是"无法完成或验证"，sidecar 映射为 503 + retryable，而这个状态是**确定可恢复**的 —— `recover(plan)` 会精确补一条 seal，`tests/context_v2/test_graph_checkpoint.py:299` 的冷恢复用例已经证明这一点。把可恢复状态标成 unavailable 正是今天误分类的根源。
- 不能与普通 `in_progress` 混同。二者的补救动作不同：`in_progress` 只需等待，`recovery_required` 必须有人跑一次恢复，否则永远等不到 —— rebase 路径不会、也不应该自己触发 `recover()`。
- **选择继承 `GenerationRebasePreflightBlocked` 而不是新起顶层类型，是为了让未升级的 sidecar 安全降级**：`_translate_rebase_error`（`memory_v2_unchain_generation_api.py:349-360`）先 `isinstance(GenerationRebasePreflightBlocked)`，因此未升级侧会返回今天的 `context_v2_rebase_in_progress`（409、有界退避、outbox 保留）。若新起顶层类型，则落入兜底的 `context_v2_rebase_unavailable`（503），即今天最坏的那条路。

**与冷恢复契约的衔接（K-2）**：validator 保持严格只读，绝不调用 `recover()`。理由是硬的 —— rebase 运行在自己连接的 `BEGIN IMMEDIATE` 里（`sqlite_generation_rebase_v2.py:543-553`、:1670），而 `recover()` 经 `BoundExecutionJournal` 在另一条连接上写入，在同一个 WAL 数据库上会互锁，并且会打破该模块"本服务是唯一写者"的既定约束，也触碰 non_goal 保护的 seal 路径。

因此恢复动作归 host：sidecar 收到 `recovery_required` 时执行一次有界恢复，再用同一个 frozen 请求重试一次。SLOT-002 已确认该编排在 `rebase_session` 内联实现（不新建 endpoint、不新建 IPC channel），并核实异常传回时 unchain 的 `BEGIN IMMEDIATE` 已 rollback 且连接已 close（`sqlite_generation_rebase_v2.py:542-554`），因此恢复走另一条连接是顺序的而非嵌套的，无死锁。

**只读 plan 定位辅助：交付（决定点 K-6）。** SLOT-002 把它列为硬依赖，本 owner 同意并纳入 write_set 与 BC-002，理由三条：其一，替代方案是让 PuPu 从 `graph.execution.admitted` 的 payload 自己重建 plan，那等于把 `plan.to_dict()` 的 schema 复制进第二个仓库 —— 正是 BC-002 要消灭的分叉形态，本案不能一边建共享词汇一边制造新分叉；其二，复用 `PupuUnchainGraphCheckpointHost` 不可行，它构造末尾即 `admit()` 一次 append，为修一次 crash window 先写一条事件是荒谬的；其三，不交付则 SLOT-002 结论翻转为"crash window 直接 terminal + quarantine"，热循环虽止、outbox 虽保，但每一次 crash window 都要用户介入，而这个状态本来是完全可自动恢复的 —— 用产品体验换一个我边界内十几行只读代码，不划算。

该 helper 的契约：纯读（零 append、零 artifact 写、零 admit）；从 `(execution_id, generation_id)` 的 `graph.execution.admitted` payload 重建 exact `GraphExecutionPlan`（payload 已完整保存 `plan.to_dict()`，`graph_checkpoint.py:598-605`，读侧校验 :717-734）；零条或多条匹配、payload 不可解析、execution 不符一律 fail closed 抛 `graph_plan_descriptor_invalid`；与 `scan()` 的 admission 唯一性判据**共用同一函数**，不各写一份。取证见 AC-016。它不改变 `recover()` 的任何语义。

**plan 对象在 PuPu 边界上是不透明的。** sidecar 只把 helper 的返回值原样交回 `recover(plan)` / `finalize(plan)`，不读取、不序列化、不记录、不重建其任何字段。这一条是本设计不构成新增跨仓 wire contract 的原因，也因此不需要新开一个 BC —— 它写进 BC-002 的 admission details 与 BC-003 的 consumer projection。

**跨进程并发恢复是良性的，不需要升级为跨进程锁（决定点 K-9，回答 SLOT-002 的 U-1）。** 本 owner 读 `SQLiteContextV2Store` 的 journal append 实现（`sqlite_v2.py:1477-1514`）定案：去重键是 **`operation_id` 而不是 `event_id`**，语义是幂等重放，不是抛异常。

- `JournalGraphCheckpointRepository._append`（`graph_checkpoint.py:561-578`）把 `event_id` 与 `operation_id` 都由 `_stable_id` 从同一个 `{scope_id, event_type, discriminator}` 派生，两者都确定。
- append 时若 `operation_id` 已存在：校验 `payload_sha256`、`target_kind`、`target_key`，再用 `_request_matches_event`（:1331-1342）逐项比对 event_id、event_type、attempt、operation、payload dict 与 resource_refs；全等则返回 `JournalAppendResult(..., duplicate=True)`，**零新增行**。任一不等则 `JournalConflictError`。
- 若 `operation_id` 是新的但 `event_id` 已存在：`JournalConflictError("event id belongs to another operation")`。

因此两个 sidecar 实例对同一个 crash window 并发恢复时：seal 的 payload 是 journal 的确定性函数（`terminal_cursor` 与 `execution_event_range` 由事件位置决定，`output_artifact` 经 `persist_exact_json` 以稳定 `operation_id` 幂等落盘），两次 append 字节相同 → 第二次幂等返回，不多写一行、不打死任何活跃 run。若两侧因某种原因产出不同字节（例如 sanitizer 不一致），则 fail closed 为 `JournalConflictError`，被 `_append` 包成 `GraphCheckpointConflict`（`GraphCheckpointError` 的子类，:73-78），正好落进 SLOT-002 已定义的「`recover()` / `finalize()` 抛 `GraphCheckpointError` → `context_v2_rebase_journal_incompatible` 409」那一格。

结论：SLOT-002 §2.4 的进程内 live-execution 闸**足够**，不需要升级为 SQLite advisory 跨进程锁。它同时给出一条对 sanitizer parity 的额外动机 —— AC-011 子例 7g 已覆盖。

### 三 · orchestration attempt 生命周期

`graph.execution.admitted` 写在独立的 `plan.orchestration_attempt` 上（`graph_checkpoint.py:598-605`），plan 构造强制 orchestration 与各 step attempt_id 互异（:327-344）。三种真实形态：

- **授权 root graph**：PuPu `complete_pupu_unchain_graph_root`（`memory_v2_unchain_graph_root_completion.py:460`）先 `graph_host.finalize()` 追加 `graph.execution.completed`，再 `_append_root_terminal`（:280-322）在**同一** orchestration attempt 上依次写 `final_message` → `run_completed`，并强制 final 的 store_seq 小于 terminal。→ terminal-last，今天已通过，改后继续通过。
- **delegated / shadow**：`unchain_adapter.py:10479-10496` 只有 `graph_active_bridge is not None and graph_completion_authorized` 才走 root completion，否则只 `finalize()`。→ 组内只有 `graph.execution.admitted` 与 `graph.execution.completed`，零 run terminal，今天永久 `:1460` Blocked → `context_v2_rebase_in_progress` 永久重试。
- **等待 interaction / 中途放弃**：`finalize()` 在 `output_holder["suspended"]` 或异常路径下根本不被调用，组内只有 `graph.execution.admitted`。

**分类（K-3）**：

| 形态 | 判据 | 结论 |
|---|---|---|
| (a) root-terminal | 恰一条 canonical run terminal 且为组内最后一条；若存在 `graph.execution.completed` 则必须早于它且恰一条；全部 plan step 已合法 sealed | PASS |
| (b) graph-sealed | 零 run terminal；恰一条 `graph.execution.completed` 且为组内最后一条；plan 可解析；全部 plan step attempt 均为合法 sealed-completed 的 GRAPH_STEP；`final_step_index` 等于末位 index | PASS |
| (c) graph-dead | 零 run terminal；零 `graph.execution.completed`；组内最后一条为 `graph.execution.admitted`；恰有一个 plan step 以 `graph.step.failed` 或 `graph.step.cancelled` 合法 sealed，且不存在 index 更高的 step 事件 | PASS |
| (d) finalize crash window | 零 run terminal；零 `graph.execution.completed`；全部 plan step 已 sealed-completed | RECOVERY_REQUIRED（`graph_execution_seal_missing`） |
| (e) live | 任一 plan step 无 terminal、等待 interaction、或已 sealed 的 step 数少于 plan 步数且无失败 seal | BLOCKED |
| 其它 | duplicate admitted、plan 不可解析、`graph.execution.completed` 与 run terminal 顺序矛盾、step seal 与 plan 不符 | UNAVAILABLE |

(b) 是必需的而非可选的：用户库里已经存在这种历史形态，而 non_goal 禁止重写历史 journal，因此 validator 必须能接受它。它不等于"把所有 `graph.execution.completed` 当 terminal 放行"，因为它同时要求零 run terminal、plan 全覆盖、seal 全合法与 seal-last。

(c) 的依据：`graph.step.failed` / `cancelled` 一旦落盘，`_GraphScan` 会把 `terminal_status` 置为非空（`graph_checkpoint.py:993-998`），`start_step` 随后抛 "terminal graph execution cannot advance"（:1506）。该图在 durable 层面已死，判 Blocked 就是永久 Blocked。

(e) 是刻意保守的：plan 步数未走完且无失败 seal 时，"两步之间的正常飞行中"与"已被放弃"在 journal 上无法区分，时间不是可靠判据，因此保持 Blocked。

新形态 `graph.execution.failed` 之类的 producer 事件本案不新增 —— 它对存量 journal 无用，只会增加一个未覆盖的词汇。

**SLOT-005 已定案：delegated / shadow 不补写 root terminal**，(b) 成为长期合法形态。SLOT-002 给出的理由本 owner 全部接受，其中两条是我边界外我无法自行认定的关键事实：`graph_completion_authorized` 来自 unchain runtime context 的 `MEMORY_EXECUTION_COMPLETE` grant 而非 PuPu 侧开关，补写只能靠扩权或跳过授权检查；以及 shadow 分支若在 durable journal 上写出 chat 级终结事件，就与 active 在持久状态上不可区分，shadow 语义即告失效。补充一条我边界内的理由：`run_completed` 是 compiler、`run_outcomes`、receipt、token accounting、trace 投影共享的词汇，在 delegated orchestration attempt 上凭空造一个 chat 级 terminal 是对所有这些 consumer 撒谎，而 (b) 的成本被完全限制在一个 validator 的分类分支里。

**(b) 的安全性不依赖任何 PuPu 侧 attempt 编号约定（决定点 K-7，回答 SLOT-002 的核验请求）。** SLOT-002 提出 (b) 之所以安全，前提是"父 run attempt 与 delegated orchestration attempt 同 generation、因而同在 validator 扫描集内"，并请 lead 核实。核实结果是：**该前提成立时结论成立，不成立时结论同样成立**，因此它不是前置条件，不写入 AC-007 的假设，而是由结构本身保证：

- validator 扫描 `WHERE execution_id = ? AND generation_id = ?`（`sqlite_generation_rebase_v2.py:1340-1352`），范围就是本次 rebase 要切走的那个 generation 的全部 attempt。
- 若父 run attempt **在**该 generation 内且仍在飞行，它自己的组零 terminal → BLOCKED；聚合优先级 BLOCKED 高于 PASS，整体 preflight 被 Blocked，与 orchestration 组判什么无关。
- 若父 run attempt **不在**该 generation 内，它就不属于本次 rebase 的切换对象，本来就不该由本 preflight 判定。
- 两种情况下 (b) 都不可能放行一个仍在运行的 chat。AC-007 (f) 把第一种情况变成一条显式取证用例，而不是一句假设。

顺带核实的相邻事实（`memory_v2_unchain_graph_checkpoint.py:285-332`）：orchestration attempt 取自 `coordinator.bundle.attempt`，即该 graph run 自身的 binding attempt；全部 step attempt 由 `AttemptRef(coordinator.bundle.attempt.generation, ...)` 构造，故 plan 内部同 generation 由构造保证（`GraphExecutionPlan.__post_init__` :334-343 另有强制校验）。delegated 情形下 `workflow_run_id` 与 `parent_run_id` 是两个不同的 run id，父子确为不同 attempt。

### 四 · 结构化失败语义

`GenerationRebaseUnavailable`（:90-91）与整个 `GenerationRebaseError` 族（:82-95）今天只有 message 字符串，sidecar 只能用 `str(error).casefold()` 关键词（`"operation"` / `"payload"` / `"revision"`）分类，detail 还被 `route_memory_v2.py` 二次覆写。

设计：

- 新增封闭枚举 `GenerationRebaseFailureReason`，**对本模块每一个 raise 点满射**。它必须满射，而不是"覆盖主要分支"—— 只要剩一个 raise 点没有 reason，sidecar 就必须永久保留关键词分类器兜底，本案的核心目标就只完成一半。满射由 AC-009 的反射断言机械保证。
- 每个异常实例带 `detail`，canonical 形状 `unchain.generation_rebase_failure.v1` = exact key set `{schema, reason, subject}`；`subject` 只含 identity 形状的有界字段，上限为每字符串值 ≤ 256 字符、键数 ≤ 12、canonical JSON ≤ 2048 字节（回答 SLOT-002 的 U-5：这些数值宽于任何真实标识符——`_stable_id` 产出定长 hex、attempt_id 受 `_required_text` 约束——又窄到装不下任何消息文本或用户内容）。
- 提供 skew 容忍的模块级读取函数，使 consumer 不必依赖新符号即可取 detail。
- **全部既有 reason 的 `str(error)` 逐字不变**，让 Unchain 可独立部署而不改变今天的 sidecar 分类（AC-010）。

**conflict 族纳入枚举（决定点 K-8，采纳 SLOT-002 的 M-2）。** SLOT-002 指出 PS-001 的枚举漏掉了关键词分类器今天实际赖以工作的那几类，不补则 `str(error).casefold()` 必须永久保留。本 owner 采纳，并已把本模块 18 处 `GenerationRebaseConflict` raise 点逐一归入四个族（行号为本 owner 复核所得）：

| 族 | 代表 raise 点 | 今天关键词分类器的归宿 |
|---|---|---|
| operation identity | :877 operation payload or target changed；:1521 operation payload hash changed；:1563 operation ID was reused；:1757 event operation already exists | `context_v2_operation_conflict` |
| head revision CAS | :1650 head revision is not current；:1810 journal head changed；:2013 head changed during compare-and-swap | :1650 → revision_conflict；:1810 / :2013 → generation_conflict |
| source generation | :1632 no current generation；:1646 previous generation is not current；:1684 generation ID already belongs to a lifecycle record；:1694 source revision is already imported；:1704 attempt ID is already bound | 除 :1694 外均 generation_conflict |
| chat binding / create | :1496 create cannot claim a non-empty execution；:1587 create requires an empty chat head；:1614 execution is already bound to a chat；:1639 binding is outside the durable chat；:2451 head read is outside the durable chat binding；:2032 conflicted with durable state | generation_conflict |

此外，`unavailable` 桶需要一个**基础设施族**，而不只是 SLOT-002 表中列的 `current_receipt_unavailable`：`:560` WAL 不可用、`:723` schema 不受支持、`:727` quick_check 失败、`:741` schema 初始化失败都是真实的基础设施故障，理应 503。这是对 SLOT-002 映射表的补充而非改动 —— 只向它已定义的桶里增加成员，不移动任何已定成员。

一处需要记录的静默重分类：`:1694` 的 message 含 `revision`，今天被关键词分类器判为 `context_v2_revision_conflict`，按语义它属 source generation 族。新分类器会给出更准确的 code；两个 code 今天都在 renderer 的 `TERMINAL_REBASE_ERROR_CODES` 内，用户可见行为不变（见风险 R7）。

## SLOT-002 交付正文（code-owner-runtime，经 HS-001 返回，本 owner 集成）

正文全文见 `contributions/HS-001-code-owner-runtime.md`；以下是被本 PS 采纳并因此具约束力的部分。

### A · reason → error code 三级分类器与七 code 全表

分类器按严格三级取值，任一级不成立即降到下一级，绝不混用：**L1** 结构化 detail（exact key set、schema 匹配、reason 在映射表内）→ 按下表取 `(code, status, retryable)`；**L2** 异常阶梯（`GenerationRebaseRecoveryRequired` → recovery code；`GenerationRebasePreflightBlocked` → in_progress；`GenerationRebaseConflict` → L3；其余 → unavailable）；**L3** 今天 `:361-386` 的关键词分类，逐字保留，仅在 L1 不可用时进入。detail 缺失、非 Mapping、schema 不符、key set 不精确、reason 非字符串或不在表内 —— 一律视同没有 detail：半解析的 detail 比没有 detail 更危险。

| code | 新? | HTTP | `retryable` | renderer 类 | 触发的 reason |
|---|---|---|---|---|---|
| `context_v2_rebase_in_progress` | 既有 | 409 | true | in_progress，有界退避重放 | `pending_interaction`、`attempt_unfinished`、`tool_unfinished`、`prepared_checkpoint_present`、`graph_step_awaiting_interaction`；及任何未列表但异常为 `GenerationRebasePreflightBlocked` 子类者 |
| `context_v2_rebase_recovery_required` | **新** | 409 | true | recovery_required，触发一次有界恢复后重放一次 | `graph_step_seal_missing`、`graph_execution_seal_missing` |
| `context_v2_rebase_journal_incompatible` | **新** | 409 | **false** | **terminal-quarantine**，保留 frozen payload | 全部 graph seal 完整性 reason、`attempt_duplicate_terminal`、`attempt_continued_after_terminal`、interaction 与 tool 的全部配对完整性 reason |
| `context_v2_operation_conflict` | 既有 | 409 | false | terminal-discard | operation identity 族 |
| `context_v2_revision_conflict` | 既有 | 409 | true | terminal-discard（frozen payload 永不成功） | head revision CAS 族 |
| `context_v2_generation_conflict` | 既有 | 409 | true | terminal-discard | source generation 族、chat binding / create 族 |
| `context_v2_rebase_unavailable` | 既有 | 503 | true | 基础设施故障，与业务失败分开计数 | `current_receipt_unavailable`、基础设施族、真实 sqlite / OS / I/O 故障。**其余任何 reason 都不得落到这里** |

三条被采纳的设计判断：`journal_incompatible` 用 409 而非 503（它是 durable journal 的确定性状态，与基础设施可用性无关；今天正是"确定性不可恢复 → 503 + retryable"制造了热循环，且既有三个 terminal code 都已是 409，renderer 侧语义与它们一致。**M-19 更正**：原写作「preload 与 electron 对 409 body 的透传路径已被覆盖」不准确 —— 载体只看 `response.ok`、**不区分 409 与 503**，被覆盖的是二者共用的 `!response.ok` 路径，status 也不跨 IPC；409 的真实收益在 renderer 语义一致性，载体侧不存在 409 专有证据）；`recovery_required` 的 `retryable` 取 true（它确实可重试，只是必须先恢复）；**`retryable` 是咨询性遥测，`code` 才是规范**。

**只加 code、不改信封形状。** 四个 renderer 类全部可由 `code` 单独承载，因此 BC-004 的 `CLOSED` 不需要松动为 VERSIONED，SLOT-004 的答案可以是"确认透传即可"，也不产生 code 与 detail 两个分类通道的长期分裂。

**`route_memory_v2.py:305-312` 的 message 覆写保留，结构化 detail 不跨出 sidecar。** 覆写只丢 message，`code / status_code / retryable / expected_revision / actual_revision` 逐字保留，契约既然是 code-only，覆写零信息损失；它同时是一道实际生效的边界闸。诊断需求在服务端结构化日志满足（字段 `{code, reason, schema, subject}`，`subject` 沿用 AC-009 的有界 identity 映射）。**新增出网 code allowlist**：`CONTEXT_V2_REBASE_ERROR_CODES` = 上表七个加既有相邻 code `context_v2_rebase_receipt_mismatch`、`context_v2_not_found`、`context_v2_invalid_request`、`context_v2_invalid_history`；出网前校验，集合外的 code 降级为 `context_v2_rebase_unavailable` 并记 error 日志。取证见 AC-011 子例 6。

### B · 有界 recovery 编排

在 sidecar `rebase_session` 捕获 `recovery_required` 之后内联执行，新模块 `unchain_runtime/server/memory_v2_unchain_graph_recovery.py`；不新建 endpoint、不新建 IPC channel。准入复用既有 scope，不创建也不修改任何 admission。三层并发防护：durable 前置条件（只有 validator 判为 `recovery_required` 才进入，该分类要求 run terminal 已 durable，因此恢复永远只 seal 一个 terminal 已落盘的 step）+ 进程内 per-execution 非阻塞锁 + 新增的 in-process live-execution 注册表（在构造 `graph_checkpoint_host` 之前登记 `execution_id`，`finally` 移除；恢复模块见其在集内即拒）。冷装配 service 时**不调用 `admit()`**，sanitizer 必须与 active 路径逐字同一个函数，`derived_ingress_resolver` 注入 fail-closed 版本作自证。按 reason 精确二选一：`graph_step_seal_missing` → `recover(plan)` 恰一次；`graph_execution_seal_missing` → `finalize(plan)` 恰一次（不得对 step-seal 缺失调 `finalize`，它会顺带写出可能本不该有的 `graph.execution.completed`）。随后用同一个 frozen 请求重放恰一次。

**server 侧上界**：模块级有界 LRU 记 `(execution_id, generation_id, reason) -> attempts`；重放后仍是同一 recovery reason 即计数加一，达到 2 时返回 `context_v2_rebase_journal_incompatible`。该上界必须在 server 侧，不能只靠 renderer —— renderer 的计数会因清缓存或重装归零，而 server 侧的判据是"同一 durable 事实重复出现"。计数在 sidecar 重启时清零，这是有意的：重启正是新 crash window 可能产生的时刻。**失败 → code 的对照（逐行恢复 SLOT-002 §2.4 步骤 9 的六行表；前两行与后四行是刻意区分，不得合并为「一律」）**：抢不到 per-execution 锁 → `context_v2_rebase_in_progress`（409, retryable, 零写入）；execution 在 live 注册表内 → `context_v2_rebase_in_progress`（409, retryable, 零写入）；plan helper 不可用 / plan 不可重建 / admitted 非唯一 → `context_v2_rebase_journal_incompatible`（409, non-retryable, 零写入）；`recover()` / `finalize()` 抛 `GraphCheckpointError` → `context_v2_rebase_journal_incompatible`（409, non-retryable, 零写入）；重放仍 recovery_required 且计数已达上界 → `context_v2_rebase_journal_incompatible`（409, non-retryable, 恢复的一条 seal 已写）；sqlite / OSError / 磁盘 I/O → `context_v2_rebase_unavailable`（503, retryable）。**区分依据是硬的**：前两行是**瞬时争用**（另一路正在恢复，或活跃 run 正处在 `run_completed` 与 `complete_step()` 之间的窗口内、它自己马上就会 seal），属**恢复未进入**而非恢复期失败；后三行是**确定性状态**。把瞬时争用判成 terminal-quarantine 会与 K-13（未知 code 进 `paused` 而非 `quarantined`）及 BC-003 `unknown input behavior` 自相矛盾，也会把一个毫秒级、必然自愈的窗口变成用户可见的会话锁定（该 chat 的发送、模型选择与消息动作按钮持续禁用，直到用户主动 Retry）。`GraphCheckpointError` **不映射 503** —— 它是确定性的 durable 状态分歧，503 + retryable 正是热循环发生器。

## SLOT-003 交付正文（code-owner-chat-core，经 HS-002 返回，本 owner 集成）

正文全文见 `contributions/HS-002-code-owner-chat-core.md`；以下是被本 PS 采纳并因此具约束力的部分。三项由本 owner 自行回源码复核确认：terminal 的现行语义确为删除（`use_chat_stream.js:12756-12765` 等四处在 fingerprint 未变时 `removeTurnMutation`）；任一 outbox 条目即锁死该 chat 的发送与模型选择（`use_chat_stream.js:1493-1502`）；单条目 normalize 失败使整库 `available:false` 从而锁死**每一个** chat（`turn_mutation_outbox.js:346-375` 的 `if (!normalized) return { available: false, entries: [] }`）。

### C · terminal 必须分叉为 discard 与 quarantine

照字面把 `context_v2_rebase_journal_incompatible` 放进 `TERMINAL_REBASE_ERROR_CODES` 会**必然**删除用户 frozen payload，与 non_goal 直接冲突 —— 因为该 code 总在 rebase 完成于任何本地提交之前发生，fingerprint 必然未变，删除条件必然满足。因此"terminal"拆成两个正交概念：**是否停止自动重试**（语义不变，新 code 加入）与**停止之后如何处置条目**（新增 `contextV2RebaseTerminalDisposition(code)` → `discard` | `quarantine`）。

判据是**手工重做能否成功**，不是错误严重程度：既有九个 conflict code 的共同点是"这份冻结的请求永不成功，但用户重做一次会成功"，删除只损失一次重做且有 fingerprint 门；`journal_incompatible` 相反 —— 它描述 durable journal 的确定性状态，与这份 payload 无关，用户重做 100 次拿到同样的 code，而该状态**可以被修好**（升级到修复后的 wheel 或后续 recovery），修好后原样重放这份 frozen payload 正是本案方案 B 的核心承诺（AC-003 的幂等重放）。

### D · `recovery_required` 是独立第五类

sidecar 已在同一个 HTTP 请求内同步完成 `recover(plan)` 或 `finalize(plan)` 并重放过一次，renderer 再等 4 秒不会让 durable 事实发生任何变化。故固定两级 **250ms / 750ms** 退避（无指数尾），renderer 见到 `recovery_required` 只可能是 sidecar 已跑过一次真实恢复且重放仍撞同一 reason；第二次成功的概率很低但非零（例如另一路并发恢复恰在两次之间补上了 seal），故留一次极短重试即判定，不设指数尾。（本句为 SLOT-003 原理由句的更正：原文称该窗口是给「live-execution 闸刚好拒绝了本次」的让路，但按 SLOT-002 的设计**闸拒绝不以 `recovery_required` 呈现**而是返回 `in_progress`；所定行为 250ms / 750ms 与专属上界 2 不因此改变。由撰写该句的 owner 自陈并提供替换文本。）专属上界 `recoveryRequiredAttempts >= 2`，到界转 quarantine，同时计入共享计数。它本身不进 terminal 集合。

`context_v2_rebase_unavailable` 保持非 terminal 且不设显式分支，受共享上界约束；封闭集合穷举（AC-012 子例 11）比手写集合更强，故不为它另建集合。

### E · outbox 四字段持久化计数

`normalizeTurnMutationOutboxEntry` 新增 `replayAttempts`(0..12) / `recoveryRequiredAttempts`(0..2) / `retryStatus`(`"" | paused | quarantined`) / `lastFailureCode`(`^[a-z0-9_]{1,64}$`)，**不升 `STORAGE_KEY` 版本**。

- **第一约束（不可协商）**：这四个字段的任何取值都不得使条目 normalize 失败。缺失 → 0；非法 → **clamp 到上界**（保守判为已耗尽，进入需用户操作的稳态而非慷慨重置为 0 —— 后者等于给每一种存储异常都开一次新的热循环）；绝不 reject。这与 `v2RebasePayload` 的"半有效即整体拒绝"纪律刻意相反：那里拒绝的是会导致用户编辑被判 terminal 的输入，这里拒绝的只是自己的记账。
- **不升版本的理由**：旧 normalizer 是 allowlist 重建，新字段被静默丢弃，payload / ack / mirror 逐字保留，rollback 天然安全；而升版本会让旧代码把整库判为不可读，比丢四个计数字段严重得多。
- **共享上界 12 配 `min(60_000, 250·2^(n-1))` 阶梯**：今天的 6 是"每次挂载"的预算、封顶 4 秒、整轮约 8 秒；改成跨重启的终生预算后，一次普通的 sidecar 重启就会烧光它并把真瞬时故障推进 paused。12 次配 60 秒封顶累计约 4.3 分钟，覆盖 sidecar 重启、Ollama 冷启动与一次短暂 I/O 故障，同时严格有界。
- **持久化的计数同时恢复阶梯位置**：recovery effect 挂载时若 `replayAttempts > 0`，先按 `delay(n)` 排程再执行首次替换；只有计数为 0 才立即执行。否则重挂载仍能绕过退避，用户会看到十几次快速失败。
- `turnMutationRecoveryAttemptsRef` 六处使用整体删除，不保留双份真相；`attempt >= 6` 分支与 `"Reopen the task to retry safely."` 一并删除 —— 后者指导的动作恰好就是触发无界重试的那个动作。

### F · quarantine 的用户可见语义

保留条目而不给出口 = **永久锁死这个 chat**（任一条目即禁用发送、模型选择与消息动作）。因此处置入口是必需项而非可选项。状态来源必须是 outbox 条目而非 `streamError`（后者只在活动 chat 写入、瞬时、不跨重启）。常驻内联提示 + **Retry now**（重置两个计数，本状态序列 `reset` 单元格的唯一合法 reset）+ **Discard**（**仅当条目无 `v2Ack`**：带 ack 意味着 journal 已被改写、只剩 V1 mirror 未完成，删除会抹掉"V1 落后于 journal"的唯一记录并解锁一个短期记忆已脏的 chat；rebase code 只会落在无 ack 条目上，故 quarantine 下 Discard 总可用）。Discard 时把 `entry.text` 经 `composer_prefill` 写回输入框，**丢弃动作因此永不销毁用户写过的内容**。文案全静态，绝不显示服务端 message。

### G · 两处跨层计数交互的明示行为（U-10 / U-11 的定案）

这两条是 renderer 与 sidecar 两个计数器的交互，写成 PS 正文的明示行为，由 code-owner-runtime 在 RS 审查时以 stance 确认，不为此另开一棒：

- **G-1（U-10）**：sidecar 的 `(execution_id, generation_id, reason)` 上界在其进程重启时归零（有意），renderer 的 `recoveryRequiredAttempts` 跨重启不归零。最坏情况下 renderer 先到界并 quarantine，而 sidecar 认为还该再给一次机会。**这是期望行为**：renderer 是"同一 durable 事实跨多个 sidecar 生命周期反复出现"的唯一记忆，若它也随重启归零，则整个系统对该事实就没有任何有界记忆，热循环会以"每次重启重新开始"的形式复活。
- **G-2（U-11）**：用户显式 Retry 重置 renderer 计数时，未重启的 sidecar LRU 可能仍记着 2，于是这次重试立刻返回 `journal_incompatible`。**可接受**：用户得到的是一个更快、更确定的结论（"这确实修不好"），而不是又一轮退避。**明确不做**清 server 侧计数的 side channel —— 那是一个新的跨进程控制边界，需要新 endpoint、新 IPC 与新契约，为一个已经正确的结论付出的代价过高。
- **G-3（U-12）**：`MAX_REPLAY_ATTEMPTS = 12` 与 60 秒退避封顶无生产遥测支撑（本仓无 rebase 失败率埋点），**标注为可在验收时调整的参数**；具体取 10 还是 12 不改变任何 AC 的结构。**实质约束是"必须显著大于今日的 6"**，理由见 §E。

## SLOT-004 交付正文（code-owner-electron，经 HS-003 返回，本 owner 集成）

正文全文见 `contributions/HS-003-code-owner-electron.md`；被采纳的部分已分别写入 BC-004 与 AC-012 位置 (E)。此处只记不属于那两处的三件事。

### H · 载体侧生产代码结论：零改动

两个新 code 的字符集与长度都落在今日载体已能逐字透传的范围内（`^[a-z0-9_]{1,64}$`，实测长度 35 与 38）；409 与 503 共用 `!response.ok` 一条路径；preload 对错误零处理；channel 常量无需变更。**本案在 electron 边界的全部产出是测试与契约正文。**

载体在该 owner 边界内实为四段：C1 `readJsonResponse`（取 `error.code` 并 `.trim()`）、C2 `contextV2Request` catch（重建 `[code] 常量`）、C3 `ipcMain.handle` 包装（只记 code 并原实例 rethrow）、C5 preload（不接触错误）；第五段 C4 是 Electron 框架自身的 IPC 包装，不在任何 owner 边界内，只能作为已知形式在断言中建模。

### I · U-15 定案：不要求真实 Electron IPC（C4）证据

采纳载体 owner 的理由：包裹形式已由本仓 settings bridge 的既有测试独立锁定（`settings_storage_bridge.test.js:718-760`），AC-012 位置 (E) 的 E1 对两种包裹变体都作断言，SLOT-007 若落地会在第三跳自己的文件上再取一次断言。真实 C4 证据只能来自 playwright e2e（属 devtools 边界），为一个已被三处独立锁定的框架行为单开 e2e 不成比例。若 Chief 仍要求，请在 SLOT-006 交棒时一并交给 devtools，不为此单开一棒。

### J · 实施排序建议（供 PLAN_RULING 后参考，非授权）

位置 (E) 九格**全部只依赖今日已存在的载体实现**，不依赖 unchain 或 sidecar 任何改动落地，唯一外部依赖是位置 (D) 的 fixture。因此 **E3 / E4 / E6 / E7 / E8 / E9 六格立刻可跑**，E1 / E2 / E5 待 fixture。若 Chief 希望尽早锁住"载体不得漂移"这条今天零覆盖的性质，这是本案成本最低、可最先落地的一片。

## SLOT-007 交付正文（code-owner-shared-arteries，经 HS-004 返回，本 owner 集成）

正文全文见 `contributions/HS-004-code-owner-shared-arteries.md`；被采纳的实体内容已分别写入 BC-004、AC-012 位置 (F) 与风险 R8。此处只记不属于那三处的四件事。

### K · 反解段 owner confirmation 与非拆分立场

反解段 owner **确认**该段属其边界（`pupu:src/SERVICEs/bridges/**`，charter 显式声明项，非残余条款兜底）且是第三跳 renderer 侧**唯一**把传输串还原为分类输入的代码路径，并**接受行为式锚定禁令为该文件的持续义务**、由其承担防护与后续维护。该 owner **明确不要求把反解段拆为独立 BC，且不以此为同意的条件** —— 其所需的是知情与同意被留痕，contribution + RS stance 已完整承载；并同意把字段槽位不足定性为 boundary protocol v1 的结构性限制。至此 coverage gap (b) 由"该 owner 从未被交棒、无 contribution 无 stance"**收口为"已知情、已同意，仅形式上未占字段"**，与 (a) 同级。

### L · 注释补写：纳入 write_set，待裁定授权

反解段 owner 请求在 `src/SERVICEs/bridges/context_v2_bridge.js:53-56` 补写契约注释（要点：本 token 是 BC-004 第三跳的准入执行点；renderer 实际输入是 Electron 包裹形式而非裸串；不得引入任何位置依赖；语义由位置 (F) 的 G1–G8 锁定）。理由是**今天该注释一个字未提包裹形式与锚定禁令，而同目录 `settings_storage_bridge.js:101-109` 两者俱全** —— 同一份知识在一个文件里有、在另一个文件里没有，而没有的那个恰是本案执行点，**这正是陷阱得以存在的直接原因**。该改动纯注释、零行为，但仍是生产文件改动，故**纳入本方案 write_set，由 PLAN_RULING 一并授权**，不在交付阶段执行。它作用在人打开文件的那一刻，早于任何测试，是三层防护里单位成本最低的一层。

### M · 已评估并否决：目录级 lint 规则（记录以免重复提议）

本仓 eslint 为裸 `react-app` + `react-app/jest`，**无 plugin 装载点、无 flat config**；且 CRA 的 lint 在 build/dev 期执行，**不构成 `test:frontend` 的门**；更关键的是真正的漂移面是**语义**（位置依赖）而非**字面**，正则字面量的 lint 匹配写不准并会给出虚假安全感。三条理由均由该 owner 在其边界内核实后否决，记录在案。

### N · 两条边界信号（记录，本案不行动）

- **N-1 · `run_bundle_storage_bridge.js:13-18` 是一处 latent defect**：其 `error.code` 快路径与锚定正则**在生产中两条都恒失效**（handler 穿 `ipcMain.handle` 抛出，Electron 剥 code 并包裹 message），故 `parseRunBundleStorageErrorCode` 对任何真实 IPC rejection 恒返回 `null`。**当前零消费者，故不是活 bug**，而是坐在同一目录里等着被复制的**错误范本** —— 它正是 R8 所描述的回归**已经在隔壁文件里发生过**的实例。不在本案 write_set 内，建议另立一案（并一并评估 `memory_vault_bridge.js`）。
- **N-2 · `memory_v2_tree_state.js` 的归属信号（charter 义务上报）**：该文件不在 shared-arteries charter 的任何显式声明项内，仅由残余条款兜底；其生产消费者有且仅有一个（`memory-inspect/memory_v2_tree_view.js`），是单消费者的视图状态机而非多方消费的动脉，**长期应属 code-owner-settings**。本信号不扩张本案范围，所有权调整须另以方案裁定。

## SLOT-006 交付正文（code-owner-devtools，经 HS-005 返回，本 owner 集成）

正文全文见 `contributions/HS-005-code-owner-devtools.md`；实体内容已写入 AC-014 的 artifact 段与 SEQ-007。此处只记不属于那两处的四件事。本 owner 已独立复核 V-2 与 V-1b 两条最吃重的事实：`release-qa.yml:142-148` 与 `local-gate-checks.mjs:28-33` 确实只给 `PYTHONPATH`（而同文件其他步骤给了 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`），`reporting.mjs:390-395` 确实以 `packageUnchain[field] === unchain[field]` 比较两份同源 evidence 副本，`package-sidecar-smoke.mjs:198` 确实上报 `expectedManifest.manifest_digest`，`run-with-unchain-artifact.mjs:46-48` 确实默认回落到相邻 checkout `../unchain`。四条均属实。

### O · 位置 (D) fixture 的发布侧落点与一条顺序事实

fixture 的生成与 diff 校验落在 CI 的 `Python backend tests`（`release-qa.yml:142-148`，**CI 中唯一跑 pytest 的地方**）与本地门的 `python backend tests`；消费落在 `Frontend tests`（位置 (A)(B)(C)(D)(F)）与 `Electron tests` 及经 S3 shim 的 `Frontend tests`（位置 (E)）。**必须写入验收正文的顺序事实**：`Frontend tests`(:128) 与 `Electron tests`(:136) 都排在 `Python backend tests`(:142) **之前**，故消费方先读入库 fixture、生产方后重算 diff。两者都须绿，正确性不受影响，但 **fixture 漂移的失败会归因到 python 步而非前端步**，实施者与验收人须预知。另：须确认 `src/PAGEs/chat/hooks/__fixtures__/` 不落入任何 `.gitignore` 规则（现有条目不覆盖该路径），否则 K-17 的「入库」会静默失败而 CI 在 `Frontend tests` 阶段变红且指向错误原因。

### P · 两条协作义务（V-7 / V-8）

- **V-7（devtools 边界内）**：本地门已有 `release worktree remained unchanged` 全工作树指纹（含 `git diff --binary HEAD` 与全部未跟踪文件内容）作为独立第二重保险，**CI 侧完全没有**。补法为在 `deterministic-checks` 内加基线步与核对步（`if: always()`），失败时打印 `git status --porcelain=v1 --untracked-files=all` 全文并纳入 `QA_REQUIRED_CHECKS_JSON`。已实测该义务不会恒红（`/.release-qa`、`/build` 已忽略；`prepare-build-version.cjs` 零写入；`build-web.cjs` 唯一写入落在 `build/`）。
- **V-8（跨 owner 协作）**：fixture 生产侧今天**无任何哨兵** —— AC-011 子例 6 只跑在 `Python backend tests` 这个 bulk 步里，该 check 既不在 `DETERMINISTIC_REQUIRED_CHECKS` 也不在 `NONZERO_EVIDENCE_CHECKS`，用例被改名或删除时无人变红，而消费侧 E2 / G2 / G3 都规定「fixture 缺失即 FAIL 而非 skip」。补法为由 runtime 提供精确 pytest nodeid、由 devtools 加入 `context-v2-contract-matrix.mjs` 的 `PUPU_ADAPTER_CONTRACT_TESTS`，使其进入既 required 又 nonzero-evidence 的门并以精确 nodeid 调用（改名即非零退出）。

### Q · U-15 收口为 NOT_APPLICABLE，附一条更硬的理由

`intake/chief-directive.md` 全文未要求真实 Electron IPC（C4）证据，其 14 条验收矩阵第 14 项只要求 exact deployed-pair（即 AC-014），本 owner 已在 §I 定案不要求，Chief 至今无相反表态。devtools 另补一条本 owner 原文未提的真实代价：真实 C4 只能来自 playwright，而**要害不在 e2e spec 本身而在注入通道** —— 本仓无「在 e2e 模式下让主进程按指令抛特定错误」的既有机制，新增它是 `electron/main/**` 的**生产代码改动**，会把本案 write_set 从一处纯注释扩到跨两个 owner 的运行时开关。**为验证一个已被三处独立锁定的框架行为而在生产代码里开测试专用注入口，本身是更大的风险面。** 结论不变，理由更硬。

### R · S-0026 flagged item 收口为 (a)

`src/electron/tests/**` 属 devtools 边界而非 electron。devtools 实测两组三槽 **6/6 存在**、四个 shim 内容逐字正确，并以**独立方法**交叉验证槽位计数（`find` 数文件系统得 40，与 HS-003 的 `--listTests | grep -c` 得 40 一致）。故 **AC-012 位置 (E) 第 (2) 步的常量 40 可直接冻结**，实施期预期对该目录零改动（因位置 (E) 采「在既有 S1 文件内追加」，S2/S3 是与被 require 文件内容无关的单行 require）。devtools **不请求把该目录折入 write_set**，代之以 M-30 的零成本机械触发器（见 AC-012 位置 (E)）。

## 与 intake 的偏差与本 owner 的新发现

以下均为本 owner 在 unchain `d5b0f71`（树干净）与 PuPu `28b1e0ef` 上自行核对的结果。

1. **新发现（词汇分叉）**：`run_max_iterations` 是 durable lifecycle 事件（`context/projector.py:35-49` 列入 `_LIFECYCLE_EVENT_TYPES`，经 `_project_bounded_event` 落盘），且被 GraphCheckpoint 当作 failed terminal（`graph_checkpoint.py:44-46`），但**不在** rebase validator 的 `_ATTEMPT_TERMINAL_EVENT_TYPES`（`sqlite_generation_rebase_v2.py:56-69`）内。因此一个 max-iterations 收尾的 attempt（graph 或普通）在 rebase 里零 terminal → 永久 `:1462` Blocked。这是 intake 未涵盖的第二条 producer/consumer 分叉，也是 BC-002 存在的直接理由。
2. **新发现（不能简单补进 terminal 集合）**：`run_max_iterations` 并非可靠 terminal。`kernel/run_limits.py:44` 在 `on_max_iterations` 可调用时**先**发该事件，用户批准增额后 run 继续，最终仍走 `run_completed`。若直接把它加进 canonical terminal 集合，这种形态会变成"重复 terminal" → UNAVAILABLE，属新引入的回归。故采用"仅当组内零 canonical terminal 且它是最后一条时才视为 terminal-equivalent"的窄规则（AC-005）。
3. **路径更正**：intake §3 写 `src/SERVICEs/context_v2_turn_mutation.js`，实际在 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js`（`TERMINAL_REBASE_ERROR_CODES` 在 :367-377，注释明确 unknown code 按 retryable 处理）。`turn_mutation_outbox.js` 确在 `src/SERVICEs/`。
4. **行号确认**：`_assert_no_open_attempt_or_tool` 在 :1326，attempt 分组在 :1447，三条判定在 :1456 / :1462 / :1466；`_assert_durable_preflight` :1306，唯一调用点 :1670；`GenerationRebaseKind.CREATE` 跳过 preflight 在 :1312-1313。`tests/context_v2/test_sqlite_generation_rebase_v2.py` 对 `graph` 零命中，`match="unfinished durable attempt"` 在 :997、`match="duplicate terminal events"` 在 :1141，`:1466` 的 message 在两仓测试与源码中仅出现于定义处 —— `:1464` 分支零覆盖确认。
5. **冷恢复测试**：函数 `test_restart_seals_canonical_terminal_left_before_graph_checkpoint` 定义在 `tests/context_v2/test_graph_checkpoint.py:299`（intake 记为 :300，指向函数体）。该文件已具备真实 store / journal / projector / sink / service 全套装配，是 AC-001 契约测试的现成基础。
6. **本 owner 复核 SLOT-003 时的追加发现（强化不泄漏面）**：message 在跨进程链路上被覆写**两次**而非一次。第一次在 sidecar route 层覆写为 `"Unchain-owned generation request failed"`；第二次由 Electron main 的 `createContextV2Error(code, "context v2 request failed")` 完成 —— 该函数**定义在** `electron/main/services/unchain/service.js:185-189`（注释 :181-184），**调用点在** `:1978-1986` 的 `contextV2Request` catch 块（M-20 更正：PS-003 只记了调用点；AC-012 位置 (E) 的 E4 要锁的模板在定义处）。main 只保留 code，把 message 整体替换为自己的常量。因此 **sidecar 的 message 根本到不了 renderer**，renderer 的 `error.message` 恒为 `[code] context v2 request failed`。这使 BC-004 的不泄漏性质比 SLOT-002 与 SLOT-003 各自论证的更强：即使某天 sidecar 的覆写被误删，载体层仍会拦下。同一文件 :180-183 的注释明确写着"Electron strips error.code across ipcMain.handle"，即 M-9 所依据的机制是被实现者自觉记录的既有契约，不是偶然。
7. **未复核项**：chief-directive 中关于用户运行环境与用户数据库的事实（manifest sha256、三个 graph 的具体形态、quick_check、FK）来自 intake 材料，本 owner **未**打开用户数据库，AC-013 是复核它们的手段而非结论。

## 状态序列基线矩阵映射

| `cross-boundary-contract-gate` 基线单元格 | 覆盖 |
|---|---|
| 1 第一次正常消息 | SEQ-001 first use（AC-001）、SEQ-004 first use（AC-012） |
| 2 同一 chat 第二次正常消息 | SEQ-001 repeat（AC-003）、SEQ-004 repeat（AC-012） |
| 3 第一次 interaction | SEQ-001 resume（AC-008） |
| 4 同一执行第二次 interaction | SEQ-001 resume（AC-008） |
| 5 retry 与 durable resume | SEQ-001 retry、SEQ-002 retry / resume（AC-002、AC-003） |
| 6 sidecar 冷重启后 resume / replay | SEQ-002 restart（AC-003） |
| 7 normal / graph / subagent 路径 | SEQ-001（graph step）、SEQ-003（orchestration，含 delegated / shadow）、AC-006（普通与 subagent child attempt） |
| 8 provider / manifest / artifact identity 变化 | SEQ-006 运行时 manifest 侧、SEQ-007 artifact provenance 侧（均 AC-014） |

## 送裁前仍缺（本 owner 自评）

1. `boundary_revision_set` 为 `PENDING_CANDIDATE_FREEZE`。填写规则：producer 值 = 为本 candidate 一次构建、全程复用的那个 unchain wheel 文件的 SHA-256；consumer 值 = 同一次构建对应的 PuPu candidate 构建产物的 SHA-256。两者冻结后需逐字写入 frontmatter 与四个 BC 的 identity/version binding。
2. SLOT-002 / SLOT-005（HS-001）、SLOT-003（HS-002）与 SLOT-004（HS-003）已填满；BC-003 consumer、BC-004 producer 与分类段 consumer、SEQ-004、SEQ-005、SEQ-006 的 owner 确认已取得。仍缺：SLOT-007（shared-arteries，BC-004 第三跳反解段）与 SLOT-006 / SEQ-007（devtools）两棒。
2d. **Known unknowns（RS 窗口内可由相应 owner 直接答复，均不阻断冻结）**：**U-24** `upload-artifact@v4` 对同名 artifact 的行为未实测（本仓未显式设 `overwrite`）—— 不阻断，SEQ-007 的 retry 取证已钉为「重跑 `package-matrix`」而不依赖它，消除它的代价是一次真实 CI 重跑观察；**U-25** 位置 (D) fixture 是否被 pytest **就地覆写** —— V-7 与本地门工作树指纹的行为**完全取决于**这一点：就地覆写则两道工作树门成为独立第二重保险，写临时路径后比对则它们对 fixture 漂移不产生任何信号。**请 code-owner-runtime 在 RS 窗口内明示**；devtools 与本 owner 均倾向「就地覆写后比对」（使漂移在两个独立机制下都可见，且失败时 `git diff` 直接给出人可读差异）；**U-26** V-8 所需的精确 pytest nodeid 在 AC-011 子例 6 落地前不存在，故 V-8 目前只能作为义务描述存在 | code-owner-runtime。
2c. **RS 冻结前必须处置的四项（本 owner 清单）**：(0) **AC-014 现由三方分段撰写** —— 运行时段 runtime（HS-001）、artifact 段 devtools（HS-005）、总述与绑定 lead；冻结 RS 时须与 AC-012 同理，把 AC-014 列入这三方的 owned block 或直接依赖范围（devtools 已明文请求）。(i) **AC-012 现由五方分段撰写** —— (A)(B)(C) chat-core、(D) fixture 由 runtime 的 AC-011 子例 6 产出、(E) electron、(F) shared-arteries；冻结 RS 时 AC-012 必须同时列入这几位 owner 的 owned block 或直接依赖范围，否则会出现「有人对自己撰写的正文无权登记 stance」（S-0022 已挂账，两位 owner 各自请求过）；(ii) 位置 (D) fixture 现有**三个 owner 的测试读它**（(D) 自身、(E) 的 E2、(F) 的 G2/G3），PLAN_RULING 应把该路径视为稳定引用点，若最终落在别处须在同一次编辑中更新三处；(iii) 两位 owner 的 stance 均为**有条件 AGREE** —— electron 以 M-16/M-17 被处置为条件（已采纳并已开棒，条件满足），shared-arteries 以 M-27 为唯一条件（已采纳，K-18）；(iv) R6 仍未裁定，按 S-0011 / S-0017 / S-0022 列为 `mandatory responses`。
2b. **SUMMARY 必须并列显名两条 coverage gap**（S-0016 强制第一条，载体 owner 新增第二条，本 owner 采纳并加第三条形式说明）：(a) BC-004 载体段的 owner 义务由 HS-003 contribution 与 RS stance 承载，未占据 BC-004 的两个 confirmation 字段；(b) BC-004 第三跳的准入元素由 `code-owner-shared-arteries` 边界内的代码实际执行 —— HS-004 已返回，该 owner **已知情、已同意并接受行为式持续义务**，故本项由「无人确认」收口为「仅形式上未占 BC 字段」，与 (a) 同级；(c) 因此 BC-004 是一份**四方义务、两个字段**的契约，字段槽位不足是本案 boundary protocol v1 下的结构性限制，不是任何一方的疏漏，是否需要拆分 BC 由 Chief 裁量（拆分代价：使 HS-001 与 HS-002 两个已冻结确认失效，本案已三次实测同一约束）。
3. AC-013 需要 Chief 明确授权提供用户库只读副本。
4. `case.md` 需由 Speaker 按本 PS 重新同步：`current_artifact_ref` 指向 PS-002，`state_sequence_refs` 与 `当前 state sequences` 需加入 SEQ-007。
5. PS 的 `content hash` 按下述可复算方式取值：对 `proposal.md` 中位于该 PS 标题行之前的全部字节做 SHA-256。`boundary object hash` 按[边界契约规范](../../../codex/lifecycle/boundary-contracts.md)的 `quorum.boundary.objects.v1` 算法对本文件全部 BC / SEQ 对象计算。
6. **HS scope 的时间性约束（本次集成中发现并已规避）**：HS-001 的 scope 冻结于 S-0005，因此不能承载在其返回中才诞生的新 AC。SLOT-002 建议新设一条 AC-016 承载 BC-004 producer 的信封自证，若照办，BC-004 的责任 AC 集合会包含一个 HS-001 scope 之外的编号，其 producer 确认在送裁门禁上立即失效（`quorum_lint` 的 `confirmation handoff scope does not cover responsibility criteria`），并被迫向 runtime 再开一棒。本 owner 因此把该验收**逐字保留为 AC-011 子例 6**（这正是 SLOT-002 自己采用的结构，其原文即写「见 §7 AC-016，作为 AC-011 的引用项，不重复计数」），只去掉独立编号；BC-004 的 positive 改为 `AC-011, AC-012`，producer 侧因此拥有一条有正文的自证 AC，S-0006 defect 2 得解且不产生额外交棒。新编号 AC-016 让给 SLOT-001 自己的只读 plan 定位辅助，它由 LEAD 确认，不受任何 HS scope 约束。
7. **M-13（SEQ-004 拆独立负向 AC）已评估后不采纳**，理由与第 6 条同源且已实测：HS-002 的 scope 冻结于 S-0010，其 AC 集合为 `AC-010, AC-011, AC-012`。给 SEQ-004 增设新编号会使其责任 AC 集合溢出该 scope，`quorum_lint` 立即报 `confirmation handoff HS-002 scope does not cover responsibility criteria ['AC-012', 'AC-017']`（本 owner 已在临时副本上实跑复现后回滚），后果是刚刚取得的 chat-core 确认失效并被迫再开一棒。M-13 的实质诉求是"验收时能逐格追踪哪一格失败"，已由 SEQ-004 新增的 **cell 到子例映射**字段满足 —— 七个 REQUIRED 单元格各自指向 AC-012 的一个具体子例，负向六子例也逐条列明。若 Chief 仍要求拆分为独立编号，代价是向 code-owner-chat-core 追加一次仅为重新确认的交棒，建议在 RS 阶段一并处置而不是现在。
8. SLOT-002 的内联 recovery 使 `rebase_session` 在恢复路径上成为写者（风险 R6）。本 owner 采纳内联方案并已把改写后的不变量写进 AC-011 子例 8；若 Chief 认为"失败路径成为写者"不可接受，退路是新 endpoint `POST /context/v2/session/graph-recovery`，编排逻辑一字不变，代价是 SLOT-004 从"确认透传"升级为"新增 channel + preload bridge"。**该取舍应在 SLOT-004 交棒之前定下**，否则 electron 侧的交付规模无法确定。

## 决定点索引（供 Chief 裁定）

- **K-1** crash window 分类：`GenerationRebaseRecoveryRequired(GenerationRebasePreflightBlocked)` + 结构化 reason，不用裸 in_progress，也不用 Unavailable。SLOT-002 已复核该降级路径成立。
- **K-2** 恢复动作归属：validator 严格只读，恢复由 host 内联编排；Unchain 提供只读 plan 定位辅助。
- **K-3** orchestration 分类：接受 (b) graph-sealed 与 (c) graph-dead 两种非 run-terminal 的 quiescence 形态。
- **K-4** `run_max_iterations` 只在"零 canonical terminal 且为组内最后一条"时作 terminal-equivalent；graph step 内多 terminal 候选判 UNAVAILABLE。
- **K-5** 残留项，不在本案修：GraphCheckpoint 把 `run_max_iterations` 归入 failed 家族，意味着"批准增额后继续跑"的 graph step 会在 producer 侧被 `_terminal_after_start` 判为 ambiguous 而无法 seal。本案只保证 consumer 侧对该形态给出确定且不重试的结论。
- **K-6** 只读 plan 定位辅助：**交付**，纳入 BC-002 与 write_set，plan 对象在 PuPu 边界上为不透明句柄。这使 SLOT-002 的自动恢复成立；若 Chief 否决，SLOT-002 结论翻转为 crash window 直接 terminal + quarantine，热循环仍止、outbox 仍保，但每次 crash window 需用户介入。
- **K-7** AC-007 (b) 的安全性由聚合优先级与 generation 范围的扫描结构保证，**不以任何 PuPu 侧 attempt 编号约定为前置条件**；AC-007 (f) 把它变成显式取证用例。
- **K-8** operation / head revision / source generation / chat binding 四个 conflict 族纳入封闭枚举，枚举对模块全部 raise 点满射，使 sidecar 可彻底删除关键词分类；`unavailable` 桶另加基础设施族。
- **K-9** 跨进程并发恢复良性：journal append 以 `operation_id` 幂等去重、字节分歧时 fail closed，故 SLOT-002 的进程内 live 闸足够，不需要跨进程锁。
- **K-10** SEQ-006 按 identity key 拆分为 SEQ-006（runtime manifest 准入，runtime 已确认）与 SEQ-007（artifact provenance，devtools 待交棒）。采纳 SLOT-002 的 M-7 建议 (ii)，代价是队列末尾多一棒。
- **K-11** terminal 拆成"是否停止自动重试"与"停止后如何处置条目"两个正交概念；`journal_incompatible` 是 terminal-quarantine，既有九个 conflict code 维持 terminal-discard 不动。BC-004 的 failure semantics 因此限定范围，不推翻本案之外的既有行为。
- **K-12** BC-004 按 M-9 改写为**三跳传输契约**：CLOSED 的比较对象是 **code token 与格式**（`^[a-z0-9_]{1,64}$` 且紧跟空格），不是 JSON key set —— 因为 Electron main 把信封压成 `[code] message` 字符串，`retryable` / `expected_revision` / `actual_revision` 物理上不跨越 IPC。载体的逐字保真义务由 SLOT-004 补测试锁定。
- **K-13** 未知 code 到界后进 `paused` 而非 `quarantined`，与 BC-003 对未知 reason 的立场保持一致。
- **K-15（U-13 定案）** BC-004 第三跳的 CLOSED 准入判据由 `code-owner-shared-arteries` 边界内的一行正则**实际执行**，而该 owner 在本案从未被交棒。**采纳 M-17 的 (a) 与 (c)：既在 BC-004 consumer 字段与 SUMMARY coverage gap 显名，也向 shared-arteries 开一棒 HS-004。** 不止步于 (a)/(b) 的三条理由：(i) 这不是形式瑕疵而是**知情缺口** —— (b) 的镜像断言能让漂移变红，却仍未让唯一有权改那行代码的人知道它是一份跨仓 CLOSED 契约的执行点，下一次改动仍可能在无知情下发生；(ii) 陷阱是**已证实且有同目录先例**的（`run_bundle_storage_bridge.js:16` 正是加锚定写法，第三跳既有测试只覆盖裸形式），防护形状应由拥有该文件的人在其边界内定义，而不是由外部 owner 替他写一条约束；(iii) 成本对比明确 —— 一棒极小 scope 的交付，对比载体 owner 已声明"若 M-17 被以不处理结案且不显名则改登记 OBJECT"所必然带来的辩论庭。**队列顺序：shared-arteries 先于 devtools** —— 它直接影响 BC-004（已在 artifact 内的对象）的完整性，而 SEQ-007 是独立且追加性的。
- **K-21（V-2，devtools 同意的条件之一，已采纳）** AC-014 运行时段那条「pytest 比对 evidence digest」的 session 级断言**今天物理上不可写** —— 两处 pytest 运行环境都只给 `PYTHONPATH`。补法是纯 env 追加、零风险、两处同时加，落在 devtools 边界，**应最先落地**。本 owner 复核确认该缺口属实：这是我在 PS-002 写下该断言时未核实执行环境所致，devtools 的指出是对的。
- **K-22（V-1b，devtools 同意的另一条件，已采纳）** 「三处 wheel SHA-256 逐字相同」今天在报告上**无法核验** —— 报告唯一的一致性断言比的是同一 evidence 文件的两个搬运副本，而非任何 runner 的观测值；可证伪路径实测存在且已铺好（env 未设时回落到可变的相邻 checkout 重建 wheel）。V-1b 把观测值送进报告并判等，是让 SEQ-007 `expected observations` 第一句真正有执行点的唯一途径。**在此之前，该句只是一条没有执行点的观察** —— devtools 拒绝在缺口无归属时确认它，判断正确。
- **K-23（M-32）** `INCOMPLETE` 不是报告 schema 的状态值，按四条可观察后果的约定表达；**不为词汇对齐改报告 schema**。
- **K-18（M-27，反解段 owner 同意的唯一条件，已采纳）** AC-012 的「反解正则不得 import 实现、须 in-file 重声明」**只约束位置 (E) 的载体格**；位置 (F) 适用**相反规则**，G1–G7 必须调用真实导出的 `parseContextV2ErrorCode`。理由不是让步而是对称：禁令的立法意图是"被测对象是载体时不得与反解段共用实现"，而位置 (F) 的被测对象**就是**反解段，禁 import 会使测试与生产彻底脱钩、防护归零。producer 真实性在该位置改由 fixture 驱动承担。
- **K-19** 锚定禁令由语法表述升级为**行为表述**（M-23）：「必须能从任意位置还原第一个 `[<code>] ` token；任何使还原结果依赖 token 位置的改动均被禁止」。理由是语法禁令欠定 —— 六种改法满足其字面而破坏效果相同。防护主体因此必须是行为断言，源码文本守卫只作从属层且其价值在可理解性而非可检出性。
- **K-20** `context_v2_bridge.js:53-56` 的契约注释补写**纳入 write_set**，由 PLAN_RULING 授权。它是三层防护里单位成本最低的一层，且今天的注释缺口正是陷阱得以存在的直接原因（同目录 settings bridge 两者俱全）。
- **K-16** AC-012 位置 (E) 采用 `E1`–`E9` 编号而非续接"子例 15+"（M-21），避免"子例"在同一 AC 内指两类对象并扰动 SEQ-004 已冻结的 cell 映射；与 K-14 同一约束，不新增 AC 编号。
- **K-17** 位置 (D) 的 fixture **入库**（U-14），由 AC-011 子例 6 重新生成并 diff 校验；不入库会使两个 jest runner 在未跑 pytest 的环境变红，而 E2 的强度依赖它。
- **K-14** 不为电子载体段、也不为 SEQ-004 的负向另设新 AC 编号（均会溢出已冻结的 HS scope）；载体段作为 AC-012 位置 (E) 待 SLOT-004 交付，负向由 SEQ-004 的 cell 到子例映射逐格追踪。这是本案第二次遇到同一约束，处理方式与 K 前序一致。

### BC-001 | GraphCheckpoint durable graph journal 到 generation rebase quiescence validator
- **producer**: 真实 `GraphCheckpointService` / `JournalGraphCheckpointRepository` 经 `BoundExecutionJournal` 落入 Context V2 `events` 表的 graph 生命周期事件（`graph.execution.admitted`、`graph.step.started`、`graph.step.resume.admitted`、`graph.step.completed` / `failed` / `cancelled`、`graph.execution.completed`）与同 attempt 的 kernel lifecycle 事件
- **producer owner**: code-owner-unchain
- **consumer**: `SQLiteGenerationRebaseV2Service._assert_durable_preflight` 内的 attempt quiescence validator
- **consumer owner**: code-owner-unchain
- **canonical representation**: `unchain.attempt_quiescence.v1`，即按 `attempt_id` 分组、按 `store_seq` 升序的 runtime event 序列，加上从 seal payload 严格解析出的 step seal descriptor（step 绑定、terminal_cursor、execution_event_range、graph_plan_id、graph_scope_id）
- **consumer projection**: 每个 attempt 组判为 PLAIN / GRAPH_STEP / GRAPH_ORCHESTRATION 之一，各自产出 PASS / BLOCKED / RECOVERY_REQUIRED / UNAVAILABLE，按 UNAVAILABLE 高于 RECOVERY_REQUIRED 高于 BLOCKED 高于 PASS 聚合为单一 preflight 结论
- **admission policy**: CLOSED
- **admission details**: seal payload 精确 key set；terminal 家族与 seal status 一一对应；seal 必须是组内最后一条且为 run terminal 的直接后继；GRAPH_STEP 必须恰有一条 `graph.step.started`；GRAPH_ORCHESTRATION 必须恰有一条可解析 plan 的 `graph.execution.admitted`；cursor 与 step 绑定逐字比较
- **unknown input behavior**: 未知 `graph.*` 事件类型、seal payload 未知或缺失 key、无法解析的 plan / step / cursor 一律 fail closed 为确定性 UNAVAILABLE，不放行且不写入
- **failure semantics**: 判定发生在 `BEGIN IMMEDIATE` 事务内、任何写入之前；失败即整体回滚；journal 一行不改；validator 全程只读，绝不调用 `recover()` 或任何 append 路径
- **identity/version binding**: PENDING_CANDIDATE_FREEZE；expected pair 为 producer 一次构建的 unchain wheel SHA-256 加 consumer PuPu candidate 构建产物 SHA-256，冻结后逐字写入本字段；运行时兼容只由实际 import 的 runtime protocol manifest 决定，Git revision 与源码路径仅作遥测
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-001, AC-003, AC-007
- **negative acceptance**: AC-002, AC-004, AC-005, AC-006, AC-008

### BC-002 | 共享 attempt quiescence 词汇到 producer 与 consumer 两个 importer
- **producer**: 新增单一定义模块 `src/unchain/journal/graph_attempt_quiescence.py`，导出 canonical run terminal 家族、graph 事件类型、seal 与 terminal status 的对应映射、严格 seal descriptor parser，以及只读 plan 定位辅助（从 `graph.execution.admitted` payload 重建 exact `GraphExecutionPlan`），沿用 `journal/interaction_resolution_compat.py` 已被 compiler、graph checkpoint 与 rebase 三方共用的先例
- **producer owner**: code-owner-unchain
- **consumer**: `src/unchain/context/graph_checkpoint.py` 与 `src/unchain/persistence/sqlite_generation_rebase_v2.py` 各自的常量与判据引用点；plan 定位辅助另由 PuPu sidecar 的 recovery 编排以**不透明句柄**方式调用
- **consumer owner**: code-owner-unchain
- **canonical representation**: 不可变 frozenset 与映射常量、纯函数 parser，以及一个纯读的 plan 定位函数；无写入、无 artifact 落盘、无 admit
- **consumer projection**: 两侧只 import 不本地重定义；GraphCheckpoint 既有语义逐字保留，包括把 `run_max_iterations` 归入 failed 家族；rebase 侧的 canonical terminal 集合与 graph terminal 家族是两个显式不同的常量；plan 定位辅助与 `scan()` 的 admission 唯一性判据共用同一函数
- **admission policy**: CLOSED
- **admission details**: 两个 terminal 集合的差异必须携带不可省略的书面理由，即 `run_max_iterations` 在 `kernel/run_limits.py` 中可能后接继续执行，因此不是可靠 canonical terminal；任一侧新增事件类型只能改这一处。plan 定位辅助返回的 `GraphExecutionPlan` 在 PuPu 边界上是**不透明句柄**：sidecar 只可原样交回 `recover` 或 `finalize`，不得读取、序列化、记录或重建其任何字段；因此该对象不构成跨仓 wire schema，也不得被复制到第二个仓库
- **unknown input behavior**: 未列入词汇表的 `graph.*` 事件类型在 consumer 侧 fail closed；plan 定位对零条或多条 `graph.execution.admitted`、payload 不可解析、execution 不符一律抛 `graph_plan_descriptor_invalid`；producer 侧本案不新增事件类型
- **failure semantics**: 模块导入期不做任何 I/O；plan 定位失败不写入任何行；集合与判据分叉由 divergence 测试在测试阶段失败，不进入运行时
- **identity/version binding**: PENDING_CANDIDATE_FREEZE；与 BC-001 使用同一 expected pair，冻结后逐字写入本字段
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-005, AC-015, AC-016
- **negative acceptance**: AC-006, AC-016

### BC-003 | Unchain 结构化 rebase 失败 detail 到 PuPu sidecar 错误分类器
- **producer**: `GenerationRebaseError` 族实例携带的结构化 `detail`，由 `src/unchain/persistence/sqlite_generation_rebase_v2.py` 的全部 raise 点产出
- **producer owner**: code-owner-unchain
- **consumer**: PuPu sidecar `unchain_runtime/server/memory_v2_unchain_generation_api.py` 的 `_translate_rebase_error` 与 `route_memory_v2.py` 的 rebase 端点
- **consumer owner**: code-owner-runtime
- **canonical representation**: `unchain.generation_rebase_failure.v1`，exact key set 为 schema、reason、subject；reason 取自对本模块全部 raise 点满射的封闭枚举；subject 为 identity-only 的有界映射，每字符串值 ≤ 256 字符、键数 ≤ 12、canonical JSON ≤ 2048 字节
- **consumer projection**: 由 reason 而非 `str(error)` 关键词决定 error code、HTTP status 与 retryable，三级取值 L1 detail / L2 异常阶梯 / L3 遗留关键词，任一级不成立即降级且绝不混用；detail 不整体转发给 renderer，只投影为允许的 code；sidecar 出网前对 code 做封闭集合校验，集合外的 code 降级为 `context_v2_rebase_unavailable` 并记 error 日志。BC-002 的 plan 定位辅助返回值在本 consumer 处为不透明句柄，只可原样交回 unchain，不得读取、序列化、记录或重建其字段
- **admission policy**: VERSIONED
- **admission details**: schema 版本化；detail 缺失、非 Mapping、schema 不符、key set 不精确、reason 非字符串或不在映射表内，一律视同没有 detail 并降级到确定性异常阶梯，不做半解析；全部既有 reason 的 `str(error)` 逐字不变以支持两仓部署次序不同的 skew
- **unknown input behavior**: 未知 reason 或缺少 detail 时回退到确定性的异常类型阶梯（不比今天宽松，也不比今天严），并发一条含 reason 与有界 subject 的结构化 warning 日志与计数使 skew 可见；「不进入无界重试」的义务由 BC-004 的持久化有界上限与 SLOT-002 的 server 侧上界共同承担，不由此处的 code 选择承担 —— 给未知 reason 一个 terminal code 会 quarantine 掉本可自愈的瞬时状态
- **failure semantics**: fail closed；分类失败不得丢弃 frozen outbox、不得推进 generation、不得改写 head revision
- **identity/version binding**: PENDING_CANDIDATE_FREEZE；与 BC-001 使用同一 expected pair，冻结后逐字写入本字段；兼容准入只由实际 import 的 runtime protocol manifest 决定
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: HS-001
- **positive acceptance**: AC-009, AC-011
- **negative acceptance**: AC-010

### BC-004 | Sidecar rebase error code 到 renderer outbox retry 分类
- **producer**: sidecar `_error_response` 输出的错误信封，字段为 code、message、retryable 与可选的 expected_revision、actual_revision
- **producer owner**: code-owner-runtime
- **consumer**: 分两段。**反解段** `src/SERVICEs/bridges/context_v2_bridge.js` 的 `parseContextV2ErrorCode` 与 `ERROR_CODE_TOKEN_PATTERN`（:53-57, :77-82）。**该正则执行 5 项准入元素中的 3 项**（M-22 精化，避免下一个改这行的人误判）：(i) 字符集锁 `[a-z0-9_]`、(ii) `] ` 分隔符、(iii) **位置无关的首 token 选择**（未锚定模式上 `.exec()` 的首次匹配语义）由它执行；(iv) `{1,64}` 长度上界在**消费侧无任何执行点**（`+` 即 1..∞），属 producer 义务，载体按 AC-012 E3 明示不得守门 —— 超长 token 落未知 code 走有界重试到 `paused`，该降级安全，反解段 owner 明确**不要求**补长度门；(v) 封闭 code 集合成员判定在 chat-core 的分类段。**分类段** `src/PAGEs/chat/hooks/context_v2_turn_mutation.js` 的 terminal 与 in-progress 分类，以及 `src/SERVICEs/turn_mutation_outbox.js` 的 frozen 条目重放。rebase 失败的 code 在 `use_chat_stream.js:4069-4073` 由反解段解析后才进入分类段（`:4073` 才是 `isTerminalContextV2RebaseError` 的调用行）。**owner 归属**：分类段属 code-owner-chat-core（`turn_mutation_outbox.js` 是其显式 carve-out），已由 `consumer owner` 字段承载；**反解段属 `pupu:src/SERVICEs/bridges/**` = code-owner-shared-arteries**。本 BC 的 confirmation 字段只有两个且已被 producer 与分类段占满，故反解段的确认以 HS-004 contribution 与 RS stance 形式承载，并作为 SUMMARY 的 coverage gap 显名项（见「送裁前仍缺」第 2b 条与 K-15）
- **consumer owner**: code-owner-chat-core
- **canonical representation**: 本契约跨三跳，canonical 表示按跳分别固定。**第一跳（sidecar HTTP）**：JSON error envelope，key set 精确为 `{code, message, retryable}` 加条件出现的 `expected_revision` 与 `actual_revision`。**第二跳（Electron main 载体）**：`ipcMain.handle` 会丢弃 `error.code`，因此 main 把错误重建为字符串 `` `[${code}] ${message}` `` 并把 message 替换为自己的常量，`retryable` / `expected_revision` / `actual_revision` **物理上不跨越 IPC 边界**。**第三跳（renderer 消费）**：renderer 的实际输入**不是** main 产出的裸串，而是 Electron 再包一层后的形式 —— 本仓已记载并断言的形状为 `` `Error invoking remote method '<channel>': [<code>] <message>` ``（`settings_storage_bridge.js:100-108` 与其测试 `:718-760`），HS-003 另观察到含 `Error: ` 的变体；两种变体在下述约束下都能反解。第三跳用 `/\[([a-z0-9_]+)\]\s/` 取**第一个** code token。**该正则不得加起始锚定**：加锚定的 `/^\[([a-z0-9_]+)\]/` 在包裹形式下恒返回 null（同目录 `run_bundle_storage_bridge.js:16` 正是该写法），整条分类链会静默退化为"未知 code → paused"，`journal_incompatible` 的 quarantine 语义随之丢失，且今天没有任何测试会因此变红。因此 `retryable` 不是"咨询性遥测"而是**不可达**，`code` 是 renderer 侧唯一的分类输入
- **consumer projection**: code 映射为五类之一 —— terminal-discard（既有九个 conflict code，fingerprint 未变时删除条目，本案不改）、terminal-quarantine（`context_v2_rebase_journal_incompatible`：停止自动重试并**保留条目与 payload**）、recovery_required（固定两级 250ms / 750ms 退避，专属上界 2，到界转 quarantine）、in_progress 与其余可重试 code（`min(60_000, 250·2^(n-1))` 阶梯，共享上界，到界转 paused）、unavailable（视为基础设施故障，保持非 terminal 并受同一共享上界约束）。renderer 使用带 `context_v2_` 前缀的 code 全名。**"terminal"在本仓的现行语义是删除条目，因此把新 code 放进 terminal 集合而不同时区分处置，必然销毁用户 frozen payload**；契约要求 terminal 一类内显式分叉为 discard 与 quarantine 两种处置
- **admission policy**: CLOSED
- **admission details**: CLOSED 的比较对象**不是 JSON key set** —— consumer 侧没有 JSON 可比对（第二跳已把信封压成字符串）。实际准入判据是 **code token 与格式**：code 匹配 `[a-z0-9_]` 字符集且紧跟一个 ASCII 空白字符（契约文本对齐实现的 `\s`，M-24；producer 模板恒发射字面空格，故今日无差异），且属于封闭 code 集合（该项由 chat-core 分类段执行，五元素分列见 `consumer` 字段）。**反解段的持续义务按行为表述，不按语法表述（M-23）**：`parseContextV2ErrorCode` **必须能从 message 字符串的任意位置还原出第一个 `[<code>] ` token；任何使还原结果依赖该 token 在字符串中位置的改动，均被禁止**。载体义务：Electron main **必须逐字保留任何匹配 `^[a-z0-9_]{1,64}$` 的 code**；对该集合外的输入允许且仅允许首尾空白裁剪（今日 `readJsonResponse` 的 `.trim()`），不得做任何其他变换 —— 不得 allowlist 过滤、不得改写大小写、不得截断、不得替换。「不得加起始锚定」只是该义务的**一个特例**，不是全部 —— 反解段 owner 逐条推演出六种满足「无 `^`」字面而破坏效果完全相同的改法：加 `^` 锚定、`startsWith("[")` 前置守卫、`indexOf("[") !== 0` 守卫、`split(": ")[0]` 先剥包裹、`y` sticky 标志、`$` 尾锚。防护因此必须以行为断言为主体（AC-012 位置 (F) 的 G1–G7 调用真实解析器），源码文本守卫（G8）只作从属层。两项义务今天都只由实现细节保证、零测试覆盖：载体侧由 SLOT-004 的 AC-012 位置 (E) 锁定，反解段由 SLOT-007 补防护。本次只新增 code 值，**不新增、不删除、不重命名任何 envelope 字段**；`message` 保持常量覆写，结构化 detail 不跨出 sidecar；新增 code 必须在 producer 与 consumer 两侧同时声明。重试计数必须随 outbox 条目持久化，不能只存在于组件内 ref，否则重挂载归零会重建热循环；并且**这些计数字段的任何取值都不得使 outbox 条目 normalize 失败** —— 单条目 normalize 失败会使整库 `available:false`，从而锁死每一个 chat 的输入面，是比无界重试更严重的故障模式
- **unknown input behavior**: 未知 code 进入有界重试并在耗尽后转 `paused`（保留 payload、停止自动重试、可由用户显式重试），**不判 quarantine** —— 把仅仅是"没见过"的 code 判成"确定性不兼容"，与 BC-003 对未知 reason 的立场自相矛盾
- **failure semantics**: 本案新增的两个 code、`recovery_required` 与任何未知 code 在任何失败下都不清空 outbox、不静默降级、不进入无界热循环。**限定范围**：既有九个 terminal conflict code 在 fingerprint 未变时删除条目是本案之外的既有刻意行为，不在 write_set 内，本条不推翻它
- **identity/version binding**: PENDING_CANDIDATE_FREEZE；与 BC-001 使用同一 expected pair，冻结后逐字写入本字段
- **producer owner confirmation**: HS-001
- **consumer owner confirmation**: HS-002
- **positive acceptance**: AC-011, AC-012
- **negative acceptance**: AC-010, AC-012

### SEQ-001 | Graph step attempt 从启动到 rebase preflight
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: execution_id 加 generation_id 加 orchestration attempt_id 加 step attempt_id 加 step index 加 terminal cursor 加 seal cursor
- **initial state**: 该 generation 在 receipt import 区间之外没有任何 runtime 事件，也没有任何 graph seal
- **ordered events**: derived handoff input 落盘 → `graph.step.started` → 模型与工具事件 →（可选 interaction request、resolution、`graph.step.resume.admitted`）→ `final_message` → run terminal → `graph.step.completed` → 首次 rebase preflight → 同一 frozen 请求再次 preflight
- **expected observations**: 首次 rebase 通过并恰好产出一次 receipt；同一 frozen 请求重放幂等，不新增 generation、head revision、receipt 或 events；缺 seal、seal 不相邻、seal 非末条、cursor 或 step 绑定不符时一律不放行且零写入
- **persistence boundary**: Context V2 SQLite `events` 表，producer 与 consumer 同库不同模块
- **boundary contracts**: BC-001, BC-002
- **positive acceptance**: AC-001, AC-003
- **negative acceptance**: AC-002, AC-004, AC-005, AC-008
- **first use**: REQUIRED | AC-001
- **repeat**: REQUIRED | AC-003
- **retry**: REQUIRED | AC-003
- **resume**: REQUIRED | AC-008, AC-001
- **restart**: REQUIRED | AC-003
- **reset**: NOT_APPLICABLE | durable journal 事件不可变，本序列没有 reset 操作；重来只能产生新的 attempt 与新的事件
- **rollback**: REQUIRED | AC-006

### SEQ-002 | Seal crash window 与冷恢复后重放
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: execution_id 加 generation_id 加 step attempt_id 加 terminal cursor 加 frozen rebase operation_id 与 payload_sha256
- **initial state**: step attempt 的 run terminal 已落盘，`graph.step.completed` 尚未写入，进程在 terminal 与 seal 之间中止
- **ordered events**: run terminal 落盘 → 进程中止 → 首次 rebase preflight → 只读 plan 定位 → 冷装配 service（不 admit）→ `recover(plan)` 补一条 seal → 同一 frozen 请求重试 → 再次重试 → 并发第二路恢复
- **expected observations**: 首次 preflight 返回 recovery_required 且 unchain `rebase()` 零写入；plan 定位纯读；`recover(plan)` 恰好追加一条 `graph.step.completed`；补 seal 后同一 frozen 请求成功；再次重试幂等；并发第二路恢复因 `operation_id` 去重而幂等返回、不多写一行，字节分歧时 fail closed 为 `GraphCheckpointConflict`；validator 自身在任何阶段都不写入
- **persistence boundary**: Context V2 SQLite `events` 表与 artifact store，跨进程冷重启；append 的幂等键是 `operation_id`
- **boundary contracts**: BC-001, BC-002, BC-003
- **positive acceptance**: AC-003, AC-016
- **negative acceptance**: AC-002, AC-009, AC-016
- **first use**: REQUIRED | AC-002
- **repeat**: REQUIRED | AC-002
- **retry**: REQUIRED | AC-003
- **resume**: REQUIRED | AC-003
- **restart**: REQUIRED | AC-003
- **reset**: NOT_APPLICABLE | 历史 journal 不得重写，crash window 只能由补 seal 前进，不存在回到初始状态的操作
- **rollback**: REQUIRED | AC-002

### SEQ-003 | Orchestration attempt 生命周期与分类
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: execution_id 加 generation_id 加 orchestration attempt_id 加 graph_plan_id 加 graph_scope_id 加 plan 步数
- **initial state**: orchestration attempt 只有 `graph.execution.admitted`，尚无任何 step seal
- **ordered events**: `graph.execution.admitted` → 各 step 依次 start 与 seal →（授权分支）`graph.execution.completed` 后 `final_message` 与 run terminal，或（delegated 与 shadow 分支）仅 `graph.execution.completed`，或（挂起与放弃分支）无后续 → rebase preflight
- **expected observations**: 授权 root graph 与 delegated / shadow 完成态均放行；全部 step 已 sealed 但缺 `graph.execution.completed` 判 recovery_required；存在失败或取消 seal 的死图放行；步数未走完或等待 interaction 保持 Blocked；重复 admitted、plan 不可解析、step seal 与 plan 不符一律 fail closed
- **persistence boundary**: Context V2 SQLite `events` 表；orchestration attempt 与各 step attempt 同 generation、不同 attempt_id
- **boundary contracts**: BC-001, BC-002
- **positive acceptance**: AC-007
- **negative acceptance**: AC-004, AC-008
- **first use**: REQUIRED | AC-007
- **repeat**: REQUIRED | AC-007
- **retry**: REQUIRED | AC-007
- **resume**: REQUIRED | AC-008
- **restart**: REQUIRED | AC-007
- **reset**: NOT_APPLICABLE | 已 admitted 的 plan 不可撤销，只能被 seal 或保持未完成，没有 reset 语义
- **rollback**: REQUIRED | AC-006

### SEQ-004 | 冻结 turn-mutation outbox 的重放与终局分类
- **owner**: code-owner-chat-core
- **owner confirmation**: HS-002
- **identity key**: `operationId`（renderer 侧唯一主键，全程用于去重、CAS 与删除）加 owner_chat_id 加 session_id 加 frozen payload 的固定 key 顺序 JSON 字节（renderer 侧不存在 `payload_sha256`，同一性由字节稳定的序列化保证）加 expectedSessionRevision 加 `replayAttempts` 加 `recoveryRequiredAttempts`
- **initial state**: 用户的 edit、delete 或 resend 已冻结为 outbox 条目，四个计数字段为 `0 / 0 / "" / ""`（旧条目缺失即视为此值），尚未成功 rebase
- **ordered events**: 首次入队与发送 → 失败并按 code 分类 → 按阶梯退避重试 → 组件重挂载或应用重启（计数与阶梯位置从持久化状态恢复）→ 再次重放 → 到界转 paused 或 quarantined → 用户显式 Retry 重置 → 终局（成功、被用户 Discard 且文字经 composer 回填、或稳定停在需用户操作的状态）
- **expected observations**: 首次与第二次 edit / delete / resend 重放都不产生重复 generation、重复 head revision、重复 receipt 或重复 events；`journal_incompatible` 保留条目与逐字节不变的 payload 而非删除；重挂载既不重置计数也不绕过退避阶梯；到界后不再产生任何请求；除用户显式 Retry 外没有任何路径重置计数；任何失败都不清空用户的 frozen payload，Discard 时文字经 composer 回填
- **persistence boundary**: renderer localStorage `pupu.turn_mutation_outbox.v1`（不升版本号）与 Context V2 durable generation head
- **boundary contracts**: BC-004
- **positive acceptance**: AC-012
- **negative acceptance**: AC-012
- **first use**: REQUIRED | AC-012
- **repeat**: REQUIRED | AC-012
- **retry**: REQUIRED | AC-012
- **resume**: REQUIRED | AC-012
- **restart**: REQUIRED | AC-012
- **reset**: REQUIRED | AC-012
- **rollback**: REQUIRED | AC-012
- **cell 到子例映射**: first use → AC-012 子例 1；repeat → 子例 2 与 3；retry → 子例 4；resume → 子例 5；restart → 子例 6；reset → 子例 7；rollback → 子例 8。负向子例 9 至 14 分别锁定 quarantine 不丢弃、既有 discard 不回归、封闭集合穷举与 divergence、计数字段绝不使条目失效、静态文案与不泄漏、带 ack 条目不可 Discard。本映射使每一格可独立追踪失败，替代把负向拆成独立 AC 的做法（理由见「送裁前仍缺」第 8 条）

### SEQ-005 | 结构化失败 detail 在两仓部署 skew 下的分类
- **owner**: code-owner-runtime
- **owner confirmation**: HS-001
- **identity key**: unchain wheel SHA-256 加 runtime protocol manifest digest 加 reason 枚举值 加 sidecar 分类器版本 加恢复计数键 `(execution_id, generation_id, reason)`
- **initial state**: sidecar 使用今天基于 `str(error)` 关键词的分类器，Unchain 尚未产出结构化 detail
- **ordered events**: Unchain 升级并产出 detail 而 sidecar 未升级 → sidecar 升级并按 reason 分类 → 出现未知 reason 并回退到确定性阶梯 → **反向 skew：sidecar 已升级而 unchain 回滚到无 detail 的 wheel，分类器落回 L2/L3** → sidecar 重启使恢复计数归零
- **expected observations**: 未升级 sidecar 对全部既有 reason 得到与今天完全一致的 code；新增 reason 只落入 in_progress 或 unavailable，不落入任何丢弃 outbox 的分支；升级后按 reason 精确分类；未知 reason 走确定性阶梯并发结构化 warning 使 skew 可见；反向 skew 下得到与升级前逐字相同的 code
- **persistence boundary**: 进程边界与 HTTP 响应信封；除恢复路径按 AC-011 子例 8 的改写不变量外无持久化写入；恢复计数只存在于 sidecar 进程内存
- **boundary contracts**: BC-003
- **positive acceptance**: AC-011
- **negative acceptance**: AC-010
- **first use**: REQUIRED | AC-010
- **repeat**: REQUIRED | AC-011
- **retry**: REQUIRED | AC-011
- **resume**: REQUIRED | AC-011
- **restart**: REQUIRED | AC-011
- **reset**: NOT_APPLICABLE | 恢复计数只在 sidecar 进程内存活，没有外部 reset 操作；其归零由 restart 格覆盖
- **rollback**: REQUIRED | AC-010

### SEQ-006 | Runtime protocol manifest 准入与运行时 exact-pair 核对
- **owner**: code-owner-runtime
- **owner confirmation**: HS-001
- **identity key**: 实际 import 的 runtime module 导出的 manifest digest 加被测进程的安装 dist 的 wheel SHA-256 加 sidecar 分类器版本
- **initial state**: sidecar 未校验 manifest，运行时侧的 exact-pair 读数不存在
- **ordered events**: sidecar 启动并 import runtime module → 独立重算 manifest digest 并与导出值比对 → `GET /health` 暴露 digest → 契约矩阵在 `PYTHONPATH` 指向的安装 dist 上运行并做 session 级 digest 断言 → package smoke 从打包 sidecar 的 `GET /health` 再读一次 → wheel 回滚后重复上述全部
- **expected observations**: manifest 只来自实际 import 的 runtime module，digest 由 sidecar 独立重算且不符即 fail closed；`unchain_revision` 与 `unchain_runtime_source` 只作遥测，取证脚本有一条断言证明它们未参与任何 pass/fail、capability 或 admission 判据；三处读数一致，任一不同即 INCOMPLETE
- **persistence boundary**: 无持久化写入；边界为 sidecar 进程装载状态与 HTTP `GET /health` 响应
- **boundary contracts**: BC-003, BC-004
- **positive acceptance**: AC-014
- **negative acceptance**: AC-014
- **first use**: REQUIRED | AC-014
- **repeat**: REQUIRED | AC-014
- **retry**: REQUIRED | AC-014
- **resume**: NOT_APPLICABLE | manifest 校验是启动期一次性判定，失败即 fail closed 不启用能力，没有可恢复的中断态
- **restart**: REQUIRED | AC-014
- **reset**: NOT_APPLICABLE | 装载状态随进程存亡，没有独立的 reset 操作
- **rollback**: REQUIRED | AC-014

### SEQ-007 | Release artifact provenance 与 rollout 回滚
- **owner**: code-owner-devtools
- **owner confirmation**: HS-005
- **identity key**: 一次构建的 unchain wheel SHA-256 加 evidence 文件**所载三元组**（`artifact.sha256` + `runtime_manifest.manifest_digest` + `source.revision`）加 PuPu candidate revision 加 rollout 模式。（M-28 勘误：原写「evidence 文件 digest」，本仓**不存在**该可观测量 —— 无任何脚本计算 evidence 文件自身的 SHA-256；且不建议引入它，那会多一个必须在三处传递的量而检出能力不增加）
- **initial state**: 候选未冻结，evidence 文件不存在，rollout 结论为 INCOMPLETE
- **ordered events**: 一次构建产出 wheel 与 evidence → **安装该 wheel 并核对已安装 dist 的 `direct_url.json`**（`release-qa.yml:91-101`，M-29 补：这是 `expected observations` 第二句的**唯一**执行点，原序列缺此步）→ 冻结 PuPu candidate → 契约矩阵引用同一 evidence → package smoke → release report → active rollout → 需要时回滚
- **expected observations**: 契约矩阵、package smoke 与 release report 三处引用的 wheel SHA-256 逐字相同（**今天报告上无法核验，由 AC-014 的 V-1b 补齐后成立**）；已安装 dist 的 `direct_url.json` 中的 sha256 与 evidence 一致，因而不可能用可变的相邻 checkout 顶替（**今天已完全成立**）；任一处不同即 INCOMPLETE 而非 GO（机械表达见 AC-014 的 E 段）；回滚以 wheel 为单位且不删除任何 journal 或证据（**今天已完全成立** —— release-qa 全流程零 journal 写入，smoke 数据目录为 `mkdtempSync` 临时目录并在 finally `rmSync`，不触碰任何用户目录）。**rollout 与 rollback 在本仓是人工步骤**（改 `unchain_ref` 重跑），可观察结果的载体是 `release-qa-report.json` 的 `unchain` 块与 `git` 块，验收人不应去找一个不存在的自动化 rollout 执行点
- **persistence boundary**: 发布 artifact、evidence 文件与 CI 产物；不触碰用户 durable journal
- **cell 取证方式**（devtools 经 HS-005 逐格复核后钉死，避免验收时各自发挥）: first use 与 repeat 由既有机制承担，repeat 是本序列最扎实一格（同一 wheel 被 4 个平台各消费一次并逐平台比三字段，已有失败单测）；**retry** 取证为「重跑 `package-matrix` 并断言 sha 与首跑逐字相同」，以绕开 `upload-artifact@v4` 同名上传行为这一未实测项（U-24）；**restart** 已有天然取证（smoke 每次 spawn 全新进程与全新临时 `UNCHAIN_DATA_DIR`，并显式清空 `PYTHONPATH` 与 `UNCHAIN_SOURCE_PATH`）；**rollback** 今天无自动化执行点，取证为「以 `workflow_dispatch` 的 `unchain_ref` 指向前一版本重跑 release 模式，断言 sha 与 source_ref 已变、三处仍互等、结论不降级」
- **boundary contracts**: BC-001, BC-002, BC-003, BC-004
- **positive acceptance**: AC-014
- **negative acceptance**: AC-014
- **first use**: REQUIRED | AC-014
- **repeat**: REQUIRED | AC-014
- **retry**: REQUIRED | AC-014
- **resume**: NOT_APPLICABLE | 发布构建是一次性不可变产出，失败后重新构建新 candidate 而不是恢复中断的构建。**源码执行点**：`build-unchain-artifact.mjs:74-79` 对已含 wheel 的输出目录直接抛错，`run-with-unchain-artifact.mjs:68-72,118-122` 每次 mkdtemp 并在 finally rmSync —— 代码显式拒绝「接着上次继续」，该判定是源码事实而非设计声明
- **restart**: REQUIRED | AC-014
- **reset**: NOT_APPLICABLE | 已发布 artifact 不得 reset，只使用显式回滚。**已实测**：`.github/workflows/` 内零 `delete-artifact` 与零 `overwrite` 用法
- **rollback**: REQUIRED | AC-014

### PS-001 | 2026-08-15T20:46:30-07:00
- **supersedes**: null
- **included contributions**: 无
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:cf8b84c026cacd4c20fe3d2b0c2bf97dbdbd9a27f688be411cd38784e7a7fee4
- **content hash**: sha256:91211df464dcd60e2ffdb6d1ac0a9c577e0c0e6a0e209768048dfcc6fcda2709
- **formed_by**: code-owner-unchain

### PS-002 | 2026-08-15T21:32:30-07:00
- **supersedes**: PS-001
- **included contributions/amendments**: S-0007 / HS-001（`contributions/HS-001-code-owner-runtime.md`：SLOT-002 三级分类器与七 code 全表、出网 code allowlist、message 覆写处置、内联有界 recovery 编排、SLOT-005 不补写 root terminal、M-1 / M-2 / M-3 / M-4 / M-5 / M-6 / M-7、AC-011 正文、AC-014 sidecar 侧取证、出网信封封闭性验收）；S-0006 defect 1 与 defect 2 的处置；本 owner 对 U-1 / U-2 / U-3 / U-4 / U-5 的定案（K-6 至 K-9）
- **changed blocks**: 实施范围、owner slots（SLOT-002 与 SLOT-005 转 FILLED，新增 SLOT-006）、关键步骤与依赖、风险 R4/R6/R7、AC-002、AC-007、AC-009、AC-011、AC-014、新增 AC-016、state sequence obligations、设计正文第二节与第三节与第四节、新增「SLOT-002 交付正文」、送裁前仍缺、决定点索引新增 K-6 至 K-10、BC-002、BC-003、BC-004、SEQ-002、SEQ-005、SEQ-006 重定义、新增 SEQ-007
- **dependent review blocks**: code-owner-unchain、code-owner-runtime、BC-002、BC-003、BC-004、SEQ-002、SEQ-005、SEQ-006、SEQ-007、AC-002、AC-007、AC-009、AC-011、AC-014、AC-016
- **boundary object hash**: sha256:48db0adae9134690be1a78b212ec1806937c6697c4f5b4540414e5a97b09810c
- **content hash**: sha256:f533b4b43f98a950aa119dfc241105495faa659dbc1a09e5b5d2717c0720f730
- **formed_by**: code-owner-unchain

### PS-003 | 2026-08-15T22:06:00-07:00
- **supersedes**: PS-002
- **included contributions/amendments**: S-0012 / HS-002（`contributions/HS-002-code-owner-chat-core.md`：SLOT-003 六项交付、BC-004 consumer 与 SEQ-004 的 CONFIRMED_CONDITIONAL、AC-012 十四子例正文、M-8 至 M-15）；本 owner 对 U-8 / U-10 / U-11 / U-12 的定案与对 M-13 的不采纳裁量；本 owner 复核 SLOT-003 时的追加发现（main 层第二次 message 覆写）
- **changed blocks**: owner slots（SLOT-003 转 FILLED，SLOT-004 交付物扩为确认加两条测试）、风险 R6（并入 M-15 的完整代价）、AC-011 子例 6（增 fixture 产出义务，U-8 定案）、AC-012（全文，含位置 A 至 E 与十四子例）、SLOT-002 交付正文 A 表第五列（M-14）、新增「SLOT-003 交付正文」C 至 G 节、与 intake 偏差第 6 条（新发现）、送裁前仍缺第 2 与第 7 条、决定点索引新增 K-11 至 K-14、BC-004（M-8 / M-9 / M-10 / M-11 全面改写）、SEQ-004（M-12 identity key、ordered events、expected observations、cell 到子例映射、owner confirmation 转 HS-002）
- **dependent review blocks**: code-owner-unchain、code-owner-runtime、code-owner-chat-core、BC-004、SEQ-004、AC-011、AC-012、SLOT-003、SLOT-004
- **boundary object hash**: sha256:44e7f8d69fce30cc9dc8ba71f84cf8ed7e7872836f4134b4e006108f1a7c714d
- **content hash**: sha256:e9f82e71672d588840e5793691f7585bc4388ba829866e05a2ea0ed64e7103a4
- **formed_by**: code-owner-unchain

### PS-004 | 2026-08-15T22:41:00-07:00
- **supersedes**: PS-003
- **included contributions/amendments**: S-0018 / HS-003（`contributions/HS-003-code-owner-electron.md`：SLOT-004 五项交付、BC-004 载体段 CONFIRMED_CONDITIONAL、AC-012 位置 (E) 九格、M-16 至 M-21、三槽审计）；本 owner 对 U-13 / U-14 / U-15 / U-16 的定案（K-15 至 K-17）；本 owner 对包裹形式两种变体的复核
- **changed blocks**: owner slots（SLOT-004 转 FILLED，新增 SLOT-007）、风险新增 R8 与 R9、风险 R6（按 U-16 收窄 electron 侧代价）、AC-011 子例 6（fixture 入库，U-14）、AC-012 位置 (E)（全文九格与三槽规则）、SLOT-002 交付正文 A 表脚注（M-19）、新增「SLOT-004 交付正文」H 至 J 节、与 intake 偏差第 6 条（M-20 定义与调用点分列）、送裁前仍缺第 2 与新增 2b 条、决定点索引新增 K-15 至 K-17、BC-004（consumer 分两段、第三跳反解与非锚定约束、admission details 按 M-18 改写）
- **dependent review blocks**: code-owner-unchain、code-owner-runtime、code-owner-chat-core、code-owner-electron、BC-004、AC-011、AC-012、SLOT-004、SLOT-007
- **boundary object hash**: sha256:508b70a69118c54613a3e51e3e16110737a676e3f08f0f7c4fb21c2ad5918f1d
- **content hash**: sha256:a5b0aa35352cce0116d40834ca9bec4d99bfda5802bfb10f65bf990948582bf0
- **formed_by**: code-owner-unchain

### PS-005 | 2026-08-16T07:48:00-07:00
- **supersedes**: PS-004
- **included contributions/amendments**: S-0023 / HS-004（`contributions/HS-004-code-owner-shared-arteries.md`：SLOT-007 四项交付、反解段 owner confirmation、行为式锚定义务、三层防护、AC-012 位置 (F) 的 G1–G8、M-22 至 M-27、两条边界信号）；本 owner 对 M-27 的采纳（K-18）与对 R8 扩面定界的复核
- **changed blocks**: 实施范围（纳入待授权的注释补写）、owner slots（SLOT-007 转 FILLED）、风险 R8（M-25 扩面 + 定界 + M-26 假覆盖）、AC-012（位置 (E) 的 import 禁令按 M-27 限定；新增位置 (F) 的 G1–G8）、新增「SLOT-007 交付正文」K 至 N 节、送裁前仍缺新增 2c 条并改写 2b 的 (b) 项、决定点索引新增 K-18 至 K-20、BC-004（consumer 五元素分列、admission details 行为式义务与 `\s` 措辞）
- **dependent review blocks**: code-owner-unchain、code-owner-runtime、code-owner-chat-core、code-owner-electron、code-owner-shared-arteries、BC-004、AC-012、SLOT-007
- **boundary object hash**: sha256:5fe7960a28d15579da9b2f758fbe255042ad43dd5265e382c733e782dcfe7485
- **content hash**: sha256:ae57da521030744504cbfe06e5c64fbe24fc4bb8c3fe6ae4314907bdb2ad4fc7
- **formed_by**: code-owner-unchain

### PS-006 | 2026-08-16T08:16:00-07:00
- **supersedes**: PS-005
- **included contributions/amendments**: S-0028 / HS-005（`contributions/HS-005-code-owner-devtools.md`：SLOT-006 五项交付、SEQ-007 owner confirmation 与七格逐格复核、AC-014 artifact 段全部正文、V-1a/V-1b/V-2/V-3/V-4 四条补齐义务与 V-7/V-8 两条协作义务、U-15 收口、S-0026 flagged item 表态 (a)、M-28 至 M-32、U-24/U-25/U-26）；本 owner 对 V-2、V-1b、V-3 与相邻 checkout 回落路径的独立复核
- **changed blocks**: owner slots（SLOT-006 转 FILLED，五棒全闭）、AC-014（新增 artifact 段 A 至 F 六节，含 V-1a/V-1b/V-2/V-3/V-4 实施义务与 `INCOMPLETE` 机械表达）、AC-012 位置 (E) 第 (2) 步（40 由记录值升为判定阈）、风险 R9（口径与归属修正）、SEQ-007（owner confirmation 转 HS-005、identity key 勘误、ordered events 补安装与 `direct_url.json` 核对步、expected observations 标注今日成立性与人工 rollout、四个单元格取证方式钉死并补源码执行点）、新增「SLOT-006 交付正文」O 至 R 节、送裁前仍缺新增 2d 条与 2c 条的 (0) 项、决定点索引新增 K-21 至 K-23
- **dependent review blocks**: code-owner-unchain、code-owner-runtime、code-owner-chat-core、code-owner-electron、code-owner-shared-arteries、code-owner-devtools、SEQ-007、AC-012、AC-014、SLOT-006
- **boundary object hash**: sha256:2f3d3d73f29793f7d72992a8888a3753f434f17445be61a509e18fd3e8a33931
- **content hash**: sha256:34465da221094f0a5e63d50378508dac4ad5469c62f46da58b5090bd1083e947
- **formed_by**: code-owner-unchain

### PS-007 | 2026-08-16T09:06:00-07:00
- **supersedes**: PS-006
- **included contributions/amendments**: S-0035 / code-owner-runtime 的 OBJECTION（经 S-0041 `LEAD_DISPOSITION: ACCEPT`）；S-0037 / code-owner-chat-core 自陈的 SLOT-003 §D 理由句更正与 BC-004 行区间更正（该 owner 明示为非阻断文本项、不请求 disposition）
- **changed blocks**: 仅四处纯文本，**其余全部块逐字未动** —— (1)「SLOT-002 交付正文」§B 末句：由「恢复期失败一律映射 409 `journal_incompatible`」恢复为 SLOT-002 §2.4 步骤 9 的**六行三码**逐行对照，并写明前两行（锁抢占、live 注册表拒绝）属**恢复未进入**的瞬时争用、映射 `context_v2_rebase_in_progress`；(2) AC-011 子例 7f：恢复 HS-001 原文的两项断言（闸拒绝时返回 `context_v2_rebase_in_progress`（409, retryable）且零写入；注销 / 释放后同一 frozen 请求恢复成功）；(3)「SLOT-003 交付正文」§D 的 250ms / 750ms 理由句：换为撰写该句的 owner 自行提供的替换文本，所定行为不变；(4) BC-004 `consumer` 字段的行区间 `:4069-4072` → `:4069-4073`
- **未改动声明**: 本 successor 不触及任何 BC 的 admission policy / admission details / identity binding、不触及任何 SEQ 的矩阵单元格、不改变任何 owner 的 slot 状态、不新增或删除任何 AC / BC / SEQ 编号、不改变 write_set。四处改动均为方案正文与验收正文的文本恢复或更正，无一改变已获确认的实体设计
- **dependent review blocks**: code-owner-runtime（SLOT-002 §B、AC-011 子例 7f）；code-owner-chat-core 与 code-owner-unchain 的相关块为自陈更正与行号更正，不改变其实体内容
- **boundary object hash**: sha256:b16ed25a4a1516750bcf2bcdc70ddfbe0972846f578b54b6b3105bd1ef9d720b
- **content hash**: sha256:6ff723b6a500513c7b804b87b7f83d30c0ac2a6628c30ed3ccba8aeb3df1c316
- **formed_by**: code-owner-unchain
