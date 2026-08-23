---
name: issue-168-phase-b-landed
description: 更正——issue #168 的 B 阶段(折叠时卸载 trace 子树)已经落地，charter 里"B 未做"的说法过期
metadata:
  type: project
---

**issue #168 的 B（折叠时卸载）已实现**，不是"未做"。2026-08-07 核实于 `trace_chain.js:2057-2067`：注释直接引用 Issue #168，`bodyUnmountWhenClosed = status === "done" || status === "error"`，经 `AnimatedChildren unmountWhenClosed` 把整棵 timeline 子树在收起时卸载；只在 settled 后生效，streaming / 等待确认时不卸载。原语在 `BUILTIN_COMPONENTs/class/animated_children.js`，`timeline.js:133/367` 逐 item 透传 `unmountDetailsWhenClosed`。

逐 item 的 `unmountDetailsWhenClosed: true` 目前**只有 Memory V2 那一行**用了（`trace_chain.js:1950`），Memory Agent 行没用——不对称。

**Why:** 我的 charter 与旧记忆都写着"B 卸载未做"，照此判断会重复实现一遍已有能力，或在评估性能时算错基线。

**How to apply:** 谈 trace 性能/卸载策略时以代码为准；C（延迟序列化）仍未核实。逐 item 卸载有代价——Memory V2 行卸载会让 journal reload 每次展开重新拉最多 20 页 IPC，见 [[memory-v2-trace-contract]]。
