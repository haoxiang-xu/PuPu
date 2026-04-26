import {
  createRuntimeEventStore,
  isRuntimeEvent,
} from "./event_store";

const event = ({
  id = "evt-1",
  type = "run.started",
  timestamp = "2026-04-25T12:00:00.000Z",
  payload = {},
  metadata = {},
}) => ({
  schema_version: "v3",
  event_id: id,
  type,
  timestamp,
  session_id: "thread-1",
  run_id: "run-root",
  agent_id: "developer",
  turn_id: "run-root:turn-1",
  links: {},
  visibility: "user",
  payload,
  metadata,
});

describe("runtime event store", () => {
  test("stores valid events by id and returns immutable snapshots", () => {
    const store = createRuntimeEventStore();
    const snapshot = store.append(event({ id: "evt-run" }));

    expect(snapshot.orderedEventIds).toEqual(["evt-run"]);
    expect(snapshot.eventsById["evt-run"]).toMatchObject({
      event_id: "evt-run",
      type: "run.started",
      payload: {},
      links: {},
    });

    snapshot.orderedEventIds.push("mutated");
    expect(store.getSnapshot().orderedEventIds).toEqual(["evt-run"]);
  });

  test("deduplicates duplicate event_id values", () => {
    const store = createRuntimeEventStore();
    store.append(event({ id: "evt-dup", type: "run.started" }));
    const snapshot = store.append(event({ id: "evt-dup", type: "run.completed" }));

    expect(snapshot.orderedEventIds).toEqual(["evt-dup"]);
    expect(snapshot.eventsById["evt-dup"].type).toBe("run.started");
    expect(snapshot.diagnostics.duplicateEvents).toEqual([
      { event_id: "evt-dup", type: "run.completed" },
    ]);
  });

  test("records unknown and invalid events in diagnostics without throwing", () => {
    const store = createRuntimeEventStore();
    store.append(event({ id: "evt-unknown", type: "team.started" }));
    store.append({ schema_version: "v3", event_id: "", type: "run.started" });

    const snapshot = store.getSnapshot();
    expect(snapshot.orderedEventIds).toEqual([]);
    expect(snapshot.diagnostics.unknownEvents).toHaveLength(1);
    expect(snapshot.diagnostics.unknownEvents[0]).toMatchObject({
      event_id: "evt-unknown",
      type: "team.started",
    });
    expect(snapshot.diagnostics.droppedEvents).toHaveLength(1);
    expect(snapshot.diagnostics.droppedEvents[0].reason).toBe(
      "invalid_runtime_event",
    );
  });

  test("orders events by explicit sequence and otherwise preserves append order", () => {
    const store = createRuntimeEventStore();
    store.appendMany([
      event({
        id: "evt-first",
        timestamp: "2026-04-25T12:00:02.000Z",
      }),
      event({
        id: "evt-second",
        timestamp: "2026-04-25T12:00:01.000Z",
      }),
      event({
        id: "evt-seq-2",
        timestamp: "2026-04-25T12:00:03.000Z",
        metadata: { seq: 2 },
      }),
      event({
        id: "evt-seq-1",
        timestamp: "2026-04-25T12:00:04.000Z",
        metadata: { seq: 1 },
      }),
    ]);

    expect(store.getSnapshot().orderedEventIds).toEqual([
      "evt-seq-1",
      "evt-seq-2",
      "evt-first",
      "evt-second",
    ]);
  });

  test("recognizes structurally valid runtime events", () => {
    expect(isRuntimeEvent(event({ id: "evt-ok" }))).toBe(true);
    expect(isRuntimeEvent({ event_id: "evt-no-schema", type: "run.started" })).toBe(
      false,
    );
  });
});
