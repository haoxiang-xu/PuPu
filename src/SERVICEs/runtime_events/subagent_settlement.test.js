import fixture from "../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_subagent_settlement.json";
import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree } from "./activity_tree";
import { sha256_text, utf8_bytes } from "../../COMPONENTs/agents/pages/recipes_page/managed_code_sources";
import {
  AMBIGUOUS_SETTLEMENT,
  admitSubagentSettlementFrame,
  collectSubagentSettlements,
  settlementForToolCall,
} from "./subagent_settlement";

/* Cold-resumed subagent settlement (#357). Positive origins are the producer's
   own packets, unchanged: the host-normalized V4 event and the replay of the
   original sealed Journal receipt for the real waiting card. Every negative
   below is a labelled, constructed variant of those packets. */

const copy = (value) => JSON.parse(JSON.stringify(value));

// The real frame the renderer gets: the event through the actual reducer.
const frameOf = (event) => {
  const store = createRuntimeEventStore();
  store.appendMany([event]);
  const state = reduceActivityTree(null, store.getSnapshot());
  const frames = Object.values(state.framesByRunId).flat();
  expect(frames).toHaveLength(1);
  return frames[0];
};
const realEvent = () => copy(fixture.reprojection.v4_event);
const hostEvent = () => copy(fixture.host_v4.event);

