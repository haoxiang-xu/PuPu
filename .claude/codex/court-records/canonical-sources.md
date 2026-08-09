# Canonical source

[Quorum 索引](../README.md) · [Court Records](README.md)

每类信息只有一个正文来源:

- `case.md`: **当前元数据、stage instance 与 acceptance series 指针、目标与当前范围、待裁问题、effective BOS 指针、主 owner、不可改写的初始参与批准块、当前 roster、待批参与变更、blocking child 指针、当前证据控制指针与文件索引** 的 canonical source；不复制发言、阻塞清单、证据、方案或裁定正文
- `record.md`: **庭审原始发言、冻结的 `BOS-###/BO-###` 阶段阻塞清单与异议 `THREAD_STATUS`** 的 canonical source，严格按 `S-####` 追加；闭庭摘要也追加在本文件末尾，但只能引用原始编号
- `evidence.md`: **证据来源、稳定 `ES-###` 切片、去重的 `EVIDENCE_FLAG` 质疑历史、验证历史、`DU-###`、`DES-###` manifest/successor 链、stage instance、sampling scope、随机 seed、批次与 `CR-###` 报告** 的 canonical source；`EVIDENCE` 发言或 intake submission 只登记并引用对应 `E-####`
- `proposal.md`: **完整方案、owner slots、方案快照、审查/ACK 状态及带编号验收标准** 的 canonical source；`PROPOSAL`、`AMENDMENT` 与 `ACK` 发言只登记对应编号和范围
- `ruling.md`: **`Chief Judge` 与获授权 `Procedural Judge` 裁定、阶段/范围/Track/BOS/side case 转换、终止、立案后的参与名单变更、证据续查指令，以及 Fast Track 指派** 的 canonical source；初始 roster 的不可改写 intake 批准块在 `case.md`，后续每次变化由本文件中的相应 ruling 授权
- `acceptance.md`: **`AT-###` 实施快照、验收标准引用、检查方法、观察结果、验收 BOS 指针与验收结论** 的 canonical source；不得复制或改写验收标准正文，`BOS-###` 正文仍只在 `record.md`
- `parking-lot.md`: **相关性门未送入主流程的背景、重复、范围外、过早、无链接及结案后再议事项** 的 canonical source；只记录最小索引、处置理由和未来触发条件，不复制证据正文，也不参与当前裁定

状态索引可以更新，原始记录不得覆写。`record.md` 只能追加；证据状态变化在 `evidence.md` 的 **验证历史** 中追加；方案修正保留原方案，以新的方案编号或带 target 的修正记录表达；裁定被推翻时保留原裁定并追加后继记录。
