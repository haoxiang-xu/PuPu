---
name: memory-v2-drop-case-0005-precedent
description: 2026-08-08 case 0000-0005 鉴定先例 — 根因由「产端无声明」收窄为「两侧键集无对账」(我自己前案的收窄)、sanitize 不在持久化边界上、单向门的三条轴、形状 D 判不成立
metadata:
  type: project
---

# case 0000-0005-2026-0807「降级信号被 trace 白名单丢弃」— 我的鉴定 S-0039

**结论**：`有条件成立`（本案可在根因不处置下裁，条件 ARCH-1~7）+ 两项 `不成立`：
(i) 四个形状里没有一个是结构上正确的；(ii) 形状 D（塞进白名单内的容器键之下）结构上不成立。
**推荐方向（非取舍）**：形状 P，但理由必须是「消费既有对账」，**不是**「值域来自上游 typed 枚举」（那条判据已被提出方撤回）。

## 一 · 我对自己前案的收窄（这是本条最值钱的部分 —— 校准数据）

`0000-0002-2026-0807#S-0020` 必要条件 2 把根因写成 **「产端载荷没有被声明过形状」**。**不完整。**

产端 **有** 一份事实声明：`unchain_runtime/server/memory_v2_context.py` 的 `diagnostics()` 返回一个 **21 键写死的基字面量**，其后才是 `**latest` / `**trace_refs` 两个开放袋。我把它与收端 `TOP_LEVEL_KEYS`(59) 做了一次集合对照 —— **产端自己声明的 21 个键里有 7 个同样被收端丢弃**（`declared_context_window_tokens` / `resolved_context_window_tokens` / `context_window_source` / 四个 `*_override_*`）。

> **若缺的只是「产端声明」，被声明的那部分就该完好到达。它没有。**
> **故缺的制品是「两侧键集的一次对账」，不是「产端的一份声明」。对账是双侧的，声明是单侧的 —— 一份只做后者的交付物会把这 7 个键原样留下并让所有人以为落差已关闭。**

**Why**：这条减法在本案与前案合计三十余条发言里从未有人做过，因为它 **不属于任何一名 owner 的边界**（产端 owner 数产端的键，收端 owner 数收端的键）。
**How to apply**：`0000-0007-2026-0807`（根因案）的交付物必须是 **接缝制品（两侧对账）+ 指名 owner**，不是「产端出 schema」。产端的收口点 **不需要发明** —— `_memory_v2_merge_diagnostics`（`unchain_adapter.py:271-281`，read-modify-write，8 个调用点）已经是单一漏斗，只是零校验。成本量级远低于「设计一套 schema 机制」。

## 二 · 载重不变量与它被违反时坏掉的东西

**`sanitizeMemoryV2TraceBundle` 不是持久化门。** 它是 `chat_storage_store.js` 里 **5 个 store mutator 调用点**（`:247 :1191 :1466 :1626 :2140`）上的过滤，这 5 处恰好在 `persist` 上游。持久化边界本身零过滤：

```
chat_storage_backend.js persist() → ipcApi.write(store)
  → IPC CHAT_STORAGE.WRITE → service.js write() → applyOps([{type:"import_store"}]) → 裸 INSERT
```
`service.js` 该行仓内注释自陈：*"Legacy-compat entry point for the renderer localStorage→IPC migration path (WRITE channel): whole-store import."*

**坏掉的东西**：`TOP_LEVEL_KEYS` 描述的是「那 5 个调用点放行了什么」，**不是「`chats.db` 里有什么」**。本案（含 `case.md` / `FRAMING` / `expert-security` E-0051）反复用的「59 项表是通往 chats.db 整条路径上唯一的顶层键过滤器」**须削一格**。
**未核实、别替我补**：是否存在 store 对象不经那 5 个 mutator 而到达 `persist`。我 **没有** 主张存在活的泄漏通路。能答的是 `code-owner-shared-arteries` + `code-owner-electron`（**后者本案未被传唤**，quorum 缺口）。

## 三 · 单向门的三条轴（本席只动了一条、漏了一条）

`TOP_LEVEL_KEYS` 扩表仍是单向门。速记：

