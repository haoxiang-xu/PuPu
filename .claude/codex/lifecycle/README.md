# Case Lifecycle 议案生命周期

[Quorum 索引](../README.md)

一个 case 从立案到结案，依次经过以下阶段：

1. **议案提出**: `Chief Judge` 提出议案，正式立案
2. **议案庭审**: `Speaker of the House` 组织庭审，收集 agent team 对议案的 **意见和建议**，并将其传达给 `Chief Judge`
3. **议案裁定**: `Chief Judge` 根据庭审收集的意见和建议，做出最终裁定；裁定通过后，进入下一阶段
4. **方案庭审** (仅当议案涉及实施时): `Speaker of the House` 组织庭审，收集 agent team 的 **方案设计**，并将其传达给 `Chief Judge`
5. **方案裁定**: `Chief Judge` 根据方案设计，做出最终裁定；裁定通过后，进入实施阶段
6. **实施执行**: agent team 根据最终裁定的方案，进行 **代码实现** 或 **action 执行**
7. **验收评估**: `Acceptance Inspector` 对实施结果做验收评估
    - 验收通过: case 结案，flow 完成
    - 验收不通过: 进入验收庭审
8. **验收庭审**: `Speaker of the House` 组织庭审，`Acceptance Inspector` 作为 **原告** 提出验收不通过的理由，agent team 作为 **被告** 进行辩护；`Speaker of the House` 收集庭审中的意见和建议，并将其传达给 `Chief Judge`
9. **复议裁定**: 验收不通过的理由 基于客观检查结果，且被告未能提出有效辩护的 **例行复议**，由 `Procedural Judge` 裁定；存在实质争议的复议，由 `Chief Judge` 做出最终裁定；裁定不通过，则回到 **方案庭审** (第 4 步) 重新循环

所有由 `Speaker of the House` 主持的庭审流程，都由 `Evidence Examiner` 对庭上提出的证据进行验证。

**议案裁定** 与 **方案裁定** 中，凡有 `Expert` 出具 **不成立** 鉴定意见，或有 `Dimension Owner` 出具 **反对** 评估意见的，`Chief Judge` 必须在裁定中对该意见做出 **显式回应**，方可作出裁定；回应内容由 `Speaker of the House` 连同裁定一并归档。

本页的生命周期正文与下列子文档共同构成该章节的规范性内容；“子文档”列表仅用于导航，不新增或复述规则。

## 子文档

- [庭审发言协议](speech-protocol.md)
- [Track 分档](tracks.md)
- [传唤机制](summons.md)
- [法定人数 quorum](quorum.md) (本仓自有条文)
- [Side Case 分叉](side-cases.md)
