import {
  createInitialActivityTreeState,
  reduceActivityTree,
} from "../runtime_events/activity_tree";

const HUMAN_INPUT_TOOL_NAME = "ask_user_question";
const CONTINUATION_TOOL_NAME = "__continuation__";
const RUN_PROMOTED_ARTIFACT_KINDS = new Set(["plan"]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringValue = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const clone = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
};

const payloadOf = (event) => (isObject(event?.payload) ? event.payload : {});
const linksOf = (event) => (isObject(event?.links) ? event.links : {});
const surfaceOf = (event) => (isObject(event?.surface) ? event.surface : {});

export const createInitialActivityTreeStateV4 = () => ({
  ...createInitialActivityTreeState(),
  runArtifactSummary: null,
});

const baseLegacyEvent = (event, type, payload = payloadOf(event), links = linksOf(event)) => ({
  schema_version: "v3",
  event_id: stringValue(event?.event_id),
  type,
  timestamp: stringValue(event?.timestamp),
  session_id: stringValue(event?.session_id),
  run_id: stringValue(event?.run_id),
  agent_id: stringValue(event?.agent_id),
  turn_id: stringValue(event?.turn_id),
  links: isObject(links) ? { ...links } : {},
  visibility: stringValue(event?.visibility, "user"),
  payload: isObject(payload) ? clone(payload) : {},
  metadata: {
    ...(isObject(event?.metadata) ? clone(event.metadata) : {}),
    ...(Number.isFinite(Number(event?.seq)) ? { seq: Number(event.seq) } : {}),
  },
});

const stepEventToLegacy = (event) => {
  const payload = payloadOf(event);
  const stepType = stringValue(payload.step_type);
  if (event.type === "step.started") {
    if (stepType === "model_request") {
      return baseLegacyEvent(event, "model.started", payload);
    }
    if (stepType === "tool") {
      return baseLegacyEvent(event, "tool.started", payload);
    }
  }

  if (event.type === "step.delta") {
    if (stepType === "model_response") {
      return baseLegacyEvent(event, "model.delta", payload);
    }
    if (stepType === "tool") {
      return baseLegacyEvent(event, "tool.delta", payload);
    }
  }

  if (event.type === "step.completed") {
    if (stepType === "model_response") {
      return baseLegacyEvent(event, "model.completed", payload);
    }
    if (stepType === "tool") {
      return baseLegacyEvent(event, "tool.completed", payload);
    }
  }

  return null;
};

const interactionRequestedToLegacy = (event) => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  const target = isObject(payload.target) ? payload.target : {};
  const targetArguments = isObject(target.arguments) ? target.arguments : {};
  const callId = stringValue(
    links.tool_call_id,
    stringValue(target.tool_call_id, stringValue(payload.interaction_id)),
  );
  const confirmationId = stringValue(
    links.interaction_id,
    stringValue(payload.interaction_id, callId),
  );
  const renderer = stringValue(payload.renderer, stringValue(payload.kind, "confirmation"));
  const toolName =
    stringValue(target.tool_name) ||
    (payload.kind === "continuation" ? CONTINUATION_TOOL_NAME : HUMAN_INPUT_TOOL_NAME);
  const interactConfig = {
    ...(isObject(payload.config) ? clone(payload.config) : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.prompt ? { question: payload.prompt } : {}),
    ...(payload.selection_mode ? { selection_mode: payload.selection_mode } : {}),
    ...(Array.isArray(payload.options) ? { options: clone(payload.options) } : {}),
    ...(payload.allow_other !== undefined ? { allow_other: payload.allow_other } : {}),
    ...(payload.other_label ? { other_label: payload.other_label } : {}),
    ...(payload.other_placeholder
      ? { other_placeholder: payload.other_placeholder }
      : {}),
    ...(payload.min_selected !== undefined ? { min_selected: payload.min_selected } : {}),
    ...(payload.max_selected !== undefined ? { max_selected: payload.max_selected } : {}),
  };

  return baseLegacyEvent(
    event,
    "tool.started",
    {
      call_id: callId,
      confirmation_id: confirmationId,
      requires_confirmation: true,
      tool_name: toolName,
      toolkit_id: stringValue(target.toolkit_id),
      description: stringValue(payload.prompt, stringValue(payload.title)),
      arguments:
        Object.keys(targetArguments).length > 0
          ? clone(targetArguments)
          : {
              request_id: confirmationId,
              kind: stringValue(payload.kind),
              ...(payload.prompt ? { question: payload.prompt } : {}),
              ...(Array.isArray(payload.options)
                ? { options: clone(payload.options) }
                : {}),
            },
      interact_type: renderer,
      interact_config: interactConfig,
    },
    {
      ...links,
      tool_call_id: callId,
      input_request_id: confirmationId,
    },
  );
};

