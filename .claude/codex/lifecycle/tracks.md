# Track 分档（已退役兼容页）

[法典索引](../README.md) · [现行讨论模型](discussion-model.md)

> **状态：仅用于解释 2026-08-10 以前创建的 PuPu 历史案卷。不得用于新案、返修、重分类或增员。**

旧案卷中的 `Fast / Express / Debate / Full`、`track`、`phase`、`FAST_TRACK_DIRECTIVE`、`EXPRESS_RULING`、`DEBATE_RULING` 与“完整九步”等字段，按当时规则保留为历史事实，不追溯改写。它们不再是现行 Quorum 的 intake 选项。

现行规则只有两个正交维度：

- `discussion_type: motion / proposal`：讨论判断问题，或讨论具体怎么做；
- `procedure_mode: collaboration / debate / full`：一律从最小协作开始，只能由真实异议升级。

单一被主 owner 拒绝的 material 异议进入 Debate；相同或可共同解决的异议仍合并为 Debate。只有至少三名且严格超过半数的合作 owner 的有效被拒异议无法合理合并，Speaker 才可决定是否开程序票；全部 N 的严格过半支持后才进入 Full（众议庭）。风险、不可逆、契约变化、发布或 owner 数量本身均不触发 Full。

## 历史 action 的非追溯过渡

1. 生效日前已经由旧规则有效授权、且已经进入 implementation 的 action，可以严格按其已冻结 directive/方案、owner 边界、回滚与 AC 完成实施及验收；这只是兑现既有授权，不产生新的 Fast 权力。
2. 不得用旧 Track 扩大实施范围、修改 AC、增加 owner 责任、改变授权边界或开启新的 legacy stage。出现任一变化时，停止旧 action，另立新的 `P-*` proposal；新案从 `collaboration` 与一个主 owner 开始。
3. 尚未获得 action 授权的旧案不得再通过 `FAST_TRACK_DIRECTIVE / EXPRESS_RULING / DEBATE_RULING` 获得新 action。`Chief Judge` 只能以一条明确标注 `legacy bridge · pre-2026-08-10` 的现行裁定关闭/终止旧案，或建立链接的新 `M-* / P-*` case。
4. 既有 `0000-*` 编号、旧 frontmatter、记录和引用永久保留，不重编号、不回写成新 schema。

新流程只参考[讨论生命周期](README.md)、[交棒与参与](summons.md)、[辩论庭](debate-court.md)和[众议庭](full-court.md)。
