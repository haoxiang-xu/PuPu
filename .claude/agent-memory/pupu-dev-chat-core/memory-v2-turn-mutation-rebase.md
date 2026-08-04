---
name: memory-v2-turn-mutation-rebase
description: Memory V2 P0 turn-mutation 接缝（2026-08-01）——admission 只认 session head、frozen payload 冻结点、mutationReady/shadow 取舍，以及 shadow 双写(V2 journal + V1 authoritative)裁决与 Partial 协议
metadata:
  type: project
---

edit/resend/delete 在 Memory V2 下改走 `contextV2Bridge.getSessionHead` + `rebaseSession`，不再调 V1 `replaceSessionMemory`。规则集中在纯模块 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js`，持久化形状在 `src/SERVICEs/turn_mutation_outbox.js`，接线在 use_chat_stream 的 `resolveTurnMutationMemoryPlan` / `applyTurnMutationMemory`。

**Why:** 一旦 chat 被 V2 收编，journal 就是记录的真身；走错子系统重写是**单向门**——mutation 之前的 generation 已经封存，后续 phase 修不回来。所以宁可 block 也不回落 V1。

几条不该被"顺手简化"的决定：

- **只有两扇门通向 Legacy**：feature flag off，或 head 明确报"这个 session 没有任何 V2 状态"（HTTP 404 `context_v2_not_found`，或 admission 全空）。bootstrap pending/failed、bridge 不可用、readOnlyDegraded、head 身份不符、任何解析不全 → 一律 **blocked + 静态文案 + 本地历史不动**。admission **不读 `readMemorySettings()`、不看向量状态**：legacy 短期记忆开没开，跟 V2 journal 存不存在毫无关系。

- **mutationReady 与 shadow 的冲突（本次最大的判断题，CEO 的原始要求里两条互斥）**：sidecar 的 `mutation_ready`（memory_v2_store.py `session_head`）定义里含 `target_mode=='active' and effective_mode=='active'`，所以**shadow 模式下它结构性恒 false**；而 `rebase_session` 本身根本不校验 mode，只要 session 行在、revision 对、generation 对、没有 open capture。shadow chat 照样 journal 每一轮，它的 canonical journal 必须被 rebase。故最终裁决是：**admission 恒要求 bootstrapped+complete+sessionExists+generation+revision；只有 `admissionMode === "active"` 时才额外要求 sidecar 的 mutationReady**。若照字面只认 mutationReady，shadow rollout（默认档）下所有 edit/resend/delete 全被 block。**改这条之前先重读 memory_v2_store.session_head。**

- **~~shadow 下的已知代价~~ → 2026-08-01 architect 裁决为 shadow 双写，已实现（工作树，未 commit）**。原问题：shadow 下模型输入仍走 legacy history + V1 session memory，而只 rebase journal 会让被删/被改那轮在 V1 里残留 → shadow 相对 legacy **改变了模型输入**，违反 shadow 的签字定义，并污染切流 A/B 基线。裁决（选 A）：
  - `shadow` = **两腿都写，journal 先**：rebase → verifyAck → recordAck → V1 authoritative replace → 记 `v1MirrorState=applied` → 才本地提交/发请求。`active` = **只 rebase，永不碰 V1**（那里 journal 就是模型输入）。
  - **V2 先 V1 后不能反**：V1 先行时若 rebase 撞 terminal conflict，行会被丢弃而 V1 已变异 = 不可恢复的反向漂移。
  - **Partial 协议**（跨系统无原子性）：[1] 成功 [2] 失败 → 行留存带 `v2Ack + v1MirrorState:"pending"`，**零本地提交、零请求**（带脏 V1 跑 turn 正是要消灭的东西），`isTurnMutationBlocked` 自动锁死该 chat；recovery 凭 v2Ack **跳过 rebase**、只重放冻结的 V1 腿。
  - **V1 腿失败永远判 retryable，绝不 terminal**：journal 已经 rebase 过了，terminal 会让调用点删行 → 抹掉"V1 落后"的唯一记录并静默解锁脏会话。
  - **V1 内容永远来自 `v2RebasePayload.replacementHistory`（单一冻结工件）**，不来自 live `replacementMessages`；且**不传** expectedSessionRevision / expectedCancelAttemptId（chat 级 claim 已串行化写者，rebase 自身的 open-attempt fence 已挡过；给冻结重放上瞬时 id 的闸只会把 Partial 行卡死）。
  - outbox 新增两个冻结字段 + normalizer 三条：shadow 缺 `v1MirrorState` → **整行 reject**；active 带 V1 字段 → **strip**（active 本就 rebase-only，strip 即正确行为，且与 payload allowlist 丢多余键一致）；**旧 v2 行无 `admissionMode` → rebase-only 重放**（它们从没冻过 V1 快照，给它们发明 V1 写就是推一段没人校验过的历史进短期记忆）。声明了但取值未知的 admissionMode 属损坏 → reject。
  - `recordTurnMutationV1MirrorApplied` 是 CAS，额外要求**行里已有 v2Ack**——让"V1 写了但 journal 没写"在存储层**无法被表示**。

- **payload 在 enqueue 时冻结一次，recovery 绝不重取 head**。`v2RebasePayload` 只允许七个字段（ownerChatId/sessionId/replacementHistory/sourceGenerationId/expectedSessionRevision/operationId/reason），key 顺序固定以保证 JSON 字节级 round-trip——replay 必须发**完全相同**的请求才能命中 sidecar 的幂等 receipt，否则会造出第二个 generation。**`expectedSessionRevision` 一律原样透传，不 default 不 coerce**；`0` 合法且必须能过（任何 falsy 判断都会让带 0 的操作不可恢复）。但**"没 rebase 过就是 0"这句注释原本是错的**（已在代码里更正）：`memory_v2_store` 建 session 行时 `sessions.revision INTEGER NOT NULL DEFAULT 1`，`session_head` 只有在**根本没有 session 行**时才报 0，而那种形态压根进不了 V2 admission——所以真机首次 edit 带的是 **1**。

- **冻结投影与 legacy 的保真度差（结构性，非本次引入，值得知道）**：`replacementHistory` 只有 role+content（rebase allowlist 三处强制），所以 attachment payload blocks 和 assistant `interjections` 里的 FYI wrapper **都带不过去**，纯附件消息投影后为空被丢弃。后果：含附件/FYI 的历史，V2 两腿彼此**完全一致**（这正是裁决要的），但两腿都与 flag-off legacy 的 V1 内容**不同**。文本历史下三者字节一致（有等价性测试锁）。要闭这个差得另冻一个 legacy 全量 message 工件 + 尺寸护栏——architect 明确把它留作"仅当 API 必须"才做，属未决项。

- **replacementHistory 只投影 role+content，另起 helper，不改 `buildContextV2History`**。三处独立校验都拒绝多余键（electron main 的 `requireContextV2ReplacementHistory` 重建成 {role,content}；memory_v2_store.rebase_session 直接 `unknown_fields` 报错并额外拒 host path / file:// ）。所以 **attachments 不能带**，纯附件消息投影后内容为空、被丢弃（宁可少一条也不能往 canonical journal 塞空 user turn）。

- **ack 是服务端收据，不是本地指纹猜测**。verify 至少校 generationId(非空且≠source)、turnMutationEventRef、sessionRevision 严格前进、sourceGenerationId/owner/session/reason 一致。ack 不合格判 **retryable 不判 terminal**——replay 会拿回 receipt。outbox 里只落 server-minted 标识（`recordTurnMutationRebaseAck` 是 CAS：操作不存在不复活、非 v2 拒绝、换了 generation 的第二份 ack 拒绝、绝不重取 head）。

- **memoryMode 缺失＝legacy，是闭集**；声明 v2 但 payload 不全的 entry **整条 reject 而不是降级**——降级等于对 V2 session 跑 V1 重写。reject 只丢一次用户可重试的意图，降级会不可逆地把 journal 写歪。

- **错误分类反着来**：未知 code 归 **retryable**（保留 durable intent），revision/generation conflict 虽然 sidecar 标 `retryable=True` 但对**冻结** payload 是 terminal（期望值已定死，永远不会再匹配）。

- **顺序不能动**：edit/resend 的 ack 必须早于 `runTurnRequest`（optimistic user message 在那里写）；delete 的 ack 必须早于 `commitForegroundMessages` + `setChatMessages`。streaming delete 仍是先 cancel/fence 再读 head；backend 报 `context_v2_rebase_in_progress` 就留着 outbox 重试，**不伪造 cancel ack、不回落 V1**。

**How to apply:** 动 turn mutation 三条路径或 recovery effect 前，先读 `context_v2_turn_mutation.js` 的文件头注释（mutationReady/shadow 那段）。测试锁在 `context_v2_turn_mutation.test.js` / `turn_mutation_outbox.test.js` / `use_chat_stream.turn_mutation_v2.test.js`。相关：[[memory-v2-p0-chat-seam]]。
