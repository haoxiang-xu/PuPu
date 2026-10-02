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

const hasTextIdentity = (value) =>
  typeof value === "string" && value.trim().length > 0;

const scopePart = (value) =>
  hasTextIdentity(value)
    ? { present: true, value: value.trim() }
    : { present: false, value: "" };

const normalizedToolName = (frame) => {
  const name = frame?.payload?.tool_name;
  return typeof name === "string" ? name.trim() : "";
};

const TIMELINE_MERGE_POLICIES = new Set([
  "never",
  "no_feedback",
  "approved",
  "always",
]);

const timelineMergePolicyForFrame = (frame) => {
  const payload = frame?.payload;
  const toolName = normalizedToolName(frame);
  if (Object.prototype.hasOwnProperty.call(payload || {}, "timeline_merge_policy")) {
    return TIMELINE_MERGE_POLICIES.has(payload.timeline_merge_policy)
      ? payload.timeline_merge_policy
      : "never";
  }
  if (
    toolName === "ask_user_question" ||
    toolName === "__continuation__" ||
    SUBAGENT_TOOLS.has(toolName) ||
    (hasTextIdentity(payload?.interact_type) &&
      payload.interact_type !== "confirmation")
  ) {
    return "never";
  }
  return "approved";
};

const isInlineInteraction = (payload) =>
  payload?.requires_confirmation === true ||
  hasTextIdentity(payload?.confirmation_id) ||
  hasTextIdentity(payload?.interact_type);

export const getToolGroupingIdentity = (frame) => {
  const payload = frame?.payload;
  const toolName = normalizedToolName(frame);
  const callId = payload?.call_id;

  if (
    !toolName ||
    toolName === "__continuation__" ||
    !hasTextIdentity(callId) ||
    SUBAGENT_TOOLS.has(toolName)
  ) {
    return null;
  }

  const policy = timelineMergePolicyForFrame(frame);
  if (policy === "never") return null;

  const toolkit = scopePart(payload?.toolkit_id);
  const run = scopePart(frame?.run_id);
  return {
    callId,
    toolName,
    toolkitPresent: toolkit.present,
    toolkitId: toolkit.value,
    runPresent: run.present,
    runId: run.value,
    policy,
    hasFeedback: isInlineInteraction(payload),
    confirmationId: hasTextIdentity(payload?.confirmation_id)
      ? payload.confirmation_id.trim()
      : "",
    interactType: hasTextIdentity(payload?.interact_type)
      ? payload.interact_type.trim()
      : "confirmation",
  };
};

const sameGroupingIdentity = (left, right) =>
  Boolean(
    left &&
      right &&
      left.toolName === right.toolName &&
      left.toolkitPresent === right.toolkitPresent &&
      left.toolkitId === right.toolkitId &&
      left.runPresent === right.runPresent &&
      left.runId === right.runId &&
      left.policy === right.policy,
  );

const groupingIdentityKey = (identity) =>
  identity
    ? JSON.stringify([
        identity.callId,
        identity.toolName,
        identity.toolkitPresent,
        identity.toolkitId,
        identity.runPresent,
        identity.runId,
        identity.confirmationId,
        identity.policy,
      ])
    : "";

const frameMatchesIdentityScope = (frame, identity) => {
  const payload = frame?.payload;
  if (!identity || payload?.call_id !== identity.callId) return false;
  const run = scopePart(frame?.run_id);
  if (identity.runPresent !== run.present || identity.runId !== run.value) {
    return false;
  }
  const toolName = normalizedToolName(frame);
  if (toolName && toolName !== identity.toolName) return false;
  const toolkit = scopePart(payload?.toolkit_id);
  if (
    toolkit.present &&
    (!identity.toolkitPresent || toolkit.value !== identity.toolkitId)
  ) {
    return false;
  }
  const confirmationId = payload?.confirmation_id;
  if (
    hasTextIdentity(confirmationId) &&
    identity.confirmationId !== confirmationId.trim()
  ) {
    return false;
  }
  return true;
};

