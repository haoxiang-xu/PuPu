# Full（众议庭）

[Quorum 索引](../README.md) · [Case Lifecycle](README.md) · [讨论模型](discussion-model.md)

众议庭是同一议案或方案在多数合作 owner 对整体产出形成不可合并的实质反对后，经程序投票开启的全面审理模式。它不是预先分档，也不把议案和方案串成两个阶段。

## 与辩论庭的边界

- 辩论庭以主 owner 的当前回答或集成方案为基线，只审一个或若干可聚焦的异议组；无争议部分继续有效。
- 众议庭允许重新检查整个讨论对象及相互依赖的部分，不再假定主 owner 的整体集成可靠；全部合格合作 owner 都必须在获准且能够负责的范围表态，覆盖缺口必须显式保留。
- 议案众议庭仍只裁定判断问题；方案众议庭仍只裁定如何实施。众议庭不得让议案自动进入方案，也不得把方案改写成议案。

## 开庭前提

只有 [讨论模型](discussion-model.md#从辩论庭升级到-full众议庭) 规定的异议门槛、分组记录与程序投票全部成立，`procedure_mode` 才能从 `debate` 更新为 `full`。不可逆、契约变化、金钱、发布或 owner 数量都不是独立触发条件；这些风险必须进入当前讨论对象与最终裁定，但不能绕过投票门槛制造众议庭。

## 流程

1. **冻结审理对象**：沿用当前 `discussion_type`、目标、范围、主 owner、回答/方案快照及全部庭前记录；Full 投票与计票必须在首个实体 hearing `NOTICE: OPEN` 及 hearing SI 创建前完成。众议庭开庭后才创建本 case 的第一份 hearing SI，并在首次全面审查后冻结第一份 hearing BOS。若 collaboration 中已经有 Chief 启动的 evidence SI/DES，则 hearing SI 作为 successor 继承其证据历史，但不存在 predecessor BOS；该既有 evidence SI/DES 不会提前关闭 Full 窗口。升级不得重置编号或庭前已处置异议。
2. **全体立场与只读范围**：Full opening 创建不可变 `FS-###` scope overlay，引用原 electorate `RS-###`、冻结 artifact、逐人新增只读范围、直接依赖、拒绝的敏感引用、截止点与 content hash；它不改变 N。Full 自动向 electorate 授予该范围，写入、相邻调查和敏感材料不随之扩张。主 owner 延续其对基线的 `AGREE`，不得改为对自身快照 `OBJECT`；若不再支持，只能主动修订、撤回或请求转移。转移只可给当前冻结 electorate 内已有 owner：successor RS/FS 保持完全相同的成员与 N，旧 lead 以 `FROZEN_FULL_ELECTORATE` 留在原 slot，新 lead 的原 voter slot 改为 lead slot，不得增删 electorate；无人可在此边界承接时只能送 Chief 终止或重框。其他 electorate owner 对自身能够负责的部分登记 `AGREE / OBJECT / ABSTAIN`；沿用立场可引用，对新增直接依赖的补充立场必须同时引用 RS 与 FS。BOS 前 artifact 变化需要 `FS-###` successor 并只重审受影响 scope；BOS 后不得扩大 overlay。
3. **全面修正**：参与者可支持基线或提出带稳定 `S-####` target 的修改请求；只有对目标块负有 owner 责任的参与者可以提交该块的替代文本，其他参与者只能说明目标、理由和请求的变化。整体替代只能由主 owner 把各 owner 已提交或确认的块集成为单一 successor MS/PS。所有修正必须保持同一冻结核心问题、目标结果和 non-goals，并留在同一 MS/PS lineage；不得代写其他 owner 内容、建立未定义的并行 candidate，或用近似副本制造虚假选择。
4. **首次全面审查**：Speaker 对全部 material 异议去重，冻结有限 BOS 与每项异议的解决条件。多数本身不是证据，也不决定实体结果。
5. **对抗回应**：各方只围绕冻结争点提交回答、证据、主张或修正。只有新证据或对象变化永久关闭至少一个开放条件时才续轮。
6. **证据抽查**：Speaker 冻结最小决策证据集；适用时由 `Evidence Examiner` 执行一次 16% 随机抽查。是否续查仍专属于 `Chief Judge`。
7. **送裁定**：Speaker 只把主 owner 已集成、完成适用 review 的单一 ruling-ready MS/PS 作为可裁对象，并汇总每项未决修改请求、支持/反对/弃权分布、共同与独立异议、覆盖缺口、风险、证据状态和未关闭条件。未集成 AM 只能列为未决请求，不能与基线拼接成可批准对象。
8. **单一实体裁定**：`Chief Judge` 按讨论类别作 `MOTION_RULING` 或 `PLAN_RULING`。裁定须回应全部未关闭 material 异议，但不受多数票约束；此前的 Full 投票只授权全面程序。

众议庭不会为替代内容重新预测 roster。若某项修正需要尚未覆盖的新 owner 边界、写入权限或敏感材料，它在当前 hearing 中不是完整可裁方案；应拆为同类 extension/side case，或由 Chief 依范围规则另立、拆案或重框。它不能在 FV 后临时增加 voter，也不能绕过有限 handoff。

议案裁定后关闭该议案。独立 action 方案获准后进入实施与验收；`relation: extension` 的组件方案获准后关闭并返回 parent，不自行授权 action。方案被驳回后关闭，除非裁定明确授权一个受限返修 visit。众议庭本身不产生独立实体裁定类型。
