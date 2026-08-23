---
name: memory-v2-trace-vocabulary-anchor
description: PuPu trace 四态的上游 typed 原件是 unchain ContextBuildStatus(journal 域)不是 RunCaptureStatus(curator 域);含 complete/completed 分裂的实测账、终态载体三判据、以及 case 0000-0005 的鉴定先例
metadata:
  type: project
---

2026-08-08 case `0000-0005-2026-0807` 出庭（S-0010）时亲测。PuPu HEAD `b2385d5d`，unchain HEAD `a4e69f41`。

**Why:** 庭上两名 code owner 都把这四个 `unchain_*` 键的替代锚点判错了一格（一个说 `RunCaptureStatus`、一个说不落自己边界），而正确锚点逐字躺在上游另一个域里、上游还在用同名字段发它。这条一旦丢失，下一次任何 trace 词汇议题都会重演一次「PuPu 该不该自己定一套词」的争论。

**How to apply:** 任何人再问「PuPu 四态该锚在哪」「这些状态词是不是自造的」时，先出下面第 1 条，别重新 grep 上游。

## 1 · 四态的原件是 `ContextBuildStatus`，不是 `RunCaptureStatus`

`unchain:src/unchain/journal/models.py:98-102` —— `complete`/`partial`/`legacy`/`unavailable`，**与 `resolveTraceStatus` 返回的四态逐字全等**。
`RunCaptureStatus`（`memory/curator/models.py:80-83`）只有三值，**缺 `legacy`** —— 缺的恰是整个 legacy 平面呈现所依赖的那个。

`unchain` 的 harness 确实在发一个字面叫 `context_build_status` 的字段（`context/harness.py:69` active / `:106` shadow）；平面由容器承载（`context_v2` / `context_v2_shadow`），两面发同一个字段名。

> **2026-08-08 当日被 `code-owner-unchain` 推翻的一半（我复核成立，已在 S-0032 撤回相关请求）**：那个字段 **发不出 `partial`**。`ContextBuildEnvelope` 全仓唯一构造点 `compiler.py:3227`，`status` 由 `:3199-3204` 的三元式给出，**只可能 `UNAVAILABLE` 或 `COMPLETE`**；`ContextBuildStatus.PARTIAL`/`.LEGACY` 在 unchain 生产代码 **零产出者**（只在 `context/health.py:52` 作入参默认值、`:126` 作比较目标）。且 `HarnessDelta.trace` 进 message version metadata，**不进事件流**。
>
> **故 `ContextBuildStatus` 是一个 *双向共享词表*：unchain 产 `complete`/`unavailable`，宿主产 `partial`/`legacy`。** 「接上上游已在发的字段就能表达降级」**不成立** —— 这是我 2026-08-08 出具后当日被推翻的一处。
>
> **但同簇 ≠ 无上游约束（我补的第四句，未被反驳）**：上游对 **宿主传入** 的值执行构造时枚举校验并抛 `ModelValidationError` —— `context/models.py:794-800`（`ContextCompileRequest`）与 `context/task_state.py:63-65`。**采纳这套词买到的不是供给，是一个现成、已在运行的值域约束；今天 diagnostics 路径不经过它。`0000-0007` 要建的不是新 schema，是把已有校验器接到写入点上。**

→ 架构师 `0000-0002#S-0020` 说我的锚点主张「解决了词从哪来、没解决词随哪个制品到达」—— **该缺口在四态这条轴上 *仍然没有* 关闭**（我一度以为关闭了，见上）。

## 2 · 两个字段名，两个枚举，PuPu 并排存着（`0000-0005#E-0037` 判错的那处）

| 域 | 字段名 | typed 为 |
|---|---|---|
| unchain **context** | `capture_quality` | **`ContextBuildStatus`**（`context/task_state.py:59`） |
| unchain **curator** | `capture_status` | `RunCaptureStatus`（`curator/models.py:193`） |

