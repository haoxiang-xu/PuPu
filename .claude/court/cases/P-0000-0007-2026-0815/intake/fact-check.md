# Intake 取证报告 — Generation Rebase × GraphCheckpoint quiescence 契约冲突

- **取证时间**: 2026-08-15T20:17-07:00
- **取证方式**: 六路只读并行取证（workflow wf_5c19153b-c01，6 agents，全程零写入，未打开任何用户数据库）
- **取证基线**: PuPu dev `28b1e0ef`（工作树含 P-0000-0004 在途未提交改动）; unchain dev `d5b0f71`（树干净）
- **性质**: intake 证据材料，不是 owner stance、不是 PS、不授权任何 action

## 1. 核心冲突 — 全部证实

### 1.1 Rebase validator 的 terminal-last 规则（consumer 侧, unchain 仓）

- `src/unchain/persistence/sqlite_generation_rebase_v2.py:1326` `SQLiteGenerationRebaseV2Service._assert_no_open_attempt_or_tool(self, connection, intent, current_receipt)`（class :519）。
- 规则本体 :1447-1467：把 receipt import 区间（:1353-1359 排除 `import_start <= store_seq <= import_end`）之外的全部 runtime events 按 `attempt_id` 分组，**无任何 attempt 种类过滤**，要求每组：
  - 恰一个 terminal（`_ATTEMPT_TERMINAL_EVENT_TYPES` :56-69，仅 run_completed/run_failed/run_cancelled/run_canceled/run_aborted 及 `run.` 点号变体）；
  - 零 terminal → :1460-1463 `GenerationRebasePreflightBlocked("generation rebase found an unfinished durable attempt")`；
  - 多 terminal → :1456-1459 `GenerationRebaseUnavailable("generation rebase attempt has duplicate terminal events")`；
  - terminal 非最后一条（`terminals[0].store_seq != attempt_events[-1].store_seq`）→ :1464-1467 `GenerationRebaseUnavailable("generation rebase attempt continued after its terminal event")`。
- 全文件（乃至整个 `persistence/` 目录）对 `graph` 大小写不敏感 grep 零命中——validator 对 graph 事件完全无感知，无任何豁免路径（`_TOOL_SEALED_EVENT_TYPES` :72 只认 `tool.subagent_completion.sealed`）。
- 异常类 `GenerationRebaseUnavailable` 定义 :90-91（基类 :82-83 `GenerationRebaseError(RuntimeError)`），**无结构化 reason/detail 字段**，只有 message 字符串。层级：:86 `GenerationRebaseConflict`，:94 `GenerationRebasePreflightBlocked(GenerationRebaseConflict)`。
- 调用链：唯一调用点 `_assert_durable_preflight` :1306-1324（:1320），后者唯一被 rebase 入口 `rebase(request) -> GenerationRebaseReceipt`（:1506-1510）的 immediate 事务内 :1670 调用。`GenerationRebaseKind.CREATE` 完全跳过该 preflight（:1312-1313）。

### 1.2 GraphCheckpoint 的正式事件序（producer 侧, unchain 仓）

- `src/unchain/kernel/run_outcomes.py:24` `finish_completed_run`：同一同步函数内先 emit `final_message`（:40-45）再 emit `run_completed`（:46-51）；Context V2 durable 路径经 `DurableEventSink`（`src/unchain/journal/runtime.py:314-378`）同步落 journal。
- `src/unchain/context/graph_checkpoint.py:1550` `GraphCheckpointService.complete_step`：:1574-1580 要求 canonical completed terminal 已存在（`_COMPLETED_TERMINALS` :43 = {run_completed, run.completed}），否则 `GraphCheckpointError`；通过后 :1587 调 `_seal_completed_terminal`。
- `_seal_completed_terminal` :1172-1210 → `JournalGraphCheckpointRepository.complete` :650-671：以 `attempt=step.attempt` append `event_type="graph.step.completed"`，payload 含 `terminal_cursor`（= run terminal 的 `EventCursor(store_seq, event_id)`，:106-107, :1202）与 `execution_event_range`（end == terminal cursor，:1109；读侧强校验 :794-797、:1105-1108 无 gap）。
- **step attempt == agent run attempt**：`graph_harness.py:136` `run_id != step.attempt.attempt_id` 报错。两侧共用同一 `events` 表（graph 事件经 BoundExecutionJournal，`sqlite_v2.py:783/:1559`；validator 读同表 :1343-1346）。
- **冷恢复补写 seal 契约有测试保护**：`tests/context_v2/test_graph_checkpoint.py:300` `test_restart_seals_canonical_terminal_left_before_graph_checkpoint` — 真实 SQLite 磁盘重开（非 fake），run_completed 已落、seal 缺失 → `recover(plan)` 恰好补 1 条 `graph.step.completed`。recover 补写路径 `graph_checkpoint.py:1234-1242`。
- seal 家族真实类型名：`graph.step.completed`（:659-671）、`graph.step.failed` / `graph.step.cancelled`（:673-692，`GraphTerminalStatus` :86-89；COMPLETED 走 terminal() 会被 :681-682 拒绝）。其余 graph 事件：`graph.execution.admitted`（:602）、`graph.step.started`（:616）、`graph.step.resume.admitted`（:638）、`graph.execution.completed`（:702）。
- **结论：合法 completed graph step 的 attempt 事件序必然是 … → final_message → run_completed → graph.step.completed，必然命中 :1464 拒绝。**

