export const RUNTIME_EVENT_TYPES = new Set([
  "session.started",
  "run.started",
  "run.completed",
  "run.failed",
  "turn.started",
  "turn.completed",
  "step.started",
  "step.delta",
  "step.completed",
  "interaction.requested",
  "interaction.resolved",
  "interaction.fyi_injected",
  "artifact.created",
  "artifact.updated",
]);

export const MAX_RUNTIME_EVENT_DIAGNOSTICS = 100;

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const clone = (value) => {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
};

const createDiagnostics = () => ({
  unknownEvents: [],
  droppedEvents: [],
  duplicateEvents: [],
});

const appendDiagnostic = (bucket, value) => {
  if (!Array.isArray(bucket)) return;
  bucket.push(value);
  if (bucket.length > MAX_RUNTIME_EVENT_DIAGNOSTICS) {
    bucket.splice(0, bucket.length - MAX_RUNTIME_EVENT_DIAGNOSTICS);
  }
};

export const createInitialRuntimeEventStoreState = () => ({
  eventsById: {},
  orderedEventIds: [],
  diagnostics: createDiagnostics(),
});

const snapshotState = (state) => ({
  eventsById: clone(state.eventsById) || {},
  orderedEventIds: [...state.orderedEventIds],
  diagnostics: clone(state.diagnostics) || createDiagnostics(),
});

const normalizeSurface = (surface) =>
  isObject(surface)
    ? surface
    : { slot: "trace_inline", scope: "turn", group: "" };

const normalizeRuntimeEvent = (event) => {
  if (!isObject(event)) {
    return null;
  }
  if (event.schema_version !== "v4") {
    return null;
  }
  if (typeof event.event_id !== "string" || !event.event_id.trim()) {
    return null;
  }
  if (typeof event.type !== "string" || !event.type.trim()) {
    return null;
  }
  return {
    ...event,
    event_id: event.event_id.trim(),
    type: event.type.trim(),
    links: isObject(event.links) ? event.links : {},
    surface: normalizeSurface(event.surface),
    payload: isObject(event.payload) ? event.payload : {},
    metadata: isObject(event.metadata) ? event.metadata : {},
  };
};

export const isRuntimeEvent = (event) => Boolean(normalizeRuntimeEvent(event));

