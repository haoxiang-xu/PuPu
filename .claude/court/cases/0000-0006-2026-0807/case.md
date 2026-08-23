---
case_id: 0000-0006-2026-0807
title: trace 行缺少失败视觉
track: express
status: filed
phase: combined
parent_case_id: null
relation: null
created_at: 2026-08-07T23:36:29-07:00
updated_at: 2026-08-07T23:36:29-07:00
---

# trace 行缺少失败视觉

承接 `0000-0002-2026-0807#S-0006`（`code-owner-chat-bubble`）。

## 待裁问题

**Q1 · 记忆这一步出问题时，trace 行该长什么样。**

今天的事实：**`Isolated` 与 `Completed` 渲染为同一个点、同一种颜色。** 不是"不明显"，是 **trace 行上不存在「失败」这个视觉**。

`#S-0006` 同时指出：Q1 原本的提法（"缺分层"）是错的 —— **分层已经是四个 status 面**，病是 **三个面共用同一套词**。因此本案要裁的不是"再加一层"，是 **在已有的四个面上，失败态如何被看见**。

**Q2 · 数据够不够，不够则本案挂起。**
`Isolated` 今天 **已有渲染落点**（`memory_v2_journal_reload.js:130` 映射 `memory.curator.isolated`），故本案 **原则上不需要新数据**。但依 `0000-0002-2026-0807#E-0016`，`Isolated` 只在 `pupu_legacy` 面产出 —— **发布配置下这条轴产出为零**。
**所以本案须先答**：要让用户在 **发布配置** 下真看见失败，所需的状态是否已在渲染端可得？若否，本案 **依赖 `0000-0005-2026-0807`**（那四个降级键）先行落地，本案挂起等待，不得先画一个没有数据喂它的视觉。

## 分档

**Express，提出者自报。**

不报 Fast Track 的理由：Fast Track 要求 `chief-judge` 在指派时即给出 **可验收的完成标准**，而"失败该长什么样"**正是本案要产出的东西** —— 没有它就写不出验收标准，`acceptance-inspector` 会拒绝受理。这不是规避快车道，是快车道的准入前提在此不成立。

其余三条 Fast Track 条件本案均满足（完全可逆 · 不改契约 · 不涉金钱发布），故不升 Full。合并庭审一次，`chief-judge` 以一条 `EXPRESS_RULING` 同时裁议案与方案。

## 必到角色与交付

- `code-owner-chat-bubble`: `ASSESSMENT` — `src/COMPONENTs/chat-bubble/**`，trace 行渲染与状态映射
- `expert-ux`: `ASSESSMENT` — 触发条件「布局与视觉层级」「交互状态」「可访问性（对比度、明暗对等）」三项命中

**2 人 —— 本批最小的一案。** 建议以它验证 Express 档 + A-012 在小规模下的墙钟成本，为后两案排期提供数据。

`expert-architecture` **未命中**：只跨一个 code-owner 边界，未触及共享原语或跨仓接口。
`code-owner-shared-arteries` **未命中**：本案不改 presenter，只消费其已产出的状态；**但若 Q2 的答案是「数据不足」，它即成为事后认定的法定必到者**，须补行传唤（[quorum 第四节](../../../codex/lifecycle/quorum.md) 名单只增不减）。

## 已知缺口

- **发布配置下失败态的真实产出情况未知** —— 见 Q2。这是本案能否独立成立的前提，须在议题框定阶段先答
- 本案不处置「三个面共用同一套词」中 **词** 的那一半，那归 `0000-0007-2026-0807`

## 文件索引

- 尚未开庭
