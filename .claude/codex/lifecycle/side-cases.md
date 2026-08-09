# Side Case 分叉

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

case 推进过程中发现的超出当前范围的问题，先进入 **范围外清单**，不得立即占用当前庭审。只有可能改变 parent 当前裁定的事项才可作为 blocking side case 动议进入主流程：

1. **范围外登记**：任何已获准参与的 agent 可提交范围外事项；`Speaker of the House` 以 `PARK_OUT_OF_SCOPE` 记录问题、触发条件及与当前 case 的关系，不为它开启论证线程、核验证据或增加参与者。
2. **blocking 动议**：主张该事项阻塞 parent 的，必须点名当前 `BOS-###` 中一个开放 `BO-###`，以及对应 `Q-###` 或已冻结异议中的开放 `S-####/RC-###`，并说明不解决它为何无法裁定；动议须先通过统一相关性门。同一 BO/Q/RC 最多获准一个 blocking child，child 结束后不得换标题为同一条件再次立案。BOS 冻结后发现却无法映射现有 BO 的新事项，不能直接成为 blocking child，只能交 `Chief Judge` 重框、拆案或另立 case。
3. **立案裁定**：所有 side case 均由 `Chief Judge` 决定是否立案及 blocking 关系。non-blocking 事项在 parent 结案后统一选择，`Procedural Judge` 不得在 parent 开放期间自动立案。
4. **立案关联**：side case 正式立案后重新判定 Fast、Express、Debate 或 Full，并重新由 `Chief Judge` 批准初始参与名单；归档时标注 parent case 的议案编号及 `blocking / non-blocking` 关系：
    - **blocking**: parent case 挂起，待 side case 结案后恢复推进
    - **non-blocking**: side case 与 parent case 各自独立推进
5. **并发约束**：多个已批准 case 需要同一 agent 时，依据 **只读参与可并行，写入参与串行** 的规则处理。

范围外事项本身以及用于说明“为何值得日后处理”的材料，不进入 parent 的决策证据集。只有用于证明“为何它阻塞当前裁定”的证据，才可能通过相关性门进入 parent。

blocking 获准后，parent 进入 `awaiting-blocking-side-case` 并记录 `blocking_case_id`。child 为 `closed` 或 `terminated` 都不自动恢复 parent；`Chief Judge` 必须以 `SIDE_CASE_RULING` 明示恢复或终止 parent。为阻断递归分叉，`relation: blocking` 的 child 不得再创建 blocking child；新发现的阻塞缺口留在该 child 的摘要中，由 `Chief Judge` 依据现有记录裁定或终止。
