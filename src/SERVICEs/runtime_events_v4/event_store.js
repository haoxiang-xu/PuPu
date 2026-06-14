export const RUNTIME_EVENT_TYPES_V4 = new Set([
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
  "artifact.created",
  "artifact.updated",
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

export const createInitialRuntimeEventStoreStateV4 = () => ({
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

export const isRuntimeEventV4 = (event) => Boolean(normalizeRuntimeEvent(event));

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

const appendRuntimeEventToSnapshot = (next, event) => {
  const normalized = normalizeRuntimeEvent(event);
  if (!normalized) {
    next.diagnostics.droppedEvents.push({
      reason: "invalid_runtime_event_v4",
      event: clone(event),
    });
    return false;
  }

  if (!RUNTIME_EVENT_TYPES_V4.has(normalized.type)) {
    next.diagnostics.unknownEvents.push(clone(normalized));
    return false;
  }

  if (next.eventsById[normalized.event_id]) {
    next.diagnostics.duplicateEvents.push({
      event_id: normalized.event_id,
      type: normalized.type,
    });
    return false;
  }

  next.eventsById[normalized.event_id] = clone(normalized);
  next.orderedEventIds.push(normalized.event_id);
  return true;
};

export const appendRuntimeEventToStoreStateV4 = (state, event) => {
  const next = snapshotState(state || createInitialRuntimeEventStoreStateV4());
  if (appendRuntimeEventToSnapshot(next, event)) {
    sortOrderedEventIds(next);
  }
  return next;
};

export const createRuntimeEventStoreV4 = () => {
  let state = createInitialRuntimeEventStoreStateV4();

  return {
    append(event) {
      state = appendRuntimeEventToStoreStateV4(state, event);
      return snapshotState(state);
    },
    appendMany(events = []) {
      const source = Array.isArray(events) ? events : [];
      const next = snapshotState(state);
      const didAppend = source.reduce((appended, event) => {
        return appendRuntimeEventToSnapshot(next, event) || appended;
      }, false);
      if (didAppend) {
        sortOrderedEventIds(next);
      }
      state = next;
      return snapshotState(state);
    },
    clear() {
      state = createInitialRuntimeEventStoreStateV4();
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