const interactionResolvedToLegacy = (event) => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  const confirmationId = stringValue(
    links.interaction_id,
    stringValue(payload.interaction_id),
  );
  const callId = stringValue(links.tool_call_id, confirmationId);
  const outcome = stringValue(payload.outcome);
  const decision =
    outcome === "denied" || outcome === "cancelled" ? "denied" : "approved";

  return baseLegacyEvent(
    event,
    "input.resolved",
    {
      call_id: callId,
      confirmation_id: confirmationId,
      decision,
      response: clone(payload.response),
      ...(payload.reason ? { reason: payload.reason } : {}),
    },
    {
      ...links,
      tool_call_id: callId,
      input_request_id: confirmationId,
    },
  );
};

const isRunSummaryArtifactEvent = (event) => {
  const surface = surfaceOf(event);
  return surface.scope === "run" || surface.slot === "run_summary";
};

const toLegacyEvent = (event) => {
  const type = stringValue(event?.type);
  if (
    type === "session.started" ||
    type === "run.started" ||
    type === "run.completed" ||
    type === "run.failed" ||
    type === "turn.started" ||
    type === "turn.completed"
  ) {
    return baseLegacyEvent(event, type);
  }

  if (type === "step.started" || type === "step.delta" || type === "step.completed") {
    return stepEventToLegacy(event);
  }

  if (type === "interaction.requested") {
    return interactionRequestedToLegacy(event);
  }

  if (type === "interaction.resolved") {
    return interactionResolvedToLegacy(event);
  }

  if (type === "artifact.created" || type === "artifact.updated") {
    if (isRunSummaryArtifactEvent(event)) {
      return null;
    }
    return baseLegacyEvent(event, type);
  }

  return null;
};

const legacySnapshotFromV4 = (eventStoreSnapshot = {}) => {
  const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
    ? eventStoreSnapshot.orderedEventIds
    : [];
  const eventsById = isObject(eventStoreSnapshot.eventsById)
    ? eventStoreSnapshot.eventsById
    : {};
  const legacyEventsById = {};
  const orderedLegacyEventIds = [];

  eventIds.forEach((eventId) => {
    const legacyEvent = toLegacyEvent(eventsById[eventId]);
    if (!legacyEvent || !legacyEvent.event_id) {
      return;
    }
    legacyEventsById[legacyEvent.event_id] = legacyEvent;
    orderedLegacyEventIds.push(legacyEvent.event_id);
  });

  return {
    eventsById: legacyEventsById,
    orderedEventIds: orderedLegacyEventIds,
    diagnostics: isObject(eventStoreSnapshot.diagnostics)
      ? clone(eventStoreSnapshot.diagnostics)
      : { unknownEvents: [], droppedEvents: [], duplicateEvents: [] },
  };
};

const isValidArtifactDescriptor = (artifact) =>
  isObject(artifact) &&
  Boolean(stringValue(artifact.artifact_id)) &&
  Boolean(stringValue(artifact.kind)) &&
  isObject(artifact.snapshot);

const shouldReplaceArtifact = (existing, incoming) => {
  const incomingRevision = Number(incoming?.revision);
  const existingRevision = Number(existing?.revision);
  if (Number.isFinite(existingRevision) && Number.isFinite(incomingRevision)) {
    return incomingRevision >= existingRevision;
  }
  return true;
};

const upsertArtifactDescriptor = (bucket, artifact) => {
  if (!bucket || !Array.isArray(bucket.artifacts)) {
    return { changed: false, replaced: false };
  }
  const artifactId = stringValue(artifact?.artifact_id);
  if (!artifactId) {
    return { changed: false, replaced: false };
  }
  const existingIndex = bucket.artifacts.findIndex(
    (candidate) => candidate?.artifact_id === artifactId,
  );
  if (existingIndex < 0) {
    bucket.artifacts.push({ ...artifact });
    return { changed: true, replaced: false };
  }
  if (!shouldReplaceArtifact(bucket.artifacts[existingIndex], artifact)) {
    return { changed: false, replaced: true };
  }
  bucket.artifacts[existingIndex] = { ...artifact };
  return { changed: true, replaced: true };
};

