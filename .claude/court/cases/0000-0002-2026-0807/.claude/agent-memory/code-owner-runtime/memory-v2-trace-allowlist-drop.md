---
name: memory-v2-trace-allowlist-drop
description: 后端产的 7 个 memory_v2 顶层诊断键里有 6 个被 presenter 的 TOP_LEVEL_KEYS 白名单静默丢弃；两侧各维护一份键表，无共享 schema
metadata:
  type: project
---

# memory_v2 trace 的两份键表已漂移

**事实（2026-08-07 第一手核实 + 可复现探针，PuPu HEAD `8d7fbd1d`）：**

`memory_v2_bundle_payload(admission)`（`memory_v2_context.py:4774`）**原样返回**
`admission.diagnostics()` —— 不过滤、不改名。所以后端 `_memory_v2_merge_diagnostics(...)`
写进去的每个 kwarg 就是帧里 `bundle["memory_v2"]` 的顶层键。

renderer 侧 `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:9-69` 有一份
**60 项冻结白名单 `TOP_LEVEL_KEYS`**，`sanitizeMemoryV2TraceBundle`（`:124-133`）只拷贝
白名单内的键。**两份表没有任何共享来源，也没有测试比对它们。**

adapter 产的 7 个键，只有 1 个在白名单里：

| 键 | 产点 | 结局 |
|---|---|---|
| `memory_agent_runs` | `unchain_adapter.py:956` `:1149` | 保留 |
| `memory_curator` | `:955` `:1148` | **丢弃** |
| `long_term_recall` | `:449` `:572` | **丢弃** |
| `unchain_context_status` / `_error_code` | `:7458-7459` `:8411-8412` | **丢弃** |
| `unchain_shadow_status` / `_error_code` | `:7467-7468` `:8558+` | **丢弃** |

`journal_status` / `persistence_degraded` / `persistence_error_code` 在白名单内，由
`memory_v2_context.py:4298-4300` 与 `memory_v2_context_adapter.py:671-677` 产 —— 这是
四态里 `Partial` 唯一真正走得通的路。

**Why:** 判断「trace 上缺什么」时，很容易误以为后端没产。多数情况是后端产了、被白名单吃掉了。

**How to apply:**
- 在 `unchain_adapter` 里加任何新诊断键，**默认它到不了 UI**。要么同批改 presenter 白名单
  （跨 owner，属 `code-owner-shared-arteries`），要么塞进已在白名单的容器键里。
- 复现方式：直接 `node` 动态 import 那个 presenter 模块（它是纯 ESM、零 React 依赖），
  喂一个按产点形状构造的 bundle，打印 `sanitizeMemoryV2TraceBundle` 的输出键。很便宜。

相关：[[memory-v2-two-planes-curator-gate]]
