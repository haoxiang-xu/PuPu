---
name: memory-v2-two-planes-curator-gate
description: Memory V2 在 unchain_adapter 里是两条并行数据平面；Curator 诊断轴只在 active bridge 缺席时产出。active 平面有 typed 回执但零出口 —— 别把「搜不到 diagnostics 写入」读成「没有产出者」
metadata:
  type: project
---

# Memory V2 的两条平面，与 Curator 轴的门

**事实（2026-08-07 于 case `0000-0002-2026-0807` 第一手核实，PuPu HEAD `8d7fbd1d`）：**

`unchain_runtime/server/unchain_adapter.py` 里 Memory V2 走两条互斥平面，分流键是
`official_context_v2_active = memory_v2_active_bridge is not None`（`:7605`）。

**Curator 诊断轴整条只在「非 active」那一侧产出。** 三个调用点全部带同一个门：

- `:9645` `if graph_active_bridge is None and not output_holder.get("suspended")`
- `:10433` `if active_context_bridge is None`
- `:11177` `if active_context_bridge is None`

而 active 侧由三处 fail-closed raise 保证 bridge 必非 None：`:7551`（preflight 为 None 即 raise）·
`:7565`（is_active 但无 shadow run 即 raise）· `:7587`（bind 回 None 即 raise）。

推论（可复现）：`memory_agent_runs` 全后端只有两个产点，`:956` 与 `:1149`，都在
`_finalize_memory_v2_curator` 内 → **active 平面上 trace 的 Memory Agent 行零数据**。
`memory.curator.*` 审计事件同理（`:947` / `:1140` 同函数内）。
## active 平面有产出者，只是没有出口 —— 2026-08-07 更正

**上面推论里「active 平面零数据」成立，但曾被我误读成「零产出者」。那一步是错的**（case
`0000-0002-2026-0807`：我在 S-0007 下的断言被 `expert-llm` 的 E-0045 冲击，我在 S-0018 复核后改述）。

active 平面有 **两个** typed、构造时校验、自陈 content-free 的 memory-agent 结局对象，**都零消费者**：

| 对象 | 产点 | 丢弃方式 |
|---|---|---|
| `PupuMemoryAgentWorkerReceipt`（13 字段） | `memory_v2_unchain_worker.py` 的 run hook `process_after_enqueue` → `_record_receipt` | 只存进 `PupuMemoryAgentWorkerModule._last_receipt`，**从不写入任何字典**；两个公开 property 全仓零非测试读取 |
| `PupuUnchainGraphRootMemoryReceipt` | `complete_pupu_unchain_graph_root`，生产调用者唯一 | `unchain_adapter.py` 写进 `output_holder["graph_root_completion"]` —— **dead store**，那是个永不逃逸的函数局部 dict |

**最锋利的一句**：在 `_stream_recipe_graph_events` 里，`graph_active_bridge` 的 **两个相反极性分支**
一支接了线（legacy → `_finalize_memory_v2_curator` → diagnostics → 帧 → UI），一支没接（active → dead store）。
**不是两条平面各有通路而 active 那条弱；是同一个分叉点上漏了一支。**

**Why:** 我当初用四个 token 的负向 grep（`update_diagnostics` / `persist_audit` / `append_event` / `journal`）
判定「active 面不产遥测」。**那四个 token 永远搜不到一个 `return` 出来、存在属性上的 typed 回执。**
观察为真，推论为假 —— 这个坑会重复出现，因为这套代码大量使用 typed frozen dataclass 回执而非事件写入。

**How to apply:**
- 任何「后端已经在产 X 状态」的主张，先问「哪条平面」。默认答案是 pupu_legacy。
- **任何「后端不产 X」的主张，负向 grep 不够** —— 必须再查一遍 typed 回执 / `@property` / dataclass 返回值。
  搜「写入动作」漏掉「返回值」。
- 从 adapter 到 worker 回执的引用路径 **存在且全程公开属性**：
  `active_context_bridge.preparation.host_factory.memory_worker_module.last_receipt`。
  adapter 已在 5 处持有该 bridge（`persist_host_event`），但对 `memory_worker` 今天引用数为 **0**。
  故「接上」是接线不是新建 —— 但 `_last_receipt` 是 last-write-wins 易失内存态（`_record_failure` 会置 `None`，
  run 非 completed 时 hook 静默早退），读取时序必须实测。
- 讨论删 `memory_v2_curator.py`：它是**今天唯一有出口**的 memory-agent trace 产出源。删它前必须先落投影，
  否则是用户可见能力净减少。**这条门不受上述更正影响，仍然成立。**

相关：[[memory-v2-trace-allowlist-drop]]
