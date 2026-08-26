---
case_id: M-0000-0001-2026-0814
updated_at: 2026-08-14T09:40:00-07:00
---

# 议案：Context V2 与 Memory V2 现状验收合规审查

## Q-001
- **问题**: PuPu 当前生产候选是否符合 Context V2 已确立的验收标准（`docs/architecture/context-v2-boundary-contracts.md` 的 CTX-B01–CTX-B06 boundary profile 与 CTX-S01–CTX-S06 state-sequence profile）？
- **判断边界**: 声明候选 = PuPu `dev` HEAD `93720ab1` + `unchain_runtime/unchain-core.lock.json` 锁定的 Unchain revision `d0572979aad7a66545a2cf03339a1813f3a3ff27`（立案时的 committed 状态）
- **non_goals**: 不决定修复实现；不评估 sibling Unchain 未锁定的 dev HEAD

## 主回答（Q-001）
- **回答 owner**: code-owner-unchain
- **回答**: **NO-GO**（不符合；已运行失败，非未运行）
- **依据**: E-0001, E-0002, E-0003, E-0011
- **适用边界**: 声明候选（`93720ab1` + `d0572979`）

### 逐项判定

**Boundary profile**

| 编号 | 判定 | 依据 |
|---|---|---|
| CTX-B01 | PASS | `tests/context_v2/test_model_context_projection.py` + PuPu `test_memory_v2_unchain_attachment_projection.py` 在锁定版实跑通过 |
| CTX-B02 | PASS | 同上 + `test_coordinator_materializes_image_and_removes_top_level_provenance` 等；错误码 `context_v2_model_projection_invalid` 实存 |
| CTX-B03 | PASS（unchain 侧）／PuPu 侧 NOT_RUN | `tests/test_provider_message_contract.py` 全通过（精确相等断言）；PuPu 锚点 `fake_openai_responses_server.test.mjs` 存在但未执行（超出本次边界） |
| CTX-B04 | PASS | `test_incomplete_tool_approval_resume_fields_fail_closed` parametrize `["request","response"]`，逐字对应文档「只存在一边必须 fail closed」 |
| CTX-B05 | PASS | `test_journal_message_projection.py` 正负双向齐备；错误码 `context_v2_journal_message_projection_invalid` 实存 |
| **CTX-B06** | **FAIL** | E-0001, E-0003, E-0012：lock 在声明候选之后被改动、指向 sibling dev HEAD、按 committed lock 组对时产品代码 ImportError——三重独立违反 |

**State-sequence profile**

| 编号 | 判定 | 依据 |
|---|---|---|
| CTX-S01 repeated chat | PASS | `test_context_p0_cold_composition_matrix.py:269-273` 第二轮 `assert ... == [...]` 整表精确相等 |
| CTX-S02 sequential approval | PASS | 同文件 `:328,340-341,332,385-417`：新旧 interaction ID 相异、B 无 receipt、工具 exactly once |
| **CTX-S03 cold resume** | **FAIL（已运行失败）** | E-0002：锁定版隔离环境实跑 `AttributeError: ... no attribute 'persist_bundle'` |
| CTX-S04 terminal identity | PASS | 同 `test_context_p0_cold_composition_matrix.py:234-240` |
| CTX-S05 provider media | PASS（unchain 侧）／PuPu 侧 NOT_RUN | `test_ollama_replay_frame_uses_the_exact_projected_request_messages` 断言实际投影 wire 一致 |
| **CTX-S06 deployed pair** | **FAIL** | 候选三处脏（含 lock 本身），证据 pair 与 committed lock 不可能同一，直接命中文档「dirty/不同 pair 不合并」 |

### 复盘后续风险现状（`context-v2-p0-contract-postmortem-2026-08-11.md` §八）

| 风险 | 现状 |
|---|---|
| remote `file_id` provider/account 绑定 | 仍未处理——`model_projection.py:136-148` 只做词法校验，对 account/provider_binding 零校验 |
| 非字符串 assistant content | 部分覆盖，无专项后续 commit |
| PDF 预算精度 | 仍未处理——`budget.py:15` 平摊常量，`_pdf_pages()` 只信任声明 metadata，不解析实体 |

### 总体判定依据

按 `context-v2-boundary-contracts.md` §四「已运行失败是 NO-GO」——CTX-B06 结构性失败（候选不成其为冻结候选）+ CTX-S03 已运行失败（两个独立失败面），且失败点在函数内懒 import，不会在启动/冒烟阶段暴露，只在聊天路径命中时爆炸，与 2026-08-11 P0 同构。

