# Side Case 分叉

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

case 推进过程中发现的 超出当前 case 范围 的问题，通过 side case 机制分叉处理：

1. **分叉动议**: 任何 agent 在庭审中，可用 `SIDE_CASE_MOTION` 对 超出当前 case 范围 的问题 动议开立 side case；动议必须附上 触发该动议的 **证据**，并声明其与 parent case 的关系 (**blocking** 或 **non-blocking**)；无证据支撑的动议不予受理
2. **动议传达**: `Speaker of the House` 归档动议及其证据，并将其传达给对应的裁定者
3. **立案裁定**: 声明为 **non-blocking** 的动议，由 `Procedural Judge` 裁定是否立案；声明为 **blocking** 的动议，由 `Chief Judge` 裁定是否立案；`Procedural Judge` 认为 non-blocking 动议实际应属 blocking 的，上报 `Chief Judge` 裁定
4. **立案关联**: side case 正式立案后，从 **议案庭审** (第 2 步) 开始，走完整的 [case lifecycle](README.md)；归档时标注 parent case 的 **议案编号** 及 **blocking / non-blocking** 关系:
    - **blocking**: parent case 挂起，待 side case 结案后恢复推进
    - **non-blocking**: side case 与 parent case 各自独立推进
5. **并发约束**: 多个 case 需要同一 agent 时，依据 **只读参与可并行，写入参与串行** 的规则处理 —— 出庭作证，出具意见，出具鉴定等 **只读参与** 可并行；代码实现，action 执行，内容维护等 **写入参与** 排队串行 (详见 [Roles 各角色的并发规则](../roles/README.md))
