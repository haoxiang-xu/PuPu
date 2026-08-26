---
case_id: P-0000-0007-2026-0815
discussion_type: proposal
boundary_protocol: v1
record_errata_manifest: record-errata.S-0052.json
procedure_mode: collaboration
status: awaiting-handoff
stage_instance_id: null
acceptance_series_id: null
evidence_continuation_ref: null
proposal_ruling_scope: ACTION
lead_owner: code-owner-unchain
current_owner: code-owner-runtime
current_artifact_ref: P-0000-0007-2026-0815#PS-007
boundary_contract_refs: [BC-001, BC-002, BC-003, BC-004]
state_sequence_refs: [SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007]
review_snapshot_ref: RS-002
objection_group_refs: []
full_vote_ref: null
full_scope_overlay_ref: null
parent_case_id: null
relation: null
derived_from: null
blocking: false
blocking_case_id: null
created_at: 2026-08-15T20:23:40-07:00
updated_at: 2026-08-17T10:44:38-07:00
---

# Generation Rebase 与 GraphCheckpoint attempt quiescence 契约冲突修复

## 讨论对象
- **目标结果**: 在 Unchain durable journal 上建立一份 producer 与 consumer 一致的 attempt quiescence 契约，使 (a) 合法完成的 graph step attempt（`… → final_message → run_completed → graph.step.completed`）能通过 generation rebase preflight；(b) crash window（run terminal 已落盘、seal 未写）不再被静默放行，而是给出确定的 recovery/in-progress 分类；(c) orchestration attempt（`graph.execution.*`，含 delegated / shadow 分支）取得确定且不进入永久重试的分类；(d) 失败语义端到端结构化，从 Unchain 异常 → sidecar error code → renderer outbox retry 分类一致，使不可恢复状态停止热循环重试，同时不丢弃用户的 frozen turn-mutation outbox。
- **non_goals**:
  - 不修改、重排、删除或重写任何历史 journal 事件行；用户原库只读，验证只在隔离副本上进行。
  - 不改动 GraphCheckpoint 的 seal-after-terminal 契约本身，包括冷恢复补 seal 路径与保护它的既有测试。
  - 不改动 runtime protocol 版本 lock，不恢复 Git SHA allowlist 或以 source/revision 作 capability admission。
  - 不因 rebase 失败丢弃、静默清空或降级用户的 turn-mutation outbox 条目。
  - 不放宽 validator 为任意 post-terminal 事件开通用口子；不把真正未完成（等待 interaction）的 graph 放行。
  - Context Composition / token usage UI 与 Attach Panel 圆环回退策略（诊断报告 §八/§九）属 P-0000-0004-2026-0815 的实施与验收范围，不入本案。
  - 不迁移、改写或重判 P-0000-0005-2026-0815 的 historical durable interaction resolution repair 对象（父案 post-ruling 迁移的 `BC-009 / SEQ-007 / AC-013`）；本案讨论对象是 attempt quiescence 分类与 graph seal / orchestration terminal 语义，不是 historical interaction resolution 的迁移与修复。
  - 本 framing 不授权任何生产代码改动；production authority NONE，PLAN_RULING + CLOSURE_COMMIT 生效前不得实施。
- **初始已知范围**:
  - Unchain（consumer/producer 同仓）: `src/unchain/persistence/sqlite_generation_rebase_v2.py`（`_assert_no_open_attempt_or_tool` 与 terminal-last 规则、`GenerationRebaseError` 异常族）、`src/unchain/context/graph_checkpoint.py`（`complete_step` / `_seal_completed_terminal` / `recover`）、`src/unchain/kernel/run_outcomes.py`、`src/unchain/journal/runtime.py`、`tests/context_v2/`。
  - PuPu sidecar: `unchain_runtime/server/memory_v2_unchain_generation_api.py`（`_translate_rebase_error`）、`route_memory_v2.py`（rebase 端点与 detail 覆写）、`memory_v2_unchain_graph_checkpoint.py`、`memory_v2_unchain_graph_root_completion.py`、`unchain_adapter.py`（`complete_step` 调用点与 delegated / shadow 分支）。
  - PuPu renderer/Electron: `src/SERVICEs/context_v2_turn_mutation.js`（`TERMINAL_REBASE_ERROR_CODES`）、`src/SERVICEs/turn_mutation_outbox.js`、`src/PAGEs/chat/hooks/use_chat_stream.js` 的 recovery / `scheduleRetry`、`context_v2_bridge` 与 IPC 转发链。
