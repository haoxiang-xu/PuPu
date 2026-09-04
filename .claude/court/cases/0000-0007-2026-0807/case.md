---
case_id: 0000-0007-2026-0807
title: 接入已有的 typed 终态词汇
track: full
status: filed
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T23:36:29-07:00
updated_at: 2026-08-07T23:36:29-07:00
---

# 接入已有的 typed 终态词汇

承接 `0000-0002-2026-0807#S-0014`（`expert-llm`）与 `#S-0018`（`code-owner-runtime` 改票时的改述）。

**本案的出发点是一条否定结论**：`0000-0002-2026-0807` 认定 **不存在「要定义一套 trace 词汇」这件事** —— 一套闭集、typed、构造时校验的终态词汇 **已经存在** 于 `unchain.memory.curator.models`，PuPu active 面已在四个模块消费它。因此本案裁的是 **接线**，不是设计。

## 待裁问题

**Q1 · 把已有的 typed 终态词汇接到 trace 侧，接法是什么。**
`#S-0014` 认定 (a) 的锚点是 **上游 typed 枚举**，而非 `#S-0006` 最初提名的那两个（已被 `#S-0013` 证其不成立）。

**Q2 · 回执投影：新建还是接线。**
`#S-0018` 的改述：`unchain_adapter.py:9471` 写入后 **零读取**，`last_receipt` / `last_failure_code` 两个 property **全仓零消费者**。故 **不是「缺产出者」，是「回执已 typed 存在于进程内存，缺的是把它送出去的投影」—— 从新建降级为接线**。
**该 owner 的约束 4 完整存活**：`0000-0002-2026-0807` 的删除动作仍须排在此投影之后。

**Q3 · 产端载荷形状声明 —— 本案的 blocking 前置。**
`0000-0002-2026-0807#S-0020` 必要条件 2 载明：**词汇规格不得只写成一张表；产端必须先有一个被声明的载荷形状**（位于 `unchain_runtime` 的顶层键声明，`_memory_v2_merge_diagnostics` 与 `update_diagnostics` 的全部写入点都经过它，对未声明键 **fail-loud**）。缺此条，"先定词汇"定出的表 **没有产出方承认它**。

实测支撑（`#E-0068` / `#E-0069` / `#E-0070`）：收端有 59 项冻结表、**产端一张都没有**；写入点 **约 24 个**（庭上此前的核算只覆盖了其中一个函数）；`update_diagnostics` 是 **整字典替换** 而非合并，且代码库已为此缺陷 **各自绕行两次、两次互不知道对方存在**。

> **`#S-0020` 请求 1 明确要求**：把「`memory_v2` 帧载荷的产端声明」列为一个 **单独的待裁交付物，指名 `code-owner-runtime` 独自持有**，不得写成产端与收端的共同交付 —— 收端白名单 **不能升格成它**，因为收端 fail-closed 与 schema fail-loud 方向相反。
> **书记员意见（待 `chief-judge` 定）**：本案暂将其登记为 blocking 前置。若 `chief-judge` 认为它应独立立案，本案挂起等待其结案。

**Q4 · 形态取舍的 quorum 前置。**
`#S-0020` 必要条件 7：**若形态裁向「过程信号 + 新增 runtime event 类型」，在 `code-owner-unchain` 的必到资格被第三层门禁重判之前，该支不得进入方案庭审。**

## 分档

**Full。** 改契约（新增投影与帧字段语义）。

## 必到角色与交付

- `code-owner-runtime`: `ASSESSMENT` — `pupu:unchain_runtime/**`，回执投影的产端与 Q3 的独任交付物
- `code-owner-shared-arteries`: `ASSESSMENT` — `src/SERVICEs/runtime_events/**`，收端消费
- `code-owner-chat-bubble`: `ASSESSMENT` — 词汇最终在此呈现；`#S-0006` 关于"三个面共用一套词"的诊断归其复核
- `code-owner-unchain`: `ASSESSMENT` — 词汇的 canonical 定义在其仓内；Q4 的 quorum 前置直接指向它
- `expert-llm`: `ASSESSMENT` — 触发条件「流式帧语义」「tool schema 的形状与措辞」命中；`#S-0014` 系其出具，本案须由其复核是否仍成立
- `expert-architecture`: `ASSESSMENT` — 触发条件「跨两个及以上 code-owner 边界」「触及跨仓库接口」命中

**6 人。** 传唤依 [A-012](../../../codex/adaptations.md) 分小批串行（建议 3 批），必到角色不得派生勘察子 instance。

## 已知缺口

- **`#S-0020` 系以替代模型出具**（`0000-0002-2026-0807#S-0021` 已归档该偏离）。其自陈全部事实主张可由所附证据机械复核，且给出了正确的缺口登记方式；**本案引用其必要条件 2 与请求 1 时，须自行复核 `#E-0068`–`#E-0070`**
- **`#E-0069` 的 45 个产端键是下界不是全集** —— 字面量抓取漏掉变量键、f-string 键、`**dict` 展开。Q3 的声明范围不得以该数字为准
- 本案 **不含** 失败态的视觉呈现（归 `0000-0006-2026-0807`）与那四个降级键的白名单处置（归 `0000-0005-2026-0807`）

## 文件索引

- 尚未开庭
