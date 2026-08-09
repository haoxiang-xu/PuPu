# 参与名单与传唤机制

[Quorum 索引](../README.md) · [Case Lifecycle](README.md) · [共通收敛规则](decision-controls.md)

所有权边界用于 **发现候选参与者**，不再自动生成或扩张必到名单。每个 case 的初始 agent 名单及其后任何增员，均由 `Chief Judge` 明示批准。

## 第一层 · 初始候选名单

每个 owner 与 `Expert` 在角色定义中声明可机器判定的边界：

| 角色 | 边界形式 |
|---|---|
| `Code Owner` | 文件路径 glob |
| `Knowledge Owner` | 知识库路径 |
| `Codex` | 知识库路径（恒为 `.claude/codex/**`） |
| `Task Owner` | task 名称 |
| `POV Owner` | 触发条件 |
| `Expert` | 专业触发条件 |
| `Dimension Owner` | 评估对象与方向 |

`Speaker of the House` 只对开庭时冻结的 **待裁问题、`write_set`、`contract_set` 与验收责任** 做边界匹配，形成候选名单及每名候选人的具体交付。它不得扫描背景材料或 `non_goals` 来扩张名单。

`Chief Judge` 审核候选名单后，在 `case.md` 的 intake 块批准 **初始参与名单**。未在该名单中的 agent 不承担旁听、首轮提交或闭庭义务。程序角色按预计需要列入：`Speaker of the House`、实施后使用的 `Acceptance Inspector`，以及 Full 所需的其他程序角色。提出材料已明显包含候选决策证据时，可在初始名单中预先批准一名 `Evidence Examiner`；否则待 Speaker 冻结出 `FIRST_RANDOM_REQUIRED` 的 DES 后再逐项申请，`EMPTY / INHERITED_ONLY` 不创建 Examiner。后续增加同角色 instance 仍视为增员。

`Dimension Owner` 不再因一个评估对象命中而全体自动到场。`Speaker of the House` 只能提名其测量方向可能改变某个具体待裁问题的维度，由 `Chief Judge` 逐一批准。

## 第二层 · 自请与推荐

case 可发布不含受限案卷内容的结构化 brief，包括目标、待裁问题、`write_set`、`contract_set`、`non_goals` 与当前方案摘要。任何 agent 可通过非发言 intake 入口提出自请或推荐他人出庭，但请求必须说明：

1. 拟新增的 agent 或 role instance；
2. 它要回答的具体 `Q-###`、方案块或验收标准；
3. 现有参与者不能提供的独有信息；
4. 缺席会改变什么抉择。

`Speaker of the House` 先执行相关性门。通过者以 `RP-###` 成为待批准候选，须提交 `Chief Judge`；未获明示批准前不得进入主记录、扩大 quorum 或触发新一轮。`Chief Judge` 可批准或拒绝请求；需要豁免既有交付时使用 `WAIVE_DELIVERY` 动作，并决定该请求是否 blocking。批准 A 不代表同时批准 B 或 C。

同一 `(agent instance, 请求动作, target)` 同时只能有一项开放 `RP-###`。重复请求合并至既有编号；被拒请求保持关闭，拒绝裁定必须保存可判定的 `rejection_predicate`。只有后续已编号的 `ADMIT_MATERIAL`、`SCOPE_RULING` 或 `PARTICIPATION_RULING` 明确影响同一 target，或直接改变 predicate 点名的覆盖 agent/role，且会推翻该 predicate 时，才可创建新的 RP 重提；新请求同时引用旧 RP、拒绝裁定与该状态变化。与原请求无关的案卷变化不能复活它。未获准者的新 source pointer 只进 parking lot；须由已批准角色采纳并满足上述因果条件后，才可能成为重提依据。

## 第三层 · 直接影响复核

提交裁定前，`Speaker of the House` 只对最终候选方案的以下集合做一次复核：

- 将被直接写入的对象；
- 将被改变的契约；
- 直接承担验收或回滚责任的对象。

若其中存在未覆盖 owner，且对象已位于获准的 `write_set / contract_set` 内，`Speaker of the House` 提交增员请求或覆盖缺口，但不得自动传唤。范围尚未获准时先等待 `SCOPE_RULING`，不能靠增员反向扩张范围。`Chief Judge` 批准后方可增员；拒绝或暂不批准时，缺口连同影响进入闭庭摘要，由现有记录支撑裁定，不自动阻止闭庭。

证据、发言或被拒方案中 **顺带出现** 的文件、模块、知识库、外部系统、竞品或历史实现，不进入本层集合，也不产生 owner 到场义务。

## 边界纠错

第二层或第三层发现的边界遗漏，在当前 case 中只记为范围外维护项。边界是否需要修订由 `Chief Judge` 在当前 case 结束后另行决定；不得为了“边界自愈”扩张当前庭审或延迟闭庭。

## `Witness` 传唤

`Witness` 是 human 角色，不属于 agent 增员，但仍只在以下条件全部满足时由 `Speaker of the House` 发出传票：

1. **问题具体**：一张传票只含一个可直接回答的事实问题；
2. **影响明确**：答案会改变一个具体待裁问题、方案选择或验收标准；
3. **已尽可查来源**：已检查与问题相关的 repository、archive、外部来源及当前参与者；
4. **本人特有理由**：有理由相信事实来自本人的经历、意图、口头约定或未记录上下文。

每张传票记录问题、受影响事项、已查来源、本人知情理由与 `blocking / non-blocking`：

- **blocking**：缺少答案会让当前仍可行的方案无法区分，或只能依靠未经说明的假设裁定；
- **non-blocking**：缺少答案不阻止当前阶段形成有效产出。

blocking 传票必须在首次审查截止前签发，并在 BOS 冻结时映射到一个 BO；冻结后不得新增 blocking 传票。已有传票的 `UNKNOWN / UNCERTAIN` 回答视为完成，不得针对同一 BO 换问题继续保持 blocking。后续线索只可作为 non-blocking parking 项，或交 `Chief Judge` 重框/拆案。

对 blocking 性质存在争议时，由 `Procedural Judge` 依授权裁定。回答“不知道”或“不确定”视为已经回应，blocking 随即解除；事实缺口及影响继续进入摘要。证言如成为决策关键证据，依[证据规则](evidence-rules.md)进入冻结集合与 16% 抽样，不自动逐条核验。
