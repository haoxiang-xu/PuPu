# Case Lifecycle 议案生命周期

[Quorum 索引](../README.md)

Full case 从立案到结案，依次经过以下九个阶段；Fast Track、Express 与 Debate 依[Track 分档](tracks.md)简化前置形成过程：

咨询、解释、状态查询与只读诊断若不形成方案或授权真实 action，属于[不立案直接回答](tracks.md)，不进入下列生命周期。

1. **议案提出**: `Chief Judge` 提出议案，正式立案
2. **议案庭审**: `Speaker of the House` 组织庭审，收集 agent team 对议案的 **意见和建议**，并将其传达给 `Chief Judge`
3. **议案裁定**: `Chief Judge` 根据庭审收集的意见和建议，做出最终裁定；裁定通过后，进入下一阶段
4. **方案庭审** (仅当议案涉及实施时): `Speaker of the House` 组织庭审，收集 agent team 的 **方案设计**，并将其传达给 `Chief Judge`
5. **方案裁定**: `Chief Judge` 根据方案设计，做出最终裁定；裁定通过后，进入实施阶段
6. **实施执行**: agent team 根据最终裁定的方案，进行 **代码实现** 或 **action 执行**
7. **验收评估**: `Acceptance Inspector` 对实施结果做验收评估
    - 每个实施快照建立新的 `AT-###`；验收观察证据适用共通相关性门与 16% 随机抽查
    - 同一获准 action 的全部 AT 继承同一 `AS-###`、首次验收冻结的有限 `BOS-###`、DES 历史与首批消耗状态；返修周期在再次获准前必须严格减少 OPEN condition/RC rank，且不得让终态 AC 回归失败
    - `EMPTY / INHERITED_ONLY` 时不创建 Examiner/新 CR，可直接推进；实际首批后或 `AWAITING_CHIEF_DIRECTION` 时由 `Chief Judge` 决定是否续查
    - 验收通过: `Chief Judge` 以 `ACCEPTANCE_RULING` 结束证据方向、逐项处置验收 BOS 后，case 结案，flow 完成
    - 验收不通过: `Chief Judge` 以 `ACCEPTANCE_RULING` 保留失败相关 OPEN BO 并转入验收庭审
8. **验收庭审**: `Speaker of the House` 组织庭审，`Acceptance Inspector` 作为 **原告** 提出验收不通过的理由，agent team 作为 **被告** 进行辩护；`Speaker of the House` 收集庭审中的意见和建议，并将其传达给 `Chief Judge`
9. **复议裁定**: `Procedural Judge` 可对客观失败及辩护是否成立作程序裁定；是否接受辩护并通过验收、终止、拆案或再授权一次返修，均由 `Chief Judge` 对当前 `AT-###` 明示裁定。Fast 可在仍满足准入时直接进入受限 implementation revision；Express 与 Debate 仅在方案不变时可直达受限 implementation revision，方案变化分别返回 combined/debate；Full 为保持完整九步，无论变化类型均回到方案庭审（第 4 步）。返修方案获批时验收 BO 以 carry-open 方式沿用到新实施/验收，不得提前终态化。轮数不设硬上限，但不存在自动回环

所有 Track 均适用[全 Track 共通收敛规则](decision-controls.md)：`Speaker of the House` 先排除不改变抉择的内容，再冻结最小决策证据集；`Evidence Examiner` 默认只随机抽查其中 16% 并提交置信度报告，是否续查由 `Chief Judge` 决定。详见[证据规则](evidence-rules.md)。

**议案裁定** 与 **方案裁定** 中，凡有经相关性门标记为 `ADMIT_MATERIAL` 的 `Expert` **不成立** 鉴定，或 `Dimension Owner` **反对** 评估，`Chief Judge` 必须在裁定中显式回应；背景、重复或范围外意见不进入强制回应清单。

本页的生命周期正文与下列子文档共同构成该章节的规范性内容；“子文档”列表仅用于导航，不新增或复述规则。

## 子文档

- [庭审发言协议](speech-protocol.md)
- [全 Track 共通收敛规则](decision-controls.md)
- [证据规则](evidence-rules.md)
- [Track 分档](tracks.md)
- [Debate 辩论庭](debate-court.md)
- [传唤机制](summons.md)
- [获批 roster 的到场与交付规则](quorum.md)（PuPu 本仓条文）
- [Side Case 分叉](side-cases.md)
