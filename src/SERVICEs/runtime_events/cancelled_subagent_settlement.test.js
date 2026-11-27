import producer from "../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_cancelled_subagent_producer.json";
import resumed from "../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_resumed_second_cancel.json";
import settlementFixture from "../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_subagent_settlement.json";
import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree } from "./activity_tree";
import { sha256_text, utf8_bytes } from "../../COMPONENTs/agents/pages/recipes_page/managed_code_sources";
import { recordCancelledSubagentSettlements } from "./cancelled_subagent_settlement";
import {
  collectSubagentSettlements,
  settlementForToolCall,
} from "./subagent_settlement";

/* Delegate cancellation settlement (#357). The four cancel replies are the
   real host producer's (delegate / handoff, waiting / approved-not-run), used
   unchanged. That producer has no PuPu message, so each owning message below
   is constructed from the same capture's own identities (execution, root,
   consumer node attempt, original call, child run, child approval) and is
   labelled as such. Every negative is a labelled constructed variant. */

const copy = (value) => JSON.parse(JSON.stringify(value));
const rows = producer.rows;

const targetOf = (row) => ({
  sessionId: row.response.execution_id,
  attemptId: row.response.attempt_id,
  sourceAttemptId: row.response.source_attempt_id,
  interactionId: row.parent_wait.interaction_request.interaction_id,
});

// Constructed owner message from the capture's identities.
const ownerFor = (row, { id = "assistant-owner", withMeta = true } = {}) => {
  const settlement = row.response.subagent_settlements[0];
  const execution = row.response.execution_id;
  const child = settlement.source_attempt.attempt_id;
  const childCall = row.parent_wait.interaction_request.payload;
  const frames = [
    { seq: 4, ts: 4, type: "tool_call", run_id: row.consumer_node_attempt, session_id: execution,
      stage: "runtime_event", event_id: `evt-${id}-call`,
      links: { tool_call_id: row.parent_wait.parent_tool_call.call_id },
      payload: { ...row.parent_wait.parent_tool_call, arguments: { target: "Reviewer", task: "review" } } },
    { seq: 6, ts: 6, type: "tool_result", run_id: row.consumer_node_attempt, session_id: execution,
      stage: "runtime_event", event_id: `evt-${id}-wait`,
      links: { tool_call_id: row.parent_wait.parent_tool_call.call_id },
      payload: { ...row.parent_wait.parent_tool_call, status: "success",
        result: { inline: true, content_bytes: 72,
          preview: "{\"schema\":\"unchain.skeleton_subagent_wait_marker.v1\",\"status\":\"waiting\"}" } } },
    { seq: 8, ts: 8, type: "tool_call", run_id: row.response.attempt_id, session_id: execution,
      stage: "runtime_event", event_id: `evt-${id}-approval`,
      payload: { call_id: childCall.call_id, tool_name: childCall.tool_name,
        confirmation_id: targetOf(row).interactionId, requires_confirmation: true,
        interact_type: "confirmation", arguments: childCall.arguments } },
    ...(row.approved ? [{ seq: 8.1, ts: 9, type: "tool_confirmed", run_id: row.response.attempt_id,
      session_id: execution, stage: "client",
      payload: { call_id: childCall.call_id, tool_name: childCall.tool_name,
        confirmation_id: targetOf(row).interactionId, synthetic: true } }] : []),
  ];
  return {
    id, role: "assistant", content: "", status: "done",
    meta: { attemptId: row.response.attempt_id, executionSessionId: execution },
    traceFrames: frames,
    subagentFrames: { [child]: [{ seq: 1, ts: 5, type: "response_received", run_id: child,
      session_id: execution, event_id: `saved-${id}-child`, payload: { content: "saved child" } }] },
    subagentMetaByRunId: withMeta ? { [child]: {
      subagentId: "model.reviewer.1", mode: row.mode, template: "Reviewer", batchId: "",
      parentId: "model", lineage: ["model", "model.reviewer.1"], status: "running" } } : {},
  };
};

const settledFrames = (message) => (message.traceFrames || []).filter((frame) => frame.type === "subagent_settlement");

