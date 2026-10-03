import { createRuntimeEventStore } from "../runtime_events/event_store";
import { reduceActivityTree } from "../runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../runtime_events/trace_chain_adapter";
import { projectTestApiMessage, projectTestApiToolCalls } from "./tool_call_evidence";

const event = (id, seq, runId, type, payload, extraLinks = {}) => ({
  schema_version: "v4",
  event_id: id,
  seq,
  type,
  timestamp: "2026-09-29T12:00:00.000Z",
  session_id: "session-1",
  run_id: runId,
  agent_id: "developer",
  turn_id: `${runId}:turn-1`,
  links: { ...(payload.call_id ? { tool_call_id: payload.call_id } : {}), ...extraLinks },
  surface: { slot: "trace_inline", scope: "turn", group: "trace" },
  visibility: "user",
  payload: type.startsWith("step.")
    ? { step_type: "tool", step_id: `tool:${payload.call_id}`, ...payload }
    : payload,
  metadata: {},
});

const record = (id, run_id, name, args, status, result) => ({
  id, run_id, name, arguments: args, status, result,
});

test("projects actual V4 tool producer frames with distinct root and child identities", () => {
  const store = createRuntimeEventStore();
  store.appendMany([
    event("root-run", 1, "run-root", "run.started", { status: "running" }),
    event("child-run", 2, "run-child", "run.started", { status: "running" }, {
      parent_run_id: "run-root",
    }),
    event("root-start", 3, "run-root", "step.started", {
      call_id: "same-id", tool_name: "read", arguments: { path: "root.txt" },
    }),
    event("child-start", 4, "run-child", "step.started", {
      call_id: "same-id", tool_name: "write", arguments: { path: "child.txt" },
    }, { parent_run_id: "run-root" }),
    event("root-done", 5, "run-root", "step.completed", {
      call_id: "same-id", tool_name: "read", status: "completed", result: { text: "root" },
    }),
    event("child-done", 6, "run-child", "step.completed", {
      call_id: "same-id", tool_name: "write", status: "failed", error: { code: "IO" },
      result: { message: "failed" },
    }, { parent_run_id: "run-root" }),
    event("root-repeat", 7, "run-root", "step.started", {
      call_id: "same-id", tool_name: "read", arguments: { path: "root.txt" },
    }),
  ]);
  const tree = reduceActivityTree(null, store.getSnapshot());
  const adapted = adaptActivityTreeToTraceChain(tree);
  expect(adapted.frames.filter((frame) => frame.type === "tool_call")).toHaveLength(2);
  expect(adapted.frames.filter((frame) => frame.type === "tool_result")).toHaveLength(1);
  expect(adapted.subagentFrames["run-child"].map((frame) => frame.type)).toEqual([
    "subagent_started", "tool_call", "tool_result",
  ]);
  const message = {
    id: "assistant-1", role: "assistant", traceFrames: adapted.frames,
    subagentFrames: adapted.subagentFrames,
  };
  expect(projectTestApiToolCalls(message)).toEqual([
    record("same-id", "run-root", "read", { path: "root.txt" }, "completed", { text: "root" }),
    record("same-id", "run-child", "write", { path: "child.txt" }, "failed", { message: "failed" }),
  ]);
  expect(message.tool_calls).toBeUndefined();
});

