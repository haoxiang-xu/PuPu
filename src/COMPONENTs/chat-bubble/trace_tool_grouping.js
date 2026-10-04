import { projectToolCallLifecycle } from "../../SERVICEs/runtime_events/tool_call_projection";

const SUBAGENT_TOOLS = new Set([
  "delegate_to_subagent",
  "spawn_worker_batch",
  "handoff_to_subagent",
]);

const TRANSPARENT_METADATA_TYPES = new Set([
  "stream_started",
  "run_started",
  "iteration_started",
  "iteration_completed",
  "response_received",
  "run_completed",
  "done",
]);

const TIMELINE_MERGE_POLICIES = new Set([
  "never",
  "no_feedback",
  "approved",
  "always",
]);

const hasTextIdentity = (value) =>
  typeof value === "string" && value.trim().length > 0;

const own = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key);

const normalizedToolName = (frame) => {
  const name = frame?.payload?.tool_name;
  return typeof name === "string" ? name.trim() : "";
};

// Kept as a lightweight timeline annotation for older callers. Grouping and
// ownership are resolved only by projectToolCallLifecycle below.
export const getToolGroupingIdentity = (frame) => {
  if (frame?.type !== "tool_call") return null;
  const toolName = normalizedToolName(frame);
  const callId = frame?.payload?.call_id;
  if (
    !toolName ||
    !hasTextIdentity(callId) ||
    toolName === "ask_user_question" ||
    toolName === "__continuation__" ||
    SUBAGENT_TOOLS.has(toolName)
  ) {
    return null;
  }
  return { callId, toolName };
};

const sourceFrameOf = (item) => item?._sourceFrame;

const descriptorFor = (call) => call?.descriptor || {};

const callIdFor = (call) => {
  const identity = call?.identity || {};
  return identity.callId || descriptorFor(call).call_id || "";
};

const toolNameFor = (call) => {
  const value = call?.identity?.toolName || descriptorFor(call).tool_name || "";
  return typeof value === "string" ? value.trim() : "";
};

const scopeValue = (call, key, identityKey) => {
  if (own(call?.scope, key)) return { present: true, value: call.scope[key] };
  if (own(call?.identity, identityKey)) {
    return { present: true, value: call.identity[identityKey] };
  }
  if (key === "executionId" && own(descriptorFor(call), "execution_id")) {
    return { present: true, value: descriptorFor(call).execution_id };
  }
  if (key === "runId" && own(descriptorFor(call), "original_attempt_id")) {
    return { present: true, value: descriptorFor(call).original_attempt_id };
  }
  return { present: false, value: undefined };
};

const sameKnownScopeValue = (left, right, key, identityKey) => {
  const a = scopeValue(left, key, identityKey);
  const b = scopeValue(right, key, identityKey);
  return a.present === b.present && (!a.present || a.value === b.value);
};

const toolkitNamesForCall = (call, frames) => {
  const names = new Set((call?.callFrameIndexes || [])
    .map((index) => frames[index]?.payload?.toolkit_name)
    .filter(hasTextIdentity)
    .map((value) => value.trim()));
  return names;
};

const sameToolkitScope = (left, right, frames) => {
  const leftId = scopeValue(left, "toolkitId", "toolkitId");
  const rightId = scopeValue(right, "toolkitId", "toolkitId");
  const leftHasId = leftId.present && hasTextIdentity(leftId.value);
  const rightHasId = rightId.present && hasTextIdentity(rightId.value);
  if (leftHasId || rightHasId) {
    return leftHasId && rightHasId && leftId.value === rightId.value;
  }

  const leftNames = toolkitNamesForCall(left, frames);
  const rightNames = toolkitNamesForCall(right, frames);
  if (leftNames.size > 1 || rightNames.size > 1) return false;
  const leftName = [...leftNames][0];
  const rightName = [...rightNames][0];
  return leftName === rightName;
};

const sameGroupingScope = (left, right, frames) =>
  Boolean(
    left &&
      right &&
      left.identity?.status === right.identity?.status &&
      toolNameFor(left) &&
      toolNameFor(left) === toolNameFor(right) &&
      sameKnownScopeValue(left, right, "executionId", "executionId") &&
      sameKnownScopeValue(left, right, "runId", "originalAttemptId") &&
      sameKnownScopeValue(left, right, "sessionId", "sessionId") &&
      sameToolkitScope(left, right, frames),
  );

const policyFor = (call) => {
  const policy = call?.policy || {};
  const status = policy.status || (policy.present === true ? "present" : "unknown");
  if (status === "present") {
    return TIMELINE_MERGE_POLICIES.has(policy.value)
      ? policy.value
      : null;
  }
  if (status === "proven_absent") return "approved";
  return null;
};

