---
name: case
description: Run PuPu's Quorum case procedure when a request needs a binding judgment, an executable plan, authorization for a real action, a change to agents/skills/codex rules, or implementation acceptance. Use for creating or advancing motion and proposal cases, routing owner handoffs, handling objections, Debate or Full proceedings, evidence control, rulings, revisions, acceptance, and closure. Do not use for pure questions, status reads, or read-only diagnosis that creates no binding or persistent result.
---

# Case 立案与推进

作为 `chief-judge`（CEO 本人）的书记员执行本流程。不要替 Chief 作实体裁定，不要替 Speaker 作程序判断，不要替 owner 撰写其边界内的内容。

把本文件当作操作顺序，把下列法典当作字段和权限的唯一来源：

- [讨论类别、单主 owner 与升级门槛](../../codex/lifecycle/discussion-model.md)
- [交棒、参与和合作 owner](../../codex/lifecycle/summons.md)
- [审查、异议、投票、证据和结案控制](../../codex/lifecycle/decision-controls.md)
- [证据控制](../../codex/lifecycle/evidence-rules.md)
- [辩论庭](../../codex/lifecycle/debate-court.md)
- [Full（众议庭）](../../codex/lifecycle/full-court.md)
- [案卷格式](../../codex/court-records/case-format.md)
- [固定记录模板](../../codex/court-records/templates.md)

## 1. 先过不立案门

直接处理以下请求，不创建 case、参与名单、SI、BOS 或 DES：

- 咨询、解释和状态查询；
- 只读代码检查、调查和诊断；
- 不要求绑定判断、不授权真实 action、也不产生持久或外部结果的分析。

需要绑定判断时创建议案；需要规定并授权具体做法时创建方案。若目标结果与 `non_goals` 尚不能固定，先补齐 framing，不要用更重程序代替问题定义。

## 2. 选择讨论类别，不选择程序档位

只允许两个 `discussion_type`：

- `motion`：讨论一个问题是否成立、是否合规或是否有影响；产出 `MS-###`，最终由 `MOTION_RULING` 判断，不授权真实 action。
- `proposal`：讨论具体怎么做；产出 `PS-###`，只有获准的 `PLAN_RULING` 才能授权真实 action。

两者彼此独立，不是前后阶段。议案结论需要实施时另建一个 proposal case；方案需要独立判断时可另建 motion case并引用它。

每个新 case 必须从 `procedure_mode: collaboration` 开始。不得在立案时预选辩论庭或众议庭，也不得因风险、不可逆、契约变化、owner 数量或“重要”而自动升级。

## 3. 原子建案并只选一个主 owner

按 [编号规则](../../codex/court-records/identifiers.md) 原子分配 `M-*` 或 `P-*` 编号，依据模板建立 `.claude/court/cases/<case-id>/`。至少冻结：

- 目标结果、`non_goals`、初始已知范围；
- `discussion_type` 与 `procedure_mode: collaboration`；
- proposal 的初始 `write_set / contract_set`、回滚和验收责任；
- 唯一 `lead_owner`、选择依据和不确定性；
- 当前 `MS-###` 或 `PS-###` 引用；
- 默认 `stage_instance_id: null`，BOS/DES/CR 为 `NOT_APPLICABLE`。

让 Speaker 只选择与核心问题最接近的一位 owner：motion 选主要回答者，proposal 选主要实施结果的集成责任者。不要扫描并预召集潜在团队。

只有当材料中已有具体路径且机械边界匹配能帮助选择当前这一位 owner 时，才可运行：

```bash
python3 .claude/skills/case/summon.py lead <motion|proposal> <framing-file> [...]
```

工具只提供一个当前路由建议或明确的并列不确定性；Speaker 仍须记录最终选择。语义型 Task/Knowledge/Expert 判断必须回到 charter，不得把工具输出变成名单。

## 4. 主 owner 先写，边界外留空

要求主 owner 在自己的所有权边界内完成初始回答或方案骨架。遇到边界外的必要内容时：

1. 保留明确空白，不猜测、不代写；
2. 写明 target、所需 boundary、单一交付、缺席会改变什么、最小读取范围和返回对象；
3. 由 Speaker 校验后创建一个带 `expires at` 的 `HS-###`；
4. 同一 case 同时只允许一个开放 HS；
5. 接棒 owner 只提交指定回答/方案块和必要异议，然后返回主 owner或请求下一次串行交棒。

