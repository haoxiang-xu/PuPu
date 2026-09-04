# code-owner-unchain — Memory Index

- [unchain 出证必须对齐 lock revision（已废止）](unchain-evidence-must-cite-lock-revision.md) — 旧 Git-SHA lock 证据政策的历史记录；现行规则是 runtime manifest admission + 单一 wheel artifact continuity
- [import unchain 失败是 harness 缺陷](unchain-import-bootstrap-trap.md) — 先 import `unchain_adapter` 触发产品自带 sys.path bootstrap；这是实跑 `store_owner=unchain` 的唯一正确姿势
- [Context V2 边界契约与状态矩阵](../../../docs/architecture/context-v2-boundary-contracts.md) — 跨仓变更除双边 impact 外还须实例化 BC/SEQ，并证明 real producer → strict consumer 与 exact deployed artifact
- [locked revision 测试隔离陷阱（已废止）](locked-revision-test-isolation-trap.md) — 旧 lock 流程的 editable-install 假证陷阱；仅作事故考古
- [懒 import 掩盖 locked-pair 断裂（机制已废止）](lazy-import-defers-locked-pair-breakage.md) — “启动不等于执行路径兼容”仍成立；现由 runtime manifest + 单一 wheel artifact gate 解决
