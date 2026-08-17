# HS-001 Contribution — code-owner-runtime

- **case**: P-0000-0007-2026-0815
- **handoff**: HS-001 | S-0005 | from code-owner-unchain | return_to code-owner-unchain
- **basis**: S-0005 (scope), S-0004 (期待交付), S-0003 / PS-001, S-0006 (defect 2)
- **owner**: code-owner-runtime（PuPu sidecar `pupu:unchain_runtime/**`）
- **取证基线**: PuPu `28b1e0ef`（工作树含 P-0000-0004 在途改动，与本案文件无交集）; unchain `d5b0f71`（树干净）
- **性质**: owner contribution，供 lead 集成进 PS-002。本文件不改 `proposal.md`，不是 PS，不授权任何生产改动。
- **production effect**: NONE

---

## 0 · 本 owner 自行核读的事实（全部只读）

以下是本交付所依赖的、由本 owner 在上述基线上亲自核对的源码事实。凡 PS-001 已陈述且本 owner 复核一致的不重复。

| # | 事实 | locator |
|---|---|---|
| F-1 | `MemoryV2UnchainGenerationAPIError` 的**默认 status_code 是 409**、默认 retryable 是 False；携带 `code / status_code / retryable / expected_revision / actual_revision` 五个字段 | `memory_v2_unchain_generation_api.py:69-87` |
| F-2 | 出网信封由 `_error_response` 构造，key set 精确为 `{code, message, retryable}` 加两个条件字段 | `route_memory_v2.py:55-65` |
| F-3 | `route_memory_v2.py:305-312` 覆写 message 为常量 `"Unchain-owned generation request failed"`，但**逐字保留** code / status_code / retryable / expected_revision / actual_revision | `route_memory_v2.py:284-312` |
| F-4 | renderer 的 `TERMINAL_REBASE_ERROR_CODES` 用的是**带 `context_v2_` 前缀的全名**（intake §3 的简写会误导）；未知 code 刻意按 retryable 处理；`retryable` 字段被 renderer 显式忽略，注释写明 revision/generation conflict 虽被 sidecar 标 retryable 但对 frozen payload 是 terminal | `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:367-388`（仅读常量以确认 BC-004 producer 义务，非交付内容） |
| F-5 | `SQLiteGenerationRebaseV2Service._transaction` 是 contextmanager，异常路径 `rollback()` **并 `close()` 连接**。因此异常传回 sidecar 时 `BEGIN IMMEDIATE` 已释放，后续在另一条连接上的恢复写入**不会与它互锁** | `unchain:src/unchain/persistence/sqlite_generation_rebase_v2.py:542-554` |
| F-6 | sidecar 的 `PupuUnchainGraphCheckpointHost.__init__` 强制需要 live active/shadow bridge、host_factory、runtime bind_context，并在构造末尾调用 `self.service.admit(self.plan)` —— **admit 是一次 append**。因此该 host **不能**在 rebase 时复用来做恢复 | `memory_v2_unchain_graph_checkpoint.py:241-340`；`unchain:graph_checkpoint.py:598-605, 1056-1068` |
| F-7 | 冷装配路径存在且已在生产使用：`store.bind_execution(execution_id)` → `BoundExecutionJournal`，`ArtifactService(journal, sanitizer=_sanitize_artifact)` | `memory_v2_unchain_derived_handoff.py:392-393`；`memory_v2_unchain_active_bridge.py:362, 412` |
| F-8 | `GraphCheckpointService.recover(plan)` 在 `pending is None` 时**零写入**返回；有 pending 且 terminal 已在时补恰一条 seal。`finalize(plan)` = `recover(plan)` + 全 step 完成后追加恰一条 `graph.execution.completed` | `unchain:graph_checkpoint.py:1212-1256, 1595-1602` |
| F-9 | `repository._append` 的 event_id 由 `_stable_id("event", {scope_id, event_type, discriminator})` 派生；`scan(plan)` 要求 `graph.execution.admitted` 对 `(orchestration_attempt, scope_id)` **恰一条**，否则 `GraphCheckpointError` | `unchain:graph_checkpoint.py:561-578, 713-729` |
| F-10 | `graph_completion_authorized = grant.allows(MEMORY_EXECUTION_COMPLETE) and bool(grant.authority)`，来自 unchain runtime context 的 grant，**不是 PuPu 侧开关**；delegated 分支若无 grant 则强制要求 chat bootstrap 已完成 | `unchain_adapter.py:8856, 8883-8885, 9202, 9219-9223` |
| F-11 | sidecar **没有任何 active-run / active-execution 注册表**（`grep` 对 `_ACTIVE_STREAMS / active_streams / stop_stream / cancel_stream` 全仓零命中）。唯二的模块级锁是 `unchain_adapter.py:190` 与 `:2001`，均与 graph 生命周期无关 | `unchain_runtime/server/*.py` |
| F-12 | sidecar 已有真实 producer 的 rebase 测试床：`_setup_generation_api` 用真 `SQLiteContextV2Store` + 真 `SQLiteGenerationRebaseV2Service` + 真 admission，`_counts(store)` 做零写入断言；:484 / :521 / :559 已断言 `context_v2_rebase_in_progress` | `unchain_runtime/server/tests/test_memory_v2_unchain_generation_api.py:56-140, 455-560` |
| F-13 | runtime protocol manifest 由 `unchain.runtime.runtime_protocol.runtime_protocol_manifest()` 产出，sidecar 在 `context_memory_v2_capability.py:203-229` **独立重算** `sha256(canonical(protocols, runtime, schema))` 并在不符时 fail closed；`GET /health` 暴露 `context_memory_v2.runtime_protocol_manifest` | `context_memory_v2_capability.py:203-229, 392-403`；`route_catalog.py:198-221` |
| F-14 | exact deployed pair 机制已存在（P-0000-0003-2026-0814）：`scripts/release-qa/unchain-artifact.mjs` 的 `buildUnchainArtifactEvidence / readAndVerifyUnchainArtifactEvidence / verifyWheelRuntimeManifest / verifyInstalledUnchainDistribution`，schema `pupu.release.unchain-artifact.v1`；CI 以 `PYTHONPATH=<artifact_path>` 在 `unchain_runtime/server` 下跑 `python -m pytest tests/` | `scripts/release-qa/unchain-artifact.mjs`；`.github/workflows/release-qa.yml:142-148`；实例 `.release-qa/context-composition-ac015/unchain-artifact-final/unchain-artifact.json` |

---

