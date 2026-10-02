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
    isInlineInteraction(payload) ||
    SUBAGENT_TOOLS.has(toolName)
  ) {
    return null;
  }

  const toolkit = scopePart(payload?.toolkit_id);
  const run = scopePart(frame?.run_id);
  return {
    callId,
    toolName,
    toolkitPresent: toolkit.present,
    toolkitId: toolkit.value,
    runPresent: run.present,
    runId: run.value,
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
      left.runId === right.runId,
  );

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

const outputOwnerForItem = (item, callIdentitiesById, legacyOwners) => {
  if (!item?._toolOutput && item?._outputCallId === undefined) return null;

  const sourceFrame = sourceFrameOf(item);
  const explicitCallId = hasTextIdentity(item?._outputCallId)
    ? item._outputCallId
    : hasTextIdentity(sourceFrame?.payload?.call_id)
      ? sourceFrame.payload.call_id
      : "";
  if (explicitCallId) {
    const identity = callIdentitiesById.get(explicitCallId);
    if (!identity) return null;
    const outputRun = scopePart(sourceFrame?.run_id);
    const outputTool = normalizedToolName(sourceFrame);
    const outputToolkit = scopePart(sourceFrame?.payload?.toolkit_id);
    if (
      (outputRun.present &&
        (!identity.runPresent || outputRun.value !== identity.runId)) ||
      (outputTool && outputTool !== identity.toolName) ||
      (outputToolkit.present &&
        (!identity.toolkitPresent || outputToolkit.value !== identity.toolkitId))
    ) {
      return null;
    }
    return { identity, callIds: [explicitCallId] };
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
) => {
  const type = frame?.type;
  if (TRANSPARENT_METADATA_TYPES.has(type) || type === "tool_result") return true;

  if (type === "tool_call") {
    const identity = getToolGroupingIdentity(frame);
    if (!identity || !sameGroupingIdentity(identity, candidateCalls[0]?._toolGrouping)) {
      return false;
    }
    return candidateCallIds.has(identity.callId);
  }

  if (type === "observation") {
    const owner = hasTextIdentity(frame?.payload?.call_id)
      ? { callIds: [frame.payload.call_id], identity: null }
      : legacyOwners.get(frame);
    if (!owner) return false;
    if (!owner.identity) {
      return owner.callIds.every((id) => candidateCallIds.has(id));
    }
    return (
      sameGroupingIdentity(owner.identity, candidateCalls[0]?._toolGrouping) &&
      owner.callIds.every((id) => candidateCallIds.has(id))
    );
  }

  return false;
};

const hasSemanticBarrierBetween = (
  previousCall,
  nextCall,
  candidateCalls,
  candidateCallIds,
  frames,
  frameIndex,
  legacyOwners,
) => {
  const previousFrame = sourceFrameOf(previousCall);
  const nextFrame = sourceFrameOf(nextCall);
  const previousIndex = frameIndex.get(previousFrame);
  const nextIndex = frameIndex.get(nextFrame);
  if (
    previousIndex === undefined ||
    nextIndex === undefined ||
    nextIndex <= previousIndex
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
  const callIdentitiesById = new Map();
  for (const frame of frames) {
    if (frame?.type !== "tool_call") continue;
    const identity = getToolGroupingIdentity(frame);
    if (identity) callIdentitiesById.set(identity.callId, identity);
  }

  const output = [];
  let index = 0;
  while (index < items.length) {
    const first = items[index];
    if (!first?._toolGrouping || !sourceFrameOf(first)) {
      output.push(first);
      index += 1;
      continue;
    }

    const calls = [first];
    const candidateCallIds = new Set([first._toolGrouping.callId]);
    const outputs = [];
    const memberItems = [first];
    let cursor = index + 1;
    let previousCall = first;

    while (cursor < items.length) {
      const next = items[cursor];
      if (isOutputDescriptor(next)) {
        const owner = outputOwnerForItem(next, callIdentitiesById, legacyOwners);
        if (
          !isOwnedByCurrentCalls(owner, calls, candidateCallIds) ||
          hasSemanticBarrierBetween(
            previousCall,
            next,
            calls,
            candidateCallIds,
            frames,
            frameIndex,
            legacyOwners,
          )
        ) {
          break;
        }
        outputs.push(next);
        memberItems.push(next);
        cursor += 1;
        continue;
      }

      if (
        next?._toolGrouping &&
        sourceFrameOf(next) &&
        sameGroupingIdentity(first._toolGrouping, next._toolGrouping) &&
        !hasSemanticBarrierBetween(
          previousCall,
          next,
          calls,
          candidateCallIds,
          frames,
          frameIndex,
          legacyOwners,
        )
      ) {
        calls.push(next);
        candidateCallIds.add(next._toolGrouping.callId);
        memberItems.push(next);
        previousCall = next;
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
      },
    });
    index = cursor;
  }

  return output;
};
