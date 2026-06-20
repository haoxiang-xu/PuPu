import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree } from "./activity_tree";
import { adaptActivityTreeToTraceChain } from "./trace_chain_adapter";

const event = ({ id, type, seq, payload = {}, surface, links = {} }) => ({
  schema_version: "v4",
  event_id: id,
  type,
  timestamp: "2026-05-26T12:00:00.000Z",
  session_id: "thread-1",
  run_id: "run-root",
  agent_id: "developer",
  turn_id: "run-root:turn-1",
  seq,
  links,
  surface: surface || { slot: "trace_inline", scope: "turn" },
  visibility: "user",
  payload,
  metadata: {},
});

const adaptEvents = (events) => {
  const store = createRuntimeEventStore();
  store.appendMany(events);
  return adaptActivityTreeToTraceChain(
    reduceActivityTree(null, store.getSnapshot()),
  );
};

describe("runtime event TraceChain adapter", () => {
  test("exposes root trace props and run artifact summary", () => {
    const traceProps = adaptEvents([
      event({ id: "evt-run", type: "run.started", seq: 1 }),
      event({
        id: "evt-delta",
        type: "step.delta",
        seq: 2,
        payload: {
          step_id: "model:run-root:turn-1:response",
          step_type: "model_response",
          kind: "text",
          delta: "hello",
        },
      }),
      event({
        id: "evt-artifact",
        type: "artifact.created",
        seq: 3,
        surface: { slot: "run_summary", scope: "run", group: "files" },
        payload: {
          artifact_id: "workspace_change_set:run-root",
          kind: "workspace_change_set",
          snapshot: { files: [{ path: "src/App.js", unified_diff: "" }] },
        },
      }),
      event({ id: "evt-done", type: "run.completed", seq: 4 }),
    ]);

    expect(traceProps.status).toBe("done");
    expect(traceProps.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "token_delta",
      "done",
    ]);
    expect(traceProps.runArtifactSummary).toMatchObject({
      status: "completed",
      artifacts: [
        {
          artifact_id: "workspace_change_set:run-root",
          kind: "workspace_change_set",
        },
      ],
    });
  });
});
