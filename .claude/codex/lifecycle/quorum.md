# 旧 roster / quorum（已退役兼容页）

[法典索引](../README.md) · [现行交棒与参与](summons.md) · [现行讨论模型](discussion-model.md)

> **状态：只解释旧 PuPu 案卷中的 `initial roster / current roster / RP / quorum / ACK` 字段，不为新案建立名单、到场或增员规则。**

2026-08-10 以前，PuPu 以 `Chief Judge` 逐项批准的 current roster 组织到场与交付，并使用 ACK、缺席和故障记录推进旧 stage。这些记录保持 append-only；历史缺席不应被重写成 HS/RS，也不能据此推断今天仍有出庭、访问或投票资格。

现行新案不预测 roster：

- Speaker 只选择一个主 owner；
- 真实空白出现后，一次只开放一个有限 `HS-###`；
- 合规 RETURNED material HS 才使 owner 进入当前 `RS-###` 的合作 owner 集合；
- owner 对快照使用 `AGREE / OBJECT / ABSTAIN`，不使用旧 ACK；
- 非 owner 的实体参与使用有限 objection intake 或规范明示的 `RP-###`，但不会因此进入 N/D；
- Full electorate 在投票开启时冻结，不得用替补、故障或增员改变分母。

## 历史故障记录

旧 roster 中的调度冲突、运行时故障与无回应记录继续只表示当时事实，不自动批准替代者或重开旧 stage。新案的 owner handoff 失败使用 HS 的 `DECLINED / EXPIRED / CANCELLED` 与一次 deadline notice；仍需该内容时只可重新选择下一位边界 owner、转移 lead，或送 Chief 终止/重框，不能召回整份历史 roster。

历史案的过渡边界见[退役 Track 页](tracks.md#历史-action-的非追溯过渡)。