## 1 · SLOT-002 (一) · `reason` → error code 映射

### 1.1 分类器的三级优先与降级路径

新分类器 `_translate_rebase_error` 按**严格三级**取值，任何一级不成立就落到下一级，绝不混用：

```
L1  structured detail    exact key set {schema, reason, subject}
                         且 schema == "unchain.generation_rebase_failure.v1"
                         且 reason ∈ sidecar 映射表
                     ->  按 §1.2 表取 (code, status, retryable)

L2  exception ladder     isinstance(GenerationRebaseRecoveryRequired) -> recovery code
                         isinstance(GenerationRebasePreflightBlocked) -> in_progress
                         isinstance(GenerationRebaseConflict)         -> 关键词子分类（L3）
                         其余                                        -> unavailable

L3  legacy keyword       今天 :361-386 的 "operation"/"payload"/"revision" 关键词分类，
                         逐字保留，只在 L1 不可用时进入
```

- **有 detail 时优先 detail**：L1 命中即返回，不再看 message，也不再看异常类型。
- **无 detail 时降级**：`detail` 缺失、不是 Mapping、schema 不匹配、key set 不精确（多键或缺键）、`reason` 不是字符串、或 `reason` 不在映射表内 —— 一律**视同没有 detail**，进入 L2/L3。这条是 CLOSED 语义的直接后果，也是唯一安全的写法：半解析的 detail 比没有 detail 更危险。
- **部署 skew 两个方向都被覆盖**：
  - *新 sidecar + 旧 unchain*（无 detail）：全部走 L2/L3 → 与今天**逐字相同**的 code。这是回滚 unchain wheel 的安全网，也是 AC-010 在 consumer 侧的镜像。
  - *旧 sidecar + 新 unchain*：`GenerationRebaseRecoveryRequired` 继承 `GenerationRebasePreflightBlocked`，旧 L2 命中 in_progress（409，保留 outbox）；其余新 reason 落 unavailable（503）。这是 PS-001 K-1 已论证的降级，本 owner 复核成立。
- **不为「未知 reason」单设 code**。理由：未知 reason 只可能出现在 unchain 领先 sidecar 的窗口内；若给它一个 terminal code，一个本可自愈的瞬时状态会被 renderer 直接 quarantine，比今天更糟。它必须落回 L2 的确定性阶梯（不比今天宽松，也不比今天严），同时在 sidecar 侧发一条**结构化 warning 日志**（reason + bounded subject）与一个计数，使「unchain 加了 reason 而 sidecar 没跟上」在运维上可见。这一点与 BC-003 `unknown input behavior` 一致，但与 BC-003 `admission details` 中「不得静默按可重试处理」的字面表述有张力 —— 见 §4.1 的修改意见 M-1。

### 1.2 映射全表

status 一律用 `MemoryV2UnchainGenerationAPIError(status_code=...)` 显式给出，不依赖默认值（F-1）。

| code | 新? | HTTP | `retryable` | renderer 类（BC-004） | 触发的 unchain reason |
|---|---|---|---|---|---|
| `context_v2_rebase_in_progress` | 既有 | 409 | true | in_progress → 有界退避重放 | `pending_interaction`、`attempt_unfinished`、`tool_unfinished`、`prepared_checkpoint_present`、`graph_step_awaiting_interaction`；以及任何未在本表出现、但异常为 `GenerationRebasePreflightBlocked` 子类的 reason |
| `context_v2_rebase_recovery_required` | **新** | 409 | true | recovery_required → 触发一次有界恢复后重放一次 | `graph_step_seal_missing`、`graph_execution_seal_missing` |
| `context_v2_rebase_journal_incompatible` | **新** | 409 | **false** | terminal → quarantine，**保留 frozen payload** | `graph_attempt_kind_ambiguous`、`graph_plan_descriptor_invalid`、`graph_step_terminal_ambiguous`、`graph_step_seal_duplicated`、`graph_step_seal_not_last`、`graph_step_seal_not_adjacent`、`graph_step_seal_mismatched_terminal`、`graph_step_seal_foreign`、`attempt_duplicate_terminal`、`attempt_continued_after_terminal`、`interaction_resolution_duplicated`、`interaction_request_duplicated`、`interaction_lifecycle_not_paired`、`tool_call_identity_unstable`、`tool_lifecycle_not_paired`、`tool_start_precedes_intent`、`tool_seal_precedes_start`、`tool_result_precedes_start`、`tool_result_precedes_seal`、`tool_identity_changed` |
| `context_v2_operation_conflict` | 既有 | 409 | false | terminal | operation identity / payload hash 冲突族（**reason 名待 SLOT-001 补，见 M-2**） |
| `context_v2_revision_conflict` | 既有 | 409 | true | terminal（frozen payload 永不成功） | expected head revision 不符族（**reason 名待补**） |
| `context_v2_generation_conflict` | 既有 | 409 | true | terminal | source generation 已非当前族（**reason 名待补**） |
| `context_v2_rebase_unavailable` | 既有 | 503 | true | 基础设施故障 → 与业务失败分开计数 | `current_receipt_unavailable`；以及 sqlite / OS / I/O 层真实故障。**其余任何 reason 都不得落到这里** |

三条设计判断，各自有理由：

1. **`journal_incompatible` 用 409 而不是 503。** 它是 durable journal 的确定性状态，与基础设施可用性无关。今天正是「确定性不可恢复 → 503 + retryable」这一条产生了热循环。选 409 而不是 4xx 里的其它值，是因为既有的三个 terminal code（operation / revision / generation conflict）都已是 409，preload 与 electron 对 409 body 的透传路径已被覆盖；换一个新 status class 会打到未测试的分支，属于无谓风险。
2. **`recovery_required` 的 `retryable` 取 true。** 它确实可重试 —— 只是必须先跑一次恢复。对今天的 renderer 无影响（F-4：未知 code 一律按 retryable，不看该字段）；对升级后的 renderer 也无影响（按 code 分类）。取 true 是诚实的，不制造第二个互相矛盾的信号通道。
3. **`retryable` 是**咨询性遥测**，`code` 才是规范。** F-4 证明 renderer 今天已经在这么做（revision/generation conflict 标 retryable=true 却被列为 terminal）。这一点必须写进 BC-004，否则 producer 和 consumer 会长期维持两套互相打架的语义。

### 1.3 只加 code，不改信封形状

**强烈建议不新增任何 envelope 字段。** 四个 renderer 类全部可由 `code` 单独承载（表中第 4 列已给出双射）。保持 `{code, message, retryable}` + 两个条件字段不变，意味着：