需要辅助验证一个已经明确的空白时运行：

```bash
python3 .claude/skills/case/summon.py handoff <current-owner> <handoff-request-file> [...]
```

普通 owner 交棒不需要 `PARTICIPATION_RULING`，但只授予 HS 中列明的有限读取和一次交付。全案访问、持续 Expert、额外 Examiner、敏感材料或扩大权限仍须 `RP-###` 及 Chief 逐项批准。

`HS-###` 只允许 `OPEN / RETURNED / DECLINED / EXPIRED / CANCELLED`。逾期追加一次 `NOTICE: HANDOFF_EXPIRED`，不要无限等待。只有 RETURNED 的 material HS owner 才能进入合作 owner 集合。

## 5. 集成并冻结一次审查

关闭所有必要交棒后，让主 owner 集成唯一当前 `MS-###` 或 `PS-###`，再冻结 `RS-###`。RS 的 electorate 只包含：

- 主 owner；
- 在冻结前 RETURNED material HS，并对具体回答、实施、回滚或验收承担直接责任的 owner。

同一底层 agent 只计一次。Expert、Witness、程序角色、只提交观点/证据/异议者和未完成 HS 的 owner 不进入 `N`。

让每位非 lead 合作 owner只在自己的块及直接依赖范围登记 `AGREE / OBJECT / ABSTAIN`。主 owner发布快照即把它确认为基线并计入 `N`，不得对自己的快照 `OBJECT`；不再支持时必须修订、撤回或请求 lead transfer。

有限 objection intake 与 RS 使用同一截止点。具有实体提交资格的 agent 可提交指向具体快照/块、决策影响、请求修改和最小依据的 objection；通过相关性门后成为该争点原告，但不因此进入 `N` 或取得全案权限。

## 6. 先处置异议，再决定是否开庭

要求主 owner逐项归档 `LEAD_DISPOSITION`：

- `ACCEPT / PARTIAL_ACCEPT` 且产出改变：回主 owner 集成 successor artifact，冻结 successor RS，只重审受影响范围；
- `REJECT`：保留 material objection，进入辩论庭庭前分组；
- 异议撤回、被满足或失效：追加对应终态记录，不把它继续计入升级门槛。

交棒期间可以保存待审异议，但必须等必要空白关闭、完整集成快照与 RS 冻结后，主 owner 的拒绝才可触发程序升级。

一个仍有效且被拒的 material objection 足以进入 `procedure_mode: debate` 的庭前分组。此时先建立 `OG-###`，不要立即创建 hearing SI/BOS/DES。

把目标相同、依据相同、请求修改兼容或可由同一组有限解决条件处置的异议合并进一次聚焦辩论。人数多不构成众议庭理由。

## 7. 严格计算众议庭门槛

只对当前冻结 RS 计算：

- `N`：全部合格合作 owner，含主 owner；
- `D`：按 owner 去重、仍有效且被主 owner拒绝的 material objection owner；主 owner永不计入 D。

Speaker 只有在以下条件全部成立时才可决定发起 `FV-###`：

1. `D >= 3`；
2. `D > N / 2`；
3. 存在多个异议组，且它们确实不能由一次聚焦辩论或同一组有限解决条件共同处置；
4. 已冻结异议分组、不可合并理由、N、D 与投票人快照。

投票只允许 `REMAIN_IN_DEBATE / ENTER_FULL / ABSTAIN`。只有 `ENTER_FULL > N / 2` 才进入 `procedure_mode: full`；弃权、未投与平票不减少分母。Speaker 可以不发起投票；投票失败仍开辩论庭。投票只选择程序，不决定议案或方案结果。

首次实体 hearing `NOTICE: OPEN` 或 hearing SI 一旦创建，Full 投票窗口永久关闭。投票通过时直接开启众议庭并冻结 `FS-###`；否则按 OG 开启一个或多个聚焦辩论 visit。

## 8. 只在合法触发时启动正式控制

默认 collaboration 不创建空 SI、BOS、DES、Examiner 或 CR。正式证据控制、正式 debate/full hearing、实施、验收和复议才按法典建立对应 SI。

