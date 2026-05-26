import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree, createInitialActivityTreeState } from "./activity_tree";

const event = ({
  id,
  type,
  runId = "run-root",
  agentId = "developer",
  turnId = "run-root:turn-1",
  links = {},
  payload = {},
  timestamp = "2026-04-25T12:00:00.000Z",
}) => ({
  schema_version: "v3",
  event_id: id,
  type,
  timestamp,
  session_id: "thread-1",
  run_id: runId,
  agent_id: agentId,
  turn_id: turnId,
  links,
  visibility: "user",
  payload,
  metadata: {},
});

const reduceEvents = (events) => {
  const store = createRuntimeEventStore();
  store.appendMany(events);
  return reduceActivityTree(null, store.getSnapshot());
};

describe("activity tree reducer", () => {
  test("updates root run status and usage from run lifecycle events", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-done",
        type: "run.completed",
        payload: {
          status: "completed",
          usage: { consumed_tokens: 12, model: "openai:gpt-5" },
        },
      }),
    ]);

    expect(state.status).toBe("completed");
    expect(state.rootRunId).toBe("run-root");
    expect(state.runsById["run-root"].status).toBe("completed");
    expect(state.completionBundle).toEqual({
      consumed_tokens: 12,
      model: "openai:gpt-5",
    });
    expect(state.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "done",
    ]);
    expect(state.frames[1].payload.bundle).toEqual({
      consumed_tokens: 12,
      model: "openai:gpt-5",
    });
  });

  test("updates root failure state without crashing", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-failed",
        type: "run.failed",
        payload: {
          error: { code: "boom", message: "Exploded" },
          recoverable: true,
        },
      }),
    ]);

    expect(state.status).toBe("failed");
    expect(state.error).toEqual({ code: "boom", message: "Exploded" });
    expect(state.frames[state.frames.length - 1]).toMatchObject({
      type: "error",
      payload: { code: "boom", message: "Exploded", recoverable: true },
    });
    expect(state.effects[state.effects.length - 1]).toMatchObject({
      type: "error",
      error: { code: "boom", message: "Exploded" },
    });
  });

  test("keeps child runs under links.parent_run_id and routes frames there", () => {
    const state = reduceEvents([
      event({ id: "evt-root", type: "run.started" }),
      event({
        id: "evt-child",
        type: "run.started",
        runId: "run-child",
        agentId: "developer.worker.1",
        turnId: null,
        links: { parent_run_id: "run-root" },
        payload: {
          agent_id: "developer.worker.1",
          parent_id: "developer",
          mode: "worker",
          template: "worker",
          batch_id: "batch-1",
          lineage: ["developer", "developer.worker.1"],
        },
      }),
    ]);

    expect(state.runsById["run-child"]).toMatchObject({
      runId: "run-child",
      parentRunId: "run-root",
      agentId: "developer.worker.1",
      mode: "worker",
      template: "worker",
      batchId: "batch-1",
      parentId: "developer",
      status: "running",
    });
    expect(state.frames.map((frame) => frame.type)).toEqual(["run_started"]);
    expect(state.framesByRunId["run-child"].map((frame) => frame.type)).toEqual([
      "subagent_started",
    ]);
  });

  test("preserves model.delta whitespace in model text and token effects", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-delta",
        type: "model.delta",
        payload: { kind: "text", delta: "  indented\n" },
      }),
    ]);

    expect(state.modelTextByRunId["run-root"]).toBe("  indented\n");
    expect(state.frames[state.frames.length - 1]).toMatchObject({
      type: "token_delta",
      payload: { kind: "text", delta: "  indented\n" },
    });
    expect(state.effects[state.effects.length - 1]).toMatchObject({
      type: "token",
      eventId: "evt-delta",
      delta: "  indented\n",
      runId: "run-root",
    });
  });

  test("maps tool and input events to TraceChain-compatible frames", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-tool-start",
        type: "tool.started",
        links: { tool_call_id: "call-1" },
        payload: {
          call_id: "call-1",
          tool_name: "read_file",
          arguments: { path: "/tmp/a.py" },
        },
      }),
      event({
        id: "evt-tool-done",
        type: "tool.completed",
        links: { tool_call_id: "call-1" },
        payload: {
          call_id: "call-1",
          tool_name: "read_file",
          status: "success",
          result: { content: "ok" },
        },
      }),
      event({
        id: "evt-input",
        type: "input.requested",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: {
          kind: "selection",
          question: "Pick one",
          interact_type: "single",
          options: [{ label: "A", value: "a" }],
        },
      }),
      event({
        id: "evt-input-done",
        type: "input.resolved",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: { decision: "approved", response: { value: "a" } },
      }),
    ]);

    expect(state.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "tool_call",
      "tool_result",
      "tool_call",
      "tool_confirmed",
    ]);
    expect(state.toolCallsById["call-1"]).toMatchObject({
      callId: "call-1",
      status: "success",
    });
    expect(state.inputRequestsById["confirm-2"]).toMatchObject({
      requestId: "confirm-2",
      callId: "call-2",
      status: "submitted",
      resolved: true,
      decision: "approved",
      response: { value: "a" },
    });
    expect(state.frames[3].payload).toMatchObject({
      call_id: "call-2",
      confirmation_id: "confirm-2",
      requires_confirmation: true,
      tool_name: "ask_user_question",
      interact_type: "single",
      interact_config: {
        question: "Pick one",
        options: [{ label: "A", value: "a" }],
      },
    });
  });
});