- BC-004 的 `admission policy: CLOSED` 不需要松动为 VERSIONED；
- SLOT-004（electron）的答案可以是「无需改动，只需确认透传」，把该交棒压到最小；
- 不产生「code 与 detail 两个分类通道」的长期分裂。

### 1.4 `route_memory_v2.py:305-312` 的 message 二次覆写如何处理

**保留覆写，不透传结构化 detail 到 renderer。** 三条理由：

1. 覆写只丢弃 message，**code / status / retryable / expected_revision / actual_revision 已经逐字保留**（F-3）。既然契约是 code-only，覆写零信息损失。
2. 它是一道实际生效的隐私/边界闸：unchain 异常 message 可能内嵌标识符，覆写保证跨进程只出常量文案。AC-009 已把 `subject` 限制为 identity-only 有界字段，理论上可以外送，但那会把 CLOSED 信封变成 VERSIONED、把三个 owner 拉进来，换来的只是 renderer 侧本就不该用的诊断信息。
3. 诊断需求在**服务端日志**满足，不在信封里：sidecar 在 L1 命中与 L1 降级两处各发一条结构化日志，字段 = `{code, reason, schema, subject}`，`subject` 直接沿用 AC-009 的有界 identity 映射（attempt_id / call_id / interaction_id / step index / event_type / cursor），**不含 message 文本、用户内容、artifact bytes 或 secret**。

**但覆写点需要一处新增：code allowlist 闸。** 今天 `source_code = str(getattr(error, "code", "") or ...)`（`route_memory_v2.py:285-287`）会把任意字符串放出去。作为 BC-004 的 producer，我的义务是「只有封闭集合内的 code 能跨出去」。建议在 sidecar 内定义 `CONTEXT_V2_REBASE_ERROR_CODES`（上表七个 + 既有相邻 code `context_v2_rebase_receipt_mismatch`、`context_v2_not_found`、`context_v2_invalid_request`、`context_v2_invalid_history`），出网前校验；不在集合内的 code 降级为 `context_v2_rebase_unavailable` 并记一条 error 日志。这条既是 BC-004 producer 侧的自证机制，也是 §7 新增 AC-016 的被测对象 —— 即对 S-0006 defect 2 的正面答复。

---

## 2 · SLOT-002 (二) · `recovery_required` 的有界 recovery 编排

### 2.1 结论摘要

| 问题 | 结论 |
|---|---|
| 哪一层触发 | **sidecar，`rebase_session` 捕获 `recovery_required` 之后，在一个新模块 `memory_v2_unchain_graph_recovery.py` 内**。不新建 endpoint、不新建 IPC channel、不需要 chat-core 或 electron 先落地 |
| 是否采用只读 plan 定位辅助 | **采用，且视为硬依赖**。它不是可选优化 —— 没有它，SLOT-002 无法安全实现（见 §2.3） |
| 调几次 | 每次请求内至多一次 `recover()`（或 `finalize()`）+ 至多一次 frozen 请求重放；每个 `(execution_id, generation_id, reason)` 在 sidecar 进程生命周期内至多 **2** 次恢复 |
| 并发防护 | 三层：durable 前置条件 + 进程内 per-execution 锁 + 新增 in-process live-execution 注册表 |
| 恢复失败返回 | `context_v2_rebase_journal_incompatible`（409, non-retryable）为主；只有真实 I/O 故障返回 `context_v2_rebase_unavailable`（503） |
| 幂等性 | `recover()` 在无 pending 时零写入（F-8）；seal 的 event_id 稳定（F-9）；frozen 请求重放由 AC-003 保证 |

### 2.2 为什么在 `rebase_session` 内而不是新 endpoint

PS-001 K-2 已提出「sidecar 收到 recovery_required 时执行一次有界恢复，再用同一个 frozen 请求重试一次」。本 owner 复核后**同意**，并补上两条支撑与一条代价：

- **无死锁**（F-5）：异常传回时 unchain 的 `BEGIN IMMEDIATE` 已 rollback 且连接已 close。恢复走另一条连接是顺序的，不是嵌套的。
- **最少 owner 依赖**：新 endpoint 方案需要 sidecar + electron（新 channel + preload bridge + `.js`/`.cjs` 双胞胎）+ chat-core 三方全部落地才有效果；内联方案在 sidecar 单独部署后就能闭合恢复回路。热循环的**终局收敛**仍需 SLOT-003 的持久化重试上界，但「crash window 永远卡住」这一条在 sidecar 落地当天就消失。
- **代价必须写明**：`rebase_session` 今天有一条干净不变量 —— *任何失败路径零写入*，既有测试全部以 `_counts(store) == before` 断言（F-12）。内联恢复**在且仅在** recovery 路径上打破它。因此不变量必须改写为可验收的形式：

  > 除 `recovery_required` 路径外，任何失败零写入；`recovery_required` 路径至多追加**一条** `graph.step.completed`（或一条 `graph.execution.completed`）与**一个** output artifact；若随后的重放仍失败，则 `host_generation_records` / `legacy_bootstrap_manifests` / `host_generation_attempt_bindings` 与 head revision 逐行不变。

  这条改写后的不变量进入 AC-011（§5 子例 8）。

若 Chief 或 lead 认为「失败路径成为写者」不可接受，退路是新 endpoint `POST /context/v2/session/graph-recovery`（同 `_endpoint` 鉴权与体积闸、同 `_generation_operation_for_store_owner` 分派纪律），其余编排逻辑一字不变，只是触发者从 sidecar 变成 renderer，并把 SLOT-004 从「确认透传」升级为「新增 channel」。本 owner 的推荐是内联；退路已备。

### 2.3 只读 plan 定位辅助：硬依赖，不是可选项

恢复需要一个 exact `GraphExecutionPlan`。sidecar 在 rebase 时拿不到它：

- 复用 `PupuUnchainGraphCheckpointHost` **不可行**（F-6）—— 它要 live bridge / host_factory / runtime binding，并且构造末尾就 `admit()` 一次 append。在恢复路径上调用它等于为了修复一次 crash window 而先写一条事件。
- 在 PuPu 侧自己从 `graph.execution.admitted` 的 payload 重建 plan **不可接受** —— 那是把 `plan.to_dict()` 的 schema 复制到第二个仓库，正是 BC-002 要消灭的分叉形态。

因此：**请 SLOT-001 把该 helper 作为 BC-002 的一部分交付**，要求为