const resolveCallForFeedback = (frame, callRecords) => {
  const confirmationId = frame?.payload?.confirmation_id;
  if (!hasTextIdentity(confirmationId)) return null;
  const matches = callRecords.filter(({ identity }) =>
    frameMatchesIdentityScope(frame, identity) &&
    identity.confirmationId === confirmationId.trim(),
  );
  return matches.length === 1 ? matches[0] : null;
};

const collectPolicyEvidence = (frames) => {
  const callRecordsByKey = new Map();
  frames.forEach((frame, index) => {
    if (frame?.type !== "tool_call") return;
    const identity = getToolGroupingIdentity(frame);
    if (!identity) return;
    const key = groupingIdentityKey(identity);
    const existing = callRecordsByKey.get(key);
    if (!existing) {
      callRecordsByKey.set(key, {
        identity,
        frame,
        index,
        approvalIndexes: [],
        resultIndexes: [],
        feedbackFrames: [],
      });
    } else if (!existing.identity.hasFeedback && identity.hasFeedback) {
      existing.identity = identity;
      existing.frame = frame;
      existing.index = index;
    }
  });
  const callRecords = [...callRecordsByKey.values()];

  const feedbackOwners = new Map();
  const outputOwners = new Map();
  callRecords.forEach((record) => {
    if (record.identity.hasFeedback) record.feedback = true;
  });

  frames.forEach((frame, index) => {
    if (frame?.type === "tool_confirmed" || frame?.type === "tool_denied") {
      const owner = resolveCallForFeedback(frame, callRecords);
      if (!owner) return;
      owner.feedback = true;
      owner.feedbackType =
        typeof owner.frame?.payload?.interact_type === "string"
          ? owner.frame.payload.interact_type
          : "confirmation";
      owner.feedbackFrames.push(frame);
      owner.approvalIndexes.push({ type: frame.type, index });
      feedbackOwners.set(frame, owner);
      return;
    }
    if (frame?.type !== "tool_result" && frame?.type !== "observation") return;
    const matches = callRecords.filter(({ identity }) =>
      frameMatchesIdentityScope(frame, identity),
    );
    if (matches.length === 1) {
      outputOwners.set(frame, matches[0]);
      if (frame.type === "tool_result") matches[0].resultIndexes.push(index);
    }
  });

  const eligible = new Set();
  const feedbackCallKeys = new Set();
  const resultOwners = new Map();
  const validApprovedProofs = new Set();
  callRecords.forEach((record) => {
    const { identity, frame, index } = record;
    if (record.feedback) {
      feedbackCallKeys.add(groupingIdentityKey(identity));
    }
    const feedbackFrames = record.feedbackFrames || [];
    const approvals = record.approvalIndexes || [];
    const results = record.resultIndexes || [];
    const hasFeedback = Boolean(record.feedback || feedbackFrames.length);
    const validApprovedProof =
      feedbackFrames.length === 1 &&
      approvals.length === 1 &&
      approvals[0].type === "tool_confirmed" &&
      identity.interactType === "confirmation" &&
      approvals[0].index > index &&
      results.length === 1 &&
      results[0] > approvals[0].index;
    if (validApprovedProof) {
      validApprovedProofs.add(record);
    }

    let allowed = false;
    if (identity.policy === "always") {
      allowed = true;
    } else if (identity.policy === "no_feedback") {
      allowed = !hasFeedback;
    } else if (identity.policy === "approved") {
      allowed = !hasFeedback || validApprovedProof;
    }
    if (allowed) eligible.add(groupingIdentityKey(identity));
    results.forEach((resultIndex) => {
      resultOwners.set(frames[resultIndex], record);
    });
  });

  const transparentFeedback = new Set();
  feedbackOwners.forEach((record, feedbackFrame) => {
    if (record.identity.policy === "always") {
      transparentFeedback.add(feedbackFrame);
    } else if (
      record.identity.policy === "approved" &&
      validApprovedProofs.has(record) &&
      feedbackFrame.type === "tool_confirmed"
    ) {
      transparentFeedback.add(feedbackFrame);
    }
  });

  return {
    eligible,
    feedbackCallKeys,
    resultOwners,
    outputOwners,
    feedbackOwners,
    transparentFeedback,
  };
};