describe("real producer replies", () => {
  test.each(rows.map((row) => [`${row.mode} approved=${row.approved}`, row]))(
    "%s settles exactly its own call as cancelled, keeping saved frames and metadata", (_label, row) => {
      const before = [{ id: "user", role: "user", content: "go" }, ownerFor(row)];
      const { changed, messages: after } = recordCancelledSubagentSettlements(before, row.response, targetOf(row));
      expect(changed).toBe(true);
      const owner = after[1];
      expect(settledFrames(owner)).toHaveLength(1);
      expect(settledFrames(owner)[0].payload.settlement).toEqual(row.response.subagent_settlements[0]);
      const settlements = collectSubagentSettlements([owner.traceFrames]);
      const call = owner.traceFrames[0];
      expect(settlementForToolCall(settlements, call, owner.traceFrames)).toEqual(expect.objectContaining({
        status: "cancelled", consumerAttemptId: row.consumer_node_attempt,
      }));
      const child = row.response.subagent_settlements[0].source_attempt.attempt_id;
      expect(owner.subagentFrames).toEqual(before[1].subagentFrames);
      expect(owner.subagentMetaByRunId[child]).toEqual({ ...before[1].subagentMetaByRunId[child], status: "cancelled" });
      // The approved child approval card keeps its own record.
      expect(owner.traceFrames.filter((frame) => frame.type === "tool_confirmed")).toHaveLength(row.approved ? 1 : 0);
      expect(after[0]).toBe(before[0]);
    });

  test("the identities stay distinct", () => {
    const row = rows[0];
    const s = row.response.subagent_settlements[0];
    expect(new Set([row.response.attempt_id, s.consumer_attempt.attempt_id, s.source_attempt.attempt_id]).size).toBe(3);
  });

  test("a repeated reply records nothing more", () => {
    const row = rows[0];
    const once = recordCancelledSubagentSettlements([ownerFor(row)], row.response, targetOf(row)).messages;
    const twice = recordCancelledSubagentSettlements(once, copy(row.response), targetOf(row));
    expect(twice.changed).toBe(false);
    expect(twice.messages).toBe(once);
  });

  test("a child with no saved metadata gets the settlement but no invented metadata", () => {
    const row = rows[0];
    const { messages } = recordCancelledSubagentSettlements([ownerFor(row, { withMeta: false })], row.response, targetOf(row));
    expect(settledFrames(messages[0])).toHaveLength(1);
    expect(messages[0].subagentMetaByRunId).toEqual({});
  });
});

describe("constructed refusals: nothing is inferred", () => {
  const row = rows[0];
  const refuse = (messages, response = row.response, target = targetOf(row)) =>
    recordCancelledSubagentSettlements(messages, response, target);
  const reply = (mutate) => {
    const next = copy(row.response);
    mutate(next, next.subagent_settlements[0]);
    return next;
  };

  test.each([
    ["no settlement list (root cancel only)", (r) => { delete r.subagent_settlements; }],
    ["a list that is not an array", (r) => { r.subagent_settlements = {}; }],
    ["an unknown projection version", (_r, s) => { s.schema = "unchain.skeleton_subagent_settlement_projection.v2"; }],
    ["an extra projection field", (_r, s) => { s.extra = 1; }],
    ["a wrong digest", (_r, s) => { s.result.content_sha256 = "0".repeat(64); }],
    ["a settlement from another execution", (_r, s) => {
      s.consumer_attempt.generation.execution_id = "chat-other";
      s.source_attempt.generation.execution_id = "chat-other";
    }],
    ["a consumer attempt that made no such call", (_r, s) => { s.consumer_attempt.attempt_id = "node-attempt.other"; }],
    ["a call id the message does not hold", (_r, s) => { s.call_id = "other-call"; }],
    ["a tool name that differs", (_r, s) => { s.tool_name = "handoff_to_subagent"; }],
  ])("refuses %s", (_label, mutate) => {
    const before = [ownerFor(row)];
    expect(refuse(before, reply(mutate)).changed).toBe(false);
  });

  test("an unadmitted Stop reply is never used", () => {
    expect(refuse([ownerFor(row)], reply((r) => { r.durable_interaction_cancelled = false; })).changed).toBe(false);
    expect(refuse([ownerFor(row)], reply((r) => { r.attempt_id = "skeleton-host-other"; })).changed).toBe(false);
    expect(refuse([ownerFor(row)], row.response, { ...targetOf(row), interactionId: "" }).changed).toBe(false);
  });

  test("a late reply for another chat leaves this chat alone", () => {
    const other = ownerFor(row);
    other.meta = { ...other.meta, executionSessionId: "chat-other" };
    other.traceFrames = other.traceFrames.map((frame) => ({ ...frame, session_id: "chat-other" }));
    expect(refuse([other]).changed).toBe(false);
  });

  test("an ambiguous owner (two identical calls) is refused", () => {
    const owner = ownerFor(row);
    owner.traceFrames.push({ ...copy(owner.traceFrames[0]), seq: 20, event_id: "evt-dup-call" });
    expect(refuse([owner]).changed).toBe(false);
  });

  test("an existing different settlement for the call is a contradiction, not overwritten", () => {
    // Constructed: the producer's real completed settlement event, rebound to this call.
    const event = copy(settlementFixture.reprojection.v4_event);
    const s = event.payload.settlement;
    const ours = row.response.subagent_settlements[0];
    s.consumer_attempt = copy(ours.consumer_attempt);
    s.source_attempt = copy(ours.source_attempt);
    s.call_id = ours.call_id;
    s.tool_name = ours.tool_name;
    event.session_id = ours.consumer_attempt.generation.execution_id;
    event.run_id = ours.source_attempt.attempt_id;
    event.agent_id = event.run_id;
    event.links = { ...event.links, parent_run_id: ours.consumer_attempt.attempt_id, tool_call_id: ours.call_id };
    const store = createRuntimeEventStore();
    store.appendMany([event]);
    const completedFrame = Object.values(reduceActivityTree(null, store.getSnapshot()).framesByRunId).flat()[0];
    const owner = ownerFor(row);
    owner.subagentFrames[ours.source_attempt.attempt_id].push(completedFrame);
    const before = collectSubagentSettlements([owner.traceFrames, ...Object.values(owner.subagentFrames)]);
    expect(settlementForToolCall(before, owner.traceFrames[0], owner.traceFrames).status).toBe("completed");
    expect(refuse([owner]).changed).toBe(false);
  });

  test("two children: a reply for one leaves the other untouched", () => {
    const delegateRow = rows[0];
    const handoffRow = rows[1];
    const owner = ownerFor(delegateRow);
    const extra = ownerFor(handoffRow, { id: "second" });
    owner.traceFrames.push(...extra.traceFrames.slice(0, 2).map((frame) => ({ ...frame, seq: frame.seq + 20 })));
    Object.assign(owner.subagentFrames, extra.subagentFrames);
    Object.assign(owner.subagentMetaByRunId, extra.subagentMetaByRunId);
    const { messages } = recordCancelledSubagentSettlements([owner], delegateRow.response, targetOf(delegateRow));
    const frames = messages[0].traceFrames;
    const settlements = collectSubagentSettlements([frames]);
    expect(settlementForToolCall(settlements, frames[0], frames).status).toBe("cancelled");
    const handoffCall = frames.find((frame) => frame.type === "tool_call" && frame.payload.call_id === "handoff-call");
    expect(settlementForToolCall(settlements, handoffCall, frames)).toBeNull();
    const handoffChild = handoffRow.response.subagent_settlements[0].source_attempt.attempt_id;
    expect(messages[0].subagentMetaByRunId[handoffChild].status).toBe("running");
  });
});

