import fixture from "./fixtures/ollama_live_preview.json";
import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree } from "./activity_tree";

const framesForRun = (state, runId) =>
  [...state.frames, ...(state.framesByRunId[runId] || [])]
    .filter((frame) => frame.run_id === runId);

const reasoningForRun = (state, runId) =>
  framesForRun(state, runId)
    .filter((frame) => frame.type === "reasoning")
    .map((frame) => frame.payload.reasoning)
    .join("");

describe("installed Unchain wheel → PuPu live Ollama preview contract", () => {
  test("fixture binds one installed wheel and a committed source candidate", () => {
    expect(fixture.qualification).toBe(
      "deterministic installed-wheel candidate; no model inference",
    );
    expect(fixture.source_dirty).toBe(false);
    expect(fixture.wheel_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fixture.runtime_manifest_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("failed preview resets; accepted previews stay live; cold replay uses committed raw events", () => {
    expect(fixture.host_raw.map((event) => event.type)).toEqual([
      "reasoning", "reasoning_preview_discarded", "reasoning", "token_delta",
      "reasoning", "token_delta",
    ]);
    expect(fixture.durable_raw.map((event) => event.type)).toEqual([
      "reasoning", "token_delta", "reasoning", "token_delta",
    ]);
    expect(fixture.durable_raw.every((event) =>
      !Object.hasOwn(event, "provisional_reasoning_id"))).toBe(true);
    expect(fixture.durable_raw.every((event) =>
      event.delta !== "discard this")).toBe(true);

    const liveStore = createRuntimeEventStore();
    let liveState;
    fixture.live_events.forEach((event, index) => {
      expect(Object.keys(event).sort()).toEqual([
        "schema_version", "event_id", "type", "timestamp", "session_id",
        "run_id", "agent_id", "turn_id", "seq", "links", "surface",
        "visibility", "payload", "metadata",
      ].sort());
      expect(event.schema_version).toBe("v4");
      expect(event.type).toBe("step.delta");
      liveStore.appendForReduction(event);
      liveState = reduceActivityTree(null, liveStore.getReductionSnapshot());
      if (index === 0) {
        expect(reasoningForRun(liveState, "ticket-274-run-1")).toBe("discard this");
      }
      if (index === 1) {
        expect(event.payload).toEqual({
          step_id: "model:ticket-274-run-1:turn-1:response",
          step_type: "model_response",
          kind: "reasoning_reset",
          preview_id: "a".repeat(32),
        });
        expect(reasoningForRun(liveState, "ticket-274-run-1")).toBe("");
      }
    });
    expect(reasoningForRun(liveState, "ticket-274-run-1")).toBe("accepted plan");
    expect(reasoningForRun(liveState, "ticket-274-run-2")).toBe("second plan");
    expect(liveState.modelTextByRunId["ticket-274-run-1"]).toBe("first");
    expect(liveState.modelTextByRunId["ticket-274-run-2"]).toBe("second");

    const coldStore = createRuntimeEventStore();
    coldStore.appendMany(JSON.parse(JSON.stringify(fixture.cold_events)));
    const coldState = reduceActivityTree(null, coldStore.getSnapshot());
    for (const runId of ["ticket-274-run-1", "ticket-274-run-2"]) {
      expect(reasoningForRun(coldState, runId)).toBe(reasoningForRun(liveState, runId));
      expect(coldState.modelTextByRunId[runId]).toBe(liveState.modelTextByRunId[runId]);
    }
    expect(fixture.cold_events.every((event) =>
      !Object.hasOwn(event.metadata, "provisional_reasoning_id"))).toBe(true);
  });

  test("wrong protocol version cannot project a preview", () => {
    const store = createRuntimeEventStore();
    store.appendMany([{ ...fixture.live_events[0], schema_version: "v3" }]);
    expect(store.getSnapshot().orderedEventIds).toEqual([]);
    expect(reasoningForRun(reduceActivityTree(null, store.getSnapshot()),
      "ticket-274-run-1")).toBe("");
  });
});
