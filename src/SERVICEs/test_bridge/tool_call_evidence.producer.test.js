import fixture from "./fixtures/tool_events_ticket370.json";
import { createRuntimeEventStore } from "../runtime_events/event_store";
import { reduceActivityTree } from "../runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../runtime_events/trace_chain_adapter";
import { projectTestApiToolCalls } from "./tool_call_evidence";

test("projects installed Unchain producer output into exact Test API evidence", () => {
  const store = createRuntimeEventStore();
  store.appendMany(fixture.events);
  const trace = adaptActivityTreeToTraceChain(reduceActivityTree(null, store.getSnapshot()));
  const message = JSON.parse(JSON.stringify({
    role: "assistant", traceFrames: trace.frames, subagentFrames: trace.subagentFrames,
  }));
  expect(projectTestApiToolCalls(message)).toEqual([
    {
      id: "c1", run_id: "root", name: "create_plan", arguments: { title: "fixture" },
      status: "completed", result: { plan_id: "plan-fixture" },
    },
    {
      id: "c2", run_id: "root", name: "read_file", arguments: { path: "absent" },
      status: "failed", result: { error: "missing file", tool: "read_file" },
    },
  ]);
});
