# 编号与交叉引用

[Quorum 索引](../README.md) · [Court Records](README.md)

- 议案编号与方案编号为全局编号，沿用 `0000-0001-YYYY-MMDD` 格式及各自独立序列
- `S-####`，`E-####` 与 `R-####` 只在一个 case 内唯一；跨 case 引用必须写为 `<case-id>#S-####`，`<case-id>#E-####` 或 `<case-id>#R-####`
- 方案引用使用完整方案编号，不以“方案一”“最新版”等别名代替
- 每份方案的验收标准在该方案内使用 `AC-001` 起始的本地编号；跨方案引用写为 `<proposal-id>#AC-###`
- 方案修正块在该方案内使用 `AM-001` 起始的本地编号；引用写为 `<proposal-id>#AM-###`
- `ANSWER`，`OBJECTION`，`AMENDMENT`，`TESTIMONY` 与 `WITHDRAWAL` 的 target 必须指向原始编号
- 摘要，裁定与验收结论必须引用其依据的 `S-####`，`E-####`，`R-####` 或方案编号；引用建立可追溯关系，不允许复制原文后脱离原编号独立演化
