# 三项修复后的验收：未通过

日期：2026-09-26。范围是上一轮修复的三个服务端文件及其直接依赖。
本次未修改产品代码。

## 唯一发现：P2 — 登记重试检查与任务领取之间存在模型选择竞态

位置：`unchain_runtime/server/memory_v2_background_worker.py:436–461`。

`process_owner` 先检查登记重试文件，再查询待处理任务，最后使用先前传入的
`row.config_json` 构造模型。这几个动作没有共用版本校验或原子边界。前台正好
在文件检查之后完成一轮新对话时，可以产生以下合法顺序：

1. 后台读取旧登记配置 `memory-model`，检查时没有重试文件；此时尚无整理任务。
2. 同一聊天的新根运行 `new-model-root` 选择 `new-model`，生成真实候选。
3. 注入的登记 SQLite 写入失败触发真实重试文件保存；新根运行正常完成，官方
   整理任务成功入队。
4. 后台继续查询，发现这个新任务，却将旧 `model_id=memory-model` 交给模型工厂。
5. 工厂收到旧值时，新模型的重试文件仍然存在；真实 SQLite 任务被执行并完成。

这违反 BC-349-07 / AC-349-18 中“待恢复登记阻止旧配置执行”的要求。顺序测试
只覆盖了进入 `process_owner` 之前重试文件已经存在的情况，没有覆盖检查与
领取任务之间发生前台完成的窗口。

建议把登记配置的版本、重试状态和所领取任务的执行选择绑定起来，并在模型
调用前确认仍有效；加入上述交错顺序的回归。只在同一位置再读一次文件仍会
留下检查与使用之间的窗口，也不应持有全局登记锁等待模型网络请求。

复现使用真实新一轮 active bridge、graph 完成入口、候选和官方 SQLite 任务；
只控制交错时点、注入登记写失败，并用确定性整理执行器替代模型传输。
捕获的是传给模型工厂的旧配置，**不是一次真实外部模型误调用的观测**。

[复现结果](step3-fix-audit-reproduction.json)、[复现脚本](step3-fix-audit-reproduce.py)。

执行脚本时，将冻结服务端、冻结 tests 和同一安装 wheel 加入 PYTHONPATH：

```sh
PYTHONPATH=.local/ticket-349-defer-fix/server:.local/ticket-349-defer-fix/server/tests:.local/ticket-349-live-timing/installed-wheel:.local/ticket-349-cache-checkpoint/extra312 /Users/red/Desktop/GITRepo/unchain/.venv/bin/python docs/implementation/ticket-349-evidence/step3-fix-audit-reproduce.py
```

## 已确认修复及五项检查

1. **i18n：PASS。** 10 个语言没有缺失、孤立或占位符不匹配；代码没有缺失英文
   key。已有 65 个 dead keys、48 个动态调用点，未修改翻译。
2. **UI：N/A。** 本轮三个文件均为服务端 Python，无新增 UI。
3. **模型 × agent builder：FAIL / conflict found。** picker、recipe、character
   schema 没有改变；但上述后台执行选择可能不遵守该轮登记的新模型。GitNexus
   codec 当前上游结果为 LOW、3 个直接导入文件、0 个已识别流程；源码补查实际
   invoker、后台 host 和模型选择路径，没有把无已识别流程当作无调用。
4. **静态规则：PASS。** 本轮没有 renderer IPC、localStorage、路由、主题或
   Electron 双测试入口变更，差异检查无空白错误。
5. **端到端：FAIL。** 正常真实桌面路径通过，但配置竞态复现失败，故整体不通过。

本次重新运行 **99 项针对性测试，全部通过**，包括上一轮故障恢复和工具/引用
回归；它们不能抵消未被覆盖的并发顺序。原 F2 工具集合和 F3 候选返回问题已
确认修复。原 F1 的单次登记故障及冷恢复路径通过，模型选择隔离尚不完整。

额外验证了登记恢复与聊天删除交错：官方 SQLite 删除保护拒绝恢复写入，删除后
登记行保持 0，没有复活数据；该探测不列为问题。

[本次测试](step3-fix-audit-tests.txt)、[完整 i18n 报告](step3-fix-audit-i18n.json)。

## 新的真实桌面实测

重新启动隔离 Electron 和冻结 Python sidecar，使用真实 GPT-4.1，后台沿用
Memory Agent 的模型选择。第一轮返回 READY，第二轮实际 memory_propose 成功。
一个任务变为 `completed`，候选变为 `applied`。通过桌面 contextV2API 读到准确
合成内容 `Synthetic verification marker: violet lighthouse 349.`，证实产物实际
到达界面使用的读取入口。

两轮应用总时长为 5106 / 8245 ms，只是功能实测记录，不是首字时间或优化对比。
并发问题的复现与这次正常网络实测分别取证，没有混为一条成功链路。

[真实模型及任务](step3-fix-audit-live-result.json)、[界面读取证明](step3-fix-audit-live-ui-proof.json)。

## Artifact 与状态

- PuPu 候选：`2fc751141bcb120ff0ccfd557186766650cab8f4f6b264957c8616e21e19949b`，374 文件逐个核对，工作区产品源码未漂移。
- 同一 wheel：`03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`，347 个已安装文件逐字节一致。
- 实际运行 manifest：`sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`。
- #349 仍是 Release #216 的直接子 issue，PUPU Project 的 Release Size 和子 issue
  membership 已重新核实。因验收 FAIL，保持 OPEN / In Progress。
- 探测聊天已删除，隔离进程、临时加密设置配置、依赖链接与开关已清理，日常桌面
  保持运行。没有提交、PR、关闭 issue 或发布。

[身份核对](step3-fix-audit-identity.json)、[清理记录](step3-fix-audit-cleanup.json)。