- **当前 write_set**: 按 PS-002 实施范围 —— Unchain 新增 `src/unchain/journal/graph_attempt_quiescence.py`（共享词汇模块，含 seal descriptor 严格 parser 与只读 plan 定位辅助）、改写 `src/unchain/persistence/sqlite_generation_rebase_v2.py` 为分类式 attempt quiescence validator 并为每个 raise 点补结构化 `reason`、`src/unchain/context/graph_checkpoint.py` 仅作词汇常量搬迁（语义逐字不变）、新增 `tests/context_v2/` 真实 producer → 严格 consumer 契约测试；PuPu sidecar 的 reason→code 三级分类器、内联有界 recovery 编排与出网 code allowlist 已由 SLOT-002 / SLOT-005 交付（HS-001 RETURNED）；renderer terminal / quarantine 分类与持久化重试上界（SLOT-003，HS-002 进行中）、Electron 透传确认（SLOT-004）、release artifact provenance（SLOT-006）仍为 PENDING_HANDOFF，未由主 owner 代写
- **当前 contract_set**: BC-001, BC-002, BC-003, BC-004
- **当前 boundary contracts**: BC-001, BC-002, BC-003, BC-004
- **当前 state sequences**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007

## 主 owner
- **选择**: code-owner-unchain
- **选择依据**: 修复核心是 Unchain durable journal 上 producer（GraphCheckpoint seal）与 consumer（generation rebase preflight validator）之间的 quiescence 契约，两侧都在 `unchain:**` 边界内；结构化失败语义也必须先由 Unchain 异常族产出，PuPu sidecar 与 renderer 是其严格下游消费者。方案的主要实施结果集成责任因此落在 Unchain core owner。
- **选择不确定性**: sidecar 错误分类（`code-owner-runtime`）、renderer retry/outbox 分类（`code-owner-chat-core`）与可能的 IPC/bridge 转发（`code-owner-electron`）都在主 owner 边界外，必须留明确空白并逐个串行 `HS-###` 确认，不得由主 owner 代写。orchestration attempt（含 delegated / shadow root 生命周期）的最终归属可能跨 Unchain 与 PuPu adapter 两侧，由主 owner 在首稿中点名空白。机械边界匹配工具（`summon.py lead proposal`）建议 `code-owner-electron`，该结果被 Speaker 否决：其命中主要来自 6 处裸文件名多解与把 unchain 仓路径误前缀为 `pupu:`，不反映语义责任；否决理由记录在 S-0001。
- **选择事件**: S-0001

## owner chain
- lead | code-owner-unchain | S-0001 | active（始终承担最终集成责任）
- HS-001 | code-owner-unchain → code-owner-runtime | SLOT-002, SLOT-005 | S-0005 | RETURNED S-0007
- HS-002 | code-owner-unchain → code-owner-chat-core | SLOT-003 | S-0010 | RETURNED S-0012
- HS-003 | code-owner-unchain → code-owner-electron | SLOT-004 | S-0015 | RETURNED S-0018
- HS-004 | code-owner-unchain → code-owner-shared-arteries | SLOT-007 | S-0021 | RETURNED S-0023
- HS-005 | code-owner-unchain → code-owner-devtools | SLOT-006, SEQ-007 | S-0026 | RETURNED S-0028
- HS-006 | code-owner-unchain → code-owner-runtime | PS-008 runtime successor blanks: BC-003/BC-004/BC-007, SEQ-005/SEQ-006/SEQ-008, AC-011/AC-017 | S-0055 | EXPIRED S-0056
- HS-007 | code-owner-unchain → code-owner-runtime | PS-008 runtime successor blanks reroute: BC-003/BC-004/BC-007, SEQ-005/SEQ-006/SEQ-008, AC-011/AC-017 | S-0057 | OPEN

## 当前 handoff
- **open**: HS-007 | S-0057 | code-owner-runtime | expires 2026-08-17T12:43:51-07:00
- **return_to**: code-owner-unchain

## 合作 owner
- code-owner-unchain | lead/integration | P-0000-0007-2026-0815#PS-006 | voting=true
- code-owner-runtime | SLOT-002 / SLOT-005 与 BC-003 consumer、BC-004 producer、SEQ-005、SEQ-006 确认 | HS-001 | voting=true
- code-owner-chat-core | SLOT-003 与 BC-004 分类段 consumer、SEQ-004 确认、AC-012 正文 | HS-002 | voting=true
- code-owner-electron | SLOT-004 与 BC-004 载体段确认、AC-012 位置 (E) 正文 | HS-003 | voting=true
- code-owner-shared-arteries | SLOT-007 与 BC-004 反解段确认、AC-012 位置 (F) 正文 | HS-004 | voting=true
- code-owner-devtools | SLOT-006 与 SEQ-007 确认、AC-014 devtools 段正文 | HS-005 | voting=true
- **N**: 6 | RS-001 冻结、RS-002 逐字沿用，底层 agent 去重后每人一票；successor review 不改变 electorate

