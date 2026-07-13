import {
  MAX_RUNTIME_EVENT_DIAGNOSTICS,
  RUNTIME_EVENT_TYPES,
  createRuntimeEventStore,
  isRuntimeEvent,
} from "./event_store";

const event = ({
  id = "evt-1",
  type = "run.started",
  seq = 1,
  surface = { slot: "trace_inline", scope: "turn" },
  payload = {},
  metadata = {},
} = {}) => ({
  schema_version: "v4",
  event_id: id,
  type,
  timestamp: "2026-05-26T12:00:00.000Z",
  session_id: "thread-1",
  run_id: "run-root",
  agent_id: "developer",
  turn_id: "run-root:turn-1",
  seq,
  links: {},
  surface,
  visibility: "user",
  payload,
  metadata,
});

describe("runtime event store", () => {
  test("stores valid events and orders by seq", () => {
    const store = createRuntimeEventStore();

    store.appendMany([
      event({ id: "evt-2", seq: 2 }),
      event({ id: "evt-1", seq: 1 }),
    ]);

    expect(store.getSnapshot().orderedEventIds).toEqual(["evt-1", "evt-2"]);
    expect(store.getSnapshot().eventsById["evt-1"]).toMatchObject({
      schema_version: "v4",
      event_id: "evt-1",
      type: "run.started",
      payload: {},
      links: {},
      surface: { slot: "trace_inline", scope: "turn" },
    });
  });

  test("drops non-current-schema, unknown, and duplicate events into diagnostics", () => {
    const store = createRuntimeEventStore();
    store.append({ ...event({ id: "evt-old-schema" }), schema_version: "legacy" });
    store.append(event({ id: "evt-unknown", type: "model.started" }));
    store.append(event({ id: "evt-dup", type: "run.started" }));
    store.append(event({ id: "evt-dup", type: "run.completed" }));

    const snapshot = store.getSnapshot();
    expect(snapshot.orderedEventIds).toEqual(["evt-dup"]);
    expect(snapshot.diagnostics.droppedEvents).toHaveLength(1);
    expect(snapshot.diagnostics.unknownEvents).toHaveLength(1);
    expect(snapshot.diagnostics.duplicateEvents).toEqual([
      { event_id: "evt-dup", type: "run.completed" },
    ]);
  });

  test("recognizes v4 artifact and interaction event types", () => {
    expect(RUNTIME_EVENT_TYPES.has("artifact.created")).toBe(true);
    expect(RUNTIME_EVENT_TYPES.has("interaction.requested")).toBe(true);
    expect(isRuntimeEvent(event({ type: "artifact.created" }))).toBe(true);
    expect(isRuntimeEvent({ ...event(), schema_version: "legacy" })).toBe(false);
  });

  test("public snapshots stay immutable while the reduction view advances", () => {
    const store = createRuntimeEventStore();
    store.append(event({ id: "evt-1", seq: 1 }));
    const snapshot = store.getSnapshot();

    store.append(event({ id: "evt-2", seq: 2 }));

    expect(snapshot.orderedEventIds).toEqual(["evt-1"]);
    expect(store.getReductionSnapshot().orderedEventIds).toEqual([
      "evt-1",
      "evt-2",
    ]);
  });

  test("reduction mode diagnoses a cross-flush late event instead of reordering dispatched history", () => {
    const store = createRuntimeEventStore();
    store.appendForReduction(event({ id: "evt-2", seq: 2 }));
    store.getReductionSnapshot(); // seals the dispatched prefix

    store.appendForReduction(event({ id: "evt-1", seq: 1 }));
    const snapshot = store.getReductionSnapshot();

    expect(snapshot.orderedEventIds).toEqual(["evt-2"]);
    expect(snapshot.diagnostics.droppedEvents).toEqual([
      expect.objectContaining({ reason: "out_of_order_after_dispatch" }),
    ]);
  });

  test("reduction mode sorts out-of-order events inside one undispatched batch", () => {
    const store = createRuntimeEventStore();
    store.appendManyForReduction([
      event({ id: "evt-3", seq: 3 }),
      event({ id: "evt-1", seq: 1 }),
      event({ id: "evt-2", seq: 2 }),
    ]);

    expect(store.getReductionSnapshot().orderedEventIds).toEqual([
      "evt-1",
      "evt-2",
      "evt-3",
    ]);
  });

  test("caps each diagnostic bucket", () => {
    const store = createRuntimeEventStore();
    for (let index = 0; index < MAX_RUNTIME_EVENT_DIAGNOSTICS + 20; index += 1) {
      store.append({ schema_version: "legacy", event_id: `bad-${index}` });
    }

    const dropped = store.getSnapshot().diagnostics.droppedEvents;
    expect(dropped).toHaveLength(MAX_RUNTIME_EVENT_DIAGNOSTICS);
    expect(dropped[0].event.event_id).toBe("bad-20");
  });
});
