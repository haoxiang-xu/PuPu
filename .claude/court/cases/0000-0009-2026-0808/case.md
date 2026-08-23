---
case_id: 0000-0009-2026-0808
title: shadow 面持久化失败中止用户回合
track: null
status: filed
phase: motion
parent_case_id: 0000-0005-2026-0807
relation: non-blocking
created_at: 2026-08-08T21:30:00-07:00
updated_at: 2026-08-08T21:30:00-07:00
---

# shadow 面持久化失败中止用户回合

**Side case，parent = `0000-0005-2026-0807`，关系 `non-blocking`。**

立案依据：`0000-0005-2026-0807#R-0001`（`procedural-judge` 程序裁定，准予立案，维持自报 non-blocking）。
动议：`0000-0005-2026-0807#S-0018`（`code-owner-runtime` 提交）。
支撑证据：`0000-0005-2026-0807#E-0039`（自证类，已归档）。

## 待裁问题

**一个纯观察面（`shadow`）的写入失败，应否中止用户当前这一轮对话？**

该问要回答的是一项 **保证的取舍**，不是一处 bug 的修法：`shadow` 面的设计意图是「观察而不影响」，而当前链路使其具备 **中止宿主回合** 的能力。

动议列举了三个可能答案（**只列举，未选**）：

- **(i)** 维持现状，观察面与宿主共享同一失败保证
- **(ii)** 观察面失败降级为静默并另行可见
- **(iii)** 观察面失败降级，但宿主回合被标注为「观察缺失」

三者对帧语义、对 Memory V2 的可验收性、以及对 parent case Q1 的严重度含义 **各不相同**。

## 已知事实（继承自 parent case，不要重新取证）

链路（`0000-0005-2026-0807#E-0039`，自证类，PuPu `b2385d5d` / unchain `a4e69f41`）：

```
unchain_adapter.py:10188-10192   runtime_event_callback = shadow_bridge.compose_event_callback(on_event)
unchain_adapter.py:10280         作为 agent.run(callback=...) 传入（resume 同形 :10893 / :11002）
memory_v2_unchain_shadow_bridge.py:328-353   persist_or_forward —— 无吞异常
unchain context/runtime.py:1903-1923         persist_before_host —— 持久化先于宿主回调，try/finally 只 reset contextvar
unchain kernel/loop.py:678-695               emit_event 的 callback(event) —— 无 try/except
unchain_adapter.py:10318-10329 → :10397-10405   终点 output_holder["error"] → raise error
```

**同形亦见 active 面**：`emit_if_active`（`:10172-10181`）内 `persist_host_event` 无 try/except。

### 改动面：本案改的是 API，不是接线

`code-owner-unchain` 于 parent case 出庭后主动送来，**请在 `FRAMING` 中写死，勿等第一轮才发现**：

> `compose_event_callback` 在 unchain 内的 **唯一调用点是 `agent/builder.py:973`** —— 即 **每一个配了 `context_runtime` 的 agent**。
> 因此任何 mode-aware / best-effort 变体，都是对 **全部 V2 宿主** 生效的行为变更。

依该 owner charter 的跨仓硬纪律，此类改动 **两侧 impact 齐备才可合并**。

**这条写进 `FRAMING` 的目的，是让本案从第一轮就知道自己在改 API 而非改接线** —— 该 owner 明说这正是它给动议的第二处修正想防的误读。**来源：`code-owner-unchain` 于 `0000-0005-2026-0807` 出庭期间转达，尚未在本案分配证据编号；采信前须由本案自行核实到 `file:line`。**

## 已知缺口

- **未做故障注入，未观察过一次真实的 shadow 写失败。** `#E-0039` 是静态读取
- **未核实 shadow 面在发布构建下是否可达**（依赖 rollout 取值，`0000-0005-2026-0807#E-0038`）
- **一项复核在途**：unchain kernel loop 内部是否存在把 durable 异常降级为可继续状态的通路，已交 `code-owner-unchain`（parent case S-0015）。**若结论为「存在降级」，本案所述链路的终点随之改变，但不消除本案** —— 那种情形下取而代之的是「回合正常结束而观察面已静默丢失」，同样需要一个容器

## 与 parent case 的单向依赖（务必保留，勿压缩）

`0000-0005-2026-0807#S-0005` 的核心结论（**触发条件与可观测条件互斥**）**成立的前提之一，正是异常会传播并中止该回合**。

> **故本案若朝「让 shadow 失败不再中止回合」的方向处置，恰恰会 *解除* 那道互斥，把 parent case 的缺陷从「结构上不可达」变成「可达」。**

这不构成 blocking（parent case 今天可裁，且裁定内容不变），但它意味着：**任何据「今天不可达」而作出的 *降低严重度* 的裁定，其有效期以本案的处置方向为界。** `procedural-judge` 已就此显式呈报 `chief-judge`（`0000-0005-2026-0807#R-0001` 第四节）：若不采纳条件化写法，该「静默失效」风险 **不存在第二道救济**。

## 尚未确定的三项

- **track 未分档。** 动议未自报档位；`procedural-judge` 的授权只能对自报档位 **上提一档**，无标的即无裁量。**分档待提出者自报或 `chief-judge` 指定**
- **出庭名单未生成。** 依[传唤机制](../../../codex/lifecycle/summons.md)机械导出，**parent case 的名单不是本案的名单**。动议已指出其 owner 集合不同：链路终点在 `pupu:unchain_runtime/**`，中段在 `unchain:**`，取舍需 `expert-llm`（帧语义与终态）与 `expert-architecture`（跨层保证）
- **本裁定不授权任何代码改动。** 立案取得的是 **容器不是方案**；`code-owner-runtime` 的「不动相关代码」自我约束继续有效，直至本案产出获准方案

## 严重度定性（动议原文，未经本案独立核实）

parent case Q1 的用户可见后果是「trace 上一个词不对」；**本案的用户可见后果是「这一轮回答没有了」。**

## 文件索引

- 动议与证据：`../0000-0005-2026-0807/record.md#S-0018` · `../0000-0005-2026-0807/evidence.md#E-0039`
- 立案裁定：`../0000-0005-2026-0807/ruling.md#R-0001`
