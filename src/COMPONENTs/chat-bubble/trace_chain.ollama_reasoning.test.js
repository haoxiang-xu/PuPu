import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { createRuntimeEventStore } from "../../SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../SERVICEs/runtime_events/activity_tree";
import fixture from "../../SERVICEs/runtime_events/fixtures/ollama_reasoning.json";
import previewFixture from "../../SERVICEs/runtime_events/fixtures/ollama_live_preview.json";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const trace = (frames, status = "streaming") => (
  <ConfigContext.Provider value={{ theme: { color: "#222", font: { fontFamily: "sans-serif" } }, onThemeMode: "light_mode" }}>
    <TraceChain frames={frames} status={status} messageId="assistant" />
  </ConfigContext.Provider>
);

test.each(fixture.cases)("$model: distinct per-token preview IDs still render one live paragraph", ({ events, results }) => {
  const runId = results[0].run_id;
  const store = createRuntimeEventStore();
  const view = render(trace([]));
  let expectedText = "";
  for (const [index, event] of events.entries()) {
    if (event.run_id !== runId) continue;
    const isReasoning = event.type === "step.delta" && event.payload.kind === "reasoning";
    store.appendForReduction(isReasoning ? {
      ...event,
      metadata: {
        ...event.metadata,
        provider: "ollama",
        // Exact Ollama transport assigns a distinct UUID to each preview delta.
        provisional_reasoning_id: index.toString(16).padStart(32, "0"),
      },
    } : event);
    const state = reduceActivityTree(null, store.getReductionSnapshot());
    view.rerender(trace(state.frames));
    if (isReasoning) {
      expectedText += event.payload.delta;
      expect(screen.getAllByText("Reasoning")).toHaveLength(1);
      expect(view.container.textContent).toContain(expectedText);
    }
  }
  expect(expectedText).toBe("Check the sum.");
});

test("reset removes only its preview delta after the displayed paragraph was merged", () => {
  const base = previewFixture.live_events[0];
  const reset = previewFixture.live_events[1];
  const store = createRuntimeEventStore();
  const view = render(trace([]));
  const append = (event) => {
    store.appendForReduction(event);
    const state = reduceActivityTree(null, store.getReductionSnapshot());
    view.rerender(trace(state.frames));
    return state;
  };
  append({ ...base, payload: { ...base.payload, delta: "Keep " } });
  append({
    ...base, event_id: "second-preview", seq: base.seq + 1,
    payload: { ...base.payload, delta: "discard" },
    metadata: { ...base.metadata, provisional_reasoning_id: "b".repeat(32) },
  });
  expect(screen.getAllByText("Reasoning")).toHaveLength(1);
  expect(view.container.textContent).toContain("Keep discard");
  const state = append({
    ...reset, event_id: "reset-second-preview", seq: base.seq + 2,
    payload: { ...reset.payload, preview_id: "b".repeat(32) },
  });
  expect(screen.getAllByText("Reasoning")).toHaveLength(1);
  expect(view.container.textContent).toContain("Keep");
  expect(view.container.textContent).not.toContain("discard");
  expect(state.frames.filter((frame) => frame.type === "reasoning")).toHaveLength(1);
});

test("adjacent previews stay separate across runs and turns without mutating source frames", () => {
  const frames = [
    ["run-a", 1, "first ", "a"],
    ["run-a", 1, "thought", "b"],
    ["run-a", 2, "second ", "c"],
    ["run-a", 2, "thought", "d"],
    ["run-b", 2, "other ", "e"],
    ["run-b", 2, "run", "f"],
  ].map(([runId, iteration, reasoning, id], seq) => Object.freeze({
    type: "reasoning", seq, ts: seq * 100, run_id: runId, iteration,
    payload: Object.freeze({ reasoning, provisional_reasoning_id: id.repeat(32) }),
  }));
  Object.freeze(frames);
  render(trace(frames));
  expect(screen.getAllByText("Reasoning")).toHaveLength(3);
  expect(screen.getByText("first thought")).toBeInTheDocument();
  expect(screen.getByText("second thought")).toBeInTheDocument();
  expect(screen.getByText("other run")).toBeInTheDocument();
  expect(frames.map((frame) => frame.payload.reasoning)).toEqual([
    "first ", "thought", "second ", "thought", "other ", "run",
  ]);
});

test.each(fixture.cases)("$model: canonical reasoning deltas render as one paragraph", ({ events, results }) => {
  const store = createRuntimeEventStore();
  store.appendMany(events);
  const state = reduceActivityTree(null, store.getSnapshot());
  const runId = results[0].run_id;
  const frames = [...state.frames, ...(state.framesByRunId[runId] || [])]
    .filter((frame) => frame.run_id === runId);
  const { container } = render(trace(frames, "done"));
  expect(screen.getAllByText("Reasoning")).toHaveLength(1);
  expect(container.textContent).toContain("Check the sum.");
});
