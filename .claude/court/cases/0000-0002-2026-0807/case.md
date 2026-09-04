---
case_id: 0000-0002-2026-0807
title: Trace 的 Memory V2 词汇与旧实现清理
track: full
status: awaiting-ruling
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T17:10:00-07:00
updated_at: 2026-08-07T19:50:00-07:00
---

> **庭审状态：议案庭审已闭庭（S-0023），待 `chief-judge` 裁定。** quorum 9/9 满足，六批串行、零 instance 死亡。闭庭产出见 `record.md` 的 **S-0022（`SUMMARY`）**，A-012 完整验证数据见 **S-0023**。
>
> **闭庭附带一项条件，裁定前须先看**：本案 quorum 的完整性 **以「裁定不含『新增 runtime event 类型』或『改 unchain events 词汇表』两类动作」为条件**（S-0019 的 U-C4 休眠条件）。裁定若包含其一，须补行传唤 `code-owner-unchain` 后重新闭庭。
>
> **强制回应清单**：S-0020 不成立 (i) · S-0020 不成立 (ii)（**该项针对本庭签发的 S-0010**）· S-0014 的 5 条必要条件 · S-0020 的 8 条必要条件。
>
> **两项须在恢复前带入的更正**：① `Isolated` 字面量产点是 **5 个不是 6 个**（4 在 `memory_v2_curator.py`，第 6 处是映射表非产点），由 `code-owner-runtime` 自行更正（S-0007 N-5），**本文件上方「为什么 Q1 与 Q10 必须同案」一节的「6 个产点」应按此读作 5**；耦合比例变紧不变松，同案理由不受影响。② 「`pupu_legacy` 存量安装无法证否」这条已知缺口 **已被推翻** —— 本机存在一个真实、非空（473 MB / 1,387,400 行）的 `pupu_legacy` store，且其隔离改名 **无对应代码路径**（E-0007 / E-0024）。**但由此推出的「存量处置是删除的必要前置」这一 *推论* 已被 S-0020 判为不成立**（其 *事实* 不受争议）；E-0077 补齐了该项自陈的唯一未核实点，产生 **两种相反读法，本庭不择其一**。③ `workflow_list.test.js` 是 Q9 约束强制点的记载 **对一半不成立**（S-0017 更正本庭框定：「recipe 节点」那一半今日零强制）。

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

**8 人。** 立案时记载 5 人；`speaker-of-the-house` 于开庭时重跑传唤第一层（逐份读取全部 31 份 charter 的边界声明），补正为 8 人。补正依据、逐条命中理由与三条边界自愈信号见 `record.md` 的 S-0002 与 S-0003。依 [quorum 第四节](../../../codex/lifecycle/quorum.md)「名单只增不减」，新增三人为法定必到者。

- `code-owner-runtime`: `ASSESSMENT` — `pupu:unchain_runtime/**`，产帧端与全部待删文件的 owner
- `code-owner-chat-bubble`: `ASSESSMENT` — `pupu:src/COMPONENTs/chat-bubble/**`，`Isolated` 的唯一渲染落点
- `code-owner-chat-core`: `ASSESSMENT` — 流是否承载 V2 帧（Q1 前段）
- `code-owner-shared-arteries`: `ASSESSMENT` — **补正**。`pupu:src/SERVICEs/runtime_events/**` 是 `memory_v2_trace_presenter.js` 与 `trace_chain_adapter.js` 的实际归属；Q1 的 presenter 本体与 Q1-前段的 `runtime_events_v4` 均在此
- `code-owner-settings`: `ASSESSMENT` — **补正**。`pupu:src/SERVICEs/memory_agent_settings.js` 是 Q9 逐字点名的文件，也是该 charter 逐字声明的一行
- `code-owner-agents`: `ASSESSMENT` — **补正**。Q9 自带约束（不得重新引入 Builder 卡片 / recipe 节点）今天由 `pages/recipes_page/workflow_list.test.js:121-144` 的活测试强制
- `expert-llm`: `ASSESSMENT` — 流式帧语义（帧类型、顺序、终态）；Q9 的 prompt 常量
- `expert-architecture`: `ASSESSMENT` — 跨 owner 边界；弃用一个数据平面是结构决策

传唤须遵 [A-012](../../../codex/adaptations.md) 的两条实践：**分小批串行**（本案分四批，每批 2 人），且 **必到角色不得派生自己的勘察子 instance**。

## 已知缺口

- ~~`pupu_legacy` schema 的存量安装是否真实存在，只能证明当前代码不再新产生，**无法证明历史版本没产生过**~~ —— **已闭合，见 E-0007 / E-0024**。本机存在真实且非空的 `pupu_legacy` v4 store（473 MB，`operations` 1,387,400 行，`freelist_count = 0`），已被 **人手**（非代码路径）隔离改名。**n = 1 且为 dev 机器，不支持任何关于用户安装比例的推论**
- **新增**：产品 **没有任何机制处理存量 `pupu_legacy` store**（E-0024）。Q10 若照当前清单删除，用户机器上会留下无主目录 —— 这已从建议升格为 **已证实的必要前置**
- **新增**：传唤第二层（认领期）以缩减形式执行（S-0003），覆盖「抽取漏掉」，**不覆盖**「边界写窄、须 agent 本人辨认」
- **新增**：庭审的返回通道 **只有 agent 的最终输出** —— 被传唤角色无法 `SendMessage` 回 `speaker-of-the-house`（S-0008 程序披露）。故发言协议第 3 阶段的「定向质询」只能以 **重新唤起 instance** 实现
- 本案继承的证据 `0000-0001-2026-0807#E-0001…E-0015` 已入台账；`#S-0006` 的候选证据 CE-1…CE-8 **未经验证、未分配编号**，引用者自行承担举证责任

- **传唤第二层（认领期）以缩减形式执行** —— 完整广播须同时唤起 26 个以上 instance，依 A-012 的实测依据会确定性触发运行时故障。改以 `speaker-of-the-house` 逐份读取全部 charter 边界声明的方式等效执行，覆盖面不同（覆盖「抽取漏掉」，不覆盖「边界写窄、须本人辨认」）。判定与理由见 `record.md` 的 S-0003

## 文件索引

- [发言记录](record.md)
- [证据台账](evidence.md)