const hasNumericIteration = (frame) =>
  typeof frame?.iteration === "number" && Number.isFinite(frame.iteration);

const sameBatchScope = (batch, frame) =>
  Boolean(
    batch &&
      typeof frame?.run_id === "string" &&
      frame.run_id.length > 0 &&
      batch.runId === frame.run_id &&
      hasNumericIteration(frame) &&
      batch.iteration === frame.iteration,
  );

const getBatchScope = (frame) => {
  if (
    typeof frame?.run_id !== "string" ||
    frame.run_id.length === 0 ||
    !hasNumericIteration(frame)
  ) {
    return null;
  }
  return { runId: frame.run_id, iteration: frame.iteration };
};

const hasMatchingDeclaredIdentity = (callIdentity, resultFrame) => {
  const resultToolName = normalizedToolName(resultFrame);
  if (resultToolName && resultToolName !== callIdentity.toolName) return false;

  const resultToolkit = scopePart(resultFrame?.payload?.toolkit_id);
  if (
    resultToolkit.present &&
    (!callIdentity.toolkitPresent ||
      resultToolkit.value !== callIdentity.toolkitId)
  ) {
    return false;
  }
  return true;
};

const batchIsCompleteAndGroupable = (batch) => {
  if (!batch || batch.invalid || batch.calls.size === 0) return false;
  if (batch.calls.size !== batch.results.size) return false;

  let sharedIdentity = null;
  for (const callRecord of batch.calls.values()) {
    if (!callRecord.identity || !batch.results.has(callRecord.identity.callId)) {
      return false;
    }
    if (!sharedIdentity) sharedIdentity = callRecord.identity;
    else if (!sameGroupingIdentity(sharedIdentity, callRecord.identity)) return false;
  }
  return Boolean(sharedIdentity);
};

const createBatch = (frame) => {
  const scope = getBatchScope(frame);
  return {
    runId: scope?.runId,
    iteration: scope?.iteration,
    invalid: !scope,
    calls: new Map(),
    results: new Set(),
  };
};

const resetBatchForFrame = (batch, frame) => {
  if (!sameBatchScope(batch, frame)) return createBatch(frame);
  return batch;
};

const collectLegacyObservationOwners = (frames) => {
  const ownersByFrame = new Map();
  let batch = null;

  for (const frame of frames) {
    const type = frame?.type;

    if (TRANSPARENT_METADATA_TYPES.has(type)) {
      if (
        batch &&
        ["iteration_started", "iteration_completed", "response_received", "run_started"].includes(type) &&
        typeof frame.run_id === "string" &&
        frame.run_id.length > 0 &&
        hasNumericIteration(frame) &&
        (frame.run_id !== batch.runId || frame.iteration !== batch.iteration)
      ) {
        batch = null;
      }
      continue;
    }

    if (type === "tool_call") {
      const identity = getToolGroupingIdentity(frame);
      const scope = getBatchScope(frame);
      if (!identity || !scope) {
        batch = null;
        continue;
      }
      batch = resetBatchForFrame(batch, frame);
      if (batch.calls.has(identity.callId)) {
        batch.invalid = true;
        continue;
      }
      batch.calls.set(identity.callId, { identity });
      continue;
    }

    if (type === "tool_result") {
      const scope = getBatchScope(frame);
      const callId = frame?.payload?.call_id;
      if (!scope) {
        batch = null;
        continue;
      }
      batch = resetBatchForFrame(batch, frame);
      const callRecord = hasTextIdentity(callId)
        ? batch.calls.get(callId)
        : null;
      if (
        !callRecord ||
        batch.results.has(callId) ||
        !hasMatchingDeclaredIdentity(callRecord.identity, frame)
      ) {
        batch.invalid = true;
        continue;
      }
      batch.results.add(callId);
      continue;
    }

    if (type === "observation") {
      const callId = frame?.payload?.call_id;
      if (hasTextIdentity(callId)) {
        if (
          sameBatchScope(batch, frame) &&
          batch.calls.has(callId) &&
          batch.results.has(callId)
        ) {
          continue;
        }
        batch = null;
        continue;
      }

      if (
        sameBatchScope(batch, frame) &&
        batchIsCompleteAndGroupable(batch)
      ) {
        const firstCall = batch.calls.values().next().value;
        ownersByFrame.set(frame, {
          identity: firstCall.identity,
          callIds: [...batch.calls.keys()],
        });
        continue;
      }

      // A mismatch or incomplete observation closes the current window. Never
      // search farther back for a more convenient call/result batch.
      batch = null;
      continue;
    }

    batch = null;
  }

  return ownersByFrame;
};

