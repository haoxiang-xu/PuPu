---
case_id: 0000-0002-2026-0807
title: Trace 的 Memory V2 词汇与旧实现清理
track: full
status: filed
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T17:10:00-07:00
updated_at: 2026-08-07T17:10:00-07:00
---

# Trace 的 Memory V2 词汇与旧实现清理

承接 `0000-0001-2026-0807`（已中止，R-0001）的待裁问题 Q1 / Q9 / Q10。

## 为什么 Q1 与 Q10 必须同案

`0000-0001-2026-0807#S-0005`（`code-owner-runtime`）出具：trace 上 Curator 的 `Isolated` 状态有 **6 个产点，其中 4 个在 `memory_v2_curator.py`** —— 正是 Q10 要删除的文件。**Q1 若基于当前 trace 词汇立规格，规格会挂在待删代码上。** 该发言明确要求两问同时裁。分开立案即违背此项已归档意见。

## 待裁问题

- **Q1** Memory V2 在 trace chain 中体现什么。已归档的两项发现须先处置：
  - 后端另产一条与 presenter 四态（Complete/Partial/Legacy/Unavailable）**正交** 的轴 —— Curator 的 `status: "Isolated"` + `reason` + `worker_status`。`Isolated` 有渲染落点，但 **`worker_status` 在 `src/` 中零引用，产出即丢弃**（`0000-0001-2026-0807#S-0005`）
  - 「本轮 V2 编译是否完整」与「本轮产生的记忆有没有被整理」是两件事，现被拍平在同一条 trace 上。缺的不是状态种类，是 **分层**
- **Q1-前段** 流是否承载 V2 帧。`0000-0001-2026-0807#S-0006`（`code-owner-chat-core`）主张：presenter 能体现什么取决于 `streaming_message_store` / `runtime_events_v4` 承不承载 V2 帧，让 schema 承载新数据是 **跨面契约变更**。**该发言要求本问与 presenter 议题绑定裁决，不得拆开** —— 拆开会让 `code-owner-chat-bubble` 被要求渲染它拿不到的数据
- **Q9** 命名债务（`memory_agent_settings.js`、`memory_v2_unchain_agent_factory.py`、"Memory Agent" 文案）是否清理、何时。**约束：清理不得重新引入 Builder 卡片或 recipe 节点**
- **Q10** 旧实现何时删除。**前提已被更正**：`memory_v2_toolkit.py` / `memory_v2_curator.py` / `memory_v2_workspace_adapter.py` / `memory_v2_context_adapter.py` **不是不可达 fallback，而是 `pupu_legacy` 数据平面的唯一实现**；删除是 **弃用一个 store owner**，不是清理死代码（`0000-0001-2026-0807#S-0005`）

## 必到角色与交付

- `code-owner-chat-bubble`: `ASSESSMENT` — `src/COMPONENTs/chat-bubble/**`，presenter 与 trace 渲染
- `code-owner-chat-core`: `ASSESSMENT` — 流是否承载 V2 帧（Q1 前段）
- `code-owner-runtime`: `ASSESSMENT` — `pupu:unchain_runtime/**`，产帧端与全部待删文件的 owner
- `expert-llm`: `ASSESSMENT` — 流式帧语义（帧类型、顺序、终态）
- `expert-architecture`: `ASSESSMENT` — 跨 owner 边界；弃用一个数据平面是结构决策

**必到 5 人。** 传唤须遵 [A-012](../../../codex/adaptations.md) 的两条实践：**分小批串行**，且 **必到角色不得派生自己的勘察子 instance**。

## 已知缺口

- `pupu_legacy` schema 的存量安装是否真实存在，只能证明当前代码不再新产生，**无法证明历史版本没产生过**（`0000-0001-2026-0807#S-0005` 的不确定性声明）
- 本案继承的证据 `0000-0001-2026-0807#E-0001…E-0015` 已入台账；`#S-0006` 的候选证据 CE-1…CE-8 **未经验证、未分配编号**，引用者自行承担举证责任

## 文件索引

- 尚未开庭
