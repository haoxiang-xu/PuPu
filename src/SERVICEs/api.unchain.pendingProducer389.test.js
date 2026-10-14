import { api } from "./api";
import { normalizePendingInteraction } from "../PAGEs/chat/hooks/durable_interaction_recovery";
import pendingResponses from "./__fixtures__/pending_live_tool_approval_389.json";

// Captured, without field normalization, from the production Python host and
// installed verified runtime by test_stop_live_tool_writer.py with
// PUPU_PENDING_REPRO_OUTPUT. The first approval was accepted and executed before
// the second response was captured. Both payloads must survive the IPC boundary.
describe("live tool approval producer / renderer contract", () => {
  let originalBridge;
  beforeEach(() => {
    originalBridge = window.unchainAPI;
    window.unchainAPI = { getPendingInteraction: jest.fn() };
  });
  afterEach(() => {
    window.unchainAPI = originalBridge;
  });

  test.each(pendingResponses.map((response, index) => [index + 1, response]))(
    "accepts real live approval %i without losing canonical provenance",
    async (_ordinal, response) => {
      window.unchainAPI.getPendingInteraction.mockResolvedValue(response);
      await expect(api.unchain.getPendingInteraction({
        session_id: response.session_id,
      })).resolves.toEqual(response);
      expect(normalizePendingInteraction(response, response.session_id)).toMatchObject({
        interactionId: response.interaction_id,
        graphCoordinatorAttemptId: response.graph_coordinator_attempt_id,
        traceFrame: response.presentation.trace_frame,
      });
    },
  );

  test.each([
    ["foreign session", (tool) => { tool.call_ref.execution_id = "foreign-session"; }],
    ["foreign attempt", (tool) => { tool.call_ref.original_attempt_id = "foreign-attempt"; }],
    ["foreign call", (tool) => { tool.call_ref.call_id = "foreign-call"; }],
    ["foreign tool", (tool) => { tool.call_ref.tool_name = "foreign-tool"; }],
    ["foreign cursor", (tool) => { tool.call_ref_metadata.intent_cursor.store_seq += 1; }],
    ["unknown reference field", (tool) => { tool.call_ref.extra = true; }],
    ["unknown metadata field", (tool) => { tool.call_ref_metadata.extra = true; }],
    ["unknown presentation field", (tool) => { tool.extra = true; }],
    ["missing reference", (tool) => { delete tool.call_ref; }],
    ["missing metadata", (tool) => { delete tool.call_ref_metadata; }],
    ["false argument declaration", (tool) => { tool.call_ref_metadata.original_arguments_declared = false; }],
    ["argument text drift", (tool) => { tool.arguments = " { } "; }],
    ["invalid argument JSON", (tool) => {
      tool.arguments = "invalid json"; tool.call_ref_metadata.original_arguments = tool.arguments;
    }],
    ["non-object arguments", (tool) => {
      tool.arguments = "[]"; tool.call_ref_metadata.original_arguments = tool.arguments;
    }],
    ["invalid policy", (tool) => { tool.timeline_merge_policy = "future-policy"; }],
    ["policy conflict", (tool) => { tool.timeline_merge_policy = "never"; }],
    ["iteration mismatch", (tool) => { tool.call_ref.iteration += 1; }],
  ])("rejects %s in both durable consumers", async (_label, mutateTool) => {
    const response = JSON.parse(JSON.stringify(pendingResponses[1]));
    mutateTool(response.presentation.tool_call);
    response.presentation.trace_frame.payload = JSON.parse(JSON.stringify(response.presentation.tool_call));
    window.unchainAPI.getPendingInteraction.mockResolvedValue(response);
    await expect(api.unchain.getPendingInteraction({ session_id: response.session_id }))
      .rejects.toMatchObject({ code: "invalid_pending_interaction_response" });
    expect(normalizePendingInteraction(response, response.session_id)).toBeNull();
  });

  test("rejects an unknown trace field instead of allowing arbitrary extensions", async () => {
    const response = JSON.parse(JSON.stringify(pendingResponses[1]));
    response.presentation.trace_frame.extra = true;
    window.unchainAPI.getPendingInteraction.mockResolvedValue(response);
    await expect(api.unchain.getPendingInteraction({ session_id: response.session_id }))
      .rejects.toMatchObject({ code: "invalid_pending_interaction_response" });
    expect(normalizePendingInteraction(response, response.session_id)).toBeNull();
  });
});
