import {
  groupToolTimelineItems,
  getToolGroupingIdentity,
} from "./trace_tool_grouping";

const frame = (seq, type, payload = {}, runId = "run-a", iteration = 0) => ({
  seq,
  run_id: runId,
  iteration,
  type,
  payload,
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

describe("Trace tool grouping", () => {
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

  test("uses canonical tool name, toolkit scope, run scope, and execution identity", () => {
    const makeCall = (seq, toolName, callId, extras = {}, runId = "run-a") =>
      frame(seq, "tool_call", { tool_name: toolName, call_id: callId, ...extras }, runId);

    const cases = [
      [makeCall(1, "read_file", "a"), makeCall(2, "write_file", "b", { tool_display_name: "read_file" })],
      [makeCall(1, "read_file", "a"), makeCall(2, "read_file", "b", { toolkit_id: "files" })],
      [makeCall(1, "read_file", "a", { toolkit_id: "files" }), makeCall(2, "read_file", "b", { toolkit_id: "other" })],
      [makeCall(1, "read_file", "a"), makeCall(2, "read_file", "b", {}, "run-b")],
      [makeCall(1, "read_file", "a"), makeCall(2, "read_file", "")],
      [makeCall(1, "read_file", "a"), makeCall(2, " ", "b")],
    ];

    cases.forEach(([first, second]) => {
      const grouped = groupToolTimelineItems([call(first), call(second)], [first, second]);
      expect(groupAt(grouped)).toBeUndefined();
      expect(grouped).toHaveLength(2);
    });

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

  test("treats missing toolkit and run IDs as trace-local legacy scopes", () => {
    const first = frame(1, "tool_call", { call_id: "a", tool_name: "read_file" }, "", undefined);
    const second = frame(2, "tool_call", { call_id: "b", tool_name: "read_file" }, "", undefined);

    expect(groupToolTimelineItems([call(first), call(second)], [first, second])).toHaveLength(1);
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
});
