# Canonical source

[Quorum 索引](../README.md) · [Court Records](README.md)

每类信息只有一个正文来源:

- `case.md`: **当前元数据，待裁问题，必到角色与文件索引** 的 canonical source；不复制发言，证据，方案或裁定正文
- `record.md`: **庭审原始发言** 的 canonical source，严格按 `S-####` 追加；闭庭摘要也追加在本文件末尾，但只能引用原始编号
- `evidence.md`: **证据来源，完整性限制与验证历史** 的 canonical source；`EVIDENCE` 发言只登记并引用对应 `E-####`
- `proposal.md`: **完整方案及其带编号验收标准** 的 canonical source；`PROPOSAL` 与 `AMENDMENT` 发言只登记方案编号，摘要及变更关系
- `ruling.md`: **`Chief Judge` 与获授权 `Procedural Judge` 裁定，以及 Fast Track 指派** 的 canonical source；普通裁定只引用获准方案的验收标准，Fast Track 指派本身定义其验收标准
- `acceptance.md`: **验收标准引用，检查方法，观察结果与验收结论** 的 canonical source；不得复制或改写验收标准正文

状态索引可以更新，原始记录不得覆写。`record.md` 只能追加；证据状态变化在 `evidence.md` 的 **验证历史** 中追加；方案修正保留原方案，以新的方案编号或带 target 的修正记录表达；裁定被推翻时保留原裁定并追加后继记录。
