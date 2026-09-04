# HS-002 Contribution — code-owner-chat-core

- **case**: P-0000-0007-2026-0815
- **handoff**: HS-002（S-0010）| from code-owner-unchain | return_to code-owner-unchain
- **slot**: SLOT-003
- **基线**: PuPu `dev` @ `28b1e0ef`（工作树含 P-0000-0004 在途未提交改动，均不在本棒 write_set 内）
- **性质**: owner 交付块，供 lead 集成为后继 PS。本文件不改 `proposal.md`，不授权任何生产代码改动，production effect NONE。

---

## 0 · 本 owner 自行核读的事实（全部只读）

PS-002 与 intake 中凡涉及 renderer 的表述，本 owner 逐条回源码核对。**其中 F-2 / F-4 / F-8 / F-10 是 PS-002 未记载、但直接决定 SLOT-003 设计形状的事实。**

| # | 事实 | 位置 |
|---|---|---|
| F-1 | `TERMINAL_REBASE_ERROR_CODES` 九个 code，全部带 `context_v2_` 前缀；`CONTEXT_V2_REBASE_IN_PROGRESS_CODE` 独立导出；注释明确未知 code 刻意按 retryable 处理 | `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:363-387` |
| **F-2** | **今天 terminal ⇒ 删除条目。** 三处 foreground（resend / edit / delete）与 recovery 各有一处：`isTerminalTurnMutationResult(result)` 且当前会话 fingerprint 仍等于 `originalFingerprint` 时调 `removeTurnMutation(operationId)`。即"terminal"在本仓的现行语义是 **discard**，不是 quarantine | `use_chat_stream.js:12756-12765`、`:13050-13059`、`:13296-13305`、`:13537-13550`；判定函数 `:266-267` |
| F-3 | terminal 且 fingerprint **不**匹配时（recovery 路径）既不删条目也不 `releaseTurnMutation`，只发一条瞬时 stream error "…needs manual review before it can be discarded."。这是今天事实上的 quarantine：一把没有任何用户出口的永久锁 | `use_chat_stream.js:13551-13557` |
| **F-4** | **只要该 chat 存在任一 outbox 条目，`isTurnMutationBlocked` 即为 true**（`available===false` 时对**所有** chat 为 true）；chat 页用它禁用发送、禁用模型选择、禁用消息动作按钮 | `use_chat_stream.js:1493-1502`；`src/PAGEs/chat/chat.js:725-730`、`:802-810`、`:1146-1149` |
| F-5 | `setStreamErrorForChat` 只在目标 chat 恰为活动 chat 时写 `setStreamError`；这是瞬时 UI 态，切走再回来即消失，也不跨重启 | `use_chat_stream.js:936-943` |
| F-6 | `turnMutationRecoveryAttemptsRef = useRef(new Map())`，六处使用；`scheduleRetry` backoff `min(4000, 250 * 2 ** (attempt-1))`，`attempt >= 6` 只发提示、**不**删条目、不再排程。effect 在挂载时立即跑一次替换（无初始延迟）→ 每次挂载一轮 ≤ 6 次，重挂载归零。与 intake §3 记载一致 | `:1003`、`:9112`、`:13397-13416`、`:13422`、`:13545`、`:13572`、`:13602` |
| F-7 | outbox normalizer 是 **allowlist 重建**：返回值逐字段构造，输入上的未知 key 一律丢弃。→ 新增字段被旧版本读到时自动忽略，rollback 方向天然安全 | `src/SERVICEs/turn_mutation_outbox.js:213-344` |
| **F-8** | **任一条目 normalize 失败 ⇒ 整库 `{available:false, entries:[]}`**；`available:false` 又让每个 chat 都 `isTurnMutationBlocked`（F-4），并让 recovery effect 直接以 `PERSIST` 退出。→ 计数字段绝不能成为 reject 条件 | `turn_mutation_outbox.js:346-375`；`use_chat_stream.js:1494-1496`、`:13340-13347` |
| F-9 | 三个既有写入器（`recordTurnMutationRebaseAck` / `recordTurnMutationV1MirrorApplied` / `removeTurnMutation`）都是"整数组读—改—写"，且都拒绝复活不存在的条目（CAS 纪律） | `turn_mutation_outbox.js:431-473`、`:497-530`、`:532-542` |
| **F-10** | **renderer 收到的不是 JSON 信封。** main 把错误重建为 `` `[${code}] ${message}` ``（code 原样透传，无 allowlist、无改写），renderer 用 `/\[([a-z0-9_]+)\]\s/` 从 `error.message` 里抠出 code。`retryable` / `expected_revision` / `actual_revision` **根本到不了 renderer**。两个新 code 的字符集合法（纯 `[a-z0-9_]`） | `electron/main/services/unchain/service.js:185-189`、`:1978-1986`；`src/SERVICEs/bridges/context_v2_bridge.js:53-57`、`:77-82` |
| F-11 | `applyTurnMutationMemory` 在条目已带 `v2Ack` 时**整段跳过 rebase**。→ 任何 rebase code 只可能落在**无 ack** 的条目上；有 ack 的条目只会在 shadow 的 V1 mirror 腿失败，而那条路径被硬编码为 never terminal | `use_chat_stream.js:4014-4173`，尤其 `:4062`、`:4136-4153` |
| F-12 | `CONTEXT_V2_TURN_MUTATION_MESSAGES.CONFLICT_MANUAL` 定义后**全仓零引用**（死常量）；recovery `:13554` 用的是一条近似但不同的内联字面量 | `context_v2_turn_mutation.js:107-108` |
| F-13 | 现有测试面：`context_v2_turn_mutation.test.js:477-503` 用 `test.each` **显式枚举**九个 terminal 与若干 retryable code；`src/SERVICEs/turn_mutation_outbox.test.js`（603 行）覆盖 normalizer 与三个 CAS 写入器；`src/PAGEs/chat/chat.test.js` 是 render 级、可 `enqueueTurnMutation` 真条目并断言 `lastChatInputProps.sendDisabled` | 同左 |
| F-14 | enqueue 三处 `:12710`（resend）/ `:13002`（edit）/ `:13249`（delete）与 frozen payload 一次构造的位置，与 PS-002 记载一致 | `use_chat_stream.js` 同左 |

