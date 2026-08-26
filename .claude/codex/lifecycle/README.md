# Case Lifecycle 讨论生命周期

[Quorum 索引](../README.md)

Quorum 的 case 不是预先分档的流程包。每个 case 先确定讨论对象是 **议案** 还是 **方案**，再从一个主 owner 的最小协作开始；只有真实且未被主 owner 接受的异议才开启辩论庭，多数且不可合并的异议经投票后才可能升级为 Full（众议庭）。

## 共同起点

1. **提交讨论对象**：提出者声明这是一个待判断的议案，或一个待形成的方案，并固定目标与 `non_goals`。
2. **最小路由**：`Speaker of the House` 只选择一个主 owner，不建立预测性 roster。
3. **主 owner 首稿**：议案主 owner 提交回答；方案主 owner 提交自己边界内完整、边界外留空的方案骨架。
4. **契约与序列声明**：方案主 owner 依[边界契约与状态序列](boundary-contracts.md)声明适用的 `BC-###/SEQ-###` 或给出 N/A 理由。
5. **串行交棒**：必要空白由 Speaker 一次交给一位 owner 补全，再返回主 owner 集成；跨 owner 的 BC/SEQ 确认也通过 material HS 完成。
6. **合作审查**：实际承担交付的 owner 对当前快照 `AGREE / OBJECT / ABSTAIN`。

无实质异议，或异议均被主 owner 接受并完成修订后，当前材料可直接送 `Chief Judge` 裁定。默认协作不建立庭审 BOS、DES 或随机抽查；提交者仍须履行证据真实性与来源义务。Chief 可在裁定前点名补强或启动有限证据控制，但不能在没有被拒异议或有效 Full 投票时直接选择辩论庭或众议庭。

## 分歧路径

- 主 owner 拒绝一项 material 异议：`collaboration → debate`，依[辩论庭](debate-court.md)聚焦审理。
- 多数合作 owner 的被拒异议无法合并：满足门槛后由 Speaker 发起程序投票；严格过半支持才 `debate → full`，依[众议庭](full-court.md)全面审理。
- 讨论类别在升级中保持不变：议案始终是议案，方案始终是方案。

## 裁定后的路径

### 议案

`MOTION_RULING` 给出对判断问题的结论、适用边界、证据处置及异议处置，随后关闭该议案。结论需要 action 时另立一个 `proposal` case，并以 `derived` 关系引用本议案；不存在自动的“下一方案阶段”。

### 方案

独立方案的 `PLAN_RULING` 批准 action 时分配唯一 `AS-###`，随后进入：

1. **实施执行**：owner 依获准方案在各自边界内串行执行；
2. **验收评估**：`Acceptance Inspector` 对实施快照 `AT-###` 按带编号验收标准检查；
3. **失败回应**：方案主 owner 在冻结截止内对失败 AT 登记 `ACCEPT_FAILURE / DISPUTE_FAILURE`。接受失败不授权自行修改，而是直接送 Chief 作无庭审复议；对失败结论有争议时才进入验收庭审，由 Inspector 作为原告；截止后仍沉默也送无庭审复议，不推定任一立场；
4. **结案或复议**：通过后由 `ACCEPTANCE_RULING` 结案；失败时 `Chief Judge` 决定终止、拆案、回滚或授权一次受限实施返修。仅在原获准 PS/AS 边界内的返修保留原 proposal、procedure mode、AS 与证据历史；若必须改变方案、AC、owner 责任或授权边界，则以 `RECONSIDERATION_RULING: SPLIT` 建立 blocking side-case proposal，原 case 等待 child 完成后再明示处置失败 AS。

同一 action 的后继 `AT-###`、验收 SI、DES 与复议沿用原 `AS-###` 和抽样状态；只有此前验收争议实际冻结过 BOS 时才沿用该 BOS。不得用返修重置任何历史。

`relation: extension` 的子方案只形成并裁定父方案所需的组件方案块。其 `PLAN_RULING` 使用 `ruling_scope: COMPONENT`，批准后关闭 child 并把快照返回 parent，不授权 action、不创建 `AS-###`、也不单独进入实施或验收。若它是 blocking child，parent 仍等待明示 `SIDE_CASE_RULING: RELEASE`；组件获准本身不自动恢复 parent。只有父方案的 `ruling_scope: ACTION` 可以授权整体 action。

## 同类延伸

议案可以建立 blocking 或 non-blocking 子议案；方案可以建立子方案并把结果返回主 owner 集成。每个延伸 case 都独立应用最小主 owner 原则并从 `collaboration` 开始。跨类别只建立引用或 `derived` 关系，不形成固定阶段链。

## 子文档

- [讨论模型与最小主 owner 原则](discussion-model.md)
- [庭审发言协议](speech-protocol.md)
- [收敛与裁定控制](decision-controls.md)
- [边界契约与状态序列](boundary-contracts.md)
- [证据规则](evidence-rules.md)
- [Debate 辩论庭](debate-court.md)
- [Full 众议庭](full-court.md)
- [交棒、参与与传唤](summons.md)
- [延伸与 Side Case](side-cases.md)
