import { useEffect, useRef, useState } from "react";
import contextV2Bridge from "../../SERVICEs/bridges/context_v2_bridge";
import {
  applyMemoryJobStatuses,
  mergeMemoryJobRuns,
} from "../../SERVICEs/runtime_events/memory_activity_labels";
import { MemoryAgentAudit } from "./memory_v2_trace_audit";

// Mounted only while the existing detail panel is expanded. Query at most 100
// jobs for this chat; never scan the journal or change a sealed RunBundle.
export default function MemoryAgentLiveDetails({ runs, ownerChatId, messageId, isDark, onUpdate }) {
  const [visibleRuns, setVisibleRuns] = useState(() =>
    mergeMemoryJobRuns([], runs),
  );
  const latest = useRef(mergeMemoryJobRuns([], runs));
  const callback = useRef(onUpdate);
  callback.current = onUpdate;
  const identity = JSON.stringify(runs.map((run) => run.id));
  useEffect(() => {
    const next = mergeMemoryJobRuns(latest.current, runs);
    latest.current = next;
    setVisibleRuns(next);
  }, [runs]);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const refresh = async () => {
      let next;
      try {
        const page = await contextV2Bridge.listJobs({ ownerChatId, limit: 100 });
        next = applyMemoryJobStatuses(latest.current, page, ownerChatId);
      } catch {
        next = mergeMemoryJobRuns(
          latest.current,
          latest.current.map((run) => ({ ...run, status: "Unavailable" })),
        );
      }
      if (cancelled) return;
      latest.current = next;
      setVisibleRuns(next);
      callback.current?.({ ownerChatId, messageId, runs: next });
      if (next.some((run) =>
        ["pending", "leased"].includes(String(run.status || "").toLowerCase()))) {
        timer = setTimeout(refresh, 2000);
      }
    };
    // Completed historical runs need no polling. Unknown/pending runs get one
    // current read, and only confirmed pending jobs schedule another request.
    if (latest.current.some((run) => !["completed", "complete", "failed", "cancelled", "noop", "no op"].includes(String(run.status).toLowerCase()))) {
      refresh();
    }
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ownerChatId, messageId, identity]);
  return <MemoryAgentAudit runs={visibleRuns} ownerChatId={ownerChatId} isDark={isDark} />;
}