**对 PS-002 的事实性更正/补充**：PS-002「与 intake 的偏差」第 3 条与 SLOT-002 的 F-4 都正确。本 owner 未发现 PS-002 关于 renderer 的表述有**错误**，但发现**两处重大缺失**（F-2 与 F-10），它们改变了 SLOT-003 的实施形状与 BC-004 的正确写法，详见 §8 的 M-8 与 M-9。

---

## 1 · SLOT-003（一）· `context_v2_rebase_journal_incompatible` 落位

### 1.1 结论：不能只把它加进 `TERMINAL_REBASE_ERROR_CODES`

S-0010 的字面要求是"进 renderer terminal 集合并进入 quarantine"。**照字面做会丢弃用户的 frozen payload**，与本案 non_goal 直接冲突：由 F-2，把一个 code 放进 `TERMINAL_REBASE_ERROR_CODES` 会使 `isTerminalContextV2RebaseError` 为真 → `isTerminalTurnMutationResult` 为真 → 三处 foreground 与 recovery 的 terminal 分支在"当前会话 fingerprint 未变"时**删除条目**。而 `journal_incompatible` 恰恰总是在 fingerprint 未变时发生（rebase 在任何本地提交之前，见 `:12750-12752` 的注释"Server ack strictly before any optimistic message or local persist"），所以删除是**必然**而非偶然。

因此"terminal"这一个概念必须拆成两个：

- **是否停止自动重试**（`isTerminalContextV2RebaseError`，语义不变，`journal_incompatible` 加入）；
- **停止之后如何处置条目**（新增，取值 `discard` | `quarantine`）。

### 1.2 落位

在 `context_v2_turn_mutation.js` 内：

```
TERMINAL_REBASE_ERROR_CODES  += "context_v2_rebase_journal_incompatible"
QUARANTINE_REBASE_ERROR_CODES = { "context_v2_rebase_journal_incompatible" }   // 新增，terminal 的真子集
```

新导出纯函数 `contextV2RebaseTerminalDisposition(code)` → `"quarantine"`（在 quarantine 集合内）| `"discard"`（其余 terminal code）。三处 foreground 与 recovery 的 terminal 分支改为：先取 disposition，`discard` 走今天的 `removeTurnMutation`，`quarantine` 改为写入 quarantine 状态（§4.3）并**保留条目**。

### 1.3 为什么 `journal_incompatible` 必须是 quarantine 而既有九个 code 仍是 discard

判据是**手工重做能否成功**，不是"错误有多严重"：

- 既有九个（revision / generation / operation conflict、not_found、invalid_*、too_large…）的共同点是"这一份**冻结的**请求永远不会成功，但用户重新做一次同样的操作会成功"——冲突源于会话已前进或这份 payload 本身非法。删除它只让用户损失一次重做，且删除有 fingerprint 门（本地历史未变才删）。这是既有的刻意设计，不在本案 write_set 内。
- `journal_incompatible` 的语义完全相反：它描述的是 **durable journal 的确定性状态**，与这份 payload 无关。用户手工重做会拿到**一模一样的** code，重做 100 次也一样。删除条目 = 用一句"请重试"把用户送进一个必然失败的循环，并同时销毁他的 edit/delete/resend intent。而这类状态是**可以被修好**的（升级到修复后的 wheel、或后续的 recovery），修好之后原样重放这份 frozen payload 正是本案方案 B 的核心承诺（AC-003 的幂等重放）。

所以：**保留 payload 逐字节不变、停止自动重试、标记 quarantined、把处置权交给用户**（§5）。

---

## 2 · SLOT-003（一续）· `context_v2_rebase_recovery_required` 落位

### 2.1 它是独立的第五类，不复用 in_progress 的通道

`in_progress`（`GenerationRebasePreflightBlocked`）的含义是"再等等，别人在跑"；`recovery_required` 的含义是"**服务端刚刚已经替你做过一次持久化修复并重放过一次，仍然回到了这里**"（PS-002 §SLOT-002 B）。两者的收敛前景完全不同：前者随时间自愈，后者只在"修复真的有效"时自愈，而服务端已经证明这一次没生效。

因此 renderer 侧对它：

| 维度 | `recovery_required` | `in_progress` / 其它非 terminal |
|---|---|---|
| 退避阶梯 | 固定两级 **250ms、750ms**，无指数尾 | `min(60_000, 250 * 2 ** (n-1))` |
| 专属上界 | `recoveryRequiredAttempts >= 2` | 无（只受共享上界约束） |
| 共享上界 | 同时计入 `replayAttempts` | 计入 `replayAttempts` |
| 到界行为 | **quarantined**（等同 `journal_incompatible`） | **paused**（§4.4） |

**为什么退避要更短**：sidecar 已在**同一个 HTTP 请求内**同步完成了 `recover(plan)` 或 `finalize(plan)` 并重放了一次（PS-002 §SLOT-002 B）。renderer 再等 4 秒不会让 durable 事实发生任何变化——该发生的写入已经发生了。留两级极短退避的唯一理由是给"另一路并发恢复正在进行、live-execution 闸刚好拒绝了本次"这种瞬时争用一个让路窗口（该闸的存在见 PS-002 §SLOT-002 B 的三层防护），750ms 足够。

