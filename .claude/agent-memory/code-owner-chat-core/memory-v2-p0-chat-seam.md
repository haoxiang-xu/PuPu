---
name: memory-v2-p0-chat-seam
description: Memory V2 P0 renderer chat 接缝契约（2026-08-01 落地）——owner_chat_id 语义、context_v2_history 取舍、secret capture 插入点与 fail-closed 不变量
metadata:
  type: project
---

Memory V2 P0 的 chat-core 侧已落地（use_chat_stream.js + hooks/secret_capture.js + hooks/context_v2_history.js）。

**Why:** architect+LLM+security 三方 sync 定的契约，后续 phase（sink resolution、durable bootstrap、interject 覆盖）容易"顺手"破坏这些决策：

- **owner_chat_id = UI chat id（targetChatId），永远不是 effectiveThreadId**。character chat 的 threadId 会变成 character session_id，owner 身份必须保持 UI chat。普通 V4 与 durable resume payload 顶层都无条件带（durable 用对象 spread 合并，`buildDurableResumePayload` 本体不改）。backend 在 route_chat.py:510 读取并映射到 `options._memory_v2_owner_chat_id`。
- **flag on 时 memory_v2_requested + memory_agent_config 普通发送与 durable resume 都带**（resume 也是一次 V2 turn，sidecar 必须同路由）；**唯独 context_v2_history 只在普通发送出现**——durable resume 的 canonical history 已在服务端，重发既冗余又是第二个写入方。flag off 时两条分支的 payload 与 V2 之前逐字节相同。
- **memory_agent_config 只允许 `{displayName, additionalInstructions, provider, modelId}` 四个字段，在 payload 构造处显式逐字段挑出**（不是整包 spread `readMemoryAgentSettings()`）——防止 memory_agent_v2 namespace 里将来多存的任何字段（凭据类尤甚）顺着上行。绝不把任意 settings namespace 放上 payload 顶层。
- **context_v2_history 从 normalizedBaseMessages（settled prior turns）构造，故意不含 in-flight user message**（它走 payload.message；含进去会让 sidecar bootstrap 与 live journaling 双写同一条）。只含 user/assistant、排除 status==="streaming"、不拷 traceFrames/meta/composer、附件保留存储态 metadata。legacy `history` 字段逻辑零改动 → shadow 模式模型输入 byte-equivalent。
- ~~secret capture 插入点在 runTurnRequest 的 `!isDurableResume` 块顶部~~ **（2026-08-01 已废止，见下面「显式语法旁路修复」）**：capture/deposit 已整体上移到 `useSecretCaptureGate`，runTurnRequest 里只剩一个消费 token 的 guard，`secretSafePromptText` 这个别名也随之删除（下游一律读 `promptText`）。
- **fail-closed 不变量**：malformed 语法 / bridge 缺失 / safeStorage 不可用（deposit 拒绝 `secret_storage_unavailable`）/ deposit 无 handle → 全部不发送、不写 optimistic、错误只用 SECRET_CAPTURE_MESSAGES 里的静态文案（绝不插值用户内容，也不 surface 跨过 IPC 的 error.message）。heuristic 只对未包裹段落生效、保守（赋值形式 + 字母+数字 + 非占位符），命中值绝不进提示/日志。
- deposit 契约：scopeKind:"chat"、scopeId=targetChatId、随机 operationId `[A-Za-z0-9_.-]{8,128}`、label 规则镜像 vault（NFC/trim/≤120cp/≤512B）、总 VALUE ≤64KiB（vault 单条上限相同）。marker：`<secret-handle label="..." handle="pvh1_..."/>`，label XML-escaped。
- **draft 落盘也是一条独立泄漏边（2026-08-01 补）**：composer 每 250ms debounce 把 draft text 写进 chats DB，还有 unload/切会话/unmount 三条 tail flush。secret capture 只在**发送**路径跑，所以"只打字不发送"曾能把明文凭据落进持久层，绕开 send 侧 fail-closed。修在 `use_chat_session_state.js`：`secretSafeDraftText()` 卡在两个 `updateChatDraft` 调用点（debounce + `flushDraftToStore`），命中就写 `""`（**attachments 保留**）；另有一个 `[activeChatId]` 的 passive effect 主动洗掉已存在库里的匹配 draft（**故意不放进 store subscriber，否则会重入切会话那次 emit**）。**内存态 composer 从不改写**——用户照常看得见/能编辑/能发送，只有持久副本被清空。
- **谓词是 secret_capture 的有意本地副本，不是 import**（当时该模块正被并发进程编辑）。`draftTextLooksSecret` 与 `hasSecretCaptureSyntax || detectLikelySecretAssignment` 的**等价性由 use_chat_session_state.draft_secret_guard.test.js 的 drift sentinel 锁住**——那组 parity 用例挂了＝两边漂了，要重新对齐而不是删测试。注意 `ASSIGNMENT_PATTERN` 带 `/g`，每次进出都要清 `lastIndex`（已有纯度用例守）。
- **Renderer Secret Gate（2026-08-01 加层）**：heuristic 从"直接 block"升级为**用户裁决门**（`use_secret_capture_gate.js` + `secret_capture_modal.js`）。几条不该被顺手推翻的决定：
  - **gate 只在命中时改变控制流**。`sendNewTurn` 先跑同步 `scanOutgoingSecretText`；clean 就走原来的**完全同步**路径（`runSend(text,"","")`），一个 microtask 都不多。命中才进 async gate。这是把 10k 行 hook 的回归面压到最小的关键——不要"统一改成 await 更干净"。哨兵用例："clean text still takes the fully synchronous path"（断言 `markChatStarted` 在 click 后**零 microtask** 就已被调用）。
  - **runSend 是 sendNewTurn 里从早退之后的整个函数体**，缩进故意没重排（少 150 行噪声 diff）。`text` 保留原始 composer 文本供 staleness 比较，`outgoingSource` 才是 gate 结果——两者不能混。
  - **range 定位必须靠算术**（`match.index + m[1].length + m[2].length`），`ASSIGNMENT_PATTERN` 因此拆成 (key)(sep)(value) 三组，`detectLikelySecretAssignment` 随之改读 `match[3]`。**绝不能用 indexOf/split-join 反查值的位置**：值在文中重复出现时会打错洞、把真凭据留下。`secret_capture_scanner.test.js` 里那条 "located by offset, not by search" 就是这个陷阱的哨兵。
  - `KNOWN_TOKEN_RULES` 的正则带 `/g`（scanner 要迭代），所以 `detectLikelySecretAssignment` 里 `.test()` **前后都要清 lastIndex**，否则谓词不再纯——drift sentinel 会挂。
  - **token 绑 (chatId, 展开前的 gated text)**，一次性、只在内存、切会话/unmount 即清。skill 展开在 gate 之后，属 app 内容不属用户凭据——这是有意的绑定选择。
  - **deposit operationId 每候选一个且在 open 时就固定**（vault 侧 `runIdempotentMutation` 按 operationId 重放同 receipt），所以双击 confirm 最坏也是幂等重放而不是建重复行。另有同步 `inFlight` 闩。
  - **全部 deposit 成功才替换 ranges**；中途失败用 `deleteSecret` 补偿已建 handle，什么都不发。
  - **outbox `disposition` 是闭集**（只有 `plain_user_approved`），并在 clarify↔FYI↔queue 每次转换里手动 spread 保留——漏一处，用户明确批准过的条目下次启动会被当"未 gate"清掉。
  - **legacy purge 是删除不是隔离**（`purgeUngatedSecretOutboxEntries`）：原地 quarantine 会把明文继续留在 localStorage，正是这道门要消灭的东西。提示文案静态、报告里不含任何可引用片段。
- **已知未覆盖面（后续 phase）**：interject 通道的文本不做 secret capture（gate 覆盖了 composer→interject 入口，但服务端 FYI/BTW 回来的文本没有再扫）。

**How to apply:** 动 use_chat_stream 发送路径或加新的 promptText 消费点时，必须读 `secretSafePromptText`；**新增任何 draft 写盘点（含 claimChatDraft/replaceClaimedChatDraft 这类路径）必须过 `secretSafeDraftText`**；改 payload 顶层字段先对照 route_chat.py 的 intake；相关测试锁在 use_chat_stream.memory_v2_payload.test.js / use_chat_stream.secret_capture_send.test.js / secret_capture.test.js / use_chat_session_state.draft_secret_guard.test.js。相关：[[vault 契约见 pupu-dev-electron 的 memory-vault-p0-contract]]。
