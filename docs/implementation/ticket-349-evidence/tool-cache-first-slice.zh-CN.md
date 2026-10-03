# Ticket #349：本地 journal 缓存第一阶段结果

日期：2026-09-26（schema、REPLACE 与首次读取竞态修复后的修订版）

后续两项验收修复见[最新修复记录](tool-cache-final-repair-2026-09-26.md)。下方性能数字
属于此前的 100 次采样，本次触发器升级和启动状态兼容修复未重新测量性能。

## 这次改了什么

同一个运行中的 `JournalContextRequestFactory` 和
`ContextCompileCoordinator` 现在共享一个本地 journal 视图缓存。

首次构建仍然从 SQLite 读取并验证完整快照；快照和当前 execution 的
`integrity_revision` 在**同一个只读事务**里取得，不能把旧快照错配到新 revision。之后每次
构建会在一个事务内确认 revision、缓存 high-water 前的事件数量和 cursor 未变化；校验通过时
只从上一个 high-water cursor 读取尾部事件，再把“旧的完整前缀 + 新尾部”验证为完整
`JournalSnapshot`。SQLite 对 event 和 operation 的更新、删除，以及 `INSERT OR REPLACE`
导致的替换都会推进该 revision，使缓存退回完整 durable snapshot。因此 payload、索引身份或
operation linkage 的损坏不能绕过原有完整性检查。

缓存只持有 journal 的弱引用，因此完成的运行不会被全局 cache registry 留在内存中。
工具调用、开始、结果、artifact 和 context build 的写入路径没有改变；缓存不保存
未落库的工具结果，也不会批量或延迟 durable write。

## 基准方法

使用实际 Unchain SQLite journal、request factory 与 compile coordinator。每组 10 次
预热、100 次采样；fixture 构建不计时，未包含 provider 网络、token 生成、Electron/IPC、
sidecar 启动或真实 Memory Agent。

缓存关闭时分别采用改动前的两条路径：request factory 获取并复制完整快照，compile
coordinator 获取完整快照。缓存开启时两者共享一个 `RunLocalJournalViewCache`。因此两组
比较的是相同的 context 工作，不能把缓存关闭路径额外加入的校验或复制算入结果。

“新工具结果”场景的每一个预热和采样都使用独立的 SQLite fixture：先预热旧历史的缓存，
再同步写入一个 tool call/result 对，最后计量紧随其后的 context build。原始 100 次样本
和汇总均由 `benchmark_step1.py` 输出；复现实验：

```bash
PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src python \
  docs/implementation/ticket-349-evidence/benchmark_step1.py \
  --samples 100 --warmups 10 --turns 1 25 100 --worker-delay-ms 0
```

| 历史长度 | 场景 | 关闭缓存（中位数） | 开启缓存（中位数） | 改善 |
| --- | --- | ---: | ---: | ---: |
| 1 条 | 稳定续跑 | 5.631 ms | 6.673 ms | -18.5% |
| 1 条 | 新工具结果后的首次续跑 | 11.268 ms | 12.347 ms | -9.6% |
| 25 条 | 稳定续跑 | 77.853 ms | 52.543 ms | 32.5% |
| 25 条 | 新工具结果后的首次续跑 | 87.120 ms | 72.642 ms | 16.6% |
| 100 条 | 稳定续跑 | 315.205 ms | 186.294 ms | 40.9% |
| 100 条 | 新工具结果后的首次续跑 | 321.783 ms | 263.404 ms | 18.1% |

缓存关闭时每次 context build 读取 2 次完整 snapshot。缓存开启时读取 0 次完整 snapshot、
2 次 tail read；即使有新工具结果，tail read 也读取了刚落库的事件。revision/前缀校验
中位数为 1.04–1.61 ms，因此 1 条历史出现 8.5–21.9% 回归；它是完整性保障的固定成本，
不应把这个 cache 当作短会话优化。25 条以上的收益仍来自避免重复的 SQLite 全量读取与
序列化，不能替代后续的按需历史读取、compact 策略或 Memory V3 设计。

本轮原始 100 次样本的 SHA-256 为
`1f7333c47783147523a3323c271db26b830b1c3745c86b3a4449f34adda1ff6e`。

> 本文替代先前报告的 46% 数据。旧报告的关闭缓存路径比实际旧路径多做了快照复制/验证，
> 且“新工具结果”只在一个 fixture 上重复计时，不能作为公平的性能结论。

## 验证

- 缓存单元测试覆盖完整前缀复用、持久化尾部合并、cursor 失效后的 durable rehydrate。
- SQLite 防回归测试覆盖“high-water 事件仍存在但较早前缀被删除”时 fail closed、payload/
  索引身份/operation linkage 被改写时 fail closed，以及完成运行可被垃圾回收。
- Context V2 全套测试通过：`1459 passed, 1 skipped, 1 xfailed`。
- PuPu store-boundary 与 Memory V2/Unchain runtime、context、worker 回归集通过：`43 passed`。
- PuPu 额外验收 11 项：旧 `{1,2}` 数据库升级、event/operation `REPLACE`、首次读取竞态、
  缓存删除/损坏和正常尾部合并全部通过。
- 基准脚本同时输出开启/关闭缓存的原始样本、完整 snapshot/tail read/前缀校验次数、耗时和事件量。

## 边界条件记录

- **BC-349-01 / SEQ-349-02 / AC-349-01、02、03、09：** 缓存只持有已验证的 durable
  snapshot；新的工具结果先完成 durable append，之后才可由 tail read 进入模型上下文。
- **BC-349-02 / SEQ-349-03 / AC-349-06：** 缓存只在当前进程、当前 `BoundExecutionJournal`
  对象存活期间有效；重启、冷运行或无效 cursor 都从 SQLite 重新取得权威快照。
- **BC-349-05 / SEQ-349-05 / AC-349-07：** 本阶段未更改 provider 请求或 worker 协议，
  但 SQLite Context V2 schema 升级到 `{1,2,3}`。PuPu owner admission 同时识别旧
  `{1,2}` 为可迁移的 Unchain store，未知或混合 schema 仍拒绝；Unchain read-only status
  兼容 v2/v3，返回真实版本且不执行迁移。active rollout 前仍需按照主实施计划验证精确 PuPu candidate
  与同一个 Unchain wheel。