**为什么专属上界取 2**：与 sidecar 侧 `(execution_id, generation_id, reason)` 的上界 2 数值对齐，但**职责不同**：sidecar 的计数在其进程重启时归零（PS-002 明示这是有意的），renderer 的计数**跨重启存活**，因此它是"同一 durable 事实在多个 sidecar 生命周期里反复出现"的唯一记忆。取 2 意味着：即使 sidecar 每次都因重启而重新给自己两次机会，renderer 也只允许这件事整体发生两次。

### 2.2 与 quarantine 的关系

`recovery_required` 本身**不是** terminal code（它不进 `TERMINAL_REBASE_ERROR_CODES`），只有**到界**才转入 quarantine。这与 `journal_incompatible` 的"立即 quarantine"是两条不同路径，但终态相同，用户可见语义也相同（§5）——用户不需要理解这两者的区别。

---

## 3 · SLOT-003（二）· `context_v2_rebase_unavailable` 保持非 terminal

**结论：AGREE，且不需要在 `context_v2_turn_mutation.js` 里为它写任何显式分支。**

- 它今天不在 terminal 集合内、JS 全仓零显式引用（intake §3 属实，本 owner 复核确认）；它落入 `isTerminalContextV2RebaseError` 的 unknown → retryable 缺省，行为正确。
- 一旦 SLOT-002 的映射表生效，`unavailable` 只剩真实基础设施故障（sqlite / OS / I/O），这类故障**确实**会自愈，把它判 terminal 会 quarantine 掉一个本可恢复的意图。
- 它必须受**共享持久化上界**约束（`replayAttempts >= 12`）——这正是本次改动的效果：今天它受的是"每次挂载 6 次、重挂载归零"的**非**上界；改造后它与 `in_progress`、`ack_invalid`、`persist_failed`、V1 mirror 失败码以及**任何未知 code** 共用同一个跨重启计数与同一条到界规则。

为它显式建集合的唯一好处是可读性，代价是又一处必须与 sidecar 同步的枚举。本 owner 建议**不建**，改为在 §7 的 AC-012 子例 11 里用封闭集合穷举来锁住"每个 sidecar code 都有确定归类"，那比一个手写集合更强。

---

## 4 · SLOT-003（三）· useRef 计数 → 随 outbox 条目持久化

### 4.1 schema 增量（`src/SERVICEs/turn_mutation_outbox.js`）

`normalizeTurnMutationOutboxEntry` 的返回对象**新增四个字段**，`STORAGE_KEY` 与 `MAX_ENTRIES` 不变、**不升版本号**（理由见 4.2 的 rollback 论证）：

| 字段 | 类型 / 取值域 | 缺省（迁移） | 非法值处置 |
|---|---|---|---|
| `replayAttempts` | 整数 `0..12` | **缺失 / `null` / `undefined` → 0** | 存在但非有限非负整数 → **clamp 到上界 12**（视为已耗尽） |
| `recoveryRequiredAttempts` | 整数 `0..2` | 同上 → 0 | 同上 → clamp 到 2 |
| `retryStatus` | `"" \| "paused" \| "quarantined"` | 缺失 → `""` | 未知字符串 → `""`（仍由两个计数兜底） |
| `lastFailureCode` | `"" \| /^[a-z0-9_]{1,64}$/` | 缺失 → `""` | 不匹配 → `""` |

**第一约束（不可协商）：这四个字段的任何取值都不得使 `normalizeTurnMutationOutboxEntry` 返回 `null`。** 依据 F-8：单条目 normalize 失败会让整库 `available:false`，从而（a）锁死**每一个** chat 的发送与模型选择，（b）让 recovery effect 对当前 chat 直接报 `PERSIST`。用一个重试计数把整个应用的 chat 输入面锁死，是比无界重试**更严重**的故障模式。所以这四个字段只 clamp、只归一，绝不 reject——与 `v2RebasePayload` 的"半有效即整体拒绝"纪律**刻意相反**，因为那里拒绝的是"会被服务端判 terminal 从而丢弃用户编辑"的输入，这里拒绝的是"我自己的记账"。

**非法值 clamp 到上界而不是 0**：本案要消灭的失败模式是无界重试，因此损坏的记账应当**保守地判为已耗尽**（进入需用户操作的稳态，payload 仍在），而不是慷慨地重置为 0（那等于给攻破记账的每一种存储异常都开一次新的热循环）。缺失字段是**唯一**判为 0 的情形，因为那是确定的旧条目迁移语义。

### 4.2 迁移语义与双向 skew

- **旧条目 → 新代码**（升级）：四个字段全缺失 → `0 / 0 / "" / ""`，即"从未失败过"。行为与今天一致（第一次尝试立即执行）。这是 S-0010 点名的"旧条目无计数字段视为 0"。
- **新条目 → 旧代码**（回滚）：由 F-7，旧 normalizer 是 allowlist 重建，四个字段被**静默丢弃**，条目其余部分逐字保留，旧代码退回今天的 useRef 行为。**不丢 payload、不丢 ack、不丢 v1MirrorState。** 这就是不需要升 `STORAGE_KEY` 版本的理由：版本升级会让旧代码把整库判为不可读（F-8 路径），比丢四个计数字段严重得多。
- 两个方向都不产生 `available:false`。这一对构成 SEQ-004 的 `rollback` 单元格（§7 子例 8）。

### 4.3 新增写入器（沿用 F-9 的 CAS 纪律）

```
recordTurnMutationRetryOutcome(operationId, decision, storage) -> entry | null
clearTurnMutationRetryState(operationId, storage)              -> entry | null
```

- 二者都：条目必须已存在（绝不复活）、只改这四个字段、不触碰 `v2RebasePayload` / `v2Ack` / `v1MirrorState` / `createdAt`、整数组读改写后 `writeTurnMutationOutbox`。
- `decision` 由**纯函数**给出，不在 outbox 里做策略判断（保持 `turn_mutation_outbox.js` 只做持久化与归一）。

### 4.4 决策函数（`context_v2_turn_mutation.js`，纯函数，无 React、无时钟）

