# 全 Track 共通收敛规则

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

本页规则适用于 **Fast Track、Express、Debate 与 Full**，也适用于议案、方案、合并、辩论及验收庭审。Track 只决定流程长度，不改变相关性、续轮、证据抽查、续查授权和参与名单授权。

## 一、冻结当前抉择

`Speaker of the House` 在每个获准 stage instance 开始时记录并冻结：

- 带 `Q-###` 编号的当前待裁问题
- 目标结果与验收标准
- `write_set`：获准方案可能直接写入的对象
- `contract_set`：获准方案可能改变的契约
- `non_goals`：明确不在本案处理的事项
- `lead_owner` 与经 `Chief Judge` 批准的当前 roster（含各自交付与访问范围）；初始批准块只作不可改写的审计历史

`write_set` 与 `contract_set` 只允许方案在其内部细化。任何新增写入对象、契约边界或 owner slot 的请求，先作为范围变化候选进入相关性门，并必须指向一个已冻结 `Q-###` 或开放 `S-####/RC-###`；改变目标或 `non_goals` 的请求只能另立 case。未经 `Chief Judge` 的 `SCOPE_RULING` 批准，不得进入当前方案快照、触发增员或算作既有线程的续轮增量。批准时须同时重判 Track 与 roster；若 BOS 已冻结，同一 `SCOPE_RULING` 还须选择 `KEEP_BOS`（证明没有新增退出条件）或内嵌完整 `ATOMIC_REFRAME`；若 DES 已冻结，还须另有 `RETURN_FOR_REVISION` 才能改写方案或证据。不批准但值得另议的，进入 side case。

实体提交不得笼统指向 `case`，必须指向一个 `Q-###`、方案或修正编号、验收标准、track 判定、owner 分工、回滚条件或既有发言/证据编号。

## 二、`Speaker of the House` 的相关性门

每项事实主张、问题、证据、异议、修正、范围请求与参与变更请求，必须说明：

1. 它影响哪个当前抉择；
2. 若该内容成立、不成立或被采纳，具体会改变哪个 track、方案选择、方案内容、owner 分工、验收标准、回滚条件或裁定结论；
3. 为什么它属于当前范围。

`Speaker of the House` 只按上述因果联系作以下处置，不判断内容真伪，也不替 `Chief Judge` 作实体取舍：

| 处置 | 含义 | 对主流程的影响 |
|---|---|---|
| `ADMIT_MATERIAL` | 可能改变当前抉择 | 进入主记录，可参与后续论证 |
| `ADMIT_CONTEXT` | 与主题有关，但即使变化也不改变抉择 | 只留轻量背景索引，不分配新的主记录或证据编号，不进入决策证据集，不触发续轮 |
| `MERGE_DUPLICATE` | 与既有内容具有相同结论及决策影响 | 引用既有编号，不分配新编号，不新增论证线程 |
| `PARK_OUT_OF_SCOPE` | 属于相邻问题或 `non_goals` | 移入范围外清单，不进入主记录、证据抽样或参与名单计算 |
| `PARK_PREMATURE` | 只有未来条件发生后才可能影响当前事项 | 移入范围外清单并写明触发条件 |
| `RETURN_NO_LINK` | 未指出具体抉择及改变方式 | 退回提交者重排，只留轻量处置索引，不进入主记录 |

真实但无关的内容仍然无关。Full 不得以“完整九步”为由绕过本门禁；Fast Track 发现真正会改变准入条件的新事实时，也必须停下执行并交 `Chief Judge` 重新分档。

## 三、冻结阶段阻塞清单

庭审不靠固定轮数收敛，而靠一份有限且不可增长的 **阶段阻塞清单**。在第一份完整议案/方案/合并方案或 Debate 快照完成首次相关性审查后，`Speaker of the House` 为当前收敛域冻结一个 `BOS-###`；Fast 在 intake preflight 后冻结，验收则在首个 `AT-###` 的初始观察与首次回应窗口后冻结。同一获准 action 的 implementation、acceptance 与其返修 AT 共用同一份验收 `BOS-###`，不得用新 `AT-###` 或新 acceptance `SI-###` 重置。

每个 `BOS-###` 只包含有限个 `BO-###`。每项须写明来源、具体 target、可判定的退出条件与状态；来源只允许已经冻结的 `Q-###`、`AC-###`、Full 强制风险、直接 owner/contract 覆盖缺口，以及冻结前已经通过相关性门的 material 问题或异议。状态只允许 `OPEN / SATISFIED / WITHDRAWN / STABLE_DISAGREEMENT / WAIVED_BY_RULING`，后四项为终态。冻结后：

