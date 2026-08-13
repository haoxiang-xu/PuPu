# 协作与庭审发言协议

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

默认协作事件和正式庭审发言共用追加式 `record.md`，但只有进入辩论庭、众议庭或验收争议后才称为庭审。所有实体提交必须使用以下公共信封：

```markdown
## S-0001 | 2026-08-10T18:00:00-07:00
- **case**: M-0000-0001-2026-0810
- **discussion type**: motion
- **procedure mode**: collaboration
- **speaker**: knowledge-owner-example
- **type**: MOTION_ANSWER
- **target**: Q-001
- **basis**: E-0001
- **decision effect**: 决定 Q-001 的当前回答

<正文>
```

`case`、`discussion type`、`procedure mode`、`speaker`、`type`、`target`、`basis` 与 `decision effect` 均为必填。没有依据时写 `无`，不允许省略。引用必须使用稳定编号，不得写“上面”“最新版”或位置性描述。

## 发言类型

| type | 用途与必填语义 |
|---|---|
| `FRAMING` | Speaker 记录讨论类别、核心问题/目标、non-goals、主 owner 与最小选择依据 |
| `MOTION_ANSWER` | 议案主 owner 提交判断、依据、适用边界、未知项与回答快照 |
| `PROPOSAL` | 方案主 owner 登记完整方案正文、owned blocks、明确空白、风险、回滚及验收标准 |
| `HANDOFF_REQUEST` | 当前 owner 点名快照、空白、目标 owner 边界、期待交付、缺席影响和返回对象 |
| `HANDOFF` | Speaker 创建 `HS-###` 并授予目标 owner 有限范围与一次交付 |
| `HANDOFF_RETURN` | 目标 owner 返回回答或方案块、依据、剩余未知项与建议下一交棒 |
| `AGREE` | 合作 owner 对 `RS-###` 中的回答/方案快照及审查范围登记同意 |
| `ABSTAIN` | 登记弃权理由；弃权仍留在 electorate 分母 |
| `OBJECTION` | 记录 review stance `OBJECT` 或有限外部异议；点名快照与块、理由、决策影响及请求修改，正式庭审时另列有限 `RC-###` |
| `LEAD_DISPOSITION` | 主 owner 对异议登记 `ACCEPT / REJECT / PARTIAL_ACCEPT` 及理由 |
| `OBJECTION_GROUP` | Speaker 创建组内可合并的 `OG-###`，列出成员异议、共同 target/事实/补救与合并理由；组间不可合并性只写入 FV opening |
| `AMENDMENT` | 对议案回答或方案的明确块提出修改并保留 predecessor 与受影响依赖；只有该块 owner 可提交替代正文，其他参与者只提交 target 与 change request |
| `BALLOT` | 合格 owner 对 `FV-###` 投 `REMAIN_IN_DEBATE / ENTER_FULL / ABSTAIN` |
| `VOTE_TALLY` | Speaker 归档 electorate、逐票引用、N、各选项计数、门槛与程序结果 |
| `OBLIGATION_SET` | 首次陈述窗口后冻结 `BOS-###`、有限 BO、解决条件、baseline、SI 与 rank |
| `THREAD_STATUS` | 对既有 BO 追加状态、依据、已关闭/剩余条件与 rank 变化；不得新建 BO |
| `SUMMONS` | Speaker 传唤 Witness 回答单一事实缺口，记录最小访问、blocking 性质与停止条件 |
| `QUESTION` | 庭审中对开放 BO 提出有限问题；BOS 冻结后不得新建 material QUESTION |
| `ANSWER` | 回应明确 Q、BO、发言或传票，不得扩大问题 |
| `CLAIM` | 提交有依据、会改变当前抉择的主张 |
| `EVIDENCE` | 登记 `E-####` 与稳定切片；证据正文只在 `evidence.md` |
| `EVIDENCE_FLAG` | 正式证据控制中对 E/DU 的来源、真实性、相关性或矛盾作去重控制标记；不自行新建争点、BO 或触发核验 |
| `ACCEPTANCE_RESPONSE` | 方案主 owner 对失败 AT 登记 `ACCEPT_FAILURE / DISPUTE_FAILURE`；接受不等于取得返修授权 |
| `TESTIMONY` | Witness 回答单一传票，注明知道/不知道/不确定及知识来源 |
| `WITHDRAWAL` | 撤回既有提交；旧记录保留并追加失效状态 |
| `SCOPE_REQUEST` | 请求改变核心范围；普通 owner 空白补全使用 HANDOFF，不使用本类型 |
| `SUMMARY` | Speaker 忠实引用当前产出、立场、异议组、证据状态、BOS、风险和停止原因送裁定 |
| `NOTICE` | 开庭、休庭、恢复、关闭、交棒超时等程序通知 |