```
CONTEXT_V2_REBASE_RETRY_LIMITS = {
  MAX_REPLAY_ATTEMPTS: 12,             // 共享，全部非 terminal code
  MAX_RECOVERY_REQUIRED_ATTEMPTS: 2,   // 仅 recovery_required
  MAX_BACKOFF_MS: 60_000,
  BASE_BACKOFF_MS: 250,
  RECOVERY_REQUIRED_BACKOFF_MS: [250, 750],
}

resolveTurnMutationRetryDecision({ code, replayAttempts, recoveryRequiredAttempts })
  -> { action: "retry" | "pause" | "quarantine" | "discard",
       delayMs, replayAttempts, recoveryRequiredAttempts, lastFailureCode }
```

判定顺序（第一个命中即返回）：

1. `contextV2RebaseTerminalDisposition(code) === "quarantine"` → `quarantine`（`journal_incompatible`，立即，与计数无关）；
2. `isTerminalContextV2RebaseError(code)` → `discard`（既有九个 code，维持今天）；
3. `code === context_v2_rebase_recovery_required` → 递增两个计数；`recoveryRequiredAttempts >= 2` → `quarantine`，否则 `retry`，`delayMs = RECOVERY_REQUIRED_BACKOFF_MS[n-1]`；
4. 其余（`in_progress`、`unavailable`、`unreachable`、`ack_invalid`、`persist_failed`、V1 mirror 码、**未知 code**）→ 递增 `replayAttempts`；`>= 12` → `pause`，否则 `retry`，`delayMs = min(60_000, 250 * 2 ** (n-1))`。

**共享上界取 12 而非沿用 6**：今天的 6 是"每次挂载"的预算，阶梯封顶 4 秒，整轮墙钟约 8 秒；改成跨重启的**终生**预算后，同样的 6 次会让一次普通的 sidecar 重启（5–20 秒）就把预算烧光，把一个真瞬时故障推进 paused。12 次配 60 秒封顶阶梯的累计墙钟约 4.3 分钟，覆盖 sidecar 重启、Ollama 冷启动与一次短暂的 I/O 故障，同时仍是**严格有界**。数值是可调的，但"必须显著大于 6"是本 owner 的实质意见，理由如上。

### 4.5 重挂载不只是不归零 —— 阶梯位置也要恢复

只把计数持久化仍留着一个洞：recovery effect 在挂载时**立即**执行一次替换（无初始延迟，F-6）。用户在两个 chat 之间来回切换，每次回来都会立刻打一发请求，退避形同虚设（虽然现在总数有界了，但用户会看到十几次快速失败）。

因此规则是：**effect 挂载时若 `replayAttempts > 0`，先按 `delay(replayAttempts)` 排程，再执行首次替换；只有 `replayAttempts === 0` 才立即执行。** 持久化的计数因此同时恢复了"上界"与"阶梯位置"两件事，不需要额外持久化时间戳。

### 4.6 到界行为（`paused`）与 quarantine 的区别

| | `paused` | `quarantined` |
|---|---|---|
| 触发 | 共享上界耗尽（12 次非 terminal 失败） | `journal_incompatible`，或 `recovery_required` 到界（2 次） |
| 语义 | "反复失败，但**可能**是暂时的" | "确定性不兼容，自动重试无意义" |
| 自动重试 | 停止 | 停止 |
| frozen payload | 保留 | 保留 |
| 用户显式 Retry | 允许，且**重置两个计数**（SEQ-004 的 `reset` 单元格） | 允许（升级到修复后的运行时之后有意义），同样重置 |
| 文案 | `PAUSED`（新增静态常量） | `QUARANTINED`（复用 F-12 的死常量 `CONFLICT_MANUAL` 槽位） |

### 4.7 `turnMutationRecoveryAttemptsRef` 整体删除

六处使用（F-6）全部随之改写：`:13400-13402` 改为读条目 + 调决策函数 + `recordTurnMutationRetryOutcome`；`:9112`、`:13422`、`:13545`、`:13572`、`:13602` 五处 `delete` 全部删除（条目本身已被 `removeTurnMutation` 删掉，计数随之消失，不存在遗留）。**不保留双份真相**——留着 ref 做"本次挂载内的快路径"会立刻产生两套互相矛盾的计数，正是本条要消灭的东西。

`scheduleRetry` 的 `attempt >= 6` 分支与它那句 `"This message change still needs recovery. Reopen the task to retry safely."` 一并删除，理由见 §5.4。

---

## 5 · SLOT-003（四）· quarantine 的用户可见语义

### 5.1 强制约束：不给出口 = 永久锁死这个 chat

由 F-4，**只要 chat 存在 outbox 条目，发送、模型选择、消息动作按钮全部禁用**。所以"保留 frozen payload 不删除"这条正确的规则，如果不配一个用户处置入口，其直接后果是：**用户的这个会话永远无法再发消息，且没有任何界面告诉他为什么、也没有任何办法解除。** 今天的 F-3 分支已经能产生这个状态（只是很少见）。本案把 `journal_incompatible` 变成一条**常见**路径，因此处置入口从"nice to have"升级为**本交付的必需项**。

### 5.2 状态来源与呈现位置

- **来源**：outbox 条目本身（`retryStatus` / `lastFailureCode` / `kind` / `text`），不是 `streamError`。F-5 证明 `streamError` 只在该 chat 恰为活动 chat 时写入、随渲染消失、不跨重启——它无法承载一个**持久**状态。
- **hook 出口**：`use_chat_stream` 新增一个派生只读对象（与既有 `isTurnMutationBlocked` 同一处计算，不新增存储读取）：
  `turnMutationHold = { operationId, kind, status, canRetry, canDiscard, recoverableText }`，其中 `recoverableText` 仅对 `kind !== "delete"` 且非空时给出。
