# Cross-Boundary Engineering Gate

本规则始终生效。它只保留跨边界工程安全要求，不使用 owner、case、proposal、ruling 或任何庭审机制。技术记录直接写入 Release issue 或普通实施 Plan；历史案卷不具有当前授权或阻断效力。

## 何时触发

改动、方案或验收只要命中任一项，就必须执行本门禁：

- 跨 repository、process、IPC、HTTP/SSE、provider SDK 或持久化边界；
- 同一对象从 journal/domain model 投影为 compiler/model/provider wire；
- 修改封闭 schema、allowlist、序列化、版本握手、runtime protocol manifest 或发布 artifact；
- 行为依赖 attempt、interaction、retry、resume、restart、replay 或 rollout 状态；

不适用时在 Release issue 或普通实施 Plan 中写 `NOT_APPLICABLE` 及可核验理由。沉默不等于不适用。

## 方案义务

每一条真实边界建立一个技术性 `BC-###`，正文直接保存在 Release issue 或普通实施 Plan：

1. producer、consumer 与传输边界；
2. producer shape、canonical representation、consumer/wire shape；
3. admission policy：`CLOSED / OPEN / VERSIONED`；
4. projection、未知字段、失败与降级语义；
5. identity、schema/version、runtime protocol compatibility 与部署 artifact identity 绑定；
6. 正向、负向 `AC-###` 以及真实 producer → 严格 consumer 的证据计划。

只要行为依赖历史或持久状态，就建立 `SEQ-###`：

1. identity key、初始状态与按顺序发生的事件；
2. 每一步的可观察结果；
3. repeat、retry、resume、restart、reset、rollback 中适用的单元格；
4. persistence boundary、关联 `BC-###` 与 `AC-###`。

`BC/SEQ/AC` 只是工程追踪标识，不生成角色、投票、确认、案卷或授权流程。实施 agent 可在已批准的用户目标和 Release scope 内直接维护这些内容。

`Mapping`、普通 object/dict、宽松 fixture 或 `toMatchObject` 不是 wire contract。`CLOSED` 边界必须精确比较 key set；`OPEN` 边界必须明确 extension policy；`VERSIONED` 边界必须证明版本协商与 fail-closed 行为。

## 实施证据

- 先对 producer 与 consumer 两侧分别取证和做 impact；跨仓不能用单侧索引推断另一侧。
- 契约测试必须使用真实 producer 产物，最终 consumer 使用严格 validator 或 strict fake；禁止双方共享同一个宽松 helper 后互相证明。
- 对准入、投影和 wire shape 同时写负向测试；至少证明未知字段、错版本或错 identity 会在正确边界失败。
- schema/allowlist 修复应保存 red-before-green 证据；只有修后全绿不能证明测试曾覆盖缺陷。
- runtime compatibility 必须由**实际 import 的 runtime module**导出的、独立严格校验的 protocol manifest 决定；Git revision、source path、checkout cleanliness 与环境变量只能作为遥测，不能参与 capability/admission。
- exact deployed artifact pair 必须测试：PuPu candidate + **一次构建后全程复用的同一个 Unchain wheel**。所有契约矩阵、package smoke 与 release report 必须核对同一 wheel SHA-256 和同一 runtime manifest digest；重新从 source 构建或直接测试 mutable sibling checkout 不能成为该发布物的证据。
- release builder 可以另行要求 source clean，用于构建可追溯与可复现；这属于 artifact provenance 门，不是 runtime compatibility、Git SHA allowlist 或 capability admission。

## PuPu 状态序列基线

按改动适用性至少评估以下矩阵，适用单元格必须成为 AC：

1. 第一次正常消息；
2. 同一 chat 的第二次正常消息；
3. 第一次 interaction；
4. 同一执行中的第二次 interaction；
5. retry 与 durable resume；
6. sidecar 冷重启后的 resume/replay；
7. normal / graph / subagent 等被改动的运行路径；
8. provider、runtime protocol manifest 或部署 artifact identity 变化后的精确组合。

标记 `N/A` 必须说明为什么该状态不可能到达；“本次没测”只能写 `NOT_RUN`。

## 阻断规则

- `BC-###` 或 `SEQ-###` 缺必要技术字段或缺 AC 映射：active rollout 保持 `INCOMPLETE`，先补齐 Release issue 或普通实施 Plan 与对应测试。
- 实施发现未声明边界：在不改变用户目标和 Release scope 的前提下直接补充 Plan 与测试；若会改变目标、范围或外部权限，则停止并请求 project owner 决定。
- 适用状态单元格为 `NOT_RUN / PENDING`：active rollout 结论只能是 `INCOMPLETE`；可以保持 shadow/off。
- 已运行但断言失败、schema/protocol 漂移或 artifact identity 不匹配：结论是 `NO-GO`。
- `release-feature-audit` 只按 Release issue / Plan 已声明的 BC/SEQ/AC 和现场证据验收；映射缺失或证据不足时报告 `INCOMPLETE`，不得自行发明标准。

PuPu 的当前 Context V2 实例见 [`docs/architecture/context-v2-boundary-contracts.md`](../../docs/architecture/context-v2-boundary-contracts.md)。事故事实见 [`docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md`](../../docs/architecture/context-v2-p0-contract-postmortem-2026-08-11.md)。
