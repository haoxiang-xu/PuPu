---
name: memory-v2-wire-path
description: Where bundle.memory_v2 actually travels end to end — the done envelope, not the runtime event bus — its four gates (the fourth rewrites values), and why the active plane has typed receipts but no exit
metadata:
  type: project
---

**Memory V2 走 `done` 信封，不走 runtime event 总线。** 端到端逐段核实于 2026-08-07（法庭 `0000-0002-2026-0807` E-0026，PuPu HEAD `8d7fbd1d` / unchain `a4e69f41`）。这条链路每隔几个月就会被人问一次「流承不承载 V2」，答案取决于问的是哪条通道。

```
unchain_adapter.py:7884   bundle["memory_v2"] = _memory_v2_bundle_payload(admission)   # mode != "off" 才写
  → :11191                yield {"type": "stream_summary", "bundle": bundle}           # 另两处同形 :9656 / :10447
    → route_chat.py:1086  V4 分支：if raw_event.get("type") == "stream_summary": ... continue
                          ^^^ 一个 continue，把它从 bridge.normalize 里摘走 —— 这就是「不上总线」的那次选择
      → :55-79            _sanitize_v4_completion_bundle：13 键闭合 allowlist，memory_v2 在内，只脱敏不过滤子键
        → :1101-1102      done_payload["bundle"] = final_bundle
          → preload unchain_stream_client.js:216-224   eventName === "done" → handlers.onDone(data)
            → use_chat_stream.js:7538-7541   bundle = {...done.bundle}
              → :7563-7565                   meta: { ...message.meta, bundle }
                → message.meta.bundle.memory_v2   ← chat-bubble 的读取点
```

## 三道白名单，不是两道

法庭上常被说成「两侧各维护一份键表」，**实测是三道**：

| # | 位置 | owner | 作用面 |
|---|---|---|---|
| 1 | `route_chat.py:60-74` `_sanitize_v4_completion_bundle` | `code-owner-runtime` | `bundle` **顶层** 13 键（`memory_v2` 在内） |
| 2 | `memory_v2_trace_presenter.js` `TOP_LEVEL_KEYS` | `code-owner-shared-arteries` | `bundle.memory_v2` **内部**（实测 7 键收 1） |
| 3 | `memory_v2_journal_reload.js` 的第二投影管线 | `code-owner-chat-bubble` | journal 路径的重复归一 |

## 第四道门是改写门 —— 2026-08-07 更正，我上一轮把它排除错了

`route_chat.py:335-350` 的 `_redact_memory_v2_value` **作为键过滤器判断正确，但据此把它排除在门外是错的**。它是 **变换器**：`:75-78` 的返回式对 allowlist 内 **每一个键的值** 施加它，且它 **递归到任意深度的每一个字符串叶子**，逐个过 `custom_provider.py:146-166` `redact_text` 的三条正则（`(api[_-]?key|authorization|x-api-key|token|secret)\s*[:=]\s*值` → `***`、`Bearer <tok>`、`sk-[A-Za-z0-9._-]{6,}`）。

**前三道丢键（缺失），这一道原地改写值（在场但不对）。** 实测（2026-08-07，法庭 E-0075）：`PupuMemoryAgentWorkerReceipt` 的 13 个字段名 **无一命中** `redact_secrets` 的键模式（含 `claimed_trigger_key` —— 模式要求 `api[_-]?key`，裸 `_key` 不命中），四个稳定失败码与 `Isolated` 也 **原样通过**；但自由文本形状的 `reason` 会被静默改写（`capture token=abc not complete` → `capture token=*** not complete`）。

**How to apply:** 任何「固化 `bundle.memory_v2` 某个字段取值集」的规格，都要先过这道门 —— 规格里的取值与 wire 上到达的取值可以不相等，且不留标记。**丢弃能被「没有」发现，改写只能被「知道原值」的人发现。** 未核实项：`secret_scrub_registry` 运行期注册的真实密钥值集（若与遥测取值重合，改写面更大）。

## 两条一定要分清的