- **呈现**：chat 输入区上方的**常驻**内联提示（不是 toast、不是 disclaimer 字符串），因为 disclaimer 已被 `streamError`/streaming 状态占用且是瞬时的。文案一律来自 `CONTEXT_V2_TURN_MUTATION_MESSAGES` 的静态字面量，**绝不显示服务端 message**（该纪律见 `context_v2_turn_mutation.js:93-96`，且由 F-10 可知服务端 message 此时就在 `error.message` 里，正是最容易被顺手渲染出去的东西）。
- 提示在条目**存在期间**始终可见（不只在 paused/quarantined），因为锁本来就在生效；`status === ""`（仍在自动重试）时只显示"正在应用你的修改"与 Discard，不显示 Retry。

### 5.3 用户能做什么

| 动作 | 何时可用 | 效果 |
|---|---|---|
| **Retry now** | `paused` 或 `quarantined` | `clearTurnMutationRetryState` 重置两个计数与状态 → effect 立即重放一次。这是 SEQ-004 `reset` 单元格的**唯一**合法 reset |
| **Discard** | **仅当条目无 `v2Ack`**（见下） | `removeTurnMutation` → 解除该 chat 的锁 |
| **取回我的文字** | `kind` 为 `edit` / `resend` 且 `text` 非空 | Discard 时把 `entry.text` 经 `dispatchComposerPrefill`（`src/SERVICEs/composer_prefill.js`）写回输入框，**丢弃动作因此永不销毁用户写过的内容** |

**Discard 的 ack 门是硬性的**：由 F-11，带 `v2Ack` 的条目意味着**journal 已经被改写**，只剩 shadow 的 V1 mirror 腿未完成。删除这种条目会抹掉"V1 落后于 journal"的唯一记录并解锁一个短期记忆已脏的 chat——`applyTurnMutationMemory:4136-4142` 的注释正是为此把 mirror 失败硬编码为 never terminal。所以带 ack 的条目**不提供 Discard**，只提供 Retry 与"继续等待"。好消息是这与本案的两个新 code 无交集：rebase code 只可能出现在无 ack 的条目上（F-11），所以 **quarantine 状态下 Discard 总是可用**。

**不做导出**。用户要的是"我写的那段字别没了"，`composer_prefill` 已经完整满足；为一个失败的 rebase 意图新造一个导出格式，是把内部记账做成用户面概念。

### 5.4 与 "Reopen the task to retry safely" 的关系

**该提示删除，不保留、不改写。**

它今天是 `attempt >= 6` 的唯一出口（F-6），而它给出的指引——"重新打开这个任务"——**恰好就是触发无界重试的那个动作**：重挂载让 useRef 归零，于是又来六次。它在字面上指导用户去执行本案要消灭的行为。新模型下"重新打开"不再做任何事（计数持久），用户唯一有效的动作是显式 Retry，而那颗按钮就在他眼前。

`CONFLICT_MANUAL`（F-12，今天的死常量）与 recovery `:13554` 那条近似内联字面量一并收敛为新的 `QUARANTINED` 常量，消除同一语义的三份措辞。

### 5.5 不做 UI 稿

S-0010 要求"给设计要点即可"。以上为要点。视觉规格若需正式化，按铁律使用 BUILTIN 组件默认形态、`isDark` 内联分支，本 owner 认为**不需要**为此召集 `expert-ux`（无新组件、无新布局范式），但这是 Chief 的判断，记为 U-9。

---

## 6 · Owner confirmation

### 6.1 BC-004（consumer 侧，code-owner-chat-core）

**`CONFIRMED_CONDITIONAL`** — 条件为 §8 的 M-8、M-9、M-10 三项被采纳（M-11 为措辞改进，不构成条件）。

逐字段核对：

- **producer / consumer / owner**：正确。
- **canonical representation**：对 sidecar HTTP 信封的描述正确，但**不是 renderer 实际消费的表示**（F-10）。→ M-9。
- **consumer projection**：四类映射正确；"未知 code 仍按可重试处理但必须有跨重挂载的有界上限"正确且已由 §4 实现；"已在实践中忽略 `retryable`"属实，但比"忽略"更强——它不可达（M-11）。**缺 terminal 两种处置的区分**（M-8）。
- **admission policy `CLOSED` / admission details**：接受。"只新增 code 值、不动 envelope 字段"对 consumer 侧成本最低，本 owner 明确支持，并据此在 §4.4 把全部分类判据收敛到 `code` 单一输入。"重试计数必须随 outbox 条目持久化"接受并已交付；**需补一条计数字段不得导致条目 reject**（M-10）。
- **unknown input behavior**："未知 code 在有界重试耗尽后进入 quarantine，绝不丢弃 frozen payload"——本 owner **部分不同意措辞**：未知 code 耗尽后应进入 `paused` 而非 `quarantined`。二者对外部可观察行为的差别只有文案与"是否可能自愈"的暗示，但把一个仅仅是"没见过"的 code 判成"确定性不兼容"，与 BC-003 `unknown input behavior`（未知 reason 不给 terminal code，以免 quarantine 掉本可自愈的瞬时状态）的立场自相矛盾。→ 并入 M-8。
- **failure semantics**："任何失败都不清空 outbox"与 F-2 的既有行为**直接冲突**（既有九个 terminal code 会删条目）。→ M-8。
- **identity/version binding**：`PENDING_CANDIDATE_FREEZE`，无异议。
- **positive/negative acceptance**：AC-012 正文见 §7。

### 6.2 SEQ-004（owner: code-owner-chat-core）

**`CONFIRMED_CONDITIONAL`** — 条件为 M-12 被采纳；M-13 是给 lead 的建议，不构成条件。