- 首次审查截止前的每个 material `QUESTION`、`OBJECTION(mode=THREAD)` 与 blocking `Witness` 传票必须被吸收到恰好一个 `BO-###`，其全部 RC 随 BOS 一并冻结；同一退出条件的不同表述合并。冻结后不再接纳新的 material QUESTION、讨论型 OBJECTION 或 blocking 传票，只允许以 `ANSWER / EVIDENCE / CLAIM / AMENDMENT` 回应既有线程；针对冻结后新 E/DU 的去重 `OBJECTION(mode=EVIDENCE_FLAG)` 仅走本页所定证据控制例外，不创建线程或条件。blocking side case 只能服务一个既有开放 BO，且不得新增 RC；
- 原 `BOS-###` 不得新增 `BO-###`，终态项不得重开；任何续轮必须同时推进其所属 BO，并满足下节的线程级严格递减；
- 新发现、确实可能改变裁定但无法映射既有 BO 的内容，不在当前收敛域创建新线程。Speaker 以 `PARK_OUT_OF_SCOPE` 标记为“超出当前 BOS”并把最小指针交给 `Chief Judge`；Chief 只能按现有记录裁定、终止/拆案、另立 case，或明示重框；
- 明示重框只可由 `Chief Judge` 的 standalone `REFRAME_RULING`，或在 `SCOPE_RULING / TRACK_RULING / RECLASSIFY` 中内嵌同一组 `ATOMIC_REFRAME` 字段完成；同一条裁定原子激活新边界与 successor BOS，不允许前向引用另一条尚未生效的 R。须写明 predecessor/successor BOS、触发原因、每个旧 BO 及其冻结退出条件/RC 的 lineage、继承 SI、effective DES、sampling scope、首批消耗状态与 active revision cycle。同一争点中，旧终态 BO 必须以同一状态继承，不能换编号重开；旧 OPEN 条件 atom 只能继承、合并或转为终态，successor 的 OPEN BO 数与 OPEN condition/RC atom 总数都不得增加，也不得产生新 RC。无法在不增加 rank 的条件下容纳的新 blocker 只能拆案或另立 case。

阶段收敛 rank 定义为：有冻结 RC 的 BO 计其全部 `OPEN RC`；没有 RC 的直接 Q/AC/风险/覆盖 BO，则把该 BO 自身的冻结退出条件计作一个 atom。全案 rank 是所有开放 atom 的总数。一个 `RETURN_FOR_REVISION` 或 `REAUTHORIZE_REVISION` 只开启一个由该 R 标识的有限返修周期：方案/artifact 更新与 successor DES 可暂时保持等 rank，但必须标记 `PENDING_VERIFICATION`，且下一步只允许完成已授权核验、送裁定、回滚、终止、拆案，或继承 active cycle 的重分类/合规重框。在当前 atom lineage 上再次授权返修之前，本周期必须使 rank 严格减少——要么使一个 direct BO 进入终态，要么永久关闭至少一个 linked RC。重分类与重框都必须把 active cycle 原样传下去，换 Track 或 BOS 编号不能解除本门禁。若核验后仍未减少，Chief 不得再次 RETURN，只能按当前记录裁定或选择上述终止路径。只移动文字、换证据位置或新建编号都不算进展。

依赖某个 `DU-###` 才能判定的 BO 在相应 CR 或证据方向完成前保持 `OPEN`，状态理由写 `AWAITING_EVIDENCE`，不得先标为满足或稳定分歧。CR 支持其退出条件后可转为 `SATISFIED`；CR 未验证、相矛盾或仍未覆盖时保持 OPEN，可随 SUMMARY 送裁定并成为 `RETURN_FOR_REVISION` 的合法目标；最终实体裁定也可明示 `WAIVED_BY_RULING`。当剩余 OPEN 项全部只是在等证据，且当前没有获准的 agent 增量时，流程直接进入证据抽查，不要求先把它们伪装成终态。

验收返修适用同一周期门：新 AT 与 successor DES 可作为一次 `PENDING_VERIFICATION` 等-rank 中间态，但在再次授权返修前必须降低 rank，且不得使终态 BO 回退。新 revision 若让已满足的 AC 回归失败，该 attempt 不得重开旧 BO 或获得自动再返修；`Chief Judge` 只能要求回滚，或明示终止、拆案/另立 case。`REFRAME_RULING` 也不得把该 regression 伪装成新的 OPEN BO。

## 四、续轮条件

庭审不设固定轮数。每项 `OBJECTION` 被接纳时，提出者必须列出有限、可判定的 **解决条件**，该 RC 集随异议一并冻结；每个线程必须同时满足以下两条才可继续：

