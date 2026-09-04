---
name: memory-v2-trace-whitelist-topology
description: TOP_LEVEL_KEYS 是一个导出函数同时服务渲染与持久化两条路径；只扩表不动终态解析是零用户可见效果的改动，实测确认
metadata:
  type: project
---

`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js` 的 `TOP_LEVEL_KEYS` 不是「渲染字段表」。
**同一个导出函数 `sanitizeMemoryV2TraceBundle` 被两条路径各调一次**：

- **渲染**：`presentMemoryV2Audit` 自己在函数第一行调它，之后全文只读 `safe`，一次都不读 `raw`
- **持久化**：`chat_storage/chat_storage_sanitize.js` 的唯一调用点，位于 **写入路径**（`setChatMessages` → `sanitizeMessages` → `sanitizeMessage`），读取路径也再调一次

**四条实测确认的语义（2026-08-08，case `0000-0005-2026-0807` 探针，基线 sha256 `9778e5be…`）**：

1. **只把键名加进 `TOP_LEVEL_KEYS`、不动 `resolveTraceStatus` 与 `errorCode` 推导 = 零用户可见效果。** 键确实活过白名单，`status` 与 `errorCode` 逐字符不变 —— 两条取值链（`trace_status || journal_status || status` 与 `persistence_error_code || error_code`）都不含新键。**这是本仓最容易误发的一种「修好了」。**
2. **扩表对缺键的旧行是严格 no-op**（遍历白名单、`hasOwnProperty` 未命中即 `continue`）。**不存在「扩表会损坏历史行」这回事，也不存在可写的回填** —— 键在写进 SQLite 之前就被剥掉了，历史行里从来没有过。
3. **挂载门 = 「至少命中一个白名单键」**（`isMemoryV2TraceBundle`）。扩表会让「只含新键」的 bundle 从不挂载变成挂载 —— **新增一处渲染，不是改一处渲染**，`code-owner-chat-bubble` 要知情。
4. **不动白名单也能纠正终态**：在 sanitize 末尾把产端键归一到 **已在白名单内的** `trace_status` / `persistence_error_code`，持久化形状不变、前后向兼容（旧 presenter 读新行也正确）。**代价是造一处同键异义**（`trace_status` 一部分行是产端的话、一部分是收端的判词）。

**Why:** case `0000-0005-2026-0807` 的待裁问题被表述成「那四个键加不加进白名单」，按字面执行会落一次持久化 schema 变更而什么都没修。`0000-0002-2026-0807#S-0020` 必要条件 6 判扩表为单向门 —— 结论对，但理由要加一层：**逼成单向门的是「一个导出函数服务两条路径」，不是「白名单碰巧也被持久化调用」。所以任何『只改渲染不动持久化』的处方在这个制品上物理上不成立。**

**How to apply:** 任何人提「往 `TOP_LEVEL_KEYS` 加键」时，先问第二句：**终态解析读不读它？** 不读就是零效果。另：`resolveTraceStatus` 至今 fail-open（`mode === "active"` 兜底成 `Complete`），而产端健康回合 **根本不发 status 字段** —— **active 面每一个 `Complete` 都是收端推断出来的**，唯一能反驳它的就是这类降级键。

相关：[[release-flag-state-is-not-in-the-repo]]
