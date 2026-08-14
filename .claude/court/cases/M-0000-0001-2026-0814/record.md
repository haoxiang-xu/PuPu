---
case_id: M-0000-0001-2026-0814
---

# 协作与庭审记录

## S-0001 | 2026-08-14T09:01:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: FRAMING
- **target**: case
- **basis**: intake-sha256:bb5f141cd1c77c7b86f8c9e44903cf7d479738d1e0c6e5431e7bf7ee3c9fdb86
- **decision effect**: 固定讨论对象并选择唯一主 owner
- **核心问题/目标**: PuPu 当前生产实现（PuPu dev HEAD `93720ab1` + Unchain locked revision `d0572979aad7a66545a2cf03339a1813f3a3ff27`）是否符合 Context V2 与 Memory V2 各自已确立的验收标准
- **non_goals**: 不决定验收失败项的具体修复实现；不重新裁定 `0000-0002-2026-0807` 与 `0000-0003-2026-0807` 两个尚待裁定的历史案；不评估 sibling Unchain repo 未锁定的 dev HEAD 改动
- **主 owner**: code-owner-unchain
- **选择依据**: 机械路径路由（`summon.py lead motion`）对 Context V2 与 Memory V2 两份材料均给出唯一最高命中 code-owner-unchain，且两份验收标准文档的绝大多数证据锚点在 Unchain 仓库核心代码
- **选择不确定性**: PuPu 侧 lock/release 证据、rollout/capability 配置、memory-inspect UI 缺口预期在其边界外，需经串行交棒补全
- **初始已知范围**: `docs/architecture/context-v2-boundary-contracts.md`, `docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md`, `docs/architecture/memory-v2-claude-handoff-2026-08-07.md`, `docs/architecture/memory-v2-p0-followups.md`, `unchain_runtime/unchain-core.lock.json`, `unchain:src/unchain/context/**`, `unchain:src/unchain/memory/**`

## S-0002 | 2026-08-14T09:03:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: case
- **basis**: S-0001, .claude/codex/court-records/discussion-model.md
- **decision effect**: 记录程序模式说明，避免与 2026-08-10 前 `track: full` 旧字段混淆
- **notice kind**: PROCEDURE_MODE_CLARIFICATION
- **说明**: 立案人原始请求使用「full 案」措辞。当前法典（2026-08-10 起）已取消 2026-08-10 前案卷使用的 `track: full`（预召集完整团队）字段；`procedure_mode` 只能从 `collaboration` 开始，`full`（众议庭）只能经异议升级门槛（`D>=3` 且 `D>N/2` 且异议组不可合并且 Speaker 开票通过）到达，不得在立案时预选。本案按现行规则以单一主 owner + collaboration 起步。

## S-0003 | 2026-08-14T09:12:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: ANSWER
- **target**: M-0000-0001-2026-0814#Q-001
- **basis**: E-0001, E-0002, E-0003, E-0011, `docs/architecture/context-v2-boundary-contracts.md`, `docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md`
- **decision effect**: 提交 Q-001（Context V2 验收合规）回答：NO-GO
- **摘要**: CTX-B01–B05、CTX-S01/02/04/05 在锁定版隔离取证下 PASS；**CTX-B06 FAIL**（lock 在声明候选之后被改动且指向 sibling dev HEAD，按 committed lock 组对时 PuPu 产品代码 `production_run_ownership` ImportError）；**CTX-S03 已运行失败**（`persist_bundle` AttributeError）。复盘 §八三项后续风险均未处理。完整判定表见 `motion.md#Q-001`

## S-0004 | 2026-08-14T09:25:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: ANSWER
- **target**: M-0000-0001-2026-0814#Q-002
- **basis**: E-0003, E-0004, E-0005, E-0006, E-0007, E-0008, E-0009, E-0010, E-0011, `docs/architecture/memory-v2-claude-handoff-2026-08-07.md`, `docs/architecture/memory-v2-p0-followups.md`
- **decision effect**: 提交 Q-002（Memory V2 验收合规）回答：NO-GO
- **摘要**: 声明候选本身不可运行（61 failed/28 collection errors，与 Q-001 CTX-B06 同一根因）；§17 Definition of Done 10 条中 PASS 0／PARTIAL 5／FAIL 5，最硬证据是条件 2——本机 official store 一周真实使用中 `entries/candidates/consolidation_jobs/promotion_proposals` 始终为 0，memory 写入闭环从未触发；§12 与 followups.md 记载的 PuPu 侧 7 项、Unchain 侧 11 项已知缺口 0 项收敛。完整判定表见 `motion.md#Q-002`

