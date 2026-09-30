import { useEffect, useState } from "react";
import contextV2Bridge from "../../SERVICEs/bridges/context_v2_bridge";
import {
  applyMemoryJobStatuses,
  memoryJobRunId,
} from "../../SERVICEs/runtime_events/memory_activity_labels";
import { presentMemoryV2Audit } from "../../SERVICEs/runtime_events/memory_v2_trace_presenter";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";

// The completion snapshot predates background work. Discover its durable job
// only on expansion, matching the immutable root run rather than all chat jobs.
export default function MemoryJobDiscovery({ ownerChatId, messageId, rootRunId, onUpdate }) {
  const { t } = useTranslation();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!rootRunId || !ownerChatId) return undefined;
    let cancelled = false;
    setUnavailable(false);
    const load = async () => {
      try {
        const page = await contextV2Bridge.listJobs({ ownerChatId, limit: 100 });
        if (page?.owner_chat_id !== ownerChatId || !Array.isArray(page.jobs) || page.jobs.length > 100) {
          throw new Error("Invalid memory job page");
        }
        const jobs = page.jobs.filter(
          (job) => memoryJobRunId(job) === rootRunId,
        );
        const audit = presentMemoryV2Audit({ consolidation_jobs: jobs });
        const runs = applyMemoryJobStatuses(audit?.agentRuns || [], page, ownerChatId);
        if (!cancelled) onUpdate?.({ ownerChatId, messageId, runs });
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ownerChatId, messageId, rootRunId, onUpdate]);
  return unavailable ? <div role="status">{t("memory_activity.organization_unavailable")}</div> : null;
}