## 当前产出与审查
- **artifact**: P-0000-0007-2026-0815#PS-007 | content sha256:6ff723b6…df1c316 | boundary object sha256:b16ed25a…f9d720b（十一对象中仅 BC-004 行区间更正，其余十个逐字未动）
- **return routing**: S-0049 / S-0050 | PS-007 已退出 current ruling intake，本案回到 drafting；下一 artifact 为 lead 集成的 PS-008（尚未创建），下一 review 为 Speaker 冻结的 RS-003（尚未创建）
- **gate state**: GATE_BLOCKED_AWAITING_HS_007 | successor record errata overlay ACTIVE under R-0006 / S-0053; R-0005 activation consumed/failed and non-reactivatable; S-0054 through S-0057 structurally valid append-only record events preserved; HS-006 EXPIRED S-0056 without material return; HS-007 OPEN awaiting code-owner-runtime material RETURN; S-0051 remains INVALID; S-0052 controlling invalidation preserved; S-0028 / S-0040 canonical projections active only for lint; PS-008 / RS-003 NOT_YET_CREATED; production authority NONE
- **review electorate**: RS-002 | frozen | 六人不变，N=6
- **carried stances**: chat-core S-0037、electron S-0038、shared-arteries S-0039 按 `owner=S-####@RS-001` 逐项沿用（CARRIED_UNCHANGED）
- **re-review owners**: code-owner-unchain（新 baseline）、code-owner-runtime（其异议落文自判）、code-owner-devtools（S-0040 形式不合规，重排）
- **review deadline / objection intake deadline**: 2026-08-16T10:42:00-07:00
- **lead disposition deadline / final**: 2026-08-16T11:12:00-07:00 / 2026-08-16T11:27:00-07:00
- **objection lineage**: S-0035（runtime）→ S-0041 `LEAD_DISPOSITION: ACCEPT`（全部接受）→ RESOLVED_BY_ACCEPT，由 PS-007 落文兑现；RS-002 无 CARRIED OBJECT，D=0，不触发辩论庭
- **Speaker 门禁复核**: S-0006、S-0011、S-0016、S-0022、S-0027、S-0031、S-0042 | 七份快照的 content hash 与 boundary object hash 均已重算通过；AC 集合七次集成后仍精确为 AC-001..AC-016

## RS-001 准备清单（冻结时已逐项落实，详见 S-0031）
- **RSP-1 · AC-012 与 AC-014 的 stance 权覆盖**: AC-012 五方（chat-core A/B/C、runtime D、electron E、shared-arteries F）与 AC-014 三方（runtime、devtools、lead）均已逐人写入 RS-001 的 `stance scope` 字段
- **RSP-2 · 位置 (D) fixture 稳定引用点**: 已在 RS-001 标注为 Chief 明示处置项（U-18），冻结不改变其状态
- **RSP-3 · 条件达成核验索引**: 采纳记录索引已写入 RS-001（M-1..M-7 见 S-0008；M-8..M-15 见 S-0013；M-16..M-21 见 S-0019；M-22..M-27 见 S-0024；M-28..M-32 与 V 系列见 S-0029）；条件是否达成由各 owner 自行以 stance 判断
- **RSP-4 · R6**: 第五次提请随冻结入卷，保持 SUMMARY 的 mandatory responses
- **附注 · U-25**: 已在 RS-001 点名请 code-owner-runtime 在窗口内明示