const numericOrderValue = (event) => {
  const candidates = [
    event?.seq,
    event?.sequence,
    event?.payload?.seq,
    event?.payload?.sequence,
    event?.metadata?.seq,
    event?.metadata?.sequence,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      const value = Number(candidate);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
};

const sortOrderedEventIds = (state) => {
  const originalIndexById = new Map(
    state.orderedEventIds.map((eventId, index) => [eventId, index]),
  );

  state.orderedEventIds.sort((leftId, rightId) => {
    const left = state.eventsById[leftId];
    const right = state.eventsById[rightId];
    const leftOrder = numericOrderValue(left);
    const rightOrder = numericOrderValue(right);
    if (leftOrder !== null || rightOrder !== null) {
      if (leftOrder === null) return 1;
      if (rightOrder === null) return -1;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    return (
      (originalIndexById.get(leftId) ?? 0) -
      (originalIndexById.get(rightId) ?? 0)
    );
  });
};

const compareEventIds = (state, arrivalIndexById, leftId, rightId) => {
  const left = state.eventsById[leftId];
  const right = state.eventsById[rightId];
  const leftOrder = numericOrderValue(left);
  const rightOrder = numericOrderValue(right);
  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  return (
    (arrivalIndexById.get(leftId) ?? 0) -
    (arrivalIndexById.get(rightId) ?? 0)
  );
};

// Streams are normally already ordered. Keep that O(1) path and only binary
// insert when an out-of-order event arrives; the old implementation sorted the
// complete history after every batch.
const placeLastEventId = (state, arrivalIndexById) => {
  const ids = state.orderedEventIds;
  if (ids.length < 2) return false;
  const eventId = ids[ids.length - 1];
  const previousId = ids[ids.length - 2];
  if (compareEventIds(state, arrivalIndexById, previousId, eventId) <= 0) {
    return false;
  }

  ids.pop();
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareEventIds(state, arrivalIndexById, ids[middle], eventId) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  ids.splice(low, 0, eventId);
  return true;
};

const appendRuntimeEventToSnapshot = (next, event) => {
  const normalized = normalizeRuntimeEvent(event);
  if (!normalized) {
    appendDiagnostic(next.diagnostics.droppedEvents, {
      reason: "invalid_runtime_event_v4",
      event: clone(event),
    });
    return null;
  }

  if (!RUNTIME_EVENT_TYPES.has(normalized.type)) {
    appendDiagnostic(next.diagnostics.unknownEvents, clone(normalized));
    return null;
  }

  if (next.eventsById[normalized.event_id]) {
    appendDiagnostic(next.diagnostics.duplicateEvents, {
      event_id: normalized.event_id,
      type: normalized.type,
    });
    return null;
  }

  next.eventsById[normalized.event_id] = clone(normalized);
  next.orderedEventIds.push(normalized.event_id);
  return normalized;
};

export const appendRuntimeEventToStoreState = (state, event) => {
  const next = snapshotState(state || createInitialRuntimeEventStoreState());
  if (appendRuntimeEventToSnapshot(next, event)) {
    sortOrderedEventIds(next);
  }
  return next;
};

export const createRuntimeEventStore = () => {
  let state = createInitialRuntimeEventStoreState();
  let nextArrivalIndex = 0;
  let revision = 0;
  let orderRevision = 0;
  let generation = 0;
  let sealedLength = 0;
  const storeIdentity = {};
  const arrivalIndexById = new Map();

  const appendToMutableState = (event, protectSealedOrder = false) => {
    revision += 1;
    const normalized = appendRuntimeEventToSnapshot(state, event);
    if (!normalized) return false;
    arrivalIndexById.set(normalized.event_id, nextArrivalIndex);
    nextArrivalIndex += 1;

    // Once a reduction snapshot has been dispatched, inserting before its
    // prefix cannot repair already-emitted token/frame side effects. The wire
    // protocol guarantees ordered seq values, so diagnose and drop a late
    // cross-flush event instead of producing a tree/UI ordering split.
    const sealedTailId =
      protectSealedOrder && sealedLength > 0
        ? state.orderedEventIds[sealedLength - 1]
        : "";
    if (
      sealedTailId &&
      compareEventIds(
        state,
        arrivalIndexById,
        sealedTailId,
        normalized.event_id,
      ) > 0
    ) {
      state.orderedEventIds.pop();
      delete state.eventsById[normalized.event_id];
      arrivalIndexById.delete(normalized.event_id);
      appendDiagnostic(state.diagnostics.droppedEvents, {
        reason: "out_of_order_after_dispatch",
        event: clone(normalized),
      });
      return false;
    }
    if (placeLastEventId(state, arrivalIndexById)) {
      orderRevision += 1;
    }
    return true;
  };

  // The stream reducer consumes snapshots synchronously and treats them as
  // read-only. Returning a lightweight view avoids cloning the entire event
  // history several times per 64ms flush.
  const getReductionSnapshot = () => {
    sealedLength = state.orderedEventIds.length;
    const snapshot = {
      eventsById: state.eventsById,
      orderedEventIds: state.orderedEventIds,
      diagnostics: state.diagnostics,
    };
    Object.defineProperties(snapshot, {
      __runtimeEventStoreRevision: { value: revision },
      __runtimeEventOrderRevision: { value: orderRevision },
      __runtimeEventStoreGeneration: { value: generation },
      __runtimeEventStoreIdentity: { value: storeIdentity },
    });
    return Object.freeze(snapshot);
  };

  return {
    append(event) {
      appendToMutableState(event);
      return snapshotState(state);
    },
    appendMany(events = []) {
      const source = Array.isArray(events) ? events : [];
      source.forEach(appendToMutableState);
      return snapshotState(state);
    },
    appendForReduction(event) {
      appendToMutableState(event, true);
    },
    appendManyForReduction(events = []) {
      const source = Array.isArray(events) ? events : [];
      source.forEach((event) => appendToMutableState(event, true));
    },
    clear() {
      state = createInitialRuntimeEventStoreState();
      arrivalIndexById.clear();
      nextArrivalIndex = 0;
      sealedLength = 0;
      revision += 1;
      orderRevision += 1;
      generation += 1;
      return snapshotState(state);
    },
    getSnapshot() {
      return snapshotState(state);
    },
    getReductionSnapshot() {
      return getReductionSnapshot();
    },
    get state() {
      return snapshotState(state);
    },
  };
};
