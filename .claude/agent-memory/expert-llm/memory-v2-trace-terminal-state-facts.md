---
name: memory-v2-trace-terminal-state-facts
description: Memory V2 trace 终态语义的四条硬事实（2026-08-07 亲测）——上游 typed 词汇已存在、active 面遥测产出者已存在但零消费者、终态由自由文本子串决定、run 轴根本没有词表
metadata:
  type: project
---

2026-08-07 case `0000-0002-2026-0807` 出庭（S-0014）时亲测。PuPu HEAD `8d7fbd1d`，unchain HEAD `a4e69f41`。

**Why:** 庭上四名 code owner 都把 Q1 当成「要定义一套 trace 词汇」+「active 面缺一个遥测产出者」。两个前提都是错的，而错法不明显——需要读到 unchain 仓和 `output_holder` 那一行才看得见。这四条事实会在方案庭审、Q10 删除、以及任何后续 trace 呈现议题里反复被需要。

**How to apply:** 任何人再提「给 Memory V2 定一套 trace 状态词」或「先补 active 面遥测产出者」时，先出这四条，别重新推演。

**1 · 终态词汇不需要发明，上游已冻结。** `unchain:src/unchain/memory/curator/models.py` 有九个 `StrEnum`（`CandidateStatus`/`CandidateOutcome`/`ConsolidationJobStatus`/`SourceRunStatus`/`RunCaptureStatus`/`EnqueueDisposition`/`ProcessDisposition`/`FailureRetryability`，加 `curator/host.py:51-55` 的 `MemoryAgentWorkerDisposition`），`models.py:108-112` 的 `_enum()` 构造时校验。PuPu active 面 **已经在四个非测试模块里消费它们**（`memory_v2_unchain_{curator_query,graph_root_completion,model_invoker,root_completion}.py`）。

**2 · legacy 的 `Isolated` 是三条轴的压平，不是一个状态的四种口味。** `not_root_run` ≙ `EnqueueDisposition.NO_OP`（enqueue 轴，意思是「根本没有 run」，不该是终态）· `root_run_{cancelled,failed}` ≙ `SourceRunStatus` · `capture_*` ≙ `RunCaptureStatus`。只有候选级隔离才配叫 `Isolated`。**故「固化 reason 取值集合并入契约」= 把压平写进契约，且 `memory_v2_curator.py:484` 的 reason 是 `f"capture_{...}"` 字符串插值，集合天然开放，固化不了。**

**3 · active 面的 memory-agent 遥测产出者存在，被产出者自己丢掉。** `memory_v2_unchain_worker.py:104-119` `PupuMemoryAgentWorkerReceipt`（typed，13 字段）· `:400-415` 已算好四个稳定失败码 · `:387-395` 两个公开 property（`last_receipt`/`last_failure_code`，**全仓零消费者**）；graph 侧 `memory_v2_unchain_graph_root_completion.py:54-64` 的 content-free 回执写进 `unchain_adapter.py:9471` 的 `output_holder["graph_root_completion"]`，**该键全文件只出现这一行**。缺的是投影，不是产出者。E-0018 的负向 grep（不写 diagnostics/审计事件）成立，但由它推出「缺产出者」不成立——回执是 `return` 出来的，不是 write 出来的。

**4 · 终态解析不只是 fail-open，是两级更糟（探针实跑）。** `memory_v2_trace_presenter.js:191` 对自由文本 `reason` 做 `.includes("unavailable")` → `owner_chat_id_required` 报 `Complete` 而 `real_context_window_unavailable` 报 `Unavailable`，**同类降级按拼写分裂**；`:328` 是 `titleCase(run.status)` → run 轴 **没有词表**，后端发 `"not_a_real_state"` UI 就渲染 `Not a real state`；`:175` 的闭表漏 `aborted`/`timeout`。**故「把缺的词加进词表」这类处方在 run 轴上连着力点都没有。** 裁定要写约束（未知不得为 Complete、终态不得由自由文本子串决定、呈现词汇必须来自闭映射），不要写清单。

相关：[[memory-v2-prompt-assembly-two-planes]] · [[finality-ownership-contract]] · [[canonical-journal-projection-approval]]
