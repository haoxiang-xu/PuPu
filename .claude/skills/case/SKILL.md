---
name: case
description: Use when a request will produce a real effect in this project, needs an executable plan or ruling, files or advances a case, changes an agent/skill/codex rule, or runs acceptance. Encodes PuPu's Quorum procedure: the no-case gate, four-track triage, Chief-approved roster, relevance and convergence controls, Debate, 16% decision-evidence sampling, rulings, acceptance and archiving. Do not use for pure questions, status reads or read-only diagnosis.
---

# Case 立案与推进

你是 `chief-judge`（CEO 本人）的 **书记员**。你不持有 Quorum 角色，不裁定、不投票；你只操作机器、维护留痕并执行已获准的动作。

规范正文在 `.claude/codex/`。本 skill 只给操作顺序；字段、枚举与状态迁移以法典为准，特别是：

- [Track 分档与不立案门](../../codex/lifecycle/tracks.md)
- [参与名单与传唤](../../codex/lifecycle/summons.md)
- [本仓获批 roster 与 legacy bridge](../../codex/lifecycle/quorum.md)
- [共通收敛规则](../../codex/lifecycle/decision-controls.md)
- [证据规则](../../codex/lifecycle/evidence-rules.md)
- [Debate](../../codex/lifecycle/debate-court.md)
- [案卷固定模板](../../codex/court-records/templates.md)

## 第一步 · 不立案门

下列请求直接交责任 owner 回答，不创建 case、roster、BOS 或 DES：

- 咨询、解释与状态查询；
- 只读代码检查、调查与诊断；
- 不形成可执行方案、不授权真实 action，也不产生持久或外部影响的判断。

只有目标与 `non_goals` 已能固定，且需要形成方案、授权 action 或作会产生真实影响的裁定时才立案。目标尚不能固定时退回 intake 补齐，**不要用 Fast 兜底**。

## 既有案前置检查 · 仅迁移期

推进 2026-08-09 同步前已创建且尚未结束的 case 时，必须先读 `case.md`、当前 stage 的已归档记录与 `lifecycle/quorum.md`，再决定入口；不得直接套用新案 intake：

- 仍为 `filed` 且没有实体发言、证据或裁定：直接按现行 intake 创建第一条 SI，不使用 legacy bridge；
- 已处于 `hearing / awaiting-ruling`，且当前 stage 在同步前已经开始：只允许这一个 current stage 沿用其已归档 roster 与 legacy 字段集合完成剩余发言、证据和 SUMMARY；
- 关闭或转换该 legacy stage 的 **恰好下一条 R** 必须使用现行记录类型，归档说明标记 `legacy bridge · pre-2026-08-09`；历史 `TERMINATION` 在新 R 中写作 `TERMINATION_RULING`；
- bridge R 只能终结 case，或原子创建一个符合现行规则的新 stage/SI，并同时建立所需 BOS、DES 与 sampling 状态；不得开启第二个 legacy stage、恢复旧式自动增员或启动新的旧式全量核验；
- 同步后新增的任何 agent / role instance，即使服务 current legacy stage，也必须走现行 `RP-### / PARTICIPATION_RULING`。

无法判定当前 stage 是否属于上述 bridge 范围时，停止推进并交 `Chief Judge` 明示迁移方式，不得自行补写或改写历史记录。

## 第二步 · 四档分流

先检查 Full，再检查 Fast；未命中 Full 且不满足 Fast时，方案路径、owner 分工与验收均已确定的是 Express，任一仍需设计的是 Debate。

