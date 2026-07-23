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

export const buildPendingConfirmationTraceFrames = (requests) =>
  normalizePendingConfirmationRequests(requests).map((request, index) => {
    const interactType =
      typeof request.interactType === "string" && request.interactType.trim()
        ? request.interactType.trim()
        : "confirmation";
    const interactConfig =
      request.interactConfig && typeof request.interactConfig === "object"
        ? request.interactConfig
        : {};
    const callId =
      typeof request.callId === "string" && request.callId.trim()
        ? request.callId.trim()
        : `pending-confirmation-${index + 1}`;
    const requestedAt = Number(request.requestedAt);

    return {
      seq: index + 1,
      ts: Number.isFinite(requestedAt) ? requestedAt : Date.now() + index,
      type: "tool_call",
      stage: "client",
      payload: {
        call_id: callId,
        confirmation_id: request.confirmationId.trim(),
        requires_confirmation: true,
        tool_name:
          typeof request.toolName === "string" && request.toolName.trim()
            ? request.toolName.trim()
            : "tool",
        ...(typeof request.toolkitId === "string" && request.toolkitId.trim()
          ? { toolkit_id: request.toolkitId.trim() }
          : {}),
        ...(typeof request.toolDisplayName === "string" &&
        request.toolDisplayName.trim()
          ? { tool_display_name: request.toolDisplayName.trim() }
          : {}),
        ...(typeof request.description === "string" && request.description.trim()
          ? { description: request.description.trim() }
          : {}),
        arguments:
          request.arguments && typeof request.arguments === "object"
            ? request.arguments
            : {},
        interact_type: interactType,
        interact_config: interactConfig,
      },
    };
  });

const frameIdentity = (frame) => ({
  callId:
    typeof frame?.payload?.call_id === "string"
      ? frame.payload.call_id.trim()
      : "",
  confirmationId:
    typeof frame?.payload?.confirmation_id === "string"
      ? frame.payload.confirmation_id.trim()
      : "",
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
  const findLocation = (pendingFrame, { bareOnly = false } = {}) => {
    const pendingIdentity = frameIdentity(pendingFrame);
    for (const groupKey of groupKeys) {
      const group = readGroup(groupKey);
      const frameIndex = group.findIndex((frame) => {
        if (frame?.type !== "tool_call") {
          return false;
        }
        const identity = frameIdentity(frame);
        if (bareOnly) {
          return Boolean(
            !identity.confirmationId &&
              identity.callId &&
              identity.callId === pendingIdentity.callId,
          );
        }
        return Boolean(
          identity.confirmationId &&
            identity.confirmationId === pendingIdentity.confirmationId,
        );
      });
      if (frameIndex >= 0) {
        return { groupKey, frameIndex };
      }
    }
    return null;
  };
  const findShadowingBareLocation = (pendingFrame, exactLocation) => {
    if (!exactLocation) {
      return null;
    }
    const pendingIdentity = frameIdentity(pendingFrame);
    if (!pendingIdentity.callId) {
      return null;
    }
    const group = readGroup(exactLocation.groupKey);
    const frameIndex = group.findIndex((frame, index) => {
      if (index >= exactLocation.frameIndex || frame?.type !== "tool_call") {
        return false;
      }
      const identity = frameIdentity(frame);
      return Boolean(
        !identity.confirmationId &&
          identity.callId &&
          identity.callId === pendingIdentity.callId,
      );
    });
    return frameIndex >= 0
      ? { groupKey: exactLocation.groupKey, frameIndex }
      : null;
  };
  const replaceAt = ({ groupKey, frameIndex }, pendingFrame) => {
    const group = readGroup(groupKey);
    const frame = group[frameIndex];
    const framePayload =
      frame?.payload && typeof frame.payload === "object" ? frame.payload : {};
    const pendingPayload = pendingFrame.payload;
    const mergedPayload = { ...framePayload, ...pendingPayload };
    if (
      pendingPayload.call_id.startsWith("pending-confirmation-") &&
      typeof framePayload.call_id === "string" &&
      framePayload.call_id.trim()
    ) {
      mergedPayload.call_id = framePayload.call_id.trim();
    }
    if (
      pendingPayload.tool_name === "tool" &&
      typeof framePayload.tool_name === "string" &&
      framePayload.tool_name.trim()
    ) {
      mergedPayload.tool_name = framePayload.tool_name;
    }
    const nextGroup = [...group];
    nextGroup[frameIndex] = {
      ...frame,
      payload: mergedPayload,
    };
    if (!groupKey) {
      mergedFrames = nextGroup;
      return;
    }
    if (mergedSubagentFrames === sourceSubagentFrames) {
      mergedSubagentFrames = { ...sourceSubagentFrames };
    }
    mergedSubagentFrames[groupKey] = nextGroup;
  };

  const unmatchedPendingFrames = [];
  pendingFrames.forEach((pendingFrame) => {
    const exactLocation = findLocation(pendingFrame);
    const location =
      findShadowingBareLocation(pendingFrame, exactLocation) ||
      exactLocation ||
      findLocation(pendingFrame, {
        bareOnly: true,
      });
    if (location) {
      replaceAt(location, pendingFrame);
    } else {
      unmatchedPendingFrames.push(pendingFrame);
    }
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