1. 纯读、无 append、无 artifact 写；
2. 输入 `(journal_or_store, execution_id, orchestration_attempt_id 或 generation_id)`，输出 exact `GraphExecutionPlan`；
3. 对「零条或多于一条匹配的 `graph.execution.admitted`」「payload 不可解析」「plan 的 `execution_id` 与绑定不符」一律 fail closed 抛结构化异常，reason 用 `graph_plan_descriptor_invalid`；
4. 该 helper 与 `scan()` 的 admission 唯一性检查（F-9）共用同一判据，不各写一份。

**若 lead 决定不提供该 helper，本 owner 的 SLOT-002 结论翻转**：sidecar 不实现自动恢复，`graph_step_seal_missing` / `graph_execution_seal_missing` 直接映射为 `context_v2_rebase_journal_incompatible`（terminal + quarantine），把恢复交给一条人工/工具路径。那样热循环仍然停止、outbox 仍然不丢，但 crash window 需要用户介入。这是可接受的次优解，请 lead 明确取舍。

### 2.4 编排步骤（可实施粒度）

新模块 `unchain_runtime/server/memory_v2_unchain_graph_recovery.py`：

1. **准入复用，不新建。** 复用 `open_pupu_unchain_generation_api` 已建立的 scope（store owner 必须是 unchain、chat admission active、owner/session/execution 三元组匹配）。恢复不创建任何 admission、不改任何 admission 记录。
2. **进程内 per-execution 互斥。** 模块级 `dict[(database_path, execution_id) -> RLock]`（`WeakValueDictionary` + `threading.RLock`），以 `acquire(blocking=False)` 获取。抢不到 → 判定为「另一路正在恢复」，返回 `context_v2_rebase_in_progress`（409, retryable），零写入。
3. **live-execution 闸（新增，本 owner 边界内）。** F-11 证明 sidecar 今天**没有**任何活跃执行注册表，因此「与活跃 graph 执行争用」目前无法判定。建议在 `unchain_adapter` 的 graph 路径新增一个极小的注册表：在构造 `graph_checkpoint_host` 之前把 `execution_id` 加入一个模块级 `set`（配 `threading.Lock`），在 `finally` 中移除。恢复模块在该 `execution_id` 在集内时直接拒绝，返回 `context_v2_rebase_in_progress`，零写入。
   - 这条闸对**实际场景**几乎是完备的：真正需要恢复的 crash window 绝大多数发生在 sidecar 重启之后，那时注册表为空且正确；正常运行期间它精确挡住并发。
   - 残余竞态：同一进程内、活跃 run 正处于 `run_completed` 已落盘与 `complete_step()` 之间的窗口 —— 该窗口与 crash window 在 journal 上不可区分。live 注册表恰好覆盖它（此时 execution 在集内）。跨进程（第二个 sidecar 实例）不在闸内，只能依赖 F-9 的稳定 event_id：两次恢复会 append 同一个 event_id。**该情形下 `BoundExecutionJournal.append` 的去重语义属 unchain 边界，请 lead 确认（见 §8 U-1）。**
4. **durable 前置条件（必要条件，永远检查）。** 只有当 validator 自身判定为 `recovery_required` 时才进入恢复。按 PS-001 的定义，该分类要求 run terminal 已 durable —— 恢复因此永远只 seal 一个 terminal 已落盘的 step，不会触碰任何仍在飞行的 attempt。
5. **冷装配 service，不 admit。**
   `journal = store.bind_execution(execution_id)`；`artifacts = ArtifactService(journal, sanitizer=<active bridge 同一个 `_sanitize_artifact`>)`；`service = GraphCheckpointService(repository=JournalGraphCheckpointRepository(journal), artifacts=artifacts, derived_ingress_resolver=<fail-closed，被调用即抛>)`（F-7）。
   - **不调用 `service.admit(plan)`** —— `recover()` 不需要它，而它是一次 append。
   - **sanitizer 必须与 active 路径逐字同一个函数**，否则恢复出的 output artifact 可能与 live seal 产出的不同字节。这是真实的 producer parity 要求，进 AC-011。
   - fail-closed 的 `derived_ingress_resolver` 是一个自证：它一旦被调用就说明恢复误入了 start-step 路径。
6. **恢复动作，按 reason 精确二选一**（F-8）：
   - `graph_step_seal_missing` → `service.recover(plan)`，恰一次。
   - `graph_execution_seal_missing` → `service.finalize(plan)`，恰一次（`finalize` 内部已先 `recover`，且只在全部 step 完成时才 append `graph.execution.completed`）。
   - **不要对 step-seal 缺失调用 `finalize()`** —— 它会在补完最后一个 step 后顺带写 `graph.execution.completed`，而该 orchestration 可能本就不该被判完成。
7. **重放恰一次。** 用同一个 frozen `GenerationRebaseRequest`（同 operation_id、同 payload_sha256、同 expected_head_revision）调 `self._service.rebase(request)` 一次。成功 → 正常返回 receipt。
8. **收敛判据与上界。** 模块级有界 LRU（建议 256 项）记 `(execution_id, generation_id, reason) -> attempts`。
   - 重放后**仍是同一个 recovery reason** → 恢复未收敛 → 计数加一；计数达到 2 时返回 `context_v2_rebase_journal_incompatible`（terminal）。
   - 重放返回其它失败 → 按 §1.2 表正常映射，不计入该计数。
   - 计数在 sidecar 重启时清零，这是**有意的**：重启正是新 crash window 可能产生的时刻。
   - 这个上界必须存在于 server 侧，不能只靠 renderer：renderer 的计数会因清缓存或重装归零，而 sidecar 侧的判据是「同一 durable 事实重复出现」。
9. **失败 → code 的对照**：

   | 恢复期情形 | 返回 code | HTTP | retryable | 写入 |
   |---|---|---|---|---|
   | 抢不到 per-execution 锁 | `context_v2_rebase_in_progress` | 409 | true | 零 |
   | execution 在 live 注册表内 | `context_v2_rebase_in_progress` | 409 | true | 零 |
   | plan helper 不可用 / plan 不可重建 / admitted 非唯一 | `context_v2_rebase_journal_incompatible` | 409 | false | 零 |
   | `recover()` / `finalize()` 抛 `GraphCheckpointError` | `context_v2_rebase_journal_incompatible` | 409 | false | 零（unchain 侧 append 是原子的） |
   | 重放仍 recovery_required 且计数已达上界 | `context_v2_rebase_journal_incompatible` | 409 | false | 恢复的一条 seal 已写 |
   | sqlite / OSError / 磁盘 I/O | `context_v2_rebase_unavailable` | 503 | true | 零或部分（由 unchain 事务保证原子） |

   要点：`GraphCheckpointError` **不映射 503**。它是确定性的 durable 状态分歧，503+retryable 正是热循环发生器。

