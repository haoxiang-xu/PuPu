import { createRuntimeEventStore } from "./event_store";
import {
  createIncrementalActivityTreeProjector,
  createInitialActivityTreeState,
  reduceActivityTree,
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
  const store = createRuntimeEventStore();
  store.appendMany(events);
  return reduceActivityTree(null, store.getSnapshot());
};

describe("runtime events activity tree", () => {
  test("initial state includes run-level artifact summary bucket", () => {
    const state = createInitialActivityTreeState();
    expect(state.runArtifactSummary).toBeNull();
    expect(state.artifactSummariesByTurnId).toEqual({});
  });

  test("incremental reduction emits only new effects and matches a full replay", () => {
    const events = [
      event({ id: "evt-run", type: "run.started", seq: 1 }),
      event({ id: "evt-turn", type: "turn.started", seq: 2 }),
      event({
        id: "evt-model",
        type: "step.delta",
        seq: 3,
        payload: { step_type: "model_response", delta: "hello" },
      }),
      event({ id: "evt-done", type: "run.completed", seq: 4 }),
    ];
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    let incremental = projector.reduce(store.getReductionSnapshot());
    const incrementalEffects = [];

    events.forEach((runtimeEvent) => {
      store.appendForReduction(runtimeEvent);
      incremental = projector.reduce(store.getReductionSnapshot());
      incrementalEffects.push(...incremental.effects);
    });

    const replayStore = createRuntimeEventStore();
    replayStore.appendMany(events);
    const replay = reduceActivityTree(null, replayStore.getSnapshot());
    expect(incrementalEffects).toEqual(replay.effects);
    expect({ ...incremental, effects: replay.effects }).toEqual(replay);
  });

  test("does not reuse incremental state across stores with the same event ids", () => {
    const storeA = createRuntimeEventStore();
    const storeB = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    storeA.appendForReduction(
      event({ id: "same", type: "session.started", payload: { thread_id: "A" } }),
    );
    projector.reduce(storeA.getReductionSnapshot());

    storeB.appendForReduction(
      event({ id: "same", type: "session.started", payload: { thread_id: "B" } }),
    );
    const state = projector.reduce(storeB.getReductionSnapshot());

    expect(state.session.threadId).toBe("B");
  });

  test("does not reuse incremental state after clear with the same event ids", () => {
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    store.appendForReduction(
      event({ id: "same", type: "session.started", payload: { thread_id: "A" } }),
    );
    projector.reduce(store.getReductionSnapshot());

    store.clear();
    store.appendForReduction(
      event({ id: "same", type: "session.started", payload: { thread_id: "B" } }),
    );
    const state = projector.reduce(store.getReductionSnapshot());

    expect(state.session.threadId).toBe("B");
  });

  test("emits a fresh run-summary effect when a promoted plan updates after run completion", () => {
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    const plan = (id, revision, markdown) =>
      event({
        id,
        type: revision === 1 ? "artifact.created" : "artifact.updated",
        seq: revision + 1,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "plan-1",
          kind: "plan",
          revision,
          snapshot: { markdown },
        },
      });

    store.appendForReduction(
      event({ id: "done", type: "run.completed", seq: 1 }),
    );
    let state = projector.reduce(store.getReductionSnapshot());
    expect(state.effects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_artifact_summary" }),
      ]),
    );

    store.appendForReduction(plan("plan-v1", 1, "one"));
    state = projector.reduce(store.getReductionSnapshot());
    expect(state.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run_artifact_summary",
          eventId: "plan-v1",
          reason: "created",
        }),
      ]),
    );

    store.appendForReduction(plan("plan-v2", 2, "two"));
    state = projector.reduce(store.getReductionSnapshot());
    expect(state.runArtifactSummary.artifacts[0].revision).toBe(2);
    expect(state.effects).toEqual([
      expect.objectContaining({
        type: "run_artifact_summary",
        eventId: "plan-v2",
        reason: "updated",
      }),
    ]);

    state = projector.reduce(store.getReductionSnapshot());
    expect(state.effects).toEqual([]);

    store.appendForReduction(
      event({ id: "unrelated", type: "interaction.fyi_injected", seq: 4 }),
    );
    state = projector.reduce(store.getReductionSnapshot());
    expect(state.effects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_artifact_summary" }),
      ]),
    );
  });

  test("keeps canonical run-summary ordering across batch partitions", () => {
    const events = [
      event({
        id: "turn-plan",
        type: "artifact.created",
        seq: 1,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "plan-turn",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "turn" },
        },
      }),
      event({ id: "done", type: "run.completed", seq: 2 }),
      event({
        id: "run-plan",
        type: "artifact.created",
        seq: 3,
        surface: { slot: "run_summary", scope: "run", group: "" },
        payload: {
          artifact_id: "plan-run",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "run" },
        },
      }),
    ];

    const project = (partitions) => {
      const store = createRuntimeEventStore();
      const projector = createIncrementalActivityTreeProjector();
      projector.reduce(store.getReductionSnapshot());
      let offset = 0;
      let state;
      partitions.forEach((size) => {
        store.appendManyForReduction(events.slice(offset, offset + size));
        offset += size;
        state = projector.reduce(store.getReductionSnapshot());
      });
      return state.runArtifactSummary;
    };
    const replay = reduceEvents(events).runArtifactSummary;

    expect(project([1, 1, 1])).toEqual(replay);
    expect(project([3])).toEqual(replay);
    expect(replay.artifacts.map((artifact) => artifact.artifact_id)).toEqual([
      "plan-run",
      "plan-turn",
    ]);
  });

  test("restores same-turn artifact order when an earlier artifact becomes promoted", () => {
    const events = [
      event({
        id: "note-x",
        type: "artifact.created",
        seq: 1,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "note",
          revision: 1,
          snapshot: { markdown: "x-note" },
        },
      }),
      event({
        id: "plan-a",
        type: "artifact.created",
        seq: 2,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-a",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "a-plan" },
        },
      }),
      event({ id: "done", type: "run.completed", seq: 3 }),
      event({
        id: "promote-x",
        type: "artifact.updated",
        seq: 4,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "plan",
          revision: 2,
          snapshot: { markdown: "x-plan" },
        },
      }),
    ];
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());

    events.forEach((runtimeEvent) => {
      store.appendForReduction(runtimeEvent);
      projector.reduce(store.getReductionSnapshot());
    });
    const incremental = projector.reduce(store.getReductionSnapshot());
    const replay = reduceEvents(events);

    expect(incremental.runArtifactSummary).toEqual(replay.runArtifactSummary);
    expect(
      incremental.runArtifactSummary.artifacts.map(
        (artifact) => artifact.artifact_id,
      ),
    ).toEqual(["artifact-x", "artifact-a"]);
  });

  test("does not emit a masked explicit update when promoted content wins", () => {
    const promoted = event({
      id: "promoted",
      type: "artifact.created",
      seq: 1,
      surface: { slot: "artifact_summary", scope: "turn", group: "" },
      payload: {
        artifact_id: "plan-x",
        kind: "plan",
        revision: 1,
        snapshot: { markdown: "promoted" },
      },
    });
    const explicit = event({
      id: "explicit",
      type: "artifact.created",
      seq: 3,
      surface: { slot: "run_summary", scope: "run", group: "" },
      payload: {
        artifact_id: "plan-x",
        kind: "plan",
        revision: 1,
        snapshot: { markdown: "explicit" },
      },
    });
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    store.appendForReduction(promoted);
    projector.reduce(store.getReductionSnapshot());
    store.appendForReduction(event({ id: "done", type: "run.completed", seq: 2 }));
    projector.reduce(store.getReductionSnapshot());
    store.appendForReduction(explicit);
    const state = projector.reduce(store.getReductionSnapshot());

    expect(state.runArtifactSummary.artifacts[0].snapshot.markdown).toBe(
      "promoted",
    );
    expect(state.effects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_artifact_summary" }),
      ]),
    );
  });

  test("removes a promoted plan when its turn artifact changes kind", () => {
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    store.appendManyForReduction([
      event({ id: "done", type: "run.completed", seq: 1 }),
      event({
        id: "plan",
        type: "artifact.created",
        seq: 2,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "plan" },
        },
      }),
    ]);
    projector.reduce(store.getReductionSnapshot());

    const replacement = event({
      id: "note",
      type: "artifact.updated",
      seq: 3,
      surface: { slot: "artifact_summary", scope: "turn", group: "" },
      payload: {
        artifact_id: "artifact-x",
        kind: "note",
        revision: 2,
        snapshot: { markdown: "note" },
      },
    });
    store.appendForReduction(replacement);
    const state = projector.reduce(store.getReductionSnapshot());

    expect(state.runArtifactSummary).toBeNull();
    expect(state.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run_artifact_summary",
          eventId: "note",
          reason: "updated",
        }),
      ]),
    );
    expect(
      reduceEvents([
        event({ id: "done", type: "run.completed", seq: 1 }),
        event({
          id: "plan",
          type: "artifact.created",
          seq: 2,
          surface: { slot: "artifact_summary", scope: "turn", group: "" },
          payload: {
            artifact_id: "artifact-x",
            kind: "plan",
            revision: 1,
            snapshot: { markdown: "plan" },
          },
        }),
        replacement,
      ]).runArtifactSummary,
    ).toBeNull();

    store.appendForReduction(
      event({
        id: "plan-again",
        type: "artifact.updated",
        seq: 4,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "plan",
          revision: 3,
          snapshot: { markdown: "plan again" },
        },
      }),
    );
    const restored = projector.reduce(store.getReductionSnapshot());
    expect(restored.runArtifactSummary.artifacts[0].kind).toBe("plan");
    expect(restored.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run_artifact_summary",
          eventId: "plan-again",
          reason: "updated",
        }),
      ]),
    );
  });

  test("keeps a promoted plan when a lower-revision non-plan update is ignored", () => {
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    store.appendManyForReduction([
      event({ id: "done", type: "run.completed", seq: 1 }),
      event({
        id: "plan",
        type: "artifact.created",
        seq: 2,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "plan",
          revision: 2,
          snapshot: { markdown: "plan" },
        },
      }),
    ]);
    projector.reduce(store.getReductionSnapshot());

    store.appendForReduction(
      event({
        id: "stale-note",
        type: "artifact.updated",
        seq: 3,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "note",
          revision: 1,
          snapshot: { markdown: "stale" },
        },
      }),
    );
    const state = projector.reduce(store.getReductionSnapshot());

    expect(state.runArtifactSummary.artifacts[0].kind).toBe("plan");
    expect(state.effects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_artifact_summary" }),
      ]),
    );
  });

  test("coalesces a batch of promoted plans to one run-summary patch", () => {
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    store.appendForReduction(
      event({ id: "done", type: "run.completed", seq: 1 }),
    );
    projector.reduce(store.getReductionSnapshot());

    store.appendManyForReduction(
      Array.from({ length: 16 }, (_, index) =>
        event({
          id: `plan-${index}`,
          type: "artifact.created",
          seq: index + 2,
          turnId: `run-root:turn-${index + 1}`,
          surface: { slot: "artifact_summary", scope: "turn", group: "" },
          payload: {
            artifact_id: `plan-${index}`,
            kind: "plan",
            revision: 1,
            snapshot: { markdown: `${index}` },
          },
        }),
      ),
    );
    const state = projector.reduce(store.getReductionSnapshot());

    expect(
      state.effects.filter((effect) => effect.type === "run_artifact_summary"),
    ).toHaveLength(1);
    expect(state.runArtifactSummary.artifacts).toHaveLength(16);
  });

  test("coalesces the canonical rebuild for an interleaved promoted batch", () => {
    const seedEvents = [
      event({
        id: "early-turn-file",
        type: "artifact.created",
        seq: 1,
        turnId: "run-root:turn-1",
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "early-turn-file",
          kind: "file_diff",
          revision: 1,
          snapshot: { path: "early.js" },
        },
      }),
      event({
        id: "later-turn-plan",
        type: "artifact.created",
        seq: 2,
        turnId: "run-root:turn-2",
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "later-turn-plan",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "later" },
        },
      }),
      event({ id: "done", type: "run.completed", seq: 3 }),
    ];
    const interleavedPlans = Array.from({ length: 64 }, (_, index) =>
      event({
        id: `early-turn-plan-${index}`,
        type: "artifact.created",
        seq: index + 4,
        turnId: "run-root:turn-1",
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: `early-turn-plan-${index}`,
          kind: "plan",
          revision: 1,
          snapshot: { markdown: `${index}` },
        },
      }),
    );
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    store.appendManyForReduction(seedEvents);
    projector.reduce(store.getReductionSnapshot());

    store.appendManyForReduction(interleavedPlans);
    const state = projector.reduce(store.getReductionSnapshot());
    const replay = reduceEvents([...seedEvents, ...interleavedPlans]);

    expect(state.runArtifactSummary).toEqual(replay.runArtifactSummary);
    expect(
      state.runArtifactSummary.artifacts.map((artifact) => artifact.artifact_id),
    ).toEqual([
      ...interleavedPlans.map((runtimeEvent) => runtimeEvent.payload.artifact_id),
      "later-turn-plan",
    ]);
    expect(
      state.effects.filter((effect) => effect.type === "run_artifact_summary"),
    ).toHaveLength(1);
  });

  test("preserves local order when an earlier non-plan becomes promoted", () => {
    const events = [
      event({
        id: "file-x",
        type: "artifact.created",
        seq: 1,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "file_diff",
          revision: 1,
          snapshot: { path: "x.js" },
        },
      }),
      event({
        id: "plan-a",
        type: "artifact.created",
        seq: 2,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "plan-a",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "A" },
        },
      }),
      event({ id: "done", type: "run.completed", seq: 3 }),
      event({
        id: "plan-x",
        type: "artifact.updated",
        seq: 4,
        surface: { slot: "artifact_summary", scope: "turn", group: "" },
        payload: {
          artifact_id: "artifact-x",
          kind: "plan",
          revision: 2,
          snapshot: { markdown: "X" },
        },
      }),
    ];
    const store = createRuntimeEventStore();
    const projector = createIncrementalActivityTreeProjector();
    projector.reduce(store.getReductionSnapshot());
    events.forEach((runtimeEvent) => {
      store.appendForReduction(runtimeEvent);
      projector.reduce(store.getReductionSnapshot());
    });
    const state = projector.reduce(store.getReductionSnapshot());

    expect(state.runArtifactSummary).toEqual(
      reduceEvents(events).runArtifactSummary,
    );
    expect(
      state.runArtifactSummary.artifacts.map((artifact) => artifact.artifact_id),
    ).toEqual(["artifact-x", "plan-a"]);
  });

  test("full reduction returns artifact data detached from its input snapshot", () => {
    const store = createRuntimeEventStore();
    store.append(
      event({
        id: "run-plan",
        type: "artifact.created",
        surface: { slot: "run_summary", scope: "run", group: "" },
        payload: {
          artifact_id: "plan-1",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "original" },
        },
      }),
    );
    const snapshot = store.getSnapshot();
    const state = reduceActivityTree(null, snapshot);

    state.runArtifactSummary.artifacts[0].snapshot.markdown = "mutated";

    expect(
      snapshot.eventsById["run-plan"].payload.snapshot.markdown,
    ).toBe("original");
    expect(
      reduceActivityTree(null, snapshot).runArtifactSummary.artifacts[0]
        .snapshot.markdown,
    ).toBe("original");
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

  test("maps interaction.fyi_injected events to fyi_injected frames", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started", seq: 1 }),
      event({
        id: "evt-fyi",
        type: "interaction.fyi_injected",
        seq: 2,
        payload: {
          count: 1,
          messages: [
            { message_id: "msg-1", origin: "user", text: "heads up" },
          ],
        },
      }),
    ]);

    const fyiFrame = state.frames.find((frame) => frame.type === "fyi_injected");
    expect(fyiFrame).toBeDefined();
    expect(fyiFrame.payload.count).toBe(1);
    expect(fyiFrame.payload.messages[0].text).toBe("heads up");

    expect(state.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "frame",
          eventId: "evt-fyi",
          frame: fyiFrame,
        }),
      ]),
    );
  });
});