PuPu `memory_v2_store.py:627-628`/`:648-649` 两列并排。故 `'legacy'` **在域内不是异义**；真正的自造哨兵只有 `'unknown'`（SQL DEFAULT），且 `:4079` 有一条 `CASE WHEN capture_quality='unknown' THEN 'legacy'` 把它静默升格。

**对我上一案的更正**：`memory-v2-trace-terminal-state-facts` 第 2 条把 `capture_*` 一律映射到 `RunCaptureStatus`。**至少 active 面不是** —— `unchain_adapter.py:931-936` 读 `capture_quality`（= `ContextBuildStatus`），故 `capture_legacy` 是可达 reason，上次的三轴表里没有它。legacy 面（`memory_v2_curator.py:484`）读哪个枚举，**未核实**。

## 3 · `complete` / `completed`：**我 2026-08-08 的读法错了，别再用它**

我当时写「分裂线不沿域、层或轴，上游自己是分裂的」，用两条字面量 `grep` 支撑。**`code-owner-unchain` 以 `UNSUPPORTED` 质疑，我复核后不补强、让与。**

**正确读法**：10 个 typed 成员 **无一例外沿一条轴分开** —— 3 个 `"complete"` 全是 **制品完整度**（`ContextBuildStatus` build · `HandoffStatus` handoff · `RunCaptureStatus` capture），7 个 `"completed"` 全是 **执行单元终态**（job / source-run / process / graph / provider-request / durable-turn / kernel `run_status`）。是英语形容词 vs 分词的区分，本仓贯彻一致。`RootRunCompletion:192-193` 并列持有两者，是最清楚的证物。
`host_adapter.py:60` 那处归一器坐在一处 **真实且已声明的轴交叉**（输入 `SubagentResult.status` 是未 typed 的 `str`，`subagents/types.py:245`），是 anti-corruption 适配器 —— **与 PuPu 形似而不同源，「两个作者同一个压力」那句我已撤回。**

> **教训（比事实本身更该记住）**：我用 **两条字面量 grep** 去支撑一项 **语义** 主张 —— 这正是我同一天用来质疑 `E-0037` 的形状。**语义主张需要读每个枚举回答什么问题，grep 只能给出拼写分布。**

**结论方向存活且严重度上升**：若上游分得很清楚，则 `resolveTraceStatus:164` 把三个不同轴的键（`trace_status` 零产出者 · `journal_status` 制品完整度轴 · `status` 来源未声明）短路拼成一条链、`:167` 再跨轴归一，**是收端单方面抹掉一条上游刻意维持的区分** —— 不是应付混乱。**修法从「无着力点」变成「按轴分读，不共用归一器」。**

**根因定位（换了支撑，结论不变）**：产端无声明形状 → **值** 这层收端不知道词来自哪个键哪条轴（因为 `trace_status` 零产出者、`status` 来源未声明）→ 跨轴归一；**键** 这层不知道会来哪些键 → 闭表。**只修键那层不消除值那层。**

## 4 · 终态载体的判据（本案沉淀，下次直接用）

1. **单值 status 不是终态字段。** 四个 `unchain_*` 键三个产点全部只写 `"partial"`，无 complete 产出者 → 是穿 status 外衣的布尔量。为布尔量开持久化单向门不成立。
2. **平面不得编码进键名。** 编进键名 → 每加一个平面再开一次单向门（门次随平面数线性增长）。
3. **收端不得合成写入有产端写入者的字段。** 终态的价值全在「为假时能被发现」；收端合成 + 收端读取 + 落盘后与产端陈述不可区分 = 无人可证伪，比 fail-open 更坏。**推论**：写入 **零产出者** 的字段（如 `trace_status`）不构成同词异义，但会 **预约** 一处。
4. **键名不得宣称一个不存在的出处。**（2026-08-08 新增，替代下面那条作废的）会把每一次查证引向一个保证为空的仓库。`code-owner-unchain` 以被冒名一方身份正式请求去掉 `unchain_` 前缀 —— 两侧独立同向。

