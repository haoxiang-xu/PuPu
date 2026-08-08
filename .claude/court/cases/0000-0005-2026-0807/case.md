---
case_id: 0000-0005-2026-0807
title: 降级信号被 trace 白名单丢弃
track: full
status: filed
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T23:36:29-07:00
updated_at: 2026-08-07T23:36:29-07:00
---

# 降级信号被 trace 白名单丢弃

承接 `0000-0002-2026-0807` 庭审中 `code-owner-shared-arteries` 提交的新事实（`#S-0013` / `#E-0034`）。

**这是本批三案中唯一一个「发布配置下今天就在发生」的缺陷**，其余两案是缺功能。

## 待裁问题

**Q1 · 那四个键加不加进白名单。**

`memory_v2_trace_presenter.js:9-69` 的 `TOP_LEVEL_KEYS` 是一张 59 项冻结表，**不含**：

```
unchain_context_status      unchain_context_error_code
unchain_shadow_status       unchain_shadow_error_code
```

而产端 `unchain_adapter.py:7451-7472` 的 `mark_host_partial` **按 `admission.is_active` 显式分支**，active 分支产出的正是 `unchain_context_status = "partial"`。四个键全落白名单外 → presenter 整个丢掉 → `resolveTraceStatus` 看不到降级信号 → **trace 在真实降级过的回合上报 `Complete`**。

**Q2 · 扩表按什么对待。**
`0000-0002-2026-0807#S-0020` 必要条件 6 已裁明：`TOP_LEVEL_KEYS` 的任何扩表 **必须以持久化 schema 变更对待**（唯一非渲染消费者是 `chat_storage/chat_storage_sanitize.js:739`），方案 **必须显式说明历史行的处置**，且 **这是单向门**。本案须给出该处置。

**Q3 · 一个制品同时是脱敏器与字段表，本案是否处置。**
`BLOCKED_KEY_PATTERN`（纯安全，fail-closed 且必须沉默）与 `TOP_LEVEL_KEYS`（被当字段表用，本应 fail-loud）写在同一文件相邻 60 行内。二者失败方向相反，合用一个制品必然导致「新字段被完全按设计丢掉且无人被告知」。
**注意**：加计数器这条处方 **已在本代码库实践过一次并失败** —— `event_store.js:186-191` 对未知事件类型已有记录，但全仓 `unknownEvents` 仅 6 行，**全部是定义、写入与结构透传，零读取、零展示、零告警**。

## 分档

**Full。** 触发两条：改契约（`TOP_LEVEL_KEYS` 按持久化 schema 对待）· 不可逆（`#S-0020` 认定为单向门）。**「只是加四个字符串」不构成 Fast Track 依据** —— 改契约强制 Full，与改动大小无关。

## 必到角色与交付

由 `.claude/skills/case/summon.py` 对本案议案文本机械导出，触发条件类由书记员按各自 charter 逐条对照后列入：

- `code-owner-shared-arteries`: `ASSESSMENT` — `src/SERVICEs/runtime_events/**`（presenter 本体）与 `src/SERVICEs/chat_storage/**`（唯一非渲染消费者）
- `code-owner-runtime`: `ASSESSMENT` — `pupu:unchain_runtime/**`，四个键的产端与 `mark_*_partial` 的触发条件
- `expert-security`: `ASSESSMENT` — 触发条件「密钥与凭据在日志与帧中的泄露面」命中：`BLOCKED_KEY_PATTERN` 与字段表合用同一制品，改动其一会不会削弱另一
- `expert-llm`: `ASSESSMENT` — 触发条件「流式帧语义（帧类型、顺序、**终态**）」命中：这四个键即终态信号
- `expert-architecture`: `ASSESSMENT` — 触发条件「跨两个及以上 code-owner 边界」「公共动脉的结构变更」命中

**5 人。** 传唤依 [A-012](../../../codex/adaptations.md) 分小批串行（建议 3 批），**必到角色不得派生勘察子 instance**。

## 已知缺口

- **触发频率未测。** `#E-0034` 严格证明的是「一旦 `mark_host_partial` 的 active 分支被触发，presenter 会报 Complete」，**不是**「用户经常看到错误的 Complete」。产端三处 `mark_*_partial` 的触发条件（何种异常会调用它们）**未追**
- `#E-0034` 的 bundle 由提交人按产点形状 **构造**，非真实 SSE 抓取
- **本案不含根因。** 产端无载荷形状声明（`#E-0068`）是本缺陷的上游成因，归 `0000-0007-2026-0807` 与其待定的独立交付物；本案只处置这一次已发生的丢弃

## 文件索引

- 尚未开庭