| Track | 准入 | 首次获准前流程 |
|---|---|---|
| **Fast** | 五条全部满足：完全可逆、单 owner、不改契约、无实质异议或待选方案、不涉金钱/发布/公开 | 轻量 preflight + `FAST_TRACK_DIRECTIVE`，免庭 |
| **Express** | 未命中 Full；路径、分工、验收均已确定 | 一个 combined visit + 一条综合裁定 |
| **Debate** | 未命中 Full；目标固定，但方案、待选路径或 owner slot 仍需设计 | 一份集成方案的对抗审查 + 一条裁定 |
| **Full** | 任一成立：不可逆；改变契约；获准 Expert 的 `ADMIT_MATERIAL` 不成立；当前 action 实际命中三个及以上 ownership boundary | 完整九步 |

跨三个 boundary 按获准 action 的 `write_set / contract_set / 直接验收与回滚责任` 计，不按 roster 人数计；触发 Full 不自动增员。agent 只能提出重分类请求，任何实际改档由 `Chief Judge` 归档。

## 第三步 · intake、编号与初始批准

原子取得 case 编号，创建 `.claude/court/cases/<case-id>/case.md`。所有 Track 都先写 `phase: intake`，并固定：

- 目标、`non_goals` 与待裁 `Q-###`；
- `write_set`、`contract_set`、验收与回滚责任；
- 提出者自报 Track 及客观理由；
- 候选参与者与每人的具体交付；
- `Chief Judge` 明示批准的初始 roster、角色、交付与访问范围。

边界发现、自请与推荐都只是候选。未获批准的 agent 不得读取受限案卷、提交主记录、承担闭庭义务或扩大 roster。初始批准块不可改写；后续变化走 `RP-### / PARTICIPATION_RULING`。

## 第四步 · 候选发现与增员

运行候选发现器：

```bash
python3 .claude/skills/case/summon.py <intake-or-proposal-file> [...]
```

它只输出：

- 路径边界机械命中的候选；
- 需要人工对照的 Expert / POV / Dimension / Task 候选；
- 概念名候选、歧义与未覆盖项。

将真正可能改变具体 `Q-###`、方案块、AC 或回滚的候选写成 `RP-###`，逐项呈 `Chief Judge`。批准一个不代表批准同批其他人；额外 Examiner instance 也算增员。最终方案命中未覆盖 owner 时，只提交请求或覆盖缺口，不得自动传唤。

## 第五步 · 相关性、BOS 与发言

`Speaker of the House` 对所有角色、所有 Track 使用同一相关性门。进入主记录的材料必须点名它可能改变的 Track、Q、方案块、owner slot、AC、回滚、BO 或裁定结果。其余内容合并、移出或退回，不因“是真的”就留在主流程。

首份完整材料完成首次审查后冻结有限 `BOS-###` 及已有异议的有限解决条件。冻结后不得新增 material 问题、讨论异议或 blocking 传票；只可：

- 回应已有线程；
- 用方案变化或新证据永久关闭/推翻至少一个 OPEN atom；
- 对新证据提交去重的 `EVIDENCE_FLAG`，但不得新建 BO/RC 或自动核验；
- 把真正的新 blocker 交 `Chief Judge` 重框、拆案、另立 case 或按现有记录裁定。

轮数没有固定上限，但 rank 不严格下降就停止自动讨论。稳定分歧原样送裁定，不要求共识。

## 第六步 · 按 Track 形成方案

- **Fast**：Speaker 只路由提出者已有材料，冻结轻量 intake BOS 与 DES，不开庭、不主动调查。完成必要证据 preflight 后，由 `Chief Judge` 的 `FAST_TRACK_DIRECTIVE` 同时承担方案与裁定。
- **Express**：主持一个 `combined` visit，对已经确定的路径、分工与验收做有限协调；一条 `EXPRESS_RULING` 记录唯一综合结果。
- **Debate**：`Chief Judge` 指定主 owner。主 owner先交一份带 owner slots、风险、回滚和 AC 的集成方案；其他获准 owner 只补自身块。首次完整快照的写入与验收 owner 必须逐一 ACK 或提出会改变抉择的异议；沉默不算通过。
- **Full**：完整执行议案提出、议案庭审、议案裁定、方案庭审、方案裁定、实施、验收、验收庭审、复议裁定九步，不得省略。