---

## 3 · SLOT-005 · delegated / shadow root terminal 的 PuPu 侧处置

### 推荐：**不补写 root terminal。接受 PS-001 orchestration 分类 (b) 为长期合法形态。**

四条理由，按强度排序：

1. **补写会要求绕过一道有意设置的权限闸。** `_append_root_terminal` 写的是 `final_message` + `run_completed`，这是**整个 chat execution 的 run terminal**，不是 graph 的内部标记。它今天被 `graph_completion_authorized` 门控（F-10），而该值来自 unchain runtime context 的 `MEMORY_EXECUTION_COMPLETE` grant —— delegated 分支拿不到它，是因为 delegated graph 不拥有 chat 的完成权（父 run 还在跑）。要补写就只有两条路：把 grant 扩到 delegated（在一条本就不该有该能力的路径上扩权），或跳过 grant 检查直接写（未授权写入）。两者都比接受 (b) 差得多。
2. **对 shadow 而言，补写直接违反 shadow 的存在理由。** shadow 分支 `graph_active_bridge is None`，走的是观察/干跑语义。让干跑在 durable journal 上写出「这个 chat run 完成了」的终结事件，会使 shadow 与 active 在持久状态上不可区分 —— 那 shadow 就没有意义了。
3. **爆炸半径远超 rebase validator。** `run_completed` 是全仓共享词汇：compiler、`run_outcomes`、receipt、token accounting、trace 投影都读它。为了让一个 validator 高兴而在 delegated orchestration attempt 上凭空造一个 chat 级 terminal，会向所有这些 consumer 撒谎。相比之下，(b) 的成本被完全限制在一个 validator 的分类分支里。
4. **(b) 无论如何都必须被接受，补写只是叠加第二种形态。** non_goals 禁止重写历史 journal，而用户库里已存在 (b)（intake §1.3.4、chief-directive §用户环境）。validator 必须能接受 (b)。补写只在未来新数据上再造一种形态，**不会**让 validator 少一个分支 —— 只有成本，没有契约简化。

### 一条支撑性论证（也是给 lead 的核验请求）

(b) 之所以安全，不在于「`graph.execution.completed` 等于 terminal」，而在于**父 run 的活跃性由父 attempt 自己的组承担**：delegated graph 的 orchestration attempt 与父 run attempt 是同 generation、不同 attempt_id 的两个组，父 run 若仍在飞行，它自己的组就会在 terminal-last 规则下 Blocked。因此 (b) 放行 orchestration 组不会放行一个仍在运行的 chat。

**这一条依赖「父 run attempt 与 delegated orchestration attempt 落在同一 generation、因而同在 validator 的扫描集合内」。** 该事实在 unchain 的分组边界内，请 lead 在 SLOT-001 中核实并写入 AC-007 (b) 的前置条件；若不成立，(b) 需要额外要求「同 generation 内不存在其它未 quiesce 的 attempt」，而那正是聚合优先级本来就提供的。

### 形态统一的替代做法（不改语义，可选）

若 lead 或 Chief 仍希望形态统一，本 owner 建议的方向**不是**补 root terminal，而是让 delegated / shadow 在 `finalize()` 之外不再增加任何事件，并由 BC-002 的共享词汇把 (b) 显式记为一等 quiescence 形态（而非「例外分支」）。形态统一应通过**词汇承认**达成，不通过**伪造事件**达成。

---

## 4 · Owner confirmation

### 4.1 BC-003（consumer 侧，code-owner-runtime）

**结论：AGREE_WITH_CHANGES**（三处，均不改变 BC-003 的方向）

- **M-1 · `admission details` 与 `unknown input behavior` 的表述冲突。** 前者写「未知 reason 必须映射到一个明确的保守 code，不得静默按可重试处理」，后者写「未知 reason 或缺少 detail 时回退到今天的异常类型分类，即 Blocked 系映射为 in_progress」—— 而 in_progress 恰恰是 retryable 的。二者字面互斥。
  建议改为：*未知 reason 回退到确定性的异常类型阶梯（不比今天宽松）；「不进入无界重试」的义务由 BC-004 的持久化有界上限承担，不由 sidecar 的 code 选择承担。* 理由见 §1.1：给未知 reason 一个 terminal code 会 quarantine 掉本可自愈的瞬时状态。
- **M-2 · 封闭 reason 枚举缺 conflict 族。** PS-001 §四列出的枚举覆盖了 preflight/tool/interaction/attempt/graph，但**没有**覆盖今天关键词分类器实际赖以工作的三类：operation identity 冲突、payload hash 冲突、expected head revision 冲突、source generation 非当前。若这些 raise 点不带 reason，sidecar 就必须**永久保留** `str(error).casefold()` 关键词匹配 —— 本案要消除的正是它。请把这四类补进枚举（名称由 SLOT-001 定），并在 AC-009 的正向断言里覆盖。**这是本 owner 认为最重要的一处修改。**
- **M-3 · `consumer projection` 补一句 producer 义务。** 建议加：*sidecar 出网前对 code 做封闭集合校验，集合外的 code 降级为 `context_v2_rebase_unavailable` 并记 error 日志*（§1.4）。这一句同时是 §7 AC-016 的被测对象。

以上三点被采纳后，BC-003 的 consumer owner confirmation 为 **CONFIRMED**。在采纳前记为 CONFIRMED_CONDITIONAL —— 本 owner 不因这三点提出 OBJECT，它们都是可在集成时直接吸收的文字修改。

### 4.2 BC-004（producer 侧，code-owner-runtime）

**结论：AGREE_WITH_CHANGES**（两处）

- **M-4 · 明确 `retryable` 是咨询性的，`code` 是规范。** F-4 证明 consumer 今天已经这么做了；不写进契约，两侧会长期维持两套打架的语义。建议加入 `canonical representation`：*信封中 `retryable` 是 HTTP 层遥测；分类唯一依据是 `code`。*
- **M-5 · 明确信封形状本次不变。** 建议在 `admission details` 写死：*本次只新增 code 值，不新增、不删除、不重命名任何 envelope 字段；`message` 保持 route 层常量覆写，结构化 `detail` 不跨出 sidecar。* 这一句直接决定 SLOT-004 的答案可以是「确认透传，无需改动」。

