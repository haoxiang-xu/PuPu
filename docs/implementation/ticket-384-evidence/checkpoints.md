# #384 remote checkpoints

## Initial reviewed plan: f5d0278ecc38f7b2978210c826c687f14875aff6

Pushed `codex/ticket-384-interrupted-tool-chain` to existing authenticated origin `https://github.com/haoxiang-xu/PuPu.git`. Then cloned that branch directly from GitHub, depth 1, into a fresh independent checkout `/Users/red/Documents/Codex/2026-10-02/task-3/pupu-384-remote-proof` (not seeded from any local clone). Both source and restore HEAD equal `f5d0278ecc38f7b2978210c826c687f14875aff6`. `cmp` confirms identical implementation-plan and independent-review bytes. Restore `git status --short` is empty. This proof completed before Luna's first test/source edit.

Existing Git authentication was used; no credential was generated or copied. DNS required normal sandbox network escalation, which succeeded. No draft PR was created.

## Pre-edit graph risk and bounded rebuild

One full forced no-parse-cache rebuild completed with 1024 KiB max-file-size to include the 550,802-byte streaming hook. Repository identity is the independent #384 checkout at baseline `0047d58d`. GitNexus 1.6.12: 44,396 nodes, 150,330 edges, 1,201 flows. The isolated registry is `/Users/red/Documents/Codex/2026-10-02/task-3/gitnexus-home`; no shared index was mutated.

Settlement upstream impact: **CRITICAL**, 8 affected symbols / 5 direct callers: useChatSessionState, useChatStream, cancelCurrentStreamAndSettleMessages, cancelRunForTest, settleUnavailableStream. Stop callback upstream impact: **HIGH**, direct stopStream/deleteTurn, indirect useChatStream/ChatInterface. Warnings were sent before code edits. TraceChain remains **UNKNOWN** because JSX calls are not resolved; direct source corroborates ChatBubble's lazy import and recursive nested TraceChain rendering. Process enumeration/callable fanout is capped; absence is not proof of safety. Full impact outputs are retained alongside this record.

The previous incremental refresh temporarily lost helper/renderer lookups. The one forced rebuild recovered both; no further infrastructure repair is planned. Docs-only staged graph check found 2 files/11 sections, zero affected processes, low risk before the initial plan commit. Production-symbol scope still requires graph analysis plus source corroboration before each source checkpoint.

## Remaining coordination

#383/#390 shared profile access stays off limits. Real connected-app pause/reopen, provider requests, approval clicks and cold sidecar restart remain NOT_RUN. Active rollout INCOMPLETE. Draft PR requires source-parent coordination after full review.
