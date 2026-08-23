# 判例：跨边界功能必须同时证明结构与时间序列

> 生效：2026-08-12  
> 来源：Chief Judge 批准吸收 Context V2 P0 事故经验  
> 事实记录：[`docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md`](../../../docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md)  
> 现行规则：[`cross-boundary-contract-gate.md`](../../rules/cross-boundary-contract-gate.md)

> **2026-08-14 机制修订：** 本判例中的“exact deployed pair”现在指 PuPu candidate 与一次构建、全程复用的 Unchain wheel（以 wheel SHA-256 + runtime protocol manifest digest 定位），不再指 Git SHA lock。实际运行时 compatibility/admission 只认已 import runtime 导出的 protocol manifest；Git revision/source 仅为遥测。以下历史推理仍有效，但旧 lock 机制不再具有现行权威。

## Holding

一个跨 repository、process、provider、serialization、persistence 或 durable-state 的功能，不能因 producer 与 consumer 各自测试通过而被视为已证明。方案必须把接缝实例化为 `BC-###`，把依赖历史的行为实例化为 `SEQ-###`，并将两者映射到可执行 `AC-###`。

最低证明义务是：

1. 真实 producer 输出能被独立 strict consumer 接受；
2. 不允许的字段、版本和 identity 会在正确边界失败；
3. 第一次能工作、第二次仍能工作；
4. 对持久能力，冷重启或 cold resume 后仍能工作；
5. 发布证据对应 exact deployed artifact pair，并证明 contract/package/release 消费同一 wheel SHA-256 与 runtime manifest digest；
6. 适用矩阵中的 `NOT_RUN/PENDING` 阻断 active rollout。

## Reasoning

边界缺陷存在于两个 owner、两种 representation 或两个时间状态之间。以文件为单位的 ownership、以函数为单位的单测和以 agent 为单位的 private memory 都不会天然覆盖“之间”。因此：

- 接缝必须是 proposal 中的 canonical object，不是 reviewer 的临时提醒；
- `CLOSED / OPEN / VERSIONED` 决定 exactness，不对所有 schema 盲目一刀切；
- 状态序列按适用性裁剪，但不能把“没测”写成 N/A；
- 16% evidence sampling 只核验已执行证据的真实性，不能缩减必须执行的 AC/SEQ；
- Acceptance Inspector 不创造标准，所以完整性必须在方案冻结和送裁前保证。

## 不成立的替代方案

- 只把经验写进一个 Expert 的 `MEMORY.md`；
- 只增加一个本地 hook；
- producer 与 consumer 共用同一个 permissive fixture/helper；
- 用 `toMatchObject` 或字段子集断言证明 closed wire schema；
- 用一次 happy-path smoke 代表 repeat/resume/restart；
- 用 mutable sibling checkout 的测试或重新构建的 wheel，代替同一发布 artifact 的组合证据。

## 射程

本判例不要求所有改动都创建 BC/SEQ。纯局部、无序列化、无跨状态且不改变契约的改动可以明确声明 `NOT_APPLICABLE + reason`。一旦触发条件成立，省略 BC/SEQ 不是轻量程序，而是不完整方案。

后续若 Quorum 上游改变 BC/SEQ 的 canonical 字段或状态，本判例随上游同步解释；PuPu 特有的 Context V2 profile 留在项目架构文档，不上升为通用 Quorum 事实。