1. **`done.bundle` 与 `payload.usage` 是同名不同源的两个 bundle。** unchain `events/normalizer.py:304-307` 对 raw `run_completed` 做 `payload["usage"] = deepcopy(raw_event["bundle"])`，renderer 侧由 `activity_tree.js:491` 收为 `completionBundle`。**那是 unchain kernel 自己的 token bundle，不经 `_build_bundle_from_result`，不含 `memory_v2`。** 它只在 `done.bundle` 缺席时被我兜底用（`use_chat_stream.js:5766-5771`），逻辑是「A 缺席才用 B」**不是合并**。
2. **`enable_memory_v2` 的 build 默认值是 `false`，全仓无 `true` 覆盖**（`feature_flags.js:53-57`；排除 `src/` 后全仓只剩 `memory_v2_rollout.js:10` 的常量名）。所以「发布配置下 V2 是 active」这个前提是错的 —— **默认安装下 V2 整体关闭，`memory_v2_requested` 根本不发**。任何「用户会看到什么」的推论都要先过这一关。

## 成本速查（被问「加个 V2 帧多少钱」时直接用）

| | 路线 A · 往 `bundle.memory_v2` 加键 | 路线 B · 新增 runtime event 类型 |
|---|---|---|
| 跨 owner 数 | **2**（runtime + shared-arteries） | **5**（+ unchain 跨仓 + electron 待核 + chat-bubble） |
| 传输层改动 | **零**（allowlist 已放行 `memory_v2`） | 开 [[runtime-event-vocabulary-closed-set]] 的两道静默门 |
| chat-core 改动 | **0 行** | **0 行**（只多一条 64 ms 批窗的频率预算） |

**还有一条中间路**：改 `route_chat.py:1086` 那个 `continue` 放行、或让 diagnostics 搭既有 event 的 payload —— 传输层是通的，两道静默门一道都不用开。取舍归 runtime 与 shared-arteries，我只出「路通」这一条事实。

## active 面「没有遥测」是假的 —— 有 typed 回执，没有出口

2026-08-07 更正（法庭 E-0045 / E-0063…E-0066，产端事实归 `code-owner-runtime`）。**别再说 active 面缺产出者** —— 它有两个，都零消费者，丢法还不一样：

| 对象 | 位置 | 丢法 |
|---|---|---|
| `PupuUnchainGraphRootMemoryReceipt` | `unchain_adapter.py:9471` 写进 `output_holder` | **dead store** —— `output_holder` 是 `_stream_recipe_graph_events` 的函数局部字典，既不 return 也不 emit。且该行只在 **recipe graph** 路径可达 |
| `PupuMemoryAgentWorkerReceipt` | `memory_v2_unchain_worker.py:103-119`，挂在 `PupuMemoryAgentWorkerModule._last_receipt` | **压根没有写出动作** —— 只有两个 `RLock` 保护的 property。这才是 **普通对话回合**（`stream_chat_events`）的产出者 |

**最锋利的一句（E-0064）**：`_stream_recipe_graph_events` 里 **同一个谓词的两个极性上，legacy 支（`graph_active_bridge is None`）的整理结局经 diagnostics 抵达 UI，active 支的结局被 dead store**。不是两条平面各有各的通路而 active 那条弱 —— **是分叉时漏了一支**。

**接线路径（若哪天要做）**：`active_context_bridge.preparation.host_factory.memory_worker_module.last_receipt` → `_memory_v2_merge_diagnostics(**values)` → `bundle["memory_v2"]` → 上面那条 wire。**全程零 unchain、零 electron、零 chat-core**（`use_chat_stream.js:7538-7565` 是整体浅拷贝透传，我不读任何 `memory_v2` 子键）。收端只剩 presenter `TOP_LEVEL_KEYS` 一处。

**两个时序坑，做验收时必踩**：
1. `_last_receipt` 是 **last-write-wins 易失内存值**，`_record_failure` 会把它置回 `None`；
2. run 非 `completed` 时 hook `:490-491` **静默早退，不产回执也不记失败码，前值原样留存**。

→ **合起来：验收会读到「上一轮的残留值」，且与本轮成功值在 UI 上不可区分。** 断言必须核对回执里的 `operation_id` / `claimed_root_run_id` 等于本回合。**未核实**：`_memory_v2_merge_diagnostics` 被调用时 `last_receipt` 是否已写入（时序，落地前必实测）。

**How to apply:** 被问 Q1-前段 类问题时，**先把「流」拆成 `done` 信封与 runtime event 总线两条再答**，否则会像 `0000-0002-2026-0807` 那样出现两名 owner 结论相反、其实各说一条通道的局面。相关：[[contract-bubble-streaming]] · [[runtime-event-vocabulary-closed-set]] · [[memory-v2-p0-chat-seam]]
