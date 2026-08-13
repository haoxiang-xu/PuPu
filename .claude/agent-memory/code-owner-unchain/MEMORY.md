# code-owner-unchain — Memory Index

- [unchain 出证必须对齐 lock revision](unchain-evidence-must-cite-lock-revision.md) — 庭审证据要核 `unchain-core.lock.json` 的 revision，别只读本地 dev 工作树；只读手法在文内
- [import unchain 失败是 harness 缺陷](unchain-import-bootstrap-trap.md) — 先 import `unchain_adapter` 触发产品自带 sys.path bootstrap；这是实跑 `store_owner=unchain` 的唯一正确姿势
- [Context V2 边界契约与状态矩阵](../../../docs/architecture/context-v2-boundary-contracts.md) — 跨仓变更除双边 impact 外还须实例化 BC/SEQ，并证明 real producer → strict consumer 与 exact lock pair
