# 讨论模型与最小主 owner 原则

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

Quorum 不在 intake 时预测案件复杂度，也不预选程序强度。每个 case 只记录两个彼此独立的维度：

- `discussion_type`：当前讨论的对象是 **议案 (`motion`)** 还是 **方案 (`proposal`)**；
- `procedure_mode`：当前使用 **协作 (`collaboration`)**、**辩论庭 (`debate`)** 还是 **Full（众议庭，`full`）**。

`discussion_type` 回答“讨论什么”，`procedure_mode` 回答“分歧需要多强的程序”。二者不得混作生命周期阶段。case 创建时只确定讨论类别，程序模式一律从 `collaboration` 开始；不得在 intake 预选辩论庭或众议庭。

咨询、解释、状态查询与只读诊断若不要求形成可裁定结论、不授权真实 action、也不产生持久或外部影响，直接由责任 owner 回答，不创建 case。

## 议案与方案

### 议案 (`motion`)

议案讨论一个需要判断的问题，例如某功能是否需要重构、新代码是否符合安全标准、某变化是否会影响其他功能。议案产出带依据和适用边界的 **判断结论**，不负责规定具体如何实施。

主 owner 先提交回答；其他合作 owner 只在各自获准块及其直接依赖范围内，对当前回答快照登记：

- `AGREE`：同意；
- `OBJECT`：提出指向具体结论或依据、并说明决策影响的实质异议；
- `ABSTAIN`：信息不足、不具备判断责任，或选择不作实体判断。

议案裁定后即结束本议案。若结论表明需要实施，应另行创建 `discussion_type: proposal` 的方案 case；它可以引用议案，但不是议案的下一阶段。

### 方案 (`proposal`)

方案讨论具体怎么做，产出实施范围、步骤、owner 分工、风险、回滚或补救方式及可验收标准。任何产生真实影响的 action 仍须依据经 `Chief Judge` 裁定通过的方案。

主 owner 先完成自己所有权边界内的内容。对不能负责的部分，必须保留明确空白，不得猜测或代写；每个空白须写明目标 owner 边界、请求补全的内容、所影响的决定、依赖关系及完成后返回对象。其他 owner 只补全自己的部分，最终由主 owner 集成。

## 最小主 owner 原则

每个议案或方案开始时，`Speaker of the House` 只路由给 **一个** 主 owner，即使当前材料暗示可能涉及更多边界。该原则是一种有意的最小估计：未知复杂度必须由真实的知识缺口、方案空白或实质异议揭示，而不是由 Speaker 在信息最少时预测。

- 议案优先选择最有能力回答核心问题的 owner；
- 方案优先选择对主要实施结果负责的 owner；
- 无法精确确定时，Speaker 选择与核心问题最接近的一个 owner，并记录选择依据与不确定性；
- 所有权匹配只用于选择当前这一位 owner，不生成潜在 roster；
- Speaker 不得以“可能相关”为由预先召集其他 owner、Expert、Witness 或程序角色。

主 owner 始终承担最终集成责任。若它确实无法继续，可说明原因并请求一次主 owner 转移；Speaker 记录转移及未完成义务，不能用转移清除既有异议、证据或收敛历史。若转移发生在 RS 冻结后，当前 review 立即关闭；新主 owner 集成 successor artifact 并冻结 successor RS。仍有链接的异议逐项 retarget，但旧主 owner 的处置失效，必须由新主 owner重新处置后才可能计入 D。在 Full opening 以前，旧主 owner 只有另行满足普通合作 owner 条件时才留在新 N，不能因历史 lead 身份自动占票。Full opening 以后 electorate 已冻结：转移只可给该 electorate 内已有 owner，successor RS/FS 必须保留完全相同的成员与 N，旧 lead 以 `FROZEN_FULL_ELECTORATE` 留在其原 slot，新 lead 只把原 voter slot 换成 lead slot，不得新增、移除或重复计票；没有合格的 electorate owner 可承接时，当前 Full 必须由 Chief 终止或重框为新 case，不能在原案换入外部 lead。

## 串行交棒

默认协作一次只保留一个开放的 owner 交棒：

1. 主 owner 提交初始回答或方案骨架；
2. 发现自己边界外的必要内容时，向 Speaker 提交有限交棒请求；
3. Speaker 校验目标、必要性与 ownership boundary 后，把该请求路由给下一位 owner；
4. 下一位 owner 只回答指定议案问题或补全指定方案块，也可登记待审异议；
5. 完成后返回主 owner，或在仍有必要空白时请求 Speaker 继续交给下一位 owner；
6. 所有必要交棒关闭后，主 owner 形成集成快照并启动一次合作 owner 审查；交棒期间的待审异议此时重定向到该快照；
7. 未受修改影响的 `AGREE` 持续有效，只重新审查被修改的块及其直接依赖。

Speaker 的交棒是本宪章直接授予的有限程序路由权，不需要为每位边界匹配 owner 另作参与裁定。交棒只授予请求中列明的读取范围和一次交付；不能据此取得全案访问权、引入其他 agent 或扩大讨论范围。

## 从协作升级到辩论庭

