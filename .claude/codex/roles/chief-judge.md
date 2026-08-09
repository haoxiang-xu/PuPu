# `Chief Judge`

[Quorum 索引](../README.md) · [Roles](README.md)

## 角色规则

- human 角色，非 agent，由本人担任；依据[宪法第一条](../constitution.md)，任何 agent 不得代行、分享或僭越其权力
- 全 team 唯一，不可被多次创建，不可存在多个 instance
- 命名规则: `chief-judge`

## 角色职责

- memory 记录记忆责任:
    - 作为 human 角色，记忆由本人自行管理，不受 agent 记录记忆规则的约束

- case 立案权:
    - 负责 提出 **议案**，正式立案，启动 case lifecycle
    - 负责 对所有 side case 动议作出 **立案裁定**；non-blocking 事项在 parent 结案后统一选择，避免庭中自动繁殖
    - 有权 在任何阶段 中止或终止 一个 case

- 参与名单审批权:
    - 负责 在不可改写的 intake 块中一次批准每个 case 的 **初始 agent 名单、role instance、具体交付与可访问范围**；Fast Track 指派不得事后补写初始名单
    - 负责 逐一批准或拒绝立案后的每项参与变更请求，包括增加、移除、豁免交付及修改 scope/delivery；所有权匹配、自请出庭、证据中新出现的实体或其他 agent 的推荐，都不产生自动参与资格
    - 批准一个 agent 不推定批准同一请求中的其他 agent；新增 `Evidence Examiner` 并行 instance 也须逐一批准

- Fast Track 指派权:
    - 对满足 [Fast Track 全部准入条件](../lifecycle/tracks.md#准入边界) 的事项，有权 **直接指派** owner 执行，免去议案庭审与方案庭审
    - 指派时 必须给出 **可验收的完成标准**；该指派说明 即为[宪法第二条](../constitution.md)所要求的方案依据
    - 在不可改写的 intake 块中一次批准 Speaker、执行 owner 与其他已知初始参与者；Speaker 只对提出者已经提交的材料完成相关性路由并冻结最小 intake BOS 与 DES，不得为 preflight 主动调查或制造证据
    - `EMPTY / INHERITED_ONLY` 时可直接指派并引用 `CR = NOT_APPLICABLE`；`FIRST_RANDOM_REQUIRED` 且 Examiner 未在初始名单时，须以 `RP-###` 与 `PARTICIPATION_RULING` 批准增员。首批 16% 抽样后，由指派本身引用 CR 并隐式选择 `RULE_NOW`，或先签发其他证据方向
    - 初始批准块创建后不得借 Fast 指派补写；任何尚未获批的 role instance 均按立案后增员处理
    - Fast Track 事项仍须经 `Acceptance Inspector` **验收**；此项不可免除

- Debate 裁定权:
    - 负责 在目标已固定、方案仍需共同设计时指定主 owner，并批准 Debate 初始参与名单
    - 负责 对辩论庭形成的集成方案作一次 `DEBATE_RULING`；批准时分配该 action 唯一的 acceptance `AS-###` 并进入实施，驳回后结案

- 证据续查专属权:
    - 首批 16% 随机抽查与置信度报告完成后，或 DES 写为 `AWAITING_CHIEF_DIRECTION` 时，负责选择 `RULE_NOW`、`NEXT_RANDOM_16`、`TARGETED_CHECK`、`RETURN_FOR_REVISION` 或 `RECLASSIFY`
    - `EMPTY / INHERITED_ONLY` 时无需创建 Examiner 或新置信度报告；可引用当前 DES 与既有逐项核验历史推进
    - 定向核验必须点名有限 `DU-###`、理由与决策影响；每次续查必须写明停止条件。Full 选择 `RULE_NOW` 时须显式接受未覆盖的 Full 风险
    - 返修后的 successor DES 不重置自动首批，旧核验结果与失败历史必须继承；任何 agent 或获授权程序角色不得代行本项权力

- 范围与阶段授权权:
    - 负责 对新增 `write_set`、`contract_set` 或 owner slot 作 `SCOPE_RULING`；批准时同步重判 Track 与 roster，未批准的范围不得进入方案或触发增员
    - 负责 授权 lifecycle phase 转换及新的 `SI-###`；同一 phase 内的证据返修沿用当前 SI，复议或 acceptance revision 的 phase 转换可创建裁定点名的新 SI。批准 action 时创建唯一 `AS-###`，同一 action 的全部验收 AT/SI/复议沿用；任何返修、重分类、successor DES、新 SI 或 AT 都不得重置首批资格
    - 阶段 `BOS-###` 冻结后，无法映射既有 BO 的新 blocker 不得由 agent 加入当前流程；本人只能按现有记录裁定、终止/拆案、另立 case，或以 standalone `REFRAME_RULING` / 同一 scope/Track ruling 内嵌 `ATOMIC_REFRAME` 原子重框。重框须逐项保存 BO 与 condition/RC lineage，继承 SI、effective DES、sampling scope 与首批状态；终态不得重开，OPEN BO 与 OPEN atom 数均不得增加
    - blocking side case 结束或终止后，负责以 `SIDE_CASE_RULING` 明示恢复或终止 parent；不得自动恢复

- 最终裁定权:
    - 负责 对 **议案** 做出最终裁定 (议案裁定)
    - 负责 对 **方案** 做出最终裁定 (方案裁定)
    - 负责 对每个 `AT-###` 作 `ACCEPTANCE_RULING`：通过时结束证据方向、接受所列未覆盖风险并逐项处置验收 BOS；不通过时保留失败相关 OPEN BO 并进入验收庭审
    - 负责 对验收庭审结果做出最终复议裁定，并明示选择接受辩护并通过验收、终止、拆案或再授权返修；`Procedural Judge` 只可裁定客观失败与辩护状态，不得代行后续选择
    - 所有裁定 以 `Speaker of the House` 提交的 **庭审产出**（意见和建议、方案、发言记录、决策证据集、抽样置信度报告等）为依据

- 授权与复核权:
    - 负责 以 `PROCEDURAL_AUTHORITY_RULING` 在规范已定义的三类程序问题 catalog 内启用、停用、收窄或撤销 `Procedural Judge` 授权；不得借个案裁定创造新的程序问题类型或结果枚举。授权清单的变更，属于 **终局裁定**
    - 有权 随时以同一记录类型收回 对 `Procedural Judge` 的任何授权
    - 有权 **提审** 任何已交由 `Procedural Judge` 处理的事项，收归本人裁定
    - 有权 **推翻** `Procedural Judge` 已做出的任何裁定

- 身份分离义务:
    - 本人掌握的未记录事实需要进入庭审时，先由 `Speaker of the House` 依 `Witness` 传唤门禁发出传票，再显式切换为 `Witness` 身份回答
    - 作证结束后，须显式返回 `Chief Judge` 身份，方可作出裁定
    - 不得以裁定权替代证言的举证与质证程序，也不得把个人偏好包装成事实证言
