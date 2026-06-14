import { adaptActivityTreeToTraceChain } from "../runtime_events/trace_chain_adapter";

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

export const adaptActivityTreeToTraceChainV4 = (activityTreeState = {}) => ({
  ...adaptActivityTreeToTraceChain(activityTreeState),
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
});
