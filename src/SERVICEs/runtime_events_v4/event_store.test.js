import {
  RUNTIME_EVENT_TYPES_V4,
  createRuntimeEventStoreV4,
  isRuntimeEventV4,
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

describe("runtime event v4 store", () => {
  test("stores valid v4 events and orders by seq", () => {
    const store = createRuntimeEventStoreV4();

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

  test("drops non-v4, unknown, and duplicate events into diagnostics", () => {
    const store = createRuntimeEventStoreV4();
    store.append({ ...event({ id: "evt-v3" }), schema_version: "v3" });
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
    expect(RUNTIME_EVENT_TYPES_V4.has("artifact.created")).toBe(true);
    expect(RUNTIME_EVENT_TYPES_V4.has("interaction.requested")).toBe(true);
    expect(isRuntimeEventV4(event({ type: "artifact.created" }))).toBe(true);
    expect(isRuntimeEventV4({ ...event(), schema_version: "v3" })).toBe(false);
  });
});