## 议案回答与方案正文

议案回答正文至少包含：

- 实际判断，不得只写 `APPROVED / REJECTED`；
- 判断依据及来源；
- 适用边界；
- 已知未知与置信限制；
- 需要其他 owner 回答的空白；
- 当前回答快照 `MS-###`。

方案正文至少包含：

- 目标结果与 non-goals；
- 主 owner 已负责的实施块；
- 边界外的 `SLOT-###` 空白及 handoff 指令；
- 关键步骤和依赖顺序；
- 风险、可逆性与回滚或补救方式；
- 带编号的 `AC-###` 验收标准；
- `boundary obligations / boundary N/A reason` 与适用的 `BC-###`；
- `state sequence obligations / state sequence N/A reason` 与适用的 `SEQ-###`；
- 当前方案快照 `PS-###`。

主 owner 不得为制造“完整方案”而代写其他 owner 的块。空白是合法中间状态，但存在必要空白的快照不能送最终裁定。

## 默认协作顺序

1. Speaker 提交 `FRAMING` 并只选择一个主 owner。
2. 主 owner 提交 `MOTION_ANSWER` 或 `PROPOSAL`。
3. 如有边界外空白，当前 owner 提交 `HANDOFF_REQUEST`；Speaker 校验后提交 `HANDOFF`。
4. 目标 owner 提交 `HANDOFF_RETURN`。一次只允许一个开放 HS；此时提出的异议写 `review snapshot: PENDING_RS` 与 `status: PENDING_REVIEW_TARGET`。
5. 全部必要内容返回后，主 owner 发布完整集成快照，Speaker 冻结带 predecessor、逐人 scope、lineage 和截止点的 `RS-###`，并用追加式 `NOTICE: OBJECTION_RETARGET` 把每项待审异议标为 `CONFIRMED / WITHDRAWN / RETURN_NO_LINK`。
6. 主 owner 以发布行为确认基线；其他合作 owner 在 owned block 与直接依赖范围登记 stance `AGREE / OBJECT / ABSTAIN`，其中 `OBJECT` 使用 `type: OBJECTION` 的事件；具实体提交资格的非合作 agent 可在同一截止前提交有限异议。
7. 主 owner 用 `LEAD_DISPOSITION` 处置每项异议。接受则修订并只复审受影响块；拒绝则进入辩论庭。
8. 无被拒异议时，Speaker 可直接提交 `SUMMARY`，不建立 BOS 或形式性 DES。

## 异议、原告与分组

任何具实体提交资格的 agent 可从有限 objection intake 提交 `OBJECTION`。Speaker 通过相关性门后，该 agent 取得此争点的原告资格和有限访问权；未通过时不得进入主记录。同一 case 的 Speaker、Procedural Judge 或 Evidence Examiner 底层 agent 不得换用任何实体或事实身份提交材料或起诉；Acceptance Inspector 仅能依职责作为验收原告。原告资格不等于合作 owner 身份。

Speaker 用 `OBJECTION_GROUP` 合并同一 target、依赖相同事实、请求相同或兼容修改、且可由同一有限裁定共同解决的异议。合并不得删除成员异议、独立理由或原告。

## Full（众议庭）程序票