**关于 S-0006 defect 2（BC-004 producer 侧无自证 AC）**：本 owner **不推迟确认**，而是**补一条 producer 侧 AC**。理由是推迟会让 BC-004 的 producer 义务在整个 SLOT-003 交棒期间无人验证，而这条 AC 完全落在 sidecar 边界内，不需要等 chat-core。正文见 §7（AC-016）。加入 AC-016 后，BC-004 的 `positive acceptance` 建议改为 `AC-012, AC-016`，`negative acceptance` 改为 `AC-010, AC-016` —— 这同时化解了 S-0006 记录的 observation（同一 AC 兼任正负）在 BC-004 上的部分。

采纳 M-4、M-5 与 AC-016 后，BC-004 的 producer owner confirmation 为 **CONFIRMED**。

### 4.3 SEQ-005（owner: code-owner-runtime）

**结论：AGREE_WITH_CHANGES**（一处）

序列本身正确，identity key、ordered events、expected observations 与 §1 的三级分类器逐条对应。一处补充：

- **M-6 · `initial state` 与 `ordered events` 只写了「unchain 先升级」这一个 skew 方向。** 反方向（sidecar 先升级 / unchain 回滚 wheel）同样真实，而且是 PS-001「可逆性 = 回退 wheel」的直接后果。建议 `ordered events` 补一格：*sidecar 已升级而 unchain 回滚到无 detail 的 wheel → 分类器落回 L2/L3 → 得到与升级前逐字相同的 code*，`expected observations` 相应补一句。对应的取证在 AC-011 子例 4。
- `reset: NOT_APPLICABLE` 的理由（错误分类是无状态投影）—— 本 owner 复核后**部分不成立**：§2.4 步骤 8 的恢复计数器是 sidecar 进程内的持久状态。但它在 restart 时清零且这是有意设计，所以 `restart` 格已覆盖，`reset` 仍可保持 NOT_APPLICABLE，只需把理由改为 *恢复计数只在进程内存活，没有外部 reset 操作；其归零由 restart 格覆盖*。

采纳后 SEQ-005 owner confirmation 为 **CONFIRMED**。

### 4.4 SEQ-006（owner: code-owner-runtime）

**结论：CONFIRMED_PARTIAL + 归属修改意见**

- 本 owner 能够并已经确认的部分：**运行时侧** —— 由实际 import 的 runtime module 导出、由 sidecar 独立重算校验的 protocol manifest digest（F-13），以及「Git revision / source path / 环境变量只作遥测、绝不参与 capability 或 admission」这一条。这部分完全在 `unchain_runtime/server/**` 内，本 owner 确认。
- **M-7 · 归属存疑。** SEQ-006 的其余单元格（一次构建产出 wheel、冻结 candidate、契约矩阵、package smoke、release report、rollout、回滚）全部实现在 `scripts/release-qa/**` 与 `.github/workflows/release-qa.yml`（F-14），那是 **`code-owner-devtools`** 的边界；执行则是 `task-owner-release-certification` 的固定流程。把整条 SEQ-006 挂在 runtime 名下，会让一个没有该边界写权限的 owner 去确认它。
  建议二选一：(i) 把 SEQ-006 改 owner 为 `code-owner-devtools`，runtime 作为确认方；或 (ii) 拆为 SEQ-006a（artifact provenance / 构建与报告，devtools）与 SEQ-006b（runtime manifest 准入与 exact-pair 运行时核对，runtime）。本 owner 推荐 (ii)，因为两半的 identity key 本来就不同。
- 这不是 OBJECT，也不阻塞：§6 已给出 AC-014 的 sidecar 侧取证方法，无论 SEQ-006 最终挂在谁名下都可直接使用。

---

## 5 · AC-011 正文（可执行验收）

