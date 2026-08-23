---
name: context-v2-error-code-wire-contract
description: context_v2_bridge 的判态唯一可靠信号是「调用成败 + 拒绝码」而非任何载荷字段或 getStatus；解析面按字符集开放不按白名单封闭，失配静默变默认码
metadata:
  type: project
---

`src/SERVICEs/bridges/context_v2_bridge.js`（125 行）是 renderer 侧 V2 读平面的 **唯一** 实现——`src/SERVICEs/api*.js` 对 `context_v2` / `memory_v2` 零命中，别去 `api.*` 找第二条路。

**线契约（2026-08-08 静态通读 + `node -e` 正则探针双向核实，PuPu `b2385d5d`）**：

```
sidecar {"error":{"code":X}} + 非2xx
  → service.js:1746-1757  取 parsed.error.code 原样
  → service.js:1931-1939  **码保留，message 换成静态串**  ← 这一步是字符集锁能成立的原因
  → createContextV2Error   `[${code}] ${message}` + error.code
  → ipcMain.handle         **剥掉 error.code**，只留 message 并加前缀装饰
  → parseContextV2ErrorCode  /\[([a-z0-9_]+)\]\s/   （未锚定，故前缀装饰无影响）
```

**四条会反复被人搞错的语义**：

1. **判态不能读载荷字段，也不能只读 `getStatus`。** `getStatus()` 有三出口：sidecar 没起来 → **resolve 合成负值**（`service.js:1946`，有测试锁 `context_v2_service.test.cjs:249-288`）；200 → resolve 真值；**非 2xx → reject**。而就绪门 `:1897` 对 `/status` 显式豁免，所以它一定真发出去。**「未启用」态里它多半是抛，不是回 `available:false`。**
2. **数据调用自己就是判别器。** `getTree`/`listSpaces` **没有** `getStatus` 那种合成负值短路（那是 `getContextV2Status` 独有）。所以 **resolve ⟺ 读真的发生了；reject ⟹ 没发生且码说明原因**。后端不存在「store 关着却回 200」。空态与未启用态因此落在两个不相交分支上——**不需要 `getStatus` 也能区分**。
3. **解析面开放，不是封闭。** 无白名单，按字符集抽 token。sidecar V2 面实测 42 个码全部符合 `[a-z0-9_]+`（是否有意约定未经 runtime 确认）。**未知码原样到达是好事；真正的失真是不符字符集 → 返回 `null` → 三个消费者一律写 `parseContextV2ErrorCode(e) || "<自己的默认码>"`（`memory_v2_journal_reload.js:274` · `use_chat_stream.js:3920,4013`）→ 静默错归因，不报错不落日志。**
4. **`context_v2_unavailable` 是碰撞码。** 我的 facade `:69-74` 为「bridge 缺席」自造它；sidecar 在 9 个非测试点也发它（「storage 未配置」），其中 `route_memory_v2.py:333` **就在读路径上**。唯一残存区分位是 `error.code` 属性在不在（本地造的有，穿过 IPC 的被剥），但没人读它。

**facade 消费者清单（`src/` 非测试，2026-08-15 于 `28b1e0ef` 重核，共 5 个）**：`chat-bubble/memory_v2_journal_reload.js` · `chat-bubble/memory_v2_pending_reviews.js`（**唯一的 `listSpaces` 消费者**）· `chat-bubble/memory_v2_trace_audit.js` · `PAGEs/chat/hooks/use_chat_stream.js` · **`SERVICEs/memory_v2_tree_state.js`（2026-08-08 那版清单漏了它——它由 `5add015f` 随 memory-inspect 树视图引入）**。**`getStatus` 与 `getTree` 各自零消费者，但 `getStatus` 已是承重的**——`resolveApi()` 要求 18 个方法 **全在** 才可用，缺任一个整个 facade 失明。

**`parseContextV2ErrorCode` 自己的 call site（与 facade 清单不同，决定任何解析改动的爆炸半径；2026-08-15 实核 5 处 / 4 文件 / 3 owner）**：`use_chat_stream.js:3979`（getSessionHead）· `:4072`（rebase）· `memory_v2_journal_reload.js:274` · `memory_v2_pending_reviews.js:180` · `memory_v2_tree_state.js:106, :114, :445`。**`:114` 是唯一用 `=== ` 严格相等判码的地方**（`context_v2_store_disabled`），故解析返回 `null` 时它会把「store 关着」误呈现为 ERROR——这是第 3 条「静默错归因」最具体的一个实例。

**Why:** case `0000-0008-2026-0808` 把「Inspector 能否成为 `getStatus` 第一个消费者」定为唯一无绕行的可行性支点，理由是「getStatus 会回 available:false」。实读控制流后该前提部分不成立，而真正的判别器一直是数据调用自己的拒绝码。**这个误读很自然：一个叫 status 的方法看起来就该回状态。**

**How to apply:** 任何人在这条动脉上问「怎么知道 V2 开没开 / 是空的还是坏的」，答案永远是 **看调用成败与拒绝码**，不是找字段。要往 facade 里加校验/缓存/去重/归一时一律拒绝——文件头 `:6-9` 与测试 `:39-56`/`:74-90` 把「dumb 透传」写成了契约，加一层就是造第二份漂移规则。

相关：[[bridge-error-code-parser-anchoring-invariant]]（上面第 18 行那句「未锚定，故前缀装饰无影响」不是巧合而是**契约义务**，且是本目录唯一一处会被自然写坏的地方——动这条正则前必读）· [[memory-v2-trace-whitelist-topology]] · [[release-flag-state-is-not-in-the-repo]]
