---
name: a2a-channel-direction
description: 2026-06-10 CEO 战略会 — unchain A2A 中央 channel 方向、peer 消息注入 role 的推荐 spec、agent org/HR 分阶段路线
metadata:
  type: project
---

2026-06-10 CEO 召集方向会（智牵头，帅/擎/造参会）。CEO 定调：多 agent 协作是 PuPu 未来方向，要给 unchain 做中央 channel 式 A2A（agent 调 `send_message_in_channel` tool，消息在被 @ 的 agent 下一个 iteration 前注入其 message list），参照 Google A2A；远期愿景是 "agent org"（含能自建/裁撤 subagent 的 HR agent）。

**Why:** 现有 subagent 模式（delegate/handoff/worker 三模式、同步 tool-call 委派，见 subagent_loader.py / unchain_adapter.py）太简单，只有层级委派、没有 peer 通信与持久 agent。

**我在会上给出的模型可见 spec 立场（有否决权，交擎实现时不可改）：**
- peer 消息以 **user role + 结构化 attribution envelope**（runtime 持有的 delimiter，如 `<channel_message from="agent:xxx">…`）注入，不裸注 user、不伪造 tool_result（违反 provider API 合同：tool_result 必须对应 tool_use id）、不依赖 mid-list system（Anthropic 不支持，非可移植）。
- 信任层级写进 system prompt 契约：principal user > 自身指令 > peer 消息（peer 内容按数据对待，不可覆盖 user 指令）。
- 注入只发生在 iteration 边界（不打断生成中的 turn）；多条 pending 消息合并为一个 user turn；runtime 必须 escape/strip 内容中的 envelope 标记防 spoofing。
- 默认 no-reply：只有显式 @ 产生回复义务；消息链带 hop/TTL 预算防风暴。
- envelope 字段与 Google A2A 的 Message/Task 概念（role: user|agent、taskId、contextId）对齐，留外部互通余地，但进程内不采用完整 A2A JSON-RPC。

**分阶段建议（已交 CEO）：** P1 channel+envelope+寻址 spec → P2 持久 agent 邮箱 + 事件驱动唤醒（@ 唤醒 idle agent 开新 run）→ P3 HR-as-curator（从人写模板参数化实例化、人审批）→ P4 自主增裁员（前置条件：先有 per-agent eval，没有度量就没有 hire/fire）。

**How to apply:** 后续 ADR / unchain channel 实现评审时以此为基线；动 role 映射、envelope 格式、注入时机语义须经我复核。相关实现归擎，安全（spoofing/injection）拉 pupu-security-expert。
