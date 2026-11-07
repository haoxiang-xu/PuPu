import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";
import producer from "./__fixtures__/ticket_357_cancelled_subagent_producer.json";
import { recordCancelledSubagentSettlements } from "../../SERVICEs/runtime_events/cancelled_subagent_settlement";

/* Delegate cancellation settlement (#357). The cancel reply is the real host
   producer's (delegate, waiting); the owning delegate card is constructed from
   that capture's identities, as in cancelled_subagent_settlement.test.js. */

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = producer.rows[0];
const call = row.parent_wait.parent_tool_call;
const execution = row.response.execution_id;
const target = {
  sessionId: execution,
  attemptId: row.response.attempt_id,
  sourceAttemptId: row.response.source_attempt_id,
  interactionId: row.parent_wait.interaction_request.interaction_id,
};

const delegateCard = (callId = call.call_id, seq = 4) => [
  { seq, ts: seq, type: "tool_call", run_id: row.consumer_node_attempt, session_id: execution,
    stage: "runtime_event", event_id: `evt-${callId}-call`, links: { tool_call_id: callId },
    payload: { ...call, call_id: callId, arguments: { target: "Reviewer", task: "review" } } },
  { seq: seq + 1, ts: seq + 1, type: "tool_result", run_id: row.consumer_node_attempt, session_id: execution,
    stage: "runtime_event", event_id: `evt-${callId}-wait`, links: { tool_call_id: callId },
    payload: { ...call, call_id: callId, status: "success",
      result: { inline: true, content_bytes: 72,
        preview: "{\"schema\":\"unchain.skeleton_subagent_wait_marker.v1\",\"status\":\"waiting\"}" } } },
];

const owner = (frames) => ({
  id: "assistant-owner", role: "assistant", content: "", status: "cancelled",
  meta: { attemptId: row.response.attempt_id, executionSessionId: execution },
  traceFrames: frames,
});

const show = (message) => render(
  <ConfigContext.Provider value={{ theme: { color: "#222", font: { fontFamily: "sans-serif" } }, onThemeMode: "light_mode" }}>
    <TraceChain status="cancelled" messageId={message.id} frames={copy(message.traceFrames)} subagentFrames={{}} subagentMetaByRunId={{}} />
  </ConfigContext.Provider>,
);

test("without the producer's settlement the delegate card stays waiting after the root is cancelled", () => {
  show(owner(delegateCard()));
  expect(screen.getByText("waiting", { exact: true })).toBeVisible();
  expect(screen.queryByText("cancelled", { exact: true })).not.toBeInTheDocument();
});

test("the recorded settlement shows that delegate as cancelled", () => {
  const { messages } = recordCancelledSubagentSettlements([owner(delegateCard())], row.response, target);
  show(messages[0]);
  expect(screen.getByText("cancelled", { exact: true })).toBeVisible();
  expect(screen.queryByText("waiting", { exact: true })).not.toBeInTheDocument();
});

test("a second delegate card in the same message keeps waiting", () => {
  const frames = [...delegateCard(), ...delegateCard("other-delegate", 20)];
  const { messages } = recordCancelledSubagentSettlements([owner(frames)], row.response, target);
  show(messages[0]);
  expect(screen.getAllByText("cancelled", { exact: true })).toHaveLength(1);
  expect(screen.getAllByText("waiting", { exact: true })).toHaveLength(1);
});
