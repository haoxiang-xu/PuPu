import contractVectors from "./fixtures/tool_call_ref_v1_contract.json";
import {
  projectToolCallLifecycle,
  validateToolCallRef,
} from "./tool_call_projection";

const cursor = (storeSeq = 7, eventId = "intent-event-7") => ({
  schema: "unchain.event_cursor.v1",
  store_seq: storeSeq,
  event_id: eventId,
});

const ref = (overrides = {}) => ({
  schema: "pupu.tool_call_ref.v1",
  execution_id: "execution-a",
  original_attempt_id: "attempt-a",
  call_id: "call-a",
  tool_name: "web_fetch",
  intent_cursor: cursor(),
  ...overrides,
});

const refMetadata = (overrides = {}) => ({
  schema: "pupu.tool_call_ref_metadata.v1",
  intent_cursor: cursor(),
  timeline_merge_policy_declared: false,
  original_arguments_declared: false,
  ...overrides,
});

const frame = (type, payload = {}, overrides = {}) => ({
  seq: 1,
  ts: 100,
  run_id: "attempt-a",
  type,
  payload,
  ...overrides,
});

const invocationFrame = (type, payload = {}, descriptor = ref(), overrides = {}) =>
  frame(type, { ...payload, call_ref: descriptor }, overrides);

const descriptorFromVector = (vector) => ({
  ...contractVectors.base,
  ...vector.overrides,
  intent_cursor: {
    ...contractVectors.base.intent_cursor,
    ...(vector.overrides.intent_cursor || {}),
  },
});

describe("tool call reference contract", () => {
  test.each(contractVectors.descriptor_vectors)(
    "shared descriptor vector: $name",
    (vector) => {
      const descriptor = descriptorFromVector(vector);
      const validation = validateToolCallRef(descriptor);
      expect(validation.valid).toBe(vector.valid);
      expect(vector.valid ? validation.value : undefined).toEqual(
        vector.valid ? descriptor : undefined,
      );
    },
  );
  test("accepts only the closed v1 descriptor and its exact closed cursor", () => {
    const descriptor = ref({ iteration: 2, toolkit_id: "builtin.web" });
    expect(validateToolCallRef(descriptor)).toEqual({
      valid: true,
      value: descriptor,
    });

    expect(
      validateToolCallRef({ ...descriptor, timeline_merge_policy: "always" })
        .valid,
    ).toBe(false);
    expect(
      validateToolCallRef({
        ...descriptor,
        intent_cursor: { ...cursor(), generation: 1 },
      }).valid,
    ).toBe(false);
  });

  test.each([
    ["unknown descriptor schema", ref({ schema: "pupu.tool_call_ref.v2" })],
    ["blank owner", ref({ execution_id: " " })],
    ["null optional iteration", ref({ iteration: null })],
    ["boolean iteration", ref({ iteration: true })],
    ["unsafe iteration", ref({ iteration: Number.MAX_SAFE_INTEGER + 1 })],
    ["zero cursor", ref({ intent_cursor: cursor(0) })],
    ["boolean cursor sequence", ref({ intent_cursor: cursor(true) })],
    ["unsafe cursor sequence", ref({ intent_cursor: cursor(Number.MAX_SAFE_INTEGER + 1) })],
    ["blank cursor event", ref({ intent_cursor: cursor(7, " ") })],
  ])("rejects %s without coercion", (_label, descriptor) => {
    expect(validateToolCallRef(descriptor).valid).toBe(false);
  });
});