> **作废：~~「值域来自上游 typed 枚举」~~**（2026-08-08 我自己撤回）。它 **区分度为零**：形状 A 写 `unchain_context_status="partial"`，形状 P 写 `journal_status="partial"` —— **值逐字相同**。错误码那一侧也不区分（两形状共用同一套 `getattr(error,"code",...)` 推导）。**写判据前先问：它把候选项分开了吗？**

## 5 · 冗余通路（庭上无人算过，判 A/P 优劣的关键）

`resolveTraceStatus:162-196` 对同一次持久化降级有 **两条独立通路**：`:164` explicit 链读 `trace_status||journal_status||status`；`:181-187` 读 `persistence_degraded||persistence_error_code||error_code`。**产端改发既有白名单键 → 丢任一键仍出 `Partial`；四个 `unchain_*` 键两条链都不在 → 必须同时改三处才有效。**

## 6 · 白名单只在深度 0 fail-closed

`sanitizeMemoryV2TraceBundle:124-133` 顶层按 59 项表准入；`sanitizeNode:110-121` **嵌套层开放准入**，只受 `BLOCKED_KEY_PATTERN` 与四个封顶常量约束。**故「TOP_LEVEL_KEYS 是唯一 schema 门」这个被全庭当前提用的说法只对顶层为真**，存在零单向门的嵌套载体形状（我不推荐 —— 终态藏进诊断容器语义更差，且 `resolveTraceStatus` 不读嵌套）。

## 7 · 鉴定先例（`0000-0005-2026-0807#S-0010`，**2026-08-08 同日经 S-0032 修订**）

**结论全部维持，两条理由被推翻、一条请求被我撤回** —— 这是本先例最该记住的形状：**推翻的是理由不是结论，而理由被推翻仍须显式记录。**

| 项 | 2026-08-08 处置 |
|---|---|
| 形状 A `不成立` | **维持**（两条理由不含词汇出处前件；另获枚举所有权方的被冒名请求作第三条） |
| 形状 C 半 `不成立` | **维持**，未被触及 |
| 形状 P `有条件成立` | **维持**，必要条件 4→5（新增：验收不得以「屏幕出现 Partial」为准，须以 `errorCode` 非空且属持久化错误码域 —— 因 `chat-bubble` 实测新旧两种 `Partial` 同词同点不可区分） |
| 判据「值域来自上游」 | **我自己撤回**（区分度为零） |
| `E-0072` 标题主张 | **让与，不补强**（语义主张用 grep 支撑） |
| 请求 4（`context_build_status` 入表） | **撤回**（该字段永不 `partial`） |

- **不成立**：形状 A（四个 `unchain_*` 键作终态载体 + 扩表）。翻转条件：`0000-0007` 先落产端形状声明且把平面建模为取值/容器 + 给闭值域。
- **不成立**：形状 C 中「合成写入 `persistence_error_code`」那一半（该键有 3 个真实产端写入者）。**我同时更正了方向一致的错误理由** —— C 写 `trace_status` 那一半 **不** 构成同词异义。
- **有条件成立**：形状 P（产端改发既有白名单键），4 条必要条件：走 merge 不走 replace（**三个活着的产点在用整字典替换**，`memory_v2_context.py:4295`/`:4643`/`:4742`）· `journal_status` 与 `persistence_degraded` 同发 · 三产点同批 + 补 graph shadow 错误码变体 · 四个自造键同批删除。
- **对 runtime「`persistence_boundary`/`context_build_status` 属诊断可丢」的复核**：前者同意（PuPu 自造自由字符串，无闭集）；**后者不同意 —— 它是四态本身**。但不据此反对 P：它入表本身是单向门，应与 `0000-0007` 的形状声明同批，那时门费才买到「接上已声明的原件」。

相关：[[memory-v2-trace-terminal-state-facts]]（第 2 条已由本文修正）· [[finality-ownership-contract]] · [[memory-v2-prompt-assembly-two-planes]]