- **identity key**：`outbox entry id 加 owner_chat_id 加 session_id 加 frozen operation_id 与 payload_sha256 加 expected_head_revision 加重试次数`。两处需修：(i) renderer 侧不存在独立的 "entry id"，唯一主键就是 `operationId`（`turn_mutation_outbox.js` 全程以它去重、CAS、删除），也不存在 `payload_sha256`（frozen payload 靠**固定 key 顺序的 JSON 字节稳定性**保证同一性，见 `turn_mutation_outbox.js:86-90` 与 `context_v2_turn_mutation.js:308-309`）；(ii)"重试次数"应写成具体字段 `replayAttempts` 与 `recoveryRequiredAttempts`。→ M-12。
- **initial state / ordered events / expected observations**：与本交付一致，接受。"重挂载不重置重试上界"正是 §4 的核心义务。
- **persistence boundary**：`localStorage pupu.turn_mutation_outbox.v1` 与 Context V2 durable generation head，正确。
- **七个 REQUIRED 单元格**：全部接受为 REQUIRED，无一可判 `N/A`；`reset` 单元格今天在 renderer 侧**没有任何实现**，本交付第一次给它一个定义（用户显式 Retry），这是它能保持 REQUIRED 的前提。
- **positive = negative = AC-012**：见 M-13 与 §9 对 S-0011 挂账项的答复。

---

## 7 · AC-012 正文

> **AC-012 | renderer rebase code 分类、跨重挂载持久化的重试上界与 quarantine 处置**
>
> **取证位置**：(A) `src/SERVICEs/turn_mutation_outbox.test.js`（schema、迁移、clamp、CAS）；(B) `src/PAGEs/chat/hooks/context_v2_turn_mutation.test.js`（纯分类与决策表、封闭集合穷举、divergence）；(C) 新增 `src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_retry.test.js`（render 级：计时器、重挂载、锁、用户动作）；(D) producer 信封 fixture `src/PAGEs/chat/hooks/__fixtures__/context_v2_rebase_error_envelopes.json`。执行方式 `npx react-scripts test --watchAll=false`（**不得直接 `npx jest`**）。
>
> **producer 真实性**：位置 (D) 的 fixture 由 AC-011 子例 6 的 pytest 在**真实 Flask 测试客户端**对 `POST /context/v2/session/rebase` 取到七个 code 的真实响应后写出，内容为 `[{code, http_status, message}]`；renderer 测试只读消费，两侧不共享任何 helper。renderer 侧另有一条断言：fixture 中每个 `message` 逐字等于常量 `"Unchain-owned generation request failed"`，任何一条携带真实 reason、subject 或 unchain 原始异常文本即失败。
>
> **正向子例（映射 SEQ-004 七个 REQUIRED 单元格）**
>
> 1. **first use**（位置 C）：一条全新 v2 条目，首次替换成功 → 恰一次 `rebaseSession` 调用、ack 被 `recordTurnMutationRebaseAck` 落盘、条目被删除、`sendDisabled` 由 true 变回 false；四个新字段全程保持 `0/0/""/""`。
> 2. **repeat · 同一 frozen payload 重放幂等**（位置 C）：条目已带 `v2Ack`，触发两次替换 → `rebaseSession` **零次**调用（F-11 的跳过路径），不产生第二个 generation，`replayAttempts` 不增长。
> 3. **repeat · 同一 chat 的第二次 mutation**（位置 C）：第一条完成并出队后再发起一次 edit → 新 `operationId`、新条目，计数从 0 起算，不继承前一条的任何记账。
> 4. **retry**（位置 B+C）：非 terminal code（取 `context_v2_rebase_unavailable`）连续失败 → 每次 `replayAttempts` **精确 +1**，`delayMs` 逐项等于 `min(60_000, 250 * 2 ** (n-1))`；第 12 次后 `retryStatus === "paused"`，此后推进任意时长的假时钟**不再产生任何** `rebaseSession` 调用；条目与 `v2RebasePayload` 深比较逐字段不变。
> 5. **resume**（位置 B+C）：`context_v2_rebase_recovery_required` 第一次 → `delayMs === 250`；第二次 → `delayMs === 750` 且 `recoveryRequiredAttempts === 2` → `retryStatus === "quarantined"`、`lastFailureCode === "context_v2_rebase_recovery_required"`、条目保留、无第三次调用。同一序列中 `replayAttempts` 同步递增到 2（共享计数确实被计入）。
> 6. **restart / 重挂载**（位置 C，**red-before-green**）：在 `replayAttempts === 5` 时卸载并重新挂载 hook（并重新从 `localStorage` 读取，模拟应用重启）→ (i) 首次替换**不是立即**发生，而是在 `delay(5) === 4000ms` 之后；(ii) 计数从 5 继续而**不是**从 0；(iii) 跨两次挂载的 `rebaseSession` 总调用次数 ≤ 12。**今天此用例必然失败**（useRef 归零 + 挂载即立即重放），红档必须留存。
> 7. **reset**（位置 C）：对 `paused` 与 `quarantined` 各一条条目触发用户 Retry → 两个计数归零、`retryStatus` 归 `""`、`lastFailureCode` 归 `""`、恰一次新的替换尝试；除此之外**没有任何**路径写回零（断言重挂载、切换 chat、`setTurnMutationVersion` 递增均不重置）。
> 8. **rollback / 双向 schema skew**（位置 A）：(i) 旧条目（无四字段）经 `normalizeTurnMutationOutboxEntry` → `0/0/""/""` 且其余字段逐字不变；(ii) 新条目（带四字段）交给"旧 normalizer 语义"（以 allowlist 白名单模拟）→ 四字段被丢弃，`v2RebasePayload` / `v2Ack` / `v1MirrorState` 深比较逐字不变，`readTurnMutationOutboxState().available === true`。
>
> **负向子例**
>
> 9. **quarantine 绝不丢弃**（位置 C，**red-before-green**）：本地会话 fingerprint **仍等于** `originalFingerprint`（即今天必定触发 `removeTurnMutation` 的条件）时收到 `context_v2_rebase_journal_incompatible` → 条目**仍在** outbox 中、`v2RebasePayload` 与入队时深比较逐字节相同、`retryStatus === "quarantined"`、其后无任何 `rebaseSession` 调用。foreground（resend/edit/delete 三处）与 recovery 路径**各测一次**，共四格。今天四格全部失败（F-2），红档必须留存。
> 10. **既有 terminal code 行为不回归**（位置 B+C）：九个既有 code 的 `contextV2RebaseTerminalDisposition` 全部为 `"discard"`，`context_v2_turn_mutation.test.js:477-503` 的既有 `test.each` 断言不修改并保持绿；foreground 在 fingerprint 匹配时仍删除条目。
> 11. **封闭集合穷举与 divergence**（位置 B+D）：对 fixture (D) 中**每一个** code 断言 `resolveTurnMutationRetryDecision` 返回四个 action 之一且非缺省分支；若 fixture 中出现 renderer 未显式归类的 code，测试失败（这是 BC-004 `CLOSED` 在 consumer 侧的实际执行点）。反向：一个**不在** fixture 中的 code（`context_v2_some_future_code`）必须走 `retry` → 共享上界 → `paused`，**不得**被判 `quarantine`、**不得**被 discard。
> 12. **计数字段绝不使条目失效**（位置 A，**red-before-green**）：`replayAttempts` 取 `"9e99"` / `-1` / `null` / `{}` / `Number.MAX_SAFE_INTEGER`，`recoveryRequiredAttempts` 同样五种，`retryStatus` 取 `"QUARANTINED"` / `123`，`lastFailureCode` 取 512 字符串 / 含控制字符 / 非字符串 —— 逐项断言 `normalizeTurnMutationOutboxEntry` **不返回 null**、`readTurnMutationOutboxState().available === true`、`isTurnMutationBlocked` 不因此对无关 chat 为 true，且数值 clamp 到 `[0, 上界]`（缺失→0、非法→上界）。
> 13. **静态文案与不泄漏**（位置 C）：对 fixture (D) 七个 code 各触发一次，断言渲染输出中出现的字符串**逐字**属于 `CONTEXT_V2_TURN_MUTATION_MESSAGES` 的值集合；断言常量 `"Unchain-owned generation request failed"`、任何 `[code]` 前缀原文、任何 attempt_id / event_id / generation_id 取值均**不出现**在渲染树中。
> 14. **带 ack 条目不可 Discard**（位置 C）：条目带 `v2Ack` 且 `v1MirrorState === "pending"` 时，`turnMutationHold.canDiscard === false`，UI 不暴露 Discard；强行调用 `removeTurnMutation` 的路径在 hook 内不存在（以 spy 断言零调用）。
>
> **红档要求**：子例 6、9、12 三项必须保存 red-before-green 记录。

