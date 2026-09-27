# 后台模型选择修复验收：通过

日期：2026-09-26。范围是上一轮后台模型选择并发修复及其直接调用路径；不代表 #349 后续全部步骤完成。本次未修改产品代码，未更新日常桌面端。

## 结论

没有发现新的阻断问题。上一轮 P2 已修复：官方运行库先领取任务，随后在注册锁内读取最新模型配置、待恢复状态和对应临时参数。后台扫描时读到的旧配置不再用于实际模型构建。

待恢复记录存在时，任务进入官方重试流程，模型调用数为零。成功取得配置后立即释放锁；正在运行的调用保持自己的快照，后续登记影响后续调用，模型网络等待不会锁住前台登记。这符合计划 BC-349-10 / SEQ-349-07 / AC-349-21 声明的选择时点，不是新增每个历史任务永久绑定入队时模型的机制。

## 五项检查

1. **i18n：PASS。** 全量扫描 10 个语言，缺失、孤立和占位符不匹配均为零，代码没有缺失英文 key。保留已有 65 个 dead keys、48 个动态调用点；没有自动修改翻译。
2. **UI：N/A。** 本轮产品变更只有服务端 Python，无新增 UI。
3. **模型 × agent builder：PASS / compatible。** recipe、节点模型、character 和 subagent 配置格式未变，后台仍使用原来的选择器和模型工厂。六项并发回归覆盖旧扫描行、新登记、失败恢复及模型阻塞时继续登记；新配置与临时参数正确配对。图执行和既有模型选择路径测试通过。
4. **静态规则：PASS。** 本轮没有 renderer IPC、localStorage、路由、主题、层级或 Electron 双测试入口变更；差异检查通过。
5. **端到端：PASS。** 本次重新启动隔离 Electron 与冻结 Python sidecar，使用真实 GPT-4.1 进行两轮请求。真实 memory_propose 产生候选，官方后台任务 completed、attempt_count=1，候选 applied；桌面 contextV2API 读取到完整且准确的 53 字节合成记忆内容。

## 独立验证

- 冻结候选与固定 wheel 重新运行 **107 项测试，全部通过，27.34 秒**。包含正常/graph 完成、legacy、模型 effort、延后准备、登记失败、重试、冷恢复、删除/重置保护及后台阻塞期间下一轮前台准入。
- 原验收交错复现重新运行：`process_result=retry`，新任务 `pending`，`actual_model_selections=[]`。删除交错也没有复活登记行。
- 增加六个只用于本次验收的探测，均使用真实 SQLite 任务，并把变化注入到官方任务已领取、模型尚未调用的时点：延后登记、成功登记、登记行缺失、未知配置字段、错误 schema 版本、SQLite 暂时不可用。成功登记使用新模型及对应参数；其余五个场景没有构建/调用模型，任务保持 pending 并记录可重试错误。
- 真实桌面两轮应用总耗时为 **4505 ms / 6704 ms**。这只是本次功能实测值，不是首字时间或优化前后对照。

测试中的交错时序和故障由探测脚本控制，整理执行器为确定性替身；正常桌面链路另外使用真实模型验证。两类证据不混同。

## 版本与影响范围

重新核对 375 个冻结候选文件、对应工作区源文件，以及固定 wheel 的 347 个安装文件；均匹配。候选摘要按 source-manifest 的紧凑 JSON 计算。

- PuPu server candidate：`sha256:ea0cebe2a686955dc331b770ede8fd393efc9fc66f1e21fbaaf539ba578bc448`
- Unchain wheel：`sha256:03735e882580c0276856acb4804edb215097e1c4e5a6041ef6bbcf0f663f0e44`
- 真实桌面运行协议：`sha256:2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`

PuPu GitNexus 对新增的 process_owner / selection_for_claimed_job 返回 UNKNOWN，不能据此声称没有调用者；已用源码确认 dispatcher → process_owner → cold host → official claim → source guard → selection → model factory 的实际链路。Unchain 的 MemoryAgentHostAdapter 上游分析为 LOW，3 个受影响符号、1 个直接导入文件、0 个已识别流程；另外直接检查固定 wheel 中先 claim 再调用 invoker 的顺序。没有从未解析的图节点推断 agent builder 不受影响。

## 记录与清理

本目录 `step3-selection-audit-*` 保存测试、i18n、版本身份、原始复现、六项探测、真实桌面产物、界面读取、调用链及清理证据。原冻结文件列表见 `step3-selection-source-manifest.json`。

测试会话已删除，独立桌面实例已停止，临时设置目录、依赖软链接和功能开关已清理；日常桌面仍在运行。未提交、创建 PR、关闭 ticket 或开展发布。

本轮验收通过对应当前候选和上述修复范围。#349 保持 OPEN，依验收流程转为 In Review；后续 Memory V3 步骤仍按原计划推进。