## S-0005 | 2026-08-14T09:30:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: case
- **basis**: E-0012
- **decision effect**: 记录候选在调查窗口内的漂移事实，固定本议案裁定对象与「当前」状态的区分
- **notice kind**: CANDIDATE_DRIFT
- **说明**: 立案时候选为 PuPu `93720ab1` + lock `d0572979`（committed，工作树干净）。调查期间 09:06:13 lock 被改为 `38547bc`（未提交）；09:16:38 `Haoxiang Xu`（CEO 本人，peer 交互会话）提交 `c0106670`「feat: Update memory documentation and add new case records for compliance review」，一次性纳入本案 `case.md`/`record.md` 早期草稿、`code-owner-unchain` 两个 investigator instance 各自写入的 agent-memory，以及三项与本案无关的既有改动（`src/SERVICEs/run_bundle_v1.js`、`src/PAGEs/chat/hooks/use_chat_stream.js` 死代码清理、lock bump 本身）。此后 sibling unchain dev 又前进到 `de94855`，PuPu lock 未跟进。**本议案裁定对象固定为立案时声明的候选**；当前实际候选（`c0106670`+`38547bc`）的重新验证状态见 `motion.md`「候选漂移说明」一节，不构成本议案结论的一部分。

## S-0006 | 2026-08-14T09:44:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: RS-001
- **basis**: M-0000-0001-2026-0814#MS-001, S-0003, S-0004, S-0005
- **decision effect**: 冻结合作 owner 审查人与 electorate
- **artifact**: M-0000-0001-2026-0814#MS-001
- **supersedes**: null
- **review kind**: ORDINARY
- **boundary reviewed objects**: NOT_APPLICABLE（motion，无 BC/SEQ）
- **boundary object hash**: NOT_APPLICABLE
- **artifact content hash**: sha256:324a95f7a963f3b55117538b02c35b297102711485ea82a803d798960f7f1350
- **inherited stances**: NOT_APPLICABLE
- **re-review owners**: code-owner-unchain
- **eligible owners**: code-owner-unchain
- **N**: 1
- **review deadline**: 2026-08-14T09:50:00-07:00
- **objection intake deadline**: 2026-08-14T09:50:00-07:00
- **lead disposition deadline**: 2026-08-14T09:55:00-07:00
- **lead reminder final deadline**: 2026-08-14T10:00:00-07:00
- **content hash**: sha256:4f42fa23596cb20c956254de66a6b2cd1a1753e246fff3ba66886ff00e479bfb

## S-0007 | 2026-08-14T09:45:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: code-owner-unchain
- **type**: AGREE
- **owner**: code-owner-unchain
- **target**: M-0000-0001-2026-0814#MS-001
- **review snapshot**: RS-001
- **scope**: 全案（Q-001、Q-002）
- **basis**: S-0003, S-0004

## S-0008 | 2026-08-14T09:46:00-07:00
- **case**: M-0000-0001-2026-0814
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: SUMMARY
- **target**: case
- **basis**: M-0000-0001-2026-0814#MS-001, RS-001, S-0007
- **decision effect**: 提交当前材料并休庭等待裁定
- **discussion type / procedure mode**: motion | collaboration
- **current artifact**: M-0000-0001-2026-0814#MS-001
- **ruling-ready artifact**: M-0000-0001-2026-0814#MS-001
- **review positions**: RS-001（N=1，lead baseline AGREE，无其他合作 owner，无异议）
- **consensus**: 唯一合作 owner（主 owner 本人）对 Q-001、Q-002 均判 NO-GO，无异议、无 OBJECT
- **disagreements**: 无
- **known unknowns**: 见 `motion.md` 各 Q「owner 空白」与两份 ANSWER 附带报告的「已知未核实项」——均为可支持后续 proposal/HS 的次要事实，不影响本议案核心判断
- **risks**: 候选在裁定前后仍可能继续漂移（见 S-0005）；本议案的 NO-GO 结论固定于立案时声明的候选，供裁定时明确知悉
- **BOS status**: NOT_APPLICABLE
- **evidence flags**: 无
- **DES / CR**: NOT_APPLICABLE
- **Full vote**: NOT_APPLICABLE
- **mandatory responses**: 无
- **stop reason**: 唯一合作 owner 已给出完整、双重独立复现交叉验证（E-0011）的判断，无异议可处置，无进一步降低开放条件的增量
- **coverage gaps**: PuPu 侧发布证据、packaged 配置真值、`getTaskState` 契约现状等 owner 空白项未经串行交棒补全（详见 motion.md），Speaker 判断这些不改变 Q-001/Q-002 的 NO-GO 结论，留待裁定后续处理或另立 proposal
