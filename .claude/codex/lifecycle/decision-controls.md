# 收敛与裁定控制

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

本页适用于议案与方案的默认协作、辩论庭、众议庭及验收争议。讨论类别决定裁定对象；程序模式只决定处理分歧的广度。

## 一、冻结对象与允许发现的边界

case 创建时冻结：

- `discussion_type`；
- 核心问题或目标结果；
- `non_goals`；
- 主 owner 与选择依据；
- 提出者已知的初始范围和材料。

最小协作不要求 Speaker 预先穷举 `write_set`、`contract_set`、知识来源或 owner slots。主 owner 与后继 owner 可在不改变核心问题、目标结果及 `non_goals` 的前提下，通过有限交棒逐步补全这些集合。每次新增必须由当前材料中的真实空白驱动，并记录它影响的具体结论或方案块；仅仅“可能相关”不能扩张范围。

方案发现跨边界传递或状态依赖时，须依[边界契约与状态序列](boundary-contracts.md)把 `BC-###/SEQ-###` 加入当前 `contract_set` 与 PS lineage；这属于对既有目标的契约补全，不会自动改变冻结对象或创建新 owner。若补全会改变目标结果、`non_goals` 或授权边界，仍须另立、拆案或重框。

改变讨论类别、核心问题、目标结果或 `non_goals` 必须另立 case。议案与方案之间只能建立 `derived` 引用，不能原地转换。普通交棒不能借补全之名改变上述冻结对象。

## 二、统一相关性门

任何进入主记录的事实主张、问题、证据、异议、修正、交棒或范围请求必须同时回答：

1. 它指向哪个议案问题、回答快照、方案块、验收标准、owner 责任、回滚条件或既有发言；
2. 若成立、不成立或被采纳，会改变什么；
3. 为什么它属于当前冻结目标而非相邻问题。

Speaker 只判断决策链接、时机与重复，不判断真伪、专业成立性或谁应胜诉。处置只允许：

| 处置 | 条件 | 结果 |
|---|---|---|
| `ADMIT_MATERIAL` | 可能改变当前抉择 | 进入主流程 |
| `ADMIT_CONTEXT` | 有背景价值但不改变抉择 | 只进上下文索引 |
| `MERGE_DUPLICATE` | 与已有内容的 target、理由和影响等价 | 合并到原编号 |
| `PARK_OUT_OF_SCOPE` | 属于相邻问题或 non-goal | 移入 parking lot |
| `PARK_PREMATURE` | 只有未来状态成立才相关 | 记录可判定触发条件 |
| `RETURN_NO_LINK` | 没有具体 target 或决策影响 | 退回提出者 |

任何风险标签、角色资历、异议人数或“事情重要”都不能绕过本门禁。多数是程序升级条件，不是实体证明。

## 三、默认协作与串行交棒

