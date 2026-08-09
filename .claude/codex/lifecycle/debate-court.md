# Debate 辩论庭

[Quorum 索引](../README.md) · [Case Lifecycle](README.md) · [Track 分档](tracks.md)

Debate 用于 **目标已经确定，但实现方案仍需由一个或多个 owner 形成并接受对抗性审查** 的事项。它直接产出一份可供 `Chief Judge` 裁定的完整方案；裁定通过后进入实施，不再转入 Express 或 Full 重走已经完成的设计过程。

## 准入边界

Debate 同时满足：

1. 目标结果与 `non_goals` 可以在开庭前固定；
2. 存在不改变契约的新功能设计、多个可行方案或 owner 分工问题；单 owner 有待选方案也满足本项；
3. 不命中 [Full 的任何强制触发条件](tracks.md#准入边界)；
4. 需要共同设计，而不只是对一份已经确定的方案做一次协调确认。

方案路径已经确定、只需跨 owner 协调或处理有限争议的，使用 Express。任何 Full 强制触发条件成立的，使用 Full。

## 角色与单一方案

`Chief Judge` 从具有写入责任的 `Code Owner`、`Task Owner` 或 `Knowledge Owner` 中指定一名 **主 owner (`lead_owner`)**，并批准初始参与名单。

Debate 默认围绕 **一份集成方案** 工作：

- 主 owner 先提交完整骨架，写明目标、范围、步骤、风险、可逆性、回滚方式、验收标准，并为其他 owner 标出各自负责的方案块；
- 其他获准 owner（如有）只在自己的方案块中补充内容，或对具体方案块提出修正；
- 不同目标结果才另立候选方案，不得用多个近似方案代替对同一方案的增量修改。

## 流程

1. **开庭授权**：`Chief Judge` 固定目标、`Q-###`、`write_set`、`contract_set`、`non_goals`、主 owner 与初始参与名单。
2. **主 owner 起草**：主 owner 提交一份带 owner slots 的完整方案骨架。
3. **owner 补全**：其他 owner（如有）通过 `AMENDMENT` 填写自己的方案块；跨越其所有权边界的内容只能提出请求，不得代写。
4. **全案首次审查**：集成方案首次完整时，每位承担写入或验收责任的获准 owner 都须在明确截止点前阅读整个方案快照，并登记 `ACK` 或提交指向具体方案块、且说明决策影响的 `OBJECTION`。沉默不视为 ACK，缺席只有经 `Chief Judge` 明示豁免或移出名单后才不阻塞本步。
5. **冻结阻塞清单**：首次审查截止后，`Speaker of the House` 把冻结的 Q/AC/强制风险与已接纳异议归并为有限 `BOS-###/BO-###`。存在当前已获准、可减少 rank 的方案增量时进入对抗修订；若剩余 OPEN BO 只在等待证据，或已经没有 agent 可自动执行的下一增量，则保持其 OPEN 状态并直接进入证据抽查。BOS 此后不得扩张。
6. **对抗修订**：主 owner 依据已采纳异议修订方案。轮数不设上限，但每个异议的有限解决条件随 BOS 冻结；只有永久关闭或推翻至少一个开放条件、使全案 rank 严格减少才继续。冻结后只回应既有线程，不再接纳新的 material 问题或讨论异议；独立新忧虑交 `Chief Judge` 重框、拆案或按现有记录裁定。连续修改却未关闭条件时停止自动讨论：若各方已明确接受不可处理的分歧，才记为稳定分歧；否则保持 `OPEN_MATERIAL` 并暂停送裁定。首次全案审查之后，只复审受变更影响的方案块及其依赖块。
7. **证据抽查**：`Speaker of the House` 冻结决策证据集；`FIRST_RANDOM_REQUIRED` 时 `Evidence Examiner` 仅随机抽查 16% 并提交置信度报告；`EMPTY / INHERITED_ONLY` 时不为满足形式创建 Examiner instance 或新 CR。
8. **单次裁定**：`SUMMARY` 送交时 hearing 只休庭、不最终关闭。`Chief Judge` 可要求续查或返修；材料足够时，每次逻辑 debate visit 以一条 `DEBATE_RULING` 逐项处置剩余 OPEN BO 并批准或驳回方案。初始批准后进入 `implementing`，初始驳回后进入 `closed`；验收返修形成的新受限 visit 使用 `裁定模式 = ACCEPTANCE_REVISION` 并 carry open 原验收义务，不重建 AS/BOS，若驳回则保留原验收失败并回 `awaiting-ruling`。

`ACK` 只是对指定方案快照和方案块表示无异议，不分享 `Chief Judge` 的裁决权。若存在稳定分歧但已无新证据或方案变化，`Speaker of the House` 停止线程，把分歧原样提交 `Chief Judge`，不得要求所有 agent 达成一致。