describe("logical tool-call lifecycle projection", () => {
  test("admits legacy approval evidence only through one exact scoped request owner", () => {
    const sourceFrames = [
      frame("tool_call", {
        call_id: "legacy-call",
        tool_name: "web_fetch",
        confirmation_id: "legacy-request",
        timeline_merge_policy: "approved",
        arguments: { url: "original" },
      }, { iteration: 0, session_id: "session-a" }),
      frame("interaction.requested", {
        interaction_id: "legacy-request",
        request_source_run_id: "attempt-a",
        request_kind: "tool_approval",
      }, { iteration: 0, session_id: "session-a" }),
      frame("tool_confirmed", {
        call_id: "legacy-call",
        tool_name: "web_fetch",
        confirmation_id: "legacy-request",
        synthetic: true,
      }, { seq: 3, iteration: 0, session_id: "session-a" }),
      frame("tool_result", {
        call_id: "legacy-call",
        tool_name: "web_fetch",
        status: "success",
        result: "done",
      }, { seq: 4, iteration: 0, session_id: "session-a" }),
    ];
    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls).toHaveLength(1);
    expect(projection.calls[0]).toMatchObject({
      key: "legacy:0",
      anchorFrameIndex: 0,
      identity: {
        status: "legacy",
        callId: "legacy-call",
        toolName: "web_fetch",
        originalAttemptId: "attempt-a",
        sessionId: "session-a",
        iteration: 0,
      },
      policy: { present: true, status: "present", value: "approved" },
      originalArguments: { present: true, value: { url: "original" } },
      state: { feedback: "approved", execution: "completed" },
      frameIndexes: [0, 1, 2, 3],
      callFrameIndexes: [0],
      feedbackFrameIndexes: [2],
      resultFrameIndexes: [3],
    });
    expect(projection.calls[0].identity).not.toHaveProperty("executionId");
    expect(projection.calls[0].identity).not.toHaveProperty("intentCursor");
    expect(projection.evidenceOwnership.map(({ frameIndex, callKey }) => [frameIndex, callKey]))
      .toEqual([0, 1, 2, 3].map((index) => [index, "legacy:0"]));
  });

  test("does not admit a legacy owner with contradictory scope or request bindings", () => {
    const call = frame("tool_call", {
      call_id: "legacy-call",
      tool_name: "web_fetch",
      confirmation_id: "request-a",
    }, { iteration: 0, session_id: "session-a" });
    const conflictingFeedback = frame("tool_confirmed", {
      call_id: "legacy-call",
      tool_name: "web_fetch",
      confirmation_id: "request-b",
    }, { seq: 2, iteration: 0, session_id: "session-a" });
    const foreignResult = frame("tool_result", {
      call_id: "legacy-call",
      tool_name: "web_fetch",
      status: "success",
    }, { seq: 3, iteration: 1, session_id: "session-a" });
    const projection = projectToolCallLifecycle([call, conflictingFeedback, foreignResult]);
    expect(projection.calls).toEqual([]);
    expect(projection.evidenceOwnership).toEqual([]);
    expect(projection.unresolved).toEqual([
      { frameIndex: 0, kind: "tool_call", reason: "legacy_owner_unresolved" },
    ]);
  });

  test.each([
    ["plain observation", {} , true],
    ["matching cursor", { intent_cursor: cursor() }, true],
    ["null cursor", { intent_cursor: null }, false],
    ["foreign cursor", { intent_cursor: cursor(8, "foreign-event") }, false],
    ["foreign attempt", { original_attempt_id: "attempt-b" }, false],
    ["foreign execution", { execution_id: "execution-b" }, false],
  ])("validates %s provenance before legacy observation ownership", (_label, observationPayload, admitted) => {
    const anchor = frame("tool_call", {
      call_id: "legacy-call",
      tool_name: "web_fetch",
      intent_cursor: cursor(),
    }, { execution_id: "execution-a" });
    const observation = frame("observation", {
      ...observationPayload,
    }, { seq: 2, execution_id: "execution-a" });

    const projection = projectToolCallLifecycle([anchor, observation]);
    const observationOwnership = projection.evidenceOwnership.find(({ frameIndex }) => frameIndex === 1);
    expect(Boolean(observationOwnership)).toBe(admitted);
    expect(projection.calls).toHaveLength(1);
  });

  test("upgrades a legacy anchor in place when later qualified evidence binds the same request", () => {
    const original = frame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-a",
      timeline_merge_policy: "never",
      arguments: { url: "original" },
    }, {
      event_id: "intent-event-7",
      iteration: 0,
      session_id: "session-a",
      execution_id: "execution-a",
    });
    const enriched = invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-a",
      timeline_merge_policy: "never",
      arguments: { url: "resumed" },
    }, ref({ iteration: 0 }), {
      seq: 2,
      event_id: "intent-event-7",
      iteration: 0,
      session_id: "session-a",
      execution_id: "execution-a",
    });
    const projection = projectToolCallLifecycle([original, enriched]);
    expect(projection.calls).toHaveLength(1);
    expect(projection.calls[0]).toMatchObject({
      anchorFrameIndex: 0,
      frameIndexes: [0, 1],
      callFrameIndexes: [0, 1],
      identity: { status: "qualified", callId: "call-a" },
      scope: { executionId: "execution-a", sessionId: "session-a", iteration: 0 },
      policy: { present: true, value: "never" },
      originalArguments: { present: true, value: { url: "original" } },
    });
    expect(projection.evidenceOwnership.map(({ frameIndex, callKey }) => [frameIndex, callKey]))
      .toEqual([[0, projection.calls[0].key], [1, projection.calls[0].key]]);
  });

  test.each([
    ["session", { legacySession: "session-old", qualifiedSession: "session-new" }],
    ["execution", { legacyExecution: "execution-old", qualifiedExecution: "execution-a" }],
    ["feedback", { legacyDecision: "denied", qualifiedDecision: "approved" }],
    ["policy", { legacyPolicy: "never", qualifiedPolicy: "always" }],
    ["original arguments", {
      legacyArguments: { url: "edited" },
      qualifiedArguments: { url: "canonical" },
    }],
  ])("does not enrich a qualified owner across contradictory %s evidence", (_label, config) => {
    const sessionId = config.legacySession || config.qualifiedSession || "session-a";
    const legacy = frame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-a",
      timeline_merge_policy: config.legacyPolicy || "always",
      arguments: config.legacyArguments || { url: "canonical" },
    }, {
      event_id: "intent-event-7",
      iteration: 0,
      session_id: config.legacySession || sessionId,
      execution_id: config.legacyExecution || "execution-a",
    });
    const sourceFrames = [legacy];
    if (config.legacyDecision) {
      sourceFrames.push(frame(
        config.legacyDecision === "approved" ? "tool_confirmed" : "tool_denied",
        {
          call_id: "call-a",
          tool_name: "web_fetch",
          confirmation_id: "confirm-a",
        },
        {
          seq: 2,
          iteration: 0,
          session_id: config.legacySession || sessionId,
          execution_id: config.legacyExecution || "execution-a",
        },
      ));
    }
    const metadata = refMetadata({
      timeline_merge_policy_declared: true,
      timeline_merge_policy: config.qualifiedPolicy || "always",
      original_arguments_declared: true,
      original_arguments: config.qualifiedArguments || { url: "canonical" },
    });
    sourceFrames.push(invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-a",
      timeline_merge_policy: config.qualifiedPolicy || "always",
      call_ref_metadata: metadata,
    }, ref({ iteration: 0 }), {
      seq: sourceFrames.length + 1,
      event_id: "intent-event-7",
      iteration: 0,
      session_id: config.qualifiedSession || sessionId,
      execution_id: config.qualifiedExecution || "execution-a",
    }));
    if (config.qualifiedDecision) {
      sourceFrames.push(invocationFrame(
        config.qualifiedDecision === "approved" ? "tool_confirmed" : "tool_denied",
        {
          call_id: "call-a",
          tool_name: "web_fetch",
          confirmation_id: "confirm-a",
        },
        ref({ iteration: 0 }),
        { seq: sourceFrames.length + 1, iteration: 0, session_id: sessionId },
      ));
    }

    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls).toHaveLength(2);
    expect(projection.calls.map((call) => call.identity.status).sort())
      .toEqual(["legacy", "qualified"]);
  });

  test.each([
    ["null", null],
    ["extra key", { ...cursor(), unexpected: true }],
    ["foreign", cursor(8, "foreign-intent")],
  ])("rejects legacy feedback with a present invalid or foreign intent cursor (%s)", (_label, badCursor) => {
    const call = frame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-a",
      intent_cursor: cursor(),
    }, { iteration: 0 });
    const feedback = frame("tool_confirmed", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-a",
      intent_cursor: badCursor,
    }, { seq: 2, iteration: 0 });

    const projection = projectToolCallLifecycle([call, feedback]);

    expect(projection.calls).toEqual([]);
    expect(projection.unresolved).toEqual([
      expect.objectContaining({ frameIndex: 0, kind: "tool_call" }),
    ]);
  });

  test.each([
    ["tool_confirmed", { synthetic: true }, "approved"],
    ["tool_denied", { synthetic: true }, "denied"],
    ["tool_confirmed", { synthetic: true, user_response: { value: "Paris" } }, "answered"],
  ])("preserves legacy post-ack %s semantics without an execution result", (type, extra, outcome) => {
    const sourceFrames = [
      frame("tool_call", {
        call_id: "legacy-call",
        tool_name: "web_fetch",
        confirmation_id: "legacy-request",
      }),
      frame(type, {
        call_id: "legacy-call",
        tool_name: "web_fetch",
        confirmation_id: "legacy-request",
        ...extra,
      }, { seq: 2 }),
    ];
    const projection = projectToolCallLifecycle(sourceFrames);
    expect(projection.calls).toHaveLength(1);
    expect(projection.calls[0].state).toEqual({ feedback: outcome, execution: "unknown" });
    expect(projection.calls[0].tentativeFeedbackFrameIndexes).toEqual([]);
  });

  test.each([
    ["missing exact request binding", (payload) => { delete payload.confirmation_id; }],
    ["foreign linked call", (_payload, links) => { links.tool_call_id = "other-call"; }],
    ["negative acknowledgement", (payload) => { payload.feedback_acknowledged = false; }],
    ["tentative marker", (payload) => { payload.tentative = true; }],
    ["optimistic marker", (payload) => { payload.optimistic = true; }],
  ])("fails closed for legacy feedback with %s", (_label, mutate) => {
    const call = frame("tool_call", {
      call_id: "legacy-call",
      tool_name: "web_fetch",
      confirmation_id: "legacy-request",
    });
    const payload = {
      call_id: "legacy-call",
      tool_name: "web_fetch",
      confirmation_id: "legacy-request",
      synthetic: true,
    };
    const links = {};
    mutate(payload, links);
    const feedback = frame("tool_confirmed", payload, { seq: 2, links });
    const projection = projectToolCallLifecycle([call, feedback]);
    expect(projection.calls).toEqual([]);
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test("projects one exact owner across request, approval, resumed call, and result", () => {
    const sourceFrames = [
      invocationFrame("tool_call", {
        call_id: "call-a",
        tool_name: "web_fetch",
        confirmation_id: "confirm-a",
        timeline_merge_policy: "approved",
        runtime_event_id: "intent-event-7",
        call_ref_metadata: refMetadata({
          timeline_merge_policy_declared: true,
          timeline_merge_policy: "approved",
          original_arguments_declared: true,
          original_arguments: { url: "https://example.invalid/a" },
        }),
        arguments: { url: "https://example.invalid/a" },
      }),
      invocationFrame(
        "tool_confirmed",
        { call_id: "call-a", confirmation_id: "confirm-a", synthetic: true },
      ),
      invocationFrame("tool_call", {
        call_id: "call-a",
        tool_name: "web_fetch",
        arguments: { url: "https://example.invalid/a" },
      }, ref({ iteration: 1, toolkit_id: "builtin.web" }), { seq: 3, iteration: 1 }),
      invocationFrame("tool_result", {
        call_id: "call-a",
        tool_name: "web_fetch",
        status: "success",
        result: { title: "A" },
      }, ref({ iteration: 1, toolkit_id: "builtin.web" }), { seq: 4, iteration: 1 }),
    ];
    const snapshot = JSON.stringify(sourceFrames);

    const projection = projectToolCallLifecycle(sourceFrames, {
      acknowledgedSyntheticFeedbackIndexes: [1],
    });

    expect(projection.calls).toHaveLength(1);
    expect(projection.calls[0]).toMatchObject({
      key: expect.any(String),
      identity: {
        status: "qualified",
        executionId: "execution-a",
        originalAttemptId: "attempt-a",
        callId: "call-a",
        toolName: "web_fetch",
        iteration: 1,
        toolkitId: "builtin.web",
      },
      state: { feedback: "approved", execution: "completed" },
      frameIndexes: [0, 1, 2, 3],
      callFrameIndexes: [0, 2],
      feedbackFrameIndexes: [1],
      resultFrameIndexes: [3],
    });
    expect(projection.calls[0].policy).toEqual({ present: true, status: "present", value: "approved" });
    expect(projection.calls[0].originalArguments).toEqual({
      present: true,
      value: { url: "https://example.invalid/a" },
    });
    expect(projection.calls[0].identity).not.toHaveProperty("policy");
    expect(projection.displayAnchors.map(({ frameIndex, callKey }) => ({ frameIndex, callKey }))).toEqual([
      { frameIndex: 0, callKey: projection.calls[0].key },
      { frameIndex: 1, callKey: projection.calls[0].key },
      { frameIndex: 2, callKey: projection.calls[0].key },
      { frameIndex: 3, callKey: projection.calls[0].key },
    ]);
    expect(projection.evidenceOwnership).toEqual([
      { frameIndex: 0, callKey: projection.calls[0].key, kind: "call" },
      { frameIndex: 1, callKey: projection.calls[0].key, kind: "feedback" },
      { frameIndex: 2, callKey: projection.calls[0].key, kind: "call" },
      { frameIndex: 3, callKey: projection.calls[0].key, kind: "result" },
    ]);
    expect(JSON.stringify(sourceFrames)).toBe(snapshot);
    expect(projection.calls[0].callFrameIndexes.map((index) => sourceFrames[index].payload.arguments?.url))
      .toEqual(["https://example.invalid/a", "https://example.invalid/a"]);
  });

  test("rejects non-null linked call and request contradictions while ignoring null placeholders", () => {
    const descriptor = ref();
    const validCall = invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      confirmation_id: "request-a",
      call_ref_metadata: refMetadata(),
    }, descriptor, { links: { tool_call_id: null, interaction_id: null } });
    const linkedCallConflict = {
      ...validCall,
      links: { ...validCall.links, tool_call_id: "foreign-call" },
    };
    const callConflict = projectToolCallLifecycle([linkedCallConflict]);
    expect(callConflict.calls).toEqual([]);
    expect(callConflict.unresolved).toEqual([
      expect.objectContaining({ reason: "linked_call_id_mismatch" }),
    ]);

    const resolved = invocationFrame("interaction.resolved", {
      call_id: "call-a",
      confirmation_id: "request-a",
      outcome: "approved",
    }, descriptor, {
      seq: 2,
      links: { tool_call_id: "call-a", interaction_id: "foreign-request" },
    });
    const bindingConflict = projectToolCallLifecycle([validCall, resolved]);
    expect(bindingConflict.calls).toEqual([]);
    expect(bindingConflict.unresolved.map(({ reason }) => reason)).toContain(
      "interaction_binding_conflict",
    );

    const nullLinked = projectToolCallLifecycle([
      { ...validCall, links: { tool_call_id: null, input_request_id: null } },
    ]);
    expect(nullLinked.calls).toHaveLength(1);
  });

  test("keeps synthetic feedback tentative until an adapter attests its receipt", () => {
    const sourceFrames = [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", requires_confirmation: true,
      }),
      invocationFrame("tool_confirmed", {
        call_id: "call-a", tool_name: "web_fetch", synthetic: true,
      }, ref(), { seq: 2 }),
    ];

    const tentative = projectToolCallLifecycle(sourceFrames);
    const acknowledged = projectToolCallLifecycle(sourceFrames, {
      acknowledgedSyntheticFeedbackIndexes: [1],
    });

    expect(tentative.calls[0].state.feedback).not.toBe("approved");
    expect(tentative.calls[0].tentativeFeedbackFrameIndexes).toEqual([1]);
    expect(acknowledged.calls[0].state.feedback).toBe("approved");
    expect(acknowledged.calls[0].feedbackFrameIndexes).toContain(1);
  });

  test("treats a confirmed human response as answered", () => {
    const sourceFrames = [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "ask_user", requires_confirmation: true,
      }, ref({ tool_name: "ask_user" })),
      invocationFrame("tool_confirmed", {
        call_id: "call-a", tool_name: "ask_user", user_response: "Paris",
      }, ref({ tool_name: "ask_user" }), { seq: 2 }),
    ];

    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls[0].state.feedback).toBe("answered");
  });

  test("does not count a synthetic human response as answered until acknowledged", () => {
    const sourceFrames = [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "ask_user", requires_confirmation: true,
      }, ref({ tool_name: "ask_user" })),
      invocationFrame("tool_confirmed", {
        call_id: "call-a", tool_name: "ask_user", user_response: "Paris", synthetic: true,
      }, ref({ tool_name: "ask_user" }), { seq: 2 }),
    ];

    const tentative = projectToolCallLifecycle(sourceFrames);
    const acknowledged = projectToolCallLifecycle(sourceFrames, {
      acknowledgedSyntheticFeedbackIndexes: [1],
    });

    expect(tentative.calls[0].state.feedback).toBe("pending");
    expect(tentative.calls[0].tentativeFeedbackFrameIndexes).toEqual([1]);
    expect(acknowledged.calls[0].state.feedback).toBe("answered");
  });

  test("copies descriptor cursors into validation and projection outputs", () => {
    const descriptor = ref();
    const event = invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
    }, descriptor);

    const validation = validateToolCallRef(descriptor);
    validation.value.intent_cursor.event_id = "changed-validation-output";
    const projection = projectToolCallLifecycle([event]);
    projection.calls[0].identity.intentCursor.event_id = "changed-projection-output";

    expect(descriptor.intent_cursor.event_id).toBe("intent-event-7");
    expect(event.payload.call_ref.intent_cursor.event_id).toBe("intent-event-7");
  });

  test("keeps unknown iteration absent instead of defaulting it", () => {
    const event = invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
    }, ref());

    const projection = projectToolCallLifecycle([event]);

    expect(projection.calls[0].identity).not.toHaveProperty("iteration");
  });

  test("does not inherit policy from a later resumed call", () => {
    const sourceFrames = [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", runtime_event_id: "intent-event-7",
      }),
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", timeline_merge_policy: "always",
        runtime_event_id: "resume-event-8",
      }, ref({ iteration: 1 }), { seq: 2, iteration: 1 }),
    ];

    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls[0].policy).toEqual({ present: false, status: "unknown" });
  });

  test("keeps original-argument absence separate from an old descriptor", () => {
    const projection = projectToolCallLifecycle([
      invocationFrame("tool_call", { call_id: "call-a", tool_name: "web_fetch" }),
    ]);

    expect(projection.calls[0].policy).toEqual({ present: false, status: "unknown" });
    expect(projection.calls[0].originalArguments).toEqual({ status: "unknown" });
  });

  test("keeps reused call IDs from different attempts distinct", () => {
    const first = invocationFrame("tool_call", { call_id: "reused", tool_name: "read" }, ref({ call_id: "reused", tool_name: "read" }));
    const second = invocationFrame(
      "tool_call",
      { call_id: "reused", tool_name: "read" },
      ref({ original_attempt_id: "attempt-b", intent_cursor: cursor(8, "intent-event-8"), call_id: "reused", tool_name: "read" }),
      { run_id: "attempt-b", seq: 2 },
    );

    const projection = projectToolCallLifecycle([first, second]);

    expect(projection.calls).toHaveLength(2);
    expect(projection.calls.map((call) => call.identity.originalAttemptId)).toEqual([
      "attempt-a",
      "attempt-b",
    ]);
  });

  test.each([
    ["event attempt", { run_id: "foreign-attempt" }],
    ["iteration", { descriptor: ref({ iteration: 2 }), frame: { iteration: 1 } }],
    ["toolkit", {
      descriptor: ref({ toolkit_id: "other-toolkit" }),
      payload: { toolkit_id: "builtin.web" },
    }],
  ])("keeps a contradictory %s descriptor visible and unqualified", (_label, mismatch) => {
    const descriptor = mismatch.descriptor || ref();
    const eventFrame = invocationFrame(
      "tool_call",
      { call_id: "call-a", tool_name: "web_fetch", ...(mismatch.payload || {}) },
      descriptor,
      mismatch.frame || (mismatch.payload ? {} : mismatch),
    );

    const projection = projectToolCallLifecycle([eventFrame]);

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved).toHaveLength(1);
    expect(projection.unresolved[0]).toMatchObject({ frameIndex: 0, kind: "tool_call" });
  });

  test("a payload tool contradiction disqualifies the entire explicit owner group", () => {
    const owner = ref();
    const first = invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
    }, owner);
    const contradictory = invocationFrame("tool_result", {
      call_id: "call-a",
      tool_name: "read_file",
      status: "success",
    }, owner, { seq: 2 });

    const projection = projectToolCallLifecycle([first, contradictory]);

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved.map(({ frameIndex }) => frameIndex)).toEqual([0, 1]);
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test("a descriptor conflict invalidates every frame for that immutable owner", () => {
    const first = invocationFrame(
      "tool_call",
      { call_id: "call-a", tool_name: "web_fetch" },
      ref(),
    );
    const second = invocationFrame(
      "tool_call",
      { call_id: "call-a", tool_name: "other_tool" },
      ref({ tool_name: "other_tool" }),
      { seq: 2 },
    );

    const projection = projectToolCallLifecycle([first, second]);

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved.map(({ frameIndex, reason }) => [frameIndex, reason])).toEqual([
      [0, "descriptor_conflict"],
      [1, "descriptor_conflict"],
    ]);
  });

  test.each([
    ["attempt", { original_attempt_id: "attempt-b" }],
    ["intent cursor", { intent_cursor: cursor(8, "foreign-intent") }],
    ["blank toolkit identity", { toolkit_id: "" }],
    ["null toolkit identity", { toolkit_id: null }],
  ])("rejects a contradictory payload %s", (_label, contradiction) => {
    const call = invocationFrame("tool_call", {
      call_id: "call-a", tool_name: "web_fetch", ...contradiction,
    });
    const projection = projectToolCallLifecycle([call]);

    expect(projection.calls).toEqual([]);
    expect(projection.unresolved).toHaveLength(1);
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test("rejects conflicting request digests and payload session scope", () => {
    const call = invocationFrame("tool_call", {
      call_id: "call-a", tool_name: "web_fetch", confirmation_id: "request-a",
      request_digest: "digest-a", session_id: "session-a",
    });
    const feedback = invocationFrame("tool_confirmed", {
      call_id: "call-a", tool_name: "web_fetch", confirmation_id: "request-a",
      request_digest: "digest-b", session_id: "session-b",
    }, ref(), { seq: 2 });

    const projection = projectToolCallLifecycle([call, feedback]);

    expect(projection.calls).toEqual([]);
    expect(projection.unresolved.map(({ frameIndex }) => frameIndex)).toEqual([0, 1]);
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test.each([
    ["requested/resolved interaction IDs", [
      invocationFrame("tool_call", { call_id: "call-a", tool_name: "web_fetch" }),
      invocationFrame("interaction.requested", { interaction_id: "request-a" }, ref(), { seq: 2 }),
      invocationFrame("interaction.resolved", { interaction_id: "request-b", outcome: "approved" }, ref(), { seq: 3 }),
    ]],
    ["feedback confirmation IDs", [
      invocationFrame("tool_call", { call_id: "call-a", tool_name: "web_fetch" }),
      invocationFrame("tool_confirmed", { confirmation_id: "request-a" }, ref(), { seq: 2 }),
      invocationFrame("tool_confirmed", { confirmation_id: "request-b" }, ref(), { seq: 3 }),
    ]],
    ["approval and denial", [
      invocationFrame("tool_call", { call_id: "call-a", tool_name: "web_fetch", confirmation_id: "request-a" }),
      invocationFrame("tool_confirmed", { confirmation_id: "request-a" }, ref(), { seq: 2 }),
      invocationFrame("tool_denied", { confirmation_id: "request-a" }, ref(), { seq: 3 }),
    ]],
    ["distinct submitted responses", [
      invocationFrame("tool_call", { call_id: "call-a", tool_name: "ask_user", confirmation_id: "request-a" }, ref({ tool_name: "ask_user" })),
      invocationFrame("tool_confirmed", { confirmation_id: "request-a", user_response: "answer-a" }, ref({ tool_name: "ask_user" }), { seq: 2 }),
      invocationFrame("interaction.resolved", { interaction_id: "request-a", outcome: "submitted", response: "answer-b" }, ref({ tool_name: "ask_user" }), { seq: 3 }),
    ]],
  ])("leaves conflicting %s evidence visible and unqualified", (_label, sourceFrames) => {
    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls).toEqual([]);
    expect(projection.unresolved.map(({ frameIndex }) => frameIndex)).toEqual(
      sourceFrames.map((_frame, frameIndex) => frameIndex),
    );
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test.each([
    ["payload iteration", [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", iteration: 2,
      }, ref({ iteration: 1 })),
    ]],
    ["payload execution", [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", execution_id: "execution-b",
      }, ref()),
    ]],
    ["iteration learned later", [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", iteration: 2,
      }, ref({ iteration: 1 })),
      invocationFrame("tool_result", {
        call_id: "call-a", tool_name: "web_fetch",
      }, ref({ iteration: 1 }), { seq: 2, iteration: 1 }),
    ]],
    ["toolkit learned later", [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", toolkit_id: "other-toolkit",
      }, ref()),
      invocationFrame("tool_result", {
        call_id: "call-a", tool_name: "web_fetch",
      }, ref({ toolkit_id: "builtin.web" }), { seq: 2 }),
    ]],
    ["confirmation binding", [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch", confirmation_id: "request-a",
      }, ref()),
      invocationFrame("tool_confirmed", {
        call_id: "call-a", tool_name: "web_fetch", confirmation_id: "foreign-request",
      }, ref(), { seq: 2 }),
    ]],
    ["session scope", [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "web_fetch",
      }, ref(), { session_id: "session-a" }),
      invocationFrame("tool_result", {
        call_id: "call-a", tool_name: "web_fetch",
      }, ref(), { seq: 2, session_id: "session-b" }),
    ]],
  ])("rejects %s contradictions across all owner evidence", (_label, sourceFrames) => {
    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved.map(({ frameIndex }) => frameIndex)).toEqual(
      sourceFrames.map((_frame, frameIndex) => frameIndex),
    );
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test("treats equivalent confirmed-response and submitted interaction evidence as answered", () => {
    const sourceFrames = [
      invocationFrame("tool_call", {
        call_id: "call-a", tool_name: "ask_user", confirmation_id: "request-a",
      }, ref({ tool_name: "ask_user" })),
      invocationFrame("tool_confirmed", {
        call_id: "call-a", tool_name: "ask_user", confirmation_id: "request-a", user_response: ["Paris"],
      }, ref({ tool_name: "ask_user" }), { seq: 2 }),
      invocationFrame("interaction.resolved", {
        outcome: "submitted", response: ["Paris"],
      }, ref({ tool_name: "ask_user" }), { seq: 3 }),
    ];

    const projection = projectToolCallLifecycle(sourceFrames);

    expect(projection.calls).toHaveLength(1);
    expect(projection.calls[0].state.feedback).toBe("answered");
  });

  test("keeps an orphan explicit result visible and unresolved", () => {
    const orphan = invocationFrame("tool_result", {
      call_id: "call-a",
      tool_name: "web_fetch",
      result: "visible orphan",
    });

    const projection = projectToolCallLifecycle([orphan]);

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved).toEqual([
      expect.objectContaining({ frameIndex: 0, kind: "tool_result" }),
    ]);
    expect(projection.evidenceOwnership).toEqual([]);
  });

  test("rejects known foreign execution scope", () => {
    const event = invocationFrame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
    });

    const projection = projectToolCallLifecycle([event], {
      executionId: "execution-b",
    });

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved).toEqual([
      expect.objectContaining({ frameIndex: 0, reason: "execution_scope_mismatch" }),
    ]);
  });

  test("an invalid explicit reference never downgrades to legacy linking", () => {
    const first = frame("tool_call", {
      call_id: "call-a",
      tool_name: "web_fetch",
      call_ref: { ...ref(), unknown: true },
    });
    const second = frame("tool_result", {
      call_id: "call-a",
      tool_name: "web_fetch",
      result: "kept visible",
    }, { seq: 2 });

    const projection = projectToolCallLifecycle([first, second]);

    expect(projection.calls).toHaveLength(0);
    expect(projection.unresolved).toEqual([
      expect.objectContaining({ frameIndex: 0, reason: "invalid_explicit_ref" }),
    ]);
    expect(projection.evidenceOwnership).toEqual([]);
  });
});