1. 仍有一个状态为 `OPEN_MATERIAL` 的实质异议；
2. 自该线程上一次审查后，出现了 `ADMIT_MATERIAL` 的新证据，或方案发生了会影响该异议的实质变化；并且该增量永久关闭或推翻冻结 RC 集中至少一个仍开放条件，使 `OPEN RC` 数严格减少。

冻结 RC 集不得在原线程新增条件，已关闭条件也不得重开。冻结 BOS 之后，不再创建 material `QUESTION` 或讨论型 `OBJECTION`；能处理既有开放 BO 的内容只作为该线程的回答、证据、主张或修正，不能获得一组新的 RC。无法映射的独立忧虑按上一节交 `Chief Judge` 处理。推翻旧关闭状态的新证据也不修改旧线程或重开 BO。把同一条件换一种说法、连续尝试但未关闭任何条件的方案改动、范围扩大、重复引用、同结论背景及新文件位置，都不构成旧线程的实质增量。

当线程已经真实满足、撤回或接受为不可再处理的稳定分歧时，Speaker 才把它记为相应终态。若仍有 OPEN atom、只是当前没有 agent 获准执行下一增量，则保持 `OPEN_MATERIAL`，在理由中标记 **暂停送裁定**，随 SUMMARY 交 `Chief Judge`；不得为了送裁定提前终态化。`RETURN_FOR_REVISION` 只恢复这种非终态线程或 direct BO，并点名一个完成后必须被关闭的冻结 atom，不能授权开放式“继续优化”。

冻结后新进入的 `E-####` 或 successor `DES-###/DU-###` 仍可依第五条被质疑，但只形成 `EVIDENCE_FLAG`：必须映射既有开放 BO 和具体决策链接，不创建异议线程、RC 或 BO，不改变 rank，也不自动触发核验。每个 `(证据 target, 理由, 决策链接)` 只创建一个 flag；重复提交走 `MERGE_DUPLICATE` 指向原 `S-####`，不创建第二个 flag。flag 初始为 `OPEN`；只有点名它的 `Chief Judge` 证据方向/实体裁定，或原提交者的 `WITHDRAWAL`，可以使它 `CLOSED`。Speaker 只依这些编号依据追加状态事件，并随 SUMMARY 呈现仍 OPEN 的 flag，不持有关闭裁量权。

对方案的认可按 **方案快照与受影响块** 生效。方案修改后，仅原认可范围被该修改直接影响的 owner 需要重新审查；未受影响部分的认可继续有效，不得从头重审整份方案。

## 五、决策证据集与默认 16% 抽查

`Speaker of the House` 在提交裁定前，从 `ADMIT_MATERIAL` 的证据中建立 **最小、去重的决策证据集**。抽样按单一事实与决策链接组成的 `DU-###` 计数，不按消息或整份证据计数。一项单元满足以下任一条件才可进入：

> 它属于至少一个能够区分仍可行选择的最小充分理由；或它会改变 track、风险、方案内容、owner 分工、验收标准、失败原因或补救范围。

