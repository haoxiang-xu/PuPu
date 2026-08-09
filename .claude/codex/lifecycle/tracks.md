# Track 分档

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

并非所有请求都应立案。**咨询、解释、状态查询与只读诊断** 若不要求形成可执行方案、不授权真实 action、也不产生持久或外部影响，直接由责任 owner 回答；不创建 case、不召集 roster、不建立 DES，也不进入任何 Track。只有目标与 `non_goals` 已可固定，且需要形成方案、授权 action 或作会产生真实影响的裁定时，才进入下列四档。目标尚不能固定时只退回 intake 补齐，不开庭。

进入立案门后，case 依据 **影响的可逆性、契约边界及方案是否已经确定** 分为四档。四档全部受[全 Track 共通收敛规则](decision-controls.md)约束。

| Track | 准入条件 | 流程 |
|---|---|---|
| **Fast Track** | 以下五条全部满足 | 免庭直行 |
| **Express** | 未命中 Full、不满足 Fast，且方案路径、owner 分工与验收方式均已确定 | 单次合并庭审 + 单次裁定 |
| **Debate** | 未命中 Full、不满足 Fast；目标已确定但方案仍需设计或对抗 | 集成方案辩论 + 单次裁定 |
| **Full** | 触发以下任一高风险条件 | 完整九步 |

表中流程栏描述的是 **action 首次获准前的方案形成**。“单次庭审”指一个逻辑 hearing instance，可按实质增量条件休庭/恢复；“单次裁定”指每次逻辑 hearing visit 恰好一条实体裁定。实施后的 `ACCEPTANCE_RULING` 与可能发生的复议属于各 Track 共用的后半段生命周期，不计入该列；验收返修若获准进入新的受限方案 visit，可再产生一条 `ACCEPTANCE_REVISION` 模式裁定，但复用原 AS/BOS/DES/cycle，不重开初始流程。参与审批、范围授权与证据方向只是受控授权记录，不另开实体裁定阶段。

## 准入边界

**Fast Track 准入五条（缺一不可）**：

1. **完全可逆**：一次回滚即可复原，无数据迁移，无外部副作用；
2. **不跨 owner**：全部落在单一 owner 的所有权边界内；
3. **不改变契约**：不触及接口、数据结构、事件语义或任何对外可见行为；
4. **不存在实质异议或待选方案**；
5. **不涉及** 金钱支出、对外发布或对外公开。

**Express 准入条件**：未命中 Full、不满足 Fast，且目标、实施路径、owner 分工及验收方式已经确定；可用于按既定分工做有限的跨 owner 协调，或对一份既定方案处理有限争议。若仍需共同发明方案或决定 owner slot，改用 Debate。

**Debate 准入条件**：未命中 Full 且不满足 Fast；目标结果与 non-goals 已固定；不改变契约的新功能、方案选择或 owner 分工尚需设计；action 整体可逆。一个 owner 独立面对多个待选方案时也使用 Debate。详见[Debate 辩论庭](debate-court.md)。

**Full 强制触发条件保持原样（任一即触发）**：

1. **不可逆**：数据迁移、删除、发布、对外公开或金钱支出；
2. **改变契约**；
3. 有已获准 `Expert` 出具、并经相关性门标记为 `ADMIT_MATERIAL` 的 **不成立** 鉴定意见；
4. 跨三个及以上 owner。

第三项只认已经由 `Chief Judge` 批准出庭的 Expert 所提交、且通过相关性门的正式鉴定。第四项按当前获准 action 的 `write_set / contract_set / 直接验收与回滚责任` 实际命中的不同 ownership boundary 计数，与对应 owner 是否已经获批出庭无关；背景或证据里顺带提及的实体不计。命中第三个边界只触发 Full 分档，不自动把该 owner 加入 roster；参与资格仍须独立 `RP-### / PARTICIPATION_RULING` 批准。

**顺序判定**：先经过上述“不立案直接回答”门，再检查 Full；未命中 Full 时，满足 Fast 五条即为 Fast；其余事项中，方案路径、owner 分工与验收方式均已确定的为 Express，任一仍需设计的为 Debate。改变契约或其他 Full 条件成立时始终进入 Full，不由 Debate 吸收。

## 各档流程

- **Fast Track**：`Chief Judge` 直接指派 owner 执行，**无议案庭审、无方案庭审、无另行裁定阶段**。
  - 保留验收：`Acceptance Inspector` 照常执行验收评估；验收不通过进入验收庭审。
  - 保留极轻量共通 preflight 与归档：`Chief Judge` 在不可改写的 intake 块中一次批准 Speaker、执行 owner 与其他已知初始参与者；Speaker 只路由提出者已经提交的材料，冻结一条有限 intake BOS 与 DES，不主动调查或制造证据。这些程序记录不构成开庭。`EMPTY / INHERITED_ONLY` 时直接签发指派；`FIRST_RANDOM_REQUIRED` 且 Examiner 未在初始名单时，须经 `RP-###` 与 `PARTICIPATION_RULING` 增员，完成首批 16% 抽样后，指派本身引用 CR 即隐式选择 `RULE_NOW`，或由 Chief 先签发其他证据方向。两种情况均照常编号归档。
  - 若执行前出现可能破坏准入条件的 `ADMIT_MATERIAL` 内容，立即停止并交 `Chief Judge` 重新分档。
- **Express**：议案庭审与方案庭审合并为一次庭审；`case.md` 使用 `phase: combined`，`Chief Judge` 以一条 `EXPRESS_RULING` 记录唯一综合结果与获准方案，不拆成可能冲突的议案/方案双结果。初始通过后进入 `implementing`，初始驳回后进入 `closed`；其余阶段与 Full 相同。
- **Debate**：`case.md` 使用 `phase: debate`。主 owner 起草带 owner slots 的集成方案，其他获准 owner 补全并对当前方案快照 `ACK` 或提出实质异议；完成适用的 16% 证据抽查或记录 `EMPTY / INHERITED_ONLY` 后，由 `Chief Judge` 作一条 `DEBATE_RULING`。通过后进入 `implementing`，驳回后进入 `closed`；其余阶段与 Full 相同。
- **Full**：完整九步，无省略；九步内部仍适用相关性门、实质增量续轮、16% 默认抽查、`Chief Judge` 续查权及增员审批。

## 档位判定与变更

1. **提出者自报**：提出议案时声明 track 与对应客观条件。
2. **程序建议**：`Procedural Judge` 或任何已获准出庭角色可提出重分类请求，但必须点名具体准入条件及会改变的流程。
3. **相关性门**：重分类请求须由 `Speaker of the House` 按共通规则路由；仅表达“事情重要”或重复反对不构成重分类理由。
4. **分档生效**：上列四项 Full 强制条件按规则生效，由 `Chief Judge` 归档 Track 变化；其他升档、降档或边界争议均由 `Chief Judge` 明示裁定，agent 不得自行改档。

case 改档时，改档前已完成且仍适用于当前范围的意见、方案、发言与证据继续沿用；只补足新档位尚未经过的阶段。已 `ACK` 的方案块若未受改档或后续修改影响，认可继续有效。`Speaker of the House` 归档档位变更记录及变更时点。

## Fast Track 的方案依据

Fast Track 中，`Chief Judge` 的指派说明即为[宪法第二条](../constitution.md)所要求的方案依据；它同时是方案与裁定，必须写明可验收的完成标准。缺少完成标准的指派，`Acceptance Inspector` 拒绝受理验收。