- **已知未知**: PuPu 侧发布证据（CI checkout log、packaged admission、release certification artifact）、打包态 unchain 源解析路径未核实；见「owner 空白」
- **owner 空白**:
  - CTX-B03/S05 PuPu 侧锚点 `scripts/test-api/fake_openai_responses_server.test.mjs` 实跑 — `code-owner-devtools`
  - CTX-S06 的 CI checkout log、packaged admission、release certification artifact — `code-owner-devtools` + `task-owner-release-certification`
  - 打包态（`app.isPackaged`）下 unchain 源解析路径 — `code-owner-electron`
  - 未申报改动 `use_chat_stream.js`（19 行删除，`trackDurableResumeStartedKey`）的归属确认 — `code-owner-chat-core`（**注**：已由 S-0005 确认为 CEO 本人 09:16 commit `c0106670` 的一部分，非本案调查造成，此项降级为知会而非阻断空白）

---

## Q-002
- **问题**: PuPu 当前生产候选是否符合 Memory V2 已确立的验收标准（`docs/architecture/memory-v2-claude-handoff-2026-08-07.md` §17 Definition of Done 10 条 + §12 已知技术债 + `docs/architecture/memory-v2-p0-followups.md`）？
- **判断边界**: 声明候选 = PuPu `dev` HEAD `93720ab1` + 锁定 Unchain revision `d0572979aad7a66545a2cf03339a1813f3a3ff27`
- **non_goals**: 不决定修复实现；不重新裁定 `0000-0002-2026-0807`／`0000-0003-2026-0807` 两个尚待裁定的历史案

## 主回答（Q-002）
- **回答 owner**: code-owner-unchain
- **回答**: **NO-GO**（不符合）
- **依据**: E-0003, E-0004, E-0005, E-0006, E-0007, E-0008, E-0009, E-0010, E-0011
- **适用边界**: 声明候选（`93720ab1` + `d0572979`）；DoD 条件 2/4/9/10 的判定与 lock revision 无关（pair-independent），对当前实际候选同样成立

### §17 Definition of Done 逐条判定

| # | 条件 | 判定 | 依据 |
|---|---|---|---|
| 1 | V2 Inspect Memory 展示 Workspace/candidate/entry/revision/provenance/Task State | PARTIAL | E-0010：tree/entries/candidates 只读视图已落地（`memory_v2_tree_state.js` 仅 3 个 bridge 操作），但 `listCandidates/listJobs/listPromotions/revision/provenance` 命中 0；Pinned Task State 四层契约完全不存在；非按 admission 分流，是叠加渲染 |
| **2** | 无敏感事实完成 candidate→Curator→entry→promotion→recall 六步闭环 | **FAIL** | E-0005：本机 store `entries/candidates/consolidation_jobs/promotion_proposals` 一周内始终为 0，`curator_operation_receipts` 全部「领了没货」；六步一步未发生 |
| 3 | secret 被 Vault 捕获且永不进入 journal/Trace/memory | PARTIAL | 单元层 9 suites/131 tests 通过；但 store 无 secret 数据可反向验证，属 negative-by-vacuity |
| **4** | normal/graph/resume/subagent × OpenAI/Anthropic/Ollama focused matrix | **FAIL** | E-0006：没有任何一条路径同时覆盖三个 provider |
| 5 | restart 不重复 side effect；exact provider recovery 已启用并验证 | PARTIAL | E-0007：「启用」为真（本次同批提交才加）；「验证」为假（三张 lease/receipt 表 0 行） |
| 6 | Legacy chat 可读，V2 chat 错误 fail closed | PARTIAL（自洽组合下）／FAIL（声明候选下） | 声明候选下 `test_memory_v2_takeover_guard.py` 等直接失败（E-0004 同源）；自洽组合下单元层通过，但无产品级证据 |
| 7 | Trace live/reload 一致，引用可分页读取 | PARTIAL | React focused 105 tests 通过；分页已实现；但 Trace reload p95 无留存运行结果 |
| 8 | focused/full tests 通过，GitNexus change scope 符合预期 | 声明候选 FAIL／自洽组合 PASS（前半），GitNexus 半句 NOT_VERIFIED | E-0004；`detect_changes` 本次未跑 |
| **9** | shadow/canary 指标达到 P0 门槛 | **FAIL（未开始）** | E-0008：无指标采集实现，dev-only bypass 当前生效 |
| **10** | 移除不可达的 PuPu 旧 toolkit/curator/workspace fallback | **FAIL** | 四个 legacy 文件全在，合计约 4380 行；且按交接文档 §14 本就不该在闭环验收前删除 |