**若 lead 采纳 M-13**：子例 9–14 可**逐字**移入一条新的负向 AC，正向子例 1–8 编号不动。本 owner 不自行编号。

---

## 8 · 对 PS-002 的修改意见

- **M-8（BC-004 `consumer projection` / `failure semantics` / `unknown input behavior`；实质）**：terminal 必须区分 `discard` 与 `quarantine` 两种处置，并据此改写三处：(i) `consumer projection` 的四类映射改为五类（terminal-discard / terminal-quarantine / recovery_required / in_progress / retryable），或至少在 terminal 一类内注明处置分叉；(ii) `failure semantics` 的"任何失败都不清空 outbox"限定为"**本案新增的两个 code、未知 code 与 recovery_required**；既有九个 terminal conflict code 的 fingerprint 门控 discard 是本案之外的既有刻意行为，不在 write_set 内"——不改这句，BC-004 字面上要求推翻九个既有 code 的处置，属未声明的范围扩张，且与 non_goal「不改与本案无关的行为」相抵；(iii) `unknown input behavior` 的"未知 code 耗尽后进入 quarantine"改为"进入有界耗尽的 paused 稳态（保留 payload、停止自动重试、可由用户显式重试）"，理由是它与 BC-003 对未知 reason 的立场必须一致。
- **M-9（BC-004 `canonical representation` / `consumer projection`；实质）**：补上 renderer 实际消费的表示。事实（F-10）：Electron 跨 `ipcMain.handle` 丢弃 `error.code`，main 因此把错误重建为 `` `[${code}] ${message}` `` 并原样透传 code（无 allowlist），renderer 用 `/\[([a-z0-9_]+)\]\s/` 反解。因此 (i) `retryable`、`expected_revision`、`actual_revision` **不可达** renderer；(ii) CLOSED 的"key set 精确"在 consumer 侧没有对象可比对，实际准入判据是"code token 匹配 `[a-z0-9_]+` 且紧跟一个空格"；(iii) SLOT-004 的义务应写成"main 不得对 context_v2 error code 做 allowlist 过滤、大小写改写或截断"，并有测试锁定——今天这条只由实现细节保证，无任何测试。不写清这层，BC-004 就不是一份可验收的 consumer 契约。
- **M-10（BC-004 `admission details`；实质）**：补一条与"重试计数必须随 outbox 条目持久化"同等强度的约束：**计数字段的任何取值都不得使 outbox 条目 normalize 失败**。依据 F-8，单条目失败会让整库 `available:false`，从而锁死每一个 chat 的输入面并让 recovery 直接报 `PERSIST`——用记账字段制造全局输入锁，比无界重试更严重。
- **M-11（BC-004 `canonical representation`；措辞）**：`retryable` 的定性由"HTTP 层咨询性遥测、renderer 已在实践中忽略"改为"**不跨越 IPC 边界，renderer 的唯一输入是 code**"。SLOT-002 的 M-4 结论不变，但理由从"约定"升级为"物理事实"，可防止将来有人试图用 `retryable` 承载语义。
- **M-12（SEQ-004 `identity key`；准确性）**：改为 `operationId 加 owner_chat_id 加 session_id 加 frozen payload 的固定 key 顺序 JSON 字节 加 expectedSessionRevision 加 replayAttempts 加 recoveryRequiredAttempts`。理由：renderer 侧不存在独立 "entry id"（`operationId` 即主键）与 `payload_sha256`（同一性由固定 key 顺序的字节稳定 JSON 保证，见 `turn_mutation_outbox.js:86-90`）。
- **M-13（SEQ-004 正负兼任；程序，答复 S-0011 挂账项）**：建议**拆一条独立负向 AC**，正文即 §7 子例 9–14。理由与 S-0006 observation 对 BC-004 的处置一致：SEQ-004 的七格里 `rollback` 与 `reset` 两格的实质内容是负向的（skew 与"除用户显式动作外没有任何路径重置"），由同一条 AC 兼任会让验收时无法逐格追踪哪一格失败。本次可拆的前提也已具备：AC-012 正文由本棒交付，负向子例是新写的，不存在 S-0006 defect 2 那种"新编号溢出已冻结 HS scope"的问题——但**编号由 lead 在集成时决定，本 owner 不自行编号**。
- **M-14（PS-002 §SLOT-002 A 表格第 5 列；表述）**：`context_v2_revision_conflict` / `context_v2_generation_conflict` / `context_v2_operation_conflict` 三行的"renderer 类"写作 `terminal`，与 `journal_incompatible` 行的 `terminal，quarantine` 并列，容易被读成同一处置。建议第 5 列改为 `terminal-discard` / `terminal-quarantine` 两个明确取值。
- **M-15（PS-002 §送裁前仍缺 第 7 条 / 风险 R6；范围）**：R6 的退路（新 endpoint）被记为"只把 SLOT-004 从确认透传升级为新增 channel"。**这不完整**：若改走新 endpoint，恢复的触发者从 sidecar 变成 renderer，本棒第 2 项交付（`recovery_required` 的退避与上界）必须返修——它将从"退避重放同一个 rebase 请求"变成"先调 recovery endpoint、再重放、并对 recovery 调用自身也建立有界上限与失败分类"，`replayAttempts` 之外需要第三个计数，AC-012 子例 5 需重写。请在 `mandatory responses` 中一并注明该取舍**同时影响 SLOT-003 与 SLOT-004**，并且如果 Chief 选择退路，本 owner 需要第二次交棒。