### 1.3 比原诊断更宽的爆炸半径（取证新发现）

1. **orchestration attempt 全类问题**：`graph.execution.admitted` 写在独立的 `plan.orchestration_attempt` 下（:598-605；:327-344 保证与各 step attempt_id 互异），且与 host 同 generation（PuPu `memory_v2_unchain_graph_checkpoint.py:299-302/:327`）。若 orchestration attempt 组无 run terminal → :1460 Blocked（`in_progress`）；若有 terminal 且 `graph.execution.*` 落在其后 → :1464 同款拒绝。**含 graph 执行的 previous generation 在 rebase preflight 中很可能结构性不可通过，不只是 step seal 时序问题。**
2. **crash window 反向误放行已证实**：seal 尚未写入时（崩溃在 run_completed 落盘与 complete_step 之间），step attempt terminal 恰为最后一条 → validator 三条件全过、静默放行——此时 graph checkpoint 其实未完成。preflight 链（`_assert_durable_preflight` → `_assert_no_prepared_checkpoint` :1132 / `_assert_no_pending_interaction` :1029 / 本 validator）无任何 graph checkpoint 完整性检查。双向错误成立。
3. **root graph 正常序确认**：PuPu `memory_v2_unchain_graph_root_completion.py:460` `complete_pupu_unchain_graph_root`：先 `graph_host.finalize()`（→ 追加 `graph.execution.completed` 于 orchestration attempt）再 `_append_root_terminal`（:280-322）在**同一** orchestration attempt 上依次 sink `final_message` → `run_completed`（:318 强制 final < terminal）。→ 完成的 root graph orchestration attempt 是 terminal-last，可通过 validator。
4. **delegated/shadow 分支确认**：`unchain_adapter.py:10471-10496` 仅当 `graph_active_bridge is not None and graph_completion_authorized` 才调 root completion；delegated（无 MEMORY_EXECUTION_COMPLETE 授权，:8883-8885, :9221-9227）与 shadow（walk graph_shadow_bridge，graph_active_bridge=None）都落入 else :10496 只调 `finalize()` — 只有 `graph.execution.completed`、无 root run terminal → 该 orchestration attempt 永远 :1460 Blocked → `context_v2_rebase_in_progress` 永久重试。

### 1.4 PuPu 调 complete_step 的位置（原报告行号修正）

- 原报告的 `unchain_adapter.py:10253` 实际是 `step_agent.resume_interaction(`（resume 分支）；正常分支 :10278 `step_agent.run(`。真实唯一 complete_step 调用在 **:10371-10374** `graph_checkpoint_host.complete_step(index, full_output=final_text)`，在 :10336 取消检查、:10359-10368 挂起检查（awaiting 时不调）之后。语义与方向正确，行号不准。

## 2. Sidecar 错误压缩（PuPu 仓 unchain_runtime/server/）

- 端点：`route_memory_v2.py:1039-1054` `@api_blueprint.post("/context/v2/session/rebase")` → `_generation_operation_for_store_owner(method_name="rebase_session")`。
- unchain-owner 路径：`memory_v2_unchain_generation_api.py:482-488` `except (GenerationRebaseConflict, GenerationRebaseUnavailable)` → `_translate_rebase_error` :349-393：
  - `GenerationRebasePreflightBlocked` → `context_v2_rebase_in_progress`（409, retryable, :355-360）；
  - 其余 Conflict 按 **`str(error).casefold()` 关键词匹配**分类（"operation"/"payload" → operation_conflict；"revision" → revision_conflict；否则 generation_conflict）——**用错误消息字符串做分类，脆弱**；
  - `GenerationRebaseUnavailable` 及一切兜底 → `context_v2_rebase_unavailable`（503, retryable=True, :388-393）。
- **detail 双层丢弃**：第一层 `_translate_rebase_error` 只输出固定文案；第二层 `route_memory_v2.py:305-312` 把 API 层文案再覆写为 `"Unchain-owned generation request failed"`。最终 `_error_response` :55-65 只出 {code, message, retryable, expected_revision?, actual_revision?}。renderer 只能拿到 code 粒度。
- 完整错误分类表（含 open scope、路由包装层、legacy 路径）已在取证输出归档；`context_v2_rebase_receipt_mismatch`（503, :502-506）等相邻 code 均已列明。