const buildRunArtifactSummary = (eventStoreSnapshot = {}) => {
  const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
    ? eventStoreSnapshot.orderedEventIds
    : [];
  const eventsById = isObject(eventStoreSnapshot.eventsById)
    ? eventStoreSnapshot.eventsById
    : {};
  let bucket = null;
  let runSettled = false;
  let runSettledEventId = "";
  const effects = [];

  const ensureBucket = () => {
    if (!bucket) {
      bucket = {
        order: 0,
        status: runSettled ? "completed" : "pending",
        artifacts: [],
      };
    }
    return bucket;
  };

  eventIds.forEach((eventId) => {
    const event = eventsById[eventId];
    const type = stringValue(event?.type);
    if (type === "run.completed" || type === "run.failed") {
      runSettled = true;
      runSettledEventId = stringValue(event?.event_id);
      if (bucket && bucket.status !== "completed") {
        bucket.status = "completed";
        effects.push({
          type: "run_artifact_summary",
          eventId: runSettledEventId,
          reason: "flushed",
        });
      }
      return;
    }

    if (
      type !== "artifact.created" &&
      type !== "artifact.updated"
    ) {
      return;
    }
    if (!isRunSummaryArtifactEvent(event)) {
      return;
    }
    const artifact = payloadOf(event);
    if (!isValidArtifactDescriptor(artifact)) {
      return;
    }
    const currentBucket = ensureBucket();
    const result = upsertArtifactDescriptor(currentBucket, artifact);
    if (result.changed && currentBucket.status === "completed") {
      effects.push({
        type: "run_artifact_summary",
        eventId: stringValue(event?.event_id),
        reason: type === "artifact.updated" ? "updated" : "created",
      });
    }
  });

  return { bucket, effects, runSettled, runSettledEventId };
};

const collectRunPromotedArtifacts = (artifactSummariesByTurnId) => {
  if (!isObject(artifactSummariesByTurnId)) {
    return [];
  }

  const bucket = {
    order: 0,
    status: "completed",
    artifacts: [],
  };
  Object.values(artifactSummariesByTurnId)
    .sort((a, b) => (a?.order || 0) - (b?.order || 0))
    .forEach((turnBucket) => {
      if (!isObject(turnBucket) || !Array.isArray(turnBucket.artifacts)) {
        return;
      }
      turnBucket.artifacts.forEach((artifact) => {
        if (!RUN_PROMOTED_ARTIFACT_KINDS.has(stringValue(artifact?.kind))) {
          return;
        }
        if (!isValidArtifactDescriptor(artifact)) {
          return;
        }
        upsertArtifactDescriptor(bucket, artifact);
      });
    });

  return bucket.artifacts;
};

const mergeRunPromotedArtifacts = ({
  bucket,
  effects,
  legacyState,
  runSettled,
  runSettledEventId,
}) => {
  const promotedArtifacts = collectRunPromotedArtifacts(
    legacyState?.artifactSummariesByTurnId,
  );
  if (promotedArtifacts.length === 0) {
    return { bucket, effects };
  }
  if (!bucket && !runSettled) {
    return { bucket: null, effects };
  }

  const currentBucket =
    bucket ||
    {
      order: 0,
      status: runSettled ? "completed" : "pending",
      artifacts: [],
    };

  let changed = false;
  promotedArtifacts.forEach((artifact) => {
    const result = upsertArtifactDescriptor(currentBucket, artifact);
    if (result.changed) changed = true;
  });

  const nextEffects = Array.isArray(effects) ? [...effects] : [];
  const alreadyEmittedRunFlush = nextEffects.some(
    (effect) =>
      effect?.type === "run_artifact_summary" &&
      effect?.eventId === runSettledEventId &&
      effect?.reason === "flushed",
  );
  if (changed && runSettled && runSettledEventId && !alreadyEmittedRunFlush) {
    nextEffects.push({
      type: "run_artifact_summary",
      eventId: runSettledEventId,
      reason: "flushed",
    });
  }

  return { bucket: currentBucket, effects: nextEffects };
};

export const reduceActivityTreeV4 = (_previousState, eventStoreSnapshot = {}) => {
  const legacyState = reduceActivityTree(null, legacySnapshotFromV4(eventStoreSnapshot));
  const runSummary = buildRunArtifactSummary(eventStoreSnapshot);
  const { bucket, effects } = mergeRunPromotedArtifacts({
    bucket: runSummary.bucket,
    effects: runSummary.effects,
    legacyState,
    runSettled: runSummary.runSettled,
    runSettledEventId: runSummary.runSettledEventId,
  });
  return {
    ...legacyState,
    runArtifactSummary: bucket,
    effects: [...(Array.isArray(legacyState.effects) ? legacyState.effects : []), ...effects],
  };
};
