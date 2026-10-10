import { resolveToolCallOwnerForRequest } from "../../SERVICEs/runtime_events/tool_call_projection";

const normalizePendingConfirmationRequests = (requests) => {
  if (!requests || typeof requests !== "object") {
    return [];
  }

  return Object.values(requests)
    .filter(
      (request) =>
        request &&
        typeof request === "object" &&
        typeof request.confirmationId === "string" &&
        request.confirmationId.trim(),
    )
    .sort((left, right) => {
      const leftTime = Number(left.requestedAt);
      const rightTime = Number(right.requestedAt);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime;
      }
      if (Number.isFinite(leftTime)) {
        return -1;
      }
      if (Number.isFinite(rightTime)) {
        return 1;
      }
      return 0;
  });
};

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key);

const requestField = (request, camelKey, wireKey = camelKey) => {
  if (hasOwn(request, wireKey)) return { present: true, value: request[wireKey] };
  if (hasOwn(request, camelKey)) return { present: true, value: request[camelKey] };
  return { present: false };
};

export const buildPendingConfirmationTraceFrames = (requests) =>
  normalizePendingConfirmationRequests(requests).map((request, index) => {
    const interactType = requestField(request, "interactType", "interact_type");
    const interactConfig = requestField(request, "interactConfig", "interact_config");
    const callId = requestField(request, "callId", "call_id");
    const toolName = requestField(request, "toolName", "tool_name");
    const toolkitId = requestField(request, "toolkitId", "toolkit_id");
    const displayName = requestField(request, "toolDisplayName", "tool_display_name");
    const description = requestField(request, "description");
    const argumentsValue = requestField(request, "arguments");
    const callRef = requestField(request, "callRef", "call_ref");
    const callRefMetadata = requestField(
      request,
      "callRefMetadata",
      "call_ref_metadata",
    );
    const runId = requestField(request, "runId", "run_id");
    const executionId = requestField(request, "executionId", "execution_id");
    const sessionId = requestField(request, "sessionId", "session_id");
    const eventCursor = requestField(request, "eventCursor", "event_cursor");
    const eventId = requestField(request, "eventId", "event_id");
    const iteration = requestField(request, "iteration");
    const links = requestField(request, "links");
    const requestedAt = Number(request.requestedAt);

    return {
      seq: index + 1,
      ts: Number.isFinite(requestedAt) ? requestedAt : Date.now() + index,
      type: "tool_call",
      stage: "client",
      ...(runId.present ? { run_id: runId.value } : {}),
      ...(executionId.present ? { execution_id: executionId.value } : {}),
      ...(sessionId.present ? { session_id: sessionId.value } : {}),
      ...(eventCursor.present ? { event_cursor: eventCursor.value } : {}),
      ...(eventId.present ? { event_id: eventId.value } : {}),
      ...(iteration.present ? { iteration: iteration.value } : {}),
      ...(links.present ? { links: links.value } : {}),
      payload: {
        ...(callId.present ? { call_id: callId.value } : {}),
        confirmation_id: request.confirmationId,
        requires_confirmation: true,
        ...(toolName.present ? { tool_name: toolName.value } : {}),
        ...(toolkitId.present ? { toolkit_id: toolkitId.value } : {}),
        ...(displayName.present ? { tool_display_name: displayName.value } : {}),
        ...(description.present ? { description: description.value } : {}),
        ...(argumentsValue.present ? { arguments: argumentsValue.value } : {}),
        ...(callRef.present ? { call_ref: callRef.value } : {}),
        ...(callRefMetadata.present
          ? { call_ref_metadata: callRefMetadata.value }
          : {}),
        interact_type: interactType.present ? interactType.value : "confirmation",
        ...(interactConfig.present ? { interact_config: interactConfig.value } : {}),
      },
    };
  });