const feedbackFrameFor = (frames, call) => {
  if (!Array.isArray(call?.feedbackFrameIndexes) || call.feedbackFrameIndexes.length !== 1) {
    return null;
  }
  return frames[call.feedbackFrameIndexes[0]] || null;
};

const validApprovedProof = (frames, call) => {
  const feedbackFrame = feedbackFrameFor(frames, call);
  const resultIndexes = call?.resultFrameIndexes || [];
  if (
    feedbackFrame?.type !== "tool_confirmed" ||
    resultIndexes.length !== 1 ||
    call.state?.feedback !== "approved"
  ) {
    return false;
  }
  const interactionType = call.callFrameIndexes
    .map((index) => frames[index]?.payload?.interact_type)
    .find((value) => typeof value === "string");
  if (interactionType && interactionType !== "confirmation") return false;
  // The shared projection has already established this exact owner's accepted
  // feedback state. Runtime streams can deliver the result before the HTTP ACK
  // resolves, so presentation must not impose a second arrival-order policy.
  return true;
};

const isEligibleCall = (frames, call) => {
  const policy = policyFor(call);
  if (!policy) return false;
  const feedback = call?.state?.feedback || "unknown";
  const hasFeedback = feedback !== "none" || (call?.feedbackFrameIndexes || []).length > 0;
  if (policy === "never") return false;
  if (policy === "always") return true;
  if (policy === "no_feedback") return !hasFeedback;
  if (policy === "approved") {
    if (!hasFeedback) return true;
    return validApprovedProof(frames, call);
  }
  return false;
};

const frameIndexesByReference = (frames) =>
  new Map(frames.map((frame, index) => [frame, index]));

const createProjectionContext = (timelineFrames, options = {}) => {
  const sourceFrames = Array.isArray(options.sourceFrames)
    ? options.sourceFrames
    : timelineFrames;
  const projection = options.lifecycleProjection || projectToolCallLifecycle(sourceFrames);
  const callsByKey = new Map(projection.calls.map((call) => [call.key, call]));
  const ownersByFrameIndex = new Map(
    projection.evidenceOwnership.map((owner) => [owner.frameIndex, owner]),
  );
  const ownerByFrame = options.ownerByFrame instanceof Map
    ? options.ownerByFrame
    : new Map();
  const ownersByFrameReference = new Map();
  projection.evidenceOwnership.forEach((owner) => {
    const frame = sourceFrames[owner.frameIndex];
    if (frame) ownersByFrameReference.set(frame, owner);
  });
  const ownerForFrame = (frame) => {
    if (!frame) return null;
    const projectedOwner = ownersByFrameReference.get(frame);
    if (projectedOwner) return projectedOwner;
    const callKey = typeof frame._lifecycle_call_key === "string"
      ? frame._lifecycle_call_key
      : ownerByFrame.get(frame);
    if (!callKey) return null;
    const kindByType = {
      tool_call: "call",
      tool_result: "result",
      observation: "observation",
      tool_confirmed: "feedback",
      tool_denied: "feedback",
      user_response: "feedback",
    };
    const kind = kindByType[frame.type];
    return kind ? { callKey, kind } : null;
  };
  const callByFrameIndex = new Map();
  projection.calls.forEach((call) => {
    call.callFrameIndexes.forEach((frameIndex) => {
      callByFrameIndex.set(frameIndex, call);
    });
  });
  return {
    projection,
    sourceFrames,
    callsByKey,
    ownersByFrameIndex,
    ownersByFrameReference,
    ownerForFrame,
    callByFrameIndex,
  };
};

const itemFrameIndex = (item, frameIndex) => {
  const frame = sourceFrameOf(item);
  return frame ? frameIndex.get(frame) : undefined;
};

const callForItem = (item, context, frameIndex) => {
  const sourceFrame = sourceFrameOf(item);
  const sourceIndex = itemFrameIndex(item, frameIndex);
  const owner = context.ownerForFrame(sourceFrame);
  const callKey = typeof sourceFrame?._lifecycle_call_key === "string"
    ? sourceFrame._lifecycle_call_key
    : owner?.callKey;
  const call = callKey
    ? context.callsByKey.get(callKey)
    : sourceIndex === undefined
      ? null
      : context.callByFrameIndex.get(sourceIndex);
  return call && (owner?.kind === "call" || call.callFrameIndexes.includes(sourceIndex))
    ? call
    : null;
};

const isOutputDescriptor = (item) =>
  item?._toolOutput === true || item?._outputCallId !== undefined;