> **AC-011 | sidecar reason → error code 映射与有界 recovery 编排**
>
> **取证位置**：`unchain_runtime/server/tests/test_memory_v2_unchain_generation_api.py`（分类器与编排）与 `unchain_runtime/server/tests/test_route_memory_v2.py`（出网信封）。
> **运行方式**：在 `unchain_runtime/server` 下、以 `PYTHONPATH` 指向 AC-014 冻结的那一个 unchain wheel 的安装路径，执行 `python -m pytest tests/ -q --tb=short`（与 `.github/workflows/release-qa.yml:142-148` 逐字一致，不新建 runner）。
> **真实 producer 要求**：全部用例在 `_setup_generation_api` 的真实 `SQLiteContextV2Store` + 真实 `SQLiteGenerationRebaseV2Service` 上运行；graph 事件由真实 `GraphCheckpointService` / `JournalGraphCheckpointRepository` 写入，**禁止**用手工 `_append_event` 伪造 seal 或 terminal。**严格 consumer 要求**：断言 `code`、`status_code`、`retryable` 三者的精确值（不用 `in`、不用子串、不用 `toMatchObject` 式松散比较），信封断言精确 key set。producer 与 consumer 不得共享同一个宽松构造 helper。
>
> **子例 1 · 正向逐 reason 映射（穷举）**：对 `GenerationRebaseFailureReason` 的**每一个**成员，由真实 raise 点或由 unchain 自己的异常构造器产出真实异常实例（禁止用 dict 字面量伪造 detail），经 `_translate_rebase_error` 得到的 `(code, status_code, retryable)` 与 §1.2 表逐字相同。测试以枚举反射驱动：任一枚举成员未出现在 sidecar 映射表中即**失败**。这条是防止 unchain 后续新增 reason 而 sidecar 静默漏配的 divergence 闸。
>
> **子例 2 · 负向 · 未知 reason**：真实异常携带 schema 正确、但 `reason` 为表外字符串的 detail → 结果恰为 L2 阶梯值（`GenerationRebasePreflightBlocked` 子类 → `context_v2_rebase_in_progress`；其余 → `context_v2_rebase_unavailable`），且**不是**任何新 code；同时断言发出了一条包含该 reason 的结构化 warning 日志。
>
> **子例 3 · 负向 · 错 schema**：detail 的 `schema` 不等于 `unchain.generation_rebase_failure.v1` → detail 整体被忽略，结果与子例 2 的对应阶梯值相同，无异常逃逸。
>
> **子例 4 · 负向 · 缺 detail（旧 unchain skew）**：异常无 `detail` 属性 → 结果与改动前的分类器**逐字相同**。断言方式：把改动前对全部既有 reason 的 `(message → code, status, retryable)` 快照冻结为测试内常量表，逐项比对。这是 AC-010 在 consumer 侧的镜像，也是 SEQ-005 `first use` 与 `rollback` 两格的取证。
>
> **子例 5 · 负向 · detail 形状违规**：`detail` 不是 Mapping；key set 多一个键；key set 缺一个键；`subject` 不是 Mapping；`subject` 单字段或总长超过 AC-009 上限 —— 五种各一例，全部落回阶梯值，全部零异常逃逸、零 500。
>
> **子例 6 · 出网信封封闭性（BC-004 producer）**：见 §7 AC-016，作为 AC-011 的引用项，不重复计数。
>
> **子例 7 · 有界 recovery 编排（SEQ-005 的 repeat / retry / resume / restart 四格）**：
> 7a *首次 crash window*：真实 producer 写到 `run_completed` 后不调 `complete_step` → 一次 `rebase_session` 内恢复恰跑一次、重放恰一次并成功；断言 events 表恰新增一条 `graph.step.completed`、artifact 恰新增一个、head revision 恰 +1、receipt 恰一份。
> 7b *立即重复同一 frozen 请求*：幂等，零新增 events、零新增 generation、head revision 不变、不产生第二份 receipt。
> 7c *同一 chat 的第二个独立 crash window*：恢复再次执行并成功 —— 证明上界是按 `(execution_id, generation_id, reason)` 计，不是按进程计。
> 7d *不收敛用例*：构造恢复后仍返回同一 recovery reason 的 durable 状态 → 第二次返回 `context_v2_rebase_journal_incompatible`（409, retryable=False），且**不发生第三次恢复**（以 recover 调用计数断言）。
> 7e *冷重启*：关闭并重开 store 与服务实例后，同一 frozen 请求得到与 7a 相同的结论。
> 7f *live-execution 闸*：把该 `execution_id` 注册为活跃后触发 rebase → 返回 `context_v2_rebase_in_progress`，零写入；注销后同一请求恢复成功。
> 7g *sanitizer parity*：恢复产出的 output artifact 与同一 step 经 live 路径 seal 产出的 artifact 逐字节相同（同一 `_sanitize_artifact`）。
> 7h *fail-closed ingress*：恢复路径注入的 `derived_ingress_resolver` 一旦被调用即抛；断言全部恢复用例中它从未被调用。
>
> **子例 8 · 写入不变量**：除 `recovery_required` 路径外的每一个失败用例，`_counts(store)` 前后完全相等；`recovery_required` 路径按 §2.2 的改写不变量断言精确 delta，且重放仍失败时 `host_generation_records` / `legacy_bootstrap_manifests` / `host_generation_attempt_bindings` 与 head revision 逐行不变。
>
> **红先于绿**：子例 1（枚举穷举闸）、子例 4（skew 冻结表）、子例 7d（不收敛上界）三项必须保存 red-before-green 记录 —— 它们对应的缺陷今天全部零覆盖。
>
> **owner**: code-owner-runtime | **boundary contracts**: BC-003, BC-004 | **state sequences**: SEQ-005

---

## 6 · AC-014 的 sidecar 侧取证方法

**只引用 P-0000-0003-2026-0814 已建立的机制，不扩权、不新建 gate。**

### 6.1 runtime protocol manifest digest（运行时侧）

- **来源必须是实际 import 的 runtime module**：`unchain.runtime.runtime_protocol.runtime_protocol_manifest()`。
- **必须经 sidecar 独立严格校验**：`context_memory_v2_capability.py:203-229` 已对 `manifest_digest` 做 `sha256:<64hex>` 形状检查，并**独立重算** `sha256(canonical({protocols, runtime, schema}))` 与之比对，不符即 fail closed。取证时引用这条既有校验，不新写一份计算。
- **从运行中的 sidecar 读取**：`GET /health`（token-gated）返回 `context_memory_v2.runtime_protocol_manifest.manifest_digest`（`route_catalog.py:198-221` + `context_memory_v2_capability.py:392-403`）。这是 exact-pair 核对中「运行时实际装载了什么」的唯一权威读数。
- **遥测与准入严格分离**：同一响应里的 `unchain_revision` 与 `unchain_runtime_source` 是遥测，**不得**出现在任何 pass/fail 判据、capability 判定或 admission 谓词中。这条与本案 non_goals（不恢复 SHA gate）一致，取证脚本里要有一条断言明确它没被使用。

### 6.2 wheel SHA-256（artifact 侧）

- 一次构建产出 evidence 文件，schema `pupu.release.unchain-artifact.v1`，形状 `{schema, artifact:{name, sha256, size_bytes}, runtime_manifest:{manifest_digest, protocols, runtime, schema}}`（既有实例：`.release-qa/context-composition-ac015/unchain-artifact-final/unchain-artifact.json`）。
- `scripts/release-qa/unchain-artifact.mjs` 的四个既有函数各司其职，全部复用不改：
  - `buildUnchainArtifactEvidence` 写 evidence；
  - `readAndVerifyUnchainArtifactEvidence` 重新对文件取 SHA-256 并与 evidence 比对，不符即抛；
  - `verifyWheelRuntimeManifest` 从 **wheel 内部**抽取 manifest 并重算 digest；
  - `verifyInstalledUnchainDistribution` 读已安装 dist 的 `direct_url.json` 的 `archive_info.hashes.sha256`，与 evidence 的 artifact sha 比对 —— 这一条正是「不得以可变的相邻 checkout 顶替 artifact」的机械保证。

### 6.3 sidecar 侧的 exact-pair 断言（本 owner 的具体义务）

三处必须核对同一对值，任一处不同即结论 `INCOMPLETE`：

| 处 | wheel SHA-256 来源 | manifest digest 来源 |
|---|---|---|
| 契约矩阵（含 AC-011 的 pytest） | `PYTHONPATH` 指向的安装 dist 的 `direct_url.json` | 被测进程内 `runtime_protocol_manifest()` |
| package smoke（`scripts/release-qa/package-sidecar-smoke.mjs`） | 同一 evidence 文件 | 打包 sidecar 的 `GET /health` |
| release report | evidence 文件 | 上两处报出的值 |

具体做法：AC-011 的 pytest 增加一条 session 级断言 —— 被测进程内 `runtime_protocol_manifest()["manifest_digest"]` 等于 evidence 文件里的 `runtime_manifest.manifest_digest`（evidence 路径经环境变量传入，与 CI 现有 `UNCHAIN_ARTIFACT_PATH` 同一来源）。这条断言把「AC-011 到底是在哪个 wheel 上跑的」变成可核验事实，而不是流程承诺。