describe("artifactSummariesByTurnId initial state", () => {
  test("createInitialActivityTreeState includes empty artifactSummariesByTurnId", () => {
    const state = createInitialActivityTreeState();
    expect(state.artifactSummariesByTurnId).toEqual({});
  });
});

describe("artifact.created", () => {
  test("creates a pending bucket and pushes the artifact descriptor", () => {
    const events = [
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:call-1",
          kind: "file_diff",
          title: "src/App.js",
          owner: { turn_id: "run-root:turn-1", call_id: "call-1" },
          snapshot: { unified_diff: "--- a/App.js\n+++ b/App.js\n@@ -1 +1 @@\n-old\n+new\n" },
        },
      }),
    ];
    const state = reduceEvents(events);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket).toBeDefined();
    expect(bucket.status).toBe("pending");
    expect(bucket.order).toBe(1);
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].artifact_id).toBe("file_diff:call-1");
    expect(bucket.artifacts[0].kind).toBe("file_diff");
  });

  test("resolves turn_id from event.turn_id when present", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        turnId: "run-root:turn-2",
        payload: {
          artifact_id: "x:1",
          kind: "file_diff",
          owner: { turn_id: "DIFFERENT" },
          snapshot: { unified_diff: "" },
        },
      }),
    ]);
    expect(state.artifactSummariesByTurnId["run-root:turn-2"]).toBeDefined();
    expect(state.artifactSummariesByTurnId["DIFFERENT"]).toBeUndefined();
  });

  test("does not emit an artifact_summary effect while bucket is pending", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "x:1",
          kind: "file_diff",
          snapshot: { unified_diff: "" },
        },
      }),
    ]);
    const artifactEffects = state.effects.filter(
      (e) => e.type === "artifact_summary",
    );
    expect(artifactEffects).toEqual([]);
  });

  test("keeps unknown but structurally valid artifact kinds", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "benchmark:1",
          kind: "benchmark_report",
          title: "Benchmark",
          snapshot: { markdown: "p95: 18ms" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].kind).toBe("benchmark_report");
  });

  test("drops malformed artifact descriptors even for known event types", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "benchmark:1",
          kind: "benchmark_report",
        },
      }),
    ]);
    expect(state.artifactSummariesByTurnId["run-root:turn-1"]).toBeUndefined();
  });

  test("upserts stable artifacts when artifact.created repeats the same artifact_id", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          title: "Initial",
          snapshot: { markdown: "# v1", status: "draft" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 2,
          title: "Updated",
          snapshot: { markdown: "# v2", status: "draft" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].title).toBe("Updated");
    expect(bucket.artifacts[0].revision).toBe(2);
  });
});

