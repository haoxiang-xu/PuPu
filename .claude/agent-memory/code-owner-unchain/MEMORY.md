# code-owner-unchain — Memory Index

- [unchain 出证必须对齐 lock revision](unchain-evidence-must-cite-lock-revision.md) — 庭审证据要核 `unchain-core.lock.json` 的 revision，别只读本地 dev 工作树；只读手法在文内
- [import unchain 失败是 harness 缺陷](unchain-import-bootstrap-trap.md) — 先 import `unchain_adapter` 触发产品自带 sys.path bootstrap；这是实跑 `store_owner=unchain` 的唯一正确姿势
- [Context V2 边界契约与状态矩阵](../../../docs/architecture/context-v2-boundary-contracts.md) — 跨仓变更除双边 impact 外还须实例化 BC/SEQ，并证明 real producer → strict consumer 与 exact lock pair
- [locked revision 测试隔离陷阱](locked-revision-test-isolation-trap.md) — venv 是 editable install 指向 sibling；不覆盖 PYTHONPATH 就会把 dev HEAD 当成 lock 版出假证
- [懒 import 掩盖 locked-pair 断裂](lazy-import-defers-locked-pair-breakage.md) — sidecar 能起服务≠兼容；要直接 import 懒加载模块或按符号核 lock 那一版
