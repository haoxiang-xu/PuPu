---
case_id: M-0000-0001-2026-0814
---

# 证据台账

### E-0001 | repository
- **source type**: 自证类（隔离 worktree 实跑）
- **locator**: `unchain_runtime/server/production_run_ownership.py:18`、`memory_v2_unchain_runtime_factory.py:62`；符号 `official_provider_transport_target_sha256`
- **acquisition**: `code-owner-unchain` 用 `git worktree add --detach` 在锁定 revision `d0572979aad7a66545a2cf03339a1813f3a3ff27` 隔离取证，`PYTHONPATH`/`UNCHAIN_SOURCE_PATH` 自证指向该 revision
- **submission source**: S-0003（Q-001 ANSWER 附带调查）
- **supports/refutes**: 支持 CTX-B06 / CTX-S03 判 FAIL/NO-GO
- **decision link**: M-0000-0001-2026-0814#Q-001
- **limitations**: 仅覆盖懒 import 触发点，未覆盖运行时是否真的走到该分支
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0002 | repository
- **source type**: 自证类（隔离 worktree 实跑测试）
- **locator**: `tests/test_memory_v2_unchain_active_graph_restart.py:295`（PuPu sidecar）
- **acquisition**: 同 E-0001 隔离环境下实跑 pytest，得到 `AttributeError: type object '_SQLiteBoundContextV2Repository' has no attribute 'persist_bundle'`
- **submission source**: S-0003
- **supports/refutes**: 支持 CTX-S03 判「已运行失败」（NO-GO，非 NOT_RUN）
- **decision link**: M-0000-0001-2026-0814#Q-001
- **limitations**: 单一测试文件；「冷」在该矩阵中是同进程重建，非真实 OS 级 sidecar 重启
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0003 | repository
- **source type**: 自证类（git 历史比对）
- **locator**: `src/unchain/context/provider_execution.py:48`（symbol 引入点）、`src/unchain/run_bundle.py`
- **acquisition**: `git log -S"official_provider_transport_target_sha256"` 定位符号引入于 unchain `38547bc`（2026-08-14 08:45:30 -07:00）；PuPu `93720ab1` 提交于 2026-08-14 08:45:28 -07:00（相差 2 秒同批开发，lock 未同步 bump）
- **submission source**: S-0003, S-0004
- **supports/refutes**: 支持「lock 与 PuPu commit 缺同批门禁」这一根因判断
- **decision link**: M-0000-0001-2026-0814#Q-001, #Q-002
- **limitations**: 无
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0004 | repository
- **source type**: 自证类（三组对照实跑，`git archive` 抽取干净副本）
- **locator**: `unchain_runtime/server/tests` 全量
- **acquisition**: A 组（PuPu `93720ab1` + unchain `d0572979`，即 Q-002 声明候选）= `61 failed, 1711 passed, 3 skipped, 28 collection errors`；B/C 组（同 PuPu + unchain `38547bc`，脏/干净副本各一次）= `1913 passed, 3 skipped, 3508 subtests passed`（两次结果一致，证明与工作树脏度无关）
- **submission source**: S-0004
- **supports/refutes**: 支持 Q-002 声明候选「不可运行」；同时支持「问题唯二根因（缺 2 个符号）」
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: 未跑 React/Electron 侧在 A 组下的表现（该侧不依赖失效符号，不预期受影响，但未逐一复核）
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0005 | repository
- **source type**: 自证类（本机 official store 只读快照）
- **locator**: `~/Library/Application Support/PuPu/memory_v2/context_v2.sqlite3`（immutable URI 只读连接）
- **acquisition**: `sqlite3 'file:...?immutable=1'` 查询 `entries/entry_revisions/candidates/candidate_revisions/consolidation_jobs/memory_review_proposals/promotion_proposals/promotion_revisions/promotion_operation_receipts` 均为 0；对照 2026-08-07 交接快照逐格相同；`executions` 1→6、`events` 17→197、`spaces` 2→7、`artifacts` 4→59（journal/artifact 面在真实增长）；`curator_operation_receipts=6` 全部 `operation_kind=claim_next / result_kind=none`；最后一次 admission 时间戳 = 2026-08-11T20:10:50，此后无新 execution
- **submission source**: S-0004
- **supports/refutes**: 支持 DoD 条件 2 判 FAIL——memory 写入闭环在一周真实使用中零次触发，与 pair-independent（和 lock revision 无关）
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: 单机 dev 环境，n=1；不能外推用户群体比例
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0006 | repository
- **source type**: 自证类（grep 计数）
- **locator**: `unchain_runtime/server/tests/test_memory_v2_unchain_active_bridge.py`、`test_memory_v2_unchain_active_resume.py`、`test_memory_v2_unchain_active_stream.py`、`test_memory_v2_unchain_active_graph_restart.py`
- **acquisition**: 按 provider 关键字（openai/anthropic/ollama）逐文件计数命中：normal/resume 仅 Ollama；graph 仅 OpenAI/Anthropic；stream 仅 Ollama；subagent 路径无 provider 维度覆盖
- **submission source**: S-0004
- **supports/refutes**: 支持 DoD 条件 4（跨 provider matrix）判 FAIL——没有任何一条路径同时覆盖三个 provider
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: 只统计 PuPu active host 侧测试文件，未统计 unchain library 侧 wire 契约测试（后者已在 CTX-B03 单独判 PASS）
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0007 | repository
- **source type**: 自证类（代码 + 数据库表核对）
- **locator**: `unchain_runtime/server/memory_v2_unchain_runtime_factory.py:698-716,962-974`；DB 表 `provider_request_lease_heads`、`provider_request_lease_revisions`、`provider_turn_result_receipts`
- **acquisition**: `provider_turns_enabled` 于 `93720ab1`（2026-08-14 本次同批提交）首次置 true（`git log -S` 定位；`cd56dc0f` 交接快照时不存在）；三张 lease/receipt 表建表但行数均为 0
- **submission source**: S-0004
- **supports/refutes**: 支持 DoD 条件 5「启用」为真、「验证」为假的精细判定（PARTIAL）
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: 无
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0008 | repository
- **source type**: 自证类（rollout 模块代码核对）
- **locator**: `electron/main/services/unchain/memory_v2_rollout.js`
- **acquisition**: grep `fatal_rate|orphan_tool|p95|canary_metric|metrics` 命中 0；该模块只承载 mode/percent/bucket/fingerprint；`ps` 实测运行进程环境变量 `PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV=1`
- **submission source**: S-0004
- **supports/refutes**: 支持 DoD 条件 9 判 FAIL（未开始）——无指标采集实现，dev-only bypass 当前生效
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: 未核实 packaged 构建下该 bypass 是否可能被引入（已列为边界空白）
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0009 | repository
- **source type**: 自证类（git diff 空差异 + 抽查）
- **locator**: `docs/context-memory-v2-p0-followups.md`、`docs/context-memory-v2-provider-compatibility-backlog.md`、`docs/context-memory-v2-security-backlog.md`（unchain 仓库）；`unchain_runtime/server/run_tests.sh:34-35`
- **acquisition**: `git diff --stat a4e69f4..d0572979 -- docs/` 空输出（三份 backlog 文档自 2026-08-07 交接快照零改动）；抽查确认 `run_tests.sh` 旧包名 preflight 仍未修
- **submission source**: S-0004
- **supports/refutes**: 支持「Unchain 侧 11 项已知技术债 0 项收敛」
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: 仅抽查 2 项验证非文档滞后，其余 9 项以 diff 空差异为唯一依据
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0010 | repository
- **source type**: 自证类（代码核对，PuPu 侧 §12/followups 逐项）
- **locator**: `src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:372-393`；`unchain_runtime/server/route_memory_v2.py:96-103,236-247,1059-1067`；`unchain_runtime/server/memory_v2_unchain_ownership_adapter.py:6-7`；`docs/architecture/memory-system.md`
- **acquisition**: 逐项读码确认：review scrubber 仍逐页替换无 overlap window；content read 错误仍归一 500；rollout-off 仍是二选一无 manifest-aware resolver；session-head 仍 cold-open verified Generation API；旧「production gate remains closed」注释未删；`memory-system.md` 全文 0 次出现 "V2"
- **submission source**: S-0004
- **supports/refutes**: 支持 PuPu 侧 7 项已知缺口 0 项收敛
- **decision link**: M-0000-0001-2026-0814#Q-002
- **limitations**: GitNexus index 落后一项未核实（NOT_VERIFIED）
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0011 | repository
- **source type**: 自证类（本轮独立复现与既有 agent-memory 交叉核对）
- **locator**: `.claude/agent-memory/code-owner-unchain/lazy-import-defers-locked-pair-breakage.md`、`locked-revision-test-isolation-trap.md`
- **acquisition**: Q-002 investigator 在完成调查后读到这两份由 Q-001 investigator（同一 owner 角色的独立 instance）先前写入的记忆文件，符号名、commit SHA、失败形态逐项吻合，构成独立复现的交叉验证
- **submission source**: S-0004
- **supports/refutes**: 加固 E-0001/E-0003 的可信度（同一发现被两个独立 instance 各自实测得出）
- **decision link**: M-0000-0001-2026-0814#Q-001, #Q-002
- **limitations**: 无
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无

