import { createRuntimeEventStore } from "./event_store";
import {
  createIncrementalActivityTreeProjector,
  reduceActivityTree,
} from "./activity_tree";
import { adaptActivityTreeToTraceChain } from "./trace_chain_adapter";

const cloneArtifactBucket = (bucket) => {
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

const statusForReplay = (status) => {
  if (status === "failed") return "error";
  if (status === "completed") return "done";
  return "streaming";
};

const contentForReplay = (frames, fallback = "") => {
  let content = "";
  let sawContentFrame = false;

  for (const frame of Array.isArray(frames) ? frames : []) {
    if (frame?.type === "token_delta") {
      const delta = frame.payload?.delta;
      if (typeof delta === "string") {
        content += delta;
        sawContentFrame = true;
      }
      continue;
    }

    if (frame?.type === "tool_call") {
      content = "";
      sawContentFrame = true;
      continue;
    }

    if (frame?.type === "final_message") {
      const finalContent = frame.payload?.content;
      if (typeof finalContent === "string") {
        content = finalContent;
        sawContentFrame = true;
      }
    }
  }

  return sawContentFrame ? content : fallback;
};

const confirmationUiStateForReplay = (trace = {}) => {
  const stateById = Object.fromEntries(
    Object.entries(trace.toolConfirmationUiStateById || {}).map(
      ([confirmationId, state]) => [confirmationId, { ...state }],
    ),
  );
  const frameGroups = [
    trace.frames,
    ...Object.values(trace.subagentFrames || {}),
  ];

  for (const frames of frameGroups) {
    for (const frame of Array.isArray(frames) ? frames : []) {
      const confirmationId = frame?.payload?.confirmation_id;
      if (typeof confirmationId !== "string" || !confirmationId) {
        continue;
      }
      if (frame.type === "tool_call") {
        stateById[confirmationId] = stateById[confirmationId] || {
          status: "idle",
          error: "",
          resolved: false,
        };
      } else if (
        frame.type === "tool_confirmed" ||
        frame.type === "tool_denied"
      ) {
        stateById[confirmationId] = {
          ...(stateById[confirmationId] || {}),
          status: "submitted",
          error: "",
          resolved: true,
          decision:
            frame.type === "tool_denied" ? "denied" : "approved",
          ...(frame.payload?.response !== undefined
            ? { userResponse: frame.payload.response }
            : {}),
        };
      }
    }
  }

  return stateById;
};

export const createRuntimeEventStreamReplayProjector = () => {
  const store = createRuntimeEventStore();
  const projector = createIncrementalActivityTreeProjector();
  let activityTree = reduceActivityTree(null, store.getReductionSnapshot());
  let replayedThroughSeq = 0;

  const append = (runtimeEvent, streamSeq = 0) => {
    store.appendForReduction(runtimeEvent);
    activityTree = projector.reduce(store.getReductionSnapshot());
    const trace = adaptActivityTreeToTraceChain(activityTree);
    const normalizedStreamSeq = Number(streamSeq);
    if (Number.isInteger(normalizedStreamSeq) && normalizedStreamSeq > 0) {
      replayedThroughSeq = Math.max(replayedThroughSeq, normalizedStreamSeq);
    }
    const rootRunId =
      typeof activityTree.rootRunId === "string"
        ? activityTree.rootRunId
        : "";
    const accumulatedRootContent = rootRunId
      ? activityTree.modelTextByRunId?.[rootRunId] || ""
      : "";
    const rootContent = contentForReplay(
      trace.frames,
      accumulatedRootContent,
    );

    return {
      status: statusForReplay(activityTree.status),
      content: rootContent,
      traceFrames: trace.frames,
      subagentFrames: trace.subagentFrames,
      subagentMetaByRunId: trace.subagentMetaByRunId,
      toolConfirmationUiStateById: confirmationUiStateForReplay(trace),
      runArtifactSummary: cloneArtifactBucket(trace.runArtifactSummary),
      artifactSummariesByTurnId: Object.fromEntries(
        Object.entries(trace.artifactSummariesByTurnId || {}).map(
          ([turnId, bucket]) => [turnId, cloneArtifactBucket(bucket)],
        ),
      ),
      bundle:
        trace.bundle && typeof trace.bundle === "object"
          ? { ...trace.bundle }
          : undefined,
      error:
        trace.error && typeof trace.error === "object"
          ? { ...trace.error }
          : trace.error,
      replayedThroughSeq,
    };
  };

  return {
    append,
    getReplayedThroughSeq: () => replayedThroughSeq,
  };
};
