const statusForTraceChain = (status) => {
  if (status === "running") {
    return "streaming";
  }
  if (status === "failed") {
    return "error";
  }
  return "done";
};

const cloneBucket = (bucket) => {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return null;
  }
  return {
    order: Number.isFinite(Number(bucket.order)) ? Number(bucket.order) : 0,
    status: typeof bucket.status === "string" ? bucket.status : "pending",
    artifacts: Array.isArray(bucket.artifacts)
      ? bucket.artifacts.map((artifact) => ({ ...artifact }))
      : [],
  };
};

export const adaptActivityTreeToTraceChain = (activityTreeState = {}) => {
  const rootRunId =
    typeof activityTreeState.rootRunId === "string"
      ? activityTreeState.rootRunId
      : "";
  const runsById =
    activityTreeState.runsById && typeof activityTreeState.runsById === "object"
      ? activityTreeState.runsById
      : {};
  const framesByRunId =
    activityTreeState.framesByRunId &&
    typeof activityTreeState.framesByRunId === "object"
      ? activityTreeState.framesByRunId
      : {};
  const inputRequestsById =
    activityTreeState.inputRequestsById &&
    typeof activityTreeState.inputRequestsById === "object"
      ? activityTreeState.inputRequestsById
      : {};
  const modelTextByRunId =
    activityTreeState.modelTextByRunId &&
    typeof activityTreeState.modelTextByRunId === "object"
      ? activityTreeState.modelTextByRunId
      : {};

  const subagentMetaByRunId = {};
  Object.entries(runsById).forEach(([runId, run]) => {
    if (!run || typeof run !== "object" || !run.parentRunId) {
      return;
    }
    subagentMetaByRunId[runId] = {
      subagentId: run.agentId || run.payload?.agent_id || "",
      mode: run.mode || "",
      template: run.template || "",
      batchId: run.batchId || "",
      parentId: run.parentId || run.parentRunId || "",
      lineage: Array.isArray(run.lineage) ? run.lineage : [],
      status: run.status || "",
    };
  });

  const toolConfirmationUiStateById = {};
  Object.values(inputRequestsById).forEach((request) => {
    if (!request || typeof request !== "object" || !request.requestId) {
      return;
    }
    toolConfirmationUiStateById[request.requestId] = {
      status: request.status || "idle",
      error: "",
      resolved: request.resolved === true,
      ...(request.decision ? { decision: request.decision } : {}),
      ...(request.response !== undefined
        ? { userResponse: request.response }
        : {}),
    };
  });

  // Observation coalescing (issue #168): expose only truncated tool calls
  // (total > emitted) as a bounded summary the trace can render as
  // "showing first N … M omitted … last K". Non-truncated calls are omitted
  // so the UI shows nothing extra for the common case.
  const observationLogSource =
    activityTreeState.observationLogByCallId &&
    typeof activityTreeState.observationLogByCallId === "object"
      ? activityTreeState.observationLogByCallId
      : {};
  const observationLogByCallId = {};
  Object.entries(observationLogSource).forEach(([callId, log]) => {
    if (!log || typeof log !== "object") return;
    const total = Number.isFinite(Number(log.total)) ? Number(log.total) : 0;
    const emitted = Number.isFinite(Number(log.emitted))
      ? Number(log.emitted)
      : 0;
    if (total <= emitted) return;
    observationLogByCallId[callId] = {
      total,
      emitted,
      omitted: Number.isFinite(Number(log.omitted)) ? Number(log.omitted) : 0,
      tail: Array.isArray(log.tail) ? [...log.tail] : [],
    };
  });

  return {
    frames: Array.isArray(activityTreeState.frames)
      ? [...activityTreeState.frames]
      : [],
    observationLogByCallId,
    status: statusForTraceChain(activityTreeState.status),
    streamingContent:
      activityTreeState.status === "running"
        ? modelTextByRunId[rootRunId] || ""
        : "",
    subagentFrames: Object.fromEntries(
      Object.entries(framesByRunId).map(([runId, frames]) => [
        runId,
        Array.isArray(frames) ? [...frames] : [],
      ]),
    ),
    subagentMetaByRunId,
    toolConfirmationUiStateById,
    diagnostics: activityTreeState.diagnostics || {},
    bundle: activityTreeState.completionBundle || undefined,
    error: activityTreeState.error || undefined,
    runArtifactSummary: cloneBucket(activityTreeState.runArtifactSummary),
    artifactSummariesByTurnId:
      activityTreeState.artifactSummariesByTurnId &&
      typeof activityTreeState.artifactSummariesByTurnId === "object"
        ? Object.fromEntries(
            Object.entries(activityTreeState.artifactSummariesByTurnId).map(
              ([turnId, bucket]) => [turnId, cloneBucket(bucket)],
            ),
          )
        : {},
  };
};
