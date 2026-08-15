# Context V2 P0 Contract Incident Postmortem — 2026-08-11

> 严重度：P0  
> 状态：代码修复已于 2026-08-12 落地；治理与发布门禁同步加固中  
> 范围：PuPu + Unchain Context/Memory V2  
> 当前契约索引：[Context V2 Boundary Contracts](context-v2-boundary-contracts.md)

> **SUPERSEDED CONTROL NOTICE（2026-08-14）：** 本文是事故历史记录。下文关于 pinned release、lock revision 与 exact locked pair 的表述记录的是当时控制手段，现已失效，不得作为当前 admission 或发布依据。现行 runtime compatibility 只认实际 import 的 Unchain runtime 导出的 strict protocol manifest；发布连续性由一次构建后全程复用的 wheel SHA-256 + manifest digest 证明；Git revision/source 仅为遥测。

## 一、用户影响

用户在正常发消息和后续工具 interaction 中遇到三类失败：

```text
Unknown parameter: 'input[5].attachments'
context_v2_journal_message_projection_invalid
pending interaction no longer matches the current prompt/tool schema
```

这些错误阻断了聊天或 interaction 继续执行。没有证据表明事故造成 durable 数据损坏；相关路径选择 fail closed，因此主要影响是可用性和用户对 Memory/Context V2 的信任。

## 二、事实时间线

- **2026-08-04**：Unchain `f3e9590` / `a4e69f4` 落地 Context/Memory V2 P0；PuPu dev active path 随后接入。
- **2026-08-07**：交接文档已明确完整 provider、normal/graph/resume/subagent、重启恢复和 packaged/canary 矩阵未完成，但该信息没有成为 active rollout 的硬阻断。
- **2026-08-08**：Architecture 与 QA private memory 分别记录“接缝优先取证”和“宽松准入断言会失明”；这些记忆没有进入所有方案的必经流程。
- **2026-08-11**：用户在真实连续使用中报告上述错误。
- **2026-08-12**：Unchain `d0572979` 和 PuPu `4a050d75` 落地 projection、strict provider contract、interaction sequence、terminal identity、错误归一化和 pinned release evidence 修复。

## 三、三个直接根因

### 1. Durable attachment envelope 泄入 provider wire

Context Compiler 的 message 使用普通 dict 承载 journal content 与 durable `attachments` provenance。后续 provider preparation 把这份通用对象当成 provider message；OpenAI Responses 正确拒绝未知的顶层 `attachments`。

根因不是 OpenAI 临时改变 API，而是我们没有在 journal representation 与 provider wire 之间建立显式、严格的 projection boundary。

修复：新增 `ModelContextProjection`，从 execution-bound artifact 物化 provider-neutral block；OpenAI、Anthropic/Hyperspace、Ollama 在最终 wire 前分别做 exact-field validation，顶层 `attachments` 永远不进入 provider。

### 2. Plain root iteration 被误判成 graph scope

journal final/terminal projector 使用一个统一 `_WorkflowIdentity`。旧条件把“存在 iteration、没有 workflow step”一律视为冲突，但 plain root 事件本来就合法携带 iteration。

修复：plain root 允许 iteration-only；graph 仍要求 node/step identity；final 与 terminal 必须在适用维度上匹配，错 iteration 继续 fail closed。

### 3. Fresh interaction 与 resume interaction 依靠隐式状态区分

Context Runtime 旧路径会读取 durable active receipt，再根据上下文猜测当前 tool call 是恢复旧 interaction 还是创建新 interaction。连续两个 approval 时，第二个 fresh request 可能与第一个已完成 request/receipt 比较，触发 schema/prompt mismatch。

修复：resume 必须显式同时携带 `interaction_request` 与 `interaction_response`；两者都不存在才是 fresh；只存在一边立即失败。连续 approval 必须产生不同 interaction ID，旧 entry 已 application，新 entry 尚无 receipt。

## 四、为什么基础问题会穿过设计与实现

这不是三位工程师分别忘了三个 `if`，而是同一种系统性缺口：

1. **按 owner/文件分工，未把 owner 之间的接缝当成方案对象。** producer 与 consumer 各自正确，不代表组合正确。
2. **一种 generic dict 承担多种语义身份。** journal、model、provider wire 形状在类型和命名上没有被迫分离。
3. **测试从 consumer-shaped fixture 开始。** 它们没有持续使用真实 producer 输出喂给 strict consumer，因而遗漏多余字段。
4. **只测第一条 happy path。** first attempt、first interaction、warm process 通过，不能证明第二条消息、第二次 interaction 或冷重启。
5. **已知缺口没有接入 rollout gate。** 交接文档明示矩阵不完整，但 `NOT_RUN` 没有自动等价为 active rollout `INCOMPLETE`。
6. **经验只在 private memory。** 只有召唤特定专家时才能读到，proposal、Speaker、Acceptance 与 CI 都不会强制消费它。

所以“这是很基础的问题”和“它仍穿过一个复杂系统”并不矛盾：局部基础检查没有一个统一责任人，且缺少可执行的组合门。

## 五、为什么原测试仍然能绿

- 宽松 object/Mapping 与 partial assertion 允许多余字段存在；
- mock/fixture 直接构造 consumer 期望形状，没有经过 journal producer；
- approval 测试聚焦单次 suspend/resume，没有覆盖 resume 后再触发一个 fresh approval；
- terminal 测试覆盖 graph identity，却没有把 plain-root iteration 作为独立语义；
- release smoke 是一个 root attempt，不等价于同 chat 第二次 attempt、两次 interaction 与冷重启矩阵。

## 六、已完成的纠正

- journal → model → provider 形成三段明确 projection；
- final provider message 使用 strict allowlist，未知字段本地拒绝；
- 使用真实 artifact/journal producer 的正负契约测试；
- 增加 repeated/cold Context P0 composition matrix；
- 增加连续两次 approval、半对 resume fields、durable receipt authority 测试；
- 增加 plain-root 与 graph terminal identity 正负测试；
- PuPu 错误归一化只保留 allowlisted code/reason；
- blocking release checkout 改为使用 lock revision，而不是隐式 sibling dev HEAD。

## 七、永久防复发控制

1. Quorum proposal 用 `BC-###` 将边界作为一等对象，用 `SEQ-###` 将时间序列作为一等对象。
2. 所有 BC/SEQ 必须映射到可执行 `AC-###`；Acceptance 不得 PASS 未映射或未运行的适用单元格。
3. PuPu 全体 Claude 始终加载 `.claude/rules/cross-boundary-contract-gate.md`。
4. CI/release 使用 real producer → strict consumer、负向未知字段、重复/恢复/重启与 exact locked pair。
5. private memory 只留索引，canonical 原则与事实分别放在 precedent 和本复盘中。

## 八、后续非阻断风险

本事故修复不自动证明所有未来 media/provider 组合已经完成。remote `file_id` 的 provider/account 绑定、非字符串 assistant content、PDF 预算精度等后续问题仍应按新的 BC/SEQ 门另案处理；不得借 P0 已修复把它们误报为已验证。
