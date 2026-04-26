export const RUNTIME_EVENT_TYPES = new Set([
  "session.started",
  "run.started",
  "run.completed",
  "run.failed",
  "turn.started",
  "turn.completed",
  "model.started",
  "model.delta",
  "model.completed",
  "tool.started",
  "tool.delta",
  "tool.completed",
  "input.requested",
  "input.resolved",
]);

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

const normalizeRuntimeEvent = (event) => {
  if (!isObject(event)) {
    return null;
  }
  if (event.schema_version !== "v3") {
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
    payload: isObject(event.payload) ? event.payload : {},
    metadata: isObject(event.metadata) ? event.metadata : {},
  };
};

export const isRuntimeEvent = (event) => Boolean(normalizeRuntimeEvent(event));

const numericOrderValue = (event) => {
  const candidates = [
    event?.sequence,
    event?.seq,
    event?.payload?.sequence,
    event?.payload?.seq,
    event?.metadata?.sequence,
    event?.metadata?.seq,
  ];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value === undefined ? null : Number(value);
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
      if (leftOrder === null) {
        return 1;
      }
      if (rightOrder === null) {
        return -1;
      }
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    }

    return (
      (originalIndexById.get(leftId) ?? 0) - (originalIndexById.get(rightId) ?? 0)
    );
  });
};

export const appendRuntimeEventToStoreState = (state, event) => {
  const next = snapshotState(state || createInitialRuntimeEventStoreState());
  const normalized = normalizeRuntimeEvent(event);
  if (!normalized) {
    next.diagnostics.droppedEvents.push({
      reason: "invalid_runtime_event",
      event: clone(event),
    });
    return next;
  }

  if (!RUNTIME_EVENT_TYPES.has(normalized.type)) {
    next.diagnostics.unknownEvents.push(clone(normalized));
    return next;
  }

  if (next.eventsById[normalized.event_id]) {
    next.diagnostics.duplicateEvents.push({
      event_id: normalized.event_id,
      type: normalized.type,
    });
    return next;
  }

  next.eventsById[normalized.event_id] = clone(normalized);
  next.orderedEventIds.push(normalized.event_id);
  sortOrderedEventIds(next);
  return next;
};

export const createRuntimeEventStore = () => {
  let state = createInitialRuntimeEventStoreState();

  return {
    append(event) {
      state = appendRuntimeEventToStoreState(state, event);
      return snapshotState(state);
    },
    appendMany(events = []) {
      const source = Array.isArray(events) ? events : [];
      source.forEach((event) => {
        state = appendRuntimeEventToStoreState(state, event);
      });
      return snapshotState(state);
    },
    clear() {
      state = createInitialRuntimeEventStoreState();
      return snapshotState(state);
    },
    getSnapshot() {
      return snapshotState(state);
    },
    get state() {
      return snapshotState(state);
    },
  };
};