const outputOwnerForItem = (item, context, frameIndex) => {
  if (!isOutputDescriptor(item)) return null;
  const evidenceFrame = item?._outputFrame || sourceFrameOf(item);
  const sourceIndex = evidenceFrame ? frameIndex.get(evidenceFrame) : undefined;
  const owner = context.ownerForFrame(evidenceFrame) ||
    (sourceIndex === undefined ? null : context.ownersByFrameIndex.get(sourceIndex));
  if (!owner || !["result", "observation"].includes(owner.kind)) return null;
  const call = context.callsByKey.get(owner.callKey);
  if (!call) return null;
  const explicitCallId = hasTextIdentity(item?._outputCallId)
    ? item._outputCallId
    : hasTextIdentity(sourceFrameOf(item)?.payload?.call_id)
      ? sourceFrameOf(item).payload.call_id
      : "";
  if (explicitCallId && explicitCallId !== callIdFor(call)) return null;
  return call;
};

const candidateCallSetIsCompatible = (calls, nextCall, frames) =>
  calls.length > 0 &&
  sameGroupingScope(calls[0], nextCall, frames) &&
  !calls.some((call) => call.key === nextCall.key || callIdFor(call) === callIdFor(nextCall));

const transparentOwnedFrame = (frameIndex, callKeys, context, frames) => {
  const frame = frames[frameIndex];
  if (TRANSPARENT_METADATA_TYPES.has(frame?.type)) return true;
  const owner = context.ownerForFrame(frame) || context.ownersByFrameIndex.get(frameIndex);
  if (!owner || !callKeys.has(owner.callKey)) return false;
  const call = context.callsByKey.get(owner.callKey);
  if (!call || !isEligibleCall(context.sourceFrames, call)) return false;
  if (owner.kind === "feedback") {
    const policy = policyFor(call);
    return policy === "always" ||
      (policy === "approved" && validApprovedProof(context.sourceFrames, call));
  }
  return ["call", "result", "observation", "interaction"].includes(owner.kind);
};

const hasSemanticBarrierBetween = (previousIndex, nextIndex, callKeys, context, frames) => {
  if (
    previousIndex === undefined ||
    nextIndex === undefined ||
    nextIndex < previousIndex
  ) {
    return true;
  }
  for (let index = previousIndex + 1; index < nextIndex; index += 1) {
    if (!transparentOwnedFrame(index, callKeys, context, frames)) return true;
  }
  return false;
};

export const groupToolTimelineItems = (items, frames = [], options = {}) => {
  if (!Array.isArray(items) || items.length === 0) return Array.isArray(items) ? items : [];
  const timelineFrames = Array.isArray(frames) ? frames : [];
  const frameIndex = frameIndexesByReference(timelineFrames);
  const context = createProjectionContext(timelineFrames, options);
  const output = [];
  let index = 0;

  while (index < items.length) {
    const first = items[index];
    const firstCall = callForItem(first, context, frameIndex);
    if (!firstCall || !isEligibleCall(context.sourceFrames, firstCall)) {
      output.push(first);
      index += 1;
      continue;
    }

    const calls = [firstCall];
    const callItems = [first];
    const memberItems = [first];
    const outputs = [];
    const callKeys = new Set([firstCall.key]);
    let cursor = index + 1;
    let lastMemberFrameIndex = itemFrameIndex(first, frameIndex);

    while (cursor < items.length) {
      const next = items[cursor];
      if (isOutputDescriptor(next)) {
        const ownerCall = outputOwnerForItem(next, context, frameIndex);
        const nextFrameIndex = itemFrameIndex(next, frameIndex);
        if (
          !ownerCall ||
          ownerCall.key !== calls[calls.length - 1].key ||
          hasSemanticBarrierBetween(
            lastMemberFrameIndex,
            nextFrameIndex,
            callKeys,
            context,
            timelineFrames,
          )
        ) {
          break;
        }
        outputs.push(next);
        memberItems.push(next);
        lastMemberFrameIndex = nextFrameIndex;
        cursor += 1;
        continue;
      }

      const nextCall = callForItem(next, context, frameIndex);
      const nextFrameIndex = itemFrameIndex(next, frameIndex);
      if (
        nextCall &&
        isEligibleCall(context.sourceFrames, nextCall) &&
        candidateCallSetIsCompatible(calls, nextCall, context.sourceFrames) &&
        !hasSemanticBarrierBetween(
          lastMemberFrameIndex,
          nextFrameIndex,
          callKeys,
          context,
          timelineFrames,
        )
      ) {
        calls.push(nextCall);
        callItems.push(next);
        memberItems.push(next);
        callKeys.add(nextCall.key);
        lastMemberFrameIndex = nextFrameIndex;
        cursor += 1;
        continue;
      }
      break;
    }

    if (callItems.length < 2) {
      output.push(first);
      index += 1;
      continue;
    }

    output.push({
      key: first.key,
      _toolGroup: {
        identity: firstCall.identity,
        calls: callItems,
        outputs,
        memberItems,
        hasFeedback: calls.some((call) =>
          call.state?.feedback && call.state.feedback !== "none",
        ),
        hasPendingFeedback: callItems.some(
          (item) => item._hasPendingFeedback === true,
        ),
      },
    });
    index = cursor;
  }

  return output;
};