进入正式证据控制后，把会改变当前议案结论、方案、验收、回滚或裁定的事实主张去重成 `DU-###` 并冻结 `DES-###`：

- `EMPTY`：不创建 Examiner 或 CR；
- `INHERITED_ONLY`：不重复核验；
- 首批存在 `RANDOM_ELIGIBLE`：获准 Examiner 只执行一次 `FIRST_RANDOM_16`，上限 `ceil(N × 0.16)`；
- 其余非空集合：等待 Chief direction。

首批后停止自动核验。只有 Chief 可选择 `RULE_NOW / NEXT_RANDOM_16 / TARGETED_CHECK / RETURN_FOR_REVISION / RECLASSIFY`。不要用新 SI、AT 或返修重置 sampling scope。

正式庭审冻结 BOS/BO/RC 后，不得向本案新增争点或解决条件；新问题须重框、延伸或另立 side case。持续讨论必须严格降低开放 atom 的 rank，否则形成 SUMMARY 并把稳定分歧原样呈给 Chief。

## 9. 呈裁定并执行唯一获准结果

SUMMARY 必须列出仍有效异议、OPEN BO/RC、证据覆盖、未核验风险、候选内容和强制回应项，不伪造共识。

由 Chief 作实体裁定：

- `MOTION_RULING` 只关闭判断；若要实施，另建 proposal；
- `PLAN_RULING: APPROVED` 只有 `ruling_scope: ACTION` 才创建 `AS-###` 并授权实施；extension 的 `COMPONENT` ruling 只返回父方案，不单独授权 action；
- 实施 owner 只能在获准 PS、owner 责任、write/contract set、回滚和 AC 内行动；边界变化先停下并走新方案或法定返修路径。

任何关闭 hearing/case 或授权真实 action 的最终 R，只有 required thread dispositions 和 `NOTICE: CLOSURE_COMMIT` 完整归档后才生效。此前不得开始 action。

## 10. 验收、失败回应与返修

每个实施快照建立 `AT-###`，同一获准 action 共享一个 `AS-###` 及 sampling history。Inspector 只依据获准 PS 与 AC 验收，不从议案、旧指令或自行推断产生标准。

先完成 acceptance evidence gate，再为 FAILED AT 开启 `ACCEPTANCE_RESPONSE` 窗口：

- `ACCEPT_FAILURE` 或有效 timeout：进入无庭审 reconsideration；
- `DISPUTE_FAILURE`：等待 Chief 的 `ACCEPTANCE_RULING: FAILED_TO_HEARING` 后开启验收庭审；
- PASSED：等待 Chief acceptance ruling。

`RECONSIDERATION_RULING: REAUTHORIZE_REVISION` 只授权原 PS/AS 边界内的受限实现返修。若要改 PS、AC、owner 责任或授权边界，必须 `SPLIT` 出独立、blocking 的 proposal case；child 完成后仍由原 case 明示处置失败 AS。

## 11. 处理 2026-08-10 前的历史案

保持历史案号、字段、发言、证据和裁定 append-only，不改写成 M/P 新格式。

若旧案已有有效 action 授权且正在实施，只能在其已冻结的 directive/plan、owner、范围、回滚和 AC 内完成实施与验收。任何方案、AC、owner 或授权边界变化都必须停止旧路径并另建新的 `P-*` proposal。需要关闭、终止或衔接旧案时，由 Chief 明示一次 legacy bridge；不要产生新的旧式授权或扩展旧范围。

## 12. 结案纪律

- 只追加案卷记录，不改写已归档事件；
- 议案裁定与方案裁定各自结束本讨论对象，不自动转换类别；
- 长期法典、agent、skill、组织或 archive 的实际修改仍须获准 proposal；
- 主树不自行 commit，留给 `chief-judge` 复核与提交。

## 常见错误

- 为只读问题立案，或在 framing 不完整时选择更重程序；
- 立案时扫描并预召集完整团队；
- 一次打开多个 owner handoff；
- 由主 owner代写其他 owner 块；
- 把所有原告、Expert 或被点名 owner 都计入 N/D；
- 把相似异议拆开以制造众议庭门槛；
- 因风险、契约或不可逆性自动进入众议庭；
- 在默认 collaboration 创建空 BOS/DES 或自动 16% 抽查；
- 用议案裁定、验收失败或未完成 closure commit 授权真实 action。