export const mergePendingConfirmationTraceState = ({
  frames,
  subagentFrames,
  requests,
}) => {
  const sourceFrames = Array.isArray(frames) ? frames : [];
  const sourceSubagentFrames =
    subagentFrames && typeof subagentFrames === "object"
      ? subagentFrames
      : {};
  const pendingFrames = buildPendingConfirmationTraceFrames(requests);
  if (pendingFrames.length === 0) {
    return { frames: sourceFrames, subagentFrames };
  }

  let mergedFrames = sourceFrames;
  let mergedSubagentFrames = sourceSubagentFrames;
  const groupKeys = ["", ...Object.keys(sourceSubagentFrames)];
  const readGroup = (groupKey) =>
    groupKey
      ? Array.isArray(mergedSubagentFrames[groupKey])
        ? mergedSubagentFrames[groupKey]
        : []
      : mergedFrames;
  const requestProjectionOptions = (pendingFrame) => ({
    ...(typeof pendingFrame?.execution_id === "string" && pendingFrame.execution_id.trim()
      ? { executionId: pendingFrame.execution_id }
      : {}),
    ...(typeof pendingFrame?.session_id === "string" && pendingFrame.session_id.trim()
      ? { sessionId: pendingFrame.session_id }
      : {}),
  });
  const callFrameIsBareForRequest = (frame) => {
    const payload = frame?.payload;
    return ![
      "confirmation_id",
      "interaction_id",
      "request_id",
    ].some((key) => hasOwn(payload, key));
  };
  const findOwnerLocations = (pendingFrame) => {
    const confirmationId = pendingFrame?.payload?.confirmation_id;
    const exactLocations = [];
    const bareLocations = [];
    groupKeys.forEach((groupKey) => {
      const group = readGroup(groupKey);
      const combined = [...group, pendingFrame];
      const resolution = resolveToolCallOwnerForRequest(
        combined,
        confirmationId,
        requestProjectionOptions(pendingFrame),
      );
      if (!["qualified", "legacy"].includes(resolution.status)) return;
      const pendingIndex = group.length;
      const call = resolution.call;
      const identityStatus = call?.identity?.status || resolution.status;
      if (!call.callFrameIndexes.includes(pendingIndex)) return;
      const priorCallIndexes = call.callFrameIndexes
        .filter((frameIndex) => frameIndex < pendingIndex)
        .sort((left, right) => left - right);
      if (priorCallIndexes.length === 0) return;

      const exactIndexes = priorCallIndexes.filter((frameIndex) => {
        const existing = group[frameIndex];
        return (
          existing?.type === "tool_call" &&
          existing.payload?.confirmation_id === confirmationId
        );
      });
      if (exactIndexes.length > 0) {
        const exactIndex = exactIndexes[0];
        const earlierShadowingBare = priorCallIndexes.find((frameIndex) =>
          frameIndex < exactIndex &&
          group[frameIndex]?.type === "tool_call" &&
          callFrameIsBareForRequest(group[frameIndex]),
        );
        exactLocations.push({
          groupKey,
          frameIndex: earlierShadowingBare ?? exactIndex,
          identityStatus,
        });
        return;
      }

      const bareIndex = priorCallIndexes.find((frameIndex) =>
        group[frameIndex]?.type === "tool_call" &&
        callFrameIsBareForRequest(group[frameIndex]),
      );
      if (bareIndex !== undefined) {
        bareLocations.push({
          groupKey,
          frameIndex: bareIndex,
          identityStatus,
        });
      }
    });
    // An exact in-scope confirmation owns the pending overlay. Bare call-id
    // candidates in other trace groups cannot shadow that exact owner.
    return exactLocations.length > 0 ? exactLocations : bareLocations;
  };
  const replaceAt = ({ groupKey, frameIndex, identityStatus }, pendingFrame) => {
    const group = readGroup(groupKey);
    const frame = group[frameIndex];
    if (frame?.type !== "tool_call") return false;
    const framePayload =
      frame.payload && typeof frame.payload === "object" ? frame.payload : {};
    const pendingPayload = { ...(pendingFrame.payload || {}) };
    if (identityStatus === "legacy") {
      // A pending overlay may enrich what the user sees, but it must not turn
      // a legacy owner into a qualified v1 identity by copying request fields.
      ["call_id", "tool_name", "toolkit_id", "call_ref", "call_ref_metadata"].forEach(
        (key) => delete pendingPayload[key],
      );
    }
    // Projection admitted the pending frame and source frame as one exact
    // owner. Preserve source identity fields and only fill missing raw fields.
    const mergedPayload = { ...framePayload, ...pendingPayload };
    [
      "call_id",
      "tool_name",
      "toolkit_id",
      "call_ref",
      "call_ref_metadata",
    ].forEach((key) => {
      if (hasOwn(framePayload, key)) mergedPayload[key] = framePayload[key];
    });
    const nextGroup = [...group];
    const mergedFrame = {
      ...pendingFrame,
      ...frame,
      ...Object.fromEntries(
        (identityStatus === "legacy"
          ? []
          : ["run_id", "execution_id", "session_id", "event_cursor", "event_id", "iteration", "links"]
        ).filter((key) => !hasOwn(frame, key) && hasOwn(pendingFrame, key))
          .map((key) => [key, pendingFrame[key]]),
      ),
      payload: mergedPayload,
    };
    if (identityStatus === "legacy") {
      ["run_id", "execution_id", "session_id", "event_cursor", "event_id", "iteration", "links"]
        .forEach((key) => {
          if (!hasOwn(frame, key)) delete mergedFrame[key];
        });
    }
    nextGroup[frameIndex] = mergedFrame;
    if (!groupKey) {
      mergedFrames = nextGroup;
      return true;
    }
    if (mergedSubagentFrames === sourceSubagentFrames) {
      mergedSubagentFrames = { ...sourceSubagentFrames };
    }
    mergedSubagentFrames[groupKey] = nextGroup;
    return true;
  };

  const unmatchedPendingFrames = [];
  pendingFrames.forEach((pendingFrame) => {
    const locations = findOwnerLocations(pendingFrame);
    if (locations.length === 1 && replaceAt(locations[0], pendingFrame)) {
      return;
    }
    unmatchedPendingFrames.push(pendingFrame);
  });

  let nextSeq = sourceFrames.reduce((highest, frame) => {
    const seq = Number(frame?.seq);
    return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
  }, 0);
  if (unmatchedPendingFrames.length > 0) {
    mergedFrames = [
      ...mergedFrames,
      ...unmatchedPendingFrames.map((pendingFrame) => {
        nextSeq += 1;
        return { ...pendingFrame, seq: nextSeq };
      }),
    ];
  }
  return {
    frames: mergedFrames,
    subagentFrames: mergedSubagentFrames,
  };
};

export const mergePendingConfirmationTraceFrames = (frames, requests) =>
  mergePendingConfirmationTraceState({ frames, requests }).frames;