## 第七步 · 决策证据与 16% 抽查

Speaker 只选择 **会改变抉择** 的证据，按事实主张与决策链接去重为 `DU-###`，完整分区后冻结 `DES-###`：

- `N = 0`：记 `EMPTY`，不创建 Examiner 或 CR；
- 全部核验可按未变化 `verification_key` 继承：记 `INHERITED_ONLY`，不重复查、不创建新 CR；
- 当前 sampling scope 尚未消费首批且存在 `RANDOM_ELIGIBLE`：经批准的 Examiner 执行唯一 `FIRST_RANDOM_16`；
- 其他非空集合：记 `AWAITING_CHIEF_DIRECTION`。

首批上限 `k = ceil(N × 0.16)`，实际随机新查数为 `min(k, RANDOM_ELIGIBLE 未查数)`。Examiner 只核验抽中的 DU，并给一份批次级置信度报告：样本比例、验证/未验证/相矛盾数、决策覆盖、未覆盖项、单来源依赖、限制与置信度。

首批后自动核验停止。只有 `Chief Judge` 能选择：

- `RULE_NOW`
- `NEXT_RANDOM_16`
- `TARGETED_CHECK`
- `RETURN_FOR_REVISION`
- `RECLASSIFY`

每次续查写明范围与停止条件。Speaker、Examiner、Procedural Judge 和其他 agent 都不能自行续查、扩大样本或展开邻接调查。

## 第八步 · 呈裁定与实施

`SUMMARY` 原样保留分歧、OPEN BO/RC、证据 flag、CR 覆盖、未抽中风险、单来源依赖、候选方案与强制回应事项。只有通过相关性门的 Expert “不成立”或 Dimension “反对”进入强制回应清单。

实体裁定由 `Chief Judge` 作出。裁定批准 action 后才进入实施；执行 owner 只能在获准 write/contract set 与方案快照内工作。改动会破坏当前 Track 或 scope 时先停下，等待重分类或范围裁定。

## 第九步 · 验收与返修

每个实施快照建立 `AT-###`；同一获准 action 从 implementation 起共享一个 `AS-###`、验收 BOS、DES 历史与首批消耗状态。验收观察同样经过相关性门和 16% 抽查，不能把“未反驳”当作通过。

`Chief Judge` 用 `ACCEPTANCE_RULING` 逐项处置验收 BO：

- 通过：支持项 `SATISFIED`，未覆盖但接受的风险 `WAIVED_BY_RULING`，再结案；
- 不通过：保留相关 OPEN BO，进入验收庭审；
- 复议后可 ACCEPT、TERMINATE、SPLIT 或 REAUTHORIZE_REVISION。

Fast 可在仍满足准入时直接进入受限 implementation revision；Express/Debate 仅方案不变时可直达，方案变化回各自 visit；Full 始终回 proposal，保持九步。返修不设固定次数，但再次授权前必须严格降低 OPEN atom rank，且不得用新 AT/SI 重置 AS 的首批额度。

## 结案与边界

- 所有案卷只追加，不改写已归档发言、证据、方案、裁定或验收；
- 长期知识进入对应 archive；判例进入 `.claude/codex/precedents/`；
- 边界遗漏是当前 case 的维护项，不自动拉人、不自动延迟闭庭；
- 主树不自行 commit，交给 `chief-judge` 复核与提交。

## 常见错误

- 把只读问题立案，或用 Fast 给不确定目标兜底；
- 看到边界命中就自动派 agent；
- 把 Debate 做成多个 owner 各写一份互不集成的方案；
- 把真实但不改变抉择的材料留在主流程；
- 一项证据派一个 Examiner，或首批后自动继续查；
- 通过新增问题、RC、agent、AT 或 SI 让循环重新开始；
- 验收没有 `Chief Judge` 的最终 BOS 处置就直接宣布结案。
