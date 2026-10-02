# Graph evidence — #384

Bound checkout: `/Users/red/Documents/Codex/2026-10-02/task-3/pupu-384`. Baseline indexed: `0047d58d`. GitNexus 1.6.12 used through the installed CLI artifact, with isolated `GITNEXUS_HOME=../gitnexus-home`. Default generated wrapper tries npm network resolution; direct installed CLI avoids that. One forced full no-parse-cache rebuild with `--max-file-size 1024 --index-only` includes the 550,802-byte hook. No shared repository/index/profile was modified.

| Upstream impact target | Result | Corroboration / scope |
|---|---|---|
| settleStreamingAssistantMessages | CRITICAL, 8 symbols, 5 direct callers, 7 process groups | useChatSessionState, useChatStream, cancelCurrentStreamAndSettleMessages, cancelRunForTest, settleUnavailableStream; text reads confirm stop, bootstrap, unavailable replay and Test API consumers |
| cancelCurrentStreamAndSettleMessages | HIGH, 4 symbols, 2 direct callers, 3 process groups | stopStream and deleteTurn, then useChatStream/ChatInterface |
| TraceChain | UNKNOWN, 0 resolved JSX callers | ChatBubble via lazy_trace_chain plus recursive nested TraceChain render; zero is not an all-clear |

HIGH/CRITICAL were reported before code edits. Full raw outputs remain in the local task's `graph-evidence/`; this record saves the attributable findings remotely without hundreds of repeated flow rows.

Coverage limits: graph process walks/callable fanout are capped. Initial 512 KiB graph omitted the hook. A subsequent incremental refresh temporarily lost helper/renderer definitions; the single forced full rebuild recovered them. No further graph infrastructure repair is planned.

Pre-initial-plan staged detect-changes: 2 documentation files, 11 sections, zero affected processes, low risk. Pre-red-test staged detect-changes: touched files detected, but new Jest callback hunks did not overlap indexed symbols; output explicitly says **not a clean tree**. This does not prove zero source impact. Red checkpoint has only test/evidence changes; source inspection confirms no production edits. Source checkpoints require fresh diff-based graph detection and corroboration of added/unmapped symbols.

Timing exception: Luna confirmed `getSubagentTraceStatus` did not receive its own impact query before its first edit. The enclosing TraceChain UNKNOWN query and source caller reads were pre-edit; the helper-specific LOW result (one direct `timelineItems` caller) was obtained after that slice, before the first source commit. This misses the symbol-specific pre-edit convention and is recorded as a process limitation, not retroactive pre-edit evidence.

Before the review-1 correction checkpoint, staged detection reported 12 files, 12 symbols, 14 affected processes, HIGH risk. Source corroboration: changes remain inside the existing settlement and renderer paths; added local predicates are absent from the immutable baseline index; line shifts also map an unchanged collectTurnMessageIds body. The giant streaming hook, storage admission/serialization and runtime producer remain unchanged. No graph rebuild was repeated.

The next V4 timing slice proves an admitted pre-stop batch can be discarded. Before the first hook edit, direct upstream queries report startRuntimeEventStream CRITICAL (16 symbols, 14 process groups), wrapRuntimeEventStreamHandle LOW (3 symbols, direct startRuntimeEventStream then runTurnRequest/useChatStream), and cancelCurrentStreamAndSettleMessages HIGH (4 symbols, stopStream/deleteTurn callers). HIGH/CRITICAL warnings preceded the planned synchronous stop-only batch drain. Source inspection corroborates existing onRuntimeEvent generation admission, teardown batch cancellation, nested frame flush and microtask message scheduler; no timer/producer/serialization change is proposed. Process walks remain capped and dynamic handle methods require source corroboration. No additional index rebuild.
