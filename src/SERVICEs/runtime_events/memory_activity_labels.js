// Default activity labels are a closed vocabulary. Raw status/model/error values
// belong in the existing audit details, never in the collapsed activity row.
export const conversationActivity = (audit, t) => {
  if (audit?.status === "Complete") return t("memory_activity.conversation_ready");
  if (audit?.status === "Partial") return t("memory_activity.conversation_incomplete");
  if (audit?.status === "Legacy") return t("memory_activity.conversation_legacy");
  return t("memory_activity.conversation_unavailable");
};

export const organizationActivity = (runs, t) => {
  const states = runs.map((run) => String(run.status || "").toLowerCase());
  if (states.some((s) => ["failed", "error"].includes(s))) {
    return t("memory_activity.organization_failed");
  }
  if (states.some((s) => s === "cancelled")) return t("memory_activity.organization_cancelled");
  const known = ["pending", "queued", "running", "leased", "complete", "completed", "noop", "no op"];
  if (!states.length || states.some((s) => !known.includes(s))) {
    return t("memory_activity.organization_unavailable");
  }
  if (states.some((s) => ["running", "leased"].includes(s))) return t("memory_activity.organization_running");
  if (states.some((s) => ["pending", "queued"].includes(s))) return t("memory_activity.organization_queued");
  if (states.every((s) => ["noop", "no op"].includes(s))) return t("memory_activity.organization_empty");
  return t("memory_activity.organization_complete");
};

// Existing listJobs response is OPEN to additional fields. Its owner, job/run
// identity, revision and status are validated before they affect the label.
export const applyMemoryJobStatuses = (runs, page, ownerChatId) => {
  if (page?.owner_chat_id !== ownerChatId || !Array.isArray(page.jobs) || page.jobs.length > 100) {
    throw new Error("Invalid memory job page");
  }
  return runs.map((run) => {
    const matches = page.jobs.filter((job) => job?.job_id === run.id || job?.run_id === run.id);
    if (matches.length !== 1) return { ...run, status: "Unavailable" };
    const job = matches[0];
    if (job.owner_chat_id !== ownerChatId || typeof job.job_id !== "string" || !job.job_id ||
        !Number.isSafeInteger(job.revision) || job.revision < 1 ||
        !["pending", "leased", "completed", "failed", "cancelled"].includes(job.status)) {
      throw new Error("Invalid memory job state");
    }
    if (Number.isSafeInteger(run.jobRevision) && job.revision < run.jobRevision) {
      throw new Error("Stale memory job state");
    }
    return { ...run, status: job.status, jobRevision: job.revision };
  });
};
