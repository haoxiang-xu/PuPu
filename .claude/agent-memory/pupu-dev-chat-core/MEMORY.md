# pupu-dev-chat-core — Memory Index

- [Team Roster](team_roster.md) — 我升任 Chat 体验组 lead 下辖 chat-bubble，向 CTO 帅汇报；新组织结构、同步会班子、各组边界
- [Contract: Bubble Streaming](contract-bubble-streaming.md) — streaming_message_store / runtime_events(_v4) schema is my cross-surface contract with pupu-dev-chat-bubble
- [Security Attack Surface](security-attack-surface.md) — SEC-001: confirmation-gate trust model (frame self-declares), storage-as-time-machine, side-menu avatar <img src> sink
- [Minimap Lite Mode v2](minimap-lite-mode-v2.md) — streaming minimap: 3rd iteration (disable→mount→zero-React); invariants for stable measure/segments + imperative offsetHeight compensation
- [Memory V2 P0 chat 接缝](memory-v2-p0-chat-seam.md) — owner_chat_id=UI chat id / context_v2_history 不含 in-flight message / secret capture fail-closed 插入点
- [Memory V2 turn-mutation rebase](memory-v2-turn-mutation-rebase.md) — edit/resend/delete 改走 getSessionHead+rebaseSession；admission 只认 head、payload 冻结、mutationReady vs shadow 的裁决与未决代价
- [Memory V2 候选评审 UI](memory-v2-candidate-review-ui.md) — Curator 单写者(候选只读)、四道 CAS 栅栏必须全进 operationId、CRA resetMocks 让错误码分支静默失测
- [Secret Gate 单扫描器不变量](secret-gate-single-scanner-invariant.md) — 显式语法旁路根因("两个扫描器")与修复；一个 gate、runTurnRequest 只剩 token guard、guard 扫展开前文本
- [Boot gate 双闸契约](boot-gate-chat-core-contract.md) — signalReady 只满足 chatFirstScreen 不等于 ready；chat 会在 overlay 下无限期空跑；overlay 吞 Escape+锁焦点,我加全局热键要当心