describe("artifact.updated", () => {
  test("replaces the existing entry with the same artifact_id", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          title: "Initial",
          snapshot: { markdown: "# v1", status: "draft" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 2,
          title: "Updated",
          snapshot: { markdown: "# v2", status: "draft" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].title).toBe("Updated");
    expect(bucket.artifacts[0].revision).toBe(2);
  });

  test("ignores revision regression for the same artifact_id", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 5,
          snapshot: { markdown: "# rev5" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 3,
          snapshot: { markdown: "# rev3" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts[0].revision).toBe(5);
    expect(bucket.artifacts[0].snapshot.markdown).toBe("# rev5");
  });

  test("pushes the artifact when no existing entry matches (out-of-order delivery)", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "# v1" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].revision).toBe(1);
  });

  test("does not let late older artifact.created duplicate or downgrade an updated artifact", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 2,
          title: "Updated",
          snapshot: { markdown: "# v2", status: "draft" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          title: "Initial",
          snapshot: { markdown: "# v1", status: "draft" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].title).toBe("Updated");
    expect(bucket.artifacts[0].revision).toBe(2);
  });
});

describe("turn.completed flips bucket to completed", () => {
  test("status becomes completed and an artifact_summary completed effect is emitted", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "turn.completed", payload: {} }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.status).toBe("completed");
    const completedEffects = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "completed",
    );
    expect(completedEffects).toHaveLength(1);
    expect(completedEffects[0].turnId).toBe("run-root:turn-1");
    expect(completedEffects[0].eventId).toBe("e2");
  });

  test("does not create a bucket when the turn produced no artifacts", () => {
    const state = reduceEvents([
      event({ id: "e1", type: "turn.completed", payload: {} }),
    ]);
    expect(state.artifactSummariesByTurnId["run-root:turn-1"]).toBeUndefined();
    const completedEffects = state.effects.filter(
      (e) => e.type === "artifact_summary",
    );
    expect(completedEffects).toEqual([]);
  });

  test("artifact.created arriving after turn.completed emits a created effect", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "turn.completed", payload: {} }),
      event({
        id: "e3",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c2",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-x\n+y\n" },
        },
      }),
    ]);
    const created = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "created",
    );
    expect(created).toHaveLength(1);
  });
});

describe("run.completed flushes pending buckets", () => {
  test("converts pending buckets to completed and emits flushed effects", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        turnId: "run-root:turn-1",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "run.completed", payload: {} }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.status).toBe("completed");
    const flushed = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "flushed",
    );
    expect(flushed).toHaveLength(1);
    expect(flushed[0].turnId).toBe("run-root:turn-1");
    expect(flushed[0].eventId).toBe("e2");
  });

  test("multiple pending turns produce one flushed effect each, all keyed by the same event_id but distinguishable by turnId+reason", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        turnId: "run-root:turn-1",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.created",
        turnId: "run-root:turn-2",
        payload: {
          artifact_id: "file_diff:c2",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-x\n+y\n" },
        },
      }),
      event({ id: "e3", type: "run.completed", payload: {} }),
    ]);
    const flushed = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "flushed",
    );
    expect(flushed).toHaveLength(2);
    expect(flushed.every((e) => e.eventId === "e3")).toBe(true);
    expect(new Set(flushed.map((e) => e.turnId))).toEqual(
      new Set(["run-root:turn-1", "run-root:turn-2"]),
    );
  });

  test("already-completed buckets are not re-flushed", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "turn.completed", payload: {} }),
      event({ id: "e3", type: "run.completed", payload: {} }),
    ]);
    const flushed = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "flushed",
    );
    expect(flushed).toEqual([]);
  });
});