### E-0012 | repository
- **source type**: 自证类（候选漂移时间线，clerk 直接核对）
- **locator**: `unchain_runtime/unchain-core.lock.json`；PuPu/`unchain` 两仓 `git log -1`
- **acquisition**: 立案时（09:01）候选为 PuPu `93720ab1` + lock `d0572979`（committed，工作树干净）；调查中途 09:06:13 lock 被改为 `38547bc`（未提交）；09:16:38 CEO 本人（`Haoxiang Xu`，peer session）提交 `c0106670`「feat: Update memory documentation and add new case records for compliance review」，一次性纳入本案 `case.md`/`record.md` 早期草稿、Q-001 investigator 写入的两份 agent-memory、以及三个与本案无关的既有改动（`run_bundle_v1.js`、`use_chat_stream.js` 死代码清理、lock bump 本身）；此后 sibling unchain dev 又前进到 `de94855`（PuPu lock 未跟进）
- **submission source**: S-0005
- **supports/refutes**: 说明「候选在调查窗口内实际移动了三次」，是判断 Q-001/Q-002 结论适用范围（历史声明候选 vs 当前实际候选）的关键背景事实
- **decision link**: M-0000-0001-2026-0814#Q-001, #Q-002
- **limitations**: 无
- **stable slices**: 无
- **challenge history**: 无
- **verification history**: 无