- CI 已具备条件：`.github/workflows/release-qa.yml:142-148` 以 `working-directory: pupu/unchain_runtime/server`、`PYTHONPATH: ${{ steps.unchain_artifact.outputs.artifact_path }}` 跑 `python -m pytest tests/`。不需要新建 job。
- 若 SEQ-006 按 §4.4 M-7 拆分，本节全部内容归 SEQ-006b（runtime），6.2 归 SEQ-006a（devtools）。

---

## 7 · 建议新增 AC-016（BC-004 producer 侧自证）— 对 S-0006 defect 2 的答复

> **AC-016 | sidecar rebase error envelope 的封闭性与不泄漏**
>
> 取证位置 `unchain_runtime/server/tests/test_route_memory_v2.py`，用 Flask 测试客户端对 `POST /context/v2/session/rebase` 取真实响应。
>
> **正向**：对 §1.2 表中七个 code **各取一个真实触发路径**，断言响应体：
> 1. 顶层 key set 精确为 `{"error"}`；
> 2. `error` 的 key set 精确为 `{code, message, retryable}`，且仅在 `context_v2_revision_conflict` 与 `context_v2_generation_conflict` 两例上额外出现 `expected_revision` 与 `actual_revision`；
> 3. `code` 逐字等于表中值且 ∈ 封闭集合 `CONTEXT_V2_REBASE_ERROR_CODES`；
> 4. HTTP status 逐字等于表中值；
> 5. `message` 逐字等于常量 `"Unchain-owned generation request failed"`。
>
> **负向**：
> 1. *表外 code*：令内层抛出一个 code 不在封闭集合内的 `MemoryV2UnchainGenerationAPIError` → 出网 code 被降级为 `context_v2_rebase_unavailable`（503），并记一条 error 日志；断言原始 code 字符串**不出现**在响应体任何位置。
> 2. *不泄漏*：对每一个正向用例，断言响应体全文中不出现 `reason` 枚举值、不出现 `subject` 的任何字段名或字段值、不出现 attempt_id / event_id / interaction_id / call_id 的任何取值、不出现 unchain 原始异常 message 的任何子串。
> 3. *字段不漂移*：断言信封 key set 与 `_error_response`（`route_memory_v2.py:55-65`）的定义一致，任何新增字段会使该断言失败 —— 这是 BC-004 `CLOSED` 的机械保证。
>
> **owner**: code-owner-runtime | **boundary contracts**: BC-004 | **state sequences**: SEQ-005

建议 BC-004 的 acceptance 改为 `positive: AC-012, AC-016` / `negative: AC-010, AC-016`。

---

## 8 · Remaining unknowns（本 owner 无法在边界内解决）

| # | 未知 | 归属 | 影响 |
|---|---|---|---|
| U-1 | `BoundExecutionJournal.append` 在收到**重复 event_id**（同 scope_id + event_type + discriminator，F-9）时的语义：去重返回既有 cursor，还是抛异常？ | code-owner-unchain | 决定跨进程并发恢复的残余竞态是良性还是会打死一个活跃 run。若是抛异常，§2.4 的 live 闸必须升级为跨进程锁（例如 SQLite 上的 advisory row），本 owner 会相应改写 SLOT-002 |
| U-2 | 只读 plan 定位辅助是否交付 | code-owner-unchain | §2.3 的硬依赖。不交付则 SLOT-002 结论翻转为「不做自动恢复，直接 terminal + quarantine」 |
| U-3 | conflict 族（operation / payload / revision / source generation）是否纳入封闭 reason 枚举（M-2） | code-owner-unchain | 不纳入则 `str(error)` 关键词分类必须永久保留，本案的核心目标只完成一半 |
| U-4 | 父 run attempt 与 delegated orchestration attempt 是否同 generation、因而同在 validator 扫描集内 | code-owner-unchain | §3 中 (b) 安全性论证的前置条件 |
| U-5 | `subject` 各字段与总长的具体上限数值（AC-009 只写「有明确上限」） | code-owner-unchain | AC-011 子例 5 需要具体数值才能写出越界用例 |
| U-6 | renderer 的持久化重试上界与 quarantine UI 形态 | code-owner-chat-core（SLOT-003） | 决定热循环的**终局**收敛。sidecar 侧的上界（§2.4 步骤 8）只覆盖恢复不收敛，不覆盖 renderer 侧无界重挂载 |
| U-7 | SEQ-006 归属（M-7） | Speaker / lead | 不阻塞 AC-014 的取证方法 |

---

## 9 · 建议的后续交棒

1. **SLOT-003 | code-owner-chat-core**：新增两个 code 的分类落位 —— `context_v2_rebase_journal_incompatible` 进 `TERMINAL_REBASE_ERROR_CODES`（quarantine，保留 frozen payload）；`context_v2_rebase_recovery_required` 需要一个**独立于 in_progress** 的处理（更短的重试上界，因为 sidecar 已经自己恢复过一次）。同时把 `use_chat_stream.js:13397-13416` 的 useRef 计数器改为随 outbox 条目持久化（重挂载不归零）。**关键提示**：`context_v2_rebase_unavailable` 今天不在 terminal 集合内且 JS 全仓零显式引用（intake §3）—— 它应当留在非 terminal，但必须受同一个持久化上界约束。
2. **SLOT-004 | code-owner-electron**：若采纳 §1.3（只加 code、不改信封），答案预期是「无需改动，只需确认 `context-v2:rebase-session` 链路对新 code 与 409 body 的透传，并同步 `.js`/`.cjs` 测试双胞胎」。若改走 §2.2 的退路方案（新 endpoint），则需新增 channel + preload bridge，交棒规模显著变大 —— 请在交棒前先确定 §2.2 的取舍。
3. **不建议**为本案召集 `expert-security`：新增的两个 code 不携带任何用户内容，§1.4 的覆写保留与 §7 的不泄漏负向断言已覆盖隐私面，没有会改变整改或验收结论的安全专业缺口。

---

## 附 · 实施提示（非方案内容，供裁定后实施时参考）

- `unchain_runtime/server/**` 的 `.py` 改动后 **sidecar 必须重启**才生效；任何 in-app 验证报告必须标注重启已发生，否则验的是旧代码。
- 本交付不改任何生产代码，主树未 commit。
