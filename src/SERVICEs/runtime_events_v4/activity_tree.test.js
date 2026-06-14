import { createRuntimeEventStoreV4 } from "./event_store";
import {
  createInitialActivityTreeStateV4,
  reduceActivityTreeV4,
} from "./activity_tree";

const event = ({
  id,
  type,
  seq = 1,
  runId = "run-root",
  agentId = "developer",
  turnId = "run-root:turn-1",
  links = {},
  surface = { slot: "trace_inline", scope: "turn", group: "trace" },
  payload = {},
  timestamp = "2026-05-26T12:00:00.000Z",
}) => ({
  schema_version: "v4",
  event_id: id,
  type,
  timestamp,
  session_id: "thread-1",
  run_id: runId,
  agent_id: agentId,
  turn_id: turnId,
  seq,
  links,
  surface,
  visibility: "user",
  payload,
  metadata: {},
});

const reduceEvents = (events) => {
  const store = createRuntimeEventStoreV4();
  store.appendMany(events);
  return reduceActivityTreeV4(null, store.getSnapshot());
};

describe("runtime events v4 activity tree", () => {
  test("initial state includes run-level artifact summary bucket", () => {
    const state = createInitialActivityTreeStateV4();
    expect(state.runArtifactSummary).toBeNull();
    expect(state.artifactSummariesByTurnId).toEqual({});
  });

  test("maps v4 tool steps and interactions to TraceChain-compatible frames", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started", seq: 1 }),
      event({
        id: "evt-tool",
        type: "step.started",
        seq: 2,
        links: { step_id: "tool:call-1", tool_call_id: "call-1" },
        payload: {
          step_id: "tool:call-1",
          step_type: "tool",
          tool_name: "write",
          call_id: "call-1",
          arguments: { path: "src/App.js" },
        },
      }),
      event({
        id: "evt-interaction",
        type: "interaction.requested",
        seq: 3,
        links: {
          step_id: "tool:call-1",
          tool_call_id: "call-1",
          interaction_id: "confirm-1",
        },
        payload: {
          interaction_id: "confirm-1",
          kind: "code_diff",
          renderer: "code_diff",
          title: "Edit src/App.js",
          prompt: "Approve edit",
          target: {
            tool_call_id: "call-1",
            tool_name: "write",
            toolkit_id: "core",
            arguments: { path: "src/App.js" },
          },
          config: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({
        id: "evt-resolved",
        type: "interaction.resolved",
        seq: 4,
        links: {
          step_id: "tool:call-1",
          tool_call_id: "call-1",
          interaction_id: "confirm-1",
        },
        payload: {
          interaction_id: "confirm-1",
          outcome: "denied",
          reason: "no",
        },
      }),
    ]);

    expect(state.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "tool_call",
      "tool_call",
      "tool_denied",
    ]);
    expect(state.frames[2]).toMatchObject({
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "write",
        toolkit_id: "core",
        interact_type: "code_diff",
        interact_config: {
          unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
          title: "Edit src/App.js",
          question: "Approve edit",
        },
        arguments: { path: "src/App.js" },
      },
    });
    expect(state.frames[3]).toMatchObject({
      type: "tool_denied",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        decision: "denied",
        reason: "no",
      },
    });
  });

  test("maps v4 ask_user_question interactions to selector frames", () => {
    const state = reduceEvents([
      event({
        id: "evt-human-input",
        type: "interaction.requested",
        seq: 1,
        links: {
          interaction_id: "input-1",
        },
        payload: {
          interaction_id: "input-1",
          kind: "choice",
          renderer: "single",
          title: "Choose",
          prompt: "Pick one",
          selection_mode: "single",
          options: [{ label: "A", value: "a" }],
          allow_other: true,
          target: {},
          config: {},
        },
      }),
      event({
        id: "evt-human-submitted",
        type: "interaction.resolved",
        seq: 2,
        links: {
          interaction_id: "input-1",
        },
        payload: {
          interaction_id: "input-1",
          outcome: "submitted",
          response: { selected_values: ["a"] },
        },
      }),
    ]);

    expect(state.frames.map((frame) => frame.type)).toEqual([
      "tool_call",
      "tool_confirmed",
    ]);
    expect(state.frames[0]).toMatchObject({
      type: "tool_call",
      payload: {
        call_id: "input-1",
        confirmation_id: "input-1",
        requires_confirmation: true,
        tool_name: "ask_user_question",
        interact_type: "single",
        interact_config: {
          title: "Choose",
          question: "Pick one",
          selection_mode: "single",
          options: [{ label: "A", value: "a" }],
          allow_other: true,
        },
      },
    });
    expect(state.frames[1]).toMatchObject({
      type: "tool_confirmed",
      payload: {
        call_id: "input-1",
        confirmation_id: "input-1",
        decision: "approved",
        user_response: { selected_values: ["a"] },
      },
    });
  });

  test("routes run_summary artifacts to runArtifactSummary only", () => {
    const artifact = {
      artifact_id: "workspace_change_set:run-root",
      kind: "workspace_change_set",
      title: "Workspace changes",
      snapshot: {
        change_set_id: "wcs-run-root",
        files: [
          {
            path: "src/App.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
          },
        ],
      },
    };
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started", seq: 1 }),
      event({
        id: "evt-artifact",
        type: "artifact.created",
        seq: 2,
        links: {
          artifact_id: "workspace_change_set:run-root",
          workspace_change_set_id: "wcs-run-root",
        },
        surface: {
          slot: "run_summary",
          scope: "run",
          group: "files",
          default_state: "expanded",
        },
        payload: artifact,
      }),
      event({ id: "evt-done", type: "run.completed", seq: 3 }),
    ]);

    expect(state.runArtifactSummary).toMatchObject({
      order: 0,
      status: "completed",
      artifacts: [artifact],
    });
    expect(state.artifactSummariesByTurnId["run-root:turn-1"]).toBeUndefined();
    expect(state.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run_artifact_summary",
          eventId: "evt-done",
          reason: "flushed",
        }),
      ]),
    );
  });

  test("routes iteration_summary artifacts to turn buckets", () => {
    const state = reduceEvents([
      event({
        id: "evt-artifact",
        type: "artifact.created",
        seq: 1,
        surface: {
          slot: "iteration_summary",
          scope: "turn",
          group: "plan",
        },
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          title: "Plan",
          snapshot: { markdown: "# Plan" },
        },
      }),
      event({ id: "evt-turn-done", type: "turn.completed", seq: 2 }),
    ]);

    expect(state.runArtifactSummary).toBeNull();
    expect(state.artifactSummariesByTurnId["run-root:turn-1"]).toMatchObject({
      order: 1,
      status: "completed",
      artifacts: [
        {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
        },
      ],
    });
  });

  test("promotes latest plan revisions into runArtifactSummary on run completion", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started", seq: 1 }),
      event({
        id: "evt-plan-created",
        type: "artifact.created",
        seq: 2,
        turnId: "run-root:turn-1",
        surface: {
          slot: "iteration_summary",
          scope: "turn",
          group: "plan_start",
        },
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          title: "Initial plan",
          snapshot: { markdown: "# v1", status: "draft" },
        },
      }),
      event({ id: "evt-turn-1-done", type: "turn.completed", seq: 3 }),
      event({
        id: "evt-plan-updated",
        type: "artifact.updated",
        seq: 4,
        turnId: "run-root:turn-2",
        surface: {
          slot: "iteration_summary",
          scope: "turn",
          group: "plan_update",
        },
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 2,
          title: "Updated plan",
          snapshot: { markdown: "# v2", status: "draft" },
        },
      }),
      event({ id: "evt-turn-2-done", type: "turn.completed", seq: 5 }),
      event({ id: "evt-done", type: "run.completed", seq: 6 }),
    ]);

    expect(state.runArtifactSummary).toMatchObject({
      order: 0,
      status: "completed",
      artifacts: [
        {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 2,
          title: "Updated plan",
        },
      ],
    });
    expect(state.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run_artifact_summary",
          eventId: "evt-done",
          reason: "flushed",
        }),
      ]),
    );
  });
});
