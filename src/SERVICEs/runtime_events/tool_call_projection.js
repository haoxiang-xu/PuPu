const TOOL_CALL_REF_SCHEMA = "pupu.tool_call_ref.v1";
const TOOL_CALL_REF_METADATA_SCHEMA = "pupu.tool_call_ref_metadata.v1";
const INTENT_CURSOR_SCHEMA = "unchain.event_cursor.v1";
const TIMELINE_MERGE_POLICIES = new Set(["never", "no_feedback", "approved", "always"]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

const canonicalJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

const SHARED_WHITESPACE_CODE_POINTS = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020,
  0x0085, 0x00a0, 0x1680,
  0x001c, 0x001d, 0x001e, 0x001f,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

const hasNonblankString = (value) =>
  typeof value === "string" &&
  Array.from(value).some(
    (character) => !SHARED_WHITESPACE_CODE_POINTS.has(character.codePointAt(0)),
  );

const hasExactKeys = (value, requiredKeys, optionalKeys = []) => {
  if (!isRecord(value)) return false;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Object.keys(value);
  return (
    requiredKeys.every((key) => hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const validIntentCursor = (cursor) =>
  hasExactKeys(cursor, ["schema", "store_seq", "event_id"]) &&
  cursor.schema === INTENT_CURSOR_SCHEMA &&
  Number.isSafeInteger(cursor.store_seq) &&
  cursor.store_seq > 0 &&
  hasNonblankString(cursor.event_id);

const isJsonValue = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.keys(value).every((key) => isJsonValue(value[key]));
};
const copyJsonValue = (value) => JSON.parse(JSON.stringify(value));

const validateToolCallRefMetadata = (value, descriptor) => {
  const required = [
    "schema",
    "intent_cursor",
    "timeline_merge_policy_declared",
    "original_arguments_declared",
  ];
  const optional = ["timeline_merge_policy", "original_arguments"];
  if (!hasExactKeys(value, required, optional)) {
    return { valid: false, reason: "invalid_metadata_keys" };
  }
  if (
    value.schema !== TOOL_CALL_REF_METADATA_SCHEMA ||
    !validIntentCursor(value.intent_cursor) ||
    !sameCursor(value.intent_cursor, descriptor.intent_cursor) ||
    typeof value.timeline_merge_policy_declared !== "boolean" ||
    typeof value.original_arguments_declared !== "boolean"
  ) {
    return { valid: false, reason: "invalid_metadata_value" };
  }
  if (
    value.timeline_merge_policy_declared !== hasOwn(value, "timeline_merge_policy") ||
    (hasOwn(value, "timeline_merge_policy") &&
      !TIMELINE_MERGE_POLICIES.has(value.timeline_merge_policy)) ||
    value.original_arguments_declared !== hasOwn(value, "original_arguments") ||
    (hasOwn(value, "original_arguments") && !isJsonValue(value.original_arguments))
  ) {
    return { valid: false, reason: "invalid_metadata_declaration" };
  }
  return { valid: true, value: copyJsonValue(value) };
};

export const validateToolCallRef = (value) => {
  const required = [
    "schema",
    "execution_id",
    "original_attempt_id",
    "call_id",
    "tool_name",
    "intent_cursor",
  ];
  const optional = ["iteration", "toolkit_id"];
  if (!hasExactKeys(value, required, optional)) {
    return { valid: false, reason: "invalid_descriptor_keys" };
  }
  if (
    value.schema !== TOOL_CALL_REF_SCHEMA ||
    !hasNonblankString(value.execution_id) ||
    !hasNonblankString(value.original_attempt_id) ||
    !hasNonblankString(value.call_id) ||
    !hasNonblankString(value.tool_name) ||
    !validIntentCursor(value.intent_cursor)
  ) {
    return { valid: false, reason: "invalid_descriptor_value" };
  }
  if (
    hasOwn(value, "iteration") &&
    (!Number.isSafeInteger(value.iteration) || value.iteration < 0)
  ) {
    return { valid: false, reason: "invalid_iteration" };
  }
  if (hasOwn(value, "toolkit_id") && !hasNonblankString(value.toolkit_id)) {
    return { valid: false, reason: "invalid_toolkit_id" };
  }

  return {
    valid: true,
    value: {
      ...value,
      intent_cursor: { ...value.intent_cursor },
    },
  };
};

const ownerKeyFor = (descriptor) =>
  JSON.stringify([
    descriptor.execution_id,
    descriptor.original_attempt_id,
    descriptor.call_id,
  ]);

const sameCursor = (left, right) =>
  left?.schema === right?.schema &&
  left?.store_seq === right?.store_seq &&
  left?.event_id === right?.event_id;

const descriptorsAgree = (left, right) =>
  left.tool_name === right.tool_name &&
  sameCursor(left.intent_cursor, right.intent_cursor) &&
  (!hasOwn(left, "iteration") ||
    !hasOwn(right, "iteration") ||
    left.iteration === right.iteration) &&
  (!hasOwn(left, "toolkit_id") ||
    !hasOwn(right, "toolkit_id") ||
    left.toolkit_id === right.toolkit_id);

const mergeDescriptorKnowledge = (left, right) => ({
  schema: TOOL_CALL_REF_SCHEMA,
  execution_id: left.execution_id,
  original_attempt_id: left.original_attempt_id,
  call_id: left.call_id,
  tool_name: left.tool_name,
  intent_cursor: { ...left.intent_cursor },
  ...(hasOwn(left, "iteration") || hasOwn(right, "iteration")
    ? { iteration: hasOwn(left, "iteration") ? left.iteration : right.iteration }
    : {}),
  ...(hasOwn(left, "toolkit_id") || hasOwn(right, "toolkit_id")
    ? { toolkit_id: hasOwn(left, "toolkit_id") ? left.toolkit_id : right.toolkit_id }
    : {}),
});

const isLifecycleEvidence = (frame) =>
  frame?.type === "tool_call" ||
  frame?.type === "tool_result" ||
  frame?.type === "tool_confirmed" ||
  frame?.type === "tool_denied" ||
  frame?.type === "interaction.requested" ||
  frame?.type === "interaction.resolved" ||
  frame?.type === "observation";

const metadataForOwner = (frames, indexes) =>
  indexes
    .map((index) => frames[index]?.payload?.call_ref_metadata)
    .find((metadata) => isRecord(metadata));

const policyForCallFrames = (frames, indexes) => {
  const metadata = metadataForOwner(frames, indexes);
  if (!metadata) {
    return { present: false, status: "unknown" };
  }
  if (metadata.timeline_merge_policy_declared !== true) {
    return { present: false, status: "proven_absent" };
  }
  return { present: true, status: "present", value: metadata.timeline_merge_policy };
};

const feedbackStateFor = (
  frames,
  indexes,
  acknowledgedSyntheticFeedbackIndexes,
  forcedTentativeFeedbackIndexes = new Set(),
) => {
  const outcomes = [];
  const tentativeOutcomes = [];
  indexes.forEach((index) => {
    const frame = frames[index];
    const isUnacknowledgedSynthetic =
      forcedTentativeFeedbackIndexes.has(index) ||
      (frame?.payload?.synthetic === true &&
        !acknowledgedSyntheticFeedbackIndexes.has(index));
    if (frame?.type === "tool_confirmed") {
      const explicitOutcome = frame.payload?.outcome;
      const outcome = explicitOutcome === "approved"
        ? "approved"
        : explicitOutcome === "denied"
          ? "denied"
          : explicitOutcome === "submitted"
            ? "answered"
            : frame.payload?.user_response !== undefined && frame.payload.user_response !== null
              ? "answered"
              : "approved";
      (isUnacknowledgedSynthetic ? tentativeOutcomes : outcomes).push(outcome);
    }
    if (frame?.type === "tool_denied") {
      (isUnacknowledgedSynthetic ? tentativeOutcomes : outcomes).push("denied");
    }
    if (frame?.type === "interaction.requested") outcomes.push("pending");
    if (frame?.type === "interaction.resolved") {
      const outcome = frame.payload?.outcome;
      if (outcome === "approved" || outcome === "denied" || outcome === "submitted") {
        outcomes.push(outcome === "submitted" ? "answered" : outcome);
      }
    }
    if (
      frame?.type === "tool_result" &&
      frame.payload?.user_response !== undefined &&
      frame.payload.user_response !== null
    ) {
      outcomes.push("answered");
    }
    if (
      frame?.type === "tool_call" &&
      (frame.payload?.requires_confirmation === true ||
        hasNonblankString(frame.payload?.confirmation_id))
    ) {
      outcomes.push("pending");
    }
  });
  const unique = [...new Set(outcomes)];
  const tentativeUnique = [...new Set(tentativeOutcomes)];
  if (unique.length === 0) {
    if (tentativeUnique.length === 0) return "none";
    return tentativeUnique.length === 1
      ? `tentative_${tentativeUnique[0]}`
      : "tentative_conflict";
  }
  if (unique.length > 1 && !(unique.length === 2 && unique.includes("pending"))) {
    return "conflict";
  }
  return unique.includes("pending") && unique.length === 2
    ? unique.find((state) => state !== "pending")
    : unique[0];
};

const executionStateFor = (frames, indexes) => {
  const results = indexes
    .map((index) => frames[index])
    .filter((frame) => frame?.type === "tool_result");
  if (results.length === 0) return "unknown";
  const resultOutcomes = results.map((frame) => {
      const status = frame.payload?.status;
      if (status === "error" || status === "failed") return "error";
      if (status === "running") return "running";
      if (status === "stopped" || status === "cancelled" || status === "denied") return "stopped";
      return "completed";
  });
  const terminalOutcomes = new Set(resultOutcomes.filter((outcome) => outcome !== "running"));
  if (terminalOutcomes.size > 1) return "conflict";
  if (terminalOutcomes.size === 1) return [...terminalOutcomes][0];
  return resultOutcomes.length > 0 ? "running" : "unknown";
};

const unresolvedRecord = (frameIndex, frame, reason) => ({
  frameIndex,
  kind: typeof frame?.type === "string" ? frame.type : "unknown",
  reason,
});

const contradictionReason = (frame, descriptor, options) => {
  const payload = isRecord(frame?.payload) ? frame.payload : {};
  const links = isRecord(frame?.links) ? frame.links : {};
  for (const key of ["tool_call_id", "call_id"]) {
    if (hasOwn(links, key) && links[key] !== null && links[key] !== undefined &&
        links[key] !== descriptor.call_id) {
      return "linked_call_id_mismatch";
    }
  }
  if (hasOwn(payload, "call_id") && payload.call_id !== descriptor.call_id) {
    return "call_id_mismatch";
  }
  if (hasOwn(payload, "tool_name") && payload.tool_name !== descriptor.tool_name) {
    return "tool_name_mismatch";
  }
  if (hasOwn(payload, "toolkit_id") && !hasNonblankString(payload.toolkit_id)) {
    return "invalid_toolkit_id";
  }
  if (
    hasOwn(payload, "original_attempt_id") &&
    payload.original_attempt_id !== descriptor.original_attempt_id
  ) {
    return "attempt_scope_mismatch";
  }
  if (hasOwn(payload, "intent_cursor") && !sameCursor(payload.intent_cursor, descriptor.intent_cursor)) {
    return "intent_cursor_mismatch";
  }
  if (
    hasOwn(payload, "execution_id") &&
    payload.execution_id !== descriptor.execution_id
  ) {
    return "execution_scope_mismatch";
  }
  if (
    hasOwn(payload, "iteration") &&
    hasOwn(descriptor, "iteration") &&
    payload.iteration !== descriptor.iteration
  ) {
    return "iteration_mismatch";
  }
  if (
    hasOwn(frame, "iteration") &&
    hasOwn(descriptor, "iteration") &&
    frame.iteration !== descriptor.iteration
  ) {
    return "iteration_mismatch";
  }
  if (
    hasOwn(payload, "toolkit_id") &&
    hasOwn(descriptor, "toolkit_id") &&
    payload.toolkit_id !== descriptor.toolkit_id
  ) {
    return "toolkit_mismatch";
  }
  if (
    hasOwn(frame, "execution_id") &&
    frame.execution_id !== descriptor.execution_id
  ) {
    return "execution_scope_mismatch";
  }
  if (hasOwn(payload, "toolkit_name") && !hasNonblankString(payload.toolkit_name)) {
    return "invalid_toolkit_name";
  }
  if (
    hasNonblankString(options?.executionId) &&
    options.executionId !== descriptor.execution_id
  ) {
    return "execution_scope_mismatch";
  }
  if (
    hasNonblankString(options?.sessionId) &&
    ((hasOwn(frame, "session_id") && frame.session_id !== options.sessionId) ||
      (hasOwn(payload, "session_id") && payload.session_id !== options.sessionId))
  ) {
    return "session_scope_mismatch";
  }
  return null;
};

export const projectToolCallLifecycle = (frames, options = {}) => {
  const source = Array.isArray(frames) ? frames : [];
  const legacyFrameIndexes = [];
  const unresolved = [];
  const unresolvedIndexes = new Set();
  const ownerGroups = new Map();
  const addUnresolved = (frameIndex, reason) => {
    if (unresolvedIndexes.has(frameIndex)) return;
    unresolvedIndexes.add(frameIndex);
    unresolved.push(unresolvedRecord(frameIndex, source[frameIndex], reason));
  };

  source.forEach((frame, frameIndex) => {
    if (!isLifecycleEvidence(frame)) return;
    const payload = isRecord(frame.payload) ? frame.payload : {};
    if (!hasOwn(payload, "call_ref")) {
      if (hasOwn(payload, "call_ref_metadata")) {
        addUnresolved(frameIndex, "metadata_without_call_ref");
        return;
      }
      legacyFrameIndexes.push(frameIndex);
      return;
    }

    const validation = validateToolCallRef(payload.call_ref);
    if (!validation.valid) {
      addUnresolved(frameIndex, "invalid_explicit_ref");
      return;
    }

    const descriptor = validation.value;
    const ownerKey = ownerKeyFor(descriptor);
    if (!ownerGroups.has(ownerKey)) {
      ownerGroups.set(ownerKey, {
        descriptor,
        frameIndexes: [],
        conflictReason: null,
      });
    }
    const group = ownerGroups.get(ownerKey);
    group.frameIndexes.push(frameIndex);
    if (!descriptorsAgree(group.descriptor, descriptor)) {
      group.conflictReason = group.conflictReason || "descriptor_conflict";
    } else {
      group.descriptor = mergeDescriptorKnowledge(group.descriptor, descriptor);
    }
    if (hasOwn(payload, "call_ref_metadata")) {
      const metadataValidation = validateToolCallRefMetadata(
        payload.call_ref_metadata,
        descriptor,
      );
      if (!metadataValidation.valid) {
        group.conflictReason = group.conflictReason || metadataValidation.reason;
      } else {
        const declaresPolicy = metadataValidation.value.timeline_merge_policy_declared;
        if (
          hasOwn(payload, "timeline_merge_policy") &&
          (!declaresPolicy ||
            payload.timeline_merge_policy !== metadataValidation.value.timeline_merge_policy)
        ) {
          group.conflictReason = group.conflictReason || "policy_metadata_mismatch";
        }
      }
    }

    const reason =
      contradictionReason(frame, descriptor, options) ||
      (!hasNonblankString(frame.run_id) || frame.run_id !== descriptor.original_attempt_id
        ? "event_attempt_mismatch"
        : null) ||
      (hasOwn(frame, "iteration") &&
      hasOwn(descriptor, "iteration") &&
      frame.iteration !== descriptor.iteration
        ? "iteration_mismatch"
        : null);
    if (reason) group.conflictReason = group.conflictReason || reason;
  });
  ownerGroups.forEach((group) => {
    const toolkitIds = new Set();
    const toolkitNames = new Set();
    if (hasOwn(group.descriptor || {}, "toolkit_id")) {
      toolkitIds.add(group.descriptor.toolkit_id);
    }
    group.frameIndexes.forEach((frameIndex) => {
      const payload = isRecord(source[frameIndex]?.payload) ? source[frameIndex].payload : {};
      if (hasOwn(payload, "toolkit_id")) toolkitIds.add(payload.toolkit_id);
      if (hasOwn(payload, "toolkit_name")) {
        if (!hasNonblankString(payload.toolkit_name)) {
          group.conflictReason = group.conflictReason || "invalid_toolkit_name";
        } else {
          toolkitNames.add(payload.toolkit_name);
        }
      }
    });
    if (toolkitIds.size > 1 || (toolkitIds.size === 0 && toolkitNames.size > 1)) {
      group.conflictReason = group.conflictReason || "toolkit_scope_conflict";
    }
  });

  const acknowledgedSyntheticFeedbackIndexes = new Set(
    Array.isArray(options.acknowledgedSyntheticFeedbackIndexes)
      ? options.acknowledgedSyntheticFeedbackIndexes
      : [],
  );
  const ownersByIntentCursor = new Map();
  ownerGroups.forEach((group, ownerKey) => {
    const descriptor = group.descriptor;
    const cursorKey = JSON.stringify([
      descriptor.execution_id,
      descriptor.intent_cursor.schema,
      descriptor.intent_cursor.store_seq,
      descriptor.intent_cursor.event_id,
    ]);
    if (!ownersByIntentCursor.has(cursorKey)) ownersByIntentCursor.set(cursorKey, new Set());
    ownersByIntentCursor.get(cursorKey).add(ownerKey);
  });
  ownersByIntentCursor.forEach((owners) => {
    if (owners.size < 2) return;
    owners.forEach((ownerKey) => {
      ownerGroups.get(ownerKey).conflictReason =
        ownerGroups.get(ownerKey).conflictReason || "intent_cursor_owner_conflict";
    });
  });
  const calls = [];
  ownerGroups.forEach((group, ownerKey) => {
    const indexes = [...group.frameIndexes].sort((left, right) => left - right);
    const callFrameIndexes = indexes.filter((index) => source[index]?.type === "tool_call");
    if (!group.conflictReason && callFrameIndexes.length === 0) {
      group.conflictReason = "orphan_explicit_evidence";
    }
    if (!group.conflictReason) {
      indexes.forEach((frameIndex) => {
        const reason =
          contradictionReason(source[frameIndex], group.descriptor, options) ||
          (hasOwn(source[frameIndex] || {}, "iteration") &&
          hasOwn(group.descriptor, "iteration") &&
          source[frameIndex].iteration !== group.descriptor.iteration
            ? "iteration_mismatch"
            : null);
        if (reason) group.conflictReason = group.conflictReason || reason;
      });
    }
    if (!group.conflictReason) {
      const sessionValues = indexes.flatMap((index) => {
        const frame = source[index];
        const payload = isRecord(frame?.payload) ? frame.payload : {};
        return [
          ...(hasOwn(frame || {}, "session_id") ? [frame.session_id] : []),
          ...(hasOwn(payload, "session_id") ? [payload.session_id] : []),
        ];
      });
      if (
        sessionValues.some((value) => !hasNonblankString(value)) ||
        new Set(sessionValues).size > 1
      ) {
        group.conflictReason = "session_scope_mismatch";
      }
    }
    if (!group.conflictReason) {
      const bindingValues = new Set();
      const requestDigests = new Set();
      indexes.forEach((index) => {
        const payload = isRecord(source[index]?.payload) ? source[index].payload : {};
        const links = isRecord(source[index]?.links) ? source[index].links : {};
        ["confirmation_id", "interaction_id", "request_id"].forEach((binding) => {
          if (hasOwn(payload, binding)) {
            bindingValues.add(payload[binding]);
          }
        });
        ["interaction_id", "input_request_id", "confirmation_id", "request_id"].forEach((binding) => {
          if (hasOwn(links, binding) && links[binding] !== null && links[binding] !== undefined) {
            bindingValues.add(links[binding]);
          }
        });
        if (hasOwn(payload, "request_digest")) {
          requestDigests.add(payload.request_digest);
        }
      });
      if (
        [...bindingValues].some((value) => !hasNonblankString(value)) ||
        bindingValues.size > 1
      ) {
        group.conflictReason = "interaction_binding_conflict";
      } else if (
        [...requestDigests].some((value) => !hasNonblankString(value)) ||
        requestDigests.size > 1
      ) {
        group.conflictReason = "request_digest_conflict";
      }
    }
    if (!group.conflictReason) {
      const answerValues = indexes.flatMap((index) => {
        const frame = source[index];
        const payload = isRecord(frame?.payload) ? frame.payload : {};
        if (
          frame?.type === "tool_confirmed" &&
          hasOwn(payload, "user_response") &&
          payload.user_response !== null &&
          payload.outcome !== "approved" &&
          payload.outcome !== "denied"
        ) {
          return [payload.user_response];
        }
        if (
          (frame?.type === "interaction.resolved" && payload.outcome === "submitted") ||
          (frame?.type === "tool_result" && hasOwn(payload, "user_response"))
        ) {
          const response = hasOwn(payload, "response")
            ? payload.response
            : payload.user_response;
          return hasOwn(payload, "response") || hasOwn(payload, "user_response")
            ? [response]
            : [];
        }
        return [];
      });
      const serializedAnswers = answerValues.map((value) => {
        try {
          return canonicalJson(value);
        } catch (_error) {
          return undefined;
        }
      });
      if (
        serializedAnswers.some((value) => value === undefined) ||
        new Set(serializedAnswers).size > 1
      ) {
        group.conflictReason = "feedback_response_conflict";
      }
    }
    if (!group.conflictReason && feedbackStateFor(source, indexes, acknowledgedSyntheticFeedbackIndexes) === "conflict") {
      group.conflictReason = "feedback_conflict";
    }
    if (!group.conflictReason && executionStateFor(source, indexes) === "conflict") {
      group.conflictReason = "execution_conflict";
    }
    if (!group.conflictReason) {
      const metadataValues = indexes
        .map((index) => source[index]?.payload?.call_ref_metadata)
        .filter((metadata) => isRecord(metadata));
      const uniqueMetadata = new Set(metadataValues.map(canonicalJson));
      if (uniqueMetadata.size > 1) {
        group.conflictReason = "metadata_conflict";
      }
    }
    if (group.conflictReason) {
      indexes.forEach((frameIndex) => addUnresolved(frameIndex, group.conflictReason));
      return;
    }

    const feedbackFrameIndexes = [];
    const resultFrameIndexes = [];
    const observationFrameIndexes = [];
    const interactionFrameIndexes = [];
    indexes.forEach((frameIndex) => {
      const type = source[frameIndex]?.type;
      if (type === "tool_confirmed" || type === "tool_denied") {
        feedbackFrameIndexes.push(frameIndex);
      } else if (type === "tool_result") {
        resultFrameIndexes.push(frameIndex);
      } else if (type === "observation") {
        observationFrameIndexes.push(frameIndex);
      } else if (type === "interaction.requested" || type === "interaction.resolved") {
        interactionFrameIndexes.push(frameIndex);
        if (type === "interaction.resolved") feedbackFrameIndexes.push(frameIndex);
      }
    });

    calls.push({
      key: ownerKey,
      anchorFrameIndex: callFrameIndexes[0],
      descriptor: copyJsonValue(group.descriptor),
      ...(metadataForOwner(source, indexes)
        ? { callRefMetadata: copyJsonValue(metadataForOwner(source, indexes)) }
        : {}),
      scope: {
        executionId: group.descriptor.execution_id,
        runId: group.descriptor.original_attempt_id,
        ...(() => {
          const sessionValues = new Set(
            indexes.flatMap((index) => {
              const frame = source[index];
              const payload = isRecord(frame?.payload) ? frame.payload : {};
              return [
                ...(hasOwn(frame || {}, "session_id") ? [frame.session_id] : []),
                ...(hasOwn(payload, "session_id") ? [payload.session_id] : []),
              ];
            }),
          );
          return sessionValues.size === 1
            ? { sessionId: [...sessionValues][0] }
            : {};
        })(),
        ...(hasOwn(group.descriptor, "iteration")
          ? { iteration: group.descriptor.iteration }
          : {}),
        ...(hasOwn(group.descriptor, "toolkit_id")
          ? { toolkitId: group.descriptor.toolkit_id }
          : {}),
      },
      identity: {
        status: "qualified",
        executionId: group.descriptor.execution_id,
        originalAttemptId: group.descriptor.original_attempt_id,
        callId: group.descriptor.call_id,
        toolName: group.descriptor.tool_name,
        intentCursor: group.descriptor.intent_cursor,
        ...(hasOwn(group.descriptor, "iteration")
          ? { iteration: group.descriptor.iteration }
          : {}),
        ...(hasOwn(group.descriptor, "toolkit_id")
          ? { toolkitId: group.descriptor.toolkit_id }
          : {}),
      },
      policy: policyForCallFrames(source, indexes),
      originalArguments: (() => {
        const metadata = metadataForOwner(source, indexes);
        if (!metadata) return { status: "unknown" };
        return metadata.original_arguments_declared
          ? { present: true, value: copyJsonValue(metadata.original_arguments) }
          : { present: false };
      })(),
      state: {
        feedback: feedbackStateFor(
          source,
          indexes,
          acknowledgedSyntheticFeedbackIndexes,
        ),
        execution: executionStateFor(source, indexes),
      },
      frameIndexes: indexes,
      callFrameIndexes,
      feedbackFrameIndexes,
      tentativeFeedbackFrameIndexes: feedbackFrameIndexes.filter(
        (frameIndex) =>
          source[frameIndex]?.payload?.synthetic === true &&
          !acknowledgedSyntheticFeedbackIndexes.has(frameIndex),
      ),
      resultFrameIndexes,
      observationFrameIndexes,
      interactionFrameIndexes,
    });
  });

  // Legacy journal rows predate call_ref. Admit them only when the original
  // call identity and any approval binding identify one owner in this trace.
  // The owner key deliberately points at the first original call frame; it
  // does not manufacture an execution id or intent cursor.
  const legacyCallIndexes = legacyFrameIndexes.filter(
    (index) => source[index]?.type === "tool_call",
  );
  const legacyGroupsByBase = new Map();
  const legacyBaseFor = (frame) => {
    const payload = isRecord(frame?.payload) ? frame.payload : {};
    if (
      (hasOwn(frame || {}, "run_id") && !hasNonblankString(frame.run_id)) ||
      !hasNonblankString(payload.call_id) ||
      !hasNonblankString(payload.tool_name) ||
      (hasOwn(frame || {}, "execution_id") && !hasNonblankString(frame.execution_id)) ||
      (hasOwn(payload, "execution_id") && !hasNonblankString(payload.execution_id)) ||
      (hasOwn(frame || {}, "execution_id") && hasOwn(payload, "execution_id") &&
        frame.execution_id !== payload.execution_id) ||
      (hasOwn(payload, "original_attempt_id") &&
        (!hasNonblankString(payload.original_attempt_id) ||
          payload.original_attempt_id !== frame.run_id)) ||
      (hasOwn(payload, "intent_cursor") && !validIntentCursor(payload.intent_cursor)) ||
      (hasOwn(frame || {}, "iteration") &&
        (!Number.isSafeInteger(frame.iteration) || frame.iteration < 0)) ||
      (hasOwn(payload, "iteration") &&
        (!Number.isSafeInteger(payload.iteration) || payload.iteration < 0)) ||
      (hasOwn(payload, "toolkit_id") && !hasNonblankString(payload.toolkit_id)) ||
      (hasOwn(payload, "toolkit_name") && !hasNonblankString(payload.toolkit_name)) ||
      (hasOwn(frame || {}, "session_id") && !hasNonblankString(frame.session_id)) ||
      (hasOwn(payload, "session_id") && !hasNonblankString(payload.session_id))
    ) return null;
    const toolkitScope = hasOwn(payload, "toolkit_id")
      ? ["id", payload.toolkit_id]
      : hasOwn(payload, "toolkit_name")
        ? ["name", payload.toolkit_name]
        : ["unknown"];
    return JSON.stringify([frame.run_id, payload.call_id, payload.tool_name, toolkitScope]);
  };
  const legacyBindingsFor = (frame) => {
    const payload = isRecord(frame?.payload) ? frame.payload : {};
    const links = isRecord(frame?.links) ? frame.links : {};
    return ["confirmation_id", "interaction_id", "request_id"]
      .map((key) => (hasOwn(payload, key) ? payload[key] : undefined))
      .concat(["interaction_id", "input_request_id", "confirmation_id", "request_id"]
        .map((key) => (hasOwn(links, key) ? links[key] : undefined)))
      .filter((value) => value !== undefined && value !== null);
  };
  legacyCallIndexes.forEach((frameIndex) => {
    const frame = source[frameIndex];
    const base = legacyBaseFor(frame);
    if (!base) return;
    if (!legacyGroupsByBase.has(base)) {
      legacyGroupsByBase.set(base, { base, callIndexes: [], frameIndexes: [], invalid: false });
    }
    legacyGroupsByBase.get(base).callIndexes.push(frameIndex);
  });
  const legacyGroups = [...legacyGroupsByBase.values()];
  const scopeConsistent = (group) => {
    const fieldValues = new Map();
    const toolkitPresence = new Set();
    group.callIndexes.forEach((index) => {
      const frame = source[index];
      const payload = isRecord(frame?.payload) ? frame.payload : {};
      [
        ["iteration", frame, "iteration"],
        ["iteration", payload, "iteration"],
        ["intent_cursor", payload, "intent_cursor"],
        ["execution_id", frame, "execution_id"],
        ["execution_id", payload, "execution_id"],
        ["toolkit_id", payload, "toolkit_id"],
        ["session_id", payload, "session_id"],
      ].forEach(([field, record, key]) => {
        if (!hasOwn(record || {}, key)) return;
        const value = record[key];
        if (!fieldValues.has(field)) fieldValues.set(field, new Set());
        fieldValues.get(field).add(JSON.stringify(value));
      });
      if (hasOwn(payload, "toolkit_id")) toolkitPresence.add("payload");
      if (hasOwn(payload, "toolkit_name")) {
        if (!group.toolkitNames) group.toolkitNames = new Set();
        group.toolkitNames.add(payload.toolkit_name);
      }
    });
    const frameSessions = group.callIndexes.flatMap((index) =>
      hasOwn(source[index] || {}, "session_id")
        ? [JSON.stringify(source[index].session_id)]
        : [],
    );
    const payloadSessions = group.callIndexes.flatMap((index) =>
      hasOwn(source[index]?.payload || {}, "session_id")
        ? [JSON.stringify(source[index].payload.session_id)]
        : [],
    );
    if (
      [...fieldValues.values()].some((values) => values.size > 1) ||
      (!fieldValues.get("toolkit_id")?.size && (group.toolkitNames?.size || 0) > 1) ||
      (frameSessions.length && payloadSessions.length &&
        new Set([...frameSessions, ...payloadSessions]).size > 1)
    ) group.invalid = true;
    group.iteration = fieldValues.get("iteration")?.size
      ? JSON.parse([...fieldValues.get("iteration")][0])
      : undefined;
    group.executionId = fieldValues.get("execution_id")?.size
      ? JSON.parse([...fieldValues.get("execution_id")][0])
      : undefined;
    group.intentCursor = fieldValues.get("intent_cursor")?.size
      ? JSON.parse([...fieldValues.get("intent_cursor")][0])
      : undefined;
    group.toolkitId = fieldValues.get("toolkit_id")?.size
      ? JSON.parse([...fieldValues.get("toolkit_id")][0])
      : undefined;
    group.toolkitName = group.toolkitId === undefined && group.toolkitNames?.size === 1
      ? [...group.toolkitNames][0]
      : undefined;
    group.sessionId = fieldValues.get("session_id")?.size
      ? JSON.parse([...fieldValues.get("session_id")][0])
      : frameSessions.length
        ? JSON.parse(frameSessions[0])
        : undefined;
  };
  legacyGroups.forEach(scopeConsistent);
  legacyGroups.forEach((group) => {
    const bindings = new Set();
    const policyValues = new Set();
    group.callIndexes.forEach((index) => legacyBindingsFor(source[index]).forEach((value) => {
      if (!hasNonblankString(value)) group.invalid = true;
      else bindings.add(value);
    }));
    group.callIndexes.forEach((index) => {
      const payload = isRecord(source[index]?.payload) ? source[index].payload : {};
      if (!hasOwn(payload, "timeline_merge_policy")) return;
      if (!TIMELINE_MERGE_POLICIES.has(payload.timeline_merge_policy)) {
        group.invalid = true;
      } else {
        policyValues.add(payload.timeline_merge_policy);
      }
    });
    if (bindings.size > 1) group.invalid = true;
    if (policyValues.size > 1) group.invalid = true;
    group.binding = bindings.size === 1 ? [...bindings][0] : "";
    group.policy = policyValues.size === 1
      ? { present: true, status: "present", value: [...policyValues][0] }
      : { present: false, status: "unknown" };
    group.anchorFrameIndex = Math.min(...group.callIndexes);
    group.frameIndexes = [...group.callIndexes];
  });
  const legacyProvenanceCompatible = (group, frame, payload) => {
    const anchor = source[group.anchorFrameIndex];
    if (hasOwn(frame || {}, "run_id") && frame.run_id !== anchor?.run_id) return false;
    if (hasOwn(payload, "run_id") && payload.run_id !== anchor?.run_id) return false;
    if (hasOwn(payload, "original_attempt_id") && payload.original_attempt_id !== anchor?.run_id) return false;
    if (hasOwn(frame || {}, "execution_id") && frame.execution_id !== group.executionId) return false;
    if (hasOwn(payload, "execution_id") && payload.execution_id !== group.executionId) return false;
    if (hasOwn(payload, "call_id") && payload.call_id !== anchor?.payload?.call_id) return false;
    if (hasOwn(payload, "tool_name") && payload.tool_name !== anchor?.payload?.tool_name) return false;
    if (hasOwn(frame || {}, "iteration") && frame.iteration !== group.iteration) return false;
    if (hasOwn(payload, "iteration") && group.iteration !== undefined && payload.iteration !== group.iteration) return false;
    if (hasOwn(payload, "toolkit_id") && payload.toolkit_id !== group.toolkitId) return false;
    if (hasOwn(payload, "toolkit_name") && group.toolkitId === undefined &&
        payload.toolkit_name !== group.toolkitName) return false;
    if (hasOwn(payload, "intent_cursor") &&
        (!validIntentCursor(payload.intent_cursor) ||
          (group.intentCursor && !sameCursor(payload.intent_cursor, group.intentCursor)))) return false;
    if (hasOwn(frame || {}, "session_id") && frame.session_id !== group.sessionId) return false;
    if (hasOwn(payload, "session_id") && payload.session_id !== group.sessionId) return false;
    if (hasOwn(payload, "request_source_run_id") && payload.request_source_run_id !== anchor?.run_id) return false;
    return true;
  };
  const legacyCompatible = (group, frame) => {
    const payload = isRecord(frame?.payload) ? frame.payload : {};
    const links = isRecord(frame?.links) ? frame.links : {};
    if (!legacyProvenanceCompatible(group, frame, payload)) return false;
    if (frame?.type === "observation" && !hasOwn(payload, "call_id")) {
      const hasValidOptionalScope =
        (!hasOwn(frame || {}, "iteration") || (Number.isSafeInteger(frame.iteration) && frame.iteration >= 0)) &&
        (!hasOwn(frame || {}, "session_id") || hasNonblankString(frame.session_id)) &&
        (!hasOwn(payload, "session_id") || hasNonblankString(payload.session_id)) &&
        (!hasOwn(payload, "toolkit_id") || hasNonblankString(payload.toolkit_id));
      if (!hasValidOptionalScope) return false;
      const observationSession = hasOwn(frame || {}, "session_id")
        ? frame.session_id
        : hasOwn(payload, "session_id")
          ? payload.session_id
          : undefined;
      const observationOwners = legacyGroups.filter((candidate) => {
        const candidateAnchor = source[candidate.anchorFrameIndex];
        if (hasOwn(frame || {}, "run_id") && frame.run_id !== candidateAnchor?.run_id) return false;
        if (!hasOwn(frame || {}, "run_id") && hasNonblankString(candidateAnchor?.run_id)) return false;
        if (hasOwn(frame || {}, "iteration") && candidate.iteration !== frame.iteration) return false;
        if (hasOwn(frame || {}, "execution_id") && candidate.executionId !== frame.execution_id) return false;
        if (observationSession !== undefined && observationSession !== candidate.sessionId) return false;
        if (hasOwn(payload, "toolkit_id") && payload.toolkit_id !== candidate.toolkitId) return false;
        if (hasOwn(payload, "toolkit_name") && candidate.toolkitId === undefined &&
            payload.toolkit_name !== candidate.toolkitName) return false;
        return true;
      });
      return observationOwners.length === 1 && observationOwners[0] === group;
    }
    for (const key of ["tool_call_id", "call_id"]) {
      if (hasOwn(links, key) && links[key] !== null && links[key] !== undefined &&
          links[key] !== source[group.anchorFrameIndex]?.payload?.call_id) return false;
    }
    const bindings = legacyBindingsFor(frame);
    if (bindings.some((value) => !hasNonblankString(value))) return false;
    const requiresRequestBinding = [
      "tool_confirmed", "tool_denied", "interaction.requested", "interaction.resolved",
    ].includes(frame?.type);
    if (requiresRequestBinding && !bindings.length) return false;
    if (bindings.length > 0 && (!group.binding || !bindings.every((value) => value === group.binding))) return false;
    if (
      (payload.synthetic === true && hasOwn(payload, "feedback_acknowledged") && payload.feedback_acknowledged !== true) ||
      payload.tentative === true ||
      payload.optimistic === true
    ) return false;
    return true;
  };
  legacyGroups.forEach((group) => {
    if (group.invalid || !group.binding || group.callIndexes.length < 2) return;
    const firstCall = Math.min(...group.callIndexes);
    const lastCall = Math.max(...group.callIndexes);
    const anchorCallId = source[group.anchorFrameIndex]?.payload?.call_id;
    const crossedForeignRequest = legacyFrameIndexes.some((frameIndex) => {
      if (frameIndex <= firstCall || frameIndex >= lastCall) return false;
      const candidate = source[frameIndex];
      if (![
        "tool_confirmed", "tool_denied", "interaction.requested", "interaction.resolved",
      ].includes(candidate?.type)) return false;
      const payload = isRecord(candidate?.payload) ? candidate.payload : {};
      if (payload.call_id !== anchorCallId) return false;
      if (!legacyBindingsFor(candidate).includes(group.binding)) return false;
      return !legacyCompatible(group, candidate);
    });
    if (crossedForeignRequest) group.invalid = true;
  });
  const admittedLegacyGroups = [];
  legacyGroups.forEach((group) => {
    if (group.invalid) return;
    const anchor = source[group.anchorFrameIndex];
    const anchorCallId = anchor?.payload?.call_id;
    const sameScopedCallContradiction = legacyFrameIndexes.some((frameIndex) => {
      const candidate = source[frameIndex];
      const payload = isRecord(candidate?.payload) ? candidate.payload : {};
      const sameCall = candidate?.run_id === anchor?.run_id && payload.call_id === anchorCallId;
      const anchorPayload = isRecord(anchor?.payload) ? anchor.payload : {};
      const knownForeignToolkit =
        (hasOwn(anchorPayload, "toolkit_id") && hasOwn(payload, "toolkit_id") &&
          anchorPayload.toolkit_id !== payload.toolkit_id) ||
        (!hasOwn(anchorPayload, "toolkit_id") && !hasOwn(payload, "toolkit_id") &&
          hasOwn(anchorPayload, "toolkit_name") && hasOwn(payload, "toolkit_name") &&
          anchorPayload.toolkit_name !== payload.toolkit_name);
      return sameCall && !knownForeignToolkit && !legacyCompatible(group, candidate);
    });
    if (sameScopedCallContradiction) return;
    // When call ids are reused, a request binding must disambiguate owners.
    const sameCallOwners = legacyGroups.filter((candidate) =>
      source[candidate.anchorFrameIndex]?.run_id === source[group.anchorFrameIndex]?.run_id &&
      source[candidate.anchorFrameIndex]?.payload?.call_id === source[group.anchorFrameIndex]?.payload?.call_id,
    );
    if (sameCallOwners.length > 1 && (!group.binding || sameCallOwners.some((candidate) => !candidate.binding))) return;
    const members = [];
    legacyFrameIndexes.forEach((frameIndex) => {
      const frame = source[frameIndex];
      if (legacyCompatible(group, frame)) members.push(frameIndex);
    });
    // A frame can have only one owner. Any tie is ambiguity, not permission
    // to pick the nearest or the first call in the stream.
    const ambiguous = members.some((frameIndex) =>
      legacyGroups.filter((candidate) => !candidate.invalid && legacyCompatible(candidate, source[frameIndex])).length !== 1,
    );
    if (ambiguous) return;
    group.frameIndexes = members.sort((left, right) => left - right);
    admittedLegacyGroups.push(group);
  });
  const admittedLegacyCallIndexes = new Set(admittedLegacyGroups.flatMap((group) => group.callIndexes));
  legacyCallIndexes.forEach((frameIndex) => {
    if (!admittedLegacyCallIndexes.has(frameIndex)) addUnresolved(frameIndex, "legacy_owner_unresolved");
  });
  admittedLegacyGroups.forEach((group) => {
    const anchor = source[group.anchorFrameIndex];
    const payload = isRecord(anchor?.payload) ? anchor.payload : {};
    const indexes = group.frameIndexes;
    const feedbackFrameIndexes = indexes.filter((index) =>
      ["tool_confirmed", "tool_denied", "interaction.resolved"].includes(source[index]?.type),
    );
    const resultFrameIndexes = indexes.filter((index) => source[index]?.type === "tool_result");
    const interactionFrameIndexes = indexes.filter((index) =>
      ["interaction.requested", "interaction.resolved"].includes(source[index]?.type),
    );
    const observationFrameIndexes = indexes.filter((index) => source[index]?.type === "observation");
    const legacyAcknowledgedIndexes = new Set([
      ...acknowledgedSyntheticFeedbackIndexes,
      ...feedbackFrameIndexes,
    ]);
    const callId = payload.call_id;
    const toolName = payload.tool_name;
    const originalAttemptId = anchor.run_id;
    const key = `legacy:${group.anchorFrameIndex}`;
    calls.push({
      key,
      anchorFrameIndex: group.anchorFrameIndex,
      scope: {
        ...(hasNonblankString(originalAttemptId) ? { runId: originalAttemptId } : {}),
        ...(group.executionId !== undefined ? { executionId: group.executionId } : {}),
        ...(group.sessionId !== undefined ? { sessionId: group.sessionId } : {}),
        ...(group.iteration !== undefined ? { iteration: group.iteration } : {}),
        ...(group.toolkitId !== undefined ? { toolkitId: group.toolkitId } : {}),
        ...(group.toolkitName !== undefined ? { toolkitName: group.toolkitName } : {}),
      },
      identity: {
        status: "legacy",
        callId,
        toolName,
        ...(hasNonblankString(originalAttemptId) ? { originalAttemptId } : {}),
        ...(group.executionId !== undefined ? { executionId: group.executionId } : {}),
        ...(group.sessionId !== undefined ? { sessionId: group.sessionId } : {}),
        ...(group.iteration !== undefined ? { iteration: group.iteration } : {}),
        ...(group.toolkitId !== undefined ? { toolkitId: group.toolkitId } : {}),
        ...(group.toolkitName !== undefined ? { toolkitName: group.toolkitName } : {}),
      },
      policy: group.policy,
      originalArguments: hasOwn(payload, "arguments") && isJsonValue(payload.arguments)
        ? { present: true, value: copyJsonValue(payload.arguments) }
        : { status: "unknown" },
      state: {
        feedback: feedbackStateFor(source, indexes, legacyAcknowledgedIndexes),
        execution: executionStateFor(source, indexes),
      },
      frameIndexes: indexes,
      callFrameIndexes: indexes.filter((index) => source[index]?.type === "tool_call"),
      feedbackFrameIndexes,
      tentativeFeedbackFrameIndexes: [],
      resultFrameIndexes,
      observationFrameIndexes,
      interactionFrameIndexes,
    });
  });

  // When a persisted legacy anchor is later accompanied by a valid v1 owner,
  // enrich that same call if its scope and exact request binding agree. The
  // original anchor index is retained so a reload does not create a second
  // invocation row or lose expansion state.
  const qualifiedCalls = calls.filter((call) => call.identity?.status === "qualified");
  const legacyCalls = calls.filter((call) => call.identity?.status === "legacy");
  const mergedLegacyKeys = new Set();
  legacyCalls.forEach((legacyCall) => {
    const legacyAnchor = source[legacyCall.anchorFrameIndex];
    const legacyPayload = isRecord(legacyAnchor?.payload) ? legacyAnchor.payload : {};
    const legacyBinding = new Set(legacyCall.frameIndexes.flatMap((index) => legacyBindingsFor(source[index])));
    if (legacyBinding.size !== 1) return;
    const binding = [...legacyBinding][0];
    const candidates = qualifiedCalls.filter((qualifiedCall) => {
      const identity = qualifiedCall.identity || {};
      const descriptor = qualifiedCall.descriptor || {};
      if (
        identity.callId !== legacyCall.identity.callId ||
        identity.toolName !== legacyCall.identity.toolName ||
        identity.originalAttemptId !== legacyCall.identity.originalAttemptId
      ) return false;
      if (
        [
          ["executionId", "executionId"],
          ["sessionId", "sessionId"],
          ["iteration", "iteration"],
          ["toolkitId", "toolkitId"],
          ["toolkitName", "toolkitName"],
        ].some(([scopeKey, identityKey]) =>
          hasOwn(legacyCall.scope || {}, scopeKey) &&
          hasOwn(qualifiedCall.scope || {}, scopeKey) &&
          legacyCall.scope[scopeKey] !== qualifiedCall.scope[scopeKey],
        )
      ) return false;
      const qualifiedBindings = new Set(qualifiedCall.frameIndexes.flatMap((index) => legacyBindingsFor(source[index])));
      if (!qualifiedBindings.has(binding)) return false;
      if (
        hasNonblankString(legacyAnchor?.event_id) &&
        legacyAnchor.event_id !== descriptor.intent_cursor?.event_id
      ) return false;
      if (legacyCall.frameIndexes.some((index) =>
        hasOwn(source[index]?.payload || {}, "intent_cursor") &&
        !sameCursor(source[index].payload.intent_cursor, descriptor.intent_cursor),
      )) return false;
      if (
        hasOwn(legacyPayload, "intent_cursor") &&
        !sameCursor(legacyPayload.intent_cursor, descriptor.intent_cursor)
      ) return false;
      const legacyPolicy = legacyCall.policy || { status: "unknown" };
      const qualifiedPolicy = qualifiedCall.policy || { status: "unknown" };
      if (
        legacyPolicy.status !== "unknown" &&
        qualifiedPolicy.status !== "unknown" &&
        (legacyPolicy.status !== qualifiedPolicy.status ||
          (legacyPolicy.status === "present" && legacyPolicy.value !== qualifiedPolicy.value))
      ) return false;
      const legacyArguments = legacyCall.originalArguments || { status: "unknown" };
      const qualifiedArguments = qualifiedCall.originalArguments || { status: "unknown" };
      if (
        legacyArguments.status !== "unknown" &&
        qualifiedArguments.status !== "unknown" &&
        (legacyArguments.present !== qualifiedArguments.present ||
          (legacyArguments.present === true &&
            canonicalJson(legacyArguments.value) !== canonicalJson(qualifiedArguments.value)))
      ) return false;
      const legacyFeedback = legacyCall.state?.feedback || "unknown";
      const qualifiedFeedback = qualifiedCall.state?.feedback || "unknown";
      if (
        ["approved", "denied", "answered", "conflict"].includes(legacyFeedback) &&
        ["approved", "denied", "answered", "conflict"].includes(qualifiedFeedback) &&
        legacyFeedback !== qualifiedFeedback
      ) return false;
      const mergedIndexes = [...new Set([...qualifiedCall.frameIndexes, ...legacyCall.frameIndexes])];
      const legacyIndexes = new Set(legacyCall.frameIndexes);
      const acknowledgedIndexes = new Set([
        ...acknowledgedSyntheticFeedbackIndexes,
        ...mergedIndexes.filter((index) => legacyIndexes.has(index) &&
          (source[index]?.type === "tool_confirmed" || source[index]?.type === "tool_denied")),
      ]);
      if (
        feedbackStateFor(source, mergedIndexes, acknowledgedIndexes) === "conflict" ||
        executionStateFor(source, mergedIndexes) === "conflict"
      ) return false;
      return true;
    });
    if (candidates.length !== 1) return;
    const target = candidates[0];
    const mergedIndexes = [...new Set([...target.frameIndexes, ...legacyCall.frameIndexes])]
      .sort((left, right) => left - right);
    const legacyIndexSet = new Set(legacyCall.frameIndexes);
    target.frameIndexes = mergedIndexes;
    target.anchorFrameIndex = Math.min(target.anchorFrameIndex, legacyCall.anchorFrameIndex);
    target.callFrameIndexes = [...new Set([...target.callFrameIndexes, ...legacyCall.callFrameIndexes])]
      .sort((left, right) => left - right);
    target.feedbackFrameIndexes = mergedIndexes.filter((index) =>
      ["tool_confirmed", "tool_denied", "interaction.resolved"].includes(source[index]?.type),
    );
    target.resultFrameIndexes = mergedIndexes.filter((index) => source[index]?.type === "tool_result");
    target.observationFrameIndexes = mergedIndexes.filter((index) => source[index]?.type === "observation");
    target.interactionFrameIndexes = mergedIndexes.filter((index) =>
      ["interaction.requested", "interaction.resolved"].includes(source[index]?.type),
    );
    const legacyAcknowledged = new Set([
      ...acknowledgedSyntheticFeedbackIndexes,
      ...mergedIndexes.filter((index) => legacyIndexSet.has(index) &&
        (source[index]?.type === "tool_confirmed" || source[index]?.type === "tool_denied")),
    ]);
    target.state = {
      feedback: feedbackStateFor(source, mergedIndexes, legacyAcknowledged),
      execution: executionStateFor(source, mergedIndexes),
    };
    target.tentativeFeedbackFrameIndexes = target.feedbackFrameIndexes.filter((index) =>
      !legacyIndexSet.has(index) &&
      source[index]?.payload?.synthetic === true &&
      !acknowledgedSyntheticFeedbackIndexes.has(index),
    );
    if (target.policy?.status === "unknown" && legacyCall.policy?.status === "present") {
      target.policy = legacyCall.policy;
    }
    if (target.originalArguments?.status === "unknown" && legacyCall.originalArguments?.present === true) {
      target.originalArguments = legacyCall.originalArguments;
    }
    mergedLegacyKeys.add(legacyCall.key);
  });
  if (mergedLegacyKeys.size > 0) {
    for (let index = calls.length - 1; index >= 0; index -= 1) {
      if (mergedLegacyKeys.has(calls[index].key)) calls.splice(index, 1);
    }
  }

  const evidenceOwnership = [];
  const ownershipByFrameIndex = new Map();
  calls.forEach((call) => {
    call.frameIndexes.forEach((frameIndex) => {
      const type = source[frameIndex]?.type;
      const ownership = {
        frameIndex,
        callKey: call.key,
        kind:
          type === "tool_call"
            ? "call"
            : type === "tool_result"
              ? "result"
              : type === "tool_confirmed" || type === "tool_denied" || type === "interaction.resolved"
                ? "feedback"
                : type === "observation"
                  ? "observation"
                  : "interaction",
      };
      evidenceOwnership.push(ownership);
      ownershipByFrameIndex.set(frameIndex, ownership);
    });
  });
  const unresolvedByFrameIndex = new Map(
    unresolved.map((item) => [item.frameIndex, item.reason]),
  );

  return {
    version: "pupu.logical_tool_calls.v1",
    calls,
    displayAnchors: source.map((frame, frameIndex) => ({
      frameIndex,
      kind: isLifecycleEvidence(frame) ? frame.type : "timeline",
      ...(ownershipByFrameIndex.has(frameIndex)
        ? { callKey: ownershipByFrameIndex.get(frameIndex).callKey }
        : {}),
      ...(unresolvedByFrameIndex.has(frameIndex)
        ? { unresolvedReason: unresolvedByFrameIndex.get(frameIndex) }
        : {}),
    })),
    evidenceOwnership: evidenceOwnership.sort(
      (left, right) => left.frameIndex - right.frameIndex,
    ),
    unresolved: unresolved.sort((left, right) => left.frameIndex - right.frameIndex),
    legacyFrameIndexes,
  };
};

export const resolveToolCallOwnerForRequest = (frames, confirmationId, options = {}) => {
  if (!hasNonblankString(confirmationId)) {
    return { status: "unresolved", reason: "invalid_request_binding" };
  }
  const source = Array.isArray(frames) ? frames : [];
  const projection = projectToolCallLifecycle(source, options);
  const requestMatchesFrame = (frame) => {
    const payload = isRecord(frame?.payload) ? frame.payload : {};
    return ["confirmation_id", "interaction_id", "request_id"].some(
      (key) => hasOwn(payload, key) && payload[key] === confirmationId,
    );
  };
  if (
    projection.unresolved.some(({ frameIndex }) =>
      requestMatchesFrame(source[frameIndex]),
    )
  ) {
    return { status: "unresolved", reason: "conflicting_request_evidence" };
  }
  const matches = projection.calls.filter((call) =>
    call.frameIndexes.some((frameIndex) => requestMatchesFrame(source[frameIndex])),
  );
  if (matches.length !== 1) {
    return {
      status: matches.length > 1 ? "ambiguous" : "unresolved",
      reason: matches.length > 1 ? "request_binding_not_unique" : "request_owner_not_found",
    };
  }
  return { status: matches[0].identity?.status || "unresolved", call: matches[0] };
};
