# 后移独立工作：三项验收问题的修复记录

日期：2026-09-26。三项修复已完成实施验证；这是修复记录，不替代下一次正式验收。

| 问题 | 修复后的行为 | 证据 |
| --- | --- | --- |
| F1 后台登记失败连带使回答失败、候选未入队 | 登记写入失败时，保存不含密钥的原子重试记录；回答正常完成，官方整理任务照常持久化。后台先恢复登记再处理任务，旧模型配置不会越过待恢复记录执行。 | 普通官方 hook、真实 graph stream 故障注入；冷 dispatcher 恢复选定模型并完成同一任务一次；错误记录格式和删除场景测试。 |
| F2 官方九工具集合被四工具校验拒绝 | 只接受两个明确的官方集合，向整理模型投影四个候选工具；保留来源、租约保护和实际操作记录。未知或不完整集合仍拒绝。 | 实际 wheel 的 toolkit → 实际 PuPu invoker → 严格 raw factory → 真实 SQLite 任务完成。 |
| F3 候选已保存但内容引用无法返回 | 增加候选内容引用的严格编码/解码，保留空间、候选 ID 和版本。不会额外授予读取权限。 | 真实 memory_propose 返回及幂等重放；非法 URI/空间拒绝；真实桌面保存成功。 |

## 验证结果

- **224 项测试最终通过**：冻结候选运行 223 项通过，1 项因测试按源码层级寻找仓库契约文件失败；该项改用原始测试位置、仍导入冻结服务端代码后通过。没有修改产品逻辑来绕过测试。
- **旧版本对照四项失败**：普通完成故障、图完成/冷恢复故障、工具集合不兼容、候选内容引用不可表示。四项在修复版本均通过。对照首次因 fixture 路径未配置而未能收集，修正测试路径后才取得这里引用的缺陷证据。
- 新增 21 项覆盖自动恢复、旧配置隔离、非法登记格式/身份、删除防复活、实际 producer/consumer、真实候选结果和非法引用。
- 既有回归覆盖普通/图执行、恢复、后台凭据缺失、来源变更、删除、读取隔离、模型选择及 legacy 路径。没有新增前台等待、模型调用或每请求线程。

[冻结版本测试](step3-fix-tests.txt)、[单项路径修正复测](step3-fix-contract-path-retry.txt)、[修复前对照](step3-fix-red.txt)。

## 真实桌面结果

使用隔离 Electron 和重新启动的冻结 Python sidecar，前台 GPT-4.1、后台 Memory Agent GPT-5。测试使用合成内容及同一聊天的真实来源事件。

1. 第一轮返回 READY。
2. 第二轮 memory_propose 正常返回候选已保存，不再出现保存后编码失败。
3. 一个整理任务进入 `completed`，候选进入 `applied`，无错误码、只尝试一次。
4. 通过桌面的 `contextV2API.readContent` 读到准确内容：`Synthetic verification marker: violet lighthouse 349.`
5. 完全停止并重启隔离桌面和 sidecar 后，内容、唯一任务及其完成状态保持一致，没有重复整理。

前台两轮应用总时长为 3916 / 6945 ms，仅作为功能实测记录；它们不是首字时间，也不是速度优化对比。后台任务从创建到完成约 9669 ms，未让前台等待整理完成。此前约 6 秒的前置耗时仍未由本修复解决。

[实际返回及持久化任务](step3-fix-live-result.json)、[重启前桌面读取](step3-fix-live-before-restart.json)、[重启后桌面读取](step3-fix-live-after-restart.json)、[后台模型选择](step3-fix-background-selection.json)。

## 版本与限制

- 服务端冻结摘要：`2fc751141bcb120ff0ccfd557186766650cab8f4f6b264957c8616e21e19949b`，374 文件，测试后逐文件验证工作区未漂移。
- 固定 wheel SHA256：`03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`，347 个安装文件与原 wheel 逐字节一致，未重建或修改 Unchain。
- 实际导入的 runtime manifest：`sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`。
- GitNexus：host factory / codec 为 CRITICAL（均 22 个影响符号、3 个直接导入方），修改前已提示；实际调用方为 active/shadow bridge、run binding，工具投影由 invoker.run 调用。新增后台符号查找为 UNKNOWN，以源码补查生命周期、前台完成和 legacy 调用。Unchain producer build_memory_toolkit 为 LOW，2 个直接调用方、0 个已识别流程；producer 未修改。
- 登记重试文件只保存严格的非敏感模型选择。冷重启后缺少密钥或自定义连接信息仍保持可重试状态，不换用其他模型。如果 SQLite 登记和独立重试文件两处存储同时不可写，无法保证持久化准备；这一双重存储故障不会被当作成功吞掉。
- BC-349-07/08/09、SEQ-349-06、AC-349-18/19/20 见[直接实施计划](../ticket-349-defer-independent-work.md)。隔离测试通过不代表安装包发布或正式验收 PASS。

测试聊天已删除，隔离进程及含加密设置的临时配置已清理，临时依赖链接/功能开关已移除。日常桌面仍在运行，未更新。没有提交、PR、关闭 ticket 或修改发布状态。

[文件清单](step3-fix-source-manifest.json)、[运行身份](step3-fix-identity.json)、[清理结果](step3-fix-cleanup.json)。