review 与 lead disposition 窗口关闭后，Speaker 先追加 `NOTICE: FULL_VOTE_DECISION`，记录 `NOT_ELIGIBLE / ELIGIBLE_OPENED / ELIGIBLE_DECLINED` 及理由。只有 [门槛规则](decision-controls.md#五众议庭门槛与投票)满足且结果为 `ELIGIBLE_OPENED` 才能创建 `FV-###`。opening 必须列 `owner → rejected objection → OG` 的 D 映射、多个 OG 之间不能聚焦合并的理由、electorate hash 与截止点。每张 `BALLOT` 必须引用同一 `FV-###` 与 `RS-###`；每名 voter 第一张有效票为终局票。Speaker 的 `VOTE_TALLY` 必须逐票引用并展示：

- electorate `N`；
- 被拒异议 owner 数 `D`；
- 三个选项及 `NO_BALLOT` 的计数；
- `ENTER_FULL > N / 2` 是否成立；
- 计票时当前 D、异议有效性与组间不可合并性是否仍满足开票门槛；
- `REMAIN_IN_DEBATE / ENTER_FULL / CANCELLED_NO_RESULT` 的最终程序结果。

审查时的 `OBJECT` 不能自动转成 `ENTER_FULL` 票。缺票不减少 N，也不伪造成 ABSTAIN。material artifact/owner/lead 变化要求 successor RS 时，FV 以 `CANCELLED_NO_RESULT` 终结，旧 RS 不得开庭；先完成 successor RS、重分组并在窗口尚开时重新作开票决定。若同一 RS 未变化而门槛复验或票数失败，仍有被拒异议则直接开 debate hearing，全部消失则不开庭并直接 SUMMARY。同一 RS 与同一 OG 集合只能创建一次 FV；mode 保留为 debate，不回退 collaboration。

## 庭审顺序与收敛

进入辩论庭或众议庭后：

1. Speaker 发布 `NOTICE: OPEN`，引用基线、原告、异议组与 procedure mode；
2. 原告提交有限诉求和 RC，主 owner逐项答辩；
3. 首次陈述窗口结束后冻结 BOS；
4. 后续只允许回应开放 BO 的 `ANSWER / CLAIM / EVIDENCE / AMENDMENT`；
5. 冻结最小 DES并完成适用抽查；
6. 没有可降低 rank 的新增量时发布 `SUMMARY` 并休庭；
7. Chief 作与 discussion type 相匹配的实体裁定后，Speaker 先追加所需 BO 状态事件，最后追加 `NOTICE: CLOSURE_COMMIT`；该 marker 同时使裁定与所列新 logical case state 生效，`case.md` 随后同步。deadline 未完成时依中央规则自动或由无冲突 recorder 兜底，Speaker 不拥有否决权。

众议庭成立时，Speaker 在 opening 以 `FS-###` overlay 冻结 electorate 对产出与直接依赖的逐人只读范围、deadline 与 hash，并引用原 RS；它不改变 N。新增范围的 stance 必须同时引用 RS+FS。敏感材料仍须 Chief 批准。owner 仍只在自身能够负责的范围作实体判断，无法判断时登记 ABSTAIN 并由 SUMMARY 暴露覆盖缺口。

庭审不靠固定轮数。一个增量只有永久关闭至少一个开放条件时才能续轮；稳定分歧直接送裁定。

## 送裁定门禁

`SUMMARY` 前必须确认：

1. discussion type 与唯一 ruling-ready MS/PS 明确；主 owner 已把所有可能被裁定采纳的 owner contribution 与 AM 集成进该快照，未集成 AM 只能列为未决请求，不能与快照拼接成可批准对象；
2. 当前议案回答或方案没有必要 owner 空白，且任何 `blocking: true` 的 extension、derived 或 side case 均已由明示记录解除；
3. 合作 owner 的 review stance 齐全，超时者明确记为弃权；
4. 每项 material 异议都有主 owner 处置；
5. 若开庭，BOS、异议组、证据状态和停止原因完整；
6. 若为众议庭，`FV-###` 有效且通过；
7. 方案带风险、回滚/补救与验收标准；
8. boundary protocol v1 适用时，BC/SEQ 声明、owner 确认、正负 AC、全部 REQUIRED 序列单元格与精确 revision binding 完整；
9. SUMMARY 分列共识、分歧、未知、风险和未覆盖责任，并只引用 canonical source。

Chief 只能裁定 SUMMARY 指向的单一 ruling-ready MS/PS，不能直接批准“当前快照 + 未集成 AM”。若 Chief 倾向采纳未集成内容，必须先返回主 owner 集成；主 owner拒绝或无法集成时可转移 lead，随后形成 successor artifact/RS 再送裁定。
