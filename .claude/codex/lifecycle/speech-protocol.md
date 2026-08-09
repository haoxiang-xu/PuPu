# 庭审发言协议

[Quorum 索引](../README.md) · [Case Lifecycle](README.md) · [共通收敛规则](decision-controls.md)

发言标准约束的是一条发言 **如何进入案卷及如何被回应**，不是要求所有角色使用相同的论述方式。每条发言由一层所有角色共用的 **公共信封**，加一层由发言动作或角色决定的 **类型载荷** 组成。

## 公共信封

每条进入案卷的发言都必须使用以下结构，五个字段不得省略；没有内容时填写 `无`，不得以留空表示:

```markdown
#### S-0001 | CLAIM | expert-security → Q-001
- **阶段**: 议案庭审
- **结论**: ...
- **依据**: Q-001, E-0001
- **不确定性**: ...
- **请求/下一步**: ...
- **主张类型**: FACT
```

- `S-####` 是 case 内按归档顺序单调递增的 **发言编号**，一经分配不可修改或复用
- **一条发言，一个主动作，一个可独立回应的核心结论**；相互无依赖的主张必须拆分，支撑同一结论的多项证据可以合并引用
- `speaker` 必须使用经 `Chief Judge` 批准的角色 instance 正式名称；`FRAMING`、`OBLIGATION_SET`、`NOTICE` 与 `SUMMARY` 可使用 `case` 作为 `target`，其余实体提交必须指向具体 `Q-###`、`BO-###`、`S-####`、`E-####`、`R-####`、方案/修正/验收标准编号、track、owner 分工、回滚条件或被传唤角色，不得笼统指向 `case`
- 回答，反对，修正与撤回必须引用其直接 target；不得用“上面提到的”“之前那个方案”等位置性表述
- 已归档发言不得原地改写。内容有误时，以新的 `WITHDRAWAL` 撤回；旧记录保留但标注失效。DES 冻结后，替代证据或实质方案变化只有在 `RETURN_FOR_REVISION` 授权范围内才能进入主流程，否则只进入 parking lot
- **依据** 只接受可追溯的 `Q-###`、`BOS-###/BO-###`、`S-####`、`E-####`、`R-####`、`DES-###/DU-###`、`CR-###`、`AT-###`、方案/快照编号或法典条目；`无` 表示发言不主张证明力
- **不确定性** 必须写明未知前提，适用边界或可能改变结论的条件；确认不存在时填写 `无`
- 事实主张、问题、证据、异议、修正、范围请求与评估在进入主记录前，均须通过[相关性门](decision-controls.md#二speaker-of-the-house-的相关性门)；未通过者不分配主记录编号

## 发言动作

| 动作 | 用途 | 类型载荷与约束 |
|---|---|---|
| `FRAMING` | `Speaker of the House` 框定本次庭审 | 登记目标、待裁问题、`write_set`、`contract_set`、`non_goals`、已知事实、已知缺口、主 owner 及已批准参与者与交付 |
| `OBLIGATION_SET` | `Speaker of the House` 冻结阶段阻塞清单 | 在首次完整材料与首次相关性审查后登记 `BOS-###`、收敛域、形成基线及有限 `BO-###`；只路由既有材料，不新增实体立场 |
| `NOTICE` | 发布开庭，休庭，恢复，闭庭或其他程序通知 | 标注通知类型，生效时间及影响范围；不承载实体立场 |
| `CLAIM` | 提出待证明的事实或推论 | 标注 `FACT` 或 `INFERENCE`；`FACT` 引用直接证据，`INFERENCE` 引用完整推导所依赖的证据或发言 |
| `EVIDENCE` | 将候选证据提交证据台账 | 在发言中登记证据编号，正文位置、支持或反驳的 target 及受影响决定；来源与完整性元数据只写入 `evidence.md`。被采纳不等于进入决策证据集 |
| `QUESTION` | 向一个明确对象提出一个可直接回答的问题 | 给出问题，回答对象及其对当前争点的影响；不得把观点或多项问题包装成问句。material 问题只在首次审查截止前接纳，冻结 BOS 后不得新建 |
| `ANSWER` | 回应一个 `QUESTION` | 引用问题编号，标注 `ANSWERED`，`UNKNOWN` 或 `UNCERTAIN`；只回答所问范围，额外主张另开 `CLAIM` |
| `OBJECTION` | 对发言、证据或方案提出可处理的异议 | 引用 target，并标注 `UNSUPPORTED`、`SOURCE`、`RELEVANCE`、`CONTRADICTION`、`SCOPE` 或 `PROCEDURE`；说明若异议成立会改变什么。`THREAD` 只在首次审查截止前接纳并随 BOS 冻结全部 RC。冻结后不得另立讨论异议；仅可对冻结后新进入的 E/DU 提交 `EVIDENCE_FLAG`，映射既有开放 BO 且不创建线程、RC 或 BO。有效证据质疑不自动触发逐条审查；核验依 16% 抽样或 `Chief Judge` 明示续查 |
| `PROPOSAL` | 提交可供裁定的方案 | 在发言中登记方案编号与目标结果；完整方案归档于 `proposal.md`，写明实施范围，关键步骤，风险，可逆性与回滚或补救方式，以及可验收标准；不同结果的方案不得混写 |
| `AMENDMENT` | 对既有方案提出局部修正 | 引用方案及 `proposal.md` 中的修正块，登记变更摘要、理由及风险影响；只能在冻结 `write_set / contract_set` 内修改。扩大集合或新增 owner slot 先等待 `SCOPE_RULING`；改变目标结果或验收标准时必须另立 `PROPOSAL`。DES 冻结后的实质修正还须有 `RETURN_FOR_REVISION` 授权 |
| `SCOPE_REQUEST` | 请求改变冻结范围 | 分配 `SR-###`，只记录请求，不修改当前范围或方案。点名新增/移除的 write/contract 对象、owner slot、决策理由与 Track 影响；通过相关性门后等待 `SCOPE_RULING` |
| `ACK` | 对方案快照登记无实质异议 | 引用方案快照及实际审查的方案块；只表示该范围在当前快照下无实质异议，不分享裁决权。目标块变化前持续有效 |
| `THREAD_STATUS` | `Speaker of the House` 追加线程与 BO 状态 | 引用 `BO-###` 及原始 `QUESTION / OBJECTION`（若有），登记线程状态、BO 状态、理由及本轮实质增量；direct BO 没有线程时线程字段写 `NOT_APPLICABLE`。本动作只记录既有事实或裁定授权的状态变化，不承载实体立场 |
| `ASSESSMENT` | 提交角色职责要求的正式意见 | 使用下述角色输出契约；不得以通用评论代替角色必须给出的结论 |
| `SUMMONS` | 签发符合门禁的传票 | `Witness` 传票须包含单一问题，受影响事项，已查来源，本人知情理由与 blocking 状态；blocking 传票只可在首次审查截止前签发并随 BOS 冻结，之后不得新增 |
| `TESTIMONY` | `Witness` 回应传票 | 引用 `SUMMONS`，标注 `KNOWN`，`UNKNOWN` 或 `UNCERTAIN`，分配证据编号，并给出知识来源，答案边界及可佐证线索 |
| `SIDE_CASE_MOTION` | 动议 blocking side case | parent 开放期间只允许点名当前开放 `BO-###` 的 blocking 动议；non-blocking 事项仅进入 parking lot，结案后再由 `Chief Judge` 选择 |
| `WITHDRAWAL` | 撤回已经归档的发言 | 引用被撤回编号，说明原因及替代发言编号；不得借撤回删除历史记录 |
| `SUMMARY` | `Speaker of the House` 提交送裁定忠实汇总 | 分列共识、分歧、已知缺口、候选方案、风险、阻塞清单状态、强制回应事项、相关性处置、决策证据集、置信度报告、停止原因及覆盖缺口；提交 SUMMARY 不等于最终闭庭 |

公共信封之后，必须按下列顺序追加对应动作的固定字段；字段不得改名或换序，不适用时填写 `无`:

- `FRAMING`: **目标结果**，**待裁问题**，**write_set**，**contract_set**，**non_goals**，**已知事实**，**已知缺口**，**主 owner**，**已批准参与者与交付**
- `OBLIGATION_SET`: **阻塞清单编号**，**收敛域/SI**，**形成基线**，**首次审查截止**，**阻塞项** (`BO-### | 来源 | target | 退出条件 | 状态`)，**阻塞项状态理由** (`BO-### | reason / 无`)，**清单摘要哈希**
- `NOTICE`: **通知类型** (`OPENING / RECESS / RESUMPTION / CLOSURE / PROCEDURAL`)，**生效时间**，**影响范围**
- `CLAIM`: **主张类型** (`FACT / INFERENCE`)
- `EVIDENCE`: **证据编号**，**正文位置**，**支持/反驳**，**受影响决定**
- `QUESTION`: **问题**，**回答对象**，**重要性** (`MATERIAL / NON_MATERIAL`)，**受影响事项**，**阻塞项**（冻结前 material 写 `PENDING_BOS`；non-material 写 `NOT_APPLICABLE`；冻结后不接纳新的 material QUESTION）
- `ANSWER`: **问题编号**，**回答状态** (`ANSWERED / UNKNOWN / UNCERTAIN`)
- `OBJECTION`: **模式** (`THREAD / EVIDENCE_FLAG`)，**异议编号目标**，**异议类型** (`UNSUPPORTED / SOURCE / RELEVANCE / CONTRADICTION / SCOPE / PROCEDURE`)，**受影响事项**，**阻塞项**（`THREAD` 写 `PENDING_BOS`；`EVIDENCE_FLAG` 写既有开放 `BOS/BO`），**解决条件**（`THREAD` 写有限 RC；`EVIDENCE_FLAG` 写 `NOT_APPLICABLE`）
- `PROPOSAL`: **方案编号**，**正文位置**，**目标结果**
- `AMENDMENT`: **目标方案**，**修正块**，**影响字段** (`OWNER_SLOT / IMPLEMENTATION_SCOPE / STEPS / RISK / REVERSIBILITY / REMEDIATION`)
- `SCOPE_REQUEST`: **范围请求编号**，**目标 Q/方案**，**write_set 变化**，**contract_set 变化**，**owner slot 变化**，**决策理由**，**Track 影响**
- `ACK`: **目标方案**，**方案快照**，**审查块**
- `THREAD_STATUS`: **异议线程** (`S-#### / NOT_APPLICABLE`)，**阻塞项**，**阻塞项状态** (`OPEN / SATISFIED / WITHDRAWN / STABLE_DISAGREEMENT / WAIVED_BY_RULING`)，**线程状态** (`OPEN_MATERIAL / RESOLVED_ANSWERED / RESOLVED_ADOPTED / RESOLVED_BY_RULING / WITHDRAWN / STABLE_DISAGREEMENT / NOT_APPLICABLE`)，**状态理由**，**实质增量引用**，**已关闭条件**，**剩余解决条件**（direct BO 无 RC 时写其冻结退出条件或 `NOT_APPLICABLE`）
- `ASSESSMENT`: **评估结论**，然后按角色输出契约追加字段
- `SUMMONS`: **问题**，**受影响事项**，**阻塞项**（冻结前 blocking 写 `PENDING_BOS`；non-blocking 写 `NOT_APPLICABLE`；冻结后不得新增 blocking 传票），**已查来源**，**本人知情理由**，**阻塞状态** (`blocking / non-blocking`)
- `TESTIMONY`: **回答状态** (`KNOWN / UNKNOWN / UNCERTAIN`)，**证据编号**，**答案**，**知识来源**，**适用边界**，**可佐证线索**
- `SIDE_CASE_MOTION`: **side case 标题**，**问题**，**超出当前范围依据**，**关系** (`blocking`)，**阻塞项** (`BO-###`)，**阻塞的当前决定**，**阻塞依据**
- `WITHDRAWAL`: **撤回编号**，**撤回原因**，**替代编号**
- `SUMMARY`: **共识**，**分歧**，**已知缺口**，**候选方案**，**风险**，**阻塞清单状态**，**证据质疑标记**，**未核验 replacement 风险**，**强制回应事项**，**相关性处置**，**决策证据集**，**置信度报告**，**停止原因**，**覆盖缺口**，**未答 non-blocking 传票**

对 `E-####` 或 `DES-###/DU-###` 的证据质疑只使用 `SOURCE / UNSUPPORTED / RELEVANCE / CONTRADICTION`；对方案、范围或程序的异议可使用全部六类。`SCOPE / PROCEDURE` 不得伪装成证据质疑来改变抽样状态。

纯粹的“同意”“赞同”或对既有内容的改写不形成新发言。Debate 中对指定方案快照承担审查义务时，使用 `ACK`；其他场景需要表明一致时，在本角色有义务提交的 `ASSESSMENT` 中引用既有编号，并只补充本角色独有的测量、影响或条件。

## 角色输出契约

`ASSESSMENT` 在 **评估结论** 之后，必须按以下顺序追加职责特有字段:

- `Code Owner`，`Task Owner`，`Knowledge Owner`: **边界命中依据**，**受影响对象**，**约束**，以及职责范围内的 **建议处置**。被指定为 Debate 主 owner 时，还须提交集成方案、owner slots、当前推荐与最大失败点
- `POV Owner`: **既定立场**，**与议案的冲突点**，**支持证据**，以及在该观点下可接受的 **条件**
- `Codex`: **法典条目编号**，**当前置信度**，**修订状态**，以及该条目与当前争点的关系
- `Expert`: **评估结论** 只允许 **成立 / 不成立 / 有条件成立**，随后为 **专业适用范围**，**专业理由**，**支撑证据**；有条件成立时在 **不确定性** 中列出全部必要条件
- `Dimension Owner`: **评估结论** 只允许 **支持 / 反对 / 弃权**，随后为 **测量方法**，**测量结果**，**方向性声明**；无法测量必须直接写明，不得用估计代替
- `Evidence Examiner`: **评估结论** 只允许 `HIGH / MEDIUM / LOW`，随后为 **置信度报告编号**、**决策证据集**、**样本参数**、**抽中决策单元**、**核验结果**、**决策覆盖** 与 **限制**；逐项状态只追加在 `evidence.md`
- `Acceptance Inspector`: **评估结论** 只允许 **通过 / 不通过**，随后为 **验收标准引用**，**检查方法**，**观察结果**
- `Witness`: 只使用 `TESTIMONY`，提交 **回答状态**，**证据编号**，**答案**，**知识来源**，**适用边界** 与 **可佐证线索**；不得在证言内作方案取舍
- `Procedural Judge` 不使用 `ASSESSMENT` 提交裁定；裁定正文进入 `ruling.md`，`Speaker of the House` 只以 `NOTICE` 引用该记录
- `Speaker of the House` 只使用 `FRAMING`、`OBLIGATION_SET`、`NOTICE`、`THREAD_STATUS`、`SUMMONS` 与 `SUMMARY`，不提交实体立场

## 发言流程

发生庭审时依次经过以下阶段；Fast Track 没有前置庭审，但出现实体提交或验收庭审时同样适用相关性与证据规则：

1. **议题框定**：`Speaker of the House` 以 `FRAMING` 归档 `Q-###`、目标、范围、`write_set`、`contract_set`、`non_goals`、主 owner、经批准名单及各自交付。
2. **首份完整材料**：只有名单内角色按输出契约提交；`Witness` 仅按传票出庭。需要 action 时，由负有方案职责的角色提交首份完整 `PROPOSAL`；角色缺口只能形成增员请求，不能自动加入。
3. **相关性路由与首次审查**：实体提交先经统一相关性门；背景、重复、范围外、过早或无决策链接的内容不进入主论证。第一份完整议案、方案或验收观察形成后，所有当前交付者获得一次明确的首次审查窗口。
4. **冻结阻塞清单**：首次审查截止后，Speaker 把 Q、AC、强制风险、覆盖缺口及已接纳问题/异议归并为有限 `BOS-###`。此后新内容只能处理既有开放 BO；不能映射的潜在新 blocker 交 `Chief Judge` 重框、拆案或裁定。
5. **定向回应**：以 `ANSWER`、`EVIDENCE`、`CLAIM` 与 `AMENDMENT` 围绕已冻结 BO 和线程展开；不再创建 material QUESTION 或讨论异议。庭审不设固定轮数，但原线程只有在仍有实质异议、出现决策关键的新证据或方案变化，且全案冻结的开放 condition/RC rank 严格减少时才续轮。冻结后新 E/DU 的 `EVIDENCE_FLAG` 只进入证据控制，不算讨论续轮。
6. **增量修订**：有实施需要时，主 owner 围绕开放 BO 更新 `PROPOSAL`，其他角色以 `AMENDMENT`、`ACK`，或向冻结线程补充 `ANSWER / EVIDENCE / CLAIM` 回应；不得新建 material 异议。Debate 依[辩论庭流程](debate-court.md)维护单一集成方案。
7. **抽样核验**：当当前没有已获准的 agent 增量可再减少 rank 时，`Speaker of the House` 冻结最小决策证据集；依赖证据的 BO 保持 `OPEN / AWAITING_EVIDENCE`，不阻止进入本步。`FIRST_RANDOM_REQUIRED` 时 Examiner 只执行当前 `sampling_scope_id` 唯一自动首批 16% 并提交置信度报告；`EMPTY / INHERITED_ONLY` 不创建 Examiner 或新 CR；其他非空集合等待 `Chief Judge`。action 获准前 scope 为 SI，批准后从 implementation 起为 AS；后续核验等待 `Chief Judge` 明示指令。
8. **送裁定检查**：`Speaker of the House` 执行下述门禁；通过后以 `SUMMARY` 形成忠实材料并休庭等待，不替 `Chief Judge` 作实体取舍。通常只有实体裁定处置全部开放 BO 后才发布最终 `CLOSURE`；验收返修仅可按下文三种受控非终态交接关闭当前 hearing。

发言平等是指每个出庭 agent 都可依本协议提交证据，质询和异议，不因角色或立场被拒绝；它不等于轮流发言，相同篇幅，或允许重复占用庭审。格式不合规的发言须退回原 speaker 重排，`Speaker of the House` 不得自行改写后代为提交，也不得以格式问题压制其内容。

## 送裁定门禁与最终闭庭

提交每一版 `SUMMARY` 前，`Speaker of the House` 必须逐项确认：

1. 初始参与名单已经 `Chief Judge` 批准；后续每项增员请求均有批准、拒绝或覆盖缺口记录。
2. 名单内承担当前阶段交付的角色已经提交、`ACK`、弃权或留下缺席记录；未获批准的候选不构成缺席。Debate 的首次全案审查中，写入与验收 owner 必须逐一 `ACK` 或提出异议，除非 `Chief Judge` 明示豁免或将其移出名单，沉默不得当作通过。
3. 当前收敛域的 `BOS-###` 已冻结；所有 material 问题、讨论异议、blocking 传票与 blocking side case 均映射到其中一个 BO，每个 BO 都有最新状态。`OPEN` 可以随 SUMMARY 送交，但必须列出 direct BO 退出条件或剩余 RC，以及当前没有可自动执行下一步的原因；依赖证据的项标记 `AWAITING_EVIDENCE`。冻结后无法映射的新 blocker 已交 `Chief Judge`，未偷偷加入当前清单。
4. 每项进入主记录的事实主张都有证据编号及具体决策链接；背景与范围外材料未混入决策证据集。
5. 每个 material `QUESTION` 已获得 `ANSWERED`、`UNKNOWN` 或 `UNCERTAIN` 回答，或列为带影响说明的已知缺口。
6. blocking `Witness` 传票均已回应；non-blocking 未答传票已进入待答清单。
7. 每项以 `THREAD` 模式进入主记录的 `OBJECTION` 都有最新 `THREAD_STATUS`。终态只允许 `RESOLVED_ANSWERED / RESOLVED_ADOPTED / RESOLVED_BY_RULING / WITHDRAWN / STABLE_DISAGREEMENT`；仍为 `OPEN_MATERIAL` 的，必须引用开放 BO、剩余 RC 与停止原因，且当前不存在已获准、能使 rank 严格减少的下一增量。`EVIDENCE_FLAG` 不创建线程，但须已去重写入 evidence control 并列入 SUMMARY；范围外内容从未创建异议线程。
8. 可供裁定的方案带有风险、可逆性、回滚或补救方式及带编号的验收标准；Debate 的方案快照与各 owner 审查范围明确。
9. 经相关性门标记为 `ADMIT_MATERIAL` 的 `Expert` **不成立** 与 `Dimension Owner` **反对** 已进入 `Chief Judge` 的强制回应清单；其他处置不得重新进入。
10. 决策证据集已冻结且候选 DU 完整分区；初始抽样处置为 `FIRST_RANDOM_REQUIRED` 时，当前 `sampling_scope_id` 唯一自动首批 16% 及 `CR-###` 已完成；`EMPTY / INHERITED_ONLY` 已记录 `CR = NOT_APPLICABLE`，后者完整引用既有逐项 CR 历史；`AWAITING_CHIEF_DIRECTION` 已明确列出为何没有自动批次。未抽中或已继承核验的证据不得因缺少一份伪造的新 CR 阻止送裁定。
11. `Chief Judge` 已签发的续查或返修指令均已完成；不存在任何由 agent 自动生成的待核验批次。返修交付与 successor DES 已冻结、但正等待 Chief 对 current DES 续批的，可明确标为 `PENDING_VERIFICATION` 后送交；这不算 rank 已减少，也不允许再次 RETURN。
12. 每个 `REPLACEMENT_REQUIRES_TARGETED_CHECK` 已定向核验、对应主张已撤回，或已列入 `SUMMARY` 的未核验风险；后一种须由后续实体裁定显式接受，不得把它描述为已验证依据。

送裁定产出必须分别列出 **共识、分歧、已知缺口、候选方案、风险、阻塞清单状态、证据质疑标记、未核验 replacement 风险、强制回应事项、相关性处置、决策证据集、置信度报告、停止原因与覆盖缺口**，并引用原始编号。摘要不是新的证据，也不得取代完整记录。存在 OPEN BO 时，`SUMMARY` 是一个可追加后继版本的决策检查点，不是 `NOTICE: CLOSURE`。

实际 `CR-###` 随 `SUMMARY` 送交，或非空 DES 写为 `AWAITING_CHIEF_DIRECTION` 时，case 进入 `awaiting-evidence-direction`；`Chief Judge` 可直接作出引用当前 DES 与可用 CR 历史的实体裁定（等同 `RULE_NOW`），或签发其他证据方向使庭审恢复。`EMPTY / INHERITED_ONLY` 进入 `awaiting-ruling`，通常仍可对开放 BO 签发 `RETURN_FOR_REVISION` 或 `RECLASSIFY`；若 active cycle 为 rank 尚未下降的 `PENDING_VERIFICATION`，则不得再次 RETURN，只能裁定、回滚、终止、拆案，或作继承该 cycle 的重分类/合规重框。`RETURN_FOR_REVISION` 恢复当前 atom lineage；revision 与非空 successor DES 可先以 `PENDING_VERIFICATION` 等-rank 状态再次送证据方向，但在该 lineage 再次 RETURN 前必须严格减少全案 OPEN condition/RC rank，重分类与重框都不得清除 active cycle。其中 direct BO 可通过满足其冻结退出条件直接终态化，未链接 RC 时填 `NOT_APPLICABLE`。`NEXT_RANDOM_16 / TARGETED_CHECK` 完成后追加 CR 与后继 SUMMARY。单独的 `RULE_NOW` 只结束证据等待，不豁免 BO；证据结果已正面支持退出条件的 BO 可据此转为 `SATISFIED`，未抽中、未覆盖或相矛盾的 OPEN BO 仍须由后续实体裁定处置。

最终实体裁定必须逐项处置剩余 OPEN BO：采纳记录中已经满足的状态，或写明理由标为 `WAIVED_BY_RULING`；不得默默遗漏。验收失败后只有三种受控非终态交接可保留 OPEN BO：

1. `RECONSIDERATION_RULING: REAUTHORIZE_REVISION` 返回 proposal/combined/debate 时使用 `KEEP_OPEN_FOR_REVISION_HEARING`，状态仍为 `OPEN`、理由写 `PENDING_REVISION_HEARING`；Speaker 追加状态事件后关闭验收 hearing，并在同一事务进入裁定点名的新 phase/SI；
2. `ACCEPTANCE_REVISION` 方案获批，或 `RECONSIDERATION_RULING` 直接授权 implementation revision 时，使用 `CARRY_OPEN_TO_IMPLEMENTATION`，状态仍为 `OPEN`、理由写 `PENDING_IMPLEMENTATION_OR_VERIFICATION`；状态事件后关闭当前 hearing 并进入 implementation/后继 AT；
3. `ACCEPTANCE_REVISION` 方案被驳回时使用 `KEEP_OPEN_AWAITING_RULING`，状态仍为 `OPEN`、理由写 `REVISION_REJECTED_AWAITING_FINAL_RULING`；状态事件后关闭返修 hearing 并回 `awaiting-ruling`，active cycle 未降 rank 前不得再次 REAUTHORIZE。

三种交接都必须继承同一 AS/BOS/effective DES/active revision cycle，不得新增 BO/RC、清除返修债务或宣称 rank 已下降；前两种最终仍须由新 AT 后的 `ACCEPTANCE_RULING` 或复议终局处置。除此之外，处置完成后 Speaker 才以 `NOTICE: CLOSURE` 关闭 hearing。批准 action 可同时进入 implementation，驳回或终止可同时进入 case 终态；“送裁定”与“最终闭庭”不得再混为同一时点。