const sourceFrameOf = (item) => item?._sourceFrame;

const outputOwnerForItem = (item, callIdentities, legacyOwners) => {
  if (!item?._toolOutput && item?._outputCallId === undefined) return null;

  const sourceFrame = item?._outputFrame || sourceFrameOf(item);
  const explicitCallId = hasTextIdentity(item?._outputCallId)
    ? item._outputCallId
    : hasTextIdentity(sourceFrame?.payload?.call_id)
      ? sourceFrame.payload.call_id
      : "";
  if (explicitCallId) {
    const outputRun = scopePart(sourceFrame?.run_id);
    const outputTool = normalizedToolName(sourceFrame);
    const outputToolkit = scopePart(sourceFrame?.payload?.toolkit_id);
    const matches = callIdentities.filter((identity) =>
      identity.callId === explicitCallId &&
      identity.runPresent === outputRun.present &&
      identity.runId === outputRun.value &&
      (!outputTool || outputTool === identity.toolName) &&
      (!outputToolkit.present ||
        (identity.toolkitPresent && outputToolkit.value === identity.toolkitId)),
    );
    if (matches.length !== 1) return null;
    return { identity: matches[0], callIds: [explicitCallId] };
  }

  return legacyOwners.get(sourceFrame) || null;
};

const isOutputDescriptor = (item) =>
  item?._toolOutput === true || item?._outputCallId !== undefined;

const isOwnedByCurrentCalls = (owner, calls, currentCallIds) => {
  if (!owner || calls.length === 0) return false;
  const identity = calls[0]._toolGrouping;
  if (!sameGroupingIdentity(identity, owner.identity)) return false;
  return owner.callIds.length > 0 && owner.callIds.every((id) => currentCallIds.has(id));
};

const isTransparentBetweenCalls = (
  frame,
  candidateCalls,
  candidateCallIds,
  legacyOwners,
  policyEvidence,
) => {
  const type = frame?.type;
  if (TRANSPARENT_METADATA_TYPES.has(type)) return true;

  if (type === "tool_result") {
    const owner = policyEvidence.resultOwners.get(frame);
    return Boolean(
      owner &&
        sameGroupingIdentity(owner.identity, candidateCalls[0]?._toolGrouping) &&
        candidateCallIds.has(owner.identity.callId),
    );
  }

  if (type === "tool_confirmed" || type === "tool_denied") {
    const owner = policyEvidence.feedbackOwners?.get(frame);
    return Boolean(
      policyEvidence.transparentFeedback.has(frame) &&
        owner &&
        sameGroupingIdentity(owner.identity, candidateCalls[0]?._toolGrouping) &&
        candidateCallIds.has(owner.identity.callId),
    );
  }

  if (type === "tool_call") {
    const identity = getToolGroupingIdentity(frame);
    return Boolean(
      identity &&
        policyEvidence.eligible.has(groupingIdentityKey(identity)) &&
        sameGroupingIdentity(identity, candidateCalls[0]?._toolGrouping),
    );
  }

  if (type === "observation") {
    const explicitOwner = policyEvidence.outputOwners.get(frame);
    const legacyOwner = legacyOwners.get(frame);
    const owner = explicitOwner
      ? { identity: explicitOwner.identity, callIds: [explicitOwner.identity.callId] }
      : legacyOwner;
    if (!owner) return false;
    return (
      sameGroupingIdentity(owner.identity, candidateCalls[0]?._toolGrouping) &&
      owner.callIds.every((id) => candidateCallIds.has(id))
    );
  }

  return false;
};

