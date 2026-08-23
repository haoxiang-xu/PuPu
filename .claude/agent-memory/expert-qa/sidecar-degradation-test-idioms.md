---
name: sidecar-degradation-test-idioms
description: Where the sidecar's existing fault-injection, sink-capture and generator-driving test idioms live — the repo can test degradation paths, contrary to the usual assumption
metadata:
  type: project
---

**本仓 *有* 测降级路径的能力，而且绿着。** 五个角色在 case `0000-0005` 里论证了一整轮「不存在会变红的测试」，无人找到这些 —— 因为没人把测试套件当作证据来源看。锚点（PuPu `b2385d5d`，跑法见 [[sidecar-pytest-invocation]]）：

**故障注入** — `tests/test_memory_v2_context.py:899-908` `test_active_persistence_failure_marks_partial_without_raw_error`：
`runtime.fail_append = RuntimeError("raw-secret-value")` → 期望 `MemoryV2PersistenceError` → 断言 `admission.diagnostics()["journal_status"] == "partial"` **且原始错误串不出现在 diagnostics 里**。

**sink 捕获 + 降级键断言** — `tests/test_memory_v2_context_reference_policy.py:132-141` 用
`partial_attempt_sink=lambda boundary, source, error: partials.append((boundary, source, error))`
接住 unchain 的 durable 边界，`:790-798` 断言 `journal_status` / `context_build_status` / `persistence_boundary` / `persistence_error_code` 四键（第二实例在 `:873-876`）。**注意它测的是 `bind_pupu_context_module` —— 生产零调用点的那个兄弟实现；活着的 `unchain_adapter.py` 三个 `mark_*_partial` 反而零覆盖。**

**驱动发 bundle 的生成器** — `tests/test_unchain_adapter_capabilities.py:1821-1845`：
`events = list(unchain_adapter.stream_chat_events(message=..., history=[], attachments=[], options={...}))`
然后 `assertTrue(any(e.get("type") == "stream_summary" for e in events))` 并读其 `bundle`。
负向先例：`tests/test_models_catalog_route.py:374` `assertNotIn("stream_summary", event_types)`。
bundle 里的 memory_v2：`tests/test_chat_stream_v4.py:598` 断言 `done_payload["bundle"]["memory_v2"]["mode"]`。

**Why:** 把 **故障注入** 与 **驱动生成器** 相接，就能把「某异常路径永不产出某帧」这类结构主张放到可执行边界上 —— 不需要起 sidecar、不抓 SSE、不用付费模型、不用那个应用，全程进程内，1 秒量级。这类主张（如 `code-owner-runtime` 的「触发与可观测互斥」）今天靠 **下界枚举 + 静态推论** 支撑，位阶低且不可证伪；一次执行就能把它抬一级，或彻底证伪。

**How to apply:** 遇到「这条异常路径测不了 / 只能静态读」的说法，先来这里找 idiom 再下结论。判断一条「X 永不发生」的结构主张够不够，用两条：论证覆盖的集合是否封闭（字面量 grep 的枚举永远只是下界，封闭不了全称否定）· 该边界是否可执行（有没有让论证有机会失败的跑法）。

相关：[[repo-admission-assertions-are-blind]] · [[test-api-has-no-fault-injection]]
