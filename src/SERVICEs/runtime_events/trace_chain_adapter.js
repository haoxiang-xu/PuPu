const statusForTraceChain = (status) => {
  if (status === "running") {
    return "streaming";
  }
  if (status === "failed") {
    return "error";
  }
  return "done";
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

  return {
    frames: Array.isArray(activityTreeState.frames)
      ? [...activityTreeState.frames]
      : [],
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
  };
};