**统计：PASS 0 / PARTIAL 5 / FAIL 5。**

### §12 / `memory-v2-p0-followups.md` 已知缺口

- **PuPu 侧 7 项：0 项收敛**（review scrubber 跨页、content read 500 归一化、rollout-off manifest-aware resolver、session-head 严格只读投影、`memory_v2_unchain_ownership_adapter.py` 过期注释、`memory-system.md` 仍写 V1、GitNexus index 落后未核实）——依据 E-0010
- **Unchain 侧 11 项：0 项收敛**（`docs/` 相对 2026-08-07 交接快照零改动，抽查 2 项确认非文档滞后而是真未修）——依据 E-0009

### 总体判定依据

第一层：声明候选本身不可运行（E-0004，61 failed / 28 errors，唯二根因是缺 2 个符号，与 Q-001 CTX-B06 同一根因）。第二层：即使换成自洽组合，10 条 DoD 仍是 PASS 0——最硬证据是 DoD 2（E-0005）：真实使用一周、journal/artifact 面持续增长（executions 1→6、events 17→197、artifacts 4→59），但 memory 写入闭环（candidate/entry/promotion）**一次都未触发**。这不是「还没测」，是「真实使用中从未走通」。第三层：与 2026-08-07 交接文档自评一致甚至更低——canary「25%」对应配置面而非可观测面（无采集代码）；Inspector「65%」的四项点名内容（candidate/revision/provenance/Task State）一项都不在 UI 上。

unchain library 自身在两个 revision 上都全绿（`d0572979`: 2865 passed；`38547bc`: 2927 passed），核心代码成熟度高；缺的是产品闭环证据、跨 provider 矩阵、rollout 可观测性与发布门禁，这一区分不应被总体 NO-GO 判定抹平。

- **owner 空白**:
  - DoD 1 剩余四项（candidate/revision/provenance/Task State 视图）是否在计划内；`getTaskState` 四层只读契约需要新增 BC/SEQ — `code-owner-settings`
  - empty state 语义、admission 分流 vs 叠加渲染是否为产品决策变更 — `code-owner-settings`
  - packaged rollout 真实配置值（`build_feature_flags.json` 系未入库本地产物，不能当发布真相）、dev-only bypass 封堵证明、当前发布候选冻结点确认、是否需要 CI 加同批 lock/symbol 门禁 — `code-owner-runtime`
  - Windows shadow 约束、packaged/dev Electron 分开验收证据 — `code-owner-devtools`

---

## 候选漂移说明

见 record.md S-0005 / evidence.md E-0012：候选在调查窗口内实际移动了三次（立案时 `93720ab1`+`d0572979` → 调查中途 lock 被改为 `38547bc`（未提交）→ CEO 本人 09:16 提交 `c0106670`，lock 落定为 `38547bc`；此后 sibling unchain dev 又前进到 `de94855`，PuPu lock 未跟进）。

**本议案裁定的是立案时声明的候选**，该候选已发生真实 NO-GO（CTX-B06/CTX-S03/DoD-2 等）。当前实际候选（`c0106670`+`38547bc`）自洽（E-0004 的 B/C 组已证明可运行），CTX-B01–B05/CTX-S01/02/04/05 大概率不受影响（本轮变更只新增 RunBundleLedger，未改动 Context V2 相关文件），但**未经独立重新实跑确认，不构成 PASS 声明**；按同一份文档自己的规则，未重新验证的适用单元格只能是 `NOT_RUN`，对应 `INCOMPLETE`，不能推定 PASS。**DoD 2/4/9/10 的 FAIL 判定与 lock revision 无关，对当前实际候选同样成立**——这是本议案对「当前」最有把握的部分。

### MS-001 | 2026-08-14T09:42:00-07:00
- **supersedes**: null
- **included contributions**: S-0003, S-0004, S-0005
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **content hash**: sha256:324a95f7a963f3b55117538b02c35b297102711485ea82a803d798960f7f1350
- **formed_by**: code-owner-unchain