## 3. Renderer outbox 与 retry（PuPu 仓 src/ + electron/）

- Outbox：`src/SERVICEs/turn_mutation_outbox.js`，key `pupu.turn_mutation_outbox.v1`，MAX_ENTRIES=32。enqueue 三处：`use_chat_stream.js:12710`（resend）/ `:13002`（edit）/ `:13249`（delete），V2 时带冻结 `v2RebasePayload`（`context_v2_turn_mutation.js:278-319`，enqueue 时一次构造）。
- 调用链：`src/SERVICEs/bridges/context_v2_bridge.js:106` → preload `electron/preload/bridges/context_v2_bridge.js:68-79` → channel `context-v2:rebase-session`（`channels.js:158`）→ `register_handlers.js:640` → `service.js:2101-2131` POST `/context/v2/session/rebase`。
- Terminal 分类：`context_v2_turn_mutation.js:367-377` `TERMINAL_REBASE_ERROR_CODES` = {revision_conflict, generation_conflict, operation_conflict, attempt_generation_conflict, not_found, invalid_history, invalid_request, history_too_large, event_too_large}。**`context_v2_rebase_unavailable` 不在其中，JS 全仓对它零显式引用**，:381-385 注释明确 "Unknown codes classify as RETRYABLE on purpose" → 落入 unknown→retryable。`context_v2_rebase_in_progress` 有独立 IN_PROGRESS 处理（:379），同样非 terminal。
- Recovery：`use_chat_stream.js:13335-13641`；`scheduleRetry` :13397-13416：backoff `min(4000, 250 * 2^(attempt-1))`，`attempt >= 6` 放弃并提示 "Reopen the task to retry safely"；计数器是组件内 useRef Map（:1003），**重挂载归零**，outbox 留存 → 再次恢复。→ 与观察到的重复报错完全吻合。
- **后果放大器（取证结论）**：graph seal 是持久状态，`context_v2_rebase_unavailable` 却标 retryable=True——错误语义与实际可恢复性不符，重试永远不会成功。

## 4. 测试面盲区（cross-boundary-contract-gate 违反类）

- `tests/context_v2/test_sqlite_generation_rebase_v2.py`（1298 行）grep `graph` 零命中；全部 attempt fixture 由手工 `_append_event` 构造，事件类型仅 run_*/tool*/interaction*，成功路径一律 terminal-last。**真实 GraphCheckpoint producer → rebase consumer 的组合测试在两仓均不存在**（GraphCheckpointService 只被 3 个 graph 测试文件用到，均零 rebase 引用）。
- `:1464` "continued after its terminal event" 分支在两仓测试**零覆盖**；`context_v2_rebase_unavailable` 在两仓测试**零断言**（仅定义处命中）。
- Blocked/Unavailable 现有测试边界各 4 条（pending interaction / prepared checkpoint / unfinished attempt / unfinished tool；duplicated resolution / duplicated request / unpaired tool / duplicate terminal），全部断言零写入。

## 5. Context Composition（属 P-0000-0004 范围，不入本案）

- 证实：hint 唯一起源是非空 skill expansion（`context_composition_hint_v2.js:26-58`，composer 仅 slash-command 展开时存在 `use_chat_stream.js:379-406`）；无 hint → 无 module → receipt 无 `unchain.context/context_composition_v1` extension（`composition.py:411-413/:720-721`）；token 总量独立于 composition 存在（`run_bundle.py:406-431`）。
- 证实：工作树 Attach Panel 圆环只认 extension、无 provider-total 回退（`attach_panel.js:140-142/:601-618`；`selectLatestContextCompositionBundle` 刻意不回退旧 bundle）；modal 只能从被门控的圆环打开。
- 工作树切片（4 文件 +55 行 + 新文件 context_composition_progress.js 168 行）链路闭合但**零测试覆盖**。
- 另有能力门：`context_composition_capability.py:36-100` 要求 runtime protocol manifest 同时含两个 feature，否则不挂载。

## 6. 原诊断报告的偏差清单

| # | 原报告表述 | 取证结论 |
|---|---|---|
| 1 | `unchain_adapter.py:10253` 是 complete_step 调用点 | 实为 resume_interaction；complete_step 在 :10371-10374 |
| 2 | sidecar「将具体原因压缩」 | 证实且更糟：异常本身无结构化 detail 字段，Conflict 分类靠 message 字符串关键词匹配 |
| 3 | 问题限于 graph step seal 时序 | 更宽：orchestration attempt（graph.execution.*）同样结构性命中 :1460/:1464，delegated/shadow 分支永久 in_progress |
| 4 | 「seal 未写时 Rebase 反而可能错误放行」 | 证实为确定行为（非"可能"），且 preflight 链无任何 graph 完整性检查 |
| 5 | renderer「单次挂载最多约 6 次」 | 证实：250ms×2^n 封顶 4000ms，attempt>=6 放弃，重挂载计数归零 |