| 轴 | 状态 |
|---|---|
| **不可逆** | **不变。** 理由不是「顶层是唯一入口」，是 **同一个导出函数被渲染路径与写入路径各调一次**（4 个 import 点：3 渲染 + 1 写入；`presentMemoryV2Audit:351` 自 sanitize）。E-0078 讲深度，与此正交 |
| **深度（管辖范围）** | **更窄。** 精确管辖深度 0；其下 `sanitizeNode` 开放准入，只受 `BLOCKED_KEY_PATTERN` + 四个封顶常量。顶层有表无正则、嵌套层有正则无表 |
| **完整性** | **更弱（本庭与我都漏了）。** 见第二节 —— 表不在边界上 |

**三条不同处方，压成一句会丢掉两个。**

## 四 · 形状 D 为什么是规避不是设计选择（可机械施加的判据）

D = 把降级信号塞进已在白名单内的容器键（`context_build` / `latest_context_build` 都在表内）之下，绕过 59 项表，只受 `BLOCKED_KEY_PATTERN` 约束。

**判据不靠动机猜测**：一条设计选择会 **因为载荷在语义上属于那个容器** 而放进去；D 的正当性论证 **通篇以门为对象、不以数据为对象**。**当一个落位的唯一理由是它所规避的东西时，它就不是落位判断。**
**结构性质**：D 不是绕开一次决定，是 **让那次决定不可记录** —— 而本案存在的全部理由就是那次决定记录得不够好。
**对我不利、我已交出**：D 不是唯一的绕行（持久化边界本身就是），**但这使 D 更坏** —— 既存绕行是历史债，由法庭有意添加并带签名的绕行是把历史债确认为设计。

## 五 · 已走过 / 已关闭的事，别重新辩论

- **甲（词汇锚点）已闭**：`ContextBuildStatus`(journal 域, 4 值) 与 PuPu 四态逐字全等；`RunCaptureStatus`(curator 域, 3 值, 缺 legacy) 不是原件。**但它是共享词表 —— unchain 只产 `complete`/`unavailable`，`partial`/`legacy` 的作者是 PuPu 自己**；`context_build_status` 可达值域二值、永不 `partial`、且不进事件流。**采纳词表对，指望它供信号错。**
- **A 与 P 在「词汇出处」上完全相同，都是 PuPu 自造**（实测：`journal_status`/`persistence_degraded`/`persistence_error_code` 在 unchain `a4e69f41` 非测试源码各 0 次）。`expert-llm` 已撤回该判据（S-0032）。**别再用「P 的值域来自上游」论证 P。**
- **我上一案那句「采纳上游枚举解决『词从哪来』，没解决『词随哪个制品到达 UI』」—— 本案不改变它，本案证明它**：第二问得到的是 **否定** 答案（没有制品承载它，因为作者是 PuPu 且从未写下来）。
- **必要条件 7（跨仓 owner 必到）已满足且被证明承重**：前件（过程信号+新 runtime event 类型）未触发，且 owner 已出庭。**其出庭直接导致领先候选的一条判据被撤回** —— 若不传唤，本案会带着一句假话闭庭，而 PuPu 侧任何 owner 都发现不了（它是关于另一个仓有没有某名字的负向事实）。**一般形式：凡对跨仓契约的主张，证据必须来自被主张的那一侧。**
- **`schema_version` 已存在但零判定**：产出 `memory_v2.context.v1` → 白名单第 1 项 → `presenter:377` 投到 UI，**无任何消费者据它校验**；同仓 `event_store.js:69` 对 runtime events v4 **有** 这道门。**它是缺失制品的占位符 —— 若有人提「bump 一下 schema_version」，那是把占位符当制品用。**

## 六 · Q3 制品拆分的风险等级：三级，不是一级

`expert-security` 判它会连带搬走顶层键防护；`code-owner-shared-arteries` 已把定性从「清理」上调为「行为变更」。**我再上调一格：它是一次所有权变更** —— 那张表同时是渲染门与写入门，两个消费面分属两名 owner，搬走之后落在谁名下今天没有答案。**别在裁定里把它记为可逆切片。**
