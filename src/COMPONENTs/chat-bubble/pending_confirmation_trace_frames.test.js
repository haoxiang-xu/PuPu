import { buildPendingConfirmationTraceFrames } from "./pending_confirmation_trace_frames";

describe("buildPendingConfirmationTraceFrames", () => {
  test("preserves toolkit identity on a synthetic confirmation frame", () => {
    const frames = buildPendingConfirmationTraceFrames({
      "confirm-computer": {
        confirmationId: "confirm-computer",
        callId: "call-computer",
        toolkitId: "builtin.computer",
        toolName: "computer",
        arguments: { action: "left_click" },
        requestedAt: 100,
      },
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].payload).toEqual(
      expect.objectContaining({
        toolkit_id: "builtin.computer",
        tool_name: "computer",
      }),
    );
  });
});
