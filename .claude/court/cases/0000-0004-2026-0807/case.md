---
case_id: 0000-0004-2026-0807
title: 只读 task-state 契约与 flag-off 的记录完整性
track: full
status: filed
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T17:10:00-07:00
updated_at: 2026-08-07T17:10:00-07:00
---

# 只读 task-state 契约与 flag-off 的记录完整性

承接 `0000-0001-2026-0807`（已中止，R-0001）的 Q6，并升格该案庭审中由 `code-owner-chat-core` 补出的 Q4-C。

两问同案的理由：都落在 **PuPu host ↔ unchain 的边界上**，且都是 **可能产生不可逆后果** 的决定。

## 待裁问题

- **Q6** 是否新增严格 scope-bound 只读 `getTaskState` 契约。**层数已被更正**：`0000-0001-2026-0807#S-0005`（`code-owner-runtime`）出具 —— 它 **不是四层，是五层**，第 0 层在 unchain 仓库（`sqlite_read_v2` 没有 task-state 只读面）。该发言的明确请求是：**把此问交 `code-owner-unchain` 对质** —— Q6 能不能做，取决于 unchain 是否愿意出一个 **只读** task-state 投影；若答案是「用现有 `bind_task_state`」，则本端 **不成立**
  - 附带约束（`0000-0001-2026-0807#S-0006`，越维参考）：`getTaskState` 若成立，须与 `getSessionHead` 用 **同一个 scope 入参形状** `{ownerChatId, sessionId}`；两套形状会让入口层被迫维护两套坐标
- **Q4-C（升格为独立待裁项）** **rollout 降到 off 之后，sticky V2 chat 的 turn mutation 是否仍应 fail closed。**
  今天的行为是「否」：`context_v2_turn_mutation.js:184` 第一条即 `if (flagEnabled !== true) return legacy("flag_off")` —— **flag 一关，编辑/删除立刻回到 V1 replace 路径，直接写 V1 短期记忆，而该 chat 的 canonical 记录在 V2 journal 里。**
  这正是该文件头注释用整段篇幅论证「绝不能发生」的记录分叉，只不过 flag off 被明确列成了合法出口。
  而实测 `enable_memory_v2` / `memory_v2` / `memoryV2` 在 `side-menu/`、`chat-header/`、`chat-messages/`、`chat-input/` **零命中** —— 会话面 **没有任何一处知道一个 chat 是不是 V2**，用户无从分辨，也不会收到警告。
  **待裁：这个选择是刻意的，还是没想过关 flag 的场景。** 若是后者，它是一条会静默产生不可修复分叉的数据完整性缺陷

## 必到角色与交付

- `code-owner-unchain`: `ASSESSMENT` — 第 0 层。**本案的关键对质对象**：unchain 是否出只读 task-state 投影
- `code-owner-runtime`: `ASSESSMENT` — Flask route 层，Q6 的提出方
- `code-owner-electron`: `ASSESSMENT` — IPC channel 与主进程服务层
- `code-owner-shared-arteries`: `ASSESSMENT` — `src/SERVICEs/bridges/**` renderer 侧
- `code-owner-chat-core`: `ASSESSMENT` — Q4-C 的取证方；turn-mutation 决策链路的 owner
- `expert-security`: `ASSESSMENT` — 新增 IPC/bridge 面的暴露评估
- `expert-architecture`: `ASSESSMENT` — 跨仓库接口；弃用/降级路径的可逆性

**必到 7 人 —— 本批最宽的一个案。** 若 [A-012](../../../codex/adaptations.md) 的收窄实践尚未被验证有效，**本案应最后开庭**。

## 已知缺口

- unchain 侧是否愿意出只读投影，**目前只有 PuPu 一侧的陈述**，尚未取得 `code-owner-unchain` 的证言 —— 这正是本案要补的
- `pupu_legacy` 存量安装是否存在，无法证否（见 `0000-0002-2026-0807`，同一不确定性）

## 文件索引

- 尚未开庭