## 未决取舍与形式残余
- **carry-forward R6**: 内联 recovery 写者 vs 新增独立 endpoint，仍未裁定。退路代价三侧实测齐备（electron 加三格零返修、shared-arteries 零追加零返修、**唯 chat-core 为真返修**）。Speaker 维持 S-0017 的程序推进决定，不表达倾向
- **lint 残余分类（S-0032）**: 冻结后 `quorum_lint` 余 6 条 —— (1) `boundary_revision_set` 待候选冻结，**唯一实质项**；(2)(3) S-0028 形式缺陷两条，见下；(4) `RS-001 must directly supersede an existing predecessor RS`，属工具以 latest PS 的 `supersedes` 推断 review 世代的建模差异，本案 PS-001..PS-005 是交棒期 drafting 快照从未 review，RS-001 依法典写 `supersedes: null` 正确，宜另案处置；(5)(6) 六条 stance 事件缺失，属窗口进行中，非缺陷
- **Speaker 自我更正（S-0033）**: S-0032 追加后 90 秒内，Speaker 将其 `target` 由 `RS-001` 改为 `case` 并即时公开披露。原写法会使 RS-001 出现两条 canonical NOTICE 而令其全部校验被跳过；该判定只看 `target` 字段，追加方式无法修复。改动限于 Speaker 自己的纯程序注记、无其他事件引用，不构成修改他人记录或实体事件的先例
- **S-0028 形式缺陷**: `contribution` 字段内两个裸编号各重复 5 次，违反不得重复的规定。Speaker 已机械验证：append-only 下**不存在**能使该 linter 输出归零的补救构造（第二条 RETURN 会新增两条错误；NOTICE 不参与该字段解析；另开交棒不改变已 RETURNED 事件的字段）。已以 S-0030 记录缺陷、归一投影与送 Chief 的两个选项，不伪造归零、不改写记录。缺陷为 FORMAL_ONLY，不影响覆盖判定与 electorate，RS-001 照常冻结
- **coverage gap（三条并列，SUMMARY 必须逐条显名）**: (a) 载体段（electron）义务以 HS-003 contribution + RS stance 承载，未占 BC-004 字段；(b) 反解段（shared-arteries）已收口为「已知情、已同意，仅形式上未占字段」，与 (a) 同级；(c) BC-004 为四方义务而 v1 的 BC 只有两个 confirmation 字段 —— Speaker 判断属 boundary protocol v1 的结构性限制而非任何一方疏漏，是否拆分归 Chief 裁量。两位相关 owner 均明确不要求拆分且不以此为同意条件。依据与限度见 S-0016、S-0022、S-0024
- **implementation 期待办（Speaker flagged，非本案 write_set）**: AC-012 位置 (E) 的「零新增双胞胎槽位」方案依赖 `src/electron/tests/**` 两组三槽今天已齐备，而该目录属 **devtools** 边界 `pupu:src/electron/**`；若实施期需新增或修改 S3 CRA shim，写入责任在 devtools。已于 S-0026 向本棒 owner 显名，由其与 lead 判断是否补记

## 边界契约门 (v1)
- **适用性**: APPLICABLE。本案是真实的 cross-repository + persistence + process 边界案：Unchain 仓与 PuPu 仓分属两个 owner 索引；durable SQLite journal 是持久化边界；sidecar HTTP/SSE 与 Electron IPC 是进程边界；行为依赖 attempt、interaction、retry、resume、restart、replay 状态。
- **禁止写法**: `boundary N/A reason` 与 `state sequence N/A reason` 不得写 `NOT_APPLICABLE` 结论；`PENDING_DISCOVERY` 只在 drafting 中间快照合法，送裁前必须由完整 `BC-### / SEQ-###` 取代。
- **门禁**: 命中跨边界却缺完整 `BC-###`、命中 durable state 却缺完整 `SEQ-###`、缺任一侧 owner 确认或缺 `AC-###` 映射时，快照可以冻结以暴露异议，但不得标为 ruling-ready；参见 [`cross-boundary-contract-gate`](../../../rules/cross-boundary-contract-gate.md)。
- **证据要求**: 真实 GraphCheckpoint producer 输出喂严格 consumer；禁止双方共享同一宽松 fixture；crash window 与冷重启 resume 属适用状态单元格。

## 关系与阻塞
- **parent**: null
- **relation**: null
- **derived_from**: null
- **blocking**: false
- **blocking child**: null
- **relation 理由**: 本案讨论对象是一个已发布契约对之间既存的生产缺陷，由用户运行时失败与 Chief 指令触发；它不迁移任何 parent proposal 的正文，不是任何 parent 冻结目标的必要子块，其结果也不返回任何 parent 集成。因此按[延伸与 Side Case](../../../codex/lifecycle/side-cases.md) 记为独立 ACTION proposal，不建立 parent 依赖。若主 owner 集成时发现修复必须改动 P-0000-0002-2026-0813 获准 PS-001 或 P-0000-0005-2026-0815 的迁移对象，须提交 `SCOPE_REQUEST` 由 Chief 处置，不得静默吸收。

## 相关 case（协调事实，非程序依赖）
- P-0000-0002-2026-0813 | implementing | Run Bundle v1；本案不继承其 authority、electorate 或 stance。
- P-0000-0003-2026-0814 | implementing | runtime protocol 握手；本缺陷不是准入问题，取证确认请求已过 protocol 门。
- P-0000-0004-2026-0815 | implementing | Context Composition V1；诊断报告 §八/§九 属其范围，见 non_goals。
- P-0000-0005-2026-0815 | drafting | historical durable interaction resolution repair；讨论对象不同，边界划分见 non_goals。
- M-0000-0001-2026-0814 | awaiting-ruling | Context V2 / Memory V2 现状验收合规审查。

## 文件索引
- [协作记录](record.md)
- [intake · 取证事实](intake/fact-check.md)
- [intake · Chief 指令与诊断报告要点](intake/chief-directive.md)