---

## 9 · Remaining unknowns

| # | 未知 | 归属 | 影响 |
|---|---|---|---|
| U-8 | AC-012 位置 (D) 的 producer fixture 由谁生成 —— 建议由 AC-011 子例 6 的 pytest 顺带写出（runtime 边界内的小增量），备选是 devtools 在 release-qa 里生成 | lead / code-owner-runtime / code-owner-devtools | 决定 BC-004 的"真实 producer → 严格 consumer"证据是否成立。若两者都不可得，退路是 renderer 侧签入一份手抄封闭集合加一条读取 `unchain_runtime/server/` 源码的 divergence 守卫测试，强度明显更弱 |
| U-9 | quarantine 常驻提示是否需要正式 UX 规格（`expert-ux`） | chief-judge | 本 owner 认为不需要（无新组件、无新布局范式，用 BUILTIN 默认形态即可）；若需要则多一棒 |
| U-10 | sidecar 的 `(execution_id, generation_id, reason)` 上界在**重启时归零**（PS-002 明示有意），而 renderer 的 `recoveryRequiredAttempts` **跨重启不归零**。最坏情况下 renderer 先到界并 quarantine，而 sidecar 认为还应再给一次机会 | code-owner-runtime | 本 owner 认为这正是期望行为（renderer 是跨 sidecar 生命周期的唯一记忆），但需 runtime 确认它不与"重启正是新 crash window 可能产生的时刻"的意图冲突 |
| U-11 | 用户显式 Retry 重置 renderer 计数时，未重启的 sidecar 侧 LRU 可能仍记着 2，于是这次重试**立刻**拿到 `journal_incompatible`。用户看到的是"点了重试，立刻变成另一种失败" | code-owner-runtime | 本 owner 认为可接受（更快收敛到确定结论），但如果 runtime 认为用户显式重试应当同时清 server 侧计数，那需要一个 side channel，属新增边界，须回方案 |
| U-12 | `MAX_REPLAY_ATTEMPTS = 12` 与 60 秒退避封顶是本 owner 的工程判断，无生产遥测支撑（本仓没有 rebase 失败率的埋点） | lead | 数值可调；"必须显著大于今日的 6"是实质意见，具体取 10 还是 12 不改变任何 AC 的结构 |

---

## 10 · 建议的后续交棒

1. **SLOT-004 | code-owner-electron**：本 owner 已核实（F-10）今天 main 对 code 是原样透传、renderer 的正则能吃下两个新 code，因此**预期结论确实是"无需改动"**。但请把交付明确为两条**新增测试**而非纯确认：(i) `context-v2:rebase-session` 对任意 `[a-z0-9_]+` code 的透传不做 allowlist / 改写 / 截断（今天只有实现细节保证）；(ii) 409 body 的透传路径对两个新 code 各一格。`.js` / `.cjs` 双胞胎必须同步（铁律，本仓唯一会静默失效的测试形态）。
2. **R6 取舍应在 SLOT-004 之前定** —— 并请注意 M-15：它同时影响本棒已交付的第 2 项。若 Chief 选退路，请在同一次裁定中安排 chat-core 的第二次交棒。
3. 不建议为本案召集 `expert-ux` 或 `expert-security`：无新组件与新布局；renderer 侧新增的持久字段只有两个整数、一个封闭枚举与一个字符集受限的 code token，不承载任何用户内容，且 §7 子例 13 已对"不泄漏"取了负向证据。
