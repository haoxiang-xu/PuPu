import fixture from "./fixtures/ollama_reasoning.json";
import { createRuntimeEventStore } from "./event_store";
import {
  createIncrementalActivityTreeProjector,
  reduceActivityTree,
} from "./activity_tree";

const reasoningText = (state, runId) =>
  // A combined journal keeps later runs in their own trace buckets.
  [...state.frames, ...(state.framesByRunId[runId] || [])]
    .filter((frame) => frame.run_id === runId && frame.type === "reasoning")
    .map((frame) => frame.payload.reasoning)
    .join("");

describe("Ollama provider → canonical v4 → PuPu reasoning contract", () => {
  test("fixture declares immutable producer provenance and its inference limitation", () => {
    expect(fixture.wheel_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fixture.runtime_manifest_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fixture.unchain_revision).toMatch(/^[a-f0-9]{40}$/);
    expect(fixture.qualification).toBe("deterministic transport only; no model inference");
  });

  test.each(fixture.cases)("$model: reasoning arrives before answer and survives replay", ({ events, results }) => {
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    const observedReasoning = {};
    let state;
    for (const event of events) {
      // An independent exact key comparison catches accidental producer schema drift.
      expect(Object.keys(event).sort()).toEqual([
        "schema_version", "event_id", "type", "timestamp", "session_id",
        "run_id", "agent_id", "turn_id", "seq", "links", "surface",
        "visibility", "payload", "metadata",
      ].sort());
      if (event.type === "step.delta" && event.payload.kind === "reasoning") {
        expect(event.payload).toEqual({
          step_id: `model:${event.run_id}:turn-1:response`,
          step_type: "model_response", kind: "reasoning",
          delta: event.payload.delta,
        });
        expect(event.links.step_id).toBe(event.payload.step_id);
        expect(event.turn_id).toBe(`${event.run_id}:turn-1`);
        observedReasoning[event.run_id] =
          (observedReasoning[event.run_id] || "") + event.payload.delta;
      }
      store.appendForReduction(event);
      state = projector.reduce(store.getReductionSnapshot());
      expect(reasoningText(state, event.run_id)).toBe(observedReasoning[event.run_id] || "");
      if (event.payload.kind === "reasoning") {
        // Both thinking chunks precede the first answer token, including a mixed chunk.
        expect(state.modelTextByRunId[event.run_id] || "").toBe("");
      }
    }
    for (const result of results) {
      expect(reasoningText(state, result.run_id)).toBe("Check the sum.");
      expect(state.modelTextByRunId[result.run_id]).toBe("10");
      expect(result.final_text).toBe("10");
      expect(result.reasoning_items).toEqual([{ type: "thinking", text: "Check the sum." }]);
      expect(result.raw_deltas.filter((raw) => raw.type === "reasoning")).toEqual([
        { type: "reasoning", run_id: result.run_id, iteration: 1, provider: "ollama", delta: "Check " },
        { type: "reasoning", run_id: result.run_id, iteration: 1, provider: "ollama", delta: "the sum." },
      ]);
    }
    const replay = createRuntimeEventStore();
    replay.appendMany(JSON.parse(JSON.stringify(events)));
    const restored = reduceActivityTree(null, replay.getSnapshot());
    expect(restored.frames).toEqual(state.frames);
    expect(restored.framesByRunId).toEqual(state.framesByRunId);
    expect(restored.modelTextByRunId).toEqual(state.modelTextByRunId);
    // Reattaching the same journal must not duplicate the reasoning.
    replay.appendMany(events);
    expect(reduceActivityTree(null, replay.getSnapshot()).frames).toEqual(restored.frames);
    expect(replay.getSnapshot().diagnostics.duplicateEvents).toHaveLength(events.length);
  });

  test("rejects wrong protocol versions, unknown event types and missing event identities", () => {
    const valid = fixture.cases[0].events.find((event) => event.payload.kind === "reasoning");
    const store = createRuntimeEventStore();
    store.appendMany([
      { ...valid, schema_version: "v3" },
      { ...valid, type: "model.mystery" },
      { ...valid, event_id: "" },
    ]);
    const snapshot = store.getSnapshot();
    expect(snapshot.orderedEventIds).toEqual([]);
    expect(snapshot.diagnostics.droppedEvents).toHaveLength(2);
    expect(snapshot.diagnostics.unknownEvents).toHaveLength(1);
    expect(reduceActivityTree(null, snapshot).frames).toEqual([]);
  });
});