默认 `procedure_mode: collaboration` 不开庭、不冻结 BOS、不建立形式性 DES，也不创建 Examiner。主 owner 提交首稿后，必要的边界外内容按 [最小主 owner 原则](discussion-model.md#串行交棒)一次只开放一个 `HS-###`：

- 交棒必须点名当前快照、空白、目标 ownership boundary、期待交付、缺席影响与返回对象；用于 BC/SEQ 确认时，HANDOFF scope 必须覆盖责任对象与全部责任 AC，RETURN contribution 必须覆盖同一对象，空 return 或泛化“完成”无效；
- 接收 owner 只获得该范围的读取权和一次交付权；
- 完成 material HS 的 owner 成为合作 owner；交付可以是回答/方案块，也可以是对当前快照中具体、真实的直接回答、实施、回滚或验收责任作明确确认。仅被方案点名、无 HS 的责任声明、只查资料、提供证言或程序服务者不是合作 owner；
- Speaker 在前一交棒关闭前不得并行开启另一 owner 交棒；
- 结果最终返回主 owner 集成，主 owner 不得把未经目标 owner确认的内容标作已补全。
- BC/SEQ 的非主 owner 确认同样必须通过上述 material HS 返回；同一个返回只能确认 HANDOFF 明确点名的 boundary/state 责任，不能扩张为对未读方案或相邻契约的同意。

主 owner 形成完整集成快照后，Speaker 冻结一次 `RS-###` 审查人快照。审查人是主 owner，以及已经完成上述 material HS 的 owner。同一底层 agent 不得因多个 owner 身份在同一 RS 重复出现。主 owner 发布快照即以 `AGREE` 确认基线，不得对自己的快照 `OBJECT`；其他人必须在各自获准块及直接依赖范围登记 `AGREE / OBJECT / ABSTAIN`。沉默不是同意，截止时规范化记录为 `ABSTAIN` 且 `reason: TIMEOUT`，但仍保留在人数分母。

每个 RS opening NOTICE 必须记录 predecessor、artifact 及其 content hash、逐人 review scope、继承立场、失效 scope、`review kind`、eligible owners、N、boundary object hash（适用时）、review/objection 截止点、稍后的 lead disposition 截止点、final reminder 截止点与可重算的 RS content hash。`review kind` 只允许 `ORDINARY / BOS_CHANGE_REVIEW`。NOTICE 不复制最终 stance；lead baseline AGREE 及每名其他 owner 的 AGREE/OBJECTION/ABSTAIN 以引用当前 RS 的独立 canonical S 事件为准，超时 ABSTAIN 写明 TIMEOUT。在首个 hearing BOS 冻结前，修改快照后建立 `ORDINARY` successor RS，只重新请求受影响块及直接依赖块的立场；未受影响的 AGREE/ABSTAIN 按 lineage 显式继承，有限 objection intake 与该 RS 使用同一截止点。

OBJECT 不得靠一句“carried stance”自动继承。每项旧 objection 在 successor RS 都须有新的 `NOTICE: OBJECTION_RETARGET`，同时引用原 objection S、此前 retarget、此前 `LEAD_DISPOSITION`、旧/新 target hash 与当前 RS。result 仍只允许 `CONFIRMED / WITHDRAWN / RETURN_NO_LINK`：只有 CONFIRMED 才是当前 OBJECT。若 target 内容及直接依赖 hash 均未变化，notice 可把原 disposition 标为 `CARRIED_UNCHANGED`；任一 hash 变化或发生 lead transfer 时必须标为 `REQUIRES_NEW_DISPOSITION`，由当前主 owner重新处置。在 successor RS 计算 D 时，只有 CONFIRMED 且具有当前有效 carried/new REJECT disposition 的 objection 可计；其他旧异议只保留历史。

hearing BOS 冻结后的任何 successor RS 必须使用 `BOS_CHANGE_REVIEW`。它只允许受影响 owner 判断当前变化是否满足既有 `BO-###/RC-###` 或裁定明确继承的有限 RC；每项 `OBJECT` 都必须映射到该既有 atom，只能让它保持 OPEN，不能进入当前 `D/OG`、新增 BO、扩大解决条件或重开 Full 投票。无法映射的新忧虑只能重框、拆案、同类延伸或 side case。所有 review 窗口关闭后均不得把新异议倒填当前快照。

## 四、异议处置与辩论庭入口

`OBJECT` 必须引用当前快照及具体块，写明理由、决策影响和请求的修改。主 owner 必须逐项记录：

- `ACCEPT`：接受并进入修订；
- `REJECT`：拒绝，写明理由；
- `PARTIAL_ACCEPT`：明确接受和拒绝的部分；被拒部分按独立异议处理。

交棒期间的异议先以 `PENDING_REVIEW_TARGET` 追加保存，可促成修订；RS 冻结后由 Speaker 追加 `OBJECTION_RETARGET`，只有 `CONFIRMED` 项才能由主 owner 作触发开庭的处置。RS 的 lead disposition 截止点不得早于 review/objection 截止点；主 owner 必须在该时点前逐项回应。沉默不构成拒绝，也不能开启庭审；截止后 Speaker 必须发出一次带最终时点的催告，随后转移主 owner，或把无法转移的停滞送 Chief 决定重派、终止或按当前记录裁定，不能无限等待或伪造拒绝。RS 后发生 lead transfer 时必须关闭旧 review，由新 lead 发布 successor artifact/RS；仍有链接的旧异议须逐项 retarget 且一律 `REQUIRES_NEW_DISPOSITION`，旧 lead 的拒绝不能替新 lead 生效。Full opening 前，旧 lead 只有另行满足普通合作 owner 条件时才留在 N；Full opening 后则适用冻结 electorate 例外：新 lead 必须来自现有 electorate，旧/新 slot 只交换 lead 身份，successor RS/FS 的成员与 N 完全不变，旧 lead 以 `FROZEN_FULL_ELECTORATE` 保留。无法在冻结 electorate 内转移时不得改变原案分母，只能由 Chief 终止或重框。一个 `ADMIT_MATERIAL`、在当前 `ORDINARY` RS 已确认且被当前主 owner拒绝的异议即可将 case 从 `collaboration` 原子升级为 `debate` 的庭前分组状态；此时尚不创建 hearing SI、BOS 或 DES。异议提出者成为该争点原告；非合作 owner 的原告可以参加其争点，但不因此进入合作 owner 分母。

Speaker 按 target、依赖事实、请求的修改与解决条件，把兼容异议归入 `OG-###`。每个 OG 都是一个组内可合并的 hearing cluster；合并只减少重复程序，不消灭任何原告、异议编号或独立理由。Full 门槛讨论的是多个 OG 之间是否无法共同聚焦，不把不可合并异议塞入同一个 OG。

## 五、众议庭门槛与投票

Speaker 在 `RS-###` 上计算：

- `N`：冻结的全部合格合作 owner 数，包括主 owner及弃权者；
- `D`：至少有一项 material 异议被主 owner 拒绝的不同合作 owner 数，每人最多计一次；只有在当前 RS 上仍有效、未撤回、未满足且未因 successor artifact 失效的异议可计。主 owner 不得提交对自身快照的异议，永不计入 D。

只有 `D >= 3` 且 `D > N / 2`，并且异议不能在一次聚焦辩论中共同处置时，Speaker 才具备创建 `FV-###` 的资格。即使异议共同指向整体集成失效，只要一组有限解决条件仍可共同处置，就必须留在辩论庭。Speaker 必须在 review 与处置窗口全部关闭后，先归档 `OG-###`，再追加 `NOTICE: FULL_VOTE_DECISION`，结果只允许 `NOT_ELIGIBLE / ELIGIBLE_OPENED / ELIGIBLE_DECLINED`，并记录门槛、不能合并的程序理由及是否开票的理由。`ELIGIBLE_DECLINED` 使相同 RS 与 OG 集合直接留在辩论庭；没有 material successor RS 不得改口重开。

`FV-###` 的 electorate 固定为同一 `RS-###` 的 `N` 人；一人一票，选项为 `REMAIN_IN_DEBATE / ENTER_FULL / ABSTAIN`。开票记录必须列出 `owner → rejected objection → OG` 的 D 映射、组间不可合并理由、投票截止点及 electorate hash。每名 voter 只能提交一张有效 BALLOT，第一张有效票即为终局票；未在截止前投票记为 `NO_BALLOT`，不减少 N，也不伪造成 ABSTAIN。反对当前产出不等于支持众议庭，因此审查立场与程序票必须分别记录。

Speaker 在 `VOTE_TALLY` 时必须按当前 canonical record 重新验证：所有计入 D 的异议仍有效、未撤回、未满足且未被 successor artifact 取代；`D >= 3`、`D > N / 2` 仍成立；多个 OG 仍不能聚焦合并。只有复验通过且 `ENTER_FULL > N / 2` 才原子升级为 `full`。

取消与失败分两条互斥路径：① material artifact、owner 或 lead 变化要求 successor RS 时，当前 FV 以 `CANCELLED_NO_RESULT` 终结，旧 RS/OG/FV 全部关闭且任何 hearing 都不得从旧快照开启；必须先完成 successor artifact/RS，再在尚未关闭的 Full 窗口内重新分组并作一次新的 `FULL_VOTE_DECISION`。② 同一 RS 未变化，但当前 D/异议有效性/不可合并性在计票时失效，或有效票未使 `ENTER_FULL > N/2`，则不得为此生成 successor RS；仍有被拒异议时直接按当前有效 OG 开 debate hearing，全部被拒异议消失时不开 hearing并直接 SUMMARY。两条路径都保留 `procedure_mode: debate`，不降级。

同一 RS 与同一组 OG 只能创建一次 FV；关闭、取消或失败后不得重开。只有第一条路径产生 material successor RS，且新快照重新满足门槛时，才能创建新的 FV。

Speaker 必须在首个实体 hearing `NOTICE: OPEN` 发布及 hearing SI 创建前完成是否开票及计票；二者任一发生即永久关闭本 case 的 Full 窗口。collaboration 中既有的 evidence SI/DES 不属于 hearing，不会关闭该窗口。

在 `awaiting-objection-grouping` 或 `awaiting-full-vote` 的任何时点，若所有当前有效的被拒异议因撤回、主 owner 改为接受或修订满足而消失，Speaker 必须关闭仍开放的 OG/FV，且不得创建无原告 hearing。artifact 有变化时先完成 successor artifact 与 RS；随后以无被拒异议的 SUMMARY 送裁定。case 保留已达到的 `procedure_mode: debate` 作为历史高水位，不降级。

Speaker 的分组、门槛计算或计票受到质疑时，可由具备该项明示授权的 `Procedural Judge` 作有限程序裁定；不得裁定实体异议。

已经进入 debate/full 的 case 不重走 collaboration 的初次入口。首个 hearing 尚未开启时，material successor RS 关闭旧 OG/FV，并按新快照重新分组；Full 尚未成立且窗口仍开放时才可依新 RS 作一次新的开票决定。hearing `NOTICE/SI` 已开启但 BOS 尚未冻结时，返修留在同一 SI 并使用 `ORDINARY` successor RS；Full 窗口已经关闭。BOS 冻结后才切换为 `BOS_CHANGE_REVIEW`，留在当前 SI/BOS lineage并只验证既有 atom。若先前 hearing 已由 Chief 裁定关闭而裁定又授权同案受限方案返修，后续需要正式审理时创建 successor SI；它只能继承裁定明确保留的 BO/RC，不得重开终态 atom、增加开放条件或为 full 重新投票。无需正式审理时，successor review 完成后直接再送 Chief。

## 六、庭审阻塞清单

BOS 只在辩论庭、众议庭或验收庭审的首次陈述窗口结束后冻结。默认协作没有 BOS。

每个 `BOS-###` 包含有限 `BO-###`；每项写明来源、target、有限解决条件与状态。状态只允许：

- `OPEN`
- `SATISFIED`
- `WITHDRAWN`
- `STABLE_DISAGREEMENT`
- `WAIVED_BY_RULING`

后四项为终态。BOS 冻结后不得新增 BO、解决条件或讨论异议；新证据只能回应既有 BO，独立新忧虑必须重框、拆案或另立同类延伸。`Chief Judge` 的重框必须保存旧 BO 与条件 lineage，不能增加开放条件数或重开终态项。

阶段 rank 是全部开放解决条件的数量。一次返修可暂时保持等 rank，但在再次授权返修前必须永久关闭至少一个条件；否则只能裁定、回滚、终止或拆案。文字移动、换编号、重复证据和未关闭条件的修改不算进展。

## 七、庭审续轮与停止

原异议线程只有同时满足以下条件才可续轮：

1. 仍有开放 material 条件；
2. 出现会影响该条件的新证据或回答/方案变化；
3. 该增量永久关闭或推翻至少一个开放条件，使全案 rank 严格下降。

无法继续减少 rank 时，Speaker 立即停止自动讨论，把稳定分歧、开放条件和停止原因原样送 `Chief Judge`。不要求 agent 达成一致。

## 八、证据控制

默认协作中的依据保存在议案或方案正文及普通证据引用中，不自动建立 DES。以下任一情况才激活正式证据控制：

- case 正式开启辩论庭或众议庭 hearing；庭前 OG/FV 窗口不因此创建 SI、DES 或 Examiner；
- `Chief Judge` 在无争议裁定前点名要求；
- 进入验收或复议，且存在会改变验收结果的 material 证据。

激活后，Speaker 冻结最小、去重的 `DES-###`。`N = 0` 写 `EMPTY`；全部事实单元已有未变化的核验历史时写 `INHERITED_ONLY`；其余执行当前 sampling scope 唯一一次 `FIRST_RANDOM_16`。报告完成后只有 Chief 可选择 `RULE_NOW / NEXT_RANDOM_16 / TARGETED_CHECK / RETURN_FOR_REVISION`。证据方向不得改变 procedure mode。

## 九、参与与权限

参与分为三类，不能混用：

1. **合作 owner**：通过有限 material `HS-###` 完成议案回答/方案块，或确认当前快照中的具体直接回答、实施、回滚、验收责任；计入 `RS-###` 与可能的 `FV-###`。
2. **争点参与者**：通过 objection intake 被接纳的原告、Expert 或其他只对特定争点提交者；享有该争点范围的发言权，不计入 owner 多数。
3. **程序与事实角色**：Speaker、Procedural Judge、Examiner、Inspector、Witness；不计入 owner 多数。

owner 的边界内有限交棒无需 Chief 逐项批准。新增全案访问权、扩大既有交付、非 owner 专业参与、额外 role instance 或敏感访问仍使用 `RP-### / PARTICIPATION_RULING`。唯一例外是有效 Full 投票后由宪法直接授予 electorate 的冻结产出及直接依赖只读范围；Full opening 必须以 `FS-###` overlay 逐人冻结 scope、dependency、denied sensitive refs、deadline 与 hash，并引用不变的 electorate RS。FS 不改变 N，所有扩展范围 stance 同时引用 RS+FS；写入、敏感材料或相邻调查仍不在授权内。证据中出现实体、自动所有权匹配或 agent 推荐都不自动产生这些权限。

## 十、裁定与后继

所有实体裁定按 `discussion_type` 选择记录类型，而不按 procedure mode：

- 议案：`MOTION_RULING`，记录实际判断、边界和依据后关闭；
- 方案：`PLAN_RULING`；`ruling_scope: ACTION` 批准时授权 action 并创建 `AS-###`，`ruling_scope: COMPONENT` 批准时只返回 parent 并关闭，驳回时关闭或授权受限返修；
- 验收：`ACCEPTANCE_RULING`；
- 复议：`RECONSIDERATION_RULING`。

裁定必须标记其 `procedure_mode`，并回应全部 material 被拒异议。Full 程序票不约束 Chief 的实体结论。议案需要实施时只能另立 `proposal` case；action 获准前的方案内容返修仍留在同一 proposal 且 procedure mode 不降级，action 获准后若必须改变方案或授权边界则另立 proposal。

方案 SUMMARY 还必须通过 boundary v1 的 ruling-ready 门：适用性/N/A 声明、BC/SEQ、owner HS 确认、正负 AC、序列矩阵与精确 revision binding 全部完整。结构性空白不能作为 `accepted uncovered risks` 交由 Chief 豁免；它只能返回 drafting、handoff、integration 或 review。legacy case 的 effective-from 处置依 boundary protocol 的兼容规则。

任何关闭 hearing/case 或授权实体 action 的最终实体 R，必须先以 `PENDING_CLOSURE` 归档，并以 closure bundle manifest 逐项冻结、原子保留所需 S ID、完整 THREAD_STATUS payload/hash、旧/新 logical state、最终 `NOTICE: CLOSURE_COMMIT` payload、bundle hash、expected commit payload hash 与 deadline。保留 ID 不得被其他事件占用。哈希分两层且禁止自引用：每个预提交事件以 `quorum.closure.event.v1\0` 域（`\0` 为一个 NUL byte）及 canonical JSON 计算 payload hash；bundle body 只含 case/ruling、旧新 logical state、ordered `{event_id,event_payload_hash}`、commit ID 与 deadline，以 `quorum.closure.bundle.v1\0` 域计算，明确排除 commit payload/hash；commit payload 再引用 bundle hash 与全部预提交实际 event hash，但不含自身 hash，并按 event 域计算 expected hash。canonical JSON 使用 UTF-8、NFC、LF、无 BOM/尾随换行/键间空白，对象键按 UTF-8 字节序，数组保持 manifest 顺序。Speaker 先按 manifest 追加状态处置，最后追加 commit marker；首条 ID、bundle、ordered event hashes 与 expected commit hash 全部匹配的 marker 写入时裁定与新 logical state 同时生效，重复、部分、乱序或 hash 不符的 marker无效，`case.md` 随后同步派生索引。marker 前不得创建后继 action 状态或开始实施。无 BOS 的默认协作也必须有 commit marker，只是 ordered precommit events 为空。

Speaker 对 closure bundle 无裁量权。到 deadline 未完成时由 runtime 自动追加；runtime 不可用时，Chief 可指定无同案身份冲突的临时 recorder 严格按 R 的冻结 payload 完成。归档角色不能通过拒绝或拖延 ministerial 记账阻止 Chief 裁定。
