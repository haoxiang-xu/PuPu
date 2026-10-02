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