const hasSemanticBarrierBetween = (
  previousIndex,
  nextIndex,
  candidateCalls,
  candidateCallIds,
  frames,
  legacyOwners,
  policyEvidence,
) => {
  if (
    previousIndex === undefined ||
    nextIndex === undefined ||
    nextIndex < previousIndex
  ) {
    return true;
  }

  for (let index = previousIndex + 1; index < nextIndex; index += 1) {
    if (
      !isTransparentBetweenCalls(
        frames[index],
        candidateCalls,
        candidateCallIds,
        legacyOwners,
        policyEvidence,
      )
    ) {
      return true;
    }
  }
  return false;
};

export const groupToolTimelineItems = (items, frames = []) => {
  const frameIndex = new Map(frames.map((frame, index) => [frame, index]));
  const legacyOwners = collectLegacyObservationOwners(frames);
  const policyEvidence = collectPolicyEvidence(frames);
  const callIdentitiesByKey = new Map();
  for (const frame of frames) {
    if (frame?.type !== "tool_call") continue;
    const identity = getToolGroupingIdentity(frame);
    if (identity) callIdentitiesByKey.set(groupingIdentityKey(identity), identity);
  }
  const callIdentities = [...callIdentitiesByKey.values()];

  const output = [];
  let index = 0;
  while (index < items.length) {
    const first = items[index];
    if (
      !first?._toolGrouping ||
      !policyEvidence.eligible.has(groupingIdentityKey(first._toolGrouping)) ||
      !sourceFrameOf(first)
    ) {
      output.push(first);
      index += 1;
      continue;
    }

    const calls = [first];
    const candidateCallIds = new Set([first._toolGrouping.callId]);
    const outputs = [];
    const memberItems = [first];
    let cursor = index + 1;
    let lastMemberFrameIndex = frameIndex.get(sourceFrameOf(first));

    while (cursor < items.length) {
      const next = items[cursor];
      if (isOutputDescriptor(next)) {
        const owner = outputOwnerForItem(next, callIdentities, legacyOwners);
        const nextFrameIndex = frameIndex.get(sourceFrameOf(next));
        if (
          !isOwnedByCurrentCalls(owner, calls, candidateCallIds) ||
          hasSemanticBarrierBetween(
            lastMemberFrameIndex,
            nextFrameIndex,
            calls,
            candidateCallIds,
            frames,
            legacyOwners,
            policyEvidence,
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

      const nextFrameIndex = frameIndex.get(sourceFrameOf(next));
      if (
        next?._toolGrouping &&
        policyEvidence.eligible.has(groupingIdentityKey(next._toolGrouping)) &&
        sourceFrameOf(next) &&
        sameGroupingIdentity(first._toolGrouping, next._toolGrouping) &&
        !hasSemanticBarrierBetween(
          lastMemberFrameIndex,
          nextFrameIndex,
          calls,
          candidateCallIds,
          frames,
          legacyOwners,
          policyEvidence,
        )
      ) {
        calls.push(next);
        candidateCallIds.add(next._toolGrouping.callId);
        memberItems.push(next);
        lastMemberFrameIndex = nextFrameIndex;
        cursor += 1;
        continue;
      }

      break;
    }

    if (calls.length < 2) {
      output.push(first);
      index += 1;
      continue;
    }

    output.push({
      key: first.key,
      _toolGroup: {
        identity: first._toolGrouping,
        calls,
        outputs,
        memberItems,
        hasFeedback: calls.some((call) =>
          policyEvidence.feedbackCallKeys.has(
            groupingIdentityKey(call._toolGrouping),
          ),
        ),
      },
    });
    index = cursor;
  }

  return output;
};
