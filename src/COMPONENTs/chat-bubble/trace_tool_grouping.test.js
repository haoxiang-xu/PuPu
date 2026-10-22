import {
  groupToolTimelineItems,
  getToolGroupingIdentity,
} from "./trace_tool_grouping";
import { projectToolCallLifecycle } from "../../SERVICEs/runtime_events/tool_call_projection";

const frame = (seq, type, payload = {}, runId = "run-a", iteration = 0) => ({
  seq,
  run_id: runId,
  iteration,
  type,
  payload:
    payload.call_ref === undefined && payload.call_ref_metadata === undefined
      ? { timeline_merge_policy: "approved", ...payload }
      : payload,
});

const call = (sourceFrame, title = sourceFrame.payload.tool_name) => ({
  key: `${sourceFrame.seq}-tool`,
  title,
  span: `${sourceFrame.seq}ms`,
  status: "done",
  _sourceFrame: sourceFrame,
  _toolGrouping: getToolGroupingIdentity(sourceFrame),
  _sections: [{ heading: "args", pairs: [{ key: "path", value: String(sourceFrame.payload.arguments?.path || "") }] }],
});

const observation = (sourceFrame) => ({
  key: `${sourceFrame.seq}-observation`,
  title: "Observation",
  span: `${sourceFrame.seq}ms`,
  status: "done",
  body: `body-${sourceFrame.seq}`,
  details: `details-${sourceFrame.seq}`,
  _sourceFrame: sourceFrame,
  _toolOutput: true,
  _outputCallId: sourceFrame.payload?.call_id,
});

const groupAt = (items, index = 0) => items[index]?._toolGroup;

const explicitRef = ({ callId, seq, iteration = 0, toolName = "web_fetch" }) => ({
  schema: "pupu.tool_call_ref.v1",
  execution_id: "execution-a",
  original_attempt_id: "run-a",
  call_id: callId,
  tool_name: toolName,
  intent_cursor: {
    schema: "unchain.event_cursor.v1",
    store_seq: seq,
    event_id: `intent-${seq}`,
  },
  iteration,
  toolkit_id: "core",
});

