import TRACE_CHAIN_SCENARIOS from "./trace_chain_scenarios";
import { createRuntimeEventStore } from "../../../SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../../SERVICEs/runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../../../SERVICEs/runtime_events/trace_chain_adapter";

describe("TraceChain UI testing scenarios", () => {
  test("includes a Runtime Events v3 scenario replayed through the service adapter", () => {
    const scenario = TRACE_CHAIN_SCENARIOS.find(
      (item) => item.name === "Runtime Events v3",
    );

    expect(scenario).toBeTruthy();
    expect(scenario.frames).toBeUndefined();
    expect(scenario.events.map((event) => event.type)).toEqual([
      "session.started",
      "run.started",
      "model.delta",
      "tool.started",
      "tool.completed",
      "model.completed",
      "run.completed",
    ]);

    const store = createRuntimeEventStore();
    store.appendMany(scenario.events);
    const traceProps = adaptActivityTreeToTraceChain(
      reduceActivityTree(null, store.getSnapshot()),
    );

    expect(traceProps.frames.map((frame) => frame.type)).toEqual([
      "stream_started",
      "run_started",
      "reasoning",
      "tool_call",
      "tool_result",
      "final_message",
      "done",
    ]);
  });
});