describe("R-DC-01: one reply is judged per call before anything is written", () => {
  const row = rows[0];
  const base = row.response.subagent_settlements[0];
  const replyWith = (list) => ({ ...copy(row.response), subagent_settlements: list });
  const reorder = (value) => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reorder(value[key])]));
  };
  const variant = (mutate) => { const next = copy(base); mutate(next); return next; };
  // Constructed: a second original delegate call in the same message, made
  // by the same consumer node attempt, with its own child run.
  const withSecondCall = (message) => {
    const call = copy(message.traceFrames[0]);
    call.seq = 20; call.event_id = "evt-second-call";
    call.links = { tool_call_id: "second-delegate" };
    call.payload = { ...call.payload, call_id: "second-delegate" };
    message.traceFrames = [...message.traceFrames, call];
    message.subagentMetaByRunId = { ...message.subagentMetaByRunId,
      "second-child-run": { subagentId: "model.reviewer.2", status: "running" } };
    return message;
  };
  const second = variant((s) => { s.call_id = "second-delegate"; s.source_attempt.attempt_id = "second-child-run"; });
  const readBack = (message, callId) => {
    const call = message.traceFrames.find((frame) => frame.type === "tool_call" && frame.payload.call_id === callId);
    return settlementForToolCall(collectSubagentSettlements([message.traceFrames]), call, message.traceFrames);
  };

  test("an identical receipt listed twice is recorded once", () => {
    const { changed, messages } = recordCancelledSubagentSettlements([ownerFor(row)], replyWith([copy(base), copy(base)]), targetOf(row));
    expect(changed).toBe(true);
    expect(settledFrames(messages[0])).toHaveLength(1);
    expect(readBack(messages[0], base.call_id)).toEqual(expect.objectContaining({ status: "cancelled" }));
  });

  test("the same receipt with its keys in another order is the same receipt", () => {
    const { changed, messages } = recordCancelledSubagentSettlements([ownerFor(row)], replyWith([copy(base), reorder(base)]), targetOf(row));
    expect(changed).toBe(true);
    expect(settledFrames(messages[0])).toHaveLength(1);
  });

  test.each([
    ["child run", (s) => { s.source_attempt.attempt_id = "different-child-run"; }],
    ["cursor", (s) => { s.cursor.event_id = "different-settlement-event"; s.cursor.store_seq += 1; }],
  ])("conflicting %s receipts for one call settle nothing, in either order", (_label, mutate) => {
    const other = variant(mutate);
    for (const list of [[copy(base), other], [other, copy(base)]]) {
      const before = [ownerFor(row)];
      const { changed, messages } = recordCancelledSubagentSettlements(before, replyWith(list), targetOf(row));
      expect(changed).toBe(false);
      expect(messages).toBe(before);
      expect(readBack(messages[0], base.call_id)).toBeNull();
    }
  });

  test("a conflicting group does not stop an independent healthy call from settling", () => {
    const conflicting = variant((s) => { s.source_attempt.attempt_id = "different-child-run"; });
    for (const list of [[copy(base), copy(second), conflicting], [conflicting, copy(second), copy(base)]]) {
      const before = [withSecondCall(ownerFor(row))];
      const { changed, messages } = recordCancelledSubagentSettlements(before, replyWith(list), targetOf(row));
      expect(changed).toBe(true);
      const owner = messages[0];
      expect(settledFrames(owner)).toHaveLength(1);
      expect(readBack(owner, "second-delegate")).toEqual(expect.objectContaining({ status: "cancelled", sourceAttemptId: "second-child-run" }));
      expect(readBack(owner, base.call_id)).toBeNull();
      const child = base.source_attempt.attempt_id;
      expect(owner.subagentMetaByRunId[child]).toEqual(before[0].subagentMetaByRunId[child]);
      expect(owner.subagentMetaByRunId["second-child-run"].status).toBe("cancelled");
      expect(owner.subagentFrames).toEqual(before[0].subagentFrames);
      expect(owner.traceFrames.slice(0, before[0].traceFrames.length)).toEqual(before[0].traceFrames);
    }
  });

  test("an already recorded receipt survives a later reply that conflicts with it", () => {
    const once = recordCancelledSubagentSettlements([ownerFor(row)], replyWith([copy(base)]), targetOf(row)).messages;
    const conflicting = variant((s) => { s.cursor.event_id = "different-settlement-event"; });
    const later = recordCancelledSubagentSettlements(once, replyWith([conflicting]), targetOf(row));
    expect(later.changed).toBe(false);
    expect(later.messages).toBe(once);
    expect(readBack(later.messages[0], base.call_id)).toEqual(expect.objectContaining({ status: "cancelled" }));
  });
});