test("confirmation and terminal outcomes remain distinct across duplicate frames", () => {
  const frames = [
    { type: "tool_call", run_id: "run-1", payload: { call_id: "a", tool_name: "shell", requires_confirmation: true } },
    { type: "tool_call", run_id: "run-1", payload: { call_id: "b", tool_name: "read" } },
    { type: "tool_confirmed", run_id: "run-1", payload: { call_id: "a" } },
    { type: "tool_result", run_id: "run-1", payload: { call_id: "a", result: "ok" } },
    { type: "tool_call", run_id: "run-1", payload: { call_id: "a", requires_confirmation: true } },
    { type: "tool_denied", run_id: "run-1", payload: { call_id: "b" } },
    { type: "tool_result", run_id: "run-1", payload: { call_id: "c", success: false, error: "no", result: null } },
  ];
  expect(projectTestApiToolCalls({ role: "assistant", traceFrames: frames })).toEqual([
    record("a", "run-1", "shell", null, "completed", "ok"),
    record("b", "run-1", "read", null, "denied", null),
    record("c", "run-1", null, null, "failed", null),
  ]);
  expect(projectTestApiToolCalls({ role: "assistant", traceFrames: frames.slice(0, 1) })).toEqual([
    record("a", "run-1", "shell", null, "pending", null),
  ]);
  expect(projectTestApiToolCalls({ role: "assistant", traceFrames: frames.slice(0, 3) })[0].status).toBe("running");
});

test("ignores malformed evidence, preserves legacy only without frames, and does not mutate input", () => {
  const message = Object.freeze({
    role: "assistant",
    content: "I searched",
    traceFrames: Object.freeze([
      { type: "tool_call", payload: { tool_name: "search" } },
      { type: "unknown", payload: { call_id: "fake", status: "completed" } },
    ]),
    tool_calls: Object.freeze([{ old: true }]),
  });
  expect(projectTestApiToolCalls(message)).toBeNull();
  expect(projectTestApiMessage(message)).toEqual({ ...message, tool_calls: null });
  expect(projectTestApiToolCalls({ role: "assistant", content: "searched" })).toBeNull();
  expect(projectTestApiToolCalls({ role: "assistant", tool_calls: [{ old: true }] })).toEqual([{ old: true }]);
  expect(projectTestApiToolCalls({ role: "assistant", subagentFrames: {
    "run-child": [{ type: "tool_result", payload: { call_id: "only", result: 7 } }],
  } })).toEqual([record("only", "run-child", null, null, "completed", 7)]);
});

test("result status fields preserve failures, cancellation, denial and unknown outcomes", () => {
  const traceFrames = [
    { type: "tool_result", run_id: "r", payload: { call_id: "failed", status: "failed", result: 1 } },
    { type: "tool_result", run_id: "r", payload: { call_id: "error", is_error: true, result: 2 } },
    { type: "tool_result", run_id: "r", payload: { call_id: "cancelled", status: "cancelled" } },
    { type: "tool_result", run_id: "r", payload: { call_id: "denied", status: "denied" } },
    { type: "tool_result", run_id: "r", payload: { call_id: "unknown", status: "queued" } },
  ];
  expect(projectTestApiToolCalls({ role: "assistant", traceFrames })).toEqual([
    record("failed", "r", null, null, "failed", 1),
    record("error", "r", null, null, "failed", 2),
    record("cancelled", "r", null, null, "cancelled", null),
    record("denied", "r", null, null, "denied", null),
    record("unknown", "r", null, null, "running", null),
  ]);
});

test("legacy result payload errors and denials are never reported as completed", () => {
  const traceFrames = [
    { type: "tool_result", run_id: "legacy", payload: {
      call_id: "exception", result: { error: "execution failed", tool: "shell" },
    } },
    { type: "tool_result", run_id: "legacy", payload: {
      call_id: "denied", result: { denied: true, tool: "shell" },
    } },
    { type: "tool_result", run_id: "legacy", payload: {
      call_id: "not-ok", result: { ok: false, tool: "shell" },
    } },
    { type: "tool_result", run_id: "legacy", payload: {
      call_id: "success", result: { ok: true, text: "done" },
    } },
  ];
  expect(projectTestApiToolCalls({ role: "assistant", traceFrames })).toEqual([
    record("exception", "legacy", null, null, "failed", { error: "execution failed", tool: "shell" }),
    record("denied", "legacy", null, null, "denied", { denied: true, tool: "shell" }),
    record("not-ok", "legacy", null, null, "failed", { ok: false, tool: "shell" }),
    record("success", "legacy", null, null, "completed", { ok: true, text: "done" }),
  ]);
});
