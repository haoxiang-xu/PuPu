---
name: repo-admission-assertions-are-blind
description: Every assertion in this repo that appears to guard a closed key-admission set is structurally incapable of going red when admission widens
metadata:
  type: project
---

**本仓凡是看起来在守「封闭准入集合」的断言，结构上都不可能因准入变宽而变红。** 2026-08-08 在 `memory_v2` trace 白名单（`memory_v2_trace_presenter.js` 的 59 项 `TOP_LEVEL_KEYS`）这条回归面上实测三处：

| 位置 | 写法 | 为什么瞎 |
|---|---|---|
| `chat_storage/chat_storage_memory_v2_trace.test.js:29` | `toMatchObject({...})` | **partial matcher，输出是期望值的超集时恒过**；且其 unknown 键 fixture 是 `arbitrary_provider_payload`，任何真实改动都不会接纳这个名字 |
| `runtime_events/memory_v2_trace_presenter.test.js` 挂载门断言 | `isMemoryV2TraceBundle({ unknown: true })` | fixture 用一个永远不会被接纳的键，扩表后仍绿 |
| `chat-bubble/chat_bubble.memory_v2_mount.test.js` | fixture `{mode:"active"}`，且 `jest.mock` 掉整个 trace chain | 断言的是「`mode` 字符串渲染出来」，不经过 `isMemoryV2TraceBundle` 真实实现 |

`grep -rn "TOP_LEVEL_KEYS" src/` → **只有 presenter 自身两行，零测试引用**。跑 `CI=true npx react-scripts test --testPathPattern="memory_v2|runtime_events"` → 15 suites / 88 tests / 全绿 / 1.733s，**改动前后逐字节相同**。

**Why:** 这是一种写法习惯 —— 断言「我要的键在」而不是「**只有**我要的键在」。后果是「跑一遍全绿」在这类改动上携带 **零信息**，用它签字形式合法而证明力等于没签。这比本仓已知的「测试门闩纪律」三坑（管道吞退出码 / 看错计数 / stderr 丢失）高一级：那三坑是门闩被误读，这里是 **门后面没有闩**。

**How to apply:** 任何动到白名单、字段表、准入集合、schema 的改动，**必须要求一条精确集合断言**（对 `Object.keys(output).sort()` 深比字面量），不接受 `toMatchObject` 或等价的超集匹配器；并且 **每条新断言必须先被观察为红一次**（写完先跑，看它失败，再让它通过）。同时警惕 fixture 用了一个「无论如何都不会被接纳」的键名 —— 那种断言从出生起就没有判别力。

相关：[[sidecar-pytest-invocation]] · [[sidecar-degradation-test-idioms]]
