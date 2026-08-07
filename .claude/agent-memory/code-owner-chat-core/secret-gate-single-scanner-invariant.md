---
name: secret-gate-single-scanner-invariant
description: Secret Gate 显式语法旁路的根因与修复（2026-08-01）——一个扫描器、一个 gate、runTurnRequest 只剩 token guard，以及为什么 guard 的 subject 是 pre-expansion 文本
metadata:
  type: project
---

Memory V2 P0 Secret Gate 曾有一条 **显式语法旁路**：`{{secret:label}}VALUE{{/secret}}` 能完全绕过确认 UI，走到 `runTurnRequest` 深处才 deposit。2026-08-01 修掉（工作树改动，未 commit）。

**Why（根因值得记住，因为它是"两个扫描器"这一类错误的样板）：** 当时有两个扫描器，语义相反且没人对齐它们。
`scanSecretCandidates`（gate 与 `sendNewTurn` preScan 用）把 `{{secret:...}}` 区域当作 **excluded region**——因为"已经包好了就不用启发式再报一次"。这个局部判断本身没错，但它同时被当成"这条消息要不要过 gate"的判据，于是纯显式语法的消息 **扫描结果为 clean**，走同步 `runSend`，一路穿过 `beginRunGeneration` / `claimChatDraft` / `markChatStarted` / `runContext` / renderRuntime / confirmation 清理，才在 `planSecretCapture`（第二个扫描器）那里被捕获并 deposit。三个后果：副作用先于用户裁决发生；多 capture 部分失败**不补偿**已建 handle（留孤儿行）；STORED token 因为 plan 变成 `none` 而**从不被消费**，一次性语义破了。

**修复后的不变量（改之前先读这段）：**

- **只有一个扫描器 `scanOutgoingSecretText`**，显式块和启发式命中都是 candidate。`scanSecretCandidates` / `planSecretCapture` / `parseSecretCaptures` / `buildRedactedTextFromSegments` / `createSecretCaptureOperationId` 已**删除**——留着就是下一次漂移的种子。任何"这条消息要不要过 gate"的判断只准调 `scanOutgoingSecretText`。
- **candidate 有两组 span**：`start/end` 是替换区间（显式＝整个 wrapper），`valueStart/valueEnd` 是明文区间（显式＝内层 VALUE）。STORED 用 `applySecretHandleRanges` 把 wrapper 整段换成 marker；PLAIN 用 `applySecretPlainRanges` 把 wrapper 换成它自己的 value——**明文批准也必须脱 wrapper**，`{{secret:}}` 是 PuPu 语法，不该上模型。启发式 candidate 两组 span 重合，所以 PLAIN 对它是恒等变换。
- **显式 label 是唯一允许进 React state 的用户文本**。它在 value span 之外（结构上不可能带出凭据），且本来就要进 marker 和 vault descriptor。public gate 对象仍严格六字段。
- **`runTurnRequest` 不再 deposit 任何东西**，只在**最早可行位置**（turn-mutation 归属检查之后、`beginRunGeneration` 之前）消费一次 token。有 token → `consumeSecretGateToken(chatId, gatedText)`；无 token → 扫 `gatedText`，非 clean 就静态 fail closed。**STORED 和 PLAIN 都发 token、都被消费**。有一条结构性哨兵测试直接 grep 源码断言 `use_chat_stream.js` 里不含 `memoryVaultBridge`。
- **guard 的 subject 是 `secretGateText`（展开前），不是 `promptText`（展开后）**。skill expansion 在 gate 之后注入 app 内容；扫展开后的正文会因为 skill 模板里的示例凭据误报，把用户本来干净的消息拒掉。测试："app skill expansion never false-positives the final guard"。没传 `secretGateText` 的调用方回落到 `promptText`——是**收紧**不是豁免。
- **`secretGateSettled` 是唯一一条越过 guard 的路**，只给 memory-fallback 透明重试用（同一次 run 重发已批准文本，token 已花掉）。文件外调用方一律不准设。
- **runSend 用 try/finally 烧掉未移交的 token**：任何没走到 `runTurnRequest` 的早退（未选模型 / bridge 不可用 / 附件被拒 / 本地入队 / 转 interject）都要把 token 消费掉，批准不得比它服务的那次发送活得久。runSend 函数体**故意不重排缩进**（沿用原决定，少几百行噪声 diff）。

**How to apply:** 动 gate、`sendNewTurn` preScan、或 runTurnRequest 顶部 guard 之前先读这条。`runTurnRequest` 的 GitNexus upstream impact 是 **CRITICAL（20 impacted / 9 direct / 16 processes）**，任何改动要走 CTO sync。测试锁在 `secret_capture_scanner.test.js` / `secret_capture.test.js` / `use_secret_capture_gate.test.js` / `use_chat_stream.secret_capture_send.test.js`。相关：[[memory-v2-p0-chat-seam]]、[[memory-v2-turn-mutation-rebase]]。
