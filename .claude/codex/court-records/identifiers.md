# 编号与交叉引用

[Quorum 索引](../README.md) · [Court Records](README.md)

- 议案编号与方案编号为全局编号，沿用 `0000-0001-YYYY-MMDD` 格式及各自独立序列
- `S-####`，`E-####` 与 `R-####` 只在一个 case 内唯一；跨 case 引用必须写为 `<case-id>#S-####`，`<case-id>#E-####` 或 `<case-id>#R-####`
- 待裁问题使用 case 内 `Q-001` 起始编号；跨 case 引用写为 `<case-id>#Q-###`
- 阶段阻塞清单使用 case 内 `BOS-001` 起始编号；清单内阻塞项使用 `BO-001` 起始编号，引用写为 `BOS-###/BO-###`，跨 case 写为 `<case-id>#BOS-###/BO-###`。同一收敛域的 BOS 冻结后不可扩张；同一获准 action 的 acceptance successor 继续引用原 BOS
- 每个 `OBJECTION` 的解决条件在该发言内使用 `RC-001` 起始编号；引用写为 `S-####/RC-###`，跨 case 写为 `<case-id>#S-####/RC-###`
- lifecycle stage instance 使用 case 内 `SI-001` 起始编号；只有获准阶段转换创建新 SI，跨 case 引用写为 `<case-id>#SI-###`
- 同一获准 action 的验收系列使用 case 内 `AS-001` 起始编号；implementation 裁定创建一次，全部 successor `AT-###`、acceptance SI、DES 与复议共用该 AS，直到 action 结案、终止或拆案。跨 case 引用写为 `<case-id>#AS-###`
- 决策证据集 manifest 与置信度报告分别使用 case 内 `DES-001` 与 `CR-001` 起始编号；跨 case 引用须带 case id
- `parking-lot.md` 的轻量索引使用 case 内 `P-001` 起始编号；它只标识相关性处置，不具证明力，也不得作为实体证据引用
- 参与请求使用 case 内 `RP-001` 起始编号；批准或拒绝它的 `PARTICIPATION_RULING` 必须引用对应 `RP-###`
- 范围变化请求使用 case 内 `SR-001` 起始编号；对应 `SCOPE_REQUEST` 发言只提出请求，不改变当前范围，`SCOPE_RULING` 必须引用该 `SR-###`
- 决策事实单元使用一个 `DES-###` 内的 `DU-001` 起始编号；引用写为 `<case-id>#DES-###/DU-###`，抽样总体按 `DU` 而不是消息数或裸 `E-####` 计数
- 证据精确切片使用一个 `E-####` 内的 `ES-001` 起始编号；引用写为 `E-####/ES-###`，跨 case 写为 `<case-id>#E-####/ES-###`。每个 ES 记录 locator、revision、观察时点、规范化内容哈希与边界，行号或 `result-1` 等自由文本不得单独充当稳定切片 ID
- `DU-###` 仅在所属 DES manifest 内可裸写；CR、验证历史、裁定及跨 DES 引用至少写为 `DES-###/DU-###`
- 方案引用使用完整方案编号，不以“方案一”“最新版”等别名代替
- 每份方案的验收标准在该方案内使用 `AC-001` 起始的本地编号；跨方案引用写为 `<proposal-id>#AC-###`
- Fast 指派内的验收标准使用该 `R-####` 内 `AC-001` 起始编号；引用写为 `<case-id>#R-####/AC-###`
- 方案修正块在该方案内使用 `AM-001` 起始的本地编号；引用写为 `<proposal-id>#AM-###`
- Debate 方案的 owner slot 使用方案内 `SLOT-001` 起始编号；引用写为 `<proposal-id>#SLOT-###`
- 方案快照 manifest 使用方案内 `PS-001` 起始编号；引用写为 `<proposal-id>#PS-###`。`ACK` 必须指向一个 `PS-###` 及其审查块，不得只引用“最新版”或裸哈希
- 每个验收实施快照使用 case 内 `AT-001` 起始编号；返修后再次实施与验收必须创建新的 `AT-###`，不得覆写前次结果
- `ANSWER`、`OBJECTION`、`AMENDMENT`、`ACK`、`TESTIMONY` 与 `WITHDRAWAL` 的 target 必须指向原始编号或方案内明确块
- 摘要、裁定与验收结论必须引用其依据的 `Q-###`、`BOS-###/BO-###`、`S-####`、`E-####`、`R-####`、`DES-###`、`CR-###`、`AT-###` 或方案/快照编号；引用建立可追溯关系，不允许复制原文后脱离原编号独立演化
