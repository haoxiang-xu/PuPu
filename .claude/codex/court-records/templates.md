# 固定模板

[Quorum 索引](../README.md) · [Court Records](README.md)

普通事件与发言使用[协作与庭审发言协议](../lifecycle/speech-protocol.md)的公共信封。以下模板给出固定 payload；所有历史正文只追加，不原地改写。

## 1. Framing 与主 owner

```markdown
## S-0001 | 2026-08-10T18:00:00-07:00
- **case**: M-0000-0001-2026-0810
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: FRAMING
- **target**: case
- **basis**: intake-sha256:...
- **decision effect**: 固定讨论对象并选择唯一主 owner
- **核心问题/目标**: 这段新代码是否符合安全标准？
- **non_goals**: 不讨论具体修复实现
- **主 owner**: knowledge-owner-security
- **选择依据**: 对安全标准拥有权威解释责任
- **选择不确定性**: 可能需要 code owner 提供实现事实
- **初始已知范围**: `src/auth/**`
```

Speaker 在 framing 时只能选择一个主 owner，不列候选 roster。若主 owner 必须转移，追加 `NOTICE: LEAD_TRANSFER`，记录旧/新 owner、理由、未完成 HS、既有异议和不重置状态的声明。RS 后转移还必须关闭旧 review，记录 successor artifact/RS、继承异议与立场 lineage，以及旧 lead 是否以普通合作 owner 条件留在新 electorate。Full opening 后另须记录冻结 electorate hash、新 lead 原 slot、旧 lead 的 `FROZEN_FULL_ELECTORATE` slot 与 successor RS/FS；成员和 N 必须逐项相同。新 lead 不在冻结 electorate 内时该 NOTICE 无效，只能送 Chief 终止或重框。

## 2. owner handoff

```markdown
## S-0004 | 2026-08-10T18:20:00-07:00
- **case**: P-0000-0001-2026-0810
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-example
- **type**: HANDOFF_REQUEST
- **target**: P-0000-0001-2026-0810#SLOT-002
- **basis**: P-0000-0001-2026-0810#PS-001
- **decision effect**: 补全发布说明并确认 consumer boundary 后方案才可送裁
- **目标 ownership boundary**: knowledge-owner-docs
- **期待交付**: SLOT-002 的说明步骤、BC-001 consumer 义务与 AC-002 检查方法
- **缺席影响**: BC-001 与 AC-002 无法形成
- **最小访问范围**: PS-001, SLOT-002, BC-001, AC-002
- **完成后返回**: code-owner-example

## S-0005 | 2026-08-10T18:21:00-07:00
- **case**: P-0000-0001-2026-0810
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-001
- **basis**: S-0004
- **decision effect**: 授予一次有限 owner 交付
- **from**: code-owner-example
- **to**: knowledge-owner-docs
- **scope**: PS-001, SLOT-002, BC-001, AC-002
- **delivery**: 补全 SLOT-002，确认 BC-001 consumer 义务并说明 AC-002 检查方法
- **return_to**: code-owner-example
- **expires at**: 2026-08-10T18:45:00-07:00
- **expiry effect**: 记录 EXPIRED 后重新路由、转移 lead 或送 Chief；不把空白视为完成
- **status**: OPEN

## S-0007 | 2026-08-10T18:40:00-07:00
- **case**: P-0000-0001-2026-0810
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: knowledge-owner-docs
- **type**: HANDOFF_RETURN
- **target**: HS-001
- **basis**: S-0005, E-0002
- **decision effect**: 完成 SLOT-002 与 BC-001 consumer 确认并返回主 owner
- **contribution**: P-0000-0001-2026-0810#SLOT-002, P-0000-0001-2026-0810#BC-001
- **remaining unknowns**: 无
- **recommended next handoff**: 无
- **status**: RETURNED
```

同一 case 同时只允许一个 `OPEN` HS。每个 HS 必须写 `expires at`；到期仍无合格 return 时由 Speaker 追加 `NOTICE: HANDOFF_EXPIRED`。HS 状态只允许 `OPEN / RETURNED / DECLINED / EXPIRED / CANCELLED`，后四项为终态；未返回的必要交付必须重新路由、转移 lead 或终止，不能留作已完成。普通 owner handoff 不使用 RP 或 PARTICIPATION_RULING。

## 3. 议案正文与回答快照

`motion.md`：

```markdown
---
case_id: M-0000-0001-2026-0810
updated_at: 2026-08-10T18:50:00-07:00
---

# 议案

## Q-001
- **问题**: 这段新代码是否符合安全标准？
- **判断边界**: revision `abc123` 的 `src/auth/**`
- **non_goals**: 不决定如何修复

## 主回答
- **回答 owner**: knowledge-owner-security
- **回答**: 不符合
- **依据**: E-0001, E-0002
- **适用边界**: 仅认证令牌日志行为
- **已知未知**: 未检查部署环境日志过滤
- **owner 空白**:
  - Q-002 | code-owner-auth | 当前 logger 是否在 production 路径被调用 | HS-001 | FILLED S-0007

### MS-001 | 2026-08-10T18:50:00-07:00
- **supersedes**: null
- **included contributions**: S-0007
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **content hash**: sha256:ms1...
- **formed_by**: knowledge-owner-security

### Review ledger | RS-001 | MS-001
- knowledge-owner-security | S-0010 | AGREE | 全案
- code-owner-auth | S-0011 | OBJECT | Q-001 依据边界
```

议案裁定必须保存实际回答，不能只写 `APPROVED / REJECTED`。successor 回答使用新 `MS-###`，只使受影响 review scope 的旧立场失效。

## 4. 方案正文、slots 与快照

`proposal.md`：

```markdown
---
case_id: P-0000-0001-2026-0810
boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222
updated_at: 2026-08-10T19:05:00-07:00
---

# 方案

## P-0000-0001-2026-0810
- **主 owner**: code-owner-example
- **目标结果**: ...
- **non_goals**: ...
- **实施范围**: ...
- **owner slots**:
  - SLOT-001 | code-owner-example | 核心实现 | FILLED | S-0002
  - SLOT-002 | knowledge-owner-docs | 发布说明 | FILLED | HS-001, S-0007
- **关键步骤与依赖**: ...
- **风险**: ...
- **可逆性**: ...
- **回滚/补救方式**: ...
- **验收标准**:
  - AC-001 | ...
  - AC-002 | ...
- **boundary obligations**: BC-001
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | 生成结果到发布说明
- **producer**: code-owner-example 生成的版本化结果
- **producer owner**: code-owner-example
- **consumer**: knowledge-owner-docs 的发布说明流程
- **consumer owner**: knowledge-owner-docs
- **canonical representation**: 固定 revision 下的规范化结果对象
- **consumer projection**: 发布说明只读取明确列出的稳定字段
- **admission policy**: CLOSED
- **admission details**: 精确字段集合与允许值；未知字段拒绝
- **unknown input behavior**: fail closed，并产生稳定错误
- **failure semantics**: 不生成部分发布说明，不推进发布状态
- **identity/version binding**: producer sha256:1111111111111111111111111111111111111111111111111111111111111111 + consumer sha256:2222222222222222222222222222222222222222222222222222222222222222
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: HS-001
- **positive acceptance**: AC-001
- **negative acceptance**: AC-002

### SEQ-001 | 同一发布对象的重试与恢复
- **owner**: code-owner-example
- **owner confirmation**: LEAD
- **identity key**: release-id + attempt-id
- **initial state**: 尚未生成发布说明
- **ordered events**: 首次生成 → 可恢复失败 → 同 identity 重试
- **expected observations**: 首次只生成一次；恢复保留 release identity；重试不重复提交
- **persistence boundary**: 发布任务的 durable state
- **boundary contracts**: BC-001
- **positive acceptance**: AC-001
- **negative acceptance**: AC-002
- **first use**: REQUIRED | AC-001
- **repeat**: REQUIRED | AC-001
- **retry**: REQUIRED | AC-002
- **resume**: REQUIRED | AC-002
- **restart**: NOT_APPLICABLE | 本方案不改变或验证进程重启语义
- **reset**: NOT_APPLICABLE | 该发布任务没有 reset 操作
- **rollback**: NOT_APPLICABLE | rollback 由独立的已获准发布方案承担

### AM-001
- **提出发言**: S-0008
- **target**: SLOT-002
- **影响字段**: STEPS
- **修正内容**: ...
- **修正理由**: ...

### PS-001 | 2026-08-10T18:10:00-07:00
- **supersedes**: null
- **included amendments**: 无
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:bdf14a4aec0de0d159176bf8c225f85b440dccba75f42af0366af598e5b9331f
- **content hash**: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- **formed_by**: code-owner-example

### PS-002 | 2026-08-10T19:05:00-07:00
- **supersedes**: PS-001
- **included contributions/amendments**: S-0007, AM-001
- **changed blocks**: SLOT-002, BC-001, SEQ-001, AC-002
- **dependent review blocks**: SLOT-002, BC-001, SEQ-001, AC-002
- **boundary object hash**: sha256:bdf14a4aec0de0d159176bf8c225f85b440dccba75f42af0366af598e5b9331f
- **content hash**: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
- **formed_by**: code-owner-example

### Review ledger | RS-002 | PS-002
- code-owner-example | S-0010 | AGREE | 全案
- knowledge-owner-docs | S-0011 | OBJECT | SLOT-002, AC-002
```

必要 slot 仍为 `UNFILLED / PENDING_HANDOFF` 时不得送最终裁定。boundary protocol v1 下，适用性/N/A 声明、唯一的 BC/SEQ 编号、非主 owner 的已返回 material HS 确认、正负 AC 和每个序列矩阵单元格也是 PS 正文；缺失时同样不得送裁。HANDOFF scope 必须覆盖确认对象与全部责任 AC，RETURN contribution 必须覆盖对象。PS/AC/BC/SEQ 等标识、frontmatter key 及同一结构对象字段不得重复；不采用 first/last-wins。每个含 BC/SEQ 的 PS 以 `boundary object hash` 固定当前对象并保存 64-hex SHA-256 content hash，算法以[边界契约规范](../lifecycle/boundary-contracts.md)为准。`case.md.review_snapshot_ref` 指向 canonical RS NOTICE；该 NOTICE 须绑定当前 PS 与 content hash、predecessor RS、review kind、全部当前对象、相同 boundary object hash、eligible owners、N、四个 deadline 与可重算的 RS content hash。任一 successor PS 都适用，无论 `changed blocks` 写了什么；review marker 不回写已 hash 的 PS。只要存在 BC，proposal frontmatter 只声明 expected `boundary_revision_set`，使用两个 64-hex SHA-256 的精确 pair；proposal 不得自填 verified 值。获准 ruling 冻结 expected pair，当前最新 AT 写实际 verified pair 与外部证据。目标结果变化创建新的 proposal case；同一目标内的局部变化追加 AM 和 successor PS。

## 5. Review、异议与主 owner 处置

`RS-###` 在 `record.md` 冻结：

```markdown
## S-0009 | ...
- **type**: NOTICE
- **target**: RS-002
- **basis**: P-0000-0001-2026-0810#PS-002, HS-001
- **decision effect**: 冻结合作 owner 审查人与 electorate
- **artifact**: P-0000-0001-2026-0810#PS-002
- **supersedes**: RS-001
- **review kind**: ORDINARY
- **boundary reviewed objects**: BC-001, SEQ-001
- **boundary object hash**: sha256:bdf14a4aec0de0d159176bf8c225f85b440dccba75f42af0366af598e5b9331f
- **artifact content hash**: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
- **inherited stances**: NOT_APPLICABLE
- **re-review owners**: code-owner-example, knowledge-owner-docs
- **invalidated scopes**: changed SLOT-002/BC-001/SEQ-001 and lead baseline
- **eligible owners**: code-owner-example, knowledge-owner-docs
- **N**: 2
- **review deadline**: 2026-08-10T20:00:00-07:00
- **objection intake deadline**: 2026-08-10T20:00:00-07:00
- **lead disposition deadline**: 2026-08-10T20:30:00-07:00
- **lead reminder final deadline**: 2026-08-10T20:45:00-07:00
- **content hash**: sha256:3333333333333333333333333333333333333333333333333333333333333333

## S-0010 | ...
- **type**: AGREE
- **owner**: code-owner-example
- **target**: P-0000-0001-2026-0810#PS-002
- **review snapshot**: RS-002
- **scope**: 全案

## S-0011 | ...
- **type**: OBJECTION
- **owner**: knowledge-owner-docs
- **target**: P-0000-0001-2026-0810#SLOT-002
- **review snapshot**: RS-002
- **basis**: E-0003
- **decision effect**: 当前步骤会使 AC-002 无法复现
- **requested change**: 固定生成命令和 revision
```

RS NOTICE 只冻结 electorate、N、scope/deadline、继承 lineage 与哈希，不保存最终 `owner stances`；每名 owner 的立场正文仍是独立 S 事件。初始 RS 写 `inherited stances: NOT_APPLICABLE`，所有 owner 列入 `re-review owners`。successor 可把未受影响的 AGREE/ABSTAIN 写成 `owner=S-####@RS-###`，但 source 必须真实存在且 owner/RS 一致；lead 与 re-review owners 发布当前 S，二者和 inherited owners 的并集精确等于 electorate。OBJECT 不得在此继承。lead 必须有绑定当前 RS 与 artifact 的 baseline AGREE；超时 ABSTAIN 写 `reason: TIMEOUT`。NOTICE 中的摘要不能替代这些事件。

所有 HS/RS/stance/lead disposition S heading 使用时区明确的时间并按 append 顺序严格递增。HANDOFF 必须写 `expires at`；RETURN 在 expiry 前发生且 `speaker` 精确等于目标 owner。RS deadline 晚于 opening；stance 在 opening 后、review deadline 前；OBJECTION 还必须写 scope，并在 lead disposition deadline 前取得唯一 `LEAD_DISPOSITION`。

successor RS 必须另列 predecessor、旧/新 artifact 映射、`review kind: ORDINARY / BOS_CHANGE_REVIEW`、逐项 carried AGREE/ABSTAIN、失效 scope、需重审 scope 与新截止点；不能只声称“未受影响立场继续有效”。每项旧 OBJECT 必须另列原 S、此前 retarget/disposition、新 `OBJECTION_RETARGET`、旧/新 target+dependency hash，以及 `CARRIED_UNCHANGED / REQUIRES_NEW_DISPOSITION`。只有当前 CONFIRMED 且具有有效 REJECT disposition 的项能计 D；lead transfer 一律要求新 disposition。`BOS_CHANGE_REVIEW` 的每项 OBJECT 还必须引用既有 BO/RC，且明确写 `D/OG effect: NOT_APPLICABLE`。

异议与处置：

```markdown
## S-0011 | ...
- **type**: OBJECTION
- **target**: P-0000-0001-2026-0810#SLOT-002
- **basis**: E-0003
- **decision effect**: 当前步骤会使 AC-002 无法复现
- **review snapshot**: RS-002
- **requested change**: 固定生成命令和 revision
- **resolution conditions**:
  - RC-001 | 指定命令在固定 revision 可复跑

## S-0013 | ...
- **type**: LEAD_DISPOSITION
- **target**: S-0011
- **basis**: P-0000-0001-2026-0810#PS-002
- **decision effect**: 拒绝异议并开启辩论庭
- **disposition**: REJECT
- **accepted portion**: NOT_APPLICABLE
- **rejected portion**: 全部
- **reason**: ...
```

`PARTIAL_ACCEPT` 必须分别列出接受与拒绝部分；只有拒绝部分能成为庭审争点。

RS 前提出的异议仍使用 `type: OBJECTION`，但原事件必须写 `review snapshot: PENDING_RS`、`status: PENDING_REVIEW_TARGET` 并指向当时 draft。集成快照冻结后，Speaker 另追加：

```markdown
## S-0012 | ...
- **type**: NOTICE
- **target**: S-0006
- **basis**: RS-002, P-0000-0001-2026-0810#PS-002
- **decision effect**: 把交棒期异议确认到最终 review 快照
- **notice kind**: OBJECTION_RETARGET
- **old target / status**: P-...#SLOT-002 | PENDING_REVIEW_TARGET
- **new target / review snapshot**: P-...#SLOT-002 | RS-002
- **result**: CONFIRMED / WITHDRAWN / RETURN_NO_LINK
```

只有 `CONFIRMED` 的 retarget 才形成当前 RS 的 `OBJECT`、允许 `LEAD_DISPOSITION` 并可能计入 D；原 S 事件永不改写。

## 6. 异议组与 Full（众议庭）投票

下面两段是两个独立 case 的字段示例：第一段只展示可合并的 Debate OG；第二段从另一个 case 的既有 RS/OG 开始展示 Full 投票。两段的异议与分组不得交叉引用。

```markdown
## S-0100 | ...
- **type**: OBJECTION_GROUP
- **target**: OG-001
- **basis**: S-0091, S-0094
- **decision effect**: 合并为一次聚焦辩论
- **member objections**: S-0091, S-0094
- **shared target/facts/remedy**: SLOT-002 | 固定 revision | 同一修正可处理
- **mergeability**: MERGEABLE
- **procedural reason**: 一组有限解决条件即可共同裁定
```

达到门槛且不能合并时，必须在首个实体 hearing `NOTICE: OPEN` 与 hearing SI 创建前完成开票和计票：

```markdown
## S-0200 | ...
- **type**: NOTICE
- **target**: RS-004
- **basis**: OG-002, OG-003, OG-004
- **decision effect**: 记录 Speaker 是否发起 Full 程序票
- **notice kind**: FULL_VOTE_DECISION
- **eligibility**: D >= 3 and D > N/2 and inter-group unmergeable = true
- **result**: ELIGIBLE_OPENED
- **intended vote**: FV-001
- **reason**: 三组异议需要彼此不同且不能共同冻结的解决条件

## S-0201 | ...
- **type**: NOTICE
- **target**: FV-001
- **basis**: RS-004, OG-002, OG-003, OG-004
- **decision effect**: 发起是否升级众议庭的程序投票
- **electorate snapshot**: RS-004
- **electorate hash**: sha256:...
- **N / D**: 5 / 3
- **threshold check**: D >= 3 and D > N/2 = true
- **D audit map**:
  - knowledge-owner-docs | S-0181 | OG-002
  - code-owner-b | S-0184 | OG-003
  - code-owner-c | S-0188 | OG-004
- **D validity check**: 全部异议仍有效、未撤回、未满足且未被 successor artifact 取代
- **inter-group unmergeable reason**: 三组异议分别挑战目标假设、集成依赖与回滚可靠性，无法用一组有限解决条件共同处置
- **options**: REMAIN_IN_DEBATE / ENTER_FULL / ABSTAIN
- **deadline**: ...

## S-0202 | ...
- **type**: BALLOT
- **target**: FV-001
- **basis**: RS-004, S-0201
- **decision effect**: 选择程序模式
- **voter**: code-owner-a
- **vote**: ENTER_FULL
- **ballot ordinal**: FIRST_VALID_FINAL

## S-0207 | ...
- **type**: VOTE_TALLY
- **target**: FV-001
- **basis**: S-0202, S-0203, S-0204, S-0205, S-0206
- **decision effect**: 确定 procedure mode
- **electorate N**: 5
- **current D / threshold recheck**: 3 | D >= 3 and D > 2.5 = true
- **current objection validity**: 全部仍有效、未撤回、未满足且未被 successor artifact 取代
- **current inter-group mergeability**: UNMERGEABLE
- **ENTER_FULL / REMAIN_IN_DEBATE / ABSTAIN / NO_BALLOT**: 3 / 1 / 1 / 0
- **required**: ENTER_FULL > 2.5
- **result**: ENTER_FULL
- **successor procedure mode / hearing SI**: full | SI-004
```

`FULL_VOTE_DECISION` 的 result 只允许 `NOT_ELIGIBLE / ELIGIBLE_OPENED / ELIGIBLE_DECLINED`；后两者都必须说明 Speaker 的程序理由，`ELIGIBLE_DECLINED` 不创建 FV。Review 的 OBJECT 与 FV 的 BALLOT 是两份不同记录。投票期间 electorate 不得改变；每名 voter 第一张有效票即终局，缺票保留为 `NO_BALLOT` 且不减少 N。`VOTE_TALLY` 必须重验当前 D、每项异议有效性与组间不可合并性。material artifact/owner/lead 变化要求 successor RS 时，当前 FV 记 `CANCELLED_NO_RESULT`，旧 RS 不得开庭；先建 successor RS、重分组并重新作开票决定。同一 RS 未变化而门槛或票数失败时不建 successor RS，仍有异议直接进 Debate、全部消失则不开庭。相同 RS/OG 的 FV 关闭后不得重开。

若结果为 ENTER_FULL，随后的 `NOTICE: OPEN` 同时创建 `FS-###` overlay，至少记录原 RS、冻结 artifact、逐名 `owner / added read scope / direct dependencies / denied sensitive refs`、stance deadline 与 content hash。新增 scope stance 同时引用 RS+FS；FS 不改变 N，不使用 RP，也不授予写入或相邻调查：

```markdown
## S-0208 | ...
- **type**: NOTICE
- **notice kind**: OPEN
- **target**: FS-001
- **basis**: FV-001, RS-004, P-0000-0002-2026-0810#PS-004
- **decision effect**: 开启 Full hearing 并冻结全面 review scope overlay
- **procedure mode / hearing SI**: full | SI-004
- **electorate RS / N**: RS-004 | 5 unchanged
- **artifact**: P-0000-0002-2026-0810#PS-004
- **owner scopes**:
  - task-owner-release | added read scope: SLOT-001,SLOT-002,SLOT-003 | dependencies: AC-001,AC-002,AC-003 | denied sensitive refs: none
  - code-owner-a | added read scope: SLOT-002 | dependencies: AC-002 | denied sensitive refs: none
  - knowledge-owner-docs | added read scope: SLOT-001 | dependencies: AC-001 | denied sensitive refs: SECRET-001
  - code-owner-b | added read scope: SLOT-001,SLOT-003 | dependencies: AC-001,AC-003 | denied sensitive refs: none
  - code-owner-c | added read scope: SLOT-002,SLOT-003 | dependencies: AC-002,AC-003 | denied sensitive refs: SECRET-002
- **stance deadline**: ...
- **content hash**: sha256:fs1...

## S-0209 | ...
- **type**: AGREE
- **speaker**: code-owner-a
- **target**: P-0000-0002-2026-0810#PS-004 | SLOT-002 / AC-002
- **basis**: RS-004, FS-001
- **decision effect**: 对 Full 新增只读范围及直接依赖登记补充立场
- **stance**: AGREE

## S-0210 | ...
- **type**: AGREE
- **speaker**: knowledge-owner-docs
- **target**: P-0000-0002-2026-0810#PS-004 | SLOT-001 / AC-001
- **basis**: RS-004, FS-001, S-0181
- **decision effect**: 对新增依赖登记补充立场；既有 S-0181/OG-002 异议继续有效
- **stance**: AGREE

## S-0211 | ...
- **type**: AGREE
- **speaker**: code-owner-b
- **target**: P-0000-0002-2026-0810#PS-004 | SLOT-001,SLOT-003 / AC-001,AC-003
- **basis**: RS-004, FS-001, S-0184
- **decision effect**: 对新增依赖登记补充立场；既有 S-0184/OG-003 异议继续有效
- **stance**: AGREE

## S-0212 | ...
- **type**: ABSTAIN
- **speaker**: code-owner-c
- **target**: P-0000-0002-2026-0810#PS-004 | SLOT-002,SLOT-003 / AC-002,AC-003
- **basis**: RS-004, FS-001, S-0188
- **decision effect**: 对无法读取的敏感依赖保留补充立场；既有 S-0188/OG-004 异议继续有效
- **stance / reason**: ABSTAIN | SECRET-002 未获准，不能对该新增依赖作实体判断
```

## 7. BOS 与线程状态

BOS 只在辩论庭、众议庭或验收庭审首次陈述窗口后创建：

```markdown
## S-0213 | ...
- **type**: OBLIGATION_SET
- **target**: case
- **basis**: OG-002, OG-003, OG-004, S-0208, S-0209, S-0210, S-0211, S-0212
- **decision effect**: 冻结本 hearing 的有限阻塞清单
- **BOS**: BOS-001
- **procedure mode / SI**: full | SI-004
- **baseline**: P-0000-0002-2026-0810#PS-004
- **first-review cutoff**: ...
- **items**:
  - BO-001 | S-0181 / OG-002 | SLOT-001 | 文档中的固定 revision 命令可复现 | OPEN
  - BO-002 | S-0184 / OG-003 | SLOT-002 | 集成依赖在目标边界内可隔离 | OPEN
  - BO-003 | S-0188 / OG-004 | SLOT-003 | 回滚路径在失败状态下可恢复 | OPEN
- **summary hash**: sha256:bos1...
```

冻结后不得增加 BO 或 RC。状态变化只追加 `THREAD_STATUS`，字段至少为 target BO、旧/新状态、依据、关闭条件、剩余条件和 rank 变化。

## 8. 证据、DES 与 CR

`evidence.md` 的 E 条目：

```markdown
### E-0001 | repository
- **source type**: 自证类
- **locator**: `src/example.ts:10-24`
- **acquisition**: revision `abc123` 的只读检查
- **submission source**: S-0011
- **supports/refutes**: S-0011
- **decision link**: P-0000-0001-2026-0810#SLOT-002
- **limitations**: 未检查部署环境
- **stable slices**: ES-001 | locator | revision | observed_at | sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | boundary
- **challenge history**: 无
- **verification history**: 无
```

`DES-###` 必须包含 SI、sampling scope、supersedes、候选 DU 完整分区、N、k、每个 DU 的 `verification_key`、随机资格、manifest hash、初始处置、seed，以及冻结的 `evidence continuation`（pre-evidence stage、当前对象、effective AT/response、resume state）。successor DES 必须按当前对象重算 continuation；不得把所有 `EMPTY / INHERITED_ONLY` 硬编码成 `awaiting-ruling`。固定 canonical JSON、16% 算法、successor lineage 与 replacement 限制以[证据规则](../lifecycle/evidence-rules.md)为准，不在模板复制。

`CR-###` 至少包含 DES/hash、SI/scope、批次与授权、N/本批/累计、seed、抽中 DU、逐项结论、覆盖/未覆盖决定、单一来源关键主张、置信等级和限制。`EMPTY / INHERITED_ONLY` 写 `CR = NOT_APPLICABLE`，不得制造空报告。

默认 collaboration 不创建空 `evidence.md`，但首个稳定 E/ES 可按需创建只含证据条目的文件。DU、DES、seed、抽样和 CR 只有正式证据控制已经启动后才使用。

## 9. SUMMARY

下例是一个独立的 Debate case，不承接上面的 Full 示例：

```markdown
## S-0300 | ...
- **type**: SUMMARY
- **target**: case
- **basis**: P-0000-0003-2026-0810#PS-003, RS-003, OG-001, BOS-001, DES-001, CR-001
- **decision effect**: 提交当前材料并休庭等待裁定
- **discussion type / procedure mode**: proposal | debate
- **current artifact**: P-0000-0003-2026-0810#PS-003
- **ruling-ready artifact**: P-0000-0003-2026-0810#PS-003
- **boundary protocol**: v1
- **boundary contracts / state sequences**: BC-001 / SEQ-001
- **boundary ruling-ready check**: PASS | applicability, HS confirmations, AC mappings, matrix and revision binding complete
- **unintegrated amendments**: S-0038 | REQUEST_ONLY | 不得由裁定直接拼接采纳
- **review positions**: RS-003
- **consensus**: ...
- **disagreements**: OG-001
- **known unknowns**: ...
- **risks**: ...
- **BOS status**: ...
- **evidence flags**: ...
- **DES / CR**: DES-001 / CR-001
- **Full vote**: NOT_APPLICABLE / FV-001
- **mandatory responses**: ...
- **stop reason**: 没有可降低 rank 的下一增量
- **coverage gaps**: 无
```

默认无争议协作的 SUMMARY 可写 `BOS/DES/CR = NOT_APPLICABLE`。每份 SUMMARY 只能点名一个 ruling-ready MS/PS；所有可能获准的内容必须已经由主 owner 集成，并完成适用的 successor RS。未集成 AM 只能作为未决请求列示，Chief 不得直接批准“快照 + AM”；若倾向采纳，须先返回集成或转移 lead，再以 successor artifact/RS 送裁定。

## 10. 裁定记录

每条 `R-####` 先写：裁定身份、记录类型、discussion type、procedure mode、依据、证据质疑处置，再写类型 payload。任何关闭 hearing/case 或授权实体 action 的最终实体裁定还必须写 `effect status at append: PENDING_CLOSURE`、`closure bundle manifest`、`closure bundle hash`、`expected commit payload hash`、`closure deadline` 与 `effective when: record.md#S-#### NOTICE:CLOSURE_COMMIT`。manifest 必须逐事件冻结并原子保留 S ID、type、target、old/new 状态、basis、关闭与剩余 conditions、rank，以及旧/新 logical case state；无 BOS 时 THREAD_STATUS 列表写 `NOT_APPLICABLE`。R 归档后这些 S ID 不得被其他事件占用。

Closure 哈希使用封闭的两层结构，不能自引用：

1. 每个预提交 `THREAD_STATUS` 的完整 payload（含其保留 S ID）按 UTF-8、Unicode NFC、LF、无 BOM/尾随换行/键间空白、对象键按 UTF-8 字节序、数组保留 manifest 顺序的 canonical JSON 编码；`event payload hash = SHA-256("quorum.closure.event.v1\0" || bytes)`，其中 `\0` 表示一个 NUL byte。payload 不包含自身 hash 或 Markdown 标题。
2. `bundle body` 只含 `case_id`、`ruling_id`、旧/新 logical state、按顺序排列的 `{event_id,event_payload_hash}`、保留的 commit S ID 与 deadline；`closure bundle hash = SHA-256("quorum.closure.bundle.v1\0" || canonical_json(bundle body))`，其中 `\0` 表示一个 NUL byte。bundle body 明确不含 commit payload/hash。
3. commit payload 固定为 `event_id`、`type: NOTICE`、`notice_kind: CLOSURE_COMMIT`、`case_id`、`ruling_id`、`closure_bundle_hash`、按 manifest 顺序排列的全部**预提交**实际 event hash、旧/新 logical state。其 expected hash 使用第一步的 event 域算法；payload 不含自身 hash，故没有直接或间接自引用。无 THREAD_STATUS 时 event hash 数组为空。

机器可校验记录中的 `closure bundle manifest` 值使用单行 canonical JSON object，且顶层键精确为 `bundle_body / precommit_event_payloads / commit_payload`。`bundle_body` 精确包含 `case_id / ruling_id / old_logical_state / new_logical_state / precommit_events / commit_event_id / deadline`；每个 `precommit_event_payloads` 项冻结完整 event payload，`precommit_events` 只保存按序 `{event_id,event_payload_hash}`；`commit_payload` 使用上项固定键。JSON 不接受额外键、重复键、占位值或非 canonical 编码。下列缩进式 manifest 只是这些对象的可读展开；实际记录必须物化成上述单一 canonical JSON 值并写入真实 64-hex SHA-256。

所需 `THREAD_STATUS` 按 manifest 先追加；最后一条保留 S ID 的 `NOTICE:CLOSURE_COMMIT` 只能引用预提交 event hash，不能引用自身 hash。该 marker 是唯一 canonical commit point：写入前裁定未生效且 logical state 保持旧值；首条 event ID、bundle hash、ordered event hashes 与 expected commit payload hash 全部匹配的 marker 写入时，裁定与新 logical state 同时生效。重复、部分、顺序不同或 hash 不符的 marker 无效。`case.md` 只是随后同步的当前索引，短暂滞后时以 marker 为准并立即修复。

Speaker 对该 bundle 只有 ministerial 追加义务，没有拒绝、改写或延迟裁定的权限。到 `closure deadline` 未完成时，runtime 必须自动按 R 中冻结的 payload 追加；runtime 不可用时，Chief 可指定一个与本 case 无身份冲突的临时 recorder 完成同一 bundle。该兜底不产生新的实体或程序判断。

允许的记录类型：

- `MOTION_RULING`
- `PLAN_RULING`
- `ACCEPTANCE_RULING`
- `RECONSIDERATION_RULING`
- `PROCEDURAL_RULING`
- `PROCEDURAL_AUTHORITY_RULING`
- `PARTICIPATION_RULING`
- `EVIDENCE_DIRECTION`
- `SCOPE_RULING`
- `REFRAME_RULING`
- `SIDE_CASE_RULING`
- `TERMINATION_RULING`

辩论庭与众议庭只是 procedure mode，不产生独立的实体裁定类型；实体裁定始终由 discussion type 决定。

### MOTION_RULING

```markdown
## R-0001 | 议案裁定 | ...
- **ruling identity**: Chief Judge
- **record type**: MOTION_RULING
- **discussion type / procedure mode**: motion | collaboration / debate / full
- **basis**: M-...#MS-002, RS-001, S-0040
- **evidence flag disposition**: NOT_APPLICABLE
- **mandatory responses**: S-0011 | ...
- **adopted answer**: ...
- **answer snapshot**: M-...#MS-002
- **judgment boundary**: ...
- **evidence disposition**: NOT_APPLICABLE / RULE_NOW
- **accepted uncovered risks**: ... / 无
- **BOS disposition**: NOT_APPLICABLE / BOS-001 ...
- **effect status at append**: PENDING_CLOSURE
- **closure bundle manifest**:
  - thread dispositions: NOT_APPLICABLE
  - bundle body: case M-... | ruling R-0001 | logical state awaiting-ruling → closed | ordered precommit events [] | commit event S-0041 | deadline 2026-08-10T21:00:00-07:00
  - commit payload: S-0041 | NOTICE:CLOSURE_COMMIT | case M-... | ruling R-0001 | bundle sha256:bundle1... | precommit event hashes [] | logical state awaiting-ruling → closed
- **closure bundle hash**: sha256:bundle1...
- **expected commit payload hash**: sha256:commit1...
- **closure deadline**: 2026-08-10T21:00:00-07:00
- **effective when**: record.md#S-0041 NOTICE:CLOSURE_COMMIT
- **next state**: closed
- **stop condition**: 归档实际判断及全部 material 异议处置
```

MOTION_RULING 不包含“是否需要实施”字段，也不能跳转 proposal。后续 action 使用新的 proposal case 和 `derived_from`。

### PLAN_RULING

```markdown
## R-0001 | 方案裁定 | ...
- **ruling identity**: Chief Judge
- **record type**: PLAN_RULING
- **discussion type / procedure mode**: proposal | collaboration / debate / full
- **basis**: P-...#PS-003, RS-002, S-0040
- **evidence flag disposition**: NOT_APPLICABLE
- **mandatory responses**: ...
- **ruling scope**: ACTION / COMPONENT
- **proposal result**: APPROVED / REJECTED
- **approved proposal/snapshot**: P-...#PS-003
- **authorized action**: ...
- **acceptance criteria**: AC-001, AC-002
- **boundary revision set**: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222 / NOT_APPLICABLE
- **boundary protocol**: v1 / legacy
- **boundary contracts / state sequences**: BC-001 / SEQ-001 / NOT_APPLICABLE
- **evidence disposition**: NOT_APPLICABLE / RULE_NOW
- **accepted uncovered risks**: ... / 无
- **BOS disposition**: NOT_APPLICABLE / BOS-001 ...
- **acceptance series**: AS-001 / NOT_APPLICABLE
- **effect status at append**: PENDING_CLOSURE
- **closure bundle manifest**:
  - S-0041 | THREAD_STATUS | target BO-001 | OPEN → WAIVED_BY_RULING | basis R-0001 | closed conditions: BO-001/C-001 | remaining conditions: [] | rank 1 → 0 | payload sha256:event1...
  - bundle body: case P-... | ruling R-0001 | logical state awaiting-ruling → implementing | ordered precommit events [S-0041/sha256:event1...] | commit event S-0042 | deadline 2026-08-10T21:00:00-07:00
  - commit payload: S-0042 | NOTICE:CLOSURE_COMMIT | case P-... | ruling R-0001 | bundle sha256:bundle2... | precommit event hashes [sha256:event1...] | logical state awaiting-ruling → implementing
- **closure bundle hash**: sha256:bundle2...
- **expected commit payload hash**: sha256:commit2...
- **closure deadline**: 2026-08-10T21:00:00-07:00
- **effective when**: record.md#S-0042 NOTICE:CLOSURE_COMMIT
- **next state / SI**: implementing | SI-002  # 本示例为 ACTION
- **parent release**: NOT_APPLICABLE          # COMPONENT 写 PENDING_SIDE_CASE_RULING 或已存在的 RELEASE R
- **stop condition**: ...
```

`ACTION + APPROVED` 创建唯一 AS并使用 `implementing / SI-###`；`COMPONENT + APPROVED` 只适用于 `relation: extension`，child 写 `closed / SI: null`，`authorized action / acceptance criteria / acceptance series` 全部写 `NOT_APPLICABLE`。blocking COMPONENT 的 `parent release` 必须写 `PENDING_SIDE_CASE_RULING`，不能靠本 R 自动恢复 parent。`REJECTED` 分支的 `approved proposal/snapshot / authorized action / acceptance criteria / acceptance series` 全部写 `NOT_APPLICABLE`；默认 `next state / SI: closed | null`，只有本 R 同时冻结有限 revision target/RC 时才写 `drafting | <current SI>`。action 获准前的方案驳回可由此受限返修；验收后的实施返修只由 `RECONSIDERATION_RULING: REAUTHORIZE_REVISION` 授权并继承原 AS、可选 BOS、DES 与 cycle，不再创建第二个 PLAN_RULING 或 AS。

### EVIDENCE_DIRECTION

固定字段为 `direction`、`effective DES`、`predecessor CR`、`active revision cycle`、`evidence continuation`、`decision effect`、`next state` 与 `stop condition`。`direction` 只允许 `RULE_NOW / NEXT_RANDOM_16 / TARGETED_CHECK / RETURN_FOR_REVISION`，类型 payload 为：

- RULE_NOW：接受的未覆盖风险
- NEXT_RANDOM_16：合格未查总体、本批上限
- TARGETED_CHECK：目标 DU、理由、决策影响
- RETURN_FOR_REVISION：回答/方案块/AT/证据/主张 target；存在 BOS 时引用开放 BO/RC，任何合法无 BOS evidence visit 在本 R 内建立有限 `RC-###`；另列本次必须关闭的 atom、允许材料范围和 successor DES 要求。验收/复议证据方向不得授权实现变化

证据方向不得改变 discussion type 或 procedure mode。所有 RETURN 分支在返修后都先冻结带最新 continuation 的 successor DES，再依 `EMPTY / INHERITED_ONLY` 恢复 continuation，或依 `AWAITING_CHIEF_DIRECTION` 暂存为 `awaiting-evidence-direction`：pre-action target 含 MS/PS 时回 drafting/integration 并建立相应 kind 的 successor RS；pre-action target 只有证据/主张时留在当前 evidence SI且不创建 MS/PS/RS；acceptance/reconsideration target 为 AT、证据或主张时同样留在当前 SI且不创建 PS/RS。后两类都不能授权实现变化；acceptance continuation 必须按当前 effective AT 与当前有效 response 重算，不能绕过 `awaiting-acceptance-response`。

### PARTICIPATION_RULING

只用于超出 owner handoff/原告有限范围的权限。固定字段为 `request: RP-###`、`action: ADD / EXPAND / RENEW / REVOKE`、`agent / role`、`delivery`、`access scope`、`expires at`、`blocking: true / false`、`result: APPROVED / REJECTED`、`rejection predicate`、`next state` 与 `stop condition`。普通 HS 不得伪装成 RP。

### PROCEDURAL_RULING

只允许 standing authority catalog 中的证据记录有效性、验收记录有效性、RS/OG/FV 有效性，以及 Witness 传唤 blocking 问题。固定字段为 `authority basis: standing-authority-sha256:<hash> / R-####`、`catalog item`、`procedural question`、`challenged record`、`result: VALID / INVALID / REMEDY_REQUIRED`、`remedy`、`affected state`、`appeal to Chief` 与 `stop condition`。side-case blocking 只能由 Procedural Judge 以普通 S 事件向 Chief 提交非绑定建议，不能伪装成 `PROCEDURAL_RULING`。本裁定不得判断证据或验收实体事实、批准 action、选择 Full、改变实体结论、创建 AS 或处置最终 BOS。

### PROCEDURAL_AUTHORITY_RULING

固定字段为 `delegate: procedural-judge`、`catalog items`、`action: ENABLE / NARROW / SUSPEND / REVOKE`、`case scope`、`effective at`、`expires at`、`Chief review reserved: true` 与 `stop condition`。它不能委托实体裁决权或未在规范中定义的程序问题。

### SCOPE / REFRAME / SIDE_CASE / TERMINATION

- `SCOPE_RULING` 固定字段：`request: SR-###`、`changed frozen field`、`old value`、`requested value`、`result: NEW_CASE / SPLIT / REFRAME / REJECTED`、`successor/child refs`、`affected state` 与 `stop condition`。普通 owner slot 发现使用 HS
- `REFRAME_RULING` 固定字段：`predecessor/successor BOS`、`BO and condition lineage`、`old/new rank`、`inherited SI/DES/sampling scope/first batch/cycle`、`affected state` 与 `stop condition`；不得增加开放 atom
- `SIDE_CASE_RULING` 固定字段：`parent`、`child`、`relation: extension / derived / side-case`、`blocking action: BLOCK / NON_BLOCK / RELEASE`、`parent state`、`child state` 与 `stop condition`
- `TERMINATION_RULING` 固定字段：`terminated object`、`reason`、`unfinished action`、`rollback/external disposition`、`parent/child disposition`、`terminal state: terminated` 与 `stop condition`

## 11. 验收与复议

`acceptance.md`：

```markdown
## AT-002 | ...
- **stage instance**: SI-004
- **acceptance series**: AS-001
- **supersedes AT**: AT-001
- **implementation PLAN_RULING**: R-0001
- **effective proposal/snapshot**: P-...#PS-003
- **revision authorization**: NOT_APPLICABLE / R-0004
- **predecessor effective DES**: NOT_APPLICABLE / DES-001
- **sampling scope**: AS-001
- **inherited BOS**: NOT_APPLICABLE / BOS-001
- **artifact / revision / hash**: ...
- **inspector**: acceptance-inspector
- **criteria**: AC-001, AC-002
- **verified boundary revision set**: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222 / NOT_APPLICABLE
- **verified boundary revision evidence**: E-0012 / NOT_APPLICABLE
- **response window duration**: NOT_APPLICABLE / PT4H  # 仅 initial result: FAILED
- **response reminder grace duration**: NOT_APPLICABLE / PT15M
- **response window notice**: NOT_APPLICABLE / record.md#S-0050
- **response deadline / final deadline**: NOT_APPLICABLE / 2026-08-11T12:00:00-07:00 / 2026-08-11T12:15:00-07:00  # 由 window notice 生成

### Initial observation
- **methods**: ...
- **results**: ...
- **evidence**: E-0010, E-0011
- **initial result**: PASSED / FAILED

### Criteria results
- AC-001 | PASS | method: 真实 producer 到最终 consumer | evidence: E-0010
- AC-002 | PASS | method: 未知输入负向检查及状态恢复序列 | evidence: E-0011

### Evidence and obligation history
- ...

### Response and ruling index
- **acceptance response**: NOT_APPLICABLE / record.md#S-0050
- **final ruling**: NOT_APPLICABLE / ruling.md#R-0005
```

初始快照必须使用 `AT-001` 且 `supersedes AT: null`；successor 从 `AT-002` 起逐项引用直接 predecessor，不能自引用。AT 只能绑定已经完成精确 `NOTICE:CLOSURE_COMMIT` 的 effective PLAN_RULING，其时间晚于 commit，并绑定同一 AS/PS。当前最新 AT 的 `Criteria results` 必须在该 AT 自己的正文中逐项覆盖获准方案的全部 AC，状态只允许 `PASS / FAIL / NOT_RUN / PENDING`；method 必须具体，evidence 必须为同案裸 `E-####` 精确列表，每个 E 的 supports/refutes 与 decision link 分别绑定该 AC。`NOT_APPLICABLE`、自由文字、跨案 qualifier、未知或重复 ref 均无效。predecessor AT 的旧 PASS 不得填补当前缺项，当前缺项或任一非 PASS 都禁止 `initial result: PASSED`。存在 BC 时，当前 AT 的 verified revision pair 必须与 ruling 冻结的 expected pair 逐字一致并引用稳定外部证据；proposal 作者的自填值无效。`FIRST_RANDOM_16` 只能抽查这些证据的真实性，不能把未执行 AC 或 BC/SEQ 矩阵单元格变为 PASS。PASSED 的 AT 之 response window 字段全部写 `NOT_APPLICABLE`；FAILED 在 AT 冻结 window/grace duration，但绝对 deadline 在 evidence gate 恢复 `awaiting-acceptance-response` 时才由 `NOTICE: ACCEPTANCE_RESPONSE_WINDOW_OPEN` 机械生成。该 NOTICE 固定记录 effective AT、effective DES/continuation、opened_at、window/grace durations、deadline 与 final deadline。window 开启前不能提交 response/timeout；已开启且尚无 response/timeout 时不能插入新的 evidence direction。

失败 AT 在 response window 开启后才能记录 `ACCEPTANCE_RESPONSE`，固定字段为：当前 effective `AT`、`ACCEPTANCE_RESPONSE_WINDOW_OPEN` notice、方案主 owner、`ACCEPT_FAILURE / DISPUTE_FAILURE`、依据、是否请求返修及其范围。最终截止仍沉默时 Speaker 追加 `NOTICE: ACCEPTANCE_RESPONSE_TIMEOUT` 并送无庭审 reconsideration，不能伪造 response 或授权 action。window 开启前或 evidence direction 暂存期间的 response/timeout 无效；successor AT 不继承旧 window。`ACCEPT_FAILURE` 只把 case 送入无庭审 reconsideration，不授权修改；`DISPUTE_FAILURE` 才请求验收庭审。

`ACCEPTANCE_RULING` 必填 AT、结果 `PASSED / FAILED_TO_HEARING`、证据处置、`BOS disposition: NOT_APPLICABLE / <BOS ref>`、接受风险、下一状态和停止条件。无争议通过从不制造 BOS。`RECONSIDERATION_RULING` 必填 AT、客观失败/辩护状态、动作 `ACCEPT / TERMINATE / SPLIT / ROLLBACK / REAUTHORIZE_REVISION`、返修或回滚范围、继承 AS、可选 BOS、DES/首批/cycle、必须关闭的 atom 与下一状态。`ACCEPTANCE_RULING: PASSED` 及任何关闭 hearing/case 或授权实体 action 的 `RECONSIDERATION_RULING` 适用上文的 `PENDING_CLOSURE / effective when` 门禁；`FAILED_TO_HEARING` 只原子更新到 hearing，不伪装成 closure。

action 获准前对方案内容的返修仍属于原 proposal：主 owner 集成 successor PS，并以带 lineage 的 successor RS 重审受影响 owner。BOS 前使用 `ORDINARY` review；BOS 后只能使用 `BOS_CHANGE_REVIEW` 判断变化是否满足既有 BO/RC，不接纳新争点。procedure mode 不降级，首个 hearing NOTICE/SI 后 Full 窗口已经关闭，不能借返修重新开票。

验收后的 `REAUTHORIZE_REVISION` 是对原获准 PS/AS 范围内实施修复的直接、受限授权：closure commit 生效后回 implementing，不先创建 successor PS/RS，也不创建第二个 PLAN_RULING 或 AS。若需要改变获准 PS、AC、owner 责任或授权边界，则不得使用 REAUTHORIZE；`RECONSIDERATION_RULING: SPLIT` 必须同时创建 `relation: side-case, blocking: true, ruling_scope: ACTION` 的新 proposal，记录 failed AS 中已经获准的 rollback/containment、parent `awaiting-blocking-child` 与 child ref，不得借 SPLIT 新增 action。child 结束后仍须 SIDE_CASE_RULING RELEASE 和原 case 的后继复议裁定。验收/复议中的 `RETURN_FOR_REVISION` 若只补 AT、证据或主张，留在当前 SI 并形成 successor DES，不进入 proposal drafting。

## 12. parking lot

`parking-lot.md` 每项使用 `PARK-###`，记录提交摘要哈希、关联决定、处置、理由及未来触发条件。处置只允许 `ADMIT_CONTEXT / MERGE_DUPLICATE / PARK_OUT_OF_SCOPE / PARK_PREMATURE / RETURN_NO_LINK`。

parking 项不具证明力，不进入 DES，不自动触发 owner handoff、参与权限、续轮或闭庭门禁。正常 handoff 只能来自当前 owner 对真实空白的明确请求。