不满足者移为背景或范围外材料。支持同一决策事实的重复证据须合并；只有独立来源会改变置信判断时，佐证才保留为独立单元。候选单元必须完整分区为 **最终抽样总体、合并来源、排除单元**，`N` 只计算最终抽样总体。细则见[证据规则](evidence-rules.md#四决策事实单元与最小集合)。

设冻结后的最终 `DU-###` 总体数量为 `N`，首批抽查数 `k` 为：

```text
N = 0  → k = 0
N > 0  → k = ceil(N × 0.16)
```

每个 `N > 0` manifest 冻结后，由 runtime 生成并追加第一条有效随机 seed。若最终总体的每个 DU 均以自身未变化的 `verification_key` 标记为 `CHECKED_INHERITED`，初始抽样处置写 `INHERITED_ONLY`：不重复核验、不创建 Examiner/CR，引用既有逐项 CR 历史后直接等待裁定。否则，仅当该 DES 仍有 `ELIGIBLE` 首批资格且至少一个 `RANDOM_ELIGIBLE` 未查 DU 时，`Evidence Examiner` 才依[固定哈希排序算法](evidence-rules.md#五16-可复现随机抽查)自动无放回抽取 `min(k, RANDOM_ELIGIBLE 未查数)` 个 DU；`k = ceil(N × 0.16)` 是本批上限，继承核验覆盖计入累计已查但不重复入样。无自动批次的其他非空集合写 `AWAITING_CHIEF_DIRECTION`。`INELIGIBLE_INHERITED` 只保存 seed，等待 `Chief Judge` 的续批授权。拆分消息不得放大 `N`，打包不同事实也不得缩小 `N`。

每个 `sampling_scope_id` 的首批抽查是唯一自动核验批次：action 获准前的 motion/proposal/combined/debate 阶段使用当前 `SI-###`；实体裁定一旦批准 action 并分配 `AS-###`，从 implementation 起的 implementation、全部 AT、acceptance SI 与复议共同使用该 AS。只有实际生成 `FIRST_RANDOM_16` 的 CR 才消耗资格。`EMPTY / INHERITED_ONLY` 都写 `CR = NOT_APPLICABLE`，不创建 Examiner，也不消耗尚未使用的资格；同一 scope 的 successor 首次出现 `RANDOM_ELIGIBLE` 未查 DU 时仍可使用首批资格。一旦资格消耗，任何 successor DES、AT 或 SI 都不得重置。`Evidence Examiner` 只检查抽中单元的真实性、来源可靠性及相关性，不得顺带核验未抽中证据、创建 side case、召集新角色或展开邻接调查。

## 六、置信度报告与续查权

抽查完成后，`Evidence Examiner` 提交一份批次级置信度报告，至少包含：

- 决策证据集编号与摘要哈希
- `N`、`k`、实际抽查比例、seed 与抽中编号
- 已验证、未验证、相矛盾的数量及逐项引用
- 已覆盖与未覆盖的待裁问题
- 未抽中的单一来源关键主张
- `HIGH / MEDIUM / LOW` 置信等级及其限制

置信等级是对当前案卷可靠性的审计判断，不得表述为统计学概率。

报告归档后，自动核验立即停止。只有 `Chief Judge` 可以明示选择：

- `RULE_NOW`：按当前记录裁定；
- `NEXT_RANDOM_16`：从当前 effective DES 的合格未抽中部分再抽一个不超过该 DES 所记 `k` 的无放回随机批次；替换失败单元的证据不进入随机续批；
- `TARGETED_CHECK`：点名具体 `DU-###`、核验理由及决策影响；
- `RETURN_FOR_REVISION`：要求主 owner 修改方案或补强指定主张；
- `RECLASSIFY`：改变 track；Full 中不适用向上升级。

只有 `NEXT_RANDOM_16` 与 `TARGETED_CHECK` 产生新置信度报告；返修与重分类不产生虚假批次。每次续查授权必须写明范围与停止条件。任何 agent、`Speaker of the House`、`Evidence Examiner` 或 `Procedural Judge` 均不得自动发起下一批核验。未抽中的证据不因缺少逐条结论而阻止闭庭；其风险由置信度报告显式呈给 `Chief Judge`。

## 七、参与名单授权

每个 case 唯一的 `Speaker of the House` 在 roster 获批前仅有 **intake 例外权**：可读取提出者给出的目标与边界声明，并生成候选名单；不得接受实体发言、选择证据或启动调查。`Speaker of the House` 可依据所有权边界提出初始候选名单；`Chief Judge` 在立案记录或 Fast Track intake 中一并批准即可，不要求另作一次程序裁定。立案后的参与变更请求必须逐项写明：

- 请求动作 (`ADD / REMOVE / CHANGE_SCOPE / CHANGE_DELIVERY / WAIVE_DELIVERY`)；
- 目标 agent/role instance、角色与原批准来源（如有）；
- 受影响的具体待裁问题、方案块或交付；
- 请求理由、变更后的建议访问范围及其决策影响；
- `ADD` 另须说明现有参与者无法提供的独有信息，以及缺席会改变什么抉择。

参与变更请求先经过相关性门，再交 `Chief Judge` 明示批准或拒绝。未获批准的新增者不得进入主记录、取得必到义务或造成闭庭阻塞；未获批准的移除/变更也不改变当前 roster。仅在证据中提到某文件、模块、知识库或外部系统，不构成增员理由。

初始名单中应一次列明预期使用的程序角色。后续增加 `Evidence Examiner` 并行 instance 或任何其他 role instance，同样属于增员，必须取得 `Chief Judge` 批准。

`RP-###` 是未获准 agent 唯一可用的非发言 intake 入口；使用它不取得案卷访问权，也不分配 `S-####`。同一 `(agent instance, 请求动作, target)` 同时只能有一项开放请求；重复请求直接合并。拒绝裁定必须记录可判定的 `rejection_predicate`。被拒请求保持关闭；只有后续已编号的 `ADMIT_MATERIAL`、`SCOPE_RULING` 或 `PARTICIPATION_RULING` 明确影响同一 target，或直接改变 predicate 点名的覆盖 agent/role，且会推翻该 predicate 时，才可用新的 `RP-###` 重提。新请求必须同时引用旧 RP、拒绝裁定和该状态变化；全案其他位置的无关变化不得复活请求。未获准者提供的新 source pointer 只进 parking lot；须由已批准角色在主流程中采纳并满足上述因果条件后，才可能成为重提依据。