// Rebuild the inline result of a constructed variant consistently.
const withBody = (event, body, status = body.status) => {
  const keys = Object.keys(body).sort();
  const preview = `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(body[key])}`).join(",")}}`;
  const settlement = event.payload.settlement;
  settlement.status = status;
  event.payload.status = status;
  settlement.result.preview = preview;
  settlement.result.content_bytes = utf8_bytes(preview).length;
  settlement.result.content_sha256 = sha256_text(preview);
  return event;
};
const asFailed = (event, status) => {
  const next = withBody(event, {
    error: status === "failed" ? "child failed" : "",
    outputs: null,
    schema: "unchain.skeleton_child_completion.v1",
    status,
    summary: "",
  }, status);
  next.type = "run.failed";
  return next;
};

describe("admitSubagentSettlementFrame: real producer packets", () => {
  test("admits the original waiting card's Journal settlement replay", () => {
    const admitted = admitSubagentSettlementFrame(frameOf(realEvent()));
    expect(admitted).toEqual(expect.objectContaining({
      callId: "qa-retention-parked-old-delegate",
      toolName: "delegate_to_subagent",
      consumerAttemptId: "node-attempt.a6f2f5dcab29ee879fc51551194affc542016da6a5e0547ae1e5f03b78d0c9a8",
      sourceAttemptId: "chat-1792981670364-f34787eaea2488c32ad3f0a5496ff23c:kernel.reviewer.1:50b7b64c-2cb6-5274-bcde-e220858c706a",
      executionId: "chat-1792981670364-f34787eaea2488c32ad3f0a5496ff23c",
      status: "completed",
      inline: true,
    }));
    // error:"" is a valid completed field, not an error.
    expect(admitted.body).toEqual({
      error: "",
      outputs: { message: "SOURCE-A|child-approved parked-old" },
      schema: "unchain.skeleton_child_completion.v1",
      status: "completed",
      summary: "SOURCE-A|child-approved parked-old",
    });
  });

  test("admits the actual host continuation event", () => {
    expect(admitSubagentSettlementFrame(frameOf(hostEvent()))).toEqual(expect.objectContaining({
      callId: "subagent-call-cold-delegate",
      status: "completed",
    }));
  });

  test("the three identities are different and only the settlement names them", () => {
    const admitted = admitSubagentSettlementFrame(frameOf(realEvent()));
    const messageAttempt = fixture.reprojection.persisted_message.meta.attemptId;
    expect(new Set([messageAttempt, admitted.consumerAttemptId, admitted.sourceAttemptId]).size).toBe(3);
  });
});

describe("admitSubagentSettlementFrame: constructed refusals", () => {
  const refuse = (mutate) => {
    const event = realEvent();
    mutate(event, event.payload.settlement);
    return admitSubagentSettlementFrame(frameOf(event));
  };

  test.each([
    ["an unknown schema version", (_e, s) => { s.schema = "unchain.skeleton_subagent_settlement_projection.v2"; }],
    ["an extra settlement field", (_e, s) => { s.extra = true; }],
    ["a missing settlement field", (_e, s) => { delete s.cursor; }],
    ["an extra result field", (_e, s) => { s.result.size = 1; }],
    ["a non-terminal status", (e, s) => { s.status = "running"; e.payload.status = "running"; }],
    ["a cursor below one", (_e, s) => { s.cursor.store_seq = 0; }],
    ["a cursor with a float seq", (_e, s) => { s.cursor.store_seq = 64.5; }],
    ["equal consumer and source", (_e, s) => { s.source_attempt = copy(s.consumer_attempt); }],
    ["two generations", (_e, s) => { s.source_attempt.generation.generation_id = "pupu-bootstrap-generation-other"; }],
    ["a non-canonical attempt", (_e, s) => { s.consumer_attempt.extra = 1; }],
    ["an invalid identifier", (_e, s) => { s.call_id = "bad id"; s.tool_name = "delegate_to_subagent"; }],
    ["a padded call id", (_e, s) => { s.call_id = " qa-retention-parked-old-delegate"; }],
    ["a Python-whitespace padded tool name", (_e, s) => { s.tool_name = "delegate_to_subagent\u001f"; }],
    ["a fragmented artifact", (_e, s) => { s.result.full_output_ref.fragment = "part"; }],
    ["a non-artifact ref", (_e, s) => { s.result.full_output_ref.kind = "object"; }],
    ["a wrong digest", (_e, s) => { s.result.content_sha256 = "0".repeat(64); }],
    ["an uppercase digest", (_e, s) => { s.result.content_sha256 = s.result.content_sha256.toUpperCase(); }],
    ["a wrong byte length", (_e, s) => { s.result.content_bytes += 1; }],
    ["inline false for a small result", (_e, s) => { s.result.inline = false; }],
    ["an event run that is not the source", (e) => { e.run_id = "someone-else"; e.agent_id = "someone-else"; }],
    ["a parent link that is not the consumer", (e) => { e.links.parent_run_id = "node-attempt.other"; }],
    ["a tool call link that is not the call", (e) => { e.links.tool_call_id = "another-call"; }],
    ["a session that is not the execution", (e) => { e.session_id = "chat-other"; }],
    ["an event status that contradicts the settlement", (e) => { e.payload.status = "failed"; }],
  ])("refuses %s", (_label, mutate) => {
    expect(refuse(mutate)).toBeNull();
  });

  test("refuses an inline body whose status contradicts the settlement", () => {
    const event = withBody(realEvent(), {
      error: "", outputs: { message: "x" }, schema: "unchain.skeleton_child_completion.v1",
      status: "failed", summary: "x",
    }, "completed");
    expect(admitSubagentSettlementFrame(frameOf(event))).toBeNull();
  });

  test("refuses a completed body without outputs and a body with an extra field", () => {
    expect(admitSubagentSettlementFrame(frameOf(withBody(realEvent(), {
      error: "", outputs: null, schema: "unchain.skeleton_child_completion.v1", status: "completed", summary: "",
    })))).toBeNull();
    expect(admitSubagentSettlementFrame(frameOf(withBody(realEvent(), {
      agent_name: "x", error: "", outputs: {}, schema: "unchain.skeleton_child_completion.v1", status: "completed", summary: "",
    })))).toBeNull();
  });

  test("refuses a completed settlement delivered as run.failed", () => {
    const event = realEvent();
    event.type = "run.failed";
    expect(admitSubagentSettlementFrame(frameOf(event))).toBeNull();
  });

  test("UTF-8 bytes, not UTF-16 units, bind the preview", () => {
    const event = withBody(realEvent(), {
      error: "", outputs: { message: "数据" }, schema: "unchain.skeleton_child_completion.v1",
      status: "completed", summary: "数据",
    });
    expect(admitSubagentSettlementFrame(frameOf(copy(event)))).not.toBeNull();
    event.payload.settlement.result.content_bytes = event.payload.settlement.result.preview.length;
    expect(admitSubagentSettlementFrame(frameOf(event))).toBeNull();
  });
});

describe("terminal states are kept apart", () => {
  test.each(["failed", "cancelled", "outcome_unknown"])("%s is admitted as itself, never success", (status) => {
    const admitted = admitSubagentSettlementFrame(frameOf(asFailed(realEvent(), status)));
    expect(admitted.status).toBe(status);
    expect(admitted.body.outputs).toBeNull();
  });

  test("a large result is not parsed from its prefix", () => {
    const event = realEvent();
    const result = event.payload.settlement.result;
    result.content_bytes = 9000;
    result.inline = false;
    result.preview = "{\"error\":\"\",\"outputs\":{";
    const admitted = admitSubagentSettlementFrame(frameOf(event));
    expect(admitted.inline).toBe(false);
    expect(admitted.body).toBeNull();
  });
});

describe("binding a settlement to exactly one call", () => {
  const message = fixture.reprojection.persisted_message;
  const delegateCall = message.traceFrames.find(
    (frame) => frame.type === "tool_call" && frame.payload?.call_id === "qa-retention-parked-old-delegate",
  );
  const frameGroups = (...frames) => [message.traceFrames, frames];

  test("binds the real settlement to the real waiting call", () => {
    const settlements = collectSubagentSettlements(frameGroups(frameOf(realEvent())));
    expect(settlementForToolCall(settlements, delegateCall, message.traceFrames).status).toBe("completed");
  });

  test("a repeated identical receipt is one settlement", () => {
    const again = realEvent();
    again.event_id = "evt_repeated_transport";
    const settlements = collectSubagentSettlements(frameGroups(frameOf(realEvent()), frameOf(again)));
    expect(settlementForToolCall(settlements, delegateCall, message.traceFrames).status).toBe("completed");
  });

  test("a contradicting receipt for the same call makes it ambiguous", () => {
    const settlements = collectSubagentSettlements(
      frameGroups(frameOf(realEvent()), frameOf(asFailed(realEvent(), "failed"))),
    );
    expect(settlementForToolCall(settlements, delegateCall, message.traceFrames)).toBeNull();
    expect([...settlements.values()]).toContain(AMBIGUOUS_SETTLEMENT);
  });

  test("a settlement from another chat does not bind", () => {
    const foreign = { ...delegateCall, session_id: "chat-other" };
    const settlements = collectSubagentSettlements(frameGroups(frameOf(realEvent())));
    expect(settlementForToolCall(settlements, foreign, [foreign])).toBeNull();
  });

  test("a call made by another consumer attempt does not bind", () => {
    const other = { ...delegateCall, run_id: "node-attempt.other" };
    const settlements = collectSubagentSettlements(frameGroups(frameOf(realEvent())));
    expect(settlementForToolCall(settlements, other, [other])).toBeNull();
  });

  test("an ambiguous call (two identical owners) does not bind", () => {
    const frames = [...message.traceFrames, { ...delegateCall, seq: 40 }];
    const settlements = collectSubagentSettlements([frames, [frameOf(realEvent())]]);
    expect(settlementForToolCall(settlements, delegateCall, frames)).toBeNull();
  });

  test("two children each bind only their own call", () => {
    const second = realEvent();
    const s = second.payload.settlement;
    s.call_id = "qa-second-delegate";
    s.source_attempt.attempt_id = "chat-1792981670364-f34787eaea2488c32ad3f0a5496ff23c:kernel.reviewer.2:second";
    second.run_id = s.source_attempt.attempt_id;
    second.agent_id = s.source_attempt.attempt_id;
    second.links.tool_call_id = "qa-second-delegate";
    asFailed(second, "cancelled");
    second.type = "run.failed";
    const secondCall = { ...delegateCall, seq: 41, payload: { ...delegateCall.payload, call_id: "qa-second-delegate" } };
    const frames = [...message.traceFrames, secondCall];
    const settlements = collectSubagentSettlements([frames, [frameOf(realEvent()), frameOf(second)]]);
    expect(settlementForToolCall(settlements, delegateCall, frames).status).toBe("completed");
    expect(settlementForToolCall(settlements, secondCall, frames).status).toBe("cancelled");
  });

  test("a root completion without a settlement binds nothing", () => {
    const settlements = collectSubagentSettlements(frameGroups());
    expect(settlementForToolCall(settlements, delegateCall, message.traceFrames)).toBeNull();
  });
});

/* R-SETTLE-02: JSON key insertion order is not identity. The installed Python
   producer accepts a reordered generation; the same receipt with reordered
   keys is one settlement. Constructed reorderings of the real packet. */
describe("identity does not depend on JSON key order", () => {
  const reversed = (value) => Object.fromEntries(Object.entries(value).reverse());
  const deepReversed = (value) => (
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, deepReversed(item)]))
      : value
  );
  const message = fixture.reprojection.persisted_message;
  const delegateCall = message.traceFrames.find(
    (frame) => frame.type === "tool_call" && frame.payload?.call_id === "qa-retention-parked-old-delegate",
  );

  test("a reordered source generation is admitted", () => {
    const event = realEvent();
    const source = event.payload.settlement.source_attempt;
    source.generation = reversed(source.generation);
    expect(admitSubagentSettlementFrame(frameOf(event))).not.toBeNull();
  });

  test("a reordered consumer attempt and cursor are admitted", () => {
    const event = realEvent();
    const s = event.payload.settlement;
    s.consumer_attempt = deepReversed(s.consumer_attempt);
    s.cursor = reversed(s.cursor);
    expect(admitSubagentSettlementFrame(frameOf(event))).not.toBeNull();
  });

  test("the same receipt replayed with reordered keys is one settlement", () => {
    const again = realEvent();
    again.event_id = "evt_reordered_transport";
    again.payload.settlement = deepReversed(again.payload.settlement);
    const settlements = collectSubagentSettlements([message.traceFrames, [frameOf(realEvent()), frameOf(again)]]);
    expect(settlementForToolCall(settlements, delegateCall, message.traceFrames)?.status).toBe("completed");
  });

  test("a genuinely different generation value is still refused", () => {
    const event = realEvent();
    const source = event.payload.settlement.source_attempt;
    source.generation = reversed({ ...source.generation, generation_id: "pupu-bootstrap-generation-other" });
    expect(admitSubagentSettlementFrame(frameOf(event))).toBeNull();
  });

  test("a reordered receipt with a different digest is still a conflict", () => {
    const again = realEvent();
    again.event_id = "evt_reordered_conflict";
    again.payload.settlement.result.full_output_ref.revision = 2;
    again.payload.settlement = deepReversed(again.payload.settlement);
    const settlements = collectSubagentSettlements([message.traceFrames, [frameOf(realEvent()), frameOf(again)]]);
    expect(settlementForToolCall(settlements, delegateCall, message.traceFrames)).toBeNull();
  });
});
