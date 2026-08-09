---
name: context-v2-consumer-traps-chat-core
description: chat-core 作为 context_v2 消费者的两个非显性事实——18 方法 mock 的静默失效模式，以及两张蓄意不合并的码→文案表（语境比码更重要）
metadata:
  type: project
---

chat-core 只调 `context_v2_bridge` 的 **两个** 方法（`getSessionHead` / `rebaseSession`，`use_chat_stream.js:3916,4010`），且两个都是 turn mutation 的写路径前置。**我不是 V2 读平面的消费者，我是它的写者。** 但有两处非显性耦合，都会静默失效。

**Why:** 2026-08-08 `0000-0008-2026-0808` 庭审中，本庭把「`use_chat_stream.turn_mutation_v2.test.js:249` 有 `getTree: noop`」记入已知事实，读起来像「chat-core 与 getTree 有关」；同案 `code-owner-shared-arteries` 把 chat-core 的码映射记作「一处 `use_chat_stream.js:3920,4013`」——两条都不对，且两条的真相都是「不改就会被顺手改坏」的那类。

## 一 · `getTree: noop` 是探针产物，不是消费者，而且它是一枚静默地雷

`context_v2_bridge.js:59-67` 的 `resolveApi()` 是 **全有或全无** 探针：对 `REQUIRED_METHODS`（`:32-50`，18 个）逐个 `typeof` 检查，**缺任何一个即返回 `null`**（fail-closed，防 stale preload 看起来可用）。

所以 `use_chat_stream.turn_mutation_v2.test.js:208-262` 的 mock **必须** 声明全部 18 个方法，其中只有 2 个是 `jest.fn()`，其余 16 个是 `noop`。**`getTree: noop` 表示的是「我被迫声明它存在」，不是「我用它」。**

**地雷**：`REQUIRED_METHODS` 一旦增到 19，我的 mock 是 18 → `resolveApi()` 返回 `null` → `isAvailable()` 为假 → 而我的两个调用点 **都以 `isAvailable()` 为门**（`:3907`/`:4004`）。**测试不会红，它会绿，但测的是 bridge 缺席的降级分支。** 这是本仓继 Electron `.js`/`.cjs` 双胞胎之后的第二种「会静默失效的测试形态」。

`src/` 下构造 `window.contextV2API` 的文件只有三个：这个测试 + facade + facade 自己的测试。

## 二 · 两张蓄意不合并的码→文案表：判据是 (码 × 调用语境)，不是码

`context_v2_turn_mutation.js` 里是本仓最完整的一份码映射，**而且是两张表**：

```
:389-394  RUNTIME_UNAVAILABLE_CODES   4 码 → UNAVAILABLE
:396-412  NOT_READY_CODES            15 码 → NOT_READY
:420-435  contextV2TurnMutationMessage  5 出口，:434 兜底 FAILED（fail-closed）
:445-451  V1_MIRROR_UNAVAILABLE_CODES  5 码（V1 词汇，独立第二张表）
:456-459  contextV2V1MirrorMessage      2 出口
:93-109   7 条固定字面量文案，绝不 surface 服务端 message
```

**为什么是两张而不是一张——理由写在 `:437-444` 的注释里，是一次已付过代价的判断**：shadow mutation 的第二条腿走 legacy V1 replace，失败带的是 V1/bridge 码不是 `context_v2_*` 码；喂进同一张表会把一个无关的 V1 码判成 rebase CONFLICT，**告诉用户「对话变了」——而对话根本没变**。

**推论，任何「一份映射喂所有消费者」的方案必须先回答**：同一个 `context_v2_unavailable`，在 turn mutation 里是「你这次编辑没生效」，在 tree view 里是「这棵树读不出来」，在 chat-bubble 的 journal reload 里是第三件事。**只按码分支、不按语境分层的统一映射，会在某个消费者身上撒谎。** 五份各自诚实的拷贝比一份折平的映射好。

（与 shared-arteries 的 A4「未知落第三态」正交，不冲突：它管未知怎么办，这条管已知的码在不同地方是不是同一件事。）

## 三 · 一条硬事实：`context_v2_store_disabled` 在整个 `src/` 下出现 0 次

它是「V2 未启用」在整条链路上的 **唯一权威信号**（sidecar 侧 `route_memory_v2.py:239` / `memory_v2_runtime.py:726`），而 renderer 侧——四份既有映射、facade 解析面、我这两张表——**无一处出现过它**。

在我的表里它的归宿可计算：四个集合都不含 → 落 `:434` 兜底 FAILED，*"This message change could not be applied. Please try again."* ——**对一个重试永远不会改变的条件说「请重试」**。（该码在我调用路径上今天是否可达未核实，标推断。）

**「未启用」不是某个组件词汇表里缺一枝，是整个 renderer 都不知道这个码存在。**

**How to apply:** 动 `context_v2_turn_mutation.js` 的码表前先读 `:437-444`；有人提议合并映射时，先要求其方案回答语境分层。相关：[[side-menu-modal-hub-id-contract]]、[[memory-v2-turn-mutation-rebase]]、[[runtime-event-vocabulary-closed-set]]。