describe("constructed stored-record forgeries are not read back", () => {
  const row = rows[0];
  const recorded = () => recordCancelledSubagentSettlements([ownerFor(row)], row.response, targetOf(row)).messages[0];
  const readBack = (owner) => settlementForToolCall(
    collectSubagentSettlements([owner.traceFrames]), owner.traceFrames[0], owner.traceFrames);

  test("the stored record reads back as cancelled", () => {
    expect(readBack(recorded())).toEqual(expect.objectContaining({ status: "cancelled" }));
  });

  test.each([
    ["a record without the cancel-reply origin", (frame) => { delete frame.payload.origin; }],
    ["a record with another origin", (frame) => { frame.payload.origin = "model_text"; }],
    ["a record whose status differs from its settlement", (frame) => { frame.payload.status = "completed"; }],
    ["a record bound to another call", (frame) => { frame.links.tool_call_id = "other-call"; }],
  ])("%s settles nothing", (_label, mutate) => {
    const owner = recorded();
    mutate(settledFrames(owner)[0]);
    expect(readBack(owner)).toBeNull();
  });
});

describe("R-CANCEL-03 positive control", () => {
  test("the real resumed-chat reply (no settlement list) records nothing for the delegate", () => {
    const request = resumed.actual_cancel.request;
    const { changed } = recordCancelledSubagentSettlements(
      [copy(resumed.owning_message_after_stop)], resumed.actual_cancel.response, {
        sessionId: request.execution_id, attemptId: request.attempt_id,
        sourceAttemptId: request.source_attempt_id, interactionId: request.interaction_id,
      });
    expect(changed).toBe(false);
  });
});

test("the projection body keeps error:\"\" for a cancelled child and never reads as success", () => {
  const preview = rows[0].response.subagent_settlements[0].result.preview;
  expect(JSON.parse(preview)).toEqual(expect.objectContaining({ status: "cancelled", error: "", outputs: null }));
  expect(sha256_text(preview)).toBe(rows[0].response.subagent_settlements[0].result.content_sha256);
  expect(utf8_bytes(preview).length).toBe(rows[0].response.subagent_settlements[0].result.content_bytes);
});