describe("Trace tool grouping", () => {
  test("applies the four feedback policies across none, approved, pending, rejected, and answered states", () => {
    const expected = {
      never: [false, false, false, false, false],
      no_feedback: [true, false, false, false, false],
      approved: [true, true, false, false, false],
      always: [true, true, true, true, true],
    };
    const states = ["none", "approved", "pending", "rejected", "answered"];

    Object.entries(expected).forEach(([policy, outcomes]) => {
      states.forEach((state, stateIndex) => {
        const first = frame(1, "tool_call", {
          call_id: `${policy}-${state}-1`,
          tool_name: "web_fetch",
          toolkit_id: "core",
          timeline_merge_policy: policy,
          ...(state === "none"
            ? {}
            : {
                confirmation_id: `confirm-${policy}-${state}-1`,
                requires_confirmation: true,
                interact_type: state === "answered" ? "selection" : "confirmation",
              }),
        });
        const second = frame(4, "tool_call", {
          ...first.payload,
          call_id: `${policy}-${state}-2`,
          confirmation_id:
            state === "none" ? undefined : `confirm-${policy}-${state}-2`,
        });
        const feedback = (source, suffix) =>
          frame(source.seq + 1, state === "rejected" ? "tool_denied" : "tool_confirmed", {
            call_id: source.payload.call_id,
            tool_name: "web_fetch",
            confirmation_id: source.payload.confirmation_id,
            ...(state === "answered" ? { response: ["choice"] } : {}),
          });
        const completed = state === "approved" || state === "none";
        const firstResult = completed
          ? frame(3, "tool_result", {
              call_id: first.payload.call_id,
              tool_name: "web_fetch",
              toolkit_id: "core",
            })
          : null;
        const secondResult = completed
          ? frame(6, "tool_result", {
              call_id: second.payload.call_id,
              tool_name: "web_fetch",
              toolkit_id: "core",
            })
          : null;
        const firstFeedback =
          state === "none" || state === "pending" ? null : feedback(first, "1");
        const secondFeedback =
          state === "none" || state === "pending" ? null : feedback(second, "2");
        const frames = [
          first,
          ...(firstFeedback ? [firstFeedback] : []),
          ...(firstResult ? [firstResult] : []),
          second,
          ...(secondFeedback ? [secondFeedback] : []),
          ...(secondResult ? [secondResult] : []),
        ];
        const grouped = groupToolTimelineItems([call(first), call(second)], frames);

        expect(Boolean(groupAt(grouped))).toBe(outcomes[stateIndex]);
      });
    });
  });

  test("denied feedback remains a barrier even if a later confirmation reuses its identity", () => {
    const deniedCall = frame(1, "tool_call", {
      call_id: "denied-then-approved",
      tool_name: "web_fetch",
      toolkit_id: "core",
      timeline_merge_policy: "approved",
      confirmation_id: "confirm-contradiction",
      requires_confirmation: true,
    });
    const denied = frame(2, "tool_denied", {
      call_id: "denied-then-approved",
      tool_name: "web_fetch",
      confirmation_id: "confirm-contradiction",
    });
    const contradictoryApproval = frame(3, "tool_confirmed", {
      call_id: "denied-then-approved",
      tool_name: "web_fetch",
      confirmation_id: "confirm-contradiction",
    });
    const deniedResult = frame(4, "tool_result", {
      call_id: "denied-then-approved",
      tool_name: "web_fetch",
      toolkit_id: "core",
    });
    const nextCall = frame(5, "tool_call", {
      ...deniedCall.payload,
      call_id: "following-call",
      confirmation_id: "confirm-following",
    });
    const nextConfirmed = frame(6, "tool_confirmed", {
      call_id: "following-call",
      tool_name: "web_fetch",
      confirmation_id: "confirm-following",
    });
    const nextResult = frame(7, "tool_result", {
      call_id: "following-call",
      tool_name: "web_fetch",
      toolkit_id: "core",
    });

    const grouped = groupToolTimelineItems(
      [call(deniedCall), call(nextCall)],
      [deniedCall, denied, contradictoryApproval, deniedResult, nextCall, nextConfirmed, nextResult],
    );

    expect(groupAt(grouped)).toBeUndefined();
  });

  test("duplicate approval proofs remain a barrier in approved mode", () => {
    const first = frame(1, "tool_call", {
      call_id: "duplicate-proof-a",
      tool_name: "web_fetch",
      toolkit_id: "core",
      timeline_merge_policy: "approved",
      confirmation_id: "duplicate-proof-confirm-a",
      requires_confirmation: true,
    });
    const confirmed = frame(2, "tool_confirmed", {
      call_id: first.payload.call_id,
      tool_name: "web_fetch",
      confirmation_id: first.payload.confirmation_id,
    });
    const duplicateConfirmed = frame(3, "tool_confirmed", {
      call_id: first.payload.call_id,
      tool_name: "web_fetch",
      confirmation_id: first.payload.confirmation_id,
    });
    const result = frame(4, "tool_result", {
      call_id: first.payload.call_id,
      tool_name: "web_fetch",
      toolkit_id: "core",
    });
    const second = frame(5, "tool_call", {
      ...first.payload,
      call_id: "duplicate-proof-b",
      confirmation_id: "duplicate-proof-confirm-b",
    });
    const secondConfirmed = frame(6, "tool_confirmed", {
      call_id: second.payload.call_id,
      tool_name: "web_fetch",
      confirmation_id: second.payload.confirmation_id,
    });
    const secondResult = frame(7, "tool_result", {
      call_id: second.payload.call_id,
      tool_name: "web_fetch",
      toolkit_id: "core",
    });

    const grouped = groupToolTimelineItems(
      [call(first), call(second)],
      [first, confirmed, duplicateConfirmed, result, second, secondConfirmed, secondResult],
    );

    expect(groupAt(grouped)).toBeUndefined();
  });

  test("marks groups feedback-bearing from scoped ownership evidence", () => {
    const first = frame(1, "tool_call", {
      call_id: "feedback-a",
      tool_name: "web_fetch",
      toolkit_id: "core",
      timeline_merge_policy: "always",
      confirmation_id: "confirm-feedback-a",
    });
    const firstFeedback = frame(2, "tool_confirmed", {
      call_id: "feedback-a",
      tool_name: "web_fetch",
      confirmation_id: "confirm-feedback-a",
    });
    const second = frame(3, "tool_call", {
      ...first.payload,
      call_id: "feedback-b",
      confirmation_id: "confirm-feedback-b",
    });
    const secondFeedback = frame(4, "tool_confirmed", {
      call_id: "feedback-b",
      tool_name: "web_fetch",
      confirmation_id: "confirm-feedback-b",
    });
    const firstItem = call(first);
    const secondItem = call(second);
    firstItem._toolGrouping = { ...firstItem._toolGrouping, hasFeedback: false };
    secondItem._toolGrouping = { ...secondItem._toolGrouping, hasFeedback: false };

    const grouped = groupToolTimelineItems(
      [firstItem, secondItem],
      [first, firstFeedback, second, secondFeedback],
    );

    expect(groupAt(grouped).hasFeedback).toBe(true);
  });

  test("groups the sanitized representative approved web_fetch sequence without dropping call metadata", () => {
    // Reconstructed representative frontend frames from the sanitized canonical events fixture;
    // these are not the original renderer packets from the screenshot capture.
    const calls = [1, 2, 3].map((index) =>
      frame(index * 4, "tool_call", {
        call_id: `call-${index}`,
        tool_name: "web_fetch",
        toolkit_id: "core",
        timeline_merge_policy: "approved",
        confirmation_id: `confirm-call-${index}`,
        requires_confirmation: true,
        interact_type: "confirmation",
        arguments: { url: `https://example.invalid/call-${index}` },
      }),
    );
    const frames = calls.flatMap((entry, index) => [
      entry,
      frame(entry.seq + 1, "tool_confirmed", {
        call_id: entry.payload.call_id,
        tool_name: "web_fetch",
        confirmation_id: entry.payload.confirmation_id,
      }),
      frame(entry.seq + 2, "tool_result", {
        call_id: entry.payload.call_id,
        tool_name: "web_fetch",
        toolkit_id: "core",
        result: { status_code: index === 2 ? 200 : 301 },
      }),
    ]);
    const items = calls.map((entry, index) => ({
      ...call(entry),
      body: "Approved",
      _sections: [
        { heading: "args", pairs: [{ key: "url", value: entry.payload.arguments.url }] },
        { heading: "result", pairs: [{ key: "status_code", value: index === 2 ? 200 : 301 }] },
      ],
    }));

    const grouped = groupToolTimelineItems(items, frames);

    expect(groupAt(grouped).calls).toEqual(items);
    expect(groupAt(grouped).calls.map((item) => item._sourceFrame.payload.arguments.url)).toEqual([
      "https://example.invalid/call-1",
      "https://example.invalid/call-2",
      "https://example.invalid/call-3",
    ]);
    expect(groupAt(grouped).memberItems.map((item) => item.body)).toEqual([
      "Approved",
      "Approved",
      "Approved",
    ]);
    expect(groupAt(grouped).memberItems.map((item) => item._sections[1].pairs[0].value)).toEqual([
      301,
      301,
      200,
    ]);
  });

  test("groups equal canonical tools despite different arguments and display aliases", () => {
    const first = frame(1, "tool_call", {
      call_id: "call-1",
      tool_name: " read_file ",
      tool_display_name: "Read a file",
      arguments: { path: "one.txt" },
    });
    const second = frame(2, "tool_call", {
      call_id: "call-2",
      tool_name: "read_file",
      tool_display_name: "File reader",
      arguments: { path: "two.txt" },
    });
    const firstItem = call(first, first.payload.tool_display_name);
    const secondItem = call(second, second.payload.tool_display_name);

    const grouped = groupToolTimelineItems([firstItem, secondItem], [first, second]);

    expect(grouped).toHaveLength(1);
    expect(groupAt(grouped).calls).toEqual([firstItem, secondItem]);
    expect(groupAt(grouped).calls.map((item) => item._sections[0].pairs[0].value)).toEqual([
      "one.txt",
      "two.txt",
    ]);
  });

  test("uses the renderer's acknowledged projection and accepts ACKs that arrive after results", () => {
    const frames = [];
    const calls = [];
    for (let index = 0; index < 3; index += 1) {
      const callId = `late-ack-${index}`;
      const ref = explicitRef({ callId, seq: index * 3 + 1, iteration: index });
      const source = frame(index * 3 + 1, "tool_call", {
        call_id: callId,
        tool_name: "web_fetch",
        toolkit_id: "core",
        requires_confirmation: true,
        confirmation_id: `confirm-${callId}`,
        interact_type: "confirmation",
        call_ref: ref,
        call_ref_metadata: {
          schema: "pupu.tool_call_ref_metadata.v1",
          intent_cursor: ref.intent_cursor,
          timeline_merge_policy_declared: false,
          original_arguments_declared: false,
        },
      }, "run-a", index);
      const result = frame(index * 3 + 2, "tool_result", {
        call_id: callId,
        tool_name: "web_fetch",
        toolkit_id: "core",
        call_ref: ref,
      }, "run-a", index);
      const ack = frame(index * 3 + 3, "tool_confirmed", {
        call_id: callId,
        tool_name: "web_fetch",
        confirmation_id: `confirm-${callId}`,
        synthetic: true,
        call_ref: ref,
      }, "run-a", index);
      frames.push(source, result, ack);
      calls.push(call(source));
    }

    const tentativeProjection = projectToolCallLifecycle(frames);
    const tentativeOwners = new Map(
      tentativeProjection.evidenceOwnership.map(({ frameIndex, callKey }) => [frames[frameIndex], callKey]),
    );
    const tentative = groupToolTimelineItems(calls, frames, {
      lifecycleProjection: tentativeProjection,
      sourceFrames: frames,
      ownerByFrame: tentativeOwners,
    });
    expect(tentative).toHaveLength(3);
    expect(tentative.some((item) => item._toolGroup)).toBe(false);

    const acknowledgedProjection = projectToolCallLifecycle(frames, {
      acknowledgedSyntheticFeedbackIndexes: [2, 5, 8],
    });
    const owners = new Map(
      acknowledgedProjection.evidenceOwnership.map(({ frameIndex, callKey }) => [frames[frameIndex], callKey]),
    );
    const grouped = groupToolTimelineItems(calls, frames, {
      lifecycleProjection: acknowledgedProjection,
      sourceFrames: frames,
      ownerByFrame: owners,
    });
    expect(grouped).toHaveLength(1);
    expect(groupAt(grouped).calls).toEqual(calls);
    expect(groupAt(grouped).hasFeedback).toBe(true);
  });

  test("does not map compressed display indexes onto a different source owner", () => {
    const makeQualifiedCall = (seq, callId, ref = explicitRef({ callId, seq })) =>
      frame(seq, "tool_call", {
        call_id: callId,
        tool_name: "web_fetch",
        timeline_merge_policy: "always",
        arguments: { callId },
        call_ref: ref,
        call_ref_metadata: {
          schema: "pupu.tool_call_ref_metadata.v1",
          intent_cursor: ref.intent_cursor,
          timeline_merge_policy_declared: true,
          timeline_merge_policy: "always",
          original_arguments_declared: true,
          original_arguments: { callId },
        },
      }, "run-a", ref.iteration);
    const aliasA = makeQualifiedCall(1, "index-alias-a");
    const aliasAReplay = makeQualifiedCall(2, "index-alias-a", aliasA.payload.call_ref);
    const callB = makeQualifiedCall(3, "index-alias-b");
    const unqualified = frame(4, "tool_call", {
      call_id: "index-unqualified",
      tool_name: "web_fetch",
      timeline_merge_policy: "always",
      call_ref: null,
    });
    const callC = makeQualifiedCall(5, "index-alias-c");
    const sourceFrames = [aliasA, aliasAReplay, callB, unqualified, callC];
    const projection = projectToolCallLifecycle(sourceFrames);
    const aliasOwner = projection.calls.find(
      (candidate) => candidate.descriptor.call_id === "index-alias-a",
    );
    expect(aliasOwner?.callFrameIndexes).toEqual([0, 1]);
    expect(projection.evidenceOwnership.some((owner) => owner.frameIndex === 3))
      .toBe(false);

    const callBySourceFrameIndex = new Map();
    projection.calls.forEach((candidate) => {
      candidate.callFrameIndexes.forEach((frameIndex) => {
        callBySourceFrameIndex.set(frameIndex, candidate);
      });
    });
    const emittedCalls = new Set();
    const coalescedFrames = sourceFrames.flatMap((sourceFrame, sourceIndex) => {
      const owner = callBySourceFrameIndex.get(sourceIndex);
      if (!owner) return [sourceFrame];
      if (emittedCalls.has(owner.key)) return [];
      emittedCalls.add(owner.key);
      return [{ ...sourceFrame, _lifecycle_call_key: owner.key }];
    });
    const ownerByFrame = new Map(
      projection.evidenceOwnership.map(({ frameIndex, callKey }) => [
        sourceFrames[frameIndex],
        callKey,
      ]),
    );
    const containsUnqualifiedMember = (grouped) =>
      grouped.some((item) =>
        item._toolGroup?.memberItems.some(
          (member) => member._sourceFrame === unqualified,
        ),
      );
    const containsVisibleUnqualifiedCall = (grouped) =>
      grouped.some((item) => item._sourceFrame === unqualified);

    const unshifted = groupToolTimelineItems(
      sourceFrames.map((sourceFrame) => call(sourceFrame)),
      sourceFrames,
      { lifecycleProjection: projection, sourceFrames, ownerByFrame },
    );
    expect(containsUnqualifiedMember(unshifted)).toBe(false);

    const compressed = groupToolTimelineItems(
      coalescedFrames.map((sourceFrame) => call(sourceFrame)),
      coalescedFrames,
      { lifecycleProjection: projection, sourceFrames, ownerByFrame },
    );
    expect(containsUnqualifiedMember(compressed)).toBe(false);
    expect(containsVisibleUnqualifiedCall(compressed)).toBe(true);
  });

  test("valid explicit identity with unknown policy does not inherit the approved grouping default", () => {
    const first = frame(1, "tool_call", {
      call_id: "explicit-a",
      tool_name: "web_fetch",
      toolkit_id: "core",
      call_ref: explicitRef({ callId: "explicit-a", seq: 1 }),
    });
    const second = frame(2, "tool_call", {
      call_id: "explicit-b",
      tool_name: "web_fetch",
      toolkit_id: "core",
      call_ref: explicitRef({ callId: "explicit-b", seq: 2 }),
    });

    const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);

    expect(grouped).toHaveLength(2);
    expect(groupAt(grouped)).toBeUndefined();
  });

  test("legacy calls with unknown policy remain visible without grouping", () => {
    const first = frame(1, "tool_call", {
      call_id: "legacy-unknown-a",
      tool_name: "web_fetch",
    });
    const second = frame(2, "tool_call", {
      call_id: "legacy-unknown-b",
      tool_name: "web_fetch",
    });
    delete first.payload.timeline_merge_policy;
    delete second.payload.timeline_merge_policy;

    const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);

    expect(grouped).toHaveLength(2);
    expect(groupAt(grouped)).toBeUndefined();
  });

  test("invalid explicit references never fall back to legacy call-id grouping", () => {
    const first = frame(1, "tool_call", {
      call_id: "invalid-a",
      tool_name: "web_fetch",
      toolkit_id: "core",
      call_ref: { ...explicitRef({ callId: "invalid-a", seq: 1 }), unexpected: true },
    });
    const second = frame(2, "tool_call", {
      call_id: "invalid-b",
      tool_name: "web_fetch",
      toolkit_id: "core",
      call_ref: { ...explicitRef({ callId: "invalid-b", seq: 2 }), unexpected: true },
    });

    const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);

    expect(grouped).toHaveLength(2);
    expect(groupAt(grouped)).toBeUndefined();
  });

  test("keeps distinct explicit call ownership while folding eligible iterations", () => {
    const first = frame(1, "tool_call", {
      call_id: "iteration-a",
      tool_name: "web_fetch",
      toolkit_id: "core",
      timeline_merge_policy: "always",
      call_ref: explicitRef({ callId: "iteration-a", seq: 1, iteration: 1 }),
      call_ref_metadata: {
        schema: "pupu.tool_call_ref_metadata.v1",
        intent_cursor: explicitRef({ callId: "iteration-a", seq: 1, iteration: 1 }).intent_cursor,
        timeline_merge_policy_declared: true,
        timeline_merge_policy: "always",
        original_arguments_declared: false,
      },
    }, "run-a", 1);
    const secondRef = explicitRef({ callId: "iteration-b", seq: 2, iteration: 2 });
    const second = frame(2, "tool_call", {
      call_id: "iteration-b",
      tool_name: "web_fetch",
      toolkit_id: "core",
      timeline_merge_policy: "always",
      call_ref: secondRef,
      call_ref_metadata: {
        schema: "pupu.tool_call_ref_metadata.v1",
        intent_cursor: secondRef.intent_cursor,
        timeline_merge_policy_declared: true,
        timeline_merge_policy: "always",
        original_arguments_declared: false,
      },
    }, "run-a", 2);

    const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);

    expect(grouped).toHaveLength(1);
    expect(groupAt(grouped).calls.map((item) => item._sourceFrame.iteration)).toEqual([1, 2]);
    expect(groupAt(grouped).calls.map((item) => item._sourceFrame.payload.call_id)).toEqual([
      "iteration-a",
      "iteration-b",
    ]);
  });

  test("uses canonical tool name, toolkit scope, run scope, and execution identity", () => {
    const makeCall = (seq, toolName, callId, extras = {}, runId = "run-a") =>
      frame(seq, "tool_call", { tool_name: toolName, call_id: callId, ...extras }, runId);

    const cases = [
      [makeCall(1, "read_file", "a"), makeCall(2, "write_file", "b", { tool_display_name: "read_file" })],
      [makeCall(1, "read_file", "a"), makeCall(2, "read_file", "b", { toolkit_id: "files" })],
      [makeCall(1, "read_file", "a", { toolkit_id: "files" }), makeCall(2, "read_file", "b", { toolkit_id: "other" })],
      [makeCall(1, "read_file", "a"), makeCall(2, "read_file", "b", {}, "run-b")],
      [makeCall(1, "read_file", "a", { toolkit_name: "provider one" }), makeCall(2, "read_file", "b", { toolkit_name: "provider two" })],
      [makeCall(1, "read_file", "a"), makeCall(2, "read_file", "")],
      [makeCall(1, "read_file", "a"), makeCall(2, " ", "b")],
    ];

    cases.forEach(([first, second]) => {
      const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);
      expect(groupAt(grouped)).toBeUndefined();
      expect(grouped).toHaveLength(2);
    });

    const renamedLabelCalls = [
      makeCall(1, "read_file", "label-a", { toolkit_id: "files", toolkit_name: "Files" }),
      makeCall(2, "read_file", "label-b", { toolkit_id: "files", toolkit_name: "File tools" }),
    ];
    const renamedLabelGroup = groupToolTimelineItems(
      renamedLabelCalls.map((entry) => call(entry)),
      renamedLabelCalls,
    );
    expect(renamedLabelGroup).toHaveLength(1);
    expect(groupAt(renamedLabelGroup).calls).toHaveLength(2);

    expect(
      getToolGroupingIdentity(
        frame(3, "tool_call", {
          call_id: "ask-1",
          tool_name: "ask_user_question",
          requires_confirmation: true,
          confirmation_id: "confirm-1",
        }),
      ),
    ).toBeNull();
  });

  test("requires run, toolkit, call, and confirmation ownership for approved feedback", () => {
    const mismatches = [
      { label: "call", payload: { call_id: "other" } },
      { label: "run", runId: "other-run" },
      { label: "tool", payload: { tool_name: "other_tool" } },
      { label: "toolkit", payload: { toolkit_id: "other-toolkit" } },
      { label: "confirmation", payload: { confirmation_id: "other-confirmation" } },
    ];

    mismatches.forEach(({ label, runId, payload = {} }) => {
      const first = frame(1, "tool_call", {
        call_id: "call-a",
        tool_name: "web_fetch",
        toolkit_id: "core",
        timeline_merge_policy: "approved",
        confirmation_id: "confirm-a",
        requires_confirmation: true,
        interact_type: "confirmation",
      });
      const badApproval = frame(
        2,
        "tool_confirmed",
        {
          call_id: "call-a",
          tool_name: "web_fetch",
          confirmation_id: "confirm-a",
          ...payload,
        },
        runId || "run-a",
      );
      const result = frame(3, "tool_result", {
        call_id: "call-a",
        tool_name: "web_fetch",
        toolkit_id: "core",
      });
      const second = frame(4, "tool_call", {
        call_id: "call-b",
        tool_name: "web_fetch",
        toolkit_id: "core",
        timeline_merge_policy: "approved",
        confirmation_id: "confirm-b",
        requires_confirmation: true,
        interact_type: "confirmation",
      });
      const secondApproval = frame(5, "tool_confirmed", {
        call_id: "call-b",
        tool_name: "web_fetch",
        confirmation_id: "confirm-b",
      });
      const secondResult = frame(6, "tool_result", {
        call_id: "call-b",
        tool_name: "web_fetch",
        toolkit_id: "core",
      });
      const frames = [first, badApproval, result, second, secondApproval, secondResult];
      const grouped = groupToolTimelineItems(
        [call(first), call(second)],
        frames,
      );

      expect(grouped.some((item) => item._toolGroup)).toBe(false);
      expect(grouped).toHaveLength(2);
      expect(label).toBeTruthy();
    });
  });

  test("keeps legacy calls without an exact run and iteration scope ungrouped", () => {
    const first = frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "", undefined);
    const second = frame(2, "tool_call", { call_id: "b", tool_name: "read_file" }, "", undefined);

    const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);
    expect(grouped).toHaveLength(2);
    expect(grouped.some((item) => item._toolGroup)).toBe(false);
  });

  test("does not group across semantic barriers, including bubble-owned final text", () => {
    const barrierTypes = [
      "reasoning",
      "error",
      "provider_retry",
      "fyi_injected",
      "side_answer",
      "clarify_request",
      "final_message",
    ];

    barrierTypes.forEach((type) => {
      const first = frame(1, "tool_call", { call_id: `a-${type}`, tool_name: "read_file" });
      const barrier = frame(2, type, { content: "barrier" });
      const second = frame(3, "tool_call", { call_id: `b-${type}`, tool_name: "read_file" });
      const items = [call(first), ...(type === "final_message" ? [] : [{ key: "barrier", _sourceFrame: barrier }]), call(second)];

      expect(groupToolTimelineItems(items, [first, barrier, second])).toHaveLength(3 - (type === "final_message" ? 1 : 0));
      expect(groupToolTimelineItems(items, [first, barrier, second]).some((item) => item._toolGroup)).toBe(false);
    });
  });

  test("groups output owned by current calls and preserves each complete descriptor once", () => {
    const first = frame(1, "tool_call", { call_id: "a", tool_name: "read_file" });
    const result = frame(2, "tool_result", { call_id: "a", tool_name: "read_file", result: { path: "a.txt" } });
    const output = frame(3, "observation", { call_id: "a", content: "first output" });
    const second = frame(4, "tool_call", { call_id: "b", tool_name: "read_file" });
    const tail = frame(5, "tool_result", { call_id: "b", tool_name: "read_file", result: { path: "b.txt" } });
    const countOnly = {
      key: "obs-trunc-b",
      title: "+7 more output lines coalesced",
      status: "done",
      _outputCallId: "b",
      _sourceFrame: tail,
    };
    const firstItem = call(first);
    const secondItem = call(second);
    const outputItem = observation(output);
    const originalItems = [firstItem, outputItem, secondItem, countOnly];
    const frames = [first, result, output, second, tail];

    const grouped = groupToolTimelineItems(originalItems, frames);

    expect(grouped).toHaveLength(1);
    expect(groupAt(grouped).calls).toEqual([firstItem, secondItem]);
    expect(groupAt(grouped).outputs).toEqual([outputItem, countOnly]);
    expect(groupAt(grouped).memberItems).toEqual([
      firstItem,
      outputItem,
      secondItem,
      countOnly,
    ]);
    expect(groupAt(grouped).outputs[0]).toMatchObject({
      title: "Observation",
      span: "3ms",
      body: "body-3",
      details: "details-3",
      status: "done",
    });
    expect(groupAt(grouped).outputs[1].title).toBe("+7 more output lines coalesced");
    expect(groupAt(grouped).outputs[1].details).toBeUndefined();
    expect(originalItems).toEqual([firstItem, outputItem, secondItem, countOnly]);
    expect(frames).toEqual([first, result, output, second, tail]);
  });

  test("associates a call-id-less observation only with its exact preceding completed batch", () => {
    const callA = frame(1, "tool_call", { call_id: "a", tool_name: "read_file", toolkit_id: "files" }, "run-a", 0);
    const resultA = frame(2, "tool_result", { call_id: "a", tool_name: "read_file", toolkit_id: "files" }, "run-a", 0);
    const outputA = frame(3, "observation", { content: "a output" }, "run-a", 0);
    const callB = frame(4, "tool_call", { call_id: "b", tool_name: "read_file", toolkit_id: "files" }, "run-a", 1);
    const resultB = frame(5, "tool_result", { call_id: "b", tool_name: "read_file", toolkit_id: "files" }, "run-a", 1);
    const outputB = frame(6, "observation", { content: "b output" }, "run-a", 1);
    const firstItem = call(callA);
    const secondItem = call(callB);
    const outputAItem = observation(outputA);
    const outputBItem = observation(outputB);

    const grouped = groupToolTimelineItems(
      [firstItem, outputAItem, secondItem, outputBItem],
      [callA, resultA, outputA, callB, resultB, outputB],
    );

    expect(grouped).toHaveLength(1);
    expect(groupAt(grouped).calls).toEqual([firstItem, secondItem]);
    expect(groupAt(grouped).outputs).toEqual([outputAItem, outputBItem]);
  });

  test("leaves mixed, incomplete, mismatched, stale, and nonnumeric legacy batches separate", () => {
    const cases = [
      {
        label: "mixed tools",
        before: [
          frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
          frame(2, "tool_result", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
          frame(3, "tool_call", { call_id: "b", tool_name: "write_file" }, "run-a", 0),
          frame(4, "tool_result", { call_id: "b", tool_name: "write_file" }, "run-a", 0),
        ],
        observation: frame(5, "observation", { content: "mixed" }, "run-a", 0),
        callItemSeqs: [1, 3],
      },
      {
        label: "incomplete batch",
        before: [frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0)],
        observation: frame(2, "observation", { content: "incomplete" }, "run-a", 0),
        callItemSeqs: [1],
      },
      {
        label: "mismatched iteration",
        before: [
          frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
          frame(2, "tool_result", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
        ],
        observation: frame(3, "observation", { content: "wrong iteration" }, "run-a", 1),
        callItemSeqs: [1],
      },
      {
        label: "null iteration",
        before: [
          frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
          frame(2, "tool_result", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
        ],
        observation: frame(3, "observation", { content: "null iteration" }, "run-a", null),
        callItemSeqs: [1],
      },
      {
        label: "numeric string iteration",
        before: [
          frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
          frame(2, "tool_result", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
        ],
        observation: frame(3, "observation", { content: "string iteration" }, "run-a", "0"),
        callItemSeqs: [1],
      },
      {
        label: "missing iteration",
        before: [
          frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
          frame(2, "tool_result", { call_id: "a", tool_name: "read_file" }, "run-a", 0),
        ],
        observation: (() => {
          const missingIteration = frame(3, "observation", { content: "missing iteration" }, "run-a", 1);
          delete missingIteration.iteration;
          return missingIteration;
        })(),
        callItemSeqs: [1],
      },
    ];

    cases.forEach(({ before, observation: output, callItemSeqs }) => {
      const callFrames = before.filter((entry) => entry.type === "tool_call");
      const callItems = callFrames.map((entry) => call(entry));
      const outputItem = observation(output);
      const items = [];
      callItemSeqs.forEach((seq, index) => {
        items.push(callItems[index]);
        if (index === 0) items.push(outputItem);
      });
      if (!items.includes(outputItem)) items.push(outputItem);

      const grouped = groupToolTimelineItems(items, [...before, output]);

      expect(groupAt(grouped)).toBeUndefined();
      expect(grouped).toContain(outputItem);
    });
  });

  test("does not search past an incomplete newer batch or look ahead to future results", () => {
    const callA = frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "run-a", 0);
    const resultA = frame(2, "tool_result", { call_id: "a", tool_name: "read_file" }, "run-a", 0);
    const callB = frame(3, "tool_call", { call_id: "b", tool_name: "read_file" }, "run-a", 1);
    const staleOutput = frame(4, "observation", { content: "stale" }, "run-a", 0);
    const futureOutput = frame(5, "observation", { content: "early" }, "run-a", 2);
    const futureCall = frame(6, "tool_call", { call_id: "c", tool_name: "read_file" }, "run-a", 2);
    const futureResult = frame(7, "tool_result", { call_id: "c", tool_name: "read_file" }, "run-a", 2);

    const staleItem = observation(staleOutput);
    const earlyItem = observation(futureOutput);
    const grouped = groupToolTimelineItems(
      [call(callA), call(callB), staleItem, earlyItem],
      [callA, resultA, callB, staleOutput, futureOutput, futureCall, futureResult],
    );

    expect(grouped).toContain(staleItem);
    expect(grouped).toContain(earlyItem);
    const callGroup = grouped.find((item) => item._toolGroup)?._toolGroup;
    expect(callGroup.calls.map((item) => item.key)).toEqual(["1-tool", "3-tool"]);
    expect(callGroup.outputs).toEqual([]);
  });

  test("keeps output from an older group separate after a semantic barrier", () => {
    const first = frame(1, "tool_call", { call_id: "old", tool_name: "read_file" });
    const oldResult = frame(2, "tool_result", { call_id: "old", tool_name: "read_file" });
    const barrier = frame(3, "error", { message: "stop" });
    const next = frame(4, "tool_call", { call_id: "new", tool_name: "read_file" });
    const output = frame(5, "observation", { call_id: "old", content: "late output" });
    const nextCall = frame(6, "tool_call", { call_id: "newer", tool_name: "read_file" });
    const firstItem = call(first);
    const nextItem = call(next);
    const outputItem = observation(output);
    const nextCallItem = call(nextCall);
    const items = [firstItem, { key: "error", _sourceFrame: barrier }, nextItem, outputItem, nextCallItem];

    const grouped = groupToolTimelineItems(items, [first, oldResult, barrier, next, output, nextCall]);

    expect(grouped).toHaveLength(5);
    expect(grouped).toContain(outputItem);
    expect(grouped.some((item) => item._toolGroup)).toBe(false);
  });

  test("does not pull output backward across hidden final text after the last call", () => {
    const first = frame(1, "tool_call", { call_id: "a", tool_name: "read_file" });
    const second = frame(2, "tool_call", { call_id: "b", tool_name: "read_file" });
    const hiddenFinal = frame(3, "final_message", { content: "bubble-owned text" });
    const lateOutput = frame(4, "observation", { call_id: "a", content: "late output" });
    const firstItem = call(first);
    const secondItem = call(second);
    const lateOutputItem = observation(lateOutput);

    const grouped = groupToolTimelineItems(
      [firstItem, secondItem, lateOutputItem],
      [first, second, hiddenFinal, lateOutput],
    );

    expect(grouped).toHaveLength(2);
    expect(groupAt(grouped, 0).calls).toEqual([firstItem, secondItem]);
    expect(groupAt(grouped, 0).outputs).toEqual([]);
    expect(grouped[0]._toolGroup.memberItems).toEqual([firstItem, secondItem]);
    expect(grouped[1]).toBe(lateOutputItem);
  });

  test("keeps a late count-only result anchored to its observation before the next same-tool call", () => {
    const callA = frame(1, "tool_call", { call_id: "a", tool_name: "read_file" });
    const outputA = frame(2, "observation", { call_id: "a", content: "output A" });
    const callB = frame(3, "tool_call", { call_id: "b", tool_name: "read_file" });
    const lateResultA = frame(4, "tool_result", {
      call_id: "a",
      tool_name: "read_file",
      observation_omitted: 7,
      observation_tail: [],
    });
    const firstItem = call(callA);
    const outputItem = observation(outputA);
    const truncationItem = {
      key: "obs-trunc-a",
      title: "+7 more output lines coalesced",
      status: "done",
      _sourceFrame: outputA,
      _outputFrame: lateResultA,
      _toolOutput: true,
      _outputCallId: "a",
    };
    const secondItem = call(callB);
    const items = [firstItem, outputItem, truncationItem, secondItem];

    const grouped = groupToolTimelineItems(items, [callA, outputA, callB, lateResultA]);

    expect(grouped).toHaveLength(1);
    expect(groupAt(grouped).calls).toEqual([firstItem, secondItem]);
    expect(groupAt(grouped).outputs).toEqual([outputItem, truncationItem]);
    expect(groupAt(grouped).memberItems).toEqual(items);
    expect(groupAt(grouped).memberItems[2].details).toBeUndefined();

    const wrongProvenance = {
      ...truncationItem,
      _outputFrame: { ...lateResultA, run_id: "different-run" },
    };
    const rejected = groupToolTimelineItems(
      [firstItem, outputItem, wrongProvenance, secondItem],
      [callA, outputA, callB, lateResultA],
    );
    expect(rejected.some((item) => item._toolGroup)).toBe(false);
    expect(rejected).toContain(wrongProvenance);
  });
});