主 owner 可以接受异议并直接修订。交棒期间提出的异议可以促成提前修订，但在必要空白关闭、主 owner 发布完整集成快照并冻结 `RS-###` 前，不得触发开庭。只有同时满足以下条件时才进入辩论庭庭前分组：

1. 异议已指向当前回答/方案快照的具体结论、依据或方案块；
2. 异议说明若成立会改变什么；
3. 主 owner 明示拒绝该异议或其请求的修订。

任何具有实体提交资格的 agent 都可通过有限 objection intake 提交异议；通过相关性门后可作为该异议的原告。同一 case 的 Speaker、Procedural Judge 或 Evidence Examiner 底层 agent 不得换用任何实体/事实身份提交或起诉，Acceptance Inspector 仅可依职责作为验收原告。未参与协作的 agent 不因此自动成为合作 owner，也不进入众议庭人数计算。

有限 objection intake 与当前 `RS-###` review 使用同一截止点。截止后，Speaker 可以安全形成 SUMMARY；针对已冻结快照的新异议不得回填当前窗口。首个 hearing BOS 尚未冻结时，material 变化可在 `ORDINARY` successor RS 的受影响范围重新开放有限窗口；BOS 冻结后，`BOS_CHANGE_REVIEW` 只能判断变化是否满足既有 BO/RC，新忧虑只能重框、同类延伸或 side case。主 owner 发布当前快照即确认其为基线，不得对自己的快照提交 `OBJECT`；若不再支持，只能主动修订、撤回或请求转移主 owner。主 owner 仍留在 `N` 和 Full 程序票中，但永不计入 `D`。

一个异议足以开启辩论庭。多个异议若目标相同、依据相同、请求的修改兼容，或可由同一组有限解决条件共同处置，Speaker 必须将其合并为一次聚焦的辩论庭；人数多本身不构成升级众议庭的理由。

## 从辩论庭升级到 Full（众议庭）

Full 的正式中文名为 **众议庭**。众议庭不是 intake 类别，也不因不可逆、改变契约、owner 数量或“事情重要”而自动触发；它只处理多数合作 owner 已不再信任整体回答或集成方案、且聚焦辩论不足以承载分歧的情形。

Speaker 只能判断异议是否可以合并审理，不能判断异议是否成立。只有以下条件全部满足时，Speaker 才可发起 `ENTER_FULL` 程序投票：

1. 当前冻结的合格合作 owner 集合为 `N`；
2. 至少三名合作 owner 各自仍有效、未撤回、未因 successor artifact 失效的 material 异议已被主 owner 拒绝；
3. 按 owner 去重后的反对者数 `D` 严格大于 `N / 2`；
4. 这些异议不能合理归入一次聚焦辩论；若它们共同质疑整体集成，也仍须证明不能由同一组有限解决条件共同处置；
5. Speaker 归档异议分组、不能合并的理由、`N`、`D` 与合格投票人快照。

合格合作 owner 包括主 owner，以及在 `RS-###` 冻结前完成 material `HS-###` 的 owner。该 HS 可以补全回答/方案块，也可以确认当前快照中一项具体、真实的直接回答、实施、回滚或验收责任；仅在普通文字中点名或另写无 HS 的责任声明不计。程序角色、Expert、Witness、仅提交证据者与未完成交棒者不计。每个合格 owner instance 一票；同一底层 agent 即使同时持有多个 owner 身份，也只能在同一 electorate 出现一次。投票开始后名单冻结，不得临时增减以改变分母。

投票选项只允许 `REMAIN_IN_DEBATE / ENTER_FULL / ABSTAIN`。`ENTER_FULL` 获得全部 `N` 的严格过半数才升级；平票、未投票或弃权均不减少分母。投票只决定程序模式，不决定议案结论或方案结果。未通过时保留 `debate`，由 Speaker 按异议组安排一个或多个聚焦 visit。

主 owner 的拒绝使 case 进入 `debate` 的庭前分组状态，但尚不开庭、不创建 hearing SI/BOS/DES。Speaker 只能在该窗口决定是否发起 Full 投票：不发起或投票未通过时才正式开启辩论庭；投票通过时直接开启众议庭。首个实体 hearing `NOTICE: OPEN` 发布或 hearing SI 创建时，本 case 的 Full 投票窗口立即关闭；collaboration 中既有的 evidence SI/DES 不影响该窗口。不能靠 BOS 前后的返修、重开争点或 successor visit 再升级。程序模式只能按 `collaboration → debate → full` 升级，同一 case 不降级。新延伸 case 重新从 `collaboration` 开始。

## 同类延伸

议案可延伸议案，方案可延伸方案。延伸用于拆出同一讨论类别中具有独立 owner 或独立结论的必要子问题：

- 子议案产出判断并返回父议案；
- 子方案产出方案块并返回父方案，由父方案主 owner 集成；
- 每个延伸 case 仍只选择一个主 owner，并独立从协作模式开始；
- 是否 blocking 由它的结果是否为父 case 当前结论/方案的必要输入决定。

议案产生实施需求时创建的是一个新的方案 case，关系记为 `derived`，而不是同类延伸或自动阶段转换。方案中发现需要独立判断的问题时，也可另立议案并引用其结论，但不得把两种讨论强行合并成一个 case。
