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

const normalizedIdentifier = (value) =>
  typeof value === "string" ? value.trim().slice(0, 240) : "";

const normalizedStatus = (run) =>
  String(run?.status || "").trim().toLowerCase();

const terminalStatuses = new Set([
  "completed",
  "complete",
  "failed",
  "cancelled",
  "noop",
  "no op",
]);

const durableStatusRank = (status) => {
  if (terminalStatuses.has(status)) return 3;
  if (["running", "leased"].includes(status)) return 2;
  if (["pending", "queued"].includes(status)) return 1;
  return null;
};

const runRevision = (run) =>
  Number.isSafeInteger(run?.jobRevision) && run.jobRevision >= 1
    ? run.jobRevision
    : null;

const runIdentity = (run) => ({
  id: normalizedIdentifier(run?.id),
  jobId: normalizedIdentifier(run?.jobId),
  runId: normalizedIdentifier(run?.runId),
});

const canonicalizeRunIdentity = (run) => {
  const identity = runIdentity(run);
  return {
    ...run,
    id: identity.jobId || identity.id || identity.runId,
    ...(identity.jobId ? { jobId: identity.jobId } : {}),
    ...(identity.runId ? { runId: identity.runId } : {}),
  };
};

const sameRunIdentity = (left, right) => {
  const a = runIdentity(left);
  const b = runIdentity(right);
  if (a.jobId && b.jobId) return a.jobId === b.jobId;
  if (a.runId && b.runId && a.runId === b.runId) return true;
  if (a.id && b.id && a.id === b.id) return true;

  // Older in-memory projections exposed only `id`; permit that opaque value to
  // bind to one explicit identity while both producer shapes coexist.
  if (!a.jobId && !a.runId && a.id) {
    return a.id === b.jobId || a.id === b.runId;
  }
  if (!b.jobId && !b.runId && b.id) {
    return b.id === a.jobId || b.id === a.runId;
  }
  return false;
};

const preferIncomingRun = (current, incoming) => {
  const currentRevision = runRevision(current);
  const incomingRevision = runRevision(incoming);
  const currentStatus = normalizedStatus(current);
  const incomingStatus = normalizedStatus(incoming);

  if (
    currentRevision !== null &&
    incomingRevision !== null &&
    incomingRevision < currentRevision
  ) {
    return false;
  }
  if (
    terminalStatuses.has(currentStatus) &&
    currentStatus !== incomingStatus
  ) {
    return false;
  }
  if (
    currentRevision !== null &&
    incomingRevision === null &&
    incomingStatus !== currentStatus &&
    incomingStatus !== "unavailable"
  ) {
    return false;
  }

  const currentRank = durableStatusRank(currentStatus);
  const incomingRank = durableStatusRank(incomingStatus);
  const comparableRevision =
    currentRevision === incomingRevision ||
    (currentRevision === null && incomingRevision === null);
  if (
    comparableRevision &&
    currentRank !== null &&
    incomingRank !== null &&
    incomingRank < currentRank
  ) {
    return false;
  }
  return true;
};

// Every Memory Job producer converges through this merge. Revisions order
// durable snapshots, and a terminal job can never return to an active state.
export const mergeMemoryJobRuns = (currentRuns = [], incomingRuns = []) => {
  const merged = [];
  for (const rawRun of [...currentRuns, ...incomingRuns]) {
    if (!rawRun || typeof rawRun !== "object") {
      continue;
    }
    const run = canonicalizeRunIdentity(rawRun);
    if (!run.id) continue;
    const index = merged.findIndex((current) => sameRunIdentity(current, run));
    if (index < 0) {
      merged.push(run);
      continue;
    }
    if (preferIncomingRun(merged[index], run)) {
      merged[index] = canonicalizeRunIdentity({ ...merged[index], ...run });
    }
  }
  return merged.slice(0, 128);
};

export const mergeMemoryJobProjection = (current, incoming) => {
  if (
    !incoming ||
    typeof incoming !== "object" ||
    !Array.isArray(incoming.runs)
  ) {
    return current;
  }
  if (
    !current ||
    current.ownerChatId !== incoming.ownerChatId ||
    current.messageId !== incoming.messageId
  ) {
    return {
      ...incoming,
      runs: mergeMemoryJobRuns([], incoming.runs),
    };
  }
  return {
    ...current,
    ...incoming,
    runs: mergeMemoryJobRuns(current.runs, incoming.runs),
  };
};

export const memoryJobRunId = (job) => {
  const direct = normalizedIdentifier(job?.run_id);
  const nested = normalizedIdentifier(job?.payload?.trigger?.run_id);
  if (direct && nested && direct !== nested) return "";
  return direct || nested;
};

// Existing listJobs response is OPEN to additional fields. Its owner, job/run
// identity, revision and status are validated before they affect the label.
export const applyMemoryJobStatuses = (runs, page, ownerChatId) => {
  if (page?.owner_chat_id !== ownerChatId || !Array.isArray(page.jobs) || page.jobs.length > 100) {
    throw new Error("Invalid memory job page");
  }
  const refreshed = runs.map((run) => {
    const identity = runIdentity(run);
    const matches = page.jobs.filter((job) => {
      const jobId = normalizedIdentifier(job?.job_id);
      const runId = memoryJobRunId(job);
      if (identity.jobId) return jobId === identity.jobId;
      if (identity.id && jobId === identity.id) return true;
      const expectedRunId = identity.runId || identity.id;
      return Boolean(expectedRunId && runId === expectedRunId);
    });
    if (matches.length !== 1) return { ...run, status: "Unavailable" };
    const job = matches[0];
    const jobId = normalizedIdentifier(job.job_id);
    const producerRunId = memoryJobRunId(job);
    const directRunId = normalizedIdentifier(job.run_id);
    const nestedRunId = normalizedIdentifier(job?.payload?.trigger?.run_id);
    if (job.owner_chat_id !== ownerChatId || !jobId ||
        (directRunId && nestedRunId && directRunId !== nestedRunId) ||
        !Number.isSafeInteger(job.revision) || job.revision < 1 ||
        !["pending", "leased", "completed", "failed", "cancelled"].includes(job.status)) {
      throw new Error("Invalid memory job state");
    }
    return {
      ...run,
      jobId,
      ...(producerRunId ? { runId: producerRunId } : {}),
      status: job.status,
      jobRevision: job.revision,
    };
  });
  return mergeMemoryJobRuns(runs, refreshed);
};
