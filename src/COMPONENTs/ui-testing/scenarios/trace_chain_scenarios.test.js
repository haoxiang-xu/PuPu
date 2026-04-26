import TRACE_CHAIN_SCENARIOS from "./trace_chain_scenarios";

describe("TraceChain UI testing scenarios", () => {
  test("includes a Runtime Events v3 scenario adapted to legacy frames", () => {
    const scenario = TRACE_CHAIN_SCENARIOS.find(
      (item) => item.name === "Runtime Events v3",
    );

    expect(scenario).toBeTruthy();
    expect(scenario.frames.map((frame) => frame.type)).toEqual([
      "stream_started",
      "run_started",
      "reasoning",
      "tool_call",
      "tool_result",
      "final_message",
      "done",
    ]);
  });
});
